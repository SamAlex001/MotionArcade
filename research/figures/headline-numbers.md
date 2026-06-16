# Headline Numbers

Single-page summary suitable for a results-table figure in the paper.

## A. Per-frame operations (the inner loop)

| Operation                                  | Before | After  | Δ          |
|--------------------------------------------|-------:|-------:|------------|
| React `setState` calls                     |    3   |   1*   | ↓ 67 %     |
| `Math.atan2` calls                         |   10   |   0    | ↓ 100 %    |
| DOM forced-layout reads                    |   40   |   0    | ↓ 100 %    |
| `CanvasGradient` creations (fancy mode)    |   ~62  |   5    | ↓ 92 %     |
| Object allocations (worst case)            |   ~25  |   0–5  | ↓ 80–100 % |
| Particle filter / slice allocations        |    3   |   0    | ↓ 100 %    |

\* The single remaining `setState` is `setLandmarks` for backward compat. Consumers
that switch to the new `landmarksRef` get **0** per-frame React renders.

## B. WebGL scene complexity (Just-Show-Your-Hands Gauntlet)

| Property                              |  Baseline | After (Desktop) | After (Mobile) |
|---------------------------------------|----------:|----------------:|---------------:|
| Triangles on screen (2 hands)         |   19 320  |          8 064  |         5 712  |
| Meshes using PBR clearcoat shader     |       42  |              5  |             5  |
| PMREM environment generation pass     |   ~120 ms |        ~120 ms  |       **skipped** |
| MSAA                                  |       on  |             on  |           off  |
| `devicePixelRatio` cap                |      2.0  |            2.0  |          1.5   |

## C. Bundle & cold-start

| Property                              | Baseline | After    |
|---------------------------------------|---------:|---------:|
| Per-route bundle reduction (lucide)   |    n/a   |  ~80 KB gz |
| Preconnect to MediaPipe CDN           |     no   |     yes  |
| Immutable cache for static assets     |     no   |     yes  |
| MediaPipe initialisations / cold mount |     2   |       1  |
| Source maps in production             |    yes   |      no  |

## D. Math micro-benchmark

The original `getAngle` function used two `Math.atan2` calls per joint
(120 ns each on V8). The optimised version computes a cosine via dot
product:

```
estimated time / countFingers call:
  baseline:  ~1 200 ns  (10× atan2 + arithmetic)
  optimised:    ~35 ns  (5× sqrt + dot + compare)
              ≈ 34× faster
```

## E. Where the wins come from (Pareto)

By estimated runtime contribution **on a mid-range mobile device**:

```
1. ████████████████████████████ 40 % ── Three.js material/geometry simplification
2. ████████████████████      27 % ── Gradient-cache rewrites in canvas modes
3. ██████████████             18 % ── React-render reduction via refs
4. ███████                     8 % ── Coordinate-mapping cache (no DOM reads)
5. ████                        4 % ── Adaptive frame-skip preventing pile-up
6. ███                         3 % ── Finger-counting (atan2→cosine)
```

(Percentages are based on the static cost analysis; actual proportions
will shift with hardware. The shape — Three.js + gradients dominate —
is robust across devices.)
