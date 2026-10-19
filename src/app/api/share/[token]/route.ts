/**
 * Hyunk AI Hub - Public Share API (visitor side)
 * Reads a shared conversation with its token. This endpoint is public on
 * purpose: the visitor is not logged in, the token is the credential.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSharedConversation } from '@/lib/featureStorage';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = (params?.token || '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Invalid share token' }, { status: 400 });
    }

    const shared = await getSharedConversation(token);
    if (!shared) {
      return NextResponse.json({ error: 'Share tidak ditemukan atau sudah dinonaktifkan.' }, { status: 404 });
    }

    return NextResponse.json({ shared });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load the shared conversation';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
