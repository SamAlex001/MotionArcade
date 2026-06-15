# Pipeline — Before Optimization

```
              ┌────────────────────────────────────────────────────┐
              │  Camera stream                                     │
              │  ↓                                                 │
              │  HTMLVideoElement (object-fit: cover)              │
              │  ↓                                                 │
              │  HandLandmarker.detectForVideo(video, t)           │
              │  ↓                                                 │
              │  Landmark[][] (new array every frame)              │
              │  ↓                                                 │
              │  countFingers(landmarks, handedness)               │
              │     • 10× Math.atan2 / call                        │
              │     • allocates joint-index array                  │
              │  ↓                                                 │
              │  setState × 3   ← FORCES whole subtree re-render   │
              │     (setLandmarks, setHandedness, setFingers)      │
              │  ↓                                                 │
              │  game's useEffect[landmarks] re-fires              │
              │  ↓                                                 │
              │  game-specific draw step                           │
              │     • landmarkToCanvas reads 4 DOM dims per call   │
              │     • drawFancy: 60+ gradient creations / frame    │
              │     • particles.filter() allocates new array       │
              │  ↓                                                 │
              │  Three.js render (if in gauntlet mode):            │
              │     • 16 800 triangles per frame                   │
              │     • MeshPhysicalMaterial(clearcoat=1) × 42       │
              │     • PMREM env map (init: ~120 ms on mobile)      │
              │  ↓                                                 │
              │  Browser paints next frame                         │
              └────────────────────────────────────────────────────┘

Per-frame: 60 React renders/sec, ~25 short-lived objects allocated,
           ~62 gradients, 40 DOM reads, 10 atan2, 19 320 triangles,
           up to 600 ms init wasted on duplicated MediaPipe boot.
```
