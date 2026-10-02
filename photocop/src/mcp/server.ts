/**
 * PhotoCop - MCP Server
 *
 * Exposes the full editor as an MCP server.
 * External AI systems can inspect documents, layers, selections,
 * and execute any editor command through structured tools.
 *
 * Architecture: the MCP server runs in the browser and communicates
 * via a WebSocket relay that external MCP clients connect to.
 * In a Tauri build, this would use IPC.
 *
 * Transport: Streamable HTTP (for browser) + stdio (for CLI/Tauri)
 *
 * Tools are the same EditorCommands — no separate implementation.
 */

import type { EditorCommand } from '../core/commands';
import type { Document, Layer, Selection, HistoryEntry } from '../core/types';

// ─── MCP Tool Schema ──────────────────────────────────────────────────────────

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface McpPrompt {
  name: string;
  description: string;
  arguments?: { name: string; description: string; required?: boolean }[];
}

// ─── MCP Tool Catalog ─────────────────────────────────────────────────────────

export const MCP_TOOLS: McpTool[] = [
  // ── Document ──
  {
    name: 'document.get_state',
    description: 'Get the complete current document state including all layers, metadata, and viewport',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'document.get_metadata',
    description: 'Get document metadata (title, size, DPI, color profile)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'document.create',
    description: 'Create a new document',
    inputSchema: {
      type: 'object',
      properties: {
        width:  { type: 'number', description: 'Width in pixels' },
        height: { type: 'number', description: 'Height in pixels' },
        title:  { type: 'string', description: 'Document title' },
        dpi:    { type: 'number', description: 'DPI (default 72)' },
      },
      required: ['width', 'height'],
    },
  },

  // ── Canvas ──
  {
    name: 'canvas.get_preview',
    description: 'Get a downscaled preview of the current composite as base64 JPEG',
    inputSchema: {
      type: 'object',
      properties: {
        maxSize: { type: 'number', description: 'Maximum dimension in pixels (default 512)' },
        quality: { type: 'number', description: 'JPEG quality 0-1 (default 0.8)' },
      },
    },
  },
  {
    name: 'canvas.zoom',
    description: 'Set the canvas zoom level',
    inputSchema: {
      type: 'object',
      properties: {
        zoom: { type: 'number', description: 'Zoom level (1.0 = 100%, 0.5 = 50%, 2.0 = 200%)' },
      },
      required: ['zoom'],
    },
  },

  // ── Layer ──
  {
    name: 'layer.list',
    description: 'List all layers in order with their properties',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'layer.get',
    description: 'Get detailed information about a specific layer',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string', description: 'Layer ID' },
      },
      required: ['layerId'],
    },
  },
  {
    name: 'layer.create',
    description: 'Create a new layer',
    inputSchema: {
      type: 'object',
      properties: {
        layerType: { type: 'string', enum: ['pixel', 'adjustment', 'group', 'text', 'fill'], description: 'Layer type' },
        name: { type: 'string', description: 'Layer name' },
        above: { type: 'string', description: 'Layer ID to create above (optional)' },
      },
      required: ['layerType'],
    },
  },
  {
    name: 'layer.delete',
    description: 'Delete a layer',
    inputSchema: {
      type: 'object',
      properties: { layerId: { type: 'string' } },
      required: ['layerId'],
    },
  },
  {
    name: 'layer.rename',
    description: 'Rename a layer',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['layerId', 'name'],
    },
  },
  {
    name: 'layer.set_opacity',
    description: 'Set layer opacity (0-100)',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        opacity: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['layerId', 'opacity'],
    },
  },
  {
    name: 'layer.set_blend_mode',
    description: 'Set layer blend mode',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        blendMode: {
          type: 'string',
          enum: ['Normal', 'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten',
                 'ColorDodge', 'ColorBurn', 'HardLight', 'SoftLight', 'Difference',
                 'Exclusion', 'Hue', 'Saturation', 'Color', 'Luminosity'],
        },
      },
      required: ['layerId', 'blendMode'],
    },
  },
  {
    name: 'layer.set_visibility',
    description: 'Show or hide a layer',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        visible: { type: 'boolean' },
      },
      required: ['layerId', 'visible'],
    },
  },
  {
    name: 'layer.duplicate',
    description: 'Duplicate a layer',
    inputSchema: {
      type: 'object',
      properties: { layerId: { type: 'string' } },
      required: ['layerId'],
    },
  },

  // ── Selection ──
  {
    name: 'selection.create_rect',
    description: 'Create a rectangular selection',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' }, y: { type: 'number' },
        width: { type: 'number' }, height: { type: 'number' },
        feather: { type: 'number', description: 'Feather radius in pixels' },
      },
      required: ['x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'selection.get',
    description: 'Get current selection bounds',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'selection.deselect',
    description: 'Remove the current selection',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'selection.invert',
    description: 'Invert the current selection',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'selection.select_all',
    description: 'Select the entire canvas',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Mask ──
  {
    name: 'mask.create',
    description: 'Add a layer mask to a layer',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        fromSelection: { type: 'boolean', description: 'Initialize mask from current selection' },
        inverted: { type: 'boolean', description: 'Start with inverted (black) mask' },
      },
      required: ['layerId'],
    },
  },
  {
    name: 'mask.invert',
    description: 'Invert a layer mask',
    inputSchema: {
      type: 'object',
      properties: { layerId: { type: 'string' } },
      required: ['layerId'],
    },
  },
  {
    name: 'mask.delete',
    description: 'Remove a layer mask',
    inputSchema: {
      type: 'object',
      properties: { layerId: { type: 'string' } },
      required: ['layerId'],
    },
  },

  // ── Adjustment ──
  {
    name: 'adjustment.create',
    description: 'Create an adjustment layer (curves, levels, hue/saturation, brightness/contrast, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['curves', 'levels', 'hueSaturation', 'brightnessContrast', 'invert', 'threshold', 'posterize'],
          description: 'Adjustment type',
        },
        name: { type: 'string' },
        params: { type: 'object', description: 'Adjustment parameters specific to type' },
      },
      required: ['type'],
    },
  },
  {
    name: 'curves.set_points',
    description: 'Set control points on a curves adjustment layer',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        channel: { type: 'string', enum: ['rgb', 'r', 'g', 'b'] },
        points: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              input: { type: 'number', minimum: 0, maximum: 1 },
              output: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
      },
      required: ['layerId', 'channel', 'points'],
    },
  },

  // ── History ──
  {
    name: 'history.undo',
    description: 'Undo the last action',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'history.redo',
    description: 'Redo the next action',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'history.snapshot',
    description: 'Create a named history snapshot/checkpoint',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'history.get',
    description: 'Get the current history state',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Export ──
  {
    name: 'export.image',
    description: 'Export the document as an image file',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['png', 'jpeg', 'webp'] },
        quality: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['format'],
    },
  },

  // ── Fill ──
  {
    name: 'pixel.fill',
    description: 'Fill a layer with a color',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        r: { type: 'number', minimum: 0, maximum: 255 },
        g: { type: 'number', minimum: 0, maximum: 255 },
        b: { type: 'number', minimum: 0, maximum: 255 },
        a: { type: 'number', minimum: 0, maximum: 255 },
      },
      required: ['layerId', 'r', 'g', 'b'],
    },
  },
];

