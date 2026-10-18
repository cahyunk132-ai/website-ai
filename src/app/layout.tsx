import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hyunk AI Hub - Multi-Provider AI Platform',
  description:
    'Unified interface for Radox AI and Intern InkStone with automatic quota fallback and real-time streaming.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-slate-950 text-slate-100 antialiased overflow-hidden selection:bg-cyan-500/20 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
