'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const logger = require('./utils/logger');
const jobQueue = require('./queue/jobQueue');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Ensure jobs directory exists ─────────────────────────────────────────────
const jobsDir = path.resolve(process.env.JOBS_DIR || path.join(__dirname, '..', 'jobs'));
if (!fs.existsSync(jobsDir)) {
  fs.mkdirSync(jobsDir, { recursive: true });
  logger.info(`Created jobs directory: ${jobsDir}`);
}

// ── Static file serving for job outputs ──────────────────────────────────────
// Note: individual file routes in routes/files.js handle /jobs/:id/output.mp4
// with range request support. The static middleware is a fallback for other assets.
app.use('/jobs', express.static(jobsDir));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/', require('./routes/render'));
app.use('/', require('./routes/status'));
app.use('/', require('./routes/files'));
app.use('/', require('./routes/upload'));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`Unhandled error on ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
jobQueue.loadJobsFromDisk();

app.listen(PORT, () => {
  logger.info(`ClaudeVid render server running on port ${PORT}`);
  logger.info(`Jobs directory: ${jobsDir}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
