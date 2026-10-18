/**
 * Hyunk AI Hub - Models Catalog API
 */

import { NextResponse } from 'next/server';
import { VERIFIED_MODELS } from '@/lib/ai/models';
import { radoxAdapter } from '@/lib/ai/providers/radox';
import { inkstoneAdapter } from '@/lib/ai/providers/inkstone';
import { experientialAdapter } from '@/lib/ai/providers/experiential';

export async function GET() {
  const configuredProviders = {
    radox: radoxAdapter.isConfigured(),
    inkstone: inkstoneAdapter.isConfigured(),
    experiential: experientialAdapter.isConfigured(),
  };

  const modelsWithConfigState = VERIFIED_MODELS.map((model) => ({
    ...model,
    isProviderConfigured: configuredProviders[model.provider],
  }));

  return NextResponse.json({
    models: modelsWithConfigState,
    providers: [
      { id: 'radox', name: 'Radox AI', isConfigured: configuredProviders.radox },
      { id: 'inkstone', name: 'Intern InkStone', isConfigured: configuredProviders.inkstone },
      { id: 'experiential', name: 'Experiential Labs', isConfigured: configuredProviders.experiential },
    ],
  });
}
