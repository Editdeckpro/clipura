# Clipura — Deploy Guide

This describes how Clipura is hosted and what to set where. **No secret values live
in this repo.** All keys are set in the hosting dashboards.

## Shape

- **Frontend (the website):** Next.js, hosted on **Vercel**. Static + fast on phones.
- **Backend (the engine):** Node + Express. It runs **ffmpeg**, **yt-dlp**, and
  long jobs, which Vercel cannot do — so it is hosted on **Render** (a Docker web
  service with a small persistent disk). `render.yaml` and `backend/Dockerfile`
  are already set up.

### Recommended backend host + cost

**Render** is the simplest option here (it reads `render.yaml` and builds the
Dockerfile for you). Rough monthly cost:

| Item | Plan | ~Cost |
|---|---|---|
| Web service | Starter | $7/mo |
| Persistent disk (10 GB) | — | ~$2.50/mo |
| **Backend total** | | **~$9.50/mo** |
| Vercel (frontend) | Hobby | $0 (free) |

Upgrade the Render service to **Standard** if clip generation feels slow under load.

## What survives a restart

The Render service mounts a persistent disk at `/var/data`, and the backend writes
all runtime data there (`DATA_DIR=/var/data`): job records, finished clips, source
uploads, and the yt-dlp binary. So **jobs and clips survive restarts**. A job that
was mid-download or mid-generation when the server restarted shows
"This was interrupted. Start it again."

## Environment variables

### Backend (Render dashboard → Environment)

| Key | Value | Notes |
|---|---|---|
| `OPENAI_API_KEY` | *(your key)* | secret — set in dashboard only |
| `ANTHROPIC_API_KEY` | *(your key)* | secret — set in dashboard only |
| `NODE_ENV` | `production` | turns on rate limiting |
| `FRONTEND_URL` | your Vercel URL | e.g. `https://clipura.vercel.app` — allows the site to call the backend |
| `ACCESS_CODE` | *(a code you pick)* | the code you give testers |
| `DAILY_PROCESSING_MINUTES` | `180` | max minutes of source video/day (spend cap) |
| `DATA_DIR` | `/var/data` | already in render.yaml |
| `PORT` | `3001` | already in render.yaml |

### Frontend (Vercel dashboard → Settings → Environment Variables)

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | your Render backend URL, e.g. `https://clipura-backend.onrender.com` |
| `NEXT_PUBLIC_SITE_URL` | your Vercel site URL, e.g. `https://clipura.vercel.app` |

## Protecting your money (demo safeguards)

- **Access code** — set `ACCESS_CODE` on the backend. Testers see an
  "Enter the access code" screen. **To change it:** edit `ACCESS_CODE` in the
  Render dashboard and redeploy; share the new code.
- **Per-visitor limits** — enabled automatically in production (20 uploads/hour and
  200 API calls/15 min per IP).
- **Daily processing cap** — `DAILY_PROCESSING_MINUTES` (default 180) caps total
  minutes of source video processed per day across everyone. **To change the cap:**
  edit that value in the Render dashboard and redeploy.

## Adding a custom domain later (small step)

1. Add the domain to Vercel (frontend) and set DNS as Vercel instructs.
2. Add the same (or an `api.`) domain to the Render service for the backend.
3. Update two env vars: `NEXT_PUBLIC_API_URL` (frontend → backend domain) and
   `FRONTEND_URL` (backend → frontend domain). Redeploy both. That's it.

## Honest note on cloud downloads

Cloud servers are sometimes blocked by YouTube/Twitch/Kick from downloading. This
is verified from the live site during Stage 5 — some sources may need cookies or a
proxy. File upload always works regardless.
