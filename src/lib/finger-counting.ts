import type { Landmark, Category } from '@mediapipe/tasks-vision';

/**
 * Robust, scale-invariant 3D finger-count detector.
 * Fixes false positives (e.g. 2 fingers detected as 3) caused by incorrect thumb landmark 
 * indices and lack of 3D distance normalization.
 */

function dist3D(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Checks if joint (a -> b -> c) forms a straight line (extended joint)
 */
function isJointStraight(a: Landmark, b: Landmark, c: Landmark, cosThreshold = -0.85): boolean {
  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const uz = (a.z || 0) - (b.z || 0);

  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const vz = (c.z || 0) - (b.z || 0);

  const dot = ux * vx + uy * vy + uz * vz;
  const denom = Math.sqrt((ux * ux + uy * uy + uz * uz) * (vx * vx + vy * vy + vz * vz));
  if (denom === 0) return false;
  return dot / denom < cosThreshold;
}

/**
 * Main finger counting logic for MediaPipe 21 Hand Landmarks:
 * 0: Wrist
 * 1-4: Thumb (1: CMC, 2: MCP, 3: IP, 4: TIP)
 * 5-8: Index (5: MCP, 6: PIP, 7: DIP, 8: TIP)
 * 9-12: Middle (9: MCP, 10: PIP, 11: DIP, 12: TIP)
 * 13-16: Ring (13: MCP, 14: PIP, 15: DIP, 16: TIP)
 * 17-20: Pinky (17: MCP, 18: PIP, 19: DIP, 20: TIP)
 */
export function countFingers(landmarks: Landmark[][], _handedness?: Category[]): number {
  if (!landmarks || landmarks.length === 0) return 0;

  let totalCount = 0;

  for (let h = 0; h < landmarks.length; h++) {
    const hand = landmarks[h];
    if (!hand || hand.length < 21) continue;

    const wrist = hand[0];
    const indexMCP = hand[5];
    const middleMCP = hand[9];

    // Reference Palm Scale: Distance between Wrist (0) and Middle Finger MCP (9)
    const palmScale = dist3D(wrist, middleMCP);
    if (palmScale === 0) continue;

    let handFingers = 0;

    // 1. Check 4 Main Fingers (Index, Middle, Ring, Pinky)
    const fingersData = [
      { mcp: 5, pip: 6, dip: 7, tip: 8 },   // Index
      { mcp: 9, pip: 10, dip: 11, tip: 12 }, // Middle
      { mcp: 13, pip: 14, dip: 15, tip: 16 },// Ring
      { mcp: 17, pip: 18, dip: 19, tip: 20 },// Pinky
    ];

    for (const f of fingersData) {
      const mcpNode = hand[f.mcp];
      const pipNode = hand[f.pip];
      const tipNode = hand[f.tip];

      const distTipToWrist = dist3D(wrist, tipNode);
      const distPipToWrist = dist3D(wrist, pipNode);
      const distTipToMCP = dist3D(mcpNode, tipNode);

      // A finger is extended if:
      // 1. Tip is further from wrist than PIP joint (distTipToWrist > 1.12 * distPipToWrist)
      // 2. Tip to MCP distance is larger than half palm scale (> 0.5 * palmScale)
      // 3. The PIP joint angle is relatively straight
      const isTipExtended = distTipToWrist > 1.12 * distPipToWrist;
      const isLengthExtended = distTipToMCP > 0.52 * palmScale;
      const isAngleStraight = isJointStraight(mcpNode, pipNode, tipNode, -0.82);

      if ((isTipExtended && isLengthExtended) || (isTipExtended && isAngleStraight)) {
        handFingers++;
      }
    }

    // 2. Check Thumb (Landmarks 1: CMC, 2: MCP, 3: IP, 4: TIP)
    const thumbMCP = hand[2];
    const thumbIP = hand[3];
    const thumbTip = hand[4];

    const thumbDistToWrist = dist3D(wrist, thumbTip);
    const thumbDistToIndexMCP = dist3D(indexMCP, thumbTip);
    const thumbDistToMiddleMCP = dist3D(middleMCP, thumbTip);

    // Thumb is extended away from palm if:
    // - Distance from Thumb TIP (4) to Wrist (0) is at least 0.85x Palm Scale
    // - AND Distance from Thumb TIP (4) to Index MCP (5) is at least 0.45x Palm Scale
    // - AND Distance from Thumb TIP (4) to Middle MCP (9) is at least 0.55x Palm Scale
    const isThumbOutward = thumbDistToIndexMCP > 0.45 * palmScale && thumbDistToMiddleMCP > 0.55 * palmScale;
    const isThumbLength = thumbDistToWrist > 0.85 * palmScale;
    const isThumbStraight = isJointStraight(thumbMCP, thumbIP, thumbTip, -0.80);

    if (isThumbOutward && isThumbLength && isThumbStraight) {
      handFingers++;
    }

    totalCount += handFingers;
  }

  return totalCount;
}
