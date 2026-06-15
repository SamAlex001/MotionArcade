# Optimization 06 — Mobile Detection

**Files**: `src/hooks/use-hand-tracking.ts`,
`src/app/games/just-show-your-hands/three-hand-renderer.ts`,
`src/app/games/just-show-your-hands/JustShowYourHandsClient.tsx`
**Hotspots addressed**: H11.

## Problem

The original `useIsMobile()` hook stored `isMobile` in React state. On
mount it returned `undefined` (cast to `false` by the consumer), then
re-rendered with the actual breakpoint value. Because the
`useHandTracking` `useEffect` had `isMobile` in its dependency array,
**MediaPipe was initialised twice** on every cold mount of any game
page:

1. First with `numHands: 2, conf: 0.5` (desktop defaults).
2. Then with `numHands: 1, conf: 0.4` (mobile) — if the device is mobile.

Each init downloads the ~5 MB model file (often cached by the browser,
but not guaranteed), then runs the WASM warm-up (~600 ms even from
cache). On mobile, this duplicated work was directly responsible for
the user-visible "Loading…" state lasting longer than necessary.

## Fix

Detect mobile **synchronously** during initial render using the
UA-Client-Hints (`navigator.userAgentData.mobile`) with a UA-regex
fallback:

```ts
function detectMobileSync(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uad = (navigator as any).userAgentData;
  if (uad && typeof uad.mobile === 'boolean') return uad.mobile;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
```

Store the result in a `useRef` initialised on first render (no state,
no re-render). The `useEffect` that creates the `HandLandmarker` no
longer depends on `isMobile` — it reads from the ref.

The same logic is duplicated in `three-hand-renderer.ts#detectMobile()`
and in `JustShowYourHandsClient` (for particle budget). Each is a
4-line function — the duplication is cheaper than the cross-package
coupling would be.

## Trade-offs

- `userAgentData.mobile` is unsupported in Safari (as of 2026).
  Falls back to the regex, which correctly identifies iPhones / iPads.
- The breakpoint-based `useIsMobile()` hook is still used by *layout*
  components (e.g. choosing portrait/landscape aspect ratios). That use
  is fine — it's correctly placed in React state because layout
  *should* re-render on viewport change.
- Browsers that fail both UA-CH and the regex (rare) default to
  desktop — same as the original behaviour.

## Measured effect

**Static**: 1 fewer MediaPipe init per cold mount on mobile.
~600 ms of WASM warm-up saved, plus 1 fewer 5 MB model download in the
worst case (browser cache miss).
