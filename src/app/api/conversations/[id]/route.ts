/**
 * Hyunk AI Hub - Individual Conversation API (Get messages, Delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getConversationMessages,
  deleteConversation,
  trashConversation,
  updateConversation,
  ConversationSummary,
} from '@/lib/storage';
import { getSessionFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const messages = await getConversationMessages(id);
    return NextResponse.json({ messages });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve messages';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const { id } = params;
    const json = await req.json();

    // Only forward the fields that were actually sent, otherwise a partial
    // update would erase the remaining values.
    const updates: Partial<ConversationSummary> = {};
    if (typeof json.title === 'string') updates.title = json.title;
    if (json.folderId !== undefined) updates.folderId = json.folderId;
    if (typeof json.systemPrompt === 'string') updates.systemPrompt = json.systemPrompt;
    if (typeof json.temperature === 'number') updates.temperature = json.temperature;
    if (Array.isArray(json.tags)) {
      updates.tags = json.tags
        .filter((tag: unknown): tag is string => typeof tag === 'string')
        .map((tag: string) => tag.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 12);
    }

    const updated = await updateConversation(id, updates);
    return NextResponse.json({ conversation: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update conversation';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    // A normal delete moves the conversation to the trash so it can be
    // restored. `?permanent=true` removes it for good.
    const permanent = req.nextUrl.searchParams.get('permanent') === 'true';

    if (permanent) {
      await deleteConversation(id);
      return NextResponse.json({ success: true, deletedId: id, permanent: true });
    }

    const trashed = await trashConversation(id);
    if (!trashed) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, deletedId: id, trashed: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete conversation';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

