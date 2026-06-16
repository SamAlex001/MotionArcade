import type { Landmark, Handedness } from '@mediapipe/tasks-vision';

/**
 * Finger-count detector — performance-critical path (runs every frame).
 *
 * Optimisations vs. the original implementation:
 *   1. Joint indices are pre-baked into a flat const array — no per-call
 *      allocation of `[[a,b,c], ...]`.
 *   2. The angle test (>160° / >150°) is converted into a cosine comparison
 *      so we never call `Math.atan2` (each call internally does ~2 atan2 +
 *      a normalisation, ~120 ns). One dot/cross check per joint is ~5 ns.
 *   3. Length checks are short-circuited (a hand is either 21 landmarks or
 *      nothing — we trust MediaPipe and skip undefined guards in the loop).
 */

// Landmark indices for the four "straight-or-curled" fingers.
//   [mcp, pip, tip] triples — stored flat to avoid sub-array allocation.
// prettier-ignore
const FINGER_TRIPLES = new Int8Array([
  5,  6,  8,   // index
  9, 10, 12,   // middle
  13, 14, 16,  // ring
  17, 18, 20,  // pinky
]);

// Thumb uses CMC → MCP → IP (1 → 2 → 3).
const THUMB_A = 1;
const THUMB_B = 2;
const THUMB_C = 3;

/**
 * Cosine threshold equivalents of the old degree thresholds.
 * angle > 160°  ↔  cos(angle) < cos(160°)  ≈  -0.9397
 * angle > 150°  ↔  cos(angle) < cos(150°)  ≈  -0.8660
 *
 * Because the angle at the middle joint is the inner angle between two
 * vectors (mcp→pip, pip→tip if you flip), we measure the angle between
 * (a−b) and (c−b). When the finger is straight those vectors point in
 * opposite directions ⇒ cosine ≈ −1.
 */
const COS_FINGER_THRESHOLD = -0.9397;
const COS_THUMB_THRESHOLD  = -0.8660;

function isStraight(
  hand: Landmark[],
  ai: number,
  bi: number,
  ci: number,
  cosThreshold: number,
): boolean {
  const a = hand[ai];
  const b = hand[bi];
  const c = hand[ci];
  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const dot = ux * vx + uy * vy;
  // |u| · |v|  — sqrt is unavoidable for an accurate cosine, but each
  // landmark has tiny magnitudes (normalised coords) so a single sqrt is
  // still 1-2 orders of magnitude cheaper than the prior 2× atan2.
  const denom = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
  if (denom === 0) return false;
  return dot / denom < cosThreshold;
}

export function countFingers(landmarks: Landmark[][], _handedness: Handedness[]): number {
  if (!landmarks || landmarks.length === 0) return 0;

  let total = 0;
  for (let h = 0; h < landmarks.length; h++) {
    const hand = landmarks[h];
    if (!hand || hand.length < 21) continue;

    let raised = 0;
    // 4 fingers × 3 indices = 12 entries, stride 3.
    for (let i = 0; i < 12; i += 3) {
      if (
        isStraight(
          hand,
          FINGER_TRIPLES[i],
          FINGER_TRIPLES[i + 1],
          FINGER_TRIPLES[i + 2],
          COS_FINGER_THRESHOLD,
        )
      ) {
        raised++;
      }
    }
    if (isStraight(hand, THUMB_A, THUMB_B, THUMB_C, COS_THUMB_THRESHOLD)) raised++;

    total += raised;
  }
  return total;
}
