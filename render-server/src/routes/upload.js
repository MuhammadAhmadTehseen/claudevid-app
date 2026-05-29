'use strict';

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const jobQueue = require('../queue/jobQueue');
const transcribeService = require('../services/transcribeService');
const motionBoardService = require('../services/motionBoardService');
const compositionService = require('../services/compositionService');
const renderService = require('../services/renderService');
const driveService = require('../services/driveService');
const logger = require('../utils/logger');

function getJobsDir() {
  return path.resolve(process.env.JOBS_DIR || path.join(__dirname, '..', '..', 'jobs'));
}

// Multer storage: save directly into jobs/{jobId}/video.mp4
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobId = uuidv4();
    req.jobId = jobId;
    const jobDir = path.join(getJobsDir(), jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    req.jobDir = jobDir;
    cb(null, jobDir);
  },
  filename: (req, file, cb) => cb(null, 'video.mp4')
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'video/mp4',
      'video/mov',
      'video/avi',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported video type: ${file.mimetype}`));
    }
  }
});

/**
 * POST /upload
 * Accept a direct video file upload and start the pipeline from transcribing.
 *
 * Multipart fields:
 *   video  — video file (required)
 *   prompt — creative direction (optional text)
 *
 * Response: { jobId, status: 'transcribing' }
 */
router.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const jobId = req.jobId;
  const jobDir = req.jobDir;
  const prompt = req.body.prompt || '';
  const videoPath = path.join(jobDir, 'video.mp4');

  logger.info(`Upload job received: ${jobId} | file: ${req.file.originalname} | size: ${req.file.size}`);

  // Register the job in memory — skip driveUrl since we have the file already
  jobQueue.createJob({
    id: jobId,
    driveUrl: null,
    prompt,
    type: 'upload',
    jobDir
  });

  // Start pipeline from transcribing stage (no download needed)
  processUploadJob(jobId, videoPath, prompt).catch((err) => {
    logger.error(`processUploadJob ${jobId} uncaught: ${err.message}`);
    jobQueue.updateJob(jobId, {
      status: 'error',
      error: err.message,
      step: `Error: ${err.message}`
    });
  });

  return res.status(202).json({ jobId, status: 'transcribing' });
});

/**
 * Pipeline for uploaded videos — starts at transcribing, skips download.
 */
async function processUploadJob(jobId, videoPath, prompt) {
  logger.job(jobId, 'Starting upload pipeline (skipping download)');

  try {
    // ─── Step 1: Get video metadata ──────────────────────────────────────
    const videoMetadata = await renderService.getVideoMetadata(videoPath);
    logger.job(jobId, `Video metadata: ${JSON.stringify(videoMetadata)}`);

    // ─── Step 2: Transcribe ──────────────────────────────────────────────
    jobQueue.updateJob(jobId, {
      status: 'transcribing',
      progress: 25,
      step: 'Transcribing video with AssemblyAI'
    });

    const transcript = await transcribeService.transcribe(videoPath);
    const job = jobQueue.getJob(jobId);
    fs.writeFileSync(
      path.join(job.jobDir, 'transcript.json'),
      JSON.stringify(transcript, null, 2),
      'utf8'
    );
    logger.job(jobId, `Transcript saved: ${transcript.text.length} chars`);

    // ─── Step 3: Generate motion board ──────────────────────────────────
    jobQueue.updateJob(jobId, {
      status: 'generating',
      progress: 40,
      step: 'Generating motion board with Claude'
    });

    const motionBoard = await motionBoardService.generateMotionBoard(transcript, prompt);
    fs.writeFileSync(
      path.join(job.jobDir, 'motion-board.json'),
      JSON.stringify(motionBoard, null, 2),
      'utf8'
    );
    logger.job(jobId, `Motion board saved: ${motionBoard.length} entries`);

    // ─── Step 4: Generate HyperFrames composition ────────────────────────
    jobQueue.updateJob(jobId, {
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

    // ─── Step 5: Render ──────────────────────────────────────────────────
    jobQueue.updateJob(jobId, {
      status: 'rendering',
      progress: 70,
      step: 'Rendering composition with HyperFrames + FFmpeg'
    });

    const outputPath = await renderService.render(job.jobDir, compositionHtml, videoPath);
    logger.job(jobId, `Render complete: ${outputPath}`);

    // ─── Step 6: Upload to Drive ─────────────────────────────────────────
    jobQueue.updateJob(jobId, {
      status: 'uploading',
      progress: 90,
      step: 'Uploading result to Google Drive'
    });

    const outputFileName = `claudevid_${jobId.slice(0, 8)}_output.mp4`;
    let videoUrl = null;

    try {
      videoUrl = await driveService.uploadToDrive(outputPath, outputFileName);
    } catch (uploadErr) {
      logger.warn(`Drive upload failed: ${uploadErr.message} — falling back to local URL`);
    }

    const serverPort = process.env.PORT || 3001;
    const downloadUrl = `http://localhost:${serverPort}/jobs/${jobId}/output.mp4`;

    // ─── Done ────────────────────────────────────────────────────────────
    jobQueue.updateJob(jobId, {
      status: 'done',
      progress: 100,
      step: 'Complete',
      videoUrl: videoUrl || downloadUrl,
      downloadUrl
    });

    logger.job(jobId, `Upload job complete. URL: ${videoUrl || downloadUrl}`);

  } catch (err) {
    logger.error(`Upload job ${jobId} failed: ${err.message}`);
    logger.error(err.stack);

    jobQueue.updateJob(jobId, {
      status: 'error',
      error: err.message,
      step: `Error: ${err.message}`
    });
  }
}

module.exports = router;
