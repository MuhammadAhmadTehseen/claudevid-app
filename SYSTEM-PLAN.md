# ClaudeVid Web App — System Plan
_Last updated: 2026-05-29_

---

## What It Does
User pastes a Google Drive video link → system transcribes, generates motion graphics, renders final video → returns Google Drive link. Prompt box allows iterative edits without re-uploading.

---

## Architecture

```
Browser (Vercel)
    │  POST /api/submit { driveUrl, prompt }
    │  GET  /api/status/:jobId  (polls every 3s)
    ▼
Next.js (Vercel)          ← frontend only, no compute
    │  proxies to Render Server
    ▼
Cloudflare Tunnel         ← stable public URL → localhost:3001
    ▼
Express Render Server     ← runs on your machine (port 3001)
    │
    ├─ Google Drive        ← download input video (public link)
    ├─ AssemblyAI          ← transcription with timestamps
    ├─ Claude API          ← motion board + HTML composition
    ├─ HyperFrames CLI     ← renders HTML overlay
    ├─ FFmpeg              ← composites overlay onto video
    └─ Google Drive        ← uploads final video, returns link
```

---

## API Contract (render-server ↔ frontend)

### POST /render
**Request:**
```json
{ "driveUrl": "https://drive.google.com/file/d/XXX/view", "prompt": "optional creative direction" }
```
**Response:**
```json
{ "jobId": "uuid-v4", "status": "queued" }
```

### GET /status/:jobId
**Response:**
```json
{
  "jobId": "abc123",
  "status": "queued|downloading|transcribing|generating|rendering|uploading|done|error",
  "progress": 0-100,
  "step": "Transcribing audio...",
  "videoUrl": "https://drive.google.com/...",
  "motionBoard": [...],
  "error": null
}
```

### POST /edit/:jobId
**Request:**
```json
{ "prompt": "make the OVERPAYING badge bigger, center it" }
```
**Response:**
```json
{ "jobId": "new-uuid", "parentJobId": "abc123", "status": "queued" }
```

### GET /health
**Response:** `{ "status": "ok", "version": "1.0.0", "jobs": 3 }`

### GET /jobs/:jobId/output.mp4
Serves the rendered video file directly (for download fallback).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), Tailwind CSS |
| Backend | Express.js (Node.js 24) |
| Transcription | AssemblyAI SDK |
| AI | Anthropic SDK (claude-sonnet-4-5) |
| Rendering | HyperFrames CLI 0.6.51 + FFmpeg 8.1.1 |
| Tunnel | Cloudflare Tunnel (cloudflared) |
| Hosting | Vercel (frontend), local machine (backend) |
| Storage | Google Drive (input + output) |

---

## Environment Variables

### render-server/.env
```
PORT=3001
ANTHROPIC_API_KEY=sk-ant-...
ASSEMBLYAI_API_KEY=aaa45c144522430f8011039ad2ab5bdb
GOOGLE_SERVICE_ACCOUNT_JSON=./google-service-account.json
GOOGLE_DRIVE_UPLOAD_FOLDER_ID=<shared folder ID>
HYPERFRAMES_CORE_PATH=C:\Users\HP\soch-assistant\ClaudeVid\hyperframes-core
JOBS_DIR=./jobs
```

### frontend/.env.local
```
NEXT_PUBLIC_RENDER_SERVER_URL=https://xxx.trycloudflare.com
```

---

## Design System (frontend)
- Background: #0D0D0D
- Primary orange: #FF6200
- Text: #FFFFFF / #CCCCCC
- Font: Space Grotesk (Google Fonts)
- Cards: dark glass, 1px solid rgba(255,98,0,0.4), backdrop-blur

---

## Phase Breakdown

| Phase | What | Owner |
|-------|------|-------|
| 1 | Render Server (Express + all services) | Agent 1 |
| 2 | Next.js Frontend | Agent 2 |
| 3 | GitHub repo + Vercel config + Cloudflare docs | Agent 3 |
| 4 | End-to-end test + fixes | Manual |
| 5 | Google Drive upload via service account | Enhancement |

---

## Job Lifecycle
```
queued → downloading → transcribing → generating → rendering → uploading → done
                                                                          ↘ error (at any stage)
```

Each job stored as: `jobs/{jobId}/`
```
jobs/{jobId}/
  job.json        ← status, timestamps, metadata
  video.mp4       ← downloaded input
  transcript.json ← AssemblyAI output
  motion-board.json ← Claude output (structured)
  composition.html  ← Claude-generated HyperFrames HTML
  output.mp4      ← final rendered video
```

---

## Motion Board → HTML Pipeline (Claude API)

**Call 1: Generate Motion Board**
- Input: transcript JSON + design system + user prompt
- Output: structured JSON array of animation entries
- Model: claude-sonnet-4-5

**Call 2: Generate HyperFrames HTML**
- Input: motion board JSON + SKILL.md (from hyperframes-core) + design system
- Output: complete HTML composition file
- Model: claude-sonnet-4-5

**Edit flow:**
- Input: existing motion board + user edit prompt
- Output: updated motion board (changed entries only)
- Then re-run Call 2 with full updated board
