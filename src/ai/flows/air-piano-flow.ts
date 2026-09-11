/**
 * MotionArcade — touchless AR arcade gaming platform
 * Copyright (C) 2025-2026 Kartik Hawelikar, Sam Alex, Shubham Bolave, and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

/**
 * Initializes the HandLandmarker from MediaPipe.
 * This flow is used in the debug page to verify that the hand tracking model
 * can be loaded and initialized correctly.
 */
export async function initializeHandTracking(): Promise<{ status: string; message: string }> {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    const modelPath = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

    let handLandmarker: HandLandmarker;
    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });
    } catch (gpuError) {
      console.warn('[Air Piano Flow] GPU delegate failed, falling back to CPU:', gpuError);
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });
    }

    if (!handLandmarker) {
      throw new Error('Failed to create HandLandmarker instance.');
    }

    handLandmarker.close();

    return {
      status: 'Success',
      message: 'HandLandmarker initialized successfully.',
    };

  } catch (error: any) {
    console.error('[Air Piano Flow] Error initializing hand tracking:', error);
    throw new Error(
      `Failed to initialize MediaPipe HandLandmarker: ${error.message || 'Unknown error'}`
    );
  }
}
