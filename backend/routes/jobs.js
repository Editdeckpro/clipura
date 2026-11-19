const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { getJob, updateJob, JOB_STATUS } = require('../utils/jobManager');
const { generateClip } = require('../services/ffmpeg');

const router = express.Router();

// GET /api/jobs/:id
router.get('/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Strip full filesystem paths from response
  const safe = { ...job };
  delete safe.inputFile;
  res.json(safe);
});

// GET /api/jobs/:id/stream - Server-Sent Events for real-time progress
router.get('/:id/stream', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = () => {
    const current = getJob(req.params.id);
    if (!current) { res.end(); return; }
    const safe = { ...current };
    delete safe.inputFile;
    res.write(`data: ${JSON.stringify(safe)}\n\n`);
    if (current.status === JOB_STATUS.COMPLETE || current.status === JOB_STATUS.ERROR || current.status === JOB_STATUS.READY) {
      clearInterval(interval);
      res.end();
    }
  };

  const interval = setInterval(send, 1000);
  send();

  req.on('close', () => clearInterval(interval));
});

// GET /api/jobs/:id/clips/:filename - serve a generated clip for in-browser preview
router.get('/:id/clips/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(__dirname, '../outputs', req.params.id, safeFilename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Clip not found' });
  res.sendFile(filePath);
});

// POST /api/jobs/:id/generate - generate selected clips
router.post('/:id/generate', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== JOB_STATUS.READY && job.status !== JOB_STATUS.COMPLETE) {
    return res.status(400).json({ error: 'Job not ready for clip generation' });
  }

  const { selectedMoments, momentOverrides = {} } = req.body;
  if (!selectedMoments || !Array.isArray(selectedMoments) || selectedMoments.length === 0) {
    return res.status(400).json({ error: 'Select at least one moment to generate' });
  }

  // Apply any user-adjusted times/text on top of the original moments
  const momentsToGenerate = job.moments
    .filter(m => selectedMoments.includes(m.id))
    .map(m => ({ ...m, ...(momentOverrides[m.id] || {}) }));
  if (momentsToGenerate.length === 0) {
    return res.status(400).json({ error: 'No valid moments selected' });
  }

  updateJob(req.params.id, {
    status: JOB_STATUS.GENERATING,
    progress: 0,
    statusMessage: `Generating ${momentsToGenerate.length} clips...`,
  });

  res.json({ message: 'Clip generation started', count: momentsToGenerate.length });

  generateClips(req.params.id, job.inputFile, momentsToGenerate, job.transcript);
});

// GET /api/jobs/:id/download - download all clips as zip
router.get('/:id/download', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== JOB_STATUS.COMPLETE) {
    return res.status(400).json({ error: 'Clips not ready yet' });
  }

  const outputDir = path.join(__dirname, '../outputs', req.params.id);
  if (!fs.existsSync(outputDir)) {
    return res.status(404).json({ error: 'Output directory not found' });
  }

  const zipName = `clips-${req.params.id.slice(0, 8)}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', err => { console.error('Archive error:', err); res.status(500).end(); });
  archive.pipe(res);
  archive.directory(outputDir, false);
  await archive.finalize();
});

async function generateClips(jobId, inputFile, moments, transcript) {
  const outputDir = path.join(__dirname, '../outputs', jobId);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const clips = [];
  const total = moments.length;

  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i];
    const progress = Math.round(((i) / total) * 100);
    updateJob(jobId, {
      progress,
      statusMessage: `Generating clip ${i + 1} of ${total}: "${moment.hook.slice(0, 50)}..."`,
    });

    try {
      const outputPath = path.join(outputDir, `clip-${i + 1}-${moment.id.slice(0, 6)}.mp4`);
      await generateClip({
        inputFile,
        outputPath,
        startTime: moment.startTime,
        endTime: moment.endTime,
        transcript,
        momentId: moment.id,
      });
      clips.push({ momentId: moment.id, file: path.basename(outputPath), status: 'done' });
    } catch (err) {
      console.error(`Clip ${i + 1} error:`, err);
      clips.push({ momentId: moment.id, status: 'error', error: err.message });
    }
  }

  updateJob(jobId, {
    status: JOB_STATUS.COMPLETE,
    clips,
    progress: 100,
    statusMessage: `${clips.filter(c => c.status === 'done').length} clips ready to download!`,
  });
}

module.exports = router;