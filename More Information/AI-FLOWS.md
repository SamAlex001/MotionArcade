# AI Flows

> **See also**: [README](README.md) · [Architecture](ARCHITECTURE.md) · [Hand Tracking](HAND-TRACKING.md) · [Games](GAMES.md)

## Setup

**File**: `src/ai/genkit.ts`

```ts
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.5-flash-lite',
});
```

- Uses **Gemini 2.5 Flash Lite** as the default model for all flows.
- The `ai` singleton is imported by every flow file.
- `GEMINI_API_KEY` must be set in `.env`.

**Development entry point**: `src/ai/dev.ts` imports all flow files so the Genkit dev UI can discover them when running `npm run genkit:dev`.

---

## How Flows Work

Each flow is defined with:
1. **Zod input schema** — validates what the caller passes.
2. **Zod output schema** — validates what the model returns (Genkit enforces this).
3. **A prompt** — defines the system instructions and template.
4. **A flow function** — wraps the prompt, exported as a plain async function.

All flow files are marked `'use server'` so they execute as Next.js Server Actions, never exposing the API key to the browser.

---

## Flow Reference

### 1. `generateMathProblem`

**File**: `src/ai/flows/dynamic-math-problem-generation.ts`

**Used by**: Math Challenge game

**Input**:
```ts
{
  difficulty: number;     // 1–10
  currentScore: number;
  pastScores: number[];
}
```

**Output**:
```ts
{
  problem: string;        // human-readable math problem
  solution: number;       // integer 0–10 (answer shown with fingers)
}
```

**Difficulty levels** (enforced in prompt):
| Level | Description |
|-------|-------------|
| 1 | Single-step addition (e.g. "3 + 5") |
| 2 | Single-step subtraction |
| 3 | Mixed addition/subtraction |
| 4 | Single-step multiplication; simple word problems |
| 5 | Simple integer division; all four operations |
| 6 | Two-step problems with parentheses |
| 7 | Two-step with "half of" concepts |
| 8 | Three-step; intermediate values can exceed 10 |
| 9 | Three-step with indirect phrasing ("twice as many") |
| 10 | Complex multi-step word problem (3–4 steps) |

**Key constraint**: The final `solution` MUST be an integer in [0, 10] because players answer by showing fingers.

---

### 2. `generateMathProblem2`

**File**: `src/ai/flows/math-challenge-2-flow.ts`

**Used by**: Math Challenge 2 (bubble-popping) game

**Input**:
```ts
{
  difficulty: number;
  currentScore: number;
}
```

**Output**:
```ts
{
  problem: string;
  options: string[];       // 4–6 answer options as strings
  correctAnswer: string;   // one of the strings in options
}
```

Allows more complex math than Math Challenge 1 (geometry, percentages, algebra) because the player selects from multiple-choice bubbles rather than showing an exact finger count.

---

### 3. `generateQuizQuestion`

**File**: `src/ai/flows/quiz-quest-flow.ts`

**Used by**: Quiz Quest game

**Input**:
```ts
{
  currentScore: number;
  subjects: string[];      // e.g. ["Science", "History", "Custom Topic"]
}
```

**Output**:
```ts
{
  question: string;
  options: [string, string, string, string];   // exactly 4 options
  correctAnswerIndex: number;                  // 0–3
}
```

Questions are generated from the requested subjects. Difficulty scales with `currentScore`. The player answers by showing 1–4 fingers corresponding to option indices.

---

### 4. `generateShapeToDraw`

**File**: `src/ai/flows/shape-challenge-flow.ts`

**Used by**: Sketch & Score game (shape prompt phase)

**Input**:
```ts
{
  pastShapes: string[];    // shapes already shown this session
}
```

**Output**:
```ts
{
  shape: string;           // one of the 7 available shapes
}
```

**Available shapes**: `"circle"`, `"square"`, `"triangle"`, `"star"`, `"heart"`, `"arrow"`, `"house"`

The prompt instructs the model to avoid repeating any shape in `pastShapes`, so the player sees variety during a session.

---

### 5. `evaluatePlayerDrawing`

**File**: `src/ai/flows/shape-challenge-flow.ts`

**Used by**: Sketch & Score game (evaluation phase)

**Input**:
```ts
{
  shapeToDraw: string;         // the shape the player was asked to draw
  drawingDataUri: string;      // PNG data URI of the player's drawing
}
```

**Output**:
```ts
{
  isMatch: boolean;            // does the drawing match the shape?
  feedback: string;            // brief encouraging feedback message
}
```

This flow uses Gemini's **vision capability** — the drawing image is passed as a media attachment using the `{{media url=drawingDataUri}}` template syntax.

The prompt is intentionally lenient: "a square with wobbly lines is still a square." This accommodates the imprecision of drawing with a finger in the air.

---

### 6. `initializeHandTracking`

**File**: `src/ai/flows/air-piano-flow.ts`

**Used by**: Debug page only (health check)

**Input**: none

**Output**:
```ts
{
  status: string;
  message: string;
}
```

A simple ping flow to confirm the AI backend is reachable. Used in `src/app/debug/page.tsx` to test that all flows are working.

---

## Debug Page

`src/app/debug/page.tsx` provides a UI to manually trigger every AI flow:
- Math Challenge (difficulty 3)
- Math Challenge 2 (difficulty 3)
- Quiz Quest (subjects: Science, History)
- Shape Generation (empty past shapes)
- Drawing Evaluation (dummy triangle image as data URI)
- Hand Tracking Init (health check)

Results are displayed inline so developers can verify prompts and model output without playing the actual games.

---

## Prompt Engineering Notes

- **Structured output**: All flows use Zod output schemas. Genkit instructs the model to return JSON matching the schema and validates the response. If the model returns invalid JSON, Genkit retries automatically.
- **Constraint enforcement**: Critical constraints (e.g. "solution must be 0–10") are stated multiple times in the prompt and enforced by the Zod schema's `.min(0).max(10)` validators.
- **Template syntax**: Prompts use `{{{variableName}}}` (triple braces = no HTML escaping) for string values and `{{media url=...}}` for image attachments.
- **Encouragement tone**: Evaluation prompts explicitly ask for "brief, encouraging feedback" to keep the experience positive for players.
