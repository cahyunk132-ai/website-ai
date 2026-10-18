/**
 * Hyunk AI Hub - Core AI Types & Definitions
 */

export type ProviderId = 'radox' | 'inkstone';

export interface FileAttachment {
  id: string;
  name: string;
  type: 'image' | 'document';
  mimeType: string;
  size: number;
  url?: string; // base64 data URL or remote URL
  extractedText?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: FileAttachment[];
  createdAt?: string;
  model?: string;
  provider?: ProviderId;
  isFallback?: boolean;
  fallbackReason?: string;
}

export interface ModelCapability {
  id: string;
  name: string;
  provider: ProviderId;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  isFreeQuotaEligible: boolean;
  fallbackModelId?: string;
  fallbackProvider?: ProviderId;
  description?: string;
  tags?: string[];
}

export interface ChatOptions {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachments?: FileAttachment[];
  }>;
  model: string;
  provider?: ProviderId;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  systemPrompt?: string;
  webSearch?: boolean;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface ChatStreamChunk {
  text: string;
  done: boolean;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  model?: string;
  provider?: ProviderId;
  isFallback?: boolean;
  fallbackNotice?: string;
}

export interface ChatCompletionResult {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  model: string;
  provider: ProviderId;
  isFallback?: boolean;
  fallbackNotice?: string;
}

export interface ProviderHealth {
  provider: ProviderId;
  name: string;
  baseUrl: string;
  isConfigured: boolean;
  isHealthy: boolean;
  lastChecked?: string;
  lastSuccessfulRequest?: string;
  lastError?: string;
  totalRequests: number;
  failedRequests: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  estimatedCostUsd: number;
  quotaStatus: 'active' | 'exhausted' | 'rate_limited' | 'unknown';
  quotaSource: 'provider_reported' | 'estimated' | 'unavailable';
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly name: string;
  readonly baseUrl: string;

  isConfigured(): boolean;
  getApiKey(): string | null;
  listModels(): Promise<ModelCapability[]>;
  chatCompletion(options: ChatOptions): Promise<ChatCompletionResult>;
  chatStream(
    options: ChatOptions,
    onChunk: (chunk: ChatStreamChunk) => void
  ): Promise<ChatCompletionResult>;
  checkHealth(): Promise<boolean>;
}
