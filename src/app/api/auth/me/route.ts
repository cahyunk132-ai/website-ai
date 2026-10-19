import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getUserPlan, isPremiumPlan } from '@/lib/plans';

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);

    if (!session) {
      return NextResponse.json({
        user: null,
        authenticated: false,
      });
    }

    // The plan is resolved on every request, an upgrade is therefore visible
    // immediately and never needs a new login.
    const plan = await getUserPlan(session.id);
    const user = { ...session, plan, premium: isPremiumPlan(plan) };

    return NextResponse.json({
      user,
      authenticated: true,
    });
  } catch {
    return NextResponse.json({
      user: null,
      authenticated: false,
    });
  }
}
