/**
 * Hyunk AI Hub - Website Security Assessment Engine (server side only)
 *
 * Performs a deep, NON-DESTRUCTIVE assessment of a website:
 *   * TLS handshake details (protocol, cipher, certificate chain, expiry)
 *   * the full redirect chain (every hop is re-validated against the SSRF guard)
 *   * security headers, cookie flags, CORS configuration
 *   * mixed content and information disclosure
 *   * well known files that should not be reachable
 *
 * The engine only ever issues GET/HEAD requests. It never brute forces, never
 * sends exploit payloads and never mutates anything on the target. The result
 * is a report meant to be handed over to a developer.
 */

import tls from 'node:tls';
import dns from 'node:dns/promises';
import { isIP } from 'node:net';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface SecurityFinding {
  severity: Severity;
  title: string;
  detail: string;
  recommendation?: string;
  evidence?: string;
}

export interface SecurityReport {
  url: string;
  finalUrl: string;
  scannedAt: string;
  durationMs: number;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
  findings: SecurityFinding[];
  raw: Record<string, unknown>;
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 40,
  HIGH: 18,
  MEDIUM: 8,
  LOW: 3,
  INFO: 0,
};

/**
 * A critical finding (an exposed secret file, a wildcard CORS with
 * credentials...) means the site is compromised whatever else is fine, so the
 * score can never stay in the "good" range.
 */
const CRITICAL_SCORE_CAP = 35;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 HyunkAIHub-SecurityScan/1.0';

const MAX_BODY_BYTES = 512 * 1024;
const MAX_REQUESTS_PER_SCAN = 22;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Files that must never be publicly reachable.
 *
 * A 200 status alone does not prove the file is exposed: a lot of sites
 * answer 200 for every path (single page applications, catch all routes).
 * Each entry therefore carries the signature the real file must have, so a
 * generic 200 page is not reported as a leak.
 */
const SENSITIVE_PATHS: Array<{
  path: string;
  label: string;
  signature?: RegExp;
  magic?: number[];
}> = [
  { path: '/.env', label: 'Environment file', signature: /^[A-Za-z_][A-Za-z0-9_]*\s*=\s*\S/m },
  { path: '/.git/HEAD', label: 'Git repository', signature: /^ref:\s+refs\//m },
  { path: '/.git/config', label: 'Git configuration', signature: /\[core\]/ },
  {
    path: '/.gitignore',
    label: 'Git ignore file',
    signature: /(^|\n)(node_modules|\.env|dist|\.DS_Store|\.next)/,
  },
  { path: '/.DS_Store', label: 'macOS metadata', magic: [0x00, 0x00, 0x00, 0x01] },
  { path: '/backup.zip', label: 'Backup archive', magic: [0x50, 0x4b, 0x03, 0x04] },
  {
    path: '/dump.sql',
    label: 'Database dump',
    signature: /(CREATE TABLE|INSERT INTO|--\s*MySQL dump|--\s*PostgreSQL)/i,
  },
  {
    path: '/phpinfo.php',
    label: 'PHP configuration page',
    signature: /(phpinfo\(\)|PHP Version\s*[\d.]+)/i,
  },
  {
    path: '/server-status',
    label: 'Apache status page',
    signature: /(Apache Server Status|Server uptime|Apache\/[0-9.]+ Server Status)/i,
  },
  {
    path: '/wp-config.php.bak',
    label: 'WordPress configuration backup',
    signature: /(DB_NAME|DB_USER|WP_HOME|table_prefix)/,
  },
  {
    path: '/config.php.bak',
    label: 'Application configuration backup',
    signature: /(DB_PASSWORD|'password'\s*=>|\$db\s*=|database\s*=>)/i,
  },
  { path: '/Dockerfile', label: 'Docker build file', signature: /^\s*FROM\s+\S+/im },
  { path: '/.aws/credentials', label: 'AWS credentials', signature: /\[default\]/ },
  {
    path: '/actuator/env',
    label: 'Spring actuator environment',
    signature: /"(activeProfiles|propertySources|classPathResources)"/,
  },
];

const WELL_KNOWN_PATHS: Array<{ path: string; label: string }> = [
  { path: '/.well-known/security.txt', label: 'security.txt' },
  { path: '/robots.txt', label: 'robots.txt' },
  { path: '/sitemap.xml', label: 'sitemap.xml' },
];

export interface SafeUrlChecker {
  (url: string): URL;
}

/** Options shared with the tool dispatcher. */
export interface ScanOptions {
  /** Deep mode also probes the well known files (robots, sitemap, security.txt). */
  deep?: boolean;
  /** Maximum number of HTTP requests the scan may perform. */
  maxRequests?: number;
  /** Injected for tests. */
  now?: () => number;
}

interface HttpProbeResult {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  setCookie: string[];
  body: string;
  buffer: Buffer;
  contentType: string;
  durationMs: number;
  error?: string;
}

/**
 * Reads a response body with a hard size cap so a huge file can never exhaust
 * the memory of the server.
 */
async function readCappedBody(res: Response): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let received = 0;

  while (received < MAX_BODY_BYTES) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    chunks.push(Buffer.from(value));
  }

  try {
    await reader.cancel();
  } catch {
    // ignore
  }

  return Buffer.concat(chunks);
}

function headerRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/**
 * Performs a single GET request without following redirects, so the caller can
 * validate every hop before following it.
 */
async function probeUrl(url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<HttpProbeResult> {
  const started = Date.now();
  const base: HttpProbeResult = {
    url,
    status: 0,
    statusText: '',
    headers: {},
    setCookie: [],
    body: '',
    buffer: Buffer.alloc(0),
    contentType: '',
    durationMs: 0,
  };

  try {
    const res = await fetch(url, {
      method,
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const headers = headerRecord(res.headers);
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];

    const buffer = method === 'HEAD' ? Buffer.alloc(0) : await readCappedBody(res);

    return {
      url,
      status: res.status,
      statusText: res.statusText,
      headers,
      setCookie,
      body: buffer.toString('utf8'),
      buffer,
      contentType: headers['content-type'] || '',
      durationMs: Date.now() - started,
    };
  } catch (err: unknown) {
    return {
      ...base,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Checks that the body of a 200 answer really looks like the file that was
 * requested. It prevents a catch all route from being reported as a leak.
 */
function matchesSignature(
  result: HttpProbeResult,
  target: { path: string; label: string; signature?: RegExp; magic?: number[] }
): boolean {
  if (target.magic) {
    return target.magic.every((byte, index) => result.buffer[index] === byte);
  }

  if (target.signature) {
    return target.signature.test(result.body);
  }

  return false;
}

/**
 * Collects the TLS details of a host: the negotiated protocol, the cipher and
 * the certificate chain.
 */
export async function inspectTls(hostname: string, port = 443) {
  return new Promise<Record<string, unknown>>((resolve) => {
    let settled = false;
    const finish = (value: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const socket = tls.connect(
        {
          host: hostname,
          port,
          servername: hostname,
          rejectUnauthorized: false,
          timeout: REQUEST_TIMEOUT_MS,
        },
        () => {
          const cipher = socket.getCipher();
          const cert = socket.getPeerCertificate(false);
          const chain = socket.getPeerCertificate?.() || {};

          finish({
            connected: true,
            protocol: socket.getProtocol(),
            authorized: socket.authorized,
            authorizationError: socket.authorizationError
              ? String(socket.authorizationError)
              : undefined,
            cipher: cipher ? { name: cipher.name, standardName: cipher.standardName } : undefined,
            subject: cert?.subject,
            issuer: cert?.issuer,
            validFrom: cert?.valid_from,
            validTo: cert?.valid_to,
            subjectAltName: cert?.subjectaltname,
            serialNumber: cert?.serialNumber,
            fingerprint256: cert?.fingerprint256,
            chainLength: Array.isArray(chain) ? chain.length : undefined,
          });

          socket.end();
        }
      );

      socket.on('timeout', () => {
        finish({ connected: false, error: 'TLS handshake timed out' });
        socket.destroy();
      });

      socket.on('error', (err: Error) => {
        finish({ connected: false, error: err.message });
      });
    } catch (err: unknown) {
      finish({ connected: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

/**
 * Resolves the DNS records of a host and flags the results that point at a
 * private or loopback address.
 */
export async function resolveHost(hostname: string) {
  const out: Record<string, unknown> = { host: hostname };
  const privateAddresses: string[] = [];

  const collect = (records: string[] | undefined) => {
    if (!records) return;
    for (const record of records) {
      if (isIP(record)) {
        const isPrivate =
          record.startsWith('10.') ||
          record.startsWith('192.168.') ||
          record.startsWith('127.') ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(record) ||
          record.startsWith('169.254.') ||
          record.startsWith('fc') ||
          record.startsWith('fd') ||
          record.startsWith('fe80');
        if (isPrivate) privateAddresses.push(record);
      }
    }
  };

  try {
    const [a, aaaa, mx, ns, txt, cname] = await Promise.all([
      dns.resolve4(hostname).catch(() => [] as string[]),
      dns.resolve6(hostname).catch(() => [] as string[]),
      dns.resolveMx(hostname).catch(() => [] as Array<{ exchange: string; priority: number }>),
      dns.resolveNs(hostname).catch(() => [] as string[]),
      dns.resolveTxt(hostname).catch(() => [] as string[][]),
      dns.resolveCname(hostname).catch(() => null as unknown as string),
    ]);

    out.A = a;
    out.AAAA = aaaa;
    out.MX = mx.map((r) => ({ exchange: r.exchange, priority: r.priority }));
    out.NS = ns;
    out.TXT = txt.map((parts) => parts.join(''));
    out.CNAME = cname || undefined;

    collect(a);
    collect(aaaa);
  } catch (err: unknown) {
    out.error = err instanceof Error ? err.message : String(err);
  }

  if (privateAddresses.length) {
    out.privateAddresses = privateAddresses;
  }

  // The SPF and DMARC records live in dedicated names.
  try {
    const dmarc = await dns.resolveTxt(`_dmarc.${hostname}`).catch(() => [] as string[][]);
    out.DMARC = dmarc.map((parts) => parts.join(''));
  } catch {
    out.DMARC = [];
  }

  return out;
}

function parseSetCookieFlags(cookies: string[]) {
  return cookies.map((cookie) => {
    const [pair, ...attrs] = cookie.split(';');
    const name = (pair || '').split('=')[0]?.trim() || '';
    const lower = attrs.map((a) => a.trim().toLowerCase());
    return {
      name,
      secure: lower.some((a) => a === 'secure'),
      httpOnly: lower.some((a) => a === 'httponly'),
      sameSite: lower.find((a) => a.startsWith('samesite'))?.split('=')[1] || null,
    };
  });
}

function scoreFromFindings(findings: SecurityFinding[]): number {
  let penalty = 0;
  let hasCritical = false;

  for (const finding of findings) {
    penalty += SEVERITY_WEIGHT[finding.severity];
    if (finding.severity === 'CRITICAL') hasCritical = true;
  }

  let score = Math.max(0, Math.min(100, 100 - penalty));
  if (hasCritical) score = Math.min(score, CRITICAL_SCORE_CAP);

  return score;
}

function gradeFromScore(score: number): SecurityReport['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Runs the full assessment of a website.
 */
export async function scanWebsiteSecurity(
  rawUrl: string,
  assertSafeUrl: SafeUrlChecker,
  options: ScanOptions = {}
): Promise<SecurityReport> {
  const started = options.now ? options.now() : Date.now();
  const findings: SecurityFinding[] = [];
  const raw: Record<string, unknown> = {};

  let parsed: URL;
  try {
    parsed = assertSafeUrl(rawUrl);
  } catch (err: unknown) {
    // A blocked target is a hard failure: the agent has to know that the scan
    // did not run instead of receiving an empty report.
    throw err instanceof Error ? err : new Error(String(err));
  }

  // --- Redirect chain -----------------------------------------------------
  const chain: Array<{ url: string; status: number; location?: string }> = [];
  let current = parsed;
  let probe: HttpProbeResult | null = null;
  let requests = 0;
  const maxRequests = options.maxRequests ?? MAX_REQUESTS_PER_SCAN;

  for (let hop = 0; hop < 6 && requests < maxRequests; hop++) {
    requests += 1;
    const result = await probeUrl(current.toString());
    probe = result;

    chain.push({
      url: current.toString(),
      status: result.status,
      location: result.headers['location'],
    });

    if (result.error) {
      findings.push({
        severity: 'HIGH',
        title: 'Target is not reachable',
        detail: result.error,
        recommendation: 'Check the hostname, the port and whether the server answers over HTTPS.',
        evidence: result.error,
      });
      break;
    }

    const location = result.headers['location'];
    if (result.status >= 300 && result.status < 400 && location) {
      let next: URL;
      try {
        // Every hop is validated again: a redirect must not be able to reach
        // a private address.
        next = assertSafeUrl(new URL(location, current).toString());
      } catch (err: unknown) {
        findings.push({
          severity: 'HIGH',
          title: 'Redirect to a blocked target',
          detail: `The redirect points to ${location} which is not allowed.`,
          recommendation: 'Never redirect to a loopback or private address.',
          evidence: location,
        });
        break;
      }
      current = next;
      continue;
    }

    break;
  }

  raw.redirectChain = chain;

  if (!probe || probe.status === 0) {
    return {
      url: parsed.toString(),
      finalUrl: current.toString(),
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      score: 0,
      grade: 'F',
      summary: 'The target could not be reached.',
      findings,
      raw,
    };
  }

  const finalUrl = current.toString();
  const isHttps = finalUrl.startsWith('https://');
  const headers = probe.headers;

  raw.finalStatus = probe.status;
  raw.statusText = probe.statusText;
  raw.responseTimeMs = probe.durationMs;
  raw.contentType = probe.contentType;
  raw.server = headers['server'];
  raw.xPoweredBy = headers['x-powered-by'];
  raw.headers = headers;

  // --- TLS ----------------------------------------------------------------
  if (isHttps) {
    const tlsInfo = await inspectTls(parsed.hostname, Number(parsed.port) || 443);
    raw.tls = tlsInfo;

    const validTo = (tlsInfo.validTo as string) || '';
    if (validTo) {
      const expiry = new Date(validTo);
      const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86400000);
      raw.certificateExpiresInDays = daysLeft;

      if (daysLeft < 0) {
        findings.push({
          severity: 'CRITICAL',
          title: 'The TLS certificate has expired',
          detail: `The certificate expired on ${validTo}.`,
          recommendation: 'Renew the certificate and automate the renewal.',
          evidence: `valid_to=${validTo}`,
        });
      } else if (daysLeft < 15) {
        findings.push({
          severity: 'HIGH',
          title: 'The TLS certificate expires very soon',
          detail: `The certificate expires in ${daysLeft} day(s), on ${validTo}.`,
          recommendation: 'Renew the certificate and automate the renewal.',
          evidence: `valid_to=${validTo}`,
        });
      } else {
        findings.push({
          severity: 'INFO',
          title: 'The TLS certificate is valid',
          detail: `Valid until ${validTo} (${daysLeft} days left).`,
        });
      }
    }

    const protocol = (tlsInfo.protocol as string) || '';
    if (protocol && !/TLSv1\.3/.test(protocol)) {
      findings.push({
        severity: 'MEDIUM',
        title: 'The connection does not use TLS 1.3',
        detail: `Negotiated protocol: ${protocol}.`,
        recommendation: 'Enable TLS 1.3 and keep TLS 1.2 as a fallback.',
        evidence: protocol,
      });
    }
  } else {
    findings.push({
      severity: 'HIGH',
      title: 'The site is served over plain HTTP',
      detail: 'The final URL uses http://, so every request and every cookie travels in clear text.',
      recommendation: 'Redirect all traffic to HTTPS and enable HSTS.',
    });
  }

  // --- Redirect to another host ------------------------------------------
  if (chain.length > 1) {
    const first = new URL(chain[0].url);
    const last = new URL(finalUrl);
    if (first.hostname !== last.hostname) {
      findings.push({
        severity: 'LOW',
        title: 'The site redirects to another host',
        detail: `${first.hostname} redirects to ${last.hostname}.`,
        recommendation: 'Make sure the redirect is intentional and uses HTTPS.',
        evidence: chain.map((c) => `${c.status} ${c.url}`).join(' -> '),
      });
    }
  }

  // --- Security headers ---------------------------------------------------
  const headerChecks: Array<{
    key: string;
    title: string;
    severity: Severity;
    recommendation: string;
    test?: (value: string) => boolean;
    note?: string;
  }> = [
    {
      key: 'strict-transport-security',
      title: 'Missing HSTS header',
      severity: 'HIGH',
      recommendation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains.',
      note: 'Only relevant for HTTPS sites.',
    },
    {
      key: 'content-security-policy',
      title: 'Missing Content-Security-Policy',
      severity: 'MEDIUM',
      recommendation: 'Add a strict CSP, for example default-src \'self\' and an explicit script-src.',
    },
    {
      key: 'x-frame-options',
      title: 'Missing X-Frame-Options',
      severity: 'MEDIUM',
      recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking.',
    },
    {
      key: 'x-content-type-options',
      title: 'Missing X-Content-Type-Options',
      severity: 'LOW',
      recommendation: 'Add X-Content-Type-Options: nosniff.',
    },
    {
      key: 'referrer-policy',
      title: 'Missing Referrer-Policy',
      severity: 'LOW',
      recommendation: 'Add Referrer-Policy: strict-origin-when-cross-origin.',
    },
    {
      key: 'permissions-policy',
      title: 'Missing Permissions-Policy',
      severity: 'INFO',
      recommendation: 'Add a Permissions-Policy to disable the features you do not use.',
    },
    {
      key: 'cross-origin-opener-policy',
      title: 'Missing Cross-Origin-Opener-Policy',
      severity: 'INFO',
      recommendation: 'Add Cross-Origin-Opener-Policy: same-origin to isolate the browsing context.',
    },
  ];

  for (const check of headerChecks) {
    const value = headers[check.key];
    if (!value) {
      if (check.key === 'strict-transport-security' && !isHttps) continue;
      findings.push({
        severity: check.severity,
        title: check.title,
        detail: `The response does not send a "${check.key}" header.`,
        recommendation: check.recommendation,
      });
      continue;
    }

    if (check.key === 'strict-transport-security') {
      const maxAge = /max-age=(\d+)/i.exec(value);
      const age = maxAge ? Number(maxAge[1]) : 0;
      raw.hstsMaxAge = age;
      if (age < 15552000) {
        findings.push({
          severity: 'MEDIUM',
          title: 'The HSTS max-age is too short',
          detail: `max-age=${age} (less than 180 days).`,
          recommendation: 'Use max-age=31536000 and includeSubDomains.',
          evidence: value,
        });
      }
      if (!/includeSubDomains/i.test(value)) {
        findings.push({
          severity: 'LOW',
          title: 'HSTS does not include the subdomains',
          detail: 'The HSTS header is missing the includeSubDomains directive.',
          recommendation: 'Add includeSubDomains once every subdomain supports HTTPS.',
          evidence: value,
        });
      }
    }
  }

  // HSTS preload list membership.
  if (headers['strict-transport-security'] && !/preload/i.test(headers['strict-transport-security'])) {
    findings.push({
      severity: 'INFO',
      title: 'HSTS is not preloaded',
      detail: 'The site is not in the browser preload list.',
      recommendation: 'Submit the domain to hstspreload.org once the HSTS setup is stable.',
    });
  }

  // --- Cookies ------------------------------------------------------------
  const cookies = parseSetCookieFlags(probe.setCookie);
  raw.cookies = cookies;

  if (cookies.length) {
    const insecure = cookies.filter((c) => !c.secure);
    const noHttpOnly = cookies.filter((c) => !c.httpOnly);
    const noSameSite = cookies.filter((c) => !c.sameSite);

    if (insecure.length) {
      findings.push({
        severity: isHttps ? 'HIGH' : 'CRITICAL',
        title: 'Cookies without the Secure flag',
        detail: `${insecure.length} cookie(s) can be sent over plain HTTP: ${insecure
          .map((c) => c.name)
          .join(', ')}.`,
        recommendation: 'Add the Secure flag to every cookie.',
        evidence: insecure.map((c) => c.name).join(', '),
      });
    }

    if (noHttpOnly.length) {
      findings.push({
        severity: 'MEDIUM',
        title: 'Cookies without the HttpOnly flag',
        detail: `${noHttpOnly.length} cookie(s) are readable by JavaScript: ${noHttpOnly
          .map((c) => c.name)
          .join(', ')}.`,
        recommendation: 'Add the HttpOnly flag to session cookies.',
        evidence: noHttpOnly.map((c) => c.name).join(', '),
      });
    }

    if (noSameSite.length) {
      findings.push({
        severity: 'LOW',
        title: 'Cookies without a SameSite attribute',
        detail: `${noSameSite.length} cookie(s) have no SameSite attribute.`,
        recommendation: 'Use SameSite=Lax or SameSite=Strict.',
        evidence: noSameSite.map((c) => c.name).join(', '),
      });
    }
  }

  // --- CORS ---------------------------------------------------------------
  const allowOrigin = headers['access-control-allow-origin'];
  const allowCredentials = headers['access-control-allow-credentials'];
  raw.cors = { allowOrigin, allowCredentials };

  if (allowOrigin === '*' && allowCredentials) {
    findings.push({
      severity: 'CRITICAL',
      title: 'CORS allows any origin together with credentials',
      detail:
        'Access-Control-Allow-Origin: * combined with Access-Control-Allow-Credentials: true lets any website read the authenticated responses.',
      recommendation: 'Never combine a wildcard origin with credentials. List the allowed origins explicitly.',
      evidence: `allow-origin=${allowOrigin} allow-credentials=${allowCredentials}`,
    });
  } else if (allowOrigin === '*') {
    findings.push({
      severity: 'INFO',
      title: 'CORS allows any origin',
      detail: 'Access-Control-Allow-Origin: * - fine for public APIs, wrong for private data.',
      recommendation: 'Restrict the origin when the API serves private data.',
    });
  }

  // --- Information disclosure ---------------------------------------------
  const disclosureHeaders = ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version'];
  const disclosed = disclosureHeaders.filter((h) => headers[h]);
  if (disclosed.length) {
    findings.push({
      severity: 'LOW',
      title: 'The server discloses its software version',
      detail: `The response exposes: ${disclosed.map((h) => `${h}: ${headers[h]}`).join(' | ')}.`,
      recommendation: 'Remove or hide the version headers on the edge.',
      evidence: disclosed.map((h) => `${h}: ${headers[h]}`).join(' | '),
    });
  }

  const secretPattern =
    /(api[_-]?key|secret|password|passwd|token|access[_-]?key|private[_-]?key)\s*[:=]\s*["'][^"'\s]{8,}["']/gi;
  const secrets = probe.body.match(secretPattern);
  if (secrets && secrets.length) {
    findings.push({
      severity: 'CRITICAL',
      title: 'Possible secrets are exposed in the page source',
      detail: `${secrets.length} assignment(s) that look like a credential were found in the HTML.`,
      recommendation: 'Remove the credentials from the client bundle and rotate them.',
      evidence: secrets.slice(0, 3).join(' | '),
    });
  }

  // --- Mixed content ------------------------------------------------------
  if (isHttps && probe.contentType.includes('text/html')) {
    const insecure = probe.body.match(/(?:src|href)\s*=\s*["']http:\/\/[^"']+/gi) || [];
    raw.mixedContentCount = insecure.length;
    if (insecure.length) {
      findings.push({
        severity: 'MEDIUM',
        title: 'The page loads resources over plain HTTP',
        detail: `${insecure.length} resource(s) are loaded through http:// from an HTTPS page.`,
        recommendation: 'Serve every asset over HTTPS, the browser blocks them anyway.',
        evidence: insecure.slice(0, 5).join(' | '),
      });
    }
  }

  // --- Sensitive files ----------------------------------------------------
  const exposed: Array<{ path: string; status: number; label: string }> = [];
  const gated: Array<{ path: string; status: number; label: string }> = [];
  const softHits: Array<{ path: string; status: number; label: string }> = [];

  // Some sites answer 200 for every path (single page application, catch all
  // route). One random probe tells us whether a 200 means something at all.
  let catchAll = false;
  if (requests < maxRequests) {
    requests += 1;
    const randomPath = `/__hyunk_ai_hub_probe_${Math.random().toString(36).slice(2, 10)}`;
    const randomResult = await probeUrl(new URL(randomPath, finalUrl).toString());
    catchAll = randomResult.status === 200;
  }
  raw.catchAllRoute = catchAll;

  for (const target of SENSITIVE_PATHS) {
    if (requests >= maxRequests) break;
    requests += 1;
    const url = new URL(target.path, finalUrl).toString();
    const result = await probeUrl(url);

    if (result.status === 200) {
      // A 200 is only meaningful when the body really looks like the file.
      const signatureMatches = matchesSignature(result, target);
      if (signatureMatches) {
        exposed.push({ path: target.path, status: result.status, label: target.label });
      } else {
        softHits.push({ path: target.path, status: result.status, label: target.label });
      }
    } else if (result.status === 401 || result.status === 403) {
      gated.push({ path: target.path, status: result.status, label: target.label });
    }
  }

  raw.exposedFiles = exposed;
  raw.gatedFiles = gated;
  raw.softHits = softHits;

  if (exposed.length) {
    findings.push({
      severity: 'CRITICAL',
      title: 'Sensitive files are publicly reachable',
      detail: `${exposed.length} file(s) answer with HTTP 200 and contain the expected content: ${exposed
        .map((e) => e.path)
        .join(', ')}.`,
      recommendation:
        'Block these paths at the web server, remove the files from the deployment and rotate every credential they may contain.',
      evidence: exposed.map((e) => `${e.path} (${e.label})`).join(', '),
    });
  } else if (gated.length) {
    findings.push({
      severity: 'INFO',
      title: 'Sensitive files exist but are protected',
      detail: `${gated.length} sensitive path(s) answer with 401/403 instead of 404.`,
      recommendation:
        'Returning 404 is better than 403: it does not tell an attacker that the file exists.',
      evidence: gated.map((e) => `${e.path} -> ${e.status}`).join(', '),
    });
  }

  if (catchAll) {
    findings.push({
      severity: 'INFO',
      title: 'The site answers 200 for every path',
      detail:
        'A random path also returns HTTP 200, so the exposure check cannot be trusted on this site and the 200 answers above are not reported as leaks.',
      recommendation:
        'Return a real 404 page for unknown paths so scanners and monitoring tools can tell the difference.',
    });
  } else if (softHits.length) {
    findings.push({
      severity: 'INFO',
      title: 'Sensitive paths answer 200 without the expected content',
      detail: `${softHits.length} path(s) return HTTP 200 but the body does not look like the expected file.`,
      recommendation:
        'Check manually that these paths do not leak a file with an unexpected name or format.',
      evidence: softHits.map((e) => `${e.path} (${e.label})`).join(', '),
    });
  }

  // --- Well known files (deep mode) --------------------------------------
  if (options.deep) {
    const wellKnown: Record<string, { status: number; preview?: string }> = {};

    for (const target of WELL_KNOWN_PATHS) {
      if (requests >= maxRequests) break;
      requests += 1;
      const url = new URL(target.path, finalUrl).toString();
      const result = await probeUrl(url);
      wellKnown[target.path] = {
        status: result.status,
        preview: result.status === 200 ? result.body.slice(0, 400) : undefined,
      };
    }

    raw.wellKnownFiles = wellKnown;

    const securityTxt = wellKnown['/.well-known/security.txt'];
    if (securityTxt && securityTxt.status === 404 && !catchAll) {
      findings.push({
        severity: 'INFO',
        title: 'No security.txt file',
        detail: 'The site does not publish a security.txt contact file.',
        recommendation:
          'Publish /.well-known/security.txt so researchers know how to report a vulnerability.',
      });
    }
  }

  // --- DNS ----------------------------------------------------------------
  const dnsInfo = await resolveHost(parsed.hostname);
  raw.dns = dnsInfo;

  const txtRecords = (dnsInfo.TXT as string[]) || [];
  const spf = txtRecords.find((t) => /^v=spf1/i.test(t));
  raw.hasSpf = Boolean(spf);
  if (isHttps && !spf) {
    findings.push({
      severity: 'LOW',
      title: 'No SPF record',
      detail: 'The domain does not publish an SPF record, so anybody can spoof its emails.',
      recommendation: 'Publish a v=spf1 record with the authorised senders.',
    });
  }

  const dmarc = (dnsInfo.DMARC as string[]) || [];
  raw.hasDmarc = dmarc.length > 0;
  if (isHttps && !dmarc.length) {
    findings.push({
      severity: 'LOW',
      title: 'No DMARC record',
      detail: 'The domain does not publish a DMARC record, so SPF failures are not reported.',
      recommendation: 'Publish a _dmarc TXT record with p=quarantine or p=reject.',
    });
  }

  if (Array.isArray(dnsInfo.privateAddresses) && dnsInfo.privateAddresses.length) {
    findings.push({
      severity: 'HIGH',
      title: 'The domain resolves to a private address',
      detail: `The public DNS records point to ${(dnsInfo.privateAddresses as string[]).join(', ')}.`,
      recommendation:
        'A public domain must not resolve to a private address: it allows DNS rebinding and hides the real infrastructure.',
    });
  }

  // --- Score --------------------------------------------------------------
  const score = scoreFromFindings(findings);
  const grade = gradeFromScore(score);

  const counts = findings.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] || 0) + 1;
    return acc;
  }, {});

  const summaryParts: string[] = [];
  if (counts.CRITICAL) summaryParts.push(`${counts.CRITICAL} critical`);
  if (counts.HIGH) summaryParts.push(`${counts.HIGH} high`);
  if (counts.MEDIUM) summaryParts.push(`${counts.MEDIUM} medium`);
  if (counts.LOW) summaryParts.push(`${counts.LOW} low`);
  if (counts.INFO) summaryParts.push(`${counts.INFO} info`);

  return {
    url: parsed.toString(),
    finalUrl,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    score,
    grade,
    summary: summaryParts.length
      ? `${finalUrl} scored ${score}/100 (grade ${grade}). Findings: ${summaryParts.join(', ')}.`
      : `${finalUrl} scored ${score}/100 (grade ${grade}). No issues were detected.`,
    findings,
    raw,
  };
}
