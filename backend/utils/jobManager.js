const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// In-memory job store, backed by one JSON file per job on disk so a restart
// does not lose finished moment lists or finished clips.
const jobs = new Map();

const DATA_DIR = path.join(require('../config/paths').DATA_DIR, 'jobs');
fs.mkdirSync(DATA_DIR, { recursive: true });

const JOB_STATUS = {
  QUEUED: 'queued',
  DOWNLOADING: 'downloading',
  TRANSCRIBING: 'transcribing',
  ANALYZING: 'analyzing',
  READY: 'ready',
  GENERATING: 'generating',
  COMPLETE: 'complete',
  ERROR: 'error',
  INTERRUPTED: 'interrupted', // was mid-flight when the server stopped
};

// Statuses that mean work was actively running. If the server restarts while a
// job is in one of these, that work is gone and the job cannot resume.
const IN_FLIGHT = new Set([
  JOB_STATUS.QUEUED, JOB_STATUS.DOWNLOADING, JOB_STATUS.TRANSCRIBING,
  JOB_STATUS.ANALYZING, JOB_STATUS.GENERATING,
]);

// Keep jobs (and their files) for 7 days, matching how long clips are kept.
const JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function jobFile(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

// Write atomically (temp file + rename) so a crash never leaves half a file.
function persist(job) {
  const target = jobFile(job.id);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFile(tmp, JSON.stringify(job), err => {
    if (err) return; // best effort - memory is still the source of truth while running
    fs.rename(tmp, target, () => {});
  });
}

function removeFile(id) {
  fs.unlink(jobFile(id), () => {});
}

function createJob(data = {}) {
  const id = uuidv4();
  const job = {
    id,
    status: JOB_STATUS.QUEUED,
    progress: 0,
    statusMessage: 'Job queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    inputFile: null,
    inputType: null,
    transcript: null,
    moments: null,
    clips: null,
    error: null,
    ...data,
  };
  jobs.set(id, job);
  persist(job);
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) return null;
  const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
  jobs.set(id, updated);
  persist(updated);
  return updated;
}

function deleteJob(id) {
  jobs.delete(id);
  removeFile(id);
}

// Load saved jobs back into memory on startup. Anything that was mid-flight when
// we stopped is marked interrupted so the page can say so instead of hanging.
function loadJobs() {
  let files;
  try { files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')); } catch { return; }
  const cutoff = Date.now() - JOB_TTL_MS;
  let loaded = 0, interrupted = 0;

  for (const file of files) {
    const full = path.join(DATA_DIR, file);
    try {
      const job = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (!job || !job.id) { fs.unlinkSync(full); continue; }
      if (new Date(job.updatedAt).getTime() < cutoff) { fs.unlinkSync(full); continue; }

      if (IN_FLIGHT.has(job.status)) {
        job.status = JOB_STATUS.INTERRUPTED;
        job.error = 'This was interrupted. Start it again.';
        job.statusMessage = 'This was interrupted. Start it again.';
        interrupted++;
        persist(job);
      }
      jobs.set(job.id, job);
      loaded++;
    } catch (_) {
      try { fs.unlinkSync(full); } catch (_) {} // drop unreadable/corrupt files
    }
  }
  console.log(`[jobs] loaded ${loaded} saved job(s)${interrupted ? `, ${interrupted} marked interrupted` : ''}`);
}

// ── Cancellation ────────────────────────────────────────────────────────────
// A job can register an AbortController so an in-flight recording/download can
// be stopped (e.g. from the Cancel button). Kept out of the job object so it is
// never serialized to the client.
const abortControllers = new Map();

function createAbort(jobId) {
  const controller = new AbortController();
  abortControllers.set(jobId, controller);
  return controller;
}

function abortJob(jobId) {
  const controller = abortControllers.get(jobId);
  if (!controller) return false;
  controller.abort();
  return true;
}

function clearAbort(jobId) {
  abortControllers.delete(jobId);
}

// Purge jobs (and their saved files) older than JOB_TTL_MS. Runs every 30 min.
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs.entries()) {
    if (new Date(job.updatedAt).getTime() < cutoff) {
      jobs.delete(id);
      removeFile(id);
    }
  }
}, 30 * 60 * 1000).unref(); // .unref() so this timer doesn't block process exit

// Bring saved jobs back as soon as this module is first required (startup).
loadJobs();

module.exports = {
  createJob, getJob, updateJob, deleteJob, JOB_STATUS,
  createAbort, abortJob, clearAbort,
};
