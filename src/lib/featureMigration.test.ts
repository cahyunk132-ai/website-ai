import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The new features live in Supabase. This test makes sure the migration
 * declares every table and column the application expects, so a deployment
 * that forgot to run the migration fails here instead of at runtime.
 */
const MIGRATION_PATH = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20261021000000_features_memory_share_schedule.sql'
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('feature migration', () => {
  it('creates the memory table', () => {
    expect(sql).toMatch(/create table if not exists public\.user_memories/i);
    expect(sql).toMatch(/content text not null/i);
    expect(sql).toMatch(/category text/i);
    expect(sql).toMatch(/source text/i);
    expect(sql).toMatch(/enabled boolean/i);
  });

  it('creates the prompt library table', () => {
    expect(sql).toMatch(/create table if not exists public\.user_prompts/i);
    expect(sql).toMatch(/title text not null/i);
  });

  it('creates the share table with a unique token', () => {
    expect(sql).toMatch(/create table if not exists public\.conversation_shares/i);
    expect(sql).toMatch(/token text not null unique/i);
    expect(sql).toMatch(/expires_at/i);
  });

  it('creates the feedback table', () => {
    expect(sql).toMatch(/create table if not exists public\.message_feedback/i);
    expect(sql).toMatch(/rating text not null check \(rating in \('up', 'down'\)\)/i);
    expect(sql).toMatch(/unique \(message_id, user_id\)/i);
  });

  it('creates the scheduled runs table', () => {
    expect(sql).toMatch(/create table if not exists public\.scheduled_runs/i);
    expect(sql).toMatch(/cron text not null/i);
    expect(sql).toMatch(/last_run_at/i);
  });

  it('adds the tags and the trash columns to the conversations', () => {
    expect(sql).toMatch(/alter table public\.conversations add column if not exists tags text\[\]/i);
    expect(sql).toMatch(
      /alter table public\.conversations add column if not exists deleted_at timestamp/i
    );
  });

  it('enables row level security on every new table', () => {
    for (const table of [
      'user_memories',
      'user_prompts',
      'conversation_shares',
      'message_feedback',
      'scheduled_runs',
    ]) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, 'i')
      );
      expect(sql).toMatch(new RegExp(`on public\\.${table} for all`, 'i'));
    }
  });

  it('is idempotent', () => {
    expect(sql).toMatch(/create table if not exists/gi);
    expect(sql).toMatch(/add column if not exists/gi);
    expect(sql).toMatch(/create index if not exists/gi);
  });
});
