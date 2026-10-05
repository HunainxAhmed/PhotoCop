/**
 * PhotoCop - Persistent Project Storage
 *
 * Uses browser IndexedDB to persist documents, layers, and pixel data across page reloads.
 */

import type { Document, Layer } from './types';

const DB_NAME = 'PhotoCopDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const ACTIVE_DOC_KEY = 'active_document';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Serialize document including ImageData into serializable objects */
function serializeDocument(doc: Document): any {
  const serializableLayers: Record<string, any> = {};

  for (const [id, layer] of Object.entries(doc.layers)) {
    const sLayer: any = { ...layer };
    if (layer.imageData) {
      sLayer.imageData = {
        width: layer.imageData.width,
        height: layer.imageData.height,
        data: Array.from(layer.imageData.data),
      };
    }
    if (layer.mask?.imageData) {
      sLayer.mask = {
        ...layer.mask,
        imageData: {
          width: layer.mask.imageData.width,
          height: layer.mask.imageData.height,
          data: Array.from(layer.mask.imageData.data),
        },
      };
    }
    serializableLayers[id] = sLayer;
  }

  return {
    ...doc,
    layers: serializableLayers,
  };
}

/** Deserialize document restoring real ImageData instances */
function deserializeDocument(data: any): Document {
  const layers: Record<string, Layer> = {};

  for (const [id, sLayer] of Object.entries(data.layers as Record<string, any>)) {
    let imageData: ImageData | undefined;
    if (sLayer.imageData?.data) {
      const u8 = new Uint8ClampedArray(sLayer.imageData.data);
      imageData = new ImageData(u8, sLayer.imageData.width, sLayer.imageData.height);
    }

    let mask = sLayer.mask ?? null;
    if (mask?.imageData?.data) {
      const mu8 = new Uint8ClampedArray(mask.imageData.data);
      mask = {
        ...mask,
        imageData: new ImageData(mu8, mask.imageData.width, mask.imageData.height),
      };
    }

    layers[id] = {
      ...sLayer,
      imageData,
      mask,
    };
  }

  return {
    ...data,
    layers,
  };
}

let saveTimeout: any = null;

export function scheduleSaveDocument(doc: Document | null): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  if (!doc) {
    clearDocumentStorage();
    return;
  }
  saveTimeout = setTimeout(async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const serialized = serializeDocument(doc);
      store.put(serialized, ACTIVE_DOC_KEY);
    } catch {
      // Storage errors are non-fatal
    }
  }, 400);
}

export async function loadDocumentFromStorage(): Promise<Document | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(ACTIVE_DOC_KEY);
      req.onsuccess = () => {
        if (req.result) {
          try {
            resolve(deserializeDocument(req.result));
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearDocumentStorage(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(ACTIVE_DOC_KEY);
  } catch {
    // Ignore
  }
}
