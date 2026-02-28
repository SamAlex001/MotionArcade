'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Home, Loader, Music, Smartphone, XCircle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';
import { landmarkToNormalized } from '@/lib/video-utils';

const LANE_COUNT = 4;
const GAME_HEIGHT = 500;
const LANE_WIDTH = 100;
const TAP_ZONE_HEIGHT = 100;
const TILE_HEIGHT = 80;
const SMOOTHING_FACTOR = 0.3; // Closer to 0 is smoother, closer to 1 is more responsive

const GAME_MODES = {
  EASY: { time: 3000, name: 'Easy' },
  HARD: { time: 2000, name: 'Hard' }
};

const PARTICLE_CONFIG = {
  COUNT: 15,
  SPEED: 8,
  LIFE: 1000, // milliseconds
  SIZE: 4
};

// Preload audio
const NOTE_AUDIO = typeof window !== 'undefined' ? [
  new Audio('https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/MusyngKite/acoustic_grand_piano-mp3/A3.mp3'),
  new Audio('https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/MusyngKite/acoustic_grand_piano-mp3/C4.mp3'),
  new Audio('https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/MusyngKite/acoustic_grand_piano-mp3/E4.mp3'),
  new Audio('https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/MusyngKite/acoustic_grand_piano-mp3/G4.mp3')
] : [];

const getDhummAudio = () => {
  if (typeof window === 'undefined') return null;
  const audio = new window.Audio("/pop.mp3");
  audio.volume = 0.2;
  return audio;
};

