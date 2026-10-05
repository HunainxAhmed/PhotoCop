/**
 * PhotoCop - Document Engine
 *
 * Creates, manages, and mutates document state.
 * All mutations happen through the command dispatcher.
 * This module contains pure functions that compute new document states.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Document, Layer, LayerType, Color, ColorProfile,
  Transform, BlendMode, AdjustmentData, TextData, MaskData
} from './types';

// ─── Default Values ───────────────────────────────────────────────────────────

export const DEFAULT_COLOR_PROFILE: ColorProfile = {
  space: 'sRGB',
  bitDepth: 8,
  linearized: false,
};

export const DEFAULT_TRANSFORM: Transform = {
  x: 0, y: 0,
  scaleX: 1, scaleY: 1,
  rotation: 0,
};

export const BLACK: Color = { r: 0, g: 0, b: 0, a: 255 };
export const WHITE: Color = { r: 255, g: 255, b: 255, a: 255 };
export const TRANSPARENT: Color = { r: 0, g: 0, b: 0, a: 0 };

// ─── Layer Factory ────────────────────────────────────────────────────────────

export function createLayer(
  type: LayerType,
  name: string,
  overrides: Partial<Layer> = {}
): Layer {
  return {
    id: uuidv4(),
    name,
    type,
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'Normal' as BlendMode,
    transform: { ...DEFAULT_TRANSFORM },
    mask: null,
    effects: [],
    clippingMask: false,
    metadata: {},
    ...overrides,
  };
}

export function createPixelLayer(
  width: number,
  height: number,
  name = 'Layer',
  fillColor: Color | null = null
): Layer {
  const imageData = new ImageData(width, height);
  if (fillColor) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i]     = fillColor.r;
      d[i + 1] = fillColor.g;
      d[i + 2] = fillColor.b;
      d[i + 3] = fillColor.a;
    }
  }
  return createLayer('pixel', name, { imageData });
}

export function createAdjustmentLayer(
  adjustment: AdjustmentData,
  name?: string
): Layer {
  const defaultNames: Record<string, string> = {
    curves: 'Curves',
    levels: 'Levels',
    hueSaturation: 'Hue/Saturation',
    brightnessContrast: 'Brightness/Contrast',
    colorBalance: 'Color Balance',
    invert: 'Invert',
    threshold: 'Threshold',
    posterize: 'Posterize',
  };
  return createLayer('adjustment', name ?? defaultNames[adjustment.type] ?? 'Adjustment', {
    adjustment,
  });
}

export function createGroupLayer(name = 'Group', childIds: string[] = []): Layer {
  return createLayer('group', name, { children: childIds });
}

export function createTextLayer(textData: TextData, name = 'Text Layer'): Layer {
  return createLayer('text', name, { textData });
}

export function createFillLayer(fillColor: Color, name = 'Fill Layer'): Layer {
  return createLayer('fill', name, { fillColor });
}

// ─── Document Factory ─────────────────────────────────────────────────────────

export function createDocument(
  width: number,
  height: number,
  title = 'Untitled',
  dpi = 72,
  backgroundColor: Color | null = WHITE
): Document {
  const docId = uuidv4();
  const now = new Date().toISOString();
  const layers: Record<string, Layer> = {};
  const layerOrder: string[] = [];

  if (backgroundColor) {
    const bg = createPixelLayer(width, height, 'Background', backgroundColor);
    bg.locked = true; // mirror Photoshop behavior
    layers[bg.id] = bg;
    layerOrder.push(bg.id);
  }

  return {
    id: docId,
    width,
    height,
    dpi,
    layers,
    layerOrder,
    activeLayerId: layerOrder[0] ?? null,
    metadata: {
      title,
      author: '',
      description: '',
      tags: [],
      createdAt: now,
      modifiedAt: now,
      colorProfile: { ...DEFAULT_COLOR_PROFILE },
    },
  };
}

// ─── Document Mutators (pure — return new Document) ────────────────────────────

export function addLayer(doc: Document, layer: Layer, aboveLayerId?: string | null): Document {
  const newLayers = { ...doc.layers, [layer.id]: layer };
  const targetId = aboveLayerId || doc.activeLayerId;

  if (targetId) {
    // Check if targetId is inside a group
    for (const [gid, g] of Object.entries(doc.layers)) {
      if (g.type === 'group' && g.children?.includes(targetId)) {
        const cIdx = g.children.indexOf(targetId);
        const newChildren = [...g.children];
        newChildren.splice(cIdx, 0, layer.id);
        newLayers[gid] = { ...g, children: newChildren };
        return {
          ...doc,
          layers: newLayers,
          activeLayerId: layer.id,
          metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
        };
      }
    }

    const newOrder = [...doc.layerOrder];
    const idx = newOrder.indexOf(targetId);
    if (idx !== -1) {
      newOrder.splice(idx, 0, layer.id);
    } else {
      newOrder.unshift(layer.id);
    }
    return {
      ...doc,
      layers: newLayers,
      layerOrder: newOrder,
      activeLayerId: layer.id,
      metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
    };
  }

  return {
    ...doc,
    layers: newLayers,
    layerOrder: [layer.id, ...doc.layerOrder],
    activeLayerId: layer.id,
    metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
  };
}

export function removeLayer(doc: Document, layerId: string): Document {
  const newLayers = { ...doc.layers };
  delete newLayers[layerId];
  const newOrder = doc.layerOrder.filter(id => id !== layerId);

  // Clean up any parent group referencing this deleted child
  for (const [gid, g] of Object.entries(newLayers)) {
    if (g.type === 'group' && g.children?.includes(layerId)) {
      newLayers[gid] = {
        ...g,
        children: g.children.filter(id => id !== layerId),
      };
    }
  }

  let newActiveId = doc.activeLayerId;
  if (newActiveId === layerId) {
    const idx = doc.layerOrder.indexOf(layerId);
    newActiveId = newOrder[Math.max(0, idx - 1)] ?? newOrder[0] ?? null;
  }

  return {
    ...doc,
    layers: newLayers,
    layerOrder: newOrder,
    activeLayerId: newActiveId,
    metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
  };
}

export function updateLayer(
  doc: Document,
  layerId: string,
  updates: Partial<Layer>
): Document {
  const existing = doc.layers[layerId];
  if (!existing) return doc;
  return {
    ...doc,
    layers: {
      ...doc.layers,
      [layerId]: { ...existing, ...updates },
    },
    metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
  };
}

export function reorderLayer(doc: Document, layerId: string, toIndex: number): Document {
  // If layerId is in root layerOrder
  if (doc.layerOrder.includes(layerId)) {
    const newOrder = doc.layerOrder.filter(id => id !== layerId);
    const clamped = Math.max(0, Math.min(toIndex, newOrder.length));
    newOrder.splice(clamped, 0, layerId);
    return {
      ...doc,
      layerOrder: newOrder,
      metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
    };
  }

  // If layerId is inside a group
  for (const [gid, group] of Object.entries(doc.layers)) {
    if (group.type === 'group' && group.children?.includes(layerId)) {
      const newChildren = group.children.filter(id => id !== layerId);
      const clamped = Math.max(0, Math.min(toIndex, newChildren.length));
      newChildren.splice(clamped, 0, layerId);
      const updatedGroup = { ...group, children: newChildren };
      return {
        ...doc,
        layers: { ...doc.layers, [gid]: updatedGroup },
        metadata: { ...doc.metadata, modifiedAt: new Date().toISOString() },
      };
    }
  }

  return doc;
}

export function duplicateLayer(doc: Document, layerId: string): Document {
  const source = doc.layers[layerId];
  if (!source) return doc;

  const newLayer: Layer = {
    ...source,
    id: uuidv4(),
    name: source.name + ' copy',
    // Deep-clone imageData if present
    imageData: source.imageData
      ? cloneImageData(source.imageData)
      : undefined,
    mask: source.mask
      ? {
          ...source.mask,
          imageData: source.mask.imageData
            ? cloneImageData(source.mask.imageData)
            : undefined,
        }
      : null,
    effects: source.effects.map(e => ({ ...e })),
    children: source.children ? [...source.children] : undefined,
  };

  return addLayer(doc, newLayer, layerId);
}

/** Complete clone of a Document including all layer snapshots */
export function cloneDocument(doc: Document): Document {
  const clonedLayers: Record<string, Layer> = {};
  for (const [id, layer] of Object.entries(doc.layers)) {
    clonedLayers[id] = snapshotLayer(layer);
  }
  return {
    ...doc,
    layers: clonedLayers,
    layerOrder: [...doc.layerOrder],
    metadata: { ...doc.metadata },
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function cloneImageData(src: ImageData): ImageData {
  const clone = new ImageData(src.width, src.height);
  clone.data.set(src.data);
  return clone;
}

export function createDefaultMask(width: number, height: number, filled = true): MaskData {
  const imageData = new ImageData(width, height);
  if (filled) {
    imageData.data.fill(255); // white = fully shown
  }
  return {
    enabled: true,
    inverted: false,
    feather: 0,
    density: 100,
    imageData,
  };
}

/** Get the flat ordered list of layers for compositing (top-most first) */
export function getFlatLayerOrder(doc: Document): Layer[] {
  const result: Layer[] = [];
  const visited = new Set<string>();

  function traverse(ids: string[]) {
    for (const id of ids) {
      if (visited.has(id)) continue;
      visited.add(id);
      const layer = doc.layers[id];
      if (!layer) continue;
      result.push(layer);
      if (layer.type === 'group' && layer.children) {
        traverse(layer.children);
      }
    }
  }

  traverse(doc.layerOrder);
  return result;
}

/** Compute tight bounding rect for a layer (accounting for transform) */
export function getLayerBounds(layer: Layer, docWidth: number, docHeight: number): {
  x: number; y: number; width: number; height: number
} {
  const iw = layer.imageData?.width ?? docWidth;
  const ih = layer.imageData?.height ?? docHeight;
  return {
    x: layer.transform.x,
    y: layer.transform.y,
    width: iw * layer.transform.scaleX,
    height: ih * layer.transform.scaleY,
  };
}

/** Generate a serializable snapshot of a layer for history */
export function snapshotLayer(layer: Layer): Layer {
  return {
    ...layer,
    imageData: layer.imageData ? cloneImageData(layer.imageData) : undefined,
    mask: layer.mask
      ? {
          ...layer.mask,
          imageData: layer.mask.imageData
            ? cloneImageData(layer.mask.imageData)
            : undefined,
        }
      : null,
    effects: [...layer.effects],
    children: layer.children ? [...layer.children] : undefined,
  };
}
