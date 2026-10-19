/**
 * Hyunk AI Hub - Skills API
 * Lists the skill library (system skills + user skills) and creates user skills.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/auth';
import {
  listSkills,
  getSkillCatalog,
  createUserSkill,
} from '@/lib/skills/registry';

export const dynamic = 'force-dynamic';

const createSkillSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  content: z.string().max(20000),
  category: z.string().max(40).optional(),
  icon: z.string().max(40).optional(),
  tags: z.array(z.string().max(40)).max(12).optional(),
  isPinned: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const [skills, catalog] = await Promise.all([
      listSkills(user.id),
      getSkillCatalog(user.id),
    ]);

    return NextResponse.json({ skills, catalog });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list skills';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSkillSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const skill = await createUserSkill(user.id, parsed.data);
    return NextResponse.json({ skill }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create skill';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
