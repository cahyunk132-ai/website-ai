import { NextRequest, NextResponse } from 'next/server';
import { searchConversations } from '@/lib/storage';
import { getSessionFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const results = await searchConversations(query, user?.id);
    return NextResponse.json({ results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Search failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
