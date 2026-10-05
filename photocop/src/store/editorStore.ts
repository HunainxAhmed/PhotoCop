/**
 * PhotoCop - Global Editor Store
 *
 * Uses Zustand for reactive state. The store is the single source of truth.
 * All state mutations go through dispatch(command) — never direct assignment.
 *
 * Architecture:
 *   UI components → useEditorStore().dispatch(cmd)
 *   AI layer      → store.dispatch(cmd)
 *   MCP tools     → store.dispatch(cmd)
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { EditorCommand } from '../core/commands';
import type { ToolId, BrushSettings, ToolState, CommandResult } from '../core/types';
import { handleCommand, type EditorState } from '../core/commandDispatcher';
import { compositeDocument } from '../core/compositor';
import { scheduleSaveDocument, loadDocumentFromStorage } from '../core/storage';
import type { AdjustmentTab } from '../components/AdjustmentsModal';

// ─── Store Interface ──────────────────────────────────────────────────────────

export interface PhotocopStore extends EditorState {
  // Tool state (not command-driven — interactive tool configuration)
  tool: ToolState;
  brushSettings: BrushSettings;
  cloneSource: { x: number; y: number } | null;

  // Performance metrics
  metrics: {
    lastRenderMs: number;
    lastCommandMs: number;
    renderCount: number;
  };

  // Render invalidation
  renderVersion: number;

  // Adjustments Modal
  activeAdjustmentModal: AdjustmentTab | null;
  openAdjustmentModal: (tab?: AdjustmentTab) => void;
  closeAdjustmentModal: () => void;

  // Project persistence
  initProjectStorage: () => Promise<void>;

  // Actions
  dispatch: (cmd: EditorCommand) => CommandResult;
  setTool: (toolId: ToolId) => void;
  setBrushSettings: (settings: Partial<BrushSettings>) => void;
  setCloneSource: (point: { x: number; y: number } | null) => void;
  invalidateRender: () => void;
  fitToWindow: (containerWidth: number, containerHeight: number) => void;

  // File operations
  loadImageFromFile: (file: File) => Promise<void>;
  exportCurrentDocument: (format: 'png' | 'jpeg' | 'webp', quality?: number) => Promise<void>;
}

// ─── Default State ────────────────────────────────────────────────────────────

const defaultEditorState: EditorState = {
  document: null,
  selection: { width: 0, height: 0, bounds: null, feather: 0 },
  foreground: { r: 0, g: 0, b: 0, a: 255 },
  background: { r: 255, g: 255, b: 255, a: 255 },
  history: [],
  historyIndex: -1,
  maxHistory: 100,
  viewport: { zoom: 1, panX: 0, panY: 0 },
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useEditorStore = create<PhotocopStore>()(
  subscribeWithSelector((set, get) => ({
    ...defaultEditorState,

    tool: {
      activeTool: 'move',
      previousTool: 'move',
    },

    brushSettings: {
      size: 20,
      hardness: 80,
      opacity: 100,
      flow: 100,
      spacing: 25,
      angle: 0,
      roundness: 100,
      pressureSensitivity: false,
    },

    cloneSource: null,

    metrics: {
      lastRenderMs: 0,
      lastCommandMs: 0,
      renderCount: 0,
    },

    renderVersion: 0,

    activeAdjustmentModal: null,
    openAdjustmentModal: (tab: AdjustmentTab = 'hueSat') => set({ activeAdjustmentModal: tab }),
    closeAdjustmentModal: () => set({ activeAdjustmentModal: null }),

    initProjectStorage: async () => {
      try {
        const saved = await loadDocumentFromStorage();
        if (saved) {
          set({
            document: saved,
            history: [],
            historyIndex: -1,
            renderVersion: get().renderVersion + 1,
          });
          const container = document.getElementById('canvas-container');
          if (container) {
            get().fitToWindow(container.clientWidth, container.clientHeight);
          }
        }
      } catch {
        // Non-fatal
      }
    },

    // ─── Core dispatch ────────────────────────────────────────────────────────

    dispatch: (cmd: EditorCommand): CommandResult => {
      const state = get() as EditorState;
      const t0 = performance.now();
      const { mutation, result } = handleCommand(state, cmd);

      if (result.success && Object.keys(mutation).length > 0) {
        set((prev) => {
          const next = {
            ...prev,
            ...(mutation as Partial<PhotocopStore>),
            renderVersion: prev.renderVersion + 1,
            metrics: {
              ...prev.metrics,
              lastCommandMs: performance.now() - t0,
            },
          };
          if ('document' in mutation) {
            scheduleSaveDocument(next.document);
          }
          return next;
        });
      }

      return result;
    },

    // ─── Tool control ─────────────────────────────────────────────────────────

    setTool: (toolId: ToolId) => {
      set((prev) => ({
        tool: {
          previousTool: prev.tool.activeTool,
          activeTool: toolId,
        },
      }));
    },

    setBrushSettings: (settings: Partial<BrushSettings>) => {
      set((prev) => ({
        brushSettings: { ...prev.brushSettings, ...settings },
      }));
    },

    setCloneSource: (point) => {
      set({ cloneSource: point });
    },

    invalidateRender: () => {
      set((prev) => ({ renderVersion: prev.renderVersion + 1 }));
    },

    // ─── Viewport fit ─────────────────────────────────────────────────────────

    fitToWindow: (containerWidth: number, containerHeight: number) => {
      const doc = get().document;
      if (!doc) return;
      const padding = 40;
      const zoomX = (containerWidth  - padding * 2) / doc.width;
      const zoomY = (containerHeight - padding * 2) / doc.height;
      const zoom = Math.min(zoomX, zoomY, 2);
      const panX = (containerWidth  - doc.width  * zoom) / 2;
      const panY = (containerHeight - doc.height * zoom) / 2;
      set({ viewport: { zoom, panX, panY } });
    },

    // ─── File operations ──────────────────────────────────────────────────────

    loadImageFromFile: async (file: File) => {
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);

            const store = get();
            const currentDoc = store.document;

            if (currentDoc) {
              // Existing document open: add as a NEW LAYER on top!
              const layerName = file.name.replace(/\.[^.]+$/, '');
              store.dispatch({
                type: 'layer.create',
                layerType: 'pixel',
                name: layerName,
                width: currentDoc.width,
                height: currentDoc.height,
                source: 'user',
              });

              const afterCreate = get();
              const newLayerId = afterCreate.document?.activeLayerId;
              if (newLayerId) {
                const posX = Math.round((currentDoc.width - img.width) / 2);
                const posY = Math.round((currentDoc.height - img.height) / 2);
                afterCreate.dispatch({
                  type: 'pixel.paste',
                  layerId: newLayerId,
                  imageData,
                  x: posX,
                  y: posY,
                  source: 'user',
                  description: `Import ${file.name}`,
                });
              }
              resolve();
              return;
            }

            // No document open: create new document with this image
            store.dispatch({
              type: 'document.create',
              width: img.width,
              height: img.height,
              title: file.name.replace(/\.[^.]+$/, ''),
              backgroundColor: null,
              source: 'user',
            });

            // Re-get state after create
            const freshState = get();
            if (freshState.document) {
              const layerId = freshState.document.layerOrder[0]
                ?? Object.keys(freshState.document.layers)[0];

              if (!layerId) {
                // Create a pixel layer and paste
                freshState.dispatch({
                  type: 'layer.create',
                  layerType: 'pixel',
                  name: file.name.replace(/\.[^.]+$/, ''),
                  width: img.width,
                  height: img.height,
                  source: 'user',
                });
                const afterCreate = get();
                const newLayerId = afterCreate.document?.activeLayerId;
                if (newLayerId) {
                  afterCreate.dispatch({
                    type: 'pixel.paste',
                    layerId: newLayerId,
                    imageData,
                    x: 0, y: 0,
                    source: 'user',
                    description: `Import ${file.name}`,
                  });
                }
              } else {
                freshState.dispatch({
                  type: 'pixel.paste',
                  layerId,
                  imageData,
                  x: 0, y: 0,
                  source: 'user',
                  description: `Import ${file.name}`,
                });
              }

              // Fit to window after loading
              const container = document.getElementById('canvas-container');
              if (container) {
                get().fitToWindow(container.clientWidth, container.clientHeight);
              }
            }
            resolve();
          };
          img.onerror = reject;
          img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },

    exportCurrentDocument: async (
      format: 'png' | 'jpeg' | 'webp',
      quality = 0.92
    ) => {
      const doc = get().document;
      if (!doc) return;

      const canvas = document.createElement('canvas');
      canvas.width = doc.width;
      canvas.height = doc.height;
      const ctx = canvas.getContext('2d')!;
      compositeDocument(doc, ctx);

      const mimeType = `image/${format}`;
      const dataUrl = canvas.toDataURL(mimeType, quality);

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${doc.metadata.title || 'export'}.${format}`;
      link.click();
    },
  }))
);

// ─── Convenience Selectors ───────────────────────────────────────────────────

export const selectDocument = (s: PhotocopStore) => s.document;
export const selectActiveLayer = (s: PhotocopStore) =>
  s.document?.layers[s.document.activeLayerId ?? ''] ?? null;
export const selectLayerOrder = (s: PhotocopStore) => s.document?.layerOrder ?? [];
export const selectViewport = (s: PhotocopStore) => s.viewport;
export const selectTool = (s: PhotocopStore) => s.tool;
export const selectBrushSettings = (s: PhotocopStore) => s.brushSettings;
export const selectForeground = (s: PhotocopStore) => s.foreground;
export const selectHistory = (s: PhotocopStore) => ({
  entries: s.history,
  currentIndex: s.historyIndex,
});
export const selectMetrics = (s: PhotocopStore) => s.metrics;
export const selectRenderVersion = (s: PhotocopStore) => s.renderVersion;
