import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/5 mt-20">
      <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between flex-wrap gap-4 text-sm text-white/40">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/clipura-logo.png" alt="Clipura" className="h-6 w-auto opacity-80" />
        </div>
        <nav className="flex items-center gap-5">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          <Link href="/faq" className="hover:text-white transition-colors">FAQ</Link>
        </nav>
        <span className="text-white/30">Clips for TikTok, Reels, and Shorts</span>
      </div>
    </footer>
  );
}
