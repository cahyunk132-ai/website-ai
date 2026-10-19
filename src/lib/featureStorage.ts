/**
 * Hyunk AI Hub - Feature Storage Layer
 *
 * Persistence for the features added on top of the core chat:
 *   * AI memory            (user_memories)
 *   * Prompt library       (user_prompts)
 *   * Public shares        (conversation_shares)
 *   * Message feedback     (message_feedback)
 *   * Scheduled runs       (scheduled_runs)
 *   * Conversation tags    (conversations.tags)
 *   * Trash                (conversations.deleted_at)
 *
 * Every function works with Supabase when it is configured and falls back to
 * an in-memory store otherwise, exactly like `src/lib/storage.ts` does.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServerSupabaseAdminClient } from './supabase/server';

export interface MemoryEntry {
  id: string;
  content: string;
  category: string;
  source: 'manual' | 'auto' | 'command';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationShare {
  id: string;
  conversationId: string;
  token: string;
  enabled: boolean;
  views: number;
  createdAt: string;
  expiresAt?: string | null;
}

export interface MessageFeedback {
  id: string;
  messageId: string;
  conversationId: string;
  rating: 'up' | 'down';
  comment?: string;
  createdAt: string;
}

export interface ScheduledRun {
  id: string;
  name: string;
  prompt: string;
  model: string;
  provider: string;
  cron: string;
  enabled: boolean;
  lastRunAt?: string | null;
  lastResult?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyUsagePoint {
  date: string;
  requests: number;
  tokens: number;
}

// ---------------------------------------------------------------------------
// In-memory fallback store
// ---------------------------------------------------------------------------

const FEATURE_STORE_KEY = Symbol.for('hyunk-ai-hub.feature-store');

interface FeatureStore {
  memories: Map<string, MemoryEntry>;
  prompts: Map<string, PromptTemplate>;
  shares: Map<string, ConversationShare>;
  feedback: Map<string, MessageFeedback>;
  schedules: Map<string, ScheduledRun>;
  dailyUsage: Map<string, DailyUsagePoint[]>;
}

function createFeatureStore(): FeatureStore {
  return {
    memories: new Map(),
    prompts: new Map(),
    shares: new Map(),
    feedback: new Map(),
    schedules: new Map(),
    dailyUsage: new Map(),
  };
}

const globalScope = globalThis as unknown as Record<symbol, FeatureStore | undefined>;
if (!globalScope[FEATURE_STORE_KEY]) {
  globalScope[FEATURE_STORE_KEY] = createFeatureStore();
}

const store = globalScope[FEATURE_STORE_KEY] as FeatureStore;

function getAdminClient(): SupabaseClient | null {
  return (createServerSupabaseAdminClient() as SupabaseClient | null) ?? null;
}

function getUserClient(): SupabaseClient | null {
  return (createServerSupabaseClient() as SupabaseClient | null) ?? null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// AI memory
// ---------------------------------------------------------------------------

function mapMemoryRow(row: any): MemoryEntry {
  return {
    id: row.id,
    content: row.content,
    category: row.category || 'general',
    source: row.source || 'manual',
    enabled: row.enabled !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

export async function listMemories(userId?: string): Promise<MemoryEntry[]> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      let query = supabase.from('user_memories').select('*');
      if (userId) query = query.eq('user_id', userId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data) return data.map(mapMemoryRow);
    } catch {
      // Fallback to memory
    }
  }

  return Array.from(store.memories.values())
    .filter((entry) => !userId || entry.id.startsWith(`${userId}:`) || entry.id.startsWith('manual:'))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createMemory(
  content: string,
  options: {
    userId?: string;
    category?: string;
    source?: 'manual' | 'auto' | 'command';
  } = {}
): Promise<MemoryEntry> {
  const timestamp = nowIso();
  const entry: MemoryEntry = {
    id: `${options.userId || 'local'}:${randomToken().slice(0, 12)}`,
    content: content.trim(),
    category: options.category || 'general',
    source: options.source || 'manual',
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('user_memories')
        .insert({
          content: entry.content,
          category: entry.category,
          source: entry.source,
          enabled: true,
          user_id: options.userId || null,
        })
        .select()
        .single();
      if (!error && data) return mapMemoryRow(data);
    } catch {
      // Fallback
    }
  }

  store.memories.set(entry.id, entry);
  return entry;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('user_memories').delete().eq('id', id);
      if (!error) return true;
    } catch {
      // Fallback
    }
  }
  return store.memories.delete(id);
}

export async function setMemoryEnabled(id: string, enabled: boolean): Promise<boolean> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('user_memories')
        .update({ enabled, updated_at: nowIso() })
        .eq('id', id);
      if (!error) return true;
    } catch {
      // Fallback
    }
  }
  const entry = store.memories.get(id);
  if (!entry) return false;
  entry.enabled = enabled;
  store.memories.set(id, entry);
  return true;
}

/**
 * Builds the memory block that is injected into the system prompt.
 */
