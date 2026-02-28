/**
 * Utilities for mapping MediaPipe hand-landmark coordinates to canvas / screen
 * coordinates, compensating for CSS `object-fit: cover` cropping when the
 * camera stream's aspect ratio differs from the display container's.
 */

export interface VideoCanvasMapping {
  scale: number;
  scaledW: number;
  scaledH: number;
  offsetX: number;
  offsetY: number;
  displayW: number;
  displayH: number;
}

/**
 * Compute how a `<video>` element's content is positioned when rendered with
 * `object-fit: cover`.  Returns the scale factor, the pre-crop dimensions,
 * and the pixel offsets that are hidden by the crop.
 */
export function getVideoCanvasMapping(
  video: HTMLVideoElement,
): VideoCanvasMapping | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const dw = video.clientWidth;
  const dh = video.clientHeight;

  if (!vw || !vh || !dw || !dh) return null;

  const scale = Math.max(dw / vw, dh / vh);
  const scaledW = vw * scale;
  const scaledH = vh * scale;
  const offsetX = (scaledW - dw) / 2;
  const offsetY = (scaledH - dh) / 2;

  return { scale, scaledW, scaledH, offsetX, offsetY, displayW: dw, displayH: dh };
}

/**
 * Convert a normalised landmark position (from MediaPipe, relative to the
 * **full** un-cropped video frame) to pixel coordinates on a canvas that
 * overlays the `<video>` element.
 *
 * @param lx     Normalised x [0, 1] (left → right in the raw frame)
 * @param ly     Normalised y [0, 1] (top → bottom)
 * @param video  The `<video>` element whose stream produced the landmarks
 * @param mirror Flip horizontally to match the CSS `scaleX(-1)` mirror
 *               applied to the video (defaults to `true`)
 */
export function landmarkToCanvas(
  lx: number,
  ly: number,
  video: HTMLVideoElement,
  mirror: boolean = true,
): { x: number; y: number } {
  const mapping = getVideoCanvasMapping(video);

  if (!mapping) {
    // Graceful fallback — identical to the old simple mapping
    const w = video.clientWidth || 1;
    const h = video.clientHeight || 1;
    return { x: mirror ? (1 - lx) * w : lx * w, y: ly * h };
  }

  const { scaledW, scaledH, offsetX, offsetY, displayW } = mapping;

  let x = lx * scaledW - offsetX;
  const y = ly * scaledH - offsetY;

  if (mirror) {
    x = displayW - x;
  }

  return { x, y };
}

/**
 * Convert a normalised landmark position to a normalised "visible-area"
 * coordinate in [0, 1], compensating for `object-fit: cover` cropping.
 *
 * Useful when mapping hand position to a **separate** game canvas that does
 * not directly overlay the video element (e.g. Ping-Pong paddle, Air-Piano
 * lanes).
 */
export function landmarkToNormalized(
  lx: number,
  ly: number,
  video: HTMLVideoElement,
  mirror: boolean = true,
): { nx: number; ny: number } {
  const mapping = getVideoCanvasMapping(video);

  if (!mapping) {
    return { nx: mirror ? 1 - lx : lx, ny: ly };
  }

  const { scaledW, scaledH, offsetX, offsetY, displayW, displayH } = mapping;

  let px = lx * scaledW - offsetX;
  const py = ly * scaledH - offsetY;

  if (mirror) {
    px = displayW - px;
  }

  return { nx: px / displayW, ny: py / displayH };
}

/**
 * Create a reusable mapper function bound to a specific video element.
 * Convenient when you need to transform many landmarks per frame (e.g.
 * drawing an entire hand skeleton).
 */
export function createLandmarkMapper(
  video: HTMLVideoElement,
  mirror: boolean = true,
): (lx: number, ly: number) => { x: number; y: number } {
  const mapping = getVideoCanvasMapping(video);

  if (!mapping) {
    const w = video.clientWidth || 1;
    const h = video.clientHeight || 1;
    return (lx, ly) => ({ x: mirror ? (1 - lx) * w : lx * w, y: ly * h });
  }

  const { scaledW, scaledH, offsetX, offsetY, displayW } = mapping;

  return (lx, ly) => {
    let x = lx * scaledW - offsetX;
    const y = ly * scaledH - offsetY;
    if (mirror) x = displayW - x;
    return { x, y };
  };
}
