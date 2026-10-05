/**
 * PhotoCop - Command Dispatcher & Handlers
 *
 * The single entry point for all document mutations.
 * Handlers receive the current store state and return mutations.
 * Every successful command produces a history entry.
 */

import { v4 as uuidv4 } from 'uuid';
import type { EditorCommand } from './commands';
import type { Document, Layer, Selection, HistoryEntry, CommandResult } from './types';
import {
  createDocument, addLayer, removeLayer, updateLayer,
  reorderLayer, duplicateLayer, createAdjustmentLayer,
  createPixelLayer, createGroupLayer, createTextLayer,
  createFillLayer, snapshotLayer, createDefaultMask,
  cloneImageData, WHITE, DEFAULT_TRANSFORM, cloneDocument
} from './document';
import { paintStroke, renderLinearGradient, renderShape } from './brushEngine';
import { renderLayer, compositeDocument } from './compositor';

function floodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  fillColor: { r: number; g: number; b: number; a: number },
  tolerance = 32
): void {
  const { width, height, data } = imageData;
  const startIdx = (startY * width + startX) * 4;
  const startR = data[startIdx];
  const startG = data[startIdx + 1];
  const startB = data[startIdx + 2];
  const startA = data[startIdx + 3];

  if (
    Math.abs(startR - fillColor.r) <= tolerance &&
    Math.abs(startG - fillColor.g) <= tolerance &&
    Math.abs(startB - fillColor.b) <= tolerance &&
    Math.abs(startA - fillColor.a) <= tolerance
  ) {
    return;
  }

  const stack: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  const match = (idx: number) => {
    return (
      Math.abs(data[idx] - startR) <= tolerance &&
      Math.abs(data[idx + 1] - startG) <= tolerance &&
      Math.abs(data[idx + 2] - startB) <= tolerance &&
      Math.abs(data[idx + 3] - startA) <= tolerance
    );
  };

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const pixelIdx = y * width + x;
    if (visited[pixelIdx]) continue;
    visited[pixelIdx] = 1;

    const dataIdx = pixelIdx * 4;
    data[dataIdx]     = fillColor.r;
    data[dataIdx + 1] = fillColor.g;
    data[dataIdx + 2] = fillColor.b;
    data[dataIdx + 3] = fillColor.a;

    if (x > 0 && !visited[pixelIdx - 1] && match((pixelIdx - 1) * 4)) stack.push([x - 1, y]);
    if (x < width - 1 && !visited[pixelIdx + 1] && match((pixelIdx + 1) * 4)) stack.push([x + 1, y]);
    if (y > 0 && !visited[pixelIdx - width] && match((pixelIdx - width) * 4)) stack.push([x, y - 1]);
    if (y < height - 1 && !visited[pixelIdx + width] && match((pixelIdx + width) * 4)) stack.push([x, y + 1]);
  }
}

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

