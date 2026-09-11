'use client';

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


import React, { useEffect, useRef, useState } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { Loader, Trophy, Zap } from 'lucide-react';
import { landmarkToNormalized } from '@/lib/video-utils';

// Constants
const PADDLE_WIDTH = 120;
const PADDLE_HEIGHT = 15;
const BALL_RADIUS = 12;
const BALL_SPEED_PPS = 200; // pixels per second (frame-rate independent)
const SPEED_INCREASE_PER_POINT = 0.05; // +5% ball speed per point scored
// Speed ramps +5% per point until 4x (reached at 60 points); beyond that it
// keeps growing, but only +5% every 5 points.
const FAST_RAMP_LIMIT = 4;
const FAST_RAMP_SCORE = (FAST_RAMP_LIMIT - 1) / SPEED_INCREASE_PER_POINT; // 60
const speedMultiplierFor = (score: number) =>
  score <= FAST_RAMP_SCORE
    ? 1 + score * SPEED_INCREASE_PER_POINT
    : FAST_RAMP_LIMIT + Math.floor((score - FAST_RAMP_SCORE) / 5) * SPEED_INCREASE_PER_POINT;
const MAX_PARTICLES = 100; // Limit particles for performance
const TRAIL_LENGTH = 5; // Reduced from 10 for better performance

