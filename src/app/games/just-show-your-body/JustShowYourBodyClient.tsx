'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePoseTracking } from '@/hooks/use-pose-tracking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PersonStanding, Loader, Sparkles } from 'lucide-react';
import type { Landmark } from '@mediapipe/tasks-vision';
import * as ThreeBody from './three-body-renderer';
import { createLandmarkMapper } from '@/lib/video-utils';
import { useToast } from '@/hooks/use-toast';
import { perf } from '@/lib/perf-monitor';
import { POSE_CONNECTIONS, POSE_KEY_JOINTS, poseConnectionHue } from '@/lib/pose-connections';

type Pose = Landmark[];
type CoordMapper = (lx: number, ly: number) => { x: number; y: number };
type VisualMode = 'classic' | 'neon' | 'aura';

const MAX_PARTICLES_DESKTOP = 600;
const MAX_PARTICLES_MOBILE = 200;
const PARTICLE_EMITTERS: readonly number[] = [15, 16, 27, 28, 31, 32, 0];

type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number; };

const _mx = new Float32Array(33);
const _my = new Float32Array(33);

function depthNorm(z: number): number { const n = (Math.abs(z) - 0.02) / 0.28; return n < 0 ? 0 : n > 1 ? 1 : n; }
function scaleWithDepth(z: number, min: number, max: number): number { return min + (1 - depthNorm(z)) * (max - min); }

function drawClassic(ctx: CanvasRenderingContext2D, W: number, H: number, pose: Pose | null | undefined, map: CoordMapper) {
  ctx.clearRect(0, 0, W, H);
  if (!pose || pose.length < 33) return;
  for (let i = 0; i < 33; i++) { const lm = pose[i]; if (!lm) continue; const p = map(lm.x, lm.y); _mx[i] = p.x; _my[i] = p.y; }
  ctx.strokeStyle = '#14b8a6';
  ctx.lineCap = 'round';
  for (let ci = 0; ci < POSE_CONNECTIONS.length; ci++) {
    const [si, ei] = POSE_CONNECTIONS[ci];
    const s = pose[si], e = pose[ei];
    if (!s || !e) continue;
    ctx.lineWidth = scaleWithDepth((s.z + e.z) / 2, 2, 7);
    ctx.beginPath(); ctx.moveTo(_mx[si], _my[si]); ctx.lineTo(_mx[ei], _my[ei]); ctx.stroke();
  }
  ctx.fillStyle = '#2dd4bf';
  for (let i = 0; i < 33; i++) {
    const lm = pose[i]; if (!lm) continue;
    const r = scaleWithDepth(lm.z, 2.5, 8) * (POSE_KEY_JOINTS.has(i) ? 1.15 : 1);
    ctx.beginPath(); ctx.arc(_mx[i], _my[i], r, 0, Math.PI * 2); ctx.fill();
  }
}

