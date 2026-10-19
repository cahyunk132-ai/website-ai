/**
 * Hyunk AI Hub - Conversation and Settings Storage Layer
 * Interacts with Supabase PostgreSQL when available, or provides robust in-memory fallback.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ChatMessage, ProviderId } from './ai/types';
import { createServerSupabaseClient, createServerSupabaseAdminClient } from './supabase/server';
import { resolveDailyLimit } from './plans';
import { encryptSecret, decryptSecret } from './crypto';

export interface ConversationSummary {
  id: string;
  title: string;
  selectedModel: string;
  selectedProvider: string;
  createdAt: string;
  updatedAt: string;
  folderId?: string | null;
  systemPrompt?: string;
  temperature?: number;
  userId?: string | null;
  /** Labels attached to the conversation (used by the tag filter). */
  tags?: string[];
  /** Set when the conversation was moved to the trash. */
  deletedAt?: string | null;
}

export interface FolderItem {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
  userId?: string | null;
}

export interface SearchResult {
  conversation: ConversationSummary;
  matchedIn: 'title' | 'message';
  snippet?: string;
}

export interface UsageStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
  requestCount: number;
  tokensUsed: number;
  date: string;
}

/**
 * Fallback number of AI requests allowed per user per day.
 *
 * The real quota comes from the subscription plan of the account
 * (5 prompts per day for a free account, 10x that for a premium one), see
 * `src/lib/plans.ts`. This constant is only the safety net for the calls
 * that do not know the plan of the user.
 * Can be tuned per deployment with the `DAILY_REQUEST_LIMIT` environment variable.
 */
export const DAILY_REQUEST_LIMIT = (() => {
  const configured = Number(process.env.DAILY_REQUEST_LIMIT);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 200;
})();

/** Default folders provisioned for every new user. */
const DEFAULT_FOLDER_TEMPLATES: Array<{ id: string; name: string; color: string }> = [
  { id: 'folder-work', name: 'Work & Projects', color: '#06b6d4' },
  { id: 'folder-research', name: 'Research & Ideas', color: '#8b5cf6' },
  { id: 'folder-coding', name: 'Coding & Dev', color: '#10b981' },
];

// In-memory fallback stores for local development without database configured.
// They are kept on `globalThis` because every route handler is bundled
// separately by Next.js: module level maps would otherwise be isolated per
// route and a conversation created in one route would be invisible in another.
const MEMORY_STORE_KEY = Symbol.for('hyunk-ai-hub.memory-store');

interface MemoryStore {
  conversations: Map<string, ConversationSummary>;
  messages: Map<string, ChatMessage[]>;
  folders: Map<string, FolderItem>;
  providerKeys: Map<ProviderId, string>;
  providerKeyList: Map<ProviderId, string[]>;
  usage: Map<string, { date: string; requestCount: number; tokensUsed: number }>;
}

function createMemoryStore(): MemoryStore {
  return {
    conversations: new Map(),
    messages: new Map(),
    folders: new Map(
      DEFAULT_FOLDER_TEMPLATES.map((template) => [
        template.id,
        {
          id: template.id,
          name: template.name,
          color: template.color,
          createdAt: new Date().toISOString(),
        },
      ])
    ),
    providerKeys: new Map(),
    providerKeyList: new Map(),
    usage: new Map(),
  };
}

const globalScope = globalThis as unknown as Record<symbol, MemoryStore | undefined>;
if (!globalScope[MEMORY_STORE_KEY]) {
  globalScope[MEMORY_STORE_KEY] = createMemoryStore();
}

const memoryStore = globalScope[MEMORY_STORE_KEY] as MemoryStore;

const memoryConversations = memoryStore.conversations;
const memoryMessages = memoryStore.messages;
const memoryFolders = memoryStore.folders;
const memoryProviderKeys = memoryStore.providerKeys;
const memoryProviderKeyList = memoryStore.providerKeyList;
const memoryUsage = memoryStore.usage;

/**
 * Returns a Supabase client for privileged server side operations.
 * Uses the service role when available (required for tables that are restricted
 * to the service role by RLS, e.g. provider_settings).
 */
