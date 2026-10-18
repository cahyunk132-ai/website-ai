/**
 * Hyunk AI Hub - Multi-Credential Settings API
 * Allows viewing (masked), adding, testing, and deleting multiple API keys per provider.
 * Stores secrets encrypted at rest; never exposes raw secrets to the browser.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ProviderId } from '@/lib/ai/types';
import { keyPoolManager } from '@/lib/ai/keyPool';
import { RadoxAdapter } from '@/lib/ai/providers/radox';
import { InkstoneAdapter } from '@/lib/ai/providers/inkstone';
import { getSessionFromRequest } from '@/lib/auth';

const addKeySchema = z.object({
  provider: z.enum(['radox', 'inkstone']),
  apiKey: z.string().min(5),
});

const deleteKeySchema = z.object({
  provider: z.enum(['radox', 'inkstone']),
  keyId: z.string().min(3),
});

export const dynamic = 'force-dynamic';

export async function GET() {
  await keyPoolManager.refreshPool();

  const providers: ProviderId[] = ['radox', 'inkstone'];
  const result: Record<string, any> = {};

  for (const p of providers) {
    const keys = await keyPoolManager.listKeysForClient(p);
    const activeKeys = keys.filter((k) => k.isHealthy && !k.isCoolingDown).length;

    result[p] = {
      isConfigured: keys.length > 0,
      keys,
      totalKeys: keys.length,
      activeKeys,
      hasEnvKey: keys.some((k) => k.source === 'env'),
    };
  }

  return NextResponse.json({ settings: result });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Akses ditolak: Hanya akun Administrator yang dapat mengubah atau menambah API Key sistem.' },
        { status: 403 }
      );
    }

    const json = await req.json();

    // Check if this is a delete action via POST
    if (json.action === 'delete') {
      const parsedDel = deleteKeySchema.safeParse(json);
      if (!parsedDel.success) {
        return NextResponse.json({ error: 'Invalid delete request payload' }, { status: 400 });
      }
      const { provider, keyId } = parsedDel.data;
      const removed = await keyPoolManager.removeKey(provider, keyId);
      return NextResponse.json({
        success: removed,
        message: removed ? 'API key removed from pool.' : 'Key not found in pool or managed by environment variable.',
      });
    }

    const parsed = addKeySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
    }

    const { provider, apiKey } = parsed.data;

    // Test health of the key first before adding
    let isHealthy = false;
    try {
      if (provider === 'radox') {
        const adapter = new RadoxAdapter(apiKey.split(/[\n,;]+/)[0].trim());
        isHealthy = await adapter.checkHealth();
      } else if (provider === 'inkstone') {
        const adapter = new InkstoneAdapter(apiKey.split(/[\n,;]+/)[0].trim());
        isHealthy = await adapter.checkHealth();
      }
    } catch {
      isHealthy = false;
    }

    const addedCount = await keyPoolManager.addKeys(provider, apiKey);

    return NextResponse.json({
      success: true,
      provider,
      addedCount,
      isHealthy,
      message: `${addedCount} API key(s) added to ${provider === 'radox' ? 'Radox AI' : 'Intern InkStone'} pool. Live connection test: ${isHealthy ? 'PASSED (200 OK)' : 'REGISTERED (UNVERIFIED)'}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update credentials';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Akses ditolak: Hanya akun Administrator yang dapat menghapus API Key sistem.' },
        { status: 403 }
      );
    }

    const json = await req.json();
    const parsed = deleteKeySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { provider, keyId } = parsed.data;
    const removed = await keyPoolManager.removeKey(provider, keyId);

    return NextResponse.json({
      success: removed,
      message: removed ? 'Key removed from pool' : 'Cannot remove key or key not found',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete key';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
