const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const YTDlpWrap = require('yt-dlp-wrap').default;

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);

const { BIN_DIR } = require('../config/paths');
const BINARY = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

// ---- Settings you can tweak -------------------------------------------------
// When a link is a stream that is live right now, grab this many minutes.
// YouTube can serve the last ~60 minutes; Twitch and Kick cannot reliably go
// back, so for those we record the next N minutes forward instead.
const LIVE_MINUTES = 10;
const LIVE_MAX_MINUTES = 60;
// Picture quality cap for live streams. 720 is a good balance of speed/quality.
// The selector caps combined (single video+audio) formats too, not just split
// ones, so a platform that only serves a 1080p combined stream is still capped.
const LIVE_MAX_HEIGHT = 720;
const LIVE_FORMAT =
  `bv*[height<=${LIVE_MAX_HEIGHT}]+ba/b[height<=${LIVE_MAX_HEIGHT}]/b`;

// Safety limits so a live recording can never run away or freeze forever.
const LIVE_GRACE_MS = 2 * 60 * 1000;   // stop if it runs 2 min past what was asked
const LIVE_STALL_MS = 60 * 1000;       // stop if no new footage arrives for 60s
const MIN_USABLE_BYTES = 2 * 1024 * 1024; // below this we treat it as "nothing recorded"
// -----------------------------------------------------------------------------

// Newer yt-dlp versions need a JavaScript engine to read YouTube. Node is already installed.
const JS_RUNTIME_ARGS = ['--js-runtimes', 'node'];

let _ytDlp = null;

async function getClient() {
  if (_ytDlp) return _ytDlp;
  fs.mkdirSync(BIN_DIR, { recursive: true });
  if (!fs.existsSync(BINARY)) {
    console.log('[youtube] Downloading yt-dlp binary...');
    await YTDlpWrap.downloadFromGithub(BINARY);
    console.log('[youtube] yt-dlp binary ready');
  }
  _ytDlp = new YTDlpWrap(BINARY);
  return _ytDlp;
}

/**
 * Download a YouTube video as MP4 to outputPath.
 * If the link is a stream that is live right now, only the most recent
 * minutes are downloaded (see LIVE_MINUTES above).
 */
async function downloadYouTube(url, outputPath, options = {}) {
  const yt = await getClient();
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  const platform = detectPlatform(url);

  const live = await checkLive(yt, url);
  if (live.isLive) {
    const minutes = clampMinutes(options.liveMinutes || LIVE_MINUTES);

    // Only YouTube reliably keeps past footage of a live stream available, so
    // only YouTube can "go back". Twitch and Kick drop old pieces quickly, so
    // for those we honestly record the next N minutes forward from now.
    const canGoBack = platform === 'youtube';
    console.log(`[youtube] Live ${platform} stream - ${canGoBack ? `grabbing the last ${minutes}` : `recording the next ${minutes}`} minutes`);
    onStatus(canGoBack
      ? `Grabbing the last ${minutes} minutes of the live stream`
      : `Recording the next ${minutes} minutes of the live stream`);

    return downloadLive(url, outputPath, {
      minutes,
      segmentSeconds: live.segmentSeconds,
      onProgress,
      onStatus,
      canGoBack,
      signal: options.signal,
    });
  }

  onStatus('Downloading the video');
  return downloadFinished(yt, url, outputPath, onProgress);
}

// Which platform a link belongs to, from its hostname.
function detectPlatform(url) {
  try {
    const host = new URL(String(url).startsWith('http') ? url : `https://${url}`)
      .hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
    if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) return 'twitch';
    if (host === 'kick.com' || host.endsWith('.kick.com')) return 'kick';
  } catch (_) {}
  return 'other';
}

// ---- Live streams -----------------------------------------------------------

// Asks yt-dlp whether the link is live, and how long each piece of the stream is.
async function checkLive(yt, url) {
  try {
    const out = await yt.execPromise([
      url,
      ...JS_RUNTIME_ARGS,
      '--format', LIVE_FORMAT,
      '--print', 'live_status',
      '--print', 'urls',
      '--no-playlist',
      '--no-warnings',
    ]);
    const lines = String(out).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'is_live') return { isLive: false };

    const playlistUrl = lines.find(l => l.startsWith('http'));
    const segmentSeconds = await readSegmentSeconds(playlistUrl);
    return { isLive: true, segmentSeconds };
  } catch (err) {
    // If the check itself fails, treat the link as a normal video.
    return { isLive: false };
  }
}

