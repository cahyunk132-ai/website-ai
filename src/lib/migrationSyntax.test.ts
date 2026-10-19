import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({
    name,
    sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8'),
  }));

const allSql = migrations.map((m) => m.sql).join('\n');

/**
 * The type names that PostgreSQL accepts. A typo like `timestamp with
 * time_zone` (instead of `timestamp with time zone`) is a fatal syntax
 * error: the whole migration aborts, so none of the tables are created and
 * every feature of the app that needs them breaks.
 */
const VALID_TYPES = new Set([
  'uuid',
  'text',
  'boolean',
  'integer',
  'int',
  'int2',
  'int4',
  'int8',
  'bigint',
  'smallint',
  'numeric',
  'decimal',
  'real',
  'double precision',
  'date',
  'timestamp',
  'timestamptz',
  'time',
  'timetz',
  'json',
  'jsonb',
  'bytea',
  'serial',
  'bigserial',
  'smallserial',
  'character varying',
  'character',
  'varchar',
  'char',
  'timestamp with time zone',
  'timestamp without time zone',
  'time with time zone',
  'time without time zone',
]);

const TYPE_MODIFIERS = [
  'default',
  'not',
  'null',
  'references',
  'unique',
  'primary',
  'check',
  'collate',
  'generated',
  'constraint',
  'primary key',
];

/** Splits a `create table` body on the commas that are not inside brackets. */
const splitColumns = (body: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
};

/** Returns every `create table` block of a migration. */
const tableBlocks = (sql: string) =>
  [...sql.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)].map(
    (match) => ({ name: match[1], body: match[2] })
  );

/** The declared columns of a `create table` block. */
const declaredColumns = (body: string) =>
  splitColumns(body)
    .filter((column) => !/^(unique|primary key|foreign key|check|constraint)\b/i.test(column))
    .map((column) => {
      const name = column.split(/\s+/)[0];
      const rest = column.slice(name.length).trim();
      const type = rest
        .split(/\s+(?=default\b|not\b|null\b|references\b|unique\b|primary\b|check\b|collate\b|generated\b|constraint\b)/i)[0]
        .trim();
      return { name, type };
    });

describe('supabase migrations', () => {
  it('are all present', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(4);
  });

  it('use only valid postgres type names', () => {
    const invalid: string[] = [];

    for (const migration of migrations) {
      for (const table of tableBlocks(migration.sql)) {
        for (const column of declaredColumns(table.body)) {
          const base = column.type
            .replace(/\[\]$/, '')
            .replace(/\(\s*\d+\s*(,\s*\d+\s*)?\)$/, '')
            .toLowerCase();
          if (!VALID_TYPES.has(base)) {
            invalid.push(`${migration.name} -> ${table.name}.${column.name} "${column.type}"`);
          }
        }
      }
    }

    expect(invalid).toEqual([]);
  });

  it('do not use the broken "with time_zone" spelling', () => {
    // This typo was the reason the feature migration could not be applied.
    for (const migration of migrations) {
      expect(migration.sql).not.toMatch(/\b(with|without)\s+time_zone\b/i);
      expect(migration.sql).not.toMatch(/\btimestamp\s+with\s+timezone\b/i);
    }
  });

  it('close every dollar quoted block', () => {
    for (const migration of migrations) {
      const openings = (migration.sql.match(/\$\$/g) || []).length;
      expect(openings % 2).toBe(0);
    }
  });

  it('close every create table block', () => {
    for (const migration of migrations) {
      const opens = (migration.sql.match(/create table if not exists public\.\w+\s*\(/gi) || []).length;
      const closes = (migration.sql.match(/\n\);/g) || []).length;
      expect(opens).toBeLessThanOrEqual(closes);
    }
  });
});

describe('schema drift', () => {
  const tables = new Map<string, Set<string>>();

  for (const migration of migrations) {
    for (const table of tableBlocks(migration.sql)) {
      const columns = tables.get(table.name) ?? new Set<string>();
      for (const column of declaredColumns(table.body)) columns.add(column.name);
      tables.set(table.name, columns);
    }
  }

  // Columns that are added later with `alter table ... add column`.
  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(
      /alter table public\.(\w+)\s+add column if not exists (\w+)/gi
    )) {
      const columns = tables.get(match[1]) ?? new Set<string>();
      columns.add(match[2]);
      tables.set(match[1], columns);
    }
  }

  it('creates every table the application queries', () => {
    const used = new Set<string>();
    const source = readdirSync(join(process.cwd(), 'src'), { recursive: true } as never)
      .map(String)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));

    for (const file of source) {
      const content = readFileSync(join(process.cwd(), 'src', file), 'utf8');
      for (const match of content.matchAll(/(?<![\w.])\.from\(\s*['"](\w+)['"]\s*\)/g)) {
        used.add(match[1]);
      }
    }

    // The Supabase auth schema is not part of the migrations.
    const external = new Set(['auth']);
    const missing = [...used].filter((table) => !external.has(table) && !tables.has(table));

    expect(missing).toEqual([]);
  });

  it('declares every column the application writes', () => {
    const source = readdirSync(join(process.cwd(), 'src'), { recursive: true } as never)
      .map(String)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));

    const missing: string[] = [];

    for (const file of source) {
      const content = readFileSync(join(process.cwd(), 'src', file), 'utf8');

      for (const match of content.matchAll(
        /\.from\(\s*['"](\w+)['"]\s*\)\s*(?:\.\w+\([^)]*\))*\s*\.insert\(\{([\s\S]*?)\n\s*\}\)/g
      )) {
        const [, table, body] = match;
        if (!tables.has(table)) continue;
        const columns = tables.get(table)!;
        for (const column of body.matchAll(/(\w+)\s*:/g)) {
          if (!columns.has(column[1])) {
            missing.push(`${table}.${column[1]} (${file})`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('keeps the feature tables of the last migration', () => {
    for (const table of [
      'user_memories',
      'user_prompts',
      'conversation_shares',
      'message_feedback',
      'scheduled_runs',
    ]) {
      expect(tables.has(table)).toBe(true);
    }
  });

  it('adds the tags and the trash columns to the conversations', () => {
    expect(tables.get('conversations')?.has('tags')).toBe(true);
    expect(tables.get('conversations')?.has('deleted_at')).toBe(true);
  });

  it('declares the uuid generator for the default primary keys', () => {
    expect(allSql).toMatch(/create extension if not exists "uuid-ossp"/i);
  });
});
