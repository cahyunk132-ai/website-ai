/**
 * Hyunk AI Hub - Skill Contracts
 *
 * A "Skill" is a reusable instruction pack for the agent. It follows the
 * progressive-disclosure pattern:
 *
 *   1. The agent always sees the skill NAME + DESCRIPTION (cheap, always loaded).
 *   2. The full markdown BODY is loaded on demand, only when the agent decides
 *      the skill is relevant for the current task.
 *   3. A skill marked as "pinned" behaves as a manual preset persona: its body
 *      is injected up-front for every turn.
 */

export type SkillKind = 'system' | 'preset' | 'user';

export type SkillCategory =
  | 'engineering'
  | 'research'
  | 'writing'
  | 'data'
  | 'productivity'
  | 'security'
  | 'devops'
  | 'language'
  | 'general';

/**
 * Full skill record as stored in the database.
 */
export interface Skill {
  id: string;
  userId: string | null;
  slug: string;
  name: string;
  /** Short, one line summary. This is what the model sees during discovery. */
  description: string;
  /** Full markdown instruction body. Loaded on demand. */
  content: string;
  category: SkillCategory | string;
  icon: string;
  tags: string[];
  kind: SkillKind;
  isActive: boolean;
  /** Pinned skills are always preloaded (manual preset persona). */
  isPinned: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight skill descriptor used for catalog injection into the prompt.
 */
export interface SkillSummary {
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  kind: SkillKind;
  isPinned: boolean;
}

/**
 * A skill that has been loaded into the running agent context.
 */
export interface ActivatedSkill {
  slug: string;
  name: string;
  description: string;
  category: string;
  content: string;
  source: 'catalog' | 'pinned';
}