export function makeHistoryEntry(
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

export function pushHistory(
  state: EditorState,
  entry: HistoryEntry,
  newDoc?: Document
): Pick<EditorState, 'history' | 'historyIndex'> {
  if (state.document) {
    entry.docSnapshot = cloneDocument(state.document);
  }
  if (newDoc) {
    entry.forwardDocSnapshot = cloneDocument(newDoc);
  }

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
    // Ensure every new history entry has both backward and forward document snapshots
    if (mutation.history && mutation.history.length > 0) {
      const lastIdx = mutation.historyIndex ?? (mutation.history.length - 1);
      const lastEntry = mutation.history[lastIdx];
      if (lastEntry) {
        if (!lastEntry.docSnapshot && state.document) {
          lastEntry.docSnapshot = cloneDocument(state.document);
        }
        if (!lastEntry.forwardDocSnapshot) {
          const nextDoc = mutation.document ?? state.document;
          if (nextDoc) {
            lastEntry.forwardDocSnapshot = cloneDocument(nextDoc);
          }
        }
        if (!lastEntry.selectionSnapshot) {
          lastEntry.selectionSnapshot = state.selection;
        }
      }
    }
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
      const defaultLayerNum = Object.keys(doc.layers).length;
      const defaultName = `Layer ${defaultLayerNum}`;
      let layer: Layer;
      switch (cmd.layerType) {
        case 'pixel':
          layer = createPixelLayer(
            cmd.width ?? doc.width,
            cmd.height ?? doc.height,
            cmd.name ?? defaultName,
            cmd.fillColor ?? null
          );
          break;
        case 'group':
          layer = createGroupLayer(cmd.name ?? `Group ${defaultLayerNum}`);
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
          layer = createPixelLayer(doc.width, doc.height, cmd.name ?? defaultName);
      }
      const targetAbove = cmd.above ?? doc.activeLayerId ?? undefined;
      const newDoc = addLayer(doc, layer, targetAbove);
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
        ), newDoc),
      };
    }

    case 'layer.move_above': {
      if (!doc) throw new Error('No document open');
      const { layerId, targetLayerId } = cmd;
      if (!doc.layers[layerId] || !doc.layers[targetLayerId]) return {};
      if (doc.layerOrder.includes(layerId) && doc.layerOrder.includes(targetLayerId)) {
        const orderWithout = doc.layerOrder.filter(id => id !== layerId);
        const targetIdx = orderWithout.indexOf(targetLayerId);
        orderWithout.splice(Math.max(0, targetIdx), 0, layerId);
        const newDoc: Document = { ...doc, layerOrder: orderWithout, metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() } };
        return {
          document: newDoc,
          ...pushHistory(state, makeHistoryEntry('Move layer above', src, {}), newDoc),
        };
      }
      for (const [gid, g] of Object.entries(doc.layers)) {
        if (g.type === 'group' && g.children?.includes(layerId) && g.children.includes(targetLayerId)) {
          const childrenWithout = g.children.filter(id => id !== layerId);
          const targetIdx = childrenWithout.indexOf(targetLayerId);
          childrenWithout.splice(Math.max(0, targetIdx), 0, layerId);
          const updatedGroup = { ...g, children: childrenWithout };
          const newDoc: Document = { ...doc, layers: { ...doc.layers, [gid]: updatedGroup }, metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() } };
          return {
            document: newDoc,
            ...pushHistory(state, makeHistoryEntry('Move layer above', src, {}), newDoc),
          };
        }
      }
      return {};
    }

    case 'layer.move_below': {
      if (!doc) throw new Error('No document open');
      const { layerId, targetLayerId } = cmd;
      if (!doc.layers[layerId] || !doc.layers[targetLayerId]) return {};
      if (doc.layerOrder.includes(layerId) && doc.layerOrder.includes(targetLayerId)) {
        const orderWithout = doc.layerOrder.filter(id => id !== layerId);
        const targetIdx = orderWithout.indexOf(targetLayerId);
        orderWithout.splice(targetIdx + 1, 0, layerId);
        const newDoc: Document = { ...doc, layerOrder: orderWithout, metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() } };
        return {
          document: newDoc,
          ...pushHistory(state, makeHistoryEntry('Move layer below', src, {}), newDoc),
        };
      }
      for (const [gid, g] of Object.entries(doc.layers)) {
        if (g.type === 'group' && g.children?.includes(layerId) && g.children.includes(targetLayerId)) {
          const childrenWithout = g.children.filter(id => id !== layerId);
          const targetIdx = childrenWithout.indexOf(targetLayerId);
          childrenWithout.splice(targetIdx + 1, 0, layerId);
          const updatedGroup = { ...g, children: childrenWithout };
          const newDoc: Document = { ...doc, layers: { ...doc.layers, [gid]: updatedGroup }, metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() } };
          return {
            document: newDoc,
            ...pushHistory(state, makeHistoryEntry('Move layer below', src, {}), newDoc),
          };
        }
      }
      return {};
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
        ), newDoc),
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

    case 'layer.set_clipping_mask': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const snapshot = snapshotLayer(layer);
      const newDoc = updateLayer(doc, cmd.layerId, { clippingMask: cmd.clippingMask });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          cmd.clippingMask ? 'Create clipping mask' : 'Release clipping mask',
          src,
          { [layer.id]: snapshot }
        )),
      };
    }

    case 'layer.group': {
      if (!doc) throw new Error('No document open');
      const targetIds = cmd.layerIds.filter(id => doc.layers[id]);
      if (targetIds.length === 0) return {};

      const groupLayer = createGroupLayer(cmd.groupName ?? 'Group', targetIds);
      const newOrder: string[] = [];
      let inserted = false;
      for (const id of doc.layerOrder) {
        if (targetIds.includes(id)) {
          if (!inserted) {
            newOrder.push(groupLayer.id);
            inserted = true;
          }
        } else {
          newOrder.push(id);
        }
      }
      if (!inserted) {
        newOrder.unshift(groupLayer.id);
      }

      const newLayers = { ...doc.layers, [groupLayer.id]: groupLayer };
      const newDoc: Document = {
        ...doc,
        layers: newLayers,
        layerOrder: newOrder,
        activeLayerId: groupLayer.id,
        metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
      };

      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Group layers`, src, { [groupLayer.id]: snapshotLayer(groupLayer) }
        )),
      };
    }

    case 'layer.ungroup': {
      if (!doc) throw new Error('No document open');
      const group = doc.layers[cmd.groupLayerId];
      if (!group || group.type !== 'group') throw new Error(`Group ${cmd.groupLayerId} not found`);

      const children = group.children ?? [];
      const groupIdx = doc.layerOrder.indexOf(cmd.groupLayerId);
      const newOrder = doc.layerOrder.filter(id => id !== cmd.groupLayerId);
      if (groupIdx !== -1) {
        newOrder.splice(groupIdx, 0, ...children);
      } else {
        newOrder.push(...children);
      }

      const newLayers = { ...doc.layers };
      delete newLayers[cmd.groupLayerId];

      const newDoc: Document = {
        ...doc,
        layers: newLayers,
        layerOrder: newOrder,
        activeLayerId: children[0] ?? doc.activeLayerId,
        metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
      };

      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Ungroup "${group.name}"`, src, { [group.id]: snapshotLayer(group) }
        )),
      };
    }

    case 'layer.merge_down': {
      if (!doc) throw new Error('No document open');
      const topId = cmd.layerId || doc.activeLayerId;
      if (!topId) return {};
      const topLayer = doc.layers[topId];
      if (!topLayer) throw new Error(`Layer ${topId} not found`);

      let bottomId: string | null = null;
      if (doc.layerOrder.includes(topId)) {
        const topIdx = doc.layerOrder.indexOf(topId);
        if (topIdx < doc.layerOrder.length - 1) {
          bottomId = doc.layerOrder[topIdx + 1];
        }
      } else {
        // Top layer is inside a group
        for (const [gid, g] of Object.entries(doc.layers)) {
          if (g.type === 'group' && g.children?.includes(topId)) {
            const cIdx = g.children.indexOf(topId);
            if (cIdx < g.children.length - 1) {
              bottomId = g.children[cIdx + 1];
            } else {
              const gIdx = doc.layerOrder.indexOf(gid);
              if (gIdx !== -1 && gIdx < doc.layerOrder.length - 1) {
                bottomId = doc.layerOrder[gIdx + 1];
              }
            }
            break;
          }
        }
      }

      if (!bottomId) return {};
      const bottomLayer = doc.layers[bottomId];
      if (!bottomLayer) return {};

      const topSnap = snapshotLayer(topLayer);
      const bottomSnap = snapshotLayer(bottomLayer);

      const mergeCanvas = document.createElement('canvas');
      mergeCanvas.width = doc.width;
      mergeCanvas.height = doc.height;
      const mctx = mergeCanvas.getContext('2d')!;

      const renderSubtree = (l: Layer) => {
        if (l.type === 'group' && l.children) {
          const rev = [...l.children].reverse();
          for (const cid of rev) {
            const child = doc.layers[cid];
            if (child && child.visible) renderSubtree(child);
          }
        } else {
          renderLayer(doc, l, mctx, doc.width, doc.height);
        }
      };

      renderSubtree(bottomLayer);
      renderSubtree(topLayer);

      const mergedImageData = mctx.getImageData(0, 0, doc.width, doc.height);
      const updatedBottom: Layer = {
        ...bottomLayer,
        type: 'pixel',
        name: bottomLayer.name,
        imageData: mergedImageData,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        opacity: 100,
        blendMode: 'Normal',
        clippingMask: false,
      };

      const newLayers = { ...doc.layers, [bottomId]: updatedBottom };
      delete newLayers[topId];
      const newOrder = doc.layerOrder.filter(id => id !== topId);

      for (const [gid, g] of Object.entries(newLayers)) {
        if (g.type === 'group' && g.children?.includes(topId)) {
          newLayers[gid] = {
            ...g,
            children: g.children.filter(id => id !== topId),
          };
        }
      }

      const newDoc: Document = {
        ...doc,
        layers: newLayers,
        layerOrder: newOrder,
        activeLayerId: bottomId,
        metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
      };

      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          `Merge down "${topLayer.name}"`, src,
          { [topId]: topSnap, [bottomId]: bottomSnap }
        ), newDoc),
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
        toolMode: cmd.toolMode,
      });
      const newDoc = updateLayer(doc, cmd.layerId, { imageData: newImageData });
      const strokeLabel = cmd.toolMode
        ? (cmd.toolMode.charAt(0).toUpperCase() + cmd.toolMode.slice(1))
        : (cmd.eraseMode ? 'Erase' : 'Paint stroke');
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(strokeLabel, src, { [layer.id]: snapshot })),
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
        for (let py = Math.floor(y); py < y + height; py++) {
          for (let px = Math.floor(x); px < x + width; px++) {
            if (px < 0 || py < 0 || px >= newImageData.width || py >= newImageData.height) continue;
            const i = (py * newImageData.width + px) * 4;
            newImageData.data[i]     = r;
            newImageData.data[i + 1] = g;
            newImageData.data[i + 2] = b;
            newImageData.data[i + 3] = a;
          }
        }
      } else if (cmd.point) {
        // Flood fill from click point
        const px = Math.floor(cmd.point.x);
        const py = Math.floor(cmd.point.y);
        if (px >= 0 && px < newImageData.width && py >= 0 && py < newImageData.height) {
          floodFill(newImageData, px, py, cmd.color);
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

    case 'pixel.gradient': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer?.imageData) throw new Error(`Layer ${cmd.layerId} has no pixel data`);

      const snapshot = snapshotLayer(layer);
      const newImageData = cloneImageData(layer.imageData);
      renderLinearGradient(newImageData, cmd.start, cmd.end, cmd.startColor, cmd.endColor, cmd.selection);
      const newDoc = updateLayer(doc, cmd.layerId, { imageData: newImageData });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry('Linear Gradient', src, { [layer.id]: snapshot })),
      };
    }

    case 'pixel.shape': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer?.imageData) throw new Error(`Layer ${cmd.layerId} has no pixel data`);

      const snapshot = snapshotLayer(layer);
      const newImageData = cloneImageData(layer.imageData);
      renderShape(newImageData, cmd.shapeType, cmd.rect, cmd.fillColor, cmd.strokeColor, cmd.strokeWidth);
      const newDoc = updateLayer(doc, cmd.layerId, { imageData: newImageData });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(`Draw ${cmd.shapeType}`, src, { [layer.id]: snapshot })),
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

    case 'selection.create_rect':
    case 'selection.create_ellipse': {
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
      if (rect.width <= 0 || rect.height <= 0) return {};
      const snapshots: Record<string, Layer> = {};

      const newLayers = { ...doc.layers };
      for (const [layerId, layer] of Object.entries(doc.layers)) {
        snapshots[layerId] = snapshotLayer(layer);
        if (layer.type === 'pixel' && layer.imageData) {
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
          let croppedMask = layer.mask;
          if (layer.mask?.imageData) {
            const mImg = layer.mask.imageData;
            const cMaskData = new ImageData(rect.width, rect.height);
            for (let y = 0; y < rect.height; y++) {
              for (let x = 0; x < rect.width; x++) {
                const sx = x + rect.x;
                const sy = y + rect.y;
                if (sx < 0 || sy < 0 || sx >= mImg.width || sy >= mImg.height) continue;
                const si = (sy * mImg.width + sx) * 4;
                const di = (y * rect.width + x) * 4;
                cMaskData.data[di]     = mImg.data[si];
                cMaskData.data[di + 1] = mImg.data[si + 1];
                cMaskData.data[di + 2] = mImg.data[si + 2];
                cMaskData.data[di + 3] = mImg.data[si + 3];
              }
            }
            croppedMask = { ...layer.mask, imageData: cMaskData };
          }
          newLayers[layerId] = { ...layer, imageData: cropped, mask: croppedMask };
        } else if (layer.type === 'text') {
          newLayers[layerId] = {
            ...layer,
            transform: {
              ...layer.transform,
              x: layer.transform.x - rect.x,
              y: layer.transform.y - rect.y,
            },
          };
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
        ...pushHistory(state, makeHistoryEntry('Crop', src, snapshots), newDoc),
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
      if (state.historyIndex < 0) return {};
      const entry = state.history[state.historyIndex];
      const newIndex = state.historyIndex - 1;

      if (entry?.docSnapshot) {
        return {
          document: cloneDocument(entry.docSnapshot),
          selection: entry.selectionSnapshot ?? state.selection,
          historyIndex: newIndex,
        };
      }

      if (!doc) return { historyIndex: newIndex };
      const newLayers = { ...doc.layers };
      for (const [id, snap] of Object.entries(entry?.layerSnapshots ?? {})) {
        newLayers[id] = snap;
      }
      return { document: { ...doc, layers: newLayers }, historyIndex: newIndex };
    }

    case 'history.redo': {
      if (state.historyIndex >= state.history.length - 1) return {};
      const newIndex = state.historyIndex + 1;
      const nextEntry = state.history[newIndex];

      if (nextEntry?.forwardDocSnapshot) {
        return {
          document: cloneDocument(nextEntry.forwardDocSnapshot),
          selection: nextEntry.selectionSnapshot ?? state.selection,
          historyIndex: newIndex,
        };
      }

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

    // ─── Layer lock ──────────────────────────────────────────────────────────

    case 'layer.set_locked': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer) throw new Error(`Layer ${cmd.layerId} not found`);
      const newDoc = updateLayer(doc, cmd.layerId, { locked: cmd.locked });
      return { document: newDoc };
    }

    // ─── Transform (rotate / flip / document flatten) ─────────────────────────

    case 'transform.rotate': {
      if (!doc) throw new Error('No document open');
      const activeId = doc.activeLayerId;
      const layer = activeId ? doc.layers[activeId] : null;
      if (!layer?.imageData) return {};
      const snapshot = snapshotLayer(layer);
      const { width: w, height: h } = layer.imageData;
      const deg = ((cmd.degrees % 360) + 360) % 360;
      const newW = (deg === 90 || deg === 270) ? h : w;
      const newH = (deg === 90 || deg === 270) ? w : h;
      const rotated = new ImageData(newW, newH);
      const srcData = layer.imageData.data;
      const dst = rotated.data;
      for (let sy = 0; sy < h; sy++) {
        for (let sx = 0; sx < w; sx++) {
          const si = (sy * w + sx) * 4;
          let dx: number, dy: number;
          if (deg === 90)       { dx = h - 1 - sy; dy = sx; }
          else if (deg === 180) { dx = w - 1 - sx; dy = h - 1 - sy; }
          else if (deg === 270) { dx = sy; dy = w - 1 - sx; }
          else                  { dx = sx; dy = sy; }
          const di = (dy * newW + dx) * 4;
          dst[di] = srcData[si]; dst[di+1] = srcData[si+1];
          dst[di+2] = srcData[si+2]; dst[di+3] = srcData[si+3];
        }
      }
      const updatedDoc = updateLayer(doc, layer.id, { imageData: rotated });
      const finalDoc = (deg === 90 || deg === 270)
        ? { ...updatedDoc, width: newH, height: newW }
        : updatedDoc;
      return {
        document: finalDoc,
        ...pushHistory(state, makeHistoryEntry(`Rotate ${deg}°`, src, { [layer.id]: snapshot })),
      };
    }

    case 'transform.flip': {
      if (!doc) throw new Error('No document open');
      const activeId = doc.activeLayerId;
      const layer = activeId ? doc.layers[activeId] : null;
      if (!layer?.imageData) return {};
      const snapshot = snapshotLayer(layer);
      const { width: fw, height: fh, data: fData } = layer.imageData;
      const flipped = new ImageData(fw, fh);
      const fdst = flipped.data;
      for (let sy = 0; sy < fh; sy++) {
        for (let sx = 0; sx < fw; sx++) {
          const si = (sy * fw + sx) * 4;
          const dx = cmd.axis === 'horizontal' ? fw - 1 - sx : sx;
          const dy = cmd.axis === 'vertical' ? fh - 1 - sy : sy;
          const di = (dy * fw + dx) * 4;
          fdst[di] = fData[si]; fdst[di+1] = fData[si+1];
          fdst[di+2] = fData[si+2]; fdst[di+3] = fData[si+3];
        }
      }
      const newDoc = updateLayer(doc, layer.id, { imageData: flipped });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(`Flip ${cmd.axis}`, src, { [layer.id]: snapshot })),
      };
    }

    case 'document.flatten': {
      if (!doc) throw new Error('No document open');
      const flatCanvas = globalThis.document?.createElement('canvas');
      if (!flatCanvas) return {};
      flatCanvas.width = doc.width;
      flatCanvas.height = doc.height;
      const flatCtx = flatCanvas.getContext('2d')!;
      flatCtx.fillStyle = '#ffffff';
      flatCtx.fillRect(0, 0, doc.width, doc.height);

      // Composite full document onto flatCtx
      compositeDocument(doc, flatCtx);

      const flatData = flatCtx.getImageData(0, 0, doc.width, doc.height);
      const flatLayer = createPixelLayer(doc.width, doc.height, 'Background');
      flatLayer.locked = true;
      const snapshots: Record<string, Layer> = {};
      for (const [id, l] of Object.entries(doc.layers)) snapshots[id] = snapshotLayer(l);

      const flatDoc: Document = {
        ...doc,
        layers: { [flatLayer.id]: { ...flatLayer, imageData: flatData } },
        layerOrder: [flatLayer.id],
        activeLayerId: flatLayer.id,
        metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
      };
      return {
        document: flatDoc,
        ...pushHistory(state, makeHistoryEntry('Flatten image', src, snapshots), flatDoc),
      };
    }

    // ─── Text ─────────────────────────────────────────────────────────────────

    case 'text.create': {
      if (!doc) throw new Error('No document open');
      const textLayer = createTextLayer(cmd.textData, cmd.textData.content || 'Text Layer');
      textLayer.transform = {
        ...DEFAULT_TRANSFORM,
        x: cmd.position.x,
        y: cmd.position.y,
      };
      const newDoc = addLayer(doc, textLayer);
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          'Create text layer', src, { [textLayer.id]: snapshotLayer(textLayer) }
        )),
      };
    }

    case 'text.edit': {
      if (!doc) throw new Error('No document open');
      const layer = doc.layers[cmd.layerId];
      if (!layer || layer.type !== 'text' || !layer.textData)
        throw new Error(`Layer ${cmd.layerId} is not a text layer`);
      const snapshot = snapshotLayer(layer);
      const newTextData = {
        ...layer.textData,
        ...cmd.textData,
        style: { ...layer.textData.style, ...(cmd.textData.style ?? {}) },
      };
      const newDoc = updateLayer(doc, cmd.layerId, {
        textData: newTextData,
        name: newTextData.content ? newTextData.content.slice(0, 20) : layer.name,
      });
      return {
        document: newDoc,
        ...pushHistory(state, makeHistoryEntry(
          'Edit text', src, { [layer.id]: snapshot }
        )),
      };
    }

    default:
      return {};
  }
}
