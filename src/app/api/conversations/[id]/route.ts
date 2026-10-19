/**
 * Hyunk AI Hub - Individual Conversation API (Get messages, Delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getConversationMessages,
  deleteConversation,
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
    await deleteConversation(id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete conversation';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

