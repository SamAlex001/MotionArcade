# Hand Tracking

> **See also**: [README](README.md) · [Architecture](ARCHITECTURE.md) · [AI Flows](AI-FLOWS.md) · [Games](GAMES.md)

## Overview

All hand tracking is powered by **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision@0.10.14`). The library runs a machine learning model in the browser (via WASM + optional GPU delegate) to detect 21 3D landmarks per hand from the webcam feed.

---

## The `useHandTracking` Hook

**File**: `src/hooks/use-hand-tracking.ts`

This is the single entry point for all hand tracking. Every game imports and uses it.

### Return Value

```ts
type HandTrackingHook = {
  videoRef: React.RefObject<HTMLVideoElement>;  // attach to <video> element
  detectedFingers: number;                      // 0–10 total fingers raised
  startVideo: () => Promise<void>;              // request camera & start loop
  stopVideo: () => void;                        // stop camera & animation frame
  isLoading: boolean;                           // true while model initializes
  error: string | null;                         // null or error message
  handedness: Handedness[][];                   // "Left"/"Right" per hand
  landmarks: Landmark[][];                      // raw 3D coords, 21 per hand
};
```

### Initialization Sequence

1. On mount, `useEffect` calls `initialize()`.
2. `FilesetResolver.forVisionTasks()` loads the WASM runtime from jsDelivr CDN:
   `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm`
3. `HandLandmarker.createFromOptions()` downloads the float16 model (~5 MB) from Google Storage:
   `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
4. GPU delegate is tried first; if it throws, CPU delegate is used instead.
5. `isLoading` is set to `false` when ready.

### Mobile vs. Desktop Settings

| Setting | Mobile | Desktop |
|---------|--------|---------|
| `numHands` | 1 | 2 |
| `minHandDetectionConfidence` | 0.4 | 0.5 |
| `minHandTrackingConfidence` | 0.4 | 0.5 |
| Video width ideal | 480 | 1280 |
| Video height ideal | 640 | 720 |
| Frame skip | Every other frame | None |

### The Detection Loop

`predictWebcam()` runs on every `requestAnimationFrame`. It:
1. Guards against video not ready (`readyState < 2`).
2. On mobile, skips odd frames via `frameCountRef.current % 2`.
3. Calls `handLandmarkerRef.current.detectForVideo(video, performance.now())`.
4. Passes results to `countFingers()`.
5. Updates React state: `detectedFingers`, `landmarks`, `handedness`.
6. Schedules next frame.

### Camera Start

`startVideo()` calls `navigator.mediaDevices.getUserMedia()` with:
- `facingMode: "user"` (front camera)
- Resolution constrained by mobile detection
- `audio: false`

It attaches the stream to `videoRef.current.srcObject` and starts `predictWebcam()` once `loadeddata` fires.

### Cleanup

On unmount: cancels the `requestAnimationFrame`, stops all media tracks, calls `handLandmarkerRef.current.close()`.

---

## Hand Landmarks

MediaPipe returns 21 landmarks per hand. Each landmark is `{ x, y, z }` normalized to [0, 1] relative to the raw video frame.

```
Landmark index map:
  0  = WRIST
  1  = THUMB_CMC     (base of thumb)
  2  = THUMB_MCP
  3  = THUMB_IP
  4  = THUMB_TIP
  5  = INDEX_MCP     (knuckle)
  6  = INDEX_PIP
  7  = INDEX_DIP
  8  = INDEX_TIP
  9  = MIDDLE_MCP
  10 = MIDDLE_PIP
  11 = MIDDLE_DIP
  12 = MIDDLE_TIP
  13 = RING_MCP
  14 = RING_PIP
  15 = RING_DIP
  16 = RING_TIP
  17 = PINKY_MCP
  18 = PINKY_PIP
  19 = PINKY_DIP
  20 = PINKY_TIP
```

Fingertips are indices **4, 8, 12, 16, 20**.

---

## Finger Counting

**File**: `src/lib/finger-counting.ts`

**Exported function**: `countFingers(landmarks: Landmark[][], handedness: Handedness[]): number`

### Algorithm

For each detected hand:

1. **Four fingers** (index, middle, ring, pinky): check the angle at the PIP (middle) joint using MCP → PIP → TIP landmarks.
   - `angle > 160°` → finger is straight (raised).
   - Uses `getAngle(a, b, c)` which computes the angle at point `b` using `atan2`.

2. **Thumb**: check the angle at THUMB_MCP using THUMB_CMC → THUMB_MCP → THUMB_IP.
   - `angle > 150°` → thumb is extended.
   - Lower threshold because the thumb has a different range of motion.

3. Sum raised fingers across all detected hands (max 10 for two hands).

### `getAngle` Function

```ts
function getAngle(a, b, c): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs(radians * 180 / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}
```

Uses only `x` and `y` coordinates (ignores `z`). The angle is always returned in [0, 180].

---

## Coordinate Mapping

**File**: `src/lib/video-utils.ts`

### The Problem

When a `<video>` element uses `object-fit: cover`, the browser scales the video to fill the container and crops any overflow. MediaPipe landmarks are normalized relative to the **full uncropped video frame**, not the visible portion. Naively mapping them to canvas pixels produces offset coordinates.

### Solution: `getVideoCanvasMapping(video)`

Calculates the cover-scale math:

```ts
const scale = Math.max(displayW / videoW, displayH / videoH);
const scaledW = videoW * scale;
const scaledH = videoH * scale;
const offsetX = (scaledW - displayW) / 2;  // pixels cropped on each side
const offsetY = (scaledH - displayH) / 2;
```

Returns `{ scale, scaledW, scaledH, offsetX, offsetY, displayW, displayH }`.

### `landmarkToCanvas(lx, ly, video, mirror = true)`

Converts normalized landmark coordinates to pixel position on an overlay canvas.

```ts
let x = lx * scaledW - offsetX;
const y = ly * scaledH - offsetY;
if (mirror) x = displayW - x;  // flip to match CSS scaleX(-1) on video
```

Used by: Sketch & Score (drawing canvas), Just Show Your Hands (skeleton rendering).

### `landmarkToNormalized(lx, ly, video, mirror = true)`

Same math but returns normalized [0,1] coordinates within the **visible** area. Used by games that map hand position to a separate game canvas (Ping Pong paddle position, Air Piano lane detection).

### `createLandmarkMapper(video, mirror = true)`

Returns a closure `(lx, ly) => { x, y }` with the mapping pre-computed. More efficient when converting all 21 landmarks per frame (avoids recomputing `getVideoCanvasMapping` 21 times).

---

## Hand Connection Constants

**File**: `src/lib/constants.ts`

Exports `HAND_CONNECTIONS`: an array of `[fromIndex, toIndex]` pairs that define which landmarks to connect when drawing the hand skeleton. Used by the visualization games.

---

## Video Mirror

The `<video>` element in all games has a CSS `scaleX(-1)` transform applied (a horizontal flip), so the camera acts as a mirror for the player. All coordinate mapping functions account for this with the `mirror = true` default parameter.
