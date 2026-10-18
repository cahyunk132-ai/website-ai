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
    fallbackModelId: 'experiential-claude-3-5-sonnet',
    fallbackProvider: 'experiential',
    description: 'Premier frontier reasoning and coding model via Radox AI gateway.',
    tags: ['Flagship', 'Coding', 'Reasoning', 'Vision'],
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o (Radox)',
    provider: 'radox',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 10.0,
    isFreeQuotaEligible: true,
    fallbackModelId: 'experiential-gpt-4o',
    fallbackProvider: 'experiential',
    description: 'Omni multimodal model with high speed and audio/visual understanding.',
    tags: ['Multimodal', 'Fast', 'General'],
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek-V3 (Radox)',
    provider: 'radox',
    contextWindow: 64000,
    supportsStreaming: true,
    supportsVision: false,
    supportsTools: true,
    inputPricePerMillion: 0.14,
    outputPricePerMillion: 0.28,
    isFreeQuotaEligible: true,
    fallbackModelId: 'intern-latest',
    fallbackProvider: 'inkstone',
    description: 'Ultra cost-effective 671B MoE architecture with top-tier benchmarks.',
    tags: ['MoE', 'Budget', 'General'],
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek-R1 (Radox)',
    provider: 'radox',
    contextWindow: 64000,
    supportsStreaming: true,
    supportsVision: false,
    supportsTools: false,
    inputPricePerMillion: 0.55,
    outputPricePerMillion: 2.19,
    isFreeQuotaEligible: true,
    fallbackModelId: 'internlm2.5-latest',
    fallbackProvider: 'inkstone',
    description: 'Specialized deep thinking and chain-of-thought mathematical reasoning model.',
    tags: ['Thinking', 'Math', 'Reasoning'],
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

  // --- Experiential Labs Models ---
  {
    id: 'experiential-gpt-4o',
    name: 'GPT-4o (Experiential Labs)',
    provider: 'experiential',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 10.0,
    isFreeQuotaEligible: false,
    fallbackModelId: 'gpt-4o',
    fallbackProvider: 'radox',
    description: 'High availability OpenAI gateway provided via Experiential Labs platform.',
    tags: ['High Availability', 'Enterprise', 'General'],
  },
  {
    id: 'experiential-claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet (Experiential Labs)',
    provider: 'experiential',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    isFreeQuotaEligible: false,
    fallbackModelId: 'claude-opus-4.8',
    fallbackProvider: 'radox',
    description: 'Anthropic Claude 3.5 Sonnet gateway for high-precision autonomous code generation.',
    tags: ['Top Coding', 'Vision', 'Enterprise'],
  },
  {
    id: 'experiential-llama-3.3-70b',
    name: 'Llama 3.3 70B (Experiential Labs)',
    provider: 'experiential',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: false,
    supportsTools: true,
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 0.8,
    isFreeQuotaEligible: true,
    fallbackModelId: 'intern-latest',
    fallbackProvider: 'inkstone',
    description: 'Meta open weights flagship instruction model with 128K context.',
    tags: ['Open Source', 'Fast', 'Coding'],
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
  } else if (model.provider === 'inkstone') {
    return { targetModelId: 'experiential-llama-3.3-70b', targetProvider: 'experiential' };
  } else {
    return { targetModelId: 'intern-latest', targetProvider: 'inkstone' };
  }
}
