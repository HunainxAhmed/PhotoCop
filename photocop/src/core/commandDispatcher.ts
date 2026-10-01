/**
 * PhotoCop - Command Dispatcher & Handlers
 *
 * The single entry point for all document mutations.
 * Handlers receive the current store state and return mutations.
 * Every successful command produces a history entry.
 */

import { v4 as uuidv4 } from 'uuid';
import type { EditorCommand } from './commands';
import type { Document, Layer, Selection, HistoryEntry } from './types';
import {
  createDocument, addLayer, removeLayer, updateLayer,
  reorderLayer, duplicateLayer, createAdjustmentLayer,
  createPixelLayer, createGroupLayer, createTextLayer,
  createFillLayer, snapshotLayer, createDefaultMask,
  cloneImageData, WHITE
} from './document';
import { paintStroke } from './brushEngine';

// ─── Store Slice ──────────────────────────────────────────────────────────────

export interface EditorState {
  document: Document | null;
  selection: Selection;
  foreground: { r: number; g: number; b: number; a: number };
  background: { r: number; g: number; b: number; a: number };
  history: HistoryEntry[];
  historyIndex: number;
  maxHistory: number;
  viewport: { zoom: number; panX: number; panY: number };
}

export type StateMutation = Partial<EditorState>;

// ─── History Helpers ──────────────────────────────────────────────────────────

function makeHistoryEntry(
  description: string,
  source: HistoryEntry['source'],
  layerSnapshots: Record<string, Layer>,
  selection?: Selection
): HistoryEntry {
  return {
    id: uuidv4(),
    timestamp: Date.now(),
    description,
    source,
    layerSnapshots,
    selectionSnapshot: selection,
  };
}

function pushHistory(
  state: EditorState,
  entry: HistoryEntry
): Pick<EditorState, 'history' | 'historyIndex'> {
  // Truncate future when a new action is performed
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push(entry);

  // Enforce max history
  const trimmed = newHistory.length > state.maxHistory
    ? newHistory.slice(newHistory.length - state.maxHistory)
    : newHistory;

  return { history: trimmed, historyIndex: trimmed.length - 1 };
}

// ─── Handler Dispatch ─────────────────────────────────────────────────────────

export function handleCommand(
  state: EditorState,
  command: EditorCommand
): { mutation: StateMutation; result: CommandResult } {
  try {
    const mutation = dispatch(state, command);
    return {
      mutation,
      result: { success: true, data: mutation },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      mutation: {},
      result: {
        success: false,
        error: { code: 'COMMAND_ERROR', message: msg, recoverable: true },
      },
    };
  }
}

