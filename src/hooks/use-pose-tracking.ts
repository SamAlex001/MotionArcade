'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { Landmark } from '@mediapipe/tasks-vision';

import { perf } from '@/lib/perf-monitor';

/**
 * Full-body pose tracking, structurally identical to `use-hand-tracking.ts`
 * but backed by MediaPipe's PoseLandmarker (BlazePose GHUM, 33 keypoints).
 *
 * Every hand-hook performance decision carries over — see
 * research/optimizations/01-hand-tracking-hook.md:
 *  1. Ref-first hot path (`landmarksRef`/`scoresRef` update every frame with
 *     zero re-renders).  2. Throttled React state (flip on pose appear/vanish,
 *     + a slow heartbeat).  3. Synchronous mobile detection (no double init).
 *  4. Adaptive frame budget (16.7 ms desktop / 33 ms mobile).  5. GPU → CPU
 *  fallback with the model coalesced through a module-level singleton.
 */

export interface PoseVisibility {
  coverage: number;   // 0..1 fraction of the 33 joints confidently visible
  visible: number;    // count of confidently-visible joints
  upperBody: boolean; // shoulders + hips present
  lowerBody: boolean; // knees present
  fullBody: boolean;  // essentially fully in frame
}

type PoseTrackingHook = {
  videoRef: React.RefObject<HTMLVideoElement>;
  landmarks: Landmark[][];      // throttled state — loops use landmarksRef
  isLoading: boolean;
  error: string | null;
  hasPose: boolean;
  landmarksRef: React.MutableRefObject<Landmark[][]>;
  scoresRef: React.MutableRefObject<number[]>;      // per-joint visibility 0..1
  visibilityRef: React.MutableRefObject<PoseVisibility>; // per-frame summary
  startVideo: () => Promise<void>;
  stopVideo: () => void;
};

// ─── Module-level singletons (shared across mounts) ─────────────────
let visionFilesetPromise: Promise<any> | null = null;
let cachedPoseLandmarker: PoseLandmarker | null = null;
let cachedPoseLandmarkerConfig: string | null = null;

function getVisionFileset() {
  if (!visionFilesetPromise) {
    visionFilesetPromise = FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    );
  }
  return visionFilesetPromise;
}

// Heavy on desktop for quality, lite on mobile for battery/perf.
const MODEL_DESKTOP =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task';
const MODEL_MOBILE =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

