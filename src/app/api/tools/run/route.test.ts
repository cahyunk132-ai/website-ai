import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(async () => ({ id: 'user-1', email: 'demo@hyunkai.com' })),
}));

import { POST } from './route';
import { getSessionFromRequest } from '@/lib/auth';
import { NextRequest } from 'next/server';

function buildRequest(body: any): NextRequest {
  return new NextRequest('http://localhost/api/tools/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/tools/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated request', async () => {
    (getSessionFromRequest as any).mockResolvedValueOnce(null);

    const res = await POST(buildRequest({ tool: 'hash_calculate', args: { text: 'a' } }));
    expect(res.status).toBe(401);
  });

  it('rejects an unknown tool', async () => {
    const res = await POST(buildRequest({ tool: 'rm_rf', args: {} }));
    expect(res.status).toBe(400);
  });

  it('rejects a tool that cannot be triggered manually', async () => {
    const res = await POST(buildRequest({ tool: 'code_interpreter', args: { input: '1' } }));
    expect(res.status).toBe(400);
  });

  it('accepts a tool without arguments', async () => {
    const res = await POST(buildRequest({ tool: 'hash_calculate' }));
    expect(res.status).toBe(200);
  });

  it('runs the hash tool', async () => {
    const res = await POST(
      buildRequest({ tool: 'hash_calculate', args: { text: 'hyunk', algorithm: 'sha256' } })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.tool).toBe('hash_calculate');
    expect(data.output).toContain('sha256');
    expect(data.data.digest).toHaveLength(64);
  });

  it('runs the unit converter', async () => {
    const res = await POST(
      buildRequest({ tool: 'unit_convert', args: { value: 5, from: 'kg', to: 'g' } })
    );

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.output).toBe('5000 g');
  });

  it('reports the error of a failing tool', async () => {
    const res = await POST(
      buildRequest({ tool: 'website_security_scan', args: { url: 'http://127.0.0.1/' } })
    );

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.output).toContain('Blocked host');
  });
});
