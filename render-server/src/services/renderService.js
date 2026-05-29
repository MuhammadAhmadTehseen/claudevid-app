'use strict';

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execAsync = util.promisify(exec);
const logger = require('../utils/logger');

/**
 * Get video metadata using ffprobe.
 *
 * @param {string} videoPath
 * @returns {{ width: number, height: number, duration: number, fps: number }}
 */
async function getVideoMetadata(videoPath) {
  const cmd = `ffprobe -v quiet -print_format json -show_streams "${videoPath}"`;

  let output;
  try {
    const { stdout } = await execAsync(cmd);
    output = stdout;
  } catch (err) {
    throw new Error(`ffprobe failed: ${err.message}`);
  }

  const data = JSON.parse(output);
  const videoStream = data.streams.find((s) => s.codec_type === 'video');

  if (!videoStream) {
    throw new Error(`No video stream found in ${videoPath}`);
  }

  // Parse FPS from r_frame_rate (e.g., "30/1" or "30000/1001")
  let fps = 30;
  if (videoStream.r_frame_rate) {
    const parts = videoStream.r_frame_rate.split('/');
    fps = parts.length === 2
      ? Math.round(parseFloat(parts[0]) / parseFloat(parts[1]))
      : parseFloat(parts[0]);
  }

  const duration = parseFloat(videoStream.duration || data.format?.duration || 0);

  return {
    width: videoStream.width || 1920,
    height: videoStream.height || 1080,
    duration,
    fps
  };
}

/**
 * Render a HyperFrames HTML composition overlaid on an input video.
 *
 * Steps:
 * 1. Write composition HTML to jobDir/composition.html
 * 2. Copy input video to jobDir/video.mp4 (composition references src="video.mp4")
 * 3. Run HyperFrames CLI to render overlay → jobDir/renders/overlay.mp4 (transparent WebM or MP4)
 * 4. Run FFmpeg to composite overlay onto source video → jobDir/output.mp4
 *
 * @param {string} jobDir - Path to the job's working directory
 * @param {string} compositionHtml - Full HTML string of the composition
 * @param {string} inputVideoPath - Path to the source video file
 * @returns {string} Path to output.mp4
 */
