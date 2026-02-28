'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { Loader, Trophy, Zap } from 'lucide-react';
import type { Landmark } from '@mediapipe/tasks-vision';
import { landmarkToNormalized } from '@/lib/video-utils';

// Constants
const PADDLE_WIDTH = 120;
const PADDLE_HEIGHT = 15;
const BALL_RADIUS = 12;
const BALL_SPEED = 5;
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
  const { videoRef, landmarks, isLoading, error, startVideo } = useHandTracking();
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const handTrackingCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const landmarksRef = useRef<Landmark[][]>();
  const lastFrameTime = useRef<number>(0);
  const frameCount = useRef<number>(0);

  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [combo, setCombo] = useState(0);

  // Particle effects
  const particles = useRef<Particle[]>([]);

  // Trail effect for ball
  const ballTrail = useRef<{ x: number; y: number; alpha: number }[]>([]);

  // Game state
  const ball = useRef({
    x: 0,
    y: 0,
    vx: 5,
    vy: 5,
  });
  const playerPaddle = useRef({ x: 0 });

  useEffect(() => {
    landmarksRef.current = landmarks;
  }, [landmarks]);

  useEffect(() => {
    startVideo();
  }, [startVideo]);

  const resetGame = () => {
    const gameCanvas = gameCanvasRef.current;
    if (!gameCanvas) return;

    setScore(0);
    setCombo(0);
    setGameOver(false);
    particles.current = [];
    ballTrail.current = [];
    ball.current.x = gameCanvas.width / 2;
    ball.current.y = gameCanvas.height / 2;
    ball.current.vx = BALL_SPEED * (Math.random() > 0.5 ? 1 : -1);
    ball.current.vy = -BALL_SPEED;
    playerPaddle.current.x = gameCanvas.width / 2 - PADDLE_WIDTH / 2;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    gameLoop();
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

  const gameLoop = () => {
    update();
    draw();
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  };

  const update = () => {
    if (gameOver) return;
    const gameCanvas = gameCanvasRef.current;
    if (!gameCanvas) return;

    // Throttle updates for better performance - only update every other frame
    frameCount.current++;
    
    // Update ball trail (reduced length for performance)
    ballTrail.current.unshift({ x: ball.current.x, y: ball.current.y, alpha: 1 });
    if (ballTrail.current.length > TRAIL_LENGTH) {
      ballTrail.current.pop();
    }

    // Move ball
    ball.current.x += ball.current.vx;
    ball.current.y += ball.current.vy;

    // Ball collision with walls
    if (ball.current.x - BALL_RADIUS < 0 || ball.current.x + BALL_RADIUS > gameCanvas.width) {
      ball.current.vx = -ball.current.vx;
      createParticles(ball.current.x, ball.current.y, '#3b82f6', 5); // Reduced particles
    }
    if (ball.current.y - BALL_RADIUS < 0) {
      ball.current.vy = -ball.current.vy;
      createParticles(ball.current.x, ball.current.y, '#3b82f6', 5); // Reduced particles
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
      
      // Maintain constant speed by normalizing the velocity vector
      const speed = Math.sqrt(ball.current.vx * ball.current.vx + ball.current.vy * ball.current.vy);
      ball.current.vx = Math.sin(angle) * speed;
      ball.current.vy = -Math.cos(angle) * speed;
      
      setScore((s) => s + 1);
      setCombo((c) => c + 1);
      
      // Create colorful particles on hit
      const hitColor = combo > 5 ? '#fbbf24' : combo > 2 ? '#10b981' : '#3b82f6';
      createParticles(ball.current.x, ball.current.y, hitColor, 10); // Reduced particles
    }

    // Game over when ball hits the bottom
    if (ball.current.y + BALL_RADIUS > gameCanvas.height) {
      setGameOver(true);
      setCombo(0);
      ball.current.vx = 0;
      ball.current.vy = 0;
      createParticles(ball.current.x, gameCanvas.height, '#ef4444', 20); // Reduced particles
    }

    // Update particles
    particles.current = particles.current.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // gravity
      p.life -= 0.03; // Faster decay for better performance
      return p.life > 0;
    });

    // Move paddle with hand (throttled to every frame now, no extra processing)
    if (landmarksRef.current && landmarksRef.current.length > 0) {
      const video = videoRef.current;
      const hand = landmarksRef.current[0];
      const indexFinger = hand[8]; // Using index finger tip (landmark 8) for more precise control
      if (indexFinger && video) {
        const { nx } = landmarkToNormalized(indexFinger.x, 0, video);
        const newPaddleX = nx * gameCanvas.width - PADDLE_WIDTH / 2;
        playerPaddle.current.x = Math.max(0, Math.min(newPaddleX, gameCanvas.width - PADDLE_WIDTH));
      }
    }
  };

  const draw = () => {
    const gameCanvas = gameCanvasRef.current;
    if (!gameCanvas) return;
    const ctx = gameCanvas.getContext('2d');
    if (!ctx) return;

    // Create gradient background (cached would be better but this is simple)
    const gradient = ctx.createLinearGradient(0, 0, 0, gameCanvas.height);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#1e293b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    // Simplified grid pattern (draw fewer lines)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < gameCanvas.height; i += 60) { // Doubled spacing for performance
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(gameCanvas.width, i);
      ctx.stroke();
    }

    // Draw center line
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
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
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Draw paddle with simplified gradient
    const paddleGradient = ctx.createLinearGradient(
      playerPaddle.current.x,
      gameCanvas.height - PADDLE_HEIGHT,
      playerPaddle.current.x + PADDLE_WIDTH,
      gameCanvas.height
    );
    
    // Paddle color changes based on combo (simplified - no heavy shadows)
    if (combo > 5) {
      paddleGradient.addColorStop(0, '#fbbf24');
      paddleGradient.addColorStop(0.5, '#f59e0b');
      paddleGradient.addColorStop(1, '#fbbf24');
    } else if (combo > 2) {
      paddleGradient.addColorStop(0, '#10b981');
      paddleGradient.addColorStop(0.5, '#059669');
      paddleGradient.addColorStop(1, '#10b981');
    } else {
      paddleGradient.addColorStop(0, '#60a5fa');
      paddleGradient.addColorStop(0.5, '#3b82f6');
      paddleGradient.addColorStop(1, '#60a5fa');
    }

    ctx.fillStyle = paddleGradient;
    ctx.fillRect(
      playerPaddle.current.x,
      gameCanvas.height - PADDLE_HEIGHT,
      PADDLE_WIDTH,
      PADDLE_HEIGHT
    );

    // Draw ball with simplified rendering
    ctx.fillStyle = '#60a5fa';
    ctx.shadowColor = '#60a5fa';
    ctx.shadowBlur = 15; // Reduced from 20
    ctx.beginPath();
    ctx.arc(ball.current.x, ball.current.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw combo indicator (only when needed)
    if (combo > 2) {
      ctx.font = 'bold 20px Arial'; // Slightly smaller
      ctx.textAlign = 'center';
      const comboColor = combo > 5 ? '#fbbf24' : '#10b981';
      ctx.fillStyle = comboColor;
      ctx.fillText(`${combo}x COMBO!`, gameCanvas.width / 2, 40);
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
    <main className="container mx-auto px-4 py-8 flex-grow flex flex-col items-center justify-center">
      <div className="w-full max-w-7xl">
        {/* Title Section */}
        <div className="text-center mb-6">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 bg-clip-text text-transparent mb-2">
            ⚡ Ping Pong Master
          </h1>
          <p className="text-gray-400 text-lg">Control the paddle with your hand movements!</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-1/2 w-full">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg blur opacity-25"></div>
              <div className="relative aspect-[3/4] lg:aspect-[4/3] bg-black flex items-center justify-center rounded-lg overflow-hidden border-2 border-blue-500/50">
                {isLoading && (
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col gap-4 items-center justify-center text-white z-30">
                    <Loader className="h-16 w-16 animate-spin text-blue-400" />
                    <p className="font-headline text-3xl bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
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
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg blur opacity-25"></div>
              <div className="relative aspect-[3/4] lg:aspect-[4/3] bg-black flex items-center justify-center rounded-lg overflow-hidden border-2 border-blue-500/50">
                <canvas ref={gameCanvasRef} className="w-full h-full" />
                
                {/* Game Over Overlay */}
                {gameOver && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-2xl border-2 border-blue-500/50 shadow-2xl max-w-md mx-4">
                      <Trophy className="w-16 h-16 mx-auto mb-4 text-yellow-400" />
                      <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        Game Over!
                      </h2>
                      <div className="space-y-3 mb-6">
                        <div className="flex justify-between items-center text-xl">
                          <span className="text-gray-400">Final Score:</span>
                          <span className="font-bold text-blue-400 text-2xl">{score}</span>
                        </div>
                        <div className="flex justify-between items-center text-xl">
                          <span className="text-gray-400">High Score:</span>
                          <span className="font-bold text-yellow-400 text-2xl">{highScore}</span>
                        </div>
                      </div>
                      <button
                        onClick={resetGame}
                        className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-6 py-3 rounded-lg font-bold text-lg transition-all transform hover:scale-105 shadow-lg"
                      >
                        Play Again
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Score Display */}
                <div className="absolute top-4 right-4 text-white text-right space-y-2">
                  <div className="bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg border border-blue-500/50">
                    <p className="text-sm text-gray-400">Score</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                      {score}
                    </p>
                  </div>
                  <div className="bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg border border-yellow-500/50">
                    <p className="text-sm text-gray-400">High Score</p>
                    <p className="text-2xl font-bold text-yellow-400">{highScore}</p>
                  </div>
                  {combo > 2 && (
                    <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-sm px-4 py-2 rounded-lg border border-green-500/50 animate-pulse">
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-green-400" />
                        <p className="text-xl font-bold text-green-400">{combo}x</p>
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
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-8 py-3 rounded-lg font-bold text-lg transition-all transform hover:scale-105 shadow-lg"
              >
                🎮 Restart Game
              </button>
            </div>

            {/* Instructions */}
            <div className="mt-6 bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-lg border border-blue-500/30">
              <h3 className="text-xl font-bold text-blue-400 mb-3">How to Play</h3>
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
