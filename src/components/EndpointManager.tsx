'use client';

import React, { useEffect, useState } from 'react';
import type { EndpointInput, SafeEndpoint } from '@/lib/ai/endpointSchema';

const emptyForm = (): EndpointInput => ({ name: '', baseUrl: '', apiKeys: [''], enabled: true, models: [{ id: '', minTier: 0, supportsVision: false }] });
const fieldClass = 'w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100';

export function EndpointManager({ onSaved }: { onSaved?: () => void }) {
  const [endpoints, setEndpoints] = useState<SafeEndpoint[]>([]);
  const [form, setForm] = useState<EndpointInput>(emptyForm);
  const [editingId, setEditingId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const response = await fetch('/api/admin/endpoints', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal membaca endpoint.');
      setEndpoints(data.endpoints);
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal membaca endpoint.'); }
  }
  useEffect(() => { void load(); }, []);

  async function request(method: string, body: unknown) {
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/endpoints', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
      return data;
    } catch (err) { setError(err instanceof Error ? err.message : 'Permintaan gagal.'); return null; }
    finally { setBusy(false); }
  }
  function reset() { setForm(emptyForm()); setEditingId(undefined); }
  function edit(endpoint: SafeEndpoint) {
    setEditingId(endpoint.id);
    setForm({ name: endpoint.name, baseUrl: endpoint.baseUrl, enabled: endpoint.enabled, apiKeys: [''], keyMode: 'append', removeKeyIds: [], models: endpoint.models.map((model) => ({ ...model })) });
    setMessage(''); setError('');
  }
  return (
    <section className="space-y-4" aria-label="Endpoint API admin">
      <div>
        <h3 className="font-semibold text-cyan-300">Endpoint OpenAI-compatible</h3>
        <p className="text-xs text-slate-400 mt-1">Tambahkan koneksi baru tanpa mengedit .env. Isi base URL hingga /v1 (jangan /chat/completions), API key, dan ID model dari provider. Kunci tidak pernah ditampilkan ulang.</p>
      </div>
      <button type="button" disabled={busy} onClick={() => void load()} className="text-xs underline text-cyan-300">Muat ulang endpoint</button>
      <div className="space-y-2">
        {endpoints.map((endpoint) => (
          <div key={endpoint.id} className="rounded-xl border border-slate-700 p-3 text-xs space-y-2">
            <div className="flex justify-between gap-2"><strong>{endpoint.name}</strong><span>{endpoint.enabled ? 'Aktif' : 'Nonaktif'}</span></div>
            <p className="break-all text-slate-400">{endpoint.baseUrl}</p>
            <p>{endpoint.keyCount} API key · {endpoint.models.length} model</p>
            <p className="text-slate-400 break-all">{endpoint.keys.map((key) => key.maskedKey).join(' · ')}</p>
            <div className="flex gap-3">
              <button type="button" disabled={busy} onClick={() => edit(endpoint)} className="text-cyan-300 underline">Edit / ganti API key</button>
              <button type="button" disabled={busy} onClick={async () => {
                const { id, name, baseUrl, models, enabled } = endpoint;
                if (await request('PATCH', { id, name, baseUrl, models, enabled: !enabled })) { await load(); onSaved?.(); }
              }} className="text-amber-300 underline">{endpoint.enabled ? 'Nonaktifkan' : 'Aktifkan'}</button>
              <button type="button" disabled={busy} onClick={async () => {
                if (!window.confirm(`Hapus endpoint ${endpoint.name}? Percakapan lama tidak dapat memakai endpoint ini lagi.`)) return;
                if (await request('DELETE', { id: endpoint.id })) { if (editingId === endpoint.id) reset(); await load(); onSaved?.(); }
              }} className="text-rose-300 underline">Hapus</button>
            </div>
          </div>
        ))}
      </div>
      <form className="space-y-3 border-t border-slate-700 pt-4" onSubmit={async (event) => {
        event.preventDefault();
        const input = { ...form, apiKeys: form.apiKeys?.map((key) => key.trim()).filter(Boolean) };
        if (await request(editingId ? 'PATCH' : 'POST', editingId ? { id: editingId, ...input } : input)) {
          reset(); setMessage('Endpoint tersimpan. Model aktif tersedia di pemilih model. Penyimpanan bukan jaminan koneksi berhasil; gunakan Tes koneksi.'); await load(); onSaved?.();
        }
      }}>
        <h4 className="font-semibold text-sm">{editingId ? 'Edit endpoint' : 'Tambah endpoint baru'}</h4>
        <label className="block text-xs">Nama endpoint
          <input required maxLength={80} className={fieldClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Provider baru" />
        </label>
        <label className="block text-xs">Base URL HTTPS
          <input required type="url" className={fieldClass} value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.provider.com/v1" />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold">API keys — beberapa key untuk satu endpoint (maksimal 50)</legend>
          {editingId && <>
            <p className="text-xs text-slate-400">Key baru ditambahkan ke pool. Kosongkan untuk mempertahankan key tersimpan. Jika URL berubah, seluruh pool lama diganti dengan key baru.</p>
            <label className="block text-xs">Mode penyimpanan key
              <select className={fieldClass} value={form.keyMode || 'append'} onChange={(event) => setForm({ ...form, keyMode: event.target.value as 'append' | 'replace' })}>
                <option value="append">Tambahkan ke key yang sudah ada</option>
                <option value="replace">Ganti seluruh pool dengan key baru</option>
              </select>
            </label>
            <div className="space-y-1 text-xs">
              {endpoints.find((endpoint) => endpoint.id === editingId)?.keys.map((key) => (
                <label key={key.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={form.removeKeyIds?.includes(key.id) || false} onChange={(event) => setForm({ ...form, removeKeyIds: event.target.checked ? [...(form.removeKeyIds || []), key.id] : form.removeKeyIds?.filter((id) => id !== key.id) })} />
                  Hapus key {key.maskedKey} ({key.id.slice(0, 8)}) saat disimpan
                </label>
              ))}
            </div>
          </>}
          {(form.apiKeys || ['']).map((key, index) => (
            <div key={index} className="flex items-center gap-2">
              <input type="password" aria-label={`API key ${index + 1}`} autoComplete="new-password" required={index === 0 && (!editingId || form.keyMode === 'replace')} maxLength={4096} className={fieldClass} value={key} onChange={(event) => setForm({ ...form, apiKeys: (form.apiKeys || ['']).map((value, i) => i === index ? event.target.value : value) })} placeholder={`API key ${index + 1}`} />
              {(form.apiKeys?.length || 0) > 1 && <button type="button" className="text-xs text-rose-300" onClick={() => setForm({ ...form, apiKeys: form.apiKeys?.filter((_, i) => i !== index) })}>Hapus</button>}
            </div>
          ))}
          <button type="button" disabled={(form.apiKeys?.length || 0) >= 50} className="text-xs text-cyan-300 underline" onClick={() => setForm({ ...form, apiKeys: [...(form.apiKeys || ['']), ''] })}>+ Tambah API key</button>
          <p className="text-xs text-slate-500">Key duplikat disatukan. Chat memilih key awal secara acak; jika ditolak (401/402/403) atau rate limit (429), mencoba key lain pada endpoint yang sama.</p>
        </fieldset>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />Aktifkan endpoint</label>
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold mb-2">Model dan izin akses</legend>
          {form.models.map((model, index) => (
            <div key={index} className="rounded-lg border border-slate-800 p-2 space-y-2">
              <label className="block text-xs">ID model
                <input required aria-label={`ID model ${index + 1}`} className={fieldClass} value={model.id} placeholder="model-id-dari-provider" onChange={(event) => setForm({ ...form, models: form.models.map((entry, i) => i === index ? { ...entry, id: event.target.value } : entry) })} />
              </label>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label>Tier minimum <select className="bg-slate-950 border border-slate-700 rounded p-1" value={model.minTier} onChange={(event) => setForm({ ...form, models: form.models.map((entry, i) => i === index ? { ...entry, minTier: Number(event.target.value) as 0 | 1 | 2 | 3 | 4 } : entry) })}>{[0, 1, 2, 3, 4].map((tier) => <option key={tier} value={tier}>{tier === 0 ? 'Free (0)' : `Premium ${tier}`}</option>)}</select></label>
                <label className="flex gap-1 items-center"><input type="checkbox" checked={model.supportsVision} onChange={(event) => setForm({ ...form, models: form.models.map((entry, i) => i === index ? { ...entry, supportsVision: event.target.checked } : entry) })} />Vision</label>
                {form.models.length > 1 && <button type="button" onClick={() => setForm({ ...form, models: form.models.filter((_, i) => i !== index) })} className="text-rose-300">Hapus model</button>}
              </div>
            </div>
          ))}
          <button type="button" disabled={form.models.length >= 50} className="text-xs text-cyan-300 underline" onClick={() => setForm({ ...form, models: [...form.models, { id: '', minTier: 0, supportsVision: false }] })}>+ Tambah model</button>
        </fieldset>
        <p className="text-xs text-slate-500">Tier Free berarti dapat diakses akun free, bukan berarti biaya provider gratis. Endpoint custom tidak dialihkan otomatis ke vendor lain.</p>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm disabled:opacity-50">{busy ? 'Memproses…' : 'Simpan endpoint'}</button>
          <button type="button" disabled={busy || !form.apiKeys?.some((key) => key.trim())} className="rounded-lg bg-slate-800 px-4 py-2 text-sm disabled:opacity-50" onClick={async () => {
            const data = await request('POST', { action: 'test', endpoint: { ...form, apiKeys: form.apiKeys?.map((key) => key.trim()).filter(Boolean) } });
            if (data) setMessage(`GET /models berhasil menggunakan salah satu key baru (bukan verifikasi seluruh pool). ID tersedia: ${data.modelIds.join(', ') || '(kosong)'}. Tes ini belum menguji chat.`);
          }}>Tes koneksi /models</button>
          {editingId && <button type="button" onClick={reset} className="text-xs underline">Batal edit</button>}
        </div>
      </form>
      <div role="status" aria-live="polite">{message && <p className="text-xs text-emerald-300 break-words">{message}</p>}{error && <p className="text-xs text-rose-300 break-words">{error}</p>}</div>
    </section>
  );
}
