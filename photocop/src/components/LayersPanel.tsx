/**
 * PhotoCop - Layers Panel
 *
 * Professional layered panel with:
 * - Layer thumbnails (live)
 * - Drag-to-reorder
 * - Visibility toggle
 * - Opacity slider
 * - Blend mode selector
 * - Lock toggle
 * - Mask toggle
 * - Add/Delete layer
 * - Layer type icons
 * - Inline rename
 */

import React, { useState, useRef } from 'react';
import {
  Eye, EyeOff, Lock, Unlock, Plus, Trash2,
  Layers, Image, Type, Circle, Square,
  SlidersHorizontal, Group, Shield
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import type { Layer, BlendMode } from '../core/types';
import { BLEND_MODES_LIST } from '../core/blendModes';

// ─── Layer Icon ───────────────────────────────────────────────────────────────

const LayerTypeIcon: React.FC<{ type: Layer['type'] }> = ({ type }) => {
  const cls = 'w-3.5 h-3.5 shrink-0';
  switch (type) {
    case 'pixel':      return <Image className={cls} />;
    case 'text':       return <Type className={cls} />;
    case 'vector':     return <Circle className={cls} />;
    case 'shape':      return <Square className={cls} />;
    case 'adjustment': return <SlidersHorizontal className={cls} />;
    case 'group':      return <Group className={cls} />;
    case 'fill':       return <Square className={`${cls} text-yellow-400`} />;
    default:           return <Layers className={cls} />;
  }
};

// ─── Layer Thumbnail ──────────────────────────────────────────────────────────

const LayerThumb: React.FC<{ layer: Layer }> = ({ layer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 32, 32);

    if (layer.type === 'pixel' && layer.imageData) {
      // Scale down imageData to 32x32
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = layer.imageData.width;
      srcCanvas.height = layer.imageData.height;
      srcCanvas.getContext('2d')!.putImageData(layer.imageData, 0, 0);
      ctx.drawImage(srcCanvas, 0, 0, 32, 32);
    } else if (layer.type === 'fill' && layer.fillColor) {
      const { r, g, b, a } = layer.fillColor;
      ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
      ctx.fillRect(0, 0, 32, 32);
    } else if (layer.type === 'adjustment') {
      ctx.fillStyle = '#4f9eff33';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#4f9eff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ADJ', 16, 19);
    } else if (layer.type === 'text') {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('T', 16, 21);
    } else if (layer.type === 'group') {
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(2, 2, 28, 28);
      ctx.fillStyle = '#888';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GRP', 16, 19);
    }
  }, [layer]);

  return (
    <canvas
      ref={canvasRef}
      width={32}
      height={32}
      className="rounded border border-neutral-600 shrink-0 bg-neutral-700"
    />
  );
};

// ─── Mask Thumb ───────────────────────────────────────────────────────────────

const MaskThumb: React.FC<{ layer: Layer }> = ({ layer }) => {
  if (!layer.mask) return null;
  return (
    <div
      className={`w-8 h-8 rounded border shrink-0 flex items-center justify-center
        ${layer.mask.enabled ? 'border-neutral-400 bg-neutral-600' : 'border-neutral-700 bg-neutral-800 opacity-50'}`}
      title={`Mask – ${layer.mask.enabled ? 'enabled' : 'disabled'}`}
    >
      <span className="text-[9px] font-bold text-neutral-300">M</span>
    </div>
  );
};

// ─── Blend Mode Selector ──────────────────────────────────────────────────────

const BlendModeSelect: React.FC<{
  value: BlendMode;
  onChange: (m: BlendMode) => void;
}> = ({ value, onChange }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value as BlendMode)}
    className="text-[10px] bg-neutral-700 border border-neutral-600 rounded px-1 py-0.5 text-neutral-200
      focus:outline-none focus:border-blue-500 cursor-pointer w-28"
    onClick={e => e.stopPropagation()}
  >
    {BLEND_MODES_LIST.map(m => (
      <option key={m} value={m}>{m}</option>
    ))}
  </select>
);

// ─── Opacity Slider ───────────────────────────────────────────────────────────

const OpacitySlider: React.FC<{
  value: number;
  onChange: (v: number) => void;
}> = ({ value, onChange }) => (
  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
    <span className="text-[10px] text-neutral-400 w-7 shrink-0">
      {Math.round(value)}%
    </span>
    <input
      type="range" min={0} max={100} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-16 h-1 accent-blue-500 cursor-pointer"
    />
  </div>
);

// ─── Single Layer Row ──────────────────────────────────────────────────────────

interface LayerRowProps {
  layer: Layer;
  isActive: boolean;
  depth: number;
  onSelect: () => void;
}

