import { createHash } from 'node:crypto';
import { submittedKeys } from './endpointSchema';
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
export function endpointKeyId(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
export function endpointKeys(row: EndpointRecord): string[] {
  requireEncryption();
  const encrypted = row.encrypted_keys?.length ? row.encrypted_keys : [row.encrypted_key];
  return [...new Set(encrypted.filter(Boolean).map(decryptSecret))];
}
export function publicEndpoint(row: EndpointRecord): SafeEndpoint {
  const keys = endpointKeys(row).map((key) => ({ id: endpointKeyId(key), maskedKey: maskApiKey(key) }));
  // Whitelist fields so neither legacy nor pooled ciphertext/raw inputs escape.
  return { id: row.id, name: row.name, baseUrl: row.baseUrl, models: row.models, enabled: row.enabled,
    updated_at: row.updated_at, maskedKey: keys[0]?.maskedKey || 'Not Configured', keyCount: keys.length, keys };
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
  const supplied = submittedKeys(input);
  if (!supplied.length && !old) throw new Error('API key wajib diisi untuk endpoint baru.');
  const changedUrl = old && old.baseUrl !== input.baseUrl;
  if (changedUrl && !supplied.length) throw new Error('Perubahan URL endpoint membutuhkan API key baru.');
  const replace = changedUrl || input.keyMode === 'replace' || Boolean(input.apiKey);
  const previous = old && !replace ? endpointKeys(old) : [];
  const removed = new Set(input.removeKeyIds || []);
  const keys = [...new Set([...previous.filter((key) => !removed.has(endpointKeyId(key))), ...supplied])];
  if (!keys.length) throw new Error('Endpoint harus memiliki minimal satu API key.');
  if (keys.length > 50) throw new Error('Maksimal 50 API key per endpoint.');
  const oldCiphertexts = new Map(old ? (old.encrypted_keys?.length ? old.encrypted_keys : [old.encrypted_key]).map((ciphertext) => [decryptSecret(ciphertext), ciphertext]) : []);
  const encryptedKeys = keys.map((key) => oldCiphertexts.get(key) || encryptSecret(key));
  const row = {
    name: input.name, baseUrl: input.baseUrl, enabled: input.enabled, models: input.models,
    encrypted_key: encryptedKeys[0],
    encrypted_keys: encryptedKeys,
    updated_at: new Date().toISOString(),
  };
  let query = id ? db.from('ai_endpoints').update(row).eq('id', id) : db.from('ai_endpoints').insert(row);
  if (id && old?.updated_at) query = query.eq('updated_at', old.updated_at);
  const { data, error } = await query.select('*').single();
  if (error?.code === 'PGRST116') throw new Error('Endpoint berubah selama penyimpanan. Muat ulang lalu coba lagi.');
  if (error) throw new Error('Gagal menyimpan endpoint ke database.');
  return publicEndpoint(data as EndpointRecord);
}
export async function deleteEndpoint(id: string): Promise<void> {
  const { error } = await database().from('ai_endpoints').delete().eq('id', id);
  if (error) throw new Error('Gagal menghapus endpoint.');
}
export function endpointKey(row: EndpointRecord): string {
  const key = endpointKeys(row)[0];
  if (!key) throw new Error('Endpoint tidak memiliki API key.');
  return key;
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
