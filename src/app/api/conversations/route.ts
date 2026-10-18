/**
 * Hyunk AI Hub - Conversations Management API (User-Scoped & Authenticated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listConversations, createConversation } from '@/lib/storage';
import { getSessionFromRequest } from '@/lib/auth';

const createConvSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  model: z.string().min(1),
  provider: z.string().min(1),
});

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ conversations: [], authenticated: false }, { status: 401 });
    }

    const convs = await listConversations(user.id);
    return NextResponse.json({ conversations: convs, authenticated: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list conversations';
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
    const parsed = createConvSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
    }

    const conv = await createConversation(
      parsed.data.title || 'New Chat',
      parsed.data.model,
      parsed.data.provider,
      user.id
    );

    return NextResponse.json({ conversation: conv }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create conversation';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
