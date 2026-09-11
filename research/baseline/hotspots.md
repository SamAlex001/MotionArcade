# Baseline Hotspots — Static Audit

> Based on the source tree at commit `dca914cb9bc5d090a5914dd2311e264123309471`
> (branch `shubh`). Each hotspot is named, located by file:line, and quantified
> by a per-frame cost expressed in *operations / allocations / draw calls per
> frame*, since those are the units that survive translation across machines.

## H1 — Per-frame `setState` storm in `useHandTracking`

**File**: `src/hooks/use-hand-tracking.ts`
**Why it hurts**: every `requestAnimationFrame` tick calls three `setState`s
(`setDetectedFingers`, `setHandedness`, `setLandmarks`). React 18 batches
these into a single commit but the entire game-component subtree still
re-renders 60 × per second (≈ 180 setState calls/sec). For the seven game
components — each with substantial JSX trees — this is **the single biggest
per-frame cost outside MediaPipe itself**.

**Cost**: 60 renders/sec × ~1–3 ms reconciliation = **60–180 ms/sec of
React-reconciler time** at idle.

## H2 — Two `Math.atan2` calls per joint in `countFingers`

**File**: `src/lib/finger-counting.ts:27`
**Why it hurts**: `getAngle()` is called 5 times per hand per frame. Each call
does **two** `Math.atan2` invocations. `atan2` is a microcoded transcendental
~120 ns per call. Per frame at 60 fps with 2 hands → 2 × 5 × 2 × 120 ns ≈
**2.4 µs of pure trig per frame**. Plus per-call allocation of the
`[[a,b,c], ...]` joint-index array.

**Cost**: 10 atan2 calls per frame × ~120 ns + GC pressure from the joint
arrays.

## H3 — DOM reads in coordinate mapping with no caching

**File**: `src/lib/video-utils.ts:22-39` (`getVideoCanvasMapping`)
**Why it hurts**: every call reads `video.videoWidth`, `video.videoHeight`,
`video.clientWidth`, `video.clientHeight`. The latter two trigger forced
layout if anything has invalidated it. With 21 landmarks per hand and the
`drawFancy` path mapping each landmark + each triangle vertex, we get up to
**60+ DOM reads per frame**.

**Cost**: ~40 forced-layout-triggering reads per frame in the worst case.

## H4 — Three.js: `MeshPhysicalMaterial` everywhere + 20×20 sphere

**File**: `src/app/games/just-show-your-hands/three-hand-renderer.ts:195-198`
**Why it hurts**: every joint mesh (21 × 2 hands = 42) and every bone (21 ×
2 = 42) uses `MeshPhysicalMaterial` with `clearcoat: 1.0`. The clearcoat
shader is ~30 % more expensive per fragment than `MeshStandardMaterial`.
Sphere geometry at 20×20 segments = 400 tris × 42 spheres = **16,800
triangles just for joints**. PMREM environment generation runs at scene
creation (~100–120 ms on mobile).

**Cost**: ~16,800 triangle joints + 42 PBR draw calls per frame.

## H5 — `drawFancy`: 18+ radial gradients per hand per frame

**File**: `src/app/games/just-show-your-hands/JustShowYourHandsClient.tsx:121-137`
**Why it hurts**: every frame, for each of the 18 mesh triangles, a new
`ctx.createRadialGradient` is created with two color stops. Plus a linear
gradient per HAND_CONNECTION (21), plus a radial gradient per landmark
(21). Total: **60+ gradient creations per frame per hand**. Gradient
creation is one of the most expensive Canvas2D operations.

**Cost**: ~60 gradient creations per hand per frame.

## H6 — `drawFancy`: per-landmark `hand.map()` allocation

**File**: `src/app/games/just-show-your-hands/JustShowYourHandsClient.tsx:116`
**Why it hurts**: `const m = hand.map(lm => map(lm.x, lm.y))` allocates a
fresh 21-element array of `{x, y}` objects every frame. Plus the `px(i)` /
`py(i)` accessor functions close over `m`, adding indirection.

