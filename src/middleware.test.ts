import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';
import { createSessionToken, SESSION_COOKIE_NAME } from './lib/sessionToken';

const user = {
  id: 'user-1',
  email: 'demo@hyunkai.com',
  name: 'Demo User',
  role: 'free' as const,
  createdAt: '2026-10-18T00:00:00.000Z',
  tier: 0 as const,
};

function buildRequest(pathname: string, token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) {
    headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  }
  return new NextRequest(`http://localhost:3000${pathname}`, { headers });
}

describe('Middleware - API route protection', () => {
  it('rejects unauthenticated API requests', async () => {
    const response = await middleware(buildRequest('/api/chat'));
    expect(response.status).toBe(401);
  });

  it('rejects requests with an invalid session token', async () => {
    const response = await middleware(buildRequest('/api/conversations', 'garbage.token'));
    expect(response.status).toBe(401);
  });

  it('allows authenticated requests', async () => {
    const token = await createSessionToken(user);
    const response = await middleware(buildRequest('/api/conversations', token));
    expect(response.status).toBe(200);
  });

  it('keeps the auth endpoints public', async () => {
    for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/me']) {
      const response = await middleware(buildRequest(path));
      expect(response.status).toBe(200);
    }
  });

  it('keeps the model catalog and status endpoints public', async () => {
    for (const path of ['/api/models', '/api/status']) {
      const response = await middleware(buildRequest(path));
      expect(response.status).toBe(200);
    }
  });

  it('protects every other API route', async () => {
    for (const path of ['/api/chat', '/api/folders', '/api/conversations/search', '/api/settings']) {
      const response = await middleware(buildRequest(path));
      expect(response.status).toBe(401);
    }
  });
});