// Live streams arrive in small pieces. This reads how many seconds each piece
// lasts so we know how many pieces equal the minutes we want.
async function readSegmentSeconds(playlistUrl) {
  const fallback = 5;
  if (!playlistUrl || typeof fetch !== 'function') return fallback;
  try {
    const res = await fetch(playlistUrl);
    const text = await res.text();
    const match = text.match(/#EXT-X-TARGETDURATION:(\d+(?:\.\d+)?)/);
    const seconds = match ? parseFloat(match[1]) : fallback;
    return seconds > 0 ? seconds : fallback;
  } catch (_) {
    return fallback;
  }
}

async function downloadLive(url, outputPath, opts) {
  const { minutes, segmentSeconds = 5, onProgress = () => {}, onStatus = () => {}, canGoBack, signal } = opts;
  const seconds = minutes * 60;

  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  // Record into an MPEG-TS file: it is the natural container for live HLS,
  // survives being cut off part-way, and stream-copies cleanly to MP4 after.
  const rawPath = path.join(dir, `${base}.live.ts`);

  const args = [
    url,
    ...JS_RUNTIME_ARGS,
    '--format', LIVE_FORMAT,
    '--downloader', 'ffmpeg',
    // Never let yt-dlp run its own post-processing fixup. On some platforms it
    // fails after a clean recording and throws the finished file away. We
    // repackage the recording ourselves below instead.
    '--fixup', 'never',
    // Ask ffmpeg to stop once it has the minutes we want. This is a best effort:
    // the hard limit below is what actually guarantees we stop.
    '--downloader-args', `ffmpeg_o:-t ${seconds}`,
    '--output', rawPath,
    '--no-part',
    '--no-playlist',
    '--no-warnings',
  ];

  // YouTube: step back from the present to capture the last N minutes.
  if (canGoBack) {
    const segmentsBack = Math.ceil(seconds / segmentSeconds) + 2;
    args.push('--downloader-args', `ffmpeg_i:-live_start_index -${segmentsBack}`);
  }

  const result = await recordLive({ args, rawPath, seconds, minutes, canGoBack, onProgress, onStatus, signal });

  // A real cancel means the user wants to stop entirely - do not carry on.
  if (result.reason === 'cancel') {
    fs.unlink(rawPath, () => {});
    const err = new Error('Recording cancelled');
    err.cancelled = true;
    throw err;
  }

  try {
    const bytes = fs.existsSync(rawPath) ? fs.statSync(rawPath).size : 0;
    if (bytes < MIN_USABLE_BYTES) {
      // Nothing (or almost nothing) was captured - surface the plain error.
      throw new Error(`live recording produced no usable file (reason: ${result.reason})`);
    }
    if (result.reason === 'timeout' || result.reason === 'stall') {
      console.warn(`[live] stopped early (${result.reason}) - keeping ${(bytes / 1024 / 1024).toFixed(1)}MB recorded so far`);
    }
    onProgress(0.97);
    onStatus('Getting the recording ready');
    await robustRepackage(rawPath, outputPath);
    onProgress(1);
    return outputPath;
  } finally {
    fs.unlink(rawPath, () => {});
  }
}

// Runs the yt-dlp live recording as a child we fully control, so we can show
// real progress and guarantee it stops. Resolves with { reason } where reason
// is 'complete' (yt-dlp finished), 'timeout' (ran past the limit), 'stall' (no
// new footage for 60s) or 'cancel' (user stopped it). Never hangs.
function recordLive({ args, rawPath, seconds, minutes, canGoBack, onProgress, onStatus, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(BINARY, args, { windowsHide: true });

    let reason = null;         // set once we decide to stop early
    let settled = false;
    const startedAt = Date.now();

    // Real recorded position. We read ffmpeg's "time=HH:MM:SS" when we can see
    // it, and fall back to counting the seconds during which the file is
    // actually growing - so progress only moves when real footage arrives.
    let ffmpegSec = 0;
    let lastFfmpegSec = 0;
    let activeSec = 0;
    let lastBytes = 0;
    let lastAdvanceAt = Date.now();

    const parseTime = chunk => {
      const m = String(chunk).match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g);
      if (!m) return;
      const last = m[m.length - 1].match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (last) ffmpegSec = Math.max(ffmpegSec, (+last[1]) * 3600 + (+last[2]) * 60 + parseFloat(last[3]));
    };
    const stderr = [];
    child.stderr.on('data', d => { stderr.push(d.toString()); if (stderr.length > 200) stderr.shift(); parseTime(d); });
    child.stdout.on('data', parseTime);

    const stop = (why) => {
      if (reason) return;
      reason = why;
      killTree(child);
    };

    // Let the caller cancel from outside (the Cancel button).
    if (signal) {
      if (signal.aborted) stop('cancel');
      else signal.addEventListener('abort', () => stop('cancel'), { once: true });
    }

    const poll = setInterval(() => {
      let bytes = 0;
      try { bytes = fs.statSync(rawPath).size; } catch (_) {}
      const grew = bytes > lastBytes;
      if (grew) { lastBytes = bytes; activeSec += 1; }
      // "Advanced" means real new footage since the last check: the file grew,
      // or ffmpeg's reported time moved on. Comparing ffmpeg's time to its own
      // previous value (not to activeSec) is what makes a stall actually detectable.
      const ffmpegAdvanced = ffmpegSec > lastFfmpegSec;
      if (ffmpegAdvanced) lastFfmpegSec = ffmpegSec;
      if (grew || ffmpegAdvanced) lastAdvanceAt = Date.now();

      const recordedSec = Math.min(seconds, Math.max(ffmpegSec, activeSec));
      onProgress(Math.min(0.95, recordedSec / seconds));
      onStatus(canGoBack
        ? `Grabbing the last ${minutes} minutes of the live stream`
        : `Recording the live stream... about ${formatRemaining(seconds - recordedSec)} left`);

      // Hard limits.
      if (Date.now() - startedAt > seconds * 1000 + LIVE_GRACE_MS) stop('timeout');
      else if (Date.now() - lastAdvanceAt > LIVE_STALL_MS) stop('stall');
    }, 1000);

    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      resolve({ reason: reason || 'complete' });
    };

    child.on('error', err => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      // Keep the tail of yt-dlp's own output in the server log for diagnosis.
      if (stderr.length) console.error('[live] yt-dlp error output:\n' + stderr.join('').slice(-2000));
      reject(err);
    });
    child.on('close', () => {
      if (!reason && stderr.length) console.error('[live] yt-dlp finished; last output:\n' + stderr.join('').slice(-1500));
      finish();
    });
  });
}

