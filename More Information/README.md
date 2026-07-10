# MotionArcade — Project Overview

MotionArcade is a browser-based gesture-controlled gaming platform. Players control games using real-time hand tracking via their webcam — no controllers, no keyboards. The app combines MediaPipe's hand landmark detection with AI-generated game content via Google Gemini, all built on Next.js.

---

## What It Does

Seven games run entirely through hand gestures:
- Show fingers to answer math questions or trivia
- Move your hand to control a ping-pong paddle
- Draw shapes in the air with your index finger
- Tap virtual piano keys in 4 lanes
- Pop floating bubbles with the correct math answer

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | 5 |
| Hand Tracking | MediaPipe Tasks Vision | 0.10.14 |
| 3D Rendering | Three.js | 0.183.1 |
| AI Orchestration | Genkit | 1.29.0 |
| LLM | Google Gemini 2.5 Flash Lite | — |
| Styling | Tailwind CSS + Radix UI | 3.4.1 |
| State | React hooks (no external store) | 18.3.1 |

---

## Repository Structure

```
MotionArcade_test/
├── src/
│   ├── app/                    # Next.js App Router pages & layouts
│   │   ├── layout.tsx          # Root layout (header + toaster)
│   │   ├── page.tsx            # Home/welcome page
│   │   ├── about/page.tsx      # About page (placeholder)
│   │   ├── debug/page.tsx      # AI flow debug/test page
│   │   └── games/              # One folder per game
│   │       ├── page.tsx        # Games listing/directory
│   │       ├── math-challenge/
│   │       ├── quiz-quest/
│   │       ├── math-challenge-2/
│   │       ├── sketch-and-score/
│   │       ├── ping-pong/
│   │       ├── air-piano/
│   │       └── just-show-your-hands/
│   ├── ai/                     # Genkit AI integration
│   │   ├── genkit.ts           # ai singleton (Gemini plugin)
│   │   ├── dev.ts              # Development entry point
│   │   └── flows/              # One file per AI flow
│   ├── hooks/                  # Custom React hooks
│   │   ├── use-hand-tracking.ts
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts
│   ├── lib/                    # Pure utility functions
│   │   ├── finger-counting.ts  # Gesture → finger count
│   │   ├── video-utils.ts      # Landmark → canvas coordinates
│   │   ├── constants.ts        # Hand connection map
│   │   └── utils.ts            # cn() helper
│   └── components/
│       ├── common/Header.tsx   # Nav header
│       └── ui/                 # shadcn/ui components (30+)
├── public/                     # Static assets
├── claude/                     # AI-readable project docs (this folder)
├── .env                        # GEMINI_API_KEY
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Environment Variables

```env
GEMINI_API_KEY=<your Google Generative AI key>
```

---

## Development Scripts

```bash
npm run dev           # Next.js on port 9002 with Turbopack
npm run genkit:dev    # Genkit developer UI (inspect flows)
npm run genkit:watch  # Genkit with auto-reload
npm run build         # Production build
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint
```

---

## Key Design Decisions

- **No global state manager** — each game component is self-contained, using hooks and refs.
- **Server Actions for AI** — all Genkit flows are `'use server'` functions called from client components.
- **Mobile-aware tracking** — the hand tracking hook detects mobile and reduces to 1 hand, halves frame rate, and lowers resolution to keep performance acceptable.
- **GPU-first with CPU fallback** — MediaPipe attempts GPU delegate first, falls back to CPU if unavailable.
- **Coordinate mapping layer** — `video-utils.ts` compensates for CSS `object-fit: cover` cropping so landmark positions always map correctly to canvas pixels.

---

## Documentation Index

| File | Contents |
|------|----------|
| [README.md](README.md) | This file — project overview |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Routing, component hierarchy, data flow |
| [HAND-TRACKING.md](HAND-TRACKING.md) | MediaPipe setup, finger counting, coordinate mapping |
| [AI-FLOWS.md](AI-FLOWS.md) | Genkit flows, schemas, prompts |
| [GAMES.md](GAMES.md) | All 7 games — mechanics, state machines, technical details |