async function render(jobDir, compositionHtml, inputVideoPath) {
  const compositionPath = path.join(jobDir, 'composition.html');
  const videoSymlinkPath = path.join(jobDir, 'video.mp4');
  const rendersDir = path.join(jobDir, 'renders');
  const overlayPath = path.join(rendersDir, 'overlay.mp4');
  const outputPath = path.join(jobDir, 'output.mp4');
  const logPath = path.join(jobDir, 'render.log');

  // Ensure renders directory exists
  if (!fs.existsSync(rendersDir)) {
    fs.mkdirSync(rendersDir, { recursive: true });
  }

  // Write composition HTML
  fs.writeFileSync(compositionPath, compositionHtml, 'utf8');
  logger.info(`Wrote composition.html (${compositionHtml.length} chars)`);

  // Copy (or symlink) the input video into the job directory as video.mp4
  // HyperFrames composition uses relative path src="video.mp4"
  if (fs.existsSync(videoSymlinkPath)) {
    fs.unlinkSync(videoSymlinkPath);
  }
  fs.copyFileSync(inputVideoPath, videoSymlinkPath);
  logger.info(`Copied source video → ${videoSymlinkPath}`);

  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  function logAndWrite(msg) {
    logger.info(msg);
    logStream.write(msg + '\n');
  }

  // Step 1: Render HyperFrames composition to MP4
  // npx hyperframes render --output <path> --quality standard
  logAndWrite('=== HyperFrames render ===');

  const hfCmd = `npx hyperframes render --output "${overlayPath}" --quality standard`;
  logAndWrite(`Running: ${hfCmd}`);
  logAndWrite(`Working directory: ${jobDir}`);

  try {
    const { stdout: hfOut, stderr: hfErr } = await execAsync(hfCmd, {
      cwd: jobDir,
      timeout: 5 * 60 * 1000 // 5 minute timeout
    });

    if (hfOut) logAndWrite(hfOut);
    if (hfErr) logAndWrite(`STDERR: ${hfErr}`);
  } catch (err) {
    logStream.write(`HyperFrames render error: ${err.message}\n`);
    logStream.end();
    throw new Error(`HyperFrames render failed: ${err.message}`);
  }

  if (!fs.existsSync(overlayPath)) {
    logStream.end();
    throw new Error(`HyperFrames did not produce output at ${overlayPath}`);
  }

  logAndWrite(`HyperFrames render complete: ${overlayPath}`);

  // Step 2: Composite overlay onto source video with FFmpeg
  // Strategy: use overlay filter. If overlay has alpha (WebM), use alphamerge.
  // For MP4 overlay (no alpha), use blend overlay — but since HyperFrames renders
  // the full frame (black bg for non-overlay areas), we use a chroma-key-style approach.
  // Simplest reliable approach: scale overlay to match source, then overlay with
  // colorkey on the background color (#0D0D0D), or just use the overlay as-is
  // if it has a transparent background (WebM).
  //
  // Since we request MP4 from hyperframes, we'll use the overlay filter
  // and keep the composition background transparent by using WebM format.
  // If MP4 is produced, we composite using overlay filter centered at 0,0.

  logAndWrite('=== FFmpeg composite ===');

  // Get source video metadata for sizing
  const sourceMeta = await getVideoMetadata(inputVideoPath);
  const overlayMeta = await getVideoMetadata(overlayPath);

  logAndWrite(`Source: ${sourceMeta.width}x${sourceMeta.height} ${sourceMeta.duration}s`);
  logAndWrite(`Overlay: ${overlayMeta.width}x${overlayMeta.height} ${overlayMeta.duration}s`);

  // Check if overlay is WebM with transparency
  const overlayExt = path.extname(overlayPath).toLowerCase();
  let ffmpegCmd;

  if (overlayExt === '.webm') {
    // WebM with alpha channel — use overlay filter directly
    ffmpegCmd = [
      'ffmpeg -y',
      `-i "${inputVideoPath}"`,
      `-i "${overlayPath}"`,
      `-filter_complex "[0:v][1:v]overlay=0:0:shortest=1[v]"`,
      `-map "[v]"`,
      `-map 0:a?`,
      `-c:v libx264 -preset fast -crf 22`,
      `-c:a aac -b:a 192k`,
      `-movflags +faststart`,
      `"${outputPath}"`
    ].join(' ');
  } else {
    // MP4 overlay — use colorkey to remove dark background (#0D0D0D)
    // Then overlay on source video
    // The composition HTML uses #0D0D0D as background — colorkey it out
    ffmpegCmd = [
      'ffmpeg -y',
      `-i "${inputVideoPath}"`,
      `-i "${overlayPath}"`,
      `-filter_complex "[1:v]colorkey=0x0D0D0D:0.15:0.1[ov];[0:v][ov]overlay=0:0:shortest=1[v]"`,
      `-map "[v]"`,
      `-map 0:a?`,
      `-c:v libx264 -preset fast -crf 22`,
      `-c:a aac -b:a 192k`,
      `-movflags +faststart`,
      `"${outputPath}"`
    ].join(' ');
  }

  logAndWrite(`Running: ${ffmpegCmd}`);

  try {
    const { stdout: ffOut, stderr: ffErr } = await execAsync(ffmpegCmd, {
      timeout: 10 * 60 * 1000 // 10 minute timeout
    });
    if (ffOut) logAndWrite(ffOut);
    if (ffErr) logAndWrite(`STDERR: ${ffErr}`);
  } catch (err) {
    logStream.write(`FFmpeg error: ${err.message}\n`);
    logStream.end();
    throw new Error(`FFmpeg composite failed: ${err.message}`);
  }

  logStream.end();

  if (!fs.existsSync(outputPath)) {
    throw new Error(`FFmpeg did not produce output at ${outputPath}`);
  }

  const stat = fs.statSync(outputPath);
  logger.info(`Render complete: ${outputPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

  return outputPath;
}

module.exports = { render, getVideoMetadata };
