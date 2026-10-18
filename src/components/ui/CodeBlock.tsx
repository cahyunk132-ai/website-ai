'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { safeCopyText } from '@/lib/safeUUID';

interface CodeBlockProps {
  language?: string;
  value: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language = 'text', value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const ok = await safeCopyText(value);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  return (
    <div className="relative my-4 rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden font-mono text-sm shadow-lg">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-slate-950/70 text-xs text-slate-400">
        <span className="font-semibold text-cyan-400 uppercase tracking-wider">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-700/80 transition"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-slate-200">
        <pre>
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
};
