/**
 * PhotoCop - Toolbox Panel (left sidebar)
 *
 * All tools with keyboard shortcuts, active state,
 * and grouped by category.
 */

import React from 'react';
import {
  Move, Crop, Pipette, Pencil, Eraser, Paintbrush,
  Wand2, Type, Square, Circle,
  Hand, ZoomIn, Scissors,
  MousePointer2, PaintBucket, Shapes, PenTool,
  Droplets, Sparkles, SunMedium, Flame, Stamp, CloudRain
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import type { ToolId } from '../core/types';
import { ColorPickerModal } from './ColorPickerModal';

// ─── Custom Gradient Icon ───────────────────────────────────────────────────

const GradientIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <line x1="3" y1="21" x2="21" y2="3" strokeWidth="1.5" strokeDasharray="2 2" />
    <path d="M3 3v18h18z" fill="currentColor" fillOpacity="0.35" stroke="none" />
  </svg>
);

// ─── Tool Definitions ─────────────────────────────────────────────────────────

interface ToolDef {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

interface ToolGroup {
  label: string;
  tools: ToolDef[];
}

const ICON = 'w-4 h-4';

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: 'Selection',
    tools: [
      { id: 'move',           label: 'Move Tool',         shortcut: 'V', icon: <Move className={ICON} /> },
      { id: 'marqueeRect',    label: 'Rectangular Marquee', shortcut: 'M', icon: <Square className={ICON} /> },
      { id: 'marqueeEllipse', label: 'Elliptical Marquee',  shortcut: 'M', icon: <Circle className={ICON} /> },
      { id: 'lasso',          label: 'Lasso Tool',        shortcut: 'L', icon: <Scissors className={ICON} /> },
      { id: 'magicWand',      label: 'Magic Wand',        shortcut: 'W', icon: <Wand2 className={ICON} /> },
    ],
  },
  {
    label: 'Painting & Retouch',
    tools: [
      { id: 'brush',      label: 'Brush Tool',     shortcut: 'B', icon: <Paintbrush className={ICON} /> },
      { id: 'pencil',     label: 'Pencil Tool',    shortcut: 'B', icon: <Pencil className={ICON} /> },
      { id: 'eraser',     label: 'Eraser Tool',    shortcut: 'E', icon: <Eraser className={ICON} /> },
      { id: 'fill',       label: 'Paint Bucket',   shortcut: 'G', icon: <PaintBucket className={ICON} /> },
      { id: 'gradient',   label: 'Gradient Tool',  shortcut: 'G', icon: <GradientIcon className={ICON} /> },
      { id: 'eyedropper', label: 'Eyedropper Tool', shortcut: 'I', icon: <Pipette className={ICON} /> },
    ],
  },
  {
    label: 'Transform',
    tools: [
      { id: 'crop',      label: 'Crop Tool',      shortcut: 'C', icon: <Crop className={ICON} /> },
      { id: 'transform', label: 'Transform Tool', shortcut: 'T', icon: <MousePointer2 className={ICON} /> },
    ],
  },
  {
    label: 'Vector & Text',
    tools: [
      { id: 'text',   label: 'Horizontal Type', shortcut: 'T', icon: <Type className={ICON} /> },
      { id: 'vector', label: 'Pen Tool',        shortcut: 'P', icon: <PenTool className={ICON} /> },
      { id: 'shape',  label: 'Shape Tool',      shortcut: 'U', icon: <Shapes className={ICON} /> },
    ],
  },
  {
    label: 'Darkroom Retouch',
    tools: [
      { id: 'blur',    label: 'Blur Tool',      shortcut: 'R', icon: <Droplets className={ICON} /> },
      { id: 'sharpen', label: 'Sharpen Tool',   shortcut: 'R', icon: <Sparkles className={ICON} /> },
      { id: 'dodge',   label: 'Dodge Tool',     shortcut: 'O', icon: <SunMedium className={ICON} /> },
      { id: 'burn',    label: 'Burn Tool',      shortcut: 'O', icon: <Flame className={ICON} /> },
      { id: 'sponge',  label: 'Sponge Tool',    shortcut: 'O', icon: <CloudRain className={ICON} /> },
      { id: 'clone',   label: 'Clone Stamp',    shortcut: 'S', icon: <Stamp className={ICON} /> },
    ],
  },
  {
    label: 'Navigation',
    tools: [
      { id: 'hand', label: 'Hand Tool',  shortcut: 'H', icon: <Hand className={ICON} /> },
      { id: 'zoom', label: 'Zoom Tool',  shortcut: 'Z', icon: <ZoomIn className={ICON} /> },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const Toolbox: React.FC = () => {
  const activeTool = useEditorStore(s => s.tool.activeTool);
  const setTool = useEditorStore(s => s.setTool);

  return (
    <div className="flex flex-col h-full bg-neutral-850 border-r border-neutral-700 w-12 py-2 overflow-y-auto overflow-x-hidden">
      {TOOL_GROUPS.map((group, gi) => (
        <React.Fragment key={group.label}>
          {gi > 0 && <div className="mx-2 my-1 border-t border-neutral-700/50" />}
          {group.tools.map(tool => (
            <ToolButton
              key={tool.id}
              tool={tool}
              active={activeTool === tool.id}
              onClick={() => setTool(tool.id)}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};

// ─── Tool Button ──────────────────────────────────────────────────────────────

interface ToolButtonProps {
  tool: ToolDef;
  active: boolean;
  onClick: () => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({ tool, active, onClick }) => (
  <button
    onClick={onClick}
    title={`${tool.label} (${tool.shortcut})`}
    className={`relative mx-1.5 my-0.5 p-2 rounded transition-all
      flex items-center justify-center
      ${active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
        : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/60'
      }`}
  >
    {tool.icon}
    {active && (
      <span className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-blue-400" />
    )}
  </button>
);

// ─── Color Swatches ───────────────────────────────────────────────────────────

export const ColorSwatches: React.FC = () => {
  const foreground = useEditorStore(s => s.foreground);
  const background = useEditorStore(s => s.background);
  const dispatch = useEditorStore(s => s.dispatch);
  const [activePicker, setActivePicker] = React.useState<'foreground' | 'background' | null>(null);

  const fg = `rgba(${foreground.r},${foreground.g},${foreground.b},${foreground.a / 255})`;
  const bg = `rgba(${background.r},${background.g},${background.b},${background.a / 255})`;

  return (
    <div className="flex flex-col items-center gap-1.5 px-2 py-2 border-t border-neutral-700">
      {/* Background & Foreground swatches */}
      <div className="relative w-9 h-9" title="Click to choose color">
        {/* Background swatch (behind) */}
        <button
          type="button"
          onClick={() => setActivePicker('background')}
          className="absolute bottom-0 right-0 w-6 h-6 rounded border border-neutral-500 cursor-pointer shadow hover:scale-105 transition-transform"
          style={{ backgroundColor: bg }}
          title="Background color (click to open picker)"
        />
        {/* Foreground swatch */}
        <button
          type="button"
          onClick={() => setActivePicker('foreground')}
          className="absolute top-0 left-0 w-6 h-6 rounded border-2 border-neutral-300 cursor-pointer z-10 shadow hover:scale-105 transition-transform"
          style={{ backgroundColor: fg }}
          title="Foreground color (click to open picker)"
        />
      </div>

      {/* Swap + reset buttons */}
      <div className="flex gap-1.5">
        <button
          className="text-neutral-500 hover:text-neutral-200 text-xs leading-none p-0.5 rounded hover:bg-neutral-750 transition-colors"
          title="Swap foreground and background colors (X)"
          onClick={() => {
            dispatch({ type: 'color.set_foreground', color: background, source: 'user' });
            dispatch({ type: 'color.set_background', color: foreground, source: 'user' });
          }}
        >⇄</button>
        <button
          className="text-neutral-500 hover:text-neutral-200 text-xs leading-none p-0.5 rounded hover:bg-neutral-750 transition-colors"
          title="Reset to default black/white colors (D)"
          onClick={() => {
            dispatch({ type: 'color.set_foreground', color: { r: 0, g: 0, b: 0, a: 255 }, source: 'user' });
            dispatch({ type: 'color.set_background', color: { r: 255, g: 255, b: 255, a: 255 }, source: 'user' });
          }}
        >↩</button>
      </div>

      {/* Real Photoshop Color Picker Dialog */}
      {activePicker && (
        <ColorPickerModal
          key={activePicker}
          title={activePicker === 'foreground' ? 'Color Picker (Foreground Color)' : 'Color Picker (Background Color)'}
          initialColor={activePicker === 'foreground' ? foreground : background}
          isOpen={true}
          onClose={() => setActivePicker(null)}
          onApply={(color) => {
            if (activePicker === 'foreground') {
              dispatch({ type: 'color.set_foreground', color, source: 'user' });
            } else if (activePicker === 'background') {
              dispatch({ type: 'color.set_background', color, source: 'user' });
            }
          }}
        />
      )}
    </div>
  );
};
