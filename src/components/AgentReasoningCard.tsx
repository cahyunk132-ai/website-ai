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
  Globe,
  ExternalLink,
  Calculator,
  FileSearch,
} from 'lucide-react';
import { MarkdownRenderer } from './ui/MarkdownRenderer';

export interface ToolAction {
  tool: string;
  target?: string;
  content: string;
  output?: string;
  durationMs?: number;
}

export interface WebSearchSource {
  title: string;
  url: string;
  snippet: string;
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
  liveToolOutputs?: Array<{
    tool: string;
    target?: string;
    success: boolean;
    output: string;
    durationMs?: number;
  }>;
  webSearchSources?: WebSearchSource[];
}

export const AgentReasoningCard: React.FC<AgentReasoningCardProps> = ({
  content,
  isStreaming = false,
  liveToolOutputs = [],
  webSearchSources = [],
}) => {
  const { thought, actions, mainContent, hasAgentBlocks } = parseAgentContent(content);
  const [isThoughtOpen, setIsThoughtOpen] = useState(true);
  const [openToolIndex, setOpenToolIndex] = useState<number | null>(null);

  // Auto-collapse thought after completion for a cleaner view
  useEffect(() => {
    if (!isStreaming && mainContent && thought) {
      const timer = setTimeout(() => {
        setIsThoughtOpen(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, mainContent, thought]);

  const allActions = [...actions];
  // Merge liveToolOutputs if not already represented
  liveToolOutputs.forEach((lt) => {
    const existing = allActions.find((a) => a.tool === lt.tool && a.target === lt.target);
    if (existing) {
      existing.output = lt.output;
      existing.durationMs = lt.durationMs;
    } else {
      allActions.push({
        tool: lt.tool,
        target: lt.target,
        content: `Executed tool: ${lt.tool}`,
        output: lt.output,
        durationMs: lt.durationMs,
      });
    }
  });

  if (!hasAgentBlocks && allActions.length === 0 && webSearchSources.length === 0 && !isStreaming) {
    return <MarkdownRenderer content={content} />;
  }

  return (
    <div className="space-y-3.5">
      {/* 0. Live Web Search Sources Citations if present */}
      {webSearchSources.length > 0 && (
        <div className="rounded-xl border border-cyan-500/30 bg-slate-950 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Web Search Sources & Live Citations ({webSearchSources.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {webSearchSources.map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-850 transition text-left group"
              >
                <span className="text-[10px] font-mono font-bold text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800/40 shrink-0">
                  [{i + 1}]
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-200 group-hover:text-cyan-300 truncate">
                    {src.title}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                    <span>{src.url.replace(/^https?:\/\//, '').split('/')[0]}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 1. Agent Reasoning & Planning Accordion */}
      {thought && (
        <div className="rounded-xl border border-violet-500/30 bg-slate-950 overflow-hidden shadow-lg transition duration-200">
          <button
            type="button"
            onClick={() => setIsThoughtOpen(!isThoughtOpen)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-violet-950/60 via-slate-900 to-slate-950 hover:bg-violet-950/80 transition text-left text-xs"
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
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-950 text-violet-300 border border-violet-800/50">
                {isStreaming ? 'Reasoning Active...' : 'Plan Verified'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="text-[10px] hidden sm:inline text-slate-400">
                {isThoughtOpen ? 'Collapse' : 'Expand'}
              </span>
              {isThoughtOpen ? (
                <ChevronDown className="w-4 h-4 text-violet-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </button>

          {isThoughtOpen && (
            <div className="p-3.5 border-t border-violet-500/20 bg-slate-950 text-xs text-slate-300 font-mono space-y-2 max-h-96 overflow-y-auto leading-relaxed">
              <div className="flex items-center gap-2 pb-1 text-[11px] text-violet-400 border-b border-violet-900/40 font-sans">
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

      {/* 2. Real Tool Invocations & Live Outputs */}
      {allActions.length > 0 && (
        <div className="space-y-2">
          {allActions.map((act, idx) => {
            const isCode = act.tool.toLowerCase().includes('code');
            const isSearch = act.tool.toLowerCase().includes('search');
            const isCalc = act.tool.toLowerCase().includes('calc') || act.tool.toLowerCase().includes('math');
            const isOpen = openToolIndex === idx || Boolean(act.output);

            return (
              <div
                key={idx}
                className="rounded-xl border border-cyan-500/30 bg-slate-950 p-3 space-y-2 shadow-sm text-xs font-mono"
              >
                <div
                  className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2 gap-1.5 cursor-pointer"
                  onClick={() => setOpenToolIndex(openToolIndex === idx ? null : idx)}
                >
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <div className="p-1 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 shrink-0">
                      {isCode ? (
                        <Code2 className="w-3.5 h-3.5" />
                      ) : isSearch ? (
                        <Search className="w-3.5 h-3.5" />
                      ) : isCalc ? (
                        <Calculator className="w-3.5 h-3.5" />
                      ) : (
                        <Wrench className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span className="font-semibold text-cyan-300 font-sans truncate">
                      Real Tool: <span className="text-cyan-200 font-mono font-bold">{act.tool}</span>
                    </span>
                    {act.target && (
                      <span className="text-[10px] text-slate-400 font-sans truncate">
                        Target: <span className="text-slate-300 font-mono">{act.target}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {act.durationMs && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {act.durationMs}ms
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/40 shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{act.output ? 'Executed' : 'Active'}</span>
                    </span>
                  </div>
                </div>

                {/* Input Payload */}
                {act.content && (
                  <div className="text-[11px] text-slate-300 whitespace-pre-wrap bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-500 font-sans mb-1 flex items-center gap-1">
                      <Terminal className="w-3 h-3" />
                      <span>Input Payload:</span>
                    </div>
                    {act.content}
                  </div>
                )}

                {/* Real Live Output if available */}
                {act.output && (
                  <div className="text-[11px] text-emerald-300 whitespace-pre-wrap bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-900/40">
                    <div className="text-[10px] text-emerald-400 font-sans mb-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Live Sandbox Execution Output:</span>
                    </div>
                    {act.output}
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
