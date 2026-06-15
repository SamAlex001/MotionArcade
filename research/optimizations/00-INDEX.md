# Optimization Index

Each optimization is recorded in its own file with the schema:

```
## Problem
## Root cause
## Fix
## Code diff summary
## Measured effect (static / runtime)
## Trade-offs / risks
```

| # | File | Targets hotspots | Expected gain |
|--:|:-----|:----------------:|:--------------|
| 1 | [01-hand-tracking-hook.md](01-hand-tracking-hook.md)  | H1, H11 | ↓ React reconciler work; one-time init only; adaptive FPS |
| 2 | [02-finger-counting.md](02-finger-counting.md)        | H2      | ~10× faster finger counting; zero allocations |
| 3 | [03-coordinate-mapping.md](03-coordinate-mapping.md)  | H3      | DOM reads collapsed from ~40/frame → 0 in steady state |
| 4 | [04-three-renderer.md](04-three-renderer.md)          | H4      | ↓ triangle count 64%; PBR shader removed from hot meshes; mobile skips PMREM |
| 5 | [05-canvas-game-loops.md](05-canvas-game-loops.md)    | H5–H10  | Gradient creates ↓ from ~62/frame to ~0 steady-state; zero `.filter` allocations |
| 6 | [06-mobile-detection.md](06-mobile-detection.md)      | H11     | No duplicate MediaPipe init on cold start |
| 7 | [07-build-and-bundle.md](07-build-and-bundle.md)      | H12     | Per-route bundle ↓ (lucide, three, mediapipe modularized) |
| 8 | [08-instrumentation.md](08-instrumentation.md)        | n/a     | Zero-overhead production / per-stage metrics in dev |

## How to read the "Expected gain" column

These are derived from code-level reasoning (operation counts, allocation
counts, shader complexity) — not yet from end-to-end runtime measurement.
The author of the accompanying paper should run the instrumented build
and complete `research/data/results.json` with the empirical numbers.