function getAdminClient(): SupabaseClient | null {
  return (createServerSupabaseAdminClient() as SupabaseClient | null) ?? null;
}

function getUserClient(): SupabaseClient | null {
  return (createServerSupabaseClient() as SupabaseClient | null) ?? null;
}

/**
 * Escapes LIKE/ILIKE wildcards so user input is matched literally.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Maps a raw `conversations` row to the public summary shape.
 */
function mapConversationRow(row: any): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    selectedModel: row.selected_model,
    selectedProvider: row.selected_provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id ?? null,
    folderId: row.folder_id ?? null,
    systemPrompt: row.system_prompt ?? undefined,
    temperature: row.temperature ?? undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    deletedAt: row.deleted_at ?? null,
  };
}

/**
 * Maps a raw `conversation_folders` row to the public folder shape.
 */
function mapFolderRow(row: any): FolderItem {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    createdAt: row.created_at,
    userId: row.user_id ?? null,
  };
}

export async function listConversations(userId?: string): Promise<ConversationSummary[]> {
  const supabase = getUserClient();
  if (supabase) {
    try {
      let query = supabase.from('conversations').select('*').is('deleted_at', null);
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { data, error } = await query.order('updated_at', { ascending: false });

      if (!error && data) {
        return data.map(mapConversationRow);
      }
    } catch {
      // Fallback to memory
    }
  }

  return Array.from(memoryConversations.values())
    .filter((c) => !c.deletedAt)
    .filter((c) => !userId || c.userId === userId || !c.userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Lists the conversations that were moved to the trash.
 */
export async function listTrashedConversations(userId?: string): Promise<ConversationSummary[]> {
  const supabase = getUserClient();
  if (supabase) {
    try {
      let query = supabase.from('conversations').select('*').not('deleted_at', 'is', null);
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { data, error } = await query.order('deleted_at', { ascending: false });

      if (!error && data) {
        return data.map(mapConversationRow);
      }
    } catch {
      // Fallback to memory
    }
  }

  return Array.from(memoryConversations.values())
    .filter((c) => Boolean(c.deletedAt))
    .filter((c) => !userId || c.userId === userId || !c.userId)
    .sort((a, b) => new Date(b.deletedAt || b.updatedAt).getTime() - new Date(a.deletedAt || a.updatedAt).getTime());
}

/**
 * Moves a conversation to the trash. The conversation stays recoverable until
 * it is purged explicitly.
 */
export async function trashConversation(conversationId: string): Promise<boolean> {
  const deletedAt = new Date().toISOString();

  const supabase = getUserClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ deleted_at: deletedAt, updated_at: deletedAt })
        .eq('id', conversationId);
      if (!error) return true;
    } catch {
      // Fallback
    }
  }

  const existing = memoryConversations.get(conversationId);
  if (!existing) return false;
  memoryConversations.set(conversationId, { ...existing, deletedAt });
  return true;
}

/**
 * Brings a conversation back from the trash.
 */
export async function restoreConversation(conversationId: string): Promise<boolean> {
  const supabase = getUserClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      if (!error) return true;
    } catch {
      // Fallback
    }
  }

  const existing = memoryConversations.get(conversationId);
  if (!existing) return false;
  memoryConversations.set(conversationId, { ...existing, deletedAt: null });
  return true;
}

/**
 * Removes a conversation for good (used by the "empty trash" action).
 */
export async function purgeConversation(conversationId: string): Promise<boolean> {
  const supabase = getUserClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);
      if (!error) {
        memoryConversations.delete(conversationId);
        memoryMessages.delete(conversationId);
        return true;
      }
    } catch {
      // Fallback
    }
  }

  memoryConversations.delete(conversationId);
  memoryMessages.delete(conversationId);
  return true;
}

