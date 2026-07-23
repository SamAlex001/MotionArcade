'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { landmarkToCanvas } from '@/lib/video-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2,
  XCircle,
  Loader,
  Hand,
  Timer,
  Upload,
  FileSpreadsheet,
  Plus,
  Trash2,
  Download,
  Play,
  Sparkles,
  Trophy,
  Zap,
  BookOpen,
  ArrowLeft,
  Settings,
  FileText,
} from 'lucide-react';
import {
  QuizQuestion,
  QuizDeck,
  GameSettings,
} from '@/types/motion-quiz-studio';
import {
  parseQuizFile,
  downloadSampleTemplate,
  PRESET_DECKS,
} from '@/lib/quiz-parser';

type StudioGameState = 'DECK_SELECTION' | 'LOADING' | 'PLAYING' | 'HOLDING' | 'FEEDBACK' | 'GAME_OVER';

const LOCAL_STORAGE_KEY = 'motion_quiz_studio_custom_decks';
const FEEDBACK_DURATION_MS = 2500;

export default function MotionQuizStudioClient() {
  const {
    videoRef,
    detectedFingers,
    landmarks,
    startVideo,
    stopVideo,
    isLoading: isHandTrackingLoading,
    error: handTrackingError,
  } = useHandTracking();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // State Management
  const [gameState, setGameState] = useState<StudioGameState>('DECK_SELECTION');
  const [customDecks, setCustomDecks] = useState<QuizDeck[]>([]);
  const [activeDeck, setActiveDeck] = useState<QuizDeck | null>(null);
  const [editingDeck, setEditingDeck] = useState<QuizDeck | null>(null);

  // Game Progress State
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  // Question Timer & Hold Confirmation State
  const [timeLeft, setTimeLeft] = useState(15);
  const [holdTime, setHoldTime] = useState(3);
  const [potentialAnswer, setPotentialAnswer] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | 'timeout' | null>(null);
  const [lastScoreChange, setLastScoreChange] = useState<number>(0);

  // Settings
  const [settings, setSettings] = useState<GameSettings>({
    shuffleQuestions: false,
    shuffleOptions: false,
    holdTimeSeconds: 3,
    showExplanations: true,
  });

  // Upload state
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // In-App Question Form State
  const [deckName, setDeckName] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newOpt1, setNewOpt1] = useState('');
  const [newOpt2, setNewOpt2] = useState('');
  const [newOpt3, setNewOpt3] = useState('');
  const [newOpt4, setNewOpt4] = useState('');
  const [newCorrectOpt, setNewCorrectOpt] = useState<1 | 2 | 3 | 4>(1);
  const [newPoints, setNewPoints] = useState('10');
  const [newPenalty, setNewPenalty] = useState('0');
  const [newTimeLimit, setNewTimeLimit] = useState('15');
  const [newExplanation, setNewExplanation] = useState('');

  // Load custom decks from LocalStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        setCustomDecks(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load custom decks from localStorage', e);
    }
  }, []);

  // Save custom decks to LocalStorage
  const saveCustomDecksToStorage = (decks: QuizDeck[]) => {
    setCustomDecks(decks);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(decks));
    } catch (e) {
      console.error('Failed to save custom decks', e);
    }
  };

  // Handle hand tracking errors
  useEffect(() => {
    if (handTrackingError) {
      toast({
        variant: 'destructive',
        title: 'Camera Error',
        description: handTrackingError,
      });
      setGameState('DECK_SELECTION');
      stopVideo();
    }
  }, [handTrackingError, toast, stopVideo]);

  // Canvas drawing logic for hand tracking visualizer circle over wrist
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

    if (landmarks && landmarks.length > 0 && (gameState === 'PLAYING' || gameState === 'HOLDING')) {
      const primaryHand = landmarks[0];
      const wrist = primaryHand[0];
      if (!wrist) return;

      const { x, y } = landmarkToCanvas(wrist.x, wrist.y, video);

      // Draw hand tracking circle over wrist
      ctx.beginPath();
      ctx.arc(x, y - 35, 28, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(139, 92, 246, 0.9)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Draw detected finger count inside circle
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(detectedFingers.toString(), x, y - 35);
    }
  }, [landmarks, detectedFingers, gameState, videoRef]);

  // Handle Start Game - Exactly like QuizQuest & MathChallenge
  const handleStartGame = useCallback(
    async (deckToPlay: QuizDeck) => {
      if (!deckToPlay.questions || deckToPlay.questions.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Empty Deck',
          description: 'This quiz deck has no questions. Upload a file or add questions first.',
        });
        return;
      }

      let deckQuestions = [...deckToPlay.questions];
      if (settings.shuffleQuestions) {
        deckQuestions = deckQuestions.sort(() => Math.random() - 0.5);
      }

      if (settings.shuffleOptions) {
        deckQuestions = deckQuestions.map((q) => {
          const originalCorrectText = q.options[q.correctOption - 1];
          const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5) as [string, string, string, string];
          const newCorrectIndex = (shuffledOptions.indexOf(originalCorrectText) + 1) as 1 | 2 | 3 | 4;
          return {
            ...q,
            options: shuffledOptions,
            correctOption: newCorrectIndex,
          };
        });
      }

      setActiveDeck(deckToPlay);
      setQuestions(deckQuestions);
      setCurrentIndex(0);
      setScore(0);
      setStreak(0);
      setCorrectCount(0);
      setPotentialAnswer(null);
      setFeedback(null);
      setTimeLeft(deckQuestions[0]?.timeLimit || 15);
      setHoldTime(settings.holdTimeSeconds);

      // Transition to LOADING state first so the <video ref={videoRef}> element is mounted into the DOM!
      setGameState('LOADING');

      // Small tick delay ensuring React mounts videoRef into DOM before startVideo is invoked
      setTimeout(async () => {
        try {
          await startVideo();
          setGameState('PLAYING');
        } catch (err) {
          console.error('Failed to start webcam:', err);
          toast({
            variant: 'destructive',
            title: 'Camera Error',
            description: 'Could not access webcam. Please ensure camera permissions are allowed.',
          });
          setGameState('DECK_SELECTION');
        }
      }, 100);
    },
    [settings.shuffleQuestions, settings.shuffleOptions, settings.holdTimeSeconds, startVideo, toast]
  );

  const handleQuitGame = () => {
    stopVideo();
    setGameState('DECK_SELECTION');
    setActiveDeck(null);
  };

  const currentQuestion = questions[currentIndex];

  // Submit Answer Logic
  const handleAnswerSubmit = useCallback(
    (selectedOpt: number | null) => {
      if (!currentQuestion || (gameState !== 'PLAYING' && gameState !== 'HOLDING')) return;

      const isCorrect = selectedOpt === currentQuestion.correctOption;
      let pointsEarned = 0;

      if (isCorrect) {
        const streakMultiplier = streak >= 2 ? 1.5 : 1;
        pointsEarned = Math.round(currentQuestion.points * streakMultiplier);
        setScore((prev) => prev + pointsEarned);
        setStreak((prev) => prev + 1);
        setCorrectCount((prev) => prev + 1);
        setFeedback('correct');
        setLastScoreChange(pointsEarned);
      } else {
        const penaltyDeducted = currentQuestion.penalty;
        pointsEarned = -penaltyDeducted;
        setScore((prev) => Math.max(0, prev - penaltyDeducted));
        setStreak(0);
        setFeedback(selectedOpt === null ? 'timeout' : 'incorrect');
        setLastScoreChange(-penaltyDeducted);
      }

      setGameState('FEEDBACK');
    },
    [currentQuestion, gameState, streak]
  );

  // Question Timer Countdown
  useEffect(() => {
    if (gameState !== 'PLAYING' && gameState !== 'HOLDING') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAnswerSubmit(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, handleAnswerSubmit]);

  // Finger Detection & Answer Hold Progress
  useEffect(() => {
    if (gameState !== 'PLAYING' && gameState !== 'HOLDING') return;

    const num = detectedFingers;
    if (num >= 1 && num <= 4) {
      if (potentialAnswer !== num) {
        setPotentialAnswer(num);
        setHoldTime(settings.holdTimeSeconds);
        setGameState('HOLDING');
      } else {
        const holdInterval = setInterval(() => {
          setHoldTime((prev) => {
            if (prev <= 0.1) {
              clearInterval(holdInterval);
              handleAnswerSubmit(num);
              return 0;
            }
            return prev - 0.1;
          });
        }, 100);

        return () => clearInterval(holdInterval);
      }
    } else {
      setPotentialAnswer(null);
      setHoldTime(settings.holdTimeSeconds);
      if (gameState === 'HOLDING') {
        setGameState('PLAYING');
      }
    }
  }, [detectedFingers, potentialAnswer, gameState, settings.holdTimeSeconds, handleAnswerSubmit]);

  // Transition after FEEDBACK screen
  useEffect(() => {
    if (gameState !== 'FEEDBACK') return;

    const timeout = setTimeout(() => {
      if (currentIndex + 1 < questions.length) {
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        setPotentialAnswer(null);
        setFeedback(null);
        setTimeLeft(questions[nextIndex].timeLimit || 15);
        setHoldTime(settings.holdTimeSeconds);
        setGameState('PLAYING');
      } else {
        stopVideo();
        setGameState('GAME_OVER');
      }
    }, FEEDBACK_DURATION_MS);

    return () => clearTimeout(timeout);
  }, [gameState, currentIndex, questions, settings.holdTimeSeconds, stopVideo]);

  // File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    const result = await parseQuizFile(file);
    setIsParsing(false);

    if (result.errors.length > 0 && result.questions.length === 0) {
      toast({
        variant: 'destructive',
        title: 'File Upload Failed',
        description: result.errors.join(' | '),
      });
      return;
    }

    const newDeck: QuizDeck = {
      id: `deck_${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      description: `Uploaded from ${file.name} (${result.questions.length} questions)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      questions: result.questions,
    };

    saveCustomDecksToStorage([newDeck, ...customDecks]);

    toast({
      title: 'Quiz Uploaded! 🎉',
      description: `Loaded ${result.questions.length} questions from ${file.name}.`,
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Add Question In-App Form
  const handleAddQuestionToEditDeck = () => {
    if (!newQuestionText.trim() || !newOpt1.trim() || !newOpt2.trim() || !newOpt3.trim() || !newOpt4.trim()) {
      toast({
        variant: 'destructive',
        title: 'Incomplete Fields',
        description: 'Please enter a question and all 4 options.',
      });
      return;
    }

    const q: QuizQuestion = {
      id: `q_${Date.now()}`,
      question: newQuestionText.trim(),
      options: [newOpt1.trim(), newOpt2.trim(), newOpt3.trim(), newOpt4.trim()],
      correctOption: newCorrectOpt,
      points: parseInt(newPoints, 10) || 10,
      penalty: parseInt(newPenalty, 10) || 0,
      timeLimit: parseInt(newTimeLimit, 10) || 15,
      explanation: newExplanation.trim() || undefined,
    };

    const finalDeckName = deckName.trim() || 'My Custom Quiz Deck';

    const targetDeck = editingDeck || {
      id: `deck_${Date.now()}`,
      name: finalDeckName,
      description: 'Created using Motion Quiz Studio in-app editor',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      questions: [],
    };

    const updatedDeck: QuizDeck = {
      ...targetDeck,
      name: finalDeckName,
      updatedAt: Date.now(),
      questions: [...targetDeck.questions, q],
    };

    setEditingDeck(updatedDeck);

    // Reset Question Form
    setNewQuestionText('');
    setNewOpt1('');
    setNewOpt2('');
    setNewOpt3('');
    setNewOpt4('');
    setNewCorrectOpt(1);
    setNewExplanation('');

    toast({
      title: 'Question Added! ✍️',
      description: `Deck "${finalDeckName}" now has ${updatedDeck.questions.length} questions.`,
    });
  };

  const handleSaveEditingDeck = () => {
    if (!editingDeck || editingDeck.questions.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Empty Deck',
        description: 'Please add at least one question before saving.',
      });
      return;
    }

    const finalDeckName = deckName.trim() || editingDeck.name || 'My Custom Quiz Deck';
    const finalDeck: QuizDeck = {
      ...editingDeck,
      name: finalDeckName,
      updatedAt: Date.now(),
    };

    const existingIndex = customDecks.findIndex((d) => d.id === finalDeck.id);
    let updatedDecks: QuizDeck[];

    if (existingIndex >= 0) {
      updatedDecks = [...customDecks];
      updatedDecks[existingIndex] = finalDeck;
    } else {
      updatedDecks = [finalDeck, ...customDecks];
    }

    saveCustomDecksToStorage(updatedDecks);
    setEditingDeck(null);
    setDeckName('');

    toast({
      title: 'Deck Saved! 💾',
      description: `Saved "${finalDeckName}" to your library.`,
    });
  };

  const handleDeleteDeck = (id: string) => {
    const filtered = customDecks.filter((d) => d.id !== id);
    saveCustomDecksToStorage(filtered);
    toast({
      title: 'Deck Deleted',
      description: 'The deck has been removed.',
    });
  };

  // Option style definitions with high-contrast text visibility
  const optionColors = [
    { bg: 'bg-teal-100/90 border-2 border-teal-500 text-slate-900', highlight: 'bg-teal-600 border-2 border-white text-white shadow-xl scale-[1.03]' },
    { bg: 'bg-violet-100/90 border-2 border-violet-500 text-slate-900', highlight: 'bg-violet-600 border-2 border-white text-white shadow-xl scale-[1.03]' },
    { bg: 'bg-amber-100/90 border-2 border-amber-500 text-slate-900', highlight: 'bg-amber-600 border-2 border-white text-white shadow-xl scale-[1.03]' },
    { bg: 'bg-rose-100/90 border-2 border-rose-500 text-slate-900', highlight: 'bg-rose-600 border-2 border-white text-white shadow-xl scale-[1.03]' },
  ];

  // RENDER 1: DECK SELECTION (SETUP STUDIO HUB)
  if (gameState === 'DECK_SELECTION') {
    return (
      <div className="w-full max-w-6xl mx-auto space-y-8 px-4 py-6">
        {/* Header Banner */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border-2 border-foreground/85 bg-violet-300 text-foreground text-sm font-bold shadow-[3px_3px_0_0_rgba(20,35,40,0.85)]">
            <FileSpreadsheet className="w-4 h-4" />
            Upload CSV/Excel or Create In-App
          </div>
          <h1 className="font-headline text-4xl md:text-5xl font-bold tracking-tight text-foreground drop-shadow-sm">
            Motion Quiz Studio
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
            Play touchless trivia with your own questions! Show 1 to 4 fingers to select answers.
          </p>
        </div>

        {/* Settings Drawer Card */}
        <Card className="rounded-2xl border-2 border-foreground/85 bg-card shadow-[6px_6px_0_0_rgba(20,35,40,0.85)]">
          <CardHeader className="pb-3">
            <CardTitle className="font-headline text-xl font-bold text-foreground flex items-center gap-2">
              <Settings className="w-5 h-5 text-violet-500" />
              Game Settings & Gesture Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center space-x-2 bg-muted/40 p-3 rounded-xl border border-border">
              <Checkbox
                id="shuffleQ"
                checked={settings.shuffleQuestions}
                onCheckedChange={(c) => setSettings({ ...settings, shuffleQuestions: !!c })}
              />
              <Label htmlFor="shuffleQ" className="text-sm font-semibold text-foreground cursor-pointer">
                Shuffle Questions
              </Label>
            </div>
            <div className="flex items-center space-x-2 bg-muted/40 p-3 rounded-xl border border-border">
              <Checkbox
                id="showExplain"
                checked={settings.showExplanations}
                onCheckedChange={(c) => setSettings({ ...settings, showExplanations: !!c })}
              />
              <Label htmlFor="showExplain" className="text-sm font-semibold text-foreground cursor-pointer">
                Show Explanations
              </Label>
            </div>
            <div className="flex flex-col space-y-1 bg-muted/40 p-3 rounded-xl border border-border">
              <Label className="text-xs font-bold text-muted-foreground">Finger Hold Confirm Time</Label>
              <select
                className="bg-background text-foreground text-sm font-bold border rounded-lg px-2 py-1"
                value={settings.holdTimeSeconds}
                onChange={(e) => setSettings({ ...settings, holdTimeSeconds: parseInt(e.target.value, 10) })}
              >
                <option value={2}>2 Seconds (Fast)</option>
                <option value={3}>3 Seconds (Standard)</option>
                <option value={4}>4 Seconds (Deliberate)</option>
              </select>
            </div>
            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                onClick={() => downloadSampleTemplate('csv')}
                className="w-full font-bold rounded-xl border-2 border-foreground/85 shadow-[3px_3px_0_0_rgba(20,35,40,0.85)] hover:translate-y-[2px]"
              >
                <Download className="w-4 h-4 mr-2 text-emerald-600" />
                Sample Template
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Workspace Tabs */}
        <Tabs defaultValue="select" className="w-full space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-14 rounded-2xl border-2 border-foreground/85 bg-muted p-1 shadow-[4px_4px_0_0_rgba(20,35,40,0.85)]">
            <TabsTrigger value="select" className="font-headline font-bold text-base rounded-xl">
              <BookOpen className="w-4 h-4 mr-2 hidden sm:inline" />
              Quiz Decks
            </TabsTrigger>
            <TabsTrigger value="upload" className="font-headline font-bold text-base rounded-xl">
              <Upload className="w-4 h-4 mr-2 hidden sm:inline" />
              Upload CSV/Excel
            </TabsTrigger>
            <TabsTrigger value="build" className="font-headline font-bold text-base rounded-xl">
              <Plus className="w-4 h-4 mr-2 hidden sm:inline" />
              In-App Builder
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: SELECT DECK */}
          <TabsContent value="select" className="space-y-6">
            {/* Custom User Decks */}
            {customDecks.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-headline text-lg font-bold text-foreground flex items-center gap-2">
                  <FileText className="w-5 h-5 text-violet-600" />
                  Your Custom Uploaded Decks ({customDecks.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customDecks.map((deck) => (
                    <Card
                      key={deck.id}
                      className="rounded-2xl border-2 border-foreground/85 bg-card shadow-[5px_5px_0_0_rgba(139,92,246,0.3)] hover:-translate-y-1 transition-all"
                    >
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <CardTitle className="font-headline text-2xl font-bold text-foreground">
                            {deck.name}
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDeck(deck.id)}
                            className="text-rose-500 hover:text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <CardDescription className="text-sm font-medium text-muted-foreground">
                          {deck.description || `${deck.questions.length} Questions`}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-2 flex justify-between items-center">
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-violet-100 text-violet-900 border border-violet-300">
                          {deck.questions.length} Questions
                        </span>
                        <Button
                          onClick={() => handleStartGame(deck)}
                          size="lg"
                          className="font-headline font-bold rounded-xl border-2 border-foreground/85 bg-violet-500 hover:bg-violet-600 text-white shadow-[3px_3px_0_0_rgba(20,35,40,0.85)]"
                        >
                          <Play className="w-4 h-4 mr-2 fill-white" />
                          Play Quiz
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Built-in Preset Decks */}
            <div className="space-y-3">
              <h3 className="font-headline text-lg font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Featured Starter Decks
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PRESET_DECKS.map((deck) => (
                  <Card
                    key={deck.id}
                    className="rounded-2xl border-2 border-foreground/85 bg-card shadow-[5px_5px_0_0_rgba(45,212,191,0.3)] hover:-translate-y-1 transition-all"
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="font-headline text-2xl font-bold text-foreground">
                        {deck.name}
                      </CardTitle>
                      <CardDescription className="text-sm font-medium text-muted-foreground">
                        {deck.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2 flex justify-between items-center">
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-100 text-teal-900 border border-teal-300">
                        {deck.questions.length} Questions
                      </span>
                      <Button
                        onClick={() => handleStartGame(deck)}
                        size="lg"
                        className="font-headline font-bold rounded-xl border-2 border-foreground/85 bg-teal-500 hover:bg-teal-600 text-white shadow-[3px_3px_0_0_rgba(20,35,40,0.85)]"
                      >
                        <Play className="w-4 h-4 mr-2 fill-white" />
                        Start Playing
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: UPLOAD CSV/EXCEL */}
          <TabsContent value="upload">
            <Card className="rounded-2xl border-2 border-foreground/85 bg-card shadow-[6px_6px_0_0_rgba(20,35,40,0.85)] p-6 text-center space-y-6">
              <div className="border-3 border-dashed border-violet-400/60 rounded-2xl p-8 bg-violet-50/50 flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center border-2 border-violet-400 shadow-md">
                  <FileSpreadsheet className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-headline text-2xl font-bold text-foreground">
                    Upload your Spreadsheet (.csv or .xlsx)
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-md mx-auto mt-1">
                    Drag and drop your quiz spreadsheet file or click below to browse.
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="fileUploadInput"
                />

                <Button
                  onClick={() => fileInputRef.current?.click()}
                  size="lg"
                  disabled={isParsing}
                  className="font-headline font-bold text-lg rounded-xl border-2 border-foreground/85 bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-[4px_4px_0_0_rgba(20,35,40,0.85)]"
                >
                  {isParsing ? <Loader className="w-5 h-5 animate-spin mr-2" /> : <Upload className="w-5 h-5 mr-2" />}
                  Choose Quiz File
                </Button>
              </div>

              {/* Template Downloads */}
              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <span className="text-sm font-semibold text-muted-foreground">Download Template:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadSampleTemplate('csv')}
                  className="rounded-lg border font-bold"
                >
                  <Download className="w-4 h-4 mr-1 text-teal-400" />
                  CSV Template
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadSampleTemplate('xlsx')}
                  className="rounded-lg border font-bold"
                >
                  <Download className="w-4 h-4 mr-1 text-emerald-400" />
                  Excel (.xlsx) Template
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* TAB 3: IN-APP BUILDER */}
          <TabsContent value="build">
            <Card className="rounded-2xl border-2 border-foreground/85 bg-card shadow-[6px_6px_0_0_rgba(20,35,40,0.85)] p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-border pb-4">
                <div>
                  <h3 className="font-headline text-2xl font-bold text-white">
                    {editingDeck ? editingDeck.name : 'Create Custom Quiz Deck'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Add questions manually with custom points, time limits, and explanations.
                  </p>
                </div>

                {editingDeck && (
                  <Button
                    onClick={handleSaveEditingDeck}
                    className="font-headline font-bold rounded-xl border-2 border-foreground/85 bg-emerald-500 hover:bg-emerald-600 text-white shadow-[3px_3px_0_0_rgba(20,35,40,0.85)]"
                  >
                    Save Deck to Library ({editingDeck.questions.length} Qs)
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-bold text-sm text-white">Quiz Deck Name</Label>
                <Input
                  placeholder="e.g. My Custom Trivia Deck"
                  value={deckName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDeckName(val);
                    if (editingDeck) {
                      setEditingDeck({ ...editingDeck, name: val });
                    }
                  }}
                  className="rounded-xl font-semibold border-2"
                />
              </div>

              {/* Add Question Form */}
              <div className="space-y-4 bg-muted/30 p-5 rounded-2xl border-2 border-border">
                <h4 className="font-headline font-bold text-lg text-amber-300">Add New Question</h4>

                <div className="space-y-2">
                  <Label className="font-bold text-sm">Question Text</Label>
                  <Input
                    placeholder="Enter your question prompt..."
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    className="rounded-xl font-semibold"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-teal-300">Option 1 (1 Finger)</Label>
                    <Input
                      placeholder="Option 1"
                      value={newOpt1}
                      onChange={(e) => setNewOpt1(e.target.value)}
                      className="rounded-xl border-teal-500/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-violet-300">Option 2 (2 Fingers)</Label>
                    <Input
                      placeholder="Option 2"
                      value={newOpt2}
                      onChange={(e) => setNewOpt2(e.target.value)}
                      className="rounded-xl border-violet-500/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-amber-300">Option 3 (3 Fingers)</Label>
                    <Input
                      placeholder="Option 3"
                      value={newOpt3}
                      onChange={(e) => setNewOpt3(e.target.value)}
                      className="rounded-xl border-amber-500/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-rose-300">Option 4 (4 Fingers)</Label>
                    <Input
                      placeholder="Option 4"
                      value={newOpt4}
                      onChange={(e) => setNewOpt4(e.target.value)}
                      className="rounded-xl border-rose-500/40"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Correct Option</Label>
                    <select
                      className="w-full bg-background text-foreground text-sm font-bold border rounded-xl p-2"
                      value={newCorrectOpt}
                      onChange={(e) => setNewCorrectOpt(parseInt(e.target.value, 10) as 1 | 2 | 3 | 4)}
                    >
                      <option value={1}>1 Finger (Option 1)</option>
                      <option value={2}>2 Fingers (Option 2)</option>
                      <option value={3}>3 Fingers (Option 3)</option>
                      <option value={4}>4 Fingers (Option 4)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Points (+ve)</Label>
                    <Input
                      type="number"
                      value={newPoints}
                      onChange={(e) => setNewPoints(e.target.value)}
                      className="rounded-xl font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Penalty (-ve)</Label>
                    <Input
                      type="number"
                      value={newPenalty}
                      onChange={(e) => setNewPenalty(e.target.value)}
                      className="rounded-xl font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Time Limit (Sec)</Label>
                    <Input
                      type="number"
                      value={newTimeLimit}
                      onChange={(e) => setNewTimeLimit(e.target.value)}
                      className="rounded-xl font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground">Explanation (Optional)</Label>
                  <Input
                    placeholder="Shown during feedback to explain why the answer is correct..."
                    value={newExplanation}
                    onChange={(e) => setNewExplanation(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                <Button
                  onClick={handleAddQuestionToEditDeck}
                  className="w-full font-headline font-bold text-base rounded-xl border-2 border-foreground/85 bg-amber-500 hover:bg-amber-600 text-white shadow-[3px_3px_0_0_rgba(20,35,40,0.85)]"
                >
                  <Plus className="w-5 h-5 mr-1" />
                  Add Question to Deck
                </Button>
              </div>

              {editingDeck && editingDeck.questions.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="font-headline font-bold text-base text-foreground">
                    Questions in this deck ({editingDeck.questions.length}):
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {editingDeck.questions.map((q, idx) => (
                      <div
                        key={q.id}
                        className="flex justify-between items-center p-3.5 rounded-xl bg-card border-2 border-foreground/85 shadow-[3px_3px_0_0_rgba(20,35,40,0.85)]"
                      >
                        <div className="space-y-0.5">
                          <p className="font-headline font-bold text-base text-foreground">
                            {idx + 1}. {q.question}
                          </p>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Correct: Option {q.correctOption} | Points: +{q.points} | Penalty: -{q.penalty}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const updatedQs = editingDeck.questions.filter((_, i) => i !== idx);
                            setEditingDeck({ ...editingDeck, questions: updatedQs });
                          }}
                          className="text-rose-500 hover:text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={handleSaveEditingDeck}
                    size="lg"
                    className="w-full font-headline font-bold text-lg rounded-xl border-2 border-foreground/85 bg-emerald-500 hover:bg-emerald-600 text-white shadow-[4px_4px_0_0_rgba(20,35,40,0.85)]"
                  >
                    Save & Finish Deck ({editingDeck.questions.length} Questions)
                  </Button>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // RENDER 2: GAME OVER SCREEN
  if (gameState === 'GAME_OVER') {
    const accuracy = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

    return (
      <div className="w-full max-w-2xl mx-auto p-4 space-y-6">
        <Card className="rounded-2xl border-2 border-foreground/85 bg-card shadow-[8px_8px_0_0_rgba(20,35,40,0.85)] text-center p-8 space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 text-foreground flex items-center justify-center border-2 border-foreground/85 shadow-lg animate-bounce">
            <Trophy className="w-10 h-10" />
          </div>

          <div>
            <h1 className="font-headline text-4xl font-bold text-white">Quiz Completed!</h1>
            <p className="text-muted-foreground text-base mt-1">{activeDeck?.name}</p>
          </div>

          <div className="grid grid-cols-3 gap-4 py-4 border-y border-border">
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase">Final Score</p>
              <p className="font-headline text-3xl font-bold text-amber-300">{score}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase">Accuracy</p>
              <p className="font-headline text-3xl font-bold text-emerald-400">{accuracy}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase">Correct</p>
              <p className="font-headline text-3xl font-bold text-teal-300">
                {correctCount} / {questions.length}
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              onClick={handleQuitGame}
              variant="outline"
              size="lg"
              className="flex-1 font-headline font-bold rounded-xl border-2 border-foreground/85 shadow-[3px_3px_0_0_rgba(20,35,40,0.85)]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Studio Hub
            </Button>
            {activeDeck && (
              <Button
                onClick={() => handleStartGame(activeDeck)}
                size="lg"
                className="flex-1 font-headline font-bold rounded-xl border-2 border-foreground/85 bg-violet-500 hover:bg-violet-600 text-white shadow-[3px_3px_0_0_rgba(20,35,40,0.85)]"
              >
                <Play className="w-4 h-4 mr-2 fill-white" />
                Replay Quiz
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // RENDER 3: ACTIVE GAMEPLAY LAYOUT (Matching QuizQuest & MathChallenge 100%)
  const showLoading = gameState === 'LOADING' || isHandTrackingLoading;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 px-4 py-4">
      {/* TOP HUD BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-card/90 border-2 border-foreground/85 p-4 rounded-2xl shadow-[4px_4px_0_0_rgba(20,35,40,0.85)]">
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleQuitGame}
            className="font-bold text-muted-foreground hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Quit
          </Button>
          <span className="font-headline font-bold text-lg text-white">
            Q {currentIndex + 1} / {questions.length}
          </span>
        </div>

        {/* Timer Bar */}
        <div className="flex-1 max-w-xs space-y-1">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-muted-foreground flex items-center">
              <Timer className="w-3.5 h-3.5 mr-1" /> Time Left
            </span>
            <span className={timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-amber-300'}>
              {timeLeft}s
            </span>
          </div>
          <Progress
            value={(timeLeft / (currentQuestion?.timeLimit || 15)) * 100}
            className="h-2 rounded-full bg-muted"
          />
        </div>

        {/* Score & Streak */}
        <div className="flex items-center space-x-4 font-headline">
          {streak >= 2 && (
            <div className="flex items-center text-amber-400 font-bold animate-bounce text-sm">
              <Zap className="w-4 h-4 fill-amber-400 mr-1" /> {streak}x Combo!
            </div>
          )}
          <div className="bg-amber-400/20 border border-amber-400/50 px-4 py-1.5 rounded-xl font-bold text-amber-300">
            Score: {score}
          </div>
        </div>
      </div>

      {/* QUESTION BANNER */}
      <Card className="rounded-2xl border-2 border-violet-400/80 bg-gradient-to-r from-violet-950/80 to-indigo-950/80 shadow-[6px_6px_0_0_rgba(139,92,246,0.3)] text-center p-6">
        <h2 className="font-headline text-2xl md:text-3xl font-bold text-white leading-relaxed">
          {currentQuestion?.question}
        </h2>
      </Card>

      {/* MAIN GAME GRID: WEBCAM + OPTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* WEBCAM FEED CONTAINER (Video is ALWAYS in DOM when playing!) */}
        <div className="relative aspect-video rounded-2xl border-2 border-violet-400/80 overflow-hidden bg-black/80 shadow-[6px_6px_0_0_rgba(139,92,246,0.4)] flex flex-col justify-end">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none z-10" />

          {/* Loader Overlay when initializing camera - Exactly like QuizQuest */}
          {showLoading && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white space-y-3 z-30">
              <Loader className="w-12 h-12 text-violet-400 animate-spin" />
              <p className="font-headline font-bold text-base">Starting Camera Engine...</p>
            </div>
          )}

          {/* Finger Detector Badge */}
          <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md border border-white/30 text-white px-4 py-2 rounded-full font-headline font-bold flex items-center space-x-2 shadow-lg z-10">
            <Hand className="w-5 h-5 text-violet-400" />
            <span>
              {detectedFingers > 0
                ? `${detectedFingers} Finger${detectedFingers > 1 ? 's' : ''} Detected`
                : 'Show 1 to 4 Fingers'}
            </span>
          </div>

          {/* FEEDBACK OVERLAY */}
          {feedback && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center text-white space-y-4 p-6 animate-in fade-in zoom-in z-20">
              {feedback === 'correct' ? (
                <>
                  <CheckCircle2 className="w-24 h-24 text-emerald-400 animate-bounce" />
                  <h3 className="font-headline text-3xl font-bold text-emerald-400">
                    Correct! +{lastScoreChange} Pts
                  </h3>
                </>
              ) : (
                <>
                  <XCircle className="w-24 h-24 text-rose-500 animate-pulse" />
                  <h3 className="font-headline text-3xl font-bold text-rose-400">
                    {feedback === 'timeout' ? 'Time Out!' : 'Incorrect!'}
                    {lastScoreChange < 0 && ` (${lastScoreChange} Pts)`}
                  </h3>
                </>
              )}

              {/* Explanation Text */}
              {settings.showExplanations && currentQuestion?.explanation && (
                <div className="max-w-md bg-muted/40 border border-white/20 p-4 rounded-xl text-center text-sm text-slate-200">
                  <span className="font-bold text-amber-300 block mb-1">💡 Explanation:</span>
                  {currentQuestion.explanation}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4 OPTION CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentQuestion?.options.map((optionText, idx) => {
            const optNumber = (idx + 1) as 1 | 2 | 3 | 4;
            const isSelected = potentialAnswer === optNumber;
            const colorScheme = optionColors[idx];

            return (
              <div
                key={idx}
                className={`relative overflow-hidden rounded-2xl border-2 transition-all p-5 flex flex-col justify-between cursor-default ${
                  isSelected
                    ? `${colorScheme.highlight} border-white shadow-xl scale-[1.03]`
                    : `${colorScheme.bg} shadow-[4px_4px_0_0_rgba(20,35,40,0.85)]`
                }`}
              >
                {/* Hold Progress Bar Overlay */}
                {isSelected && (gameState === 'HOLDING' || gameState === 'PLAYING') && (
                  <div
                    className="absolute inset-0 bg-white/20 transition-all duration-100 origin-left"
                    style={{
                      width: `${((settings.holdTimeSeconds - holdTime) / settings.holdTimeSeconds) * 100}%`,
                    }}
                  />
                )}

                <div className="relative z-10 flex items-start justify-between">
                  <span className={`w-10 h-10 rounded-xl font-headline text-xl font-bold flex items-center justify-center border-2 shadow-sm ${isSelected ? 'bg-white text-slate-900 border-white' : 'bg-slate-900 text-white border-slate-900'}`}>
                    {optNumber}
                  </span>
                  {isSelected && (
                    <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-black text-white shadow animate-pulse">
                      Hold {Math.ceil(holdTime)}s
                    </span>
                  )}
                </div>

                <p className={`relative z-10 font-headline font-bold text-xl md:text-2xl mt-4 leading-snug ${isSelected ? 'text-white' : 'text-slate-950'}`}>
                  {optionText}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
