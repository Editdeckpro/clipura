const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'waitlist.jsonl');
fs.mkdirSync(DATA_DIR, { recursive: true });

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// POST /api/waitlist - collect an email for the "early list" (paid plans open soon).
// Body: { email, plan? }
router.post('/', (req, res) => {
  const { email, plan } = req.body || {};
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const entry = {
    email: String(email).trim().toLowerCase(),
    plan: typeof plan === 'string' ? plan : null,
    at: new Date().toISOString(),
  };
  try {
    fs.appendFileSync(FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('[waitlist] could not save entry:', err);
    return res.status(500).json({ error: 'Could not save your email. Please try again.' });
  }
  res.json({ ok: true });
});

module.exports = router;
