/**
 * Hyunk AI Hub - AI Memory API
 * Lists, creates and removes the facts the assistant remembers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/auth';
import { listMemories, createMemory, deleteMemory, setMemoryEnabled } from '@/lib/featureStorage';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  content: z.string().min(2).max(500),
  category: z.string().max(40).optional(),
  source: z.enum(['manual', 'auto', 'command']).optional(),
});

const toggleSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const memories = await listMemories(user.id);
    return NextResponse.json({ memories });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list memories';
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

    const memory = await createMemory(parsed.data.content, {
      userId: user.id,
      category: parsed.data.category,
      source: parsed.data.source || 'manual',
    });

    return NextResponse.json({ memory }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create memory';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = toggleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const ok = await setMemoryEnabled(parsed.data.id, parsed.data.enabled);
    if (!ok) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update memory';
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

    const ok = await deleteMemory(id);
    if (!ok) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete memory';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
