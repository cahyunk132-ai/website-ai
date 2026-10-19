/**
 * Hyunk AI Hub - Message Feedback API
 * Stores the thumbs up / thumbs down of an assistant answer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/auth';
import { saveFeedback, listFeedback } from '@/lib/featureStorage';

export const dynamic = 'force-dynamic';

const feedbackSchema = z.object({
  messageId: z.string().min(1),
  conversationId: z.string().min(1),
  rating: z.enum(['up', 'down']),
  comment: z.string().max(2000).optional(),
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

    const feedback = await listFeedback(conversationId);
    return NextResponse.json({ feedback });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list feedback';
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
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const feedback = await saveFeedback({
      messageId: parsed.data.messageId,
      conversationId: parsed.data.conversationId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
      userId: user.id,
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save feedback';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