function detectMobileSync(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uad = (navigator as any).userAgentData;
  if (uad && typeof uad.mobile === 'boolean') return uad.mobile;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

const VIS_THRESHOLD = 0.5;

const CLEAR_VISIBILITY: PoseVisibility = {
  coverage: 0, visible: 0, upperBody: false, lowerBody: false, fullBody: false,
};

export function usePoseTracking(): PoseTrackingHook {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>();
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);

  const isMobileRef = useRef<boolean>(false);
  if (typeof window !== 'undefined' && !isMobileRef.current) {
    isMobileRef.current = detectMobileSync();
  }

  // Hot-path refs — updated every frame, never trigger re-render.
  const landmarksRef = useRef<Landmark[][]>([]);
  const scoresRef = useRef<number[]>([]);
  const visibilityRef = useRef<PoseVisibility>(CLEAR_VISIBILITY);

  const frameCountRef = useRef(0);
  const skipFramesRef = useRef(0);
  const lastStateUpdateMs = useRef(0);
  const prevHadPoseRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<Landmark[][]>([]);
  const [hasPose, setHasPose] = useState(false);

  const predictWebcam = useCallback(() => {
    const video = videoRef.current;
    const landmarker = poseLandmarkerRef.current;
    if (!video || !landmarker || !video.srcObject || video.readyState < 2) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    frameCountRef.current++;
    const skip = (isMobileRef.current ? 1 : 0) + skipFramesRef.current;
    if (skip > 0 && frameCountRef.current % (skip + 1) !== 0) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    perf.mark('inference');
    const startTimeMs = performance.now();
    const results = landmarker.detectForVideo(video, startTimeMs);
    const dt = performance.now() - startTimeMs;
    perf.measure('inference');

    const budget = isMobileRef.current ? 33 : 16.7;
    if (dt > budget * 1.5) {
      skipFramesRef.current = Math.min(skipFramesRef.current + 1, 3);
    } else if (dt < budget * 0.6 && skipFramesRef.current > 0) {
      skipFramesRef.current--;
    }

    const lm = (results.landmarks as Landmark[][]) || [];
    landmarksRef.current = lm;

    const pose = lm[0];
    const nowHasPose = !!pose && pose.length > 0;

    if (nowHasPose) {
      const n = pose.length;
      const scores = scoresRef.current;
      scores.length = n;
      let visible = 0;
      for (let i = 0; i < n; i++) {
        const s: any = (pose[i] as any)?.visibility;
        const v = typeof s === 'number' ? s : 1;
        scores[i] = v;
        if (v >= VIS_THRESHOLD) visible++;
      }
      const vis = visibilityRef.current;
      vis.visible = visible;
      vis.coverage = visible / n;
      vis.upperBody =
        scores[11] >= VIS_THRESHOLD && scores[12] >= VIS_THRESHOLD &&
        scores[23] >= VIS_THRESHOLD && scores[24] >= VIS_THRESHOLD;
      vis.lowerBody = scores[25] >= VIS_THRESHOLD && scores[26] >= VIS_THRESHOLD;
      vis.fullBody = vis.upperBody && vis.lowerBody && vis.coverage >= 0.6;
    } else {
      scoresRef.current.length = 0;
      const vis = visibilityRef.current;
      vis.coverage = 0; vis.visible = 0;
      vis.upperBody = false; vis.lowerBody = false; vis.fullBody = false;
    }

    // Throttled setState: only flip React state on pose appear/vanish, or on
    // a slow heartbeat for UI reading the `landmarks` array — never per frame.
    const poseCountChanged = nowHasPose !== prevHadPoseRef.current;
    const heartbeatDue = startTimeMs - lastStateUpdateMs.current > 200;
    if (poseCountChanged) {
      prevHadPoseRef.current = nowHasPose;
      setHasPose(nowHasPose);
      setLandmarks(lm);
      lastStateUpdateMs.current = startTimeMs;
    } else if (heartbeatDue) {
      setLandmarks(lm);
      lastStateUpdateMs.current = startTimeMs;
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startingRef = useRef(false);
  const stopGenRef = useRef(0);

  const stopVideo = useCallback(() => {
    stopGenRef.current++;
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    }
    const video = videoRef.current;
    if (video && video.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    landmarksRef.current = [];
    scoresRef.current.length = 0;
    const vis = visibilityRef.current;
    vis.coverage = 0; vis.visible = 0;
    vis.upperBody = false; vis.lowerBody = false; vis.fullBody = false;
  }, []);

  const waitForVideo = (): Promise<HTMLVideoElement> =>
    new Promise((resolve) => {
      const tick = () => {
        if (videoRef.current) resolve(videoRef.current);
        else setTimeout(tick, 50);
      };
      tick();
    });

  const startVideo = useCallback(async (): Promise<void> => {
    if (videoRef.current && videoRef.current.srcObject) return;
    // Guard against racing starts (React dev double-mount / rapid clicks).
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    try {
      const gen = stopGenRef.current;
      const video = await waitForVideo();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: isMobileRef.current ? 480 : 1280 },
          height: { ideal: isMobileRef.current ? 640 : 720 },
          facingMode: 'user',
        },
        audio: false,
      });
      if (video.srcObject || gen !== stopGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      try {
        await video.play();
      } catch (playErr: any) {
        const benign =
          playErr?.name === 'AbortError' ||
          (playErr?.name === 'NotSupportedError' && !video.srcObject);
        if (!benign) throw playErr;
      }
      if (gen !== stopGenRef.current) return;

      if (video.readyState >= 2) {
        predictWebcam();
      } else {
        const onReady = () => {
          predictWebcam();
          video.removeEventListener('loadeddata', onReady);
        };
        video.addEventListener('loadeddata', onReady);
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera permission denied. Please allow camera access to play.');
      } else {
        setError(`Could not access camera: ${err.message}`);
      }
      throw err;
    } finally {
      startingRef.current = false;
    }
  }, [predictWebcam]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        setIsLoading(true);
        const vision = await getVisionFileset();
        if (cancelled) return;

        const modelPath = isMobileRef.current ? MODEL_MOBILE : MODEL_DESKTOP;
        const detectionConf = isMobileRef.current ? 0.4 : 0.5;
        const trackingConf = isMobileRef.current ? 0.6 : 0.5; // mobile: track > detect
        const configKey = `${modelPath}|${detectionConf}|${trackingConf}`;

        if (cachedPoseLandmarker && cachedPoseLandmarkerConfig === configKey) {
          poseLandmarkerRef.current = cachedPoseLandmarker;
        } else {
          let lm: PoseLandmarker;
          try {
            lm = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: detectionConf,
              minPosePresenceConfidence: detectionConf,
              minTrackingConfidence: trackingConf,
            });
          } catch (gpuErr) {
            console.warn('GPU delegate failed, falling back to CPU:', gpuErr);
            lm = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: detectionConf,
              minPosePresenceConfidence: detectionConf,
              minTrackingConfidence: trackingConf,
            });
          }
          if (cancelled) { lm.close(); return; }
          cachedPoseLandmarker = lm;
          cachedPoseLandmarkerConfig = configKey;
          poseLandmarkerRef.current = lm;
        }
      } catch (e: any) {
        if (!cancelled) setError(`Failed to initialize pose model: ${e.message}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    initialize();
    return () => { cancelled = true; stopVideo(); };
  }, [stopVideo]);

  return {
    videoRef,
    landmarks,
    isLoading,
    error,
    hasPose,
    landmarksRef,
    scoresRef,
    visibilityRef,
    startVideo,
    stopVideo,
  };
}
