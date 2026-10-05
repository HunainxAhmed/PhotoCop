/**
 * PhotoCop - Command System
 *
 * ARCHITECTURAL PRINCIPLE: Every meaningful editor operation is represented as
 * a typed command. Human UI, AI, MCP, and scripting all go through this same
 * command system. Nothing mutates document state directly.
 *
 * Command flow:
 *   Source (UI/AI/MCP/Script)
 *     → CommandDispatcher.dispatch(command)
 *     → CommandHandler.execute(command, store)
 *     → Store mutation + History entry
 */

import type {
  Layer, BlendMode, AdjustmentData,
  CurvePoint, BrushSettings, Color, Point, Rect,
  Transform, TextData, CommandSource
} from './types';

// ─── Command Namespace ────────────────────────────────────────────────────────

/** Base for all commands */
export interface BaseCommand {
  source: CommandSource;
  description?: string; // human-readable label for history
}

// ─── Document Commands ────────────────────────────────────────────────────────

export interface CreateDocumentCommand extends BaseCommand {
  type: 'document.create';
  width: number;
  height: number;
  dpi?: number;
  title?: string;
  colorSpace?: string;
  backgroundColor?: Color | null;
}

export interface OpenImageCommand extends BaseCommand {
  type: 'document.open_image';
  /** dataURL or file path */
  src: string;
  title?: string;
}

export interface FlattenDocumentCommand extends BaseCommand {
  type: 'document.flatten';
}

// ─── Layer Commands ───────────────────────────────────────────────────────────

export interface CreateLayerCommand extends BaseCommand {
  type: 'layer.create';
  layerType: Layer['type'];
  name?: string;
  above?: string;   // layer ID to create above (null = top)
  width?: number;
  height?: number;
  fillColor?: Color | null;
}

export interface DeleteLayerCommand extends BaseCommand {
  type: 'layer.delete';
  layerId: string;
}

export interface RenameLayerCommand extends BaseCommand {
  type: 'layer.rename';
  layerId: string;
  name: string;
}

export interface SetLayerOpacityCommand extends BaseCommand {
  type: 'layer.set_opacity';
  layerId: string;
  opacity: number;   // 0–100
}

export interface SetLayerBlendModeCommand extends BaseCommand {
  type: 'layer.set_blend_mode';
  layerId: string;
  blendMode: BlendMode;
}

export interface SetLayerVisibilityCommand extends BaseCommand {
  type: 'layer.set_visibility';
  layerId: string;
  visible: boolean;
}

export interface SetActiveLayerCommand extends BaseCommand {
  type: 'layer.set_active';
  layerId: string;
}

export interface MoveLayerCommand extends BaseCommand {
  type: 'layer.move';
  layerId: string;
  /** New index in layerOrder (0 = top) */
  toIndex: number;
}

export interface MoveLayerAboveCommand extends BaseCommand {
  type: 'layer.move_above';
  layerId: string;
  targetLayerId: string;
}

export interface MoveLayerBelowCommand extends BaseCommand {
  type: 'layer.move_below';
  layerId: string;
  targetLayerId: string;
}

export interface DuplicateLayerCommand extends BaseCommand {
  type: 'layer.duplicate';
  layerId: string;
}

export interface GroupLayersCommand extends BaseCommand {
  type: 'layer.group';
  layerIds: string[];
  groupName?: string;
}

export interface UngroupLayersCommand extends BaseCommand {
  type: 'layer.ungroup';
  groupLayerId: string;
}

export interface TransformLayerCommand extends BaseCommand {
  type: 'layer.transform';
  layerId: string;
  transform: Partial<Transform>;
}

export interface SetClippingMaskCommand extends BaseCommand {
  type: 'layer.set_clipping_mask';
  layerId: string;
  clippingMask: boolean;
}

export interface MergeDownCommand extends BaseCommand {
  type: 'layer.merge_down';
  layerId: string;
}

export interface SetLayerLockedCommand extends BaseCommand {
  type: 'layer.set_locked';
  layerId: string;
  locked: boolean;
}

// ─── Pixel Commands ───────────────────────────────────────────────────────────

