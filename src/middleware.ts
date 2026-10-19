/**
 * Hyunk AI Hub - Edge Middleware (API Route Protection)
 *
 * Every API route except the explicitly public ones requires a valid signed
 * session cookie (or bearer token). Unauthenticated requests are rejected with
 * HTTP 401 before they reach any route handler or database query.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/sessionToken';

/**
 * Endpoints that must stay reachable without a session:
 * - auth endpoints (login/register/logout/session probe)
 * - the public model catalog
 * - the provider health endpoint (used by the Windows desktop client)
 */
const PUBLIC_API_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/models',
  '/api/status',
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // The public share reader is authenticated by its token, not by a session.
  if (pathname.startsWith('/api/share/')) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value || extractBearerToken(req);

  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized:Silakan login terlebih dahulu.' },
      { status: 401 }
    );
  }

  const user = await verifySessionToken(token);
  if (!user) {
    const response = NextResponse.json(
      { error: 'Unauthorized: Sesi tidak valid atau telah kedaluwarsa.' },
      { status: 401 }
    );
    // Clear the invalid cookie so the client can start a fresh session.
    response.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return response;
  }

  return NextResponse.next();
}

/**
 * Reads a bearer token from the Authorization header (used by native/desktop clients).
 */
function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    return token || null;
  }
  return null;
}

export const config = {
  matcher: ['/api/:path*'],
};
