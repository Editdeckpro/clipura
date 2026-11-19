'use client';

import { LayoutOptions, LayoutType, FaceCamCorner, FaceCamSize } from '@/lib/api';

interface Props {
  value: LayoutOptions;
  onChange: (value: LayoutOptions) => void;
}

const BRAND = '#ff4d00';
const MUTED = 'rgba(255,255,255,0.10)';
const MUTED_2 = 'rgba(255,255,255,0.22)';

// Small pictures so the choice is obvious at a glance.
function Preview({ type }: { type: LayoutType }) {
  if (type === 'wide') {
    return (
      <svg width="48" height="64" viewBox="0 0 48 64" fill="none">
        <rect x="2" y="20" width="44" height="24" rx="3" fill={BRAND} opacity="0.85" />
      </svg>
    );
  }
  if (type === 'fit') {
    return (
      <svg width="48" height="64" viewBox="0 0 48 64" fill="none">
        <rect x="3" y="3" width="42" height="58" rx="5" fill={MUTED} />
        <rect x="6" y="23" width="36" height="18" rx="2" fill={BRAND} opacity="0.85" />
      </svg>
    );
  }
  if (type === 'split') {
    return (
      <svg width="48" height="64" viewBox="0 0 48 64" fill="none">
        <rect x="3" y="3" width="42" height="28" rx="4" fill={BRAND} opacity="0.7" />
        <rect x="32" y="6" width="10" height="8" rx="1.5" fill="#fff" opacity="0.85" />
        <rect x="3" y="33" width="42" height="28" rx="4" fill={BRAND} opacity="0.4" />
      </svg>
    );
  }
  // fill
  return (
    <svg width="48" height="64" viewBox="0 0 48 64" fill="none">
      <rect x="3" y="3" width="42" height="58" rx="5" fill={MUTED} />
      <rect x="9" y="17" width="30" height="30" rx="2" fill={BRAND} opacity="0.85" />
    </svg>
  );
}

const LAYOUTS: { key: LayoutType; name: string; desc: string }[] = [
  { key: 'fill', name: 'Fill', desc: 'Square from the middle on a blurred background.' },
  { key: 'fit', name: 'Fit', desc: 'Whole frame visible, nothing cut off.' },
  { key: 'split', name: 'Face cam split', desc: 'Face cam on top, gameplay below.' },
  { key: 'wide', name: 'Original wide', desc: 'Keep it wide (16:9), no cropping.' },
];

const CORNERS: { key: FaceCamCorner; label: string }[] = [
  { key: 'top-left', label: 'Top left' },
  { key: 'top-right', label: 'Top right' },
  { key: 'bottom-left', label: 'Bottom left' },
  { key: 'bottom-right', label: 'Bottom right' },
];

const SIZES: { key: FaceCamSize; label: string }[] = [
  { key: 'small', label: 'Small' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Large' },
];

export default function LayoutPicker({ value, onChange }: Props) {
  const set = (partial: Partial<LayoutOptions>) => onChange({ ...value, ...partial });

  return (
    <div className="bg-surface-1 border border-white/5 rounded-2xl p-5">
      <h3 className="text-white font-bold text-sm mb-1">Layout</h3>
      <p className="text-white/40 text-sm mb-4">Applies to every clip in this batch.</p>

      {/* Layout choices */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {LAYOUTS.map(l => {
          const selected = value.type === l.key;
          return (
            <button
              key={l.key}
              onClick={() => set({ type: l.key })}
              className={`flex flex-col items-center text-center p-3 rounded-xl border transition-colors ${
                selected
                  ? 'bg-brand-500/10 border-brand-500/40'
                  : 'bg-surface border-white/8 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-center h-16 mb-2">
                <Preview type={l.key} />
              </div>
              <span className={`text-sm font-semibold ${selected ? 'text-white' : 'text-white/70'}`}>
                {l.name}
              </span>
              <span className="text-xs text-white/35 leading-snug mt-0.5">{l.desc}</span>
            </button>
          );
        })}
      </div>

      {/* Face cam options (only for split) */}
      {value.type === 'split' && (
        <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-white/60 text-xs font-semibold mb-2">Face cam corner</p>
            <div className="grid grid-cols-2 gap-2">
              {CORNERS.map(c => (
                <button
                  key={c.key}
                  onClick={() => set({ faceCamCorner: c.key })}
                  className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                    value.faceCamCorner === c.key
                      ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                      : 'bg-surface border-white/8 text-white/50 hover:text-white hover:border-white/20'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-white/60 text-xs font-semibold mb-2">Face cam size</p>
            <div className="grid grid-cols-3 gap-2">
              {SIZES.map(s => (
                <button
                  key={s.key}
                  onClick={() => set({ faceCamSize: s.key })}
                  className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                    value.faceCamSize === s.key
                      ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                      : 'bg-surface border-white/8 text-white/50 hover:text-white hover:border-white/20'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Captions switch */}
      <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
        <div>
          <p className="text-white text-sm font-semibold">Captions</p>
          <p className="text-white/40 text-xs">Words on screen, added into the video.</p>
        </div>
        <button
          role="switch"
          aria-checked={value.captions}
          onClick={() => set({ captions: !value.captions })}
          className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
            value.captions ? 'bg-brand-500' : 'bg-white/15'
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
              value.captions ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
