'use client';

import { useEffect, useState } from 'react';
import { Loader2, Lock, Moon } from 'lucide-react';
import { getConfig, setAccessCode } from '@/lib/api';

type State = 'loading' | 'open' | 'gated' | 'offline';

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>('loading');
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  // Returns true if the app should be shown.
  const check = async (): Promise<boolean> => {
    try {
      const cfg = await getConfig();
      const open = !cfg.accessRequired || cfg.valid;
      setState(open ? 'open' : 'gated');
      return open;
    } catch {
      // Could not reach the backend at all — it is probably offline/asleep.
      setState('offline');
      return false;
    }
  };

  useEffect(() => { check(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError('');
    setAccessCode(code.trim());
    const ok = await check();
    if (!ok) setError('That code did not work. Check it and try again.');
    setChecking(false);
  };

  const retry = async () => {
    setState('loading');
    await check();
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 size={28} className="text-brand-500 animate-spin" />
      </div>
    );
  }

  if (state === 'offline') {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/clipura-logo.png" alt="Clipura" className="h-10 w-auto mx-auto mb-8" />
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/5 border border-white/10 mb-4">
            <Moon size={20} className="text-white/50" />
          </div>
          <h1 className="text-white font-bold text-xl mb-1">We&rsquo;re offline right now</h1>
          <p className="text-white/40 text-sm mb-6">
            Clipura is taking a quick break. Please check back in a little while.
          </p>
          <button
            onClick={retry}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white/8 hover:bg-white/12 border border-white/10 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (state === 'gated') {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/clipura-logo.png" alt="Clipura" className="h-10 w-auto mx-auto mb-8" />
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-500/10 border border-brand-500/20 mb-4">
            <Lock size={20} className="text-brand-400" />
          </div>
          <h1 className="text-white font-bold text-xl mb-1">This is a private demo</h1>
          <p className="text-white/40 text-sm mb-6">Enter the access code you were given.</p>
          <form onSubmit={submit} className="space-y-3">
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Access code"
              autoFocus
              className="w-full text-center bg-surface-1 border border-white/10 rounded-xl text-white placeholder-white/25 px-4 py-3 focus:border-brand-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={checking || !code.trim()}
              className="w-full py-3 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {checking ? <><Loader2 size={16} className="animate-spin" /> Checking...</> : 'Enter'}
            </button>
            {error && <p className="text-red-400/80 text-sm">{error}</p>}
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
