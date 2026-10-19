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
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon-180.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#020617',
  // Android Chrome resizes the *visual* viewport when the soft keyboard opens,
  // which hides the composer behind the keyboard. `resizes-content` shrinks the
  // layout viewport instead, so the input stays right above the keyboard.
  interactiveWidget: 'resizes-content',
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
      <body className="h-full bg-slate-950 text-slate-100 antialiased overflow-hidden overscroll-none selection:bg-cyan-500/20 selection:text-cyan-200">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