export async function createConversation(
  title: string,
  model: string,
  provider: string,
  userId?: string
): Promise<ConversationSummary> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const conversation: ConversationSummary = {
    id,
    title,
    selectedModel: model,
    selectedProvider: provider,
    createdAt: now,
    updatedAt: now,
    userId: userId || null,
    folderId: null,
    systemPrompt: undefined,
    temperature: undefined,
    tags: [],
    deletedAt: null,
  };

  const supabase = getUserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          id,
          title,
          selected_model: model,
          selected_provider: provider,
          user_id: userId || null,
        })
        .select()
        .single();

      if (!error && data) {
        return mapConversationRow(data);
      }
    } catch {
      // Fallback
    }
  }

  memoryConversations.set(id, conversation);
  memoryMessages.set(id, []);
  return conversation;
}

export async function getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const supabase = getUserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        return data.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          model: m.model,
          provider: m.provider,
          isFallback: m.is_fallback,
          fallbackReason: m.fallback_reason,
          tokensPrompt: m.tokens_prompt ?? undefined,
          tokensCompletion: m.tokens_completion ?? undefined,
          createdAt: m.created_at,
        }));
      }
    } catch {
      // Fallback
    }
  }

  return memoryMessages.get(conversationId) || [];
}

/**
 * Resolves the owner of a conversation (used for per-user usage accounting).
 */
async function getConversationOwnerId(conversationId: string): Promise<string | null> {
  const supabase = getUserClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('user_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (error || !data) return null;
    return data.user_id ?? null;
  } catch {
    return null;
  }
}

export async function saveMessage(
  conversationId: string,
  message: ChatMessage,
  userId?: string
): Promise<void> {
  const supabase = getUserClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('messages').insert({
        id: message.id,
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
        model: message.model,
        provider: message.provider,
        is_fallback: message.isFallback ?? false,
        fallback_reason: message.fallbackReason,
        tokens_prompt: message.tokensPrompt ?? 0,
        tokens_completion: message.tokensCompletion ?? 0,
      });

      if (!error) {
        await supabase
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId);

        // Token accounting: keep the daily usage log in sync with the stored messages.
        const tokensUsed = (message.tokensPrompt ?? 0) + (message.tokensCompletion ?? 0);
        if (tokensUsed > 0) {
          const ownerId = userId || (await getConversationOwnerId(conversationId));
          if (ownerId) {
            await addTokensToUsage(ownerId, tokensUsed);
          }
        }
        return;
      }
    } catch {
      // Fallback
    }
  }

  const existing = memoryMessages.get(conversationId) || [];
  existing.push(message);
  memoryMessages.set(conversationId, existing);

  const conv = memoryConversations.get(conversationId);
  if (conv) {
    conv.updatedAt = new Date().toISOString();
  }
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const supabase = getUserClient();
  if (supabase) {
    try {
      await supabase.from('conversations').delete().eq('id', conversationId);
      return;
    } catch {
      // Fallback
    }
  }

  memoryConversations.delete(conversationId);
  memoryMessages.delete(conversationId);
}

export async function updateConversation(
  conversationId: string,
  updates: Partial<ConversationSummary>
): Promise<ConversationSummary | null> {
  const supabase = getUserClient();
  if (supabase) {
    try {
      const dbUpdates: any = { updated_at: new Date().toISOString() };
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.folderId !== undefined) dbUpdates.folder_id = updates.folderId;
      if (updates.systemPrompt !== undefined) dbUpdates.system_prompt = updates.systemPrompt;
      if (updates.temperature !== undefined) dbUpdates.temperature = updates.temperature;
      if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
      if (updates.deletedAt !== undefined) dbUpdates.deleted_at = updates.deletedAt;

      const { data, error } = await supabase
        .from('conversations')
        .update(dbUpdates)
        .eq('id', conversationId)
        .select()
        .single();

      if (!error && data) {
        return mapConversationRow(data);
      }
    } catch {
      // Fallback
    }
  }

  const existing = memoryConversations.get(conversationId);
  if (!existing) return null;

  // Only apply the fields that were actually provided (an explicit `undefined`
  // must never wipe an existing value).
  const applied: Partial<ConversationSummary> = {};
  (Object.keys(updates) as Array<keyof ConversationSummary>).forEach((key) => {
    const value = updates[key];
    if (value !== undefined) {
      (applied as any)[key] = value;
    }
  });

  const updated: ConversationSummary = {
    ...existing,
    ...applied,
    updatedAt: new Date().toISOString(),
  };
  memoryConversations.set(conversationId, updated);
  return updated;
}

