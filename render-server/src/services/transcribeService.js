'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { AssemblyAI } = require('assemblyai');
const logger = require('../utils/logger');

/**
 * Extract audio from video using FFmpeg before uploading to AssemblyAI.
 * Reduces upload from 400MB+ video → ~2MB MP3 for a 1-min clip.
 */
function extractAudio(videoPath) {
  const audioPath = videoPath.replace(/\.[^.]+$/, '_audio.mp3');
  logger.info(`Extracting audio from video → ${audioPath}`);
  execSync(
    `ffmpeg -y -i "${videoPath}" -vn -acodec mp3 -ar 16000 -ac 1 -b:a 32k "${audioPath}"`,
    { stdio: 'pipe' }
  );
  const size = fs.statSync(audioPath).size;
  logger.info(`Audio extracted: ${(size / 1024).toFixed(1)} KB`);
  return audioPath;
}

/**
 * Transcribe a video/audio file using AssemblyAI.
 * Extracts audio first to avoid uploading the full video file.
 *
 * @param {string} videoPath - Absolute local path to the video file
 * @returns {{ text: string, words: Array<{text, start, end, confidence}>, duration: number }}
 */
async function transcribe(videoPath) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is not set');
  }

  // Extract audio first — much faster to upload than the full video
  let audioPath = videoPath;
  let audioExtracted = false;
  try {
    audioPath = extractAudio(videoPath);
    audioExtracted = true;
  } catch (err) {
    logger.warn(`Audio extraction failed, falling back to full video: ${err.message}`);
  }

  const client = new AssemblyAI({ apiKey });

  logger.info(`Uploading to AssemblyAI: ${audioPath}`);

  const transcript = await client.transcripts.transcribe({
    audio: audioPath,
    speech_models: ['universal-2'],
    word_boost: ['n8n', 'Claude', 'Apify', 'LinkedIn', 'automation', 'Soch', 'workflow', 'webhook'],
    format_text: true
  });

  // Clean up extracted audio file
  if (audioExtracted && fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath);
  }

  if (transcript.status === 'error') {
    throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
  }

  const words = (transcript.words || []).map((w) => ({
    text: w.text,
    start: w.start / 1000, // ms → seconds
    end: w.end / 1000,
    confidence: w.confidence
  }));

  // Calculate duration from word timestamps or audio_duration
  const duration = transcript.audio_duration || (words.length > 0 ? words[words.length - 1].end : 0);

  logger.info(`Transcription complete: ${transcript.text.length} chars, ${words.length} words, ${duration.toFixed(1)}s`);

  return {
    text: transcript.text || '',
    words,
    duration
  };
}

module.exports = { transcribe };