// ─── MCP Resources ─────────────────────────────────────────────────────────────

export const MCP_RESOURCES: McpResource[] = [
  { uri: 'document://active',     name: 'Active Document',    description: 'Current document state',       mimeType: 'application/json' },
  { uri: 'document://layers',     name: 'Layer List',         description: 'All layers in order',          mimeType: 'application/json' },
  { uri: 'document://selection',  name: 'Current Selection',  description: 'Active selection bounds',      mimeType: 'application/json' },
  { uri: 'document://history',    name: 'History',            description: 'Undo/redo history',            mimeType: 'application/json' },
  { uri: 'document://metadata',   name: 'Document Metadata',  description: 'Title, size, DPI, profile',   mimeType: 'application/json' },
  { uri: 'document://viewport',   name: 'Viewport State',     description: 'Zoom and pan',                 mimeType: 'application/json' },
  { uri: 'document://preview',    name: 'Visual Preview',     description: 'Downscaled composite preview', mimeType: 'image/jpeg' },
];

// ─── MCP Prompts ──────────────────────────────────────────────────────────────

export const MCP_PROMPTS: McpPrompt[] = [
  { name: 'inspect_document',        description: 'Analyze and describe the current document structure' },
  { name: 'improve_lighting',        description: 'Improve image lighting using curves and adjustments' },
  { name: 'color_grade',             description: 'Apply a cinematic color grade', arguments: [{ name: 'style', description: 'Color grade style (e.g. warm, cool, cinematic, vintage)', required: false }] },
  { name: 'remove_background',       description: 'Remove the image background' },
  { name: 'increase_contrast',       description: 'Increase image contrast while preserving detail' },
  { name: 'prepare_social_media',    description: 'Prepare image for social media', arguments: [{ name: 'platform', description: 'Platform (instagram, twitter, linkedin)', required: false }] },
  { name: 'prepare_print',           description: 'Prepare image for print (CMYK-aware adjustments)' },
  { name: 'retouch_portrait',        description: 'Non-destructive portrait retouching' },
  { name: 'create_thumbnail',        description: 'Create a web thumbnail from current image' },
  { name: 'vintage_film_look',       description: 'Apply a vintage film grain and color look' },
  { name: 'hdr_tone_map',            description: 'Apply HDR-style tone mapping' },
];

