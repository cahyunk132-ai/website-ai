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
  Zap,
  Bot,
  Brain,
  Cpu,
  Layers,
  Workflow,
  Key,
} from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { ModelSelector } from '@/components/ModelSelector';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { AgentReasoningCard } from '@/components/AgentReasoningCard';
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
  const [mode, setMode] = useState<'chat' | 'agent'>('chat');
  const [models, setModels] = useState<ModelCapability[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('gpt-5.6-luna');
  const [selectedProvider, setSelectedProvider] = useState<'auto' | ProviderId>('auto');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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

  // Initialize sidebar on desktop screens
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      setIsSidebarOpen(true);
    }
  }, []);

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
          setSelectedModelId((prev) => {
            const exists = data.models.some((m: any) => m.id === prev);
            if (exists) return prev;
            const freeModel = data.models.find((m: any) => m.isFreeQuotaEligible);
            return freeModel ? freeModel.id : data.models[0].id;
          });
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
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
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
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
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
          mode,
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
    <div className="flex h-full min-h-[100dvh] w-screen overflow-hidden bg-slate-950 font-sans">
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
      <main className="flex-1 flex flex-col h-full min-h-0 bg-slate-950 relative overflow-hidden">
        {/* Top Navbar */}
        <header className="flex items-center justify-between px-2.5 sm:px-4 py-2 sm:py-3 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md z-10 gap-1.5 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800 transition shrink-0"
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

            {/* Mode Switcher: Chat vs Agent Mode */}
            <div className="flex items-center p-0.5 rounded-xl bg-slate-900 border border-slate-800 shadow-inner shrink-0">
              <button
                type="button"
                onClick={() => setMode('chat')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 sm:gap-1.5 ${
                  mode === 'chat'
                    ? 'bg-slate-800 text-slate-100 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Standard Conversational Chat Mode"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="hidden xs:inline">Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('agent')}
                className={`px-2 sm:px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 sm:gap-1.5 ${
                  mode === 'agent'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/30 ring-1 ring-violet-400/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Autonomous Agent Mode with Reasoning & Tool Actions"
              >
                <Bot className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                <span className="hidden xs:inline">Agent</span>
                {mode === 'agent' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-300 animate-ping hidden sm:inline-block" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition flex items-center gap-1.5"
              title="Manage Multi-Account API Key Pool"
            >
              <Key className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="hidden sm:inline">Key Pool</span>
            </button>
            <button
              onClick={() => setIsDashboardOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition"
              title="View Telemetry Dashboard"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Telemetry</span>
            </button>
          </div>
        </header>

        {/* Quick Free Tier Model Switcher Bar */}
        <div className="px-2.5 sm:px-4 py-1.5 border-b border-slate-800/60 bg-slate-900/50 flex items-center justify-between text-xs overflow-x-auto no-scrollbar gap-2 shrink-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-emerald-300 hidden sm:inline">Free Tier Models:</span>
            <span className="font-semibold text-emerald-300 sm:hidden">Free:</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {models
              .filter((m) => m.isFreeQuotaEligible)
              .slice(0, 15)
              .map((m) => {
                const isActive =
                  selectedModelId === m.id &&
                  (selectedProvider === 'auto' || selectedProvider === m.provider);
                return (
                  <button
                    key={`${m.provider}-${m.id}`}
                    onClick={() => {
                      setSelectedModelId(m.id);
                      setSelectedProvider(m.provider);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition shrink-0 flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                        : 'bg-slate-900/90 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800/80'
                    }`}
                  >
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    <span>
                      {m.name
                        .replace(' (Radox Free)', '')
                        .replace(' (InkStone Free)', '')
                        .replace(' (InkStone)', '')
                        .replace(' (Radox)', '')}
                    </span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/80 text-slate-400 font-mono">
                      {m.provider === 'inkstone' ? 'Ink' : 'Radox'}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Agent Mode Active Banner & Directives */}
        {mode === 'agent' && (
          <div className="px-2.5 sm:px-4 py-1.5 border-b border-violet-500/30 bg-gradient-to-r from-violet-950/70 via-slate-950 to-slate-950 flex flex-wrap items-center justify-between text-xs gap-2 shrink-0 animate-fadeIn">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-900/60 border border-violet-500/40 text-violet-200 text-[11px] font-bold">
                <Brain className="w-3.5 h-3.5 text-violet-300" />
                <span>AGENT ENGINE</span>
              </div>
              <span className="hidden md:inline text-slate-400 text-[11px]">
                Autonomous multi-step reasoning, tool execution, and self-verification.
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 text-[11px]">
              <span className="text-slate-500 font-medium">Directives:</span>
              <button
                type="button"
                onClick={() => setInput((prev) => (prev ? `${prev}\n\n[Objective: Break down into execution plan and implement step-by-step]` : '[Objective: Break down into execution plan and implement step-by-step] '))}
                className="px-2 py-0.5 rounded-md bg-slate-900 hover:bg-violet-900/40 text-slate-300 hover:text-violet-200 border border-slate-800 transition"
              >
                🎯 Plan & Execute
              </button>
              <button
                type="button"
                onClick={() => setInput((prev) => (prev ? `${prev}\n\n[Objective: Full production code with edge cases and verification]` : '[Objective: Full production code with edge cases and verification] '))}
                className="px-2 py-0.5 rounded-md bg-slate-900 hover:bg-violet-900/40 text-slate-300 hover:text-violet-200 border border-slate-800 transition"
              >
                💻 Code & Verify
              </button>
              <button
                type="button"
                onClick={() => setInput((prev) => (prev ? `${prev}\n\n[Objective: Deep research analysis and architectural breakdown]` : '[Objective: Deep research analysis and architectural breakdown] '))}
                className="px-2 py-0.5 rounded-md bg-slate-900 hover:bg-violet-900/40 text-slate-300 hover:text-violet-200 border border-slate-800 transition"
              >
                🔍 Deep Research
              </button>
            </div>
          </div>
        )}

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
          className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-6"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto p-2 sm:p-4">
              <div
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-white shadow-xl mb-3 sm:mb-4 transition ${
                  mode === 'agent'
                    ? 'bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 shadow-violet-500/25 ring-2 ring-violet-500/30 animate-pulse'
                    : 'bg-gradient-to-tr from-cyan-600 to-blue-500 shadow-cyan-500/20'
                }`}
              >
                {mode === 'agent' ? <Bot className="w-6 h-6 sm:w-7 sm:h-7" /> : <Sparkles className="w-6 h-6 sm:w-7 sm:h-7" />}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100 mb-2">
                {mode === 'agent' ? 'Autonomous Agent Command Center' : 'Hyunk AI Hub'}
              </h2>
              <p className="text-xs text-slate-400 mb-4 sm:mb-6 leading-relaxed px-2">
                {mode === 'agent'
                  ? 'Autonomous reasoning engine equipped with planning, tool invocation, and full implementation pipelines across Radox AI and Intern InkStone.'
                  : 'Connect seamlessly to Radox AI and Intern InkStone with automatic quota fallback and live telemetry.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 w-full text-left text-xs">
                {mode === 'agent' ? (
                  <>
                    <button
                      onClick={() => handleSend('Architect a scalable event-driven distributed system in TypeScript with Redis pub/sub and resilient retries')}
                      className="p-2.5 sm:p-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-violet-500/50 hover:bg-slate-800/60 text-slate-300 transition"
                    >
                      <p className="font-semibold text-violet-200 mb-1 flex items-center gap-1.5 text-xs">
                        <Cpu className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        <span className="truncate">Event-Driven Architecture</span>
                      </p>
                      <p className="text-[11px] text-slate-400 line-clamp-1 sm:line-clamp-none">Design fault-tolerant event queues & state</p>
                    </button>
                    <button
                      onClick={() => handleSend('Build a full-stack Next.js real-time chat pipeline with SSE streaming, error backoff, and unit tests')}
                      className="p-2.5 sm:p-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-violet-500/50 hover:bg-slate-800/60 text-slate-300 transition"
                    >
                      <p className="font-semibold text-violet-200 mb-1 flex items-center gap-1.5 text-xs">
                        <Workflow className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">Full-Stack Stream Pipeline</span>
                      </p>
                      <p className="text-[11px] text-slate-400 line-clamp-1 sm:line-clamp-none">Implement end-to-end SSE chat & tests</p>
                    </button>
                    <button
                      onClick={() => handleSend('Perform a security audit and zero-trust authentication review on a multi-tenant API')}
                      className="p-2.5 sm:p-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-violet-500/50 hover:bg-slate-800/60 text-slate-300 transition"
                    >
                      <p className="font-semibold text-violet-200 mb-1 flex items-center gap-1.5 text-xs">
                        <ShieldAlert className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">Zero-Trust Security Audit</span>
                      </p>
                      <p className="text-[11px] text-slate-400 line-clamp-1 sm:line-clamp-none">Evaluate token validation & threat surfaces</p>
                    </button>
                    <button
                      onClick={() => handleSend('Deconstruct and explain the deep thinking reasoning protocol of modern open-weights frontier models')}
                      className="p-2.5 sm:p-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-violet-500/50 hover:bg-slate-800/60 text-slate-300 transition"
                    >
                      <p className="font-semibold text-violet-200 mb-1 flex items-center gap-1.5 text-xs">
                        <Brain className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                        <span className="truncate">Deep Thinking Analysis</span>
                      </p>
                      <p className="text-[11px] text-slate-400 line-clamp-1 sm:line-clamp-none">Explore reasoning chains & verification</p>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleSend('Explain the difference between Radox AI and InternLM models')}
                      className="p-2.5 sm:p-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-800/60 text-slate-300 transition"
                    >
                      <p className="font-semibold text-slate-100 mb-1 text-xs">Architecture Comparison</p>
                      <p className="text-[11px] text-slate-400 line-clamp-1 sm:line-clamp-none">Compare provider features and latencies</p>
                    </button>
                    <button
                      onClick={() => handleSend('Write a high-performance TypeScript microservice for streaming AI completions')}
                      className="p-2.5 sm:p-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-800/60 text-slate-300 transition"
                    >
                      <p className="font-semibold text-slate-100 mb-1 text-xs">TypeScript Microservice</p>
                      <p className="text-[11px] text-slate-400 line-clamp-1 sm:line-clamp-none">Build high-throughput SSE proxy</p>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 sm:gap-3 max-w-4xl mx-auto ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!isUser && (
                    <div
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md ${
                        mode === 'agent'
                          ? 'bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-violet-500/20'
                          : 'bg-gradient-to-tr from-blue-600 to-cyan-500 shadow-cyan-500/10'
                      }`}
                    >
                      {mode === 'agent' ? <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    </div>
                  )}

                  <div className={`group relative ${isUser ? 'max-w-[88%] sm:max-w-[80%] md:max-w-[75%]' : 'max-w-[92%] sm:max-w-[85%] md:max-w-[78%]'}`}>
                    <div
                      className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm text-sm ${
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
                            <AgentReasoningCard
                              content={msg.content}
                              isStreaming={isStreaming && idx === messages.length - 1}
                            />
                          ) : (
                            <div className="flex items-center gap-2 py-1 text-slate-400 text-xs font-mono">
                              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                              <span>{mode === 'agent' ? 'Agent planning & reasoning...' : 'Generating response...'}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Metadata & Actions */}
                    {!isUser && msg.content && (
                      <div className="flex items-center gap-2 mt-1 px-1 text-xs text-slate-500">
                        {mode === 'agent' && (
                          <span className="text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-950/80 text-violet-300 border border-violet-800/40">
                            AGENT
                          </span>
                        )}
                        {msg.model && (
                          <span className="text-[10px] font-mono text-slate-400 truncate max-w-[150px]">
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
        <div className="p-2 sm:p-3 md:p-4 border-t border-slate-800/80 bg-slate-950/90 backdrop-blur-md pb-safe shrink-0">
          <div className="max-w-4xl mx-auto space-y-1.5 sm:space-y-2">
            {/* Input Action Controls */}
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-2">
                {messages.length > 0 && !isStreaming && (
                  <button
                    onClick={handleRegenerate}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition text-[11px] sm:text-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Regenerate</span>
                  </button>
                )}
              </div>
              <div className="hidden sm:inline text-[11px] text-slate-500">
                Shift + Enter for newline
              </div>
            </div>

            {/* Input Field Form */}
            <div className="relative flex items-end gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-2xl bg-slate-900 border border-slate-800 focus-within:border-cyan-500/70 shadow-lg transition">
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
                placeholder={
                  mode === 'agent'
                    ? 'Describe an objective or task for Agent Mode...'
                    : 'Ask Hyunk AI Hub anything...'
                }
                rows={1}
                className="flex-1 max-h-36 sm:max-h-44 p-1.5 sm:p-2 bg-transparent text-base sm:text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none"
              />

              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="p-2.5 min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition shadow-md shadow-rose-600/20 shrink-0"
                  title="Stop generating"
                >
                  <Square className="w-4 h-4 fill-white" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className={`p-2.5 min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-white transition shadow-md disabled:opacity-40 shrink-0 ${
                    mode === 'agent'
                      ? 'bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 shadow-violet-600/30'
                      : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-blue-600/20'
                  }`}
                  title={mode === 'agent' ? 'Execute Agent Plan' : 'Send message'}
                >
                  {mode === 'agent' ? <Bot className="w-4 h-4" /> : <Send className="w-4 h-4" />}
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
