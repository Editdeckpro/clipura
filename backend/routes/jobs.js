const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { getJob, updateJob, JOB_STATUS, abortJob } = require('../utils/jobManager');
const { generateClip } = require('../services/ffmpeg');
const { analyzeMoments } = require('../services/claude');

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

// POST /api/jobs/:id/cancel - stop an in-progress recording/download for this job.
router.post('/:id/cancel', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const cancelled = abortJob(req.params.id);
  res.json({ cancelled });
});

// POST /api/jobs/:id/refind - re-run the moment picker on the saved transcript.
// Optional body: { guidance } - what the user is looking for. Avoids moments already
// shown and replaces the list. No re-download or re-transcription.
router.post('/:id/refind', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.transcript) {
    return res.status(400).json({ error: 'This video is no longer available to search. Start a new one.' });
  }

  const { guidance } = req.body || {};

  // Avoid everything shown so far: moments on screen now plus any from earlier searches.
  const current = (job.moments || []).map(m => ({ startTime: m.startTime, endTime: m.endTime, hook: m.hook }));
  const avoid = [...(job.seenMoments || []), ...current];

  try {
    const moments = await analyzeMoments(job.transcript, { guidance, avoid });
    const seenMoments = [...avoid, ...moments.map(m => ({ startTime: m.startTime, endTime: m.endTime, hook: m.hook }))];
    updateJob(req.params.id, {
      moments,
      seenMoments,
      status: JOB_STATUS.READY,
      statusMessage: `Found ${moments.length} moments.`,
    });
    res.json({ moments });
  } catch (err) {
    console.error('Refind error:', err);
    res.status(500).json({ error: err.message || 'Could not find different moments.' });
  }
});

// POST /api/jobs/:id/generate - generate selected clips
router.post('/:id/generate', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== JOB_STATUS.READY && job.status !== JOB_STATUS.COMPLETE) {
    return res.status(400).json({ error: 'Job not ready for clip generation' });
  }

  const { selectedMoments, momentOverrides = {}, layout } = req.body;
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

  // layout applies to every clip in this batch (ffmpeg fills in any defaults).
  generateClips(req.params.id, job.inputFile, momentsToGenerate, job.transcript, layout);
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

// How many clips to render at the same time. More is faster but uses more CPU.
const MAX_CONCURRENT_CLIPS = 3;

async function generateClips(jobId, inputFile, moments, transcript, layout) {
  const outputDir = path.join(__dirname, '../outputs', jobId);

  // Remove clips from any previous run first, so a remake never leaves stale
  // files behind that would end up in the downloaded zip.
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const total = moments.length;
  const clips = new Array(total); // keep results in the original moment order
  let completed = 0;
  let nextIndex = 0;

  // Each worker pulls the next moment until there are none left. Up to
  // MAX_CONCURRENT_CLIPS workers run at once.
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= total) return;
      const moment = moments[i];
      try {
        const outputPath = path.join(outputDir, `clip-${i + 1}-${moment.id.slice(0, 6)}.mp4`);
        await generateClip({
          inputFile,
          outputPath,
          startTime: moment.startTime,
          endTime: moment.endTime,
          transcript,
          momentId: moment.id,
          layout,
        });
        clips[i] = { momentId: moment.id, file: path.basename(outputPath), status: 'done' };
      } catch (err) {
        console.error(`Clip ${i + 1} error:`, err);
        clips[i] = { momentId: moment.id, status: 'error', error: err.message };
      }
      completed++;
      updateJob(jobId, {
        progress: Math.round((completed / total) * 100),
        statusMessage: `Making clips... ${completed} of ${total} done`,
      });
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_CLIPS, total);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  updateJob(jobId, {
    status: JOB_STATUS.COMPLETE,
    clips,
    progress: 100,
    statusMessage: `${clips.filter(c => c.status === 'done').length} clips ready to download!`,
  });
}

module.exports = router;