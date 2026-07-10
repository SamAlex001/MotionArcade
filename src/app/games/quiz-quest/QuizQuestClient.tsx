'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { generateQuizQuestion, type GenerateQuizQuestionOutput } from '@/ai/flows/quiz-quest-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, Loader, Hand, Timer, Smartphone } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { landmarkToCanvas } from '@/lib/video-utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type GameState = 'SUBJECT_SELECTION' | 'LOADING' | 'PLAYING' | 'HOLDING' | 'FEEDBACK' | 'LOADING_PROBLEM';

const FEEDBACK_DURATION = 2000;
const THINKING_TIMER_SECONDS = 10;
const ANSWER_HOLD_SECONDS = 3;

const subjects = [
  { id: 'general-knowledge', label: 'General Knowledge' },
  { id: 'science', label: 'Science' },
  { id: 'history', label: 'History' },
  { id: 'computer', label: 'Computers' },
];

export default function QuizQuestClient() {
  const { videoRef, detectedFingers, landmarks, startVideo, stopVideo, isLoading: isHandTrackingLoading, error: handTrackingError } = useHandTracking();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast, dismiss } = useToast();
  const toastIdRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  
  const [gameState, setGameState] = useState<GameState>('SUBJECT_SELECTION');
  const [currentProblem, setCurrentProblem] = useState<GenerateQuizQuestionOutput | null>(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [timeLeft, setTimeLeft] = useState(THINKING_TIMER_SECONDS);
  const [holdTime, setHoldTime] = useState(ANSWER_HOLD_SECONDS);
  const [potentialAnswer, setPotentialAnswer] = useState<number | null>(null);
  const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState<number | null>(null);
  
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(['General Knowledge']);
  const [otherSubject, setOtherSubject] = useState('');

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
      setGameState('SUBJECT_SELECTION');
      stopVideo();
    } else {
      if (toastIdRef.current) {
        dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    }
  }, [handTrackingError, toast, stopVideo, dismiss]);

  const getFinalSubjects = useCallback(() => {
    const finalSubjects = [...selectedSubjects];
    if(otherSubject.trim()){
        finalSubjects.push(otherSubject.trim());
    }
    return finalSubjects.length > 0 ? finalSubjects : ['General Knowledge'];
  }, [selectedSubjects, otherSubject]);

  const fetchNewProblem = useCallback(async () => {
    setGameState('LOADING_PROBLEM');
    try {
      const subjects = getFinalSubjects();
      const problem = await generateQuizQuestion({ currentScore: score, subjects });
      setCurrentProblem(problem);
      setTimeLeft(THINKING_TIMER_SECONDS);
      setGameState('PLAYING');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'AI Error',
        description: 'Could not generate a new quiz question.',
      });
      setGameState('SUBJECT_SELECTION');
    }
  }, [score, toast, getFinalSubjects]);

  const startGame = useCallback(async () => {
    setScore(0);
    setGameState('LOADING');
    await startVideo();
    await fetchNewProblem();
  }, [startVideo, fetchNewProblem]);
  
  const handleAnswer = useCallback((answer: 'correct' | 'incorrect', submitted: number) => {
      setGameState('FEEDBACK');
      setFeedback(answer);
      setLastSubmittedAnswer(submitted);
      if (answer === 'correct') {
          setScore(s => s + 1);
      }
  }, []);

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
      // Time's up for thinking
      handleAnswer('incorrect', 0);
    } else if (gameState === 'HOLDING' && holdTime > 0) {
        timer = setTimeout(() => setHoldTime(t => t - 1), 1000);
    } else if (gameState === 'HOLDING' && holdTime === 0) {
        // Successfully held the answer
        if (potentialAnswer && currentProblem) {
            const isCorrect = (potentialAnswer - 1) === currentProblem.correctAnswerIndex;
            handleAnswer(isCorrect ? 'correct' : 'incorrect', potentialAnswer);
        }
    } else if (gameState === 'FEEDBACK') {
      timer = setTimeout(resetForNextQuestion, FEEDBACK_DURATION);
    }

    return () => clearTimeout(timer);
  }, [gameState, timeLeft, holdTime, potentialAnswer, currentProblem, handleAnswer, resetForNextQuestion]);


  useEffect(() => {
    if (gameState !== 'PLAYING' || !currentProblem) return;

    if (detectedFingers > 0 && detectedFingers <= currentProblem.options.length) {
        // Start holding
        setPotentialAnswer(detectedFingers);
        setHoldTime(ANSWER_HOLD_SECONDS);
        setGameState('HOLDING');
    }
  }, [detectedFingers, gameState, currentProblem]);

  useEffect(() => {
    if(gameState === 'HOLDING') {
      if (detectedFingers !== potentialAnswer) {
        // User changed their mind, go back to playing
        setPotentialAnswer(null);
        setGameState('PLAYING');
      }
    }
  }, [detectedFingers, potentialAnswer, gameState]);


  const handleSubjectChange = (subject: string, checked: boolean) => {
    setSelectedSubjects(prev => 
      checked ? [...prev, subject] : prev.filter(s => s !== subject)
    );
  };

  // Canvas drawing logic
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video display size
    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (landmarks.length > 0 && ['PLAYING', 'HOLDING'].includes(gameState)) {
      const primaryHand = landmarks[0];
      const wrist = primaryHand[0]; // Wrist landmark
      if (!wrist) return;

      const { x, y } = landmarkToCanvas(wrist.x, wrist.y, video);
      
      // Draw circle
      ctx.beginPath();
      ctx.arc(x, y - 40, 30, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(45, 212, 191, 0.9)'; // Primary color with opacity
      ctx.fill();

      // Draw text
      ctx.fillStyle = 'white';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(detectedFingers.toString(), x, y - 40);
    }
  }, [landmarks, detectedFingers, gameState, videoRef]);


  const renderGameState = () => {
    if (gameState === 'SUBJECT_SELECTION') {
      return (
        <div className="flex flex-col items-center justify-center text-center">
            <Card className="max-w-lg w-full p-6 rounded-2xl border-2 border-violet-400/70 bg-black/75 text-white backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-violet-500/40">
                <CardContent className="pt-6">
                    <h2 className="font-headline font-bold text-3xl mb-4">Choose Your <span className="text-violet-400">Topics</span></h2>
                    <p className="text-white/70 mb-6">
                        Select one or more subjects for your quiz. Questions will be based on your choices.
                    </p>
                    <div className="space-y-4 text-left">
                        <div className="grid grid-cols-2 gap-4">
                            {subjects.map(subject => (
                                <div key={subject.id} className="flex items-center space-x-2">
                                    <Checkbox 
                                        id={subject.id} 
                                        checked={selectedSubjects.includes(subject.label)}
                                        onCheckedChange={(checked) => handleSubjectChange(subject.label, !!checked)}
                                    />
                                    <label
                                        htmlFor={subject.id}
                                        className="text-sm font-medium leading-none text-white peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        {subject.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="other-subject">Other</Label>
                            <Input
                                id="other-subject"
                                placeholder="e.g., 'Movies', 'Sports'"
                                value={otherSubject}
                                onChange={(e) => setOtherSubject(e.target.value)}
                                className="rounded-xl border-2 border-white/40 bg-white/10 text-white placeholder:text-white/40"
                            />
                            <p className="text-xs text-white/60">Specify a custom topic.</p>
                        </div>
                    </div>
                    <Button onClick={startGame} size="lg" className="font-headline font-bold text-lg mt-8 w-full rounded-xl border-2 border-white/80 bg-violet-500 text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-violet-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]" disabled={selectedSubjects.length === 0 && !otherSubject.trim()}>Start Quiz</Button>
                </CardContent>
            </Card>
        </div>
      );
    }

    const showLoading = gameState === 'LOADING' || isHandTrackingLoading;
    const isThinking = gameState === 'PLAYING';
    const isHolding = gameState === 'HOLDING';

    return (
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="relative w-full aspect-[3/4] lg:aspect-video rounded-2xl border-2 border-violet-400/70 overflow-hidden bg-black/60 shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-violet-500/40">
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
            <Card className="w-full p-6 text-center rounded-2xl border-2 border-white/20 bg-black/60 text-white backdrop-blur">
               <div className="flex flex-col items-center justify-center min-h-[120px]">
                {gameState === 'LOADING_PROBLEM' ? (
                  <Loader className="h-12 w-12 animate-spin text-violet-400" />
                ) : (
                  <>
                    <p className="font-headline font-bold text-xl md:text-2xl tracking-wide mb-6">
                      {currentProblem?.question || 'Loading...'}
                    </p>
                    <div className="grid grid-cols-2 gap-3 w-full">
                      {currentProblem?.options.map((option, index) => (
                        <Card 
                          key={index} 
                          className={`p-3 text-sm md:text-base rounded-xl border-2 border-white/20 bg-white/5 text-white ${feedback && currentProblem.correctAnswerIndex === index ? 'border-green-400 bg-green-400/10' : ''} ${feedback === 'incorrect' && lastSubmittedAnswer === index + 1 ? 'border-red-400 bg-red-400/10' : ''}`}
                        >
                          <span className="font-headline font-bold mr-2 text-violet-300">{index + 1}.</span>{option}
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Card className="w-full p-4 rounded-2xl border-2 border-white/20 bg-black/60 text-white backdrop-blur">
              <div className="flex justify-between items-center text-lg gap-4">
                <div className="flex flex-col items-center">
                  <span className="font-headline font-bold text-violet-400 text-sm">SCORE</span>
                  <span className="font-headline font-bold text-4xl text-violet-300">{score}</span>
                </div>
                <div className="flex flex-col items-center">
                   <span className="text-white/60 text-sm flex items-center gap-1"><Hand className="h-4 w-4" /> CHOICE</span>
                   <span className="font-headline font-bold text-4xl">{potentialAnswer || detectedFingers || '?'}</span>
                </div>
                <div className="flex flex-col items-center">
                   <span className="text-white/60 text-sm flex items-center gap-1"><Timer className="h-4 w-4" /> TIME</span>
                  <span className="font-headline font-bold text-4xl w-20 text-center">{isThinking ? timeLeft : isHolding ? holdTime : '...'}</span>
                </div>
              </div>

              {isThinking && (
                 <div className="mt-2 text-center">
                   <p className="text-sm text-white/60">Choose your answer!</p>
                   <Progress value={(timeLeft / THINKING_TIMER_SECONDS) * 100} className="w-full h-2 mt-1" />
                 </div>
              )}
               {isHolding && (
                 <div className="mt-2 text-center">
                   <p className="text-sm text-white/60">Hold your choice to confirm!</p>
                   <Progress value={((ANSWER_HOLD_SECONDS - holdTime) / ANSWER_HOLD_SECONDS) * 100} className="w-1/2 mx-auto h-2 mt-1" />
                 </div>
              )}
            </Card>

            {/* Instructions */}
            <div className="mt-4 p-6 rounded-2xl border-2 border-violet-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-violet-500/40">
              <h3 className="text-xl font-headline font-bold text-violet-400 mb-3">How to Play</h3>
              <ul className="text-gray-300 space-y-2">
                <li>✋ Read the question and the 4 possible answers</li>
                <li>✌️ Hold up 1, 2, 3, or 4 fingers to select your answer</li>
                <li>⏳ Keep your hand steady to lock in your choice!</li>
                <li>🏆 Answer before the timer runs out to increase your score</li>
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
