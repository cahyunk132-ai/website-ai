import { NextRequest, NextResponse } from 'next/server';
import { listFolders, createFolder } from '@/lib/storage';
import { getSessionFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    const folders = await listFolders(user?.id);
    return NextResponse.json({ folders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list folders';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const { name, color } = await req.json();
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }
    const folder = await createFolder(name, color, user.id);
    return NextResponse.json({ folder }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create folder';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
