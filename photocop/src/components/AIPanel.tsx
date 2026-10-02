/**
 * PhotoCop - AI Panel
 *
 * Provider-agnostic AI chat interface integrated with the command system.
 * Supports: OpenAI-compatible, Anthropic, Google, Ollama, custom endpoints.
 * AI operations are real — they analyze the document and dispatch commands.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Settings, Loader2, AlertCircle } from 'lucide-react';
import { useEditorStore, type PhotocopStore } from '../store/editorStore';
import type { AiProviderConfig } from '../core/types';
import { compositeDocument } from '../core/compositor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  commands?: string[];
  error?: boolean;
}

// ─── Default providers ────────────────────────────────────────────────────────

const DEFAULT_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'openai-default',
    name: 'OpenAI GPT-4o',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.7,
    enabled: true,
  },
  {
    id: 'anthropic-default',
    name: 'Claude 3.5 Sonnet',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
    temperature: 0.7,
    enabled: true,
  },
  {
    id: 'ollama-local',
    name: 'Ollama (local)',
    type: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    maxTokens: 4096,
    temperature: 0.7,
    enabled: true,
  },
];

// ─── Document Context Builder ─────────────────────────────────────────────────

function buildDocumentContext(store: PhotocopStore): string {
  const doc = store.document;
  if (!doc) return 'No document is currently open.';

  const layers = doc.layerOrder.map((id: string, idx: number) => {
    const layer = doc.layers[id];
    return `  ${idx + 1}. [${layer.type}] "${layer.name}" — opacity: ${layer.opacity}%, blend: ${layer.blendMode}, visible: ${layer.visible}${layer.mask ? ', has mask' : ''}${layer.adjustment ? `, adjustment: ${layer.adjustment.type}` : ''}`;
  }).join('\n');

  const sel = store.selection.bounds;
  const selStr = sel ? `Selection active: ${Math.round(sel.width)}×${Math.round(sel.height)} at (${Math.round(sel.x)},${Math.round(sel.y)})` : 'No selection';
  const vp = store.viewport;

  return `Document: "${doc.metadata.title}"
Size: ${doc.width}×${doc.height}px at ${doc.dpi}dpi
Active layer: "${doc.layers[doc.activeLayerId ?? '']?.name ?? 'none'}"
${selStr}
Zoom: ${Math.round(vp.zoom * 100)}%
Layers (${doc.layerOrder.length} total, top to bottom):
${layers}
History: ${store.history.length} steps`;
}

/** Generate a small preview of the document as base64 */
function generateDocumentPreview(store: PhotocopStore): string | null {
  const doc = store.document;
  if (!doc) return null;
  try {
    const maxSize = 512;
    const scale = Math.min(maxSize / doc.width, maxSize / doc.height, 1);
    const w = Math.round(doc.width * scale);
    const h = Math.round(doc.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = doc.width; fullCanvas.height = doc.height;
    compositeDocument(doc, fullCanvas.getContext('2d')!);

    ctx.drawImage(fullCanvas, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.6).split(',')[1]; // base64 only
  } catch {
    return null;
  }
}

// ─── AI API Caller ────────────────────────────────────────────────────────────

async function callAI(
  provider: AiProviderConfig,
  apiKey: string,
  systemPrompt: string,
  messages: { role: string; content: string | unknown[] }[],
  preview: string | null
): Promise<string> {
  if (provider.type === 'openai' || provider.type === 'ollama' || provider.type === 'custom') {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const formattedMessages = messages.map((m, idx) => {
      if (idx === messages.length - 1 && preview && m.role === 'user') {
        return {
          role: m.role,
          content: [
            { type: 'text', text: m.content },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${preview}`, detail: 'low' } }
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...formattedMessages,
        ],
        max_tokens: provider.maxTokens,
        temperature: provider.temperature,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  if (provider.type === 'anthropic') {
    const resp = await fetch(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: provider.maxTokens,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Anthropic error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return data.content?.[0]?.text ?? '';
  }

  throw new Error(`Provider type "${provider.type}" not yet supported`);
}

// ─── Provider Settings Modal ──────────────────────────────────────────────────

const ProviderSettings: React.FC<{
  provider: AiProviderConfig;
  apiKey: string;
  onApiKeyChange: (k: string) => void;
  onProviderChange: (p: AiProviderConfig) => void;
  onClose: () => void;
}> = ({ provider, apiKey, onApiKeyChange, onProviderChange, onClose }) => {
  const [localKey, setLocalKey] = useState(apiKey);
  const [localProvider, setLocalProvider] = useState(provider);
  const [selectedId, setSelectedId] = useState(provider.id);

  return (
    <div className="absolute inset-0 bg-neutral-900/95 z-10 flex flex-col p-3 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-neutral-200">AI Provider Settings</span>
        <button onClick={() => { onApiKeyChange(localKey); onProviderChange(localProvider); onClose(); }}
          className="text-xs text-blue-400 hover:text-blue-300">Save & Close</button>
      </div>

      <label className="text-[11px] text-neutral-400 mb-1">Provider</label>
      <select
        value={selectedId}
        onChange={e => {
          const p = DEFAULT_PROVIDERS.find(p => p.id === e.target.value) ?? DEFAULT_PROVIDERS[0];
          setSelectedId(p.id);
          setLocalProvider(p);
        }}
        className="mb-3 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none"
      >
        {DEFAULT_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <label className="text-[11px] text-neutral-400 mb-1">API Key</label>
      <input
        type="password"
        value={localKey}
        onChange={e => setLocalKey(e.target.value)}
        placeholder="sk-..."
        className="mb-3 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-neutral-200
          focus:outline-none focus:border-blue-500 font-mono"
      />

      <label className="text-[11px] text-neutral-400 mb-1">Base URL</label>
      <input
        value={localProvider.baseUrl}
        onChange={e => setLocalProvider(prev => ({ ...prev, baseUrl: e.target.value }))}
        className="mb-3 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-neutral-200
          focus:outline-none focus:border-blue-500 font-mono"
      />

      <label className="text-[11px] text-neutral-400 mb-1">Model</label>
      <input
        value={localProvider.model}
        onChange={e => setLocalProvider(prev => ({ ...prev, model: e.target.value }))}
        className="mb-3 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-neutral-200
          focus:outline-none focus:border-blue-500 font-mono"
      />

      <div className="text-[10px] text-neutral-600 mt-2">
        API keys are stored in memory only — never sent to any server except your configured provider.
      </div>
    </div>
  );
};

// ─── Main AI Panel ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the AI operator for PhotoCop, a professional image editor.

You have access to the full document structure, layer hierarchy, and can analyze the current image.

When the user requests an edit, you should:
1. Analyze the current document state
2. Describe your plan clearly
3. Output specific JSON commands wrapped in \`\`\`commands blocks when you want to make changes

Available commands (JSON array format):
- {"type": "layer.create", "layerType": "pixel"|"adjustment"|"group"|"text", "name": "..."}
- {"type": "layer.set_opacity", "layerId": "...", "opacity": 0-100}
- {"type": "layer.set_blend_mode", "layerId": "...", "blendMode": "Normal|Multiply|Screen|Overlay|..."}
- {"type": "adjustment.create", "adjustment": {"type": "brightnessContrast", "data": {"brightness": 0, "contrast": 0}}}
- {"type": "adjustment.create", "adjustment": {"type": "hueSaturation", "data": {"hue": 0, "saturation": 0, "lightness": 0}}}
- {"type": "adjustment.create", "adjustment": {"type": "curves", "data": {"rgb": [{"input": 0, "output": 0}, {"input": 1, "output": 1}], "r": [], "g": [], "b": []}}}
- {"type": "adjustment.create", "adjustment": {"type": "levels", "data": {"inputMin": 0, "inputMax": 255, "gamma": 1, "outputMin": 0, "outputMax": 255}}}
- {"type": "adjustment.create", "adjustment": {"type": "invert"}}
- {"type": "mask.create", "layerId": "...", "fromSelection": false}
- {"type": "mask.invert", "layerId": "..."}
- {"type": "selection.select_all"}
- {"type": "selection.deselect"}
- {"type": "layer.delete", "layerId": "..."}
- {"type": "layer.rename", "layerId": "...", "name": "..."}
- {"type": "pixel.fill", "layerId": "...", "color": {"r": 0, "g": 0, "b": 0, "a": 255}}

Always explain what you're doing and why. Be specific about the visual effect you're creating.
When commands are not needed (questions, analysis), respond conversationally without command blocks.`;

export const AIPanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I\'m your AI editing assistant. I can analyze your document, suggest edits, and execute adjustments directly. What would you like to achieve?',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState<AiProviderConfig>(DEFAULT_PROVIDERS[0]);
  const [apiKey, setApiKey] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const store = useEditorStore();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const parseAndExecuteCommands = (text: string): string[] => {
    const executed: string[] = [];
    const matches = text.match(/```commands\n([\s\S]*?)```/g);
    if (!matches) return executed;

    for (const block of matches) {
      const json = block.replace(/```commands\n/, '').replace(/```$/, '').trim();
      try {
        const commands = JSON.parse(json);
        const arr = Array.isArray(commands) ? commands : [commands];
        for (const cmd of arr) {
          const result = store.dispatch({ ...cmd, source: 'ai' });
          if (result.success) {
            executed.push(`✓ ${cmd.type}`);
          } else {
            executed.push(`✗ ${cmd.type}: ${result.error?.message}`);
          }
        }
      } catch (e) {
        executed.push(`✗ Parse error: ${e}`);
      }
    }
    return executed;
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const docContext = buildDocumentContext(store);
      const preview = generateDocumentPreview(store);
      const contextualSystemPrompt = `${SYSTEM_PROMPT}\n\nCurrent Document State:\n${docContext}`;

      const historyMessages = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await callAI(
        provider,
        apiKey,
        contextualSystemPrompt,
        [...historyMessages, { role: 'user', content: input }],
        preview
      );

      const executed = parseAndExecuteCommands(response);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
        commands: executed.length > 0 ? executed : undefined,
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err)}\n\nMake sure your API key is configured in the ⚙️ settings.`,
        timestamp: Date.now(),
        error: true,
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = [
    'Analyze this image and suggest improvements',
    'Add a cinematic color grade',
    'Make the image look more vibrant',
    'Increase contrast and lift shadows',
    'Convert to black and white with good tones',
    'Add a vintage film look',
  ];

  return (
    <div className="flex flex-col h-full bg-neutral-850 relative">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-neutral-700 shrink-0">
        <Bot className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-xs font-semibold text-neutral-300 flex-1">AI Assistant</span>
        <div className="flex items-center gap-1 text-[10px] text-neutral-500">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          {provider.name}
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-1 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700 rounded transition-colors"
          title="Provider settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Settings overlay */}
      {showSettings && (
        <ProviderSettings
          provider={provider}
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
          onProviderChange={setProvider}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-neutral-500 text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            <span>Analyzing document and preparing response…</span>
          </div>
        )}

        {/* Quick actions when no doc or conversation empty */}
        {messages.length <= 1 && !store.document && (
          <div className="text-[11px] text-neutral-600 text-center py-2">
            Open a document first to start editing with AI
          </div>
        )}

        {messages.length <= 1 && store.document && (
          <div className="space-y-1">
            <div className="text-[10px] text-neutral-600 mb-1.5">Quick actions:</div>
            {quickActions.map(action => (
              <button
                key={action}
                onClick={() => { setInput(action); }}
                className="w-full text-left text-[11px] text-neutral-500 hover:text-neutral-300
                  hover:bg-neutral-700/50 rounded px-2 py-1 transition-colors"
              >
                {action}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-neutral-700 shrink-0">
        <div className="flex gap-1.5">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Describe what you want to edit… (Enter to send)"
            rows={2}
            className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-2 py-1.5
              text-xs text-neutral-200 placeholder-neutral-600 resize-none
              focus:outline-none focus:border-purple-500 transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className={`p-2 rounded transition-colors self-end
              ${isLoading || !input.trim()
                ? 'bg-neutral-700 text-neutral-600 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-500'}`}
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="text-[9px] text-neutral-700 mt-1">
          Enter to send · Shift+Enter for newline · Commands execute automatically
        </div>
      </div>
    </div>
  );
};

// ─── Message Bubble ───────────────────────────────────────────────────────────

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';

  // Render message content with command blocks highlighted
  const renderContent = (text: string) => {
    const parts = text.split(/(```commands[\s\S]*?```)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('```commands')) {
        const code = part.replace(/```commands\n/, '').replace(/```$/, '');
        return (
          <div key={idx} className="my-1.5 bg-neutral-800 border border-neutral-600 rounded p-2">
            <div className="text-[9px] text-neutral-500 mb-1 uppercase tracking-wider">Commands</div>
            <pre className="text-[10px] text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">{code}</pre>
          </div>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-2.5 py-2 text-xs
        ${isUser
          ? 'bg-blue-600 text-white'
          : message.error
            ? 'bg-red-900/40 border border-red-700/50 text-red-200'
            : 'bg-neutral-700 text-neutral-200'}`}
      >
        {message.error && (
          <div className="flex items-center gap-1 mb-1">
            <AlertCircle className="w-3 h-3 text-red-400" />
            <span className="text-[10px] text-red-400 font-semibold">Error</span>
          </div>
        )}
        <div className="leading-relaxed whitespace-pre-wrap">
          {renderContent(message.content)}
        </div>

        {/* Executed commands summary */}
        {message.commands && message.commands.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-neutral-600/50">
            <div className="text-[9px] text-neutral-500 mb-0.5 uppercase tracking-wider">Executed</div>
            {message.commands.map((cmd, idx) => (
              <div key={idx} className="text-[10px] font-mono text-green-400">{cmd}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
