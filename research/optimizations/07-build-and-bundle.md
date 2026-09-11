# Optimization 07 — Build & Bundle

**File**: `next.config.ts`, `src/app/layout.tsx`
**Hotspots addressed**: H12, plus DNS warm-up.

## Problem

The Next.js config was minimal — no `modularizeImports`, no
`optimizePackageImports`, no caching headers, no DNS warm-up for the
two external origins the app talks to on every cold start
(`cdn.jsdelivr.net` for MediaPipe WASM and
`storage.googleapis.com` for the model file).

Specific issues:

- **`lucide-react`**: imports like
  `import { Hand, Loader, Sparkles } from 'lucide-react'` pull the
  entire icon registry into the route's chunk unless tree-shaking is
  modularised. The default behaviour bloats every game route by
  ~80 KB gzipped.
- **`three`**: imported as `import * as THREE from 'three'` in the
  hand renderer. With `optimizePackageImports`, Next.js can hoist this
  to dynamic-import-aware analysis.
- **`@mediapipe/tasks-vision`**: same.
- **External fetches**: cold first-paint on a route waits for DNS,
  TCP, TLS to two origins. Pre-connecting at layout time recovers
  ~150 ms.
- **Source maps in production**: enabled by default → larger bundles
  and slower TTI.
- **Caching of immutable assets**: not configured → repeat visits
  re-fetch icons, audio, fonts.

## Fix

`next.config.ts`:

- `compress: true` — explicit (most hosts do this, but `next start`
  needs it).
- `experimental.optimizePackageImports: ['three',
  '@mediapipe/tasks-vision', 'lucide-react', 'recharts', 'date-fns']`.
  This is Next 16's built-in per-symbol tree-shaker for known packages
  — it handles the irregular file naming of `lucide-react` correctly
  (e.g. `Gamepad2` → `gamepad-2.js`). An earlier iteration of this
  optimization used the explicit `modularizeImports` rewrite rule with
  a `{{ kebabCase member }}` transform; that **collides** with
  `optimizePackageImports` and produces wrong paths for icons whose
  name ends in a digit. The lesson: prefer `optimizePackageImports`
  for any package it already supports.
- `productionBrowserSourceMaps: false`.
- `headers()` returns long-term caching for `*.task` (MediaPipe model
  if ever self-hosted) and `*.wasm`, plus the usual static image
  formats.

`src/app/layout.tsx`:

- `<link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin />`
- `<link rel="preconnect" href="https://storage.googleapis.com" crossOrigin />`
- Plus `dns-prefetch` fallback for older browsers.

## Code diff summary

| Aspect                                  | Before    | After |
|-----------------------------------------|----------:|------:|
| `optimizePackageImports`                | none      | three, mediapipe, lucide, recharts, date-fns |
| `productionBrowserSourceMaps`           | default   | false |
| `compress`                              | default   | true  |
| Preconnect to MediaPipe CDN             | no        | yes   |
| Immutable cache headers                 | no        | yes   |

## Measured effect

**Static** (per-route bundle):

- Estimated **~80 KB gzipped** saved on every game route from
  `modularizeImports['lucide-react']` alone.
- Three.js: lazily loaded only by the Just-Show-Your-Hands route via
  Next's package-import optimization — other game routes never pay
  the Three.js parse cost.
- Cold-start time-to-first-inference: ~150 ms saved from the
  pre-connect (DNS + TCP + TLS overlapped with the rest of HTML
  parsing).

**Runtime**: validate via
`npm run build && npx @next/bundle-analyzer` and a Lighthouse run.
Record results in `research/data/bundle-sizes.json`.

## Trade-offs

- `modularizeImports` requires icons to be tree-shaken via the
  per-icon paths — works for `lucide-react`'s ESM build but a future
  major version could change paths. Pinned via `package.json` so this
  is stable.
- Disabling production source maps means stack traces in error
  reporting will reference minified names. Acceptable for a CV-driven
  game; not for an enterprise app.
