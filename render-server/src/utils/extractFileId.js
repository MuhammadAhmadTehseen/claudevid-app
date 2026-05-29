'use strict';

/**
 * Extract Google Drive file ID from various URL formats:
 * - https://drive.google.com/file/d/FILE_ID/view
 * - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * - https://drive.google.com/open?id=FILE_ID
 * - https://drive.google.com/uc?export=download&id=FILE_ID
 * - https://docs.google.com/file/d/FILE_ID/edit
 */
function extractFileId(url) {
  if (!url) return null;

  // Pattern: /file/d/FILE_ID/ or /file/d/FILE_ID (end of string or query)
  const filePathMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (filePathMatch) return filePathMatch[1];

  // Pattern: ?id=FILE_ID or &id=FILE_ID
  const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];

  // Pattern: bare file ID (no slashes, just alphanumeric + _ -)
  const bareMatch = url.match(/^([a-zA-Z0-9_-]{25,})$/);
  if (bareMatch) return bareMatch[1];

  return null;
}

module.exports = extractFileId;
