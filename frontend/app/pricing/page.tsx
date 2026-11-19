'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { joinWaitlist } from '@/lib/api';

const INCLUDED = [
  'Automatic highlight detection',
  'Captions on every clip',
  'All four layouts (Fill, Fit, Face cam split, Original wide)',
  'Paste links or upload files',
  'Live streams (YouTube, Twitch, Kick)',
  'Downloads, zip, and My Clips',
];

const PLANS = [
  { key: 'Starter', price: 22, minutes: '300', highlight: false, blurb: 'For getting started.' },
  { key: 'Creator', price: 39, minutes: '500', highlight: true, blurb: 'Most popular.' },
  { key: 'Pro', price: 69, minutes: '1,200', highlight: false, blurb: 'For high-volume posting.' },
];

export default function PricingPage() {
  const [plan, setPlan] = useState('Creator');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const choose = (p: string) => {
    setPlan(p);
    setStatus('idle');
    setMessage('');
    document.getElementById('early-list')?.scrollIntoView({ behavior: 'smooth' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'saving') return;
    setStatus('saving');
    setMessage('');
    try {
      await joinWaitlist(email.trim(), plan);
      setStatus('done');
      setEmail('');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.response?.data?.error || 'Could not save your email. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <SiteHeader />

      <main className="max-w-5xl mx-auto px-6 py-14 w-full flex-1">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4">
            Simple pricing. More posting.
          </h1>
          <p className="text-white/50 text-lg max-w-2xl mx-auto">
            Every plan includes everything the app does today. Plans differ by processing minutes only.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {PLANS.map(p => (
            <div
              key={p.key}
              className={`relative rounded-2xl border p-7 flex flex-col ${
                p.highlight
                  ? 'bg-surface-1 border-brand-500/50 md:-mt-3 md:mb-3 glow-brand'
                  : 'bg-surface-1 border-white/8'
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-brand-500 text-white text-xs font-bold">
                  Most popular
                </span>
              )}
              <h2 className="text-white font-bold text-xl">{p.key}</h2>
              <p className="text-white/40 text-sm mb-4">{p.blurb}</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-black text-white">${p.price}</span>
                <span className="text-white/40 text-sm mb-1.5">/month</span>
              </div>
              <p className={`text-sm font-semibold mb-6 ${p.highlight ? 'text-gold-400' : 'text-brand-400'}`}>
                {p.minutes} processing minutes/month
              </p>

              <ul className="space-y-2.5 mb-7 flex-1">
                {INCLUDED.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-white/60">
                    <Check size={16} className="text-brand-400 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => choose(p.key)}
                className={`w-full py-3 rounded-xl font-bold transition-colors ${
                  p.highlight
                    ? 'bg-brand-500 hover:bg-brand-400 text-white'
                    : 'bg-white/8 hover:bg-white/12 text-white border border-white/10'
                }`}
              >
                Join the early list
              </button>
            </div>
          ))}
        </div>

        {/* First clip + trial note */}
        <div className="text-center mt-10">
          <p className="text-white font-bold text-lg">Your First Clip Is On Us</p>
          <p className="text-white/40 text-sm mt-1">
            Every plan starts with a 3-day free trial. Paid plans open soon — join the early list and we&rsquo;ll let you know.
          </p>
        </div>

        {/* Early list email capture */}
        <div id="early-list" className="max-w-md mx-auto mt-10 bg-surface-1 border border-white/8 rounded-2xl p-6">
          {status === 'done' ? (
            <div className="text-center py-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 mb-3">
                <Check size={22} className="text-green-400" />
              </div>
              <h3 className="text-white font-bold">You&rsquo;re on the list</h3>
              <p className="text-white/40 text-sm mt-1">We&rsquo;ll email you when paid plans open.</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h3 className="text-white font-bold mb-1">Join the early list</h3>
              <p className="text-white/40 text-sm mb-4">
                Paid plans aren&rsquo;t live yet. Leave your email and we&rsquo;ll tell you the moment they open.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={plan}
                  onChange={e => setPlan(e.target.value)}
                  className="bg-surface border border-white/10 rounded-xl text-white text-sm px-3 py-3 focus:border-brand-500 focus:outline-none"
                >
                  {PLANS.map(p => (
                    <option key={p.key} value={p.key}>{p.key}</option>
                  ))}
                </select>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="flex-1 bg-surface border border-white/10 rounded-xl text-white placeholder-white/25 text-sm px-4 py-3 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={status === 'saving'}
                className="w-full mt-3 py-3 bg-brand-500 hover:bg-brand-400 disabled:opacity-60 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {status === 'saving' ? (<><Loader2 size={16} className="animate-spin" /> Saving...</>) : 'Notify me'}
              </button>
              {status === 'error' && <p className="text-red-400/80 text-sm mt-3 text-center">{message}</p>}
            </form>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
