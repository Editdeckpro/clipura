'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, X } from 'lucide-react';
import { getJob, cancelJob, Job } from '@/lib/api';

// If a recording shows no change for this long, stop waiting and show an error
// instead of freezing.
const STALL_TIMEOUT_MS = 60_000;

const STEPS = [
  { key: 'downloading', label: 'Getting the video' },
  { key: 'transcribing', label: 'Listening to what is said' },
  { key: 'analyzing', label: 'Picking the best moments' },
];

const STATUS_ORDER = ['queued', 'downloading', 'transcribing', 'analyzing', 'ready', 'generating', 'complete'];

interface Props {
  jobId: string;
  onReady: (job: Job) => void;
  onError: (msg: string) => void;
}

export default function ProcessingStatus({ jobId, onReady, onError }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Remember when the job last actually changed, and the latest job, so the
  // watchdog below can tell whether a recording has frozen.
  const lastChangeRef = useRef<{ sig: string; at: number }>({ sig: '', at: Date.now() });
  const jobRef = useRef<Job | null>(null);
  const firedRef = useRef(false);

  const apply = useCallback((data: Job) => {
    jobRef.current = data;
    setJob(data);
    const sig = `${data.status}|${data.progress}|${data.statusMessage}`;
    if (sig !== lastChangeRef.current.sig) lastChangeRef.current = { sig, at: Date.now() };
  }, []);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const source = new EventSource(`${API_URL}/api/jobs/${jobId}/stream`);

    source.onmessage = (e) => {
      const data: Job = JSON.parse(e.data);
      apply(data);
      if (data.status === 'ready' || data.status === 'complete') {
        source.close();
        onReady(data);
      }
      if (data.status === 'error' || data.status === 'interrupted') {
        source.close();
        onError(data.error || 'Processing failed');
      }
    };

    source.onerror = () => {
      source.close();
      // Fall back to polling
      startPolling();
    };

    let pollInterval: ReturnType<typeof setInterval> | undefined;

    function startPolling() {
      pollInterval = setInterval(async () => {
        try {
          const data = await getJob(jobId);
          apply(data);
          if (data.status === 'ready' || data.status === 'complete') {
            clearInterval(pollInterval);
            onReady(data);
          }
          if (data.status === 'error' || data.status === 'interrupted') {
            clearInterval(pollInterval);
            onError(data.error || 'Processing failed');
          }
        } catch {}
      }, 2000);
    }

    return () => {
      source.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [jobId, onReady, onError, apply]);

  // Watchdog: while the stream is being recorded, if nothing changes for a
  // minute (frozen connection or a stalled stream the server could not reach),
  // show an error instead of leaving the user staring at a stuck bar.
  useEffect(() => {
    const id = setInterval(() => {
      const j = jobRef.current;
      if (!j || firedRef.current) return;
      if (j.status === 'downloading' && Date.now() - lastChangeRef.current.at > STALL_TIMEOUT_MS) {
        firedRef.current = true;
        clearInterval(id);
        onError('The live stream stopped responding. Please try again, or try a finished video.');
      }
    }, 5000);
    return () => clearInterval(id);
  }, [onError]);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    try { await cancelJob(jobId); } catch {}
  }, [jobId]);

  if (!job) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="text-brand-500 animate-spin" />
      </div>
    );
  }

  const currentStepIndex = STATUS_ORDER.indexOf(job.status);

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-brand-500/10 border border-brand-500/20 mb-6">
          <div className="relative">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke="#8b2ff5" strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={`${job.progress} ${100 - job.progress}`}
                strokeDashoffset="25"
                className="transition-all duration-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-brand-400">
              {job.progress}%
            </span>
          </div>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{job.statusMessage}</h2>
        <p className="text-white/40 text-sm">Longer videos and live streams take a little longer.</p>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const stepIdx = STATUS_ORDER.indexOf(step.key);
          const isComplete = currentStepIndex > stepIdx;
          const isActive = currentStepIndex === stepIdx;

          return (
            <div
              key={step.key}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 ${
                isActive
                  ? 'bg-brand-500/8 border-brand-500/30'
                  : isComplete
                  ? 'bg-white/3 border-white/5'
                  : 'border-white/5 opacity-40'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                isComplete ? 'bg-green-500/20 text-green-400' :
                isActive ? 'bg-brand-500/20 text-brand-400' :
                'bg-white/5 text-white/20'
              }`}>
                {isComplete ? (
                  <CheckCircle2 size={16} />
                ) : isActive ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <span className="text-xs font-bold">{i + 1}</span>
                )}
              </div>
              <span className={`text-sm font-medium ${
                isComplete ? 'text-white/60' :
                isActive ? 'text-white' :
                'text-white/30'
              }`}>
                {step.label}
              </span>
              {isActive && (
                <div className="ml-auto flex gap-1">
                  {[0, 1, 2].map(d => (
                    <div
                      key={d}
                      className="w-1 h-4 bg-brand-500 rounded-full opacity-80"
                      style={{ animation: `pulse 1s ease-in-out ${d * 0.15}s infinite alternate` }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cancel - only while the stream is being recorded */}
      {job.status === 'downloading' && (
        <div className="mt-8 text-center">
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/25 disabled:opacity-50 transition-colors text-sm"
          >
            <X size={15} />
            {cancelling ? 'Stopping...' : 'Cancel recording'}
          </button>
        </div>
      )}
    </div>
  );
}