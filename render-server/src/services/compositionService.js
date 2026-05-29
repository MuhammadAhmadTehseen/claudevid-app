'use strict';

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

/**
 * Load HyperFrames skill content from the local core installation.
 * Returns an empty string if files are not found (non-fatal).
 */
function loadHyperFramesSkill() {
  const corePath = process.env.HYPERFRAMES_CORE_PATH;
  if (!corePath) {
    logger.warn('HYPERFRAMES_CORE_PATH not set — composition will be generated without skill context');
    return '';
  }

  const skillPath = path.join(corePath, 'skills', 'hyperframes', 'SKILL.md');
  const patternsPath = path.join(corePath, 'skills', 'hyperframes', 'patterns.md');

  let content = '';

  if (fs.existsSync(skillPath)) {
    content += `\n\n=== HYPERFRAMES SKILL REFERENCE ===\n${fs.readFileSync(skillPath, 'utf8')}`;
  } else {
    logger.warn(`HyperFrames SKILL.md not found at ${skillPath}`);
  }

  if (fs.existsSync(patternsPath)) {
    content += `\n\n=== HYPERFRAMES PATTERNS ===\n${fs.readFileSync(patternsPath, 'utf8')}`;
  }

  return content;
}

const DESIGN_SYSTEM = `
DESIGN SYSTEM (non-negotiable):
- Colors: primary #FF6200 (orange), background #0D0D0D (near-black), text #FFFFFF
- Accent glow: 0 0 20px rgba(255,98,0,0.4)
- Font: Space Grotesk (load from: https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap)
- Glass card style: background rgba(13,13,13,0.85), border 1px solid rgba(255,98,0,0.25), backdrop-filter blur(12px)
- Border radius: 8px for cards, 4px for badges
- Safe zone: ALL overlays must be positioned in bottom 20% (y >= 864px for 1080p)
  Do NOT place anything in top 80% — the source video plays there

ANIMATION PRINCIPLES (HyperFrames-specific):
- All GSAP timelines must start { paused: true }
- Register EVERY timeline: window.__timelines["root"] = tl
- Use gsap.from() for entrances (animate FROM off-screen TO CSS position)
- Use gsap.to() for exits on final scene only
- NEVER use Math.random(), Date.now(), or time-based logic (must be deterministic)
- NEVER animate visibility or display properties
- NEVER use repeat: -1 on any tween
- NEVER build timelines inside async/await or setTimeout`;

/**
 * Generate a HyperFrames HTML composition from a motion board.
 *
 * @param {Array} motionBoard - Array of motion board entries
 * @param {{ width: number, height: number, duration: number }} videoMetadata
 * @returns {string} Complete HTML composition string
 */
async function generateComposition(motionBoard, videoMetadata) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const skillContext = loadHyperFramesSkill();

  const systemPrompt = `You are an expert HyperFrames HTML composition author.

Your job is to generate a valid, complete HyperFrames HTML composition file that renders animated overlays over a background video.

${DESIGN_SYSTEM}

COMPOSITION RULES:
1. Root element: <div data-composition-id="root" data-start="0" data-width="${videoMetadata.width || 1920}" data-height="${videoMetadata.height || 1080}" data-duration="${videoMetadata.duration}">
2. The background video clip uses src="video.mp4" — a relative path (the file will be in the same directory)
3. Overlay divs are positioned absolutely within the stage, z-index above the video
4. Each overlay has its own data-start, data-duration, data-track-index
5. Track 0 = background video. Overlay tracks start at 1+. Never reuse the same track for overlapping clips.
6. One single GSAP timeline controls ALL overlay animations
7. The GSAP timeline total length must match data-duration on the root composition

OVERLAY STRUCTURE PATTERN:
Each overlay from the motion board becomes an absolutely-positioned div with:
- class="overlay-clip" (for common styles)
- data-start, data-duration, data-track-index
- inner content div with the badge/stat/text content
- Styled as glass card with orange accent

OUTPUT: Return ONLY the complete HTML file. No explanation. No markdown fences. Start with <!doctype html>.
${skillContext ? '\n' + skillContext : ''}`;

  const userMessage = `VIDEO METADATA:
Width: ${videoMetadata.width || 1920}px
Height: ${videoMetadata.height || 1080}px
Duration: ${videoMetadata.duration}s
FPS: ${videoMetadata.fps || 30}

MOTION BOARD (${motionBoard.length} entries):
${JSON.stringify(motionBoard, null, 2)}

Generate the complete HyperFrames HTML composition. The video file is at src="video.mp4" (relative path in the same directory).`;

  logger.info(`Generating HyperFrames composition for ${motionBoard.length} motion board entries`);

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  let html = response.content[0].text.trim();

  // Strip markdown fences if the model wrapped the output
  if (html.startsWith('```')) {
    const fenceEnd = html.indexOf('\n');
    html = html.slice(fenceEnd + 1);
    const closingFence = html.lastIndexOf('```');
    if (closingFence !== -1) {
      html = html.slice(0, closingFence).trim();
    }
  }

  if (!html.includes('data-composition-id')) {
    throw new Error('Generated HTML does not contain a valid HyperFrames composition root');
  }

  logger.info(`Composition HTML generated: ${html.length} chars`);
  return html;
}

