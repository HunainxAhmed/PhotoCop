/**
 * PhotoCop - Status Bar
 */

import React from 'react';
import { useEditorStore } from '../store/editorStore';

export const StatusBar: React.FC = () => {
  const doc = useEditorStore(s => s.document);
  const selection = useEditorStore(s => s.selection);
  const viewport = useEditorStore(s => s.viewport);
  const activeTool = useEditorStore(s => s.tool.activeTool);
  const foreground = useEditorStore(s => s.foreground);

  const fg = `rgb(${foreground.r},${foreground.g},${foreground.b})`;

  return (
    <div className="flex items-center gap-4 px-3 h-6 bg-neutral-900 border-t border-neutral-700
      text-[11px] text-neutral-500 shrink-0">

      {/* Tool */}
      <span className="capitalize">{activeTool}</span>

      {/* Document size */}
      {doc && (
        <span>{doc.width} × {doc.height} px</span>
      )}

      {/* Zoom */}
      <span>Zoom: {Math.round(viewport.zoom * 100)}%</span>

      {/* Selection */}
      {selection.bounds && (
        <span>
          Sel: {Math.round(selection.bounds.width)} × {Math.round(selection.bounds.height)}
        </span>
      )}

      <div className="flex-1" />

      {/* Color swatch */}
      <div className="flex items-center gap-1">
        <span>FG:</span>
        <div
          className="w-3 h-3 rounded-sm border border-neutral-600 inline-block"
          style={{ backgroundColor: fg }}
        />
        <span className="font-mono">
          #{foreground.r.toString(16).padStart(2,'0')}{foreground.g.toString(16).padStart(2,'0')}{foreground.b.toString(16).padStart(2,'0')}
        </span>
      </div>

      {/* Layers count */}
      {doc && (
        <span>{doc.layerOrder.length} layer{doc.layerOrder.length !== 1 ? 's' : ''}</span>
      )}
    </div>
  );
};