/**
 * Searches conversations by title and message content.
 *
 * When Supabase is available the search is executed in the database (title match +
 * message content match through an inner join on the owning user) instead of
 * loading every conversation and its messages into memory.
 */
export async function searchConversations(
  query: string,
  userId?: string
): Promise<SearchResult[]> {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const supabase = getUserClient();
  if (supabase && userId) {
    try {
      const like = `%${escapeLikePattern(query.trim())}%`;

      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .ilike('title', like)
        .order('updated_at', { ascending: false })
        .limit(20);

      const results: SearchResult[] = [];
      const seen = new Set<string>();

      if (!convError && convData) {
        for (const row of convData) {
          const conversation = mapConversationRow(row);
          seen.add(conversation.id);
          results.push({ conversation, matchedIn: 'title' });
        }
      }

      // Search inside message content, scoped to the user's own conversations.
      const { data: msgData, error: msgError } = await supabase
        .from('messages')
        .select('id, content, conversation_id, conversations!inner(*)')
        .eq('conversations.user_id', userId)
        .ilike('content', like)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!msgError && msgData) {
        for (const row of msgData) {
          const rawConversation = Array.isArray(row.conversations)
            ? row.conversations[0]
            : row.conversations;
          if (!rawConversation) continue;

          const conversation = mapConversationRow(rawConversation);
          if (seen.has(conversation.id)) continue;
          seen.add(conversation.id);

          const content: string = row.content || '';
          const idx = content.toLowerCase().indexOf(q);
          const start = Math.max(0, idx - 30);
          const end = Math.min(content.length, idx + q.length + 40);
          const snippet =
            idx >= 0
              ? '...' + content.slice(start, end).replace(/\n/g, ' ') + '...'
              : content.slice(0, 120).replace(/\n/g, ' ');

          results.push({ conversation, matchedIn: 'message', snippet });
        }
      }

      if (results.length > 0 || !convError) {
        return results;
      }
    } catch {
      // Fallback to in-memory search
    }
  }

  // Fallback: in-memory search across every known conversation.
  const conversations = await listConversations(userId);
  const results: SearchResult[] = [];

  for (const conv of conversations) {
    if (conv.title.toLowerCase().includes(q)) {
      results.push({ conversation: conv, matchedIn: 'title' });
      continue;
    }

    const messages = await getConversationMessages(conv.id);
    const matchedMsg = messages.find((m) => m.content.toLowerCase().includes(q));
    if (matchedMsg) {
      const idx = matchedMsg.content.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 30);
      const end = Math.min(matchedMsg.content.length, idx + q.length + 40);
      const snippet = '...' + matchedMsg.content.slice(start, end).replace(/\n/g, ' ') + '...';
      results.push({ conversation: conv, matchedIn: 'message', snippet });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Folder Management API
// ---------------------------------------------------------------------------

export async function listFolders(userId?: string): Promise<FolderItem[]> {
  const supabase = getAdminClient();
  if (supabase && userId) {
    try {
      const { data, error } = await supabase
        .from('conversation_folders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        if (data.length > 0) {
          return data.map(mapFolderRow);
        }

        // First time this user opens the app: provision the default folders.
        const seeded = await seedDefaultFolders(supabase, userId);
        if (seeded.length > 0) return seeded;
      }
    } catch {
      // Fallback to memory
    }
  }

  return Array.from(memoryFolders.values()).filter(
    (f) => !userId || !f.userId || f.userId === userId
  );
}

/**
 * Creates the default folder set for a user (idempotent enough: it is only called
 * when the user has no folders at all).
 */
