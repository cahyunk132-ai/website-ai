/**
 * Hyunk AI Hub - Intern InkStone Provider Adapter with Multi-Key Pool & Rotation
 * Official Base URL: https://discovery-api.intern-ai.org.cn/v1
 * Supports OpenAI-compatible Chat Completions, native deep thinking (reasoning_content),
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
import { persistProviderUsage, persistProviderFailure } from '../usageTelemetry';
import { keyPoolManager, KeyPoolItem } from '../keyPool';

export class InkstoneAdapter implements ProviderAdapter {
  readonly id: ProviderId = 'inkstone';
  readonly name = 'Intern InkStone';
  readonly baseUrl = 'https://discovery-api.intern-ai.org.cn/v1';

  private customApiKey?: string;

  constructor(apiKey?: string) {
    this.customApiKey = apiKey;
    setProviderConfigured(this.id, this.isConfigured());
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey() || process.env.INKSTONE_API_KEYS);
  }

  getApiKey(): string | null {
    if (this.customApiKey) return this.customApiKey;
    if (process.env.INKSTONE_API_KEY) return process.env.INKSTONE_API_KEY.split(/[\n,;]+/)[0].trim();
    if (process.env.INKSTONE_API_KEYS) return process.env.INKSTONE_API_KEYS.split(/[\n,;]+/)[0].trim();
    return null;
  }

  async listModels(): Promise<ModelCapability[]> {
    return getModelsByProvider(this.id);
  }

  async chatCompletion(options: ChatOptions): Promise<ChatCompletionResult> {
    const keyItem = await keyPoolManager.getKeyForRequest(this.id, this.customApiKey);
    if (!keyItem) {
      throw normalizeProviderError(new Error('Intern InkStone API key is not configured'), this.id, 401);
    }
    return this.executeChatCompletion(options, keyItem);
  }

  private async executeChatCompletion(options: ChatOptions, keyItem: KeyPoolItem): Promise<ChatCompletionResult> {
    if (options.model === 'intern-decision-4b') {
      throw normalizeProviderError(
        new Error("Model 'Intern-Decision-4B' menggunakan Protokol SistemSatu (decision-only) untuk evaluasi terstruktur, bukan model percakapan teks bebas. Silakan gunakan model seperti Intern-S2, DeepSeek-V4, atau Agents-A1."),
        this.id,
        400
      );
    }

    const payload = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.8,
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
      persistProviderFailure({ provider: this.id, modelId: options.model, errorMessage: String(err) });
      throw normalizeProviderError(err, this.id);
    }

    if (!res.ok) {
      const errText = await res.text();
      let errorMsg = `Intern InkStone API error: HTTP ${res.status}`;
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

      // Automatic intra-provider rotation: retry immediately with another key from InkStone's pool
      if (isRateLimit || isQuota) {
        const altKey = await keyPoolManager.getAlternativeKey(this.id, keyItem.id);
        if (altKey) {
          console.warn(`[InkStone Pool] Key ${keyItem.maskedKey} hit ${isRateLimit ? 'rate limit' : 'quota'}. Retrying with alternate InkStone key ${altKey.maskedKey}...`);
          return this.executeChatCompletion(options, altKey);
        }
      }

      const normError = normalizeProviderError(new Error(errorMsg), this.id, res.status, res.headers);
      recordProviderError(this.id, normError.message, normError.code === 'QUOTA_EXCEEDED', normError.code === 'RATE_LIMIT_EXCEEDED');
      persistProviderFailure({ provider: this.id, modelId: options.model, errorMessage: normError.message });
      throw normError;
    }

    keyPoolManager.reportKeySuccess(this.id, keyItem.id);
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    let content = '';
    if (msg?.reasoning_content) {
      content += `<thought>\n${msg.reasoning_content}\n</thought>\n\n`;
    }
    content += (msg?.content || '');

    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;

    recordRequestUsage({
      provider: this.id,
      modelId: options.model,
      promptTokens,
      completionTokens,
      isOfficialReport: Boolean(data.usage),
    });

    persistProviderUsage({ provider: this.id, modelId: options.model, promptTokens, completionTokens });

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
      throw normalizeProviderError(new Error('Intern InkStone API key is not configured'), this.id, 401);
    }
    return this.executeChatStream(options, onChunk, keyItem);
  }

  private async executeChatStream(
    options: ChatOptions,
    onChunk: (chunk: ChatStreamChunk) => void,
    keyItem: KeyPoolItem
  ): Promise<ChatCompletionResult> {
    if (options.model === 'intern-decision-4b') {
      throw normalizeProviderError(
        new Error("Model 'Intern-Decision-4B' menggunakan Protokol SistemSatu (decision-only) untuk evaluasi terstruktur, bukan model percakapan teks bebas. Silakan gunakan model seperti Intern-S2, DeepSeek-V4, atau Agents-A1."),
        this.id,
        400
      );
    }

    const payload = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.8,
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
      persistProviderFailure({ provider: this.id, modelId: options.model, errorMessage: String(err) });
      throw normalizeProviderError(err, this.id);
    }

    if (!res.ok) {
      const errText = await res.text();
      let errorMsg = `Intern InkStone API error: HTTP ${res.status}`;
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

      // Automatic intra-provider rotation: retry immediately with another key from InkStone's pool
      if (isRateLimit || isQuota) {
        const altKey = await keyPoolManager.getAlternativeKey(this.id, keyItem.id);
        if (altKey) {
          console.warn(`[InkStone Pool] Key ${keyItem.maskedKey} hit ${isRateLimit ? 'rate limit' : 'quota'}. Retrying stream with alternate InkStone key ${altKey.maskedKey}...`);
          return this.executeChatStream(options, onChunk, altKey);
        }
      }

      const normError = normalizeProviderError(new Error(errorMsg), this.id, res.status, res.headers);
      recordProviderError(this.id, normError.message, normError.code === 'QUOTA_EXCEEDED', normError.code === 'RATE_LIMIT_EXCEEDED');
      persistProviderFailure({ provider: this.id, modelId: options.model, errorMessage: normError.message });
      throw normError;
    }

    keyPoolManager.reportKeySuccess(this.id, keyItem.id);

    if (!res.body) {
      throw normalizeProviderError(new Error('Intern InkStone stream response body is null'), this.id);
    }

    let reader: ReadableStreamDefaultReader<Uint8Array>;
    let decoder = new TextDecoder('utf-8');
    let accumulatedText = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let buffer = '';
    let inReasoningPhase = false;
    let reasoningClosed = false;

    try {
      reader = res.body.getReader();
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
              if (inReasoningPhase && !reasoningClosed) {
                reasoningClosed = true;
                accumulatedText += '\n</thought>\n\n';
                onChunk({ text: '\n</thought>\n\n', done: false, model: options.model, provider: this.id });
              }
              onChunk({ text: '', done: true, model: options.model, provider: this.id });
              continue;
            }

            try {
              const chunkJson = JSON.parse(dataStr);
              const deltaContent = chunkJson.choices?.[0]?.delta?.content || '';
              const deltaReasoning = chunkJson.choices?.[0]?.delta?.reasoning_content || '';
              
              let delta = '';
              if (deltaReasoning) {
                if (!inReasoningPhase) {
                  inReasoningPhase = true;
                  delta += '<thought>\n';
                }
                delta += deltaReasoning;
              } else if (deltaContent) {
                if (inReasoningPhase && !reasoningClosed) {
                  reasoningClosed = true;
                  delta += '\n</thought>\n\n';
                }
                delta += deltaContent;
              }

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
      persistProviderFailure({ provider: this.id, modelId: options.model, errorMessage: String(err) });
      throw normalizeProviderError(err, this.id);
    }

    recordRequestUsage({
      provider: this.id,
      modelId: options.model,
      promptTokens: promptTokens || Math.ceil(options.messages.reduce((acc, m) => acc + m.content.length, 0) / 4),
      completionTokens: completionTokens || Math.ceil(accumulatedText.length / 4),
      isOfficialReport: promptTokens > 0,
    });

    persistProviderUsage({ provider: this.id, modelId: options.model, promptTokens, completionTokens });

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

export const inkstoneAdapter = new InkstoneAdapter();
