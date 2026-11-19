const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const YTDlpWrap = require('yt-dlp-wrap').default;

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);

const BIN_DIR = path.join(__dirname, '..', 'bin');
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

    return downloadLive(yt, url, outputPath, {
      minutes,
      segmentSeconds: live.segmentSeconds,
      onProgress,
      onStatus,
      canGoBack,
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

async function downloadLive(yt, url, outputPath, opts) {
  const { minutes, segmentSeconds = 5, onProgress = () => {}, onStatus = () => {}, canGoBack } = opts;
  const seconds = minutes * 60;

  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  // Record into an MPEG-TS file: it is the natural container for live HLS and
  // stream-copies cleanly to MP4 afterwards.
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
    // Stop once we have the minutes we asked for.
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

  const poll = canGoBack
    // Going back fills fast (faster than real time), so track the file growing.
    ? (() => {
        const expectedBytes = minutes * 12 * 1024 * 1024;
        return setInterval(() => {
          try { onProgress(Math.min(0.95, fs.statSync(rawPath).size / expectedBytes)); } catch (_) {}
        }, 600);
      })()
    // Recording forward happens in real time, so progress is just elapsed time,
    // and we can show how long is left.
    : (() => {
        const startedAt = Date.now();
        return setInterval(() => {
          const elapsed = (Date.now() - startedAt) / 1000;
          onProgress(Math.min(0.95, elapsed / seconds));
          onStatus(`Recording the live stream... about ${formatRemaining(seconds - elapsed)} left`);
        }, 1000);
      })();

  // Keep any recording even if yt-dlp exits non-zero (e.g. a late post-step):
  // we only fail if there is genuinely no usable file on disk.
  let runError = null;
  try {
    await run(yt, args);
  } catch (err) {
    runError = err;
  }
  clearInterval(poll);

  try {
    const haveFile = fs.existsSync(rawPath) && fs.statSync(rawPath).size > 64 * 1024;
    if (!haveFile) {
      throw new Error(runError ? runError.message : 'The live recording produced no file');
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