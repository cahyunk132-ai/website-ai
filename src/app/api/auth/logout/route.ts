import { NextResponse } from 'next/server';
import { buildClearSessionCookieHeader } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: 'Berhasil logout.',
  });

  response.headers.set('Set-Cookie', buildClearSessionCookieHeader());
  return response;
}
