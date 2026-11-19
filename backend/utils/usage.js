const fs = require('fs');
const path = require('path');

// Caps how many minutes of source video the whole demo will process per day, so
// a busy day (or abuse) can never run up a surprise bill. Change the limit with
// the DAILY_PROCESSING_MINUTES env var. Counts reset at midnight UTC and are
// saved to disk so a restart does not forget the day's usage.
const { DATA_DIR } = require('../config/paths');
const FILE = path.join(DATA_DIR, 'usage.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function dailyCap() {
  const n = parseInt(process.env.DAILY_PROCESSING_MINUTES, 10);
  return Number.isFinite(n) && n > 0 ? n : 180; // default 3 hours of source video/day
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (data && data.date === today()) return data;
  } catch (_) {}
  return { date: today(), minutes: 0 };
}

function save(state) {
  try { fs.writeFileSync(FILE, JSON.stringify(state)); } catch (_) {}
}

// Would processing `minutes` more push us over today's cap?
function wouldExceed(minutes) {
  const state = load();
  return state.minutes + Math.max(0, minutes) > dailyCap();
}

function remainingMinutes() {
  return Math.max(0, dailyCap() - load().minutes);
}

function addMinutes(minutes) {
  const state = load();
  state.minutes += Math.max(0, minutes);
  save(state);
  return state.minutes;
}

module.exports = { wouldExceed, remainingMinutes, addMinutes, dailyCap };
