'use client';

import React, { useState } from 'react';
import { X, Folder, Edit3, MessageSquare, Trash2, Check, Sparkles, Tag, Plus, Share2 } from 'lucide-react';
import { ConversationSummary, FolderItem } from '@/lib/storage';

interface ConversationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: ConversationSummary | null;
  folders: FolderItem[];
  onUpdate: (id: string, updates: Partial<ConversationSummary>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onShare?: () => void;
}

export const ConversationSettingsModal: React.FC<ConversationSettingsModalProps> = ({
  isOpen,
  onClose,
  conversation,
  folders,
  onUpdate,
  onDelete,
  onShare,
}) => {
  if (!isOpen || !conversation) return null;

  const [title, setTitle] = useState(conversation.title);
  const [folderId, setFolderId] = useState<string | null>(conversation.folderId || null);
  const [systemPrompt, setSystemPrompt] = useState(conversation.systemPrompt || '');
  const [temperature, setTemperature] = useState(conversation.temperature ?? 0.7);
  const [tags, setTags] = useState<string[]>(conversation.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const value = tagInput.trim().replace(/^#/, '').slice(0, 40);
    if (!value) return;
    if (!tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
      setTags((prev) => [...prev, value].slice(0, 12));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((item) => item !== tag));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(conversation.id, {
        title: title.trim() || conversation.title,
        folderId,
        systemPrompt,
        temperature,
        tags,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Move this conversation to the trash? You can restore it later.')) {
      await onDelete(conversation.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 flex flex-col pb-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Conversation Settings</h2>
              <p className="text-[11px] text-slate-400 truncate max-w-[280px]">
                Created: {new Date(conversation.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75dvh] overflow-y-auto">
          {/* Conversation Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Conversation Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-base sm:text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Folder / Category Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-cyan-400" />
              <span>Folder Category</span>
            </label>
            <select
              value={folderId || ''}
              onChange={(e) => setFolderId(e.target.value || null)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-base sm:text-xs text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="">(No Folder / Ungrouped)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-violet-400" />
              <span>Tags</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Tambah tag lalu Enter (contoh: ide, kerjaan)"
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-base sm:text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={addTag}
                className="p-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition shrink-0"
                aria-label="Tambah tag"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-violet-950/60 text-violet-300 border border-violet-800/50"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-violet-400 hover:text-rose-400 transition"
                      aria-label={`Hapus tag ${tag}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Custom System Prompt */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Custom System Prompt</span>
            </label>
            <textarea
              rows={3}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="e.g. You are a senior software architect..."
              className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-base sm:text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 leading-relaxed font-sans"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Chat</span>
            </button>
            {onShare && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onShare();
                }}
                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-xs text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-md shadow-cyan-600/20"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
