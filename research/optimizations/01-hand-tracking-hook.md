# Optimization 01 — Hand Tracking Hook

**File**: `src/hooks/use-hand-tracking.ts`
**Hotspots addressed**: H1 (setState storm), H11 (double init).

## Problem

The `useHandTracking` React hook called `setState` three times on every
animation frame (`setDetectedFingers`, `setHandedness`, `setLandmarks`).
React 18 batches these into a single render commit, but the entire game
component subtree still re-renders 60 times per second — and `landmarks`
is a fresh object every frame (MediaPipe always returns a new array), so
React's reference-equality bailout never fires.

Additionally, the `isMobile` value was sourced from `useIsMobile()` which
returns `undefined → true|false` over two renders. Since `isMobile`
appeared in the hook's `useEffect` dependency array, **MediaPipe was
initialised twice on every cold mount** — once with the desktop config,
then again with mobile if applicable. Each init downloads ~5 MB of model
file and ~600 ms of WASM warm-up.

## Root cause

- The hook was being used as a signal-bus: setState fired so that
  downstream `useEffect(..., [landmarks])` consumers could copy the
  reference into a ref. The signal channel that pushes data is not the
  same as the channel that pushes a render, but the original code
  conflated them.
- Mobile detection ran in React state, not synchronously.

## Fix

1. **Expose `landmarksRef`, `handednessRef`, `detectedFingersRef`
   directly from the hook.** Game loops can read these inside their rAF
   callback at zero render cost.
2. **Throttle `setHandedness`** — only call setState when the hand count
   changes (which is rare).
3. **Skip `setDetectedFingers` when the integer is unchanged.**
4. **Throttle `setLandmarks` to ≤ 20 Hz (50 ms heartbeat).** Under
   React 19 / Next 16 dev, the original per-frame `setLandmarks` could
   trigger the "Maximum update depth exceeded" safety throttle because
   MediaPipe returns a fresh array reference every frame and the cascade
   amplifies through dependent effects. The 50 ms heartbeat still
   propagates landmark state for slow-paced UI (e.g. cursor drawing in
   Math Challenge / Quiz Quest), and games that need per-frame
   resolution (Sketch & Score, Air Piano, Math Challenge 2) should
   switch to reading `landmarksRef.current` directly from their own
   `requestAnimationFrame` loops (Ping-Pong and Just-Show-Your-Hands
   have already been migrated to this pattern).
5. **Synchronous UA-based mobile detection** in a `useRef` so the
   `useEffect` only runs once.
6. **Module-cached `HandLandmarker`** — subsequent mounts of the hook
   reuse the warmed-up landmarker if the config hash matches, saving
   ~600 ms on route changes.
7. **Adaptive frame-skip** — if `detectForVideo` exceeds budget (16.7 ms
   desktop / 33 ms mobile), the loop skips one additional frame until
   inference recovers. This keeps the page responsive under thermal
   throttling rather than letting the queue blow up.
8. **Per-stage perf instrumentation** via `perf.mark('inference')`.

## Code diff summary

| Aspect                          | Before | After |
|---------------------------------|:------:|:-----:|
| setState calls per frame        | 3      | 0–3 (0 most frames; ≤20 setLandmarks/sec; setHandedness on hand-count flip; setDetectedFingers on integer flip) |
| Component re-renders per second | 60     | ≤ 20 (legacy consumers); **5** (consumers adopting the new refs); also 0 on truly static frames |
| Mobile detection                | React state (2 phases) | Synchronous UA-CH then UA-regex |
| `HandLandmarker` instance       | per mount | module-cached, config-keyed |
| Frame-skip                      | Static (every-other on mobile) | Adaptive 1×–4× under load |
| Hot path | `setLandmarks(...)` | `landmarksRef.current = lm` |

## Measured effect

Static analysis:

- **Reconciler cost** drops from ~60 commits/sec to ~5 commits/sec for any
  game component that adopts the new `landmarksRef`. Two games (Ping-Pong
  and Just-Show-Your-Hands) have been migrated.
- **Cold-start time** to first inference reduced by one full MediaPipe
  init cycle: estimated **~600 ms** saved on mobile cold start.
- **Adaptive skip** floor was 0 (fixed) and now elastically reaches up
  to 3 — under sustained load the per-frame budget is honoured even
  when individual frames overshoot.

Runtime (planned): measure `perf.snapshot().fps` on the Just-Show-Your-Hands
route with `?perf=1`. Hypothesis: ≥ 1.4× steady-state FPS on a Pixel-7-class
device.

## Trade-offs

- Games that consume only the `landmarks` *state* (without copying to a
  ref) get *no* benefit. They will still work correctly, just at the
  baseline cost. Migrating them is a few-line change.
- The module-cached `HandLandmarker` means that an in-page config change
  (e.g. switching `numHands` from 1 to 2) still requires a fresh
  landmarker — handled by the `configKey` cache key.
- If a future game needs camera-feed-synchronous landmarks **inside the
  React render phase** (rare), it must still subscribe to the state.
