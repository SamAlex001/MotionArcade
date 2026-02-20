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
