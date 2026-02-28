
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { HandLandmarkerResult, Landmark, Handedness } from '@mediapipe/tasks-vision';
import { useIsMobile } from './use-mobile';

import { countFingers } from '@/lib/finger-counting';

type HandTrackingHook = {
  videoRef: React.RefObject<HTMLVideoElement>;
  detectedFingers: number;
  startVideo: () => Promise<void>;
  stopVideo: () => void;
  isLoading: boolean;
  error: string | null;
  handedness: Handedness[][];
  landmarks: Landmark[][];
};


export function useHandTracking(): HandTrackingHook {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>();
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const isMobile = useIsMobile();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detectedFingers, setDetectedFingers] = useState(0);
  const [handedness, setHandedness] = useState<Handedness[][]>([]);
  const [landmarks, setLandmarks] = useState<Landmark[][]>([]);

  const predictWebcam = useCallback(() => {
    const video = videoRef.current;
    if (!video || !handLandmarkerRef.current || !video.srcObject || video.readyState < 2) {
        requestRef.current = requestAnimationFrame(predictWebcam);
        return;
    }

    const startTimeMs = performance.now();
    const results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);
    
    const totalFingerCount = countFingers(results.landmarks, results.handedness);
    
    setDetectedFingers(totalFingerCount);
    setHandedness(results.handedness || []);
    setLandmarks(results.landmarks || []);

    requestRef.current = requestAnimationFrame(predictWebcam);
  }, []);

  const stopVideo = useCallback(() => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadeddata', predictWebcam);
      }
    }
  }, [predictWebcam]);

  const waitForVideo = (): Promise<HTMLVideoElement> => {
    return new Promise((resolve) => {
      const checkVideo = () => {
        if (videoRef.current) {
          resolve(videoRef.current);
        } else {
          setTimeout(checkVideo, 50); // Check again in 50ms
        }
      };
      checkVideo();
    });
  };

  const startVideo = useCallback(async (): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      if (videoRef.current && videoRef.current.srcObject) {
        resolve();
        return;
      }

      setError(null);
      try {
        const video = await waitForVideo();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            // On mobile (portrait), request portrait resolution so the
            // camera feed fills the taller container naturally.
            width:  { ideal: isMobile ? 480  : 1280 }, 
            height: { ideal: isMobile ? 640  : 720  },
            facingMode: "user" 
          },
          audio: false,
        });

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();

        const videoReady = () => {
          predictWebcam();
          video.removeEventListener('loadeddata', videoReady);
          resolve();
        };

        if (video.readyState >= 2) {
          predictWebcam();
          resolve();
        } else {
          video.addEventListener('loadeddata', videoReady);
        }

      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission denied. Please allow camera access to play.');
        } else {
          setError(`Could not access camera: ${err.message}`);
        }
        reject(err);
      }
    });
  }, [isMobile, predictWebcam]);


  useEffect(() => {
    async function initialize() {
      try {
        setIsLoading(true);
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        
        const modelPath = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

        let handLandmarker: HandLandmarker;
        try {
          handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandTrackingConfidence: 0.5,
          });
        } catch (gpuError) {
          console.warn('GPU delegate failed, falling back to CPU:', gpuError);
          handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandTrackingConfidence: 0.5,
          });
        }
        handLandmarkerRef.current = handLandmarker;

      } catch (e: any) {
        setError(`Failed to initialize hand tracking model: ${e.message}`);
      } finally {
        setIsLoading(false);
      }
    }
    initialize();

    return () => {
      stopVideo();
      handLandmarkerRef.current?.close();
    };
  }, [stopVideo]);


  return { videoRef, detectedFingers, startVideo, stopVideo, isLoading, error, handedness, landmarks };
}
