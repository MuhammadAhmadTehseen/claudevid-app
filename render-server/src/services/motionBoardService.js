'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

/**
 * Generate a motion board from a transcript using Claude.
 *
 * @param {{ text: string, words: Array, duration: number }} transcript
 * @param {string} [userPrompt] - Optional additional instructions
 * @returns {Array<MotionBoardEntry>}
 *
 * @typedef {Object} MotionBoardEntry
 * @property {number} timestamp_start
 * @property {number} timestamp_end
 * @property {string} spoken_text
 * @property {string} animation_type
 * @property {string} content
 * @property {string} position
 * @property {string} entrance
 * @property {string} exit
 * @property {number} hold_seconds
 */
async function generateMotionBoard(transcript, userPrompt) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are an expert motion graphics director specializing in automation tutorial videos.

DESIGN SYSTEM:
- Primary color: #FF6200 (orange) on dark background #0D0D0D
- Font: Space Grotesk (from Google Fonts)
- UI style: glass cards with subtle borders (rgba(255,255,255,0.08))
- Safe zone: overlays MUST stay in the bottom 20% of frame (bottom 216px of 1080px height)
  — x range: 0–1920px, y range: 864–1080px
  — Never place overlays in the top 80% — the speaker's face/screen occupies that area

ANIMATION VOCABULARY:
- fade_up: element fades in while sliding upward
- slide_in: element slides in from left or right edge
- scale_reveal: element scales from 0 to full size
- typewriter: text appears character by character
- pipeline_flow: left-to-right flowing reveal for sequential steps
- node_graph_reveal: nodes appear one by one with connection lines
- highlight_badge: bold accent badge with orange border pulse
- stat_counter: number counts up from 0

POSITION OPTIONS (bottom safe zone):
- bottom_left: bottom-left corner, 40px inset from edges
- bottom_center: horizontally centered, bottom 200px
- bottom_right: bottom-right corner, 40px inset from edges
- bottom_full: full-width banner across bottom

CONTENT TYPES:
- badge: short label like "OVERPAYING" or "AUTOMATED"
- stat: a number + label, e.g. "3.2x faster"
- step: a step in a workflow, e.g. "Step 3: Webhook fires"
- tooltip: explanatory note about something on screen
- callout: important concept highlighted during speech
- title_lower_third: name/title bar for a speaker or topic

OUTPUT FORMAT — return ONLY a valid JSON array. No markdown, no explanation. Each object:
{
  "timestamp_start": <number, seconds>,
  "timestamp_end": <number, seconds>,
  "spoken_text": "<excerpt of what's being said at this moment>",
  "animation_type": "<one of the vocabulary above>",
  "content": "<the text/label/stat that appears on screen>",
  "content_type": "<badge|stat|step|tooltip|callout|title_lower_third>",
  "position": "<one of the position options>",
  "entrance": "<brief description of entrance motion>",
  "exit": "<brief description of exit motion>",
  "hold_seconds": <number>
}

RULES:
- Minimum 3 seconds between overlays unless content changes
- Each overlay should appear within 0.3s of the moment it's most relevant
- Maximum 12 overlays for a typical 3–5 minute video
- Badges and stats = highest impact moments only
- Steps should appear as the speaker introduces each step`;

  const wordTimestamps = transcript.words
    .map((w) => `${w.start.toFixed(2)}s: "${w.text}"`)
    .join('\n');

  const userMessage = `TRANSCRIPT (${transcript.duration.toFixed(1)} seconds total):
${transcript.text}

WORD-LEVEL TIMESTAMPS:
${wordTimestamps}

${userPrompt ? `ADDITIONAL INSTRUCTIONS FROM DIRECTOR:\n${userPrompt}\n` : ''}

Generate a motion board for this video. Return ONLY the JSON array.`;

  logger.info(`Generating motion board (${transcript.duration.toFixed(1)}s video, ${transcript.words.length} words)`);

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  const rawText = response.content[0].text.trim();

  // Extract JSON array from response (handle markdown code blocks if present)
  let jsonText = rawText;
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }

  // Find the JSON array
  const arrayStart = jsonText.indexOf('[');
  const arrayEnd = jsonText.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error(`Motion board response did not contain a valid JSON array. Response: ${rawText.slice(0, 500)}`);
  }

  const motionBoard = JSON.parse(jsonText.slice(arrayStart, arrayEnd + 1));

  if (!Array.isArray(motionBoard)) {
    throw new Error('Motion board is not an array');
  }

  logger.info(`Motion board generated: ${motionBoard.length} entries`);
  return motionBoard;
}

module.exports = { generateMotionBoard };
