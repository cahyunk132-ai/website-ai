import { describe, it, expect } from 'vitest';
import { readableHatColor } from './SixHatsPanel';
import { SIX_HATS } from '@/lib/ai/sixHats';

describe('six hats panel colours', () => {
  it('keeps a bright colour as it is', () => {
    expect(readableHatColor('#eab308')).toBe('#eab308');
    expect(readableHatColor('#22c55e')).toBe('#22c55e');
    expect(readableHatColor('#3b82f6')).toBe('#3b82f6');
  });

  it('lightens a colour that would be invisible on a dark background', () => {
    // The black hat is almost black, it would disappear in the card.
    expect(readableHatColor('#1f2937')).toBe('#94a3b8');
  });

  it('never returns an unreadable colour for a hat', () => {
    for (const hat of SIX_HATS) {
      const color = readableHatColor(hat.color);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);

      const value = color.replace('#', '');
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      expect(luminance).toBeGreaterThan(0.4);
    }
  });

  it('keeps an invalid value as it is', () => {
    expect(readableHatColor('nope')).toBe('nope');
  });
});
