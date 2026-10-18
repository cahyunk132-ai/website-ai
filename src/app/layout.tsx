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
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
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

import { AuthProvider } from '@/lib/AuthContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window !== 'undefined') {
                  if (!window.crypto) {
                    window.crypto = {};
                  }
                  if (!window.crypto.randomUUID) {
                    window.crypto.randomUUID = function() {
                      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                      });
                    };
                  }
                }
              })();
            `,
          }}
        />
      </head>
      <body className="h-full min-h-[100dvh] bg-slate-950 text-slate-100 antialiased overflow-hidden selection:bg-cyan-500/20 selection:text-cyan-200">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
