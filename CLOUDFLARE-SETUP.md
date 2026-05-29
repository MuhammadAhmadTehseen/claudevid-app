# Cloudflare Tunnel Setup
_Expose your local render server publicly with a stable URL_

## What It Does
Cloudflare Tunnel creates a secure connection from your local machine to the internet. 
Your render server runs on localhost:3001 — the tunnel gives it a public URL like `https://xxx.trycloudflare.com`.

## Install cloudflared

**Windows:**
```
winget install --id Cloudflare.cloudflared -e
```

Verify: `cloudflared --version`

## Quick Tunnel (no account needed — URL changes on restart)

Start your render server first:
```
cd render-server && npm start
```

Then in a new terminal:
```
cloudflared tunnel --url http://localhost:3001
```

Copy the URL shown (e.g. `https://abc-def-ghi.trycloudflare.com`) and set it as `NEXT_PUBLIC_RENDER_SERVER_URL` in your frontend `.env.local`.

**Note:** The URL changes every time you restart the tunnel. For a stable URL, use a named tunnel (see below).

## Named Tunnel (stable URL — requires free Cloudflare account)

1. Sign up at https://cloudflare.com (free)
2. Login: `cloudflared login`
3. Create tunnel: `cloudflared tunnel create claudevid`
4. Create config file at `~/.cloudflare/config.yml`:
```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\HP\.cloudflare\<TUNNEL_ID>.json

ingress:
  - hostname: claudevid-render.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
```
5. Run: `cloudflared tunnel run claudevid`

## Running as a Windows Service (auto-starts on boot)
```
cloudflared service install
```

## Updating the Frontend URL
Whenever your tunnel URL changes, update `NEXT_PUBLIC_RENDER_SERVER_URL` in:
- Local dev: `frontend/.env.local`
- Vercel: Dashboard → Project → Settings → Environment Variables

## Troubleshooting
- Tunnel shows but requests fail: ensure render server is running on port 3001
- 502 errors: render server crashed — check `npm start` output
- URL not working in Vercel: redeploy after updating env var
