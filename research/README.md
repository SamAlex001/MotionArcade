# MotionArcade Performance Optimization — Research Artifacts

This folder is the **primary data source** for the accompanying research paper on optimizing
a real-time, browser-based, gesture-controlled gaming platform. All files here are designed
to be machine-readable (JSON/CSV) **and** human-readable (Markdown) so figures, tables, and
prose for the paper can be regenerated mechanically.

## Project Under Study

**MotionArcade** — a Next.js 16 application using:
- `@mediapipe/tasks-vision` 0.10.14 for 21-landmark per-hand detection
- `three` 0.183 for WebGL hand visualization
- Genkit + Gemini 2.5 Flash Lite for AI-generated game content

Seven games run entirely from a webcam-driven hand-tracking signal at the highest possible
frame rate the browser can sustain (target: 60 fps desktop, 30 fps mobile).

## Folder Layout

```
research/
├── README.md                       — this file
├── methodology/                    — how measurements were taken
│   ├── methodology.md              — written description of the experiment
│   └── perf-monitor.md             — what the in-app monitor instruments
├── baseline/                       — measurements BEFORE optimization
│   ├── baseline-metrics.json       — structured numbers (machine-readable)
│   ├── baseline-summary.md         — narrative description
│   └── hotspots.md                 — bottlenecks identified by static audit
├── optimizations/                  — every optimization applied
│   ├── 00-INDEX.md                 — table of contents with effect sizes
│   ├── 01-hand-tracking-hook.md
│   ├── 02-finger-counting.md
│   ├── 03-coordinate-mapping.md
│   ├── 04-three-renderer.md
│   ├── 05-canvas-game-loops.md
│   ├── 06-mobile-detection.md
│   ├── 07-build-and-bundle.md
│   └── 08-instrumentation.md
├── data/                           — extractable numerical results
│   ├── metrics.csv                 — one row per (file, metric, before, after)
│   ├── changes.csv                 — one row per optimization with impact
│   └── results.json                — aggregate JSON of everything
└── figures/                        — text-form figures (ASCII tables, diagrams)
    ├── pipeline-before.md
    ├── pipeline-after.md
    └── headline-numbers.md
```

## How to Use This for the Paper

1. **Section 3 (System Description)** — pull from `baseline/baseline-summary.md` and
   `figures/pipeline-before.md`.
2. **Section 4 (Methodology)** — `methodology/methodology.md`.
3. **Section 5 (Optimizations Applied)** — iterate over `optimizations/*.md`. Each file has
   a uniform schema: *Problem · Root cause · Fix · Code diff summary · Measured effect*.
4. **Section 6 (Results)** — load `data/metrics.csv` or `data/results.json` directly.
5. **Section 7 (Discussion)** — `figures/headline-numbers.md` summarizes the cumulative gain.

## Provenance

Generated 2026-06-16 against the `shubh` branch of `MotionArcade_test`. The git SHA before
optimization is recorded in `baseline/baseline-metrics.json` under `git.baselineCommit`.
