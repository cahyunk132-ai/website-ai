import { withEndpointKeys } from '../endpointKeyPool';
import { getEndpoint, endpointKeys } from '../endpointStore';
import { endpointJson } from '../endpointTransport';
import type { ChatOptions, ChatCompletionResult, ProviderId } from '../types';
import { recordRequestUsage, registerCustomProvider } from '../usage';
import { persistProviderUsage, persistProviderFailure } from '../usageTelemetry';

export function customRoute(model: string, provider?: ProviderId): { endpointId: string; model: string; provider: `custom:${string}` } | null {
  const match = /^custom:([0-9a-f-]{36})\/(.+)$/.exec(model);
  if (!match) {
    if (provider?.startsWith('custom:')) throw new Error('Pilih model dari katalog endpoint tersebut.');
    return null;
  }
  const actualProvider = `custom:${match[1]}` as const;
  if (provider && provider !== actualProvider) throw new Error('Model dan endpoint tidak cocok.');
  return { endpointId: match[1], model: match[2], provider: actualProvider };
}

/** Generic OpenAI-compatible JSON completions. No implicit cross-provider fallback
 * for custom endpoints: avoid silently sending private prompts to another vendor.
 */
export async function completeCustomChat(options: ChatOptions): Promise<ChatCompletionResult | null> {
  const route = customRoute(options.model, options.provider);
  if (!route) return null;
  const endpoint = await getEndpoint(route.endpointId);
  if (!endpoint?.enabled) throw new Error('Endpoint tidak ditemukan atau dinonaktifkan.');
  const model = endpoint.models.find((entry) => entry.id === route.model);
  if (!model) throw new Error('Model tidak terdaftar pada endpoint.');
  if (model.minTier > (options.maxTier ?? 0)) throw new Error('Tier akun tidak mencukupi untuk model ini.');
  const hasImages = options.messages.some((message) => Array.isArray(message.content) && message.content.some((part: any) => part.type === 'image_url'));
  if (hasImages && !model.supportsVision) throw new Error('Model endpoint ini tidak mendukung gambar.');
  registerCustomProvider(route.provider, endpoint.name);
  try {
    const data = await withEndpointKeys(endpointKeys(endpoint), (key, signal) => endpointJson(endpoint.baseUrl, '/chat/completions', key, {
      model: route.model, messages: options.messages, stream: false,
      temperature: options.temperature, max_tokens: options.maxTokens,
    }, signal), options.signal);
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('Invalid completion');
    const promptTokens = Math.max(0, Number(data.usage?.prompt_tokens) || 0);
    const completionTokens = Math.max(0, Number(data.usage?.completion_tokens) || 0);
    recordRequestUsage({ provider: route.provider, modelId: options.model, promptTokens, completionTokens, isOfficialReport: Boolean(data.usage) });
    await persistProviderUsage({ provider: route.provider, modelId: options.model, promptTokens, completionTokens });
    return { text, model: options.model, provider: route.provider, usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } };
  } catch {
    await persistProviderFailure({ provider: route.provider, modelId: options.model, errorMessage: 'Custom endpoint request failed' });
    throw new Error('Permintaan endpoint gagal. Admin dapat memeriksa URL, model, kuota dan API key di pengaturan endpoint.');
  }
}
