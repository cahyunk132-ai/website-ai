'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Settings,
  BarChart3,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Smartphone,
  Folder,
  FolderPlus,
  Search,
  Sun,
  Moon,
  Keyboard,
  MoreVertical,
  Sliders,
  Download,
  Brain,
  CalendarClock,
} from 'lucide-react';
import { ConversationSummary, FolderItem } from '@/lib/storage';
import { UserProfileMenu } from './UserProfileMenu';

interface SidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  folders: FolderItem[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onOpenConversationSettings: (conv: ConversationSummary) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onOpenSettings: () => void;
  onOpenDashboard: () => void;
  onOpenShortcuts: () => void;
  onOpenDownloadApp?: () => void;
  onOpenExport?: () => void;
  onOpenTrash?: () => void;
  /** Incremented by the parent to focus the search input (Ctrl+Shift+F). */
  searchFocusToken?: number;
  onOpenMemory?: () => void;
  onOpenSchedules?: () => void;
  /** Opens the premium panel (plan, quota and upgrade). */
  onOpenPremium?: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConversationId,
  folders,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onOpenConversationSettings,
  onCreateFolder,
  onDeleteFolder,
  onOpenSettings,
  onOpenDashboard,
  onOpenShortcuts,
  onOpenDownloadApp,
  onOpenExport,
  onOpenTrash,
  searchFocusToken = 0,
  onOpenMemory,
  onOpenSchedules,
  onOpenPremium,
  isOpen,
  onToggleOpen,
  theme,
  onToggleTheme,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Array<{ conversationId: string; snippet?: string }>>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Focus the search input when the parent requests it (Ctrl/Cmd + Shift + F)
  useEffect(() => {
    if (!searchFocusToken) return;
    const timer = setTimeout(() => {
      const input = document.getElementById('sidebar-search-input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 120);
    return () => clearTimeout(timer);
  }, [searchFocusToken]);

  // Search effect
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(searchTerm)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(
            data.results.map((r: any) => ({
              conversationId: r.conversation.id,
              snippet: r.snippet,
            }))
          );
        }
      } catch {
        // Fallback
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await onCreateFolder(newFolderName.trim());
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleItemClick = (action: () => void) => {
    action();
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      onToggleOpen();
    }
  };

  // Every tag used by the conversations of the user
  const allTags = Array.from(
    new Set(conversations.flatMap((c) => c.tags || []).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (activeTag && !(c.tags || []).some((tag) => tag.toLowerCase() === activeTag.toLowerCase())) {
      return false;
    }
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const titleMatch = c.title.toLowerCase().includes(term);
    const contentMatch = searchResults.some((sr) => sr.conversationId === c.id);
    return titleMatch || contentMatch;
  });

  // Group conversations by folder
  const groupedByFolder: Record<string, ConversationSummary[]> = {};
  folders.forEach((f) => {
    groupedByFolder[f.id] = [];
  });
  const ungrouped: ConversationSummary[] = [];

  filteredConversations.forEach((conv) => {
    if (conv.folderId && groupedByFolder[conv.folderId]) {
      groupedByFolder[conv.folderId].push(conv);
    } else {
      ungrouped.push(conv);
    }
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden animate-fadeIn"
          onClick={onToggleOpen}
        />
      )}

      {/*
        Sidebar Container.

        The collapsed state uses `md:hidden` on purpose. A zero width utility
        for the md breakpoint cannot be used here, because the base classes
        also carry a fixed width for the md breakpoint and in the generated
        stylesheet that fixed width is emitted AFTER the zero width one. The
        sidebar would then keep its full width on a desktop and the burger
        button would look like it did nothing.
      */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col w-[85vw] sm:w-80 md:w-72 max-w-sm ${
          theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'
        } border-r transition-transform duration-300 ease-in-out pt-safe pb-safe pl-safe ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
        }`}
      >
        {/* Brand Header */}
        <div
          className={`flex items-center justify-between px-4 py-3.5 border-b ${
            theme === 'dark' ? 'border-slate-800/80 bg-slate-950' : 'border-slate-300 bg-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 shadow-md shadow-cyan-500/20 text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className={`text-sm font-bold tracking-tight ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                Hyunk AI Hub
              </h1>
              <p className="text-[10px] text-cyan-400 font-medium">Unified AI Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              className={`p-1.5 rounded-lg transition ${
                theme === 'dark'
                  ? 'text-amber-400 hover:bg-slate-900 hover:text-amber-300'
                  : 'text-slate-700 hover:bg-slate-300'
              }`}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode (Ctrl+Shift+D)`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={onToggleOpen}
              className="md:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action: New Chat & Folder Buttons */}
        <div className="p-3 space-y-2">
          <button
            onClick={() => handleItemClick(onNewConversation)}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium text-xs shadow-md shadow-blue-500/10 transition active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
            <span className="hidden sm:inline text-[9px] opacity-75 font-mono ml-auto">Ctrl+N</span>
          </button>

          {/* Quick Search Bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              id="sidebar-search-input"
              type="text"
              placeholder="Search chat history & messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-8 pr-3 py-1.5 rounded-lg text-base sm:text-xs transition focus:outline-none ${
                theme === 'dark'
                  ? 'bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-cyan-500'
                  : 'bg-white border border-slate-300 text-slate-800 placeholder-slate-400 focus:border-cyan-600'
              }`}
            />
          </div>
          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition ${
                  activeTag === null
                    ? 'bg-violet-500/15 text-violet-300 border-violet-500/40'
                    : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300'
                }`}
              >
                Semua
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag((prev) => (prev === tag ? null : tag))}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition ${
                    activeTag === tag
                      ? 'bg-violet-500/15 text-violet-300 border-violet-500/40'
                      : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Conversations & Folders List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-3">
          {/* Folders Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <span>Categories & Folders</span>
              <button
                type="button"
                onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                className="hover:text-cyan-400 text-slate-500 transition p-0.5 rounded"
                title="Create New Folder"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Folder Creation Input Form */}
            {isCreatingFolder && (
              <form onSubmit={handleCreateFolderSubmit} className="p-2 bg-slate-900 rounded-xl border border-slate-800 space-y-1.5 mb-2">
                <input
                  type="text"
                  placeholder="Folder name (e.g. Work, Ideas)..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-2.5 py-1 text-base sm:text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setIsCreatingFolder(false)}
                    className="px-2 py-0.5 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-0.5 bg-cyan-600 text-white rounded-md font-medium text-xs hover:bg-cyan-500"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            {/* Folders List */}
            {folders.map((folder) => {
              const isCollapsed = collapsedFolders[folder.id];
              const chatsInFolder = groupedByFolder[folder.id] || [];

              return (
                <div key={folder.id} className="space-y-0.5">
                  <div
                    onClick={() => toggleFolderCollapse(folder.id)}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-900 cursor-pointer transition select-none group"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      <Folder className="w-3.5 h-3.5 text-cyan-400 shrink-0" style={{ color: folder.color }} />
                      <span className="truncate">{folder.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {chatsInFolder.length}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete folder "${folder.name}"? (Chats inside will be ungrouped)`)) {
                            onDeleteFolder(folder.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:text-rose-400 text-slate-500 p-0.5 transition"
                        title="Delete Folder"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Chats inside this folder */}
                  {!isCollapsed && (
                    <div className="pl-4 space-y-0.5">
                      {chatsInFolder.map((conv) => {
                        const isActive = conv.id === activeConversationId;
                        const snippet = searchResults.find((sr) => sr.conversationId === conv.id)?.snippet;

                        return (
                          <div
                            key={conv.id}
                            onClick={() => handleItemClick(() => onSelectConversation(conv.id))}
                            className={`group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition ${
                              isActive
                                ? 'bg-cyan-600/20 text-cyan-300 font-medium border border-cyan-500/40'
                                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate min-w-0 mr-1.5">
                              <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                              <div className="truncate">
                                <p className="truncate">{conv.title}</p>
                                {snippet && <p className="text-[10px] text-slate-500 truncate">{snippet}</p>}
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenConversationSettings(conv);
                              }}
                              className="p-1 opacity-70 sm:opacity-0 group-hover:opacity-100 hover:text-cyan-400 text-slate-500 transition rounded"
                              title="Conversation Settings"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ungrouped / Recent Conversations Section */}
          <div className="space-y-0.5 pt-2">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">
              Conversations {folders.length > 0 && '(Ungrouped)'}
            </div>

            {ungrouped.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-500">
                {searchTerm ? 'No matching conversations' : 'No chats here yet'}
              </div>
            ) : (
              ungrouped.map((conv) => {
                const isActive = conv.id === activeConversationId;
                const snippet = searchResults.find((sr) => sr.conversationId === conv.id)?.snippet;

                return (
                  <div
                    key={conv.id}
                    onClick={() => handleItemClick(() => onSelectConversation(conv.id))}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition ${
                      isActive
                        ? 'bg-cyan-600/20 text-cyan-300 font-medium border border-cyan-500/40'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0 mr-1.5">
                      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                      <div className="truncate">
                        <p className="truncate">{conv.title}</p>
                        {snippet && <p className="text-[10px] text-slate-500 truncate">{snippet}</p>}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenConversationSettings(conv);
                      }}
                      className="p-1 opacity-70 sm:opacity-0 group-hover:opacity-100 hover:text-cyan-400 text-slate-500 transition rounded"
                      title="Conversation Settings"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Bottom Utility Actions */}
        <div className={`p-3 border-t space-y-1 pb-safe ${
          theme === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-slate-300 bg-slate-200'
        }`}>
          {onOpenExport && (
            <button
              onClick={() => handleItemClick(onOpenExport)}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-900 transition"
            >
              <Download className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate">Export Chat (PDF / MD / JSON)</span>
            </button>
          )}
          {onOpenDownloadApp && (
            <button
              onClick={() => handleItemClick(onOpenDownloadApp)}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs text-cyan-300 hover:text-cyan-200 bg-cyan-950/40 hover:bg-cyan-950/70 border border-cyan-800/40 transition font-medium"
            >
              <Download className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate">Download Apps (Windows &amp; APK)</span>
            </button>
          )}
          {onOpenMemory && (
            <button
              onClick={() => handleItemClick(onOpenMemory)}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-900 transition"
            >
              <Brain className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="truncate">AI Memory</span>
            </button>
          )}
          {onOpenSchedules && (
            <button
              onClick={() => handleItemClick(onOpenSchedules)}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-900 transition"
            >
              <CalendarClock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Jadwal Otomatis</span>
            </button>
          )}
          {onOpenTrash && (
            <button
              onClick={() => handleItemClick(onOpenTrash)}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-900 transition"
            >
              <Trash2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate">Sampah</span>
            </button>
          )}
          <button
            onClick={() => handleItemClick(onOpenDashboard)}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-900 transition"
          >
            <BarChart3 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="truncate">Telemetry & Quota Dashboard</span>
          </button>
          <button
            onClick={() => handleItemClick(onOpenSettings)}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-900 transition"
          >
            <Settings className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">API Keys & Credentials</span>
          </button>
          <button
            onClick={() => handleItemClick(onOpenShortcuts)}
            className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-900 transition"
          >
            <span className="flex items-center gap-2.5">
              <Keyboard className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Keyboard Shortcuts</span>
            </span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
              Ctrl + /
            </kbd>
          </button>

          <div className="pt-2 border-t border-slate-800/80">
            <UserProfileMenu onOpenPremium={onOpenPremium} />
          </div>
        </div>
      </aside>
    </>
  );
};
