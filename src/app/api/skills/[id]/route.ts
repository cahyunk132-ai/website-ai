/**
 * Hyunk AI Hub - Individual Skill API (update / pin / delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/auth';
import { updateUserSkill, deleteUserSkill, setSkillPinned } from '@/lib/skills/registry';

export const dynamic = 'force-dynamic';

const updateSkillSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
  content: z.string().max(20000).optional(),
  category: z.string().max(40).optional(),
  icon: z.string().max(40).optional(),
  tags: z.array(z.string().max(40)).max(12).optional(),
  isPinned: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const parsed = updateSkillSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    // Pinning a shared system skill forks it into a user owned preset.
    if (parsed.data.isPinned !== undefined) {
      const pinned = await setSkillPinned(user.id, id, parsed.data.isPinned);
      if (!pinned) {
        return NextResponse.json({ error: 'Skill tidak ditemukan.' }, { status: 404 });
      }
    }

    const skill = await updateUserSkill(user.id, id, parsed.data);
    if (!skill) {
      return NextResponse.json(
        { error: 'Skill tidak ditemukan atau tidak dapat diubah.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ skill });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update skill';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const { id } = params;
    const deleted = await deleteUserSkill(user.id, id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Skill tidak ditemukan atau tidak dapat dihapus.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete skill';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
