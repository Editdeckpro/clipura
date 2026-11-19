import Link from 'next/link';

export default function SiteHeader() {
  return (
    <header className="border-b border-white/5 bg-surface-1/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="Clipura home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/clipura-logo.png" alt="Clipura" className="h-8 w-auto" />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 text-sm font-medium">
          <Link href="/" className="text-white/50 hover:text-white px-3 py-1.5 transition-colors">Home</Link>
          <Link href="/pricing" className="text-white/50 hover:text-white px-3 py-1.5 transition-colors">Pricing</Link>
          <Link href="/faq" className="text-white/50 hover:text-white px-3 py-1.5 transition-colors">FAQ</Link>
          <Link
            href="/"
            className="ml-1 sm:ml-2 px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white font-semibold rounded-xl transition-colors"
          >
            Get My Free Clip
          </Link>
        </nav>
      </div>
    </header>
  );
}
