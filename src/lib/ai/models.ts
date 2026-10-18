/**
 * Hyunk AI Hub - Verified Model Registry & Fallback Mapping
 */

import { ModelCapability, ProviderId } from './types';

export const VERIFIED_MODELS: ModelCapability[] = [
  // --- Radox AI Models ---
  {
    id: 'claude-opus-4.8',
    name: 'Claude Opus 4.8 (Radox)',
    provider: 'radox',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 75.0,
    isFreeQuotaEligible: false,
    fallbackModelId: 'intern-latest',
    fallbackProvider: 'inkstone',
    description: 'Premier frontier reasoning and coding model via Radox AI gateway.',
    tags: ['Flagship', 'Coding', 'Reasoning', 'Vision'],
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5 (Radox)',
    provider: 'radox',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    isFreeQuotaEligible: false,
    fallbackModelId: 'intern-latest',
    fallbackProvider: 'inkstone',
    description: 'High-speed autonomous engineering and frontier benchmark model.',
    tags: ['Fast', 'Coding', 'Vision'],
  },
  {
    id: 'gpt-5.5',
    name: 'GPT-5.5 (Radox)',
    provider: 'radox',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 10.0,
    isFreeQuotaEligible: true,
    fallbackModelId: 'intern-latest',
    fallbackProvider: 'inkstone',
    description: 'Next-generation omni model with advanced general understanding.',
    tags: ['Omni', 'Multimodal', 'General'],
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash (Radox)',
    provider: 'radox',
    contextWindow: 1000000,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.4,
    isFreeQuotaEligible: true,
    fallbackModelId: 'intern-latest',
    fallbackProvider: 'inkstone',
    description: 'Ultra high-speed 1M context multimodal reasoning model.',
    tags: ['1M Context', 'Ultra Fast', 'Multimodal'],
  },
  {
    id: 'deepseek-v4-pro-max',
    name: 'DeepSeek-V4 Pro Max (Radox)',
    provider: 'radox',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: false,
    supportsTools: true,
    inputPricePerMillion: 0.27,
    outputPricePerMillion: 1.1,
    isFreeQuotaEligible: true,
    fallbackModelId: 'intern-latest',
    fallbackProvider: 'inkstone',
    description: 'State of the art open-weight MoE reasoning and coding architecture.',
    tags: ['MoE', 'Coding', 'Top Value'],
  },
  {
    id: 'qwen3.8-max',
    name: 'Qwen 3.8 Max (Radox)',
    provider: 'radox',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: false,
    supportsTools: true,
    inputPricePerMillion: 1.6,
    outputPricePerMillion: 6.4,
    isFreeQuotaEligible: true,
    fallbackModelId: 'intern-latest',
    fallbackProvider: 'inkstone',
    description: 'Alibaba flagship LLM with superior multilingual & mathematical logic.',
    tags: ['Multilingual', 'Math', 'Reasoning'],
  },
  {
    id: 'kimi-k3',
    name: 'Kimi K3 (Radox)',
    provider: 'radox',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsVision: false,
    supportsTools: true,
    inputPricePerMillion: 1.0,
    outputPricePerMillion: 2.0,
    isFreeQuotaEligible: true,
    fallbackModelId: 'intern-latest',
    fallbackProvider: 'inkstone',
    description: 'Moonshot AI long-context reasoning powerhouse.',
    tags: ['Long Context', 'General'],
  },

  // --- Intern InkStone Models ---
  {
    id: 'intern-latest',
    name: 'InternLM Latest (InkStone)',
    provider: 'inkstone',
    contextWindow: 32768,
    supportsStreaming: true,
    supportsVision: false,
    supportsTools: true,
    inputPricePerMillion: 0.0, // Research tier
    outputPricePerMillion: 0.0,
    isFreeQuotaEligible: true,
    fallbackModelId: 'deepseek-chat',
    fallbackProvider: 'radox',
    description: 'Shanghai AI Laboratory flagship foundation model optimized for academic and research workflows.',
    tags: ['Free Research', 'Bilingual', 'Academic'],
  },
  {
    id: 'internlm2.5-latest',
    name: 'InternLM 2.5 Latest (InkStone)',
    provider: 'inkstone',
    contextWindow: 32768,
    supportsStreaming: true,
    supportsVision: false,
    supportsTools: true,
    inputPricePerMillion: 0.0,
    outputPricePerMillion: 0.0,
    isFreeQuotaEligible: true,
    fallbackModelId: 'intern-latest',
    fallbackProvider: 'inkstone',
    description: 'Refined reasoning, 1M context capable architecture in compact deployment.',
    tags: ['Reasoning', 'Fast', 'Research'],
  },
  {
    id: 'internlm2.5-7b-chat',
    name: 'InternLM 2.5 7B (InkStone)',
    provider: 'inkstone',
    contextWindow: 32768,
    supportsStreaming: true,
    supportsVision: false,
    supportsTools: false,
    inputPricePerMillion: 0.0,
    outputPricePerMillion: 0.0,
    isFreeQuotaEligible: true,
    fallbackModelId: 'intern-latest',
    fallbackProvider: 'inkstone',
    description: 'Lightweight, ultra-low latency conversational assistant.',
    tags: ['Ultra-fast', 'Lightweight'],
  },
  {
    id: 'internvl2.5-78b',
    name: 'InternVL 2.5 78B (InkStone)',
    provider: 'inkstone',
    contextWindow: 32768,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: false,
    inputPricePerMillion: 0.0,
    outputPricePerMillion: 0.0,
    isFreeQuotaEligible: true,
    fallbackModelId: 'gpt-4o',
    fallbackProvider: 'radox',
    description: 'Top-tier open-source multimodal vision-language model.',
    tags: ['Vision', 'Research', 'Multimodal'],
  },

];

export function getModelById(modelId: string): ModelCapability | undefined {
  return VERIFIED_MODELS.find((m) => m.id === modelId);
}

export function getModelsByProvider(provider: ProviderId): ModelCapability[] {
  return VERIFIED_MODELS.filter((m) => m.provider === provider);
}

export function getFallbackForModel(model: ModelCapability): {
  targetModelId: string;
  targetProvider: ProviderId;
} | null {
  if (model.fallbackModelId && model.fallbackProvider) {
    return {
      targetModelId: model.fallbackModelId,
      targetProvider: model.fallbackProvider,
    };
  }

  // Generic fallback if none explicitly set
  if (model.provider === 'radox') {
    return { targetModelId: 'intern-latest', targetProvider: 'inkstone' };
  } else {
    return { targetModelId: 'deepseek-chat', targetProvider: 'radox' };
  }
}
