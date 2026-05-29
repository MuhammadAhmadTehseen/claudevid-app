'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const jobQueue = require('../queue/jobQueue');
const compositionService = require('../services/compositionService');
const renderService = require('../services/renderService');
const logger = require('../utils/logger');

/**
 * POST /render
 * Queue a new video render job.
 *
 * Body: { driveUrl: string, prompt?: string }
 * Response: { jobId, status: 'queued' }
 */
router.post('/render', async (req, res) => {
  const { driveUrl, prompt } = req.body;

  if (!driveUrl) {
    return res.status(400).json({ error: 'driveUrl is required' });
  }

  // Basic URL validation
  if (!driveUrl.includes('drive.google.com') && !driveUrl.match(/^[a-zA-Z0-9_-]{25,}$/)) {
    return res.status(400).json({ error: 'driveUrl must be a valid Google Drive URL or file ID' });
  }

  const jobId = uuidv4();

  const job = jobQueue.createJob({
    id: jobId,
    driveUrl,
    prompt: prompt || '',
    type: 'render'
  });

  logger.info(`New render job queued: ${jobId} | URL: ${driveUrl}`);

  // Process asynchronously — do not await
  jobQueue.processJob(jobId).catch((err) => {
    logger.error(`processJob ${jobId} uncaught: ${err.message}`);
  });

  return res.status(202).json({
    jobId,
    status: 'queued'
  });
});

/**
 * POST /edit/:jobId
 * Create a new job based on an existing job, applying an edit prompt.
 *
 * Body: { prompt: string }
 * Response: { jobId, parentJobId, status: 'queued' }
 */
router.post('/edit/:jobId', async (req, res) => {
  const { jobId: parentJobId } = req.params;
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required for edit' });
  }

  const parentJob = jobQueue.getJob(parentJobId);
  if (!parentJob) {
    return res.status(404).json({ error: `Job ${parentJobId} not found` });
  }

  if (parentJob.status !== 'done') {
    return res.status(409).json({
      error: `Parent job is not done yet (status: ${parentJob.status}). Wait until it completes before editing.`
    });
  }

  // Check that the parent job's motion board and source video exist
  const parentMotionBoardPath = path.join(parentJob.jobDir, 'motion-board.json');
  const parentVideoPath = path.join(parentJob.jobDir, 'video.mp4');

  if (!fs.existsSync(parentMotionBoardPath)) {
    return res.status(409).json({ error: 'Parent job has no motion board — cannot edit' });
  }

  const newJobId = uuidv4();

  const newJob = jobQueue.createJob({
    id: newJobId,
    driveUrl: parentJob.driveUrl,
    prompt,
    type: 'edit',
    parentJobId
  });

  logger.info(`New edit job queued: ${newJobId} | parent: ${parentJobId} | prompt: ${prompt}`);

  // Process the edit job asynchronously
  processEditJob(newJobId, parentJob, prompt).catch((err) => {
    logger.error(`processEditJob ${newJobId} uncaught: ${err.message}`);
    jobQueue.updateJob(newJobId, {
      status: 'error',
      error: err.message,
      step: `Error: ${err.message}`
    });
  });

  return res.status(202).json({
    jobId: newJobId,
    parentJobId,
    status: 'queued'
  });
});

/**
 * Process an edit job:
 * 1. Load existing motion board
 * 2. Apply edit prompt via Claude
 * 3. Re-render
 * 4. Upload / serve
 */
async function processEditJob(jobId, parentJob, editPrompt) {
  const job = jobQueue.getJob(jobId);
  const parentMotionBoardPath = path.join(parentJob.jobDir, 'motion-board.json');
  const parentVideoPath = path.join(parentJob.jobDir, 'video.mp4');

  // ─── Load parent motion board ──────────────────────────────────────
  const existingMotionBoard = JSON.parse(fs.readFileSync(parentMotionBoardPath, 'utf8'));

  // ─── Get video metadata ────────────────────────────────────────────
  jobQueue.updateJob(jobId, {
    status: 'generating',
    progress: 20,
    step: 'Loading parent job data'
  });

  const videoMetadata = await renderService.getVideoMetadata(parentVideoPath);

  // ─── Edit composition ──────────────────────────────────────────────
  jobQueue.updateJob(jobId, {
    status: 'generating',
    progress: 40,
    step: 'Applying edit with Claude'
  });

  const { updatedMotionBoard, html } = await compositionService.editComposition(
    existingMotionBoard,
    editPrompt,
    videoMetadata
  );

  // Save updated motion board
  fs.writeFileSync(
    path.join(job.jobDir, 'motion-board.json'),
    JSON.stringify(updatedMotionBoard, null, 2),
    'utf8'
  );

  // ─── Render ────────────────────────────────────────────────────────
  jobQueue.updateJob(jobId, {
    status: 'rendering',
    progress: 70,
    step: 'Rendering updated composition'
  });

  const outputPath = await renderService.render(job.jobDir, html, parentVideoPath);

  // ─── Upload ────────────────────────────────────────────────────────
  jobQueue.updateJob(jobId, {
    status: 'uploading',
    progress: 90,
    step: 'Uploading result to Google Drive'
  });

  const { uploadToDrive } = require('../services/driveService');
  const outputFileName = `claudevid_${jobId.slice(0, 8)}_edit.mp4`;
  let videoUrl = null;

  try {
    videoUrl = await uploadToDrive(outputPath, outputFileName);
  } catch (uploadErr) {
    logger.warn(`Drive upload failed for edit job ${jobId}: ${uploadErr.message}`);
  }

  const serverPort = process.env.PORT || 3001;
  const downloadUrl = `http://localhost:${serverPort}/jobs/${jobId}/output.mp4`;

  jobQueue.updateJob(jobId, {
    status: 'done',
    progress: 100,
    step: 'Complete',
    videoUrl: videoUrl || downloadUrl,
    downloadUrl
  });

  logger.job(jobId, `Edit job complete. URL: ${videoUrl || downloadUrl}`);
}

/**
 * POST /retry/:jobId
 * Resume a failed job from the last successful stage.
 *
 * Checks which output files already exist in jobs/{jobId}/ and skips
 * those stages, resuming from the first stage whose output is missing.
 *
 * Response: { jobId, resumeFrom, status: 'queued' }
 */
router.post('/retry/:jobId', async (req, res) => {
  const { jobId } = req.params;

  const job = jobQueue.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: `Job ${jobId} not found` });
  }

  if (job.status !== 'error') {
    return res.status(400).json({ error: `Job is not in error state (current status: ${job.status})` });
  }

  // Determine which stage to resume from based on existing output files
  const resumeFrom = jobQueue.getResumeStage(job.jobDir);

  // Reset job to queued state
  jobQueue.updateJob(jobId, {
    status: 'queued',
    error: null,
    progress: 0,
    step: `Resuming from stage: ${resumeFrom}`
  });

  logger.info(`Retry requested for job ${jobId} — resuming from stage: ${resumeFrom}`);

  // Kick off the resume pipeline asynchronously
  jobQueue.resumeJob(jobId, resumeFrom).catch((err) => {
    logger.error(`resumeJob ${jobId} uncaught: ${err.message}`);
  });

  return res.status(202).json({
    jobId,
    resumeFrom,
    status: 'queued'
  });
});

module.exports = router;
