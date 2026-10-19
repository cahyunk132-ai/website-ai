/**
 * Hyunk AI Hub - Skill Registry
 *
 * Server side access to the skill library. Skills live in the `skills` table:
 *
 *   * system skills  -> user_id IS NULL, seeded by the migration, shared by everyone
 *   * user skills    -> owned by a user, created from the Skills panel
 *
 * When Supabase is not configured the registry falls back to the built-in
 * library plus an in-process store, so the feature keeps working locally.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseAdminClient } from '../supabase/server';
import { BUILTIN_SKILLS, BuiltinSkillDefinition } from './builtins';
import { ActivatedSkill, Skill, SkillSummary } from './types';

const MEMORY_SKILLS_KEY = Symbol.for('hyunk-ai-hub.memory-skills');

/**
 * In-process store for user authored skills (development fallback).
 */
function getMemoryUserSkills(): Map<string, Skill[]> {
  const scope = globalThis as unknown as Record<symbol, Map<string, Skill[]> | undefined>;
  if (!scope[MEMORY_SKILLS_KEY]) {
    scope[MEMORY_SKILLS_KEY] = new Map<string, Skill[]>();
  }
  return scope[MEMORY_SKILLS_KEY] as Map<string, Skill[]>;
}

function getClient(): SupabaseClient | null {
  return (createServerSupabaseAdminClient() as SupabaseClient | null) ?? null;
}

