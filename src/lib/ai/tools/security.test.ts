import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The TLS and DNS modules are replaced so the test never touches the network.
 */
vi.mock('node:tls', () => ({
  default: {
    connect: (_options: unknown, callback: () => void) => {
      const socket: any = {
        authorized: true,
        authorizationError: undefined,
        getProtocol: () => 'TLSv1.3',
        getCipher: () => ({ name: 'TLS_AES_256_GCM_SHA384', standardName: 'TLS_AES_256_GCM_SHA384' }),
        getPeerCertificate: () => ({
          subject: { CN: 'example.com' },
          issuer: { CN: 'Test CA' },
          valid_from: 'Jan 1 00:00:00 2026 GMT',
          valid_to: 'Jan 1 00:00:00 2027 GMT',
          subjectaltname: 'DNS:example.com',
          serialNumber: '00AB12',
          fingerprint256: 'AA:BB',
        }),
        on: () => undefined,
        end: () => undefined,
        destroy: () => undefined,
      };
      setTimeout(() => callback(), 0);
      return socket;
    },
  },
}));

vi.mock('node:dns/promises', () => ({
  default: {
    resolve4: async () => ['93.184.216.34'],
    resolve6: async () => ['2606:2800:220:1:248:1893:25c8:1946'],
    resolveMx: async () => [{ exchange: 'mail.example.com', priority: 10 }],
    resolveNs: async () => ['ns1.example.com', 'ns2.example.com'],
    resolveCname: async () => null,
    resolveTxt: async (name: string) =>
      name.startsWith('_dmarc')
        ? [['v=DMARC1; p=quarantine']]
        : [['v=spf1 include:_spf.example.com ~all']],
  },
}));

import { scanWebsiteSecurity } from './security';
import { assertSafeUrl } from '../tools';

function makeResponse(options: {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  url?: string;
}) {
  const headers = new Headers(options.headers || {});
  const body = options.body ?? '';

  return {
    status: options.status ?? 200,
    statusText: 'OK',
    headers,
    url: options.url ?? 'https://example.com/',
    body: body
      ? new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        })
      : null,
  } as unknown as Response;
}

