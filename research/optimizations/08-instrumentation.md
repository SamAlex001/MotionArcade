# Optimization 08 — Instrumentation

**File**: `src/lib/perf-monitor.ts` (new)

## Why a custom monitor

`performance.mark()`/`performance.measure()` produce a measurement entry
per call which is then sampled in DevTools. At 60 fps with 8 stages,
that's ~500 entries per second — DevTools can keep up, but the
`performance` buffer overflows in ~5 minutes and the overhead of
forwarding each entry adds 50–100 ns per call.

A custom monitor lets us:

1. **Sample-cap per stage** (600 samples ≈ 10 s at 60 fps).
2. **Compute statistics in-process** (mean, p50, p95, p99, max) so the
   user only has to read a single snapshot to capture a session.
3. **No-op completely when disabled** — every method is reassigned to
   `() => {}` at construction time so the call site cost in production
   is exactly one function call.

## Activation

- `?perf=1` query parameter, **or**
- `localStorage.MA_PERF = '1'`.

When active, exposed as `window.__motionArcadePerf`.

## API

```ts
perf.mark(label)
perf.measure(label)
perf.frame(fn)          // wraps a rAF body, captures FPS + total frame ms
perf.note(label, value) // arbitrary numeric observation
perf.snapshot()         // → { fps, stages: { label: {count, mean, p50, p95, p99, max} } }
perf.reset()
```

## Where it's wired

| Stage          | Site                                                                  |
|----------------|------------------------------------------------------------------------|
| `inference`    | `src/hooks/use-hand-tracking.ts` around `detectForVideo`               |
| `three.update` | `src/app/games/just-show-your-hands/three-hand-renderer.ts#update`     |
| `three.render` | `…three-hand-renderer.ts#render`                                       |
| `draw.classic` | `…JustShowYourHandsClient.tsx` classic mode                            |
| `draw.fancy`   | `…JustShowYourHandsClient.tsx` fancy mode                              |
| `particles`    | live count via `perf.note('particles', N)`                             |
| `pong.update`  | `…PingPongClient.tsx#update`                                           |
| `pong.draw`    | `…PingPongClient.tsx#draw`                                             |

## Reading a snapshot

```js
window.__motionArcadePerf.snapshot()
// {
//   fps: 58,
//   stages: {
//     inference:    { count: 3460, mean: 5.4, p50: 5.1, p95: 8.7, p99: 12.0, max: 18.2 },
//     three.update: { count: 3460, mean: 0.7, p50: 0.6, p95: 1.0, p99: 1.4,  max: 3.1  },
//     three.render: { count: 3460, mean: 2.1, p50: 2.0, p95: 3.3, p99: 4.5,  max: 6.7  },
//     frame:        { count: 3460, mean: 9.6, p50: 9.2, p95: 13.1, p99: 17.0, max: 22.0 },
//     particles:    { count: 3460, mean: 280, p50: 290, p95: 530,  p99: 600, max: 600 },
//   },
// }
```

These numbers feed directly into `research/data/results.json`.

## Why this is itself a research contribution

The paper can describe a **portable, zero-overhead, in-app performance
sensor** for browser-based CV pipelines, distinct from the
`PerformanceObserver`-based approach that requires DevTools or a
post-processing pipeline.

## Trade-offs

- The monitor is not a profiler — it cannot tell you *why* a stage
  spiked, only that it did. For root-cause analysis, switch to
  Chrome's Performance panel for the offending segment.
- Sample cap (600) trades off recency for memory bound. At 60 fps a
  sample covers ~10 s, which is sufficient for steady-state analysis.
