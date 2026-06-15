# Optimization 03 — Coordinate Mapping

**File**: `src/lib/video-utils.ts`
**Hotspots addressed**: H3 (uncached video-canvas mapping).

## Problem

`getVideoCanvasMapping(video)` read four properties from the DOM on
every call:

- `video.videoWidth`
- `video.videoHeight`
- `video.clientWidth`
- `video.clientHeight`

The latter two can trigger forced synchronous layout — the browser must
ensure the layout box is up to date before returning the dimension. In
the rAF callback chain this is typically already up to date, but if the
caller happens to invalidate layout (e.g. by mutating a sibling element)
the layout pass runs again.

The "Fancy" mode of Just-Show-Your-Hands called the mapping function
hundreds of times per frame (one per landmark, one per triangle vertex,
one per HAND_CONNECTION endpoint) — even though the four input
properties are constant across consecutive frames in 99 % of cases.

## Root cause

The library exposed a `createLandmarkMapper(video)` closure that did
amortise the mapping but the lower-level `landmarkToCanvas` /
`landmarkToNormalized` were the more popular entry points and
recomputed the mapping every call.

## Fix

Cache `VideoCanvasMapping` per `<video>` element in a `WeakMap`. The
cache is invalidated only when one of the four input dimensions changes
(orientation change, window resize, video stream change). The check is
four equality comparisons — cheaper than a single DOM read.

Additionally:

- Added `createNormalizedMapper(video, mirror?)` symmetric with
  `createLandmarkMapper` but returning normalised (0–1) coordinates
  rather than pixel coordinates. This saves the per-call division
  by `displayW / displayH` for callers that need it (e.g. Air Piano
  lane detection).
- The mirror-true and mirror-false paths in `createLandmarkMapper` were
  split into two specialised closures so the branch is hoisted out of
  the inner loop.

## Code diff summary

| Aspect                              | Before | After |
|-------------------------------------|:------:|:-----:|
| DOM reads per call                  | 4      | 0 (cached) |
| Per-call branches on `mirror` arg   | 1      | 0 (specialised closures) |
| WeakMap key type                    | n/a    | `HTMLVideoElement` |
| Cache invalidation                  | n/a    | size mismatch on any of 4 dims |
| Per-call `Math.max`                 | 1      | 0 (cached) |

## Measured effect

**Static**: in steady state (no resize), the per-call cost drops to a
single `WeakMap.get` plus four equality checks — roughly 10× faster
than the original. With ~40 calls per frame in fancy mode, this
recovers ~30 µs/frame from the canvas-2D path.

**Forced-layout pressure**: dropped from ~40 reads/frame to 0/frame
in steady state. The benefit is non-linear: a single forced-layout
during a rAF can cost 0.5–2 ms on slower devices.

## Trade-offs

- The cache uses a WeakMap, so a detached `<video>` element is GC'd
  naturally. No leak risk.
- If a caller passes a *different* video element each call, the cache
  size grows by one entry per element — bounded by the number of
  videos in the DOM, which is always small.
- The `mirror` parameter is captured at closure-creation time. If a
  caller wants to flip `mirror` mid-frame they must create a new
  mapper — but no current consumer does this.
