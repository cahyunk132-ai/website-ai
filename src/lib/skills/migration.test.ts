import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILTIN_SKILLS } from './builtins';

/**
 * The skills live in Supabase only - the migration is the source of truth for
 * the seeded rows. This test guarantees the SQL seed and the TypeScript
 * built-in library never drift apart.
 */
const MIGRATION_PATH = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20261020000000_agent_skills.sql'
);

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

/** Extracts the slugs used by the idempotent seed of the migration. */
function extractSeededSlugs(sql: string): string[] {
  // Every seeded row starts with "( null, '<slug>', '<name>', ...".
  const pattern = /\(\s*null,\s*'([a-z0-9]+(?:-[a-z0-9]+)*)'/g;
  const slugs = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    slugs.add(match[1]);
  }

  return Array.from(slugs);
}

describe('skills migration', () => {
  const sql = readMigration();

  it('creates the skills table', () => {
    expect(sql).toMatch(/create table if not exists public\.skills/i);
    expect(sql).toMatch(/user_id/);
    expect(sql).toMatch(/is_pinned/);
    expect(sql).toMatch(/is_active/);
  });

  it('enables row level security', () => {
    expect(sql).toMatch(/alter table public\.skills enable row level security/i);
    expect(sql).toMatch(/create policy/i);
  });

  it('is idempotent (the seed can run more than once)', () => {
    expect(sql).toMatch(/on conflict/i);
  });

  it('seeds exactly the skills of the built-in library', () => {
    const seeded = extractSeededSlugs(sql).sort();
    const builtin = BUILTIN_SKILLS.map((skill) => skill.slug).sort();

    expect(seeded).toEqual(builtin);
  });

  it('keeps the slug of every built-in skill unique', () => {
    const slugs = BUILTIN_SKILLS.map((skill) => skill.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every built-in skill a description and a body', () => {
    for (const skill of BUILTIN_SKILLS) {
      expect(skill.name.length).toBeGreaterThan(0);
      expect(skill.description.length).toBeGreaterThan(10);
      expect(skill.content.length).toBeGreaterThan(100);
      expect(skill.category.length).toBeGreaterThan(0);
    }
  });
});
