/**
 * Hyunk AI Hub - Models Catalog API
 */

import { keyPoolManager } from '@/lib/ai/keyPool';

import { NextResponse } from 'next/server';
import { customModelCatalog } from '@/lib/ai/endpointStore';
import { radoxAdapter } from '@/lib/ai/providers/radox';
import { inkstoneAdapter } from '@/lib/ai/providers/inkstone';

export const dynamic = 'force-dynamic';

export async function GET() {
  await keyPoolManager.refreshPool();
  const configuredProviders = {
    radox: radoxAdapter.isConfigured(),
    inkstone: inkstoneAdapter.isConfigured(),
  };

  const radoxModels = await radoxAdapter.listModels();
  const inkstoneModels = await inkstoneAdapter.listModels();
  const customModels = await customModelCatalog();
  const allModels = [...radoxModels, ...inkstoneModels, ...customModels];

  const modelsWithConfigState = allModels.map((model) => ({
    ...model,
    isProviderConfigured: model.provider.startsWith('custom:') || configuredProviders[model.provider as keyof typeof configuredProviders],
  }));

  return NextResponse.json({
    models: modelsWithConfigState,
    providers: [
      { id: 'radox', name: 'Radox AI', isConfigured: configuredProviders.radox },
      { id: 'inkstone', name: 'Intern InkStone', isConfigured: configuredProviders.inkstone },
      ...Array.from(new Set(customModels.map((model) => model.provider))).map((id) => ({ id, name: customModels.find((model) => model.provider === id)!.name.split(' · ').slice(1).join(' · '), isConfigured: true })),
    ],
  });
}
