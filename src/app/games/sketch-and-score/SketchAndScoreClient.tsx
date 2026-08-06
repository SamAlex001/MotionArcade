
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { generateShapeToDraw, evaluatePlayerDrawing } from '@/ai/flows/shape-challenge-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader, Pencil, Eraser, Sparkles, Circle, Square, Triangle, Star, Heart, ArrowRight, Home, CheckCircle2, XCircle, Hand, Eye, EyeOff } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { landmarkToCanvas } from '@/lib/video-utils';

type GameState = 'IDLE' | 'LOADING_CAMERA' | 'GET_READY' | 'COUNTDOWN' | 'DRAWING' | 'SUBMITTING' | 'FEEDBACK';
type DrawingTool = 'PENCIL' | 'ERASER';
type HandChoice = 'Left' | 'Right';

const COUNTDOWN_SECONDS = 3;
const MIN_ERASER_SIZE = 5;
const MAX_ERASER_SIZE = 50;

// A mapping of shape names to Lucide icons
const shapeIcons: Record<string, React.ReactNode> = {
  circle: <Circle className="h-24 w-24" />,
  square: <Square className="h-24 w-24" />,
  triangle: <Triangle className="h-24 w-24" />,
  star: <Star className="h-24 w-24" />,
  heart: <Heart className="h-24 w-24" />,
  arrow: <ArrowRight className="h-24 w-24" />,
  house: <Home className="h-24 w-24" />,
};


