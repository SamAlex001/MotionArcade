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


'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Hand, Loader, Sparkles } from 'lucide-react';
import type { Landmark } from '@mediapipe/tasks-vision';
import * as ThreeHand from './three-hand-renderer';
import { createLandmarkMapper } from '@/lib/video-utils';
import { perf } from '@/lib/perf-monitor';

// ─── Hand topology ───────────────────────────────────────────────
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

// Triangulated mesh covering palm + finger webbing
const MESH_TRIANGLES: [number, number, number][] = [
  [0, 1, 5], [0, 5, 9], [0, 9, 13], [0, 13, 17],
  [1, 2, 5], [2, 5, 6],
  [5, 9, 6], [6, 9, 10],
  [9, 13, 10], [10, 13, 14],
  [13, 17, 14], [14, 17, 18],
  [6, 7, 10], [7, 10, 11],
  [10, 11, 14], [11, 14, 15],
  [14, 15, 18], [15, 18, 19],
];

const FINGERTIP_INDICES: readonly number[] = [4, 8, 12, 16, 20];
const FINGERTIP_SET = new Set(FINGERTIP_INDICES);
const MAX_PARTICLES_DESKTOP = 600;
const MAX_PARTICLES_MOBILE  = 200;

// ─── Particle system ─────────────────────────────────────────────
type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number; hue: number;
};

