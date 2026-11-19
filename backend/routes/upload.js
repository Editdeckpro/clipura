const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createJob, updateJob, JOB_STATUS, createAbort, clearAbort } = require('../utils/jobManager');
const { downloadYouTube } = require('../services/youtube');
const { transcribeAudio } = require('../services/transcription');
const { analyzeMoments } = require('../services/claude');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

// Tiers (bytes) - pick via MAX_FILE_SIZE env var or default to unlimited in dev
const FILE_SIZE_TIERS = {
  starter: 500 * 1024 * 1024,   // 500 MB
  pro:     2 * 1024 * 1024 * 1024, // 2 GB
  unlimited: Infinity,
};

const maxFileSize = process.env.MAX_FILE_SIZE
  ? FILE_SIZE_TIERS[process.env.MAX_FILE_SIZE] ?? parseInt(process.env.MAX_FILE_SIZE, 10)
  : FILE_SIZE_TIERS.unlimited;

const upload = multer({
  storage,
  limits: maxFileSize === Infinity ? {} : { fileSize: maxFileSize },
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.mov', '.avi', '.mkv', '.mp3', '.m4a', '.wav', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(', ')}`));
  },
});

// POST /api/upload/file
router.post('/file', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const job = createJob({
    inputFile: req.file.path,
    inputType: 'file',
    originalName: req.file.originalname,
  });

  res.json({ jobId: job.id });
  processJob(job.id, req.file.path);
});

// Links we accept: YouTube, Twitch, and Kick (finished videos and live streams).
function isSupportedLink(url) {
  try {
    const u = new URL(String(url).startsWith('http') ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    return (
      host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' ||
      host === 'twitch.tv' || host.endsWith('.twitch.tv') ||
      host === 'kick.com' || host.endsWith('.kick.com')
    );
  } catch {
    return false;
  }
}

// POST /api/upload/youtube
// Body: { url, liveMinutes } - liveMinutes is only used when the link is live right now.
router.post('/youtube', async (req, res) => {
  const { url, liveMinutes } = req.body;
  if (!url) return res.status(400).json({ error: 'A video link is required' });

  if (!isSupportedLink(url)) {
    return res.status(400).json({ error: 'Paste a YouTube, Twitch, or Kick link.' });
  }

  const minutes = Number(liveMinutes);
  const job = createJob({ inputType: 'youtube', youtubeUrl: url });
  res.json({ jobId: job.id });
  processYouTubeJob(job.id, url, Number.isFinite(minutes) && minutes > 0 ? minutes : undefined);
});

async function processYouTubeJob(jobId, url, liveMinutes) {
  const outputPath = path.join(__dirname, '../uploads', `${jobId}.mp4`);
  const controller = createAbort(jobId); // lets the Cancel button stop a recording

  // Step 1: get the video/stream. If this fails, show a short plain message and
  // keep the full technical log in the server console only.
  try {
    updateJob(jobId, { status: JOB_STATUS.DOWNLOADING, progress: 5, statusMessage: 'Checking the link...' });

    // The download/progress band is 5-18% of the whole job. We let it move both
    // ways so the percentage reflects real recorded footage (if a live stream
    // stalls, the backend stops it; progress does not sit frozen forever).
    await downloadYouTube(url, outputPath, {
      liveMinutes,
      signal: controller.signal,
      onStatus: message => updateJob(jobId, { statusMessage: message }),
      onProgress: fraction => {
        const pct = 5 + Math.round(Math.min(1, Math.max(0, fraction)) * 13);
        updateJob(jobId, { progress: pct });
      },
    });
  } catch (err) {
    clearAbort(jobId);
    if (err && err.cancelled) {
      console.log(`[youtube] recording cancelled by user (job ${jobId})`);
      updateJob(jobId, { status: JOB_STATUS.ERROR, error: 'Recording cancelled.' });
      return;
    }
    console.error('[youtube] stream/video download failed:', err);
    updateJob(jobId, {
      status: JOB_STATUS.ERROR,
      error: "We couldn't get that stream. Try again, or try a finished video.",
    });
    return;
  }
  clearAbort(jobId);

  // Step 2: transcribe + pick moments (these set their own friendly messages).
  updateJob(jobId, { inputFile: outputPath, progress: 20, statusMessage: 'Video ready' });
  await processJob(jobId, outputPath);
}

async function processJob(jobId, filePath) {
  try {
    updateJob(jobId, { status: JOB_STATUS.TRANSCRIBING, progress: 25, statusMessage: 'Listening to the video...' });
    const transcript = await transcribeAudio(filePath);
    updateJob(jobId, { transcript, progress: 60, statusMessage: 'Picking the best moments...' });

    updateJob(jobId, { status: JOB_STATUS.ANALYZING, progress: 65, statusMessage: 'Picking the best moments...' });
    const moments = await analyzeMoments(transcript);
    updateJob(jobId, {
      status: JOB_STATUS.READY,
      moments,
      progress: 100,
      statusMessage: `Found ${moments.length} moments.`,
    });
  } catch (err) {
    console.error('Process job error:', err);
    updateJob(jobId, { status: JOB_STATUS.ERROR, error: err.message });
  }
}

// Multer error handler - must have 4 args for Express to treat it as error middleware
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    const limitMB = maxFileSize === Infinity ? 'unlimited' : Math.round(maxFileSize / 1024 / 1024);
    return res.status(413).json({
      error: 'File too large',
      message: `Maximum upload size is ${limitMB} MB. Set MAX_FILE_SIZE env var to adjust.`,
    });
  }
  next(err);
});

module.exports = router;