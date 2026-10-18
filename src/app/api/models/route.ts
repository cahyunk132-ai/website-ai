/**
 * Hyunk AI Hub - Models Catalog API
 */

import { NextResponse } from 'next/server';
import { VERIFIED_MODELS } from '@/lib/ai/models';
import { radoxAdapter } from '@/lib/ai/providers/radox';
import { inkstoneAdapter } from '@/lib/ai/providers/inkstone';

export const dynamic = 'force-dynamic';

export async function GET() {
  const configuredProviders = {
    radox: radoxAdapter.isConfigured(),
    inkstone: inkstoneAdapter.isConfigured(),
  };

  const radoxModels = await radoxAdapter.listModels();
  const inkstoneModels = await inkstoneAdapter.listModels();
  const allModels = [...radoxModels, ...inkstoneModels];

  const modelsWithConfigState = allModels.map((model) => ({
    ...model,
    isProviderConfigured: configuredProviders[model.provider],
  }));

  return NextResponse.json({
    models: modelsWithConfigState,
    providers: [
      { id: 'radox', name: 'Radox AI', isConfigured: configuredProviders.radox },
      { id: 'inkstone', name: 'Intern InkStone', isConfigured: configuredProviders.inkstone },
    ],
  });
}
