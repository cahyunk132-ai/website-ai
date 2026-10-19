/**
 * Hyunk AI Hub - Utility Tool Suite (server side only)
 *
 * Small, dependency free helpers the agent can use while it works:
 * hashing, base64, JSON path extraction, regular expression extraction with a
 * hard timeout, unit conversion, password entropy, cron scheduling and text
 * diffing.
 */

import crypto from 'node:crypto';
import vm from 'node:vm';

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export interface HashResult {
  algorithm: string;
  digest: string;
  base64: string;
  length: number;
}

/**
 * Calculates a digest (optionally a keyed HMAC) of the given text.
 */
export function calculateHash(
  text: string,
  algorithm = 'sha256',
  key?: string
): HashResult {
  const normalized = (algorithm || 'sha256').toLowerCase().replace(/-/g, '');

  const allowed = ['sha256', 'sha1', 'sha512', 'md5'];
  if (!allowed.includes(normalized)) {
    throw new Error(
      `Unsupported algorithm "${algorithm}". Use one of: ${allowed.join(', ')}.`
    );
  }

  const buffer = Buffer.from(text ?? '', 'utf8');
  const digest = key
    ? crypto.createHmac(normalized, key).update(buffer).digest()
    : crypto.createHash(normalized).update(buffer).digest();

  return {
    algorithm: normalized,
    digest: digest.toString('hex'),
    base64: digest.toString('base64'),
    length: digest.length,
  };
}

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------

export function base64Codec(
  text: string,
  mode: 'encode' | 'decode' = 'encode'
): { mode: string; result: string } {
  if (mode === 'decode') {
    let decoded: string;
    try {
      decoded = Buffer.from(text ?? '', 'base64').toString('utf8');
    } catch {
      throw new Error('The input is not valid base64.');
    }
    return { mode, result: decoded };
  }

  return {
    mode,
    result: Buffer.from(text ?? '', 'utf8').toString('base64'),
  };
}

// ---------------------------------------------------------------------------
// JSON path selection
// ---------------------------------------------------------------------------

/**
 * Extracts values from a JSON document with a dotted path.
 *
 * Supported syntax: `a.b.c`, `a[0].b`, `a[*].b` and `a.*.b`.
 */
export function selectJsonPath(document: unknown, path: string): unknown[] {
  if (!path || !path.trim()) {
    throw new Error('A JSON path is required, for example "data.items[*].id".');
  }

  const segments: Array<{ key: string; wildcard: boolean }> = [];

  // Normalise the bracket syntax: items[0] -> items.0 and items[*] -> items.*.
  const normalized = path
    .replace(/\[\s*(\*)\s*\]/g, '.*')
    .replace(/\[\s*(\d+)\s*\]/g, '.$1');

  for (const raw of normalized.split('.')) {
    const segment = raw.trim();
    if (!segment) continue;
    if (segment === '*') {
      segments.push({ key: '*', wildcard: true });
    } else {
      segments.push({ key: segment, wildcard: false });
    }
  }

  let current: unknown[] = [document];

  for (const segment of segments) {
    const next: unknown[] = [];

    for (const node of current) {
      if (node === null || node === undefined) continue;

      if (segment.wildcard) {
        if (Array.isArray(node)) {
          next.push(...node);
        } else if (typeof node === 'object') {
          next.push(...Object.values(node as Record<string, unknown>));
        }
        continue;
      }

      if (Array.isArray(node)) {
        const index = Number(segment.key);
        if (Number.isInteger(index)) {
          if (index >= 0 && index < node.length) next.push(node[index]);
        }
        continue;
      }

      if (typeof node === 'object') {
        const value = (node as Record<string, unknown>)[segment.key];
        if (value !== undefined) next.push(value);
      }
    }

    current = next;
  }

  return current;
}

// ---------------------------------------------------------------------------
// Regular expressions (with a hard timeout)
// ---------------------------------------------------------------------------

export interface RegexResult {
  pattern: string;
  flags: string;
  count: number;
  matches: Array<{ match: string; index: number; groups: string[] }>;
  truncated: boolean;
}

const REGEX_MAX_INPUT = 100_000;
const REGEX_MAX_MATCHES = 200;
const REGEX_TIMEOUT_MS = 400;

/**
 * Runs a regular expression against a text.
 *
 * The expression is evaluated inside a VM with a timeout so a catastrophic
 * backtracking pattern can never block the event loop.
 */
