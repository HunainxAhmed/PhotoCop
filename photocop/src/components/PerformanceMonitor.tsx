/**
 * PhotoCop - Performance Monitor
 * Shows render time, command latency, and render count.
 */

import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

export const PerformanceMonitor: React.FC = () => {
  const [open, setOpen] = useState(false);
  const metrics = useEditorStore(s => s.metrics);
  const viewport = useEditorStore(s => s.viewport);
  const doc = useEditorStore(s => s.document);

  return (
    <div className="absolute bottom-6 right-3 z-50">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 bg-neutral-900/80 backdrop-blur border border-neutral-700
          rounded px-1.5 py-0.5 text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        <Activity className="w-2.5 h-2.5" />
        <span>{metrics.lastRenderMs.toFixed(1)}ms</span>
        {open ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronUp className="w-2.5 h-2.5" />}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 bg-neutral-900/95 backdrop-blur
          border border-neutral-700 rounded p-2 text-[10px] text-neutral-400 font-mono min-w-[160px]">
          <Row label="Render time" value={`${metrics.lastRenderMs.toFixed(2)}ms`} />
          <Row label="Command time" value={`${metrics.lastCommandMs.toFixed(2)}ms`} />
          <Row label="Render count" value={String(metrics.renderCount)} />
          <Row label="Zoom" value={`${Math.round(viewport.zoom * 100)}%`} />
          {doc && (
            <>
              <Row label="Doc size" value={`${doc.width}×${doc.height}`} />
              <Row label="Layers" value={String(doc.layerOrder.length)} />
            </>
          )}
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-4">
    <span className="text-neutral-600">{label}</span>
    <span className="text-neutral-300">{value}</span>
  </div>
);
