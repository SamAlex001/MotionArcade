'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { generateMathProblem2, type GenerateMathProblem2Output } from '@/ai/flows/math-challenge-2-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, Loader, Timer, Smartphone, Target } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { landmarkToCanvas } from '@/lib/video-utils';

type GameState = 'IDLE' | 'LOADING' | 'PLAYING' | 'FEEDBACK' | 'LOADING_PROBLEM';
type Bubble = {
  value: number;
  popped: boolean;
};

const FEEDBACK_DURATION = 2000;
const BASE_TIMER_SECONDS = 20;
const EXTRA_TIME_PER_DIFFICULTY = 2;

export default function MathChallenge2Client() {
  const { videoRef, landmarks, startVideo, stopVideo, isLoading: isHandTrackingLoading, error: handTrackingError } = useHandTracking();
  const { toast, dismiss } = useToast();
  const toastIdRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playPopSound = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  }, []);
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<SVGSVGElement | null>(null);

  const [gameState, setGameState] = useState<GameState>('IDLE');
  const [difficulty, setDifficulty] = useState(3);
  const [currentProblem, setCurrentProblem] = useState<GenerateMathProblem2Output | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [lastAnswer, setLastAnswer] = useState<number | null>(null);
  
  const [problemTimerDuration, setProblemTimerDuration] = useState(BASE_TIMER_SECONDS);
  const [timeLeft, setTimeLeft] = useState(BASE_TIMER_SECONDS);

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
      setGameState('IDLE');
      stopVideo();
    } else {
      if (toastIdRef.current) {
        dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    }
  }, [handTrackingError, toast, stopVideo, dismiss]);

  const createBubbles = useCallback((problem: GenerateMathProblem2Output) => {
    bubbleRefs.current = [];
    return problem.options.map(option => ({
        value: option,
        popped: false,
    }));
  }, []);

  const fetchNewProblem = useCallback(async () => {
    setGameState('LOADING_PROBLEM');
    const timerDuration = BASE_TIMER_SECONDS + (difficulty * EXTRA_TIME_PER_DIFFICULTY);
    setProblemTimerDuration(timerDuration);
    try {
      const problem = await generateMathProblem2({ difficulty, currentScore: score });
      setCurrentProblem(problem);
      setBubbles(createBubbles(problem));
      setTimeLeft(timerDuration);
      setGameState('PLAYING');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'AI Error',
        description: 'Could not generate a new math problem.',
      });
      setGameState('IDLE');
    }
  }, [difficulty, score, toast, createBubbles]);


  const startGame = useCallback(async () => {
    setScore(0);
    setGameState('LOADING');
    await startVideo();
    await fetchNewProblem();
  }, [startVideo, fetchNewProblem]);
  
  const handleAnswer = useCallback((answer: 'correct' | 'incorrect', submitted: number | null) => {
      setGameState('FEEDBACK');
      setFeedback(answer);
      setLastAnswer(submitted);
      if (answer === 'correct') {
          setScore(s => s + 1);
      }
  }, []);

  const resetForNextQuestion = useCallback(() => {
    setFeedback(null);
    setLastAnswer(null);
    setBubbles([]);
    fetchNewProblem();
  }, [fetchNewProblem]);

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;

    if (gameState === 'PLAYING' && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    } else if (gameState === 'PLAYING' && timeLeft === 0) {
      handleAnswer('incorrect', null); // Time's up
    } else if (gameState === 'FEEDBACK') {
      timer = setTimeout(resetForNextQuestion, FEEDBACK_DURATION);
    }

    return () => clearTimeout(timer);
  }, [gameState, timeLeft, handleAnswer, resetForNextQuestion]);

  // Pointer and Bubble popping logic
  useEffect(() => {
    if (gameState !== 'PLAYING' || !landmarks.length || !videoContainerRef.current) return;
    
    const videoContainer = videoContainerRef.current;
    const pointer = pointerRef.current;
    const video = videoRef.current;
    
    // Index finger tip is landmark 8
    const indexTip = landmarks[0][8]; 
    if (!indexTip || !pointer || !video) return;

    const videoRect = videoContainer.getBoundingClientRect();
    const { x: tipX, y: tipY } = landmarkToCanvas(indexTip.x, indexTip.y, video);

    // Update pointer position imperatively for smoothness
    pointer.style.transform = `translate(${tipX}px, ${tipY}px)`;
    
    bubbleRefs.current.forEach((bubbleDiv, index) => {
        if (!bubbleDiv || bubbles[index].popped) return;
        
        const bubbleRect = bubbleDiv.getBoundingClientRect();
        // Convert to be relative to the video container, not the viewport
        const bubbleX = (bubbleRect.left - videoRect.left) + bubbleRect.width / 2;
        const bubbleY = (bubbleRect.top - videoRect.top) + bubbleRect.height / 2;
        const bubbleRadius = bubbleRect.width / 2;
        
        const distance = Math.sqrt(Math.pow(tipX - bubbleX, 2) + Math.pow(tipY - bubbleY, 2));
        
        if (distance < bubbleRadius) {
            playPopSound();

            setBubbles(prevBubbles => {
                const newBubbles = [...prevBubbles];
                if (newBubbles[index] && !newBubbles[index].popped) {
                    newBubbles[index].popped = true;
                    const isCorrect = newBubbles[index].value === currentProblem?.correctAnswer;
                    handleAnswer(isCorrect ? 'correct' : 'incorrect', newBubbles[index].value);
                }
                return newBubbles;
            });
        }
    });

  }, [landmarks, gameState, bubbles, currentProblem, handleAnswer, playPopSound]);


  const renderGameState = () => {
    if (gameState === 'IDLE') {
      return (
        <Card className="max-w-md w-full p-6">
          <CardContent className="pt-6 text-center">
            <h2 className="font-headline text-3xl mb-4">Math Challenge 2</h2>
            <p className="text-muted-foreground mb-8">
              Pop the bubbles with your hand to answer math questions that get harder as you go!
            </p>
            
            <div className="space-y-4 mb-8">
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
              <Alert className="mb-4 text-left">
                <Smartphone className="h-4 w-4" />
                <AlertTitle>Mobile Experience</AlertTitle>
                <AlertDescription>
                  This game is best experienced on a desktop. Performance may be slower on mobile devices.
                </AlertDescription>
              </Alert>
            )}
            <Button onClick={startGame} size="lg" className="font-headline text-lg w-full">Start Game</Button>
          </CardContent>
        </Card>
      );
    }

    const showLoading = gameState === 'LOADING' || isHandTrackingLoading;
    const bubbleSize = isMobile ? 'w-20 h-20 text-xl' : 'w-28 h-28 text-3xl';

    return (
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div ref={videoContainerRef} className="relative w-full aspect-[3/4] lg:aspect-video rounded-lg overflow-hidden bg-muted shadow-lg lg:col-span-2">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]"></video>
          
          {gameState === 'PLAYING' && (
             <div className="absolute top-0 left-0 w-full h-full flex justify-around items-start pt-24 px-4">
              {bubbles.map((bubble, index) => (
                <div
                  key={index}
                  ref={el => bubbleRefs.current[index] = el}
                  className={`flex items-center justify-center font-bold text-white transition-all duration-300 animate-float-gooey bubble-shiny ${bubble.popped ? 'animate-pop' : ''} ${bubbleSize}`}
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  <span className="drop-shadow-lg">{bubble.value}</span>
                </div>
              ))}
            </div>
          )}

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
        
          {gameState === 'PLAYING' && (
             <Target ref={pointerRef} className="absolute top-0 left-0 text-cyan-400 w-6 h-6 -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 ease-out" style={{pointerEvents: 'none'}} />
          )}

        </div>

        <div className="flex flex-col gap-4 w-full lg:col-span-1">
            <Card className="w-full p-6 text-center flex items-center justify-center flex-grow min-h-[140px] lg:min-h-[200px]">
               <div className="flex items-center justify-center h-full">
                {gameState === 'LOADING_PROBLEM' ? (
                  <Loader className="h-12 w-12 animate-spin text-primary" />
                ) : (
                  <p className="font-headline text-3xl md:text-4xl tracking-wide">
                    {currentProblem?.problem || 'Loading...'}
                  </p>
                )}
              </div>
            </Card>

            <Card className="w-full p-4">
              <div className="flex justify-between items-center text-lg gap-4">
                <div className="flex flex-col items-center">
                  <span className="font-bold text-primary text-sm">SCORE</span>
                  <span className="font-headline text-4xl">{score}</span>
                </div>
                 <div className="flex flex-col items-center">
                   <span className="text-muted-foreground text-sm flex items-center gap-1"><Timer className="h-4 w-4" /> TIME</span>
                  <span className="font-headline text-4xl w-20 text-center">{gameState === 'PLAYING' ? timeLeft : '...'}</span>
                </div>
              </div>
               {gameState === 'PLAYING' && (
                 <div className="mt-2 text-center">
                   <p className="text-sm text-muted-foreground">Pop the correct bubble!</p>
                   <Progress value={(timeLeft / problemTimerDuration) * 100} className="w-full h-2 mt-1" />
                 </div>
              )}
               {gameState === 'FEEDBACK' && currentProblem && (
                 <div className="mt-2 text-center">
                   <p className="text-sm text-muted-foreground">
                    {feedback === 'correct' ? `You got it!` : `The correct answer was ${currentProblem.correctAnswer}.`}
                    </p>
                 </div>
              )}
            </Card>
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
