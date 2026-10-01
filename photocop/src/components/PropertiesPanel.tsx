/**
 * PhotoCop - Properties Panel
 *
 * Context-sensitive panel that shows:
 * - Brush controls when a painting tool is active
 * - Layer transform when Move tool is active
 * - Adjustment controls for adjustment layers
 * - Curves editor
 * - Text properties
 */

import React, { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { BrushSettings, Layer, CurvePoint, CurvesData } from '../core/types';
import { BLEND_MODES_LIST } from '../core/blendModes';

// ─── Brush Controls ───────────────────────────────────────────────────────────

const BrushControls: React.FC = () => {
  const { brushSettings, setBrushSettings } = useEditorStore(s => ({
    brushSettings: s.brushSettings,
    setBrushSettings: s.setBrushSettings,
  }));

  const slider = (
    label: string,
    key: keyof BrushSettings,
    min: number,
    max: number,
    step = 1
  ) => (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[11px] text-neutral-400 w-16 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step}
        value={brushSettings[key] as number}
        onChange={e => setBrushSettings({ [key]: Number(e.target.value) })}
        className="flex-1 h-1 accent-blue-500"
      />
      <span className="text-[11px] text-neutral-300 w-8 text-right">
        {Math.round(brushSettings[key] as number)}
      </span>
    </div>
  );

  return (
    <section>
      <SectionHeader>Brush</SectionHeader>
      <div className="px-3 py-2">
        {slider('Size', 'size', 1, 500)}
        {slider('Hardness', 'hardness', 0, 100)}
        {slider('Opacity', 'opacity', 1, 100)}
        {slider('Flow', 'flow', 1, 100)}
        {slider('Spacing', 'spacing', 1, 200)}
        {slider('Angle', 'angle', 0, 360)}
        {slider('Roundness', 'roundness', 1, 100)}
      </div>
    </section>
  );
};

// ─── Curves Editor ────────────────────────────────────────────────────────────

interface CurvesEditorProps {
  layerId: string;
  curvesData: CurvesData;
}

type CurveChannel = 'rgb' | 'r' | 'g' | 'b';

const CHANNEL_COLORS: Record<CurveChannel, string> = {
  rgb: '#aaa',
  r: '#f55',
  g: '#5f5',
  b: '#55f',
};

const CurvesEditor: React.FC<CurvesEditorProps> = ({ layerId, curvesData }) => {
  const dispatch = useEditorStore(s => s.dispatch);
  const [activeChannel, setActiveChannel] = useState<CurveChannel>('rgb');
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const points = curvesData[activeChannel];
  const size = 160;

  const setPoints = (newPts: CurvePoint[]) => {
    dispatch({
      type: 'curves.set_points',
      layerId,
      channel: activeChannel,
      points: newPts,
      source: 'user',
    });
  };

  const ptToSvg = (pt: CurvePoint) => ({
    x: pt.input * size,
    y: (1 - pt.output) * size,
  });

  const buildPath = (pts: CurvePoint[]) => {
    if (pts.length === 0) return `M 0 ${size} L ${size} 0`;
    const sorted = [...pts].sort((a, b) => a.input - b.input);
    let d = `M 0 ${(1 - (sorted[0]?.output ?? 0)) * size}`;
    sorted.forEach(pt => {
      const { x, y } = ptToSvg(pt);
      d += ` L ${x} ${y}`;
    });
    d += ` L ${size} ${(1 - (sorted[sorted.length - 1]?.output ?? 1)) * size}`;
    return d;
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingIdx !== null) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / size;
    const y = 1 - (e.clientY - rect.top) / size;
    const newPt: CurvePoint = {
      input: Math.max(0, Math.min(1, x)),
      output: Math.max(0, Math.min(1, y)),
    };
    setPoints([...points, newPt]);
  };

  const handlePointMouseDown = (idx: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingIdx(idx);
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingIdx === null) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / size));
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / size));
    const updated = points.map((p, i) =>
      i === draggingIdx ? { input: x, output: y } : p
    );
    setPoints(updated);
  };

  const handleSvgMouseUp = () => setDraggingIdx(null);

  const removePoint = (idx: number) => {
    setPoints(points.filter((_, i) => i !== idx));
  };

  return (
    <div className="px-3 py-2">
      {/* Channel selector */}
      <div className="flex gap-1 mb-2">
        {(['rgb', 'r', 'g', 'b'] as CurveChannel[]).map(ch => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold transition-colors
              ${activeChannel === ch ? 'bg-neutral-500 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            style={activeChannel === ch ? { color: CHANNEL_COLORS[ch] } : {}}
          >
            {ch}
          </button>
        ))}
        <button
          onClick={() => setPoints([{ input: 0, output: 0 }, { input: 1, output: 1 }])}
          className="text-[10px] px-1.5 py-0.5 rounded text-neutral-600 hover:text-neutral-400 ml-auto"
        >
          Reset
        </button>
      </div>

      {/* Curve canvas */}
      <svg
        width={size} height={size}
        className="bg-neutral-800 rounded border border-neutral-600 cursor-crosshair block mx-auto"
        onClick={handleSvgClick}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
      >
        {/* Grid */}
        {[64, 128, 192].map(v => (
          <React.Fragment key={v}>
            <line x1={v} y1={0} x2={v} y2={size} stroke="#333" strokeWidth={0.5} />
            <line x1={0} y1={v} x2={size} y2={v} stroke="#333" strokeWidth={0.5} />
          </React.Fragment>
        ))}
        {/* Diagonal guide */}
        <line x1={0} y1={size} x2={size} y2={0} stroke="#333" strokeWidth={0.5} strokeDasharray="4 4" />

        {/* Curve path */}
        <path
          d={buildPath(points)}
          fill="none"
          stroke={CHANNEL_COLORS[activeChannel]}
          strokeWidth={1.5}
        />

        {/* Control points */}
        {points.map((pt, idx) => {
          const { x, y } = ptToSvg(pt);
          return (
            <circle
              key={idx}
              cx={x} cy={y} r={4}
              fill={CHANNEL_COLORS[activeChannel]}
              stroke="#fff"
              strokeWidth={1}
              className="cursor-grab active:cursor-grabbing"
              onMouseDown={handlePointMouseDown(idx)}
              onDoubleClick={e => { e.stopPropagation(); removePoint(idx); }}
            />
          );
        })}
      </svg>
      <div className="text-[10px] text-neutral-600 text-center mt-1">
        Click to add · Double-click to remove
      </div>
    </div>
  );
};

