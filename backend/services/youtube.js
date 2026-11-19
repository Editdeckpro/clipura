const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const YTDlpWrap = require('yt-dlp-wrap').default;

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);

const BIN_DIR = path.join(__dirname, '..', 'bin');
const BINARY = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

// ---- Settings you can tweak -------------------------------------------------
// When a link is a stream that is live right now, grab this many minutes
// counting back from the present. YouTube keeps about 60 minutes available.
const LIVE_MINUTES = 10;
const LIVE_MAX_MINUTES = 60;
// Picture quality used for live streams. 720 is a good balance of speed and quality.
const LIVE_MAX_HEIGHT = 720;
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

  const live = await checkLive(yt, url);
  if (live.isLive) {
    const minutes = clampMinutes(options.liveMinutes || LIVE_MINUTES);
    console.log(`[youtube] Live stream detected - grabbing the last ${minutes} minutes`);
    onStatus(`Grabbing the last ${minutes} minutes of the live stream`);
    return downloadLive(yt, url, outputPath, minutes, live.segmentSeconds, onProgress);
  }

  onStatus('Downloading the video');
  return downloadFinished(yt, url, outputPath, onProgress);
}

// ---- Live streams -----------------------------------------------------------

// Asks yt-dlp whether the link is live, and how long each piece of the stream is.
async function checkLive(yt, url) {
  try {
    const out = await yt.execPromise([
      url,
      ...JS_RUNTIME_ARGS,
      '--format', `bv*[height<=${LIVE_MAX_HEIGHT}]/b`,
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

async function downloadLive(yt, url, outputPath, minutes, segmentSeconds = 5, onProgress = () => {}) {
  const seconds = minutes * 60;
  const segmentsBack = Math.ceil(seconds / segmentSeconds) + 2;

  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  const rawPath = path.join(dir, `${base}.live.mp4`);

  const args = [
    url,
    ...JS_RUNTIME_ARGS,
    '--format', `bv*[height<=${LIVE_MAX_HEIGHT}]+ba/b`,
    '--downloader', 'ffmpeg',
    // Start this many pieces back from the present...
    '--downloader-args', `ffmpeg_i:-live_start_index -${segmentsBack}`,
    // ...and stop once we have the minutes we asked for.
    '--downloader-args', `ffmpeg_o:-t ${seconds}`,
    '--output', rawPath,
    '--no-part',
    '--no-playlist',
    '--no-warnings',
  ];

  // The ffmpeg downloader does not report a percentage, so track real progress by
  // watching the recording file grow. We compare against a rough expected size
  // (about 12 MB per minute at 720p) and never let it reach 100% until it is done.
  const expectedBytes = minutes * 12 * 1024 * 1024;
  const poll = setInterval(() => {
    try {
      const bytes = fs.statSync(rawPath).size;
      onProgress(Math.min(0.95, bytes / expectedBytes));
    } catch (_) { /* file not created yet */ }
  }, 600);

  try {
    await run(yt, args);
    if (!fs.existsSync(rawPath)) throw new Error('Live download finished but no file was written');

    clearInterval(poll);
    onProgress(0.97);

    // The raw live recording is in a streaming format whose clock starts hours in.
    // Repackage it (no re-encoding, takes seconds) so it behaves like a normal MP4.
    await repackage(rawPath, outputPath);
    onProgress(1);
    return outputPath;
  } catch (err) {
    throw new Error(`Live stream download failed: ${err.message}`);
  } finally {
    clearInterval(poll);
    fs.unlink(rawPath, () => {});
  }
}

function repackage(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(['-c copy', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', err => reject(new Error(`Could not repackage live recording: ${err.message}`)))
      .run();
  });
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