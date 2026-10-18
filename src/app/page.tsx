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
  Smartphone,
  Paperclip,
  Image as ImageIcon,
  Globe,
  SlidersHorizontal,
  Download,
  Keyboard,
  X,
  FileText,
  FileCode,
  ExternalLink,
  ChevronDown,
  Edit3,
  Lock,
} from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { ModelSelector } from '@/components/ModelSelector';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { AgentReasoningCard } from '@/components/AgentReasoningCard';
import { UsageDashboardModal } from '@/components/UsageDashboardModal';
import { SettingsModal } from '@/components/SettingsModal';
import { DownloadAppModal } from '@/components/DownloadAppModal';
import { ModelParametersModal } from '@/components/ModelParametersModal';
import { ExportModal } from '@/components/ExportModal';
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal';
import { ConversationSettingsModal } from '@/components/ConversationSettingsModal';
import { ChatMessage, ModelCapability, ProviderId, FileAttachment } from '@/lib/ai/types';
import { ConversationSummary, FolderItem } from '@/lib/storage';
import { safeRandomUUID, safeCopyText } from '@/lib/safeUUID';
import { useAuth } from '@/lib/AuthContext';
import { AuthModal } from '@/components/AuthModal';

export default function ChatPage() {
  const { user, loading: authLoading, isAuthModalOpen, openAuthModal, closeAuthModal } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<'chat' | 'agent'>('chat');
  const [models, setModels] = useState<ModelCapability[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('gpt-5.6-luna');
  const [selectedProvider, setSelectedProvider] = useState<'auto' | ProviderId>('auto');

  // Parameters & Tools
  const [temperature, setTemperature] = useState<number>(0.7);
  const [topP, setTopP] = useState<number>(0.9);
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [webSearch, setWebSearch] = useState<boolean>(false);
  const [webSearchSources, setWebSearchSources] = useState<Array<{ title: string; url: string; snippet: string }>>([]);
  const [liveToolOutputs, setLiveToolOutputs] = useState<Array<{ tool: string; target?: string; success: boolean; output: string; durationMs?: number }>>([]);

  // Theme & Navigation
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isParametersOpen, setIsParametersOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isConvSettingsOpen, setIsConvSettingsOpen] = useState(false);
  const [convToEdit, setConvToEdit] = useState<ConversationSummary | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fallbackAlert, setFallbackAlert] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userScrolledUpRef = useRef<boolean>(false);

  // Initialize theme from localStorage & sidebar on desktop
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = (localStorage.getItem('hyunk_theme') as 'dark' | 'light') || 'dark';
      setTheme(savedTheme);
      if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }

      if (window.innerWidth >= 768) {
        setIsSidebarOpen(true);
      }
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hyunk_theme', nextTheme);
      if (nextTheme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }
    }
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K: Focus history search or open search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSidebarOpen(true);
      }
      // Ctrl/Cmd + Shift + O or Ctrl + Shift + N: New Chat
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key.toLowerCase() === 'o') || (e.shiftKey && e.key.toLowerCase() === 'n'))) {
        e.preventDefault();
        handleNewConversation();
      }
      // Ctrl/Cmd + B: Toggle Sidebar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      }
      // Ctrl/Cmd + Shift + D: Toggle Theme
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        toggleTheme();
      }
      // Ctrl/Cmd + /: Open Shortcuts Modal
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }
      // Esc: Close open modals
      if (e.key === 'Escape') {
        setIsParametersOpen(false);
        setIsExportOpen(false);
        setIsShortcutsOpen(false);
        setIsConvSettingsOpen(false);
        setIsSettingsOpen(false);
        setIsDashboardOpen(false);
        setIsDownloadOpen(false);
        setLightboxImage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [theme]);

  // Fetch initial models, and user-scoped conversations & folders
  useEffect(() => {
    fetchModels();
    if (user) {
      fetchConversations();
      fetchFolders();
    } else {
      setConversations([]);
      setMessages([]);
      setActiveConvId(null);
    }
  }, [user]);

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

  // Load folders
  const fetchFolders = async () => {
    try {
      const res = await fetch('/api/folders');
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
      }
    } catch {
      // Fallback
    }
  };

  const selectConversation = async (convId: string) => {
    setActiveConvId(convId);
    setErrorMessage(null);
    setFallbackAlert(null);
    setWebSearchSources([]);
    setLiveToolOutputs([]);

    const activeConv = conversations.find((c) => c.id === convId);
    if (activeConv) {
      if (activeConv.systemPrompt !== undefined) setSystemPrompt(activeConv.systemPrompt || '');
      if (activeConv.temperature !== undefined) setTemperature(activeConv.temperature ?? 0.7);
    }

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
        setAttachments([]);
        setErrorMessage(null);
        setFallbackAlert(null);
        setWebSearchSources([]);
        setLiveToolOutputs([]);
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

  const handleUpdateConversation = async (id: string, updates: Partial<ConversationSummary>) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...data.conversation } : c))
        );
      }
    } catch {
      // Fallback
    }
  };

  const handleCreateFolder = async (name: string) => {
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        setFolders((prev) => [...prev, data.folder]);
      }
    } catch {
      // Fallback
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      setConversations((prev) =>
        prev.map((c) => (c.folderId === folderId ? { ...c, folderId: null } : c))
      );
    } catch {
      // Fallback
    }
  };

  // File Upload Handlers (Images & Documents)
  const handleFilesSelected = async (files: FileList | File[]) => {
    const newAttachments: FileAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImage = file.type.startsWith('image/');
      const attachmentId = safeRandomUUID();

      if (isImage) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        newAttachments.push({
          id: attachmentId,
          name: file.name,
          type: 'image',
          mimeType: file.type,
          size: file.size,
          url: base64,
        });
      } else {
        // Document: read text if possible
        const isTextDoc =
          file.type.includes('text') ||
          file.name.endsWith('.txt') ||
          file.name.endsWith('.md') ||
          file.name.endsWith('.csv') ||
          file.name.endsWith('.json') ||
          file.name.endsWith('.ts') ||
          file.name.endsWith('.js');

        let extractedText = '';
        if (isTextDoc) {
          extractedText = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsText(file);
          });
        }

        newAttachments.push({
          id: attachmentId,
          name: file.name,
          type: 'document',
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          extractedText: extractedText || undefined,
        });
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      handleFilesSelected(e.clipboardData.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      const ok = await safeCopyText(text);
      if (ok) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
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
    if ((!textToSend && attachments.length === 0) || isStreaming) return;

    setErrorMessage(null);
    setFallbackAlert(null);
    userScrolledUpRef.current = false;

    try {
      const userAttachments = [...attachments];
      const userMsg: ChatMessage = {
        id: safeRandomUUID(),
        role: 'user',
        content: textToSend || (userAttachments.length > 0 ? `Uploaded ${userAttachments.length} file(s)` : ''),
        attachments: userAttachments.length > 0 ? userAttachments : undefined,
        createdAt: new Date().toISOString(),
      };

      const newMessages = [...messages, userMsg];
      setMessages(newMessages);

      if (overrideContent === undefined) {
        setInput('');
        setAttachments([]);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }

      // Auto-generate title on first user message if conversation is 'New Chat'
      const activeConv = conversations.find((c) => c.id === activeConvId);
      if (activeConvId && activeConv && (activeConv.title === 'New Chat' || !activeConv.title)) {
        fetch(`/api/conversations/${activeConvId}/title`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: textToSend }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.title) {
              setConversations((prev) =>
                prev.map((c) => (c.id === activeConvId ? { ...c, title: data.title } : c))
              );
            }
          })
          .catch(() => {});
      }

      // Prepare assistant placeholder message
      const assistantMsgId = safeRandomUUID();
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

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments,
          })),
          model: selectedModelId,
          provider: selectedProvider === 'auto' ? undefined : selectedProvider,
          temperature,
          topP,
          maxTokens,
          systemPrompt: systemPrompt || undefined,
          webSearch,
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
            continue;
          }

          if (trimmed.startsWith('event: web_search')) {
            continue;
          }

          if (trimmed.startsWith('event: tool_output')) {
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.notice) {
                setFallbackAlert(parsed.notice);
              }
              if (parsed.sources) {
                setWebSearchSources(parsed.sources);
              }
              if (parsed.tool && parsed.output) {
                setLiveToolOutputs((prev) => [
                  ...prev,
                  {
                    tool: parsed.tool,
                    target: parsed.target,
                    success: parsed.success,
                    output: parsed.output,
                    durationMs: parsed.durationMs,
                  },
                ]);
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
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    const trimmed = messages.slice(0, messages.lastIndexOf(lastUserMsg));
    setMessages(trimmed);
    handleSend(lastUserMsg.content);
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const activeModel = models.find((m) => m.id === selectedModelId);

  return (
    <div
      className={`flex h-full w-full ${
        theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      } overflow-hidden`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={handleDrop}
    >
      {/* Hidden File Picker Input */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFilesSelected(e.target.files);
        }}
      />

      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConvId}
        folders={folders}
        onSelectConversation={selectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onOpenConversationSettings={(conv) => {
          setConvToEdit(conv);
          setIsConvSettingsOpen(true);
        }}
        onCreateFolder={handleCreateFolder}
        onDeleteFolder={handleDeleteFolder}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenDownloadApp={() => setIsDownloadOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        isOpen={isSidebarOpen}
        onToggleOpen={() => setIsSidebarOpen(!isSidebarOpen)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full min-h-0 relative overflow-hidden">
        {/* Top Navbar */}
        <header
          className={`flex items-center justify-between px-2.5 sm:px-4 py-2 sm:py-3 border-b ${
            theme === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
          } z-20 gap-1.5 sm:gap-3 shrink-0`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`p-2 rounded-xl border transition shrink-0 ${
                theme === 'dark'
                  ? 'text-slate-400 hover:text-white hover:bg-slate-900 border-slate-800'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-300'
              }`}
              title="Toggle Sidebar (Ctrl+B)"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Model Selector */}
            <ModelSelector
              models={models}
              selectedModelId={selectedModelId}
              selectedProvider={selectedProvider}
              onSelectModel={setSelectedModelId}
              onSelectProvider={setSelectedProvider}
            />

            {/* Parameter Controls Tuning Button */}
            <button
              type="button"
              onClick={() => setIsParametersOpen(true)}
              className={`p-2 rounded-xl border text-xs transition flex items-center gap-1.5 shrink-0 ${
                systemPrompt || temperature !== 0.7
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                  : theme === 'dark'
                  ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
              title="Tuning & Parameters (Temperature, System Prompt)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline font-mono text-[11px]">T={temperature}</span>
            </button>

            {/* Mode Switcher: Chat vs Agent Mode */}
            <div
              className={`flex items-center p-0.5 rounded-xl border shadow-inner shrink-0 ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-300'
              }`}
            >
              <button
                type="button"
                onClick={() => setMode('chat')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
                  mode === 'chat'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Standard Conversational Chat Mode"
              >
                <Sparkles className="w-3.5 h-3.5 text-white shrink-0" />
                <span className="hidden xs:inline">Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('agent')}
                className={`px-2 sm:px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                  mode === 'agent'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/30 ring-1 ring-violet-400/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Autonomous Agent Mode with Real Tool Execution"
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
            {/* Export Button */}
            <button
              onClick={() => setIsExportOpen(true)}
              className={`p-2 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs transition flex items-center gap-1.5 ${
                theme === 'dark'
                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                  : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
              }`}
              title="Export Conversation (PDF / Markdown / JSON)"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="hidden md:inline font-medium">Export</span>
            </button>

            {/* Download App Button */}
            <button
              onClick={() => setIsDownloadOpen(true)}
              className={`p-2 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs transition flex items-center gap-1.5 ${
                theme === 'dark'
                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-emerald-300 hover:text-emerald-200'
                  : 'bg-white hover:bg-slate-100 border-slate-300 text-emerald-700'
              }`}
              title="Download Windows &amp; Mobile Apps"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="hidden lg:inline font-medium">Download</span>
            </button>

            {/* Keys Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className={`p-2 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs transition flex items-center gap-1.5 ${
                theme === 'dark'
                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                  : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
              }`}
              title="Manage API Key Pool"
            >
              <Key className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="hidden xl:inline">Key Pool</span>
            </button>

            {/* User Profile / Auth Button */}
            {user ? (
              <button
                onClick={openAuthModal}
                className={`p-1 sm:px-2.5 sm:py-1 rounded-xl border text-xs transition flex items-center gap-1.5 ${
                  theme === 'dark'
                    ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200'
                    : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                }`}
                title={`${user.name} (${user.email}) - Klik untuk profil`}
              >
                <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white font-bold text-[10px] shadow-sm">
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:inline font-medium max-w-[90px] truncate">{user.name}</span>
              </button>
            ) : (
              <button
                onClick={openAuthModal}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-600/20 transition active:scale-[0.99]"
              >
                Masuk
              </button>
            )}
          </div>
        </header>

        {/* Quick Free Tier Model Switcher Bar */}
        <div
          className={`px-2.5 sm:px-4 py-1.5 border-b ${
            theme === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-100'
          } flex items-center justify-between text-xs overflow-x-auto no-scrollbar gap-2 shrink-0`}
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-emerald-400 hidden sm:inline">Free Tier Models:</span>
            <span className="font-semibold text-emerald-400 sm:hidden">Free:</span>
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
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/60 shadow-sm'
                        : theme === 'dark'
                        ? 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                        : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-300'
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
                    <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                      {m.provider === 'inkstone' ? 'Ink' : 'Radox'}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Active System Prompt or Agent Mode Indicator */}
        {systemPrompt && (
          <div className="px-4 py-1.5 bg-amber-950/40 border-b border-amber-800/40 flex items-center justify-between text-xs text-amber-200 gap-2 shrink-0">
            <span className="truncate">
              ⚡ Custom System Prompt active: <span className="italic opacity-80 font-mono text-[11px]">{systemPrompt}</span>
            </span>
            <button
              onClick={() => setSystemPrompt('')}
              className="text-amber-400 hover:underline shrink-0 text-[11px]"
            >
              Clear
            </button>
          </div>
        )}

        {/* Fallback Alert Banner */}
        {fallbackAlert && (
          <div className="bg-amber-950/70 border-b border-amber-800/60 px-4 py-2 flex items-center justify-between text-xs text-amber-200 animate-fadeIn">
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
          <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-2.5 flex items-center justify-between text-xs text-rose-200 animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-200 text-xs ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Messages Scroll Area */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-6"
        >
          {!user && !authLoading ? (
            <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center px-4 py-8">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white mb-5 shadow-xl shadow-cyan-500/25">
                <Lock className="w-8 h-8" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold mb-2 text-white">Autentikasi Diperlukan</h2>
              <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
                Platform ini dilindungi sistem autentikasi dan manajemen sesi. Masuk atau buat akun baru untuk mengakses seluruh model AI dan riwayat percakapan Anda.
              </p>
              <button
                onClick={openAuthModal}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-cyan-600/20 transition active:scale-[0.99]"
              >
                Masuk / Daftar Akun
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center px-4 py-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center text-white mb-4 shadow-lg shadow-cyan-500/20">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold mb-2">Hyunk AI Hub</h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Multi-provider AI platform supporting Radox AI & Intern InkStone with vision, web search, tool execution, and quota failover.
              </p>

              {/* Quick suggestions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left text-xs">
                <button
                  type="button"
                  onClick={() => handleSend('Explain quantum computing and its latest 2026 breakthroughs')}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-850 text-slate-300 transition"
                >
                  <p className="font-semibold text-slate-100 mb-0.5">Quantum Breakthroughs</p>
                  <p className="text-[11px] text-slate-400 line-clamp-1">Explore latest research and hardware</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend('Architect a scalable event-driven distributed system in TypeScript')}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-850 text-slate-300 transition"
                >
                  <p className="font-semibold text-slate-100 mb-0.5">Distributed System Architecture</p>
                  <p className="text-[11px] text-slate-400 line-clamp-1">Design event-driven backend pipeline</p>
                </button>
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

                  <div className={`group relative ${isUser ? 'max-w-[88%] sm:max-w-[80%]' : 'max-w-[92%] sm:max-w-[85%]'}`}>
                    {/* Render Attachments if any */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.attachments.map((att) => {
                          if (att.type === 'image' && att.url) {
                            return (
                              <img
                                key={att.id}
                                src={att.url}
                                alt={att.name}
                                onClick={() => setLightboxImage(att.url || null)}
                                className="w-36 h-28 object-cover rounded-xl border border-slate-700 shadow-md cursor-pointer hover:opacity-90 transition"
                              />
                            );
                          }
                          return (
                            <div
                              key={att.id}
                              className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200"
                            >
                              <FileText className="w-4 h-4 text-cyan-400" />
                              <span className="truncate max-w-[150px]">{att.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {Math.round(att.size / 1024)} KB
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div
                      className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm text-sm ${
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
                              webSearchSources={webSearchSources}
                              liveToolOutputs={liveToolOutputs}
                            />
                          ) : (
                            <div className="flex items-center gap-2 py-1 text-slate-400 text-xs font-mono">
                              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                              <span>{mode === 'agent' ? 'Agent thinking & executing tools...' : 'Generating response...'}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Metadata & Actions */}
                    {!isUser && msg.content && (
                      <div className="flex items-center gap-2 mt-1 px-1 text-xs text-slate-500">
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
        {!user && !authLoading ? (
          <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/80 backdrop-blur-md pb-safe shrink-0">
            <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-slate-900 border border-slate-800 gap-3">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">Autentikasi Diperlukan</h4>
                  <p className="text-[11px] text-slate-400">Silakan login atau daftar untuk mulai mengirim pesan ke AI.</p>
                </div>
              </div>
              <button
                onClick={openAuthModal}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20 transition active:scale-[0.99] whitespace-nowrap"
              >
                Masuk / Daftar Akun
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2 sm:p-3 md:p-4 border-t border-slate-800 bg-slate-950 pb-safe shrink-0">
          <div className="max-w-4xl mx-auto space-y-2">
            {/* Attachment preview chips */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-1">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 shadow-sm"
                  >
                    {att.type === 'image' && att.url ? (
                      <img src={att.url} alt={att.name} className="w-5 h-5 rounded object-cover" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                    <span className="truncate max-w-[120px] sm:max-w-[180px] font-medium">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Controls Bar: Web Search & Regenerate */}
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-2">
                {/* Web Search Toggle Button */}
                <button
                  type="button"
                  onClick={() => setWebSearch(!webSearch)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                    webSearch
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Toggle Live Web Search integration"
                >
                  <Globe className={`w-3.5 h-3.5 ${webSearch ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
                  <span>Web Search</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${webSearch ? 'bg-cyan-950 text-cyan-300' : 'bg-slate-800 text-slate-500'}`}>
                    {webSearch ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Regenerate Button */}
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
              {/* Attachment Picker Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 sm:p-2.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-xl transition shrink-0"
                title="Attach Images or Documents (.pdf, .txt, .csv, .json)"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  mode === 'agent'
                    ? 'Describe a task for Autonomous Agent Mode with live tools...'
                    : 'Ask Hyunk AI Hub anything (or attach images / documents)...'
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
                  disabled={!input.trim() && attachments.length === 0}
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
        )}
      </main>

      {/* Lightbox Image Preview Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage}
            alt="Full size attachment"
            className="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Modals */}
      <ModelParametersModal
        isOpen={isParametersOpen}
        onClose={() => setIsParametersOpen(false)}
        temperature={temperature}
        onTemperatureChange={setTemperature}
        topP={topP}
        onTopPChange={setTopP}
        maxTokens={maxTokens}
        onMaxTokensChange={setMaxTokens}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
        selectedModelName={activeModel?.name || selectedModelId}
      />
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        conversationTitle={activeConv?.title || 'Hyunk AI Hub Conversation'}
        messages={messages}
        modelName={activeModel?.name || selectedModelId}
      />
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
      <ConversationSettingsModal
        isOpen={isConvSettingsOpen}
        onClose={() => {
          setIsConvSettingsOpen(false);
          setConvToEdit(null);
        }}
        conversation={convToEdit}
        folders={folders}
        onUpdate={handleUpdateConversation}
        onDelete={handleDeleteConversation}
      />
      <UsageDashboardModal
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <DownloadAppModal
        isOpen={isDownloadOpen}
        onClose={() => setIsDownloadOpen(false)}
      />
      <AuthModal
        isOpen={(!user && !authLoading) || isAuthModalOpen}
        onClose={closeAuthModal}
        canClose={!!user}
      />
    </div>
  );
}
