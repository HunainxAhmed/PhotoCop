/**
 * PhotoCop - Compositor
 *
 * Renders the document layer stack onto a canvas.
 * Uses OffscreenCanvas and per-channel blend math.
 * Runs on the main thread for Phase 1 but architected so heavy
 * operations can be moved to a Worker without API changes.
 */

import type { Document, Layer, BlendMode, Color } from './types';
import { getFlatLayerOrder } from './document';

// ─── Blend Functions ──────────────────────────────────────────────────────────

type BlendFn = (base: number, blend: number) => number;

const clamp = (v: number) => Math.max(0, Math.min(255, v));

const BLEND_MODES: Record<BlendMode, BlendFn> = {
  Normal: (_b, blend) => blend,
  Dissolve: (_b, blend) => blend, // handled by opacity randomization
  Darken: (b, s) => Math.min(b, s),
  Multiply: (b, s) => (b * s) / 255,
  ColorBurn: (b, s) => s === 0 ? 0 : clamp(255 - ((255 - b) * 255) / s),
  LinearBurn: (b, s) => clamp(b + s - 255),
  Lighten: (b, s) => Math.max(b, s),
  Screen: (b, s) => 255 - ((255 - b) * (255 - s)) / 255,
  ColorDodge: (b, s) => s === 255 ? 255 : clamp((b * 255) / (255 - s)),
  LinearDodge: (b, s) => clamp(b + s),
  Overlay: (b, s) => b < 128
    ? (2 * b * s) / 255
    : 255 - (2 * (255 - b) * (255 - s)) / 255,
  SoftLight: (b, s) => {
    const bn = b / 255, sn = s / 255;
    let result: number;
    if (sn <= 0.5) {
      result = bn - (1 - 2 * sn) * bn * (1 - bn);
    } else {
      const d = bn <= 0.25
        ? ((16 * bn - 12) * bn + 4) * bn
        : Math.sqrt(bn);
      result = bn + (2 * sn - 1) * (d - bn);
    }
    return clamp(result * 255);
  },
  HardLight: (b, s) => BLEND_MODES.Overlay(s, b),
  VividLight: (b, s) => s < 128
    ? BLEND_MODES.ColorBurn(b, s * 2)
    : BLEND_MODES.ColorDodge(b, (s - 128) * 2),
  LinearLight: (b, s) => clamp(b + 2 * s - 255),
  PinLight: (b, s) => s < 128
    ? Math.min(b, 2 * s)
    : Math.max(b, 2 * s - 255),
  Difference: (b, s) => Math.abs(b - s),
  Exclusion: (b, s) => b + s - (2 * b * s) / 255,
  Subtract: (b, s) => clamp(b - s),
  Divide: (b, s) => s === 0 ? 255 : clamp((b * 255) / s),
  // Non-separable modes — operate on RGB triplets, approximated per-channel here:
  Hue: (b, _s) => b,         // proper impl needs HSL conversion
  Saturation: (b, _s) => b,  // simplified — full impl in Phase 2
  Color: (b, _s) => b,
  Luminosity: (b, _s) => b,
};

// ─── Adjustment Processors ────────────────────────────────────────────────────

function applyCurvesLUT(
  data: Uint8ClampedArray,
  channel: 'r' | 'g' | 'b',
  lut: Uint8Array
) {
  const ci = channel === 'r' ? 0 : channel === 'g' ? 1 : 2;
  for (let i = ci; i < data.length; i += 4) {
    data[i] = lut[data[i]];
  }
}

/** Build 256-entry LUT from control points using linear interpolation */
export function buildCurveLUT(
  points: { input: number; output: number }[]
): Uint8Array {
  const lut = new Uint8Array(256);
  const sorted = [...points].sort((a, b) => a.input - b.input);

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    // Find surrounding control points
    let lo = sorted[0], hi = sorted[sorted.length - 1];
    for (let j = 0; j < sorted.length - 1; j++) {
      if (sorted[j].input <= t && sorted[j + 1].input >= t) {
        lo = sorted[j]; hi = sorted[j + 1];
        break;
      }
    }
    const range = hi.input - lo.input;
    const out = range === 0
      ? lo.output
      : lo.output + (hi.output - lo.output) * ((t - lo.input) / range);
    lut[i] = clamp(Math.round(out * 255));
  }
  return lut;
}

