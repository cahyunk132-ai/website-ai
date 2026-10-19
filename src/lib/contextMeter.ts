/**
 * Hyunk AI Hub - Context Window Meter
 *
 * Estimates how much of the model context window is already used by the
 * conversation. The estimation mirrors the one used for the usage accounting
 * (`src/lib/ai/usage.ts`) so the numbers stay consistent.
 */

import { estimateTokens } from './ai/usage';
import type { ChatMessage } from './ai/types';

export interface ContextUsage {
  /** Estimated number of tokens used by the conversation. */
  used: number;
  /** The context window of the selected model. */
  window: number;
  /** Percentage of the window that is used (0-100). */
  percent: number;
  /** True when the conversation is close to the limit. */
  warning: boolean;
  /** True when the conversation does not fit anymore. */
  overflow: boolean;
}

export const DEFAULT_CONTEXT_WINDOW = 128000;

/** The meter turns red at this percentage. */
export const CONTEXT_WARNING_PERCENT = 80;

const SYSTEM_PROMPT_OVERHEAD = 400;
const TOOLS_OVERHEAD = 700;

/**
 * Computes the context usage of a conversation.
 */
export function computeContextUsage(
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>,
  contextWindow: number = DEFAULT_CONTEXT_WINDOW,
  systemPrompt?: string
): ContextUsage {
  let used = SYSTEM_PROMPT_OVERHEAD + TOOLS_OVERHEAD;

  if (systemPrompt) {
    used += estimateTokens(systemPrompt);
  }

  for (const message of messages) {
    // Every message carries a small role/framing overhead.
    used += estimateTokens(message.content) + 4;
  }

  const window = Math.max(1, contextWindow);
  const percent = Math.min(100, Math.round((used / window) * 100));

  return {
    used,
    window,
    percent,
    warning: percent >= CONTEXT_WARNING_PERCENT,
    overflow: used >= window,
  };
}

/**
 * Formats the token count in a compact way (12.4k, 1.2M).
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) {
    const value = tokens / 1000;
    return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}k`;
  }
  const value = tokens / 1_000_000;
  return `${value.toFixed(1).replace(/\.0$/, '')}M`;
}
