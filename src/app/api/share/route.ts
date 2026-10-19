/**
 * Hyunk AI Hub - Public Share API (owner side)
 * Creates and revokes the public link of a conversation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/auth';
import { createShare, revokeShare, getShareByConversation } from '@/lib/featureStorage';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  conversationId: z.string().min(1),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const conversationId = req.nextUrl.searchParams.get('conversationId');
    if (!conversationId) {
      return NextResponse.json({ error: 'A conversationId is required' }, { status: 400 });
    }

    const share = await getShareByConversation(conversationId);
    return NextResponse.json({ share });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load share';
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
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    // Only one active link per conversation.
    await revokeShare(parsed.data.conversationId);

    const share = await createShare(parsed.data.conversationId, {
      userId: user.id,
      expiresAt: parsed.data.expiresAt ?? null,
    });

    return NextResponse.json({ share }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create share';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const conversationId = req.nextUrl.searchParams.get('conversationId');
    if (!conversationId) {
      return NextResponse.json({ error: 'A conversationId is required' }, { status: 400 });
    }

    const ok = await revokeShare(conversationId);
    return NextResponse.json({ success: ok });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to revoke share';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
