/**
 * PhotoCop - Toolbox Panel (left sidebar)
 *
 * All tools with keyboard shortcuts, active state,
 * and grouped by category.
 */

import React from 'react';
import {
  Move, Crop, Pipette, Pencil, Eraser, Paintbrush,
  Wand2, Type, Triangle, Square, Circle,
  Hand, ZoomIn, RotateCcw, Scissors,
  MousePointer2, Blend, Layers
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import type { ToolId } from '../core/types';

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
      { id: 'move',           label: 'Move',              shortcut: 'V', icon: <Move className={ICON} /> },
      { id: 'marqueeRect',    label: 'Rectangular Marquee', shortcut: 'M', icon: <Square className={ICON} /> },
      { id: 'marqueeEllipse', label: 'Elliptical Marquee',  shortcut: 'M', icon: <Circle className={ICON} /> },
      { id: 'lasso',          label: 'Lasso',              shortcut: 'L', icon: <Scissors className={ICON} /> },
      { id: 'magicWand',      label: 'Magic Wand',         shortcut: 'W', icon: <Wand2 className={ICON} /> },
    ],
  },
  {
    label: 'Painting',
    tools: [
      { id: 'brush',   label: 'Brush',  shortcut: 'B', icon: <Paintbrush className={ICON} /> },
      { id: 'pencil',  label: 'Pencil', shortcut: 'B', icon: <Pencil className={ICON} /> },
      { id: 'eraser',  label: 'Eraser', shortcut: 'E', icon: <Eraser className={ICON} /> },
      { id: 'fill',    label: 'Fill',   shortcut: 'G', icon: <Blend className={ICON} /> },
      { id: 'gradient',label: 'Gradient', shortcut: 'G', icon: <Layers className={ICON} /> },
      { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', icon: <Pipette className={ICON} /> },
    ],
  },
  {
    label: 'Transform',
    tools: [
      { id: 'crop',      label: 'Crop',      shortcut: 'C', icon: <Crop className={ICON} /> },
      { id: 'transform', label: 'Transform', shortcut: 'T', icon: <MousePointer2 className={ICON} /> },
    ],
  },
  {
    label: 'Text & Shape',
    tools: [
      { id: 'text',   label: 'Text',     shortcut: 'T', icon: <Type className={ICON} /> },
      { id: 'shape',  label: 'Shape',    shortcut: 'U', icon: <Triangle className={ICON} /> },
      { id: 'vector', label: 'Pen',      shortcut: 'P', icon: <MousePointer2 className={ICON} /> },
    ],
  },
  {
    label: 'Dodge/Burn',
    tools: [
      { id: 'dodge',   label: 'Dodge',  shortcut: 'O', icon: <Circle className={ICON} /> },
      { id: 'burn',    label: 'Burn',   shortcut: 'O', icon: <Circle className={`${ICON} opacity-50`} /> },
      { id: 'blur',    label: 'Blur',   shortcut: 'R', icon: <Circle className={`${ICON} opacity-30`} /> },
      { id: 'sharpen', label: 'Sharpen',shortcut: 'R', icon: <Circle className={`${ICON} text-white`} /> },
      { id: 'clone',   label: 'Clone',  shortcut: 'S', icon: <RotateCcw className={ICON} /> },
    ],
  },
  {
    label: 'View',
    tools: [
      { id: 'hand', label: 'Hand',       shortcut: 'H', icon: <Hand className={ICON} /> },
      { id: 'zoom', label: 'Zoom',       shortcut: 'Z', icon: <ZoomIn className={ICON} /> },
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

  const fg = `rgb(${foreground.r},${foreground.g},${foreground.b})`;
  const bg = `rgb(${background.r},${background.g},${background.b})`;

  return (
    <div className="flex flex-col items-center gap-1 px-2 py-2 border-t border-neutral-700">
      {/* Background swatch (behind) */}
      <div className="relative w-9 h-9">
        <div
          className="absolute bottom-0 right-0 w-6 h-6 rounded border border-neutral-500 cursor-pointer"
          style={{ backgroundColor: bg }}
          title="Background color"
        />
        {/* Foreground swatch */}
        <div
          className="absolute top-0 left-0 w-6 h-6 rounded border border-neutral-300 cursor-pointer z-10"
          style={{ backgroundColor: fg }}
          title="Foreground color"
        />
      </div>
      {/* Swap + reset */}
      <div className="flex gap-1">
        <button
          className="text-neutral-600 hover:text-neutral-300 text-[10px] leading-none"
          title="Swap colors (X)"
          onClick={() => {
            dispatch({ type: 'color.set_foreground', color: background, source: 'user' });
            dispatch({ type: 'color.set_background', color: foreground, source: 'user' });
          }}
        >⇄</button>
        <button
          className="text-neutral-600 hover:text-neutral-300 text-[10px] leading-none"
          title="Reset to black/white (D)"
          onClick={() => {
            dispatch({ type: 'color.set_foreground', color: { r: 0, g: 0, b: 0, a: 255 }, source: 'user' });
            dispatch({ type: 'color.set_background', color: { r: 255, g: 255, b: 255, a: 255 }, source: 'user' });
          }}
        >↩</button>
      </div>
    </div>
  );
};