// Kill the whole process tree. yt-dlp spawns ffmpeg as a child, so on Windows we
// use taskkill /T to take down both; elsewhere a SIGKILL to the group.
function killTree(child) {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
    } else {
      child.kill('SIGKILL');
    }
  } catch (_) {}
}

// Turn the raw live recording into a normal MP4, trying the cheapest, safest
// path first and degrading gracefully so a finished recording is never lost:
//   1. straight stream copy to MP4 (fast, no re-encode)
//   2. copy video, re-encode only the audio (handles odd audio framing)
//   3. last resort: use the raw recording as-is (ffmpeg can still read it)
async function robustRepackage(inputPath, outputPath) {
  try {
    await ffmpegRun(inputPath, outputPath, ['-c copy', '-movflags +faststart']);
    return;
  } catch (err) {
    console.error('[live] stream copy failed, re-encoding audio:', err.message);
  }
  try {
    await ffmpegRun(inputPath, outputPath, ['-c:v copy', '-c:a aac', '-b:a 160k', '-movflags +faststart']);
    return;
  } catch (err) {
    console.error('[live] audio re-encode failed, using raw recording as-is:', err.message);
  }
  fs.copyFileSync(inputPath, outputPath);
}

function ffmpegRun(inputPath, outputPath, outputOptions) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(outputOptions)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', err => reject(err))
      .run();
  });
}

// "4m 30s" / "45s" - a short, friendly countdown for the status message.
function formatRemaining(secondsLeft) {
  const s = Math.max(0, Math.round(secondsLeft));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function clampMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return LIVE_MINUTES;
  return Math.min(LIVE_MAX_MINUTES, Math.max(1, Math.round(n)));
}

// ---- Finished videos --------------------------------------------------------

// Tries progressively simpler format selectors so it never dead-ends.
async function downloadFinished(yt, url, outputPath, onProgress = () => {}) {
  // yt-dlp uses %(ext)s in output templates; we want a fixed path.
  // Use a temp template then rename to the exact outputPath.
  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  const template = path.join(dir, `${base}.%(ext)s`);

  const formatFallbacks = [
    'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
    'bestvideo+bestaudio/best',
    'best',
  ];

  let lastError;

  for (const fmt of formatFallbacks) {
    const args = [
      url,
      ...JS_RUNTIME_ARGS,
      '--output', template,
      '--format', fmt,
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
    ];

    try {
      await run(yt, args, onProgress);

      // Locate the file yt-dlp wrote (extension may vary)
      const written = fs.readdirSync(dir).find(f => f.startsWith(base + '.'));
      if (!written) throw new Error('yt-dlp finished but output file not found');

      const writtenPath = path.join(dir, written);
      if (writtenPath !== outputPath) fs.renameSync(writtenPath, outputPath);

      onProgress(1);
      return outputPath;
    } catch (err) {
      lastError = err;
      // Clean up any partial file before retrying
      try {
        const partial = fs.readdirSync(dir).find(f => f.startsWith(base + '.'));
        if (partial) fs.unlinkSync(path.join(dir, partial));
      } catch (_) {}
    }
  }

  throw new Error(`YouTube download failed: ${lastError?.message}`);
}

function run(yt, args, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const proc = yt.exec(args);
    const stderr = [];

    // yt-dlp reports a real download percentage for finished videos.
    proc.on('progress', p => {
      const pct = Number(p && p.percent);
      if (Number.isFinite(pct)) onProgress(Math.min(1, Math.max(0, pct / 100)));
    });
    proc.on('ytDlpEvent', (type, data) => {
      if (type === 'error') stderr.push(data);
    });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.join('\n') || `yt-dlp exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

module.exports = { downloadYouTube };