import type { Metadata, Viewport } from 'next';
import './globals.css';

const TITLE = 'Clipura — One Video. Endless Content.';
const DESCRIPTION =
  'Turn long videos and live streams into short, engaging clips in minutes. We find your best moments, add captions, and format them for TikTok, Reels, and Shorts.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'Clipura',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'Clipura',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Clipura' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#0d0f1a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
