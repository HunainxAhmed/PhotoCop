/**
 * PhotoCop - Main Canvas Component
 *
 * Renders the document composite onto a 2D canvas.
 * Interactive Tools:
 * - Marquee Rect & Ellipse selections (drawing, marching ants, click-to-deselect)
 * - Crop tool (drag bounds, rule-of-thirds overlay, commit / cancel buttons, Enter/Esc keys)
 * - Eyedropper (pixel sampling at click/drag coordinate to set foreground color)
 * - Bucket Fill (flood fill contiguous region or active selection)
 * - Text tool (click to create or edit text layer with inline floating editor)
 * - Brush / Pencil / Eraser (continuous stroke painting)
 * - Zoom & Pan (mouse wheel, hand tool, middle-click)
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Check, X } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { compositeDocument } from '../core/compositor';
import { paintStroke } from '../core/brushEngine';
import { snapshotLayer } from '../core/document';
import { makeHistoryEntry, pushHistory } from '../core/commandDispatcher';
import { scheduleSaveDocument } from '../core/storage';
import type { Point, Rect, Layer } from '../core/types';

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

interface TextEditorState {
  layerId?: string;
  docPt: Point;
  content: string;
  fontSize: number;
  fontFamily: string;
}

export const Canvas: React.FC<CanvasProps> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastRenderVersion = useRef(-1);

  // Stroke state (brush, pencil, eraser, blur, sharpen, dodge, burn, sponge, clone)
  const isDrawing = useRef(false);
  const strokePoints = useRef<Point[]>([]);
  const lastPt = useRef<Point | null>(null);
  const initialLayerSnapshot = useRef<Layer | null>(null);

  // Performance tracking
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

  // Move layer drag
  const isMovingLayer = useRef(false);
  const moveLayerStartPt = useRef<Point>({ x: 0, y: 0 });
  const moveLayerStartTransform = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const moveLayerCurrentDelta = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Crop drag
  const isCropping = useRef(false);
  const cropStart = useRef<Point>({ x: 0, y: 0 });
  const cropRect = useRef<Rect | null>(null);
  const [pendingCrop, setPendingCrop] = useState<Rect | null>(null);

  // Gradient drag state
  const isGraduating = useRef(false);
  const gradStart = useRef<Point>({ x: 0, y: 0 });
  const gradEnd = useRef<Point>({ x: 0, y: 0 });

  // Shape drag state
  const isShaping = useRef(false);
  const shapeStart = useRef<Point>({ x: 0, y: 0 });
  const shapeCurrent = useRef<Rect | null>(null);

  // Pen (vector) path state
  const penPoints = useRef<Point[]>([]);
  const [penPathCount, setPenPathCount] = useState(0);

  // Eyedropper sampling state
  const isSampling = useRef(false);

  // Text editor overlay state
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);

  const doc        = useEditorStore(s => s.document);
  const viewport   = useEditorStore(s => s.viewport);
  const tool       = useEditorStore(s => s.tool);
  const brushSettings = useEditorStore(s => s.brushSettings);
  const foreground = useEditorStore(s => s.foreground);
  const background = useEditorStore(s => s.background);
  const selection  = useEditorStore(s => s.selection);
  const dispatch   = useEditorStore(s => s.dispatch);
  const invalidateRender = useEditorStore(s => s.invalidateRender);

  // Active crop is valid only when crop tool is active
  const activePendingCrop = tool.activeTool === 'crop' ? pendingCrop : null;

  // ─── Color sampling for Eyedropper ──────────────────────────────────────────

  const sampleColorAtDocPt = useCallback((pt: Point) => {
    if (!doc) return;
    const off = document.createElement('canvas');
    off.width = doc.width;
    off.height = doc.height;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    compositeDocument(doc, ctx);
    const px = Math.floor(pt.x);
    const py = Math.floor(pt.y);
    if (px >= 0 && px < doc.width && py >= 0 && py < doc.height) {
      const p = ctx.getImageData(px, py, 1, 1).data;
      dispatch({
        type: 'color.set_foreground',
        color: { r: p[0], g: p[1], b: p[2], a: p[3] },
        source: 'user',
      });
    }
  }, [doc, dispatch]);

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

    const elapsed = performance.now() - t0;
    lastRenderMs.current = elapsed;
    renderCount.current += 1;
  }, [doc, viewport, width, height]);

  // ─── Overlay (selection, crop, active helpers) ──────────────────────────────

  const renderOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    // Selection rectangle / marching ants
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
      if (tool.activeTool === 'marqueeEllipse') {
        ctx.beginPath();
        ctx.ellipse(x + sw / 2, y + sh / 2, Math.max(1, sw / 2), Math.max(1, sh / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y, sw, sh);
      }
      ctx.restore();
    }

    // Active crop overlay (live dragging or pending commit)
    const activeCropScreen = isCropping.current && cropRect.current
      ? cropRect.current
      : activePendingCrop
        ? {
            x: viewport.panX + activePendingCrop.x * viewport.zoom,
            y: viewport.panY + activePendingCrop.y * viewport.zoom,
            width: activePendingCrop.width * viewport.zoom,
            height: activePendingCrop.height * viewport.zoom,
          }
        : null;

    if (activeCropScreen) {
      const { x, y, width: cw, height: ch } = activeCropScreen;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      // Darken outside crop
      ctx.fillRect(0, 0, width, Math.max(0, y));
      ctx.fillRect(0, y + ch, width, Math.max(0, height - y - ch));
      ctx.fillRect(0, y, Math.max(0, x), ch);
      ctx.fillRect(x + cw, y, Math.max(0, width - x - cw), ch);

      // Crop border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, cw, ch);

      // Rule of thirds
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      for (let t = 1; t < 3; t++) {
        ctx.beginPath();
        ctx.moveTo(x + (cw * t) / 3, y);
        ctx.lineTo(x + (cw * t) / 3, y + ch);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + (ch * t) / 3);
        ctx.lineTo(x + cw, y + (ch * t) / 3);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Live gradient drag line
    if (isGraduating.current) {
      const sx1 = viewport.panX + gradStart.current.x * viewport.zoom;
      const sy1 = viewport.panY + gradStart.current.y * viewport.zoom;
      const sx2 = viewport.panX + gradEnd.current.x * viewport.zoom;
      const sy2 = viewport.panY + gradEnd.current.y * viewport.zoom;
      ctx.save();
      ctx.strokeStyle = '#4f9eff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();

      // Start circle
      ctx.fillStyle = '#4f9eff';
      ctx.beginPath();
      ctx.arc(sx1, sy1, 5, 0, Math.PI * 2);
      ctx.fill();

      // End circle
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#4f9eff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx2, sy2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Live shape drag preview
    if (isShaping.current && shapeCurrent.current) {
      const { x, y, width: sw, height: sh } = shapeCurrent.current;
      const sx = viewport.panX + x * viewport.zoom;
      const sy = viewport.panY + y * viewport.zoom;
      const swz = sw * viewport.zoom;
      const shz = sh * viewport.zoom;
      ctx.save();
      ctx.fillStyle = `rgba(${foreground.r}, ${foreground.g}, ${foreground.b}, 0.35)`;
      ctx.strokeStyle = '#4f9eff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.fillRect(sx, sy, swz, shz);
      ctx.strokeRect(sx, sy, swz, shz);
      ctx.restore();
    }

    // Pen (vector) path preview
    if (penPoints.current.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      penPoints.current.forEach((pt, idx) => {
        const sx = viewport.panX + pt.x * viewport.zoom;
        const sy = viewport.panY + pt.y * viewport.zoom;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      // Draw anchor point squares
      penPoints.current.forEach((pt, idx) => {
        const sx = viewport.panX + pt.x * viewport.zoom;
        const sy = viewport.panY + pt.y * viewport.zoom;
        ctx.fillStyle = idx === 0 ? '#10b981' : '#ffffff';
        ctx.strokeStyle = '#1e40af';
        ctx.lineWidth = 1.5;
        ctx.fillRect(sx - 3.5, sy - 3.5, 7, 7);
        ctx.strokeRect(sx - 3.5, sy - 3.5, 7, 7);
      });
      ctx.restore();
    }
  }, [selection, viewport, width, height, activePendingCrop, tool.activeTool, foreground, penPathCount]);

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

  // ─── Pen Tool Helper ──────────────────────────────────────────────────────
  const commitPenPath = useCallback((closeLoop = false) => {
    if (penPoints.current.length < 2) return;
    const currentDoc = useEditorStore.getState().document;
    if (!currentDoc) return;
    const activeLayerId = currentDoc.activeLayerId;
    if (!activeLayerId) return;

    const points = closeLoop
      ? [...penPoints.current, penPoints.current[0]]
      : [...penPoints.current];

    dispatch({
      type: 'pixel.paint_stroke',
      layerId: activeLayerId,
      points,
      brushSettings: { ...brushSettings, size: Math.max(2, Math.round(brushSettings.size / 3)) },
      color: foreground,
      eraseMode: false,
      source: 'user',
    });

    penPoints.current = [];
    setPenPathCount(0);
    renderOverlay();
  }, [brushSettings, foreground, dispatch, renderOverlay]);

  // ─── Keyboard shortcuts for Crop & Pen (Enter/Esc) ─────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activePendingCrop) {
        if (e.key === 'Enter') {
          dispatch({ type: 'transform.crop', rect: activePendingCrop, source: 'user' });
          setPendingCrop(null);
        } else if (e.key === 'Escape') {
          setPendingCrop(null);
        }
      }
      if (tool.activeTool === 'vector' && penPoints.current.length > 0) {
        if (e.key === 'Enter') {
          commitPenPath(false);
        } else if (e.key === 'Escape') {
          penPoints.current = [];
          setPenPathCount(0);
          renderOverlay();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePendingCrop, tool.activeTool, dispatch, commitPenPath, renderOverlay]);

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

    if (activeTool === 'move') {
      if (!activeLayerId) return;
      const layer = doc.layers[activeLayerId];
      if (!layer) return;
      isMovingLayer.current = true;
      moveLayerStartPt.current = docPt;
      moveLayerStartTransform.current = { x: layer.transform.x, y: layer.transform.y };
      moveLayerCurrentDelta.current = { x: 0, y: 0 };
      return;
    }

    const isPaintingTool = ['brush', 'pencil', 'eraser', 'blur', 'sharpen', 'dodge', 'burn', 'sponge', 'clone'].includes(activeTool);
    if (isPaintingTool) {
      if (!activeLayerId) return;
      const layer = doc.layers[activeLayerId];
      if (!layer?.imageData) return;
      isDrawing.current = true;
      strokePoints.current = [docPt];
      lastPt.current = docPt;
      initialLayerSnapshot.current = snapshotLayer(layer);

      // Apply initial dab immediately
      paintStroke({
        imageData: layer.imageData,
        points: [docPt],
        settings: brushSettings,
        color: foreground,
        eraseMode: activeTool === 'eraser',
        toolMode: activeTool as any,
      });
      invalidateRender();
      return;
    }

    if (activeTool === 'gradient') {
      if (!activeLayerId) return;
      isGraduating.current = true;
      gradStart.current = docPt;
      gradEnd.current = docPt;
      renderOverlay();
      return;
    }

    if (activeTool === 'shape') {
      if (!activeLayerId) return;
      isShaping.current = true;
      shapeStart.current = docPt;
      shapeCurrent.current = null;
      renderOverlay();
      return;
    }

    if (activeTool === 'vector') {
      if (penPoints.current.length >= 2) {
        const first = penPoints.current[0];
        const dist = Math.hypot(docPt.x - first.x, docPt.y - first.y);
        if (dist <= 15 / viewport.zoom) {
          commitPenPath(true);
          return;
        }
      }
      penPoints.current.push(docPt);
      setPenPathCount(penPoints.current.length);
      renderOverlay();
      return;
    }

    if (activeTool === 'eyedropper') {
      isSampling.current = true;
      sampleColorAtDocPt(docPt);
      return;
    }

    if (activeTool === 'marqueeRect' || activeTool === 'marqueeEllipse') {
      isSelecting.current = true;
      selStart.current = screenPt;
      selRect.current = null;
      return;
    }

    if (activeTool === 'crop') {
      isCropping.current = true;
      cropStart.current = screenPt;
      cropRect.current = null;
      setPendingCrop(null);
      return;
    }

    if (activeTool === 'fill') {
      if (!activeLayerId) return;
      if (selection.bounds) {
        dispatch({
          type: 'pixel.fill',
          layerId: activeLayerId,
          color: foreground,
          selection: selection.bounds,
          source: 'user',
          description: 'Fill Selection',
        });
      } else {
        dispatch({
          type: 'pixel.fill',
          layerId: activeLayerId,
          color: foreground,
          point: docPt,
          source: 'user',
          description: 'Bucket Fill',
        });
      }
      return;
    }

    if (activeTool === 'text') {
      const activeLayer = activeLayerId ? doc.layers[activeLayerId] : null;
      if (activeLayer && activeLayer.type === 'text' && activeLayer.textData) {
        setTextEditor({
          layerId: activeLayer.id,
          docPt: { x: activeLayer.transform.x, y: activeLayer.transform.y },
          content: activeLayer.textData.content,
          fontSize: activeLayer.textData.style.fontSize || 48,
          fontFamily: activeLayer.textData.style.fontFamily || 'Inter, sans-serif',
        });
      } else {
        setTextEditor({
          docPt,
          content: 'Text Layer',
          fontSize: Math.max(36, Math.min(180, Math.round(doc.width / 20))),
          fontFamily: 'Inter, sans-serif',
        });
      }
      return;
    }

    if (activeTool === 'zoom') {
      const newZoom = e.shiftKey
        ? viewport.zoom / 1.5
        : viewport.zoom * 1.5;
      dispatch({ type: 'viewport.set_zoom', zoom: newZoom, source: 'user' });
    }
  }, [doc, tool, viewport, foreground, selection, dispatch, getDocPt, getScreenPt, sampleColorAtDocPt]);

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

    if (isMovingLayer.current && doc.activeLayerId) {
      const dx = Math.round(docPt.x - moveLayerStartPt.current.x);
      const dy = Math.round(docPt.y - moveLayerStartPt.current.y);
      moveLayerCurrentDelta.current = { x: dx, y: dy };
      const layer = doc.layers[doc.activeLayerId];
      if (layer) {
        const targetX = moveLayerStartTransform.current.x + dx;
        const targetY = moveLayerStartTransform.current.y + dy;
        useEditorStore.setState(s => {
          if (!s.document || !s.document.activeLayerId) return s;
          const al = s.document.layers[s.document.activeLayerId];
          if (!al) return s;
          return {
            document: {
              ...s.document,
              layers: {
                ...s.document.layers,
                [al.id]: {
                  ...al,
                  transform: { ...al.transform, x: targetX, y: targetY },
                },
              },
            },
            renderVersion: s.renderVersion + 1,
          };
        });
      }
      return;
    }

    if (isSampling.current && activeTool === 'eyedropper') {
      sampleColorAtDocPt(docPt);
      return;
    }

    if (isGraduating.current) {
      gradEnd.current = docPt;
      renderOverlay();
      return;
    }

    if (isShaping.current) {
      const x = Math.min(docPt.x, shapeStart.current.x);
      const y = Math.min(docPt.y, shapeStart.current.y);
      const w = Math.abs(docPt.x - shapeStart.current.x);
      const h = Math.abs(docPt.y - shapeStart.current.y);
      shapeCurrent.current = { x, y, width: w, height: h };
      renderOverlay();
      return;
    }

    if (isDrawing.current && doc.activeLayerId) {
      const layer = doc.layers[doc.activeLayerId];
      if (layer?.imageData) {
        const prevPt = lastPt.current ?? docPt;
        paintStroke({
          imageData: layer.imageData,
          points: [prevPt, docPt],
          settings: brushSettings,
          color: foreground,
          eraseMode: activeTool === 'eraser',
          toolMode: activeTool as any,
        });
        strokePoints.current.push(docPt);
        lastPt.current = docPt;
        invalidateRender();
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
  }, [doc, tool, viewport, brushSettings, foreground, dispatch, invalidateRender, getDocPt, getScreenPt, sampleColorAtDocPt, renderOverlay]);

  const onMouseUp = useCallback((_e: React.MouseEvent) => {
    if (!doc) return;
    const activeTool = tool.activeTool;

    isPanning.current = false;
    isSampling.current = false;

    if (isMovingLayer.current) {
      if (doc.activeLayerId) {
        const finalX = moveLayerStartTransform.current.x + moveLayerCurrentDelta.current.x;
        const finalY = moveLayerStartTransform.current.y + moveLayerCurrentDelta.current.y;
        if (moveLayerCurrentDelta.current.x !== 0 || moveLayerCurrentDelta.current.y !== 0) {
          dispatch({
            type: 'layer.transform',
            layerId: doc.activeLayerId,
            transform: { x: finalX, y: finalY },
            source: 'user',
          });
        }
      }
      isMovingLayer.current = false;
      moveLayerCurrentDelta.current = { x: 0, y: 0 };
    }

    if (isDrawing.current) {
      isDrawing.current = false;
      if (doc.activeLayerId && initialLayerSnapshot.current) {
        const layer = doc.layers[doc.activeLayerId];
        if (layer?.imageData) {
          const strokeLabel = activeTool.charAt(0).toUpperCase() + activeTool.slice(1);
          const entry = makeHistoryEntry(strokeLabel, 'user', {
            [layer.id]: initialLayerSnapshot.current,
          });
          useEditorStore.setState(prev => ({
            document: {
              ...prev.document!,
              metadata: {
                ...prev.document!.metadata,
                modifiedAt: new Date().toISOString(),
              },
            },
            ...pushHistory(prev, entry),
            renderVersion: prev.renderVersion + 1,
          }));
          scheduleSaveDocument(useEditorStore.getState().document);
        }
      }
      initialLayerSnapshot.current = null;
      strokePoints.current = [];
      lastPt.current = null;
    }

    if (isGraduating.current) {
      isGraduating.current = false;
      if (doc.activeLayerId) {
        const docPt = getDocPt(_e);
        dispatch({
          type: 'pixel.gradient',
          layerId: doc.activeLayerId,
          start: gradStart.current,
          end: docPt,
          startColor: foreground,
          endColor: background,
          selection: selection.bounds,
          source: 'user',
        });
      }
      renderOverlay();
    }

    if (isShaping.current) {
      isShaping.current = false;
      if (shapeCurrent.current && shapeCurrent.current.width > 2 && shapeCurrent.current.height > 2 && doc.activeLayerId) {
        dispatch({
          type: 'pixel.shape',
          layerId: doc.activeLayerId,
          shapeType: _e.shiftKey ? 'ellipse' : 'rectangle',
          rect: shapeCurrent.current,
          fillColor: foreground,
          strokeColor: null,
          strokeWidth: 0,
          source: 'user',
        });
      }
      shapeCurrent.current = null;
      renderOverlay();
    }

    if (isSelecting.current) {
      if (selRect.current && selRect.current.width > 3 && selRect.current.height > 3) {
        const { x, y, width: sw, height: sh } = selRect.current;
        const rawDocX = (x - viewport.panX) / viewport.zoom;
        const rawDocY = (y - viewport.panY) / viewport.zoom;
        const rawDocW = sw / viewport.zoom;
        const rawDocH = sh / viewport.zoom;

        const x1 = Math.max(0, Math.min(doc.width, rawDocX));
        const y1 = Math.max(0, Math.min(doc.height, rawDocY));
        const x2 = Math.max(0, Math.min(doc.width, rawDocX + rawDocW));
        const y2 = Math.max(0, Math.min(doc.height, rawDocY + rawDocH));
        const docRect = {
          x: Math.round(x1),
          y: Math.round(y1),
          width: Math.round(x2 - x1),
          height: Math.round(y2 - y1),
        };

        if (docRect.width > 2 && docRect.height > 2) {
          if (activeTool === 'marqueeEllipse') {
            dispatch({
              type: 'selection.create_ellipse',
              rect: docRect,
              mode: 'replace',
              source: 'user',
            });
          } else {
            dispatch({
              type: 'selection.create_rect',
              rect: docRect,
              mode: 'replace',
              source: 'user',
            });
          }
        } else {
          dispatch({ type: 'selection.deselect', source: 'user' });
        }
      } else {
        // Simple click deselects
        dispatch({ type: 'selection.deselect', source: 'user' });
      }
      isSelecting.current = false;
      selRect.current = null;
    }

    if (isCropping.current) {
      if (cropRect.current && cropRect.current.width > 5 && cropRect.current.height > 5) {
        const { x, y, width: cw, height: ch } = cropRect.current;
        const x1 = Math.max(0, Math.min(doc.width, (x - viewport.panX) / viewport.zoom));
        const y1 = Math.max(0, Math.min(doc.height, (y - viewport.panY) / viewport.zoom));
        const x2 = Math.max(0, Math.min(doc.width, (x + cw - viewport.panX) / viewport.zoom));
        const y2 = Math.max(0, Math.min(doc.height, (y + ch - viewport.panY) / viewport.zoom));
        const docRect = {
          x: Math.round(x1),
          y: Math.round(y1),
          width: Math.round(x2 - x1),
          height: Math.round(y2 - y1),
        };
        if (docRect.width > 5 && docRect.height > 5) {
          setPendingCrop(docRect);
        }
      }
      isCropping.current = false;
      cropRect.current = null;
    }
  }, [doc, tool, viewport, brushSettings, foreground, dispatch]);

  const onDoubleClick = useCallback((_e: React.MouseEvent) => {
    if (tool.activeTool === 'vector' && penPoints.current.length >= 2) {
      commitPenPath(false);
    }
  }, [tool.activeTool, commitPenPath]);

  const commitText = () => {
    if (!textEditor || !textEditor.content.trim()) {
      setTextEditor(null);
      return;
    }
    const fontSize = textEditor.fontSize || 48;
    const fontFamily = textEditor.fontFamily || 'Inter, sans-serif';

    if (textEditor.layerId) {
      dispatch({
        type: 'text.edit',
        layerId: textEditor.layerId,
        textData: {
          content: textEditor.content,
          style: {
            fontSize,
            fontFamily,
            lineHeight: Math.round(fontSize * 1.25),
          } as any,
        },
        source: 'user',
      });
    } else {
      dispatch({
        type: 'text.create',
        position: textEditor.docPt,
        textData: {
          content: textEditor.content,
          style: {
            fontFamily,
            fontWeight: 500,
            fontStyle: 'normal',
            fontSize,
            color: foreground,
            letterSpacing: 0,
            lineHeight: Math.round(fontSize * 1.25),
            textAlign: 'left',
          },
        },
        source: 'user',
      });
    }
    setTextEditor(null);
  };

  // ─── Cursor style ────────────────────────────────────────────────────────

  const getCursor = () => {
    switch (tool.activeTool) {
      case 'hand':           return 'grab';
      case 'zoom':           return 'zoom-in';
      case 'brush':
      case 'pencil':
      case 'eraser':         return 'crosshair';
      case 'eyedropper':     return 'crosshair';
      case 'crop':           return 'crosshair';
      case 'marqueeRect':
      case 'marqueeEllipse': return 'crosshair';
      case 'fill':           return 'crosshair';
      case 'text':           return 'text';
      case 'move':           return 'move';
      default:               return 'default';
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
        onDoubleClick={onDoubleClick}
      />

      {/* Overlay canvas (selection marching ants, crop guides, etc.) */}
      <canvas
        ref={overlayRef}
        width={width}
        height={height}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Floating Crop Confirmation Toolbar */}
      {activePendingCrop && (
        <div
          className="absolute z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/90 border border-neutral-700 shadow-2xl backdrop-blur-xs text-xs text-neutral-200"
          style={{
            left: Math.max(20, Math.min(width - 250, viewport.panX + activePendingCrop.x * viewport.zoom)),
            top: Math.max(20, viewport.panY + (activePendingCrop.y + activePendingCrop.height) * viewport.zoom + 12),
          }}
        >
          <span className="text-[11px] font-mono text-neutral-400">
            {activePendingCrop.width} × {activePendingCrop.height} px
          </span>
          <div className="w-px h-3.5 bg-neutral-700" />
          <button
            onClick={() => {
              dispatch({ type: 'transform.crop', rect: activePendingCrop, source: 'user' });
              setPendingCrop(null);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow"
            title="Commit Crop (Enter)"
          >
            <Check className="w-3.5 h-3.5" />
            Crop
          </button>
          <button
            onClick={() => setPendingCrop(null)}
            className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white"
            title="Cancel Crop (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Pen (Vector) Path Toolbar */}
      {tool.activeTool === 'vector' && penPathCount > 0 && (
        <div
          className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-neutral-900/95 border border-blue-500 shadow-2xl backdrop-blur-xs text-xs text-neutral-200"
        >
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
          <span className="text-[11px] font-mono text-neutral-300">
            Pen Path: {penPathCount} pts
          </span>
          <div className="w-px h-3.5 bg-neutral-700" />
          <button
            onClick={() => commitPenPath(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow text-xs transition-colors"
            title="Close shape loop & Stroke onto layer (Enter)"
          >
            <Check className="w-3 h-3" />
            Stroke Shape
          </button>
          <button
            onClick={() => commitPenPath(false)}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
            title="Stroke open path onto layer"
          >
            Stroke Open
          </button>
          <button
            onClick={() => {
              penPoints.current = [];
              setPenPathCount(0);
              renderOverlay();
            }}
            className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="Clear Path (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Inline Text Editor */}
      {textEditor && (
        <div
          className="absolute z-30 bg-neutral-850/95 border border-blue-500 rounded-md shadow-2xl p-2.5 flex flex-col gap-2 min-w-72"
          style={{
            left: Math.max(10, Math.min(width - 320, viewport.panX + textEditor.docPt.x * viewport.zoom)),
            top: Math.max(10, Math.min(height - 180, viewport.panY + textEditor.docPt.y * viewport.zoom)),
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-400">
            <span>{textEditor.layerId ? 'Edit Text Layer' : 'New Text Layer'}</span>
            <button
              onClick={() => setTextEditor(null)}
              className="p-0.5 hover:text-white text-neutral-500"
            >
              ✕
            </button>
          </div>

          {/* Font Size & Family Controls */}
          <div className="flex items-center gap-2 text-xs bg-neutral-800/80 p-1.5 rounded border border-neutral-700/60">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-neutral-400">Size:</span>
              <input
                type="number"
                min={8}
                max={500}
                value={textEditor.fontSize}
                onChange={e => setTextEditor({ ...textEditor, fontSize: Math.max(8, Number(e.target.value)) })}
                className="w-16 bg-neutral-750 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white"
              />
              <span className="text-[10px] text-neutral-500">px</span>
            </div>
            <select
              value={textEditor.fontFamily}
              onChange={e => setTextEditor({ ...textEditor, fontFamily: e.target.value })}
              className="flex-1 bg-neutral-750 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white"
            >
              <option value="Inter, sans-serif">Inter</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="Helvetica, sans-serif">Helvetica</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="'Courier New', monospace">Courier New</option>
              <option value="Impact, sans-serif">Impact</option>
            </select>
          </div>

          <textarea
            autoFocus
            rows={2}
            value={textEditor.content}
            onChange={e => setTextEditor({ ...textEditor, content: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
                e.preventDefault();
                commitText();
              }
              if (e.key === 'Escape') setTextEditor(null);
            }}
            className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 resize-none font-sans"
            placeholder="Type text..."
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setTextEditor(null)}
              className="px-2.5 py-1 rounded text-xs text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitText}
              className="px-3 py-1 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow shadow-blue-600/30"
            >
              Apply
            </button>
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