// ─── Adjustment Layer Controls ────────────────────────────────────────────────

const AdjustmentControls: React.FC<{ layer: Layer }> = ({ layer }) => {
  const dispatch = useEditorStore(s => s.dispatch);
  const adj = layer.adjustment;
  if (!adj) return null;

  if (adj.type === 'brightnessContrast') {
    return (
      <div className="px-3 py-2">
        <AdjSlider
          label="Brightness"
          value={adj.data.brightness}
          min={-150} max={150}
          onChange={v => dispatch({
            type: 'adjustment.set',
            layerId: layer.id,
            adjustment: { type: 'brightnessContrast', data: { ...adj.data, brightness: v } },
            source: 'user',
          })}
        />
        <AdjSlider
          label="Contrast"
          value={adj.data.contrast}
          min={-50} max={100}
          onChange={v => dispatch({
            type: 'adjustment.set',
            layerId: layer.id,
            adjustment: { type: 'brightnessContrast', data: { ...adj.data, contrast: v } },
            source: 'user',
          })}
        />
      </div>
    );
  }

  if (adj.type === 'hueSaturation') {
    return (
      <div className="px-3 py-2">
        <AdjSlider label="Hue"        value={adj.data.hue}        min={-180} max={180}
          onChange={v => dispatch({ type: 'adjustment.set', layerId: layer.id, adjustment: { type: 'hueSaturation', data: { ...adj.data, hue: v } }, source: 'user' })} />
        <AdjSlider label="Saturation" value={adj.data.saturation} min={-100} max={100}
          onChange={v => dispatch({ type: 'adjustment.set', layerId: layer.id, adjustment: { type: 'hueSaturation', data: { ...adj.data, saturation: v } }, source: 'user' })} />
        <AdjSlider label="Lightness"  value={adj.data.lightness}  min={-100} max={100}
          onChange={v => dispatch({ type: 'adjustment.set', layerId: layer.id, adjustment: { type: 'hueSaturation', data: { ...adj.data, lightness: v } }, source: 'user' })} />
      </div>
    );
  }

  if (adj.type === 'levels') {
    return (
      <div className="px-3 py-2">
        <AdjSlider label="Input Min"  value={adj.data.inputMin}  min={0}   max={253} onChange={v => dispatch({ type: 'adjustment.set', layerId: layer.id, adjustment: { type: 'levels', data: { ...adj.data, inputMin: v } }, source: 'user' })} />
        <AdjSlider label="Gamma"      value={adj.data.gamma}     min={0.1} max={9.99} step={0.01} onChange={v => dispatch({ type: 'adjustment.set', layerId: layer.id, adjustment: { type: 'levels', data: { ...adj.data, gamma: v } }, source: 'user' })} />
        <AdjSlider label="Input Max"  value={adj.data.inputMax}  min={2}   max={255} onChange={v => dispatch({ type: 'adjustment.set', layerId: layer.id, adjustment: { type: 'levels', data: { ...adj.data, inputMax: v } }, source: 'user' })} />
        <AdjSlider label="Output Min" value={adj.data.outputMin} min={0}   max={253} onChange={v => dispatch({ type: 'adjustment.set', layerId: layer.id, adjustment: { type: 'levels', data: { ...adj.data, outputMin: v } }, source: 'user' })} />
        <AdjSlider label="Output Max" value={adj.data.outputMax} min={2}   max={255} onChange={v => dispatch({ type: 'adjustment.set', layerId: layer.id, adjustment: { type: 'levels', data: { ...adj.data, outputMax: v } }, source: 'user' })} />
      </div>
    );
  }

  if (adj.type === 'curves') {
    return <CurvesEditor layerId={layer.id} curvesData={adj.data} />;
  }

  return (
    <div className="px-3 py-2 text-xs text-neutral-500">
      {adj.type} adjustment
    </div>
  );
};

