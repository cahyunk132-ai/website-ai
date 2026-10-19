import { describe, it, expect, beforeEach, vi } from 'vitest';

// Force the in-process fallback: no Supabase client during unit tests.
vi.mock('../supabase/server', () => ({
  createServerSupabaseAdminClient: () => null,
  createServerSupabaseClient: () => null,
}));

import {
  listSkills,
  getSkillCatalog,
  getSkillBySlug,
  loadSkillContent,
  getPinnedSkills,
  loadPinnedSkills,
  createUserSkill,
  updateUserSkill,
  deleteUserSkill,
  setSkillPinned,
  slugifySkillName,
} from './registry';
import { BUILTIN_SKILLS } from './builtins';

const USER = 'user-test-1';
const OTHER_USER = 'user-test-2';

describe('Skill registry (memory fallback)', () => {
  beforeEach(async () => {
    // Clean the shared in-process store between tests.
    for (const skill of await listSkills(USER)) {
      if (skill.userId) await deleteUserSkill(USER, skill.id);
    }
    for (const skill of await listSkills(OTHER_USER)) {
      if (skill.userId) await deleteUserSkill(OTHER_USER, skill.id);
    }
  });

  it('lists the built-in system skills', async () => {
    const skills = await listSkills(USER);
    const system = skills.filter((skill) => skill.userId === null);

    expect(system.length).toBe(BUILTIN_SKILLS.length);
    expect(system.map((s) => s.slug)).toContain('code-review');
    expect(system.map((s) => s.slug)).toContain('deep-research');
  });

  it('exposes only name and description in the catalog', async () => {
    const catalog = await getSkillCatalog(USER);

    expect(catalog.length).toBeGreaterThan(0);
    for (const entry of catalog) {
      expect(entry.name).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect((entry as any).content).toBeUndefined();
    }
  });

  it('creates, reads, updates and deletes a user skill', async () => {
    const created = await createUserSkill(USER, {
      name: 'My SQL Helper',
      description: 'Helps with SQL.',
      content: 'Always use snake_case.',
      category: 'data',
    });

    expect(created.userId).toBe(USER);
    expect(created.slug).toBe('my-sql-helper');
    expect(created.kind).toBe('user');

    const fetched = await getSkillBySlug('my-sql-helper', USER);
    expect(fetched?.content).toBe('Always use snake_case.');

    const updated = await updateUserSkill(USER, created.id, { name: 'Renamed Helper' });
    expect(updated?.name).toBe('Renamed Helper');

    expect(await deleteUserSkill(USER, created.id)).toBe(true);
    expect(await getSkillBySlug('my-sql-helper', USER)).toBeNull();
  });

  it('does not expose the skills of another user', async () => {
    await createUserSkill(USER, {
      name: 'Private Skill',
      description: 'Only mine.',
      content: 'Secret instructions.',
    });

    const forOther = await getSkillBySlug('private-skill', OTHER_USER);
    expect(forOther).toBeNull();

    const otherList = await listSkills(OTHER_USER);
    expect(otherList.some((s) => s.slug === 'private-skill')).toBe(false);
  });

  it('forks a system skill into a pinned user preset', async () => {
    const systemSkill = (await listSkills(USER)).find((s) => s.slug === 'code-review')!;
    const pinned = await setSkillPinned(USER, systemSkill.id, true);

    expect(pinned).not.toBeNull();
    expect(pinned!.userId).toBe(USER);
    expect(pinned!.isPinned).toBe(true);
    expect(pinned!.slug).toBe('code-review');

    const pinnedList = await getPinnedSkills(USER);
    expect(pinnedList.map((s) => s.slug)).toContain('code-review');

    // The system skill is replaced by the user copy in the listing.
    const all = await listSkills(USER);
    expect(all.filter((s) => s.slug === 'code-review')).toHaveLength(1);
    expect(all.find((s) => s.slug === 'code-review')!.userId).toBe(USER);
  });

  it('unpins a user skill', async () => {
    const created = await createUserSkill(USER, {
      name: 'Toggle Skill',
      description: 'x',
      content: 'y',
    });

    await setSkillPinned(USER, created.id, true);
    expect((await getPinnedSkills(USER)).map((s) => s.slug)).toContain('toggle-skill');

    await setSkillPinned(USER, created.id, false);
    expect((await getPinnedSkills(USER)).map((s) => s.slug)).not.toContain('toggle-skill');
  });

  it('loads the full content of an activated skill only on demand', async () => {
    const activated = await loadPinnedSkills(USER);
    expect(Array.isArray(activated)).toBe(true);

    const content = await loadSkillContent('code-review');
    expect(content).toBeTruthy();
    expect(content!.content.length).toBeGreaterThan(100);
    expect(content!.source).toBe('catalog');
  });
});

describe('slugifySkillName', () => {
  it('normalises a name into a slug', () => {
    expect(slugifySkillName('Code Review Helper')).toBe('code-review-helper');
    expect(slugifySkillName('  SQL/Analysis  ')).toBe('sql-analysis');
    expect(slugifySkillName('  !!!  ')).toBe('');
  });

  it('keeps the slug short', () => {
    expect(slugifySkillName('a'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});
