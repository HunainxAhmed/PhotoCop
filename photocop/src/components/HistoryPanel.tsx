/**
 * PhotoCop - History Panel
 *
 * Shows undo/redo history with source indicators,
 * time elapsed, and step navigation.
 */

import React from 'react';
import { RotateCcw, RotateCw, History, Bot, Monitor, Code } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import type { HistoryEntry } from '../core/types';

const SOURCE_ICONS = {
  user:   <Monitor className="w-3 h-3 text-neutral-400" />,
  ai:     <Bot className="w-3 h-3 text-purple-400" />,
  mcp:    <Code className="w-3 h-3 text-yellow-400" />,
  script: <Code className="w-3 h-3 text-green-400" />,
  macro:  <Code className="w-3 h-3 text-blue-400" />,
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const HistoryPanel: React.FC = () => {
  const history = useEditorStore(s => s.history);
  const historyIndex = useEditorStore(s => s.historyIndex);
  const dispatch = useEditorStore(s => s.dispatch);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="flex flex-col h-full bg-neutral-800">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-neutral-700 shrink-0">
        <History className="w-3.5 h-3.5 text-neutral-400" />
        <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex-1">History</span>
        <button
          disabled={!canUndo}
          onClick={() => dispatch({ type: 'history.undo', source: 'user' })}
          title="Undo (Ctrl+Z)"
          className={`p-1 rounded transition-colors ${canUndo ? 'text-neutral-400 hover:text-white hover:bg-neutral-700' : 'text-neutral-700 cursor-not-allowed'}`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          disabled={!canRedo}
          onClick={() => dispatch({ type: 'history.redo', source: 'user' })}
          title="Redo (Ctrl+Shift+Z)"
          className={`p-1 rounded transition-colors ${canRedo ? 'text-neutral-400 hover:text-white hover:bg-neutral-700' : 'text-neutral-700 cursor-not-allowed'}`}
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <div className="text-neutral-600 text-xs text-center py-4">No history yet</div>
        ) : (
          [...history].reverse().map((entry, revIdx) => {
            const idx = history.length - 1 - revIdx;
            const isCurrent = idx === historyIndex;
            const isFuture = idx > historyIndex;
            return (
              <HistoryRow
                key={entry.id}
                entry={entry}
                isCurrent={isCurrent}
                isFuture={isFuture}
                onClick={() => {
                  const steps = idx - historyIndex;
                  if (steps < 0) {
                    for (let i = 0; i < -steps; i++) {
                      dispatch({ type: 'history.undo', source: 'user' });
                    }
                  }
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

const HistoryRow: React.FC<{
  entry: HistoryEntry;
  isCurrent: boolean;
  isFuture: boolean;
  onClick: () => void;
}> = ({ entry, isCurrent, isFuture, onClick }) => (
  <div
    onClick={onClick}
    className={`flex items-center gap-2 px-2 py-1.5 border-b border-neutral-700/30 cursor-pointer
      transition-colors text-xs
      ${isCurrent ? 'bg-blue-600/20' : ''}
      ${isFuture  ? 'opacity-40'      : ''}
      ${!isCurrent && !isFuture ? 'hover:bg-neutral-700/40' : ''}`}
  >
    <span className="shrink-0">{SOURCE_ICONS[entry.source]}</span>
    <span className={`flex-1 truncate ${isCurrent ? 'text-neutral-100 font-medium' : 'text-neutral-400'}`}>
      {entry.description}
    </span>
    <span className="text-neutral-600 text-[10px] shrink-0">{formatTime(entry.timestamp)}</span>
  </div>
);
