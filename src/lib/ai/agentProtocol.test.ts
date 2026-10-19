import { describe, it, expect } from 'vitest';
import {
  parseAgentStep,
  buildAgentSystemPrompt,
  buildPersonaSystemPrompt,
} from './agentProtocol';

describe('Agent protocol parsing', () => {
  it('extracts the reasoning block', () => {
    const parsed = parseAgentStep('<thought>\nI need the current data.\n</thought>\nHere is the plan.');

    expect(parsed.thought).toBe('I need the current data.');
    expect(parsed.text).toBe('Here is the plan.');
  });

  it('extracts a tool call with a plain text payload', () => {
    const parsed = parseAgentStep(
      '<agent_action tool="web_search" target="news">latest AI news</agent_action>'
    );

    expect(parsed.calls).toHaveLength(1);
    expect(parsed.calls[0]).toMatchObject({
      type: 'tool',
      tool: 'web_search',
      target: 'news',
      payload: 'latest AI news',
    });
  });

  it('extracts a tool call with a JSON payload', () => {
    const parsed = parseAgentStep(
      '<agent_action tool="http_request">{"method":"POST","url":"https://api.example.com/v1","body":{"a":1}}</agent_action>'
    );

    expect(parsed.calls).toHaveLength(1);
    const call = parsed.calls[0] as any;
    expect(call.tool).toBe('http_request');
    expect(call.args.method).toBe('POST');
    expect(call.args.url).toBe('https://api.example.com/v1');
    expect(call.args.body).toEqual({ a: 1 });
  });

  it('extracts skill invocations', () => {
    const parsed = parseAgentStep('<skill_use skill="deep-research" />\nLet me research it.');

    expect(parsed.calls).toHaveLength(1);
    expect(parsed.calls[0]).toMatchObject({ type: 'skill', skill: 'deep-research' });
    expect(parsed.text).toBe('Let me research it.');
  });

  it('parses several calls of a single step', () => {
    const parsed = parseAgentStep(
      [
        '<thought>Two things to do.</thought>',
        '<skill_use skill="code-review" />',
        '<agent_action tool="calculator">(128 * 3) / 7</agent_action>',
      ].join('\n')
    );

    expect(parsed.thought).toBe('Two things to do.');
    expect(parsed.calls).toHaveLength(2);
    expect(parsed.calls[0].type).toBe('skill');
    expect(parsed.calls[1].type).toBe('tool');
  });

  it('tolerates a missing closing tag', () => {
    const parsed = parseAgentStep('<agent_action tool="web_search">query without closing tag');

    expect(parsed.calls).toHaveLength(1);
    expect(parsed.calls[0]).toMatchObject({ type: 'tool', tool: 'web_search' });
  });

  it('supports single quotes and extra attributes', () => {
    const parsed = parseAgentStep("<agent_action tool='web_search' target='x'>q</agent_action>");

    expect(parsed.calls[0]).toMatchObject({ tool: 'web_search', target: 'x' });
  });

  it('returns an empty call list for a plain answer', () => {
    const parsed = parseAgentStep('Just a normal answer without any protocol block.');

    expect(parsed.calls).toHaveLength(0);
    expect(parsed.thought).toBe('');
    expect(parsed.text).toBe('Just a normal answer without any protocol block.');
  });
});

describe('Agent system prompt', () => {
  const catalog = [
    {
      slug: 'code-review',
      name: 'Code Review',
      description: 'Review a change for defects.',
      category: 'engineering',
      icon: 'shield-check',
      kind: 'system' as const,
      isPinned: false,
    },
  ];

  it('lists the skill catalog with name and description only', () => {
    const prompt = buildAgentSystemPrompt({
      catalog,
      tools: [{ name: 'web_search', description: 'Search the web.' }],
    });

    expect(prompt).toContain('code-review');
    expect(prompt).toContain('Review a change for defects.');
    expect(prompt).toContain('<skill_use skill="SKILL_SLUG" />');
    expect(prompt).toContain('web_search');
  });

  it('injects the pinned persona body', () => {
    const prompt = buildAgentSystemPrompt({
      catalog,
      tools: [],
      pinnedSkills: [{ name: 'SQL Expert', content: 'Always use snake_case.' }],
    });

    expect(prompt).toContain('ACTIVE PERSONA');
    expect(prompt).toContain('Always use snake_case.');
  });

  it('appends extra instructions', () => {
    const prompt = buildAgentSystemPrompt({
      catalog: [],
      tools: [],
      extraInstructions: 'Answer in Indonesian.',
    });

    expect(prompt).toContain('Answer in Indonesian.');
  });
});

describe('Persona system prompt', () => {
  it('returns the base prompt when no skill is pinned', () => {
    expect(buildPersonaSystemPrompt([], 'Base rules.')).toBe('Base rules.');
    expect(buildPersonaSystemPrompt([])).toBe('');
  });

  it('prepends the persona body to the base prompt', () => {
    const result = buildPersonaSystemPrompt(
      [{ name: 'Reviewer', content: 'Be strict.' }],
      'Base rules.'
    );

    expect(result).toContain('Base rules.');
    expect(result).toContain('Be strict.');
    expect(result.indexOf('Base rules.')).toBeLessThan(result.indexOf('Be strict.'));
  });
});
