'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { Landmark, Category } from '@mediapipe/tasks-vision';

import { countFingers } from '@/lib/finger-counting';
import { perf } from '@/lib/perf-monitor';

/**
 * The single source of truth for hand-tracking in the app.
 *
 * Performance design (post-optimization):
 *
 *  1. **Ref-first hot path.** `landmarksRef`, `handednessRef`, and
 *     `detectedFingersRef` are updated every frame with no React re-render.
 *     Game loops should read from these refs.
 *
 *  2. **Throttled state.** The React state values (`landmarks`,
 *     `handedness`, `detectedFingers`) only update when the *meaningful*
 *     content changes (hand count flip, finger-count integer change) or
 *     when 200 ms have passed without an update. This eliminates
 *     ~95 % of per-frame setState calls.
 *
 *  3. **Synchronous mobile detection.** UA-based pre-check avoids the
 *     two-phase init the previous `useIsMobile()` hook caused, which
 *     re-initialized MediaPipe (a ~600 ms cost) on first paint.
 *
 *  4. **Adaptive frame budget.** When `detectForVideo` exceeds the budget
 *     (16.7 ms desktop / 33 ms mobile), more frames are skipped until it
 *     recovers — keeps the page responsive under thermal throttling.
 *
 *  5. **GPU delegate with single-attempt CPU fallback.** Same as before
 *     but the WASM and model URLs are coalesced through a module-level
 *     promise so navigating between games does NOT re-download anything.
 */

type HandTrackingHook = {
  videoRef: React.RefObject<HTMLVideoElement>;

  /** Throttled (≤5 Hz) React-state version of the latest finger count. */
  detectedFingers: number;
  /** Updates only when hand count changes — game loops should use the ref. */
  handedness: Category[][];
  /** Updates only when hand count changes — game loops should use the ref. */
  landmarks: Landmark[][];

  /** Always-fresh refs. Read these from inside `requestAnimationFrame`. */
  landmarksRef:        React.MutableRefObject<Landmark[][]>;
  handednessRef:       React.MutableRefObject<Category[][]>;
  detectedFingersRef:  React.MutableRefObject<number>;

  startVideo: () => Promise<void>;
  stopVideo:  () => void;
  isLoading:  boolean;
  error:      string | null;
};

// ─── Module-level singletons (shared across mounts) ─────────────────
let visionFilesetPromise: Promise<any> | null = null;
let cachedHandLandmarker: HandLandmarker | null = null;
let cachedHandLandmarkerConfig: string | null = null;

function getVisionFileset() {
  if (!visionFilesetPromise) {
    visionFilesetPromise = FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    );
  }
  return visionFilesetPromise;
}

