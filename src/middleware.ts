/**
 * Hyunk AI Hub - Edge Middleware (API Route Protection & Security Headers)
 *
 * Every API route except the explicitly public ones requires a valid signed
 * session cookie (or bearer token). Unauthenticated requests are rejected with
 * HTTP 401 before they reach any route handler or database query.
 *
 * Also applies security headers to all responses and blocks sensitive paths.
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

/**
 * Sensitive paths that should return 404 instead of 403 to avoid information disclosure.
 */
const SENSITIVE_PATHS = [
  '/phpinfo.php',
  '/wp-config.php',
  '/wp-config.php.bak',
  '/.env',
  '/.git',
  '/.aws',
  '/.aws/credentials',
  '/admin.php',
  '/wp-admin',
  '/wp-login.php',
  '/xmlrpc.php',
  '/.htaccess',
  '/.htpasswd',
  '/config.php',
  '/database.yml',
  '/credentials.xml',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Return 404 for sensitive paths to avoid information disclosure
  if (SENSITIVE_PATHS.some((path) => pathname.startsWith(path))) {
    return new NextResponse('Not Found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
  }

  // Apply security headers to all responses
  const applySecurityHeaders = (response: NextResponse) => {
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

    // Content Security Policy
    const csp = [
      "default-src 'self'",
      // Next's hydration uses inline scripts. Nonce-based CSP requires dynamic
      // rendering; this baseline retains inline support, but forbids eval in production.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''} https://vercel.live https://va.vercel-scripts.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src 'self'${process.env.NODE_ENV === 'development' ? ' ws: wss:' : ''} https://*.supabase.co wss://*.supabase.co https://vercel.live https://vitals.vercel-insights.com`,
      "frame-src 'self' https://vercel.live",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(process.env.NODE_ENV === 'production' ? ["upgrade-insecure-requests"] : []),
    ].join('; ');
    response.headers.set('Content-Security-Policy', csp);

    // Same-origin APIs do not need CORS permission. Never grant wildcard access.
    response.headers.delete('Access-Control-Allow-Origin');

    return response;
  };

  if (!pathname.startsWith('/api/') || PUBLIC_API_PATHS.has(pathname)) {
    const response = NextResponse.next();
    return applySecurityHeaders(response);
  }

  // The public share reader is authenticated by its token, not by a session.
  if (pathname.startsWith('/api/share/')) {
    const response = NextResponse.next();
    return applySecurityHeaders(response);
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value || extractBearerToken(req);

  if (!token) {
    const response = NextResponse.json(
      { error: 'Unauthorized:Silakan login terlebih dahulu.' },
      { status: 401 }
    );
    return applySecurityHeaders(response);
  }

  const user = await verifySessionToken(token);
  if (!user) {
    const response = NextResponse.json(
      { error: 'Unauthorized: Sesi tidak valid atau telah kedaluwarsa.' },
      { status: 401 }
    );
    // Clear the invalid cookie so the client can start a fresh session.
    response.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return applySecurityHeaders(response);
  }

  const response = NextResponse.next();
  return applySecurityHeaders(response);
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
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
