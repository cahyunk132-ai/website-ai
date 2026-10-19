/**
 * Hyunk AI Hub - Prompt Library API
 * Stores the reusable prompt templates of the user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/auth';
import { listPrompts, createPrompt, deletePrompt } from '@/lib/featureStorage';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(20000),
  category: z.string().max(40).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const prompts = await listPrompts(user.id);
    return NextResponse.json({ prompts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list prompts';
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

    const prompt = await createPrompt(parsed.data.title, parsed.data.content, {
      userId: user.id,
      category: parsed.data.category,
    });

    return NextResponse.json({ prompt }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create prompt';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'An id is required' }, { status: 400 });
    }

    const ok = await deletePrompt(id);
    if (!ok) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete prompt';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
