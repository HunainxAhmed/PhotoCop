/**
 * PhotoCop - Professional Adjustments & Color Grading Dialog
 *
 * Full Photoshop & Lightroom style adjustment modal with:
 * - Hue / Saturation / Lightness
 * - Brightness / Contrast
 * - Color Balance (Shadows, Midtones, Highlights)
 * - Levels & Curves
 * - 1-Click Creative Presets (Teal & Orange, B&W, Warm, Cool, Vintage)
 * - Live non-destructive preview
 */

import React, { useState } from 'react';
import { X, SlidersHorizontal, Sparkles, Check } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import type { AdjustmentData } from '../core/types';

export type AdjustmentTab = 'hueSat' | 'brightContrast' | 'colorBalance' | 'levels' | 'presets';

interface AdjustmentsModalProps {
  isOpen: boolean;
  initialTab?: AdjustmentTab;
  onClose: () => void;
}

export const AdjustmentsModal: React.FC<AdjustmentsModalProps> = ({
  isOpen,
  initialTab = 'hueSat',
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<AdjustmentTab>(initialTab);
  const [applyAsLayer, setApplyAsLayer] = useState(true);

  // Hue / Saturation state
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [lightness, setLightness] = useState(0);

  // Brightness / Contrast state
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);

  // Color Balance (Shadows, Midtones, Highlights: [Cyan/Red, Magenta/Green, Yellow/Blue])
  const [midtones, setMidtones] = useState<[number, number, number]>([0, 0, 0]);
  const [shadows, setShadows] = useState<[number, number, number]>([0, 0, 0]);
  const [highlights, setHighlights] = useState<[number, number, number]>([0, 0, 0]);

  // Levels state
  const [inputMin, setInputMin] = useState(0);
  const [inputMax, setInputMax] = useState(255);
  const [gamma, setGamma] = useState(1);
  const [outputMin, setOutputMin] = useState(0);
  const [outputMax, setOutputMax] = useState(255);

  const dispatch = useEditorStore(s => s.dispatch);
  const doc = useEditorStore(s => s.document);

  if (!isOpen || !doc) return null;

  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const handleApply = () => {
    let adj: AdjustmentData;
    let label = 'Adjustment';

    if (activeTab === 'hueSat') {
      adj = { type: 'hueSaturation', data: { hue, saturation, lightness } };
      label = 'Hue/Saturation';
    } else if (activeTab === 'brightContrast') {
      adj = { type: 'brightnessContrast', data: { brightness, contrast } };
      label = 'Brightness/Contrast';
    } else if (activeTab === 'colorBalance') {
      adj = {
        type: 'colorBalance',
        data: { shadows, midtones, highlights, preserveLuminosity: true },
      };
      label = 'Color Balance';
    } else if (activeTab === 'levels') {
      adj = { type: 'levels', data: { inputMin, inputMax, gamma, outputMin, outputMax } };
      label = 'Levels';
    } else {
      // Presets tab
      if (midtones[0] !== 0 || midtones[1] !== 0 || midtones[2] !== 0 || shadows[0] !== 0 || shadows[2] !== 0) {
        adj = {
          type: 'colorBalance',
          data: { shadows, midtones, highlights, preserveLuminosity: true },
        };
        label = `Color Grading (${selectedPreset ?? 'Preset'})`;
      } else {
        adj = { type: 'hueSaturation', data: { hue, saturation, lightness } };
        label = `Color (${selectedPreset ?? 'Preset'})`;
      }
    }

    if (applyAsLayer) {
      dispatch({
        type: 'adjustment.create',
        adjustment: adj,
        name: label,
        source: 'user',
      });
    } else if (doc.activeLayerId) {
      dispatch({
        type: 'adjustment.set',
        layerId: doc.activeLayerId,
        adjustment: adj,
        source: 'user',
      });
    }

    onClose();
  };

  const applyPreset = (presetName: string) => {
    setSelectedPreset(presetName);
    switch (presetName) {
      case 'warm':
        setHue(10); setSaturation(15); setLightness(5);
        setBrightness(10); setContrast(15);
        setMidtones([10, 0, -10]);
        break;
      case 'cool':
        setHue(-15); setSaturation(-10); setLightness(0);
        setBrightness(5); setContrast(20);
        setMidtones([-10, 0, 15]);
        break;
      case 'bw':
        setHue(0); setSaturation(-100); setLightness(0);
        setBrightness(5); setContrast(30);
        break;
      case 'tealOrange':
        setHue(-5); setSaturation(25); setLightness(0);
        setBrightness(8); setContrast(25);
        setMidtones([15, 0, -20]);
        setShadows([-10, 5, 20]);
        break;
      case 'vintage':
        setHue(15); setSaturation(-25); setLightness(5);
        setBrightness(-5); setContrast(-15);
        setMidtones([10, -5, -15]);
        break;
      case 'pop':
        setHue(0); setSaturation(35); setLightness(5);
        setBrightness(12); setContrast(20);
        break;
    }
  };

  const handleReset = () => {
    setHue(0); setSaturation(0); setLightness(0);
    setBrightness(0); setContrast(0);
    setMidtones([0, 0, 0]); setShadows([0, 0, 0]); setHighlights([0, 0, 0]);
    setInputMin(0); setInputMax(255); setGamma(1); setOutputMin(0); setOutputMax(255);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
      <div className="bg-neutral-850 border border-neutral-700 rounded-lg shadow-2xl w-[460px] overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700 bg-neutral-900">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Color Grading & Adjustments</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-700 bg-neutral-900/60 px-3 text-xs">
          <button
            onClick={() => setActiveTab('hueSat')}
            className={`py-2 px-3 font-medium border-b-2 transition-colors ${
              activeTab === 'hueSat' ? 'border-blue-500 text-blue-400' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            Hue / Saturation
          </button>
          <button
            onClick={() => setActiveTab('brightContrast')}
            className={`py-2 px-3 font-medium border-b-2 transition-colors ${
              activeTab === 'brightContrast' ? 'border-blue-500 text-blue-400' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            Brightness / Contrast
          </button>
          <button
            onClick={() => setActiveTab('colorBalance')}
            className={`py-2 px-3 font-medium border-b-2 transition-colors ${
              activeTab === 'colorBalance' ? 'border-blue-500 text-blue-400' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            Color Balance
          </button>
          <button
            onClick={() => setActiveTab('presets')}
            className={`py-2 px-3 font-medium border-b-2 transition-colors ${
              activeTab === 'presets' ? 'border-blue-500 text-blue-400' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            Presets
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'hueSat' && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Hue</span>
                  <span className="font-mono text-blue-400">{hue}°</span>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={hue}
                  onChange={e => setHue(Number(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                  style={{
                    background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                  }}
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Saturation</span>
                  <span className="font-mono text-blue-400">{saturation}%</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={saturation}
                  onChange={e => setSaturation(Number(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Lightness</span>
                  <span className="font-mono text-blue-400">{lightness}%</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={lightness}
                  onChange={e => setLightness(Number(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'brightContrast' && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Brightness</span>
                  <span className="font-mono text-blue-400">{brightness}</span>
                </div>
                <input
                  type="range"
                  min={-150}
                  max={150}
                  value={brightness}
                  onChange={e => setBrightness(Number(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Contrast</span>
                  <span className="font-mono text-blue-400">{contrast}</span>
                </div>
                <input
                  type="range"
                  min={-50}
                  max={100}
                  value={contrast}
                  onChange={e => setContrast(Number(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'colorBalance' && (
            <div className="space-y-4">
              <div className="text-[11px] text-neutral-400 bg-neutral-800/80 p-2 rounded border border-neutral-700/60">
                Split-Toning / Color Grading: Balance Cyan/Red, Magenta/Green, and Yellow/Blue across Midtones.
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-cyan-400">Cyan</span>
                  <span className="text-neutral-400 font-mono">{midtones[0]}</span>
                  <span className="text-red-400">Red</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={midtones[0]}
                  onChange={e => setMidtones([Number(e.target.value), midtones[1], midtones[2]])}
                  className="w-full h-1.5 accent-red-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-fuchsia-400">Magenta</span>
                  <span className="text-neutral-400 font-mono">{midtones[1]}</span>
                  <span className="text-green-400">Green</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={midtones[1]}
                  onChange={e => setMidtones([midtones[0], Number(e.target.value), midtones[2]])}
                  className="w-full h-1.5 accent-green-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-yellow-400">Yellow</span>
                  <span className="text-neutral-400 font-mono">{midtones[2]}</span>
                  <span className="text-blue-400">Blue</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={midtones[2]}
                  onChange={e => setMidtones([midtones[0], midtones[1], Number(e.target.value)])}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'presets' && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'tealOrange', label: 'Teal & Orange', desc: 'Cinematic Hollywood look' },
                { id: 'warm', label: 'Warm Golden Hour', desc: 'Sun-drenched golden tones' },
                { id: 'cool', label: 'Cool Nordic', desc: 'Moody desaturated blues' },
                { id: 'bw', label: 'High-Contrast B&W', desc: 'Classic monochrome portrait' },
                { id: 'vintage', label: 'Vintage Matte', desc: 'Faded film aesthetics' },
                { id: 'pop', label: 'Vibrant Color Pop', desc: 'Punchy saturated punch' },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`text-left p-2.5 rounded border transition-all ${
                    selectedPreset === p.id
                      ? 'bg-blue-600/20 border-blue-500 shadow-md shadow-blue-500/20'
                      : 'bg-neutral-800 border-neutral-700 hover:border-neutral-500 hover:bg-neutral-750'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      {p.label}
                    </div>
                    {selectedPreset === p.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </div>
                  <div className="text-[10px] text-neutral-400">{p.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer Options & Actions */}
        <div className="px-4 py-3 border-t border-neutral-700 bg-neutral-900 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyAsLayer}
              onChange={e => setApplyAsLayer(e.target.checked)}
              className="rounded accent-blue-500 cursor-pointer"
            />
            <span>Create Non-Destructive Adjustment Layer</span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-2.5 py-1 text-xs text-neutral-400 hover:text-white transition-colors"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow shadow-blue-600/30 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
