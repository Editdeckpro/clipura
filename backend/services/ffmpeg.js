const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

// ---- Settings you can tweak -------------------------------------------------
// Vertical (9:16) canvas used by Fill, Fit and Face cam split.
const OUT_W = 1080;
const OUT_H = 1920;
// Wide (16:9) canvas used by Original wide.
const WIDE_W = 1920;
const WIDE_H = 1080;

// How much of the picture's width to keep in Fill. 1 = a square cut from the
// middle, which fills a bit over half of the tall screen.
const FOREGROUND_ASPECT = 1;

// Clips shorter than this get extended at the end so nothing comes out tiny.
const MIN_CLIP_SECONDS = 20;

// Caption look. FontSize 12 is about half the old size.
const CAPTION_FONT_SIZE = 12;
const CAPTION_MARGIN_BOTTOM = 50; // higher number = captions sit higher up
const WORDS_PER_CAPTION = 3;

// Face cam split: how big the face cam corner is, as a fraction of the source.
const FACE_CAM_SIZES = { small: 0.25, medium: 0.34, large: 0.5 };
const FACE_CAM_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const LAYOUT_TYPES = ['fill', 'fit', 'split', 'wide'];
// -----------------------------------------------------------------------------

// Fill in defaults for whatever the caller left out.
function normalizeLayout(layout = {}) {
  return {
    type: LAYOUT_TYPES.includes(layout.type) ? layout.type : 'fill',
    captions: layout.captions !== false, // default on
    faceCamCorner: FACE_CAM_CORNERS.includes(layout.faceCamCorner) ? layout.faceCamCorner : 'top-right',
    faceCamSize: FACE_CAM_SIZES[layout.faceCamSize] ? layout.faceCamSize : 'medium',
  };
}

async function generateClip({ inputFile, outputPath, startTime, endTime, transcript, momentId, layout }) {
  const start = Math.max(0, Number(startTime) || 0);
  let end = Number(endTime) || start + MIN_CLIP_SECONDS;
  if (end - start < MIN_CLIP_SECONDS) end = start + MIN_CLIP_SECONDS;
  const duration = end - start;

  const opts = normalizeLayout(layout);
  const srtPath = outputPath.replace('.mp4', '.srt');

  // Only build captions if the user kept them on.
  if (opts.captions) {
    if (transcript?.words?.length > 0) {
      generateSRT(transcript.words, start, end, srtPath);
    } else if (transcript?.segments?.length > 0) {
      generateSRTFromSegments(transcript.segments, start, end, srtPath);
    }
  }

  const hasSubs = opts.captions && fs.existsSync(srtPath);
  const hasAudio = await probeHasAudio(inputFile);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputFile)
      .setStartTime(start)
      .setDuration(duration)
      .outputOptions([
        '-filter_complex', buildFilterGraph(opts, hasSubs, srtPath, hasAudio),
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

// Builds the full filter graph for the chosen layout. Every layout ends in a
// [vbase] video label; captions and loudness are then added on top.
function buildFilterGraph(opts, hasSubs, srtPath, hasAudio) {
  const segments = [];
  let caption; // { alignment, marginV } - where to place captions for this layout

  if (opts.type === 'wide') {
    // Original wide: keep 16:9, just fit onto a clean 1920x1080 frame.
    segments.push(
      `[0:v]scale=${WIDE_W}:${WIDE_H}:force_original_aspect_ratio=decrease,` +
      `pad=${WIDE_W}:${WIDE_H}:(ow-iw)/2:(oh-ih)/2,setsar=1[vbase]`
    );
    caption = { alignment: 2, marginV: 30 }; // near the bottom
  } else if (opts.type === 'split') {
    // Face cam split: face cam cropped to the top half, full frame on the bottom.
    const f = FACE_CAM_SIZES[opts.faceCamSize];
    const w = `iw*${f}`;
    const h = `ih*${f}`;
    const right = `iw-iw*${f}`;
    const bottom = `ih-ih*${f}`;
    const pos = {
      'top-left': `0:0`,
      'top-right': `${right}:0`,
      'bottom-left': `0:${bottom}`,
      'bottom-right': `${right}:${bottom}`,
    }[opts.faceCamCorner];
    const halfH = OUT_H / 2; // 960

    segments.push('[0:v]split=2[top][bot]');
    segments.push(
      `[top]crop='${w}':'${h}':'${pos.split(':')[0]}':'${pos.split(':')[1]}',` +
      `scale=${OUT_W}:${halfH}:force_original_aspect_ratio=increase,crop=${OUT_W}:${halfH},setsar=1[vtop]`
    );
    segments.push(
      `[bot]scale=${OUT_W}:${halfH}:force_original_aspect_ratio=increase,crop=${OUT_W}:${halfH},setsar=1[vbot]`
    );
    segments.push('[vtop][vbot]vstack=inputs=2[vbase]');
    caption = { alignment: 5, marginV: 0 }; // centred = right between the two panels
  } else {
    // Fill (default) and Fit both sit on a blurred, darkened background.
    segments.push('[0:v]split=2[bgsrc][fgsrc]');
    segments.push(
      '[bgsrc]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,' +
      `boxblur=6:2,scale=${OUT_W}:${OUT_H},eq=brightness=-0.12[bg]`
    );
    if (opts.type === 'fit') {
      // Fit: whole frame visible, scaled to the width, nothing cropped.
      segments.push(
        `[fgsrc]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg]`
      );
    } else {
      // Fill: a square cut from the middle.
      segments.push(
        `[fgsrc]crop='min(iw,ih*${FOREGROUND_ASPECT})':ih,` +
        `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg]`
      );
    }
    segments.push('[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[vbase]');
    caption = { alignment: 2, marginV: CAPTION_MARGIN_BOTTOM }; // near the bottom
  }

  // Captions on top of the layout, placed where this layout wants them.
  if (hasSubs) {
    const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const style =
      `FontName=Arial,FontSize=${CAPTION_FONT_SIZE},Bold=1,` +
      'PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=1.5,Shadow=0,' +
      `Alignment=${caption.alignment},MarginV=${caption.marginV}`;
    segments.push(`[vbase]subtitles='${escapedSrt}':force_style='${style}'[v]`);
  } else {
    segments.push('[vbase]null[v]');
  }

  // Normalise loudness to about -14 LUFS so clips are a consistent volume.
  if (hasAudio) {
    segments.push('[0:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]');
  }

  return segments.join(';');
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