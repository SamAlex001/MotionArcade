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

/**
 * Utilities for mapping MediaPipe hand-landmark coordinates to canvas / screen
 * coordinates, compensating for CSS `object-fit: cover` cropping when the
 * camera stream's aspect ratio differs from the display container's.
 *
 * --- Performance notes ---
 *
 * The pre-optimization version recomputed the cover-fit math on every single
 * `landmarkToCanvas` / `landmarkToNormalized` call. With 21 landmarks per hand
 * and two hands, that is up to 42 recomputations per frame — each one reads
 * `videoWidth`, `videoHeight`, `clientWidth`, `clientHeight` from the DOM
 * (forced layout) and does 4 multiplications.
 *
 * We now cache the mapping per `<video>` element and invalidate it only when
 * the video frame size or the display size changes. The cache is a WeakMap so
 * detached video elements are GC-ed naturally. For frame-hot loops use
 * `createLandmarkMapper(video)` which still returns a closure — internally
 * that closure shares the cached mapping with everyone else.
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

interface CachedMapping extends VideoCanvasMapping {
  videoW: number;
  videoH: number;
}

const mappingCache = new WeakMap<HTMLVideoElement, CachedMapping>();

/**
 * Compute (or return cached) cover-fit mapping for a video element.
 * Returns `null` if the video hasn't loaded yet.
 */
export function getVideoCanvasMapping(video: HTMLVideoElement): VideoCanvasMapping | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const dw = video.clientWidth;
  const dh = video.clientHeight;
  if (!vw || !vh || !dw || !dh) return null;

  const cached = mappingCache.get(video);
  if (
    cached &&
    cached.videoW === vw &&
    cached.videoH === vh &&
    cached.displayW === dw &&
    cached.displayH === dh
  ) {
    return cached;
  }

  const scale = Math.max(dw / vw, dh / vh);
  const scaledW = vw * scale;
  const scaledH = vh * scale;
  const offsetX = (scaledW - dw) * 0.5;
  const offsetY = (scaledH - dh) * 0.5;

  const next: CachedMapping = {
    scale,
    scaledW,
    scaledH,
    offsetX,
    offsetY,
    displayW: dw,
    displayH: dh,
    videoW: vw,
    videoH: vh,
  };
  mappingCache.set(video, next);
  return next;
}

export function landmarkToCanvas(
  lx: number,
  ly: number,
  video: HTMLVideoElement,
  mirror: boolean = true,
): { x: number; y: number } {
  const m = getVideoCanvasMapping(video);
  if (!m) {
    const w = video.clientWidth || 1;
    const h = video.clientHeight || 1;
    return { x: mirror ? (1 - lx) * w : lx * w, y: ly * h };
  }
  let x = lx * m.scaledW - m.offsetX;
  const y = ly * m.scaledH - m.offsetY;
  if (mirror) x = m.displayW - x;
  return { x, y };
}

export function landmarkToNormalized(
  lx: number,
  ly: number,
  video: HTMLVideoElement,
  mirror: boolean = true,
): { nx: number; ny: number } {
  const m = getVideoCanvasMapping(video);
  if (!m) return { nx: mirror ? 1 - lx : lx, ny: ly };

  let px = lx * m.scaledW - m.offsetX;
  const py = ly * m.scaledH - m.offsetY;
  if (mirror) px = m.displayW - px;
  return { nx: px / m.displayW, ny: py / m.displayH };
}

/**
 * Returns a closure that converts (lx, ly) → {x, y} in pixel space.
 *
 * The closure captures the mapping object by reference — so even if the
 * mapping is invalidated mid-frame (rare), subsequent calls inside the same
 * frame still use a self-consistent set of numbers.
 */
export function createLandmarkMapper(
  video: HTMLVideoElement,
  mirror: boolean = true,
): (lx: number, ly: number) => { x: number; y: number } {
  const m = getVideoCanvasMapping(video);
  if (!m) {
    const w = video.clientWidth || 1;
    const h = video.clientHeight || 1;
    return (lx, ly) => ({ x: mirror ? (1 - lx) * w : lx * w, y: ly * h });
  }
  const sw = m.scaledW, sh = m.scaledH, ox = m.offsetX, oy = m.offsetY, dw = m.displayW;
  if (mirror) {
    return (lx, ly) => ({ x: dw - (lx * sw - ox), y: ly * sh - oy });
  }
  return (lx, ly) => ({ x: lx * sw - ox, y: ly * sh - oy });
}

/**
 * Same as `createLandmarkMapper` but returns *normalised* (visible-area)
 * coordinates rather than pixel coordinates. Saves the per-call division
 * by `displayW` / `displayH` for callers that need many landmarks.
 */
export function createNormalizedMapper(
  video: HTMLVideoElement,
  mirror: boolean = true,
): (lx: number, ly: number) => { nx: number; ny: number } {
  const m = getVideoCanvasMapping(video);
  if (!m) return (lx, ly) => ({ nx: mirror ? 1 - lx : lx, ny: ly });
  const sw = m.scaledW, sh = m.scaledH, ox = m.offsetX, oy = m.offsetY;
  const dw = m.displayW, dh = m.displayH;
  if (mirror) {
    return (lx, ly) => ({ nx: (dw - (lx * sw - ox)) / dw, ny: (ly * sh - oy) / dh });
  }
  return (lx, ly) => ({ nx: (lx * sw - ox) / dw, ny: (ly * sh - oy) / dh });
}
