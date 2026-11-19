const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');

let client;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `You are an expert viral content strategist specializing in short-form video cut from podcasts, streams, and long-form videos.
Your job is to identify the most compelling, shareable moments that will perform well on TikTok, Instagram Reels, YouTube Shorts, and LinkedIn.

For each viral moment you identify, you must provide precise timing, a compelling hook, and a virality score.

WHAT MAKES A GREAT CLIP:
- A bold, surprising claim or counterintuitive insight
- A personal story with emotional resonance
- A tactical tip that delivers immediate value
- A strong opinion or contrarian viewpoint
- A relatable struggle or pain point with resolution
- A funny, hype, or shocking reaction
- A quotable, memorable line

WHAT TO SKIP (never return these as moments):
- Ads, sponsor reads, and anything reading out a promo code or discount link
- Channel intros and outros
- "Like and subscribe", "follow me", "hit the bell", and other calls to follow or subscribe
- Dead air, long silences, filler, and stretches where nothing much is said

QUALITY OVER QUANTITY:
Only return moments that are genuinely strong on their own. If just a few parts of the
video are good, return just those few - even one or two. Never pad the list with weak
moments to reach a number.

CLIP LENGTH: 30-90 seconds is ideal. Avoid clips over 2 minutes.
Each clip must start and end on a complete thought.

Report your picks with the report_moments tool.`;

// Forcing the answer through a tool guarantees we get structured data back,
// so there is no JSON text to parse and nothing to break.
const MOMENTS_TOOL = {
  name: 'report_moments',
  description: 'Report the viral moments found in the transcript.',
  input_schema: {
    type: 'object',
    properties: {
      moments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            hook: { type: 'string', description: 'Attention-grabbing opening line / caption hook for this clip' },
            summary: { type: 'string', description: '2-3 sentences on why this moment is viral and valuable' },
            startTime: { type: 'number', description: 'Clip start in seconds, matching the transcript timestamps' },
            endTime: { type: 'number', description: 'Clip end in seconds, matching the transcript timestamps' },
            viralScore: { type: 'number', description: '0-100 based on shareability, hook strength, and value' },
            viralReasons: { type: 'array', items: { type: 'string' } },
            platform: { type: 'array', items: { type: 'string' } },
            contentType: {
              type: 'string',
              enum: ['tactical_tip', 'personal_story', 'bold_claim', 'pain_point', 'case_study', 'mindset_shift', 'funny_moment', 'reaction'],
            },
            targetAudience: { type: 'string' },
            suggestedCaption: { type: 'string', description: 'Full suggested social caption with hashtags' },
          },
          required: ['hook', 'summary', 'startTime', 'endTime', 'viralScore'],
        },
      },
    },
    required: ['moments'],
  },
};

const MIN_TRANSCRIPT_CHARS = 200;

// options:
//   guidance - optional text describing what the user is looking for ("funny moments only")
//   avoid    - optional array of { startTime, endTime, hook } moments already shown, to skip
async function analyzeMoments(transcript, options = {}) {
  const claude = getClient();
  const { guidance, avoid } = options;

  // Timestamps are written in plain seconds so the model never has to convert them.
  const transcriptText = transcript.segments && transcript.segments.length
    ? transcript.segments.map(s => `[${Number(s.start).toFixed(1)}s-${Number(s.end).toFixed(1)}s] ${s.text}`).join('\n')
    : (transcript.text || '');

  if (transcriptText.trim().length < MIN_TRANSCRIPT_CHARS) {
    throw new Error('Not enough talking was found in this video to pick clips. Try a video with more speech.');
  }

  let prompt = `Analyze this transcript and identify the best viral moments for short-form clips - up to 6.
Return fewer if only a few are genuinely strong. Skip ads, sponsor reads, promo codes, intros,
outros, "like and subscribe" calls, and dead air.`;

  if (guidance && String(guidance).trim()) {
    prompt += `\n\nThe user is specifically looking for: "${String(guidance).trim()}".
Prioritise moments that match this. If little matches, return the closest moments you can find.`;
  }

  const avoidRanges = (Array.isArray(avoid) ? avoid : [])
    .filter(a => a && Number.isFinite(Number(a.startTime)) && Number.isFinite(Number(a.endTime)));
  if (avoidRanges.length) {
    const list = avoidRanges
      .map(a => `- ${Number(a.startTime).toFixed(1)}s to ${Number(a.endTime).toFixed(1)}s${a.hook ? ` ("${a.hook}")` : ''}`)
      .join('\n');
    prompt += `\n\nThese moments have already been shown. Do NOT return them again, and do not
pick moments that overlap these time ranges. Find different moments:\n${list}`;
  }

  prompt += `\n\nTRANSCRIPT:\n${transcriptText}\n\nUse the exact second values from the transcript for startTime and endTime.`;

  const request = {
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [MOMENTS_TOOL],
    tool_choice: { type: 'tool', name: 'report_moments' },
    messages: [{ role: 'user', content: prompt }],
  };

  // Try twice before giving up, and log what came back so failures can be diagnosed.
  let moments;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const message = await claude.messages.create(request);
    const toolUse = message.content.find(block => block.type === 'tool_use');
    const candidate = toolUse && toolUse.input && toolUse.input.moments;

    if (Array.isArray(candidate) && candidate.length > 0) {
      moments = candidate;
      break;
    }

    console.error(
      `Moments analysis attempt ${attempt} returned nothing usable (stop_reason: ${message.stop_reason}):`,
      JSON.stringify(message.content).slice(0, 2000)
    );
  }

  if (!moments) {
    throw new Error('Could not find clip-worthy moments in this video. Try again or use a different video.');
  }

  return moments
    .map(m => {
      const startTime = parseFloat(m.startTime) || 0;
      const endTime = parseFloat(m.endTime) || startTime + 60;
      const score = parseInt(m.viralScore, 10);
      return {
        ...m,
        id: uuidv4(),
        startTime,
        endTime,
        viralScore: Math.min(100, Math.max(0, Number.isNaN(score) ? 70 : score)),
        viralReasons: Array.isArray(m.viralReasons) ? m.viralReasons : [],
        platform: Array.isArray(m.platform) ? m.platform : [],
      };
    })
    .filter(m => m.endTime > m.startTime)
    // Drop anything that mostly repeats a moment we were told to avoid.
    .filter(m => !overlapsAny(m, avoidRanges))
    .sort((a, b) => b.viralScore - a.viralScore);
}

// True if moment m overlaps any avoid range by more than half of m's length.
function overlapsAny(m, ranges) {
  const mLen = m.endTime - m.startTime;
  if (mLen <= 0) return false;
  return ranges.some(r => {
    const overlap = Math.min(m.endTime, Number(r.endTime)) - Math.max(m.startTime, Number(r.startTime));
    return overlap > 0 && overlap > mLen * 0.5;
  });
}

module.exports = { analyzeMoments };