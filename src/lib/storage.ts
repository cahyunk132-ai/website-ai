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

export async function saveProviderApiKey(provider: ProviderId, rawKey: string): Promise<void> {
  const encrypted = encryptSecret(rawKey);
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
      return;
    } catch {
      // Fallback
    }
  }

  memoryProviderKeys.set(provider, encrypted);
}

export async function getProviderApiKey(provider: ProviderId): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('provider_settings')
        .select('encrypted_api_key')
        .eq('provider', provider)
        .single();

      if (data?.encrypted_api_key) {
        return decryptSecret(data.encrypted_api_key);
      }
    } catch {
      // Fallback
    }
  }

  const memKey = memoryProviderKeys.get(provider);
  if (memKey) {
    return decryptSecret(memKey);
  }

  return null;
}
