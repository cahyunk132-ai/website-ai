import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getUserPlan, isPremiumPlan } from '@/lib/plans';
import { getEffectiveRole } from '@/lib/roles';
import { getTierConfig, getTierForRole } from '@/lib/ai/tiers';

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);

    if (!session) {
      return NextResponse.json({
        user: null,
        authenticated: false,
      });
    }

    // The plan and the role are resolved on every request, an upgrade is
    // therefore visible immediately and never needs a new login.
    const plan = await getUserPlan(session.id);
    const role = await getEffectiveRole(session.id, session.email);
    const tierConfig = getTierConfig(role);
    const user = {
      ...session,
      role,
      tier: getTierForRole(role),
      tierLabel: tierConfig.name,
      tierBadge: tierConfig.badge,
      plan,
      premium: isPremiumPlan(plan) || role !== 'free',
    };

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
