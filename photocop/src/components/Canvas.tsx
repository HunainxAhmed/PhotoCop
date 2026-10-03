/**
 * PhotoCop - Main Canvas Component
 *
 * Renders the document composite onto a 2D canvas.
 * Handles: zoom, pan, brush strokes, selection drawing, crop overlay.
 * Compositing runs in a requestAnimationFrame loop — only redraws when
 * renderVersion changes (dirty flag from store).
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { compositeDocument } from '../core/compositor';
import type { Point, Rect } from '../core/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function screenToDocument(
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number
): Point {
  return {
    x: (screenX - panX) / zoom,
    y: (screenY - panY) / zoom,
  };
}

// ─── Canvas Component ─────────────────────────────────────────────────────────

interface CanvasProps {
  width: number;
  height: number;
}

export const Canvas: React.FC<CanvasProps> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastRenderVersion = useRef(-1);

  // Stroke state
  const isDrawing = useRef(false);
  const strokePoints = useRef<Point[]>([]);
  const lastPt = useRef<Point | null>(null);

  // Performance tracking (refs only — never setState in RAF)
  const lastRenderMs = useRef(0);
  const renderCount = useRef(0);

  // Pan state
  const isPanning = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const panStartPos = useRef<Point>({ x: 0, y: 0 });

  // Selection drag
  const isSelecting = useRef(false);
  const selStart = useRef<Point>({ x: 0, y: 0 });
  const selRect = useRef<Rect | null>(null);

  // Crop drag
  const isCropping = useRef(false);
  const cropStart = useRef<Point>({ x: 0, y: 0 });
  const cropRect = useRef<Rect | null>(null);

  const doc        = useEditorStore(s => s.document);
  const viewport   = useEditorStore(s => s.viewport);
  const tool       = useEditorStore(s => s.tool);
  const brushSettings = useEditorStore(s => s.brushSettings);
  const foreground = useEditorStore(s => s.foreground);
  const selection  = useEditorStore(s => s.selection);
  const dispatch   = useEditorStore(s => s.dispatch);
  const invalidateRender = useEditorStore(s => s.invalidateRender);

  // ─── Composite loop ────────────────────────────────────────────────────────

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !doc) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const t0 = performance.now();

    // Clear with dark bg
    ctx.clearRect(0, 0, width, height);

    // Draw checkerboard for transparency
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);
    drawCheckerboard(ctx, 0, 0, doc.width, doc.height);
    ctx.restore();

    // Draw document composite
    const docCanvas = document.createElement('canvas');
    docCanvas.width = doc.width;
    docCanvas.height = doc.height;
    const docCtx = docCanvas.getContext('2d')!;
    compositeDocument(doc, docCtx);

    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);
    ctx.drawImage(docCanvas, 0, 0);
    ctx.restore();

    // Document border shadow
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, doc.width * viewport.zoom, doc.height * viewport.zoom);
    ctx.restore();

    // Track render time via ref — never setState inside RAF
    const elapsed = performance.now() - t0;
    lastRenderMs.current = elapsed;
    renderCount.current += 1;
  }, [doc, viewport, width, height]);

  // ─── Overlay (selection, crop, brush cursor) ───────────────────────────────

  const renderOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    // Selection rectangle
    if (selection.bounds) {
      const { x, y, width: sw, height: sh } = selection.bounds;
      const sx = viewport.panX + x * viewport.zoom;
      const sy = viewport.panY + y * viewport.zoom;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = (Date.now() / 50) % 10;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, sw * viewport.zoom, sh * viewport.zoom);
      ctx.strokeStyle = '#000';
      ctx.lineDashOffset = ((Date.now() / 50) + 5) % 10;
      ctx.strokeRect(sx, sy, sw * viewport.zoom, sh * viewport.zoom);
      ctx.restore();
    }

    // Live selection while dragging
    if (isSelecting.current && selRect.current) {
      const { x, y, width: sw, height: sh } = selRect.current;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#4f9eff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, sw, sh);
      ctx.restore();
    }

    // Crop overlay
    if (isCropping.current && cropRect.current) {
      const { x, y, width: cw, height: ch } = cropRect.current;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      // Darken outside crop
      ctx.fillRect(0, 0, width, y);
      ctx.fillRect(0, y + ch, width, height - y - ch);
      ctx.fillRect(0, y, x, ch);
      ctx.fillRect(x + cw, y, width - x - cw, ch);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, cw, ch);
      // Rule of thirds
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      for (let t = 1; t < 3; t++) {
        ctx.beginPath();
        ctx.moveTo(x + cw * t / 3, y);
        ctx.lineTo(x + cw * t / 3, y + ch);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + ch * t / 3);
        ctx.lineTo(x + cw, y + ch * t / 3);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [selection, viewport, width, height]);

  // ─── RAF loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let rafId: number;
    const loop = () => {
      const rv = useEditorStore.getState().renderVersion;
      if (rv !== lastRenderVersion.current) {
        lastRenderVersion.current = rv;
        renderCanvas();
      }
      renderOverlay();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [renderCanvas, renderOverlay]);

  // ─── Wheel zoom ───────────────────────────────────────────────────────────

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.01, Math.min(64, viewport.zoom * factor));
    // Zoom toward mouse position
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const newPanX = mx - (mx - viewport.panX) * (newZoom / viewport.zoom);
      const newPanY = my - (my - viewport.panY) * (newZoom / viewport.zoom);
      dispatch({ type: 'viewport.set_zoom', zoom: newZoom, source: 'user' });
      useEditorStore.setState({ viewport: { zoom: newZoom, panX: newPanX, panY: newPanY } });
    }
  }, [viewport, dispatch]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // ─── Mouse event handlers ─────────────────────────────────────────────────

  const getDocPt = useCallback((e: React.MouseEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return screenToDocument(e.clientX - rect.left, e.clientY - rect.top, viewport.panX, viewport.panY, viewport.zoom);
  }, [viewport]);

  const getScreenPt = useCallback((e: React.MouseEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!doc) return;
    const docPt = getDocPt(e);
    const screenPt = getScreenPt(e);
    const activeTool = tool.activeTool;
    const activeLayerId = doc.activeLayerId;

    if (activeTool === 'hand' || e.button === 1) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panStartPos.current = { x: viewport.panX, y: viewport.panY };
      return;
    }

    if (activeTool === 'brush' || activeTool === 'pencil' || activeTool === 'eraser') {
      if (!activeLayerId) return;
      const layer = doc.layers[activeLayerId];
      if (!layer?.imageData) return;
      isDrawing.current = true;
      strokePoints.current = [docPt];
      lastPt.current = docPt;
      return;
    }

    if (activeTool === 'marqueeRect') {
      isSelecting.current = true;
      selStart.current = screenPt;
      selRect.current = null;
      return;
    }

    if (activeTool === 'crop') {
      isCropping.current = true;
      cropStart.current = screenPt;
      cropRect.current = null;
      return;
    }

    if (activeTool === 'fill') {
      if (!activeLayerId) return;
      dispatch({
        type: 'pixel.fill',
        layerId: activeLayerId,
        color: foreground,
        source: 'user',
        description: 'Fill',
      });
    }

    if (activeTool === 'zoom') {
      const newZoom = e.shiftKey
        ? viewport.zoom / 1.5
        : viewport.zoom * 1.5;
      dispatch({ type: 'viewport.set_zoom', zoom: newZoom, source: 'user' });
    }
  }, [doc, tool, viewport, foreground, dispatch, getDocPt, getScreenPt]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!doc) return;
    const docPt = getDocPt(e);
    const screenPt = getScreenPt(e);
    const activeTool = tool.activeTool;

    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      useEditorStore.setState({
        viewport: {
          ...viewport,
          panX: panStartPos.current.x + dx,
          panY: panStartPos.current.y + dy,
        },
      });
      invalidateRender();
      return;
    }

    if (isDrawing.current && doc.activeLayerId) {
      strokePoints.current.push(docPt);

      // Incremental paint — dispatch every few points for responsiveness
      if (strokePoints.current.length >= 3) {
        const layer = doc.layers[doc.activeLayerId];
        if (layer?.imageData) {
          dispatch({
            type: 'pixel.paint_stroke',
            layerId: doc.activeLayerId,
            points: strokePoints.current,
            brushSettings,
            color: foreground,
            eraseMode: activeTool === 'eraser',
            source: 'user',
          });
          // Keep last point for continuity
          strokePoints.current = [strokePoints.current[strokePoints.current.length - 1]];
        }
      }
      return;
    }

    if (isSelecting.current) {
      const x = Math.min(screenPt.x, selStart.current.x);
      const y = Math.min(screenPt.y, selStart.current.y);
      const w = Math.abs(screenPt.x - selStart.current.x);
      const h = Math.abs(screenPt.y - selStart.current.y);
      selRect.current = { x, y, width: w, height: h };
      return;
    }

    if (isCropping.current) {
      const x = Math.min(screenPt.x, cropStart.current.x);
      const y = Math.min(screenPt.y, cropStart.current.y);
      const w = Math.abs(screenPt.x - cropStart.current.x);
      const h = Math.abs(screenPt.y - cropStart.current.y);
      cropRect.current = { x, y, width: w, height: h };
    }
  }, [doc, tool, viewport, brushSettings, foreground, dispatch, invalidateRender, getDocPt, getScreenPt]);

  const onMouseUp = useCallback((_e: React.MouseEvent) => {
    if (!doc) return;
    const activeTool = tool.activeTool;

    isPanning.current = false;

    if (isDrawing.current) {
      if (strokePoints.current.length > 0 && doc.activeLayerId) {
        const layer = doc.layers[doc.activeLayerId];
        if (layer?.imageData) {
          dispatch({
            type: 'pixel.paint_stroke',
            layerId: doc.activeLayerId,
            points: strokePoints.current,
            brushSettings,
            color: foreground,
            eraseMode: activeTool === 'eraser',
            source: 'user',
          });
        }
      }
      isDrawing.current = false;
      strokePoints.current = [];
    }

    if (isSelecting.current && selRect.current) {
      // Convert screen rect to document coords
      const { x, y, width: sw, height: sh } = selRect.current;
      const docRect = {
        x: (x - viewport.panX) / viewport.zoom,
        y: (y - viewport.panY) / viewport.zoom,
        width: sw / viewport.zoom,
        height: sh / viewport.zoom,
      };
      dispatch({
        type: 'selection.create_rect',
        rect: docRect,
        mode: 'replace',
        source: 'user',
      });
      isSelecting.current = false;
      selRect.current = null;
    }

    if (isCropping.current && cropRect.current) {
      const { x, y, width: cw, height: ch } = cropRect.current;
      const docRect = {
        x: Math.round((x - viewport.panX) / viewport.zoom),
        y: Math.round((y - viewport.panY) / viewport.zoom),
        width: Math.round(cw / viewport.zoom),
        height: Math.round(ch / viewport.zoom),
      };
      if (docRect.width > 0 && docRect.height > 0) {
        dispatch({ type: 'transform.crop', rect: docRect, source: 'user' });
      }
      isCropping.current = false;
      cropRect.current = null;
    }
  }, [doc, tool, viewport, brushSettings, foreground, dispatch]);

  // ─── Cursor style ────────────────────────────────────────────────────────

  const getCursor = () => {
    switch (tool.activeTool) {
      case 'hand':    return 'grab';
      case 'zoom':    return 'zoom-in';
      case 'brush':
      case 'pencil':
      case 'eraser':  return 'crosshair';
      case 'eyedropper': return 'crosshair';
      case 'crop':
      case 'marqueeRect':
      case 'marqueeEllipse': return 'crosshair';
      case 'move':    return 'move';
      default:        return 'default';
    }
  };

  return (
    <div
      ref={containerRef}
      id="canvas-container"
      className="relative w-full h-full overflow-hidden bg-neutral-800 select-none"
      style={{ cursor: getCursor() }}
    >
      {/* Main composite canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0"
        style={{ imageRendering: viewport.zoom > 4 ? 'pixelated' : 'auto' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />

      {/* Overlay canvas (selection marching ants, crop guides, etc.) */}
      <canvas
        ref={overlayRef}
        width={width}
        height={height}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Empty state */}
      {!doc && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-neutral-500 select-none">
            <div className="text-5xl mb-4">⚡</div>
            <div className="text-xl font-semibold mb-2 text-neutral-400">PhotoCop</div>
            <div className="text-sm">File → New or drag an image to begin</div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Checkerboard ─────────────────────────────────────────────────────────────

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  tileSize = 8
) {
  const light = '#b0b0b0';
  const dark  = '#909090';
  for (let ty = 0; ty < h; ty += tileSize) {
    for (let tx = 0; tx < w; tx += tileSize) {
      ctx.fillStyle = ((Math.floor(tx / tileSize) + Math.floor(ty / tileSize)) % 2 === 0) ? light : dark;
      ctx.fillRect(x + tx, y + ty, Math.min(tileSize, w - tx), Math.min(tileSize, h - ty));
    }
  }
}
