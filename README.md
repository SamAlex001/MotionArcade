# 🎮 MotionArcade

An innovative, touchless AR arcade gaming platform where your **hands are the controller**. MotionArcade combines cutting-edge computer vision, high-performance gesture tracking, synthesized Web Audio, and AI-driven content generation to deliver immersive web-based gaming experiences with zero extra hardware.

![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-18.3.1-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![MediaPipe](https://img.shields.io/badge/MediaPipe-0.10.14-00979D?logo=google)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwindcss)
![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)

---

## ✨ Features

- 🖐️ **100% Touchless AR Controls**: Play games using natural hand movements and finger counting detected via webcam.
- ⚡ **60 FPS High-Performance Engine**: Unthrottled `requestAnimationFrame` hot-path rendering decoupled from React state re-renders.
- 🧠 **AI-Powered Content Generation**: Dynamic math challenges and art evaluation using Google Genkit & Gemini AI.
- 📊 **Motion Quiz Studio**: Upload custom spreadsheets (`.csv`, `.xlsx`, `.xls`) or create quiz decks directly in-app for touchless trivia!
- 🎹 **Web Audio API Sound Engine**: Zero-dependency, zero-latency synthesized audio for crisp musical and sound FX feedback.
- ✋ **Hand Preference & Anatomical Isolation**: Toggle between Right/Left hand configurations with 2-pass dominant finger isolation to eliminate accidental adjacent finger flexes.
- 📱 **Adaptive Cross-Platform Engine**: Automatic mobile hardware detection with adaptive inference frame budgeting (60 FPS Desktop / 30 FPS Mobile).

---

## 🕹️ Available Games (8 Total)

### 1. 📊 Motion Quiz Studio *(NEW)*
Create and play custom trivia decks! Upload your own questions using **CSV or Excel files (`.xlsx`, `.csv`)** or build custom decks in-app. Answer questions hands-free by holding up fingers corresponding to option numbers.

### 2. 🎹 Air Piano
Hit falling rhythm tiles by dipping your fingers in mid-air! Features synthesized piano keys via Web Audio API, Auto/Left/Right hand preferences, adaptive height resting baselines, and 2-pass dominant finger isolation for misfire-free rhythm play.

### 3. 🎨 Sketch & Score
Draw shapes in the air with your index finger at 60 FPS! Switch between pencil and eraser using pinch gestures, resize the eraser dynamically with your off-hand, show 10 fingers to clear the canvas, and let Google Gemini AI evaluate your artwork!

### 4. 🧮 Math Challenge 2
A physical bubble-popping math game! Point your index finger at floating answer bubbles to pop them before the countdown timer runs out. Features 60 FPS tracking and multi-tier difficulty scaling.

### 5. ✋ Math Challenge
Test your mental math speed! Solve arithmetic problems by holding up the exact number of fingers (0–10) in front of the camera.

### 6. 🧠 Quiz Quest
Interactive general knowledge trivia! Select answer choices by displaying finger counts (1–4) and holding your answer steady to lock in your choice.

### 7. 🏓 Ping Pong
Control a table tennis paddle using hand movements. Keep the ball in play, build combos, and test your hand-eye coordination.

### 8. 🖐️ Just Show Your Hands
A technical demo mode exposing the raw MediaPipe hand landmark detection engine. Inspect 21 3D joint landmarks, handedness confidence scores, and real-time skeleton overlays.

---

## ⚡ High-Performance Gesture Engine Architecture

MotionArcade is engineered specifically to prevent common React performance bottlenecks in high-frequency computer vision applications:

```
                  ┌──────────────────────────────┐
                  │   Webcam Stream (60 FPS)     │
                  └──────────────┬───────────────┘
                                 │
                   ┌─────────────▼──────────────┐
                   │  MediaPipe HandLandmarker   │
                   └─────────────┬──────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │ (Hot Path - No React Re-renders)    │
              │  landmarksRef / handednessRef       │
              └──────────┬────────────────┬─────────┘
                         │                │
     ┌───────────────────▼──┐          ┌──▼───────────────────┐
     │ requestAnimationFrame│          │  React State (20Hz)  │
     │ Game Loop (60 FPS)   │          │  UI Sync Heartbeat   │
     └──────────────────────┘          └──────────────────────┘
```

1. **Ref-First Hot Path**: Game loops read directly from `landmarksRef` and `handednessRef` inside `requestAnimationFrame`, achieving 60 FPS rendering without triggering React re-renders.
2. **Throttled State Heartbeat**: React state updates are throttled to a 20Hz heartbeat (50ms) to ensure smooth UI re-renders without triggering Maximum Update Depth warnings.
3. **Anatomical Finger Isolation**: 2-pass relative dip calculations filter out passive movement from adjacent rigid fingers (tendon linkages).
4. **Adaptive Frame Budgeting**: Inference dynamically adjusts frame skipping based on device thermal throttling (targets 16.7ms desktop / 33ms mobile).

---

## 🛠️ Tech Stack

- **Core Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack) & [React 18](https://react.dev/)
- **Language**: TypeScript 5
- **Vision Engine**: [@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision)
- **AI Integration**: [Google Genkit](https://firebase.google.com/docs/genkit) & Google Generative AI (Gemini 2.5 Flash)
- **Audio Engine**: Pure Web Audio API (`AudioContext` Synthesizer)
- **Parser Engine**: `xlsx` (SheetJS) for spreadsheet quiz parsing
- **Styling**: Vanilla CSS, Tailwind CSS, Radix UI Primitives, Lucide Icons

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20.x or higher
- **Hardware**: Webcam
- **Browser**: Google Chrome, Microsoft Edge, or Firefox (WebRTC camera support required)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/kravitexx/MotionArcade_test.git
   cd MotionArcade_test
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env.local` file in the root directory:
   ```env
   GOOGLE_GENAI_API_KEY=your_gemini_api_key_here
   ```
   > The Google GenAI plugin also accepts `GEMINI_API_KEY` if you prefer that name; set one of the two.

4. **Start the Development Server**
   ```bash
   npm run dev
   ```

5. **Launch MotionArcade**
   Open your browser and navigate to `http://localhost:9002`

---

## 📂 Project Structure

```
MotionArcade_test/
├── src/
│   ├── ai/                        # Genkit AI flows & Gemini configuration
│   │   └── flows/                 # Math, trivia, and shape evaluation AI flows
│   ├── app/                       # Next.js App Router routes
│   │   ├── games/                 # Arcade games pages & client implementations
│   │   │   ├── air-piano/
│   │   │   ├── just-show-your-hands/
│   │   │   ├── math-challenge/
│   │   │   ├── math-challenge-2/
│   │   │   ├── motion-quiz-studio/ # Custom spreadsheet trivia studio
│   │   │   ├── ping-pong/
│   │   │   ├── quiz-quest/
│   │   │   └── sketch-and-score/
│   │   ├── about/
│   │   └── debug/
│   ├── components/                # Reusable UI primitives (shadcn/ui & custom)
│   ├── hooks/
│   │   ├── use-hand-tracking.ts   # Core MediaPipe hand tracking hook (60 FPS engine)
│   │   └── use-mobile.tsx
│   ├── lib/
│   │   ├── finger-counting.ts     # 3D scale-invariant finger counting logic
│   │   ├── quiz-parser.ts        # CSV/XLSX spreadsheet parser
│   │   ├── video-utils.ts         # Aspect-ratio cover mapping & coordinates
│   │   └── perf-monitor.ts
│   └── types/                     # TypeScript interfaces
├── public/                        # Static assets & WASM models
└── package.json
```

---

## 📄 License

**Academic / Final Year MCA Project.**

This project is free and open-source software licensed under the **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)**.
You are free to use, study, modify, and redistribute it under the terms of that license.

> ⚠️ The AGPL is a strong copyleft license designed for network software like this app. If you run a modified version on a server that others interact with, you must make your full source (including your changes) available to those users under the AGPL.
>
> Full license text: see [`LICENSE`](./LICENSE) or <https://www.gnu.org/licenses/agpl-3.0.html>.

---

## 👥 Authors

- **kravitexx** - [@kravitexx](https://github.com/kravitexx)
- **SamAlex001** - [@SamAlex001](https://github.com/SamAlex001)
- **THEKIRA001** - [@THEKIRA001](https://github.com/THEKIRA001)

---

**Built with ❤️ using Next.js, MediaPipe, Web Audio API, and Google Gemini AI.**
