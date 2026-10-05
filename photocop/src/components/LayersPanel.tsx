/**
 * PhotoCop - Layers Panel
 *
 * Professional layered panel with:
 * - Live layer thumbnails with real-time update
 * - Drag-and-drop reordering & 1-click Move Up / Down
 * - Group creation (layer.group), ungrouping, and expand/collapse
 * - Clipping mask toggle with visual indentation
 * - Duplicate layer & Merge down
 * - Rich context menu (right-click)
 * - Visibility toggle & Lock toggle
 * - Opacity slider & Blend mode selector
 * - Inline rename
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Eye, EyeOff, Lock, Unlock, Plus, Trash2,
  Layers, Image, Type, Circle, Square,
  SlidersHorizontal, Folder, FolderPlus, FolderOpen,
  Shield, Copy, ArrowDownToLine, ChevronUp, ChevronDown,
  ChevronRight, CornerDownRight
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
    case 'group':      return <Folder className={cls} />;
    case 'fill':       return <Square className={`${cls} text-yellow-400`} />;
    default:           return <Layers className={cls} />;
  }
};

// ─── Layer Thumbnail ──────────────────────────────────────────────────────────

const LayerThumb: React.FC<{ layer: Layer }> = ({ layer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderVersion = useEditorStore(s => s.renderVersion);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 32, 32);

    if (layer.type === 'pixel' && layer.imageData) {
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
  }, [layer, renderVersion]);

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
      focus:outline-none focus:border-blue-500 cursor-pointer w-24"
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
  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
    <span className="text-[10px] text-neutral-400 w-6 shrink-0 text-right">
      {Math.round(value)}%
    </span>
    <input
      type="range" min={0} max={100} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-14 h-1 accent-blue-500 cursor-pointer"
    />
  </div>
);

// ─── Single Layer Row ──────────────────────────────────────────────────────────

interface LayerRowProps {
  layer: Layer;
  isActive: boolean;
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  isGroupExpanded?: boolean;
  onToggleGroup?: () => void;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent, layer: Layer) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const LayerRow: React.FC<LayerRowProps> = ({
  layer,
  isActive,
  depth,
  isFirst,
  isLast,
  isGroupExpanded,
  onToggleGroup,
  onSelect,
  onContextMenu,
  onMoveUp,
  onMoveDown,
}) => {
  const dispatch = useEditorStore(s => s.dispatch);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(layer.name);
  const [isDragOver, setIsDragOver] = useState(false);
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
      draggable={!layer.locked}
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', layer.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDragOver(false);
        const sourceId = e.dataTransfer.getData('text/plain');
        if (sourceId && sourceId !== layer.id) {
          const doc = useEditorStore.getState().document;
          if (doc) {
            if (layer.type === 'group') {
              dispatch({ type: 'layer.move_below', layerId: sourceId, targetLayerId: layer.children?.[0] ?? layer.id, source: 'user' });
              return;
            }
            if (doc.layerOrder.includes(layer.id)) {
              const targetIdx = doc.layerOrder.indexOf(layer.id);
              dispatch({ type: 'layer.move', layerId: sourceId, toIndex: targetIdx, source: 'user' });
            } else {
              for (const group of Object.values(doc.layers)) {
                if (group.type === 'group' && group.children?.includes(layer.id)) {
                  const targetIdx = group.children.indexOf(layer.id);
                  dispatch({ type: 'layer.move', layerId: sourceId, toIndex: targetIdx, source: 'user' });
                  break;
                }
              }
            }
          }
        }
      }}
      onContextMenu={e => onContextMenu(e, layer)}
      className={`group relative flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none
        border-b border-neutral-700/50 transition-colors
        ${isDragOver ? 'bg-blue-500/30 border-t-2 border-t-blue-400' : ''}
        ${isActive
          ? 'bg-blue-600/25 border-l-2 border-l-blue-500'
          : 'hover:bg-neutral-700/40 border-l-2 border-l-transparent'
        }`}
      style={{ paddingLeft: 8 + depth * 16 + (layer.clippingMask ? 12 : 0) }}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
    >
      {/* Group expand/collapse toggle */}
      {layer.type === 'group' && (
        <button
          onClick={e => {
            e.stopPropagation();
            onToggleGroup?.();
          }}
          className="p-0.5 text-neutral-400 hover:text-white transition-colors shrink-0"
          title={isGroupExpanded ? 'Collapse Group' : 'Expand Group'}
        >
          {isGroupExpanded ? <FolderOpen className="w-3.5 h-3.5 text-yellow-400" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Clipping mask indicator */}
      {layer.clippingMask && (
        <span title="Clipped to layer below" className="inline-flex shrink-0">
          <CornerDownRight className="w-3 h-3 text-blue-400" />
        </span>
      )}

      {/* Visibility toggle */}
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

      {/* Lock toggle */}
      <button
        onClick={e => {
          e.stopPropagation();
          dispatch({ type: 'layer.set_locked', layerId: layer.id, locked: !layer.locked, source: 'user' });
        }}
        className="p-0.5 hover:text-white transition-colors shrink-0 opacity-0 group-hover:opacity-100"
        title={layer.locked ? 'Unlock layer' : 'Lock layer'}
      >
        {layer.locked
          ? <Lock className="w-3 h-3 text-yellow-400" />
          : <Unlock className="w-3 h-3 text-neutral-600" />}
      </button>

      {/* Clipping mask button (hover) */}
      <button
        onClick={e => {
          e.stopPropagation();
          dispatch({ type: 'layer.set_clipping_mask', layerId: layer.id, clippingMask: !layer.clippingMask, source: 'user' });
        }}
        className={`p-0.5 hover:text-blue-400 transition-colors shrink-0 ${layer.clippingMask ? 'text-blue-400' : 'text-neutral-600 opacity-0 group-hover:opacity-100'}`}
        title={layer.clippingMask ? 'Release Clipping Mask' : 'Create Clipping Mask'}
      >
        <CornerDownRight className="w-3 h-3" />
      </button>

      {/* Thumbnail */}
      <LayerThumb layer={layer} />

      {/* Mask thumb */}
      <MaskThumb layer={layer} />

      {/* Name + controls */}
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

          {/* Quick Move Up / Down arrows on hover */}
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <button
              disabled={isFirst}
              onClick={e => { e.stopPropagation(); onMoveUp(); }}
              className={`p-0.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-700 ${isFirst ? 'opacity-30 cursor-not-allowed' : ''}`}
              title="Move Up"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              disabled={isLast}
              onClick={e => { e.stopPropagation(); onMoveDown(); }}
              className={`p-0.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-700 ${isLast ? 'opacity-30 cursor-not-allowed' : ''}`}
              title="Move Down"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Blend mode + opacity */}
        <div className="flex items-center justify-between gap-1 mt-0.5">
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

// ─── Context Menu ─────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  layer: Layer;
}

