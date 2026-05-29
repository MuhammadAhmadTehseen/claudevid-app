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
  logger.info(`Downloading Drive file ${fileId} → ${destPath}`);

  // Google changed download URLs in 2024. Try modern endpoint first, then fallbacks.
  const candidates = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
    `https://drive.google.com/uc?id=${fileId}&export=download`,
  ];

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  for (const url of candidates) {
    try {
      logger.info(`Trying: ${url}`);
      const response = await axios.get(url, {
        responseType: 'stream',
        maxRedirects: 10,
        headers: { 'User-Agent': userAgent },
        validateStatus: (s) => s < 400,
      });

      const contentType = response.headers['content-type'] || '';

      // Got a binary/video stream — write it directly
      if (!contentType.includes('text/html')) {
        await streamToFile(response.data, destPath);
        break;
      }

      // Got HTML — parse it for a confirm token and retry once
      logger.info(`Got HTML response — attempting confirm token extraction`);
      let html = '';
      for await (const chunk of response.data) {
        html += chunk.toString();
        if (html.length > 100000) break;
      }

      // Match both legacy ?confirm=XXX and modern UUID formats
      const tokenPatterns = [
        /[?&]confirm=([^&"'\s<>]+)/,
        /"confirm"\s*:\s*"([^"]+)"/,
        /confirm=([A-Za-z0-9_\-]{4,})/,
      ];

      let confirmToken = null;
      for (const pattern of tokenPatterns) {
        const m = html.match(pattern);
        if (m && m[1] !== 't') { confirmToken = m[1]; break; }
      }

      if (confirmToken) {
        logger.info(`Retrying with confirm token: ${confirmToken}`);
        const retryUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=${confirmToken}`;
        const retryRes = await axios.get(retryUrl, {
          responseType: 'stream',
          maxRedirects: 10,
          headers: { 'User-Agent': userAgent },
        });
        await streamToFile(retryRes.data, destPath);
        break;
      }

      logger.warn(`Could not extract confirm token from HTML — trying next URL`);

    } catch (err) {
      logger.warn(`Attempt failed (${url}): ${err.message}`);
    }
  }

  // Validate the download
  if (!fs.existsSync(destPath)) {
    throw new Error(
      `Failed to download Drive file ${fileId}. ` +
      `Ensure the file is shared as "Anyone with the link can view" (not just editor).`
    );
  }

  const stat = fs.statSync(destPath);
  if (stat.size < 10000) {
    fs.unlinkSync(destPath);
    throw new Error(
      `Downloaded file is only ${stat.size} bytes — likely an HTML error page. ` +
      `Check that the file sharing is set to "Anyone with the link".`
    );
  }

  logger.info(`Downloaded ${(stat.size / 1024 / 1024).toFixed(2)} MB → ${destPath}`);
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