async function seedDefaultFolders(
  supabase: SupabaseClient,
  userId: string
): Promise<FolderItem[]> {
  try {
    const rows = DEFAULT_FOLDER_TEMPLATES.map((template) => ({
      name: template.name,
      color: template.color,
      user_id: userId,
    }));

    const { data, error } = await supabase
      .from('conversation_folders')
      .insert(rows)
      .select();

    if (error || !data) {
      if (error) console.warn('[Storage] Failed to seed default folders:', error.message);
      return [];
    }
    return data.map(mapFolderRow);
  } catch {
    return [];
  }
}

export async function createFolder(
  name: string,
  color?: string,
  userId?: string
): Promise<FolderItem> {
  const trimmedName = (name || '').trim();
  if (!trimmedName) {
    throw new Error('Nama folder tidak boleh kosong.');
  }
  const folderColor = color || '#38bdf8';

  const supabase = getAdminClient();
  if (supabase && userId) {
    try {
      const { data, error } = await supabase
        .from('conversation_folders')
        .insert({
          name: trimmedName,
          color: folderColor,
          user_id: userId,
        })
        .select()
        .single();

      if (!error && data) {
        return mapFolderRow(data);
      }
    } catch (err: any) {
      console.warn('[Storage] createFolder fallback triggered:', err?.message || String(err));
    }
  }

  // Fallback to memory
  const id = `folder-${Date.now()}`;
  const folder: FolderItem = {
    id,
    name: trimmedName,
    color: folderColor,
    createdAt: new Date().toISOString(),
    userId: userId || null,
  };
  memoryFolders.set(id, folder);
  return folder;
}

export async function deleteFolder(folderId: string): Promise<boolean> {
  const supabase = getAdminClient();
  if (supabase) {
    try {
      // Detach conversations from the folder before removing it.
      await supabase
        .from('conversations')
        .update({ folder_id: null })
        .eq('folder_id', folderId);

      const { error } = await supabase
        .from('conversation_folders')
        .delete()
        .eq('id', folderId);

      if (!error) return true;
    } catch {
      // Fallback to memory
    }
  }

  // Reset conversations inside this folder to null
  Array.from(memoryConversations.entries()).forEach(([id, conv]) => {
    if (conv.folderId === folderId) {
      conv.folderId = null;
      memoryConversations.set(id, conv);
    }
  });
  return memoryFolders.delete(folderId);
}

// ---------------------------------------------------------------------------
// Usage Quota / Rate Limiting
// ---------------------------------------------------------------------------

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Checks the daily quota of a user and atomically accounts for the new request.
 *
 * Prefers the `increment_daily_usage` RPC (race free). When the migration has not
 * been applied yet, it falls back to a read + upsert cycle.
 */
export async function checkAndIncrementUsage(
  userId: string,
  limit?: number
): Promise<UsageStatus> {
  // Without an explicit limit the quota of the subscription plan applies.
  const effectiveLimit = limit ?? (await resolveDailyLimit(userId));
  const date = todayUtc();
  const supabase = getAdminClient();

  if (!supabase) {
    // No database configured: keep the quota in the process-wide memory store so
    // the limit is still enforced during local development.
    const current = memoryUsage.get(userId);
    const requestCount = current && current.date === date ? current.requestCount : 0;
    const tokensUsed = current && current.date === date ? current.tokensUsed : 0;

    if (requestCount >= effectiveLimit) {
      return { allowed: false, remaining: 0, limit: effectiveLimit, requestCount, tokensUsed, date };
    }

    memoryUsage.set(userId, {
      date,
      requestCount: requestCount + 1,
      tokensUsed,
    });

    return {
      allowed: true,
      remaining: Math.max(0, effectiveLimit - requestCount - 1),
      limit: effectiveLimit,
      requestCount: requestCount + 1,
      tokensUsed,
      date,
    };
  }

  try {
    const { data, error } = await supabase.rpc('increment_daily_usage', {
      p_user_id: userId,
      p_date: date,
    });

    if (!error && typeof data === 'number') {
      const requestCount = data;
      return {
        allowed: requestCount <= effectiveLimit,
        remaining: Math.max(0, effectiveLimit - requestCount),
        limit: effectiveLimit,
        requestCount,
        tokensUsed: 0,
        date,
      };
    }
  } catch {
    // Fall through to the non-RPC implementation
  }

  try {
    const { data, error } = await supabase
      .from('usage_logs')
      .select('request_count, tokens_used')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    if (error) {
      console.warn('[Storage] Usage lookup failed, allowing request:', error.message);
      return { allowed: true, remaining: effectiveLimit, limit: effectiveLimit, requestCount: 0, tokensUsed: 0, date };
    }

    const requestCount = data?.request_count ?? 0;
    const tokensUsed = data?.tokens_used ?? 0;

    if (requestCount >= effectiveLimit) {
      return { allowed: false, remaining: 0, limit: effectiveLimit, requestCount, tokensUsed, date };
    }

    const { error: upsertError } = await supabase
      .from('usage_logs')
      .upsert(
        {
          user_id: userId,
          date,
          request_count: requestCount + 1,
          tokens_used: tokensUsed,
        },
        { onConflict: 'user_id,date' }
      );

    if (upsertError) {
      console.warn('[Storage] Usage increment failed:', upsertError.message);
    }

    return {
      allowed: true,
      remaining: Math.max(0, effectiveLimit - requestCount - 1),
      limit: effectiveLimit,
      requestCount: requestCount + 1,
      tokensUsed,
      date,
    };
  } catch (err: any) {
    console.warn('[Storage] Usage accounting failed, allowing request:', err?.message || String(err));
    return { allowed: true, remaining: effectiveLimit, limit: effectiveLimit, requestCount: 0, tokensUsed: 0, date };
  }
}

