const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WHISPER_LIMIT_BYTES = 24 * 1024 * 1024; // 24 MB — stay under the 25 MB API limit
const CHUNK_DURATION_SECS = 600; // 10-minute chunks; adjust down if files are dense

let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

function ffmpeg() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function getFileSizeBytes(filePath) {
  return fs.statSync(filePath).size;
}

function getDurationSecs(filePath) {
  // ffmpeg -i with no output always exits non-zero — we read duration from stderr via the thrown error
  let stderr = '';
  try {
    execSync(`"${ffmpeg()}" -i "${filePath}"`, { stdio: 'pipe' });
  } catch (err) {
    stderr = (err.stderr || '').toString();
  }
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Could not read duration from: ${filePath}`);
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
}

function extractAudio(inputPath, outputPath) {
  execSync(
    `"${ffmpeg()}" -i "${inputPath}" -vn -acodec libmp3lame -q:a 4 -y "${outputPath}"`,
    { stdio: 'pipe' }
  );
}

function extractChunk(inputPath, outputPath, startSec, durationSec) {
  execSync(
    `"${ffmpeg()}" -ss ${startSec} -t ${durationSec} -i "${inputPath}" -vn -acodec libmp3lame -q:a 4 -y "${outputPath}"`,
    { stdio: 'pipe' }
  );
}

async function transcribeFile(audioPath) {
  const client = getClient();
  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment'],
  });
  return response;
}

// Merge multiple Whisper responses, offsetting timestamps by chunkOffset seconds
function mergeResponses(responses, chunkOffsets) {
  const allSegments = [];
  const allWords = [];
  const textParts = [];

  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    const offset = chunkOffsets[i];

    textParts.push(r.text.trim());

    for (const seg of r.segments || []) {
      allSegments.push({ ...seg, start: seg.start + offset, end: seg.end + offset });
    }
    for (const w of r.words || []) {
      allWords.push({ ...w, start: w.start + offset, end: w.end + offset });
    }
  }

  const last = responses[responses.length - 1];
  return {
    text: textParts.join(' '),
    segments: allSegments,
    words: allWords,
    language: responses[0]?.language,
    duration: chunkOffsets[responses.length - 1] + (last?.duration ?? 0),
  };
}

async function transcribeAudio(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const audioFormats = ['.mp3', '.m4a', '.wav', '.webm', '.ogg'];

  // Extract audio from video files first
  let audioPath = filePath;
  let tempAudio = null;
  if (!audioFormats.includes(ext)) {
    tempAudio = filePath.replace(/\.[^.]+$/, `_audio_${Date.now()}.mp3`);
    extractAudio(filePath, tempAudio);
    audioPath = tempAudio;
  }

  try {
    // Small enough to send directly — no chunking needed
    if (getFileSizeBytes(audioPath) <= WHISPER_LIMIT_BYTES) {
      const response = await transcribeFile(audioPath);
      return {
        text: response.text,
        segments: response.segments || [],
        words: response.words || [],
        language: response.language,
        duration: response.duration,
      };
    }

    // Large file — split into timed chunks, transcribe in parallel, merge
    const totalDuration = getDurationSecs(audioPath);
    const chunks = [];
    for (let start = 0; start < totalDuration; start += CHUNK_DURATION_SECS) {
      chunks.push({ start, duration: Math.min(CHUNK_DURATION_SECS, totalDuration - start) });
    }

    const chunkPaths = chunks.map((_, i) =>
      audioPath.replace(/\.[^.]+$/, `_chunk${i}_${Date.now()}.mp3`)
    );

    try {
      // Extract all chunks
      for (let i = 0; i < chunks.length; i++) {
        extractChunk(audioPath, chunkPaths[i], chunks[i].start, chunks[i].duration);
      }

      // Transcribe all chunks in parallel
      const responses = await Promise.all(chunkPaths.map(p => transcribeFile(p)));
      return mergeResponses(responses, chunks.map(c => c.start));
    } finally {
      for (const p of chunkPaths) {
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
      }
    }
  } finally {
    if (tempAudio && fs.existsSync(tempAudio)) {
      try { fs.unlinkSync(tempAudio); } catch (_) {}
    }
  }
}

module.exports = { transcribeAudio };
