# Clip Factory

Turn business podcasts into viral short-form clips using AI. Upload a file or YouTube URL → Whisper transcription → Claude AI finds viral moments → FFmpeg generates captioned 9:16 clips.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org |
| FFmpeg | Any recent | See below |

### Installing FFmpeg

**Windows:**
```bash
# Option 1: winget (easiest)
winget install Gyan.FFmpeg

# Option 2: Chocolatey
choco install ffmpeg

# Option 3: Manual — download from https://ffmpeg.org/download.html
# Extract and add bin/ folder to your PATH
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update && sudo apt install ffmpeg
```

Verify: `ffmpeg -version`

---

## Setup

### 1. Clone / open the project

```bash
cd clip-factory
```

### 2. Configure backend environment

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```
OPENAI_API_KEY=sk-...          # From https://platform.openai.com
ANTHROPIC_API_KEY=sk-ant-...   # From https://console.anthropic.com
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### 3. Configure frontend environment

```bash
cd ../frontend
cp .env.example .env.local
```

`frontend/.env.local` is already correct for local dev (`http://localhost:3001`).

### 4. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

---

## Running Locally

Open **two terminals**:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# Server starts on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# App opens at http://localhost:3000
```

Visit http://localhost:3000

---

## Usage Workflow

1. **Upload** — Drop a podcast file (MP4/MOV/AVI/MP3/M4A/WAV, up to 2GB) or paste a public YouTube URL
2. **Processing** — Whisper transcribes the audio (word-level timestamps). Claude AI scores and finds 4–6 viral moments
3. **Select** — Review moments sorted by viral score (0–100). Expand each card to see caption suggestions and rationale
4. **Generate** — FFmpeg cuts selected clips, adds word-by-word captions, and formats to 9:16 vertical video
5. **Download** — All clips packaged as a single ZIP file

---

## Project Structure

```
clip-factory/
├── backend/
│   ├── routes/
│   │   ├── upload.js          # File upload & YouTube ingest endpoints
│   │   └── jobs.js            # Job status, SSE stream, clip gen, download
│   ├── services/
│   │   ├── transcription.js   # Whisper API (word-level timestamps)
│   │   ├── youtube.js         # ytdl-core download
│   │   ├── claude.js          # Claude AI viral moment analysis
│   │   └── ffmpeg.js          # Clip cutting + SRT caption burning
│   ├── utils/
│   │   └── jobManager.js      # In-memory job store
│   ├── uploads/               # Incoming files (auto-created, gitignored)
│   ├── outputs/               # Generated clips (auto-created, gitignored)
│   └── server.js
└── frontend/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx            # Main single-page app with stage machine
    │   └── globals.css
    ├── components/
    │   ├── UploadZone.tsx      # Drag/drop + YouTube URL input
    │   ├── ProcessingStatus.tsx # SSE-based real-time progress
    │   ├── MomentCard.tsx      # Viral moment card with score ring
    │   └── ClipGenerator.tsx   # Clip gen progress + download
    └── lib/
        └── api.ts              # Typed API client
```

---

## API Keys

### OpenAI (Whisper)
1. Go to https://platform.openai.com/api-keys
2. Create a new key
3. Add to `OPENAI_API_KEY`
4. Ensure you have credits — Whisper costs ~$0.006/minute of audio

### Anthropic (Claude)
1. Go to https://console.anthropic.com/settings/keys
2. Create a new key
3. Add to `ANTHROPIC_API_KEY`
4. Claude Sonnet costs ~$0.003/1K input tokens

### Cost per podcast episode (60 min)
- Whisper: ~$0.36
- Claude analysis: ~$0.05–0.15
- **Total: ~$0.50/episode** at your $1200/month pricing this is extremely profitable

---

## Deployment

### Option A: Railway (Easiest, ~$5/month)

1. Push to GitHub
2. Create two Railway services: one for backend, one for frontend
3. Set environment variables in Railway dashboard
4. Railway auto-detects Node.js and runs the start scripts

**Backend start command:** `node server.js`
**Frontend start command:** `npm run build && npm run start`

Set `FRONTEND_URL` to your frontend Railway URL, and `NEXT_PUBLIC_API_URL` to your backend Railway URL.

### Option B: VPS (DigitalOcean/Linode, ~$6/month)

```bash
# On server
git clone your-repo clip-factory
cd clip-factory

# Install deps
cd backend && npm install --production
cd ../frontend && npm install && npm run build

# Install PM2 for process management
npm install -g pm2

# Start backend
cd ../backend
pm2 start server.js --name "clip-factory-api"

# Start frontend
cd ../frontend
pm2 start npm --name "clip-factory-web" -- start

pm2 save
pm2 startup

# Install nginx for reverse proxy
sudo apt install nginx
```

**Nginx config:**
```nginx
server {
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        client_max_body_size 2G;
        proxy_read_timeout 600s;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
    }
}
```

### Option C: Docker (Advanced)

Both services have standard Node.js entry points — create standard Dockerfiles for each.

---

## Production Upgrades

When you're processing 20+ clients/month, consider:

| Current | Production Upgrade |
|---------|-------------------|
| In-memory job store | Redis + Bull queue |
| Local file storage | AWS S3 / Cloudflare R2 |
| No auth | NextAuth.js + Stripe for billing |
| Single server | Separate transcription worker |

---

## Troubleshooting

**FFmpeg not found:**
```
Error: FFmpeg executable not found
```
Set the path manually in `backend/.env`:
```
FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
FFPROBE_PATH=C:\ffmpeg\bin\ffprobe.exe
```

**YouTube download fails:**
- Ensure video is public (not unlisted/private)
- Age-restricted videos require cookies — use file upload instead
- Very long videos (3h+) may time out — use file upload

**Whisper returns no timestamps:**
- This happens on very short clips (<10s). The transcript will still work but captions won't be word-level.

**Large file uploads timeout:**
- For files >500MB, consider increasing the Express timeout
- Production: upload directly to S3 and process from there
