# ClaudeVid

Automated video motion graphics pipeline. Paste a Google Drive video link → get back a polished video with AI-generated motion graphics overlays.

## What It Does
- Transcribes your video (AssemblyAI)
- Generates a motion board (Claude AI)
- Creates HyperFrames HTML composition (Claude AI)
- Renders overlays with FFmpeg
- Returns finished video via Google Drive

## Stack
- **Frontend**: Next.js 14 on Vercel
- **Backend**: Express.js render server
- **AI**: Anthropic Claude (motion board + composition)
- **Transcription**: AssemblyAI
- **Rendering**: HyperFrames + FFmpeg

## Setup

### Prerequisites
- Node.js v22+
- FFmpeg installed and on PATH
- HyperFrames CLI: `npm install -g hyperframes`
- Cloudflare Tunnel: see [CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md)

### Render Server
```bash
cd render-server
cp .env.example .env
# Fill in API keys in .env
npm install
npm start
```

### Frontend
```bash
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_RENDER_SERVER_URL to your Cloudflare tunnel URL
npm install
npm run dev
```

### Deploy Frontend to Vercel
1. Push repo to GitHub
2. Import in Vercel dashboard
3. Set root directory to `frontend/`
4. Add env var: `NEXT_PUBLIC_RENDER_SERVER_URL` = your Cloudflare tunnel URL
5. Deploy

## Prompt Box Examples
- "Make all text 20% larger"
- "Move the OVERPAYING badge to center"
- "Add a lower third with my name and title"
- "Remove the tool badges section"
