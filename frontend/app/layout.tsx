import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clip Factory — Podcast Clips at Scale',
  description: 'Transform business podcasts into viral short-form clips.',
  icons: { icon: '/favicon.ico' },
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
