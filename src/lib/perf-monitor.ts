/**
 * MotionArcade — touchless AR arcade gaming platform
 * Copyright (C) 2025-2026 Kartik Hawelikar, Sam Alex, Shubham Bolave, and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Lightweight runtime performance monitor.
 *
 * Records per-frame timings and emits aggregated stats (FPS, p50/p95/p99 of
 * per-stage latencies, allocation pressure) without itself becoming a hot path.
 *
 * Enabled when `?perf=1` is in the URL or `localStorage.MA_PERF === '1'`.
 * Otherwise every call is a near-zero-cost no-op so production users pay
 * nothing.
 *
 * Usage:
 *
 *     import { perf } from '@/lib/perf-monitor';
 *     perf.frame(() => {
 *       perf.mark('detect');
 *       handLandmarker.detectForVideo(video, t);
 *       perf.measure('detect');
 *
 *       perf.mark('draw');
 *       drawScene();
 *       perf.measure('draw');
 *     });
 *
 *     // Anywhere: console.table(perf.snapshot());
 *
 * `perf.snapshot()` returns a stable JSON-serialisable object suitable for
 * piping into the research/data/*.json files.
 */

type StageStats = {
  count: number;
  /** Reservoir of the most recent samples in milliseconds. */
  samples: number[];
};

const MAX_SAMPLES = 600;          // ~10 seconds at 60 fps
const FPS_WINDOW   = 1000;        // 1-second sliding window
const NOOP         = () => {};

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof window.location !== 'undefined' &&
        window.location.search.includes('perf=1')) return true;
    if (typeof window.localStorage !== 'undefined' &&
        window.localStorage.getItem('MA_PERF') === '1') return true;
  } catch {
    /* ignore (e.g. sandboxed) */
  }
  return false;
}

class PerfMonitor {
  readonly enabled: boolean;
  private readonly stages = new Map<string, StageStats>();
  private readonly active = new Map<string, number>();
  /** Frame timestamps (performance.now ms) for FPS calculation. */
  private readonly frameTs: number[] = [];
  private lastFrameStart = 0;

  // Stage label-name reused in measure() to avoid allocating strings.
  // Pre-allocate a small pool for the most common stages.
  private readonly stageCache: Record<string, StageStats> = {};

  constructor() {
    this.enabled = isEnabled();
    if (!this.enabled) {
      // Replace methods with no-ops so call sites pay only a function-call cost.
      this.mark    = NOOP as any;
      this.measure = NOOP as any;
      this.frame   = (fn: () => void) => fn();
      this.note    = NOOP as any;
      // snapshot() still returns a valid (empty) object.
    } else if (typeof window !== 'undefined') {
      (window as any).__motionArcadePerf = this;
    }
  }

  mark(label: string): void {
    this.active.set(label, performance.now());
  }

  measure(label: string): void {
    const start = this.active.get(label);
    if (start === undefined) return;
    const dt = performance.now() - start;
    let s = this.stageCache[label];
    if (!s) {
      s = this.stages.get(label) ?? { count: 0, samples: [] };
      this.stages.set(label, s);
      this.stageCache[label] = s;
    }
    s.count++;
    if (s.samples.length >= MAX_SAMPLES) s.samples.shift();
    s.samples.push(dt);
  }

  /** Wraps a frame; measures total frame time and tracks FPS. */
  frame(fn: () => void): void {
    const start = performance.now();
    this.lastFrameStart = start;
    fn();
    const end = performance.now();
    // Track FPS via sliding window of timestamps.
    this.frameTs.push(end);
    const cutoff = end - FPS_WINDOW;
    while (this.frameTs.length > 0 && this.frameTs[0] < cutoff) {
      this.frameTs.shift();
    }
    // Record frame latency as the "frame" stage.
    this.recordStage('frame', end - start);
  }

  private recordStage(label: string, dt: number): void {
    let s = this.stageCache[label];
    if (!s) {
      s = this.stages.get(label) ?? { count: 0, samples: [] };
      this.stages.set(label, s);
      this.stageCache[label] = s;
    }
    s.count++;
    if (s.samples.length >= MAX_SAMPLES) s.samples.shift();
    s.samples.push(dt);
  }

  /** Record an arbitrary numeric observation (e.g. live particle count). */
  note(label: string, value: number): void {
    this.recordStage(label, value);
  }

  /** Estimated frames per second over the last `FPS_WINDOW` ms. */
  fps(): number {
    return this.frameTs.length;
  }

  snapshot(): Record<string, any> {
    const out: Record<string, any> = { fps: this.fps(), stages: {} };
    for (const [label, s] of this.stages) {
      out.stages[label] = summarise(s.samples, s.count);
    }
    return out;
  }

  reset(): void {
    this.stages.clear();
    this.active.clear();
    this.frameTs.length = 0;
    for (const k of Object.keys(this.stageCache)) delete this.stageCache[k];
  }
}

function summarise(samples: number[], count: number) {
  if (samples.length === 0) return { count, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = samples.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    count,
    mean: round(sum / sorted.length),
    p50: round(at(0.50)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(sorted[sorted.length - 1]),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export const perf = new PerfMonitor();