export interface PaintStrokeCommand extends BaseCommand {
  type: 'pixel.paint_stroke';
  layerId: string;
  points: Point[];
  brushSettings: BrushSettings;
  color: Color;
  eraseMode: boolean;
  toolMode?: 'brush' | 'pencil' | 'eraser' | 'blur' | 'sharpen' | 'dodge' | 'burn' | 'sponge';
}

export interface FillRegionCommand extends BaseCommand {
  type: 'pixel.fill';
  layerId: string;
  color: Color;
  /** If null, fills entire layer */
  selection?: Rect | null;
  opacity?: number;
  point?: Point;
}

export interface DrawGradientCommand extends BaseCommand {
  type: 'pixel.gradient';
  layerId: string;
  start: Point;
  end: Point;
  startColor: Color;
  endColor: Color;
  selection?: Rect | null;
}

export interface DrawShapeCommand extends BaseCommand {
  type: 'pixel.shape';
  layerId: string;
  shapeType: 'rectangle' | 'ellipse';
  rect: Rect;
  fillColor: Color;
  strokeColor?: Color | null;
  strokeWidth?: number;
}

export interface PastePixelsCommand extends BaseCommand {
  type: 'pixel.paste';
  layerId: string;
  imageData: ImageData;
  x: number;
  y: number;
}

// ─── Selection Commands ───────────────────────────────────────────────────────

export interface CreateRectSelectionCommand extends BaseCommand {
  type: 'selection.create_rect';
  rect: Rect;
  mode: 'replace' | 'add' | 'subtract' | 'intersect';
  feather?: number;
}

export interface CreateEllipseSelectionCommand extends BaseCommand {
  type: 'selection.create_ellipse';
  rect: Rect;
  mode: 'replace' | 'add' | 'subtract' | 'intersect';
  feather?: number;
}

export interface SelectAllCommand extends BaseCommand {
  type: 'selection.select_all';
}

export interface DeselectCommand extends BaseCommand {
  type: 'selection.deselect';
}

export interface InvertSelectionCommand extends BaseCommand {
  type: 'selection.invert';
}

export interface FeatherSelectionCommand extends BaseCommand {
  type: 'selection.feather';
  radius: number;
}

export interface ExpandSelectionCommand extends BaseCommand {
  type: 'selection.expand';
  pixels: number;
}

export interface ContractSelectionCommand extends BaseCommand {
  type: 'selection.contract';
  pixels: number;
}

// ─── Mask Commands ────────────────────────────────────────────────────────────

export interface CreateLayerMaskCommand extends BaseCommand {
  type: 'mask.create';
  layerId: string;
  fromSelection: boolean;
  inverted?: boolean;
}

export interface DeleteLayerMaskCommand extends BaseCommand {
  type: 'mask.delete';
  layerId: string;
}

export interface ToggleMaskCommand extends BaseCommand {
  type: 'mask.toggle';
  layerId: string;
  enabled: boolean;
}

export interface InvertMaskCommand extends BaseCommand {
  type: 'mask.invert';
  layerId: string;
}

export interface SetMaskFeatherCommand extends BaseCommand {
  type: 'mask.set_feather';
  layerId: string;
  feather: number;
}

export interface ApplyMaskCommand extends BaseCommand {
  type: 'mask.apply';
  layerId: string;
}

// ─── Adjustment Commands ──────────────────────────────────────────────────────

export interface CreateAdjustmentLayerCommand extends BaseCommand {
  type: 'adjustment.create';
  adjustment: AdjustmentData;
  above?: string;
  name?: string;
}

export interface SetAdjustmentCommand extends BaseCommand {
  type: 'adjustment.set';
  layerId: string;
  adjustment: AdjustmentData;
}

export interface SetCurvesPointsCommand extends BaseCommand {
  type: 'curves.set_points';
  layerId: string;
  channel: 'rgb' | 'r' | 'g' | 'b';
  points: CurvePoint[];
}

// ─── Filter Commands ──────────────────────────────────────────────────────────

export interface ApplyFilterCommand extends BaseCommand {
  type: 'filter.apply';
  layerId: string;
  filter: FilterDef;
}

export interface FilterDef {
  name: string;
  params: Record<string, number | string | boolean>;
}

// ─── Transform Commands ───────────────────────────────────────────────────────

export interface CropCommand extends BaseCommand {
  type: 'transform.crop';
  rect: Rect;
  maintainAspect?: boolean;
}

