const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createJob, updateJob, JOB_STATUS } = require('../utils/jobManager');
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

// POST /api/upload/youtube
// Body: { url, liveMinutes } - liveMinutes is only used when the link is live right now.
router.post('/youtube', async (req, res) => {
  const { url, liveMinutes } = req.body;
  if (!url) return res.status(400).json({ error: 'YouTube link required' });

  const youtubeRegex = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/.+/;
  if (!youtubeRegex.test(url)) {
    return res.status(400).json({ error: 'That does not look like a YouTube link' });
  }

  const minutes = Number(liveMinutes);
  const job = createJob({ inputType: 'youtube', youtubeUrl: url });
  res.json({ jobId: job.id });
  processYouTubeJob(job.id, url, Number.isFinite(minutes) && minutes > 0 ? minutes : undefined);
});

async function processYouTubeJob(jobId, url, liveMinutes) {
  try {
    updateJob(jobId, { status: JOB_STATUS.DOWNLOADING, progress: 5, statusMessage: 'Checking the link...' });
    const outputPath = path.join(__dirname, '../uploads', `${jobId}.mp4`);

    // Map download progress (0..1) into the 5-18% band of the whole job, and keep
    // it moving forward only so the bar never jumps backwards between stages.
    let lastProgress = 5;
    await downloadYouTube(url, outputPath, {
      liveMinutes,
      onStatus: message => updateJob(jobId, { statusMessage: message }),
      onProgress: fraction => {
        const pct = 5 + Math.round(Math.min(1, Math.max(0, fraction)) * 13);
        if (pct > lastProgress) {
          lastProgress = pct;
          updateJob(jobId, { progress: pct });
        }
      },
    });

    updateJob(jobId, { inputFile: outputPath, progress: 20, statusMessage: 'Video ready' });
    await processJob(jobId, outputPath);
  } catch (err) {
    console.error('YouTube job error:', err);
    updateJob(jobId, { status: JOB_STATUS.ERROR, error: err.message });
  }
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