export function buildMemoryPrompt(memories: MemoryEntry[]): string {
  const active = memories.filter((m) => m.enabled && m.content.trim().length > 0);
  if (!active.length) return '';

  const lines = active.map((m) => `- [${m.category}] ${m.content}`);
  return [
    'The user asked you to remember the following facts. Use them naturally in the conversation,',
    'but never mention that you stored them in a memory list unless the user asks about it.',
    '',
    ...lines,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Prompt library
// ---------------------------------------------------------------------------

function mapPromptRow(row: any): PromptTemplate {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

export async function listPrompts(userId?: string): Promise<PromptTemplate[]> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      let query = supabase.from('user_prompts').select('*');
      if (userId) query = query.eq('user_id', userId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data) return data.map(mapPromptRow);
    } catch {
      // Fallback
    }
  }

  return Array.from(store.prompts.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function createPrompt(
  title: string,
  content: string,
  options: { userId?: string; category?: string } = {}
): Promise<PromptTemplate> {
  const timestamp = nowIso();
  const template: PromptTemplate = {
    id: `${options.userId || 'local'}:${randomToken().slice(0, 12)}`,
    title: title.trim(),
    content: content,
    category: options.category,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('user_prompts')
        .insert({
          title: template.title,
          content: template.content,
          category: template.category ?? null,
          user_id: options.userId || null,
        })
        .select()
        .single();
      if (!error && data) return mapPromptRow(data);
    } catch {
      // Fallback
    }
  }

  store.prompts.set(template.id, template);
  return template;
}

export async function deletePrompt(id: string): Promise<boolean> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('user_prompts').delete().eq('id', id);
      if (!error) return true;
    } catch {
      // Fallback
    }
  }
  return store.prompts.delete(id);
}

// ---------------------------------------------------------------------------
// Public shares
// ---------------------------------------------------------------------------

function mapShareRow(row: any): ConversationShare {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    token: row.token,
    enabled: row.enabled !== false,
    views: row.views ?? 0,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? null,
  };
}

export async function listShares(userId?: string): Promise<ConversationShare[]> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      let query = supabase.from('conversation_shares').select('*');
      if (userId) query = query.eq('user_id', userId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data) return data.map(mapShareRow);
    } catch {
      // Fallback
    }
  }

  return Array.from(store.shares.values());
}

export async function getShareByConversation(
  conversationId: string
): Promise<ConversationShare | null> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('conversation_shares')
        .select('*')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (!error && data) return mapShareRow(data);
    } catch {
      // Fallback
    }
  }

  return (
    Array.from(store.shares.values()).find((share) => share.conversationId === conversationId) || null
  );
}

export async function createShare(
  conversationId: string,
  options: { userId?: string; expiresAt?: string | null } = {}
): Promise<ConversationShare> {
  const timestamp = nowIso();
  const share: ConversationShare = {
    id: `${options.userId || 'local'}:${randomToken().slice(0, 12)}`,
    conversationId,
    token: randomToken(),
    enabled: true,
    views: 0,
    createdAt: timestamp,
    expiresAt: options.expiresAt ?? null,
  };

  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('conversation_shares')
        .insert({
          conversation_id: conversationId,
          token: share.token,
          enabled: true,
          views: 0,
          user_id: options.userId || null,
          expires_at: options.expiresAt ?? null,
        })
        .select()
        .single();
      if (!error && data) return mapShareRow(data);
    } catch {
      // Fallback
    }
  }

  store.shares.set(share.id, share);
  return share;
}

export async function revokeShare(conversationId: string): Promise<boolean> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('conversation_shares')
        .delete()
        .eq('conversation_id', conversationId);
      if (!error) return true;
    } catch {
      // Fallback
    }
  }

  let removed = false;
  for (const [id, share] of store.shares.entries()) {
    if (share.conversationId === conversationId) {
      store.shares.delete(id);
      removed = true;
    }
  }
  return removed;
}

export interface SharedConversation {
  title: string;
  model: string;
  provider: string;
  createdAt: string;
  messages: Array<{ role: string; content: string; createdAt?: string }>;
}

