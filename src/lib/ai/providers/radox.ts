/**
 * Hyunk AI Hub - Radox AI Provider Adapter with Multi-Key Pool & Rotation
 * Official Base URL: https://radoxai.com/v1
 * Supports dynamic model fetching, OpenAI-compatible chat completions,
 * multi-key pool rotation, and automatic intra-provider key failover.
 */

import {
  ProviderAdapter,
  ProviderId,
  ModelCapability,
  ChatOptions,
  ChatCompletionResult,
  ChatStreamChunk,
} from '../types';
import { getModelsByProvider } from '../models';
import { normalizeProviderError } from '../errors';
import { recordRequestUsage, recordProviderError, setProviderConfigured } from '../usage';
import { keyPoolManager, KeyPoolItem } from '../keyPool';

export class RadoxAdapter implements ProviderAdapter {
  readonly id: ProviderId = 'radox';
  readonly name = 'Radox AI';
  readonly baseUrl = 'https://radoxai.com/v1';

  private customApiKey?: string;

  constructor(apiKey?: string) {
    this.customApiKey = apiKey;
    setProviderConfigured(this.id, this.isConfigured());
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey() || process.env.RADOX_API_KEYS);
  }

  getApiKey(): string | null {
    if (this.customApiKey) return this.customApiKey;
    if (process.env.RADOX_API_KEY) return process.env.RADOX_API_KEY.split(/[\n,;]+/)[0].trim();
    if (process.env.RADOX_API_KEYS) return process.env.RADOX_API_KEYS.split(/[\n,;]+/)[0].trim();
    return null;
  }

  async listModels(): Promise<ModelCapability[]> {
    const staticModels = getModelsByProvider(this.id);
    const keyItem = await keyPoolManager.getKeyForRequest(this.id, this.customApiKey);
    if (!keyItem) return staticModels;

    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${keyItem.key}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.data)) {
          const merged = [...staticModels];
          for (const item of data.data) {
            const mId = item.id;
            if (!merged.some((m) => m.id === mId)) {
              merged.push({
                id: mId,
                name: `${mId} (Radox Free)`,
                provider: this.id,
                contextWindow: 128000,
                supportsStreaming: true,
                supportsVision: true,
                supportsTools: true,
                inputPricePerMillion: 0.0,
                outputPricePerMillion: 0.0,
                isFreeQuotaEligible: true,
                fallbackModelId: 'intern-latest',
                fallbackProvider: 'inkstone',
                description: `Radox AI model ${mId} with free tier support.`,
                tags: ['Free Tier', 'Radox'],
              });
            }
          }
          return merged;
        }
      }
    } catch {
      // Fallback to static
    }
    return staticModels;
  }

  async chatCompletion(options: ChatOptions): Promise<ChatCompletionResult> {
    const keyItem = await keyPoolManager.getKeyForRequest(this.id, this.customApiKey);
    if (!keyItem) {
      throw normalizeProviderError(new Error('Radox AI API key is not configured'), this.id, 401);
    }
    return this.executeChatCompletion(options, keyItem);
  }

  private async executeChatCompletion(options: ChatOptions, keyItem: KeyPoolItem): Promise<ChatCompletionResult> {
    const payload = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: false,
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keyItem.key}`,
        },
        body: JSON.stringify(payload),
        signal: options.signal,
      });
    } catch (err) {
      keyPoolManager.reportKeyError(this.id, keyItem.id, { message: String(err) });
      recordProviderError(this.id, String(err));
      throw normalizeProviderError(err, this.id);
    }

    if (!res.ok) {
      const errText = await res.text();
      let errorMsg = `Radox API error: HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText);
        errorMsg = parsed.error?.message || parsed.message || errorMsg;
      } catch {
        errorMsg = errText || errorMsg;
      }

      const isRateLimit = res.status === 429;
      const isQuota =
        res.status === 402 ||
        res.status === 403 ||
        errorMsg.toLowerCase().includes('quota') ||
        errorMsg.toLowerCase().includes('balance');

      keyPoolManager.reportKeyError(this.id, keyItem.id, { isRateLimit, isQuota, message: errorMsg });

      // Automatic intra-provider rotation: retry immediately with another key from Radox's pool
      if (isRateLimit || isQuota) {
        const altKey = await keyPoolManager.getAlternativeKey(this.id, keyItem.id);
        if (altKey) {
          console.warn(`[Radox Pool] Key ${keyItem.maskedKey} hit ${isRateLimit ? 'rate limit' : 'quota'}. Retrying with alternate key ${altKey.maskedKey}...`);
          return this.executeChatCompletion(options, altKey);
        }
      }

      const normError = normalizeProviderError(new Error(errorMsg), this.id, res.status, res.headers);
      recordProviderError(this.id, normError.message, normError.code === 'QUOTA_EXCEEDED', normError.code === 'RATE_LIMIT_EXCEEDED');
      throw normError;
    }

    keyPoolManager.reportKeySuccess(this.id, keyItem.id);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;

    recordRequestUsage({
      provider: this.id,
      modelId: options.model,
      promptTokens,
      completionTokens,
      isOfficialReport: Boolean(data.usage),
    });

    return {
      text: content,
      model: options.model,
      provider: this.id,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async chatStream(
    options: ChatOptions,
    onChunk: (chunk: ChatStreamChunk) => void
  ): Promise<ChatCompletionResult> {
    const keyItem = await keyPoolManager.getKeyForRequest(this.id, this.customApiKey);
    if (!keyItem) {
      throw normalizeProviderError(new Error('Radox AI API key is not configured'), this.id, 401);
    }
    return this.executeChatStream(options, onChunk, keyItem);
  }

  private async executeChatStream(
    options: ChatOptions,
    onChunk: (chunk: ChatStreamChunk) => void,
    keyItem: KeyPoolItem
  ): Promise<ChatCompletionResult> {
    const payload = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keyItem.key}`,
        },
        body: JSON.stringify(payload),
        signal: options.signal,
      });
    } catch (err) {
      keyPoolManager.reportKeyError(this.id, keyItem.id, { message: String(err) });
      recordProviderError(this.id, String(err));
      throw normalizeProviderError(err, this.id);
    }

    if (!res.ok) {
      const errText = await res.text();
      let errorMsg = `Radox API error: HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText);
        errorMsg = parsed.error?.message || parsed.message || errorMsg;
      } catch {
        errorMsg = errText || errorMsg;
      }

      const isRateLimit = res.status === 429;
      const isQuota =
        res.status === 402 ||
        res.status === 403 ||
        errorMsg.toLowerCase().includes('quota') ||
        errorMsg.toLowerCase().includes('balance');

      keyPoolManager.reportKeyError(this.id, keyItem.id, { isRateLimit, isQuota, message: errorMsg });

      // Automatic intra-provider rotation: retry immediately with another key from Radox's pool
      if (isRateLimit || isQuota) {
        const altKey = await keyPoolManager.getAlternativeKey(this.id, keyItem.id);
        if (altKey) {
          console.warn(`[Radox Pool] Key ${keyItem.maskedKey} hit ${isRateLimit ? 'rate limit' : 'quota'}. Retrying stream with alternate key ${altKey.maskedKey}...`);
          return this.executeChatStream(options, onChunk, altKey);
        }
      }

      const normError = normalizeProviderError(new Error(errorMsg), this.id, res.status, res.headers);
      recordProviderError(this.id, normError.message, normError.code === 'QUOTA_EXCEEDED', normError.code === 'RATE_LIMIT_EXCEEDED');
      throw normError;
    }

    keyPoolManager.reportKeySuccess(this.id, keyItem.id);

    if (!res.body) {
      throw normalizeProviderError(new Error('Radox stream response body is null'), this.id);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulatedText = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') {
              onChunk({ text: '', done: true, model: options.model, provider: this.id });
              continue;
            }

            try {
              const chunkJson = JSON.parse(dataStr);
              const delta = chunkJson.choices?.[0]?.delta?.content || '';
              if (chunkJson.usage) {
                promptTokens = chunkJson.usage.prompt_tokens ?? promptTokens;
                completionTokens = chunkJson.usage.completion_tokens ?? completionTokens;
              }

              if (delta) {
                accumulatedText += delta;
                onChunk({
                  text: delta,
                  done: false,
                  model: options.model,
                  provider: this.id,
                });
              }
            } catch {
              // Ignore incomplete JSON chunks
            }
          }
        }
      }
    } catch (err) {
      recordProviderError(this.id, String(err));
      throw normalizeProviderError(err, this.id);
    }

    recordRequestUsage({
      provider: this.id,
      modelId: options.model,
      promptTokens: promptTokens || Math.ceil(options.messages.reduce((acc, m) => acc + m.content.length, 0) / 4),
      completionTokens: completionTokens || Math.ceil(accumulatedText.length / 4),
      isOfficialReport: promptTokens > 0,
    });

    return {
      text: accumulatedText,
      model: options.model,
      provider: this.id,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async checkHealth(): Promise<boolean> {
    const keyItem = await keyPoolManager.getKeyForRequest(this.id, this.customApiKey);
    if (!keyItem) return false;
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${keyItem.key}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const radoxAdapter = new RadoxAdapter();
