import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Hyunk AI Hub',
    short_name: 'Hyunk AI',
    description:
      'Unified multi-provider AI platform for Radox AI and Intern InkStone with streaming and agent mode.',
    lang: 'id',
    dir: 'ltr',
    categories: ['productivity', 'utilities'],
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    background_color: '#020617',
    theme_color: '#020617',
    // The native Android build is allowed to rotate, so the installed PWA is
    // allowed to rotate as well.
    orientation: 'any',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
