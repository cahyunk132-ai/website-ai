import { describe, it, expect } from 'vitest';
import { BUILTIN_SKILLS, getBuiltinSkill } from './builtins';
import type { SkillCategory } from './types';

/**
 * The built-in catalogue is the source of truth for the skill library. These
 * tests guard the quality of every entry: a skill without a name, a category
 * or a body is useless for the agent.
 */
const CATEGORIES: SkillCategory[] = [
  'engineering',
  'research',
  'writing',
  'data',
  'productivity',
  'security',
  'devops',
  'language',
  'general',
];

describe('built-in skill catalogue', () => {
  it('ships a substantial library', () => {
    expect(BUILTIN_SKILLS.length).toBeGreaterThanOrEqual(20);
  });

  it('has unique slugs and names', () => {
    const slugs = BUILTIN_SKILLS.map((skill) => skill.slug);
    const names = BUILTIN_SKILLS.map((skill) => skill.name.toLowerCase());

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every skill a complete definition', () => {
    for (const skill of BUILTIN_SKILLS) {
      expect(skill.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(skill.name.trim().length).toBeGreaterThan(2);
      expect(skill.description.trim().length).toBeGreaterThan(20);
      expect(skill.icon.trim().length).toBeGreaterThan(0);
      expect(skill.tags.length).toBeGreaterThanOrEqual(2);
      expect(skill.kind).toBe('system');
      expect(Number.isFinite(skill.sortOrder)).toBe(true);
    }
  });

  it('writes every body as a markdown instruction pack', () => {
    for (const skill of BUILTIN_SKILLS) {
      expect(skill.content.startsWith('## '), `${skill.slug} needs a title`).toBe(true);
      expect(skill.content.length).toBeGreaterThan(500);
      expect(skill.content).toMatch(/###/);
    }
  });

  it('covers every category of the taxonomy', () => {
    const used = new Set(BUILTIN_SKILLS.map((skill) => skill.category));
    for (const category of CATEGORIES) {
      expect(used.has(category), `no skill in the "${category}" category`).toBe(true);
    }
  });

  it('sorts the catalogue in a stable order', () => {
    const orders = BUILTIN_SKILLS.map((skill) => skill.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('finds a skill by its slug', () => {
    const first = BUILTIN_SKILLS[0];
    expect(getBuiltinSkill(first.slug)?.name).toBe(first.name);
    expect(getBuiltinSkill('does-not-exist')).toBeUndefined();
  });
});
