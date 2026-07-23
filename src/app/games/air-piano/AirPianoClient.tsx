'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Home, Loader, Music, Smartphone, Hand, Sparkles } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';
import { landmarkToNormalized } from '@/lib/video-utils';

const LANE_COUNT = 4;
const GAME_HEIGHT = 500;
const LANE_WIDTH = 100;
const TAP_ZONE_HEIGHT = 120;
const TILE_HEIGHT = 80;

const GAME_MODES = {
  EASY: { time: 3000, name: 'Easy' },
  HARD: { time: 2000, name: 'Hard' },
};

const PARTICLE_CONFIG = {
  COUNT: 15,
  SPEED: 8,
  LIFE: 1000, // milliseconds
  SIZE: 4,
};

// Web Audio Context Synthesizer — 100% offline, zero network requests, zero audio crashes
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Frequencies for piano notes A3, C4, E4, G4 (Lanes 1-4)
const NOTE_FREQUENCIES = [220.00, 261.63, 329.63, 392.00];

function playPianoNote(laneIndex: number) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const freq = NOTE_FREQUENCIES[laneIndex % NOTE_FREQUENCIES.length];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle'; // Warm piano-like tone
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    // Envelope decay for crisp piano sound
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch {
    // Fail silently if audio context is unavailable
  }
}

function playMistakeSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Fail silently
  }
}

