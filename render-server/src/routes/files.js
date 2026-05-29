'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const jobQueue = require('../queue/jobQueue');

/**
 * GET /jobs/:jobId/output.mp4
 * Serves the rendered video file for download.
 */
router.get('/jobs/:jobId/output.mp4', (req, res) => {
  const { jobId } = req.params;
  const job = jobQueue.getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: `Job ${jobId} not found` });
  }

  if (job.status !== 'done') {
    return res.status(409).json({
      error: `Job is not complete yet (status: ${job.status})`,
      progress: job.progress
    });
  }

  const outputPath = path.join(job.jobDir, 'output.mp4');

  if (!fs.existsSync(outputPath)) {
    return res.status(404).json({ error: `Output file not found for job ${jobId}` });
  }

  const stat = fs.statSync(outputPath);

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="claudevid_${jobId.slice(0, 8)}_output.mp4"`);
  res.setHeader('Accept-Ranges', 'bytes');

  // Support range requests for video streaming
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', chunkSize);

    const fileStream = fs.createReadStream(outputPath, { start, end });
    fileStream.pipe(res);
  } else {
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
  }
});

/**
 * GET /jobs/:jobId/composition.html
 * Serves the generated composition HTML (useful for debugging).
 */
router.get('/jobs/:jobId/composition.html', (req, res) => {
  const { jobId } = req.params;
  const job = jobQueue.getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: `Job ${jobId} not found` });
  }

  const compositionPath = path.join(job.jobDir, 'composition.html');

  if (!fs.existsSync(compositionPath)) {
    return res.status(404).json({ error: `Composition not found for job ${jobId}` });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  fs.createReadStream(compositionPath).pipe(res);
});

/**
 * GET /jobs/:jobId/motion-board.json
 * Serves the motion board JSON (useful for debugging and editing).
 */
router.get('/jobs/:jobId/motion-board.json', (req, res) => {
  const { jobId } = req.params;
  const job = jobQueue.getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: `Job ${jobId} not found` });
  }

  const mbPath = path.join(job.jobDir, 'motion-board.json');

  if (!fs.existsSync(mbPath)) {
    return res.status(404).json({ error: `Motion board not found for job ${jobId}` });
  }

  res.setHeader('Content-Type', 'application/json');
  fs.createReadStream(mbPath).pipe(res);
});

module.exports = router;
