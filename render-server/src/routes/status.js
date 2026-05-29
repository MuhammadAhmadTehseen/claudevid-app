'use strict';

const express = require('express');
const router = express.Router();

const jobQueue = require('../queue/jobQueue');

/**
 * GET /status/:jobId
 * Returns current status of a job.
 */
router.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobQueue.getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: `Job ${jobId} not found` });
  }

  return res.json({
    jobId: job.jobId,
    status: job.status,
    progress: job.progress || 0,
    step: job.step || '',
    videoUrl: job.videoUrl || null,
    downloadUrl: job.downloadUrl || null,
    error: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.parentJobId ? { parentJobId: job.parentJobId } : {})
  });
});

/**
 * GET /health
 * Health check endpoint.
 */
router.get('/health', (req, res) => {
  return res.json({
    status: 'ok',
    version: '1.0.0',
    activeJobs: jobQueue.getActiveJobCount(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
