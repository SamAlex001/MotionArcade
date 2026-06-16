# Baseline Summary

MotionArcade as shipped runs a high-bandwidth pipeline every animation frame:

```
camera frame  →  MediaPipe inference  →  21 landmarks × N hands
              →  countFingers (5 joint-angles × N hands)
              →  React setState ×3
              →  game logic  →  Canvas/WebGL render  →  paint
```

Static audit (see `hotspots.md`) identified **12 hotspots** ranked by their
contribution to per-frame cost. Five of those (H1, H4, H5, H6, H9) are on
the rendering or React-reconciliation critical path and account for the
majority of the per-frame budget on mid-range devices.

## What the codebase did right at baseline

- **Pre-allocated Three.js scene graph** — joints, bones, repulsor were
  built once, not per-frame.
- **`createLandmarkMapper` closure** was already used by the visualisation
  game to amortise the mapping setup.
- **Mobile-aware MediaPipe config** — fewer hands, lower confidence,
  smaller resolution.
- **GPU delegate with CPU fallback** — handles devices without WebGL2.

## What it got wrong (the wins this paper documents)

1. **Materials over-engineered.** `MeshPhysicalMaterial` with full
   clearcoat on 42 small joint spheres is wasted GPU work — the clearcoat
   shader is invisible at the on-screen size of a knuckle.
2. **Gradients recreated per frame.** Both Ping-Pong and Just-Show-Your-
   Hands recreate `CanvasGradient`s every rAF tick despite most of them
   being constant for the lifetime of the page.
3. **React state used as a frame signal.** Updating React state to push
   landmarks into every consumer's `useRef` re-renders the whole game
   subtree at 60 Hz. A direct shared ref is two orders of magnitude
   cheaper.
4. **Math by atan2.** Finger straightness can be determined by a dot
   product whose sign / magnitude maps to the same angular threshold —
   without ever computing the angle in degrees.
5. **DOM reads inside the inner loop.** `getVideoCanvasMapping` reads
   four DOM attributes on every call; calls are constant across most
   frames so the result is highly cacheable.

These five mistakes are not specific to MotionArcade — they are
near-universal in computer-vision-driven web apps. The fixes are
correspondingly portable and the gains generalise.
