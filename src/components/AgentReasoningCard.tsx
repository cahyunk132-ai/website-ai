'use client';

import React, { useState, useEffect } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Terminal,
  CheckCircle2,
  Cpu,
  Clock,
  Sparkles,
  Layers,
  Wrench,
  Search,
  Code2,
} from 'lucide-react';
import { MarkdownRenderer } from './ui/MarkdownRenderer';

interface ToolAction {
  tool: string;
  target?: string;
  content: string;
}

interface ParsedAgentContent {
  thought: string;
  actions: ToolAction[];
  mainContent: string;
  hasAgentBlocks: boolean;
}

export function parseAgentContent(raw: string): ParsedAgentContent {
  let text = raw || '';
  let thought = '';
  const actions: ToolAction[] = [];

  // Match <thought>...</thought> or <thinking>...</thinking>
  const thoughtMatch = text.match(/<(?:thought|thinking)>([\s\S]*?)(?:<\/(?:thought|thinking)>|$)/i);
  if (thoughtMatch) {
    thought = thoughtMatch[1].trim();
    text = text.replace(/<(?:thought|thinking)>[\s\S]*?(?:<\/(?:thought|thinking)>|$)/gi, '').trim();
  }

  // Match <agent_action tool="..." target="...">...</agent_action>
  const actionRegex = /<agent_action\s+tool=["']([^"']+)["'](?:\s+target=["']([^"']+)["'])?>([\s\S]*?)(?:<\/agent_action>|$)/gi;
  let match;
  while ((match = actionRegex.exec(text)) !== null) {
    actions.push({
      tool: match[1],
      target: match[2] || undefined,
      content: match[3].trim(),
    });
  }
  text = text.replace(/<agent_action[\s\S]*?(?:<\/agent_action>|$)/gi, '').trim();

  // Clean any stray artifact tags
  text = text.replace(/<plan>[\s\S]*?<\/plan>/gi, '').trim();

  const hasAgentBlocks = Boolean(thought || actions.length > 0);

  return {
    thought,
    actions,
    mainContent: text,
    hasAgentBlocks,
  };
}

interface AgentReasoningCardProps {
  content: string;
  isStreaming?: boolean;
}

export const AgentReasoningCard: React.FC<AgentReasoningCardProps> = ({
  content,
  isStreaming = false,
}) => {
  const { thought, actions, mainContent, hasAgentBlocks } = parseAgentContent(content);
  const [isThoughtOpen, setIsThoughtOpen] = useState(true);

  // If streaming finishes and we have mainContent, auto-collapse thought after a brief moment
  useEffect(() => {
    if (!isStreaming && mainContent && thought) {
      const timer = setTimeout(() => {
        // Keep collapsed for clean look once answer is ready
        setIsThoughtOpen(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, mainContent, thought]);

  if (!hasAgentBlocks && !isStreaming) {
    return <MarkdownRenderer content={content} />;
  }

  return (
    <div className="space-y-4">
      {/* 1. Agent Reasoning & Planning Accordion */}
      {thought && (
        <div className="rounded-xl border border-violet-500/30 bg-slate-950/70 overflow-hidden shadow-lg transition duration-200">
          <button
            type="button"
            onClick={() => setIsThoughtOpen(!isThoughtOpen)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-violet-950/40 via-slate-900/50 to-slate-900/80 hover:bg-violet-950/60 transition text-left text-xs"
          >
            <div className="flex items-center gap-2">
              <div className="relative flex items-center justify-center w-6 h-6 rounded-lg bg-violet-600/20 text-violet-400 border border-violet-500/30">
                <Brain className="w-3.5 h-3.5" />
                {isStreaming && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                )}
              </div>
              <span className="font-semibold text-violet-200">
                Agent Reasoning & Execution Plan
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-950/80 text-violet-300 border border-violet-800/50">
                {isStreaming ? 'Reasoning Active...' : 'Plan Verified'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="text-[10px] hidden sm:inline text-slate-400">
                {isThoughtOpen ? 'Click to collapse' : 'View thoughts'}
              </span>
              {isThoughtOpen ? (
                <ChevronDown className="w-4 h-4 text-violet-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </button>

          {isThoughtOpen && (
            <div className="p-3.5 border-t border-violet-500/20 bg-slate-950/90 text-xs text-slate-300 font-mono space-y-2 max-h-96 overflow-y-auto leading-relaxed">
              <div className="flex items-center gap-2 pb-1 text-[11px] text-violet-400/80 border-b border-violet-900/40 font-sans">
                <Cpu className="w-3.5 h-3.5" />
                <span>Autonomous Chain-of-Thought & Constraint Verification</span>
              </div>
              <div className="whitespace-pre-wrap text-slate-300 text-[12px] leading-relaxed">
                {thought}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Tool Invocations & Directives */}
      {actions.length > 0 && (
        <div className="space-y-2">
          {actions.map((act, idx) => {
            const isCode = act.tool.toLowerCase().includes('code');
            const isSearch = act.tool.toLowerCase().includes('search');
            return (
              <div
                key={idx}
                className="rounded-xl border border-cyan-500/30 bg-slate-950/80 p-3 space-y-2 shadow-sm text-xs font-mono"
              >
                <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2 gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <div className="p-1 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 shrink-0">
                      {isCode ? (
                        <Code2 className="w-3.5 h-3.5" />
                      ) : isSearch ? (
                        <Search className="w-3.5 h-3.5" />
                      ) : (
                        <Wrench className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span className="font-semibold text-cyan-300 font-sans truncate">
                      Tool Call: <span className="text-cyan-200 font-mono">{act.tool}</span>
                    </span>
                    {act.target && (
                      <span className="text-[10px] text-slate-400 font-sans truncate">
                        Target: <span className="text-slate-300 font-mono">{act.target}</span>
                      </span>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/40 shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Success</span>
                  </span>
                </div>
                {act.content && (
                  <div className="text-[11px] text-slate-300 whitespace-pre-wrap bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                    {act.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Main Deliverable / Solution */}
      {mainContent ? (
        <MarkdownRenderer content={mainContent} />
      ) : isStreaming ? (
        <div className="flex items-center gap-2 py-2 text-violet-300 text-xs font-mono animate-pulse">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span>Agent formulating solution deliverable...</span>
        </div>
      ) : null}
    </div>
  );
};
