'use strict';

const { AssemblyAI } = require('assemblyai');
const logger = require('../utils/logger');

/**
 * Transcribe a video/audio file using AssemblyAI.
 *
 * @param {string} videoPath - Absolute local path to the video file
 * @returns {{ text: string, words: Array<{text, start, end, confidence}>, duration: number }}
 */
async function transcribe(videoPath) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is not set');
  }

  const client = new AssemblyAI({ apiKey });

  logger.info(`Transcribing ${videoPath}`);

  const transcript = await client.transcripts.transcribe({
    audio: videoPath,
    word_boost: ['n8n', 'Claude', 'Apify', 'LinkedIn', 'automation', 'Soch', 'workflow', 'webhook'],
    format_text: true
  });

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
