'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');
const extractFileId = require('../utils/extractFileId');
const logger = require('../utils/logger');

/**
 * Download a file from Google Drive to a local destination path.
 * Handles the large-file confirm token redirect automatically.
 *
 * @param {string} fileId  - Google Drive file ID
 * @param {string} destPath - Local filesystem path to save the file
 */
async function downloadFromDrive(fileId, destPath) {
  const baseUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;

  logger.info(`Downloading Drive file ${fileId} → ${destPath}`);

  // First request — may redirect to confirmation page for large files
  const response = await axios.get(baseUrl, {
    responseType: 'stream',
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ClaudeVid/1.0)'
    },
    validateStatus: (status) => status < 400
  });

  // Check if we got HTML instead of a binary file (Google's virus-scan warning page)
  const contentType = response.headers['content-type'] || '';
  if (contentType.includes('text/html')) {
    // Extract the confirm token from the response HTML and retry
    let html = '';
    for await (const chunk of response.data) {
      html += chunk.toString();
      if (html.length > 50000) break; // don't consume the whole stream
    }

    const confirmMatch = html.match(/confirm=([0-9A-Za-z_\-]+)/);
    if (!confirmMatch) {
      throw new Error(`Drive returned HTML for file ${fileId}. File may be private or require auth.`);
    }

    const confirmToken = confirmMatch[1];
    const confirmUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirmToken}`;

    logger.info(`Large file — retrying with confirm token`);

    const confirmResponse = await axios.get(confirmUrl, {
      responseType: 'stream',
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClaudeVid/1.0)'
      }
    });

    await streamToFile(confirmResponse.data, destPath);
  } else {
    await streamToFile(response.data, destPath);
  }

  const stat = fs.statSync(destPath);
  logger.info(`Downloaded ${(stat.size / 1024 / 1024).toFixed(2)} MB to ${destPath}`);
  return destPath;
}

function streamToFile(stream, destPath) {
  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    stream.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
    stream.on('error', reject);
  });
}

/**
 * Upload a local file to Google Drive using a service account.
 * Makes the file publicly readable and returns a shareable link.
 *
 * @param {string} filePath  - Local path to the file
 * @param {string} fileName  - Name to give the file in Drive
 * @param {string} [folderId] - Drive folder ID (defaults to env var)
 * @returns {string|null} Shareable Drive link, or null if service account not configured
 */
async function uploadToDrive(filePath, fileName, folderId) {
  const serviceAccountConfig = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const uploadFolderId = folderId || process.env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID;

  if (!serviceAccountConfig) {
    logger.warn('GOOGLE_SERVICE_ACCOUNT_JSON not set — skipping Drive upload');
    return null;
  }

  let credentials;
  try {
    // Support both JSON string and file path
    if (serviceAccountConfig.startsWith('{')) {
      credentials = JSON.parse(serviceAccountConfig);
    } else {
      const absPath = path.resolve(serviceAccountConfig);
      credentials = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    }
  } catch (err) {
    logger.error(`Failed to load service account credentials: ${err.message}`);
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });

  const drive = google.drive({ version: 'v3', auth });

  logger.info(`Uploading ${fileName} to Drive folder ${uploadFolderId || '(root)'}`);

  const fileMetadata = {
    name: fileName,
    ...(uploadFolderId ? { parents: [uploadFolderId] } : {})
  };

  const media = {
    mimeType: 'video/mp4',
    body: fs.createReadStream(filePath)
  };

  const uploadResponse = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: 'id, webViewLink, webContentLink'
  });

  const fileId = uploadResponse.data.id;

  // Make file publicly readable
  await drive.permissions.create({
    fileId,
    resource: {
      role: 'reader',
      type: 'anyone'
    }
  });

  const shareLink = `https://drive.google.com/file/d/${fileId}/view`;
  logger.info(`Uploaded to Drive: ${shareLink}`);
  return shareLink;
}

module.exports = { downloadFromDrive, uploadToDrive, extractFileId };
