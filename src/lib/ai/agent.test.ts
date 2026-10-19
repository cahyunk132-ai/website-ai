import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The router is mocked: the agent loop is tested with a scripted model that
 * behaves exactly like a real one (answer, request an action, answer again).
 */
const scriptedAnswers: string[] = [];

vi.mock('./router', () => ({
  defaultRouter: {
    streamChat: async (
      _options: unknown,
      onChunk: (chunk: any) => void
    ): Promise<any> => {
      const text = scriptedAnswers.shift() ?? '';
      onChunk({ text, done: false });
      onChunk({
        text: '',
        done: true,
        model: 'test-model',
        provider: 'radox',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
      return {
        text,
        model: 'test-model',
        provider: 'radox',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    },
  },
}));

import { runAgent, buildToolFeedback } from './agent';

describe('buildToolFeedback', () => {
  it('formats the tool results for the model', () => {
    const feedback = buildToolFeedback(
      [
        {
          tool: 'calculator',
          target: '2+2',
          success: true,
          output: '2 + 2 = 4',
          durationMs: 3,
        },
      ],
      []
    );

    expect(feedback).toContain('[TOOL RESULT] calculator');
    expect(feedback).toContain('2 + 2 = 4');
    expect(feedback).toContain('ok');
  });

  it('marks a failed tool call', () => {
    const feedback = buildToolFeedback(
      [
        {
          tool: 'fetch_url',
          target: 'http://127.0.0.1',
          success: false,
          output: 'Blocked host',
          durationMs: 1,
        },
      ],
      []
    );

    expect(feedback).toContain('failed');
  });

  it('includes the body of a loaded skill', () => {
    const feedback = buildToolFeedback(
      [],
      [
        {
          slug: 'code-review',
          name: 'Code Review',
          description: 'Review code',
          category: 'engineering',
          content: 'ALWAYS CHECK LOCKS',
          source: 'catalog',
        },
      ]
    );

    expect(feedback).toContain('[SKILL LOADED] code-review');
    expect(feedback).toContain('ALWAYS CHECK LOCKS');
  });
});

describe('Agent loop', () => {
  beforeEach(() => {
    scriptedAnswers.length = 0;
  });

  it('stops after the first answer when no action is requested', async () => {
    scriptedAnswers.push('The answer is 42.');

    const result = await runAgent({
      messages: [{ role: 'user', content: 'What is the answer?' }],
      model: 'test-model',
    });

    expect(result.text).toBe('The answer is 42.');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].isFinal).toBe(true);
  });

  it('executes a tool and feeds the result back to the model', async () => {
    scriptedAnswers.push(
      '<thought>Need a calculation.</thought>\n<agent_action tool="calculator">21 * 2</agent_action>'
    );
    scriptedAnswers.push('The result is 42.');

    const result = await runAgent({
      messages: [{ role: 'user', content: 'What is 21 * 2?' }],
      model: 'test-model',
    });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].toolResults).toHaveLength(1);
    expect(result.steps[0].toolResults[0].tool).toBe('calculator');
    expect(result.steps[0].toolResults[0].output).toBe('21 * 2 = 42');
    expect(result.steps[0].isFinal).toBe(false);
    expect(result.text).toBe('The result is 42.');
    expect(result.steps[1].isFinal).toBe(true);
  });

  it('loads a skill and applies it on the following step', async () => {
    scriptedAnswers.push('<skill_use skill="code-review" />');
    scriptedAnswers.push('Review done, following the code review checklist.');

    const loaded: string[] = [];
    const result = await runAgent({
      messages: [{ role: 'user', content: 'Review this code' }],
      model: 'test-model',
      loadSkill: async (slug) => {
        loaded.push(slug);
        return {
          slug,
          name: 'Code Review',
          description: 'Review code',
          category: 'engineering',
          content: 'FULL SKILL BODY',
          source: 'catalog',
        };
      },
    });

    expect(loaded).toEqual(['code-review']);
    expect(result.steps[0].loadedSkills).toHaveLength(1);
    expect(result.activatedSkills.map((s) => s.slug)).toEqual(['code-review']);
    expect(result.text).toContain('code review checklist');
  });

  it('reports a missing skill as a failed action', async () => {
    scriptedAnswers.push('<skill_use skill="does-not-exist" />');
    scriptedAnswers.push('I could not find that skill.');

    const result = await runAgent({
      messages: [{ role: 'user', content: 'Do it' }],
      model: 'test-model',
      loadSkill: async () => null,
    });

    expect(result.steps[0].toolResults[0].success).toBe(false);
    expect(result.steps[0].toolResults[0].output).toContain('does-not-exist');
  });

  it('forces a final answer when the step budget is exhausted', async () => {
    // The model always asks for another action.
    scriptedAnswers.push('<agent_action tool="datetime">now</agent_action>');
    scriptedAnswers.push('<agent_action tool="datetime">now</agent_action>');
    scriptedAnswers.push('Final answer after the budget was exhausted.');

    const result = await runAgent({
      messages: [{ role: 'user', content: 'Loop forever' }],
      model: 'test-model',
      maxSteps: 2,
    });

    expect(result.text).toBe('Final answer after the budget was exhausted.');
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
    expect(result.steps[result.steps.length - 1].isFinal).toBe(true);
  });

  it('reports the steps and the text through the callbacks', async () => {
    scriptedAnswers.push('<agent_action tool="calculator">1 + 1</agent_action>');
    scriptedAnswers.push('Done.');

    const started: number[] = [];
    const texts: string[] = [];
    const toolOutputs: string[] = [];

    const result = await runAgent({
      messages: [{ role: 'user', content: 'go' }],
      model: 'test-model',
      onStepStart: (step) => started.push(step),
      onText: (text) => texts.push(text),
      onToolOutput: (output) => toolOutputs.push(output.tool),
    });

    expect(started).toEqual([1, 2]);
    expect(texts.join('')).toContain('Done.');
    expect(toolOutputs).toEqual(['calculator']);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });
});