// Particle system for visual effects
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export default function PingPongClient() {
  const { videoRef, landmarksRef, isLoading, error, startVideo } = useHandTracking();
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const handTrackingCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const lastFrameTime = useRef<number>(0);

  // Cached gradients (rebuilt only on canvas resize / combo change).
  const cachedBgGradient = useRef<CanvasGradient | null>(null);
  const cachedBgKey      = useRef<string>('');
  const cachedPaddleGradients = useRef<Record<string, CanvasGradient>>({});

  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [combo, setCombo] = useState(0);

  // The rAF loop re-schedules itself with the closure it was started from, so
  // it never sees later state updates. Loop logic must read these refs instead
  // of the state values (state remains the source for the React UI).
  const gameOverRef = useRef(false);
  const comboRef = useRef(0);
  const scoreRef = useRef(0);

  // Particle effects
  const particles = useRef<Particle[]>([]);

  // Trail effect for ball
  const ballTrail = useRef<{ x: number; y: number; alpha: number }[]>([]);

  // Game state
  const ball = useRef({
    x: 0,
    y: 0,
    vx: BALL_SPEED_PPS,
    vy: BALL_SPEED_PPS,
  });
  const playerPaddle = useRef({ x: 0 });
  const targetPaddleX = useRef<number>(0);

  useEffect(() => {
    startVideo();
  }, [startVideo]);

  const resetGame = () => {
    const gameCanvas = gameCanvasRef.current;
    if (!gameCanvas) return;

    setScore(0);
    setCombo(0);
    setGameOver(false);
    gameOverRef.current = false;
    comboRef.current = 0;
    scoreRef.current = 0;
    particles.current = [];
    ballTrail.current = [];
    ball.current.x = gameCanvas.width / 2;
    ball.current.y = gameCanvas.height / 2;
    ball.current.vx = BALL_SPEED_PPS * (Math.random() > 0.5 ? 1 : -1);
    ball.current.vy = -BALL_SPEED_PPS;
    playerPaddle.current.x = gameCanvas.width / 2 - PADDLE_WIDTH / 2;
    targetPaddleX.current = playerPaddle.current.x;
    lastFrameTime.current = 0;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  };

  const createParticles = (x: number, y: number, color: string, count: number = 10) => {
    // Limit total particles for performance
    if (particles.current.length > MAX_PARTICLES) return;
    
    const particlesToCreate = Math.min(count, MAX_PARTICLES - particles.current.length);
    for (let i = 0; i < particlesToCreate; i++) {
      const angle = (Math.PI * 2 * i) / particlesToCreate;
      const speed = 2 + Math.random() * 3;
      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color,
      });
    }
  };

  const gameLoop = (timestamp: number = performance.now()) => {
    const dt = lastFrameTime.current > 0
      ? Math.min((timestamp - lastFrameTime.current) / 1000, 0.05)
      : 1 / 60;
    lastFrameTime.current = timestamp;
    update(dt);
    draw();
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  };

  const update = (dt: number) => {
    if (gameOverRef.current) return;
    const gameCanvas = gameCanvasRef.current;
    if (!gameCanvas) return;

    // Update ball trail (reduced length for performance)
    ballTrail.current.unshift({ x: ball.current.x, y: ball.current.y, alpha: 1 });
    if (ballTrail.current.length > TRAIL_LENGTH) {
      ballTrail.current.pop();
    }

    // Move ball (delta-time scaled so speed is frame-rate independent)
    ball.current.x += ball.current.vx * dt;
    ball.current.y += ball.current.vy * dt;

    // Ball collision with walls. Position is clamped back inside the bounds
    // and velocity forced away from the wall — a pure sign-flip lets a fast
    // ball that penetrated the wall flip direction every frame while still
    // outside, oscillate, and escape the canvas.
    if (ball.current.x - BALL_RADIUS < 0) {
      ball.current.x = BALL_RADIUS;
      ball.current.vx = Math.abs(ball.current.vx);
      createParticles(ball.current.x, ball.current.y, '#2dd4bf', 5); // Reduced particles
    } else if (ball.current.x + BALL_RADIUS > gameCanvas.width) {
      ball.current.x = gameCanvas.width - BALL_RADIUS;
      ball.current.vx = -Math.abs(ball.current.vx);
      createParticles(ball.current.x, ball.current.y, '#2dd4bf', 5); // Reduced particles
    }
    if (ball.current.y - BALL_RADIUS < 0) {
      ball.current.y = BALL_RADIUS;
      ball.current.vy = Math.abs(ball.current.vy);
      createParticles(ball.current.x, ball.current.y, '#2dd4bf', 5); // Reduced particles
    }

    // Ball collision with paddle
    if (
      ball.current.vy > 0 &&
      ball.current.y + BALL_RADIUS >= gameCanvas.height - PADDLE_HEIGHT &&
      ball.current.x + BALL_RADIUS >= playerPaddle.current.x &&
      ball.current.x - BALL_RADIUS <= playerPaddle.current.x + PADDLE_WIDTH
    ) {
      // Calculate hit point (-1 to 1, where 0 is center of paddle)
      const hitPoint = (ball.current.x - (playerPaddle.current.x + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
      
      // Calculate new angle based on hit point (max 60 degrees from vertical)
      const maxAngle = Math.PI / 3; // 60 degrees
      const angle = hitPoint * maxAngle;
      
      setScore((s) => s + 1);
      setCombo((c) => c + 1);
      comboRef.current += 1;
      scoreRef.current += 1;

      // Ball speed scales with score: +5% per point up to 4x, then +5% per
      // 5 points beyond that.
      const speed = BALL_SPEED_PPS * speedMultiplierFor(scoreRef.current);
      ball.current.vx = Math.sin(angle) * speed;
      ball.current.vy = -Math.cos(angle) * speed;
      // Clamp the ball above the paddle so a fast frame can't leave it below
      // the paddle line and trigger the game-over check right after bouncing.
      ball.current.y = gameCanvas.height - PADDLE_HEIGHT - BALL_RADIUS;

      // Create colorful particles on hit
      const hitColor = comboRef.current > 5 ? '#fbbf24' : comboRef.current > 2 ? '#10b981' : '#2dd4bf';
      createParticles(ball.current.x, ball.current.y, hitColor, 10); // Reduced particles
    }

    // Game over when ball hits the bottom
    if (ball.current.y + BALL_RADIUS > gameCanvas.height) {
      setGameOver(true);
      setCombo(0);
      gameOverRef.current = true;
      comboRef.current = 0;
      ball.current.vx = 0;
      ball.current.vy = 0;
      createParticles(ball.current.x, gameCanvas.height, '#ff5c5c', 20); // Reduced particles
    }

    // Update particles — in-place compaction, no new array.
    const ps = particles.current;
    let w = 0;
    for (let r = 0; r < ps.length; r++) {
      const p = ps[r];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.life -= 0.03;
      if (p.life > 0) ps[w++] = p;
    }
    ps.length = w;

    // Update paddle target from hand tracking (inference may run every 2-4 frames)
    if (landmarksRef.current && landmarksRef.current.length > 0) {
      const video = videoRef.current;
      const hand = landmarksRef.current[0];
      const indexFinger = hand[8];
      if (indexFinger && video) {
        const { nx } = landmarkToNormalized(indexFinger.x, 0, video);
        const newPaddleX = nx * gameCanvas.width - PADDLE_WIDTH / 2;
        targetPaddleX.current = Math.max(0, Math.min(newPaddleX, gameCanvas.width - PADDLE_WIDTH));
      }
    }
    // Lerp paddle toward target for smooth motion even between inference frames
    const alpha = 1 - Math.pow(0.6, dt * 60); // ~40% per frame at 60fps
    playerPaddle.current.x += (targetPaddleX.current - playerPaddle.current.x) * alpha;
  };

  const draw = () => {
    const gameCanvas = gameCanvasRef.current;
    if (!gameCanvas) return;
    const ctx = gameCanvas.getContext('2d');
    if (!ctx) return;

    // Cached background gradient — only rebuilt on resize.
    const bgKey = `${gameCanvas.width}x${gameCanvas.height}`;
    if (cachedBgKey.current !== bgKey || !cachedBgGradient.current) {
      const g = ctx.createLinearGradient(0, 0, 0, gameCanvas.height);
      g.addColorStop(0, '#0b1a1e');
      g.addColorStop(1, '#10262b');
      cachedBgGradient.current = g;
      cachedBgKey.current = bgKey;
      cachedPaddleGradients.current = {}; // paddle gradients depend on dims
    }
    ctx.fillStyle = cachedBgGradient.current!;
    ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    // Simplified grid pattern (draw fewer lines)
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < gameCanvas.height; i += 60) { // Doubled spacing for performance
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(gameCanvas.width, i);
      ctx.stroke();
    }

    // Draw center line
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(gameCanvas.width / 2, 0);
    ctx.lineTo(gameCanvas.width / 2, gameCanvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw particles (simplified)
    ctx.globalAlpha = 1;
    particles.current.forEach((p) => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4); // Use fillRect instead of arc for performance
    });
    ctx.globalAlpha = 1;

    // Simplified ball trail (less intensive rendering)
    const trailLength = ballTrail.current.length;
    for (let i = 0; i < trailLength; i++) {
      const trail = ballTrail.current[i];
      const alpha = (1 - i / trailLength) * 0.4;
      ctx.globalAlpha = alpha;
      const size = BALL_RADIUS * (1 - i / trailLength);
      ctx.fillStyle = '#5eead4';
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Paddle gradient — three color tiers cached by x position bucket.
    // The gradient direction is horizontal across the paddle, so it shifts
    // with the paddle's x. We rebuild only when the bucket changes.
    const tier = comboRef.current > 5 ? 'gold' : comboRef.current > 2 ? 'green' : 'blue';
    const xBucket = Math.round(playerPaddle.current.x / 8) * 8;
    const paddleKey = `${tier}:${xBucket}`;
    let paddleGradient = cachedPaddleGradients.current[paddleKey];
    if (!paddleGradient) {
      paddleGradient = ctx.createLinearGradient(
        xBucket,
        gameCanvas.height - PADDLE_HEIGHT,
        xBucket + PADDLE_WIDTH,
        gameCanvas.height,
      );
      if (tier === 'gold') {
        paddleGradient.addColorStop(0, '#fbbf24');
        paddleGradient.addColorStop(0.5, '#f59e0b');
        paddleGradient.addColorStop(1, '#fbbf24');
      } else if (tier === 'green') {
        paddleGradient.addColorStop(0, '#10b981');
        paddleGradient.addColorStop(0.5, '#059669');
        paddleGradient.addColorStop(1, '#10b981');
      } else {
        paddleGradient.addColorStop(0, '#5eead4');
        paddleGradient.addColorStop(0.5, '#2dd4bf');
        paddleGradient.addColorStop(1, '#5eead4');
      }
      // Cap cache to avoid unbounded growth.
      const keys = Object.keys(cachedPaddleGradients.current);
      if (keys.length > 80) delete cachedPaddleGradients.current[keys[0]];
      cachedPaddleGradients.current[paddleKey] = paddleGradient;
    }

    ctx.fillStyle = paddleGradient;
    ctx.fillRect(
      playerPaddle.current.x,
      gameCanvas.height - PADDLE_HEIGHT,
      PADDLE_WIDTH,
      PADDLE_HEIGHT,
    );

    // Draw ball with simplified rendering
    ctx.fillStyle = '#5eead4';
    ctx.shadowColor = '#5eead4';
    ctx.shadowBlur = 15; // Reduced from 20
    ctx.beginPath();
    ctx.arc(ball.current.x, ball.current.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw combo indicator (only when needed)
    if (comboRef.current > 2) {
      ctx.font = 'bold 20px Arial'; // Slightly smaller
      ctx.textAlign = 'center';
      const comboColor = comboRef.current > 5 ? '#fbbf24' : '#10b981';
      ctx.fillStyle = comboColor;
      ctx.fillText(`${comboRef.current}x COMBO!`, gameCanvas.width / 2, 40);
    }
  };

  useEffect(() => {
    const gameCanvas = gameCanvasRef.current;
    if (!gameCanvas || isLoading) return;
    
    // Set initial canvas size and start the game
    gameCanvas.width = gameCanvas.clientWidth;
    gameCanvas.height = gameCanvas.clientHeight;
    resetGame();

    const resizeObserver = new ResizeObserver(() => {
        if (gameCanvas.clientWidth > 0 && gameCanvas.clientHeight > 0) {
            gameCanvas.width = gameCanvas.clientWidth;
            gameCanvas.height = gameCanvas.clientHeight;
            resetGame();
        }
    });
    resizeObserver.observe(gameCanvas);

    return () => {
      resizeObserver.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isLoading]);


  useEffect(() => {
    if (gameOver) {
      setHighScore((prevHighScore) => Math.max(score, prevHighScore));
    }
  }, [gameOver, score]);


  return (
    <main className="container mx-auto px-4 py-4 lg:py-8 flex-grow flex flex-col items-center justify-start lg:justify-center">
      <div className="w-full max-w-7xl">
        {/* Title Section */}
        <div className="text-center mb-6">
          <h1 className="text-5xl font-headline font-bold text-white mb-2">
            ⚡ Ping Pong <span className="text-orange-400">Master</span>
          </h1>
          <p className="text-gray-400 text-lg">Control the paddle with your hand movements!</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-1/2 w-full">
            <div className="relative">
              <div className="absolute -inset-1 bg-orange-500 rounded-2xl blur opacity-25"></div>
              <div className="relative aspect-[3/4] lg:aspect-[4/3] bg-black flex items-center justify-center rounded-2xl overflow-hidden border-2 border-orange-400/70">
                {isLoading && (
                  <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex flex-col gap-4 items-center justify-center text-white z-30">
                    <Loader className="h-16 w-16 animate-spin text-orange-400" />
                    <p className="font-headline font-bold text-3xl text-white">
                      Loading Hand Tracking...
                    </p>
                  </div>
                )}
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                  style={{ transform: 'scaleX(-1)' }}
                />
                <canvas
                  ref={handTrackingCanvasRef}
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            </div>
          </div>

          <div className="lg:w-1/2 w-full">
            <div className="relative">
              <div className="absolute -inset-1 bg-orange-500 rounded-2xl blur opacity-25"></div>
              <div className="relative aspect-[3/4] lg:aspect-[4/3] bg-black flex items-center justify-center rounded-2xl overflow-hidden border-2 border-orange-400/70">
                <canvas ref={gameCanvasRef} className="w-full h-full" />
                
                {/* Game Over Overlay */}
                {gameOver && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                    <div className="p-8 rounded-2xl border-2 border-orange-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-orange-500/40 max-w-md mx-4">
                      <Trophy className="w-16 h-16 mx-auto mb-4 text-yellow-400" />
                      <h2 className="text-5xl font-headline font-bold mb-4 text-white">
                        Game <span className="text-orange-400">Over!</span>
                      </h2>
                      <div className="space-y-3 mb-6">
                        <div className="flex justify-between items-center text-xl">
                          <span className="text-gray-400">Final Score:</span>
                          <span className="font-bold text-orange-300 text-2xl">{score}</span>
                        </div>
                        <div className="flex justify-between items-center text-xl">
                          <span className="text-gray-400">High Score:</span>
                          <span className="font-bold text-yellow-400 text-2xl">{highScore}</span>
                        </div>
                      </div>
                      <button
                        onClick={resetGame}
                        className="w-full rounded-xl border-2 border-white/80 bg-orange-500 px-6 py-3 font-headline font-bold text-white text-lg shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-orange-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]"
                      >
                        Play Again
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Score Display */}
                <div className="absolute top-4 right-4 text-white text-right space-y-2">
                  <div className="rounded-full border-2 border-white/20 bg-black/60 px-4 py-1.5 backdrop-blur">
                    <p className="text-sm font-headline text-gray-400">Score</p>
                    <p className="text-3xl font-headline font-bold text-orange-300">
                      {score}
                    </p>
                  </div>
                  <div className="rounded-full border-2 border-white/20 bg-black/60 px-4 py-1.5 backdrop-blur">
                    <p className="text-sm font-headline text-gray-400">High Score</p>
                    <p className="text-2xl font-headline font-bold text-yellow-400">{highScore}</p>
                  </div>
                  <div className="rounded-full border-2 border-white/20 bg-black/60 px-4 py-1.5 backdrop-blur">
                    <p className="text-sm font-headline text-gray-400">Ball Speed</p>
                    <p className="text-xl font-headline font-bold text-teal-300">{speedMultiplierFor(score).toFixed(2)}x</p>
                  </div>
                  {combo > 2 && (
                    <div className="rounded-full border-2 border-green-500/50 bg-black/60 px-4 py-1.5 backdrop-blur animate-pulse">
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-green-400" />
                        <p className="text-xl font-headline font-bold text-green-400">{combo}x</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={resetGame}
                className="rounded-xl border-2 border-white/80 bg-orange-500 px-8 py-3 font-headline font-bold text-white text-lg shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-orange-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]"
              >
                🎮 Restart Game
              </button>
            </div>

            {/* Instructions */}
            <div className="mt-6 p-6 rounded-2xl border-2 border-orange-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-orange-500/40">
              <h3 className="text-xl font-headline font-bold text-orange-400 mb-3">How to Play</h3>
              <ul className="text-gray-300 space-y-2">
                <li>✋ Move your hand left and right to control the paddle</li>
                <li>⚡ Build combos by hitting the ball consecutively</li>
                <li>🎯 Higher combos = cooler effects!</li>
                <li>🏆 Beat your high score!</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
