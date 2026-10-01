<div align="center">

# 🎨 PhotoCop

### **The AI-Native Professional Image Editor & Programmable Graphics Engine**

*Built for precision human creativity and autonomous AI agent workflows via Model Context Protocol (MCP).*

---

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![MCP Native](https://img.shields.io/badge/MCP-Native_30+_Tools-8B5CF6?style=for-the-badge&logo=anthropic&logoColor=white)](https://modelcontextprotocol.io/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](https://github.com/HunainxAhmed/PhotoCop/pulls)

<br/>

<p align="center">
  <img src="assets/hero.png" alt="PhotoCop Workspace & Canvas" width="850" style="border-radius: 12px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);" />
</p>

</div>

---

## 📑 Table of Contents

- [Vision & Philosophy](#-vision--philosophy)
- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
  - [1. Command-Driven State Pipeline](#1-command-driven-state-pipeline)
  - [2. Non-Destructive Layer System](#2-non-destructive-layer-system)
  - [3. All 24 Photoshop Blend Modes](#3-all-24-photoshop-blend-modes)
  - [4. Dual AI Operation (In-App + MCP)](#4-dual-ai-operation-in-app--mcp)
  - [5. Precision Brush & Canvas Engine](#5-precision-brush--canvas-engine)
- [Model Context Protocol (MCP) Server](#-model-context-protocol-mcp-server)
  - [Connecting External Agents](#connecting-external-agents)
  - [MCP Tool Catalog](#mcp-tool-catalog)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [Quick Start](#-quick-start)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Starting the Editor](#starting-the-editor)
  - [Building for Production](#building-for-production)
- [AI Panel Configuration](#-ai-panel-configuration)
- [Project Structure](#-project-structure)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## 💡 Vision & Philosophy

Traditional creative suites (like Adobe Photoshop and GIMP) were architected for manual human cursor interaction. Meanwhile, modern generative AI tools operate as opaque, single-prompt black boxes lacking fine-grained spatial and non-destructive layer control.

**PhotoCop bridges this divide.** It is a full-fledged, GPU-accelerated graphic manipulation suite where:
1. **Humans** get a professional, tactile UI with layers, masks, curves, clone stamps, and familiar shortcuts.
2. **AI Agents** get a programmatic, deterministic API via the **Model Context Protocol (MCP)** and structured command streams.
3. **Every action**—whether initiated by a mouse drag, a hotkey, an in-app LLM, or an external agent over MCP—passes through the exact same typed command pipeline with complete undo/redo provenance.

---

## 🏗 System Architecture

```
                  ┌───────────────────────────────────────────────┐
                  │                INPUT SOURCES                  │
                  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
                  │  │ Human UI │  │ AI Panel │  │  MCP Server  │ │
                  │  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
                  └───────┼─────────────┼───────────────┼─────────┘
                          │             │               │
                          ▼             ▼               ▼
                 ═════════════════════════════════════════════════
                       Unified Command Dispatcher: dispatch(cmd)
                 ═════════════════════════════════════════════════
                                        │
                      ┌─────────────────┴─────────────────┐
                      ▼                                   ▼
         ┌─────────────────────────┐         ┌─────────────────────────┐
         │     Document Store      │         │      History Stack      │
         │  • Layer Hierarchy      │         │  • 100-step Undo/Redo   │
         │  • Blend Modes & Masks  │         │  • Source Attribution   │
         │  • Viewport & Selection │         │    (User / AI / MCP)    │
         └────────────┬────────────┘         └─────────────────────────┘
                      │
                      ▼
         ┌─────────────────────────────────────────────────────────────┐
         │            High-Performance Canvas Compositor               │
         │  • Offscreen Canvas Buffers                                 │
         │  • 24 Blend Modes (per-pixel math + CSS compositing)        │
         │  • Transform matrices (Scale, Rotate, Translate)            │
         │  • Dirty-rect invalidation via RAF renderVersion            │
         └─────────────────────────────┬───────────────────────────────┘
                                       │
                                       ▼
                            [ Interactive Canvas View ]
```

---

## ✨ Key Features

### 1. Command-Driven State Pipeline
Every mutation in PhotoCop is expressed as an explicit, serializable `EditorCommand`:
- `pixel.paint_stroke`, `pixel.flood_fill`, `pixel.clone_stamp`
- `layer.create`, `layer.delete`, `layer.reorder`, `layer.set_opacity`, `layer.set_blend_mode`
- `layer.add_mask`, `layer.invert_mask`, `layer.set_transform`
- `adjustment.create`, `adjustment.update_curves`, `adjustment.update_levels`
- `selection.set_rect`, `selection.clear`, `selection.invert`
- `view.set_zoom`, `view.set_pan`, `history.undo`, `history.redo`

Because every command is structured JSON, autonomous agents can dry-run, batch, replay, and verify edits seamlessly.

### 2. Non-Destructive Layer System
- **Layer Types:** Pixel, Adjustment, Fill (Solid), Text, and Group layers.
- **Layer Masks:** 8-bit alpha masks per layer, with support for live inversion, feathering, and toggleable state.
- **Transformations:** Non-destructive 2D affine transforms (rotation, position offset, non-uniform scaling).
- **Adjustment Layers:** Full live adjustment stack including RGB Curves (with cubic spline / bezier points), Levels, Brightness/Contrast, Hue/Saturation, and Invert.

### 3. All 24 Photoshop Blend Modes
Full mathematical parity with industry-standard digital compositing:

| Group | Blend Modes Supported |
|---|---|
| **Standard** | Normal, Dissolve |
| **Darken** | Darken, Multiply, Color Burn, Linear Burn, Darker Color |
| **Lighten** | Lighten, Screen, Color Dodge, Linear Dodge (Add), Lighter Color |
| **Contrast** | Overlay, Soft Light, Hard Light, Vivid Light, Linear Light, Pin Light, Hard Mix |
| **Comparative** | Difference, Exclusion, Subtract, Divide |
| **Component** | Hue, Saturation, Color, Luminosity |

### 4. Dual AI Operation (In-App + MCP)
- **Built-in AI Assistant Panel:** Connect directly to OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet), local Ollama (Llama 3 / Mistral), or any OpenAI-compatible API. The panel feeds current document metadata, visual downsampled previews, and tool catalogs to the model, which outputs executable command blocks.
- **Native MCP Server:** PhotoCop exposes its internals over the Model Context Protocol, turning the editor into an accessible toolset for external agentic environments.

### 5. Precision Brush & Canvas Engine
- **Customizable Brush Dynamics:** Hardness, spacing, flow, opacity, and brush radius.
- **Tooling:** Paintbrush, Pencil, Eraser, Clone Stamp, Paint Bucket (Flood Fill), Marquee Selection, Crop Overlay, Pan/Hand, and Zoom.
- **Infinite Canvas Navigation:** Smooth panning, zooming centered on the mouse cursor, and marching-ants selection marquee.

---

## 🔌 Model Context Protocol (MCP) Server

PhotoCop includes an embedded Model Context Protocol (MCP) server (`src/mcp/server.ts`) exposing over **30 programmatic tools** and live document resources.

### Connecting External Agents

Add PhotoCop to your agent client configuration (e.g. Claude Desktop, Cursor, Antigravity):

```json
{
  "mcpServers": {
    "photocop": {
      "command": "node",
      "args": ["path/to/PhotoCop/photocop/dist/mcp-server.js"]
    }
  }
}
```

### MCP Tool Catalog

| Tool Name | Parameters | Description |
|---|---|---|
| `get_document_info` | None | Returns document dimensions, DPI, active layer, and layer stack tree. |
| `get_selection` | None | Retrieves the active bounding box, pixel selection mask, and feather radius. |
| `create_layer` | `name`, `type`, `blendMode`, `opacity` | Creates a new pixel, adjustment, fill, or group layer. |
| `delete_layer` | `layerId` | Removes a layer by ID. |
| `reorder_layer` | `layerId`, `newIndex` | Repositions a layer within the layer hierarchy. |
| `set_layer_opacity` | `layerId`, `opacity` (0–100) | Sets the layer's alpha transparency. |
| `set_blend_mode` | `layerId`, `blendMode` | Sets any of the 24 supported blend modes. |
| `add_layer_mask` | `layerId`, `initialState` | Attaches a mask buffer to the specified layer. |
| `adjust_curves` | `layerId`, `channel`, `points` | Modifies spline control points for RGB/composite curves. |
| `apply_adjustment` | `type`, `settings` | Creates an adjustment layer with targeted color parameters. |
| `paint_stroke` | `layerId`, `points`, `brushSettings` | Executes a programmatic vector or freehand brush stroke. |
| `flood_fill` | `layerId`, `x`, `y`, `color`, `tolerance` | Performs a flood fill from target coordinates. |
| `export_image` | `format` (`png`/`jpeg`/`webp`), `quality` | Composites the document and returns a base64-encoded image. |
| `undo` / `redo` | None | Navigates the 100-step state history stack. |

---

## ⌨️ Keyboard Shortcuts

PhotoCop adopts standard industry keybindings for zero learning curve:

| Shortcut | Action | Tool / Scope |
|---|---|---|
| <kbd>V</kbd> | Move Tool | Global |
| <kbd>B</kbd> | Paintbrush Tool | Global |
| <kbd>E</kbd> | Eraser Tool | Global |
| <kbd>M</kbd> | Rectangular Marquee Tool | Selection |
| <kbd>C</kbd> | Crop Tool | Document |
| <kbd>G</kbd> | Paint Bucket (Fill) Tool | Drawing |
| <kbd>S</kbd> | Clone Stamp Tool | Retouching |
| <kbd>I</kbd> | Eyedropper (Pipette) | Color |
| <kbd>H</kbd> / <kbd>Space</kbd> + Drag | Hand / Pan Canvas | Viewport |
| <kbd>Z</kbd> | Zoom Tool | Viewport |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo | History |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo | History |
| <kbd>Ctrl</kbd> + <kbd>A</kbd> | Select All | Selection |
| <kbd>Ctrl</kbd> + <kbd>D</kbd> | Deselect | Selection |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd> | Invert Selection | Selection |
| <kbd>Ctrl</kbd> + <kbd>J</kbd> | Duplicate Active Layer | Layers |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd> | New Layer | Layers |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Clear Selected Area / Layer | Edit |
| <kbd>[</kbd> / <kbd>]</kbd> | Decrease / Increase Brush Size | Brush |

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- [npm](https://www.npmjs.com/) v9.0.0 or higher

### Installation

Clone the repository:
```bash
git clone https://github.com/HunainxAhmed/PhotoCop.git
cd PhotoCop
```

Install dependencies:
```bash
cd photocop
npm install
```

### Starting the Editor

Run the local Vite development server:
```bash
npm run dev
```

Open your browser and navigate to:
```
http://localhost:5173
```

You can also run commands directly from the workspace root:
```bash
npm run dev      # Starts Vite dev server
npm run build    # Compiles TypeScript and runs production bundle
npm run lint     # Runs oxlint analysis
```

### Building for Production

Compile optimized production assets:
```bash
npm run build
```
Production assets are generated in `photocop/dist/`. To preview the production bundle locally:
```bash
npm run preview
```

---

## 🤖 AI Panel Configuration

1. In the PhotoCop interface, open the **AI Assistant** panel on the right sidebar.
2. Click the ⚙️ **Settings** button in the AI panel header.
3. Select your desired provider:
   - **OpenAI:** Set your API key (`sk-...`) and model (e.g., `gpt-4o`, `gpt-4o-mini`).
   - **Anthropic:** Set your Claude API key (`sk-ant-...`) and model (`claude-3-5-sonnet-20241022`).
   - **Ollama (Local):** Set the endpoint (default: `http://localhost:11434`) and model name (e.g., `llama3`).
   - **Custom:** Any OpenAI-compatible inference proxy or gateway.
4. Issue natural language requests such as:
   - *"Boost the contrast of this portrait using a gentle S-curve adjustment."*
   - *"Create a solid dark vignette overlay with Multiply blend mode at 45% opacity."*
   - *"Isolate the bright highlights and invert the mask on layer 2."*

The assistant analyzes the live layer graph and executes exact commands onto your canvas in real-time.

---

## 📁 Project Structure

```
PhotoCop/
├── assets/
│   └── hero.png                     # Application teaser and documentation assets
├── photocop/
│   ├── public/                      # Static assets and favicons
│   ├── src/
│   │   ├── assets/                  # UI artwork and icons
│   │   ├── components/              # Modular React UI components
│   │   │   ├── AIPanel.tsx          # Multi-provider AI assistant panel
│   │   │   ├── Canvas.tsx           # 2D Canvas renderer & event coordinator
│   │   │   ├── HistoryPanel.tsx     # Provenance-tracking undo/redo panel
│   │   │   ├── LayersPanel.tsx      # Layer stack, opacity, masks, thumbnails
│   │   │   ├── MenuBar.tsx          # Comprehensive application menus
│   │   │   ├── PerformanceMonitor.tsx # Real-time latency and FPS monitor
│   │   │   ├── PropertiesPanel.tsx  # Context-sensitive curve and brush sliders
│   │   │   ├── StatusBar.tsx        # Coordinates, tool state, zoom info
│   │   │   └── Toolbox.tsx          # Tool buttons and color swatches
│   │   ├── core/                    # Pure engine and graphics core
│   │   │   ├── blendModes.ts        # Blend mode definitions and constants
│   │   │   ├── brushEngine.ts       # Pixel stamping, spacing, flow math
│   │   │   ├── commandDispatcher.ts # Deterministic command execution engine
│   │   │   ├── commands.ts          # 40+ strongly-typed command interfaces
│   │   │   ├── compositor.ts        # Offscreen canvas compositor & math
│   │   │   ├── document.ts          # Layer/document constructors & mutators
│   │   │   └── types.ts             # Global type definitions
│   │   ├── mcp/                     # Model Context Protocol integration
│   │   │   └── server.ts            # 30+ MCP tools and live resources
│   │   ├── store/                   # Reactive state management
│   │   │   └── editorStore.ts       # Zustand store with command middleware
│   │   ├── App.tsx                  # Main workspace layout & shortcuts
│   │   ├── index.css                # Tailwind CSS stylesheets
│   │   └── main.tsx                 # React entry point
│   ├── index.html                   # HTML template
│   ├── package.json                 # Dependencies and build scripts
│   ├── tsconfig.json                # TypeScript compiler configuration
│   └── vite.config.ts               # Vite bundler configuration
├── .gitignore                       # Git ignore patterns
├── LICENSE                          # MIT License
├── package.json                     # Workspace root script runner
└── README.md                        # Documentation
```

---

## 🗺 Roadmap

### Phase 1: Core Foundation ✅
- [x] Full layer model (pixel, adjustment, text, group, fill)
- [x] All 24 Photoshop blend modes with per-pixel math
- [x] 40+ typed command definitions & single dispatcher
- [x] High-performance brush engine (hardness, flow, spacing, eraser, clone stamp)
- [x] 100-step undo/redo history with source attribution (Human / AI / MCP)
- [x] GPU-accelerated canvas with smooth zoom-to-cursor and pan
- [x] In-app AI Assistant panel (OpenAI, Anthropic, Ollama)
- [x] Complete Model Context Protocol (MCP) server with 30+ tools
- [x] Photoshop-standard keyboard shortcuts

### Phase 2: Advanced Editing Tools 🚧
- [ ] Pressure-sensitive brush curves (Stylus & Apple Pencil / Wacom API)
- [ ] Magic Wand / Color Range selection engine
- [ ] Healing Brush & Patch tools
- [ ] Multi-stop Linear & Radial gradient fill tools
- [ ] Dodge, Burn, Sponge, Blur, and Sharpen brush tools
- [ ] Free Transform with bounding box handles and perspective warp
- [ ] Rich typography and path-following text engine
- [ ] Convolution filter pipeline (Gaussian Blur, Unsharp Mask, High Pass)
- [ ] WebSocket relay for bidirectional remote MCP clients

### Phase 3: Enterprise & Pro Pipeline 🔮
- [ ] Vector Pen tool with cubic Bézier path math
- [ ] Smart Object non-destructive raster/vector containers
- [ ] Liquify and mesh warp engine
- [ ] PSD / TIFF import and export parser
- [ ] Vision-AI segmentation (one-click subject isolation, generative fill)
- [ ] Batch automation and script macro recorder

---

## 🤝 Contributing

Contributions are what make the open-source community an incredible place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">

Crafted with care by **[Hunain Ahmed](https://github.com/HunainxAhmed)**.

⭐ If you find PhotoCop inspiring or useful, please consider starring this repository!

</div>
