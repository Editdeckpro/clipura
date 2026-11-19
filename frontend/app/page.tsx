'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Scissors, ChevronRight, RotateCcw, CheckSquare, Square, Bookmark, Check,
  Radio, Sparkles, Smartphone, SlidersHorizontal, Link2, Download, Search, Loader2,
} from 'lucide-react';
import UploadZone from '@/components/UploadZone';
import ProcessingStatus from '@/components/ProcessingStatus';
import MomentCard from '@/components/MomentCard';
import ClipGenerator from '@/components/ClipGenerator';
import SavedClips from '@/components/SavedClips';
import LayoutPicker from '@/components/LayoutPicker';
import { Job, MomentOverride, refindMoments, LayoutOptions, DEFAULT_LAYOUT } from '@/lib/api';

const LAYOUT_STORAGE_KEY = 'clip-factory:layout';

type Stage = 'upload' | 'processing' | 'select' | 'generate';
type View = 'workflow' | 'library';

const HOW_IT_WORKS = [
  { icon: Link2, title: 'Paste a link or upload', desc: 'A YouTube, Twitch, or Kick link, a stream that is live right now, or a file from your computer.' },
  { icon: Sparkles, title: 'We find the moments', desc: 'Every moment gets a score, so the strongest clips are at the top.' },
  { icon: Download, title: 'Review and download', desc: 'Adjust the cut if you want, then download clips ready to post.' },
];

const FEATURES = [
  { icon: Radio, title: 'Clip streams while they are live', desc: 'Paste a live YouTube, Twitch, or Kick link and get clips from the last 10 minutes. Post while everyone is still watching.' },
  { icon: Sparkles, title: 'Scored moments', desc: 'Funny lines, big reactions, bold takes. Each one is scored from 0 to 100 so you know what to post first.' },
  { icon: Smartphone, title: 'Vertical and captioned', desc: 'Every clip comes out in 9:16 with captions, sized for TikTok, Reels, and Shorts.' },
  { icon: SlidersHorizontal, title: 'You stay in control', desc: 'Move the start and end, edit the hook, and save the clips you want to keep.' },
];

const FAQ = [
  { q: 'What can I clip?', a: 'YouTube, Twitch, and Kick links (finished videos and streams that are live right now), and files you upload (MP4, MOV, MKV, WEBM, MP3, WAV and more).' },
  { q: 'How does live clipping work?', a: 'Paste the link to a stream while it is live. Clip Factory grabs the last 10 minutes and finds the best moments in it.' },
  { q: 'How does it pick the moments?', a: 'It reads what is being said and scores each moment for how shareable it is. Videos with someone talking give the best results.' },
  { q: 'How long does it take?', a: 'Most videos are ready to review in a few minutes. Longer videos take longer.' },
];