function processAdjustmentLayer(
  imageData: ImageData,
  layer: Layer
): ImageData {
  if (!layer.adjustment) return imageData;

  const data = new Uint8ClampedArray(imageData.data);
  const adj = layer.adjustment;

  switch (adj.type) {
    case 'brightnessContrast': {
      const { brightness, contrast } = adj.data;
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      for (let i = 0; i < data.length; i += 4) {
        data[i]     = clamp(factor * (data[i]     + brightness - 128) + 128);
        data[i + 1] = clamp(factor * (data[i + 1] + brightness - 128) + 128);
        data[i + 2] = clamp(factor * (data[i + 2] + brightness - 128) + 128);
      }
      break;
    }

    case 'hueSaturation': {
      const { hue, saturation, lightness } = adj.data;
      for (let i = 0; i < data.length; i += 4) {
        const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
        const nh = (h + hue / 360 + 1) % 1;
        const ns = Math.max(0, Math.min(1, s + saturation / 100));
        const nl = Math.max(0, Math.min(1, l + lightness / 100));
        const [r, g, b] = hslToRgb(nh, ns, nl);
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
      break;
    }

    case 'levels': {
      const { inputMin, inputMax, gamma, outputMin, outputMax } = adj.data;
      const scale = inputMax - inputMin;
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          let v = (data[i + c] - inputMin) / scale;
          v = Math.max(0, Math.min(1, v));
          if (gamma !== 1) v = Math.pow(v, 1 / gamma);
          data[i + c] = clamp(outputMin + v * (outputMax - outputMin));
        }
      }
      break;
    }

    case 'curves': {
      const { rgb, r, g, b } = adj.data;
      if (rgb.length > 0) {
        const lut = buildCurveLUT(rgb);
        for (let i = 0; i < data.length; i += 4) {
          data[i]     = lut[data[i]];
          data[i + 1] = lut[data[i + 1]];
          data[i + 2] = lut[data[i + 2]];
        }
      }
      if (r.length > 0) applyCurvesLUT(data, 'r', buildCurveLUT(r));
      if (g.length > 0) applyCurvesLUT(data, 'g', buildCurveLUT(g));
      if (b.length > 0) applyCurvesLUT(data, 'b', buildCurveLUT(b));
      break;
    }

    case 'invert': {
      for (let i = 0; i < data.length; i += 4) {
        data[i]     = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
      break;
    }

    case 'threshold': {
      const { value } = adj.data;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const out = lum >= value ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = out;
      }
      break;
    }

    case 'posterize': {
      const { levels } = adj.data;
      const step = 255 / (levels - 1);
      for (let i = 0; i < data.length; i += 4) {
        data[i]     = clamp(Math.round(data[i]     / step) * step);
        data[i + 1] = clamp(Math.round(data[i + 1] / step) * step);
        data[i + 2] = clamp(Math.round(data[i + 2] / step) * step);
      }
      break;
    }
  }

  return new ImageData(data, imageData.width, imageData.height);
}

// ─── Color Helpers ─────────────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

// ─── Main Compositor ──────────────────────────────────────────────────────────

export interface CompositorOptions {
  width: number;
  height: number;
}

/**
 * Composite all visible layers onto `targetCtx`.
 * Renders bottom-up (last item in layerOrder = bottom).
 */
export function compositeDocument(
  doc: Document,
  targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
): void {
  const { width, height } = doc;
  targetCtx.clearRect(0, 0, width, height);

  // Process layers bottom-first (reverse of layerOrder)
  const orderedLayers = getFlatLayerOrder(doc);
  const bottomFirst = [...orderedLayers].reverse();

  for (const layer of bottomFirst) {
    if (!layer.visible) continue;
    if (layer.type === 'group') continue; // groups just provide ordering

    renderLayer(doc, layer, targetCtx, width, height);
  }
}