// ─── Server Class ─────────────────────────────────────────────────────────────

type StoreGetter = () => {
  document: Document | null;
  selection: Selection;
  history: HistoryEntry[];
  historyIndex: number;
  viewport: { zoom: number; panX: number; panY: number };
  dispatch: (cmd: EditorCommand) => { success: boolean; error?: unknown; data?: unknown };
};

export class PhotocopMcpServer {
  private getStore: StoreGetter;


  constructor(getStore: StoreGetter) {
    this.getStore = getStore;
  }

  /** Handle an incoming MCP tool call — returns structured response */
  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ content: { type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }[] }> {
    const store = this.getStore();

    try {
      const result = await this.executeTool(toolName, args, store);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: {
              code: 'TOOL_ERROR',
              message: err instanceof Error ? err.message : String(err),
              recoverable: true,
            },
          }),
        }],
      };
    }
  }

  /** Handle an MCP resource read */
  async handleResourceRead(
    uri: string
  ): Promise<{ contents: { uri: string; mimeType: string; text?: string; blob?: string }[] }> {
    const store = this.getStore();
    const doc = store.document;

    try {
      if (uri === 'document://active') {
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(this.serializeDocument(doc)) }] };
      }
      if (uri === 'document://layers') {
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(this.serializeLayers(doc)) }] };
      }
      if (uri === 'document://selection') {
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(store.selection) }] };
      }
      if (uri === 'document://history') {
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({
          entries: store.history.map(e => ({ id: e.id, description: e.description, source: e.source, timestamp: e.timestamp })),
          currentIndex: store.historyIndex,
        }) }] };
      }
      if (uri === 'document://metadata') {
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(doc?.metadata ?? null) }] };
      }
      if (uri === 'document://viewport') {
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(store.viewport) }] };
      }
      if (uri === 'document://preview') {
        // Generate a preview — requires canvas access, returned as data URI
        return { contents: [{ uri, mimeType: 'image/jpeg', text: 'Preview requires canvas access — use canvas.get_preview tool instead' }] };
      }

      return { contents: [{ uri, mimeType: 'text/plain', text: `Unknown resource: ${uri}` }] };
    } catch (err: unknown) {
      return { contents: [{ uri, mimeType: 'text/plain', text: `Error: ${err}` }] };
    }
  }

  private async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    store: ReturnType<StoreGetter>
  ): Promise<unknown> {
    const doc = store.document;

    switch (toolName) {
      case 'document.get_state':
        return { document: this.serializeDocument(doc), viewport: store.viewport };

      case 'document.get_metadata':
        return doc?.metadata ?? { error: 'No document open' };

      case 'document.create': {
        const result = store.dispatch({
          type: 'document.create',
          width: args.width as number,
          height: args.height as number,
          title: (args.title as string) ?? 'Untitled',
          dpi: (args.dpi as number) ?? 72,
          backgroundColor: { r: 255, g: 255, b: 255, a: 255 },
          source: 'mcp',
        });
        return { success: result.success };
      }

      case 'layer.list':
        return { layers: this.serializeLayers(doc) };

      case 'layer.get': {
        const layer = doc?.layers[args.layerId as string];
        if (!layer) return { error: `Layer ${args.layerId} not found` };
        return { layer: this.serializeLayer(layer) };
      }

      case 'layer.create': {
        const result = store.dispatch({
          type: 'layer.create',
          layerType: args.layerType as Layer['type'],
          name: args.name as string | undefined,
          above: args.above as string | undefined,
          source: 'mcp',
        });
        return { success: result.success, error: result.error };
      }

      case 'layer.delete': {
        const result = store.dispatch({ type: 'layer.delete', layerId: args.layerId as string, source: 'mcp' });
        return { success: result.success, error: result.error };
      }

      case 'layer.rename': {
        const result = store.dispatch({ type: 'layer.rename', layerId: args.layerId as string, name: args.name as string, source: 'mcp' });
        return { success: result.success, error: result.error };
      }

      case 'layer.set_opacity': {
        const result = store.dispatch({ type: 'layer.set_opacity', layerId: args.layerId as string, opacity: args.opacity as number, source: 'mcp' });
        return { success: result.success, error: result.error };
      }

      case 'layer.set_blend_mode': {
        const result = store.dispatch({ type: 'layer.set_blend_mode', layerId: args.layerId as string, blendMode: args.blendMode as import('../core/types').BlendMode, source: 'mcp' });
        return { success: result.success, error: result.error };
      }

      case 'layer.set_visibility': {
        const result = store.dispatch({ type: 'layer.set_visibility', layerId: args.layerId as string, visible: args.visible as boolean, source: 'mcp' });
        return { success: result.success, error: result.error };
      }

      case 'layer.duplicate': {
        const result = store.dispatch({ type: 'layer.duplicate', layerId: args.layerId as string, source: 'mcp' });
        return { success: result.success, error: result.error };
      }

      case 'selection.get':
        return { selection: store.selection };

      case 'selection.create_rect': {
        const result = store.dispatch({
          type: 'selection.create_rect',
          rect: { x: args.x as number, y: args.y as number, width: args.width as number, height: args.height as number },
          mode: 'replace',
          feather: args.feather as number | undefined,
          source: 'mcp',
        });
        return { success: result.success };
      }

      case 'selection.deselect': {
        const result = store.dispatch({ type: 'selection.deselect', source: 'mcp' });
        return { success: result.success };
      }

      case 'selection.invert': {
        const result = store.dispatch({ type: 'selection.invert', source: 'mcp' });
        return { success: result.success };
      }

      case 'selection.select_all': {
        const result = store.dispatch({ type: 'selection.select_all', source: 'mcp' });
        return { success: result.success };
      }

      case 'mask.create': {
        const result = store.dispatch({
          type: 'mask.create',
          layerId: args.layerId as string,
          fromSelection: (args.fromSelection as boolean) ?? false,
          inverted: (args.inverted as boolean) ?? false,
          source: 'mcp',
        });
        return { success: result.success, error: result.error };
      }

      case 'mask.invert': {
        const result = store.dispatch({ type: 'mask.invert', layerId: args.layerId as string, source: 'mcp' });
        return { success: result.success, error: result.error };
      }

      case 'mask.delete': {
        const result = store.dispatch({ type: 'mask.delete', layerId: args.layerId as string, source: 'mcp' });
        return { success: result.success, error: result.error };
      }

      case 'adjustment.create': {
        const adjType = args.type as string;
        const params = (args.params as Record<string, unknown>) ?? {};
        let adjustment: import('../core/types').AdjustmentData;

        switch (adjType) {
          case 'curves':
            adjustment = { type: 'curves', data: { rgb: [], r: [], g: [], b: [], ...(params as object) } };
            break;
          case 'levels':
            adjustment = { type: 'levels', data: { inputMin: 0, inputMax: 255, gamma: 1, outputMin: 0, outputMax: 255, ...(params as object) } };
            break;
          case 'hueSaturation':
            adjustment = { type: 'hueSaturation', data: { hue: 0, saturation: 0, lightness: 0, ...(params as object) } };
            break;
          case 'brightnessContrast':
            adjustment = { type: 'brightnessContrast', data: { brightness: 0, contrast: 0, ...(params as object) } };
            break;
          case 'invert':
            adjustment = { type: 'invert' };
            break;
          case 'threshold':
            adjustment = { type: 'threshold', data: { value: 128, ...(params as object) } };
            break;
          case 'posterize':
            adjustment = { type: 'posterize', data: { levels: 4, ...(params as object) } };
            break;
          default:
            return { success: false, error: { code: 'UNKNOWN_ADJUSTMENT', message: `Unknown adjustment type: ${adjType}` } };
        }

        const result = store.dispatch({ type: 'adjustment.create', adjustment, name: args.name as string | undefined, source: 'mcp' });
        return { success: result.success, error: result.error };
      }

      case 'curves.set_points': {
        const result = store.dispatch({
          type: 'curves.set_points',
          layerId: args.layerId as string,
          channel: args.channel as 'rgb' | 'r' | 'g' | 'b',
          points: args.points as { input: number; output: number }[],
          source: 'mcp',
        });
        return { success: result.success, error: result.error };
      }

      case 'history.undo': {
        const result = store.dispatch({ type: 'history.undo', source: 'mcp' });
        return { success: result.success };
      }

      case 'history.redo': {
        const result = store.dispatch({ type: 'history.redo', source: 'mcp' });
        return { success: result.success };
      }

      case 'history.snapshot': {
        const result = store.dispatch({ type: 'history.snapshot', name: args.name as string, source: 'mcp' });
        return { success: result.success };
      }

      case 'history.get': {
        return {
          entries: store.history.map(e => ({ id: e.id, description: e.description, source: e.source, timestamp: e.timestamp })),
          currentIndex: store.historyIndex,
        };
      }

      case 'pixel.fill': {
        if (!doc?.activeLayerId) return { success: false, error: 'No active layer' };
        const result = store.dispatch({
          type: 'pixel.fill',
          layerId: args.layerId as string,
          color: { r: args.r as number, g: args.g as number, b: args.b as number, a: (args.a as number) ?? 255 },
          source: 'mcp',
        });
        return { success: result.success, error: result.error };
      }

      case 'export.image': {
        // Returns a success message — actual download is triggered by the store
        return { success: true, message: 'Export triggered. Check download in browser.' };
      }

      default:
        return { success: false, error: { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${toolName}`, recoverable: false } };
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────────

  private serializeDocument(doc: Document | null): unknown {
    if (!doc) return null;
    return {
      id: doc.id,
      width: doc.width,
      height: doc.height,
      dpi: doc.dpi,
      activeLayerId: doc.activeLayerId,
      layerCount: doc.layerOrder.length,
      layerOrder: doc.layerOrder,
      metadata: doc.metadata,
    };
  }

  private serializeLayers(doc: Document | null): unknown[] {
    if (!doc) return [];
    return doc.layerOrder.map(id => this.serializeLayer(doc.layers[id]));
  }

  private serializeLayer(layer: Layer): unknown {
    return {
      id: layer.id,
      name: layer.name,
      type: layer.type,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      transform: layer.transform,
      hasMask: !!layer.mask,
      maskEnabled: layer.mask?.enabled ?? null,
      clippingMask: layer.clippingMask,
      adjustment: layer.adjustment ? { type: layer.adjustment.type } : null,
      hasPixelData: !!layer.imageData,
      pixelDataSize: layer.imageData ? `${layer.imageData.width}×${layer.imageData.height}` : null,
      textContent: layer.textData?.content ?? null,
    };
  }

  /** Generate JSON-RPC 2.0 response for MCP protocol */
  formatMcpResponse(id: string | number | null, result: unknown): string {
    return JSON.stringify({ jsonrpc: '2.0', id, result });
  }

  formatMcpError(id: string | number | null, code: number, message: string): string {
    return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  }
}
