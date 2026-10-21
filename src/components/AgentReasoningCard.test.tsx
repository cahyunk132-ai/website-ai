import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AgentReasoningCard } from './AgentReasoningCard';

describe('agent deliverable presentation', () => {
  it('does not call a thought-only response a verified completed task', () => {
    const html = renderToStaticMarkup(<AgentReasoningCard content="<thought>Susun LMS.</thought>" />);
    expect(html).not.toContain('Plan Verified');
    expect(html).toContain('belum memberikan jawaban akhir');
  });
  it('shows the requested deliverable alongside process records', () => {
    const html = renderToStaticMarkup(<AgentReasoningCard content={'<thought>Susun LMS.</thought>\n# Kerangka LMS\nBeranda dan kursus.'} />);
    expect(html).toContain('Kerangka LMS');
    expect(html).not.toContain('Plan Verified');
  });
  it('does not mark failed tools as successfully executed', () => {
    const html = renderToStaticMarkup(<AgentReasoningCard content="Jawaban" liveToolOutputs={[{ tool: 'web_search', success: false, output: 'Search unavailable' }]} />);
    expect(html).toContain('Failed');
    expect(html).not.toContain('>Executed<');
  });
});
