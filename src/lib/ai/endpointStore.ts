import { createClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret, maskApiKey } from '../crypto';
import type { EndpointInput, EndpointRecord, SafeEndpoint } from './endpointSchema';
import type { ModelCapability } from './types';

function database() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Konfigurasi Supabase service-role diperlukan untuk endpoint tersimpan.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function requireEncryption() {
  if (!process.env.APP_ENCRYPTION_KEY) throw new Error('APP_ENCRYPTION_KEY harus dikonfigurasi untuk menyimpan API key dengan aman.');
}
export function publicEndpoint(row: EndpointRecord): SafeEndpoint {
  const { encrypted_key, ...safe } = row;
  requireEncryption();
  return { ...safe, maskedKey: maskApiKey(decryptSecret(encrypted_key)) };
}
export async function listEndpoints(): Promise<EndpointRecord[]> {
  const { data, error } = await database().from('ai_endpoints').select('*').order('created_at', { ascending: true });
  if (error) throw new Error('Gagal membaca endpoint. Pastikan migrasi ai_endpoints sudah diterapkan.');
  return data as EndpointRecord[];
}
export async function getEndpoint(id: string): Promise<EndpointRecord | null> {
  const { data, error } = await database().from('ai_endpoints').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('Gagal membaca endpoint.');
  return data as EndpointRecord | null;
}
export async function saveEndpoint(input: EndpointInput, id?: string): Promise<SafeEndpoint> {
  requireEncryption();
  const db = database();
  const old = id ? await getEndpoint(id) : null;
  if (id && !old) throw new Error('Endpoint tidak ditemukan.');
  if (!input.apiKey && !old) throw new Error('API key wajib diisi untuk endpoint baru.');
  // Never send the old key to a new destination without explicit replacement.
  if (old && old.baseUrl !== input.baseUrl && !input.apiKey) throw new Error('Perubahan URL endpoint membutuhkan API key baru.');
  const row = {
    name: input.name, baseUrl: input.baseUrl, enabled: input.enabled, models: input.models,
    encrypted_key: input.apiKey ? encryptSecret(input.apiKey) : old!.encrypted_key,
    updated_at: new Date().toISOString(),
  };
  const query = id ? db.from('ai_endpoints').update(row).eq('id', id) : db.from('ai_endpoints').insert(row);
  const { data, error } = await query.select('*').single();
  if (error) throw new Error('Gagal menyimpan endpoint ke database.');
  return publicEndpoint(data as EndpointRecord);
}
export async function deleteEndpoint(id: string): Promise<void> {
  const { error } = await database().from('ai_endpoints').delete().eq('id', id);
  if (error) throw new Error('Gagal menghapus endpoint.');
}
export function endpointKey(row: EndpointRecord): string {
  requireEncryption();
  return decryptSecret(row.encrypted_key);
}
export function endpointModels(rows: EndpointRecord[]): ModelCapability[] {
  return rows.filter((row) => row.enabled).flatMap((row) => row.models.map((model) => ({
    id: `custom:${row.id}/${model.id}`, name: `${model.id} · ${row.name}`, provider: `custom:${row.id}` as const,
    contextWindow: 32000, supportsStreaming: false, supportsTools: false, supportsVision: model.supportsVision,
    minTier: model.minTier, inputPricePerMillion: 0, outputPricePerMillion: 0,
    isFreeQuotaEligible: model.minTier === 0,
    description: `Endpoint admin: ${row.name}. Biaya dan context window mengikuti provider; bukan jaminan layanan gratis.`,
    tags: ['Custom endpoint'],
  })));
}
/** Existing deployments without the new table/config keep their built-in catalog. */
export async function customModelCatalog(): Promise<ModelCapability[]> {
  try { return endpointModels(await listEndpoints()); } catch { return []; }
}