/**
 * Adds consumed tokens to the daily usage log of a user.
 */
export async function addTokensToUsage(userId: string, tokens: number): Promise<void> {
  if (!userId || !tokens || tokens <= 0) return;

  const date = todayUtc();
  const supabase = getAdminClient();
  if (!supabase) {
    // Keep the in-memory counter aligned with the local development mode.
    const current = memoryUsage.get(userId);
    const requestCount = current && current.date === date ? current.requestCount : 0;
    const tokensUsed = current && current.date === date ? current.tokensUsed : 0;
    memoryUsage.set(userId, { date, requestCount, tokensUsed: tokensUsed + tokens });
    return;
  }

  try {
    const { error } = await supabase.rpc('add_usage_tokens', {
      p_user_id: userId,
      p_date: date,
      p_tokens: tokens,
    });
    if (!error) return;
  } catch {
    // Fall through to the non-RPC implementation
  }

  try {
    const { data } = await supabase
      .from('usage_logs')
      .select('request_count, tokens_used')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    await supabase.from('usage_logs').upsert(
      {
        user_id: userId,
        date,
        request_count: data?.request_count ?? 0,
        tokens_used: (data?.tokens_used ?? 0) + tokens,
      },
      { onConflict: 'user_id,date' }
    );
  } catch (err: any) {
    console.warn('[Storage] Token accounting failed:', err?.message || String(err));
  }
}

/**
 * Returns the current usage snapshot of a user for the current day.
 */
export async function getUsageSnapshot(
  userId: string,
  limit: number = DAILY_REQUEST_LIMIT
): Promise<UsageStatus> {
  const date = todayUtc();
  const supabase = getAdminClient();
  if (!supabase) {
    const current = memoryUsage.get(userId);
    const requestCount = current && current.date === date ? current.requestCount : 0;
    const tokensUsed = current && current.date === date ? current.tokensUsed : 0;
    return {
      allowed: requestCount < limit,
      remaining: Math.max(0, limit - requestCount),
      limit,
      requestCount,
      tokensUsed,
      date,
    };
  }

  try {
    const { data, error } = await supabase
      .from('usage_logs')
      .select('request_count, tokens_used')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    if (error) {
      return { allowed: true, remaining: limit, limit, requestCount: 0, tokensUsed: 0, date };
    }

    const requestCount = data?.request_count ?? 0;
    const tokensUsed = data?.tokens_used ?? 0;
    return {
      allowed: requestCount < limit,
      remaining: Math.max(0, limit - requestCount),
      limit,
      requestCount,
      tokensUsed,
      date,
    };
  } catch {
    return { allowed: true, remaining: limit, limit, requestCount: 0, tokensUsed: 0, date };
  }
}