export default function Home() {
  const [view, setView] = useState<View>('workflow');
  const [stage, setStage] = useState<Stage>('upload');
  const [jobId, setJobId] = useState<string>('');
  const [job, setJob] = useState<Job | null>(null);
  const [selectedMoments, setSelectedMoments] = useState<string[]>([]);
  const [momentOverrides, setMomentOverrides] = useState<Record<string, MomentOverride>>({});
  const [processingError, setProcessingError] = useState('');
  const [refindQuery, setRefindQuery] = useState('');
  const [refinding, setRefinding] = useState(false);
  const [refindMessage, setRefindMessage] = useState('');
  const [layoutOptions, setLayoutOptions] = useState<LayoutOptions>(DEFAULT_LAYOUT);
  const [clipsGenerating, setClipsGenerating] = useState(false);

  // Remember the last layout choice in the browser and reload it next time.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) setLayoutOptions({ ...DEFAULT_LAYOUT, ...JSON.parse(saved) });
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutOptions));
    } catch {}
  }, [layoutOptions]);

  const handleJobCreated = useCallback((id: string) => {
    setJobId(id);
    setStage('processing');
  }, []);

  const handleReady = useCallback((completedJob: Job) => {
    setJob(completedJob);
    setSelectedMoments(completedJob.moments?.map(m => m.id) || []);
    setStage('select');
  }, []);

  const handleError = useCallback((msg: string) => {
    setProcessingError(msg);
  }, []);

  const handleMomentUpdate = useCallback((id: string, overrides: MomentOverride) => {
    setMomentOverrides(prev => ({ ...prev, [id]: { ...prev[id], ...overrides } }));
  }, []);

  const toggleMoment = useCallback((id: string) => {
    setSelectedMoments(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  }, []);

  const selectAll = () => setSelectedMoments(job?.moments?.map(m => m.id) || []);
  const selectNone = () => setSelectedMoments([]);

  const reset = () => {
    setStage('upload');
    setJobId('');
    setJob(null);
    setSelectedMoments([]);
    setMomentOverrides({});
    setProcessingError('');
  };

  const handleRefind = async () => {
    if (!job || refinding) return;
    setRefinding(true);
    setRefindMessage('');
    try {
      const newMoments = await refindMoments(job.id, refindQuery.trim() || undefined);
      if (!newMoments || newMoments.length === 0) {
        setRefindMessage('No different moments found. Try other words, or keep the ones you have.');
      } else {
        setJob(prev => (prev ? { ...prev, moments: newMoments } : prev));
        setSelectedMoments(newMoments.map(m => m.id));
        setMomentOverrides({}); // old edits referred to the old moments
        setRefindQuery('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: any) {
      setRefindMessage(err?.response?.data?.error || err?.message || 'Could not search again. Please try once more.');
    } finally {
      setRefinding(false);
    }
  };

  // Go to the clips screen. Assume generation is running so the back link stays
  // hidden until ClipGenerator reports it has finished (or failed).
  const goToGenerate = () => {
    setClipsGenerating(true);
    setStage('generate');
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const steps: { key: Stage; label: string }[] = [
    { key: 'upload', label: 'Add video' },
    { key: 'processing', label: 'Finding moments' },
    { key: 'select', label: 'Pick clips' },
    { key: 'generate', label: 'Your clips' },
  ];

  const stageIndex = steps.findIndex(s => s.key === stage);
  const editedCount = Object.keys(momentOverrides).length;
  const showSteps = view === 'workflow' && stage !== 'upload';

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 bg-surface-1/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => setView('workflow')}
            className="flex items-center gap-3"
          >
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <Scissors size={16} className="text-white" />
            </div>
            <span className="font-black text-white text-lg tracking-tight">
              CLIP<span className="text-brand-500">FACTORY</span>
            </span>
          </button>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('library')}
              className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                view === 'library'
                  ? 'bg-brand-500/15 text-brand-400 border border-brand-500/25'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              <Bookmark size={14} />
              My Clips
            </button>

            {view === 'workflow' && stage !== 'upload' && (
              <button
                onClick={reset}
                className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors"
              >
                <RotateCcw size={14} />
                New video
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Progress steps (hidden on the home screen to keep it clean) */}
      {showSteps && (
        <div className="border-b border-white/5 bg-surface-1/40">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <div className="flex items-center gap-2">
              {steps.map((step, i) => (
                <div key={step.key} className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    i < stageIndex ? 'text-white/40' :
                    i === stageIndex ? 'text-white' :
                    'text-white/20'
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                      i < stageIndex ? 'bg-brand-500/30 text-brand-400' :
                      i === stageIndex ? 'bg-brand-500 text-white' :
                      'bg-white/8 text-white/20'
                    }`}>
                      {i < stageIndex ? <Check size={12} /> : i + 1}
                    </div>
                    <span className="hidden sm:inline">{step.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <ChevronRight size={14} className="text-white/15 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-12 w-full flex-1">

        {/* My Clips library */}
        {view === 'library' && <SavedClips />}

        {/* Workflow */}
        {view === 'workflow' && (
          <>
            {/* STAGE: Home / add a video */}
            {stage === 'upload' && (
              <div className="animate-slide-up">
                {/* Hero */}
                <div className="text-center mb-10">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500/10 border border-brand-500/20 rounded-full text-brand-400 text-sm font-semibold mb-6">
                    <Radio size={14} />
                    Now works on live streams
                  </div>
                  <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight leading-tight">
                    Turn streams and long videos<br className="hidden sm:block" />{' '}
                    into <span className="text-brand-500">clips worth posting</span>
                  </h1>
                  <p className="text-white/50 text-lg sm:text-xl max-w-2xl mx-auto">
                    Paste a link. Clip Factory finds the best moments, cuts them vertical,
                    and adds captions. Ready for TikTok, Reels, and Shorts.
                  </p>
                </div>

                <UploadZone onJobCreated={handleJobCreated} />

                {/* How it works */}
                <section className="mt-20">
                  <h2 className="text-center text-white font-black text-2xl mb-8">How it works</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {HOW_IT_WORKS.map((item, i) => (
                      <div key={item.title} className="bg-surface-1 border border-white/5 rounded-2xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                            <item.icon size={18} className="text-brand-400" />
                          </div>
                          <span className="text-white/30 text-sm font-bold">Step {i + 1}</span>
                        </div>
                        <h3 className="text-white font-bold mb-1">{item.title}</h3>
                        <p className="text-white/40 text-sm leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Features */}
                <section className="mt-20">
                  <h2 className="text-center text-white font-black text-2xl mb-2">Built for clippers</h2>
                  <p className="text-center text-white/40 mb-8">Less time editing. More clips posted.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {FEATURES.map(item => (
                      <div key={item.title} className="bg-surface-1 border border-white/5 rounded-2xl p-6 flex gap-4">
                        <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                          <item.icon size={18} className="text-brand-400" />
                        </div>
                        <div>
                          <h3 className="text-white font-bold mb-1">{item.title}</h3>
                          <p className="text-white/40 text-sm leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* FAQ */}
                <section className="mt-20 max-w-2xl mx-auto">
                  <h2 className="text-center text-white font-black text-2xl mb-8">Questions</h2>
                  <div className="space-y-3">
                    {FAQ.map(item => (
                      <details key={item.q} className="group bg-surface-1 border border-white/5 rounded-2xl px-6 py-4">
                        <summary className="flex items-center justify-between cursor-pointer list-none text-white font-semibold">
                          {item.q}
                          <ChevronRight size={16} className="text-white/30 transition-transform group-open:rotate-90 flex-shrink-0 ml-4" />
                        </summary>
                        <p className="text-white/50 text-sm leading-relaxed mt-3">{item.a}</p>
                      </details>
                    ))}
                  </div>
                </section>

                {/* Closing call to action */}
                <section className="mt-20 text-center bg-surface-1 border border-white/5 rounded-2xl px-6 py-12">
                  <h2 className="text-white font-black text-2xl sm:text-3xl mb-3">Ready to make your first clips?</h2>
                  <p className="text-white/40 mb-6">Paste a link at the top of the page and see what it finds.</p>
                  <button
                    onClick={scrollToTop}
                    className="inline-flex items-center gap-2 px-8 py-4 bg-brand-500 hover:bg-brand-400 text-white font-bold rounded-xl transition-colors glow-brand"
                  >
                    Start clipping
                    <ChevronRight size={18} />
                  </button>
                </section>
              </div>
            )}

            {/* STAGE: Processing */}
            {stage === 'processing' && (
              <div className="animate-slide-up">
                <div className="text-center mb-12">
                  <h1 className="text-3xl font-black text-white mb-2">Finding your best moments</h1>
                  <p className="text-white/40">This usually takes a few minutes. You can leave this tab open.</p>
                </div>

                {processingError ? (
                  <div className="max-w-md mx-auto text-center">
                    <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl mb-6">
                      <p className="text-red-400 font-semibold mb-2">Something went wrong</p>
                      <p className="text-red-400/70 text-sm">{processingError}</p>
                    </div>
                    <button onClick={reset} className="btn-primary">Try again</button>
                  </div>
                ) : (
                  <ProcessingStatus jobId={jobId} onReady={handleReady} onError={handleError} />
                )}
              </div>
            )}

            {/* STAGE: Pick moments */}
            {stage === 'select' && job?.moments && (
              <div className="animate-slide-up">
                <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
                  <div>
                    <h1 className="text-3xl font-black text-white mb-1">
                      {job.moments.length} moment{job.moments.length !== 1 ? 's' : ''} found
                    </h1>
                    <p className="text-white/40">
                      Best ones first. Untick any you do not want.
                      {editedCount > 0 && (
                        <span className="ml-2 text-brand-400/80">{editedCount} edited</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={selectAll} className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors">
                      <CheckSquare size={15} /> All
                    </button>
                    <button onClick={selectNone} className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors">
                      <Square size={15} /> None
                    </button>
                    <button
                      onClick={goToGenerate}
                      disabled={selectedMoments.length === 0}
                      className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm"
                    >
                      Make {selectedMoments.length} clip{selectedMoments.length !== 1 ? 's' : ''}
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                {/* Layout + captions for this batch */}
                <div className="mb-6">
                  <LayoutPicker value={layoutOptions} onChange={setLayoutOptions} />
                </div>

                {/* Find different moments */}
                <div className="mb-8 bg-surface-1 border border-white/5 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Search size={16} className="text-brand-400" />
                    <h3 className="text-white font-bold text-sm">Not seeing what you want?</h3>
                  </div>
                  <p className="text-white/40 text-sm mb-3">
                    Search the same video again for different moments. This does not re-upload or re-process it.
                  </p>
                  <form
                    onSubmit={e => { e.preventDefault(); handleRefind(); }}
                    className="flex flex-col sm:flex-row gap-3"
                  >
                    <input
                      type="text"
                      value={refindQuery}
                      onChange={e => setRefindQuery(e.target.value)}
                      placeholder="What are you looking for? e.g. funny moments only (optional)"
                      disabled={refinding}
                      className="flex-1 px-4 py-2.5 bg-surface border border-white/10 rounded-xl text-white placeholder-white/25 focus:border-brand-500 focus:outline-none transition-colors text-sm"
                    />
                    <button
                      type="submit"
                      disabled={refinding}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white/8 hover:bg-white/12 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 text-white font-semibold rounded-xl transition-colors text-sm whitespace-nowrap"
                    >
                      {refinding ? (
                        <><Loader2 size={15} className="animate-spin" /> Finding...</>
                      ) : (
                        <><Search size={15} /> Find different moments</>
                      )}
                    </button>
                  </form>
                  {refindMessage && (
                    <p className="text-yellow-400/70 text-sm mt-3">{refindMessage}</p>
                  )}
                </div>

                <div className="space-y-4">
                  {[...job.moments]
                    .sort((a, b) => b.viralScore - a.viralScore)
                    .map((moment, i) => (
                      <MomentCard
                        key={moment.id}
                        moment={{ ...moment, ...(momentOverrides[moment.id] || {}) }}
                        selected={selectedMoments.includes(moment.id)}
                        onToggle={toggleMoment}
                        onUpdate={handleMomentUpdate}
                        index={i}
                      />
                    ))}
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => setStage('generate')}
                    disabled={selectedMoments.length === 0}
                    className="flex items-center gap-2 px-8 py-4 bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors glow-brand"
                  >
                    Make {selectedMoments.length} clip{selectedMoments.length !== 1 ? 's' : ''}
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* STAGE: Your clips */}
            {stage === 'generate' && job && (
              <div className="animate-slide-up max-w-2xl mx-auto">
                <ClipGenerator
                  job={job}
                  selectedMoments={selectedMoments}
                  overrides={momentOverrides}
                  layout={layoutOptions}
                  onGeneratingChange={setClipsGenerating}
                  onRestart={reset}
                />
                <div className="mt-8 flex flex-col items-center gap-3">
                  {/* Only offer going back once the clips have finished (or failed). */}
                  {!clipsGenerating && (
                    <button
                      onClick={() => setStage('select')}
                      className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
                    >
                      <RotateCcw size={14} />
                      Back to pick clips
                    </button>
                  )}
                  <button onClick={reset} className="text-sm text-white/30 hover:text-white/60 transition-colors">
                    Clip another video
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between flex-wrap gap-2 text-sm text-white/30">
          <span>Clip Factory</span>
          <span>Clips for TikTok, Reels, and Shorts</span>
        </div>
      </footer>
    </div>
  );
}