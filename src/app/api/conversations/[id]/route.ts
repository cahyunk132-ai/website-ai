/**
 * Hyunk AI Hub - Individual Conversation API (Get messages, Delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConversationMessages, deleteConversation, updateConversation } from '@/lib/storage';

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
    const { id } = params;
    const json = await req.json();
    const updated = await updateConversation(id, {
      title: json.title,
      folderId: json.folderId,
      systemPrompt: json.systemPrompt,
      temperature: json.temperature,
    });
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

