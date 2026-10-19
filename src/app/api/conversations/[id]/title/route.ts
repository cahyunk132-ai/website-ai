import { NextRequest, NextResponse } from 'next/server';
import { updateConversation } from '@/lib/storage';
import { buildConversationTitle } from '@/lib/conversationTitle';
import { getSessionFromRequest } from '@/lib/auth';

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

    const { id } = params;
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    // Clean up prompt into an elegant 3-6 word title
    const title = buildConversationTitle(prompt);

    const updated = await updateConversation(id, { title });
    return NextResponse.json({ title, conversation: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate title';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
