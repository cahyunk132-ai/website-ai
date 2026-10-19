/**
 * Hyunk AI Hub - AI Memory Engine
 *
 * Detects the facts a user wants the assistant to remember and turns them
 * into short, reusable memory entries.
 *
 * The extraction is intentionally heuristic: it runs locally, costs nothing
 * and never sends the conversation to an extra model. Every candidate is
 * stored with the `auto` source so the user can review, disable or delete it
 * from the memory panel.
 */

export type MemoryCategory = 'identity' | 'preference' | 'project' | 'style' | 'general';

export interface MemoryCandidate {
  content: string;
  category: MemoryCategory;
  confidence: number;
}

interface ExtractionRule {
  category: MemoryCategory;
  pattern: RegExp;
  confidence: number;
  /** Trims the noise around the captured group. */
  clean?: (value: string) => string;
}

const RULES: ExtractionRule[] = [
  {
    category: 'identity',
    pattern: /\b(?:nama saya|name saya|my name is|i am called|saya bernama|panggil saya)\s+([a-zA-ZÀ-ÿ' .-]{2,60})/i,
    confidence: 0.9,
    clean: (value) => value.replace(/[.,;!?]+$/, '').trim(),
  },
  {
    category: 'identity',
    pattern: /\b(?:saya (?:adalah|merupakan) (?:seorang|seorang orang)?\s*)([a-zA-ZÀ-ÿ ]{3,60})/i,
    confidence: 0.55,
    clean: (value) => value.replace(/[.,;!?]+$/, '').trim(),
  },
  {
    category: 'identity',
    pattern: /\b(?:saya tinggal di|i live in|saya berada di)\s+([a-zA-ZÀ-ÿ ]{3,60})/i,
    confidence: 0.8,
    clean: (value) => value.replace(/[.,;!?]+$/, '').trim(),
  },
  {
    category: 'project',
    pattern: /\b(?:saya (?:sedang )?(?:mengerjakan|develop|bekerja pada|build)\s+)([a-zA-Z0-9À-ÿ ._-]{3,80})/i,
    confidence: 0.7,
    clean: (value) => value.replace(/[.,;!?]+$/, '').trim(),
  },
  {
    category: 'project',
    pattern: /\b(?:project saya|my project adalah|proyek saya adalah)\s+([a-zA-Z0-9À-ÿ ._-]{3,80})/i,
    confidence: 0.8,
    clean: (value) => value.replace(/[.,;!?]+$/, '').trim(),
  },
  {
    category: 'preference',
    pattern: /\b(?:saya (?:suka|mencintai|prefer|lebih suka)|i (?:like|prefer|love))\s+([a-zA-Z0-9À-ÿ ._'-]{2,80})/i,
    confidence: 0.75,
    clean: (value) => value.replace(/[.,;!?]+$/, '').trim(),
  },
  {
    category: 'preference',
    pattern: /\b(?:saya tidak suka|jangan (?:sebagai|pakai|gunakan)|don'?t (?:use|include))\s+([a-zA-Z0-9À-ÿ ._'-]{2,80})/i,
    confidence: 0.75,
    clean: (value) => value.replace(/[.,;!?]+$/, '').trim(),
  },
  {
    category: 'preference',
    pattern: /\b(?:gunakan|always gunakan|always use|pakai)\s+([a-zA-Z0-9À-ÿ ._+-]{2,60})/i,
    confidence: 0.6,
    clean: (value) => value.replace(/[.,;!?]+$/, '').trim(),
  },
  {
    category: 'style',
    pattern: /\b(?:jawab(?:an)? saya? (?:dengan|harus|dalam)\s+(?:bahasa\s+)?([a-zA-ZÀ-ÿ ]{3,40}))/i,
    confidence: 0.7,
    clean: (value) => value.replace(/[.,;!?]+$/, '').trim(),
  },
  {
    category: 'style',
    pattern: /\b(?:always answer|always respond|jawab selalu)\s+(?:in|dalam)\s+([a-zA-ZÀ-ÿ ]{3,40})/i,
    confidence: 0.7,
    clean: (value) => value.replace(/[.,;!?]+$/, '').trim(),
  },
];

/** Words that make a candidate too generic to be worth remembering. */
const STOP_WORDS = new Set([
  'yang',
  'ini',
  'itu',
  'dan',
  'atau',
  'untuk',
  'dengan',
  'dari',
  'the',
  'a',
  'an',
  'and',
  'or',
  'for',
  'with',
  'to',
]);

const MAX_CANDIDATE_LENGTH = 180;

function normalizeCandidate(value: string): string {
  let text = value.replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:di|ke|dari|adalah|is|are)\s+/i, '').trim();
  if (text.endsWith(',')) text = text.slice(0, -1);
  return text;
}

function isUseful(text: string): boolean {
  if (text.length < 3) return false;
  if (text.length > MAX_CANDIDATE_LENGTH) return false;
  const words = text.toLowerCase().split(/\s+/);
  if (words.length === 1 && STOP_WORDS.has(words[0])) return false;
  if (words.every((word) => STOP_WORDS.has(word))) return false;
  return true;
}

/**
 * Extracts the memory candidates out of a user message.
 */
export function extractMemoryCandidates(text: string): MemoryCandidate[] {
  if (!text || text.length < 8) return [];

  const candidates: MemoryCandidate[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    const matches = text.matchAll(new RegExp(rule.pattern.source, `${rule.pattern.flags}g`));
    for (const match of matches) {
      const raw = match[1];
      if (!raw) continue;
      const value = normalizeCandidate(rule.clean ? rule.clean(raw) : raw);
      if (!isUseful(value)) continue;

      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      candidates.push({
        content: value,
        category: rule.category,
        confidence: rule.confidence,
      });
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

/**
 * Parses the `/remember <fact>` slash command.
 */
export function parseRememberCommand(input: string): string | null {
  const match = input.trim().match(/^\/(?:remember|ingat|inget)\s+(.+)$/i);
  if (!match) return null;
  const content = match[1].trim();
  return content.length >= 3 ? content : null;
}

/**
 * Parses the `/forget <fact>` slash command.
 */
export function parseForgetCommand(input: string): string | null {
  const match = input.trim().match(/^\/(?:forget|lupakan|lupa)\s+(.+)$/i);
  if (!match) return null;
  const content = match[1].trim();
  return content.length >= 3 ? content : null;
}

/**
 * Removes a memory that matches the given text (case insensitive).
 */
export function matchesMemory(content: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  const haystack = content.trim().toLowerCase();
  return haystack === needle || haystack.includes(needle) || needle.includes(haystack);
}
