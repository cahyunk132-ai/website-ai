'use client';

import React, { useState, useEffect } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Terminal,
  CheckCircle2,
  Cpu,
  Sparkles,
  Wrench,
  Search,
  Code2,
  Globe,
  ExternalLink,
  Calculator,
  BookOpen,
  Layers,
  ListTree,
  Clock,
} from 'lucide-react';
import { MarkdownRenderer } from './ui/MarkdownRenderer';
import { AgentStepView, AgentSkillView } from '@/lib/ai/agentEvents';

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
  skills: Array<{ slug: string }>;
  mainContent: string;
  hasAgentBlocks: boolean;
}

export function parseAgentContent(raw: string): ParsedAgentContent {
  let text = raw || '';
  let thought = '';
  const actions: ToolAction[] = [];
  const skills: Array<{ slug: string }> = [];

  // Match <thought>...</thought> or <thinking>...</thinking>
  const thoughtMatch = text.match(/<(?:thought|thinking)>([\s\S]*?)(?:<\/(?:thought|thinking)>|$)/i);
  if (thoughtMatch) {
    thought = thoughtMatch[1].trim();
    text = text.replace(/<(?:thought|thinking)>[\s\S]*?(?:<\/(?:thought|thinking)>|$)/gi, '').trim();
  }

  // Match <skill_use skill="..." />
  const skillRegex = /<skill_use\b([^>]*?)(?:\/>|>([\s\S]*?)(?:<\/skill_use>|$))/gi;
  let skillMatch;
  while ((skillMatch = skillRegex.exec(text)) !== null) {
    const attributes = skillMatch[1] || '';
    const slugMatch = attributes.match(/skill\s*=\s*["']([^"']+)["']/i);
    const slug = (slugMatch?.[1] || (skillMatch[2] || '').trim().split(/\s+/)[0] || '').toLowerCase();
    if (slug) skills.push({ slug });
    text = text.replace(skillMatch[0], '').trim();
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

  const hasAgentBlocks = Boolean(thought || actions.length > 0 || skills.length > 0);

  return {
    thought,
    actions,
    skills,
    mainContent: text,
    hasAgentBlocks,
  };
}

function ToolIcon({ tool }: { tool: string }) {
  const name = tool.toLowerCase();
  if (name.includes('code') || name.includes('interpreter')) {
    return <Code2 className="w-3.5 h-3.5" />;
  }
  if (name.includes('search')) {
    return <Search className="w-3.5 h-3.5" />;
  }
  if (name.includes('calc') || name.includes('math')) {
    return <Calculator className="w-3.5 h-3.5" />;
  }
  if (name.includes('fetch') || name.includes('url') || name.includes('http')) {
    return <Globe className="w-3.5 h-3.5" />;
  }
  return <Wrench className="w-3.5 h-3.5" />;
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
  /** The executed agent steps (multi step timeline). */
  agentSteps?: AgentStepView[];
  /** Skills that were activated during the run. */
  activatedSkills?: AgentSkillView[];
}

export const AgentReasoningCard: React.FC<AgentReasoningCardProps> = ({
  content,
  isStreaming = false,
  liveToolOutputs = [],
  webSearchSources = [],
  agentSteps = [],
  activatedSkills = [],
}) => {
  const { thought, actions, skills, mainContent, hasAgentBlocks } = parseAgentContent(content);
  const [isThoughtOpen, setIsThoughtOpen] = useState(true);
  const [isTimelineOpen, setIsTimelineOpen] = useState(true);
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

  const totalTools = agentSteps.reduce((sum, step) => sum + (step.toolResults?.length || 0), 0);
  const hasTimeline = agentSteps.length > 0;

  if (
    !hasAgentBlocks &&
    allActions.length === 0 &&
    webSearchSources.length === 0 &&
    !hasTimeline &&
    !isStreaming
  ) {
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
                className="flex items-start gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/50 transition text-left group"
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

      {/* 1. Agent Execution Timeline (multi step) */}
      {hasTimeline && (
        <div className="rounded-xl border border-indigo-500/30 bg-slate-950 overflow-hidden shadow-lg">
          <button
            type="button"
            onClick={() => setIsTimelineOpen(!isTimelineOpen)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-950 hover:from-indigo-950/80 transition text-left text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shrink-0">
                <ListTree className="w-3.5 h-3.5" />
                {isStreaming && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                )}
              </div>
              <span className="font-semibold text-indigo-200">Agent Execution Timeline</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                {agentSteps.length} step{agentSteps.length === 1 ? '' : 's'}
                {totalTools > 0 ? ` • ${totalTools} tool call${totalTools === 1 ? '' : 's'}` : ''}
                {activatedSkills.length > 0
                  ? ` • ${activatedSkills.length} skill${activatedSkills.length === 1 ? '' : 's'}`
                  : ''}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
              {isTimelineOpen ? (
                <ChevronDown className="w-4 h-4 text-indigo-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </button>

          {isTimelineOpen && (
            <div className="p-3 border-t border-indigo-500/20 bg-slate-950 space-y-2.5">
              {agentSteps.map((step) => (
                <div
                  key={step.step}
                  className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50 shrink-0">
                        STEP {step.step}
                      </span>
                      {step.thought ? (
                        <span className="text-[11px] text-slate-400 truncate font-mono">
                          {step.thought.split('\n')[0].slice(0, 90)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">no reasoning recorded</span>
                      )}
                    </div>
                    {step.isFinal ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-sans font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/50 shrink-0">
                        FINAL ANSWER
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-sans font-bold bg-slate-900 text-slate-400 border border-slate-700/60 shrink-0">
                        EXECUTING
                      </span>
                    )}
                  </div>

                  {/* Requested calls */}
                  {step.calls && step.calls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {step.calls.map((call, idx) => (
                        <span
                          key={`${step.step}-call-${idx}`}
                          className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-mono ${
                            call.type === 'skill'
                              ? 'bg-amber-950/60 text-amber-300 border-amber-800/50'
                              : 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50'
                          }`}
                        >
                          {call.type === 'skill' ? (
                            <BookOpen className="w-3 h-3" />
                          ) : (
                            <ToolIcon tool={call.name} />
                          )}
                          {call.name}
                          {call.target ? `: ${call.target}` : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Tool outputs */}
                  {step.toolResults && step.toolResults.length > 0 && (
                    <div className="space-y-1.5">
                      {step.toolResults.map((result, idx) => (
                        <div
                          key={`${step.step}-result-${idx}`}
                          className="text-[11px] font-mono rounded-lg border border-slate-800 bg-slate-950 overflow-hidden"
                        >
                          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-slate-800/80">
                            <span className="flex items-center gap-1.5 text-cyan-300 min-w-0">
                              <ToolIcon tool={result.tool} />
                              <span className="truncate">{result.tool}</span>
                              {result.target && (
                                <span className="text-slate-500 truncate">→ {result.target}</span>
                              )}
                            </span>
                            <span
                              className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${
                                result.success
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50'
                                  : 'bg-rose-950/60 text-rose-300 border-rose-800/50'
                              }`}
                            >
                              {result.success ? (
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              ) : (
                                <Wrench className="w-2.5 h-2.5" />
                              )}
                              {result.success ? 'OK' : 'FAILED'}
                              {result.durationMs ? ` ${result.durationMs}ms` : ''}
                            </span>
                          </div>
                          <div className="px-2.5 py-2 text-emerald-300/90 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                            {result.output}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Loaded skills */}
                  {step.loadedSkills && step.loadedSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {step.loadedSkills.map((skill) => (
                        <span
                          key={skill.slug}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-950/60 text-amber-200 border border-amber-800/50"
                          title={skill.description}
                        >
                          <BookOpen className="w-3 h-3" />
                          {skill.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Activated skills summary */}
      {activatedSkills.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-slate-950 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Skills Activated ({activatedSkills.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activatedSkills.map((skill) => (
              <span
                key={skill.slug}
                className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg bg-amber-950/50 text-amber-200 border border-amber-800/50 font-sans"
                title={skill.description}
              >
                <BookOpen className="w-3 h-3" />
                <span className="font-semibold">{skill.name}</span>
                <span className="text-amber-400/70 font-mono">/{skill.slug}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3. Agent Reasoning & Planning Accordion */}
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

      {/* 4. Real Tool Invocations & Live Outputs (single turn fallback) */}
      {allActions.length > 0 && (
        <div className="space-y-2">
          {allActions.map((act, idx) => {
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
                      <ToolIcon tool={act.tool} />
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
                      <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
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

      {/* 5. Main Deliverable / Solution */}
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
