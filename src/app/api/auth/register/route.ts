import { NextResponse } from 'next/server';
import { registerUser, buildSessionCookieHeader } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email dan password wajib diisi.' },
        { status: 400 }
      );
    }

    const { user, token } = await registerUser(email, password, name);

    const response = NextResponse.json({
      success: true,
      user,
      token,
      message: 'Registrasi berhasil. Selamat datang di Hyunk AI Hub!',
    });

    response.headers.set('Set-Cookie', buildSessionCookieHeader(token));
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Gagal melakukan registrasi akun.' },
      { status: 400 }
    );
  }
}
