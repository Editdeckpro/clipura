const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

// ---- Settings you can tweak -------------------------------------------------
const OUT_W = 1080;
const OUT_H = 1920;

// How much of the picture's width to keep. 1 = a square cut from the middle,
// which fills a bit over half of the tall screen. 4/3 keeps more of the sides
// (smaller picture); 4/5 zooms in further (bigger picture, more cut off).
const FOREGROUND_ASPECT = 1;

// Clips shorter than this get extended at the end so nothing comes out tiny.
const MIN_CLIP_SECONDS = 20;

// Caption look. FontSize 12 is about half the old size.
const CAPTION_FONT_SIZE = 12;
const CAPTION_MARGIN_BOTTOM = 50; // higher number = captions sit higher up
const WORDS_PER_CAPTION = 3;
// -----------------------------------------------------------------------------

async function generateClip({ inputFile, outputPath, startTime, endTime, transcript, momentId }) {
  const start = Math.max(0, Number(startTime) || 0);
  let end = Number(endTime) || start + MIN_CLIP_SECONDS;
  if (end - start < MIN_CLIP_SECONDS) end = start + MIN_CLIP_SECONDS;
  const duration = end - start;

  const srtPath = outputPath.replace('.mp4', '.srt');

  // Generate SRT subtitle file for this clip's time range
  if (transcript?.words?.length > 0) {
    generateSRT(transcript.words, start, end, srtPath);
  } else if (transcript?.segments?.length > 0) {
    generateSRTFromSegments(transcript.segments, start, end, srtPath);
  }

  const hasSubs = fs.existsSync(srtPath);
  const hasAudio = await probeHasAudio(inputFile);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputFile)
      .setStartTime(start)
      .setDuration(duration)
      .outputOptions([
        '-filter_complex', buildFilterGraph(hasSubs, srtPath, hasAudio),
        '-map', '[v]',
        ...(hasAudio ? ['-map', '[a]'] : []),
        '-c:v libx264',
        '-preset veryfast',
        '-crf 22',
        '-pix_fmt yuv420p',
        ...(hasAudio ? ['-c:a aac', '-b:a 160k'] : ['-an']),
        '-movflags +faststart',
        '-r 30',
      ])
      .output(outputPath);

    cmd
      .on('end', () => {
        if (hasSubs) fs.unlink(srtPath, () => {});
        resolve(outputPath);
      })
      .on('error', (err) => {
        if (hasSubs) fs.unlink(srtPath, () => {});
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      .run();
  });
}

// True if the input has at least one audio stream.
function probeHasAudio(inputFile) {
  return new Promise(resolve => {
    ffmpeg.ffprobe(inputFile, (err, data) => {
      if (err || !data) return resolve(false);
      resolve((data.streams || []).some(s => s.codec_type === 'audio'));
    });
  });
}

// Builds the 9:16 picture: a blurred, darkened copy of the video fills the
// whole frame, and the real video sits on top, enlarged, in the middle.
// When the video has sound, loudnorm evens the volume to a consistent level
// so every clip plays back at a similar loudness.
function buildFilterGraph(hasSubs, srtPath, hasAudio) {
  // The background is blurred at a small size and then enlarged, which is much
  // faster than blurring at full size and looks the same.
  const background =
    '[0:v]split=2[bgsrc][fgsrc];' +
    '[bgsrc]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,' +
    `boxblur=6:2,scale=${OUT_W}:${OUT_H},eq=brightness=-0.12[bg]`;

  const foreground =
    `[fgsrc]crop='min(iw,ih*${FOREGROUND_ASPECT})':ih,` +
    `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg]`;

  let combined = '[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1';

  if (hasSubs) {
    // Escape Windows path separators for FFmpeg filter
    const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const style =
      `FontName=Arial,FontSize=${CAPTION_FONT_SIZE},Bold=1,` +
      'PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=1.5,Shadow=0,' +
      `Alignment=2,MarginV=${CAPTION_MARGIN_BOTTOM}`;
    combined += `,subtitles='${escapedSrt}':force_style='${style}'`;
  }

  let graph = `${background};${foreground};${combined}[v]`;

  // Normalise loudness to about -14 LUFS (a common target for social video) so
  // clips are not wildly louder or quieter than one another.
  if (hasAudio) {
    graph += ';[0:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]';
  }

  return graph;
}

function generateSRT(words, clipStart, clipEnd, outputPath) {
  const clipWords = words.filter(w => w.start >= clipStart && w.end <= clipEnd + 0.5);
  if (clipWords.length === 0) return;

  const lines = [];
  let index = 1;

  for (let i = 0; i < clipWords.length; i += WORDS_PER_CAPTION) {
    const chunk = clipWords.slice(i, i + WORDS_PER_CAPTION);
    const start = chunk[0].start - clipStart;
    const end = chunk[chunk.length - 1].end - clipStart;
    const text = chunk.map(w => w.word).join(' ').trim();

    lines.push(`${index}`);
    lines.push(`${formatSRTTime(Math.max(0, start))} --> ${formatSRTTime(end)}`);
    lines.push(text);
    lines.push('');
    index++;
  }

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
}

function generateSRTFromSegments(segments, clipStart, clipEnd, outputPath) {
  const clipSegs = segments.filter(s => s.start >= clipStart - 1 && s.end <= clipEnd + 1);
  if (clipSegs.length === 0) return;

  const lines = [];
  clipSegs.forEach((seg, i) => {
    const start = Math.max(0, seg.start - clipStart);
    const end = Math.max(0.1, seg.end - clipStart);
    lines.push(`${i + 1}`);
    lines.push(`${formatSRTTime(start)} --> ${formatSRTTime(end)}`);
    lines.push(seg.text.trim());
    lines.push('');
  });

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
}

function formatSRTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function pad(n, len = 2) {
  return String(Math.floor(n)).padStart(len, '0');
}

module.exports = { generateClip };