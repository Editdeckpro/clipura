'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Download, Loader2, CheckCircle2, XCircle, Package,
  Play, Pause, BookmarkCheck, RotateCcw,
} from 'lucide-react';
import {
  generateClips, getJob, getDownloadUrl, getClipUrl,
  saveClip, getSavedClips,
  Job, MomentOverride,
} from '@/lib/api';

interface Props {
  job: Job;
  selectedMoments: string[];
  overrides?: Record<string, MomentOverride>;
}

export default function ClipGenerator({ job, selectedMoments, overrides }: Props) {
  const [generating, setGenerating] = useState(true);
  const [hasProgress, setHasProgress] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job>(job);
  const [error, setError] = useState('');
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    try {
      return new Set<string>(getSavedClips().map(c => c.id));
    } catch { return new Set<string>(); }
  });

  // Makes sure generation is only requested once, even if React runs effects twice.
  const requestedRef = useRef(false);

  const startGeneration = useCallback(async () => {
    setError('');
    setHasProgress(false);
    setGenerating(true);
    try {
      await generateClips(job.id, selectedMoments, overrides);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to start generation');
      setGenerating(false);
    }
  }, [job.id, selectedMoments, overrides]);

  // Start as soon as this screen opens - no second "Generate" click needed.
  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    startGeneration();
  }, [startGeneration]);

  // While clips are being made, check on progress every 1.5 seconds.
  useEffect(() => {
    if (!generating) return;
    let cancelled = false;

    const check = async () => {
      try {
        const updated = await getJob(job.id);
        if (cancelled) return;
        if (updated.status === 'ready') return; // generation has not been picked up yet
        setCurrentJob(updated);
        setHasProgress(true);
        if (updated.status === 'complete' || updated.status === 'error') {
          setGenerating(false);
        }
      } catch {}
    };

    const interval = setInterval(check, 1500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [generating, job.id]);

  const persistClip = useCallback((clipFile: string, momentId: string) => {
    const moment = job.moments?.find(m => m.id === momentId);
    const override = overrides?.[momentId];
    const id = `${job.id}-${momentId}`;

    saveClip({
      id,
      jobId: job.id,
      filename: clipFile,
      hook: override?.hook || moment?.hook || clipFile,
      savedAt: new Date().toISOString(),
      platform: moment?.platform || [],
      viralScore: moment?.viralScore || 0,
    });
    setSavedIds(prev => { const next = new Set(Array.from(prev)); next.add(id); return next; });
  }, [job, overrides]);

  // Every finished clip is kept in My Clips automatically - no Save click needed.
  useEffect(() => {
    if (currentJob.status !== 'complete') return;
    (currentJob.clips || [])
      .filter(c => c.status === 'done' && c.file)
      .forEach(c => persistClip(c.file!, c.momentId));
  }, [currentJob.status, currentJob.clips, persistClip]);

  if (error) {
    return (
      <div className="text-center py-10">
        <XCircle size={48} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Could not start</h2>
        <p className="text-red-400/80 text-sm mb-6">{error}</p>
        <button
          onClick={startGeneration}
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-400 text-white font-bold rounded-xl transition-colors text-sm"
        >
          <RotateCcw size={15} />
          Try again
        </button>
      </div>
    );
  }

  if (generating) {
    const progress = hasProgress ? currentJob.progress : 0;
    const message = hasProgress
      ? currentJob.statusMessage
      : `Starting ${selectedMoments.length} clip${selectedMoments.length !== 1 ? 's' : ''}...`;

    return (
      <div className="text-center py-10">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-brand-500/10 border border-brand-500/20 mb-6">
          <Loader2 size={32} className="text-brand-400 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{message}</h2>
        <p className="text-white/40 text-sm mb-8">Cutting, framing for vertical, and adding captions...</p>
        <div className="w-full max-w-sm mx-auto">
          <div className="flex justify-between text-sm text-white/40 mb-2">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-500 progress-pulse"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (currentJob.status === 'error') {
    return (
      <div className="text-center py-10">
        <XCircle size={48} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Generation Failed</h2>
        <p className="text-red-400/80 text-sm">{currentJob.error}</p>
      </div>
    );
  }

  const clips = currentJob.clips || [];
  const successClips = clips.filter(c => c.status === 'done');
  const failedClips = clips.filter(c => c.status === 'error');

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-green-500/10 border border-green-500/20 flex-shrink-0">
            <CheckCircle2 size={22} className="text-green-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white leading-tight">
              {successClips.length} Clip{successClips.length !== 1 ? 's' : ''} Ready
            </h2>
            <p className="text-white/40 text-sm">
              Vertical 9:16 with captions · Saved to My Clips automatically
              {failedClips.length > 0 && (
                <span className="text-yellow-400/70"> · {failedClips.length} failed</span>
              )}
            </p>
          </div>
        </div>

        {successClips.length > 1 && (
          <a
            href={getDownloadUrl(currentJob.id)}
            download
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            <Package size={16} />
            Download all (.zip)
          </a>
        )}
      </div>

      {/* Clip cards: tall previews side by side */}
      <div className={successClips.length === 1 && failedClips.length === 0
        ? 'max-w-xs mx-auto'
        : 'grid grid-cols-1 sm:grid-cols-2 gap-5'}
      >
        {clips.map((clip, i) => {
          const moment = job.moments?.find(m => m.id === clip.momentId);
          const override = overrides?.[clip.momentId];
          const hookText = override?.hook || moment?.hook || `Clip ${i + 1}`;
          const clipId = `${currentJob.id}-${clip.momentId}`;
          const isSaved = savedIds.has(clipId);

          if (clip.status === 'error') {
            return (
              <div key={clip.momentId} className="p-4 rounded-2xl border bg-red-500/5 border-red-500/15 flex items-start gap-3">
                <XCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white">Clip {i + 1} failed</p>
                  {clip.error && <p className="text-xs text-red-400/70 mt-0.5">{clip.error}</p>}
                </div>
              </div>
            );
          }

          return (
            <div key={clip.momentId} className="bg-surface-1 border border-white/7 rounded-2xl overflow-hidden flex flex-col">
              <VideoPreview
                src={getClipUrl(currentJob.id, clip.file)}
                score={moment?.viralScore}
                label={`Clip ${i + 1}`}
              />

              <div className="p-4 flex flex-col flex-1">
                <p className="text-white font-semibold text-sm leading-snug mb-4 line-clamp-3 flex-1">
                  &ldquo;{hookText}&rdquo;
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={getClipUrl(currentJob.id, clip.file)}
                    download={clip.file}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-400 text-white font-semibold rounded-xl transition-colors text-sm"
                  >
                    <Download size={15} />
                    Download
                  </a>
                  <span
                    title="This clip is in My Clips"
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium bg-green-500/10 border-green-500/20 text-green-400"
                  >
                    <BookmarkCheck size={15} />
                    {isSaved ? 'Saved' : 'Saving'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VideoPreview({ src, score, label }: { src: string; score?: number; label: string }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  const toggle = () => {
    if (!ref.current) return;
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { ref.current.play(); setPlaying(true); }
  };

  return (
    <div className="relative bg-black aspect-[9/16] w-full overflow-hidden group/video cursor-pointer" onClick={toggle}>
      <video
        ref={ref}
        src={src}
        preload="metadata"
        playsInline
        loop
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        className="absolute inset-0 w-full h-full object-cover"
      />

      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white/80 text-xs font-semibold">
          {label}
        </span>
        {typeof score === 'number' && (
          <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-green-400 text-xs font-bold">
            Score {score}
          </span>
        )}
      </div>

      <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${playing ? 'opacity-0 group-hover/video:opacity-100' : 'opacity-100'}`}>
        <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 flex items-center justify-center">
          {playing ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white ml-0.5" />}
        </div>
      </div>
    </div>
  );
}