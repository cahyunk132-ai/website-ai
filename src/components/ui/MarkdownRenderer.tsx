'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose prose-invert prose-slate max-w-none break-words text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const rawValue = String(children).replace(/\n$/, '');

            if (!inline && match) {
              return <CodeBlock language={match[1]} value={rawValue} />;
            } else if (!inline && rawValue.includes('\n')) {
              return <CodeBlock language="text" value={rawValue} />;
            } else {
              return (
                <code
                  className="rounded-md bg-slate-800/80 px-1.5 py-0.5 font-mono text-[13px] text-cyan-300 border border-slate-700/50"
                  {...props}
                >
                  {children}
                </code>
              );
            }
          },
          table({ children }) {
            return (
              <div className="my-4 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-sm text-slate-300">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-slate-900 text-slate-200 border-b border-slate-800">{children}</thead>;
          },
          th({ children }) {
            return <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wider">{children}</th>;
          },
          td({ children }) {
            return <td className="px-4 py-2 border-b border-slate-800/50">{children}</td>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-4 font-medium transition"
              >
                {children}
              </a>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-3 border-l-4 border-cyan-500/70 bg-slate-900/40 py-1 pl-4 italic text-slate-300 rounded-r-lg">
                {children}
              </blockquote>
            );
          },
          ul({ children }) {
            return <ul className="my-2 list-disc pl-5 space-y-1 text-slate-200">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-2 list-decimal pl-5 space-y-1 text-slate-200">{children}</ol>;
          },
          p({ children }) {
            return <p className="mb-3 last:mb-0 leading-7 text-slate-200">{children}</p>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
