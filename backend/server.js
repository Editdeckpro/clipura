require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const uploadRoutes = require('./routes/upload');
const jobRoutes = require('./routes/jobs');
const waitlistRoutes = require('./routes/waitlist');
const { requireAccess } = require('./utils/access');
const { UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR } = require('./config/paths');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Ensure required directories exist ──────────────────────────────────────────
[UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

// ── CORS ────────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin SSR)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    // Allow any Vercel deployment of this site (the demo frontend lives there,
    // and its subdomain can change). Processing is still gated by the access code.
    try { if (new URL(origin).hostname.endsWith('.vercel.app')) return cb(null, true); } catch (_) {}
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Body parsers ───────────────────────────────────────────────────────────────
const BODY_LIMIT = process.env.BODY_SIZE_LIMIT || '500mb';
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// ── Rate limiting ──────────────────────────────────────────────────────────────
// Generous limits — this is a professional tool, not a public API
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,                   // 20 uploads per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads from this IP. Please try again later.' },
  skip: () => !IS_PROD,      // disabled in development
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !IS_PROD,
});

app.use('/api/', apiLimiter);
app.use('/api/upload', uploadLimiter);

// ── Static: serve outputs ──────────────────────────────────────────────────────
app.use('/outputs', express.static(OUTPUTS_DIR));

// ── Routes ─────────────────────────────────────────────────────────────────────
// Public config so the frontend knows whether to show the access-code gate, and
// can validate a code the visitor typed (sent as the x-access-code header).
app.get('/api/config', (req, res) => {
  const code = process.env.ACCESS_CODE;
  res.json({
    accessRequired: !!code,
    valid: code ? req.get('x-access-code') === code : true,
  });
});

// The access code gates the endpoints that cost money/CPU (starting a job).
// Read-only endpoints (serving clips, progress) stay open so the browser's
// <video> tag and progress stream work without custom headers.
app.use('/api/upload', requireAccess, uploadRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/waitlist', waitlistRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── 404 ────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = IS_PROD && status === 500
    ? 'An unexpected error occurred. Please try again.'
    : err.message;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: message });
});

// ── File cleanup ───────────────────────────────────────────────────────────────
// Finished clips (outputs) are kept for 7 days so they stay playable in My Clips.
// Source uploads are large and only needed while a video is being processed, so
// they are cleared sooner to save disk.
const HOUR_MS = 60 * 60 * 1000;
const CLIP_RETENTION_MS = 7 * 24 * HOUR_MS; // 7 days
const UPLOAD_RETENTION_MS = 4 * HOUR_MS;    // 4 hours

function cleanOldFiles(dir, maxAgeMs) {
  const cutoff = Date.now() - maxAgeMs;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const age = fs.statSync(full).mtimeMs;
      if (age < cutoff) {
        entry.isDirectory()
          ? fs.rmSync(full, { recursive: true, force: true })
          : fs.unlinkSync(full);
      }
    }
  } catch (_) {}
}

setInterval(() => {
  cleanOldFiles(UPLOADS_DIR, UPLOAD_RETENTION_MS);
  cleanOldFiles(TEMP_DIR, UPLOAD_RETENTION_MS);
  cleanOldFiles(OUTPUTS_DIR, CLIP_RETENTION_MS);
}, HOUR_MS).unref();

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Clip Factory backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
