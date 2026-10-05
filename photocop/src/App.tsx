/**
 * PhotoCop - Main Application Layout
 *
 * Three-column professional workspace:
 *   [Toolbox] [Canvas] [Right panels: Layers + Properties + History + AI]
 *
 * Keyboard shortcut handling, drag-and-drop file import, and global event routing.
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Canvas } from './components/Canvas';
import { Toolbox, ColorSwatches } from './components/Toolbox';
import { LayersPanel } from './components/LayersPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { AIPanel } from './components/AIPanel';
import { MenuBar } from './components/MenuBar';
import { StatusBar } from './components/StatusBar';
import { PerformanceMonitor } from './components/PerformanceMonitor';
import { AdjustmentsModal } from './components/AdjustmentsModal';
import { useEditorStore } from './store/editorStore';

// ─── Panel Tab System ─────────────────────────────────────────────────────────

type RightPanelTab = 'layers' | 'properties' | 'adjustments' | 'history' | 'ai';

const RightPanelTabs: React.FC<{
  active: RightPanelTab;
  onChange: (t: RightPanelTab) => void;
}> = ({ active, onChange }) => {
  const tabs: { id: RightPanelTab; label: string }[] = [
    { id: 'layers',      label: 'Layers' },
    { id: 'properties',  label: 'Props' },
    { id: 'adjustments', label: 'Color' },
    { id: 'history',     label: 'History' },
    { id: 'ai',          label: '✦ AI' },
  ];

  return (
    <div className="flex border-b border-neutral-700 shrink-0 bg-neutral-800">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 py-1.5 text-[10px] uppercase tracking-wider font-semibold transition-colors
            ${active === tab.id
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

// ─── New Document Dialog ───────────────────────────────────────────────────────

const NewDocumentDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dispatch = useEditorStore(s => s.dispatch);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [title, setTitle] = useState('Untitled');
  const [dpi, setDpi] = useState(72);

  const presets = [
    { label: 'Web 1920×1080', w: 1920, h: 1080 },
    { label: 'Instagram 1080×1080', w: 1080, h: 1080 },
    { label: 'A4 Portrait', w: 2480, h: 3508 },
    { label: 'A4 Landscape', w: 3508, h: 2480 },
    { label: '4K', w: 3840, h: 2160 },
    { label: '512×512', w: 512, h: 512 },
  ];

  const create = () => {
    dispatch({
      type: 'document.create',
      width, height, title, dpi,
      backgroundColor: { r: 255, g: 255, b: 255, a: 255 },
      source: 'user',
    });
    onClose();
    // Fit to window
    setTimeout(() => {
      const el = document.getElementById('canvas-container');
      if (el) useEditorStore.getState().fitToWindow(el.clientWidth, el.clientHeight);
    }, 50);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
      <div className="bg-neutral-800 border border-neutral-600 rounded-lg shadow-2xl p-5 w-[380px]">
        <h2 className="text-sm font-semibold text-neutral-200 mb-4">New Document</h2>

        <div className="mb-3">
          <label className="text-[11px] text-neutral-400 block mb-1">Name</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-neutral-700 border border-neutral-600 rounded px-2 py-1.5
              text-sm text-neutral-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label className="text-[11px] text-neutral-400 block mb-1">Width (px)</label>
            <input type="number" value={width} onChange={e => setWidth(Number(e.target.value))}
              className="w-full bg-neutral-700 border border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-neutral-400 block mb-1">Height (px)</label>
            <input type="number" value={height} onChange={e => setHeight(Number(e.target.value))}
              className="w-full bg-neutral-700 border border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="w-16">
            <label className="text-[11px] text-neutral-400 block mb-1">DPI</label>
            <input type="number" value={dpi} onChange={e => setDpi(Number(e.target.value))}
              className="w-full bg-neutral-700 border border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[11px] text-neutral-400 block mb-1.5">Presets</label>
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => { setWidth(p.w); setHeight(p.h); }}
                className="text-[11px] text-neutral-400 hover:text-neutral-200 text-left px-2 py-1
                  bg-neutral-700/50 hover:bg-neutral-700 rounded transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-1.5 rounded text-sm text-neutral-400 hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={create}
            className="flex-1 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [rightPanel, setRightPanel] = useState<RightPanelTab>('layers');
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const hasDoc = useEditorStore(s => Boolean(s.document));
  const loadImageFromFile = useEditorStore(s => s.loadImageFromFile);
  const activeAdjustmentModal = useEditorStore(s => s.activeAdjustmentModal);
  const closeAdjustmentModal = useEditorStore(s => s.closeAdjustmentModal);

  // ─── Restore saved session on mount ──────────────────────────────────────────

  useEffect(() => {
    useEditorStore.getState().initProjectStorage();
  }, []);

  // ─── Canvas resize observer ──────────────────────────────────────────────────

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Drag-and-drop file import ───────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await loadImageFromFile(file);
    }
  }, [loadImageFromFile]);

  // ─── Global keyboard shortcuts ───────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const store = useEditorStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement).tagName;

      // Don't intercept when typing in inputs
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (ctrl && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          store.dispatch({ type: 'history.redo', source: 'user' });
        } else {
          store.dispatch({ type: 'history.undo', source: 'user' });
        }
        return;
      }

      if (ctrl && e.key === 'n') { e.preventDefault(); setShowNewDoc(true); return; }
      if (ctrl && e.key === 'a') { e.preventDefault(); store.dispatch({ type: 'selection.select_all', source: 'user' }); return; }
      if (ctrl && e.key === 'd') { e.preventDefault(); store.dispatch({ type: 'selection.deselect', source: 'user' }); return; }
      if (ctrl && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); store.openAdjustmentModal('hueSat'); return; }
      if (ctrl && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); store.openAdjustmentModal('colorBalance'); return; }
      if (ctrl && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); store.openAdjustmentModal('levels'); return; }
      if (ctrl && e.key === '=') { e.preventDefault(); store.dispatch({ type: 'viewport.set_zoom', zoom: store.viewport.zoom * 1.5, source: 'user' }); return; }
      if (ctrl && e.key === '-') { e.preventDefault(); store.dispatch({ type: 'viewport.set_zoom', zoom: store.viewport.zoom / 1.5, source: 'user' }); return; }
      if (ctrl && e.key === '0') {
        e.preventDefault();
        const el = document.getElementById('canvas-container');
        if (el) store.fitToWindow(el.clientWidth, el.clientHeight);
        return;
      }
      if (ctrl && e.key === '1') { e.preventDefault(); store.dispatch({ type: 'viewport.set_zoom', zoom: 1, source: 'user' }); return; }
      if (ctrl && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        const activeId = store.document?.activeLayerId;
        if (activeId) store.dispatch({ type: 'layer.duplicate', layerId: activeId, source: 'user' });
        return;
      }

      // Tool shortcuts (no modifier)
      if (!ctrl && !e.altKey) {
        const toolMap: Record<string, import('./core/types').ToolId> = {
          'v': 'move', 'V': 'move',
          'm': 'marqueeRect', 'M': 'marqueeRect',
          'b': 'brush', 'B': 'brush',
          'e': 'eraser', 'E': 'eraser',
          'l': 'lasso', 'L': 'lasso',
          'g': 'fill', 'G': 'fill',
          'i': 'eyedropper', 'I': 'eyedropper',
          'c': 'crop', 'C': 'crop',
          't': 'text', 'T': 'text',
          'h': 'hand', 'H': 'hand',
          'z': 'zoom', 'Z': 'zoom',
          's': 'clone', 'S': 'clone',
          'p': 'vector', 'P': 'vector',
          'u': 'shape', 'U': 'shape',
          'o': 'dodge', 'O': 'dodge',
          'r': 'blur', 'R': 'blur',
          'w': 'magicWand', 'W': 'magicWand',
        };
        if (toolMap[e.key]) {
          store.setTool(toolMap[e.key]);
          return;
        }

        // X = swap colors
        if (e.key === 'x' || e.key === 'X') {
          store.dispatch({ type: 'color.set_foreground', color: store.background, source: 'user' });
          store.dispatch({ type: 'color.set_background', color: store.foreground, source: 'user' });
        }

        // D = reset colors
        if (e.key === 'd' || e.key === 'D') {
          store.dispatch({ type: 'color.set_foreground', color: { r: 0, g: 0, b: 0, a: 255 }, source: 'user' });
          store.dispatch({ type: 'color.set_background', color: { r: 255, g: 255, b: 255, a: 255 }, source: 'user' });
        }

        // Space = temporary hand tool (handled via CSS/state)
      }

      // Delete = delete active layer
      if (e.key === 'Delete' && !ctrl) {
        const activeId = store.document?.activeLayerId;
        if (activeId) store.dispatch({ type: 'layer.delete', layerId: activeId, source: 'user' });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      className="flex flex-col h-screen w-screen bg-neutral-900 text-neutral-200 overflow-hidden"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Menu bar */}
      <MenuBar />

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Toolbox */}
        <div className="flex flex-col border-r border-neutral-700 shrink-0">
          <div className="flex-1 overflow-y-auto">
            <Toolbox />
          </div>
          <ColorSwatches />
        </div>

        {/* Center: Canvas */}
        <div
          ref={canvasContainerRef}
          className="flex-1 relative overflow-hidden"
          id="canvas-container-wrapper"
        >
          <Canvas width={canvasSize.width} height={canvasSize.height} />
          <PerformanceMonitor />

          {/* New doc CTA when empty */}
          {!hasDoc && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-neutral-900/85">
              <div className="text-center pointer-events-auto max-w-sm px-7 py-8 rounded-xl bg-neutral-850/95 border border-neutral-700 shadow-2xl backdrop-blur-md">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/15 text-blue-400 mb-4 border border-blue-500/25 shadow-inner">
                  <span className="text-2xl font-bold font-sans">P</span>
                </div>
                <h1 className="text-lg font-bold text-white mb-1 tracking-tight">PhotoCop Studio</h1>
                <p className="text-neutral-400 text-xs mb-6 leading-relaxed">
                  Professional creative image editor with non-destructive layers, color grading, and AI tools.
                </p>
                <div className="flex gap-2.5 justify-center">
                  <button
                    onClick={() => setShowNewDoc(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md font-semibold transition-all shadow-md shadow-blue-600/25"
                  >
                    + New Project
                  </button>
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) await loadImageFromFile(file);
                      };
                      input.click();
                    }}
                    className="px-4 py-2 bg-neutral-750 hover:bg-neutral-700 text-neutral-200 text-xs rounded-md font-medium transition-colors border border-neutral-650"
                  >
                    Open Image
                  </button>
                </div>
                <div className="text-neutral-500 text-[11px] mt-4 font-mono">or drag and drop images anywhere</div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Tabbed panels */}
        <div className="w-72 flex flex-col border-l border-neutral-700 shrink-0 bg-neutral-800">
          <RightPanelTabs active={rightPanel} onChange={setRightPanel} />
          <div className="flex-1 overflow-hidden">
            {rightPanel === 'layers'      && <LayersPanel />}
            {rightPanel === 'properties'  && <PropertiesPanel />}
            {rightPanel === 'adjustments' && <ColorGradingSidebar />}
            {rightPanel === 'history'     && <HistoryPanel />}
            {rightPanel === 'ai'          && <AIPanel />}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* New document modal */}
      {showNewDoc && <NewDocumentDialog onClose={() => setShowNewDoc(false)} />}

      {/* Adjustments & Color Grading Modal */}
      {activeAdjustmentModal && (
        <AdjustmentsModal
          isOpen={true}
          initialTab={activeAdjustmentModal}
          onClose={closeAdjustmentModal}
        />
      )}
    </div>
  );
}

