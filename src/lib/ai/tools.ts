/**
 * Hyunk AI Hub - Real Agent Tool Execution Engine
 *
 * Provides actual live execution for Web Search, Code Interpreter, Calculator,
 * URL Fetcher, HTTP Requests and Clock. Every tool is described in a registry
 * so the agent system prompt and the dispatcher can never drift apart.
 */

import vm from 'vm';
import { AgentToolCall, AgentToolDescriptor } from './agentProtocol';
import { scanWebsiteSecurity, resolveHost, SecurityReport } from './tools/security';
import { inspectPage, PageInspection } from './tools/inspector';
import {
  calculateHash,
  base64Codec,
  selectJsonPath,
  extractWithRegex,
  convertUnit,
  analyzePassword,
  nextCronRuns,
  diffText,
} from './tools/utility';

export interface ToolExecutionResult {
  tool: string;
  target?: string;
  success: boolean;
  output: string;
  data?: any;
  durationMs: number;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Catalogue of the tools the agent can call. The same list feeds the system
 * prompt and the dispatcher.
 */
export const AGENT_TOOLS: AgentToolDescriptor[] = [
  {
    name: 'web_search',
    description:
      'Search the live web and return ranked results with title, URL and snippet. Use it for facts, news, documentation or anything that may have changed.',
    parameters: 'the search query as plain text',
  },
  {
    name: 'fetch_url',
    description:
      'Download a web page or JSON document and return its readable text content (HTML is stripped).',
    parameters: 'the absolute http(s) URL',
  },
  {
    name: 'http_request',
    description:
      'Perform a custom HTTP request against an API. Supports GET, POST, PUT, PATCH and DELETE with custom headers and a JSON body.',
    parameters:
      'JSON object: {"method":"GET","url":"https://...","headers":{"Authorization":"Bearer ..."},"body":{...}}',
  },
  {
    name: 'code_interpreter',
    description:
      'Execute JavaScript inside a sandboxed Node-like VM (no filesystem, no network, no process access) and return stdout plus the returned value.',
    parameters: 'the JavaScript source code',
  },
  {
    name: 'calculator',
    description:
      'Evaluate an arithmetic expression exactly, with functions (sqrt, abs, round, min, max, pow, log) and constants (pi, e).',
    parameters: 'the expression, for example (128 * 3) / 7',
  },
  {
    name: 'datetime',
    description:
      'Get the current date and time, optionally in a specific IANA time zone. Use it whenever the exact current moment matters.',
    parameters: 'optional time zone, for example Asia/Makassar (defaults to UTC)',
  },
  {
    name: 'website_security_scan',
    description:
      'Run a deep, non-destructive security assessment of a website: TLS protocol and certificate expiry, redirect chain, security headers (HSTS, CSP, X-Frame-Options...), cookie flags, CORS, mixed content, information disclosure and sensitive files that are publicly reachable. Returns a score with graded findings and the raw evidence. Use it when the user asks whether a site is secure, asks for a security review, a penetration test summary, an SSL check or a hardening checklist. Only scan sites the user owns or is authorised to test.',
    parameters:
      'JSON object: {"url":"https://example.com","deep":true} - "deep" also reads security.txt, robots.txt and sitemap.xml',
  },
  {
    name: 'dns_lookup',
    description:
      'Resolve the DNS records of a host: A, AAAA, MX, TXT, NS and CNAME, plus the presence of the SPF and DMARC records. Use it for email deliverability problems, domain verification and to check where a domain points to.',
    parameters: 'JSON object: {"host":"example.com","type":"A"} - type is one of A, AAAA, MX, TXT, NS, CNAME, ALL (default ALL)',
  },
  {
    name: 'page_inspector',
    description:
      'Inspect a page and return its metadata and content signals: title, meta description, canonical, robots, Open Graph and Twitter cards, language, heading structure, images without alt text, internal and external links, word count, response time and the SEO/accessibility issues that were detected.',
    parameters: 'the absolute http(s) URL',
  },
  {
    name: 'hash_calculate',
    description:
      'Calculate a cryptographic digest of a text: sha256, sha1, sha512 or md5, optionally as a keyed HMAC. Use it to verify a file, to fingerprint an API key without revealing it, or to check an integrity hash.',
    parameters:
      'JSON object: {"text":"...","algorithm":"sha256","key":"optional hmac key"}',
  },
  {
    name: 'base64_codec',
    description:
      'Encode or decode a base64 string. Useful to inspect an encoded token or to prepare a payload for an API that expects base64.',
    parameters: 'JSON object: {"text":"...","mode":"encode"} - mode is encode or decode',
  },
  {
    name: 'json_select',
    description:
      'Extract values from a JSON document with a path, for example "data.items[0].id" or "results[*].email". Use it to pull a single value out of a large API response instead of reading the whole document.',
    parameters: 'JSON object: {"json":"{...}","path":"data.items[*].id"}',
  },
  {
    name: 'regex_extract',
    description:
      'Extract every match of a regular expression from a text, including the capture groups. Use it to pull IDs, emails, URLs, versions or any other pattern out of a document. The pattern is evaluated with a hard timeout so a catastrophic backtracking expression cannot block the server.',
    parameters: 'JSON object: {"text":"...","pattern":"[a-z]+@[a-z]+\\\\.[a-z]+","flags":"g"}',
  },
  {
    name: 'unit_convert',
    description:
      'Convert a value between two units of the same family: length, mass, data or time. Use it whenever the user mixes metric and imperial units.',
    parameters: 'JSON object: {"value":10,"from":"km","to":"mi"}',
  },
  {
    name: 'password_entropy',
    description:
      'Estimate the strength of a password locally: length, character pool, entropy in bits, a strength rating, the estimated time to crack it and the concrete suggestions to improve it. The password is analysed on the server and is never sent anywhere else.',
    parameters: 'the password to analyse',
  },
  {
    name: 'cron_next',
    description:
      'Compute the next execution times of a 5 field cron expression. Use it to explain a schedule, to verify a crontab line or to answer when a job will run next.',
    parameters: 'JSON object: {"expression":"0 9 * * 1-5","count":5}',
  },
  {
    name: 'text_diff',
    description:
      'Compare two texts and return a line based diff with the added and the removed lines. Use it to review a change, to compare two configuration files or to summarise what an edit does.',
    parameters: 'JSON object: {"original":"...","updated":"..."}',
  },
];

/**
 * Tool names the agent may call.
 */
export const AGENT_TOOL_NAMES = AGENT_TOOLS.map((tool) => tool.name);

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'internal',
]);

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain'];

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;

  // IPv4 private ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  // IPv6 loopback / unique local
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return true;
  }

  return false;
}