export function extractWithRegex(
  text: string,
  pattern: string,
  flags = 'g'
): RegexResult {
  if (!pattern) throw new Error('A regular expression pattern is required.');

  const source = (text ?? '').slice(0, REGEX_MAX_INPUT);
  const truncatedInput = (text ?? '').length > REGEX_MAX_INPUT;

  const script = `
    const text = input;
    const re = new RegExp(pattern, flags);
    const out = [];
    let truncated = false;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (out.length >= limit) { truncated = true; break; }
      out.push({ match: m[0], index: m.index, groups: m.slice(1).map(g => g === undefined ? null : String(g)) });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    out;
  `;

  let result: Array<{ match: string; index: number; groups: (string | null)[] }> = [];

  try {
    result = vm.runInNewContext(
      script,
      {
        input: source,
        pattern,
        flags,
        limit: REGEX_MAX_MATCHES,
      },
      { timeout: REGEX_TIMEOUT_MS }
    ) as typeof result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `The regular expression could not be evaluated: ${message}. Check the pattern or simplify it.`
    );
  }

  return {
    pattern,
    flags,
    count: result.length,
    matches: result.map((m) => ({ match: m.match, index: m.index, groups: m.groups as string[] })),
    truncated: truncatedInput || result.length >= REGEX_MAX_MATCHES,
  };
}

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

const LENGTH: Record<string, number> = {
  mm: 0.001, cm: 0.01, m: 1, km: 1000,
  in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344, nmi: 1852,
};

const MASS: Record<string, number> = {
  mg: 0.001, g: 1, kg: 1000, t: 1_000_000,
  oz: 28.349523125, lb: 453.59237, st: 6350.29318,
};

const DATA: Record<string, number> = {
  b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4,
  kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4,
};

const TIME: Record<string, number> = {
  ms: 0.001, s: 1, min: 60, h: 3600, d: 86400, wk: 604800, y: 31557600,
};

/**
 * Temperature is affine rather than multiplicative, so it gets its own
 * conversion tables: one that normalises any unit to Celsius and one that
 * converts Celsius to any unit.
 */
const TEMP_TO_CELSIUS: Record<string, (value: number) => number> = {
  c: (v) => v,
  f: (v) => (v - 32) / 1.8,
  k: (v) => v - 273.15,
};

const TEMP_FROM_CELSIUS: Record<string, (celsius: number) => number> = {
  c: (v) => v,
  f: (v) => v * 1.8 + 32,
  k: (v) => v + 273.15,
};

const TEMP_ALIASES: Record<string, string> = {
  celsius: 'c',
  centigrade: 'c',
  fahrenheit: 'f',
  kelvin: 'k',
};

/**
 * Converts a value between two units of the same family.
 */
export function convertUnit(
  value: number,
  from: string,
  to: string,
  category?: string
): { value: number; from: string; to: string; category: string; result: string } {
  const families: Array<[string, Record<string, number>]> = [
    ['length', LENGTH],
    ['mass', MASS],
    ['data', DATA],
    ['time', TIME],
    ['temperature', {}],
  ];

  const normalize = (unit: string) => unit.trim().toLowerCase().replace(/[^a-z]/g, '');

  const source = TEMP_ALIASES[normalize(from)] || normalize(from);
  const target = TEMP_ALIASES[normalize(to)] || normalize(to);

  if (!Number.isFinite(value)) {
    throw new Error('The value must be a number.');
  }

  // Temperature first: it cannot use the multiplicative table.
  const wantsTemperature =
    (category && normalize(category) === 'temperature') ||
    (TEMP_TO_CELSIUS[source] !== undefined && TEMP_TO_CELSIUS[target] !== undefined);

  if (wantsTemperature) {
    if (!TEMP_TO_CELSIUS[source] || !TEMP_FROM_CELSIUS[target]) {
      throw new Error('Unknown temperature unit. Supported: c, f, k.');
    }
    const celsius = TEMP_TO_CELSIUS[source](value);
    const result = TEMP_FROM_CELSIUS[target](celsius);
    return {
      value,
      from,
      to,
      category: 'temperature',
      result: `${Number(result.toPrecision(12))} ${target}`,
    };
  }

  let matched: [string, Record<string, number>] | null = null;

  if (category) {
    const wanted = normalize(category);
    matched = families.find(([name]) => name === wanted) || null;
    if (!matched) {
      throw new Error(
        `Unknown category "${category}". Use one of: ${families.map(([n]) => n).join(', ')}.`
      );
    }
  } else {
    for (const family of families) {
      if (family[1][source] !== undefined && family[1][target] !== undefined) {
        matched = family;
        break;
      }
    }
  }

  if (!matched) {
    throw new Error(
      `Cannot convert "${from}" to "${to}". Both units must belong to the same family: length, mass, data or time.`
    );
  }

  const [name, table] = matched;

  if (table[source] === undefined || table[target] === undefined) {
    throw new Error(
      `Unknown unit. Supported: ${Object.keys(table).join(', ')}.`
    );
  }

  const base = value * table[source];
  const result = base / table[target];

  return {
    value,
    from,
    to,
    category: name,
    result: `${Number(result.toPrecision(12))} ${target}`,
  };
}

