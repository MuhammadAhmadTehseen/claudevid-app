'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const driveService = require('../services/driveService');
const transcribeService = require('../services/transcribeService');
const motionBoardService = require('../services/motionBoardService');
const compositionService = require('../services/compositionService');
const renderService = require('../services/renderService');
const extractFileId = require('../utils/extractFileId');

// In-memory store: jobId → job object
const jobs = new Map();

function getJobsDir() {
  return path.resolve(process.env.JOBS_DIR || path.join(__dirname, '..', '..', 'jobs'));
}

/**
 * Create a new job, set up its directory, persist to disk.
 */
function createJob(data = {}) {
  const id = data.id || uuidv4();
  const jobDir = path.join(getJobsDir(), id);

  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }

  const job = {
    jobId: id,
    status: 'queued',
    progress: 0,
    step: 'Job queued',
    videoUrl: null,
    downloadUrl: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...data,
    jobDir
  };

  jobs.set(id, job);
  persistJob(id);

  return job;
}

/**
 * Update job fields in memory and persist to disk.
 */
function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) {
    logger.warn(`updateJob: job ${id} not found`);
    return null;
  }

  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  persistJob(id);
  return job;
}

/**
 * Get job from memory.
 */
function getJob(id) {
  return jobs.get(id) || null;
}

/**
 * Write job.json to disk.
 */
function persistJob(id) {
  const job = jobs.get(id);
  if (!job) return;

  const jobFile = path.join(job.jobDir, 'job.json');
  try {
    fs.writeFileSync(jobFile, JSON.stringify(job, null, 2), 'utf8');
  } catch (err) {
    logger.error(`Failed to persist job ${id}: ${err.message}`);
  }
}

/**
 * Load all existing jobs from disk into memory on server start.
 */
function loadJobsFromDisk() {
  const jobsDir = getJobsDir();
  if (!fs.existsSync(jobsDir)) return;

  const entries = fs.readdirSync(jobsDir, { withFileTypes: true });
  let loaded = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const jobFile = path.join(jobsDir, entry.name, 'job.json');
    if (!fs.existsSync(jobFile)) continue;

    try {
      const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
      jobs.set(job.jobId, job);
      loaded++;

      // Mark in-progress jobs as errored (server was restarted mid-job)
      if (['downloading', 'transcribing', 'generating', 'rendering', 'uploading'].includes(job.status)) {
        jobs.get(job.jobId).status = 'error';
        jobs.get(job.jobId).error = 'Server restarted during processing';
        persistJob(job.jobId);
      }
    } catch (err) {
      logger.warn(`Failed to load job from ${jobFile}: ${err.message}`);
    }
  }

  if (loaded > 0) {
    logger.info(`Loaded ${loaded} jobs from disk`);
  }
}

/**
 * Get count of currently active (in-progress) jobs.
 */
function getActiveJobCount() {
  let count = 0;
  for (const job of jobs.values()) {
    if (['downloading', 'transcribing', 'generating', 'rendering', 'uploading'].includes(job.status)) {
      count++;
    }
  }
  return count;
}

/**
 * Main job processing pipeline.
 * Runs asynchronously — does not block the HTTP response.
 *
 * @param {string} jobId
 */