/**
 * Validates a URL before the server performs a request on behalf of the model.
 */
export function assertSafeUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Blocked protocol: ${parsed.protocol} (only http and https are allowed)`);
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error(`Blocked host: ${parsed.hostname} (private and loopback targets are not allowed)`);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Web Search
// ---------------------------------------------------------------------------

/**
 * Real Web Search Tool using DuckDuckGo Instant Answers & HTML search fallback
 */
export async function executeWebSearch(
  query: string,
  maxResults: number = 5
): Promise<{ results: WebSearchResultItem[]; summary: string }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return { results: [], summary: 'No search query provided' };
  }

  const results: WebSearchResultItem[] = [];

  try {
    // 1. Try DuckDuckGo Instant Answer API
    const apiRes = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`,
      {
        headers: { 'User-Agent': 'HyunkAIHub/1.0 (Mozilla/5.0)' },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.AbstractText) {
        results.push({
          title: data.Heading || cleanQuery,
          url: data.AbstractURL || 'https://duckduckgo.com/?q=' + encodeURIComponent(cleanQuery),
          snippet: data.AbstractText,
        });
      }

      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (topic.Text && topic.FirstURL && results.length < maxResults) {
            results.push({
              title: topic.Text.slice(0, 60) + '...',
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }
        }
      }
    }
  } catch {
    // API rate limit or network timeout - fallback below
  }

  // 2. Try DuckDuckGo HTML Lite scraping fallback for comprehensive results
  if (results.length < 3) {
    try {
      const htmlRes = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const regex = /<a class="result__url" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = regex.exec(html)) !== null && results.length < maxResults) {
          let rawUrl = match[1];
          // Unwrap duckduckgo uddg parameter if present
          if (rawUrl.includes('uddg=')) {
            const parsed = new URL(rawUrl, 'https://duckduckgo.com');
            const uddg = parsed.searchParams.get('uddg');
            if (uddg) rawUrl = decodeURIComponent(uddg);
          }
          const snippet = match[3].replace(/<[^>]+>/g, '').trim();
          const title = match[2].replace(/<[^>]+>/g, '').trim();

          if (rawUrl && snippet && !results.some((r) => r.url === rawUrl)) {
            results.push({
              title: title || cleanQuery,
              url: rawUrl,
              snippet,
            });
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // 3. Fallback: Wikipedia Summary API if results are still empty
  if (results.length === 0) {
    try {
      const wikiRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery.replace(/\s+/g, '_'))}`,
        {
          headers: { 'User-Agent': 'HyunkAIHub/1.0' },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        if (wikiData.extract) {
          results.push({
            title: wikiData.title || cleanQuery,
            url: wikiData.content_urls?.desktop?.page || 'https://en.wikipedia.org',
            snippet: wikiData.extract,
          });
        }
      }
    } catch {
      // Ignore
    }
  }

  if (results.length === 0) {
    return {
      results: [],
      summary: `No live search results found for query: "${cleanQuery}".`,
    };
  }

  const summary = results
    .map((r, i) => `[${i + 1}] ${r.title}\nSource: ${r.url}\n${r.snippet}`)
    .join('\n\n');

  return { results, summary };
}

// ---------------------------------------------------------------------------
// Code Interpreter
// ---------------------------------------------------------------------------

export interface CodeExecutionResult {
  stdout: string;
  returned: string;
  error?: string;
}

/**
 * Executes JavaScript inside an isolated VM sandbox.
 *
 * The sandbox intentionally exposes no `require`, no `process`, no filesystem and
 * no network access, so model generated code cannot reach the host.
 */
export function executeCodeInterpreterDetailed(
  code: string,
  language: string = 'javascript'
): CodeExecutionResult {
  const cleanCode = code.trim();
  if (!cleanCode) {
    return { stdout: '', returned: '', error: 'Empty code payload' };
  }

  if (language.toLowerCase() !== 'javascript' && language.toLowerCase() !== 'js') {
    return {
      stdout: '',
      returned: '',
      error: `Unsupported language "${language}". This sandbox executes JavaScript only.`,
    };
  }

  const logs: string[] = [];
  const format = (args: any[]) =>
    args
      .map((a) => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');

  const sandbox: Record<string, any> = {
    console: {
      log: (...args: any[]) => logs.push(format(args)),
      error: (...args: any[]) => logs.push('[ERROR] ' + format(args)),
      warn: (...args: any[]) => logs.push('[WARN] ' + format(args)),
      info: (...args: any[]) => logs.push('[INFO] ' + format(args)),
      table: (...args: any[]) => logs.push(format(args)),
    },
    print: (...args: any[]) => logs.push(format(args)),
    Math,
    Date,
    JSON,
    Intl,
    Array,
    Object,
    String,
    Number,
    Boolean,
    BigInt,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Promise,
    Error,
    TypeError,
    RangeError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    structuredClone,
  };

  try {
    const context = vm.createContext(sandbox);
    // Wrapped in a function so a top-level `return` is legal and the returned
    // value becomes the result of the script.
    const script = new vm.Script(`(function () {\n${cleanCode}\n})()`);
    const result = script.runInContext(context, { timeout: 5000, displayErrors: true });

    let returned = '';
    if (result !== undefined) {
      returned =
        typeof result === 'object'
          ? JSON.stringify(result, null, 2)
          : String(result);
    }

    return { stdout: logs.join('\n'), returned };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { stdout: logs.join('\n'), returned: '', error: message };
  }
}

/**
 * Real Code Interpreter Tool using isolated Node.js VM sandbox
 */
export async function executeCodeInterpreter(
  code: string,
  language: string = 'javascript'
): Promise<string> {
  const result = executeCodeInterpreterDetailed(code, language);

  if (result.error) {
    return `Runtime Error: ${result.error}${result.stdout ? `\n${result.stdout}` : ''}`;
  }

  let output = '';
  if (result.stdout) output += result.stdout;
  if (result.returned) {
    if (output) output += '\n';
    output += `Result: ${result.returned}`;
  }
  return output || 'Code executed successfully (no stdout returned).';
}

// ---------------------------------------------------------------------------
// Calculator (safe expression parser, no eval / no Function constructor)
// ---------------------------------------------------------------------------

const MATH_FUNCTIONS: Record<string, (value: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
  log10: Math.log10,
  log2: Math.log2,
  ln: Math.log,
  log: Math.log,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
};

const MATH_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

type Token = { type: 'number' | 'op' | 'ident' | 'lparen' | 'rparen' | 'comma'; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(input[i + 1] || ''))) {
      let number = '';
      while (i < input.length && /[0-9.]/.test(input[i])) {
        number += input[i];
        i++;
      }
      if (i < input.length && /[eE]/.test(input[i]) && /[0-9+-]/.test(input[i + 1] || '')) {
        number += input[i];
        i++;
        const sign = input[i];
        if (sign === '+' || sign === '-') {
          number += sign;
          i++;
        }
        while (i < input.length && /[0-9]/.test(input[i])) {
          number += input[i];
          i++;
        }
      }
      tokens.push({ type: 'number', value: number });
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      tokens.push({ type: 'ident', value: ident.toLowerCase() });
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'lparen', value: char });
      i++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'rparen', value: char });
      i++;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: char });
      i++;
      continue;
    }
    if ('+-*/%^'.includes(char)) {
      tokens.push({ type: 'op', value: char });
      i++;
      continue;
    }

    throw new Error(`Unexpected character "${char}"`);
  }

  return tokens;
}

class ExpressionParser {
  private tokens: Token[];
  private position = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): number {
    const value = this.parseExpression();
    if (this.position < this.tokens.length) {
      throw new Error('Unexpected trailing input');
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private parseExpression(): number {
    let left = this.parseTerm();
    while (this.peek()?.type === 'op' && '+-'.includes(this.peek()!.value)) {
      const operator = this.tokens[this.position++].value;
      const right = this.parseTerm();
      left = operator === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseUnary();
    while (this.peek()?.type === 'op' && '*/%'.includes(this.peek()!.value)) {
      const operator = this.tokens[this.position++].value;
      const right = this.parseUnary();
      if (operator === '*') left *= right;
      else if (operator === '/') {
        if (right === 0) throw new Error('Division by zero');
        left /= right;
      } else {
        if (right === 0) throw new Error('Modulo by zero');
        left %= right;
      }
    }
    return left;
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token?.type === 'op' && (token.value === '+' || token.value === '-')) {
      this.position++;
      const value = this.parseUnary();
      return token.value === '-' ? -value : value;
    }
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePrimary();
    const token = this.peek();
    if (token?.type === 'op' && token.value === '^') {
      this.position++;
      const exponent = this.parseUnary(); // right associative
      return Math.pow(base, exponent);
    }
    return base;
  }

  private parsePrimary(): number {
    const token = this.peek();
    if (!token) throw new Error('Unexpected end of expression');

    if (token.type === 'number') {
      this.position++;
      return Number(token.value);
    }

    if (token.type === 'lparen') {
      this.position++;
      const value = this.parseExpression();
      if (this.peek()?.type !== 'rparen') throw new Error('Missing closing parenthesis');
      this.position++;
      return value;
    }

    if (token.type === 'ident') {
      this.position++;
      const name = token.value;

      if (this.peek()?.type === 'lparen') {
        this.position++;
        const args: number[] = [];
        if (this.peek()?.type !== 'rparen') {
          do {
            args.push(this.parseExpression());
            if (this.peek()?.type === 'comma') {
              this.position++;
              continue;
            }
            break;
          } while (true);
        }
        if (this.peek()?.type !== 'rparen') throw new Error('Missing closing parenthesis');
        this.position++;

        if (name === 'min' || name === 'max') {
          if (args.length < 2) throw new Error(`${name}() needs at least two arguments`);
          return name === 'min' ? Math.min(...args) : Math.max(...args);
        }
        if (name === 'pow') {
          if (args.length !== 2) throw new Error('pow() needs exactly two arguments');
          return Math.pow(args[0], args[1]);
        }

        const fn = Object.prototype.hasOwnProperty.call(MATH_FUNCTIONS, name)
          ? MATH_FUNCTIONS[name]
          : undefined;
        if (!fn) throw new Error(`Unknown function "${name}"`);
        if (args.length !== 1) throw new Error(`${name}() needs exactly one argument`);
        return fn(args[0]);
      }

      if (Object.prototype.hasOwnProperty.call(MATH_CONSTANTS, name)) return MATH_CONSTANTS[name];
      throw new Error(`Unknown identifier "${name}"`);
    }

    throw new Error(`Unexpected token "${token.value}"`);
  }
}

/**
 * Evaluates a mathematical expression safely (own parser, no eval).
 */
export function evaluateExpression(expression: string): number {
  const tokens = tokenize(expression);
  if (!tokens.length) throw new Error('Empty expression');
  return new ExpressionParser(tokens).parse();
}

/**
 * Real Calculator / Math Evaluator Tool
 */
export function executeCalculator(expression: string): string {
  const cleanExpr = expression.trim();
  if (!cleanExpr) return 'Error: Empty mathematical expression';

  try {
    const value = evaluateExpression(cleanExpr);
    const rounded = Number.isInteger(value) ? value : Number(value.toFixed(10));
    return `${cleanExpr} = ${rounded}`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Calculation Error: ${msg}`;
  }
}

