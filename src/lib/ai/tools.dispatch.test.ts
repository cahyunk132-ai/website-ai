import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentToolCall, AGENT_TOOL_NAMES, AGENT_TOOLS } from './tools';

describe('agent tool registry', () => {
  it('exposes the new tools', () => {
    for (const name of [
      'website_security_scan',
      'dns_lookup',
      'page_inspector',
      'hash_calculate',
      'base64_codec',
      'json_select',
      'regex_extract',
      'unit_convert',
      'password_entropy',
      'cron_next',
      'text_diff',
    ]) {
      expect(AGENT_TOOL_NAMES).toContain(name);
    }
  });

  it('gives every tool a description and a parameter hint', () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect((tool.parameters || '').length).toBeGreaterThan(5);
    }
  });

  it('keeps the tool names unique', () => {
    expect(new Set(AGENT_TOOL_NAMES).size).toBe(AGENT_TOOL_NAMES.length);
  });
});

describe('tool dispatcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the hash tool and never confuses it with the calculator', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'hash_calculate',
      payload: '',
      args: { text: 'hyunk', algorithm: 'sha256' },
    } as any);

    expect(result.success).toBe(true);
    expect(result.output).toContain('sha256');
    expect(result.output).toContain(result.data.digest);
    // The calculator would have answered with a number.
    expect(result.output).not.toMatch(/= \d+(\.\d+)?$/);
  });

  it('runs the base64 tool', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'base64_codec',
      payload: '',
      args: { text: 'Hyunk', mode: 'encode' },
    } as any);

    expect(result.success).toBe(true);
    expect(result.output).toBe(Buffer.from('Hyunk').toString('base64'));
  });

  it('runs the json_select tool', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'json_select',
      payload: '',
      args: { json: '{"a":{"b":[1,2,3]}}', path: 'a.b[*]' },
    } as any);

    expect(result.success).toBe(true);
    expect(result.output).toContain('1');
    expect(result.output).toContain('3');
  });

  it('runs the regex tool', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'regex_extract',
      payload: '',
      args: { text: 'id=42 id=7', pattern: 'id=(\\d+)' },
    } as any);

    expect(result.success).toBe(true);
    expect(result.output).toContain('id=42');
    expect(result.output).toContain('42');
  });

  it('runs the unit converter', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'unit_convert',
      payload: '',
      args: { value: 1, from: 'gb', to: 'mb' },
    } as any);

    expect(result.success).toBe(true);
    expect(result.output).toBe('1024 mb');
  });

  it('runs the password analyser', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'password_entropy',
      payload: '',
      args: { password: 'password' },
    } as any);

    expect(result.success).toBe(true);
    expect(result.output).toContain('very weak');
    expect(result.output).toContain('Entropy');
  });

  it('runs the cron tool', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'cron_next',
      payload: '',
      args: { expression: '0 9 * * *', count: 2 },
    } as any);

    expect(result.success).toBe(true);
    expect(result.output).toContain('NEXT RUNS');
  });

  it('runs the diff tool', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'text_diff',
      payload: '',
      args: { original: 'a\nb', updated: 'a\nc' },
    } as any);

    expect(result.success).toBe(true);
    expect(result.output).toContain('- b');
    expect(result.output).toContain('+ c');
  });

  it('reports a failure when the security scan targets a private host', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'website_security_scan',
      payload: '',
      args: { url: 'http://192.168.0.1/' },
    } as any);

    expect(result.success).toBe(false);
    expect(result.output).toContain('Blocked host');
  });

  it('reports a failure when a required argument is missing', async () => {
    const result = await executeAgentToolCall({
      type: 'tool',
      tool: 'website_security_scan',
      payload: '',
      args: {},
    } as any);

    expect(result.success).toBe(false);
    expect(result.output).toContain('URL is required');
  });
});