async function processJob(jobId) {
  const job = getJob(jobId);
  if (!job) {
    logger.error(`processJob: job ${jobId} not found`);
    return;
  }

  logger.job(jobId, `Starting pipeline for job`);

  try {
    // ─── Step 1: Download video ──────────────────────────────────────
    updateJob(jobId, {
      status: 'downloading',
      progress: 10,
      step: 'Downloading video from Google Drive'
    });

    const fileId = extractFileId(job.driveUrl);
    if (!fileId) {
      throw new Error(`Could not extract file ID from URL: ${job.driveUrl}`);
    }

    const videoPath = path.join(job.jobDir, 'video.mp4');
    await driveService.downloadFromDrive(fileId, videoPath);
    logger.job(jobId, `Video downloaded → ${videoPath}`);

    // ─── Step 2: Get video metadata ──────────────────────────────────
    const videoMetadata = await renderService.getVideoMetadata(videoPath);
    logger.job(jobId, `Video metadata: ${JSON.stringify(videoMetadata)}`);

    // ─── Step 3: Transcribe ──────────────────────────────────────────
    updateJob(jobId, {
      status: 'transcribing',
      progress: 25,
      step: 'Transcribing video with AssemblyAI'
    });

    const transcript = await transcribeService.transcribe(videoPath);
    fs.writeFileSync(
      path.join(job.jobDir, 'transcript.json'),
      JSON.stringify(transcript, null, 2),
      'utf8'
    );
    logger.job(jobId, `Transcript saved: ${transcript.text.length} chars`);

    // ─── Step 4: Generate motion board ──────────────────────────────
    updateJob(jobId, {
      status: 'generating',
      progress: 40,
      step: 'Generating motion board with Claude'
    });

    const motionBoard = await motionBoardService.generateMotionBoard(transcript, job.prompt || '');
    fs.writeFileSync(
      path.join(job.jobDir, 'motion-board.json'),
      JSON.stringify(motionBoard, null, 2),
      'utf8'
    );
    logger.job(jobId, `Motion board saved: ${motionBoard.length} entries`);

    // ─── Step 5: Generate HyperFrames composition ────────────────────
    updateJob(jobId, {
      status: 'generating',
      progress: 55,
      step: 'Generating HyperFrames HTML composition with Claude'
    });

    const compositionHtml = await compositionService.generateComposition(motionBoard, videoMetadata);
    fs.writeFileSync(
      path.join(job.jobDir, 'composition.html'),
      compositionHtml,
      'utf8'
    );
    logger.job(jobId, `Composition HTML saved: ${compositionHtml.length} chars`);

    // ─── Step 6: Render ──────────────────────────────────────────────
    updateJob(jobId, {
      status: 'rendering',
      progress: 70,
      step: 'Rendering composition with HyperFrames + FFmpeg'
    });

    const outputPath = await renderService.render(job.jobDir, compositionHtml, videoPath);
    logger.job(jobId, `Render complete: ${outputPath}`);

    // ─── Step 7: Upload to Drive ─────────────────────────────────────
    updateJob(jobId, {
      status: 'uploading',
      progress: 90,
      step: 'Uploading result to Google Drive'
    });

    const outputFileName = `claudevid_${jobId.slice(0, 8)}_output.mp4`;
    let videoUrl = null;
    let downloadUrl = null;

    try {
      videoUrl = await driveService.uploadToDrive(outputPath, outputFileName);
    } catch (uploadErr) {
      logger.warn(`Drive upload failed: ${uploadErr.message} — falling back to local URL`);
    }

    // Always set local download URL as fallback
    const serverPort = process.env.PORT || 3001;
    downloadUrl = `http://localhost:${serverPort}/jobs/${jobId}/output.mp4`;

    if (!videoUrl) {
      logger.job(jobId, `Drive upload failed or not configured — using local URL: ${downloadUrl}`);
    }

    // ─── Done ────────────────────────────────────────────────────────
    updateJob(jobId, {
      status: 'done',
      progress: 100,
      step: 'Complete',
      videoUrl: videoUrl || downloadUrl,
      downloadUrl
    });

    logger.job(jobId, `Job complete. URL: ${videoUrl || downloadUrl}`);

  } catch (err) {
    logger.error(`Job ${jobId} failed: ${err.message}`);
    logger.error(err.stack);

    updateJob(jobId, {
      status: 'error',
      error: err.message,
      step: `Error: ${err.message}`
    });
  }
}

module.exports = {
  createJob,
  updateJob,
  getJob,
  processJob,
  loadJobsFromDisk,
  getActiveJobCount
};
