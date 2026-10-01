/**
 * PhotoCop - Core Type Definitions
 * Foundation types for the document engine, command system, and layer model.
 */

// ─── Geometry ───────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
}

// ─── Color ──────────────────────────────────────────────────────────────────

export type ColorSpace = 'sRGB' | 'DisplayP3' | 'AdobeRGB' | 'Grayscale';
export type BitDepth = 8 | 16 | 32;

export interface Color {
  r: number; // 0–255
  g: number;
  b: number;
  a: number;
}

export interface ColorProfile {
  space: ColorSpace;
  bitDepth: BitDepth;
  linearized: boolean;
}

// ─── Blend Modes ────────────────────────────────────────────────────────────

export type BlendMode =
  | 'Normal' | 'Dissolve'
  | 'Darken' | 'Multiply' | 'ColorBurn' | 'LinearBurn'
  | 'Lighten' | 'Screen' | 'ColorDodge' | 'LinearDodge'
  | 'Overlay' | 'SoftLight' | 'HardLight' | 'VividLight' | 'LinearLight' | 'PinLight'
  | 'Difference' | 'Exclusion' | 'Subtract' | 'Divide'
  | 'Hue' | 'Saturation' | 'Color' | 'Luminosity';

// ─── Layer Types ─────────────────────────────────────────────────────────────

export type LayerType =
  | 'pixel'
  | 'group'
  | 'adjustment'
  | 'fill'
  | 'text'
  | 'vector'
  | 'mask'
  | 'shape'
  | 'smartObject';

// ─── Layer Effects ───────────────────────────────────────────────────────────

export interface DropShadowEffect {
  type: 'dropShadow';
  enabled: boolean;
  color: Color;
  opacity: number;
  angle: number;
  distance: number;
  spread: number;
  blur: number;
}

export interface InnerShadowEffect {
  type: 'innerShadow';
  enabled: boolean;
  color: Color;
  opacity: number;
  angle: number;
  distance: number;
  blur: number;
}

export interface OuterGlowEffect {
  type: 'outerGlow';
  enabled: boolean;
  color: Color;
  opacity: number;
  blur: number;
}

export type LayerEffect = DropShadowEffect | InnerShadowEffect | OuterGlowEffect;

// ─── Adjustment Data ─────────────────────────────────────────────────────────

export interface CurvePoint {
  input: number;  // 0–1
  output: number; // 0–1
}

export interface CurvesData {
  rgb: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

export interface LevelsData {
  inputMin: number;
  inputMax: number;
  gamma: number;
  outputMin: number;
  outputMax: number;
}

export interface HueSaturationData {
  hue: number;        // -180 to 180
  saturation: number; // -100 to 100
  lightness: number;  // -100 to 100
}

export interface BrightnessContrastData {
  brightness: number; // -150 to 150
  contrast: number;   // -50 to 100
}

export interface ColorBalanceData {
  shadows: [number, number, number];
  midtones: [number, number, number];
  highlights: [number, number, number];
  preserveLuminosity: boolean;
}

export type AdjustmentData =
  | { type: 'curves'; data: CurvesData }
  | { type: 'levels'; data: LevelsData }
  | { type: 'hueSaturation'; data: HueSaturationData }
  | { type: 'brightnessContrast'; data: BrightnessContrastData }
  | { type: 'colorBalance'; data: ColorBalanceData }
  | { type: 'invert' }
  | { type: 'threshold'; data: { value: number } }
  | { type: 'posterize'; data: { levels: number } };

// ─── Text Data ───────────────────────────────────────────────────────────────

export interface TextStyle {
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  fontSize: number;
  color: Color;
  letterSpacing: number;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'right' | 'justify';
}

export interface TextData {
  content: string;
  style: TextStyle;
}

// ─── Vector Data ─────────────────────────────────────────────────────────────

export interface VectorAnchor {
  point: Point;
  handleIn?: Point;
  handleOut?: Point;
}

export interface VectorPath {
  anchors: VectorAnchor[];
  closed: boolean;
  fillColor?: Color;
  strokeColor?: Color;
  strokeWidth: number;
}

// ─── Mask ───────────────────────────────────────────────────────────────────

export interface MaskData {
  enabled: boolean;
  inverted: boolean;
  feather: number;  // pixels
  density: number;  // 0–100
  /** If imageData is null, mask exists as architecture but has no pixel data yet */
  imageData?: ImageData;
}

// ─── Layer ──────────────────────────────────────────────────────────────────

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;         // 0–100
  blendMode: BlendMode;
  transform: Transform;
  mask: MaskData | null;
  effects: LayerEffect[];
  clippingMask: boolean;   // clips to layer below
  metadata: Record<string, unknown>;

