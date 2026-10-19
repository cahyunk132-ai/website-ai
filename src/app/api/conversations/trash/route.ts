/**
 * Hyunk AI Hub - Trash API
 * Lists the conversations that were moved to the trash and restores them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { listTrashedConversations, restoreConversation } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const conversations = await listTrashedConversations(user.id);
    return NextResponse.json({ conversations });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list the trash';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const body = await req.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ error: 'An id is required' }, { status: 400 });
    }

    const restored = await restoreConversation(id);
    if (!restored) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, restoredId: id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to restore the conversation';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
