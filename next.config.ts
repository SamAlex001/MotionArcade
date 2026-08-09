import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ── Build performance ──────────────────────────────────────────
  typescript: {
    ignoreBuildErrors: true,
  },
  // NOTE: In Next.js 16 the top-level `eslint` config key was removed from
  // NextConfig — linting is now a standalone `next lint` step (see package.json).

  // Gzip/Brotli compression at the Next.js layer. Most hosts (Vercel, Firebase
  // App Hosting) gzip for us, but enabling this keeps `next start` fast too.
  compress: true,

  // ── Runtime performance ────────────────────────────────────────
  // Next 16's optimizePackageImports already does the per-icon tree-shake
  // for lucide-react automatically (and handles the awkward casing of icons
  // like Gamepad2 → gamepad-2 correctly). Using both options at once
  // collides — the rewrite path lands outside the package's real ESM
  // layout. So we use only optimizePackageImports here.
  experimental: {
    optimizePackageImports: [
      'three',
      '@mediapipe/tasks-vision',
      'lucide-react',
      'recharts',
      'date-fns',
    ],
  },

  // Don't ship browser source maps in prod (smaller bundles, faster TTI).
  productionBrowserSourceMaps: false,

  // ── Static asset handling ─────────────────────────────────────
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co',       port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos',       port: '', pathname: '/**' },
    ],
  },

  // ── Long-term caching for the MediaPipe model + WASM ──────────
  async headers() {
    return [
      {
        // MediaPipe model is fetched from a Google CDN, but if it's ever
        // moved into /public we want it cached forever.
        source: '/:all*(svg|jpg|png|woff2|wasm|task)',
        locale: false,
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