const AdjSlider: React.FC<{
  label: string; value: number; min: number; max: number;
  step?: number; onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, onChange }) => (
  <div className="flex items-center gap-2 mb-2">
    <span className="text-[11px] text-neutral-400 w-20 shrink-0">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="flex-1 h-1 accent-blue-500" />
    <span className="text-[11px] text-neutral-300 w-10 text-right">
      {Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}
    </span>
  </div>
);

// ─── Layer Transform Controls ─────────────────────────────────────────────────

const LayerTransformControls: React.FC<{ layer: Layer }> = ({ layer }) => {
  const dispatch = useEditorStore(s => s.dispatch);
  const { x, y, scaleX, scaleY, rotation } = layer.transform;

  const update = (key: string, value: number) => {
    dispatch({
      type: 'layer.transform',
      layerId: layer.id,
      transform: { [key]: value },
      source: 'user',
    });
  };

  return (
    <div className="px-3 py-2">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'X', key: 'x', value: x },
          { label: 'Y', key: 'y', value: y },
          { label: 'W %', key: 'scaleX', value: Math.round(scaleX * 100) },
          { label: 'H %', key: 'scaleY', value: Math.round(scaleY * 100) },
          { label: 'Rot°', key: 'rotation', value: rotation },
        ].map(({ label, key, value }) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-500 w-6 shrink-0">{label}</span>
            <input
              type="number"
              value={value}
              onChange={e => {
                let v = Number(e.target.value);
                if (key === 'scaleX' || key === 'scaleY') v = v / 100;
                update(key, v);
              }}
              className="w-full bg-neutral-700 border border-neutral-600 rounded px-1 py-0.5
                text-[11px] text-neutral-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Main Properties Panel ────────────────────────────────────────────────────

export const PropertiesPanel: React.FC = () => {
  const { activeTool, activeLayer, doc } = useEditorStore(s => ({
    activeTool: s.tool.activeTool,
    activeLayer: s.document?.layers[s.document?.activeLayerId ?? ''] ?? null,
    doc: s.document,
  }));

  const paintingTools = ['brush', 'pencil', 'eraser', 'clone', 'healing', 'dodge', 'burn', 'blur', 'sharpen'];

  return (
    <div className="flex flex-col h-full bg-neutral-800 overflow-y-auto">
      <div className="flex items-center px-2 py-1.5 border-b border-neutral-700 shrink-0">
        <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Properties</span>
      </div>

      {/* Brush controls when painting */}
      {paintingTools.includes(activeTool) && <BrushControls />}

      {/* Layer-specific controls */}
      {activeLayer && (
        <>
          {activeTool === 'move' && (
            <section>
              <SectionHeader>Transform</SectionHeader>
              <LayerTransformControls layer={activeLayer} />
            </section>
          )}

          {activeLayer.type === 'adjustment' && (
            <section>
              <SectionHeader>
                {activeLayer.adjustment?.type ?? 'Adjustment'}
              </SectionHeader>
              <AdjustmentControls layer={activeLayer} />
            </section>
          )}

          {/* Quick adjustment adder */}
          <section>
            <SectionHeader>Add Adjustment</SectionHeader>
            <AddAdjustmentButtons />
          </section>
        </>
      )}

      {!doc && (
        <div className="flex-1 flex items-center justify-center text-neutral-600 text-xs px-3 text-center">
          Open or create a document to see properties
        </div>
      )}
    </div>
  );
};

const AddAdjustmentButtons: React.FC = () => {
  const dispatch = useEditorStore(s => s.dispatch);
  const adjustments = [
    { label: 'Curves',   adj: { type: 'curves' as const, data: { rgb: [], r: [], g: [], b: [] } } },
    { label: 'B/C',      adj: { type: 'brightnessContrast' as const, data: { brightness: 0, contrast: 0 } } },
    { label: 'Hue/Sat',  adj: { type: 'hueSaturation' as const, data: { hue: 0, saturation: 0, lightness: 0 } } },
    { label: 'Levels',   adj: { type: 'levels' as const, data: { inputMin: 0, inputMax: 255, gamma: 1, outputMin: 0, outputMax: 255 } } },
    { label: 'Invert',   adj: { type: 'invert' as const } },
    { label: 'Threshold',adj: { type: 'threshold' as const, data: { value: 128 } } },
    { label: 'Posterize',adj: { type: 'posterize' as const, data: { levels: 4 } } },
  ];

  return (
    <div className="px-3 py-2 flex flex-wrap gap-1">
      {adjustments.map(({ label, adj }) => (
        <button
          key={label}
          onClick={() => dispatch({ type: 'adjustment.create', adjustment: adj as any, source: 'user' })}
          className="text-[10px] px-2 py-1 rounded bg-neutral-700 text-neutral-300
            hover:bg-neutral-600 transition-colors"
        >
          {label}
        </button>
      ))}
    </div>
  );
};

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-500
    font-semibold border-b border-neutral-700/50 bg-neutral-800/80">
    {children}
  </div>
);
