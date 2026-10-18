'use client';

import React from 'react';
import { X, Keyboard, Command } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category: 'Chat' | 'Navigation' | 'System';
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts: ShortcutItem[] = [
    { keys: ['Enter'], description: 'Send chat message', category: 'Chat' },
    { keys: ['Shift', 'Enter'], description: 'Add new line in input', category: 'Chat' },
    { keys: ['Ctrl', 'K'], description: 'Focus conversation search', category: 'Navigation' },
    { keys: ['Ctrl', 'Shift', 'O'], description: 'Create new chat session', category: 'Navigation' },
    { keys: ['Ctrl', 'B'], description: 'Toggle conversation sidebar', category: 'Navigation' },
    { keys: ['Ctrl', 'Shift', 'D'], description: 'Toggle Dark / Light theme', category: 'System' },
    { keys: ['Ctrl', '/'], description: 'Open Keyboard Shortcuts helper', category: 'System' },
    { keys: ['Esc'], description: 'Close any open modal or menu', category: 'System' },
  ];

  const categories = ['Chat', 'Navigation', 'System'] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Keyboard Shortcuts</h2>
              <p className="text-[11px] text-slate-400">Power user keybindings for Hyunk AI Hub</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {categories.map((cat) => (
            <div key={cat} className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{cat}</h3>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/60">
                {shortcuts
                  .filter((s) => s.category === cat)
                  .map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                      <span className="text-slate-300 font-medium">{s.description}</span>
                      <div className="flex items-center gap-1">
                        {s.keys.map((k) => (
                          <kbd
                            key={k}
                            className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-200 font-mono text-[11px] font-semibold shadow-sm"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
