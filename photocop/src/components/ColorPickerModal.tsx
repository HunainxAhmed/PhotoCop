/**
 * PhotoCop - Professional Color Picker Dialog
 *
 * Full-featured color picker matching professional desktop editor UX:
 * - 2D Saturation / Value gradient picker
 * - 1D Hue spectrum bar
 * - Alpha / Opacity slider
 * - Precise RGB numeric inputs and sliders
 * - Hex code input with live synchronization
 * - Palette of quick swatches
 * - Live Current vs New color comparison
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import type { Color } from '../core/types';

interface ColorPickerModalProps {
  title: string;
  initialColor: Color;
  isOpen: boolean;
  onClose: () => void;
  onApply: (color: Color) => void;
}

// ─── Math & Conversions ───────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, v));
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(clamp(n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return { r, g, b };
  } else if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return { r, g, b };
  }
  return null;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }

  return { h, s, v };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0, g1 = 0, b1 = 0;

  if (h >= 0 && h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h >= 60 && h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h >= 120 && h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h >= 180 && h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h >= 240 && h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

// ─── Preset Swatches ──────────────────────────────────────────────────────────

const PRESET_SWATCHES = [
  '#000000', '#ffffff', '#737373', '#a3a3a3',
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#22c55e', '#10b981', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#d946ef', '#ec4899',
];

// ─── Component ────────────────────────────────────────────────────────────────

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  title,
  initialColor,
  isOpen,
  onClose,
  onApply,
}) => {
  const [currentColor, setCurrentColor] = useState<Color>(initialColor);
  const [hexInput, setHexInput] = useState(() => rgbToHex(initialColor.r, initialColor.g, initialColor.b));
  const [hsv, setHsv] = useState(() => rgbToHsv(initialColor.r, initialColor.g, initialColor.b));

  const satValRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const isDraggingSatVal = useRef(false);
  const isDraggingHue = useRef(false);

  const hsvRef = useRef(hsv);
  const currentColorRef = useRef(currentColor);

  useEffect(() => {
    hsvRef.current = hsv;
    currentColorRef.current = currentColor;
  }, [hsv, currentColor]);

  // Update RGB when HSV changes
  const updateFromHsv = useCallback((newHsv: { h: number; s: number; v: number }) => {
    setHsv(newHsv);
    const rgb = hsvToRgb(newHsv.h, newHsv.s, newHsv.v);
    const updated = { ...currentColorRef.current, ...rgb };
    setCurrentColor(updated);
    setHexInput(rgbToHex(rgb.r, rgb.g, rgb.b));
  }, []);

  const updateFromRgb = (rgb: { r: number; g: number; b: number }) => {
    const updated = { ...currentColor, ...rgb };
    setCurrentColor(updated);
    setHexInput(rgbToHex(rgb.r, rgb.g, rgb.b));
    setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
  };

  const handleHexChange = (val: string) => {
    setHexInput(val);
    const rgb = hexToRgb(val);
    if (rgb) {
      setCurrentColor(prev => ({ ...prev, ...rgb }));
      setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
    }
  };

  // 2D Saturation / Value picker interaction
  const handleSatValPointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const el = satValRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const s = x / rect.width;
    const v = 1 - y / rect.height;
    updateFromHsv({ ...hsvRef.current, s, v });
  }, [updateFromHsv]);

  // Hue slider interaction
  const handleHuePointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const h = (y / rect.height) * 360;
    updateFromHsv({ ...hsvRef.current, h: Math.min(359.9, h) });
  }, [updateFromHsv]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (isDraggingSatVal.current) handleSatValPointer(e);
      if (isDraggingHue.current) handleHuePointer(e);
    };
    const handlePointerUp = () => {
      isDraggingSatVal.current = false;
      isDraggingHue.current = false;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handleSatValPointer, handleHuePointer]);

  if (!isOpen) return null;

  // Pure hue color for 2D background
  const pureHueRgb = hsvToRgb(hsv.h, 1, 1);
  const pureHueBg = `rgb(${pureHueRgb.r}, ${pureHueRgb.g}, ${pureHueRgb.b})`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs select-none"
      onClick={onClose}
      onKeyDown={e => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter') {
          onApply(currentColor);
          onClose();
        }
      }}
    >
      <div
        className="bg-neutral-850 border border-neutral-700 rounded-lg shadow-2xl p-4 w-[420px] text-neutral-200 flex flex-col gap-3.5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-neutral-750">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
            {title}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visual Pickers (Saturation/Value box + Hue vertical bar) */}
        <div className="flex gap-3 h-48">
          {/* Saturation / Value 2D Box */}
          <div
            ref={satValRef}
            className="relative flex-1 rounded cursor-crosshair overflow-hidden border border-neutral-700"
            style={{ backgroundColor: pureHueBg }}
            onPointerDown={e => {
              isDraggingSatVal.current = true;
              handleSatValPointer(e);
            }}
          >
            {/* White horizontal gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
            {/* Black vertical gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
            {/* Cursor */}
            <div
              className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow shadow-black -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
              }}
            />
          </div>

          {/* Hue Spectrum Bar */}
          <div
            ref={hueRef}
            className="relative w-8 rounded cursor-pointer overflow-hidden border border-neutral-700"
            style={{
              background:
                'linear-gradient(to bottom, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
            }}
            onPointerDown={e => {
              isDraggingHue.current = true;
              handleHuePointer(e);
            }}
          >
            {/* Cursor indicator */}
            <div
              className="absolute left-0 right-0 h-1.5 border-y-2 border-white bg-black/40 -translate-y-1/2 pointer-events-none shadow"
              style={{ top: `${(hsv.h / 360) * 100}%` }}
            />
          </div>

          {/* Current vs New preview swatch */}
          <div className="w-14 flex flex-col rounded border border-neutral-700 overflow-hidden shrink-0">
            <div
              className="flex-1"
              style={{
                backgroundColor: `rgba(${currentColor.r}, ${currentColor.g}, ${currentColor.b}, ${currentColor.a / 255})`,
              }}
              title="New Color"
            />
            <div
              className="h-10 border-t border-neutral-700"
              style={{
                backgroundColor: `rgba(${initialColor.r}, ${initialColor.g}, ${initialColor.b}, ${initialColor.a / 255})`,
              }}
              title="Current Color"
            />
          </div>
        </div>

        {/* Opacity / Alpha Slider */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-400 w-12 shrink-0">Opacity:</span>
          <input
            type="range"
            min={0}
            max={255}
            value={currentColor.a}
            onChange={e => setCurrentColor(prev => ({ ...prev, a: Number(e.target.value) }))}
            className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
          />
          <span className="text-[11px] text-neutral-300 w-10 text-right">
            {Math.round((currentColor.a / 255) * 100)}%
          </span>
        </div>

        {/* RGB Sliders & Hex code */}
        <div className="grid grid-cols-2 gap-3 p-2.5 rounded bg-neutral-800 border border-neutral-750 text-xs">
          {/* RGB */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-red-400 font-semibold text-[11px]">R:</span>
              <input
                type="number"
                min={0}
                max={255}
                value={currentColor.r}
                onChange={e => updateFromRgb({ r: clamp(Number(e.target.value)), g: currentColor.g, b: currentColor.b })}
                className="w-14 bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-right font-mono text-xs"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-green-400 font-semibold text-[11px]">G:</span>
              <input
                type="number"
                min={0}
                max={255}
                value={currentColor.g}
                onChange={e => updateFromRgb({ r: currentColor.r, g: clamp(Number(e.target.value)), b: currentColor.b })}
                className="w-14 bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-right font-mono text-xs"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-blue-400 font-semibold text-[11px]">B:</span>
              <input
                type="number"
                min={0}
                max={255}
                value={currentColor.b}
                onChange={e => updateFromRgb({ r: currentColor.r, g: currentColor.g, b: clamp(Number(e.target.value)) })}
                className="w-14 bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-right font-mono text-xs"
              />
            </div>
          </div>

          {/* Hex & Swatches */}
          <div className="flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 text-[11px]">Hex:</span>
              <input
                type="text"
                value={hexInput}
                onChange={e => handleHexChange(e.target.value)}
                maxLength={7}
                className="w-20 bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-center font-mono text-xs uppercase"
              />
            </div>

            {/* Quick swatches */}
            <div className="grid grid-cols-8 gap-1 pt-1.5">
              {PRESET_SWATCHES.map(hex => (
                <button
                  key={hex}
                  type="button"
                  style={{ backgroundColor: hex }}
                  onClick={() => handleHexChange(hex)}
                  className="w-4 h-4 rounded-xs border border-neutral-600 hover:scale-115 transition-transform"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-750">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-neutral-300 hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(currentColor);
              onClose();
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow shadow-blue-600/30 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