function updateParticles(ctx: CanvasRenderingContext2D, particles: Particle[], dt: number, maxParticles: number): Particle[] {
  let write = 0;
  ctx.globalCompositeOperation = 'lighter';
  for (let read = 0; read < particles.length; read++) {
    const p = particles[read];
    p.life -= dt * 0.0015;
    if (p.life <= 0) continue;
    p.x += p.vx; p.y += p.vy; p.vy += 0.01;
    particles[write++] = p;
    const t = p.life / p.maxLife;
    ctx.globalAlpha = t * 0.8;
    ctx.fillStyle = `hsla(${p.hue | 0},100%,75%,${t.toFixed(2)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2); ctx.fill();
  }
  particles.length = write;
  if (write > maxParticles) particles.splice(0, write - maxParticles);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return particles;
}

function drawNeon(ctx: CanvasRenderingContext2D, W: number, H: number, pose: Pose | null | undefined, timestamp: number, dt: number, particles: Particle[], map: CoordMapper, maxParticles: number) {
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = 'rgba(0,0,0,0.80)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.004);
  if (pose && pose.length >= 33) {
    for (let i = 0; i < 33; i++) { const lm = pose[i]; if (!lm) continue; const p = map(lm.x, lm.y); _mx[i] = p.x; _my[i] = p.y; }
    const midZ = pose[11] && pose[23] ? (pose[11].z + pose[23].z) / 2 : 0;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'hsla(190,100%,72%,0.9)';
    ctx.shadowBlur = 10 + pulse * 5;
    ctx.strokeStyle = `hsla(190,100%,72%,${(0.7 + 0.2 * depthNorm(midZ)).toFixed(2)})`;
    ctx.lineWidth = scaleWithDepth(midZ, 1.5, 4);
    ctx.beginPath();
    for (let ci = 0; ci < POSE_CONNECTIONS.length; ci++) { const [si, ei] = POSE_CONNECTIONS[ci]; if (!pose[si] || !pose[ei]) continue; ctx.moveTo(_mx[si], _my[si]); ctx.lineTo(_mx[ei], _my[ei]); }
    ctx.stroke();
    ctx.shadowBlur = 0;
    for (let ci = 0; ci < POSE_CONNECTIONS.length; ci++) {
      const [si, ei] = POSE_CONNECTIONS[ci]; const s = pose[si], e = pose[ei]; if (!s || !e) continue;
      const z = (s.z + e.z) / 2;
      ctx.strokeStyle = `hsla(${poseConnectionHue(ci)},100%,70%,${(0.6 + depthNorm(z) * 0.3).toFixed(2)})`;
      ctx.lineWidth = scaleWithDepth(z, 1.5, 4);
      ctx.beginPath(); ctx.moveTo(_mx[si], _my[si]); ctx.lineTo(_mx[ei], _my[ei]); ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 33; i++) {
      const lm = pose[i]; if (!lm) continue;
      const key = POSE_KEY_JOINTS.has(i);
      const x = _mx[i], y = _my[i];
      const baseR = scaleWithDepth(lm.z, 2.5, 8) * (key ? 1.1 : 0.9);
      ctx.fillStyle = 'hsla(190,100%,70%,0.3)';
      ctx.beginPath(); ctx.arc(x, y, baseR * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsla(190,100%,${key ? 92 : 75}%,${(0.85 + 0.15 * pulse).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x, y, baseR, 0, Math.PI * 2); ctx.fill();
    }
    if (particles.length < maxParticles - 10) {
      for (let f = 0; f < PARTICLE_EMITTERS.length; f++) {
        const ti = PARTICLE_EMITTERS[f]; const lm = pose[ti]; if (!lm) continue;
        const x = _mx[ti], y = _my[ti];
        for (let n = 0; n < 2; n++) {
          particles.push({ x, y, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5 - 0.5, life: 1, maxLife: 1, size: 1.5 + Math.random() * 2.5, hue: 185 + (Math.random() - 0.5) * 40 });
        }
      }
    }
  }
  return updateParticles(ctx, particles, dt, maxParticles);
}

function drawAuraScan(ctx: CanvasRenderingContext2D, W: number, H: number, timestamp: number) {
  const y = ((timestamp * 0.10) % (H + 140)) - 70;
  ctx.save();
  ctx.strokeStyle = 'rgba(125,211,252,0.10)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  const g = ctx.createLinearGradient(0, y - 70, 0, y);
  g.addColorStop(0, 'rgba(125,211,252,0)'); g.addColorStop(1, 'rgba(125,211,252,0.12)');
  ctx.fillStyle = g; ctx.fillRect(0, y - 70, W, 70);
  ctx.strokeStyle = 'rgba(125,211,252,0.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y - 70); ctx.lineTo(W, y - 70); ctx.stroke();
  ctx.restore();
}
export default function JustShowYourBodyClient() {
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [visualMode, setVisualMode] = useState<VisualMode>('classic');
  const { videoRef, landmarksRef, hasPose, isLoading, error, startVideo, stopVideo } = usePoseTracking();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const threeStateRef = useRef<ThreeBody.ThreeBodyScene | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const visualModeRef = useRef<VisualMode>('classic');
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const { toast } = useToast();

  useEffect(() => { visualModeRef.current = visualMode; }, [visualMode]);

  const maxParticlesRef = useRef<number>(MAX_PARTICLES_DESKTOP);
  if (typeof navigator !== 'undefined' && maxParticlesRef.current === MAX_PARTICLES_DESKTOP) {
    const ua = (navigator as any).userAgentData;
    const isMobile = ua?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    maxParticlesRef.current = isMobile ? MAX_PARTICLES_MOBILE : MAX_PARTICLES_DESKTOP;
  }

  const toastIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (error && !toastIdRef.current) {
      toastIdRef.current = toast({ variant: 'destructive', title: 'Camera error', description: error }).id;
    }
  }, [error, toast]);

  const startGame = useCallback(async () => { setIsGameStarted(true); }, []);
  useEffect(() => { if (isGameStarted) startVideo().catch(() => setIsGameStarted(false)); }, [isGameStarted, startVideo]);

  const handleBack = useCallback(() => {
    stopVideo();
    cancelAnimationFrame(animRef.current);
    if (threeStateRef.current) { ThreeBody.dispose(threeStateRef.current); threeStateRef.current = null; }
    particlesRef.current.length = 0;
    setIsGameStarted(false);
  }, [stopVideo]);

  useEffect(() => {
    if (!isGameStarted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = (timestamp: number) => {
      const video = videoRef.current;
      if (!video || !canvas) { animRef.current = requestAnimationFrame(draw); return; }
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth; canvas.height = video.clientHeight;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) { animRef.current = requestAnimationFrame(draw); return; }

      perf.frame(() => {
        const W = canvas.width, H = canvas.height;
        const dt = timestamp - (timeRef.current || timestamp);
        timeRef.current = timestamp;
        const pose: Pose | null = (landmarksRef.current && landmarksRef.current[0]) ?? null;
        const mode = visualModeRef.current;

        if (mode === 'aura') {
          ctx.clearRect(0, 0, W, H);
          particlesRef.current.length = 0;
          const tc = threeCanvasRef.current;
          if (tc) {
            if (!threeStateRef.current) threeStateRef.current = ThreeBody.createScene(tc, W, H);
            if (tc.width !== W || tc.height !== H) { tc.width = W; tc.height = H; ThreeBody.resize(threeStateRef.current, W, H); }
            ThreeBody.update(threeStateRef.current, landmarksRef.current, 0.5 + 0.5 * Math.sin(timestamp * 0.004));
            ThreeBody.render(threeStateRef.current);
          }
          drawAuraScan(ctx, W, H, timestamp);
        } else if (mode === 'neon') {
          perf.mark('draw.neon');
          const mapper = createLandmarkMapper(video);
          particlesRef.current = drawNeon(ctx, W, H, pose, timestamp, dt, particlesRef.current, mapper, maxParticlesRef.current);
          perf.measure('draw.neon');
          perf.note('particles', particlesRef.current.length);
        } else {
          perf.mark('draw.classic');
          if (particlesRef.current.length) particlesRef.current.length = 0;
          const mapper = createLandmarkMapper(video);
          drawClassic(ctx, W, H, pose, mapper);
          perf.measure('draw.classic');
        }
      });

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      if (threeStateRef.current) { ThreeBody.dispose(threeStateRef.current); threeStateRef.current = null; }
    };
  }, [isGameStarted, videoRef, landmarksRef]);

  if (!isGameStarted) {
    return (
      <div className="container mx-auto px-4 py-4 lg:py-8 flex flex-col items-center justify-start lg:justify-center flex-grow">
        <Card className="max-w-md text-center rounded-2xl border-2 border-emerald-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-emerald-500/40 text-white">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-400/40 bg-emerald-500/15 text-emerald-400">
              <PersonStanding className="h-10 w-10" />
            </div>
            <CardTitle className="font-headline font-bold text-3xl text-white"><span className="text-emerald-400">Body</span> Tracking Demo</CardTitle>
            <CardDescription className="text-white/70 pt-2">
              See real-time full-body pose tracking with three visual modes: Classic skeleton, Neon glow, and a holographic 3D Aura.
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
      <div className="w-full max-w-4xl aspect-[3/4] lg:aspect-video relative rounded-2xl border-2 border-emerald-400/50 shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-emerald-500/30 overflow-hidden bg-black">
        <video ref={videoRef} autoPlay playsInline muted className={`absolute top-0 left-0 w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${visualMode === 'classic' ? 'opacity-100' : visualMode === 'neon' ? 'opacity-40' : 'opacity-30'}`} />
        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
        <canvas ref={threeCanvasRef} className={`absolute top-0 left-0 w-full h-full pointer-events-none ${visualMode !== 'aura' ? 'hidden' : ''}`} />

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
            {(visualMode === 'neon' || visualMode === 'aura') ? <Sparkles className="h-4 w-4 text-emerald-400" /> : <PersonStanding className="h-4 w-4 text-emerald-400" />}
            <p className="font-headline font-bold text-lg">{hasPose ? 'Body detected' : 'Show your body to the camera'}</p>
          </Card>
        </div>

        <div className="absolute top-4 left-4 right-4 flex justify-between z-20">
          <Button variant="secondary" onClick={handleBack} className="rounded-xl border-2 border-white/40 bg-white/10 font-headline font-bold text-white backdrop-blur transition-all hover:bg-white/20">Back to Start</Button>
          <Button variant={visualMode !== 'classic' ? 'default' : 'secondary'} onClick={() => setVisualMode(m => (m === 'classic' ? 'neon' : m === 'neon' ? 'aura' : 'classic'))} className={`flex items-center gap-2 rounded-xl border-2 font-headline font-bold text-white backdrop-blur transition-all ${visualMode !== 'classic' ? 'border-white/80 bg-emerald-500 shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] hover:translate-y-[2px] hover:bg-emerald-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]' : 'border-white/40 bg-white/10 hover:bg-white/20'}`}>
            <Sparkles className="h-4 w-4" />
            {visualMode === 'classic' ? 'Classic' : visualMode === 'neon' ? 'Neon' : 'Aura'}
          </Button>
        </div>
      </div>

      <div className="w-full max-w-4xl mt-6 p-6 rounded-2xl border-2 border-emerald-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-emerald-500/40">
        <h3 className="text-xl font-headline font-bold text-emerald-400 mb-3">How it Works</h3>
        <ul className="text-gray-300 space-y-2">
          <li>Step back and hold your body up to the camera to see it tracked in real-time</li>
          <li>Toggle between Classic, Neon, and Aura (3D) visual modes at the top right</li>
          <li>Watch how the app accurately detects 33 joints - from head to toes</li>
          <li>Move closer or further to see the depth effects!</li>
        </ul>
      </div>
    </div>
  );
}