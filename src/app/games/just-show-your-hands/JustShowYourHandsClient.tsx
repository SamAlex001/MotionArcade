
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Hand, Loader, Sparkles } from 'lucide-react';
import type { Landmark } from '@mediapipe/tasks-vision';
import * as ThreeHand from './three-hand-renderer';

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

const FINGERTIP_INDICES = [4, 8, 12, 16, 20];

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
  return Math.max(0, Math.min(1, n));
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
function avgZ(lm: Landmark[], indices: number[]): number {
  let s = 0;
  for (const i of indices) s += lm[i].z;
  return s / indices.length;
}

// ─── Classic draw (original simple skeleton) ─────────────────────
function drawClassic(ctx: CanvasRenderingContext2D, W: number, H: number, hands: Landmark[][]) {
  ctx.clearRect(0, 0, W, H);
  if (hands.length === 0) return;

  for (const hand of hands) {
    // Connectors
    ctx.strokeStyle = '#34d399'; // Emerald-400
    for (const [si, ei] of HAND_CONNECTIONS) {
      const s = hand[si];
      const e = hand[ei];
      if (!s || !e) continue;
      const sx = (1 - s.x) * W, sy = s.y * H;
      const ex = (1 - e.x) * W, ey = e.y * H;
      const az = (s.z + e.z) / 2;
      ctx.lineWidth = scaleWithDepth(az, 1, 6);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // Landmarks
    ctx.fillStyle = '#a78bfa'; // Violet-400
    for (const point of hand) {
      const x = (1 - point.x) * W;
      const y = point.y * H;
      const r = scaleWithDepth(point.z, 2, 8);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ─── Fancy draw (mesh + glow + particles) ────────────────────────
function drawFancy(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  hands: Landmark[][], timestamp: number, dt: number,
  particles: Particle[]
): Particle[] {
  // Motion blur fade
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.004);

  if (hands.length > 0) {
    for (const hand of hands) {
      const px = (i: number) => (1 - hand[i].x) * W;
      const py = (i: number) => hand[i].y * H;

      // 1. Mesh fill
      for (const [a, b, c] of MESH_TRIANGLES) {
        const z = avgZ(hand, [a, b, c]);
        const hue = depthHue(z);
        const alpha = depthAlpha(z) * 0.3;
        ctx.beginPath();
        ctx.moveTo(px(a), py(a));
        ctx.lineTo(px(b), py(b));
        ctx.lineTo(px(c), py(c));
        ctx.closePath();
        const cx = (px(a) + px(b) + px(c)) / 3;
        const cy = (py(a) + py(b) + py(c)) / 3;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
        grad.addColorStop(0, `hsla(${hue}, 100%, 70%, ${alpha + 0.12})`);
        grad.addColorStop(1, `hsla(${hue + 30}, 90%, 50%, ${alpha * 0.5})`);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // 2. Neon wireframe
      ctx.save();
      ctx.shadowColor = `hsla(280, 100%, 70%, 0.9)`;
      ctx.shadowBlur = 12 + pulse * 6;
      for (const [si, ei] of HAND_CONNECTIONS) {
        const s = hand[si], e = hand[ei];
        if (!s || !e) continue;
        const z = (s.z + e.z) / 2;
        const hue = depthHue(z);
        const alpha = depthAlpha(z);
        const lw = scaleWithDepth(z, 1.5, 5);
        const grad = ctx.createLinearGradient(px(si), py(si), px(ei), py(ei));
        grad.addColorStop(0, `hsla(${hue}, 100%, 75%, ${alpha})`);
        grad.addColorStop(1, `hsla(${hue + 40}, 100%, 65%, ${alpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px(si), py(si));
        ctx.lineTo(px(ei), py(ei));
        ctx.stroke();
      }
      ctx.restore();

      // 3. Joint orbs
      for (let i = 0; i < hand.length; i++) {
        const p = hand[i];
        const x = (1 - p.x) * W, y = p.y * H;
        const hue = depthHue(p.z);
        const r = scaleWithDepth(p.z, 3, 9);
        const isTip = FINGERTIP_INDICES.includes(i);
        const orbR = isTip ? r * (1.2 + pulse * 0.4) : r;
        ctx.save();
        ctx.shadowColor = `hsla(${hue}, 100%, 70%, 0.8)`;
        ctx.shadowBlur = isTip ? 18 + pulse * 10 : 8;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, orbR);
        grad.addColorStop(0, `hsla(${hue}, 100%, 95%, 0.95)`);
        grad.addColorStop(0.5, `hsla(${hue}, 100%, 70%, 0.7)`);
        grad.addColorStop(1, `hsla(${hue + 20}, 100%, 50%, 0.0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, orbR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 4. Spawn particles
      for (const ti of FINGERTIP_INDICES) {
        const tip = hand[ti];
        const x = (1 - tip.x) * W, y = tip.y * H;
        for (let n = 0; n < 2; n++) {
          particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5 - 0.5,
            life: 1, maxLife: 1,
            size: 1.5 + Math.random() * 2.5,
            hue: depthHue(tip.z) + (Math.random() - 0.5) * 40,
          });
        }
      }
    }
  }

  // 5. Update & draw particles
  const alive: Particle[] = [];
  for (const p of particles) {
    p.life -= dt * 0.0015;
    if (p.life <= 0) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.01;
    alive.push(p);
    const t = p.life / p.maxLife;
    ctx.globalAlpha = t * 0.8;
    ctx.fillStyle = `hsla(${p.hue}, 100%, 75%, ${t})`;
    ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${t * 0.6})`;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  return alive.length > 600 ? alive.slice(-600) : alive;
}

// ─── Visual modes ────────────────────────────────────────────────
type VisualMode = 'classic' | 'fancy' | 'mesh';

// ─── Component ───────────────────────────────────────────────────
export default function JustShowYourHandsClient() {
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [visualMode, setVisualMode] = useState<VisualMode>('classic');
  const { videoRef, landmarks, detectedFingers, startVideo, stopVideo, isLoading, error } = useHandTracking();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const threeStateRef = useRef<ThreeHand.ThreeHandScene | null>(null);
  const landmarksRef = useRef<Landmark[][]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const visualModeRef = useRef<VisualMode>('classic');
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  // Sync refs
  useEffect(() => { landmarksRef.current = landmarks; }, [landmarks]);
  useEffect(() => { visualModeRef.current = visualMode; }, [visualMode]);

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
      const W = canvas.width;
      const H = canvas.height;
      const dt = timestamp - (timeRef.current || timestamp);
      timeRef.current = timestamp;

      const hands = landmarksRef.current;
      const mode = visualModeRef.current;

      if (mode === 'mesh') {
        // Three.js gauntlet rendering
        ctx.clearRect(0, 0, W, H);
        particlesRef.current = [];
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
        particlesRef.current = drawFancy(ctx, W, H, hands, timestamp, dt, particlesRef.current);
      } else {
        particlesRef.current = [];
        drawClassic(ctx, W, H, hands);
      }

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
      <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center flex-grow">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Hand className="h-10 w-10" />
            </div>
            <CardTitle className="font-headline text-3xl">Hand Tracking Demo</CardTitle>
            <CardDescription className="text-muted-foreground pt-2">
              See real-time hand tracking with three visual modes: Classic skeleton, Neon glow, and dense 3D Mesh wireframe.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button onClick={startGame} size="lg">Start Demo</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center flex-grow">
      <div className={`w-full max-w-7xl aspect-video relative rounded-lg shadow-lg overflow-hidden ${visualMode === 'classic' ? 'bg-muted' : 'bg-black'}`}>
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className={`absolute top-0 left-0 w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${visualMode === 'classic' ? 'opacity-100' : visualMode === 'fancy' ? 'opacity-40' : 'opacity-50'}`}
        />
        <canvas ref={canvasRef} className={`absolute top-0 left-0 w-full h-full pointer-events-none ${visualMode === 'mesh' ? 'hidden' : ''}`} />
        <canvas ref={threeCanvasRef} className={`absolute top-0 left-0 w-full h-full pointer-events-none ${visualMode !== 'mesh' ? 'hidden' : ''}`} />

        {(isLoading || (error && !videoRef.current?.srcObject)) && (
          <div className="absolute inset-0 bg-black/60 flex flex-col gap-4 items-center justify-center rounded-lg text-white z-30">
            <Loader className="h-16 w-16 animate-spin" />
            <p className="font-headline text-3xl">{isLoading ? 'Loading Model...' : 'Waiting for Camera...'}</p>
          </div>
        )}

        {error && (
          <div className="absolute top-4 left-4 right-4 bg-destructive/80 text-destructive-foreground p-4 rounded-md z-20">
            <p className="font-bold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center z-20">
          <Card className="bg-background/70 backdrop-blur-md p-2 px-5 flex items-center gap-3">
            {visualMode === 'fancy' ? <Sparkles className="h-4 w-4 text-primary" /> : <Hand className="h-4 w-4 text-primary" />}
            <p className="font-headline text-lg">
              {landmarks.length > 0
                ? `${landmarks.length} hand${landmarks.length > 1 ? 's' : ''} detected \u2022 ${detectedFingers} finger${detectedFingers !== 1 ? 's' : ''}`
                : 'Show your hands to the camera'}
            </p>
          </Card>
        </div>

        {/* Top controls */}
        <div className="absolute top-4 left-4 right-4 flex justify-between z-20">
          <Button variant="secondary" onClick={handleBack}>Back to Start</Button>
          <Button
            variant={visualMode !== 'classic' ? 'default' : 'secondary'}
            onClick={() => setVisualMode(m => m === 'classic' ? 'fancy' : m === 'fancy' ? 'mesh' : 'classic')}
            className="flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            {visualMode === 'classic' ? 'Classic' : visualMode === 'fancy' ? 'Neon' : 'Gauntlet'}
          </Button>
        </div>
      </div>
    </div>
  );
}
