'use strict';

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info(msg, ...args) {
    console.log(`[${timestamp()}] [INFO]  ${msg}`, ...args);
  },
  warn(msg, ...args) {
    console.warn(`[${timestamp()}] [WARN]  ${msg}`, ...args);
  },
  error(msg, ...args) {
    console.error(`[${timestamp()}] [ERROR] ${msg}`, ...args);
  },
  debug(msg, ...args) {
    if (process.env.DEBUG) {
      console.log(`[${timestamp()}] [DEBUG] ${msg}`, ...args);
    }
  },
  job(jobId, msg, ...args) {
    console.log(`[${timestamp()}] [JOB:${jobId.slice(0, 8)}] ${msg}`, ...args);
  }
};

module.exports = logger;
