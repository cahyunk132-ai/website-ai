/**
 * Hyunk AI Hub - Daily Usage API
 * Returns the request/token counters of the last N days for the usage chart.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDailyUsage } from '@/lib/featureStorage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const daysParam = Number(req.nextUrl.searchParams.get('days'));
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.floor(daysParam) : 7;

    const points = await getDailyUsage(user.id, days);
    return NextResponse.json({ points });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load the daily usage';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
