import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from './auth';
import { getEffectiveRole } from './roles';

/** Resolve the current server-side role, not just the role in a signed old session. */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const user = await getSessionFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
  if (await getEffectiveRole(user.id, user.email) !== 'admin') {
    return NextResponse.json({ error: 'Hanya Administrator yang dapat mengelola endpoint dan API key.' }, { status: 403 });
  }
  const origin = req.headers.get('origin');
  if (req.method !== 'GET' && origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: 'Origin permintaan tidak diizinkan.' }, { status: 403 });
  }
  return null;
}
