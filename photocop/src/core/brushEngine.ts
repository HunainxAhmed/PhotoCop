/**
 * PhotoCop - Brush Engine
 *
 * Implements pressure-aware brush rendering, hardness, spacing,
 * flow-based accumulation, and eraser mode.
 * Designed to run on a Worker thread in Phase 2+.
 */

import type { BrushSettings, Color, Point } from './types';

// ─── Brush Stamp Cache ────────────────────────────────────────────────────────

const stampCache = new Map<string, ImageData>();

function getBrushStampKey(settings: BrushSettings): string {
  return `${settings.size}_${settings.hardness}_${settings.roundness}_${settings.angle}`;
}

/** Generate circular brush stamp ImageData */
function generateBrushStamp(settings: BrushSettings): ImageData {
  const key = getBrushStampKey(settings);
  if (stampCache.has(key)) return stampCache.get(key)!;

  const size = Math.max(1, Math.ceil(settings.size));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  // Create radial gradient for hardness
  const hardRatio = settings.hardness / 100;
  const innerR = r * hardRatio;
  const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, r);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((settings.angle * Math.PI) / 180);
  ctx.scale(1, settings.roundness / 100);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const stamp = ctx.getImageData(0, 0, size, size);
  if (stampCache.size > 50) {
    // Evict oldest
    const firstKey = stampCache.keys().next().value;
    if (firstKey) stampCache.delete(firstKey);
  }
  stampCache.set(key, stamp);
  return stamp;
}

// ─── Stroke Painter ───────────────────────────────────────────────────────────

export interface PaintStrokeOptions {
  imageData: ImageData;
  points: Point[];
  settings: BrushSettings;
  color: Color;
  eraseMode: boolean;
}

/**
 * Paint a stroke onto imageData in-place.
 * Uses spaced stamp placement along the stroke path.
 */
export function paintStroke(opts: PaintStrokeOptions): void {
  const { imageData, points, settings, color, eraseMode } = opts;
  if (points.length === 0) return;

  const stamp = generateBrushStamp(settings);
  const stampSize = settings.size;
  const spacing = Math.max(0.5, (settings.spacing / 100) * stampSize);
  const flowAlpha = (settings.flow / 100) * (settings.opacity / 100);

  // Walk along the path and place stamps
  let distAccum = 0;
  let prev = points[0];

  const placeStamp = (p: Point) => {
    const x = Math.round(p.x - stampSize / 2);
    const y = Math.round(p.y - stampSize / 2);
    applyStamp(imageData, stamp, x, y, color, flowAlpha, eraseMode);
  };

  placeStamp(prev);

  for (let i = 1; i < points.length; i++) {
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) continue;

    distAccum += dist;
    let stepsLeft = distAccum / spacing;
    distAccum = distAccum % spacing;

    const nx = dx / dist;
    const ny = dy / dist;
    let t = spacing - (distAccum + spacing - (stepsLeft * spacing)) / stepsLeft;

    for (let s = 0; s < stepsLeft; s++) {
      const px = prev.x + nx * (s * spacing);
      const py = prev.y + ny * (s * spacing);
      placeStamp({ x: px, y: py });
    }

    prev = curr;
  }
}

function applyStamp(
  dest: ImageData,
  stamp: ImageData,
  x: number, y: number,
  color: Color,
  alpha: number,
  eraseMode: boolean
): void {
  const dw = dest.width, dh = dest.height;
  const sw = stamp.width, sh = stamp.height;
  const dd = dest.data, sd = stamp.data;

  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      const dx = x + sx;
      const dy = y + sy;
      if (dx < 0 || dy < 0 || dx >= dw || dy >= dh) continue;

      const si = (sy * sw + sx) * 4;
      const di = (dy * dw + dx) * 4;
      const stampAlpha = sd[si + 3] / 255; // stamp is grayscale intensity

      if (eraseMode) {
        dd[di + 3] = Math.max(0, dd[di + 3] - stampAlpha * alpha * 255);
      } else {
        // Alpha-blend brush color onto layer
        const brushAlpha = stampAlpha * alpha;
        const baseAlpha = dd[di + 3] / 255;
        const outAlpha = brushAlpha + baseAlpha * (1 - brushAlpha);
        if (outAlpha === 0) continue;

        dd[di]     = Math.round((color.r * brushAlpha + dd[di]     * baseAlpha * (1 - brushAlpha)) / outAlpha);
        dd[di + 1] = Math.round((color.g * brushAlpha + dd[di + 1] * baseAlpha * (1 - brushAlpha)) / outAlpha);
        dd[di + 2] = Math.round((color.b * brushAlpha + dd[di + 2] * baseAlpha * (1 - brushAlpha)) / outAlpha);
        dd[di + 3] = Math.round(outAlpha * 255);
      }
    }
  }
}

