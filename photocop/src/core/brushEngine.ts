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
  toolMode?: 'brush' | 'pencil' | 'eraser' | 'blur' | 'sharpen' | 'dodge' | 'burn' | 'sponge';
}

/**
 * Paint a stroke onto imageData in-place.
 * Uses spaced stamp placement along the stroke path.
 */
export function paintStroke(opts: PaintStrokeOptions): void {
  const { imageData, points, settings, color, eraseMode, toolMode = eraseMode ? 'eraser' : 'brush' } = opts;
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
    applyStamp(imageData, stamp, x, y, color, flowAlpha, eraseMode, toolMode, settings);
  };

  placeStamp(prev);

  for (let i = 1; i < points.length; i++) {
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) continue;

    distAccum += dist;
    const stepsLeft = distAccum / spacing;
    distAccum = distAccum % spacing;

    const nx = dx / dist;
    const ny = dy / dist;

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
  eraseMode: boolean,
  toolMode: 'brush' | 'pencil' | 'eraser' | 'blur' | 'sharpen' | 'dodge' | 'burn' | 'sponge' = 'brush',
  settings?: BrushSettings
): void {
  const dw = dest.width, dh = dest.height;
  const sw = stamp.width, sh = stamp.height;
  const dd = dest.data, sd = stamp.data;
  const brushSize = settings?.size ?? 20;

  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      const dx = x + sx;
      const dy = y + sy;
      if (dx < 0 || dy < 0 || dx >= dw || dy >= dh) continue;

      const si = (sy * sw + sx) * 4;
      const di = (dy * dw + dx) * 4;
      const stampAlpha = sd[si + 3] / 255;
      if (stampAlpha <= 0) continue;
      const effectWeight = stampAlpha * alpha;

      if (toolMode === 'eraser' || eraseMode) {
        dd[di + 3] = Math.max(0, dd[di + 3] - effectWeight * 255);
      } else if (toolMode === 'blur') {
        const rad = Math.min(4, Math.max(1, Math.round(brushSize / 8)));
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let ny = Math.max(0, dy - rad); ny <= Math.min(dh - 1, dy + rad); ny++) {
          for (let nx = Math.max(0, dx - rad); nx <= Math.min(dw - 1, dx + rad); nx++) {
            const ni = (ny * dw + nx) * 4;
            rSum += dd[ni];
            gSum += dd[ni + 1];
            bSum += dd[ni + 2];
            count++;
          }
        }
        if (count > 0) {
          const avgR = rSum / count;
          const avgG = gSum / count;
          const avgB = bSum / count;
          dd[di]     = Math.round(dd[di] * (1 - effectWeight) + avgR * effectWeight);
          dd[di + 1] = Math.round(dd[di + 1] * (1 - effectWeight) + avgG * effectWeight);
          dd[di + 2] = Math.round(dd[di + 2] * (1 - effectWeight) + avgB * effectWeight);
        }
      } else if (toolMode === 'sharpen') {
        const rad = Math.min(3, Math.max(1, Math.round(brushSize / 12)));
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let ny = Math.max(0, dy - rad); ny <= Math.min(dh - 1, dy + rad); ny++) {
          for (let nx = Math.max(0, dx - rad); nx <= Math.min(dw - 1, dx + rad); nx++) {
            if (nx === dx && ny === dy) continue;
            const ni = (ny * dw + nx) * 4;
            rSum += dd[ni];
            gSum += dd[ni + 1];
            bSum += dd[ni + 2];
            count++;
          }
        }
        if (count > 0) {
          const avgR = rSum / count;
          const avgG = gSum / count;
          const avgB = bSum / count;
          const sharpR = Math.max(0, Math.min(255, Math.round(dd[di] + (dd[di] - avgR) * 2.2)));
          const sharpG = Math.max(0, Math.min(255, Math.round(dd[di + 1] + (dd[di + 1] - avgG) * 2.2)));
          const sharpB = Math.max(0, Math.min(255, Math.round(dd[di + 2] + (dd[di + 2] - avgB) * 2.2)));
          dd[di]     = Math.round(dd[di] * (1 - effectWeight) + sharpR * effectWeight);
          dd[di + 1] = Math.round(dd[di + 1] * (1 - effectWeight) + sharpG * effectWeight);
          dd[di + 2] = Math.round(dd[di + 2] * (1 - effectWeight) + sharpB * effectWeight);
        }
      } else if (toolMode === 'dodge') {
        // Brighten
        dd[di]     = Math.min(255, Math.round(dd[di] + (255 - dd[di]) * effectWeight * 0.75));
        dd[di + 1] = Math.min(255, Math.round(dd[di + 1] + (255 - dd[di + 1]) * effectWeight * 0.75));
        dd[di + 2] = Math.min(255, Math.round(dd[di + 2] + (255 - dd[di + 2]) * effectWeight * 0.75));
      } else if (toolMode === 'burn') {
        // Darken
        dd[di]     = Math.max(0, Math.round(dd[di] * (1 - effectWeight * 0.75)));
        dd[di + 1] = Math.max(0, Math.round(dd[di + 1] * (1 - effectWeight * 0.75)));
        dd[di + 2] = Math.max(0, Math.round(dd[di + 2] * (1 - effectWeight * 0.75)));
      } else if (toolMode === 'sponge') {
        // Desaturate towards grayscale
        const gray = Math.round(0.299 * dd[di] + 0.587 * dd[di + 1] + 0.114 * dd[di + 2]);
        dd[di]     = Math.round(dd[di] * (1 - effectWeight) + gray * effectWeight);
        dd[di + 1] = Math.round(dd[di + 1] * (1 - effectWeight) + gray * effectWeight);
        dd[di + 2] = Math.round(dd[di + 2] * (1 - effectWeight) + gray * effectWeight);
      } else {
        // Standard paint stroke (brush / pencil)
        const brushAlpha = effectWeight;
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

/**
 * Render a smooth linear gradient between two points
 */
export function renderLinearGradient(
  imageData: ImageData,
  start: Point,
  end: Point,
  startColor: Color,
  endColor: Color,
  bounds?: { x: number; y: number; width: number; height: number } | null
): void {
  const { width, height, data } = imageData;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return;

  const minX = bounds ? Math.max(0, Math.floor(bounds.x)) : 0;
  const minY = bounds ? Math.max(0, Math.floor(bounds.y)) : 0;
  const maxX = bounds ? Math.min(width, Math.ceil(bounds.x + bounds.width)) : width;
  const maxY = bounds ? Math.min(height, Math.ceil(bounds.y + bounds.height)) : height;

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      // Vector projection t = ((p - start) . d) / |d|^2
      const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSq));
      const i = (y * width + x) * 4;

      const r = Math.round(startColor.r + (endColor.r - startColor.r) * t);
      const g = Math.round(startColor.g + (endColor.g - startColor.g) * t);
      const b = Math.round(startColor.b + (endColor.b - startColor.b) * t);
      const a = Math.round(startColor.a + (endColor.a - startColor.a) * t);

      data[i]     = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
}

