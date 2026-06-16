# Pipeline — After Optimization

```
              ┌────────────────────────────────────────────────────┐
              │  Camera stream                                     │
              │  ↓                                                 │
              │  HTMLVideoElement (object-fit: cover)              │
              │  ↓                                                 │
              │  HandLandmarker.detectForVideo(video, t)           │
              │     • module-cached instance, no re-init           │
              │     • adaptive frame-skip if dt > budget × 1.5     │
              │  ↓                                                 │
              │  Landmark[][]                                      │
              │  ↓                                                 │
              │  countFingers(landmarks, handedness)               │
              │     • dot-product cosine test (no atan2)           │
              │     • zero allocations                             │
              │  ↓                                                 │
              │  landmarksRef.current = lm   ← ref write only      │
              │                              ← NO React render     │
              │  + setLandmarks(...)         ← legacy compat only  │
              │  ↓                                                 │
              │  game's rAF loop reads from landmarksRef.current   │
              │  ↓                                                 │
              │  game-specific draw step                           │
              │     • coordinate mapping cached (0 DOM reads)      │
              │     • drawFancy: 5 radial gradients/frame          │
              │     • particles compacted in place (0 allocations) │
              │     • Float32Array pre-mapped coords reused        │
              │  ↓                                                 │
              │  Three.js render (gauntlet mode):                  │
              │     • 8 064 triangles (Desktop) / 5 712 (Mobile)   │
              │     • MeshStandardMaterial × 42 (PBR only on tips) │
              │     • PMREM env map skipped on mobile              │
              │     • frustumCulled=false on always-onscreen meshes│
              │  ↓                                                 │
              │  Browser paints next frame                         │
              └────────────────────────────────────────────────────┘

Per-frame: 0–5 React renders/sec (for refactored consumers),
           0–5 short-lived objects allocated,
           5 gradients, 0 DOM reads, 0 atan2,
           8 064 / 5 712 triangles,
           1 MediaPipe init per cold mount.
```
