import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'Clipura — Questions',
  description: 'Answers about what Clipura does, what you can clip, live streams, layouts, pricing, and more.',
};

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What is Clipura?',
    a: 'Clipura turns long videos and live streams into short, vertical clips that are ready to post on TikTok, Instagram Reels, and YouTube Shorts. You paste a link or upload a file, it finds the best moments, adds captions, and formats each clip for you.',
  },
  {
    q: 'What can I clip?',
    a: 'YouTube, Twitch, and Kick links (finished videos and streams that are live right now), plus files you upload from your computer — MP4, MOV, AVI, MKV, WEBM, MP3, M4A, and WAV.',
  },
  {
    q: 'Does it work on live streams?',
    a: 'Yes. For a YouTube stream that is live right now, Clipura can go back and grab the last several minutes (up to about an hour). Twitch and Kick work differently — they do not reliably keep the recent past available, so Clipura records the next few minutes forward from the moment you paste the link. Either way you get a clip from the live stream.',
  },
  {
    q: 'How does it choose the moments?',
    a: 'It reads what is being said in the video and scores each moment for how shareable it is — strong lines, big reactions, funny bits, useful tips. It skips ads, intros, outros, and dead air, and returns fewer moments when only a few are genuinely good. You can also search the same video again for different moments.',
  },
  {
    q: 'What layouts are there?',
    a: 'Four: Fill (a square from the middle on a blurred background), Fit (the whole frame, nothing cut off), Face cam split (face cam on top, gameplay below), and Original wide (keeps it 16:9). Captions can be turned on or off, and you pick one layout for the whole batch.',
  },
  {
    q: 'Can I edit a clip or try again?',
    a: 'Yes. You can adjust where a clip starts and ends, change the hook, go back and pick different moments, and remake the clips as many times as you like. Remaking from a video you already processed is fast and does not start over from scratch.',
  },
  {
    q: 'How long does it take?',
    a: 'Most videos are ready to review in a few minutes. Longer videos take longer. Live streams that record forward (Twitch and Kick) take as long as the minutes you ask for, since they record in real time.',
  },
  {
    q: 'How long are my clips kept?',
    a: 'Finished clips are kept for 7 days so you have time to download them. After that they are cleared, and a clip in My Clips will show as expired. You can always remake it from the same video while it is still available.',
  },
  {
    q: 'What does it cost and how does the free clip work?',
    a: 'Your first clip is on us. Paid plans (Starter, Creator, and Pro) are opening soon and will differ by processing minutes per month — see the Pricing page. Billing is not live yet, so for now you can join the early list and we will let you know the moment plans open.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'When paid plans open, yes — every plan starts with a 3-day free trial and you will be able to cancel at any time from your account. Billing is opening soon.',
  },
  {
    q: "Can I clip someone else's video?",
    a: 'Only if you have the right to use it. You are responsible for making sure you own the footage you clip or have permission to use it. Do not clip content you are not allowed to use.',
  },
  {
    q: 'Who do I contact for help?',
    a: 'Clipura is an early demo. If something is not working, reply to the invite you received, or email the address your invite came from, and describe what happened.',
  },
];

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-6 py-14 w-full flex-1">
        <div className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-3">Questions</h1>
          <p className="text-white/50 text-lg">Everything about what Clipura does today.</p>
        </div>

        <div className="space-y-3">
          {FAQ.map(item => (
            <details key={item.q} className="group bg-surface-1 border border-white/8 rounded-2xl px-6 py-4">
              <summary className="flex items-center justify-between cursor-pointer list-none text-white font-semibold">
                {item.q}
                <ChevronRight size={16} className="text-white/30 transition-transform group-open:rotate-90 flex-shrink-0 ml-4" />
              </summary>
              <p className="text-white/55 text-sm leading-relaxed mt-3">{item.a}</p>
            </details>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-4 bg-brand-500 hover:bg-brand-400 text-white font-bold rounded-xl transition-colors glow-brand"
          >
            Get My Free Clip
            <ChevronRight size={18} />
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
