'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { getJob, Job } from '@/lib/api';

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

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const source = new EventSource(`${API_URL}/api/jobs/${jobId}/stream`);

    source.onmessage = (e) => {
      const data: Job = JSON.parse(e.data);
      setJob(data);
      if (data.status === 'ready' || data.status === 'complete') {
        source.close();
        onReady(data);
      }
      if (data.status === 'error') {
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
          setJob(data);
          if (data.status === 'ready' || data.status === 'complete') {
            clearInterval(pollInterval);
            onReady(data);
          }
          if (data.status === 'error') {
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
  }, [jobId, onReady, onError]);

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
                stroke="#ff4d00" strokeWidth="2.5" strokeLinecap="round"
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
    </div>
  );
}