'use client';

import { useState, useRef, useEffect } from 'react';
import { Clock, TrendingUp, Target, ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react';
import { Moment, MomentOverride } from '@/lib/api';

const CONTENT_TYPE_LABELS: Record<string, string> = {
  tactical_tip: 'Tactical Tip',
  personal_story: 'Personal Story',
  bold_claim: 'Bold Claim',
  pain_point: 'Pain Point',
  case_study: 'Case Study',
  mindset_shift: 'Mindset Shift',
};

const CONTENT_TYPE_COLORS: Record<string, string> = {
  tactical_tip: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  personal_story: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  bold_claim: 'bg-brand-500/15 text-brand-400 border-brand-500/20',
  pain_point: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  case_study: 'bg-green-500/15 text-green-400 border-green-500/20',
  mindset_shift: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
};

const ADJUST_RANGE = 5; // ±5 seconds

function ScoreRing({ score }: { score: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#8b2ff5' : '#facc15';

  return (
    <div className="relative w-14 h-14 flex-shrink-0">
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
        <circle
          cx="24" cy="24" r={radius} fill="none"
          stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-black text-white leading-none">{score}</span>
      </div>
    </div>
  );
}

function formatDuration(start: number, end: number) {
  const dur = Math.max(0, end - start);
  const m = Math.floor(dur / 60);
  const s = Math.floor(dur % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface EditableTextProps {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
}

function EditableText({ value, onChange, multiline, className, placeholder }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => { setEditing(false); onChange(draft); };
  const cancel = () => { setEditing(false); setDraft(value); };

  if (!editing) {
    return (
      <div className="group/edit flex items-start gap-2">
        <span className={className}>{value || placeholder}</span>
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="opacity-0 group-hover/edit:opacity-100 transition-opacity flex-shrink-0 mt-0.5 p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/70"
        >
          <Pencil size={11} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      {multiline ? (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter' && e.metaKey) commit(); }}
          rows={3}
          className="flex-1 bg-white/5 border border-brand-500/40 rounded-lg px-3 py-2 text-white text-sm resize-none outline-none focus:border-brand-500/70"
        />
      ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter') commit(); }}
          className="flex-1 bg-white/5 border border-brand-500/40 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-500/70"
        />
      )}
      <div className="flex flex-col gap-1 mt-0.5 flex-shrink-0">
        <button onClick={commit} className="p-1.5 rounded bg-brand-500/20 hover:bg-brand-500/40 text-brand-400"><Check size={12} /></button>
        <button onClick={cancel} className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/40"><X size={12} /></button>
      </div>
    </div>
  );
}

interface Props {
  moment: Moment;
  selected: boolean;
  onToggle: (id: string) => void;
  onUpdate?: (id: string, overrides: MomentOverride) => void;
  index: number;
}

export default function MomentCard({ moment, selected, onToggle, onUpdate, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [startAdj, setStartAdj] = useState(0);
  const [endAdj, setEndAdj] = useState(0);

  const typeColor = CONTENT_TYPE_COLORS[moment.contentType] || 'bg-white/10 text-white/50 border-white/10';
  const typeLabel = CONTENT_TYPE_LABELS[moment.contentType] || moment.contentType;

  const adjustedStart = Math.max(0, moment.startTime + startAdj);
  const adjustedEnd = moment.endTime + endAdj;

  const handleStartAdj = (val: number) => {
    setStartAdj(val);
    onUpdate?.(moment.id, { startTime: Math.max(0, moment.startTime + val) });
  };

  const handleEndAdj = (val: number) => {
    setEndAdj(val);
    onUpdate?.(moment.id, { endTime: moment.endTime + val });
  };

  const hasTimeAdjustment = startAdj !== 0 || endAdj !== 0;

  return (
    <div
      className={`group relative rounded-2xl border transition-all duration-200 overflow-hidden ${
        selected
          ? 'border-brand-500/60 bg-brand-500/5 glow-brand-sm'
          : 'border-white/7 bg-surface-1 hover:border-white/15'
      }`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl transition-all ${selected ? 'bg-brand-500' : 'bg-transparent'}`} />

      <div className="p-5 pl-6">
        <div className="flex items-start gap-4">
          <ScoreRing score={moment.viralScore} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-white/30 text-xs font-mono">#{index + 1}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${typeColor}`}>
                {typeLabel}
              </span>
              {moment.platform.map(p => (
                <span key={p} className="text-xs text-white/40 bg-white/5 border border-white/8 px-2 py-0.5 rounded-full">
                  {p}
                </span>
              ))}
            </div>

            <div className="mb-3 pr-2">
              <EditableText
                value={moment.hook}
                onChange={v => onUpdate?.(moment.id, { hook: v })}
                className="text-white font-bold text-base leading-snug"
                placeholder="Add hook text..."
              />
            </div>

            <div className="flex items-center gap-4 text-xs text-white/40">
              <span className={`flex items-center gap-1.5 ${hasTimeAdjustment ? 'text-brand-400' : ''}`}>
                <Clock size={12} />
                {formatTimestamp(adjustedStart)} – {formatTimestamp(adjustedEnd)}
              </span>
              <span className="flex items-center gap-1.5">
                <TrendingUp size={12} />
                {formatDuration(adjustedStart, adjustedEnd)}
              </span>
              <span className="flex items-center gap-1.5">
                <Target size={12} />
                {moment.targetAudience}
              </span>
            </div>
          </div>

          <button
            onClick={() => onToggle(moment.id)}
            className={`flex-shrink-0 w-6 h-6 rounded-md border-2 transition-all flex items-center justify-center ${
              selected
                ? 'bg-brand-500 border-brand-500'
                : 'border-white/20 hover:border-brand-500/50'
            }`}
          >
            {selected && (
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-3 flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Less detail' : 'Edit & details'}
        </button>

        {expanded && (
          <div className="mt-5 space-y-5 animate-fade-in">
            {/* Timeline adjustment */}
            <div className="bg-white/3 border border-white/7 rounded-xl p-4 space-y-4">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Timeline Adjustment</p>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-white/40 mb-1.5">
                    <span>Start</span>
                    <span className={startAdj !== 0 ? 'text-brand-400 font-medium' : ''}>
                      {formatTimestamp(adjustedStart)}
                      {startAdj !== 0 && <span className="ml-1">({startAdj > 0 ? '+' : ''}{startAdj}s)</span>}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-ADJUST_RANGE}
                    max={ADJUST_RANGE}
                    step={0.5}
                    value={startAdj}
                    onChange={e => handleStartAdj(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-brand-500"
                    style={{ background: `linear-gradient(to right, #8b2ff5 0%, #8b2ff5 ${((startAdj + ADJUST_RANGE) / (ADJUST_RANGE * 2)) * 100}%, rgba(255,255,255,0.1) ${((startAdj + ADJUST_RANGE) / (ADJUST_RANGE * 2)) * 100}%, rgba(255,255,255,0.1) 100%)` }}
                  />
                  <div className="flex justify-between text-xs text-white/20 mt-1">
                    <span>-{ADJUST_RANGE}s</span>
                    <span>+{ADJUST_RANGE}s</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-white/40 mb-1.5">
                    <span>End</span>
                    <span className={endAdj !== 0 ? 'text-brand-400 font-medium' : ''}>
                      {formatTimestamp(adjustedEnd)}
                      {endAdj !== 0 && <span className="ml-1">({endAdj > 0 ? '+' : ''}{endAdj}s)</span>}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-ADJUST_RANGE}
                    max={ADJUST_RANGE}
                    step={0.5}
                    value={endAdj}
                    onChange={e => handleEndAdj(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-brand-500"
                    style={{ background: `linear-gradient(to right, #8b2ff5 0%, #8b2ff5 ${((endAdj + ADJUST_RANGE) / (ADJUST_RANGE * 2)) * 100}%, rgba(255,255,255,0.1) ${((endAdj + ADJUST_RANGE) / (ADJUST_RANGE * 2)) * 100}%, rgba(255,255,255,0.1) 100%)` }}
                  />
                  <div className="flex justify-between text-xs text-white/20 mt-1">
                    <span>-{ADJUST_RANGE}s</span>
                    <span>+{ADJUST_RANGE}s</span>
                  </div>
                </div>

                {hasTimeAdjustment && (
                  <button
                    onClick={() => { handleStartAdj(0); handleEndAdj(0); }}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors"
                  >
                    Reset to original times
                  </button>
                )}
              </div>
            </div>

            {/* Summary */}
            <div>
              <p className="text-white/30 text-xs font-semibold uppercase tracking-wider mb-2">Summary</p>
              <p className="text-white/60 text-sm leading-relaxed">{moment.summary}</p>
            </div>

            {moment.viralReasons.length > 0 && (
              <div>
                <p className="text-white/30 text-xs font-semibold uppercase tracking-wider mb-2">Why it&apos;s viral</p>
                <div className="flex flex-wrap gap-2">
                  {moment.viralReasons.map(r => (
                    <span key={r} className="text-xs bg-white/5 border border-white/8 text-white/50 px-3 py-1 rounded-full">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Editable caption */}
            <div>
              <p className="text-white/30 text-xs font-semibold uppercase tracking-wider mb-2">
                Social Caption <span className="normal-case font-normal text-white/20">(hover to edit)</span>
              </p>
              <div className="bg-white/3 border border-white/8 rounded-xl p-3">
                <EditableText
                  value={moment.suggestedCaption}
                  onChange={v => onUpdate?.(moment.id, { suggestedCaption: v })}
                  multiline
                  className="text-white/50 text-sm leading-relaxed font-mono text-xs block"
                  placeholder="Add a suggested caption..."
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
