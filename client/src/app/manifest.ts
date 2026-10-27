import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GitDex',
    short_name: 'GitDex',
    description: 'A field guide to your code.',
    start_url: '/',
    display: 'standalone',
    background_color: '#121c17',
    theme_color: '#121c17',
    icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  };
}
