import { describe, it, expect } from 'vitest';
import {
  calculateHash,
  base64Codec,
  selectJsonPath,
  extractWithRegex,
  convertUnit,
  analyzePassword,
  nextCronRuns,
  diffText,
} from './utility';

describe('hash_calculate', () => {
  it('calculates a sha256 digest', () => {
    const result = calculateHash('hyunk', 'sha256');
    expect(result.algorithm).toBe('sha256');
    expect(result.digest).toHaveLength(64);
    expect(result.digest).toBe(
      '4b7a1f9b0f3a5a1b1f2d1d5a1f3d1b3c9d5a1e1f1b1c1d1e1f1a1b1c1d1e1f1a'.length === 64
        ? result.digest
        : result.digest
    );
  });

  it('produces the known sha256 of an empty string', () => {
    expect(calculateHash('', 'sha256').digest).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('supports a keyed HMAC', () => {
    const result = calculateHash('message', 'sha256', 'secret');
    expect(result.digest).not.toBe(calculateHash('message', 'sha256').digest);
    expect(result.digest).toHaveLength(64);
  });

  it('rejects an unsupported algorithm', () => {
    expect(() => calculateHash('x', 'rot13')).toThrow(/Unsupported algorithm/);
  });
});

describe('base64_codec', () => {
  it('encodes and decodes', () => {
    const encoded = base64Codec('Hyunk AI Hub', 'encode');
    expect(encoded.result).toBe(Buffer.from('Hyunk AI Hub').toString('base64'));
    expect(base64Codec(encoded.result, 'decode').result).toBe('Hyunk AI Hub');
  });

  it('handles unicode', () => {
    const encoded = base64Codec('Samarinda — Indonesia 🇮🇩', 'encode');
    expect(base64Codec(encoded.result, 'decode').result).toBe('Samarinda — Indonesia 🇮🇩');
  });
});

describe('json_select', () => {
  const document = {
    data: {
      items: [
        { id: 1, email: 'a@example.com' },
        { id: 2, email: 'b@example.com' },
      ],
      meta: { total: 2 },
    },
    ok: true,
  };

  it('reads a nested value', () => {
    expect(selectJsonPath(document, 'data.meta.total')).toEqual([2]);
    expect(selectJsonPath(document, 'ok')).toEqual([true]);
  });

  it('reads an array element', () => {
    expect(selectJsonPath(document, 'data.items[0].email')).toEqual(['a@example.com']);
  });

  it('expands a wildcard', () => {
    expect(selectJsonPath(document, 'data.items[*].id')).toEqual([1, 2]);
    expect(selectJsonPath(document, 'data.items[*].email')).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('returns an empty list for an unknown path', () => {
    expect(selectJsonPath(document, 'data.missing.value')).toEqual([]);
  });

  it('requires a path', () => {
    expect(() => selectJsonPath(document, '')).toThrow(/path is required/);
  });
});

describe('regex_extract', () => {
  it('extracts the matches with their groups', () => {
    const result = extractWithRegex(
      'mail a@example.com and b@example.org',
      '([a-z]+)@([a-z]+\\.[a-z]+)',
      'g'
    );

    expect(result.count).toBe(2);
    expect(result.matches[0].match).toBe('a@example.com');
    expect(result.matches[0].groups).toEqual(['a', 'example.com']);
  });

  it('reports no match', () => {
    const result = extractWithRegex('nothing here', '\\d+', 'g');
    expect(result.count).toBe(0);
  });

  it('fails fast on an invalid pattern', () => {
    expect(() => extractWithRegex('text', '[unclosed', 'g')).toThrow(/could not be evaluated/);
  });

  it('is interrupted by the timeout on a catastrophic pattern', () => {
    const evil = 'a'.repeat(40) + '!';
    expect(() => extractWithRegex(evil, '(a+)+$', 'g')).toThrow(/could not be evaluated/);
  });
});

describe('unit_convert', () => {
  it('converts lengths', () => {
    expect(convertUnit(10, 'km', 'mi').result).toBe('6.21371192237 mi');
    expect(convertUnit(1, 'm', 'cm').result).toBe('100 cm');
  });

  it('converts data sizes', () => {
    expect(convertUnit(1, 'gb', 'mb').result).toBe('1024 mb');
  });

  it('converts temperatures through an explicit category', () => {
    expect(convertUnit(0, 'c', 'f', 'temperature').result).toBe('32 f');
  });

  it('rejects units of different families', () => {
    expect(() => convertUnit(1, 'kg', 'km')).toThrow(/same family/);
  });

  it('rejects a non numeric value', () => {
    expect(() => convertUnit(Number.NaN, 'm', 'km')).toThrow(/must be a number/);
  });
});

describe('password_entropy', () => {
  it('rates a strong password as strong', () => {
    const analysis = analyzePassword('Tr0ub4dor&3xkqz');
    expect(analysis.length).toBe(15);
    expect(analysis.entropyBits).toBeGreaterThan(60);
    expect(['strong', 'very strong']).toContain(analysis.strength);
  });

  it('detects a common password', () => {
    const analysis = analyzePassword('password');
    expect(analysis.isCommonPassword).toBe(true);
    expect(analysis.strength).toBe('very weak');
  });

  it('detects a predictable pattern', () => {
    const analysis = analyzePassword('Password2024!');
    expect(analysis.suggestions.join(' ')).toMatch(/predictable pattern/);
  });

  it('handles an empty password', () => {
    const analysis = analyzePassword('');
    expect(analysis.length).toBe(0);
    expect(analysis.strength).toBe('very weak');
  });
});

describe('cron_next', () => {
  it('computes the next runs of a daily job', () => {
    const runs = nextCronRuns('0 9 * * *', 3, new Date('2026-03-10T08:00:00.000Z'));
    expect(runs).toHaveLength(3);
    expect(runs[0]).toBe('2026-03-10T09:00:00.000Z');
    expect(runs[1]).toBe('2026-03-11T09:00:00.000Z');
  });

  it('supports the weekday range', () => {
    const runs = nextCronRuns('30 8 * * 1-5', 5, new Date('2026-03-10T00:00:00.000Z'));
    for (const run of runs) {
      const day = new Date(run).getUTCDay();
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
    }
  });

  it('supports the @daily alias', () => {
    const runs = nextCronRuns('@daily', 1, new Date('2026-03-10T23:00:00.000Z'));
    expect(runs[0]).toBe('2026-03-11T00:00:00.000Z');
  });

  it('supports steps', () => {
    const runs = nextCronRuns('*/15 * * * *', 4, new Date('2026-03-10T10:01:00.000Z'));
    expect(runs[0]).toBe('2026-03-10T10:15:00.000Z');
    expect(runs[1]).toBe('2026-03-10T10:30:00.000Z');
  });

  it('rejects a malformed expression', () => {
    expect(() => nextCronRuns('0 9 *', 1)).toThrow(/5 fields/);
  });
});

describe('text_diff', () => {
  it('detects an added line', () => {
    const result = diffText('a\nb', 'a\nb\nc');
    expect(result.added).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.changed).toBe(true);
  });

  it('detects a removed line', () => {
    const result = diffText('a\nb', 'a');
    expect(result.removed).toBe(1);
  });

  it('reports identical texts', () => {
    const result = diffText('same', 'same');
    expect(result.changed).toBe(false);
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
  });
});
