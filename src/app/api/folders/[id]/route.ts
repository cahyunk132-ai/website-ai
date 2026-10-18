import { NextRequest, NextResponse } from 'next/server';
import { deleteFolder } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const ok = await deleteFolder(id);
    return NextResponse.json({ success: ok, deletedId: id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete folder';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