/**
 * Reads a shared conversation with its token. Used by the public share page,
 * therefore it never depends on the session of the visitor.
 */
export async function getSharedConversation(token: string): Promise<SharedConversation | null> {
  const supabase = getAdminClient();
  let share: ConversationShare | null = null;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('conversation_shares')
        .select('*')
        .eq('token', token)
        .maybeSingle();
      if (!error && data) share = mapShareRow(data);
    } catch {
      share = null;
    }
  }

  if (!share) {
    share =
      Array.from(store.shares.values()).find((candidate) => candidate.token === token) || null;
  }

  if (!share || !share.enabled) return null;
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) return null;

  const conversationClient = getUserClient() || getAdminClient();
  let title = 'Shared conversation';
  let model = '';
  let provider = '';
  let createdAt = share.createdAt;
  const messages: SharedConversation['messages'] = [];

  if (conversationClient) {
    try {
      const { data: convData, error: convError } = await conversationClient
        .from('conversations')
        .select('id, title, selected_model, selected_provider, created_at')
        .eq('id', share.conversationId)
        .maybeSingle();
      if (!convError && convData) {
        title = convData.title || title;
        model = convData.selected_model || '';
        provider = convData.selected_provider || '';
        createdAt = convData.created_at || createdAt;
      }

      const { data: msgData } = await conversationClient
        .from('messages')
        .select('role, content, created_at')
        .eq('conversation_id', share.conversationId)
        .order('created_at', { ascending: true });
      for (const row of msgData || []) {
        messages.push({
          role: row.role,
          content: row.content,
          createdAt: row.created_at,
        });
      }
    } catch {
      // Fall through to the empty result
    }
  }

  // Count the view (fire and forget).
  if (supabase) {
    try {
      await supabase
        .from('conversation_shares')
        .update({ views: (share.views || 0) + 1 })
        .eq('id', share.id);
    } catch {
      // ignore
    }
  } else {
    share.views += 1;
    store.shares.set(share.id, share);
  }

  return { title, model, provider, createdAt, messages };
}

// ---------------------------------------------------------------------------
// Message feedback
// ---------------------------------------------------------------------------

function mapFeedbackRow(row: any): MessageFeedback {
  return {
    id: row.id,
    messageId: row.message_id,
    conversationId: row.conversation_id,
    rating: row.rating,
    comment: row.comment ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listFeedback(conversationId: string): Promise<MessageFeedback[]> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('message_feedback')
        .select('*')
        .eq('conversation_id', conversationId);
      if (!error && data) return data.map(mapFeedbackRow);
    } catch {
      // Fallback
    }
  }

  return Array.from(store.feedback.values()).filter(
    (item) => item.conversationId === conversationId
  );
}

export async function saveFeedback(input: {
  messageId: string;
  conversationId: string;
  rating: 'up' | 'down';
  comment?: string;
  userId?: string;
}): Promise<MessageFeedback> {
  const timestamp = nowIso();

  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('message_feedback')
        .upsert(
          {
            message_id: input.messageId,
            conversation_id: input.conversationId,
            rating: input.rating,
            comment: input.comment ?? null,
            user_id: input.userId || null,
          },
          { onConflict: 'message_id,user_id' }
        )
        .select()
        .single();
      if (!error && data) return mapFeedbackRow(data);
    } catch {
      // Fallback
    }
  }

  const existing = Array.from(store.feedback.values()).find(
    (item) => item.messageId === input.messageId
  );
  const feedback: MessageFeedback = {
    id: existing?.id || `${input.userId || 'local'}:${randomToken().slice(0, 12)}`,
    messageId: input.messageId,
    conversationId: input.conversationId,
    rating: input.rating,
    comment: input.comment,
    createdAt: existing?.createdAt || timestamp,
  };
  store.feedback.set(feedback.id, feedback);
  return feedback;
}

// ---------------------------------------------------------------------------
// Scheduled runs
// ---------------------------------------------------------------------------

function mapScheduleRow(row: any): ScheduledRun {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    model: row.model,
    provider: row.provider || 'auto',
    cron: row.cron || '0 9 * * *',
    enabled: row.enabled !== false,
    lastRunAt: row.last_run_at ?? null,
    lastResult: row.last_result ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

export async function listSchedules(userId?: string): Promise<ScheduledRun[]> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      let query = supabase.from('scheduled_runs').select('*');
      if (userId) query = query.eq('user_id', userId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data) return data.map(mapScheduleRow);
    } catch {
      // Fallback
    }
  }

  return Array.from(store.schedules.values());
}

