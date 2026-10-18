'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Square,
  RotateCcw,
  Copy,
  Check,
  Menu,
  Sparkles,
  AlertCircle,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { ModelSelector } from '@/components/ModelSelector';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { UsageDashboardModal } from '@/components/UsageDashboardModal';
import { SettingsModal } from '@/components/SettingsModal';
import { ChatMessage, ModelCapability, ProviderId } from '@/lib/ai/types';
import { ConversationSummary } from '@/lib/storage';

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [models, setModels] = useState<ModelCapability[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('claude-opus-4.8');
  const [selectedProvider, setSelectedProvider] = useState<'auto' | ProviderId>('auto');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fallbackAlert, setFallbackAlert] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userScrolledUpRef = useRef<boolean>(false);

  // Fetch initial models & conversations
  useEffect(() => {
    fetchModels();
    fetchConversations();
  }, []);

  // Handle scroll detection
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 80;
    userScrolledUpRef.current = !isAtBottom;
  };

  const scrollToBottom = () => {
    if (!userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Load models catalog
  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
        if (data.models && data.models.length > 0) {
          setSelectedModelId(data.models[0].id);
        }
      }
    } catch {
      // Fallback
    }
  };

  // Load conversations
  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        if (data.conversations?.length > 0 && !activeConvId) {
          selectConversation(data.conversations[0].id);
        }
      }
    } catch {
      // Fallback
    }
  };

  const selectConversation = async (convId: string) => {
    setActiveConvId(convId);
    setErrorMessage(null);
    setFallbackAlert(null);
    try {
      const res = await fetch(`/api/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // Fallback
    }
  };

  const handleNewConversation = async () => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Chat',
          model: selectedModelId,
          provider: selectedProvider,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setConversations((prev) => [data.conversation, ...prev]);
        setActiveConvId(data.conversation.id);
        setMessages([]);
        setErrorMessage(null);
        setFallbackAlert(null);
      }
    } catch {
      // Fallback
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch {
      // Fallback
    }
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  // Send message
  const handleSend = async (overrideContent?: string) => {
    const textToSend = overrideContent !== undefined ? overrideContent : input.trim();
    if (!textToSend || isStreaming) return;

    setErrorMessage(null);
    setFallbackAlert(null);
    userScrolledUpRef.current = false;

    // Create user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    if (overrideContent === undefined) {
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }

    // Prepare assistant placeholder message
    const assistantMsgId = crypto.randomUUID();
    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      model: selectedModelId,
      createdAt: new Date().toISOString(),
    };

    setMessages([...newMessages, assistantPlaceholder]);
    setIsStreaming(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          model: selectedModelId,
          provider: selectedProvider === 'auto' ? undefined : selectedProvider,
          conversationId: activeConvId || undefined,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorJson = await response.json();
        throw new Error(errorJson.error || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response stream received from server');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('event: fallback')) {
            // Next line will contain data
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.notice) {
                setFallbackAlert(parsed.notice);
              }
              if (parsed.text) {
                accumulatedContent += parsed.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: accumulatedContent } : m
                  )
                );
              }
              if (parsed.error) {
                setErrorMessage(parsed.error);
              }
            } catch {
              // Partial line ignore
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleRegenerate = () => {
    if (messages.length === 0 || isStreaming) return;
    const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) return;

    const userText = messages[lastUserIndex].content;
    setMessages(messages.slice(0, lastUserIndex));
    handleSend(userText);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConvId}
        onSelectConversation={selectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        isOpen={isSidebarOpen}
        onToggleOpen={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full bg-slate-950 relative overflow-hidden">
        {/* Top Navbar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800 transition"
              title="Toggle Sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>
            <ModelSelector
              models={models}
              selectedModelId={selectedModelId}
              selectedProvider={selectedProvider}
              onSelectModel={setSelectedModelId}
              onSelectProvider={setSelectedProvider}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDashboardOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Telemetry</span>
            </button>
          </div>
        </header>

        {/* Fallback Alert Banner */}
        {fallbackAlert && (
          <div className="bg-amber-950/70 border-b border-amber-800/60 px-4 py-2.5 flex items-center justify-between text-xs text-amber-200 animate-fadeIn">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{fallbackAlert}</span>
            </div>
            <button
              onClick={() => setFallbackAlert(null)}
              className="text-amber-400 hover:text-amber-200 text-xs ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error Message Banner */}
        {errorMessage && (
          <div className="bg-rose-950/70 border-b border-rose-800/60 px-4 py-2.5 flex items-center justify-between text-xs text-rose-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Error: {errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-200 text-xs ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Messages Stream Container */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto p-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center text-white shadow-xl shadow-cyan-500/20 mb-4">
                <Sparkles className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-slate-100 mb-2">Hyunk AI Hub</h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Connect seamlessly to Radox AI and Intern InkStone with automatic quota fallback and live telemetry.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left text-xs">
                <button
                  onClick={() => handleSend('Explain the difference between Radox AI and InternLM models')}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-800/60 text-slate-300 transition"
                >
                  <p className="font-semibold text-slate-100 mb-1">Architecture Comparison</p>
                  <p className="text-[11px] text-slate-400">Compare provider features and latencies</p>
                </button>
                <button
                  onClick={() => handleSend('Write a high-performance TypeScript microservice for streaming AI completions')}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-800/60 text-slate-300 transition"
                >
                  <p className="font-semibold text-slate-100 mb-1">TypeScript Microservice</p>
                  <p className="text-[11px] text-slate-400">Build high-throughput SSE proxy</p>
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-4xl mx-auto ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md shadow-cyan-500/10">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`group relative max-w-[85%] md:max-w-[78%]`}>
                    <div
                      className={`p-4 rounded-2xl shadow-sm text-sm ${
                        isUser
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-slate-900 border border-slate-800/90 text-slate-100 rounded-tl-sm'
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      ) : (
                        <div>
                          {msg.content ? (
                            <MarkdownRenderer content={msg.content} />
                          ) : (
                            <div className="flex items-center gap-1.5 py-1 text-slate-400 text-xs font-mono">
                              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                              <span>Generating response...</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Metadata & Actions */}
                    {!isUser && msg.content && (
                      <div className="flex items-center gap-2 mt-1.5 px-1 text-xs text-slate-500">
                        {msg.model && (
                          <span className="text-[10px] font-mono text-slate-400">
                            {msg.model}
                          </span>
                        )}
                        <button
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="p-1 hover:text-slate-200 transition"
                          title="Copy message"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar Area */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
          <div className="max-w-4xl mx-auto space-y-2">
            {/* Input Action Controls */}
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-2">
                {messages.length > 0 && !isStreaming && (
                  <button
                    onClick={handleRegenerate}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Regenerate</span>
                  </button>
                )}
              </div>
              <div className="text-[11px] text-slate-500">
                Shift + Enter for newline
              </div>
            </div>

            {/* Input Field Form */}
            <div className="relative flex items-end gap-2 p-2 rounded-2xl bg-slate-900 border border-slate-800 focus-within:border-cyan-500/70 shadow-lg transition">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask Hyunk AI Hub anything..."
                rows={1}
                className="flex-1 max-h-44 p-2 bg-transparent text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none"
              />

              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition shadow-md shadow-rose-600/20"
                  title="Stop generating"
                >
                  <Square className="w-4 h-4 fill-white" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 text-white transition shadow-md shadow-blue-600/20"
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <UsageDashboardModal
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={fetchModels}
      />
    </div>
  );
}