const LayerContextMenu: React.FC<{
  menu: ContextMenuState;
  onClose: () => void;
}> = ({ menu, onClose }) => {
  const doc = useEditorStore(s => s.document);
  const dispatch = useEditorStore(s => s.dispatch);
  const layer = menu.layer;

  const isBottom = doc ? doc.layerOrder.indexOf(layer.id) === doc.layerOrder.length - 1 : true;

  const action = (cb: () => void) => {
    cb();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 select-none"
      onClick={onClose}
      onContextMenu={e => { e.preventDefault(); onClose(); }}
    >
      <div
        className="absolute bg-neutral-850 border border-neutral-700 rounded-md shadow-2xl py-1 w-48 text-xs text-neutral-200"
        style={{ left: menu.x, top: menu.y }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => action(() => dispatch({ type: 'layer.duplicate', layerId: layer.id, source: 'user' }))}
          className="w-full text-left px-3 py-1.5 hover:bg-neutral-700 flex items-center gap-2"
        >
          <Copy className="w-3.5 h-3.5 text-neutral-400" />
          Duplicate Layer
        </button>

        <button
          disabled={isBottom}
          onClick={() => action(() => dispatch({ type: 'layer.merge_down', layerId: layer.id, source: 'user' }))}
          className={`w-full text-left px-3 py-1.5 hover:bg-neutral-700 flex items-center gap-2 ${isBottom ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <ArrowDownToLine className="w-3.5 h-3.5 text-neutral-400" />
          Merge Down
        </button>

        <button
          onClick={() => action(() => dispatch({
            type: 'layer.set_clipping_mask',
            layerId: layer.id,
            clippingMask: !layer.clippingMask,
            source: 'user',
          }))}
          className="w-full text-left px-3 py-1.5 hover:bg-neutral-700 flex items-center gap-2"
        >
          <CornerDownRight className="w-3.5 h-3.5 text-neutral-400" />
          {layer.clippingMask ? 'Release Clipping Mask' : 'Create Clipping Mask'}
        </button>

        {layer.type === 'group' ? (
          <button
            onClick={() => action(() => dispatch({ type: 'layer.ungroup', groupLayerId: layer.id, source: 'user' }))}
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-700 flex items-center gap-2"
          >
            <Folder className="w-3.5 h-3.5 text-yellow-400" />
            Ungroup Layers
          </button>
        ) : (
          <button
            onClick={() => action(() => dispatch({ type: 'layer.group', layerIds: [layer.id], groupName: 'Group', source: 'user' }))}
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-700 flex items-center gap-2"
          >
            <FolderPlus className="w-3.5 h-3.5 text-yellow-400" />
            Group Layer
          </button>
        )}

        <button
          onClick={() => action(() => dispatch({ type: 'layer.set_locked', layerId: layer.id, locked: !layer.locked, source: 'user' }))}
          className="w-full text-left px-3 py-1.5 hover:bg-neutral-700 flex items-center gap-2"
        >
          {layer.locked ? <Unlock className="w-3.5 h-3.5 text-yellow-400" /> : <Lock className="w-3.5 h-3.5 text-neutral-400" />}
          {layer.locked ? 'Unlock Layer' : 'Lock Layer'}
        </button>

        <div className="my-1 border-t border-neutral-750" />

        <button
          onClick={() => action(() => dispatch({ type: 'layer.delete', layerId: layer.id, source: 'user' }))}
          className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-red-500/10 flex items-center gap-2"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Layer
        </button>
      </div>
    </div>
  );
};

// ─── Layers Panel ─────────────────────────────────────────────────────────────

export const LayersPanel: React.FC = () => {
  const doc = useEditorStore(s => s.document);
  const dispatch = useEditorStore(s => s.dispatch);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  if (!doc) {
    return (
      <div className="flex flex-col h-full bg-neutral-850">
        <PanelHeader />
        <div className="flex-1 flex items-center justify-center text-neutral-600 text-xs">
          No document open
        </div>
      </div>
    );
  }

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, layer: Layer) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, layer });
  };

  const moveLayer = (layerId: string, delta: number) => {
    if (doc.layerOrder.includes(layerId)) {
      const idx = doc.layerOrder.indexOf(layerId);
      const newIdx = Math.max(0, Math.min(doc.layerOrder.length - 1, idx + delta));
      if (newIdx !== idx) {
        dispatch({ type: 'layer.move', layerId, toIndex: newIdx, source: 'user' });
      }
      return;
    }
    for (const group of Object.values(doc.layers)) {
      if (group.type === 'group' && group.children?.includes(layerId)) {
        const idx = group.children.indexOf(layerId);
        const newIdx = Math.max(0, Math.min(group.children.length - 1, idx + delta));
        if (newIdx !== idx) {
          dispatch({ type: 'layer.move', layerId, toIndex: newIdx, source: 'user' });
        }
        return;
      }
    }
  };

  const renderLayer = (layerId: string, depth = 0, parentGroup?: Layer): React.ReactNode => {
    const layer = doc.layers[layerId];
    if (!layer) return null;

    let isFirst = false;
    let isLast = false;
    if (parentGroup && parentGroup.children) {
      const idx = parentGroup.children.indexOf(layerId);
      isFirst = idx === 0;
      isLast = idx === parentGroup.children.length - 1;
    } else {
      const idx = doc.layerOrder.indexOf(layerId);
      isFirst = idx === 0;
      isLast = idx === doc.layerOrder.length - 1;
    }

    const isExpanded = !collapsedGroups.has(layerId);

    return (
      <React.Fragment key={layerId}>
        <LayerRow
          layer={layer}
          isActive={doc.activeLayerId === layerId}
          depth={depth}
          isFirst={isFirst}
          isLast={isLast}
          isGroupExpanded={isExpanded}
          onToggleGroup={() => toggleGroup(layerId)}
          onSelect={() => dispatch({ type: 'layer.set_active', layerId, source: 'user' })}
          onContextMenu={handleContextMenu}
          onMoveUp={() => moveLayer(layerId, -1)}
          onMoveDown={() => moveLayer(layerId, 1)}
        />
        {layer.type === 'group' && isExpanded && layer.children?.map(childId =>
          renderLayer(childId, depth + 1, layer)
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col h-full bg-neutral-850">
      <PanelHeader />

      {/* Layer list — top-down order */}
      <div className="flex-1 overflow-y-auto">
        {doc.layerOrder.map(id => renderLayer(id))}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-0.5 p-1.5 border-t border-neutral-700 bg-neutral-800">
        <ActionButton
          icon={<Plus className="w-3.5 h-3.5" />}
          title="New pixel layer"
          onClick={() => dispatch({ type: 'layer.create', layerType: 'pixel', source: 'user' })}
        />
        <ActionButton
          icon={<FolderPlus className="w-3.5 h-3.5" />}
          title="New group"
          onClick={() => {
            const activeId = doc.activeLayerId;
            dispatch({
              type: 'layer.group',
              layerIds: activeId ? [activeId] : [],
              groupName: 'Group',
              source: 'user',
            });
          }}
        />
        <ActionButton
          icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
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
        <ActionButton
          icon={<Copy className="w-3.5 h-3.5" />}
          title="Duplicate active layer"
          onClick={() => {
            if (doc.activeLayerId) {
              dispatch({ type: 'layer.duplicate', layerId: doc.activeLayerId, source: 'user' });
            }
          }}
        />
        <ActionButton
          icon={<ArrowDownToLine className="w-3.5 h-3.5" />}
          title="Merge down"
          onClick={() => {
            if (doc.activeLayerId) {
              dispatch({ type: 'layer.merge_down', layerId: doc.activeLayerId, source: 'user' });
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

      {/* Context Menu */}
      {contextMenu && (
        <LayerContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
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
        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'}`}
  >
    {icon}
  </button>
);
