import { describe, it, expect } from 'vitest';
import {
  executeCalculator,
  evaluateExpression,
  executeCodeInterpreterDetailed,
  executeDateTime,
  assertSafeUrl,
  AGENT_TOOL_NAMES,
  executeAgentToolCall,
} from './tools';

describe('Calculator (own expression parser)', () => {
  it('evaluates basic arithmetic', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20);
    expect(evaluateExpression('10 / 4')).toBe(2.5);
    expect(evaluateExpression('10 % 3')).toBe(1);
  });

  it('handles exponents and unary minus', () => {
    expect(evaluateExpression('2 ^ 10')).toBe(1024);
    expect(evaluateExpression('-3 + 5')).toBe(2);
    expect(evaluateExpression('2 ^ 3 ^ 2')).toBe(512); // right associative
  });

  it('supports functions and constants', () => {
    expect(evaluateExpression('sqrt(16)')).toBe(4);
    expect(evaluateExpression('round(pi * 100)')).toBe(314);
    expect(evaluateExpression('max(3, 9, 4)')).toBe(9);
    expect(evaluateExpression('min(3, 9, 4)')).toBe(3);
    expect(evaluateExpression('pow(2, 8)')).toBe(256);
    expect(evaluateExpression('abs(-7)')).toBe(7);
  });

  it('refuses to evaluate arbitrary code', () => {
    expect(() => evaluateExpression('process.exit(1)')).toThrow();
    expect(() => evaluateExpression('require("fs")')).toThrow();
    expect(() => evaluateExpression('globalThis')).toThrow();
    expect(() => evaluateExpression('constructor')).toThrow();
  });

  it('rejects division by zero', () => {
    expect(() => evaluateExpression('1 / 0')).toThrow(/Division by zero/);
  });

  it('formats the result through the tool', () => {
    expect(executeCalculator('(128 * 3) / 7')).toBe('(128 * 3) / 7 = 54.8571428571');
    expect(executeCalculator('')).toContain('Error');
  });
});

describe('Code interpreter sandbox', () => {
  it('captures stdout and the returned value', () => {
    const result = executeCodeInterpreterDetailed(
      'console.log("hello", {a:1}); return 40 + 2;'
    );

    expect(result.error).toBeUndefined();
    expect(result.stdout).toContain('hello');
    expect(result.returned).toBe('42');
  });

  it('reports runtime errors instead of crashing', () => {
    const result = executeCodeInterpreterDetailed('throw new Error("boom")');
    expect(result.error).toContain('boom');
  });

  it('has no access to the host process', () => {
    const result = executeCodeInterpreterDetailed('return typeof require;');
    expect(result.returned).toBe('undefined');
  });

  it('refuses languages it cannot execute honestly', () => {
    const result = executeCodeInterpreterDetailed('print("hi")', 'python');
    expect(result.error).toContain('JavaScript');
  });
});

describe('SSRF guard', () => {
  it('allows public http(s) targets', () => {
    expect(assertSafeUrl('https://example.com/docs').hostname).toBe('example.com');
    expect(assertSafeUrl('http://example.com').protocol).toBe('http:');
  });

  it('blocks loopback and private targets', () => {
    expect(() => assertSafeUrl('http://127.0.0.1:3000/admin')).toThrow(/Blocked host/);
    expect(() => assertSafeUrl('http://localhost/admin')).toThrow(/Blocked host/);
    expect(() => assertSafeUrl('http://10.0.0.5/')).toThrow(/Blocked host/);
    expect(() => assertSafeUrl('http://192.168.1.1/')).toThrow(/Blocked host/);
    expect(() => assertSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow(/Blocked host/);
    expect(() => assertSafeUrl('http://service.internal/')).toThrow(/Blocked host/);
    expect(() => assertSafeUrl('http://internal/')).toThrow(/Blocked host/);
  });

  it('blocks non http protocols', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow(/Blocked protocol/);
    expect(() => assertSafeUrl('ftp://example.com')).toThrow(/Blocked protocol/);
  });
});

describe('Date tool', () => {
  it('returns the current time', () => {
    const output = executeDateTime();
    expect(output).toContain('Current UTC time');
    expect(output).toContain('Unix timestamp');
  });

  it('supports a time zone', () => {
    expect(executeDateTime('Asia/Makassar')).toContain('Asia/Makassar');
  });

  it('rejects an unknown time zone', () => {
    expect(executeDateTime('Mars/Olympus')).toContain('Unknown time zone');
  });
});

describe('Tool registry', () => {
  it('exposes the documented tool names', () => {
    expect(AGENT_TOOL_NAMES).toContain('web_search');
    expect(AGENT_TOOL_NAMES).toContain('fetch_url');
    expect(AGENT_TOOL_NAMES).toContain('http_request');
    expect(AGENT_TOOL_NAMES).toContain('code_interpreter');
    expect(AGENT_TOOL_NAMES).toContain('calculator');
    expect(AGENT_TOOL_NAMES).toContain('datetime');
  });

  it('dispatches a calculator call through the agent tool interface', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'calculator',
      payload: '21 * 2',
      args: { input: '21 * 2' },
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('21 * 2 = 42');
  });

  it('reports a failure for an unknown URL target', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'fetch_url',
      payload: 'http://127.0.0.1:8080/secret',
      args: { url: 'http://127.0.0.1:8080/secret' },
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Blocked host');
  });
});