// ---------------------------------------------------------------------------
// Provider API Keys (encrypted at rest)
// ---------------------------------------------------------------------------

export async function getProviderApiKeys(provider: ProviderId): Promise<string[]> {
  // The provider_settings table is restricted to the service role by RLS.
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('provider_settings')
        .select('id, encrypted_api_key')
        .eq('provider', provider);

      if (!error && data && data.length > 0) {
        const decryptedList: string[] = [];
        for (const item of data) {
          if (item.encrypted_api_key) {
            const dec = decryptSecret(item.encrypted_api_key);
            if (dec) decryptedList.push(dec);
          }
        }
        if (decryptedList.length > 0) return decryptedList;
      }
    } catch {
      // Fallback
    }
  }

  const list = memoryProviderKeyList.get(provider) || [];
  if (list.length > 0) {
    return list.map((k) => decryptSecret(k)).filter(Boolean);
  }

  const single = memoryProviderKeys.get(provider);
  if (single) {
    const dec = decryptSecret(single);
    return dec ? [dec] : [];
  }

  return [];
}

/**
 * Adds an API key to the pool of a provider.
 *
 * A provider may hold multiple keys (multi-key pool), therefore a plain INSERT is
 * used instead of an UPSERT on the provider column.
 */
export async function addProviderApiKey(provider: ProviderId, rawKey: string): Promise<void> {
  if (!rawKey) return;

  const encrypted = encryptSecret(rawKey);
  const currentList = memoryProviderKeyList.get(provider) || [];

  const existingDecrypted = currentList.map((k) => decryptSecret(k));
  if (!existingDecrypted.includes(rawKey)) {
    currentList.push(encrypted);
    memoryProviderKeyList.set(provider, currentList);
  }

  memoryProviderKeys.set(provider, encrypted);

  const supabase = getAdminClient();
  if (supabase) {
    try {
      // Avoid storing the very same key twice for a provider.
      const { data: existingRows } = await supabase
        .from('provider_settings')
        .select('id, encrypted_api_key')
        .eq('provider', provider);

      const alreadyStored = (existingRows || []).some(
        (row) => row.encrypted_api_key && decryptSecret(row.encrypted_api_key) === rawKey
      );
      if (alreadyStored) return;

      const { error } = await supabase.from('provider_settings').insert({
        provider,
        encrypted_api_key: encrypted,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.warn('[Storage] Failed to persist provider key:', error.message);
      }
    } catch (err: any) {
      console.warn('[Storage] addProviderApiKey fallback triggered:', err?.message || String(err));
    }
  }
}

export async function removeProviderApiKey(provider: ProviderId, rawKey: string): Promise<boolean> {
  const currentList = memoryProviderKeyList.get(provider) || [];
  const filtered = currentList.filter((k) => decryptSecret(k) !== rawKey);
  memoryProviderKeyList.set(provider, filtered);

  if (filtered.length > 0) {
    memoryProviderKeys.set(provider, filtered[0]);
  } else {
    memoryProviderKeys.delete(provider);
  }

  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data: existingRows } = await supabase
        .from('provider_settings')
        .select('id, encrypted_api_key')
        .eq('provider', provider);

      const target = (existingRows || []).find(
        (row) => row.encrypted_api_key && decryptSecret(row.encrypted_api_key) === rawKey
      );

      if (target) {
        await supabase.from('provider_settings').delete().eq('id', target.id);
      }
    } catch (err: any) {
      console.warn('[Storage] removeProviderApiKey failed:', err?.message || String(err));
    }
  }

  return true;
}

export async function saveProviderApiKey(provider: ProviderId, rawKey: string): Promise<void> {
  await addProviderApiKey(provider, rawKey);
}

export async function getProviderApiKey(provider: ProviderId): Promise<string | null> {
  const keys = await getProviderApiKeys(provider);
  return keys.length > 0 ? keys[0] : null;
}
