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
}

// In-memory fallback stores for local development without database configured
const memoryConversations: Map<string, ConversationSummary> = new Map();
const memoryMessages: Map<string, ChatMessage[]> = new Map();
const memoryProviderKeys: Map<ProviderId, string> = new Map();
const memoryProviderKeyList: Map<ProviderId, string[]> = new Map();

export async function listConversations(): Promise<ConversationSummary[]> {
  const supabase = createServerSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        return data.map((c) => ({
          id: c.id,
          title: c.title,
          selectedModel: c.selected_model,
          selectedProvider: c.selected_provider,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        }));
      }
    } catch {
      // Fallback to memory
    }
  }

  return Array.from(memoryConversations.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function createConversation(
  title: string,
  model: string,
  provider: string
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
