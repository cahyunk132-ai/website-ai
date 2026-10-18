import { NextResponse } from 'next/server';
import { loginUser, buildSessionCookieHeader } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email dan password wajib diisi.' },
        { status: 400 }
      );
    }

    const { user, token } = await loginUser(email, password);

    const response = NextResponse.json({
      success: true,
      user,
      token,
      message: 'Login berhasil.',
    });

    response.headers.set('Set-Cookie', buildSessionCookieHeader(token));
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Email atau password salah.' },
      { status: 401 }
    );
  }
}
