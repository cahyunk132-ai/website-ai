/**
 * Hyunk AI Hub - Conversation and Settings Storage Layer
 * Interacts with Supabase PostgreSQL when available, or provides robust in-memory fallback.
 */

import { ChatMessage, ProviderId } from './ai/types';
import { createServerSupabaseClient } from './supabase/server';
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
}

export interface FolderItem {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
  userId?: string | null;
}

// In-memory fallback stores for local development without database configured
const memoryConversations: Map<string, ConversationSummary> = new Map();
const memoryMessages: Map<string, ChatMessage[]> = new Map();
const memoryFolders: Map<string, FolderItem> = new Map([
  ['folder-work', { id: 'folder-work', name: 'Work & Projects', color: '#06b6d4', createdAt: new Date().toISOString() }],
  ['folder-research', { id: 'folder-research', name: 'Research & Ideas', color: '#8b5cf6', createdAt: new Date().toISOString() }],
  ['folder-coding', { id: 'folder-coding', name: 'Coding & Dev', color: '#10b981', createdAt: new Date().toISOString() }],
]);
const memoryProviderKeys: Map<ProviderId, string> = new Map();
const memoryProviderKeyList: Map<ProviderId, string[]> = new Map();

export async function listConversations(userId?: string): Promise<ConversationSummary[]> {
  const supabase = createServerSupabaseClient();
  if (supabase) {
    try {
      let query = supabase.from('conversations').select('*');
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { data, error } = await query.order('updated_at', { ascending: false });

      if (!error && data) {
        return data.map((c) => ({
          id: c.id,
          title: c.title,
          selectedModel: c.selected_model,
          selectedProvider: c.selected_provider,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          userId: c.user_id,
        }));
      }
    } catch {
      // Fallback to memory
    }
  }

  return Array.from(memoryConversations.values())
    .filter((c) => !userId || c.userId === userId || !c.userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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
  };

  const supabase = createServerSupabaseClient();
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
        return {
          id: data.id,
          title: data.title,
          selectedModel: data.selected_model,
          selectedProvider: data.selected_provider,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          userId: data.user_id,
        };
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
  const supabase = createServerSupabaseClient();
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
          createdAt: m.created_at,
        }));
      }
    } catch {
      // Fallback
    }
  }

  return memoryMessages.get(conversationId) || [];
}

export async function saveMessage(
  conversationId: string,
  message: ChatMessage
): Promise<void> {
  const supabase = createServerSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('messages').insert({
        id: message.id,
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
        model: message.model,
        provider: message.provider,
        is_fallback: message.isFallback ?? false,
        fallback_reason: message.fallbackReason,
      });

      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      return;
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
  const supabase = createServerSupabaseClient();
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
  const supabase = createServerSupabaseClient();
  if (supabase) {
    try {
      const dbUpdates: any = { updated_at: new Date().toISOString() };
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.folderId !== undefined) dbUpdates.folder_id = updates.folderId;
      if (updates.systemPrompt !== undefined) dbUpdates.system_prompt = updates.systemPrompt;
      if (updates.temperature !== undefined) dbUpdates.temperature = updates.temperature;

      const { data, error } = await supabase
        .from('conversations')
        .update(dbUpdates)
        .eq('id', conversationId)
        .select()
        .single();

      if (!error && data) {
        return {
          id: data.id,
          title: data.title,
          selectedModel: data.selected_model,
          selectedProvider: data.selected_provider,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          folderId: data.folder_id,
          systemPrompt: data.system_prompt,
          temperature: data.temperature,
        };
      }
    } catch {
      // Fallback
    }
  }

  const existing = memoryConversations.get(conversationId);
  if (!existing) return null;

  const updated: ConversationSummary = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  memoryConversations.set(conversationId, updated);
  return updated;
}

export async function searchConversations(query: string, userId?: string): Promise<Array<{ conversation: ConversationSummary; matchedIn: 'title' | 'message'; snippet?: string }>> {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const conversations = await listConversations(userId);
  const results: Array<{ conversation: ConversationSummary; matchedIn: 'title' | 'message'; snippet?: string }> = [];

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

// Folder Management API
export async function listFolders(userId?: string): Promise<FolderItem[]> {
  const all = Array.from(memoryFolders.values());
  if (!userId) return all;
  return all.filter((f) => !f.userId || f.userId === userId);
}

export async function createFolder(name: string, color?: string, userId?: string): Promise<FolderItem> {
  const id = `folder-${Date.now()}`;
  const folder: FolderItem = {
    id,
    name: name.trim(),
    color: color || '#38bdf8',
    createdAt: new Date().toISOString(),
    userId: userId || null,
  };
  memoryFolders.set(id, folder);
  return folder;
}

export async function deleteFolder(folderId: string): Promise<boolean> {
  // Reset conversations inside this folder to null
  Array.from(memoryConversations.entries()).forEach(([id, conv]) => {
    if (conv.folderId === folderId) {
      conv.folderId = null;
      memoryConversations.set(id, conv);
    }
  });
  return memoryFolders.delete(folderId);
}


export async function getProviderApiKeys(provider: ProviderId): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('provider_settings')
        .select('encrypted_api_key')
        .eq('provider', provider);

      if (data && data.length > 0) {
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

export async function addProviderApiKey(provider: ProviderId, rawKey: string): Promise<void> {
  const encrypted = encryptSecret(rawKey);
  const currentList = memoryProviderKeyList.get(provider) || [];
  
  const existingDecrypted = currentList.map((k) => decryptSecret(k));
  if (!existingDecrypted.includes(rawKey)) {
    currentList.push(encrypted);
    memoryProviderKeyList.set(provider, currentList);
  }

  memoryProviderKeys.set(provider, encrypted);

  const supabase = createServerSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('provider_settings').upsert(
        {
          provider,
          encrypted_api_key: encrypted,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider' }
      );
    } catch {
      // Fallback
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

  return true;
}

export async function saveProviderApiKey(provider: ProviderId, rawKey: string): Promise<void> {
  await addProviderApiKey(provider, rawKey);
}

export async function getProviderApiKey(provider: ProviderId): Promise<string | null> {
  const keys = await getProviderApiKeys(provider);
  return keys.length > 0 ? keys[0] : null;
}