export async function createSchedule(input: {
  name: string;
  prompt: string;
  model: string;
  provider?: string;
  cron: string;
  userId?: string;
}): Promise<ScheduledRun> {
  const timestamp = nowIso();
  const schedule: ScheduledRun = {
    id: `${input.userId || 'local'}:${randomToken().slice(0, 12)}`,
    name: input.name.trim(),
    prompt: input.prompt,
    model: input.model,
    provider: input.provider || 'auto',
    cron: input.cron,
    enabled: true,
    lastRunAt: null,
    lastResult: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scheduled_runs')
        .insert({
          name: schedule.name,
          prompt: schedule.prompt,
          model: schedule.model,
          provider: schedule.provider,
          cron: schedule.cron,
          enabled: true,
          user_id: input.userId || null,
        })
        .select()
        .single();
      if (!error && data) return mapScheduleRow(data);
    } catch {
      // Fallback
    }
  }

  store.schedules.set(schedule.id, schedule);
  return schedule;
}

export async function updateSchedule(
  id: string,
  updates: Partial<Omit<ScheduledRun, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<ScheduledRun | null> {
  const timestamp = nowIso();

  const supabase = getAdminClient();
  if (supabase) {
    try {
      const dbUpdates: any = { updated_at: timestamp };
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.prompt !== undefined) dbUpdates.prompt = updates.prompt;
      if (updates.model !== undefined) dbUpdates.model = updates.model;
      if (updates.provider !== undefined) dbUpdates.provider = updates.provider;
      if (updates.cron !== undefined) dbUpdates.cron = updates.cron;
      if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
      if (updates.lastRunAt !== undefined) dbUpdates.last_run_at = updates.lastRunAt;
      if (updates.lastResult !== undefined) dbUpdates.last_result = updates.lastResult;

      const { data, error } = await supabase
        .from('scheduled_runs')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) return mapScheduleRow(data);
    } catch {
      // Fallback
    }
  }

  const existing = store.schedules.get(id);
  if (!existing) return null;
  const updated: ScheduledRun = { ...existing, ...updates, updatedAt: timestamp };
  store.schedules.set(id, updated);
  return updated;
}

export async function deleteSchedule(id: string): Promise<boolean> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('scheduled_runs').delete().eq('id', id);
      if (!error) return true;
    } catch {
      // Fallback
    }
  }
  return store.schedules.delete(id);
}

// ---------------------------------------------------------------------------
// Daily usage history (chart)
// ---------------------------------------------------------------------------

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Returns one point per day for the last `days` days (oldest first).
 */
export async function getDailyUsage(
  userId: string,
  days = 7
): Promise<DailyUsagePoint[]> {
  const span = Math.max(1, Math.min(90, days));
  const points: DailyUsagePoint[] = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - i);
    points.push({ date: isoDate(date), requests: 0, tokens: 0 });
  }

  const supabase = getAdminClient();
  if (supabase) {
    try {
      const from = points[0].date;
      const { data, error } = await supabase
        .from('usage_logs')
        .select('date, request_count, tokens_used')
        .eq('user_id', userId)
        .gte('date', from)
        .order('date', { ascending: true });
      if (!error && data) {
        const byDate = new Map(points.map((p) => [p.date, p]));
        for (const row of data) {
          const key = typeof row.date === 'string' ? row.date.slice(0, 10) : isoDate(new Date(row.date));
          const point = byDate.get(key);
          if (point) {
            point.requests = row.request_count ?? 0;
            point.tokens = row.tokens_used ?? 0;
          }
        }
        return points;
      }
    } catch {
      // Fallback
    }
  }

  const history = store.dailyUsage.get(userId);
  if (history) {
    const byDate = new Map(points.map((p) => [p.date, p]));
    for (const entry of history) {
      const point = byDate.get(entry.date);
      if (point) {
        point.requests = entry.requests;
        point.tokens = entry.tokens;
      }
    }
  }
  return points;
}

/**
 * Records a usage point for the in-memory fallback so the chart is not empty
 * during local development.
 */
export function recordDailyUsage(userId: string, requests: number, tokens: number): void {
  const date = isoDate(new Date());
  const history = store.dailyUsage.get(userId) || [];
  const point = history.find((p) => p.date === date);
  if (point) {
    point.requests += requests;
    point.tokens += tokens;
  } else {
    history.push({ date, requests, tokens });
  }
  store.dailyUsage.set(userId, history);
}