function mapRow(row: any): Skill {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    content: row.content ?? '',
    category: row.category ?? 'general',
    icon: row.icon ?? 'sparkles',
    tags: Array.isArray(row.tags) ? row.tags : [],
    kind: row.kind ?? 'user',
    isActive: row.is_active !== false,
    isPinned: Boolean(row.is_pinned),
    sortOrder: row.sort_order ?? 100,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function builtinToSkill(definition: BuiltinSkillDefinition): Skill {
  const now = new Date().toISOString();
  return {
    id: `builtin-${definition.slug}`,
    userId: null,
    slug: definition.slug,
    name: definition.name,
    description: definition.description,
    content: definition.content,
    category: definition.category,
    icon: definition.icon,
    tags: definition.tags,
    kind: definition.kind,
    isActive: true,
    isPinned: false,
    sortOrder: definition.sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Normalises a user supplied identifier into a safe slug.
 */
export function slugifySkillName(input: string): string {
  return (input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Lists every skill visible to a user: the active system skills plus their own skills.
 *
 * When a user pinned (and therefore forked) a system skill, the user copy wins:
 * the system skill is replaced so the UI never shows the same skill twice.
 */
export async function listSkills(userId?: string): Promise<Skill[]> {
  const client = getClient();

  if (client) {
    try {
      const { data, error } = await client
        .from('skills')
        .select('*')
        .or(`user_id.is.null${userId ? `,user_id.eq.${userId}` : ''}`)
        .order('sort_order', { ascending: true });

      if (!error && data) {
        return mergeSkillScopes(data.map(mapRow));
      }
    } catch {
      // Fall through to the built-in library
    }
  }

  const systemSkills = BUILTIN_SKILLS.map(builtinToSkill);
  const userSkills = userId ? getMemoryUserSkills().get(userId) || [] : [];
  return mergeSkillScopes([...systemSkills, ...userSkills]);
}

/**
 * Removes duplicated slugs, keeping the user owned copy over the system one.
 */
function mergeSkillScopes(skills: Skill[]): Skill[] {
  const bySlug = new Map<string, Skill>();

  for (const skill of skills) {
    const existing = bySlug.get(skill.slug);
    if (!existing) {
      bySlug.set(skill.slug, skill);
      continue;
    }
    // A user owned skill (userId set) overrides the shared system skill.
    if (skill.userId && !existing.userId) {
      bySlug.set(skill.slug, skill);
    }
  }

  return Array.from(bySlug.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Returns the discovery catalog: name + description only.
 *
 * This is what gets injected into the agent system prompt. The (much longer)
 * skill bodies are only fetched when the agent explicitly requests a skill.
 */
export async function getSkillCatalog(userId?: string): Promise<SkillSummary[]> {
  const skills = await listSkills(userId);
  return skills
    .filter((skill) => skill.isActive)
    .map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      icon: skill.icon,
      kind: skill.kind,
      isPinned: skill.isPinned,
    }));
}

/**
 * Resolves a single skill (system or user owned) by slug.
 */
export async function getSkillBySlug(slug: string, userId?: string): Promise<Skill | null> {
  const normalized = (slug || '').trim().toLowerCase();
  if (!normalized) return null;

  const client = getClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('skills')
        .select('*')
        .eq('slug', normalized)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        const skill = mapRow(data);
        // A user skill is only visible to its owner.
        if (skill.userId && skill.userId !== userId) return null;
        return skill;
      }
    } catch {
      // Fall through
    }
  }

  const builtin = BUILTIN_SKILLS.find((skill) => skill.slug === normalized);
  if (builtin) return builtinToSkill(builtin);

  const userSkills = userId ? getMemoryUserSkills().get(userId) || [] : [];
  return userSkills.find((skill) => skill.slug === normalized) || null;
}

/**
 * Loads the full body of a skill (progressive disclosure, second stage).
 */
export async function loadSkillContent(
  slug: string,
  userId?: string
): Promise<ActivatedSkill | null> {
  const skill = await getSkillBySlug(slug, userId);
  if (!skill || !skill.isActive) return null;

  return {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    content: skill.content,
    source: skill.isPinned ? 'pinned' : 'catalog',
  };
}

/**
 * Returns the skills a user pinned as a manual preset persona.
 */
export async function getPinnedSkills(userId?: string): Promise<Skill[]> {
  if (!userId) return [];
  const skills = await listSkills(userId);
  return skills.filter((skill) => skill.isPinned && skill.isActive);
}

/**
 * Loads the pinned skills of a user, ready to be injected into the system prompt.
 */
export async function loadPinnedSkills(userId?: string): Promise<ActivatedSkill[]> {
  const pinned = await getPinnedSkills(userId);
  return pinned.map((skill) => ({
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    content: skill.content,
    source: 'pinned' as const,
  }));
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  content: string;
  category?: string;
  icon?: string;
  tags?: string[];
  isPinned?: boolean;
}

/**
 * Creates a user owned skill.
 */
export async function createUserSkill(
  userId: string,
  input: CreateSkillInput
): Promise<Skill> {
  const name = (input.name || '').trim();
  if (!name) throw new Error('Nama skill tidak boleh kosong.');
  if (!userId) throw new Error('User session required to create a skill.');

  let slug = slugifySkillName(name) || `skill-${Date.now()}`;
  const now = new Date().toISOString();

  const client = getClient();
  if (client) {
    // Guarantee slug uniqueness for this user.
    const { data: existing } = await client
      .from('skills')
      .select('slug')
      .eq('user_id', userId)
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const { data, error } = await client
      .from('skills')
      .insert({
        user_id: userId,
        slug,
        name,
        description: (input.description || '').trim() || name,
        content: input.content || '',
        category: input.category || 'general',
        icon: input.icon || 'sparkles',
        tags: input.tags || [],
        kind: 'user',
        is_active: true,
        is_pinned: Boolean(input.isPinned),
        sort_order: 100,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (!error && data) return mapRow(data);
  }

  const skill: Skill = {
    id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    slug,
    name,
    description: (input.description || '').trim() || name,
    content: input.content || '',
    category: input.category || 'general',
    icon: input.icon || 'sparkles',
    tags: input.tags || [],
    kind: 'user',
    isActive: true,
    isPinned: Boolean(input.isPinned),
    sortOrder: 100,
    createdAt: now,
    updatedAt: now,
  };

  const store = getMemoryUserSkills();
  store.set(userId, [...(store.get(userId) || []), skill]);
  return skill;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  content?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  isPinned?: boolean;
  isActive?: boolean;
}

/**
 * Updates a user owned skill. System skills are immutable.
 */
export async function updateUserSkill(
  userId: string,
  skillId: string,
  updates: UpdateSkillInput
): Promise<Skill | null> {
  if (!userId) return null;

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.description !== undefined) patch.description = updates.description.trim();
  if (updates.content !== undefined) patch.content = updates.content;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.icon !== undefined) patch.icon = updates.icon;
  if (updates.tags !== undefined) patch.tags = updates.tags;
  if (updates.isPinned !== undefined) patch.is_pinned = updates.isPinned;
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;

  const client = getClient();
  if (client) {
    const { data, error } = await client
      .from('skills')
      .update(patch)
      .eq('id', skillId)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (!error && data) return mapRow(data);
    if (error) return null;
  }

  const store = getMemoryUserSkills();
  const list = store.get(userId) || [];
  const index = list.findIndex((skill) => skill.id === skillId);
  if (index === -1) return null;

  const updated: Skill = { ...list[index], ...updates, updatedAt: patch.updated_at };
  list[index] = updated;
  store.set(userId, list);
  return updated;
}

/**
 * Deletes a user owned skill. System skills cannot be deleted.
 */
export async function deleteUserSkill(userId: string, skillId: string): Promise<boolean> {
  if (!userId) return false;

  const client = getClient();
  if (client) {
    const { data, error } = await client
      .from('skills')
      .delete()
      .eq('id', skillId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();

    if (!error) return Boolean(data);
    return false;
  }

  const store = getMemoryUserSkills();
  const list = store.get(userId) || [];
  const next = list.filter((skill) => skill.id !== skillId);
  if (next.length === list.length) return false;
  store.set(userId, next);
  return true;
}

/**
 * Pins or unpins a skill. Pinning turns a skill into a manual preset persona.
 *
 * System skills are shared and therefore immutable: pinning one forks it into a
 * user owned copy (kind "preset") that carries the pin state.
 */
export async function setSkillPinned(
  userId: string,
  skillId: string,
  pinned: boolean
): Promise<Skill | null> {
  if (!userId) return null;

  const client = getClient();
  if (client) {
    const { data: row } = await client
      .from('skills')
      .select('*')
      .eq('id', skillId)
      .maybeSingle();

    if (row) {
      const skill = mapRow(row);

      if (skill.userId === userId) {
        return updateUserSkill(userId, skillId, { isPinned: pinned });
      }

      if (skill.userId === null) {
        if (!pinned) return skill;

        // Fork the system skill into a user owned, pinned preset.
        const existing = await getSkillBySlug(skill.slug, userId);
        if (existing && existing.userId === userId) {
          return updateUserSkill(userId, existing.id, { isPinned: true });
        }

        return createUserSkill(userId, {
          name: skill.name,
          description: skill.description,
          content: skill.content,
          category: skill.category,
          icon: skill.icon,
          tags: skill.tags,
          isPinned: true,
        });
      }

      return null;
    }
  }

  // Fallback: in-process store.
  const store = getMemoryUserSkills();
  const list = store.get(userId) || [];
  const own = list.find((skill) => skill.id === skillId);
  if (own) return updateUserSkill(userId, skillId, { isPinned: pinned });

  const builtin = BUILTIN_SKILLS.find((skill) => `builtin-${skill.slug}` === skillId);
  if (builtin) {
    if (!pinned) return builtinToSkill(builtin);
    const existing = list.find((skill) => skill.slug === builtin.slug);
    if (existing) return updateUserSkill(userId, existing.id, { isPinned: true });
    return createUserSkill(userId, {
      name: builtin.name,
      description: builtin.description,
      content: builtin.content,
      category: builtin.category,
      icon: builtin.icon,
      tags: builtin.tags,
      isPinned: true,
    });
  }

  return null;
}