// ─── Color Grading Sidebar ───────────────────────────────────────────────────

const ColorGradingSidebar: React.FC = () => {
  const store = useEditorStore();
  const hasDoc = Boolean(store.document);

  return (
    <div className="flex flex-col h-full bg-neutral-800 p-3 overflow-y-auto space-y-4">
      <div className="text-xs font-semibold text-neutral-200 uppercase tracking-wider pb-1 border-b border-neutral-700">
        Color & Grading
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-neutral-400 font-medium">Quick Adjustments</label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            disabled={!hasDoc}
            onClick={() => store.openAdjustmentModal('hueSat')}
            className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-xs text-left text-neutral-200 transition-colors"
          >
            Hue / Saturation
          </button>
          <button
            disabled={!hasDoc}
            onClick={() => store.openAdjustmentModal('brightContrast')}
            className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-xs text-left text-neutral-200 transition-colors"
          >
            Brightness / Contrast
          </button>
          <button
            disabled={!hasDoc}
            onClick={() => store.openAdjustmentModal('colorBalance')}
            className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-xs text-left text-neutral-200 transition-colors"
          >
            Color Balance
          </button>
          <button
            disabled={!hasDoc}
            onClick={() => store.openAdjustmentModal('levels')}
            className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-xs text-left text-neutral-200 transition-colors"
          >
            Levels
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] text-neutral-400 font-medium">Creative Presets</label>
        <button
          disabled={!hasDoc}
          onClick={() => store.openAdjustmentModal('presets')}
          className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded text-xs font-medium shadow transition-all"
        >
          Open Preset Gallery
        </button>
      </div>
    </div>
  );
};