function renderLayer(
  doc: Document,
  layer: Layer,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  docWidth: number,
  docHeight: number
): void {
  const opacity = layer.opacity / 100;

  // Handle adjustment layers
  if (layer.type === 'adjustment') {
    // Get current composite state
    const currentData = ctx.getImageData(0, 0, docWidth, docHeight);
    const adjusted = processAdjustmentLayer(currentData, layer);
    ctx.putImageData(adjusted, 0, 0);
    return;
  }

  // Handle fill layers
  if (layer.type === 'fill' && layer.fillColor) {
    const fc = layer.fillColor;
    ctx.save();
    ctx.globalAlpha = opacity * (fc.a / 255);
    ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode);
    ctx.fillStyle = `rgb(${fc.r},${fc.g},${fc.b})`;
    ctx.fillRect(0, 0, docWidth, docHeight);
    ctx.restore();
    return;
  }

  // Handle pixel layers
  if (layer.type === 'pixel' && layer.imageData) {
    const { imageData, transform, mask } = layer;

    // Create offscreen for this layer with transform
    const offscreen = document.createElement('canvas');
    offscreen.width = docWidth;
    offscreen.height = docHeight;
    const offCtx = offscreen.getContext('2d')!;

    offCtx.save();
    offCtx.translate(transform.x + imageData.width / 2, transform.y + imageData.height / 2);
    offCtx.rotate((transform.rotation * Math.PI) / 180);
    offCtx.scale(transform.scaleX, transform.scaleY);
    offCtx.translate(-imageData.width / 2, -imageData.height / 2);
    offCtx.putImageData(imageData, 0, 0);
    offCtx.restore();

    // Apply mask if present
    if (mask && mask.enabled && mask.imageData) {
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = docWidth;
      maskCanvas.height = docHeight;
      const maskCtx = maskCanvas.getContext('2d')!;

      const maskImageData = new ImageData(docWidth, docHeight);
      const src = mask.imageData.data;
      const dst = maskImageData.data;
      for (let i = 0; i < dst.length; i += 4) {
        const mi = Math.floor(i / 4);
        const maskSrcIdx = mi < src.length / 4 ? mi * 4 : 0;
        const v = mask.inverted ? 255 - src[maskSrcIdx] : src[maskSrcIdx];
        dst[i] = dst[i + 1] = dst[i + 2] = 255;
        dst[i + 3] = v;
      }
      maskCtx.putImageData(maskImageData, 0, 0);

      offCtx.globalCompositeOperation = 'destination-in';
      offCtx.drawImage(maskCanvas, 0, 0);
    }

    // Composite onto main canvas
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode);
    ctx.drawImage(offscreen, 0, 0);
    ctx.restore();
  }

  // Handle text layers
  if (layer.type === 'text' && layer.textData) {
    const { textData, transform } = layer;
    const { style, content } = textData;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px "${style.fontFamily}", sans-serif`;
    ctx.fillStyle = `rgba(${style.color.r},${style.color.g},${style.color.b},${style.color.a / 255})`;
    ctx.textAlign = style.textAlign as CanvasTextAlign;
    ctx.translate(transform.x, transform.y);
    ctx.rotate((transform.rotation * Math.PI) / 180);

    // Multi-line text support
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      ctx.fillText(line, 0, style.fontSize + idx * style.lineHeight);
    });
    ctx.restore();
  }
}

// ─── CSS Composite Operation Mapping ─────────────────────────────────────────

function blendModeToComposite(mode: BlendMode): GlobalCompositeOperation {
  const map: Partial<Record<BlendMode, GlobalCompositeOperation>> = {
    Normal: 'source-over',
    Multiply: 'multiply',
    Screen: 'screen',
    Overlay: 'overlay',
    Darken: 'darken',
    Lighten: 'lighten',
    ColorDodge: 'color-dodge',
    ColorBurn: 'color-burn',
    HardLight: 'hard-light',
    SoftLight: 'soft-light',
    Difference: 'difference',
    Exclusion: 'exclusion',
    Hue: 'hue',
    Saturation: 'saturation',
    Color: 'color',
    Luminosity: 'luminosity',
  };
  return map[mode] ?? 'source-over';
}

// ─── Single-Layer Preview ────────────────────────────────────────────────────

/** Generate a thumbnail ImageData for a layer */
export function generateLayerThumbnail(
  layer: Layer,
  maxSize = 64
): ImageData | null {
  if (layer.type === 'pixel' && layer.imageData) {
    const { imageData } = layer;
    const scale = Math.min(maxSize / imageData.width, maxSize / imageData.height, 1);
    const tw = Math.max(1, Math.round(imageData.width * scale));
    const th = Math.max(1, Math.round(imageData.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = tw; canvas.height = th;
    const ctx = canvas.getContext('2d')!;

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = imageData.width;
    srcCanvas.height = imageData.height;
    srcCanvas.getContext('2d')!.putImageData(imageData, 0, 0);

    ctx.drawImage(srcCanvas, 0, 0, tw, th);
    return ctx.getImageData(0, 0, tw, th);
  }
  return null;
}

/** Export the full composite as a data URL */
export function exportToDataURL(
  doc: Document,
  format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.92
): string {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d')!;
  compositeDocument(doc, ctx);
  return canvas.toDataURL(format, quality);
}
