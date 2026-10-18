import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getSessionFromRequest(req);
    return NextResponse.json({
      user,
      authenticated: !!user,
    });
  } catch {
    return NextResponse.json({
      user: null,
      authenticated: false,
    });
  }
}
