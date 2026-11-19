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

async function analyzeMoments(transcript) {
  const claude = getClient();

  // Timestamps are written in plain seconds so the model never has to convert them.
  const transcriptText = transcript.segments && transcript.segments.length
    ? transcript.segments.map(s => `[${Number(s.start).toFixed(1)}s-${Number(s.end).toFixed(1)}s] ${s.text}`).join('\n')
    : (transcript.text || '');

  if (transcriptText.trim().length < MIN_TRANSCRIPT_CHARS) {
    throw new Error('Not enough talking was found in this video to pick clips. Try a video with more speech.');
  }

  const prompt = `Analyze this transcript and identify the 4-6 best viral moments for short-form clips.

TRANSCRIPT:
${transcriptText}

Use the exact second values from the transcript for startTime and endTime.`;

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
    .sort((a, b) => b.viralScore - a.viralScore);
}

module.exports = { analyzeMoments };