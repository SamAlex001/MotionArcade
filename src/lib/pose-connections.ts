/**
 * MediaPipe PoseLandmarker topology (BlazePose GHUM 33-keypoint variant).
 *
 * The full body has 33 landmarks. For a *fast, readable* full-body skeleton
 * we only draw the core body connections — we intentionally drop the dense
 * face-mesh / hand-detail edges (they add ~24 extra lines of clutter for
 * little visual value in a full-body game where the player stands far back).
 *
 * Index map (for reference):
 *   0 nose | 1..6 eyes (L inner/outer, R inner/outer) | 7/8 ears
 *   9/10 mouth L/R | 11/12 shoulders | 13/14 elbows | 15/16 wrists
 *   17/18 pinky | 19/20 index | 21/22 thumb | 23/24 hips
 *   25/26 knees | 27/28 ankles | 29/30 heels | 31/32 foot index
 *
 * A connection is [fromIndex, toIndex].
 */
export type PoseConnection = [number, number];

/** Core body skeleton — torso, both arms, both legs. */
export const POSE_CONNECTIONS: readonly PoseConnection[] = [
  // Face frame (light — ties the head together)
  [0, 1], [1, 2], [2, 3], [3, 7],   // left eye -> ear
  [0, 4], [4, 5], [5, 6], [6, 8],   // right eye -> ear
  [9, 10],                          // mouth

  // Shoulders / torso box
  [11, 12],                         // shoulder to shoulder
  [11, 23],                         // left shoulder -> left hip
  [12, 24],                         // right shoulder -> right hip
  [23, 24],                         // hip to hip

  // Left arm
  [11, 13], [13, 15],               // shoulder -> elbow -> wrist
  [15, 17], [15, 19], [15, 21],     // wrist -> pinky/index/thumb (hand fan)
  [17, 19],                         // pinky -> index (knuckle bar)

  // Right arm
  [12, 14], [14, 16],
  [16, 18], [16, 20], [16, 22],
  [18, 20],

  // Left leg
  [23, 25], [25, 27],               // hip -> knee -> ankle
  [27, 29], [27, 31], [29, 31],     // ankle -> heel/foot + foot bridge

  // Right leg
  [24, 26], [26, 28],
  [28, 30], [28, 32], [30, 32],
];

/** The "key" joints that get a larger orb + harness ring in neon/aura mode. */
export const POSE_KEY_JOINTS: ReadonlySet<number> = new Set([
  0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28,
]);

/**
 * Per-connection accent color (HSL hue), so left/right limbs are visually
 * distinct and the aura mode can tint glow per body part.
 *   torso  -> teal,   left side -> emerald,   right side -> sky,   legs -> violet/rose
 * Returns a hue (0-360).
 */
export function poseConnectionHue(connectionIndex: number): number {
  const i = connectionIndex;
  if (i <= 8) return 195;            // face frame -> sky
  if (i >= 9 && i <= 12) return 190; // torso box -> teal
  if (i >= 13 && i <= 17) return 150;// left arm -> emerald
  if (i >= 18 && i <= 22) return 200;// right arm -> sky
  if (i >= 23 && i <= 27) return 265;// left leg -> violet
  return 330;                        // right leg -> rose
}

/** Total landmarks in the full BlazePose model. */
export const POSE_LANDMARK_COUNT = 33;

// Named indices for readability in the client logic.
export const POSE = {
  NOSE: 0,
  LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
} as const;
