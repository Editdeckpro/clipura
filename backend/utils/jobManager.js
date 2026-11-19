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

// Purge jobs older than JOB_TTL_MS. Runs every 30 minutes.
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs.entries()) {
    if (new Date(job.updatedAt).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}, 30 * 60 * 1000).unref(); // .unref() so this timer doesn't block process exit

module.exports = { createJob, getJob, updateJob, deleteJob, JOB_STATUS };
