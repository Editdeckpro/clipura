const { v4: uuidv4 } = require('uuid');

// In-memory job store (use Redis + Bull in production at scale)
const jobs = new Map();

const JOB_STATUS = {
  QUEUED: 'queued',
  DOWNLOADING: 'downloading',
  TRANSCRIBING: 'transcribing',
  ANALYZING: 'analyzing',
  READY: 'ready',
  GENERATING: 'generating',
  COMPLETE: 'complete',
  ERROR: 'error',
};

const JOB_TTL_MS = 2 * 60 * 60 * 1000; // keep jobs in memory for 2 hours

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
  return updated;
}

function deleteJob(id) {
  jobs.delete(id);
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

// Purge jobs older than JOB_TTL_MS. Runs every 30 minutes.
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs.entries()) {
    if (new Date(job.updatedAt).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}, 30 * 60 * 1000).unref(); // .unref() so this timer doesn't block process exit

module.exports = {
  createJob, getJob, updateJob, deleteJob, JOB_STATUS,
  createAbort, abortJob, clearAbort,
};
