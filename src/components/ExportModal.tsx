'use client';

import React from 'react';
import { X, Download, FileText, Code2, Printer, Check } from 'lucide-react';
import { ChatMessage } from '@/lib/ai/types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationTitle: string;
  messages: ChatMessage[];
  modelName: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  conversationTitle,
  messages,
  modelName,
}) => {
  if (!isOpen) return null;

  const exportAsMarkdown = () => {
    const title = conversationTitle || 'Hyunk AI Hub Conversation';
    const date = new Date().toISOString();
    let md = `# ${title}\n\n`;
    md += `- **Date:** ${new Date().toLocaleString()}\n`;
    md += `- **Model:** ${modelName}\n`;
    md += `- **Exported from:** Hyunk AI Hub (Multi-Provider Platform)\n\n---\n\n`;

    messages.forEach((msg) => {
      const roleName = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
      md += `### ${roleName}\n\n${msg.content}\n\n`;
      if (msg.attachments && msg.attachments.length > 0) {
        md += `*Attachments:* ${msg.attachments.map((a) => a.name).join(', ')}\n\n`;
      }
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    link.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const exportAsJSON = () => {
    const payload = {
      title: conversationTitle || 'Hyunk AI Hub Conversation',
      model: modelName,
      exportedAt: new Date().toISOString(),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        model: m.model,
        provider: m.provider,
        attachments: m.attachments,
        createdAt: m.createdAt,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(conversationTitle || 'chat').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const exportAsPDF = () => {
    onClose();
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Export Conversation</h2>
              <p className="text-[11px] text-slate-400 truncate max-w-[240px]">
                {conversationTitle || 'Current Chat'} ({messages.length} messages)
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

        {/* Export Options */}
        <div className="p-5 space-y-3">
          {/* Markdown */}
          <button
            type="button"
            onClick={exportAsMarkdown}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800/80 transition text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-105 transition">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-100">Markdown (.md)</p>
                <p className="text-[11px] text-slate-400">Formatted documentation with code blocks & headings</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition" />
          </button>

          {/* JSON */}
          <button
            type="button"
            onClick={exportAsJSON}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/80 transition text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition">
                <Code2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-100">Raw JSON (.json)</p>
                <p className="text-[11px] text-slate-400">Structured data with timestamps, models & tokens</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
          </button>

          {/* PDF / Print */}
          <button
            type="button"
            onClick={exportAsPDF}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-violet-500/50 hover:bg-slate-800/80 transition text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 group-hover:scale-105 transition">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-100">PDF / Print Document</p>
                <p className="text-[11px] text-slate-400">Save as PDF or print high-fidelity clean document</p>
              </div>
            </div>
            <Printer className="w-4 h-4 text-slate-500 group-hover:text-violet-400 transition" />
          </button>
        </div>
      </div>
    </div>
  );
};
