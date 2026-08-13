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


import { useState, useEffect, useCallback, useRef } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { generateMathProblem, type GenerateMathProblemOutput } from '@/ai/flows/dynamic-math-problem-generation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, Loader, Hand, Timer, Smartphone, Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { landmarkToCanvas } from '@/lib/video-utils';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

type GameState = 'DIFFICULTY_SELECTION' | 'LOADING' | 'PLAYING' | 'HOLDING' | 'FEEDBACK' | 'LOADING_PROBLEM';

const FEEDBACK_DURATION = 1500;
const BASE_TIMER_SECONDS = 10;
const EXTRA_TIME_PER_DIFFICULTY = 1;
const ANSWER_HOLD_SECONDS = 3;

export default function MathChallengeClient() {
  const { videoRef, detectedFingers, landmarks, startVideo, stopVideo, isLoading: isHandTrackingLoading, error: handTrackingError } = useHandTracking();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast, dismiss } = useToast();
  const toastIdRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  
  const [gameState, setGameState] = useState<GameState>('DIFFICULTY_SELECTION');
  const [difficulty, setDifficulty] = useState(3);
  const [currentProblem, setCurrentProblem] = useState<GenerateMathProblemOutput | null>(null);
  const [score, setScore] = useState(0);
  const [pastScores, setPastScores] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  
  const [problemTimerDuration, setProblemTimerDuration] = useState(BASE_TIMER_SECONDS);
  const [timeLeft, setTimeLeft] = useState(BASE_TIMER_SECONDS);

  const [holdTime, setHoldTime] = useState(ANSWER_HOLD_SECONDS);
  const [potentialAnswer, setPotentialAnswer] = useState<number | null>(null);
  const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState<number | null>(null);

  useEffect(() => {
    if (handTrackingError) {
      if (!toastIdRef.current) {
        const { id } = toast({
          variant: 'destructive',
          title: 'Error',
          description: handTrackingError,
        });
        toastIdRef.current = id;
      }
      setGameState('DIFFICULTY_SELECTION');
      stopVideo();
    } else {
      if (toastIdRef.current) {
        dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    }
  }, [handTrackingError, toast, stopVideo, dismiss]);

  const fetchNewProblem = useCallback(async () => {
    setGameState('LOADING_PROBLEM');
    const timerDuration = BASE_TIMER_SECONDS + (difficulty * EXTRA_TIME_PER_DIFFICULTY);
    setProblemTimerDuration(timerDuration);
    
    try {
      const problem = await generateMathProblem({ difficulty, currentScore: score, pastScores });
      setCurrentProblem(problem);
      setTimeLeft(timerDuration);
      setGameState('PLAYING');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'AI Error',
        description: 'Could not generate a new math problem.',
      });
      setGameState('DIFFICULTY_SELECTION');
    }
  }, [difficulty, score, pastScores, toast]);

  const startGame = useCallback(async () => {
    setScore(0);
    setPastScores([]);
    setGameState('LOADING');
    await startVideo();
    await fetchNewProblem();
  }, [startVideo, fetchNewProblem]);
  
  const handleAnswer = useCallback((answer: 'correct' | 'incorrect', submitted: number | null) => {
      setGameState('FEEDBACK');
      setFeedback(answer);
      setLastSubmittedAnswer(submitted);
      if (answer === 'correct') {
          setScore(s => s + 1);
      }
      if(score > 0 && answer === 'incorrect'){
          setPastScores(ps => [...ps, score]);
      }
  }, [score]);

  const resetForNextQuestion = useCallback(() => {
    setFeedback(null);
    setPotentialAnswer(null);
    setLastSubmittedAnswer(null);
    fetchNewProblem();
  }, [fetchNewProblem]);

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;

    if (gameState === 'PLAYING' && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    } else if (gameState === 'PLAYING' && timeLeft === 0) {
      handleAnswer('incorrect', null);
    } else if (gameState === 'HOLDING' && holdTime > 0) {
        timer = setTimeout(() => setHoldTime(t => t - 1), 1000);
    } else if (gameState === 'HOLDING' && holdTime === 0) {
        if (potentialAnswer !== null && currentProblem) {
            const isCorrect = potentialAnswer === currentProblem.solution;
            handleAnswer(isCorrect ? 'correct' : 'incorrect', potentialAnswer);
        }
    } else if (gameState === 'FEEDBACK') {
      timer = setTimeout(resetForNextQuestion, FEEDBACK_DURATION);
    }

    return () => clearTimeout(timer);
  }, [gameState, timeLeft, holdTime, potentialAnswer, currentProblem, handleAnswer, resetForNextQuestion]);

  useEffect(() => {
    if (gameState !== 'PLAYING' || !currentProblem) return;

    if (detectedFingers > 0 && detectedFingers <= 10) {
        setPotentialAnswer(detectedFingers);
        setHoldTime(ANSWER_HOLD_SECONDS);
        setGameState('HOLDING');
    }
  }, [detectedFingers, gameState, currentProblem]);
  
  useEffect(() => {
    if(gameState === 'HOLDING') {
      if (detectedFingers !== potentialAnswer) {
        setPotentialAnswer(null);
        setGameState('PLAYING');
      }
    }
  }, [detectedFingers, potentialAnswer, gameState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (landmarks.length > 0 && ['PLAYING', 'HOLDING'].includes(gameState)) {
      const primaryHand = landmarks[0];
      const wrist = primaryHand[0]; 
      if (!wrist) return;

      const { x, y } = landmarkToCanvas(wrist.x, wrist.y, video);
      
      ctx.beginPath();
      ctx.arc(x, y - 40, 30, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(45, 212, 191, 0.9)';
      ctx.fill();

      ctx.fillStyle = 'white';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(detectedFingers.toString(), x, y - 40);
    }
  }, [landmarks, detectedFingers, gameState, videoRef]);


  const renderGameState = () => {
    if (gameState === 'DIFFICULTY_SELECTION') {
      return (
        <Card className="max-w-md w-full p-6 rounded-2xl border-2 border-teal-400/70 bg-black/75 text-white backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-teal-500/40">
            <CardContent className="pt-6">
              <h2 className="font-headline font-bold text-3xl mb-4 text-center">Math <span className="text-teal-400">Challenge</span></h2>
              <p className="text-white/70 mb-8 text-center">
                Use your hands to answer math questions. The answer will always be between 0 and 10.
              </p>
              
              <div className="space-y-4">
                <Label htmlFor="difficulty-slider" className="text-center block">Difficulty Level: {difficulty}</Label>
                <Slider
                  id="difficulty-slider"
                  min={1}
                  max={10}
                  step={1}
                  value={[difficulty]}
                  onValueChange={(value) => setDifficulty(value[0])}
                />
              </div>

               {isMobile && (
                 <Alert className="mt-6 rounded-xl border-2 border-white/40 bg-white/10 text-white">
                  <Smartphone className="h-4 w-4" />
                  <AlertTitle>Mobile Experience</AlertTitle>
                  <AlertDescription>
                    For the best experience, play on a desktop. Performance may vary on mobile devices.
                  </AlertDescription>
                </Alert>
              )}

              <Button onClick={startGame} size="lg" className="font-headline font-bold text-lg mt-8 w-full rounded-xl border-2 border-white/80 bg-teal-500 text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-teal-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]">Start Game</Button>
            </CardContent>
          </Card>
      );
    }

    const showLoading = gameState === 'LOADING' || isHandTrackingLoading;
    const isThinking = gameState === 'PLAYING';
    const isHolding = gameState === 'HOLDING';

    return (
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="relative w-full aspect-[3/4] lg:aspect-video rounded-2xl border-2 border-teal-400/70 overflow-hidden bg-black/60 shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-teal-500/40">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]"></video>
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none"></canvas>
          
          {(showLoading) && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
              <Loader className="h-12 w-12 animate-spin" />
            </div>
          )}
          {feedback && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              {feedback === 'correct' ? <CheckCircle2 className="h-32 w-32 text-green-400" /> : <XCircle className="h-32 w-32 text-red-400" />}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 w-full">
            <Card className="w-full p-6 text-center flex items-center justify-center flex-grow min-h-[140px] lg:min-h-[200px] rounded-2xl border-2 border-white/20 bg-black/60 text-white backdrop-blur">
               <div className="flex items-center justify-center h-full">
                {gameState === 'LOADING_PROBLEM' ? (
                  <Loader className="h-12 w-12 animate-spin text-teal-400" />
                ) : (
                  <p className="font-headline font-bold text-3xl md:text-4xl tracking-wide">
                    {currentProblem?.problem || 'Loading...'}
                  </p>
                )}
              </div>
            </Card>

            <Card className="w-full p-4 rounded-2xl border-2 border-white/20 bg-black/60 text-white backdrop-blur">
              <div className="flex justify-between items-center text-lg gap-4">
                <div className="flex flex-col items-center">
                  <span className="font-headline font-bold text-teal-400 text-sm">SCORE</span>
                  <span className="font-headline font-bold text-4xl text-teal-300">{score}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-white/60 text-sm flex items-center gap-1"><Hand className="h-4 w-4" /> GUESS</span>
                  <span className="font-headline font-bold text-4xl">{potentialAnswer ?? detectedFingers ?? '?'}</span>
                </div>
                <div className="flex flex-col items-center">
                   <span className="text-white/60 text-sm flex items-center gap-1"><Timer className="h-4 w-4" /> TIME</span>
                  <span className="font-headline font-bold text-4xl w-20 text-center">{isThinking ? timeLeft : isHolding ? holdTime : '...'}</span>
                </div>
              </div>
               
               {isThinking && (
                 <div className="mt-2 text-center">
                   <p className="text-sm text-white/60">Show your answer!</p>
                   <Progress value={(timeLeft / problemTimerDuration) * 100} className="w-full h-2 mt-1" />
                 </div>
              )}
               {isHolding && (
                 <div className="mt-2 text-center">
                   <p className="text-sm text-white/60">Hold your answer to confirm!</p>
                   <Progress value={((ANSWER_HOLD_SECONDS - holdTime) / ANSWER_HOLD_SECONDS) * 100} className="w-1/2 mx-auto h-2 mt-1" />
                 </div>
              )}
            </Card>

            {/* Instructions */}
            <div className="mt-4 p-6 rounded-2xl border-2 border-teal-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-teal-500/40">
              <h3 className="text-xl font-headline font-bold text-teal-400 mb-3">How to Play</h3>
              <ul className="text-gray-300 space-y-2">
                <li>✋ Read the math problem on the screen</li>
                <li>✌️ Show the answer by holding up the correct number of fingers (0-10)</li>
                <li>⏳ Hold your hands steady to lock in your answer!</li>
                <li>🏆 Answer before the timer runs out to score points</li>
              </ul>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-4 lg:py-8 flex flex-col items-center justify-start lg:justify-center min-h-[calc(100vh-56px)]">
      {renderGameState()}
    </div>
  );
}