describe('website security scan', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a private target through the SSRF guard', async () => {
    await expect(scanWebsiteSecurity('http://127.0.0.1:8080/', assertSafeUrl)).rejects.toThrow(
      /Blocked host/
    );
  });

  it('reports a well configured site with a high score', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        // Only the home page exists, every sensitive path answers with 404.
        if (url !== 'https://example.com/') {
          return makeResponse({ status: 404, body: 'Not found' });
        }
        return makeResponse({
          headers: {
            'content-type': 'text/html',
            'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
            'content-security-policy': "default-src 'self'",
            'x-frame-options': 'DENY',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'strict-origin-when-cross-origin',
            'permissions-policy': 'geolocation=()',
            'cross-origin-opener-policy': 'same-origin',
          },
          body: '<html lang="en"><head><title>Example</title></head><body><h1>Hi</h1></body></html>',
        });
      })
    );

    const report = await scanWebsiteSecurity('https://example.com/', assertSafeUrl, {
      deep: false,
    });

    expect(report.finalUrl).toBe('https://example.com/');
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.grade).toBe('A');
    expect(report.findings.filter((f) => f.severity === 'CRITICAL')).toHaveLength(0);
    expect(report.findings.filter((f) => f.severity === 'HIGH')).toHaveLength(0);
  });

  it('flags the missing security headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeResponse({
          headers: { 'content-type': 'text/html', server: 'nginx/1.18.0' },
          body: '<html><body>hello</body></html>',
        })
      )
    );

    const report = await scanWebsiteSecurity('https://example.com/', assertSafeUrl, {
      deep: false,
    });

    const titles = report.findings.map((f) => f.title);
    expect(titles).toContain('Missing Content-Security-Policy');
    expect(titles).toContain('Missing X-Frame-Options');
    expect(titles).toContain('Missing X-Content-Type-Options');
    expect(titles).toContain('The server discloses its software version');
    expect(report.score).toBeLessThan(90);
  });

  it('reports a critical finding when a sensitive file is reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/.env')) {
          return makeResponse({ status: 200, body: 'DATABASE_URL=postgres://secret' });
        }
        return makeResponse({ status: 404, body: 'Not found' });
      })
    );

    const report = await scanWebsiteSecurity('https://example.com/', assertSafeUrl, {
      deep: false,
    });

    const critical = report.findings.find((f) => f.severity === 'CRITICAL');
    expect(critical?.title).toBe('Sensitive files are publicly reachable');
    expect(critical?.evidence).toContain('/.env');
    expect(report.grade).toBe('F');
  });

  it('does not report a leak when the site answers 200 for every path', async () => {
    // A catch all route: every path returns the same HTML page.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeResponse({
          headers: { 'content-type': 'text/html' },
          body: '<html><body>Single page application shell</body></html>',
        })
      )
    );

    const report = await scanWebsiteSecurity('https://example.com/', assertSafeUrl, {
      deep: false,
    });

    expect(report.raw.catchAllRoute).toBe(true);
    expect(report.findings.find((f) => f.severity === 'CRITICAL')).toBeUndefined();
    expect(
      report.findings.find((f) => f.title === 'The site answers 200 for every path')
    ).toBeTruthy();
  });

  it('does not report a 200 page as a leak when the content does not match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/Dockerfile')) {
          return makeResponse({ status: 200, body: '<html><body>not a Dockerfile</body></html>' });
        }
        return makeResponse({ status: 404, body: 'Not found' });
      })
    );

    const report = await scanWebsiteSecurity('https://example.com/', assertSafeUrl, {
      deep: false,
    });

    expect(report.findings.find((f) => f.severity === 'CRITICAL')).toBeUndefined();
    expect(
      report.findings.find((f) => f.title.includes('answer 200 without the expected content'))
    ).toBeTruthy();
  });

  it('follows the redirect chain and records every hop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'http://example.com/') {
          return makeResponse({
            status: 301,
            headers: { location: 'https://example.com/' },
          });
        }
        return makeResponse({
          headers: { 'content-type': 'text/html' },
          body: '<html><body>home</body></html>',
        });
      })
    );

    const report = await scanWebsiteSecurity('http://example.com/', assertSafeUrl, {
      deep: false,
    });

    const chain = report.raw.redirectChain as Array<{ url: string; status: number }>;
    expect(chain).toHaveLength(2);
    expect(chain[0].url).toBe('http://example.com/');
    expect(chain[0].status).toBe(301);
    expect(chain[1].url).toBe('https://example.com/');
    expect(report.finalUrl).toBe('https://example.com/');
  });

  it('refuses a redirect that points to a blocked host', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeResponse({
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        })
      )
    );

    const report = await scanWebsiteSecurity('https://example.com/', assertSafeUrl, {
      deep: false,
    });

    const blocked = report.findings.find((f) => f.title === 'Redirect to a blocked target');
    expect(blocked).toBeTruthy();
    expect(blocked?.severity).toBe('HIGH');
  });

  it('detects insecure cookies', async () => {
    const res = makeResponse({
      headers: { 'content-type': 'text/html' },
      body: '<html><body>home</body></html>',
    });
    (res.headers as Headers).append('set-cookie', 'session=abc; Path=/');
    (res.headers as Headers).append('set-cookie', 'tracker=xyz; Secure; HttpOnly; SameSite=Lax');

    vi.stubGlobal('fetch', vi.fn(async () => res));

    const report = await scanWebsiteSecurity('https://example.com/', assertSafeUrl, {
      deep: false,
    });

    const insecure = report.findings.find((f) => f.title === 'Cookies without the Secure flag');
    expect(insecure).toBeTruthy();
    expect(insecure?.evidence).toContain('session');
  });

  it('detects a critical CORS configuration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeResponse({
          headers: {
            'content-type': 'application/json',
            'access-control-allow-origin': '*',
            'access-control-allow-credentials': 'true',
          },
          body: '{}',
        })
      )
    );

    const report = await scanWebsiteSecurity('https://example.com/', assertSafeUrl, {
      deep: false,
    });

    const cors = report.findings.find((f) => f.title.includes('CORS allows any origin'));
    expect(cors?.severity).toBe('CRITICAL');
  });

  it('detects secrets exposed in the page source', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeResponse({
          headers: { 'content-type': 'text/html' },
          body: '<html><body><script>var api_key = "sk-live-abcdef123456";</script></body></html>',
        })
      )
    );

    const report = await scanWebsiteSecurity('https://example.com/', assertSafeUrl, {
      deep: false,
    });

    const leak = report.findings.find((f) => f.title.includes('secrets are exposed'));
    expect(leak?.severity).toBe('CRITICAL');
  });

  it('reports the certificate expiry in the raw data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeResponse({
          headers: { 'content-type': 'text/html' },
          body: '<html><body>home</body></html>',
        })
      )
    );

    const report = await scanWebsiteSecurity('https://example.com/', assertSafeUrl, {
      deep: false,
    });

    expect(report.raw.tls).toBeDefined();
    expect((report.raw.tls as any).protocol).toBe('TLSv1.3');
    expect(typeof report.raw.certificateExpiresInDays).toBe('number');
  });

  it('checks the SPF and the DMARC records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeResponse({
          headers: { 'content-type': 'text/html' },
          body: '<html><body>home</body></html>',
        })
      )
    );

    const report = await scanWebsiteSecurity('https://example.com/', assertSafeUrl, {
      deep: false,
    });

    expect(report.raw.hasSpf).toBe(true);
    expect(report.raw.hasDmarc).toBe(true);
    expect(report.raw.dns).toBeDefined();
  });
});
