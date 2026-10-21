import { z } from 'zod';

export const customProviderSchema = z.string().regex(/^custom:[0-9a-f-]{36}$/);
export const providerSelectionSchema = z.union([z.enum(['radox', 'inkstone', 'auto']), customProviderSchema]);
export const endpointModelSchema = z.object({
  id: z.string().trim().min(1).max(180).regex(/^[a-zA-Z0-9_./:@-]+$/),
  supportsVision: z.boolean().default(false),
  minTier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(0),
});
export const apiKeySchema = z.string().trim().min(5).max(4096).regex(/^[^\s\x00-\x1f\x7f]+$/);
export const endpointSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseUrl: z.string().trim().url().max(500).transform((value) => value.replace(/\/+$/, '')),
  apiKey: apiKeySchema.optional(), // Legacy single-key replacement API.
  apiKeys: z.array(apiKeySchema).max(50).optional(), // Append new keys by default.
  keyMode: z.enum(['append', 'replace']).optional(),
  removeKeyIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(50).optional(),
  enabled: z.boolean().default(true),
  models: z.array(endpointModelSchema).min(1).max(50).refine((models) => new Set(models.map((model) => model.id)).size === models.length, 'Duplicate model ID'),
}).strict();
export type EndpointInput = z.infer<typeof endpointSchema>;
export interface EndpointRecord extends Omit<EndpointInput, 'apiKey' | 'apiKeys' | 'keyMode' | 'removeKeyIds'> {
  id: string;
  encrypted_key: string;
  encrypted_keys?: string[] | null;
  updated_at: string;
}
export type SafeEndpoint = Omit<EndpointRecord, 'encrypted_key' | 'encrypted_keys'> & { maskedKey: string; keyCount: number; keys: Array<{ id: string; maskedKey: string }> };

export function submittedKeys(input: Pick<EndpointInput, 'apiKey' | 'apiKeys'>): string[] {
  return [...new Set([...(input.apiKey ? [input.apiKey] : []), ...(input.apiKeys || [])].map((key) => key.trim()))];
}