// ─── Fill Tool ────────────────────────────────────────────────────────────────

/**
 * Flood-fill at (x, y) on imageData with color.
 * Uses iterative BFS to avoid stack overflow on large images.
 */
export function floodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  fillColor: Color,
  tolerance = 32
): void {
  const { width, height, data } = imageData;
  const startIdx = (startY * width + startX) * 4;
  const targetR = data[startIdx];
  const targetG = data[startIdx + 1];
  const targetB = data[startIdx + 2];
  const targetA = data[startIdx + 3];

  // Quick bail if same color
  if (
    Math.abs(targetR - fillColor.r) <= tolerance &&
    Math.abs(targetG - fillColor.g) <= tolerance &&
    Math.abs(targetB - fillColor.b) <= tolerance &&
    Math.abs(targetA - fillColor.a) <= tolerance
  ) return;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [startX + startY * width];
  visited[startX + startY * width] = 1;

  const matches = (px: number): boolean => {
    const i = px * 4;
    return (
      Math.abs(data[i]     - targetR) <= tolerance &&
      Math.abs(data[i + 1] - targetG) <= tolerance &&
      Math.abs(data[i + 2] - targetB) <= tolerance &&
      Math.abs(data[i + 3] - targetA) <= tolerance
    );
  };

  const paint = (px: number): void => {
    const i = px * 4;
    data[i]     = fillColor.r;
    data[i + 1] = fillColor.g;
    data[i + 2] = fillColor.b;
    data[i + 3] = fillColor.a;
  };

  while (stack.length > 0) {
    const px = stack.pop()!;
    paint(px);

    const x = px % width;
    const y = Math.floor(px / width);

    const neighbors = [
      x > 0         ? px - 1     : -1,
      x < width - 1 ? px + 1     : -1,
      y > 0         ? px - width  : -1,
      y < height - 1? px + width  : -1,
    ];

    for (const n of neighbors) {
      if (n >= 0 && !visited[n] && matches(n)) {
        visited[n] = 1;
        stack.push(n);
      }
    }
  }
}

// ─── Clone Stamp ─────────────────────────────────────────────────────────────

export function cloneStamp(
  sourceImageData: ImageData,
  destImageData: ImageData,
  sourceOffset: Point,
  destPoint: Point,
  settings: BrushSettings
): void {
  const size = Math.ceil(settings.size);
  const r = size / 2;
  const alpha = (settings.opacity / 100) * (settings.flow / 100);

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r) continue;

      const brushAlpha = settings.hardness >= 100
        ? alpha
        : alpha * Math.max(0, 1 - (dist / r - settings.hardness / 100) * (100 / (100 - settings.hardness + 1)));

      const sx = Math.round(sourceOffset.x + dx);
      const sy = Math.round(sourceOffset.y + dy);
      const px = Math.round(destPoint.x + dx);
      const py = Math.round(destPoint.y + dy);

      if (
        sx < 0 || sy < 0 || sx >= sourceImageData.width || sy >= sourceImageData.height ||
        px < 0 || py < 0 || px >= destImageData.width  || py >= destImageData.height
      ) continue;

      const si = (sy * sourceImageData.width + sx) * 4;
      const di = (py * destImageData.width + px) * 4;
      const sd = sourceImageData.data, dd = destImageData.data;

      dd[di]     = Math.round(dd[di]     * (1 - brushAlpha) + sd[si]     * brushAlpha);
      dd[di + 1] = Math.round(dd[di + 1] * (1 - brushAlpha) + sd[si + 1] * brushAlpha);
      dd[di + 2] = Math.round(dd[di + 2] * (1 - brushAlpha) + sd[si + 2] * brushAlpha);
      dd[di + 3] = Math.round(dd[di + 3] * (1 - brushAlpha) + sd[si + 3] * brushAlpha);
    }
  }
}