/**
 * Edit an existing composition using a text prompt.
 * Sends the existing motion board + edit prompt to Claude,
 * gets back changed entries only, merges them, and regenerates.
 *
 * @param {Array} existingMotionBoard
 * @param {string} editPrompt
 * @param {{ width: number, height: number, duration: number }} videoMetadata
 * @returns {{ updatedMotionBoard: Array, html: string }}
 */
async function editComposition(existingMotionBoard, editPrompt, videoMetadata) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a motion graphics editor. You receive an existing motion board (JSON array) and an edit instruction.

Return ONLY the changed/added/removed entries as a JSON object with this structure:
{
  "changes": [
    { "action": "update", "index": <number>, "entry": { ...full updated entry... } },
    { "action": "add", "entry": { ...new entry... } },
    { "action": "remove", "index": <number> }
  ]
}

Rules:
- "update": replace entry at the given 0-based index with the new entry
- "add": append a new entry (at the appropriate timestamp position)
- "remove": remove entry at the given 0-based index
- Return ONLY the JSON object — no explanation, no markdown fences
- If no changes are needed, return { "changes": [] }`;

  const editResponse = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `EXISTING MOTION BOARD:\n${JSON.stringify(existingMotionBoard, null, 2)}\n\nEDIT INSTRUCTION:\n${editPrompt}`
    }]
  });

  let changesText = editResponse.content[0].text.trim();

  // Strip markdown fences
  const fenceMatch = changesText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) changesText = fenceMatch[1].trim();

  const changesObj = JSON.parse(changesText);
  const changes = changesObj.changes || [];

  // Apply changes to a copy of the motion board
  let updatedMotionBoard = [...existingMotionBoard];

  // Process removals first (reverse order to preserve indices)
  const removals = changes.filter((c) => c.action === 'remove').sort((a, b) => b.index - a.index);
  for (const r of removals) {
    updatedMotionBoard.splice(r.index, 1);
  }

  // Process updates
  for (const u of changes.filter((c) => c.action === 'update')) {
    if (u.index >= 0 && u.index < updatedMotionBoard.length) {
      updatedMotionBoard[u.index] = u.entry;
    }
  }

  // Process additions
  for (const a of changes.filter((c) => c.action === 'add')) {
    updatedMotionBoard.push(a.entry);
  }

  // Re-sort by timestamp
  updatedMotionBoard.sort((a, b) => a.timestamp_start - b.timestamp_start);

  logger.info(`Motion board edited: ${changes.length} changes applied`);

  // Regenerate composition
  const html = await generateComposition(updatedMotionBoard, videoMetadata);

  return { updatedMotionBoard, html };
}

module.exports = { generateComposition, editComposition };
