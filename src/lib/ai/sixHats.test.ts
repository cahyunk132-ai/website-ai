import { describe, it, expect } from 'vitest';
import {
  SIX_HATS,
  SIX_HATS_MIN_TIER,
  PARALLEL_HAT_IDS,
  BLUE_HAT_ID,
  buildBlueHatContext,
  buildSixHatsMarkdown,
  canUseSixHats,
  getSixHat,
} from './sixHats';

describe('six thinking hats', () => {
  it('defines the six hats of the method', () => {
    expect(SIX_HATS.map((hat) => hat.id)).toEqual([
      'white',
      'red',
      'black',
      'yellow',
      'green',
      'blue',
    ]);

    for (const hat of SIX_HATS) {
      expect(hat.name).toMatch(/Hat$/);
      expect(hat.emoji.length).toBeGreaterThan(0);
      expect(hat.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(hat.focus.length).toBeGreaterThan(0);
      expect(hat.systemPrompt.length).toBeGreaterThan(50);
    }
  });

  it('gives every hat its own system prompt', () => {
    const prompts = SIX_HATS.map((hat) => hat.systemPrompt);
    expect(new Set(prompts).size).toBe(prompts.length);

    expect(SIX_HATS[0].systemPrompt).toContain('White Hat');
    expect(SIX_HATS[0].systemPrompt).toContain('HANYA berdasarkan fakta');
    expect(SIX_HATS[1].systemPrompt).toContain('Red Hat');
    expect(SIX_HATS[2].systemPrompt).toContain('Black Hat');
    expect(SIX_HATS[3].systemPrompt).toContain('Yellow Hat');
    expect(SIX_HATS[4].systemPrompt).toContain('Green Hat');
    expect(SIX_HATS[5].systemPrompt).toContain('Blue Hat');
  });

  it('runs five hats in parallel and the blue hat last', () => {
    expect(PARALLEL_HAT_IDS).toEqual(['white', 'red', 'black', 'yellow', 'green']);
    expect(BLUE_HAT_ID).toBe('blue');
    expect(PARALLEL_HAT_IDS).not.toContain(BLUE_HAT_ID);
  });

  it('reserves the feature for premium 3 and above', () => {
    expect(SIX_HATS_MIN_TIER).toBe(3);

    expect(canUseSixHats('free', 0)).toBe(false);
    expect(canUseSixHats('premium1', 1)).toBe(false);
    expect(canUseSixHats('premium2', 2)).toBe(false);
    expect(canUseSixHats('premium3', 3)).toBe(true);
    expect(canUseSixHats('premium4', 4)).toBe(true);
    expect(canUseSixHats('admin', 4)).toBe(true);
    // The administrator is always allowed, even with an unknown tier.
    expect(canUseSixHats('admin', 0)).toBe(true);
    expect(canUseSixHats(null, 0)).toBe(false);
  });

  it('finds a hat by its id', () => {
    expect(getSixHat('white')?.name).toBe('White Hat');
    expect(getSixHat('nope')).toBeUndefined();
  });

  it('builds the context of the blue hat from the other five', () => {
    const context = buildBlueHatContext({
      white: 'Fakta 1',
      red: 'Perasaan 1',
      black: 'Risiko 1',
      yellow: 'Peluang 1',
      green: 'Ide 1',
    });

    expect(context).toContain('White Hat');
    expect(context).toContain('Fakta 1');
    expect(context).toContain('Perasaan 1');
    expect(context).toContain('Risiko 1');
    expect(context).toContain('Peluang 1');
    expect(context).toContain('Ide 1');
    // The blue hat itself is never part of its own context.
    expect(context).not.toContain('Blue Hat');
  });

  it('keeps the context of the blue hat short', () => {
    const long = 'x'.repeat(5000);
    const context = buildBlueHatContext({ white: long }, 100);

    expect(context).toContain('x'.repeat(100));
    expect(context).toContain('…');
    expect(context.length).toBeLessThan(400);
  });

  it('builds the markdown of the analysis', () => {
    const markdown = buildSixHatsMarkdown('Topik uji', {
      white: 'Fakta',
      red: 'Emosi',
      black: 'Risiko',
      yellow: 'Peluang',
      green: 'Ide',
      blue: 'Kesimpulan',
    });

    expect(markdown).toContain('## 🎩 Six Thinking Hats Analysis');
    expect(markdown).toContain('**Topik:** Topik uji');
    expect(markdown).toContain('### 🤍 White Hat — Fakta & Data');
    expect(markdown).toContain('### ❤️ Red Hat — Emosi & Intuisi');
    expect(markdown).toContain('### 🖤 Black Hat — Risiko & Negatif');
    expect(markdown).toContain('### 💛 Yellow Hat — Optimisme & Positif');
    expect(markdown).toContain('### 💚 Green Hat — Kreativitas & Ide');
    expect(markdown).toContain('### 💙 Blue Hat — Proses & Kesimpulan');
    expect(markdown).toContain('Kesimpulan');
  });

  it('marks a missing answer in the markdown', () => {
    const markdown = buildSixHatsMarkdown('Topik', { white: 'Fakta' });
    expect(markdown).toContain('Fakta');
    expect(markdown).toContain('_Belum ada jawaban._');
  });
});
