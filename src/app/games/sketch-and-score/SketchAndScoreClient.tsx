
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHandTracking } from '@/hooks/use-hand-tracking';
import { generateShapeToDraw, evaluatePlayerDrawing } from '@/ai/flows/shape-challenge-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader, Pencil, Eraser, Sparkles, Circle, Square, Triangle, Star, Heart, ArrowRight, Home, CheckCircle2, XCircle, Hand } from 'lucide-react';
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
  const { videoRef, landmarks, handedness, startVideo, stopVideo, isLoading: isHandTrackingLoading, error: handTrackingError, detectedFingers } = useHandTracking();
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null); // Canvas for UI overlays
  const lastPosition = useRef<{ x: number, y: number } | null>(null);
  const midPointRef = useRef<{ x: number, y: number } | null>(null);
  const tenFingersHeldRef = useRef(false);
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
    tenFingersHeldRef.current = false;
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
    if (!landmarks.length || isHandTrackingLoading || !['GET_READY', 'COUNTDOWN', 'DRAWING'].includes(gameState)) {
        return;
    }

    const overlayCtx = getOverlayContext();
    if(overlayCtx && overlayCanvasRef.current){
      overlayCtx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
    
    // Prioritize the 10-finger clear gesture for desktop — edge-triggered so it
    // fires only once per gesture hold, not every frame while fingers are up.
    if (!isMobile && detectedFingers === 10) {
        if (!tenFingersHeldRef.current) {
            tenFingersHeldRef.current = true;
            if (gameState === 'GET_READY') {
              setCountdown(COUNTDOWN_SECONDS);
              setGameState('COUNTDOWN');
            } else if (gameState === 'DRAWING') {
              clearCanvas();
              toast({ title: "Canvas Cleared!" });
            }
        }
        return;
    }
    tenFingersHeldRef.current = false;


    let drawingHandLandmarks: any[] | null = null;
    let gestureHandLandmarks: any[] | null = null;
    
    if (drawingHand) {
      const gestureHandChoice = drawingHand === 'Left' ? 'Right' : 'Left';
      for(let i=0; i<handedness.length; i++) {
        if (handedness[i][0].categoryName === drawingHand) {
          drawingHandLandmarks = landmarks[i];
        } else if (handedness[i][0].categoryName === gestureHandChoice) {
          gestureHandLandmarks = landmarks[i];
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

                    if (activeTool === 'PENCIL') {
                        drawingCtx.globalCompositeOperation = 'source-over';
                        drawingCtx.strokeStyle = 'black';
                        drawingCtx.lineWidth = 5;
                    } else { // ERASER
                        drawingCtx.globalCompositeOperation = 'destination-out';
                        drawingCtx.lineWidth = eraserSize;
                    }
                    
                    drawingCtx.lineCap = 'round';
                    drawingCtx.lineJoin = 'round';
                    
                    if (lastPosition.current) {
                        const midPoint = {
                            x: (lastPosition.current.x + mirroredX) / 2,
                            y: (lastPosition.current.y + y) / 2
                        };
                        drawingCtx.beginPath();
                        drawingCtx.moveTo(midPointRef.current?.x ?? lastPosition.current.x, midPointRef.current?.y ?? lastPosition.current.y);
                        drawingCtx.quadraticCurveTo(lastPosition.current.x, lastPosition.current.y, midPoint.x, midPoint.y);
                        drawingCtx.stroke();
                        midPointRef.current = midPoint;
                    } else {
                      drawingCtx.beginPath();
                      drawingCtx.arc(mirroredX, y, drawingCtx.lineWidth / 2, 0, Math.PI * 2);
                      drawingCtx.fill();
                    }
                    lastPosition.current = { x: mirroredX, y };
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
          setEraserSize(Math.max(MIN_ERASER_SIZE, Math.min(MAX_ERASER_SIZE, newSize)));

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
            overlayCtx.arc(midX, midY, eraserSize / 2, 0, Math.PI * 2);
            overlayCtx.fill();
            overlayCtx.stroke();

            // Draw size text
            overlayCtx.globalAlpha = 1.0;
            overlayCtx.fillStyle = 'black';
            overlayCtx.font = 'bold 16px sans-serif';
            overlayCtx.textAlign = 'center';
            overlayCtx.textBaseline = 'middle';
            overlayCtx.fillText(Math.round(eraserSize).toString(), midX, midY);
            overlayCtx.restore();
            }
          }
        }
    } else {
        lastPosition.current = null;
        midPointRef.current = null;
    }
  }, [landmarks, handedness, gameState, drawingTool, eraserSize, clearCanvas, toast, getDrawingContext, getOverlayContext, isHandTrackingLoading, drawingHand, detectedFingers, isMobile]);


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
              <Card className="max-w-xl text-center p-8">
                  <CardHeader>
                      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Pencil className="h-10 w-10" />
                      </div>
                      <CardTitle className="font-headline text-4xl">Sketch &amp; Score</CardTitle>
                      <CardDescription className="text-lg text-muted-foreground pt-2">
                        {isMobile ? "Which hand will you draw with?" : "Which hand will you use to draw?"}
                      </CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-center gap-4">
                      <Button onClick={() => startGame('Left')} size="lg" className="font-headline text-xl">Left Hand</Button>
                      <Button onClick={() => startGame('Right')} size="lg" className="font-headline text-xl">Right Hand</Button>
                  </CardContent>
              </Card>
          </div>
        );
      }
    
    return (
        <>
            <video ref={videoRef} autoPlay playsInline muted className="absolute top-0 left-0 w-full h-full object-cover scale-x-[-1]"></video>
            <canvas ref={drawingCanvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-80"></canvas>
            <canvas ref={overlayCanvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none"></canvas>


            {(isHandTrackingLoading || gameState === 'LOADING_CAMERA') && (
              <div className="absolute inset-0 bg-black/60 flex flex-col gap-4 items-center justify-center rounded-lg text-white z-30">
                <Loader className="h-16 w-16 animate-spin" />
                <p className="font-headline text-3xl">{gameState === 'LOADING_CAMERA' ? "Starting Camera..." : "Loading Hand Tracking..."}</p>
              </div>
            )}

            {shapeToDraw && !['IDLE', 'FEEDBACK', 'LOADING_CAMERA'].includes(gameState) && (
              <Card className="absolute top-4 right-4 w-48 h-48 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
                <CardHeader className="p-2 text-center">
                  <CardTitle className="text-md font-headline">Draw This:</CardTitle>
                </CardHeader>
                <CardContent className="p-2 flex-1 flex items-center justify-center text-primary">
                  {shapeIcons[shapeToDraw.toLowerCase()] || <Pencil className="h-24 w-24" />}
                </CardContent>
              </Card>
            )}

            {gameState === 'GET_READY' && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center rounded-lg text-white z-20 text-center p-4">
                  {isMobile ? (
                     <>
                      <h2 className="font-headline text-5xl mb-4">Get Ready!</h2>
                      <Button onClick={() => {
                        setCountdown(COUNTDOWN_SECONDS);
                        setGameState('COUNTDOWN');
                      }} size="lg">Tap to Start</Button>
                     </>
                  ): (
                    <>
                      <h2 className="font-headline text-5xl mb-4">Show 10 Fingers to Start!</h2>
                      <Hand className="h-24 w-24 animate-pulse" />
                    </>
                  )}
                </div>
            )}
             {gameState === 'COUNTDOWN' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg z-20">
                    <h2 className="font-headline text-9xl text-white">{countdown}</h2>
                </div>
            )}
            {gameState === 'DRAWING' && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-4 z-20">
                  <div className="flex justify-center w-full">
                    <Button onClick={handleSubmit} size="lg" className="font-headline text-lg" >
                      <Sparkles className="mr-2"/> Submit Drawing
                    </Button>
                    {isMobile ? (
                      <div className="flex gap-2 ml-4">
                        <Button onClick={() => setDrawingTool(t => t === 'PENCIL' ? 'ERASER' : 'PENCIL')} variant="outline" size="icon" className="h-12 w-12 bg-background/80">
                          {drawingTool === 'PENCIL' ? <Eraser/> : <Pencil/>}
                        </Button>
                         <Button onClick={clearCanvas} variant="destructive" size="icon" className="h-12 w-12 bg-background/80">
                          <XCircle/>
                        </Button>
                      </div>
                    ) : (
                      <Card className="p-2 px-4 flex items-center gap-2 bg-background/80 ml-4">
                        <span className="text-muted-foreground text-sm font-bold">TOOL:</span>
                        {drawingTool === 'PENCIL' ? <Pencil className="h-6 w-6 text-primary"/> : <Eraser className="h-6 w-6 text-blue-400" />}
                      </Card>
                    )}
                  </div>
                </div>
            )}
             {gameState === 'SUBMITTING' && (
                <div className="absolute inset-0 bg-black/60 flex flex-col gap-4 items-center justify-center rounded-lg text-white z-30">
                    <Loader className="h-16 w-16 animate-spin" />
                    <p className="font-headline text-3xl">AI is judging your art...</p>
                </div>
            )}
             {gameState === 'FEEDBACK' && feedback && (
                 <div className="absolute inset-0 bg-black/70 flex flex-col gap-4 items-center justify-center rounded-lg text-white z-30 text-center p-4">
                    {feedback.isMatch ? <CheckCircle2 className="h-24 w-24 text-green-400" /> : <XCircle className="h-24 w-24 text-red-400" />}
                    <h2 className="font-headline text-4xl max-w-lg">{feedback.message}</h2>
                    <h3 className="text-2xl font-bold">Your Score: {score}</h3>
                    <Button onClick={handleNextQuestion} size="lg" className="font-headline text-lg mt-4">Next Shape</Button>
                </div>
            )}
             {isMobile && gameState === 'DRAWING' && drawingTool === 'ERASER' && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-4/5 max-w-xs z-20">
                <Alert>
                  <Eraser className="h-4 w-4" />
                  <AlertTitle>Eraser Size</AlertTitle>
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
      <div className="w-full max-w-7xl aspect-[3/4] lg:aspect-video relative rounded-lg shadow-lg overflow-hidden bg-muted">
        {renderContent()}
      </div>
    </div>
  );
}