// Linear interpolation for smoothing
function lerp(start: number, end: number, amt: number) {
  return (1 - amt) * start + amt * end;
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
  const smoothedFingersRef = useRef<{ x: number, y: number, lastY?: number }[]>([]);
  const trackedHandRef = useRef<'Left' | 'Right' | null>(null);

  useEffect(() => {
    setHighScore(parseInt(localStorage.getItem('airPianoHighScore')) || 0);
    highScoreRef.current = parseInt(localStorage.getItem('airPianoHighScore')) || 0;
  }, []);

  useEffect(() => {
    if (handTrackingError) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: handTrackingError,
      });
      stopVideo();
      setGameState('IDLE');
    }
  }, [handTrackingError, toast, stopVideo]);

  
  const gameLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let handLandmarks = null;
    // --- Sticky Hand Tracking Logic ---
    if (landmarks && landmarks.length > 0 && handedness && handedness.length > 0) {
        if (!trackedHandRef.current && handedness[0] && handedness[0][0]) {
            // First detection, lock onto this hand
            trackedHandRef.current = handedness[0][0].categoryName as ('Left' | 'Right');
        }

        // Find the locked hand in the current frame
        const handIndex = handedness.findIndex(hand => hand[0] && hand[0].categoryName === trackedHandRef.current);

        if (handIndex !== -1) {
            handLandmarks = landmarks[handIndex];
        } else {
             // If tracked hand is lost, clear it so it can re-lock
             if (landmarks.length === 0) {
                trackedHandRef.current = null;
             }
        }
    }

    // --- Update finger positions with smoothing ---
    if (handLandmarks) {
        const fingerLandmarks = [handLandmarks[8], handLandmarks[12], handLandmarks[16], handLandmarks[20]]; // Index, Middle, Ring, Pinky
        const video = videoRef.current;

        for (let i = 0; i < LANE_COUNT; i++) {
            const finger = fingerLandmarks[i];
            const canvasHeight = canvas.height;

            if (finger) {
                 // Calculate the fixed X for the center of the lane
                const newX = i * LANE_WIDTH + LANE_WIDTH / 2;
                const { ny } = video
                  ? landmarkToNormalized(0, finger.y, video, false)
                  : { ny: finger.y };
                const newY = ny * canvasHeight;

                if (!smoothedFingersRef.current[i]) {
                    // Initialize position at the center of the lane
                    smoothedFingersRef.current[i] = { x: newX, y: newY };
                } else {
                    // Keep X fixed at the center, only smooth Y
                    smoothedFingersRef.current[i].x = newX; // Set X directly
                    smoothedFingersRef.current[i].y = lerp(smoothedFingersRef.current[i].y, newY, SMOOTHING_FACTOR);
                }
            }
        }
    }

    // --- Game Logic ---
    if (gameState === 'PLAYING' && gameMode) {
        // Check for missed target
        if (timestamp - targetTimeRef.current >= GAME_MODES[gameMode].time) {
            if (tileStatesRef.current[targetLaneRef.current] === 'target') {
                scoreRef.current -= 1;
                consecutiveMistakesRef.current += 1;
                tileStatesRef.current[targetLaneRef.current] = 'fail';
                setTimeout(() => tileStatesRef.current[targetLaneRef.current] = 'normal', 100);
            }
            if (consecutiveMistakesRef.current >= 3) {
                setGameState('GAME_OVER');
            } else {
                const newTarget = Math.floor(Math.random() * LANE_COUNT);
                targetLaneRef.current = newTarget;
                tileStatesRef.current = Array(LANE_COUNT).fill('normal');
                tileStatesRef.current[newTarget] = 'target';
                targetTimeRef.current = timestamp;
            }
        }

        // Check for finger hits
        smoothedFingersRef.current.forEach((finger, index) => {
            if (!finger) return;
            const isMovingDown = finger.y > (finger.lastY || finger.y - 1);
            const isInTapZone = finger.y > GAME_HEIGHT - TAP_ZONE_HEIGHT;
            
            // Throttle hits per finger
            const now = Date.now();
            if (isMovingDown && isInTapZone && (now - lastFingerDownTimeRef.current[index] > 300)) {
                lastFingerDownTimeRef.current[index] = now;
                
                if (index === targetLaneRef.current) { // Correct hit
                    scoreRef.current += 1;
                    consecutiveMistakesRef.current = 0;
                    tileStatesRef.current[index] = 'success';
                    try { NOTE_AUDIO[index].currentTime = 0; NOTE_AUDIO[index].play(); } catch (e) {}

                    // Create particles
                    for (let i = 0; i < PARTICLE_CONFIG.COUNT; i++) {
                        const angle = (Math.PI * 2 * i) / PARTICLE_CONFIG.COUNT;
                        particlesRef.current.push({ x: index * LANE_WIDTH + LANE_WIDTH / 2, y: GAME_HEIGHT - TILE_HEIGHT / 2, vx: Math.cos(angle) * PARTICLE_CONFIG.SPEED * (0.5 + Math.random() * 0.5), vy: Math.sin(angle) * PARTICLE_CONFIG.SPEED * (0.5 + Math.random() * 0.5) - 3, life: PARTICLE_CONFIG.LIFE, createdAt: now });
                    }
                    
                    // Set new target immediately
                    const newTarget = Math.floor(Math.random() * LANE_COUNT);
                    targetLaneRef.current = newTarget;
                    targetTimeRef.current = timestamp; // Reset timer
                    setTimeout(() => {
                        tileStatesRef.current = Array(LANE_COUNT).fill('normal');
                        tileStatesRef.current[newTarget] = 'target';
                    }, 100);

                } else { // Wrong hit
                    scoreRef.current -= 1;
                    consecutiveMistakesRef.current += 1;
                    tileStatesRef.current[index] = 'fail';
                    try { getDhummAudio()?.play(); } catch (e) {}
                    if (consecutiveMistakesRef.current >= 3) {
                      setGameState('GAME_OVER');
                    }
                    setTimeout(() => tileStatesRef.current[index] = 'normal', 100);
                }
                setScore(scoreRef.current); // Update React state for UI
            }
            finger.lastY = finger.y;
        });
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
    for (let i = 0; i < LANE_COUNT; i++) {
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(i * LANE_WIDTH, 0, LANE_WIDTH - 2, GAME_HEIGHT);
    }
    for (let i = 0; i < LANE_COUNT; i++) {
      const state = tileStatesRef.current[i];
      if (gameState !== 'PLAYING') ctx.fillStyle = '#444';
      else if (state === 'target') ctx.fillStyle = '#FFD700';
      else if (state === 'success') ctx.fillStyle = '#4CAF50';
      else if (state === 'fail') ctx.fillStyle = '#FF6B6B';
      else ctx.fillStyle = '#444';
      ctx.fillRect(i * LANE_WIDTH + 10, GAME_HEIGHT - TILE_HEIGHT, LANE_WIDTH - 20, TILE_HEIGHT);
    }
    smoothedFingersRef.current.forEach((pos, index) => {
      if (!pos) return;
      const isInTapZone = pos.y > GAME_HEIGHT - TAP_ZONE_HEIGHT;
      ctx.fillStyle = isInTapZone ? '#4CAF50' : '#ffffff50';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
      ctx.fill();
    });
    const now = Date.now();
    particlesRef.current.forEach(p => {
      const age = now - p.createdAt;
      if (age >= p.life) return;
      const progress = age / p.life;
      const alpha = 1 - progress;
      ctx.fillStyle = `rgba(76, 175, 80, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PARTICLE_CONFIG.SIZE, 0, Math.PI * 2);
      ctx.fill();
      p.x += p.vx; p.y += p.vy; p.vy += 0.2;
    });
    particlesRef.current = particlesRef.current.filter(p => (now - p.createdAt) < p.life);
    if (gameState === 'PLAYING' || gameState === 'GAME_OVER') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`Score: ${scoreRef.current}`, 20, 30);
      ctx.font = '18px Arial';
      ctx.fillText(`High Score: ${highScoreRef.current}`, 20, 60);
    }
    if (gameState === 'COUNTDOWN') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 120px \'Press Start 2P\', cursive';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(countdown.toString(), canvas.width / 2, canvas.height / 2);
    }

    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [landmarks, handedness, gameState, gameMode, countdown]);

  useEffect(() => {
    // This is the single entry point for starting and stopping the game loop.
    animationFrameRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameLoop]); // Re-subscribe if the gameLoop function changes

  const startCountdown = () => {
    setGameState('COUNTDOWN');
    setCountdown(3);
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
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
    trackedHandRef.current = null; // Reset for new game
    startCountdown();
  };

  const restartGame = () => {
    if(gameMode) {
        selectMode(gameMode);
    }
  }

  const exitGame = () => {
    stopVideo();
    setGameState('IDLE');
    setGameMode(null);
    trackedHandRef.current = null; // Reset on exit
  }

  const renderOverlayContent = () => {
    if (isHandTrackingLoading && gameState === 'LOADING') {
        return <div className="absolute inset-0 bg-black/60 flex flex-col gap-4 items-center justify-center rounded-lg text-white z-30"><Loader className="h-16 w-16 animate-spin" /><p className="font-headline text-3xl">Loading Hand Tracking...</p></div>;
    }
    
    if (gameState === 'GAME_OVER') {
        return (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-40">
                <h2 className="font-headline text-4xl text-red-500 mb-4">Game Over!</h2>
                <p className="text-xl mb-2">Final Score: {score}</p>
                <p className="text-lg mb-2">High Score: {highScore}</p>
                <p className="text-md mb-6">Mode: {gameMode && GAME_MODES[gameMode].name}</p>
                <div className="flex gap-4">
                    <Button onClick={restartGame}>Retry</Button>
                    <Button onClick={exitGame} variant="secondary">Exit</Button>
                </div>
            </div>
        );
    }

    if (gameState === 'IDLE') {
      return (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-40">
            <Card className="max-w-md w-full text-center p-6 bg-gray-900/80 border-gray-700">
                <CardContent className="pt-6">
                    <h2 className="font-headline text-4xl text-green-400 mb-4">Air Piano</h2>
                    <p className="text-muted-foreground mb-6">Use your fingers to tap the notes as they reach the bottom!</p>
                    {isMobile && (
                      <Alert className="mb-4 text-left">
                        <Smartphone className="h-4 w-4" />
                        <AlertTitle>Mobile Experience</AlertTitle>
                        <AlertDescription>
                          This game is best experienced on a desktop. Performance may be slower on mobile devices.
                        </AlertDescription>
                      </Alert>
                    )}
                    <Button onClick={() => setGameState('SELECT_MODE')} size="lg" className="font-headline text-lg w-full">Start Game</Button>
                </CardContent>
            </Card>
        </div>
      );
    }

    if (gameState === 'SELECT_MODE') {
      return (
         <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-40">
            <Card className="max-w-md w-full text-center p-6 bg-gray-900/80 border-gray-700">
                <CardContent className="pt-6">
                    <h2 className="font-headline text-3xl mb-6">Select Difficulty</h2>
                    <div className="flex gap-4 justify-center">
                        <Button onClick={() => selectMode('EASY')} size="lg">Easy</Button>
                        <Button onClick={() => selectMode('HARD')} size="lg" variant="destructive">Hard</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
      )
    }
    
    return null; // The canvas is the main view during gameplay, no overlay needed
  }

  return (
    <div className="container mx-auto px-4 py-4 lg:py-8 flex flex-col items-center justify-start lg:justify-center min-h-screen">
      <div className="w-full flex flex-col lg:flex-row items-center justify-center gap-8">
        {/* Camera Feed */}
        <div className="relative w-full lg:max-w-[400px] aspect-[3/4] lg:aspect-[4/5] rounded-lg overflow-hidden bg-muted shadow-lg">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]"></video>
            {isHandTrackingLoading && !videoRef.current?.srcObject && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white"><Loader className="h-12 w-12 animate-spin" /></div>}
        </div>
        {/* Game Canvas */}
        <div className="relative w-full" style={{maxWidth: LANE_COUNT * LANE_WIDTH, aspectRatio: `${LANE_COUNT * LANE_WIDTH} / ${GAME_HEIGHT}`}}>
            <canvas
                ref={canvasRef}
                width={LANE_COUNT * LANE_WIDTH}
                height={GAME_HEIGHT}
                className="w-full h-full rounded-lg shadow-lg bg-gradient-to-b from-gray-800 to-gray-900"
            />
             {renderOverlayContent()}
        </div>
      </div>
    </div>
  );
}
