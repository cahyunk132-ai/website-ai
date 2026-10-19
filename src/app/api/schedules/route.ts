/**
 * Hyunk AI Hub - Scheduled Runs API
 * Lists, creates, updates and deletes the cron driven background prompts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/auth';
import { listSchedules, createSchedule, updateSchedule, deleteSchedule } from '@/lib/featureStorage';
import { nextRunAt } from '@/lib/scheduleRunner';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  prompt: z.string().min(1).max(20000),
  model: z.string().min(1).max(80),
  provider: z.string().max(40).optional(),
  cron: z.string().min(5).max(80),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  prompt: z.string().min(1).max(20000).optional(),
  model: z.string().min(1).max(80).optional(),
  provider: z.string().max(40).optional(),
  cron: z.string().min(5).max(80).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const schedules = await listSchedules(user.id);
    const withNext = schedules.map((schedule) => ({
      ...schedule,
      nextRunAt: nextRunAt(schedule),
    }));

    return NextResponse.json({ schedules: withNext });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list schedules';
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

    const schedule = await createSchedule({
      name: parsed.data.name,
      prompt: parsed.data.prompt,
      model: parsed.data.model,
      provider: parsed.data.provider || 'auto',
      cron: parsed.data.cron,
      userId: user.id,
    });

    return NextResponse.json(
      { schedule: { ...schedule, nextRunAt: nextRunAt(schedule) } },
      { status: 201 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create schedule';
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
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;
    const schedule = await updateSchedule(id, updates);
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    return NextResponse.json({ schedule: { ...schedule, nextRunAt: nextRunAt(schedule) } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update schedule';
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

    const ok = await deleteSchedule(id);
    if (!ok) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete schedule';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