const LayerRow: React.FC<LayerRowProps> = ({ layer, isActive, depth, onSelect }) => {
  const dispatch = useEditorStore(s => s.dispatch);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(layer.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = () => {
    setRenameValue(layer.name);
    setIsRenaming(true);
    setTimeout(() => inputRef.current?.select(), 50);
  };

  const commitRename = () => {
    if (renameValue.trim()) {
      dispatch({ type: 'layer.rename', layerId: layer.id, name: renameValue.trim(), source: 'user' });
    }
    setIsRenaming(false);
  };

  return (
    <div
      className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none
        border-b border-neutral-700/50 transition-colors
        ${isActive
          ? 'bg-blue-600/25 border-l-2 border-l-blue-500'
          : 'hover:bg-neutral-700/40 border-l-2 border-l-transparent'
        }`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
    >
      {/* Visibility */}
      <button
        onClick={e => {
          e.stopPropagation();
          dispatch({ type: 'layer.set_visibility', layerId: layer.id, visible: !layer.visible, source: 'user' });
        }}
        className="p-0.5 hover:text-white transition-colors shrink-0"
        title={layer.visible ? 'Hide layer' : 'Show layer'}
      >
        {layer.visible
          ? <Eye className="w-3.5 h-3.5 text-neutral-400" />
          : <EyeOff className="w-3.5 h-3.5 text-neutral-600" />}
      </button>

      {/* Lock */}
      <button
        onClick={e => {
          e.stopPropagation();
          // TODO: lock command
        }}
        className="p-0.5 hover:text-white transition-colors shrink-0 opacity-0 group-hover:opacity-100"
        title={layer.locked ? 'Unlock layer' : 'Lock layer'}
      >
        {layer.locked
          ? <Lock className="w-3 h-3 text-yellow-400" />
          : <Unlock className="w-3 h-3 text-neutral-600" />}
      </button>

      {/* Thumbnail */}
      <LayerThumb layer={layer} />

      {/* Mask thumb */}
      <MaskThumb layer={layer} />

      {/* Name + type */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <LayerTypeIcon type={layer.type} />
          {isRenaming ? (
            <input
              ref={inputRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setIsRenaming(false); }}
              className="flex-1 text-xs bg-neutral-600 text-white px-1 rounded outline-none border border-blue-500"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className={`text-xs truncate ${layer.visible ? 'text-neutral-200' : 'text-neutral-500'}`}>
              {layer.name}
            </span>
          )}
        </div>

        {/* Blend mode + opacity */}
        <div className="flex items-center gap-2 mt-0.5">
          <BlendModeSelect
            value={layer.blendMode}
            onChange={m => dispatch({ type: 'layer.set_blend_mode', layerId: layer.id, blendMode: m, source: 'user' })}
          />
          <OpacitySlider
            value={layer.opacity}
            onChange={v => dispatch({ type: 'layer.set_opacity', layerId: layer.id, opacity: v, source: 'user' })}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Layers Panel ─────────────────────────────────────────────────────────────

export const LayersPanel: React.FC = () => {
  const { document: doc, dispatch } = useEditorStore(s => ({
    document: s.document,
    dispatch: s.dispatch,
  }));

  if (!doc) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader />
        <div className="flex-1 flex items-center justify-center text-neutral-600 text-xs">
          No document open
        </div>
      </div>
    );
  }

  const renderLayer = (layerId: string, depth = 0): React.ReactNode => {
    const layer = doc.layers[layerId];
    if (!layer) return null;

    return (
      <React.Fragment key={layerId}>
        <LayerRow
          layer={layer}
          isActive={doc.activeLayerId === layerId}
          depth={depth}
          onSelect={() => dispatch({ type: 'layer.set_active', layerId, source: 'user' })}
        />
        {layer.type === 'group' && layer.children?.map(childId =>
          renderLayer(childId, depth + 1)
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col h-full bg-neutral-800">
      <PanelHeader />

      {/* Layer list — top-down order */}
      <div className="flex-1 overflow-y-auto">
        {doc.layerOrder.map(id => renderLayer(id))}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-1 p-1.5 border-t border-neutral-700">
        <ActionButton
          icon={<Plus className="w-3.5 h-3.5" />}
          title="New pixel layer"
          onClick={() => dispatch({ type: 'layer.create', layerType: 'pixel', source: 'user' })}
        />
        <ActionButton
          icon={<span className="text-[10px] font-bold">A</span>}
          title="New adjustment layer"
          onClick={() => dispatch({
            type: 'adjustment.create',
            adjustment: { type: 'brightnessContrast', data: { brightness: 0, contrast: 0 } },
            source: 'user',
          })}
        />
        <ActionButton
          icon={<Shield className="w-3.5 h-3.5" />}
          title="Add layer mask"
          onClick={() => {
            if (doc.activeLayerId) {
              dispatch({ type: 'mask.create', layerId: doc.activeLayerId, fromSelection: false, source: 'user' });
            }
          }}
        />
        <div className="flex-1" />
        <ActionButton
          icon={<Trash2 className="w-3.5 h-3.5" />}
          title="Delete active layer"
          onClick={() => {
            if (doc.activeLayerId) {
              dispatch({ type: 'layer.delete', layerId: doc.activeLayerId, source: 'user' });
            }
          }}
          danger
        />
      </div>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const PanelHeader: React.FC = () => (
  <div className="flex items-center px-2 py-1.5 border-b border-neutral-700 shrink-0">
    <Layers className="w-3.5 h-3.5 text-neutral-400 mr-1.5" />
    <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Layers</span>
  </div>
);

const ActionButton: React.FC<{
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}> = ({ icon, title, onClick, danger }) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded transition-colors
      ${danger
        ? 'text-neutral-500 hover:text-red-400 hover:bg-red-400/10'
        : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700'}`}
  >
    {icon}
  </button>
);