/**
 * Render geometric shapes (rectangle, ellipse) into ImageData
 */
export function renderShape(
  imageData: ImageData,
  shapeType: 'rectangle' | 'ellipse',
  rect: { x: number; y: number; width: number; height: number },
  fillColor: Color,
  strokeColor?: Color | null,
  strokeWidth = 0
): void {
  const { width, height, data } = imageData;
  const rx = Math.max(0, Math.floor(rect.x));
  const ry = Math.max(0, Math.floor(rect.y));
  const rw = Math.min(width - rx, Math.ceil(rect.width));
  const rh = Math.min(height - ry, Math.ceil(rect.height));
  if (rw <= 0 || rh <= 0) return;

  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const radX = rect.width / 2;
  const radY = rect.height / 2;

  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      let isInside = false;
      let isBorder = false;

      if (shapeType === 'ellipse') {
        const normX = (x - cx) / radX;
        const normY = (y - cy) / radY;
        const distSq = normX * normX + normY * normY;
        if (distSq <= 1.0) {
          isInside = true;
          if (strokeWidth > 0 && strokeColor) {
            const innerDistSq = ((x - cx) / Math.max(1, radX - strokeWidth)) ** 2 + ((y - cy) / Math.max(1, radY - strokeWidth)) ** 2;
            if (innerDistSq >= 1.0) isBorder = true;
          }
        }
      } else {
        // Rectangle
        isInside = true;
        if (strokeWidth > 0 && strokeColor) {
          if (x < rx + strokeWidth || x >= rx + rw - strokeWidth || y < ry + strokeWidth || y >= ry + rh - strokeWidth) {
            isBorder = true;
          }
        }
      }

      if (isInside) {
        const i = (y * width + x) * 4;
        const c = isBorder && strokeColor ? strokeColor : fillColor;
        data[i]     = c.r;
        data[i + 1] = c.g;
        data[i + 2] = c.b;
        data[i + 3] = c.a;
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
