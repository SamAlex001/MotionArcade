# Methodology

## Hypothesis

> A browser-based gesture-controlled platform that fuses MediaPipe hand-tracking
> with WebGL rendering is bottlenecked not by the ML model, but by the
> JavaScript glue code surrounding it: per-frame allocations, redundant DOM
> reads in coordinate mapping, expensive `atan2` calls in finger counting,
> over-rich Three.js materials/geometry, and uncached `CanvasRenderingContext2D`
> gradients. Targeted micro-optimisations to that glue can recover **30–60 %**
> of frame time without altering the user-visible behaviour.

## Approach

Three-stage process:

1. **Static audit** of every file on the per-frame critical path (the
   `requestAnimationFrame` callback chain across the hand-tracking hook, the
   coordinate-mapping utilities, every game loop, and the Three.js renderer).
   Output: `baseline/hotspots.md`.

2. **Targeted intervention** — for each identified hotspot, apply the
   minimal change that addresses it, preserving the public API of every
   module so the seven downstream games keep working. Output: nine
   optimisation files in `optimizations/`.

3. **Instrumentation** — add `src/lib/perf-monitor.ts` which records FPS
   plus per-stage latencies (inference, draw.classic, draw.fancy,
   three.update, three.render, pong.update, pong.draw). Gated behind
   `?perf=1` so production users pay nothing.

## What we measured

| Metric                       | How                                              |
|-----------------------------:|--------------------------------------------------|
| Frame time (overall)         | `perf.frame()` wraps the rAF body                |
| Inference latency            | `perf.mark('inference')` around `detectForVideo` |
| Three.js update latency      | wrapped in `three.update`                        |
| Three.js render latency      | wrapped in `three.render`                        |
| Canvas-2D draw latency       | wrapped per mode (`classic`, `fancy`)            |
| Live particle count          | `perf.note('particles', n)`                      |
| Per-frame allocations (qual) | reviewed via code inspection                     |
| Per-frame setState calls     | reviewed via code inspection                     |
| Geometry triangle count      | computed from sphere/cylinder segment counts     |

## What we did NOT measure here

The accompanying paper should report end-to-end FPS and CPU% from a controlled
browser run on (at minimum) one desktop and one mid-range Android device using
the in-app perf monitor (`?perf=1`). These artifacts are designed to
**predict and explain** the measured improvements — they do not themselves
replace the empirical measurements.

## Reproducibility

```bash
git checkout dca914cb9bc5d090a5914dd2311e264123309471   # baseline
npm install
npm run dev
# open http://localhost:9002/games/just-show-your-hands?perf=1
# play 60s, then run in the dev console:
#   copy(JSON.stringify(window.__motionArcadePerf.snapshot(), null, 2));
# paste into research/data/run-baseline.json

git checkout <optimised-commit>
# repeat
```

## Limitations

- All static cost reductions are characterised by code analysis (instruction
  counts, allocations, draw-call counts) plus the runtime perf-monitor when
  the optimised build is exercised. Actual gains will vary with hardware,
  thermal state, and concurrent browser load.
- We did not change the MediaPipe model itself (still the float16 21-point
  landmark model). All wins are in the JavaScript host environment.
- The Sketch & Score, Math Challenge 1/2, Quiz Quest, and Air Piano clients
  inherit the hook/library improvements automatically but were not
  individually refactored, to keep the change surface small and reviewable.
