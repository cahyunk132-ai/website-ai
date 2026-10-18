import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hyunk AI Hub - Multi-Provider AI Platform',
  description:
    'Unified interface for Radox AI and Intern InkStone with automatic quota fallback and real-time streaming.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Hyunk AI Hub',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#020617',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full min-h-[100dvh] bg-slate-950 text-slate-100 antialiased overflow-hidden selection:bg-cyan-500/20 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
