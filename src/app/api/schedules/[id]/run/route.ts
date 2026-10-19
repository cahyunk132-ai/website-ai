/**
 * Hyunk AI Hub - Schedule Run API
 * Runs a single schedule immediately ("Run now" button).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { listSchedules } from '@/lib/featureStorage';
import { executeSchedule } from '@/lib/scheduleRunner';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: 'An id is required' }, { status: 400 });
    }

    const schedules = await listSchedules(user.id);
    const schedule = schedules.find((item) => item.id === id);
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    const result = await executeSchedule(schedule, user.id);
    return NextResponse.json({ result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to run the schedule';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