// ─── Depth helpers ───────────────────────────────────────────────
function depthNorm(z: number): number {
  const n = (Math.abs(z) - 0.01) / 0.29;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function depthHue(z: number): number {
  return 180 + (1 - depthNorm(z)) * 120;
}
function depthAlpha(z: number): number {
  return 0.35 + (1 - depthNorm(z)) * 0.65;
}
function scaleWithDepth(z: number, min: number, max: number): number {
  return min + (1 - depthNorm(z)) * (max - min);
}

type CoordMapper = (lx: number, ly: number) => { x: number; y: number };

// ─── Classic draw (original simple skeleton) ─────────────────────
function drawClassic(ctx: CanvasRenderingContext2D, W: number, H: number, hands: Landmark[][], map: CoordMapper) {
  ctx.clearRect(0, 0, W, H);
  if (hands.length === 0) return;

  for (let hi = 0; hi < hands.length; hi++) {
    const hand = hands[hi];
    // Pre-map all 21 landmarks into reusable typed arrays (no allocations).
    for (let i = 0; i < 21; i++) {
      const lm = hand[i];
      if (!lm) continue;
      const p = map(lm.x, lm.y);
      _mappedX[i] = p.x;
      _mappedY[i] = p.y;
    }

    // Connectors
    ctx.strokeStyle = '#34d399';
    for (let ci = 0; ci < HAND_CONNECTIONS.length; ci++) {
      const c = HAND_CONNECTIONS[ci];
      const si = c[0], ei = c[1];
      const s = hand[si], e = hand[ei];
      if (!s || !e) continue;
      ctx.lineWidth = scaleWithDepth((s.z + e.z) / 2, 1, 6);
      ctx.beginPath();
      ctx.moveTo(_mappedX[si], _mappedY[si]);
      ctx.lineTo(_mappedX[ei], _mappedY[ei]);
      ctx.stroke();
    }

    // Landmarks
    ctx.fillStyle = '#2dd4bf';
    for (let i = 0; i < 21; i++) {
      const lm = hand[i];
      if (!lm) continue;
      const r = scaleWithDepth(lm.z, 2, 8);
      ctx.beginPath();
      ctx.arc(_mappedX[i], _mappedY[i], r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Reusable per-frame buffers so drawFancy doesn't allocate per call.
const _mappedX = new Float32Array(21);
const _mappedY = new Float32Array(21);

// ─── Fancy draw (mesh + glow + particles) ────────────────────────
//
// Optimizations vs. original:
//   • Landmark mapping is done into reusable typed arrays (no `hand.map`
//     allocation per frame).
//   • Triangle/joint colors use cached hsla strings via the helper below
//     to avoid building 18+ gradients each frame — gradients are the
//     #1 cost in the original implementation.
//   • Flat fills replace radial/linear gradients in the most expensive
//     places.  Visual difference at 60 fps is barely perceptible.
//   • Particle list is mutated in place (no `.filter` allocation).
function drawFancy(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  hands: Landmark[][], timestamp: number, dt: number,
  particles: Particle[], map: CoordMapper,
  maxParticles: number,
): Particle[] {
  // Motion blur fade
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.004);

  if (hands.length > 0) {
    for (let hi = 0; hi < hands.length; hi++) {
      const hand = hands[hi];
      // Pre-map landmarks once into typed arrays
      for (let i = 0; i < 21; i++) {
        const lm = hand[i];
        if (!lm) continue;
        const p = map(lm.x, lm.y);
        _mappedX[i] = p.x;
        _mappedY[i] = p.y;
      }

      // 1. Mesh fill — flat HSL fill (no radial gradient).
      for (let ti = 0; ti < MESH_TRIANGLES.length; ti++) {
        const tri = MESH_TRIANGLES[ti];
        const a = tri[0], b = tri[1], c = tri[2];
        const z = (hand[a].z + hand[b].z + hand[c].z) / 3;
        const hue = depthHue(z);
        const alpha = depthAlpha(z) * 0.3;
        ctx.beginPath();
        ctx.moveTo(_mappedX[a], _mappedY[a]);
        ctx.lineTo(_mappedX[b], _mappedY[b]);
        ctx.lineTo(_mappedX[c], _mappedY[c]);
        ctx.closePath();
        ctx.fillStyle = `hsla(${hue | 0}, 100%, 65%, ${(alpha + 0.12).toFixed(2)})`;
        ctx.fill();
      }

      // 2. Neon wireframe — every stroke() with an active shadow pays the
      // full blur cost, so the glow now comes from ONE shadowed stroke over a
      // combined path of all 21 connections; the per-segment colored lines
      // are drawn on top without shadow (cheap).
      const midZ = (hand[0].z + hand[9].z + hand[12].z) / 3;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.shadowColor = `hsla(174, 100%, 70%, 0.9)`;
      ctx.shadowBlur = 12 + pulse * 6;
      ctx.strokeStyle = `hsla(${depthHue(midZ) | 0}, 100%, 70%, ${depthAlpha(midZ).toFixed(2)})`;
      ctx.lineWidth = scaleWithDepth(midZ, 1.5, 5);
      ctx.beginPath();
      for (let ci = 0; ci < HAND_CONNECTIONS.length; ci++) {
        const conn = HAND_CONNECTIONS[ci];
        const si = conn[0], ei = conn[1];
        if (!hand[si] || !hand[ei]) continue;
        ctx.moveTo(_mappedX[si], _mappedY[si]);
        ctx.lineTo(_mappedX[ei], _mappedY[ei]);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      for (let ci = 0; ci < HAND_CONNECTIONS.length; ci++) {
        const conn = HAND_CONNECTIONS[ci];
        const si = conn[0], ei = conn[1];
        const s = hand[si], e = hand[ei];
        if (!s || !e) continue;
        const z = (s.z + e.z) / 2;
        const hue = depthHue(z) | 0;
        const alpha = depthAlpha(z);
        ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${alpha.toFixed(2)})`;
        ctx.lineWidth = scaleWithDepth(z, 1.5, 5);
        ctx.beginPath();
        ctx.moveTo(_mappedX[si], _mappedY[si]);
        ctx.lineTo(_mappedX[ei], _mappedY[ei]);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Joint orbs — halo + core flat fills. Per-joint save/restore +
      // shadowBlur + per-frame radial gradients dominated frame cost; a
      // larger low-alpha halo behind a bright core reads the same at 60fps.
      for (let i = 0; i < 21; i++) {
        const p = hand[i];
        const x = _mappedX[i], y = _mappedY[i];
        const hue = depthHue(p.z) | 0;
        const baseR = scaleWithDepth(p.z, 3, 9);
        const isTip = FINGERTIP_SET.has(i);
        if (isTip) {
          const orbR = baseR * (1.2 + pulse * 0.4);
          ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.35)`;
          ctx.beginPath();
          ctx.arc(x, y, orbR * 1.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `hsla(${hue}, 100%, 92%, 0.95)`;
          ctx.beginPath();
          ctx.arc(x, y, orbR, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.3)`;
          ctx.beginPath();
          ctx.arc(x, y, baseR * 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `hsla(${hue}, 100%, 75%, 0.9)`;
          ctx.beginPath();
          ctx.arc(x, y, baseR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. Spawn particles (only if under budget)
      if (particles.length < maxParticles - 10) {
        for (let f = 0; f < FINGERTIP_INDICES.length; f++) {
          const ti = FINGERTIP_INDICES[f];
          const x = _mappedX[ti], y = _mappedY[ti];
          for (let n = 0; n < 2; n++) {
            particles.push({
              x, y,
              vx: (Math.random() - 0.5) * 1.5,
              vy: (Math.random() - 0.5) * 1.5 - 0.5,
              life: 1, maxLife: 1,
              size: 1.5 + Math.random() * 2.5,
              hue: depthHue(hand[ti].z) + (Math.random() - 0.5) * 40,
            });
          }
        }
      }
    }
  }

  // 5. Update & draw particles — in-place compaction (no new array).
  // Additive blending ('lighter') gives the glow; per-particle shadowBlur
  // was by far the most expensive operation in the whole frame (hundreds of
  // shadowed arcs per frame → the lag users saw).
  let write = 0;
  ctx.globalCompositeOperation = 'lighter';
  for (let read = 0; read < particles.length; read++) {
    const p = particles[read];
    p.life -= dt * 0.0015;
    if (p.life <= 0) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.01;
    particles[write++] = p;
    const t = p.life / p.maxLife;
    const hue = p.hue | 0;
    ctx.globalAlpha = t * 0.8;
    ctx.fillStyle = `hsla(${hue}, 100%, 75%, ${t.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
    ctx.fill();
  }
  particles.length = write;
  if (write > maxParticles) particles.splice(0, write - maxParticles);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return particles;
}

// ─── Visual modes ────────────────────────────────────────────────
type VisualMode = 'classic' | 'fancy' | 'mesh';

// ─── Component ───────────────────────────────────────────────────
export default function JustShowYourHandsClient() {
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [visualMode, setVisualMode] = useState<VisualMode>('classic');
  const { videoRef, landmarks, landmarksRef: hookLandmarksRef, detectedFingers, startVideo, stopVideo, isLoading, error } = useHandTracking();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const threeStateRef = useRef<ThreeHand.ThreeHandScene | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const visualModeRef = useRef<VisualMode>('classic');
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  // Sync refs (visual mode only — landmarks come from the hook's ref now)
  useEffect(() => { visualModeRef.current = visualMode; }, [visualMode]);

  // Detect mobile synchronously to size particle budget.
  const maxParticlesRef = useRef<number>(MAX_PARTICLES_DESKTOP);
  if (typeof navigator !== 'undefined' && maxParticlesRef.current === MAX_PARTICLES_DESKTOP) {
    const ua = (navigator as any).userAgentData;
    const isMobile = ua?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    maxParticlesRef.current = isMobile ? MAX_PARTICLES_MOBILE : MAX_PARTICLES_DESKTOP;
  }

  const startGame = useCallback(async () => {
    setIsGameStarted(true);
  }, []);

  useEffect(() => {
    if (isGameStarted) {
      startVideo().catch(() => setIsGameStarted(false));
    }
  }, [isGameStarted, startVideo]);

  const handleBack = () => {
    stopVideo();
    cancelAnimationFrame(animRef.current);
    if (threeStateRef.current) {
      ThreeHand.dispose(threeStateRef.current);
      threeStateRef.current = null;
    }
    setIsGameStarted(false);
  };

  // ─── Render loop ────────────────────────────────────────────
  useEffect(() => {
    if (!isGameStarted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = (timestamp: number) => {
      const video = videoRef.current;
      if (!video || !canvas) { animRef.current = requestAnimationFrame(draw); return; }

      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) { animRef.current = requestAnimationFrame(draw); return; }

      perf.frame(() => {
        const W = canvas.width;
        const H = canvas.height;
        const dt = timestamp - (timeRef.current || timestamp);
        timeRef.current = timestamp;

        const hands = hookLandmarksRef.current;
        const mode = visualModeRef.current;

        if (mode === 'mesh') {
          ctx.clearRect(0, 0, W, H);
          particlesRef.current.length = 0;
          const tc = threeCanvasRef.current;
          if (tc) {
            if (!threeStateRef.current) {
              threeStateRef.current = ThreeHand.createScene(tc, W, H);
            }
            if (tc.width !== W || tc.height !== H) {
              tc.width = W;
              tc.height = H;
              ThreeHand.resize(threeStateRef.current, W, H);
            }
            ThreeHand.update(threeStateRef.current, hands, timestamp);
            ThreeHand.render(threeStateRef.current);
          }
        } else if (mode === 'fancy') {
          perf.mark('draw.fancy');
          const mapper = createLandmarkMapper(video);
          drawFancy(ctx, W, H, hands, timestamp, dt, particlesRef.current, mapper, maxParticlesRef.current);
          perf.measure('draw.fancy');
          perf.note('particles', particlesRef.current.length);
        } else {
          perf.mark('draw.classic');
          if (particlesRef.current.length) particlesRef.current.length = 0;
          const mapper = createLandmarkMapper(video);
          drawClassic(ctx, W, H, hands, mapper);
          perf.measure('draw.classic');
        }
      });

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      if (threeStateRef.current) {
        ThreeHand.dispose(threeStateRef.current);
        threeStateRef.current = null;
      }
    };
  }, [isGameStarted, videoRef]);

  // ─── Screens ────────────────────────────────────────────────
  if (!isGameStarted) {
    return (
      <div className="container mx-auto px-4 py-4 lg:py-8 flex flex-col items-center justify-start lg:justify-center flex-grow">
        <Card className="max-w-md text-center rounded-2xl border-2 border-emerald-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-emerald-500/40 text-white">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-400/40 bg-emerald-500/15 text-emerald-400">
              <Hand className="h-10 w-10" />
            </div>
            <CardTitle className="font-headline font-bold text-3xl text-white"><span className="text-emerald-400">Hand</span> Tracking Demo</CardTitle>
            <CardDescription className="text-white/70 pt-2">
              See real-time hand tracking with three visual modes: Classic skeleton, Neon glow, and dense 3D Mesh wireframe.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button onClick={startGame} size="lg" className="rounded-xl border-2 border-white/80 bg-emerald-500 font-headline font-bold text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-emerald-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]">Start Demo</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-4 lg:py-8 flex flex-col items-center justify-start lg:justify-center flex-grow">
      <div className={`w-full max-w-4xl aspect-[3/4] lg:aspect-video relative rounded-2xl border-2 border-emerald-400/50 shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-emerald-500/30 overflow-hidden ${visualMode === 'classic' ? 'bg-black' : 'bg-black'}`}>
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className={`absolute top-0 left-0 w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${visualMode === 'classic' ? 'opacity-100' : visualMode === 'fancy' ? 'opacity-40' : 'opacity-50'}`}
        />
        <canvas ref={canvasRef} className={`absolute top-0 left-0 w-full h-full pointer-events-none ${visualMode === 'mesh' ? 'hidden' : ''}`} />
        <canvas ref={threeCanvasRef} className={`absolute top-0 left-0 w-full h-full pointer-events-none ${visualMode !== 'mesh' ? 'hidden' : ''}`} />

        {(isLoading || (error && !videoRef.current?.srcObject)) && (
          <div className="absolute inset-0 bg-black/60 flex flex-col gap-4 items-center justify-center rounded-lg text-white z-30">
            <Loader className="h-16 w-16 animate-spin text-emerald-400" />
            <p className="font-headline font-bold text-3xl">{isLoading ? 'Loading Model...' : 'Waiting for Camera...'}</p>
          </div>
        )}

        {error && (
          <div className="absolute top-4 left-4 right-4 rounded-2xl border-2 border-red-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-red-500/40 text-red-400 p-4 z-20">
            <p className="font-headline font-bold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center z-20">
          <Card className="rounded-full border-2 border-white/20 bg-black/60 backdrop-blur py-1.5 px-5 flex items-center gap-3 text-white">
            {visualMode === 'fancy' ? <Sparkles className="h-4 w-4 text-emerald-400" /> : <Hand className="h-4 w-4 text-emerald-400" />}
            <p className="font-headline font-bold text-lg">
              {landmarks.length > 0
                ? `${landmarks.length} hand${landmarks.length > 1 ? 's' : ''} detected \u2022 ${detectedFingers} finger${detectedFingers !== 1 ? 's' : ''}`
                : 'Show your hands to the camera'}
            </p>
          </Card>
        </div>

        {/* Top controls */}
        <div className="absolute top-4 left-4 right-4 flex justify-between z-20">
          <Button variant="secondary" onClick={handleBack} className="rounded-xl border-2 border-white/40 bg-white/10 font-headline font-bold text-white backdrop-blur transition-all hover:bg-white/20">Back to Start</Button>
          <Button
            variant={visualMode !== 'classic' ? 'default' : 'secondary'}
            onClick={() => setVisualMode(m => m === 'classic' ? 'fancy' : m === 'fancy' ? 'mesh' : 'classic')}
            className={`flex items-center gap-2 rounded-xl border-2 font-headline font-bold text-white backdrop-blur transition-all ${visualMode !== 'classic' ? 'border-white/80 bg-emerald-500 shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] hover:translate-y-[2px] hover:bg-emerald-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]' : 'border-white/40 bg-white/10 hover:bg-white/20'}`}
          >
            <Sparkles className="h-4 w-4" />
            {visualMode === 'classic' ? 'Classic' : visualMode === 'fancy' ? 'Neon' : 'Gauntlet'}
          </Button>
        </div>
      </div>

      {/* Instructions */}
      <div className="w-full max-w-4xl mt-6 p-6 rounded-2xl border-2 border-emerald-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-emerald-500/40">
        <h3 className="text-xl font-headline font-bold text-emerald-400 mb-3">How it Works</h3>
        <ul className="text-gray-300 space-y-2">
          <li>✋ Hold your hands up to the camera to see them tracked in real-time</li>
          <li>✨ Toggle between Classic, Neon, and Gauntlet visual modes at the top right</li>
          <li>🎯 Watch how the app accurately detects your fingers and hand joints</li>
          <li>💡 Move your hands closer or further to see the depth effects!</li>
        </ul>
      </div>
    </div>
  );
}
