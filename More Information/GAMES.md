# Games

> **See also**: [README](README.md) · [Architecture](ARCHITECTURE.md) · [Hand Tracking](HAND-TRACKING.md) · [AI Flows](AI-FLOWS.md)

All games follow the same two-file pattern:
- `page.tsx` — thin server component, renders the `*Client.tsx`.
- `*Client.tsx` — `'use client'` component with all game logic, camera, AI calls, and canvas rendering.

---

## 1. Math Challenge

**Route**: `/games/math-challenge`  
**File**: `src/app/games/math-challenge/MathChallengeClient.tsx`

### Mechanic
AI generates a math problem. The player holds up fingers (0–10) to show their answer. Holding the answer steady for 3 seconds confirms it.

### State Machine
```
DIFFICULTY_SELECTION
  → user adjusts slider (1–10)
  → clicks "Start Game"
LOADING
  → camera permission
  → first problem fetched from generateMathProblem()
PLAYING
  → problem shown, timer counting down
  → hand tracking reads detectedFingers
HOLDING
  → player is holding fingers still
  → 3-second hold timer
FEEDBACK
  → correct/incorrect result shown (1.5s)
  → next problem fetched
PLAYING  (loop)
```

### Key Details
- **Timer**: `10 + difficulty * 1` seconds per problem.
- **Adaptive difficulty**: `pastScores[]` passed to AI so it can calibrate problem complexity.
- **Hold confirmation**: Prevents accidental answers — player must hold the exact finger count for 3 continuous seconds.
- **Score**: Tracks correct answers; resets on wrong answer or timeout.

### AI Flow
`generateMathProblem({ difficulty, currentScore, pastScores })`  
Returns `{ problem: string, solution: number }` where `solution` is always 0–10.

---

## 2. Quiz Quest

**Route**: `/games/quiz-quest`  
**File**: `src/app/games/quiz-quest/QuizQuestClient.tsx`

### Mechanic
The player selects trivia subjects, then the AI generates questions with 4 answer options. The player shows 1–4 fingers to select an answer (1 = option A, 2 = option B, etc.).

### State Machine
```
SUBJECT_SELECTION
  → multi-select from preset subjects (Science, Math, History, etc.)
  → can add custom subject via text input
LOADING
  → camera + first question fetched
PLAYING
  → question and 4 options displayed
  → finger count maps to option (1–4)
HOLDING (3-second confirm)
FEEDBACK (1.5s)
PLAYING  (loop)
```

### Key Details
- **Subject flexibility**: Preset subjects + free-form custom input. Any text can be used as a subject.
- **Option display**: Four answer cards on screen, each labeled 1–4.
- **Difficulty**: Increases as `currentScore` grows (passed to AI).

### AI Flow
`generateQuizQuestion({ currentScore, subjects })`  
Returns `{ question, options: [4 strings], correctAnswerIndex: 0–3 }`.

---

## 3. Math Challenge 2

**Route**: `/games/math-challenge-2`  
**File**: `src/app/games/math-challenge-2/MathChallenge2Client.tsx`

### Mechanic
A math problem appears at the top. 4–6 answer bubbles float around the screen. The player moves their hand over the bubble with the correct answer to pop it.

### State Machine
```
IDLE → LOADING → PLAYING → GAME_OVER
```

### Key Details
- **Bubbles**: Physics-based movement. Each bubble has position, velocity, and bounces off walls.
- **Collision detection**: Player's hand position (from `landmarkToNormalized`) compared to each bubble's position. If distance < threshold → bubble popped.
- **Correct vs. wrong pop**: Correct → score up, new problem. Wrong → life lost.
- **Game over**: After losing all lives.
- **Bubble animation**: CSS classes `.bubble-shiny`, `.animate-float-gooey` for visual polish.

### AI Flow
`generateMathProblem2({ difficulty, currentScore })`  
Returns `{ problem, options: string[], correctAnswer: string }` with 4–6 options. Allows harder math (geometry, algebra) since the player picks from choices, not finger counts.

---

## 4. Sketch & Score

**Route**: `/games/sketch-and-score`  
**File**: `src/app/games/sketch-and-score/SketchAndScoreClient.tsx`

### Mechanic
The AI names a shape. The player draws it in the air with their index finger (landmark 8 = `INDEX_TIP`). After the timer, Gemini Vision evaluates the drawing.

### State Machine
```
IDLE
  → "Start" clicked
LOADING
  → camera + generateShapeToDraw() called
COUNTDOWN (3 seconds)
  → visual countdown before drawing begins
DRAWING (timed)
  → index finger position tracked
  → drawn to canvas in real time
  → gesture: closed fist switches to eraser mode
EVALUATING
  → canvas exported as PNG data URI
  → evaluatePlayerDrawing() called with image
FEEDBACK
  → isMatch result + feedback text shown
  → score updated
  → next shape fetched
```

### Key Details
- **Drawing**: Index finger tip position (`landmarkToCanvas`) is drawn as a continuous path on an overlay canvas. The video feed shows behind the canvas.
- **Eraser**: A closed-fist gesture switches the drawing tool to eraser mode (separate detection logic for fist).
- **Canvas export**: `canvas.toDataURL('image/png')` produces the data URI for evaluation.
- **Past shapes**: Session history of shown shapes is sent to `generateShapeToDraw()` to avoid repetition.
- **Available shapes**: circle, square, triangle, star, heart, arrow, house.
- **Evaluation leniency**: Prompt explicitly tells Gemini to be lenient ("wobbly lines are fine").