const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// ─── Synchronous mobile detection (UA-based; no React state required) ─
function detectMobileSync(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Prefer modern UA-Client-Hints if present
  const uad = (navigator as any).userAgentData;
  if (uad && typeof uad.mobile === 'boolean') return uad.mobile;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function useHandTracking(): HandTrackingHook {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>();
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);

  const isMobileRef = useRef<boolean>(false);
  if (typeof window !== 'undefined' && !isMobileRef.current) {
    isMobileRef.current = detectMobileSync();
  }

  // Hot-path refs — updated every frame, never trigger re-render.
  const landmarksRef       = useRef<Landmark[][]>([]);
  const handednessRef      = useRef<Category[][]>([]);
  const detectedFingersRef = useRef<number>(0);

  // Internal frame-throttling state
  const frameCountRef     = useRef(0);
  const skipFramesRef     = useRef(0);   // adaptive frame-skip count
  const lastInferenceMs   = useRef(0);   // last detect() duration
  const lastStateUpdateMs = useRef(0);   // wall clock of last setLandmarks
  const prevHandCountRef  = useRef(-1);  // for change-only setState
  const prevFingersRef    = useRef(-1);  // for change-only setState
  const fingerHistoryRef  = useRef<number[]>([]); // 5-frame rolling buffer for temporal smoothing

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detectedFingers, setDetectedFingers] = useState(0);
  const [handedness, setHandedness] = useState<Category[][]>([]);
  const [landmarks, setLandmarks] = useState<Landmark[][]>([]);

  const predictWebcam = useCallback(() => {
    const video = videoRef.current;
    const landmarker = handLandmarkerRef.current;
    if (!video || !landmarker || !video.srcObject || video.readyState < 2) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    // Adaptive frame-skip: every `skipFramesRef + (mobile ? 1 : 0)` frames.
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
    lastInferenceMs.current = dt;

    // Adapt skip count: if inference >budget, skip more next time; if comfortably
    // under, skip fewer. Targets 60 fps desktop / 30 fps mobile.
    const budget = isMobileRef.current ? 33 : 16.7;
    if (dt > budget * 1.5) {
      skipFramesRef.current = Math.min(skipFramesRef.current + 1, 3);
    } else if (dt < budget * 0.6 && skipFramesRef.current > 0) {
      skipFramesRef.current--;
    }

    const lm = results.landmarks || [];
    const hd = results.handedness || [];
    landmarksRef.current  = lm;
    handednessRef.current = hd;

    const rawFingers = countFingers(lm, hd as any);
    
    // Smooth over a 5-frame rolling window (majority vote) to eliminate frame jitter
    fingerHistoryRef.current.push(rawFingers);
    if (fingerHistoryRef.current.length > 5) {
      fingerHistoryRef.current.shift();
    }

    const counts: Record<number, number> = {};
    let fingers = rawFingers;
    let maxFreq = 0;
    for (const val of fingerHistoryRef.current) {
      counts[val] = (counts[val] || 0) + 1;
      if (counts[val] >= maxFreq) {
        maxFreq = counts[val];
        fingers = val;
      }
    }

    detectedFingersRef.current = fingers;

    // ── React-state update strategy ────────────────────────────────
    // Pushing a *new* `landmarks` array into React state on every frame
    // (as the original implementation did) triggers a re-render at
    // display rate. Under React 19 / Next 16 dev, this can hit the
    // "Maximum update depth exceeded" safety throttle when a consumer's
    // dependent effects amplify the cascade.
    //
    // We update state in three triggers, *whichever fires first*:
    //   1. Hand count changes (rare).
    //   2. Finger count integer changes (rare).
    //   3. STATE_UPDATE_MS elapsed since the last push (heartbeat).
    //
    // For games that need *per-frame* landmark data, the refs above
    // (`landmarksRef`, `handednessRef`, `detectedFingersRef`) are always
    // up to date — read them inside your own rAF loop.
    const STATE_UPDATE_MS = 50;          // 20 Hz heartbeat
    const handCountChanged   = lm.length !== prevHandCountRef.current;
    const fingerCountChanged = fingers !== prevFingersRef.current;
    const heartbeatDue       = startTimeMs - lastStateUpdateMs.current > STATE_UPDATE_MS;

    if (handCountChanged) {
      prevHandCountRef.current = lm.length;
      setLandmarks(lm);
      setHandedness(hd);
      lastStateUpdateMs.current = startTimeMs;
    } else if (heartbeatDue) {
      setLandmarks(lm);
      lastStateUpdateMs.current = startTimeMs;
    }
    if (fingerCountChanged) {
      prevFingersRef.current = fingers;
      setDetectedFingers(fingers);
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopVideo = useCallback(() => {
    // Invalidate any startVideo still in flight (e.g. awaiting getUserMedia)
    // so it releases its stream instead of resurrecting the camera.
    stopGenRef.current++;
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    }
    const video = videoRef.current;
    if (video && video.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    // Clear refs so consumers don't see stale data on remount.
    landmarksRef.current = [];
    handednessRef.current = [];
    detectedFingersRef.current = 0;
  }, []);

  const startingRef = useRef(false);
  const stopGenRef = useRef(0);

  const waitForVideo = (): Promise<HTMLVideoElement> =>
    new Promise(resolve => {
      const tick = () => {
        if (videoRef.current) resolve(videoRef.current);
        else setTimeout(tick, 50);
      };
      tick();
    });

  const startVideo = useCallback(async (): Promise<void> => {
    if (videoRef.current && videoRef.current.srcObject) return;
    // Concurrent starts (e.g. React dev double-mounted effects) both pass the
    // srcObject guard while awaiting getUserMedia; the second srcObject swap
    // then interrupts the first play() with an AbortError.
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    try {
      const gen = stopGenRef.current;
      const video = await waitForVideo();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:  { ideal: isMobileRef.current ? 480 : 1280 },
          height: { ideal: isMobileRef.current ? 640 : 720  },
          facingMode: 'user',
        },
        audio: false,
      });
      if (video.srcObject || gen !== stopGenRef.current) {
        // Another start won the race, or stopVideo was called while we were
        // awaiting the camera — release our stream instead of resurrecting it.
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      try {
        await video.play();
      } catch (playErr: any) {
        // Teardown races are benign: AbortError = a newer load took over;
        // NotSupportedError with a cleared srcObject = stopVideo removed the
        // source while play() was pending.
        const benign =
          playErr?.name === 'AbortError' ||
          (playErr?.name === 'NotSupportedError' && !video.srcObject);
        if (!benign) throw playErr;
      }
      if (gen !== stopGenRef.current) return; // stopped while starting — don't begin inference

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

        const numHands       = isMobileRef.current ? 1 : 2;
        const detectionConf  = isMobileRef.current ? 0.4 : 0.5;
        // Mobile: use a tracking confidence *higher* than the detection confidence
        // (0.6 > 0.4). When tracking dips to ~0.4 the model cleanly drops the track
        // instead of holding a stale one, and the low detection confidence then
        // re-acquires the hand quickly. This eliminates the "tracks stalls for a
        // few seconds, then I wait a lot before it picks up again" symptom that
        // appeared after switching to the real `minTrackingConfidence` option.
        const trackingConf   = isMobileRef.current ? 0.6 : 0.5;

        const configKey = `${numHands}|${detectionConf}|${trackingConf}`;

        // Reuse the module-cached landmarker across mounts if the config matches.
        if (cachedHandLandmarker && cachedHandLandmarkerConfig === configKey) {
          handLandmarkerRef.current = cachedHandLandmarker;
        } else {
          let lm: HandLandmarker;
          try {
            lm = await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
              runningMode: 'VIDEO',
              numHands, minHandDetectionConfidence: detectionConf,
              // NOTE: `minHandTrackingConfidence` is not a real option in
              // tasks-vision@0.10.14 — the correct key is `minTrackingConfidence`.
              minTrackingConfidence: trackingConf,
            });
          } catch (gpuErr) {
            console.warn('GPU delegate failed, falling back to CPU:', gpuErr);
            lm = await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
              runningMode: 'VIDEO',
              numHands, minHandDetectionConfidence: detectionConf,
              minTrackingConfidence: trackingConf,
            });
          }
          if (cancelled) {
            lm.close();
            return;
          }
          cachedHandLandmarker = lm;
          cachedHandLandmarkerConfig = configKey;
          handLandmarkerRef.current = lm;
        }
      } catch (e: any) {
        if (!cancelled) setError(`Failed to initialize hand tracking model: ${e.message}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    initialize();

    return () => {
      cancelled = true;
      stopVideo();
      // Do NOT close the cached HandLandmarker on unmount — keep it warm for
      // the next game route. It will be GC-ed when the tab closes.
    };
  }, [stopVideo]);

  return {
    videoRef,
    detectedFingers, handedness, landmarks,
    landmarksRef, handednessRef, detectedFingersRef,
    startVideo, stopVideo, isLoading, error,
  };
}
