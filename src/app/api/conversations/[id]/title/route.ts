import { NextRequest, NextResponse } from 'next/server';
import { updateConversation } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    // Clean up prompt into an elegant 3-6 word title
    let title = prompt
      .replace(/^[\s#*>"'-]+/, '')
      .replace(/^(can you|please|tell me about|how to|what is|explain|write a|build a)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Take first 5-6 words
    const words = title.split(' ').slice(0, 5);
    title = words.join(' ');
    if (title.length > 40) {
      title = title.slice(0, 40) + '...';
    }
    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    const updated = await updateConversation(id, { title });
    return NextResponse.json({ title, conversation: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate title';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