// ---------------------------------------------------------------------------
// Password strength
// ---------------------------------------------------------------------------

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '12345678', '123456789', 'qwerty',
  'qwerty123', 'admin', 'administrator', 'letmein', 'welcome', 'monkey', 'dragon',
  'iloveyou', 'sunshine', 'princess', 'football', 'baseball', 'login', 'abc123',
  'passw0rd', 'master', 'shadow', 'superman', 'trustno1', 'hello', 'charlie',
  'donald', '000000', '111111', 'secret', 'hyunk', 'hyunkai',
]);

export interface PasswordAnalysis {
  length: number;
  entropyBits: number;
  charsetSize: number;
  pool: string[];
  strength: 'very weak' | 'weak' | 'fair' | 'strong' | 'very strong';
  estimatedCrackTime: string;
  isCommonPassword: boolean;
  suggestions: string[];
}

/**
 * Estimates the strength of a password locally. Nothing is sent anywhere.
 */
export function analyzePassword(password: string): PasswordAnalysis {
  const value = password ?? '';
  const pool: string[] = [];
  let charsetSize = 0;

  if (/[a-z]/.test(value)) {
    pool.push('lowercase letters');
    charsetSize += 26;
  }
  if (/[A-Z]/.test(value)) {
    pool.push('uppercase letters');
    charsetSize += 26;
  }
  if (/[0-9]/.test(value)) {
    pool.push('digits');
    charsetSize += 10;
  }
  if (/[^A-Za-z0-9]/.test(value)) {
    pool.push('symbols');
    charsetSize += 33;
  }

  const uniqueChars = new Set(value).size;
  const entropyBits = value.length
    ? Math.round(value.length * Math.log2(Math.max(charsetSize, 2)) * (uniqueChars / value.length) + value.length * Math.log2(Math.max(charsetSize, 2)) * 0.5)
    : 0;

  const isCommonPassword = COMMON_PASSWORDS.has(value.toLowerCase());

  let strength: PasswordAnalysis['strength'];
  if (!value.length) strength = 'very weak';
  else if (isCommonPassword || entropyBits < 40) strength = 'very weak';
  else if (entropyBits < 60) strength = 'weak';
  else if (entropyBits < 80) strength = 'fair';
  else if (entropyBits < 110) strength = 'strong';
  else strength = 'very strong';

  const guesses = Math.pow(Math.max(charsetSize, 2), value.length);
  const seconds = guesses / 1e10; // 10 billion guesses per second
  let crackTime: string;
  if (seconds < 1) crackTime = 'less than a second';
  else if (seconds < 60) crackTime = `${Math.round(seconds)} seconds`;
  else if (seconds < 3600) crackTime = `${Math.round(seconds / 60)} minutes`;
  else if (seconds < 86400) crackTime = `${Math.round(seconds / 3600)} hours`;
  else if (seconds < 2592000) crackTime = `${Math.round(seconds / 86400)} days`;
  else if (seconds < 31536000) crackTime = `${Math.round(seconds / 2592000)} months`;
  else crackTime = `${(seconds / 31536000).toPrecision(3)} years`;

  const suggestions: string[] = [];
  if (value.length < 12) suggestions.push('Use at least 12 characters.');
  if (!/[A-Z]/.test(value)) suggestions.push('Mix in uppercase letters.');
  if (!/[0-9]/.test(value)) suggestions.push('Add digits.');
  if (/[^A-Za-z0-9]/.test(value) === false) suggestions.push('Add symbols.');
  if (isCommonPassword) suggestions.push('This password is in the list of the most used ones.');
  if (/^[A-Z][a-z]+\d{1,4}[!@#$%^&*]?$/.test(value)) {
    suggestions.push('The structure follows a predictable pattern (Word+Year+Symbol).');
  }
  if (suggestions.length === 0) suggestions.push('No obvious weakness found, keep using a password manager.');

  return {
    length: value.length,
    entropyBits,
    charsetSize,
    pool,
    strength,
    estimatedCrackTime: crackTime,
    isCommonPassword,
    suggestions,
  };
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

const CRON_ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

function parseCronField(
  field: string,
  min: number,
  max: number,
  names?: string[]
): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const token = part.trim().toLowerCase();

    if (token === '*') {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    const [rangePart, stepPart] = token.split('/');
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isFinite(step) || step < 1) {
      throw new Error(`Invalid step "${stepPart}" in the cron expression.`);
    }

    let start = min;
    let end = max;

    if (rangePart !== '*') {
      const bits = rangePart.split('-');
      const toNumber = (raw: string) => {
        const lowered = raw.toLowerCase();
        if (names) {
          const index = names.indexOf(lowered.slice(0, 3));
          if (index >= 0) return index;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          throw new Error(`Invalid value "${raw}" in the cron expression.`);
        }
        return parsed;
      };

      start = toNumber(bits[0]);
      end = bits.length > 1 ? toNumber(bits[1]) : start;

      if (end < start) {
        throw new Error(`Invalid range "${rangePart}" in the cron expression.`);
      }
    }

    for (let i = start; i <= end; i += step) {
      if (i >= min && i <= max) values.add(i);
    }
  }

  return values;
}