function dispatch(state: EditorState, cmd: EditorCommand): StateMutation {
  const doc = state.document;
  const src = cmd.source;

  switch (cmd.type) {

    // ─── Document ────────────────────────────────────────────────────────────

    case 'document.create': {
      const newDoc = createDocument(
        cmd.width, cmd.height,
        cmd.title ?? 'Untitled',
        cmd.dpi ?? 72,
        cmd.backgroundColor ?? WHITE
      );
      return {
        document: newDoc,
        history: [],
        historyIndex: -1,
        viewport: { zoom: 1, panX: 0, panY: 0 },
      };
    }

    case 'document.open_image': {
      // The UI layer creates an ImageData and calls paste; this triggers document creation
      // The actual work is done by the canvas layer; here we just record.
      return {};
    }

    // ─── Layer ───────────────────────────────────────────────────────────────

    case 'layer.create': {
      if (!doc) throw new Error('No document open');
      let layer: Layer;
      switch (cmd.layerType) {
        case 'pixel':
          layer = createPixelLayer(
            cmd.width ?? doc.width,
            cmd.height ?? doc.height,
            cmd.name ?? 'Layer',
            cmd.fillColor ?? null
          );
          break;
        case 'group':
          layer = createGroupLayer(cmd.name ?? 'Group');
          break;
        case 'adjustment':
          layer = createAdjustmentLayer(
            { type: 'brightnessContrast', data: { brightness: 0, contrast: 0 } },
            cmd.name ?? 'Adjustment'
          );
          break;
        case 'fill':
          layer = createFillLayer(cmd.fillColor ?? WHITE, cmd.name ?? 'Fill Layer');
          break;
        case 'text': {
          const td = { content: 'Text', style: {
            fontFamily: 'Inter', fontWeight: 400, fontStyle: 'normal' as const,
            fontSize: 48, color: { r: 0, g: 0, b: 0, a: 255 },
            letterSpacing: 0, lineHeight: 60, textAlign: 'left' as const,
          }};
          layer = createTextLayer(td, cmd.name ?? 'Text Layer');
          break;
        }
        default:
          layer = createPixelLayer(doc.width, doc.height, cmd.name ?? 'Layer');
      }
      const newDoc = addLayer(doc, layer, cmd.above);
      const snapshots = { [layer.id]: snapshotLayer(layer) };
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          cmd.description ?? `Create ${cmd.layerType} layer`, src, snapshots
        )),
      };
    }

    case 'layer.delete': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const snapshots = { [layer.id]: snapshotLayer(layer) };
      const newDoc = removeLayer(doc, cmd.layerId);
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          cmd.description ?? `Delete layer "${layer.name}"`, src, snapshots
        )),
      };
    }

    case 'layer.rename': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const newDoc = updateLayer(doc, cmd.layerId, { name: cmd.name });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Rename layer to "${cmd.name}"`, src, { [layer.id]: snapshotLayer(layer) }
        )),
      };
    }

    case 'layer.set_opacity': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const newDoc = updateLayer(doc, cmd.layerId, { opacity: Math.max(0, Math.min(100, cmd.opacity)) });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Set opacity to ${cmd.opacity}%`, src, { [layer.id]: snapshotLayer(layer) }
        )),
      };
    }

    case 'layer.set_blend_mode': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const newDoc = updateLayer(doc, cmd.layerId, { blendMode: cmd.blendMode });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Set blend mode to ${cmd.blendMode}`, src, { [layer.id]: snapshotLayer(layer) }
        )),
      };
    }

    case 'layer.set_visibility': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const newDoc = updateLayer(doc, cmd.layerId, { visible: cmd.visible });
      // Visibility is low-risk — no history entry for performance
      return { document: newDoc };
    }

    case 'layer.set_active': {
      if (!doc) throw new Error('No document open');
      if (!doc.layers[cmd.layerId]) throw new Error(`Layer ${cmd.layerId} not found`);
      return { document: { ...doc, activeLayerId: cmd.layerId } };
    }

    case 'layer.move': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const newDoc = reorderLayer(doc, cmd.layerId, cmd.toIndex);
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Move layer "${layer.name}"`, src, { [layer.id]: snapshotLayer(layer) }
        )),
      };
    }

    case 'layer.duplicate': {
      if (!doc) throw new Error('No document open');
      const newDoc = duplicateLayer(doc, cmd.layerId);
      const newLayerId = newDoc.layerOrder[newDoc.layerOrder.indexOf(cmd.layerId) - 1] ?? newDoc.layerOrder[0];
      const newLayer = newDoc.layers[newLayerId];
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Duplicate layer`, src, newLayer ? { [newLayerId]: snapshotLayer(newLayer) } : {}
        )),
      };
    }

    case 'layer.transform': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const newTransform = { ...layer.transform, ...cmd.transform };
      const newDoc = updateLayer(doc, cmd.layerId, { transform: newTransform });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Transform layer`, src, { [layer.id]: snapshotLayer(layer) }
        )),
      };
    }

    // ─── Pixel ───────────────────────────────────────────────────────────────

    case 'pixel.paint_stroke': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer?.imageData) throw new Error(`Layer ${cmd.layerId} has no pixel data`);

      const snapshot = snapshotLayer(layer);
      const newImageData = cloneImageData(layer.imageData);
      paintStroke({
        imageData: newImageData,
        points: cmd.points,
        settings: cmd.brushSettings,
        color: cmd.color,
        eraseMode: cmd.eraseMode,
      });
      const newDoc = updateLayer(doc, cmd.layerId, { imageData: newImageData });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          cmd.eraseMode ? 'Erase' : 'Paint stroke', src, { [layer.id]: snapshot }
        )),
      };
    }

    case 'pixel.fill': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer?.imageData) throw new Error(`Layer ${cmd.layerId} has no pixel data`);

      const snapshot = snapshotLayer(layer);
      const newImageData = cloneImageData(layer.imageData);

      if (cmd.selection) {
        // Fill selection rect
        const { x, y, width, height } = cmd.selection;
        const { r, g, b, a } = cmd.color;
        for (let py = y; py < y + height; py++) {
          for (let px = x; px < x + width; px++) {
            if (px < 0 || py < 0 || px >= newImageData.width || py >= newImageData.height) continue;
            const i = (py * newImageData.width + px) * 4;
            newImageData.data[i]     = r;
            newImageData.data[i + 1] = g;
            newImageData.data[i + 2] = b;
            newImageData.data[i + 3] = a;
          }
        }
      } else {
        // Full fill
        const { r, g, b, a } = cmd.color;
        for (let i = 0; i < newImageData.data.length; i += 4) {
          newImageData.data[i]     = r;
          newImageData.data[i + 1] = g;
          newImageData.data[i + 2] = b;
          newImageData.data[i + 3] = a;
        }
      }

      const newDoc = updateLayer(doc, cmd.layerId, { imageData: newImageData });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          'Fill', src, { [layer.id]: snapshot }
        )),
      };
    }

    case 'pixel.paste': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer?.imageData) throw new Error(`Layer ${cmd.layerId} has no pixel data`);

      const snapshot = snapshotLayer(layer);
      const newImageData = cloneImageData(layer.imageData);
      const src2 = cmd.imageData;
      for (let py = 0; py < src2.height; py++) {
        for (let px = 0; px < src2.width; px++) {
          const dx = cmd.x + px;
          const dy = cmd.y + py;
          if (dx < 0 || dy < 0 || dx >= newImageData.width || dy >= newImageData.height) continue;
          const si = (py * src2.width + px) * 4;
          const di = (dy * newImageData.width + dx) * 4;
          newImageData.data[di]     = src2.data[si];
          newImageData.data[di + 1] = src2.data[si + 1];
          newImageData.data[di + 2] = src2.data[si + 2];
          newImageData.data[di + 3] = src2.data[si + 3];
        }
      }
      const newDoc = updateLayer(doc, cmd.layerId, { imageData: newImageData });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          'Paste pixels', src, { [layer.id]: snapshot }
        )),
      };
    }

    // ─── Selection ───────────────────────────────────────────────────────────

    case 'selection.create_rect': {
      if (!doc) throw new Error('No document open');
      const sel: Selection = {
        width: doc.width,
        height: doc.height,
        bounds: cmd.rect,
        feather: cmd.feather ?? 0,
      };
      return { selection: sel };
    }

    case 'selection.select_all': {
      if (!doc) throw new Error('No document open');
      return {
        selection: {
          width: doc.width,
          height: doc.height,
          bounds: { x: 0, y: 0, width: doc.width, height: doc.height },
          feather: 0,
        },
      };
    }

    case 'selection.deselect': {
      return {
        selection: { width: 0, height: 0, bounds: null, feather: 0 },
      };
    }

    case 'selection.invert': {
      if (!doc) throw new Error('No document open');
      const sel = state.selection;
      if (!sel.bounds) {
        return {
          selection: {
            width: doc.width, height: doc.height,
            bounds: { x: 0, y: 0, width: doc.width, height: doc.height },
            feather: 0,
          },
        };
      }
      // Simple invert: no selection means full canvas
      return {
        selection: { width: doc.width, height: doc.height, bounds: null, feather: 0 },
      };
    }

    // ─── Mask ────────────────────────────────────────────────────────────────

    case 'mask.create': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const snapshot = snapshotLayer(layer);
      const mask = createDefaultMask(
        layer.imageData?.width ?? doc.width,
        layer.imageData?.height ?? doc.height,
        !cmd.inverted
      );
      if (cmd.inverted) mask.inverted = true;
      const newDoc = updateLayer(doc, cmd.layerId, { mask });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          'Add layer mask', src, { [layer.id]: snapshot }
        )),
      };
    }

    case 'mask.delete': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const snapshot = snapshotLayer(layer);
      const newDoc = updateLayer(doc, cmd.layerId, { mask: null });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          'Delete layer mask', src, { [layer.id]: snapshot }
        )),
      };
    }

    case 'mask.toggle': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer?.mask) throw new Error(`Layer ${cmd.layerId} has no mask`);
      const newDoc = updateLayer(doc, cmd.layerId, {
        mask: { ...layer.mask, enabled: cmd.enabled }
      });
      return { document: newDoc };
    }

    case 'mask.invert': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer?.mask) throw new Error(`Layer ${cmd.layerId} has no mask`);
      const snapshot = snapshotLayer(layer);
      const newDoc = updateLayer(doc, cmd.layerId, {
        mask: { ...layer.mask, inverted: !layer.mask.inverted }
      });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          'Invert mask', src, { [layer.id]: snapshot }
        )),
      };
    }

    // ─── Adjustment ──────────────────────────────────────────────────────────

    case 'adjustment.create': {
      if (!doc) throw new Error('No document open');
      const layer = createAdjustmentLayer(cmd.adjustment, cmd.name);
      const newDoc = addLayer(doc, layer, cmd.above);
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Add ${cmd.adjustment.type} adjustment`, src, { [layer.id]: snapshotLayer(layer) }
        )),
      };
    }

    case 'adjustment.set': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const snapshot = snapshotLayer(layer);
      const newDoc = updateLayer(doc, cmd.layerId, { adjustment: cmd.adjustment });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Update ${cmd.adjustment.type}`, src, { [layer.id]: snapshot }
        )),
      };
    }

    case 'curves.set_points': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer?.adjustment || layer.adjustment.type !== 'curves')
        throw new Error(`Layer ${cmd.layerId} is not a curves adjustment`);
      const snapshot = snapshotLayer(layer);
      const existingData = layer.adjustment.data;
      const newAdj = {
        type: 'curves' as const,
        data: { ...existingData, [cmd.channel]: cmd.points }
      };
      const newDoc = updateLayer(doc, cmd.layerId, { adjustment: newAdj });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Set curves (${cmd.channel})`, src, { [layer.id]: snapshot }
        )),
      };
    }

    // ─── Transform ───────────────────────────────────────────────────────────

    case 'transform.crop': {
      if (!doc) throw new Error('No document open');
      const { rect } = cmd;
      const snapshots: Record<string, Layer> = {};

      // Crop each pixel layer
      const newLayers = { ...doc.layers };
      for (const layerId of doc.layerOrder) {
        const layer = doc.layers[layerId];
        if (layer.type === 'pixel' && layer.imageData) {
          snapshots[layerId] = snapshotLayer(layer);
          const cropped = new ImageData(rect.width, rect.height);
          for (let y = 0; y < rect.height; y++) {
            for (let x = 0; x < rect.width; x++) {
              const sx = x + rect.x;
              const sy = y + rect.y;
              if (sx < 0 || sy < 0 || sx >= layer.imageData.width || sy >= layer.imageData.height) continue;
              const si = (sy * layer.imageData.width + sx) * 4;
              const di = (y * rect.width + x) * 4;
              cropped.data[di]     = layer.imageData.data[si];
              cropped.data[di + 1] = layer.imageData.data[si + 1];
              cropped.data[di + 2] = layer.imageData.data[si + 2];
              cropped.data[di + 3] = layer.imageData.data[si + 3];
            }
          }
          newLayers[layerId] = { ...layer, imageData: cropped };
        }
      }

      const newDoc: Document = {
        ...doc,
        width: rect.width,
        height: rect.height,
        layers: newLayers,
        metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
      };
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry('Crop', src, snapshots)),
      };
    }

    // ─── Viewport ─────────────────────────────────────────────────────────────

    case 'viewport.set_zoom': {
      const zoom = Math.max(0.01, Math.min(64, cmd.zoom));
      return { viewport: { ...state.viewport, zoom } };
    }

    case 'viewport.pan': {
      return {
        viewport: {
          ...state.viewport,
          panX: state.viewport.panX + cmd.deltaX,
          panY: state.viewport.panY + cmd.deltaY,
        },
      };
    }

    case 'viewport.fit_to_window': {
      // Handled by the canvas component which has access to container size
      return {};
    }

    // ─── History ─────────────────────────────────────────────────────────────

    case 'history.undo': {
      if (state.historyIndex <= 0) return {};
      const newIndex = state.historyIndex - 1;
      const entry = state.history[newIndex];
      if (!doc) return {};

      // Restore layer snapshots
      const newLayers = { ...doc.layers };
      for (const [id, snap] of Object.entries(entry.layerSnapshots)) {
        newLayers[id] = snap;
      }
      const newDoc = { ...doc, layers: newLayers };
      return { document: newDoc, historyIndex: newIndex };
    }

    case 'history.redo': {
      if (state.historyIndex >= state.history.length - 1) return {};
      const newIndex = state.historyIndex + 1;
      // For a full redo, we'd need forward snapshots.
      // Phase 1: basic redo just advances index (full redo in Phase 3)
      return { historyIndex: newIndex };
    }

    case 'history.snapshot': {
      if (!doc) throw new Error('No document open');
      const snapshots: Record<string, Layer> = {};
      for (const id of doc.layerOrder) {
        snapshots[id] = snapshotLayer(doc.layers[id]);
      }
      return {
        ...pushHistory(state, makeHistoryEntry(cmd.name, src, snapshots)),
      };
    }

    // ─── Color ───────────────────────────────────────────────────────────────

    case 'color.set_foreground':
      return { foreground: cmd.color };

    case 'color.set_background':
      return { background: cmd.color };

    // ─── Export ──────────────────────────────────────────────────────────────

    case 'export.image':
      // Actual export is triggered by the UI layer which has canvas access
      return {};

    default:
      return {};
  }
}
