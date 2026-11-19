FROM node:20-slim

# ffmpeg is required for clip cutting and audio extraction
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production --no-audit --no-fund

COPY . .

# yt-dlp binary will be downloaded at runtime into /app/bin (see services/youtube.js)
RUN mkdir -p uploads outputs temp bin

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
