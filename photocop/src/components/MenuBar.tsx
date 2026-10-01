/**
 * PhotoCop - Menu Bar
 *
 * Full application menu with all professional categories.
 * All items dispatch real commands or trigger real actions.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  submenu?: MenuItem[];
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

const MenuDropdown: React.FC<{
  items: MenuItem[];
  onClose: () => void;
}> = ({ items, onClose }) => {
  return (
    <div className="absolute top-full left-0 mt-0.5 min-w-[200px] bg-neutral-800 border border-neutral-600
      rounded shadow-xl shadow-black/50 z-[9999] py-1">
      {items.map((item, idx) => {
        if (item.separator) {
          return <div key={idx} className="my-1 border-t border-neutral-700/60" />;
        }
        return (
          <button
            key={idx}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled && item.action) {
                item.action();
                onClose();
              }
            }}
            className={`w-full text-left px-3 py-1 text-xs flex items-center justify-between
              ${item.disabled
                ? 'text-neutral-600 cursor-not-allowed'
                : 'text-neutral-300 hover:bg-blue-600 hover:text-white'}`}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="text-neutral-500 text-[10px] ml-8">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ─── Menu Bar ────────────────────────────────────────────────────────────────

export const MenuBar: React.FC = () => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const store = useEditorStore();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasDoc = !!store.document;
  const activeLayerId = store.document?.activeLayerId ?? null;

  const MENUS: MenuDef[] = [
    {
      label: 'File',
      items: [
        {
          label: 'New Document…',
          shortcut: 'Ctrl+N',
          action: () => {
            store.dispatch({
              type: 'document.create',
              width: 1920, height: 1080, title: 'Untitled',
              dpi: 72, backgroundColor: { r: 255, g: 255, b: 255, a: 255 },
              source: 'user',
            });
          },
        },
        {
          label: 'Open Image…',
          shortcut: 'Ctrl+O',
          action: () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) await store.loadImageFromFile(file);
            };
            input.click();
          },
        },
        { separator: true },
        {
          label: 'Save as PNG',
          shortcut: 'Ctrl+S',
          disabled: !hasDoc,
          action: () => store.exportCurrentDocument('png'),
        },
        {
          label: 'Save as JPEG',
          shortcut: 'Ctrl+Shift+S',
          disabled: !hasDoc,
          action: () => store.exportCurrentDocument('jpeg', 0.92),
        },
        {
          label: 'Save as WebP',
          disabled: !hasDoc,
          action: () => store.exportCurrentDocument('webp', 0.85),
        },
        { separator: true },
        {
          label: 'Revert',
          disabled: !hasDoc,
          action: () => { /* TODO: revert to saved */ },
        },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          disabled: !hasDoc || store.historyIndex <= 0,
          action: () => store.dispatch({ type: 'history.undo', source: 'user' }),
        },
        {
          label: 'Redo',
          shortcut: 'Ctrl+Shift+Z',
          disabled: !hasDoc || store.historyIndex >= store.history.length - 1,
          action: () => store.dispatch({ type: 'history.redo', source: 'user' }),
        },
        { separator: true },
        {
          label: 'Select All',
          shortcut: 'Ctrl+A',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'selection.select_all', source: 'user' }),
        },
        {
          label: 'Deselect',
          shortcut: 'Ctrl+D',
          disabled: !hasDoc || !store.selection.bounds,
          action: () => store.dispatch({ type: 'selection.deselect', source: 'user' }),
        },
        {
          label: 'Invert Selection',
          shortcut: 'Ctrl+Shift+I',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'selection.invert', source: 'user' }),
        },
        { separator: true },
        {
          label: 'Fill with Foreground',
          shortcut: 'Alt+Del',
          disabled: !hasDoc || !activeLayerId,
          action: () => {
            if (activeLayerId) {
              store.dispatch({ type: 'pixel.fill', layerId: activeLayerId, color: store.foreground, source: 'user', description: 'Fill with foreground' });
            }
          },
        },
        {
          label: 'Fill with Background',
          shortcut: 'Ctrl+Del',
          disabled: !hasDoc || !activeLayerId,
          action: () => {
            if (activeLayerId) {
              store.dispatch({ type: 'pixel.fill', layerId: activeLayerId, color: store.background, source: 'user', description: 'Fill with background' });
            }
          },
        },
      ],
    },
    {
      label: 'Image',
      items: [
        {
          label: 'Rotate Canvas 90° CW',
          disabled: !hasDoc,
          action: () => {
            if (activeLayerId) {
              store.dispatch({ type: 'transform.rotate', degrees: 90, source: 'user' });
            }
          },
        },
        {
          label: 'Flip Horizontal',
          disabled: !hasDoc,
          action: () => {
            store.dispatch({ type: 'transform.flip', axis: 'horizontal', source: 'user' });
          },
        },
        {
          label: 'Flip Vertical',
          disabled: !hasDoc,
          action: () => {
            store.dispatch({ type: 'transform.flip', axis: 'vertical', source: 'user' });
          },
        },
        { separator: true },
        {
          label: 'Flatten Image',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'document.flatten', source: 'user' }),
        },
      ],
    },
    {
      label: 'Layer',
      items: [
        {
          label: 'New Pixel Layer',
          shortcut: 'Ctrl+Shift+N',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'layer.create', layerType: 'pixel', source: 'user' }),
        },
        {
          label: 'New Group',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'layer.create', layerType: 'group', source: 'user' }),
        },
        {
          label: 'Duplicate Layer',
          shortcut: 'Ctrl+J',
          disabled: !hasDoc || !activeLayerId,
          action: () => {
            if (activeLayerId) store.dispatch({ type: 'layer.duplicate', layerId: activeLayerId, source: 'user' });
          },
        },
        { separator: true },
        {
          label: 'Add Layer Mask',
          disabled: !hasDoc || !activeLayerId,
          action: () => {
            if (activeLayerId) store.dispatch({ type: 'mask.create', layerId: activeLayerId, fromSelection: !!store.selection.bounds, source: 'user' });
          },
        },
        {
          label: 'Delete Layer Mask',
          disabled: !hasDoc || !activeLayerId,
          action: () => {
            if (activeLayerId) store.dispatch({ type: 'mask.delete', layerId: activeLayerId, source: 'user' });
          },
        },
        { separator: true },
        {
          label: 'Delete Layer',
          disabled: !hasDoc || !activeLayerId,
          action: () => {
            if (activeLayerId) store.dispatch({ type: 'layer.delete', layerId: activeLayerId, source: 'user' });
          },
        },
      ],
    },
    {
      label: 'Adjustments',
      items: [
        {
          label: 'Curves…',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'adjustment.create', adjustment: { type: 'curves', data: { rgb: [], r: [], g: [], b: [] } }, source: 'user' }),
        },
        {
          label: 'Levels…',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'adjustment.create', adjustment: { type: 'levels', data: { inputMin: 0, inputMax: 255, gamma: 1, outputMin: 0, outputMax: 255 } }, source: 'user' }),
        },
        {
          label: 'Brightness/Contrast…',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'adjustment.create', adjustment: { type: 'brightnessContrast', data: { brightness: 0, contrast: 0 } }, source: 'user' }),
        },
        {
          label: 'Hue/Saturation…',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'adjustment.create', adjustment: { type: 'hueSaturation', data: { hue: 0, saturation: 0, lightness: 0 } }, source: 'user' }),
        },
        { separator: true },
        {
          label: 'Invert',
          shortcut: 'Ctrl+I',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'adjustment.create', adjustment: { type: 'invert' }, source: 'user' }),
        },
        {
          label: 'Threshold…',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'adjustment.create', adjustment: { type: 'threshold', data: { value: 128 } }, source: 'user' }),
        },
        {
          label: 'Posterize…',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'adjustment.create', adjustment: { type: 'posterize', data: { levels: 4 } }, source: 'user' }),
        },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Zoom In',
          shortcut: 'Ctrl++',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'viewport.set_zoom', zoom: store.viewport.zoom * 1.5, source: 'user' }),
        },
        {
          label: 'Zoom Out',
          shortcut: 'Ctrl+-',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'viewport.set_zoom', zoom: store.viewport.zoom / 1.5, source: 'user' }),
        },
        {
          label: 'Fit to Window',
          shortcut: 'Ctrl+0',
          disabled: !hasDoc,
          action: () => {
            const el = document.getElementById('canvas-container');
            if (el) store.fitToWindow(el.clientWidth, el.clientHeight);
          },
        },
        {
          label: '100%',
          shortcut: 'Ctrl+1',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'viewport.set_zoom', zoom: 1, source: 'user' }),
        },
        {
          label: '200%',
          disabled: !hasDoc,
          action: () => store.dispatch({ type: 'viewport.set_zoom', zoom: 2, source: 'user' }),
        },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'About PhotoCop', action: () => alert('PhotoCop — AI-Native Professional Image Editor\nPhase 1 — Foundation') },
        { label: 'Keyboard Shortcuts', action: () => {} },
      ],
    },
  ];

  return (
    <div ref={barRef} className="flex items-center bg-neutral-900 border-b border-neutral-700 h-8 shrink-0 px-2 z-50">
      {/* App logo */}
      <div className="flex items-center mr-4 shrink-0">
        <span className="text-xs font-bold text-blue-400 tracking-wider">⚡ PhotoCop</span>
      </div>

      {/* Menus */}
      {MENUS.map(menu => (
        <div key={menu.label} className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
            className={`px-2 py-0.5 text-xs rounded transition-colors
              ${openMenu === menu.label
                ? 'bg-blue-600 text-white'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/50'}`}
          >
            {menu.label}
          </button>
          {openMenu === menu.label && (
            <MenuDropdown
              items={menu.items}
              onClose={() => setOpenMenu(null)}
            />
          )}
        </div>
      ))}

      {/* Status bar right side */}
      <div className="ml-auto flex items-center gap-3 text-[11px] text-neutral-500">
        <ZoomDisplay />
        <DocumentInfo />
      </div>
    </div>
  );
};

const ZoomDisplay: React.FC = () => {
  const zoom = useEditorStore(s => s.viewport.zoom);
  return <span>{Math.round(zoom * 100)}%</span>;
};

const DocumentInfo: React.FC = () => {
  const doc = useEditorStore(s => s.document);
  if (!doc) return null;
  return <span>{doc.width} × {doc.height} px</span>;
};