### AI Flows
1. `generateShapeToDraw({ pastShapes })` → shape name
2. `evaluatePlayerDrawing({ shapeToDraw, drawingDataUri })` → `{ isMatch, feedback }`

---

## 5. Ping Pong

**Route**: `/games/ping-pong`  
**File**: `src/app/games/ping-pong/PingPongClient.tsx`

### Mechanic
Classic Pong, single player. The paddle is controlled by the horizontal position of the player's hand. The ball bounces off walls and the paddle; the player scores when the ball hits the paddle.

### State Machine
```
IDLE → COUNTDOWN (3s) → PLAYING → GAME_OVER
```

### Key Details
- **Paddle control**: `landmarkToNormalized(wristX, wristY, video)` maps the wrist landmark's X position to the paddle's horizontal position on the game canvas. Updated every frame.
- **Ball physics**: Ball has `dx`, `dy` velocity. Bounces off left/right/top walls. If it hits the bottom wall, life is lost.
- **Collision**: Ball rectangle vs. paddle rectangle.
- **Combo multiplier**: Consecutive paddle hits increase a multiplier applied to score.
- **Ball trail**: Array of recent ball positions drawn with decreasing opacity. Trail length capped at 5 on mobile, 10 on desktop.
- **Particle effects**: On paddle hit, particles spawn at contact point with random velocity and fade out. Capped at 100 particles total.
- **High score**: Stored in component state (not persisted across sessions).
- **No AI flows**: Ping Pong is purely physics-based with no AI content generation.

---

## 6. Air Piano

**Route**: `/games/air-piano`  
**File**: `src/app/games/air-piano/AirPianoClient.tsx`

### Mechanic
A 4-lane rhythm game. Musical notes fall from the top. The player raises their hand into the corresponding lane at the right time to hit the note and play a piano sound.

### State Machine
```
IDLE
  → SELECT_MODE (Easy / Hard)
COUNTDOWN (3s)
PLAYING
  → notes fall, hand tracked per lane
  → audio plays on hit
  → consecutive misses tracked
GAME_OVER
  → score shown, option to retry
```

### Key Details
- **Lanes**: 4 vertical lanes, each mapped to a piano note: A3, C4, E4, G4.
- **Note spawn**: Notes appear at the top of each lane at intervals. Easy: 3s fall duration, Hard: 2s.
- **Hit detection**: A TAP_ZONE region at the bottom of the screen. When the player's hand is in a lane and a note reaches the TAP_ZONE, it registers as a hit.
- **Hand position**: Smoothed with factor 0.3 (new = old * 0.7 + current * 0.3) to prevent jitter.
- **Audio**: Piano samples loaded from a CDN (MIDI piano sound library). Each of the 4 lanes has its own note.
- **Consecutive misses**: After N consecutive misses, game over triggers.
- **Particle effects**: Visual burst when a note is successfully hit.
- **No AI flows**: All content is deterministic (random note timing in lanes).

---

## 7. Just Show Your Hands

**Route**: `/games/just-show-your-hands`  
**File**: `src/app/games/just-show-your-hands/JustShowYourHandsClient.tsx`  
**Renderer**: `src/app/games/just-show-your-hands/three-hand-renderer.ts`

### Mechanic
Not a game — a technical demonstration of the hand tracking system with three visualization modes.

### Visualization Modes

**Classic (2D Skeleton)**
- Draws lines between connected landmarks using `HAND_CONNECTIONS`.
- Draws circles at each landmark.
- Fingertips (indices 4, 8, 12, 16, 20) highlighted in a different color.
- All drawn on a 2D canvas overlaid on the video.

**Filled (Triangulated Mesh)**
- Triangulates the hand landmarks to create a filled mesh.
- Colors each triangle based on the average `z` depth of its three vertices, mapped to an HSL hue.
- Shallower (closer to camera) = one hue, deeper = another. Creates a depth visualization effect.
- Also highlights fingertips.

**3D (Three.js)**
- Uses `three-hand-renderer.ts` to create a WebGL scene.
- Each landmark is a 3D sphere.
- Connections are 3D cylinders between landmark pairs.
- Depth (`z` from MediaPipe) is used as actual 3D depth, giving a real perspective view of the hand.
- Scene updates every frame with new landmark positions.

### Controls
- Toggle between Classic / Filled / 3D rendering mode.
- Camera model selector (Camera 1 / Camera 2) for testing different inputs.
- No scoring, no objectives.

### `three-hand-renderer.ts`

Contains the Three.js setup:
- `WebGLRenderer` attached to a canvas element.
- `PerspectiveCamera` facing the scene.
- `Scene` with `AmbientLight` and `DirectionalLight`.
- Per-landmark: `SphereGeometry` mesh.
- Per-connection: `CylinderGeometry` mesh, positioned and rotated to connect two landmark positions.
- `update(landmarks)` function called every frame to move all objects.
