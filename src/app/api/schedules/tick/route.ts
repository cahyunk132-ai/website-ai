/**
 * Hyunk AI Hub - Schedule Tick API
 *
 * Executes the schedules that are due. The client calls this endpoint
 * periodically while the app is open, which is what replaces a background
 * worker on a serverless platform.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { runDueSchedules } from '@/lib/scheduleRunner';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const results = await runDueSchedules(user.id);
    return NextResponse.json({ results, executed: results.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to run the schedules';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
