import { describe, it, expect } from 'vitest';
import {
  extractMemoryCandidates,
  parseRememberCommand,
  parseForgetCommand,
  matchesMemory,
} from './memory';

describe('memory extraction', () => {
  it('detects the name of the user', () => {
    const candidates = extractMemoryCandidates('Halo, nama saya Cahyunk.');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].content).toBe('Cahyunk');
    expect(candidates[0].category).toBe('identity');
  });

  it('detects a preference', () => {
    const candidates = extractMemoryCandidates('Saya suka TypeScript dan Tailwind CSS.');
    expect(candidates.some((c) => c.content.toLowerCase().includes('typescript'))).toBe(true);
    expect(candidates[0].category).toBe('preference');
  });

  it('detects the project of the user', () => {
    const candidates = extractMemoryCandidates('Saya sedang mengerjakan website toko online');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].category).toBe('project');
  });

  it('ignores a message without any fact', () => {
    expect(extractMemoryCandidates('Halo, apa kabar?')).toHaveLength(0);
    expect(extractMemoryCandidates('')).toHaveLength(0);
    expect(extractMemoryCandidates('ok')).toHaveLength(0);
  });

  it('never returns the same fact twice', () => {
    const candidates = extractMemoryCandidates('Nama saya Cahyunk. Nama saya Cahyunk.');
    const unique = new Set(candidates.map((c) => c.content.toLowerCase()));
    expect(unique.size).toBe(candidates.length);
  });

  it('returns at most three candidates', () => {
    const candidates = extractMemoryCandidates(
      'Nama saya Cahyunk. Saya suka kopi. Saya sedang membangun aplikasi. Saya tinggal di Samarinda.'
    );
    expect(candidates.length).toBeLessThanOrEqual(3);
  });
});

describe('memory commands', () => {
  it('parses the remember command', () => {
    expect(parseRememberCommand('/remember nama saya Cahyunk')).toBe('nama saya Cahyunk');
    expect(parseRememberCommand('/ingat saya bekerja sebagai devops')).toBe('saya bekerja sebagai devops');
  });

  it('ignores a text that is not a command', () => {
    expect(parseRememberCommand('tolong ingat apa yang saya katakan')).toBeNull();
    expect(parseRememberCommand('/remember')).toBeNull();
  });

  it('parses the forget command', () => {
    expect(parseForgetCommand('/forget nama saya Cahyunk')).toBe('nama saya Cahyunk');
    expect(parseForgetCommand('/lupakan kopi')).toBe('kopi');
  });

  it('matches a memory by content', () => {
    expect(matchesMemory('nama saya Cahyunk', 'cahyunk')).toBe(true);
    expect(matchesMemory('nama saya Cahyunk', 'kopi')).toBe(false);
  });
});