// ---------------------------------------------------------------------------
// Date & Time
// ---------------------------------------------------------------------------

/**
 * Returns the current date and time, optionally in a specific IANA time zone.
 */
export function executeDateTime(timeZone?: string): string {
  const now = new Date();

  if (timeZone) {
    try {
      const formatted = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(now);
      return `Current time in ${timeZone}: ${formatted}`;
    } catch {
      return `Unknown time zone "${timeZone}". Available example: UTC, Asia/Makassar, Asia/Jakarta.`;
    }
  }

  return [
    `Current UTC time: ${now.toISOString()}`,
    `Local server time: ${now.toString()}`,
    `Unix timestamp: ${Math.floor(now.getTime() / 1000)}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const MAX_RESPONSE_CHARS = 8000;

function extractText(body: string, contentType: string): string {
  if (contentType.includes('json')) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2).slice(0, MAX_RESPONSE_CHARS);
    } catch {
      return body.slice(0, MAX_RESPONSE_CHARS);
    }
  }

  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
    return (
      body
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_RESPONSE_CHARS)
    );
  }

  return body.slice(0, MAX_RESPONSE_CHARS);
}

/**
 * Real URL Content Fetcher
 */
export async function executeFetchUrl(urlStr: string): Promise<string> {
  // The SSRF guard runs outside the try block on purpose: a blocked target is a
  // hard failure the agent has to know about, not a "successful" empty answer.
  const parsed = assertSafeUrl(urlStr);

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HyunkAIHub/1.0',
        Accept: 'text/html,text/plain,application/json,*/*',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return `HTTP Error ${res.status}: ${res.statusText}`;
    }

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    return extractText(text, contentType) || 'Empty page response';
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Fetch failed: ${msg}`;
  }
}