export interface RotateCommand extends BaseCommand {
  type: 'transform.rotate';
  layerId?: string | null;
  degrees: number;
  around?: Point;
}

export interface FlipCommand extends BaseCommand {
  type: 'transform.flip';
  layerId?: string | null;
  axis: 'horizontal' | 'vertical';
}

export interface ScaleCommand extends BaseCommand {
  type: 'transform.scale';
  layerId?: string | null;
  scaleX: number;
  scaleY: number;
  anchor?: Point;
}

// ─── Text Commands ────────────────────────────────────────────────────────────

export interface CreateTextLayerCommand extends BaseCommand {
  type: 'text.create';
  textData: TextData;
  position: Point;
}

export interface EditTextCommand extends BaseCommand {
  type: 'text.edit';
  layerId: string;
  textData: Partial<TextData>;
}

// ─── Viewport Commands ────────────────────────────────────────────────────────

export interface SetZoomCommand extends BaseCommand {
  type: 'viewport.set_zoom';
  zoom: number;
  anchor?: Point;
}

export interface PanCommand extends BaseCommand {
  type: 'viewport.pan';
  deltaX: number;
  deltaY: number;
}

export interface FitToWindowCommand extends BaseCommand {
  type: 'viewport.fit_to_window';
}

// ─── History Commands ─────────────────────────────────────────────────────────

export interface UndoCommand extends BaseCommand {
  type: 'history.undo';
}

export interface RedoCommand extends BaseCommand {
  type: 'history.redo';
}

export interface SnapshotCommand extends BaseCommand {
  type: 'history.snapshot';
  name: string;
}

// ─── Export Commands ──────────────────────────────────────────────────────────

export interface ExportImageCommand extends BaseCommand {
  type: 'export.image';
  format: 'png' | 'jpeg' | 'webp';
  quality?: number;   // 0–100 for jpeg/webp
  width?: number;
  height?: number;
}

// ─── Color Commands ───────────────────────────────────────────────────────────

export interface SetForegroundColorCommand extends BaseCommand {
  type: 'color.set_foreground';
  color: Color;
}

export interface SetBackgroundColorCommand extends BaseCommand {
  type: 'color.set_background';
  color: Color;
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type EditorCommand =
  // Document
  | CreateDocumentCommand
  | OpenImageCommand
  | FlattenDocumentCommand
  // Layers
  | CreateLayerCommand
  | DeleteLayerCommand
  | RenameLayerCommand
  | SetLayerOpacityCommand
  | SetLayerBlendModeCommand
  | SetLayerVisibilityCommand
  | SetActiveLayerCommand
  | MoveLayerCommand
  | MoveLayerAboveCommand
  | MoveLayerBelowCommand
  | DuplicateLayerCommand
  | GroupLayersCommand
  | UngroupLayersCommand
  | MergeDownCommand
  | TransformLayerCommand
  | SetClippingMaskCommand
  | SetLayerLockedCommand
  // Pixel
  | PaintStrokeCommand
  | FillRegionCommand
  | DrawGradientCommand
  | DrawShapeCommand
  | PastePixelsCommand
  // Selection
  | CreateRectSelectionCommand
  | CreateEllipseSelectionCommand
  | SelectAllCommand
  | DeselectCommand
  | InvertSelectionCommand
  | FeatherSelectionCommand
  | ExpandSelectionCommand
  | ContractSelectionCommand
  // Mask
  | CreateLayerMaskCommand
  | DeleteLayerMaskCommand
  | ToggleMaskCommand
  | InvertMaskCommand
  | SetMaskFeatherCommand
  | ApplyMaskCommand
  // Adjustment
  | CreateAdjustmentLayerCommand
  | SetAdjustmentCommand
  | SetCurvesPointsCommand
  // Filter
  | ApplyFilterCommand
  // Transform
  | CropCommand
  | RotateCommand
  | FlipCommand
  | ScaleCommand
  // Text
  | CreateTextLayerCommand
  | EditTextCommand
  // Viewport
  | SetZoomCommand
  | PanCommand
  | FitToWindowCommand
  // History
  | UndoCommand
  | RedoCommand
  | SnapshotCommand
  // Export
  | ExportImageCommand
  // Color
  | SetForegroundColorCommand
  | SetBackgroundColorCommand;
