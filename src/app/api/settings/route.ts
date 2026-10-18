/**
 * Hyunk AI Hub - Provider Credentials & Settings Management
 * Stores secrets encrypted at rest; never exposes raw secrets to the browser.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ProviderId } from '@/lib/ai/types';
import { maskApiKey } from '@/lib/crypto';
import { saveProviderApiKey, getProviderApiKey } from '@/lib/storage';
import { radoxAdapter, RadoxAdapter } from '@/lib/ai/providers/radox';
import { inkstoneAdapter, InkstoneAdapter } from '@/lib/ai/providers/inkstone';
import { experientialAdapter, ExperientialAdapter } from '@/lib/ai/providers/experiential';

const updateSettingsSchema = z.object({
  provider: z.enum(['radox', 'inkstone', 'experiential']),
  apiKey: z.string().min(5),
});

export async function GET() {
  const providers: ProviderId[] = ['radox', 'inkstone', 'experiential'];
  const result: Record<string, { isConfigured: boolean; maskedKey: string; hasEnvKey: boolean }> = {};

  for (const p of providers) {
    const envKey =
      p === 'radox'
        ? process.env.RADOX_API_KEY
        : p === 'inkstone'
        ? process.env.INKSTONE_API_KEY
        : process.env.EXPERIENTIAL_API_KEY;

    const storedKey = await getProviderApiKey(p);
    const activeKey = storedKey || envKey;

    result[p] = {
      isConfigured: Boolean(activeKey),
      maskedKey: maskApiKey(activeKey),
      hasEnvKey: Boolean(envKey),
    };
  }

  return NextResponse.json({ settings: result });
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = updateSettingsSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
    }

    const { provider, apiKey } = parsed.data;

    // Save encrypted key at rest
    await saveProviderApiKey(provider, apiKey);

    // Test health with the new key
    let isHealthy = false;
    if (provider === 'radox') {
      const adapter = new RadoxAdapter(apiKey);
      isHealthy = await adapter.checkHealth();
    } else if (provider === 'inkstone') {
      const adapter = new InkstoneAdapter(apiKey);
      isHealthy = await adapter.checkHealth();
    } else if (provider === 'experiential') {
      const adapter = new ExperientialAdapter(apiKey);
      isHealthy = await adapter.checkHealth();
    }

    return NextResponse.json({
      success: true,
      provider,
      maskedKey: maskApiKey(apiKey),
      isHealthy,
      message: `Credentials updated successfully for ${provider}. Connection test: ${isHealthy ? 'PASSED' : 'UNREACHABLE / CHECK CREDENTIALS'}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update credentials';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