/**
 * Performs a custom HTTP request (method, headers, body) against an API.
 */
export async function executeHttpRequest(args: {
  method?: string;
  url?: string;
  input?: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ output: string; data?: any }> {
  const method = (args.method || 'GET').toUpperCase();
  const url = args.url || (typeof args.input === 'string' ? args.input : '');

  if (!url) throw new Error('http_request requires a url.');

  const parsed = assertSafeUrl(url);

  const headers: Record<string, string> = {
    'User-Agent': 'HyunkAIHub/1.0',
    Accept: 'application/json, text/plain, */*',
    ...(args.headers || {}),
  };

  let body: string | undefined;
  if (args.body !== undefined && args.body !== null) {
    if (typeof args.body === 'string') {
      body = args.body;
    } else {
      body = JSON.stringify(args.body);
      if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  const res = await fetch(parsed.toString(), {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
    signal: AbortSignal.timeout(10000),
  });

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  const extracted = extractText(text, contentType);

  let data: any = undefined;
  if (contentType.includes('json')) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  return {
    output: `HTTP ${res.status} ${res.statusText}\n${extracted}`,
    data,
  };
}

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

/**
 * Universal Tool Dispatcher (legacy signature).
 */
export async function runAgentTool(
  toolName: string,
  queryOrCode: string,
  target?: string
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  const normalized = toolName.toLowerCase().trim();

  try {
    let output = '';
    let data: any = undefined;

    if (normalized.includes('search') || normalized === 'web_search') {
      const searchRes = await executeWebSearch(queryOrCode);
      output = searchRes.summary;
      data = searchRes.results;
    } else if (
      normalized.includes('code') ||
      normalized.includes('interpreter') ||
      normalized === 'python_runner'
    ) {
      output = await executeCodeInterpreter(queryOrCode, target || 'javascript');
    } else if (normalized.includes('calc') || normalized.includes('math')) {
      output = executeCalculator(queryOrCode);
    } else if (normalized.includes('fetch') || normalized.includes('url')) {
      output = await executeFetchUrl(target || queryOrCode);
    } else if (normalized.includes('http')) {
      const res = await executeHttpRequest({ url: target || queryOrCode });
      output = res.output;
      data = res.data;
    } else if (normalized.includes('date') || normalized.includes('time')) {
      output = executeDateTime(target);
    } else {
      // Default to general analysis / code interpreter
      output = await executeCodeInterpreter(queryOrCode, 'javascript');
    }

    return {
      tool: toolName,
      target,
      success: true,
      output,
      data,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      tool: toolName,
      target,
      success: false,
      output: `Tool Execution Error: ${msg}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Executes a tool call parsed from the agent protocol.
 */
/**
 * Formats a security report for the model: the structured summary first, then
 * the raw evidence.
 */
function formatSecurityReport(report: SecurityReport): string {
  const lines: string[] = [];

  lines.push(`SECURITY SCAN: ${report.finalUrl}`);
  lines.push(`Score: ${report.score}/100 (grade ${report.grade})`);
  lines.push(report.summary);
  lines.push('');

  if (report.findings.length) {
    lines.push('FINDINGS');
    report.findings.forEach((finding, index) => {
      lines.push(`${index + 1}. [${finding.severity}] ${finding.title}`);
      lines.push(`   ${finding.detail}`);
      if (finding.evidence) lines.push(`   Evidence: ${finding.evidence}`);
      if (finding.recommendation) lines.push(`   Fix: ${finding.recommendation}`);
    });
  } else {
    lines.push('FINDINGS: none.');
  }

  lines.push('');
  lines.push('RAW DATA');
  lines.push(JSON.stringify(report.raw, null, 2));

  return lines.join('\n');
}

/**
 * Formats a page inspection for the model.
 */
function formatPageInspection(report: PageInspection): string {
  const lines: string[] = [];

  lines.push(`PAGE INSPECTION: ${report.finalUrl}`);
  lines.push(
    `Status: ${report.status} ${report.statusText} | ${report.responseTimeMs}ms | ${report.contentType} | compressed: ${report.compressed}`
  );
  lines.push(`Title: ${report.meta.title || '(none)'}`);
  lines.push(`Description: ${report.meta.description || '(none)'}`);
  lines.push(`Canonical: ${report.meta.canonical || '(none)'}`);
  lines.push(`Language: ${report.meta.lang || '(none)'} | Viewport: ${report.meta.viewport || '(none)'}`);
  lines.push(
    `Open Graph: title=${report.meta.ogTitle || '(none)'} description=${report.meta.ogDescription || '(none)'} image=${report.meta.ogImage || '(none)'}`
  );
  lines.push(`Twitter card: ${report.meta.twitterCard || '(none)'}`);
  lines.push(
    `Headings: h1=${report.headings.counts.h1 || 0} h2=${report.headings.counts.h2 || 0} h3=${report.headings.counts.h3 || 0}`
  );
  if (report.headings.h1.length) {
    lines.push(`H1 titles: ${report.headings.h1.join(' | ')}`);
  }
  lines.push(
    `Images: ${report.images.total} total, ${report.images.withoutAlt} without alt, ${report.images.lazy} lazy`
  );
  lines.push(
    `Links: ${report.links.total} total, ${report.links.internal} internal, ${report.links.external} external, ${report.links.nofollow} nofollow, ${report.links.withoutText} without anchor text`
  );
  lines.push(
    `Content: ${report.words} words, ${report.scripts} scripts, ${report.stylesheets} stylesheets, ${report.forms} forms`
  );

  if (report.issues.length) {
    lines.push('');
    lines.push('ISSUES');
    report.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. [${issue.severity}] ${issue.message}`);
    });
  }

  return lines.join('\n');
}

/**
 * Executes one of the new dedicated tools. Returns null when the name is not
 * one of them, so the caller can fall back to the legacy matcher.
 */
async function executeNamedTool(
  name: string,
  args: Record<string, any>,
  call: AgentToolCall
): Promise<{ output: string; data?: any } | null> {
  const input = typeof args.input === 'string' && args.input ? args.input : call.payload;

  switch (name) {
    case 'website_security_scan': {
      const url = (typeof args.url === 'string' && args.url) || input;
      if (!url) throw new Error('A URL is required to scan a website.');
      const report = await scanWebsiteSecurity(url, assertSafeUrl, {
        deep: args.deep === true || args.deep === 'true',
      });
      return { output: formatSecurityReport(report), data: report };
    }

    case 'dns_lookup': {
      const host =
        (typeof args.host === 'string' && args.host) ||
        (typeof args.hostname === 'string' && args.hostname) ||
        (typeof args.domain === 'string' && args.domain) ||
        input;
      if (!host) throw new Error('A hostname is required, for example example.com.');
      const cleanHost = host.replace(/^https?:\/\//i, '').split('/')[0];
      const info = await resolveHost(cleanHost);
      return {
        output: `DNS RECORDS FOR ${cleanHost}\n${JSON.stringify(info, null, 2)}`,
        data: info,
      };
    }

    case 'page_inspector': {
      const url = (typeof args.url === 'string' && args.url) || input;
      if (!url) throw new Error('A URL is required to inspect a page.');
      const report = await inspectPage(url, assertSafeUrl);
      return { output: formatPageInspection(report), data: report };
    }

    case 'hash_calculate': {
      const text = typeof args.text === 'string' ? args.text : input;
      const result = calculateHash(
        text,
        typeof args.algorithm === 'string' ? args.algorithm : 'sha256',
        typeof args.key === 'string' && args.key ? args.key : undefined
      );
      return {
        output: `${result.algorithm}: ${result.digest}\nbase64: ${result.base64}\nlength: ${result.length} bytes`,
        data: result,
      };
    }

    case 'base64_codec': {
      const text = typeof args.text === 'string' ? args.text : input;
      const mode = args.mode === 'decode' ? 'decode' : 'encode';
      const result = base64Codec(text, mode);
      return { output: result.result, data: result };
    }

    case 'json_select': {
      const raw = typeof args.json === 'string' ? args.json : input;
      let document: unknown;
      try {
        document = JSON.parse(raw);
      } catch {
        throw new Error('The "json" argument is not valid JSON.');
      }
      const path = typeof args.path === 'string' ? args.path : '';
      const values = selectJsonPath(document, path);
      return {
        output: values.length
          ? `MATCHES (${values.length}):\n${values
              .map((value) => (typeof value === 'object' ? JSON.stringify(value) : String(value)))
              .join('\n')}`
          : 'No value matched the path.',
        data: values,
      };
    }

    case 'regex_extract': {
      const text = typeof args.text === 'string' ? args.text : input;
      const pattern = typeof args.pattern === 'string' ? args.pattern : '';
      const flags = typeof args.flags === 'string' ? args.flags : 'g';
      const result = extractWithRegex(text, pattern, flags);
      return {
        output: result.count
          ? `MATCHES (${result.count}${result.truncated ? ', truncated' : ''}):\n${result.matches
              .map((m) => `${m.match}${m.groups.length ? ` | groups: ${m.groups.join(', ')}` : ''}`)
              .join('\n')}`
          : 'The pattern did not match anything.',
        data: result,
      };
    }

    case 'unit_convert': {
      const value = Number(args.value);
      const result = convertUnit(
        value,
        typeof args.from === 'string' ? args.from : '',
        typeof args.to === 'string' ? args.to : '',
        typeof args.category === 'string' ? args.category : undefined
      );
      return { output: result.result, data: result };
    }

    case 'password_entropy': {
      const password = typeof args.password === 'string' ? args.password : input;
      const analysis = analyzePassword(password);
      return {
        output: [
          `Length: ${analysis.length}`,
          `Entropy: ${analysis.entropyBits} bits`,
          `Character pool: ${analysis.charsetSize} (${analysis.pool.join(', ') || 'none'})`,
          `Strength: ${analysis.strength}`,
          `Estimated crack time: ${analysis.estimatedCrackTime}`,
          `Common password: ${analysis.isCommonPassword ? 'yes' : 'no'}`,
          `Suggestions: ${analysis.suggestions.join(' ')}`,
        ].join('\n'),
        data: analysis,
      };
    }

    case 'cron_next': {
      const expression = typeof args.expression === 'string' ? args.expression : input;
      const count = Math.min(20, Math.max(1, Number(args.count) || 5));
      const runs = nextCronRuns(expression, count);
      return { output: `NEXT RUNS:\n${runs.join('\n')}`, data: runs };
    }

    case 'text_diff': {
      const original = typeof args.original === 'string' ? args.original : '';
      const updated = typeof args.updated === 'string' ? args.updated : '';
      const result = diffText(original, updated);
      return {
        output: result.changed
          ? `+${result.added} / -${result.removed} lines\n${result.lines
              .map((line) =>
                line.type === 'added' ? `+ ${line.text}` : line.type === 'removed' ? `- ${line.text}` : `  ${line.text}`
              )
              .join('\n')}`
          : 'The two texts are identical.',
        data: result,
      };
    }

    default:
      return null;
  }
}

export async function executeAgentToolCall(call: AgentToolCall): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  const normalized = call.tool.toLowerCase().trim();
  const args = call.args || {};
  const input: string =
    typeof args.input === 'string' && args.input
      ? args.input
      : typeof args.query === 'string'
        ? args.query
        : call.payload;

  try {
    let output = '';
    let data: any = undefined;

    // The dedicated tools are matched by their exact name so that a name
    // such as "hash_calculate" can never be mistaken for the calculator.
    const named = await executeNamedTool(normalized, args, call);

    if (named) {
      output = named.output;
      data = named.data;
    } else if (normalized.includes('search')) {
      const searchRes = await executeWebSearch(
        typeof args.query === 'string' ? args.query : input
      );
      output = searchRes.summary;
      data = searchRes.results;
    } else if (normalized.includes('http')) {
      const res = await executeHttpRequest({
        method: typeof args.method === 'string' ? args.method : 'GET',
        url: typeof args.url === 'string' ? args.url : call.target,
        headers: args.headers,
        body: args.body,
      });
      output = res.output;
      data = res.data;
    } else if (normalized.includes('fetch') || normalized.includes('url')) {
      output = await executeFetchUrl(
        (typeof args.url === 'string' ? args.url : call.target) || input
      );
    } else if (normalized.includes('calc') || normalized.includes('math')) {
      output = executeCalculator(input);
    } else if (normalized.includes('date') || normalized.includes('clock') || normalized.includes('time')) {
      output = executeDateTime(
        typeof args.timezone === 'string' ? args.timezone : call.target
      );
    } else {
      output = await executeCodeInterpreter(input, 'javascript');
    }

    return {
      tool: call.tool,
      target: call.target,
      success: true,
      output,
      data,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      tool: call.tool,
      target: call.target,
      success: false,
      output: `Tool Execution Error: ${msg}`,
      durationMs: Date.now() - startTime,
    };
  }
}
