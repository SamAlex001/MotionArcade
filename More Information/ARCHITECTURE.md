# Architecture

> **See also**: [README](README.md) · [Hand Tracking](HAND-TRACKING.md) · [AI Flows](AI-FLOWS.md) · [Games](GAMES.md)

## Routing

Next.js App Router. All routes are under `src/app/`.

```
/                       → src/app/page.tsx             (home/welcome)
/games                  → src/app/games/page.tsx        (games listing)
/games/math-challenge   → src/app/games/math-challenge/
/games/quiz-quest       → src/app/games/quiz-quest/
/games/math-challenge-2 → src/app/games/math-challenge-2/
/games/sketch-and-score → src/app/games/sketch-and-score/
/games/ping-pong        → src/app/games/ping-pong/
/games/air-piano        → src/app/games/air-piano/
/games/just-show-your-hands → src/app/games/just-show-your-hands/
/about                  → src/app/about/page.tsx        (placeholder)
/debug                  → src/app/debug/page.tsx        (AI flow tester)
```

---

## Component Hierarchy

```
RootLayout (src/app/layout.tsx)
├── Header (src/components/common/Header.tsx)   ← nav links + mobile sheet
├── <main>{children}</main>
└── Toaster                                      ← global toast notifications

GamePage (e.g. src/app/games/math-challenge/page.tsx)
  └── GameClient (MathChallengeClient.tsx)       ← 'use client' boundary
        ├── useHandTracking()                    ← camera + landmarks
        ├── <video> + <canvas>                   ← overlay rendering
        ├── AI flow calls (server actions)
        └── shadcn/ui components
```

Every game page follows the same two-file pattern:
- `page.tsx` — server component, just renders the `*Client.tsx` component.
- `*Client.tsx` — `'use client'` component that owns all game logic, camera, and AI calls.

---

## Game State Machine (General Pattern)

Each game defines its own local state enum. The typical progression:

```
IDLE / SETUP
  → user configures difficulty or options
  → clicks "Start"

LOADING
  → camera permission requested
  → MediaPipe model finishes initializing
  → AI flow fetches first question/problem

PLAYING
  → hand tracking runs every animation frame
  → game loop executes (canvas redraws, physics, timers)

HOLDING (for finger-counting games)
  → user has shown the correct number of fingers
  → 3-second hold timer running to confirm

FEEDBACK
  → result shown (correct/incorrect, score update)
  → brief delay, then next question fetched

GAME_OVER
  → final score displayed
  → option to restart
```

Concrete examples:
- **Math Challenge**: `DIFFICULTY_SELECTION → LOADING → PLAYING → HOLDING → FEEDBACK → PLAYING`
- **Ping Pong**: `IDLE → COUNTDOWN → PLAYING → GAME_OVER`
- **Air Piano**: `IDLE → SELECT_MODE → COUNTDOWN → PLAYING → GAME_OVER`

---

## Data Flow: From Camera to Game

```
getUserMedia()
  → HTMLVideoElement.srcObject
    → MediaPipe HandLandmarker.detectForVideo()  (runs every rAF)
      → 21 Landmark[]  per hand  (normalized 0-1 x/y/z)
        ├── countFingers()          → integer 0-10
        ├── landmarkToCanvas()      → pixel coords for skeleton drawing
        └── landmarkToNormalized()  → normalized coords for game objects
```

### Coordinate Systems

MediaPipe returns normalized coords in the **raw video frame** space (0,0 = top-left of the unscaled video). When the video element uses `object-fit: cover`, parts of the frame are cropped. `video-utils.ts` compensates:

- `landmarkToCanvas(lx, ly, video)` → pixel position on an overlay canvas.
- `landmarkToNormalized(lx, ly, video)` → 0-1 position within the visible area (used for game physics).
- `createLandmarkMapper(video)` → cached mapper for drawing many landmarks per frame.

---

## AI Integration Pattern

All Genkit flows live in `src/ai/flows/` and are marked `'use server'`. Client components import and call them directly as async functions (Next.js server actions).

```
Client component
  → import { generateMathProblem } from '@/ai/flows/dynamic-math-problem-generation'
  → await generateMathProblem({ difficulty, currentScore, pastScores })
      → Genkit flow runs on the server
        → Gemini 2.5 Flash Lite returns structured JSON (validated with Zod)
      → returns { problem: string, solution: number }
```

The `ai` singleton in `src/ai/genkit.ts` is created once and shared:

```ts
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.5-flash-lite',
});
```

---

## Header & Navigation

`src/components/common/Header.tsx`

- Sticky top navigation bar.
- Desktop: inline nav links.
- Mobile: hamburger icon opens a Sheet (Radix UI slide-over) with the same links.
- Links: Home, Games, About.

---

## Styling System

- **Tailwind CSS** with custom CSS variables for theming (`src/app/globals.css`).
- **shadcn/ui** components live in `src/components/ui/` — these wrap Radix UI primitives with Tailwind variants via `class-variance-authority`.
- **Color palette** (defined as HSL CSS variables):
  - Primary: soft lavender `240 50% 75%`
  - Accent: dusty rose `300 26% 86%`
  - Background: very light grey `0 0% 96.1%`
- **Typography**: Space Grotesk (headlines), Inter (body).
- **Custom animations** in `globals.css`:
  - `float` — 6s ease-in-out infinite (bubble hover)
  - `pop` — 0.3s scale+fade (bubble burst)
  - `gooify` — 12s organic shape morphing

---

## Performance Strategy

| Concern | Approach |
|---------|----------|
| Mobile frame rate | Skip every other frame (`frameCountRef % 2`) |
| Mobile hands | Detect 1 hand instead of 2 |
| Mobile resolution | Request 480×640 instead of 1280×720 |
| Mobile confidence | Lower detection/tracking threshold (0.4 vs 0.5) |
| GPU acceleration | Try GPU delegate first, fall back to CPU |
| Particle capping | Max 100 particles in effects systems |
| Coordinate mapping | `createLandmarkMapper()` computes mapping once per frame, reuses for all 21 landmarks |
| Animation frames | Store `requestAnimationFrame` id in a `useRef`, cancel on unmount |

---

## Error Handling

- Camera denied → `NotAllowedError` caught, `error` state set, displayed to user.
- Model init failure → caught, `error` state set with message.
- AI flow failure → try/catch in game component, toast notification shown.
- Video stream loss → cleanup and game state reset.