/**
 * Returns the next execution times of a 5 field cron expression.
 */
export function nextCronRuns(expression: string, count = 5, from = new Date()): string[] {
  const raw = (expression || '').trim().toLowerCase();
  const normalized = CRON_ALIASES[raw] || raw;
  const parts = normalized.split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(
      'A cron expression must have 5 fields: minute hour day-of-month month day-of-week.'
    );
  }

  const fields: CronFields = {
    minutes: parseCronField(parts[0], 0, 59),
    hours: parseCronField(parts[1], 0, 23),
    daysOfMonth: parseCronField(parts[2], 1, 31),
    months: parseCronField(parts[3], 1, 12, MONTH_NAMES),
    daysOfWeek: parseCronField(parts[4], 0, 6, DAY_NAMES),
  };

  const results: string[] = [];
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const limit = 1000 * 60 * 24 * 366 * 5; // five years of minutes
  let guard = 0;

  while (results.length < count && guard < limit) {
    guard += 1;

    if (
      fields.minutes.has(cursor.getMinutes()) &&
      fields.hours.has(cursor.getHours()) &&
      fields.months.has(cursor.getMonth() + 1)
    ) {
      const domRestricted = parts[2].trim() !== '*';
      const dowRestricted = parts[4].trim() !== '*';

      const domMatch = fields.daysOfMonth.has(cursor.getDate());
      const dowMatch = fields.daysOfWeek.has(cursor.getDay());

      // When both day fields are restricted, cron uses an OR.
      const dayMatches =
        domRestricted && dowRestricted ? domMatch || dowMatch : domMatch && dowMatch;

      if (dayMatches) {
        results.push(cursor.toISOString());
      }
    }

    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  if (!results.length) {
    throw new Error('The cron expression never matches, check the fields.');
  }

  return results;
}

// ---------------------------------------------------------------------------
// Text diff
// ---------------------------------------------------------------------------

export interface DiffResult {
  added: number;
  removed: number;
  changed: boolean;
  lines: Array<{ type: 'same' | 'added' | 'removed'; text: string }>;
}

/**
 * Produces a line based diff of two texts (a simple LCS implementation).
 */
export function diffText(original: string, updated: string): DiffResult {
  const a = (original ?? '').split('\n');
  const b = (updated ?? '').split('\n');

  const rows = a.length;
  const cols = b.length;

  // Keep the matrix small enough to stay fast.
  const lcs: number[][] = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));

  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines: DiffResult['lines'] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;

  while (i < rows && j < cols) {
    if (a[i] === b[j]) {
      lines.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ type: 'removed', text: a[i] });
      removed += 1;
      i += 1;
    } else {
      lines.push({ type: 'added', text: b[j] });
      added += 1;
      j += 1;
    }
  }

  while (i < rows) {
    lines.push({ type: 'removed', text: a[i] });
    removed += 1;
    i += 1;
  }

  while (j < cols) {
    lines.push({ type: 'added', text: b[j] });
    added += 1;
    j += 1;
  }

  return { added, removed, changed: added > 0 || removed > 0, lines };
}