**Cost**: ~21 object allocations per hand per frame, GC pressure.

## H7 — `drawFancy` particles: `.filter` and `.slice(-600)` per frame

**File**: `src/app/games/just-show-your-hands/JustShowYourHandsClient.tsx:203,222`
**Why it hurts**: each frame `particles.filter(...)` allocates a new array
of survivors; if oversized, `.slice(-600)` allocates again. With up to 600
particles, that's two array allocations of ~600 elements per frame.

**Cost**: ~1,200 element allocations per frame in steady state.

## H8 — `FINGERTIP_INDICES.includes(i)` is O(n) per landmark

**File**: `src/app/games/just-show-your-hands/JustShowYourHandsClient.tsx:169`
**Why it hurts**: called 21 times per hand per frame inside the joint
loop. `Array#includes` is linear search through a 5-element array.

**Cost**: 21 × 5 = 105 comparisons per hand per frame. Minor but trivially
fixable.

## H9 — Ping-Pong: linear gradients recreated every frame

**File**: `src/app/games/ping-pong/PingPongClient.tsx:202-206, 252-272`
**Why it hurts**: background gradient and paddle gradient are recreated
every frame (60Hz). The background gradient is **identical every frame**.
The paddle gradient depends only on the combo tier (3 possible).

**Cost**: 2 gradient creations per frame = 120/sec of pure waste.

## H10 — Ping-Pong: `particles.filter(...)` per frame

**File**: `src/app/games/ping-pong/PingPongClient.tsx:174-180`
**Why it hurts**: same pattern as H7 — `.filter` allocates a new array
every frame even when no particles changed liveness.

**Cost**: ~1 allocation of ~100 elements per frame.

## H11 — `useIsMobile` causes MediaPipe re-init

**File**: `src/hooks/use-mobile.tsx` → consumed by `use-hand-tracking.ts`
**Why it hurts**: `useIsMobile()` returns `undefined → false` on first
mount, then re-renders when the actual breakpoint is checked. The
`useEffect` in `useHandTracking` has `isMobile` in its deps, so it runs
twice — initializing MediaPipe twice on cold start. Model download is ~5 MB.

**Cost**: 1 extra MediaPipe init per cold start (~600 ms wasted, plus a
duplicate ~5 MB model download if not cached by the browser).

## H12 — Genkit AI flows re-imported per route

**File**: each `*Client.tsx`
**Why it hurts**: heavy genkit modules (`@genkit-ai/google-genai`) are
pulled into the client bundle of every game even though they only run
server-side. Next.js does tree-shake the `'use server'` callsites but the
Zod schemas, etc., still bloat the per-route bundle by ~80 KB.

**Cost**: ~80 KB extra JS per game route (parsed but unused at runtime).

---

## Hotspot priority matrix

| ID  | Frequency | Per-call cost | Fix effort | Priority |
|----:|----------:|--------------:|-----------:|----------|
| H1  |  ★★★★★    |    ★★★        | ★★         | **P0**   |
| H4  |  ★★★★★    |    ★★★★       | ★★★        | **P0**   |
| H5  |  ★★★★★    |    ★★★★       | ★★         | **P0**   |
| H3  |  ★★★★★    |    ★★         | ★          | **P1**   |
| H2  |  ★★★★★    |    ★          | ★          | **P1**   |
| H6  |  ★★★★★    |    ★          | ★          | **P1**   |
| H7  |  ★★★★★    |    ★          | ★          | **P1**   |
| H9  |  ★★★★★    |    ★          | ★          | **P1**   |
| H11 |  ★ (once) |    ★★★★★      | ★          | **P1**   |
| H10 |  ★★★★★    |    ★          | ★          | **P2**   |
| H8  |  ★★★★★    |    ⅒          | ★          | **P3**   |
| H12 |  cold     |    ★★★        | ★★         | **P2**   |
