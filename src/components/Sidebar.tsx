'use client';

import React, { useState } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Settings,
  BarChart3,
  Sparkles,
  Server,
  ChevronLeft,
  ChevronRight,
  Smartphone,
} from 'lucide-react';
import { ConversationSummary } from '@/lib/storage';

interface SidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onOpenSettings: () => void;
  onOpenDashboard: () => void;
  onOpenDownloadApp?: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onOpenSettings,
  onOpenDashboard,
  onOpenDownloadApp,
  isOpen,
  onToggleOpen,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleItemClick = (action: () => void) => {
    action();
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      onToggleOpen();
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm md:hidden animate-fadeIn"
          onClick={onToggleOpen}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col w-[85vw] sm:w-80 md:w-72 max-w-sm bg-slate-950 border-r border-slate-800/80 transition-transform duration-300 ease-in-out pb-safe ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:border-r-0 md:overflow-hidden'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800/70">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 shadow-md shadow-cyan-500/20 text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-100 tracking-tight">Hyunk AI Hub</h1>
              <p className="text-[11px] text-cyan-400 font-medium">Multi-Provider Unified</p>
            </div>
          </div>
          <button
            onClick={onToggleOpen}
            className="md:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Action: New Chat */}
        <div className="p-3">
          <button
            onClick={() => handleItemClick(onNewConversation)}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium text-sm shadow-md shadow-blue-500/10 transition active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Search */}
        {conversations.length > 5 && (
          <div className="px-3 pb-2">
            <input
              type="text"
              placeholder="Search chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        )}

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">
            Recent Conversations
          </div>

          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No conversations yet
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  onClick={() => handleItemClick(() => onSelectConversation(conv.id))}
                  className={`group flex items-center justify-between px-3 py-3 rounded-xl text-xs cursor-pointer transition ${
                    isActive
                      ? 'bg-slate-800 text-cyan-300 font-medium border border-cyan-500/30'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate mr-2">
                    <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                    <span className="truncate">{conv.title}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    className="p-1.5 opacity-70 sm:opacity-0 group-hover:opacity-100 hover:text-rose-400 text-slate-500 transition rounded hover:bg-slate-800/80"
                    title="Delete Chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Utility Actions */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/90 space-y-1.5 pb-safe">
          {onOpenDownloadApp && (
            <button
              onClick={() => handleItemClick(onOpenDownloadApp)}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-800/40 transition font-medium"
            >
              <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Download Android App (.apk)</span>
            </button>
          )}
          <button
            onClick={() => handleItemClick(onOpenDashboard)}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-900 transition"
          >
            <BarChart3 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="truncate">Usage & Quota Dashboard</span>
          </button>
          <button
            onClick={() => handleItemClick(onOpenSettings)}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-900 transition"
          >
            <Settings className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">API Keys & Credentials</span>
          </button>
        </div>
      </aside>
    </>
  );
};