export default function SketchAndScoreClient() {
  const [drawingHand, setDrawingHand] = useState<HandChoice | null>(null);
  const { videoRef, landmarks, landmarksRef, handedness, handednessRef, startVideo, stopVideo, isLoading: isHandTrackingLoading, error: handTrackingError, detectedFingers, detectedFingersRef } = useHandTracking();
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null); // Canvas for UI overlays
  const lastPosition = useRef<{ x: number, y: number } | null>(null);
  const midPointRef = useRef<{ x: number, y: number } | null>(null);
  const tenFingersHeldRef = useRef(false);
  const lastTenFingerActionRef = useRef(0);
  const isMobile = useIsMobile();
  
  const { toast } = useToast();

  const [gameState, setGameState] = useState<GameState>('IDLE');
  const [shapeToDraw, setShapeToDraw] = useState<string | null>(null);
  const [drawnShapes, setDrawnShapes] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('PENCIL');
  const [feedback, setFeedback] = useState<{isMatch: boolean, message: string} | null>(null);
  const [eraserSize, setEraserSize] = useState(25);
  const eraserSizeRef = useRef(25);
  useEffect(() => {
    eraserSizeRef.current = eraserSize;
  }, [eraserSize]);
  const [isBlurEnabled, setIsBlurEnabled] = useState(false);

  const getDrawingContext = useCallback(() => drawingCanvasRef.current?.getContext('2d'), []);
  const getOverlayContext = useCallback(() => overlayCanvasRef.current?.getContext('2d'), []);


  useEffect(() => {
    if (handTrackingError) {
      toast({
        variant: 'destructive',
        title: 'Camera Error',
        description: handTrackingError,
      });
      setGameState('IDLE');
      stopVideo();
    }
  }, [handTrackingError, toast, stopVideo]);

  const fetchNewShape = useCallback(async () => {
    try {
      // Pass the list of already drawn shapes to the AI flow
      const { shape } = await generateShapeToDraw({ pastShapes: drawnShapes });
      setShapeToDraw(shape);
      // Add the new shape to our list of drawn shapes for the next round
      setDrawnShapes(prev => [...prev, shape]);
      setGameState('GET_READY');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'AI Error',
        description: 'Could not generate a new shape to draw.',
      });
      setGameState('IDLE');
    }
  }, [toast, drawnShapes]);
  
  const startGame = useCallback(async (hand: HandChoice) => {
    setDrawingHand(hand);
    setScore(0);
    setDrawnShapes([]); // Reset the list of drawn shapes for a new game
    setGameState('LOADING_CAMERA');
    try {
      await startVideo();
      await fetchNewShape();
    } catch (e) {
      // Errors are handled by the hook, just reset state
      setGameState('IDLE');
    }
  }, [startVideo, fetchNewShape]);

  // Countdown logic
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gameState === 'COUNTDOWN' && countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    } else if (gameState === 'COUNTDOWN' && countdown === 0) {
      setGameState('DRAWING');
    }
    return () => clearTimeout(timer);
  }, [gameState, countdown]);
  
  const clearCanvas = useCallback(() => {
    const ctx = getDrawingContext();
    if(ctx && drawingCanvasRef.current) {
        ctx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
    }
    lastPosition.current = null;
    midPointRef.current = null;
    // Deliberately do NOT reset tenFingersHeldRef here: while the user is
    // still holding 10 fingers up, resetting it would re-arm the gesture and
    // clear the canvas again on the very next frame. The gesture effect
    // resets it once the finger count drops below 10.
  }, [getDrawingContext]);

  const handleSubmit = async () => {
    if(!drawingCanvasRef.current || !shapeToDraw) return;
    setGameState('SUBMITTING');

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const sourceCanvas = drawingCanvasRef.current;
    
    if (!tempCtx) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not process drawing.",
      });
      setGameState('DRAWING');
      return;
    }

    tempCanvas.width = sourceCanvas.width;
    tempCanvas.height = sourceCanvas.height;

    // Fill with a white background to handle transparency
    tempCtx.fillStyle = '#FFFFFF';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Draw the user's drawing on top
    tempCtx.drawImage(sourceCanvas, 0, 0);

    // Get the data URI from the temporary canvas
    const drawingDataUri = tempCanvas.toDataURL('image/png');

    try {
        const result = await evaluatePlayerDrawing({ shapeToDraw: shapeToDraw, drawingDataUri });
        setFeedback({ isMatch: result.isMatch, message: result.feedback });
        if(result.isMatch) {
            setScore(s => s + 1);
        }
        setGameState('FEEDBACK');
    } catch (e) {
        toast({
            variant: 'destructive',
            title: 'AI Error',
            description: "Could not evaluate your drawing.",
        });
        setGameState('DRAWING');
    }
  };

  const handleNextQuestion = () => {
    setFeedback(null);
    clearCanvas();
    fetchNewShape();
  }
  
  const isPointing = (handLandmarks: any[]): boolean => {
      if (!handLandmarks || handLandmarks.length < 21) return false;

      // Check if index finger is extended
      const indexTip = handLandmarks[8];
      const indexPip = handLandmarks[6];

      // Check if other fingers are curled
      const middleTip = handLandmarks[12];
      const middlePip = handLandmarks[10];
      const ringTip = handLandmarks[16];
      const ringPip = handLandmarks[14];
      const pinkyTip = handLandmarks[20];
      const pinkyPip = handLandmarks[18];

      return (
        indexTip.y < indexPip.y &&
        middleTip.y > middlePip.y &&
        ringTip.y > ringPip.y &&
        pinkyTip.y > pinkyPip.y
      );
  };
  
  const isPinching = (handLandmarks: any[]): boolean => {
    if (!handLandmarks || handLandmarks.length < 21) return false;
    const thumbTip = handLandmarks[4];
    const indexTip = handLandmarks[8];
    const distance = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2) +
        Math.pow((thumbTip.z || 0) - (indexTip.z || 0), 2)
    );
    // This threshold may need adjustment
    return distance < 0.05; 
  }

  // Main gesture detection logic
  useEffect(() => {
    if (isHandTrackingLoading || !['GET_READY', 'COUNTDOWN', 'DRAWING'].includes(gameState)) {
        return;
    }

    let animationFrameId: number;

    const renderLoop = () => {
      const currentLandmarks = landmarksRef.current;
      const currentHandedness = handednessRef.current;
      const currentDetectedFingers = detectedFingersRef.current;

      if (!currentLandmarks.length) {
        animationFrameId = requestAnimationFrame(renderLoop);
        return;
      }

      const overlayCtx = getOverlayContext();
      if(overlayCtx && overlayCanvasRef.current){
        overlayCtx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
      
      // Prioritize the 10-finger clear gesture for desktop — edge-triggered so it
      // fires only once per gesture hold, not every frame while fingers are up.
      // A cooldown guards against hand-tracking jitter (10 → 9 → 10 across
      // frames) re-arming the trigger mid-hold.
      if (!isMobile && currentDetectedFingers === 10) {
          if (!tenFingersHeldRef.current) {
              tenFingersHeldRef.current = true;
              const now = performance.now();
              if (now - lastTenFingerActionRef.current > 1500) {
                lastTenFingerActionRef.current = now;
                if (gameState === 'GET_READY') {
                  setCountdown(COUNTDOWN_SECONDS);
                  setGameState('COUNTDOWN');
                } else if (gameState === 'DRAWING') {
                  clearCanvas();
                  toast({ title: "Canvas Cleared!" });
                }
              }
          }
          animationFrameId = requestAnimationFrame(renderLoop);
          return;
      }
      tenFingersHeldRef.current = false;


      let drawingHandLandmarks: any[] | null = null;
      let gestureHandLandmarks: any[] | null = null;
      
      if (drawingHand) {
        const gestureHandChoice = drawingHand === 'Left' ? 'Right' : 'Left';
        for(let i=0; i<currentHandedness.length; i++) {
          if (currentHandedness[i][0].categoryName === drawingHand) {
            drawingHandLandmarks = currentLandmarks[i];
          } else if (currentHandedness[i][0].categoryName === gestureHandChoice) {
            gestureHandLandmarks = currentLandmarks[i];
          }
        }
      }
      
      if (gameState === 'DRAWING') {
          if (drawingHandLandmarks) {
              const pointing = isPointing(drawingHandLandmarks);
              
              let currentTool: DrawingTool | null = null;
              let activeLandmark: any | null = null;
              
              // On desktop, pinching controls the eraser. On mobile, it's a button.
              const pinching = !isMobile && isPinching(drawingHandLandmarks);

              if (pinching) {
                  currentTool = 'ERASER';
                  activeLandmark = drawingHandLandmarks[8]; // Use index finger tip for erasing position
              } else if (pointing) {
                  currentTool = 'PENCIL';
                  activeLandmark = drawingHandLandmarks[8];
              }
              
              // Only update tool state if it's different and not on mobile (where it's manual)
              if (currentTool && drawingTool !== currentTool && !isMobile) {
                  setDrawingTool(currentTool);
              }

              const activeTool = isMobile ? drawingTool : currentTool;

              if (activeLandmark && activeTool) {
                  const drawingCtx = getDrawingContext();
                  const video = videoRef.current;
                  if (drawingCanvasRef.current && drawingCtx && video) {
                      const { x: mirroredX, y } = landmarkToCanvas(activeLandmark.x, activeLandmark.y, video, true);

                      // Apply smoothing (Exponential Moving Average) to reduce jitter
                      const smoothingFactor = 0.4;
                      let currentX = mirroredX;
                      let currentY = y;

                      if (lastPosition.current) {
                          currentX = lastPosition.current.x + (mirroredX - lastPosition.current.x) * smoothingFactor;
                          currentY = lastPosition.current.y + (y - lastPosition.current.y) * smoothingFactor;
                      }

                      if (activeTool === 'PENCIL') {
                          drawingCtx.globalCompositeOperation = 'source-over';
                          drawingCtx.strokeStyle = 'black';
                          drawingCtx.lineWidth = 5;
                      } else { // ERASER
                          drawingCtx.globalCompositeOperation = 'destination-out';
                          drawingCtx.lineWidth = eraserSizeRef.current;
                      }
                      
                      drawingCtx.lineCap = 'round';
                      drawingCtx.lineJoin = 'round';
                      
                      if (lastPosition.current) {
                          const midPoint = {
                              x: (lastPosition.current.x + currentX) / 2,
                              y: (lastPosition.current.y + currentY) / 2
                          };
                          drawingCtx.beginPath();
                          drawingCtx.moveTo(midPointRef.current?.x ?? lastPosition.current.x, midPointRef.current?.y ?? lastPosition.current.y);
                          drawingCtx.quadraticCurveTo(lastPosition.current.x, lastPosition.current.y, midPoint.x, midPoint.y);
                          drawingCtx.stroke();
                          midPointRef.current = midPoint;
                      } else {
                        drawingCtx.beginPath();
                        drawingCtx.arc(currentX, currentY, drawingCtx.lineWidth / 2, 0, Math.PI * 2);
                        drawingCtx.fill();
                      }
                      lastPosition.current = { x: currentX, y: currentY };
                  }
              } else {
                  lastPosition.current = null;
                  midPointRef.current = null;
              }
          } else {
            lastPosition.current = null;
            midPointRef.current = null;
          }

          // On desktop, second hand controls eraser size
          if (!isMobile && gestureHandLandmarks && drawingTool === 'ERASER') {
            const thumbTip = gestureHandLandmarks[4];
            const indexTip = gestureHandLandmarks[8];
            const distance = Math.sqrt(
              Math.pow(thumbTip.x - indexTip.x, 2) +
              Math.pow(thumbTip.y - indexTip.y, 2)
            );

            const newSize = MIN_ERASER_SIZE + (distance / 0.3) * (MAX_ERASER_SIZE - MIN_ERASER_SIZE);
            const clampedSize = Math.max(MIN_ERASER_SIZE, Math.min(MAX_ERASER_SIZE, newSize));
            eraserSizeRef.current = clampedSize;

            // Draw eraser size indicator on the overlay canvas
            if (overlayCtx && overlayCanvasRef.current) {
              const video = videoRef.current;
              if (video) {
                // Calculate midpoint between thumb and index finger
                const { x: midX, y: midY } = landmarkToCanvas(
                  (thumbTip.x + indexTip.x) / 2,
                  (thumbTip.y + indexTip.y) / 2,
                  video,
                  true
                );

              overlayCtx.save();
              overlayCtx.globalAlpha = 0.5;
              overlayCtx.fillStyle = 'white';
              overlayCtx.strokeStyle = 'black';
              overlayCtx.lineWidth = 2;

              // Draw circle indicator
              overlayCtx.beginPath();
              overlayCtx.arc(midX, midY, clampedSize / 2, 0, Math.PI * 2);
              overlayCtx.fill();
              overlayCtx.stroke();

              // Draw size text
              overlayCtx.globalAlpha = 1.0;
              overlayCtx.fillStyle = 'black';
              overlayCtx.font = 'bold 16px sans-serif';
              overlayCtx.textAlign = 'center';
              overlayCtx.textBaseline = 'middle';
              overlayCtx.fillText(Math.round(clampedSize).toString(), midX, midY);
              overlayCtx.restore();
              }
            }
          }
      } else {
          lastPosition.current = null;
          midPointRef.current = null;
      }
      
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameState, drawingTool, clearCanvas, toast, getDrawingContext, getOverlayContext, isHandTrackingLoading, drawingHand, isMobile, landmarksRef, handednessRef, detectedFingersRef]);


  // Keep canvas sizes in sync with video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvases = [drawingCanvasRef.current, overlayCanvasRef.current];

    const updateSize = () => {
        const { clientWidth, clientHeight } = video;
        if (clientWidth > 0 && clientHeight > 0) {
            canvases.forEach(canvas => {
                if (canvas && (canvas.width !== clientWidth || canvas.height !== clientHeight)) {
                    canvas.width = clientWidth;
                    canvas.height = clientHeight;
                }
            });
        }
    };
    
    if (video.readyState >= 2) { // HAVE_CURRENT_DATA
        updateSize();
    } else {
        video.addEventListener('loadeddata', updateSize, { once: true });
    }
    
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(video);

    return () => {
      if (video) {
        video.removeEventListener('loadeddata', updateSize);
      }
      resizeObserver.disconnect();
    };
  }, [videoRef, drawingCanvasRef, overlayCanvasRef, gameState]);


  const renderContent = () => {
    if (gameState === 'IDLE') {
        return (
          <div className="flex items-center justify-center h-full">
              <Card className="max-w-xl text-center p-8 rounded-2xl border-2 border-amber-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-amber-500/40 text-white">
                  <CardHeader>
                      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-400/40 bg-amber-500/15 text-amber-400">
                          <Pencil className="h-10 w-10" />
                      </div>
                      <CardTitle className="font-headline font-bold text-4xl text-white">Sketch &amp; <span className="text-amber-400">Score</span></CardTitle>
                      <CardDescription className="text-lg text-white/70 pt-2">
                        {isMobile ? "Which hand will you draw with?" : "Which hand will you use to draw?"}
                      </CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-center gap-4">
                      <Button onClick={() => startGame('Left')} size="lg" className="font-headline text-xl rounded-xl border-2 border-white/80 bg-amber-500 font-bold text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-amber-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]">Left Hand</Button>
                      <Button onClick={() => startGame('Right')} size="lg" className="font-headline text-xl rounded-xl border-2 border-white/80 bg-amber-500 font-bold text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-amber-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]">Right Hand</Button>
                  </CardContent>
              </Card>
          </div>
        );
      }
    
    return (
        <>
            <video ref={videoRef} autoPlay playsInline muted className="absolute top-0 left-0 w-full h-full object-cover scale-x-[-1]"></video>
            {isBlurEnabled && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-md pointer-events-none"></div>
            )}
            <canvas ref={drawingCanvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-80"></canvas>
            <canvas ref={overlayCanvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none"></canvas>


            {(isHandTrackingLoading || gameState === 'LOADING_CAMERA') && (
              <div className="absolute inset-0 bg-black/60 flex flex-col gap-4 items-center justify-center rounded-lg text-white z-30">
                <Loader className="h-16 w-16 animate-spin text-amber-400" />
                <p className="font-headline font-bold text-3xl">{gameState === 'LOADING_CAMERA' ? "Starting Camera..." : "Loading Hand Tracking..."}</p>
              </div>
            )}

            {shapeToDraw && !['IDLE', 'FEEDBACK', 'LOADING_CAMERA'].includes(gameState) && (
              <Card className="absolute top-4 right-4 w-48 h-48 flex flex-col items-center justify-center rounded-2xl border-2 border-amber-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-amber-500/40 z-10">
                <CardHeader className="p-2 text-center">
                  <CardTitle className="text-md font-headline font-bold text-white">Draw This:</CardTitle>
                </CardHeader>
                <CardContent className="p-2 flex-1 flex items-center justify-center text-amber-400">
                  {shapeIcons[shapeToDraw.toLowerCase()] || <Pencil className="h-24 w-24" />}
                </CardContent>
              </Card>
            )}

            {gameState === 'GET_READY' && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center rounded-lg text-white z-20 text-center p-4">
                  {isMobile ? (
                     <>
                      <h2 className="font-headline font-bold text-5xl mb-4">Get <span className="text-amber-400">Ready!</span></h2>
                      <Button onClick={() => {
                        setCountdown(COUNTDOWN_SECONDS);
                        setGameState('COUNTDOWN');
                      }} size="lg" className="rounded-xl border-2 border-white/80 bg-amber-500 font-headline font-bold text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-amber-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]">Tap to Start</Button>
                     </>
                  ): (
                    <>
                      <h2 className="font-headline font-bold text-5xl mb-4">Show <span className="text-amber-400">10 Fingers</span> to Start!</h2>
                      <Hand className="h-24 w-24 animate-pulse text-amber-400" />
                    </>
                  )}
                </div>
            )}
             {gameState === 'COUNTDOWN' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg z-20">
                    <h2 className="font-headline font-bold text-9xl text-amber-400">{countdown}</h2>
                </div>
            )}
            {gameState === 'DRAWING' && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-4 z-20">
                  <div className="flex justify-center items-center w-full">
                    <Button onClick={handleSubmit} size="lg" className="font-headline text-lg rounded-xl border-2 border-white/80 bg-amber-500 font-bold text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-amber-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]" >
                      <Sparkles className="mr-2"/> Submit Drawing
                    </Button>
                    <Button onClick={() => setIsBlurEnabled(!isBlurEnabled)} variant="outline" size="icon" className="h-12 w-12 rounded-xl border-2 border-white/40 bg-black/40 text-white backdrop-blur transition-all hover:bg-black/60 ml-4" title="Toggle Background Blur">
                        {isBlurEnabled ? <EyeOff /> : <Eye />}
                    </Button>
                    {isMobile ? (
                      <div className="flex gap-2 ml-4">
                        <Button onClick={() => setDrawingTool(t => t === 'PENCIL' ? 'ERASER' : 'PENCIL')} variant="outline" size="icon" className="h-12 w-12 rounded-xl border-2 border-white/40 bg-white/10 text-white backdrop-blur transition-all hover:bg-white/20">
                          {drawingTool === 'PENCIL' ? <Eraser/> : <Pencil/>}
                        </Button>
                         <Button onClick={clearCanvas} variant="destructive" size="icon" className="h-12 w-12 rounded-xl border-2 border-white/40 bg-red-500/80 text-white backdrop-blur transition-all hover:bg-red-600">
                          <XCircle/>
                        </Button>
                      </div>
                    ) : (
                      <Card className="py-1.5 px-4 flex items-center gap-2 rounded-full border-2 border-white/20 bg-black/60 font-headline font-bold text-white backdrop-blur ml-4">
                        <span className="text-white/60 text-sm font-bold">TOOL:</span>
                        {drawingTool === 'PENCIL' ? <Pencil className="h-6 w-6 text-amber-400"/> : <Eraser className="h-6 w-6 text-teal-300" />}
                      </Card>
                    )}
                  </div>
                </div>
            )}
             {gameState === 'SUBMITTING' && (
                <div className="absolute inset-0 bg-black/60 flex flex-col gap-4 items-center justify-center rounded-lg text-white z-30">
                    <Loader className="h-16 w-16 animate-spin text-amber-400" />
                    <p className="font-headline font-bold text-3xl">AI is judging your art...</p>
                </div>
            )}
             {gameState === 'FEEDBACK' && feedback && (
                 <div className="absolute inset-0 bg-black/70 flex flex-col gap-4 items-center justify-center rounded-lg text-white z-30 text-center p-4">
                    {feedback.isMatch ? <CheckCircle2 className="h-24 w-24 text-green-400" /> : <XCircle className="h-24 w-24 text-red-400" />}
                    <h2 className="font-headline font-bold text-4xl max-w-lg">{feedback.message}</h2>
                    <h3 className="text-2xl font-headline font-bold">Your Score: <span className="text-amber-300">{score}</span></h3>
                    <Button onClick={handleNextQuestion} size="lg" className="font-headline text-lg mt-4 rounded-xl border-2 border-white/80 bg-amber-500 font-bold text-white shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] transition-all hover:translate-y-[2px] hover:bg-amber-600 hover:shadow-[1px_1px_0_0_rgba(255,255,255,0.3)]">Next Shape</Button>
                </div>
            )}
             {isMobile && gameState === 'DRAWING' && drawingTool === 'ERASER' && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-4/5 max-w-xs z-20">
                <Alert className="rounded-2xl border-2 border-amber-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-amber-500/40 text-white">
                  <Eraser className="h-4 w-4 text-amber-400" />
                  <AlertTitle className="font-headline font-bold">Eraser Size</AlertTitle>
                  <AlertDescription>
                     <input
                        type="range"
                        min={MIN_ERASER_SIZE}
                        max={MAX_ERASER_SIZE}
                        value={eraserSize}
                        onChange={(e) => setEraserSize(Number(e.target.value))}
                        className="w-full"
                      />
                  </AlertDescription>
                </Alert>
              </div>
            )}
        </>
    );
  }


  return (
    <div className="container mx-auto px-4 py-4 lg:py-8 flex-grow flex flex-col items-center justify-start lg:justify-center">
      <div className="w-full max-w-7xl aspect-[3/4] lg:aspect-video relative rounded-2xl border-2 border-amber-400/50 shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-amber-500/30 overflow-hidden bg-black">
        {renderContent()}
      </div>

      {/* Instructions */}
      <div className="w-full max-w-7xl mt-6 p-6 rounded-2xl border-2 border-amber-400/70 bg-black/75 backdrop-blur-md shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-amber-500/40">
        <h3 className="text-xl font-headline font-bold text-amber-400 mb-3">How to Play</h3>
        <ul className="text-gray-300 space-y-2">
          <li>✋ Use your index finger to draw the shape shown on the screen</li>
          <li>✌️ Pinch your thumb and index finger together to use the eraser</li>
          <li>📏 Widen or close your other hand's thumb and index finger to change the eraser size</li>
          <li>🖐️ Show all 10 fingers to clear the canvas</li>
          <li>🤖 Submit your drawing for the AI to score it!</li>
        </ul>
      </div>
    </div>
  );
}
