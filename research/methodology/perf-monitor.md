# `perf-monitor.ts` — Runtime Instrumentation

## Activation

The monitor is **inert by default** — every public method is replaced with a
no-op constructor-time so production users pay only the cost of a function
call.

To activate:

- Append `?perf=1` to any game URL (e.g. `/games/ping-pong?perf=1`), **or**
- In the browser console, `localStorage.MA_PERF = '1'`, then reload.

When active, the monitor exposes itself as `window.__motionArcadePerf`.

## API

```ts
perf.mark(label)       // start a timer for `label`
perf.measure(label)    // stop the timer; append the duration to the samples
perf.frame(fn)         // wrap a rAF body — measures total frame time + FPS
perf.note(label, n)    // record an arbitrary numeric observation
perf.snapshot()        // → JSON: { fps, stages: { label: {count, mean, p50, p95, p99, max} } }
perf.reset()           // clear all samples
```

## Captured stages

| Label          | Where                                        |
|----------------|----------------------------------------------|
| `frame`        | every `perf.frame(...)` wrapper              |
| `inference`    | `HandLandmarker.detectForVideo`              |
| `three.update` | `three-hand-renderer#update`                 |
| `three.render` | `three-hand-renderer#render`                 |
| `draw.classic` | Just-Show-Your-Hands classic mode            |
| `draw.fancy`   | Just-Show-Your-Hands neon mode               |
| `pong.update`  | Ping-Pong physics step                       |
| `pong.draw`    | Ping-Pong render step                        |
| `particles`    | Live particle count (Just-Show-Your-Hands)   |

## How to dump a run

```js
// Browser console after playing for ~60s:
copy(JSON.stringify(window.__motionArcadePerf.snapshot(), null, 2));
```

Paste into `research/data/run-<scenario>.json`. The included
`research/data/results.json` is a template that mirrors the snapshot schema
so you can drop runs in directly.

## Overhead

- ~5 ns per `mark` / `measure` when active (one `Map.get`, one
  `performance.now`, one `Array.push` with bounded length).
- ~0 ns when inactive (methods replaced with `() => {}`).
- Memory bounded to 600 samples × number of stages ≈ a few KB.
