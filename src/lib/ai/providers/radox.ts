/**
 * Hyunk AI Hub - Radox AI Provider Adapter
 * Official Base URL: https://radoxai.com/v1
 * Supports OpenAI-compatible Chat Completions with SSE streaming.
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
    return Boolean(this.getApiKey());
  }

  getApiKey(): string | null {
    return this.customApiKey || process.env.RADOX_API_KEY || null;
  }

  async listModels(): Promise<ModelCapability[]> {
    return getModelsByProvider(this.id);
  }

  async chatCompletion(options: ChatOptions): Promise<ChatCompletionResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw normalizeProviderError(new Error('Radox AI API key is not configured'), this.id, 401);
    }

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
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: options.signal,
      });
    } catch (err) {
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
      const normError = normalizeProviderError(new Error(errorMsg), this.id, res.status, res.headers);
      recordProviderError(this.id, normError.message, normError.code === 'QUOTA_EXCEEDED', normError.code === 'RATE_LIMIT_EXCEEDED');
      throw normError;
    }

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
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw normalizeProviderError(new Error('Radox AI API key is not configured'), this.id, 401);
    }

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
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: options.signal,
      });
    } catch (err) {
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
      const normError = normalizeProviderError(new Error(errorMsg), this.id, res.status, res.headers);
      recordProviderError(this.id, normError.message, normError.code === 'QUOTA_EXCEEDED', normError.code === 'RATE_LIMIT_EXCEEDED');
      throw normError;
    }

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
              // Ignore partial JSON chunks
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
    const apiKey = this.getApiKey();
    if (!apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const radoxAdapter = new RadoxAdapter();