  // Type-specific data
  imageData?: ImageData;       // pixel layer
  children?: string[];         // group: child layer IDs
  adjustment?: AdjustmentData; // adjustment layer
  textData?: TextData;         // text layer
  vectorPaths?: VectorPath[];  // vector layer
  fillColor?: Color;           // fill layer
}

// ─── Document ───────────────────────────────────────────────────────────────

export interface DocumentMetadata {
  title: string;
  author: string;
  description: string;
  tags: string[];
  createdAt: string;
  modifiedAt: string;
  colorProfile: ColorProfile;
}

export interface Document {
  id: string;
  width: number;
  height: number;
  dpi: number;
  layers: Record<string, Layer>;
  layerOrder: string[];    // top-to-bottom rendering order (index 0 = topmost)
  activeLayerId: string | null;
  metadata: DocumentMetadata;
}

// ─── Selection ───────────────────────────────────────────────────────────────

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';

export interface Selection {
  /** Pixel mask: 0 = not selected, 255 = fully selected, intermediate = partial */
  maskData?: Uint8Array;
  width: number;
  height: number;
  bounds: Rect | null;
  feather: number;
}

// ─── Tool Types ──────────────────────────────────────────────────────────────

export type ToolId =
  | 'move' | 'transform' | 'crop' | 'eyedropper'
  | 'marqueeRect' | 'marqueeEllipse' | 'lasso' | 'polygonalLasso' | 'magicWand'
  | 'brush' | 'pencil' | 'eraser' | 'clone' | 'healing' | 'smudge'
  | 'fill' | 'gradient'
  | 'dodge' | 'burn' | 'sponge' | 'blur' | 'sharpen'
  | 'text' | 'vector' | 'shape'
  | 'hand' | 'zoom';

export interface ToolState {
  activeTool: ToolId;
  previousTool: ToolId;
}

// ─── Brush Settings ──────────────────────────────────────────────────────────

export interface BrushSettings {
  size: number;        // px diameter
  hardness: number;    // 0–100
  opacity: number;     // 0–100
  flow: number;        // 0–100
  spacing: number;     // 0–200%
  angle: number;       // degrees
  roundness: number;   // 0–100
  pressureSensitivity: boolean;
}

// ─── Canvas / Viewport ───────────────────────────────────────────────────────

export interface Viewport {
  zoom: number;      // 1.0 = 100%
  panX: number;      // canvas offset X in screen pixels
  panY: number;      // canvas offset Y in screen pixels
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string;
  timestamp: number;
  description: string;
  source: CommandSource;
  // Snapshot of layers involved for partial undo
  layerSnapshots: Record<string, Layer>;
  selectionSnapshot?: Selection;
}

export interface HistoryState {
  entries: HistoryEntry[];
  currentIndex: number; // points to the "current" state (after apply)
  maxEntries: number;
}

// ─── Commands ────────────────────────────────────────────────────────────────

export type CommandSource = 'user' | 'ai' | 'mcp' | 'script' | 'macro';

export interface CommandResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
    details?: unknown;
  };
  data?: unknown;
  historyEntryId?: string;
}

// ─── MCP Types ───────────────────────────────────────────────────────────────

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  url?: string;
  enabled: boolean;
  trusted: boolean;
  permissions: McpPermissions;
}

export interface McpPermissions {
  readDocument: boolean;
  readPixels: boolean;
  modifyPixels: boolean;
  modifyLayers: boolean;
  createFiles: boolean;
  deleteFiles: boolean;
  exportFiles: boolean;
  accessNetwork: boolean;
  useImageGeneration: boolean;
}

// ─── AI Provider ─────────────────────────────────────────────────────────────

export type AiProviderType = 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom';

export interface AiProviderConfig {
  id: string;
  name: string;
  type: AiProviderType;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  enabled: boolean;
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export interface AppSettings {
  theme: 'dark' | 'light';
  language: string;
  performanceMonitor: boolean;
  autosaveInterval: number;   // minutes, 0 = disabled
  maxHistoryEntries: number;
  aiApprovalMode: 'always' | 'smart' | 'autonomous';
  activeAiProviderId: string | null;
  providers: AiProviderConfig[];
  mcpServers: McpServerConfig[];
}