export default function AirPianoClient() {
  const router = useRouter();
  const { videoRef, landmarks, handedness, startVideo, stopVideo, isLoading: isHandTrackingLoading, error: handTrackingError } = useHandTracking();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const animationFrameRef = useRef<number>();

  // Game state managed by React (for UI)
  const [gameState, setGameState] = useState<'IDLE' | 'LOADING' | 'SELECT_MODE' | 'COUNTDOWN' | 'PLAYING' | 'GAME_OVER'>('IDLE');
  const [gameMode, setGameMode] = useState<'EASY' | 'HARD' | null>(null);
  const [preferredHand, setPreferredHand] = useState<'AUTO' | 'RIGHT' | 'LEFT'>('AUTO');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [countdown, setCountdown] = useState(3);

  // Game state managed by refs (for performance in game loop)
  const scoreRef = useRef(0);
  const highScoreRef = useRef(0);
  const consecutiveMistakesRef = useRef(0);
  const targetLaneRef = useRef(0);
  const tileStatesRef = useRef(Array(LANE_COUNT).fill('normal'));
  const lastFingerDownTimeRef = useRef(Array(LANE_COUNT).fill(0));
  const targetTimeRef = useRef(0);
  const particlesRef = useRef<any[]>([]);
  const smoothedFingersRef = useRef<{ x: number; y: number; lastY?: number; lane: number; dy: number }[]>([]);
  const activeHandSideRef = useRef<'Left' | 'Right'>('Right');
  const fingerBaselineYRef = useRef<number[]>(Array(LANE_COUNT).fill(0.5));

  useEffect(() => {
    const savedHighScore = parseInt(localStorage.getItem('airPianoHighScore') || '0', 10);
    setHighScore(savedHighScore);
    highScoreRef.current = savedHighScore;
  }, []);

  useEffect(() => {
    if (handTrackingError) {
      toast({
        variant: 'destructive',
        title: 'Camera Error',
        description: handTrackingError,
      });
      stopVideo();
      setGameState('IDLE');
    }
  }, [handTrackingError, toast, stopVideo]);

  const gameLoop = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let handLandmarks = null;
      let detectedHandCategory: 'Left' | 'Right' = 'Right';

      // --- Hand Detection & Preference Tracking ---
      if (landmarks && landmarks.length > 0 && handedness && handedness.length > 0) {
        if (preferredHand === 'LEFT') {
          const leftIdx = handedness.findIndex((h) => h[0] && h[0].categoryName === 'Left');
          if (leftIdx !== -1) {
            handLandmarks = landmarks[leftIdx];
            detectedHandCategory = 'Left';
          } else {
            handLandmarks = landmarks[0];
            detectedHandCategory = (handedness[0][0]?.categoryName as 'Left' | 'Right') || 'Left';
          }
        } else if (preferredHand === 'RIGHT') {
          const rightIdx = handedness.findIndex((h) => h[0] && h[0].categoryName === 'Right');
          if (rightIdx !== -1) {
            handLandmarks = landmarks[rightIdx];
            detectedHandCategory = 'Right';
          } else {
            handLandmarks = landmarks[0];
            detectedHandCategory = (handedness[0][0]?.categoryName as 'Left' | 'Right') || 'Right';
          }
        } else {
          // AUTO mode — lock onto primary detected hand
          handLandmarks = landmarks[0];
          detectedHandCategory = (handedness[0][0]?.categoryName as 'Left' | 'Right') || 'Right';
        }

        activeHandSideRef.current = detectedHandCategory;
      }

      // --- Update Finger Positions & Spatial Left-to-Right Mapping ---
      if (handLandmarks) {
        // Correct Left vs Right Finger Landmark Order:
        // For RIGHT hand facing camera: Index (8) is Left, Pinky (20) is Right -> [8, 12, 16, 20]
        // For LEFT hand facing camera: Pinky (20) is Left, Index (8) is Right -> [20, 16, 12, 8]
        const isLeftHand = activeHandSideRef.current === 'Left';
        const fingerLandmarkIndices = isLeftHand ? [20, 16, 12, 8] : [8, 12, 16, 20];

        const video = videoRef.current;
        const totalCanvasWidth = LANE_COUNT * LANE_WIDTH;

        // --- 2-PASS DOMINANT FINGER ISOLATION ---
        // Pass 1: Compute raw dip amounts relative to adaptive baseline for all 4 fingers
        const rawDips: number[] = [];
        for (let i = 0; i < LANE_COUNT; i++) {
          const lmIndex = fingerLandmarkIndices[i];
          const finger = handLandmarks[lmIndex];
          if (finger) {
            const { ny } = video ? landmarkToNormalized(finger.x, finger.y, video, false) : { ny: finger.y };
            const prevBase = fingerBaselineYRef.current[i] ?? ny;
            const newBase = prevBase + (ny - prevBase) * 0.03;
            fingerBaselineYRef.current[i] = newBase;
            rawDips[i] = Math.max(0, ny - newBase);
          } else {
            rawDips[i] = 0;
          }
        }

        // Identify the single primary dominant flicking finger
        const maxDip = Math.max(...rawDips);
        let dominantIndex = -1;
        if (maxDip >= 0.045) {
          dominantIndex = rawDips.indexOf(maxDip);
        }

        // Pass 2: Calculate visual positions & isolate non-dominant adjacent fingers
        const currentFingers: { x: number; y: number; lastY?: number; lane: number; dy: number }[] = [];

        for (let i = 0; i < LANE_COUNT; i++) {
          const targetX = i * LANE_WIDTH + LANE_WIDTH / 2;
          const REST_Y = 320;

          // ONLY the dominant finger drops down to hit the piano tile.
          // Adjacent secondary fingers are heavily dampened (< 15%) so their circles stay safely anchored at REST_Y!
          const isDominant = i === dominantIndex;
          const effectiveDip = isDominant ? rawDips[i] : rawDips[i] * 0.15;
          const dipVisualPixels = Math.min(120, effectiveDip * 1400);
          const targetY = REST_Y + dipVisualPixels;

          const prev = smoothedFingersRef.current[i];
          const smoothY = prev ? (1 - 0.4) * prev.y + 0.4 * targetY : targetY;

          currentFingers[i] = {
            x: targetX,
            y: smoothY,
            lastY: prev?.y || smoothY,
            lane: i,
            dy: rawDips[i],
          };
        }

        smoothedFingersRef.current = currentFingers;

        // --- Game Logic when Playing ---
        if (gameState === 'PLAYING') {
          const modeConfig = gameMode ? GAME_MODES[gameMode] : GAME_MODES.EASY;

          // Check if target tile timed out
          if (timestamp - targetTimeRef.current > modeConfig.time) {
            consecutiveMistakesRef.current += 1;
            tileStatesRef.current[targetLaneRef.current] = 'fail';
            playMistakeSound();

            if (consecutiveMistakesRef.current >= 3) {
              setGameState('GAME_OVER');
            } else {
              const newTarget = Math.floor(Math.random() * LANE_COUNT);
              targetLaneRef.current = newTarget;
              targetTimeRef.current = timestamp;
              setTimeout(() => {
                tileStatesRef.current = Array(LANE_COUNT).fill('normal');
                tileStatesRef.current[newTarget] = 'target';
              }, 100);
            }
          }

          // Strict Dominant Finger Hit Trigger (Zero sympathetic misfires!)
          const now = Date.now();
          if (
            dominantIndex !== -1 &&
            maxDip >= 0.045 &&
            now - lastFingerDownTimeRef.current[dominantIndex] > 280
          ) {
            const hitIndex = dominantIndex;
            lastFingerDownTimeRef.current[hitIndex] = now;

            if (hitIndex === targetLaneRef.current) {
              // Correct hit
              scoreRef.current += 1;
              consecutiveMistakesRef.current = 0;
              tileStatesRef.current[hitIndex] = 'success';
              playPianoNote(hitIndex);

              // Particles
              for (let p = 0; p < PARTICLE_CONFIG.COUNT; p++) {
                const angle = (Math.PI * 2 * p) / PARTICLE_CONFIG.COUNT;
                particlesRef.current.push({
                  x: hitIndex * LANE_WIDTH + LANE_WIDTH / 2,
                  y: GAME_HEIGHT - TILE_HEIGHT / 2,
                  vx: Math.cos(angle) * PARTICLE_CONFIG.SPEED * (0.5 + Math.random() * 0.5),
                  vy: Math.sin(angle) * PARTICLE_CONFIG.SPEED * (0.5 + Math.random() * 0.5) - 3,
                  life: PARTICLE_CONFIG.LIFE,
                  createdAt: now,
                });
              }

              const newTarget = Math.floor(Math.random() * LANE_COUNT);
              targetLaneRef.current = newTarget;
              targetTimeRef.current = timestamp;
              setTimeout(() => {
                tileStatesRef.current = Array(LANE_COUNT).fill('normal');
                tileStatesRef.current[newTarget] = 'target';
              }, 100);
            } else {
              // Wrong hit
              scoreRef.current = Math.max(0, scoreRef.current - 1);
              consecutiveMistakesRef.current += 1;
              tileStatesRef.current[hitIndex] = 'fail';
              playMistakeSound();

              if (consecutiveMistakesRef.current >= 3) {
                setGameState('GAME_OVER');
              }
              setTimeout(() => {
                tileStatesRef.current[hitIndex] = 'normal';
              }, 100);
            }

            setScore(scoreRef.current);
          }
        }
      }

      if (gameState === 'GAME_OVER') {
        if (scoreRef.current > highScoreRef.current) {
          localStorage.setItem('airPianoHighScore', scoreRef.current.toString());
          setHighScore(scoreRef.current);
          highScoreRef.current = scoreRef.current;
        }
      }

      // --- Drawing ---
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      // Draw Piano Lanes
      for (let i = 0; i < LANE_COUNT; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#16282c' : '#1e343a';
        ctx.fillRect(i * LANE_WIDTH, 0, LANE_WIDTH - 2, GAME_HEIGHT);
      }

      // Draw Tiles & Target Key Buttons
      for (let i = 0; i < LANE_COUNT; i++) {
        const state = tileStatesRef.current[i];
        if (gameState !== 'PLAYING') ctx.fillStyle = '#3a4d52';
        else if (state === 'target') ctx.fillStyle = '#fbbf24';
        else if (state === 'success') ctx.fillStyle = '#34d399';
        else if (state === 'fail') ctx.fillStyle = '#ff5c5c';
        else ctx.fillStyle = '#3a4d52';
        ctx.fillRect(i * LANE_WIDTH + 10, GAME_HEIGHT - TILE_HEIGHT, LANE_WIDTH - 20, TILE_HEIGHT);
      }

      // Draw Finger Tracking Indicators
      smoothedFingersRef.current.forEach((pos) => {
        if (!pos) return;
        const isInTapZone = pos.y > GAME_HEIGHT - TAP_ZONE_HEIGHT;
        ctx.fillStyle = isInTapZone ? '#34d399' : '#ffffff80';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      });

      // Particles
      const now = Date.now();
      particlesRef.current.forEach((p) => {
        const age = now - p.createdAt;
        if (age >= p.life) return;
        const progress = age / p.life;
        const alpha = 1 - progress;
        ctx.fillStyle = `rgba(52, 211, 153, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PARTICLE_CONFIG.SIZE, 0, Math.PI * 2);
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
      });
      particlesRef.current = particlesRef.current.filter((p) => now - p.createdAt < p.life);

      // Score HUD
      if (gameState === 'PLAYING' || gameState === 'GAME_OVER') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Score: ${scoreRef.current}`, 20, 35);
        ctx.font = '16px Arial';
        ctx.fillText(`High Score: ${highScoreRef.current}`, 20, 65);
      }

      if (gameState === 'COUNTDOWN') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = "bold 100px 'Press Start 2P', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(countdown.toString(), canvas.width / 2, canvas.height / 2);
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    },
    [landmarks, handedness, gameState, gameMode, countdown, preferredHand]
  );

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameLoop]);

  const startCountdown = () => {
    setGameState('COUNTDOWN');
    setCountdown(3);
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setGameState('PLAYING');
          targetTimeRef.current = performance.now();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const selectMode = async (mode: 'EASY' | 'HARD') => {
    setGameMode(mode);
    setGameState('LOADING');
    try {
      await startVideo();
      scoreRef.current = 0;
      setScore(0);
      consecutiveMistakesRef.current = 0;
      lastFingerDownTimeRef.current = Array(LANE_COUNT).fill(0);
      const initialTarget = Math.floor(Math.random() * LANE_COUNT);
      targetLaneRef.current = initialTarget;
      tileStatesRef.current = Array(LANE_COUNT).fill('normal');
      tileStatesRef.current[initialTarget] = 'target';
      smoothedFingersRef.current = [];
      startCountdown();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Camera Error',
        description: 'Unable to start camera for tracking.',
      });
      setGameState('IDLE');
    }
  };

  const restartGame = () => {
    if (gameMode) {
      selectMode(gameMode);
    }
  };

  const exitGame = () => {
    stopVideo();
    setGameState('IDLE');
    setGameMode(null);
  };

  const renderOverlayContent = () => {
    if (isHandTrackingLoading && gameState === 'LOADING') {
      return (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex flex-col gap-4 items-center justify-center rounded-2xl text-white z-30">
          <Loader className="h-16 w-16 animate-spin text-rose-400" />
          <p className="font-headline font-bold text-3xl">Loading Hand Tracking...</p>
        </div>
      );
    }

    if (gameState === 'GAME_OVER') {
      return (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-md rounded-2xl border-2 border-rose-400/70 shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-rose-500/40 flex flex-col items-center justify-center text-white z-40 p-6">
          <h2 className="font-headline font-bold text-4xl text-rose-400 mb-4">Game Over!</h2>
          <p className="text-xl mb-2">
            Final Score: <span className="font-headline font-bold text-rose-300">{score}</span>
          </p>
          <p className="text-lg mb-2">
            High Score: <span className="font-headline font-bold text-yellow-400">{highScore}</span>
          </p>
          <p className="text-md mb-6">Mode: {gameMode && GAME_MODES[gameMode].name}</p>
          <div className="flex gap-4">
            <Button
              onClick={restartGame}
              className="rounded-xl border-2 border-white/80 bg-rose-500 font-headline font-bold text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-rose-600"
            >
              Retry
            </Button>
            <Button
              onClick={exitGame}
              variant="secondary"
              className="rounded-xl border-2 border-white/40 bg-white/10 font-headline font-bold text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-white/20"
            >
              Exit
            </Button>
          </div>
        </div>
      );
    }

    if (gameState === 'IDLE') {
      return (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-40 p-6">
          <Card className="max-w-md w-full text-center p-6 rounded-2xl border-2 border-rose-400/70 bg-black/85 backdrop-blur-md shadow-[6px_6px_0_0_rgba(244,63,94,0.4)]">
            <CardContent className="pt-4 space-y-5">
              <h2 className="font-headline font-bold text-4xl text-white">
                Air <span className="text-rose-400">Piano</span>
              </h2>
              <p className="text-gray-300 text-sm">
                Tap piano keys in real-time with your fingers! Support for Left & Right hands.
              </p>

              {isMobile && (
                <Alert className="text-left rounded-xl border-2 border-white/20 bg-black/60 text-white">
                  <Smartphone className="h-4 w-4" />
                  <AlertTitle>Mobile Experience</AlertTitle>
                  <AlertDescription>
                    Desktop view is recommended for optimal gesture precision.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={() => setGameState('SELECT_MODE')}
                size="lg"
                className="font-headline font-bold text-lg w-full rounded-xl border-2 border-white/80 bg-rose-500 text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-rose-600"
              >
                Start Playing
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (gameState === 'SELECT_MODE') {
      return (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-40 p-6">
          <Card className="max-w-md w-full text-center p-6 rounded-2xl border-2 border-rose-400/70 bg-black/85 backdrop-blur-md shadow-[6px_6px_0_0_rgba(244,63,94,0.4)] space-y-5">
            <CardContent className="pt-2 space-y-6">
              <div>
                <h3 className="font-headline font-bold text-2xl text-white mb-2">Hand Preference</h3>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreferredHand('AUTO')}
                    className={`py-2.5 px-3 rounded-xl text-sm font-headline font-bold transition-all border-2 ${
                      preferredHand === 'AUTO'
                        ? 'bg-rose-500 text-white border-white shadow-md scale-[1.02]'
                        : 'bg-slate-900 text-slate-100 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    ✨ Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferredHand('RIGHT')}
                    className={`py-2.5 px-3 rounded-xl text-sm font-headline font-bold transition-all border-2 ${
                      preferredHand === 'RIGHT'
                        ? 'bg-rose-500 text-white border-white shadow-md scale-[1.02]'
                        : 'bg-slate-900 text-slate-100 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    🖐️ Right
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferredHand('LEFT')}
                    className={`py-2.5 px-3 rounded-xl text-sm font-headline font-bold transition-all border-2 ${
                      preferredHand === 'LEFT'
                        ? 'bg-rose-500 text-white border-white shadow-md scale-[1.02]'
                        : 'bg-slate-900 text-slate-100 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    🖐️ Left
                  </button>
                </div>
              </div>

              <div>
                <h3 className="font-headline font-bold text-2xl text-white mb-3">Select Difficulty</h3>
                <div className="flex gap-4 justify-center">
                  <Button
                    onClick={() => selectMode('EASY')}
                    size="lg"
                    className="flex-1 rounded-xl border-2 border-white/80 bg-rose-500 font-headline font-bold text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-rose-600"
                  >
                    Easy
                  </Button>
                  <Button
                    onClick={() => selectMode('HARD')}
                    size="lg"
                    variant="destructive"
                    className="flex-1 rounded-xl border-2 border-white/80 font-headline font-bold text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px]"
                  >
                    Hard
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="container mx-auto px-4 py-4 lg:py-8 flex flex-col items-center justify-start lg:justify-center min-h-screen">
      <div className="w-full flex flex-col lg:flex-row items-center justify-center gap-8">
        {/* Camera Feed */}
        <div className="relative w-full lg:max-w-[400px] aspect-[3/4] lg:aspect-[4/5] rounded-2xl overflow-hidden bg-black border-2 border-rose-400/70 shadow-[6px_6px_0_0_rgba(244,63,94,0.4)]">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]"></video>
          {isHandTrackingLoading && !videoRef.current?.srcObject && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
              <Loader className="h-12 w-12 animate-spin text-rose-400" />
            </div>
          )}
        </div>

        {/* Game Area */}
        <div className="flex flex-col w-full gap-6" style={{ maxWidth: LANE_COUNT * LANE_WIDTH }}>
          {/* Game Canvas */}
          <div className="relative w-full" style={{ aspectRatio: `${LANE_COUNT * LANE_WIDTH} / ${GAME_HEIGHT}` }}>
            <canvas
              ref={canvasRef}
              width={LANE_COUNT * LANE_WIDTH}
              height={GAME_HEIGHT}
              className="w-full h-full rounded-2xl border-2 border-rose-400/70 shadow-[6px_6px_0_0_rgba(244,63,94,0.4)] bg-gradient-to-b from-gray-800 to-gray-900"
            />
            {renderOverlayContent()}
          </div>

          {/* Instructions */}
          <div className="p-6 rounded-2xl border-2 border-rose-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_rgba(244,63,94,0.4)]">
            <h3 className="text-xl font-headline font-bold text-rose-400 mb-3">How to Play</h3>
            <ul className="text-gray-300 space-y-2 text-sm">
              <li>🖐️ Choose **Auto**, **Left**, or **Right** hand mode before starting.</li>
              <li>🎵 Tap down with your finger when a yellow target appears in its lane.</li>
              <li>⚡ Smart intent tracking ignores minor movements of adjacent fingers!</li>
              <li>🏆 3 mistakes and it's game over!</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
