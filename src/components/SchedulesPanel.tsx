'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  CalendarClock,
  Plus,
  Trash2,
  Loader2,
  Play,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Check,
  Clock,
} from 'lucide-react';
import type { ModelCapability } from '@/lib/ai/types';

interface ScheduleItem {
  id: string;
  name: string;
  prompt: string;
  model: string;
  provider: string;
  cron: string;
  enabled: boolean;
  lastRunAt?: string | null;
  lastResult?: string | null;
  nextRunAt?: string | null;
}

interface SchedulesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  models: ModelCapability[];
  defaultModel: string;
  onChanged?: () => void;
}

const CRON_PRESETS = [
  { label: 'Setiap jam', value: '0 * * * *' },
  { label: 'Setiap hari 09:00', value: '0 9 * * *' },
  { label: 'Senin–Jumat 08:00', value: '0 8 * * 1-5' },
  { label: 'Setiap Senin 07:00', value: '0 7 * * 1' },
  { label: 'Tanggal 1 tiap bulan', value: '0 6 1 * *' },
];

const EMPTY_DRAFT = {
  name: '',
  prompt: '',
  model: '',
  provider: 'auto',
  cron: '0 9 * * *',
};

export const SchedulesPanel: React.FC<SchedulesPanelProps> = ({
  isOpen,
  onClose,
  models,
  defaultModel,
  onChanged,
}) => {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT, model: defaultModel });
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/schedules');
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
      }
    } catch {
      // keep the previous state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSchedules();
      setStatusMsg(null);
      setShowForm(false);
      setDraft({ ...EMPTY_DRAFT, model: defaultModel });
    }
  }, [isOpen, defaultModel]);

  const modelOptions = useMemo(() => models.slice(0, 40), [models]);

  const handleCreate = async () => {
    if (!draft.name.trim() || !draft.prompt.trim()) {
      setStatusMsg({ type: 'error', text: 'Nama dan prompt wajib diisi.' });
      return;
    }

    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (res.ok) {
        setShowForm(false);
        setDraft({ ...EMPTY_DRAFT, model: defaultModel });
        setStatusMsg({ type: 'success', text: 'Jadwal dibuat.' });
        await loadSchedules();
        onChanged?.();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Gagal menyimpan jadwal.' });
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Network error saat menyimpan jadwal.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (schedule: ScheduleItem) => {
    try {
      const res = await fetch('/api/schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: schedule.id, enabled: !schedule.enabled }),
      });
      if (res.ok) await loadSchedules();
    } catch {
      setStatusMsg({ type: 'error', text: 'Gagal mengubah jadwal.' });
    }
  };

  const handleRunNow = async (schedule: ScheduleItem) => {
    setBusyId(schedule.id);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/schedules/${encodeURIComponent(schedule.id)}/run`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.result?.ok) {
        setStatusMsg({ type: 'success', text: `Jadwal "${schedule.name}" selesai dijalankan.` });
        await loadSchedules();
        onChanged?.();
      } else {
        setStatusMsg({
          type: 'error',
          text: data.result?.error || data.error || 'Gagal menjalankan jadwal.',
        });
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Network error saat menjalankan jadwal.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (schedule: ScheduleItem) => {
    setBusyId(schedule.id);
    try {
      const res = await fetch(`/api/schedules?id=${encodeURIComponent(schedule.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSchedules((items) => items.filter((item) => item.id !== schedule.id));
        onChanged?.();
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Gagal menghapus jadwal.' });
    } finally {
      setBusyId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 max-h-[92dvh] flex flex-col pb-safe"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold">Jadwal Otomatis</h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Prompt yang berjalan sendiri sesuai cron dan hasilnya jadi percakapan baru.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0 ml-2"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-[120px]">
          {showForm ? (
            <div className="space-y-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 mb-4">
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Nama jadwal (contoh: Ringkasan berita harian)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
              />
              <textarea
                value={draft.prompt}
                onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
                placeholder="Prompt yang dikirim ke model..."
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500/50 resize-y"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={draft.model}
                  onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                >
                  {modelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <input
                  value={draft.cron}
                  onChange={(event) => setDraft({ ...draft, cron: event.target.value })}
                  placeholder="Cron (menit jam hari bulan hari-minggu)"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500/50 font-mono"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setDraft({ ...draft, cron: preset.value })}
                    className={`px-2 py-1 rounded-lg text-[11px] border transition ${
                      draft.cron === preset.value
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Simpan jadwal
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : schedules.length === 0 && !showForm ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarClock className="w-8 h-8 text-slate-700 mb-2" />
              <p className="text-sm text-slate-400">Belum ada jadwal.</p>
              <p className="text-[11px] text-slate-600 mt-1 max-w-xs">
                Buat jadwal agar AI menjalankan prompt secara otomatis, misalnya ringkasan berita
                setiap pagi.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className={`p-3 rounded-xl border transition ${
                    schedule.enabled
                      ? 'bg-slate-800/40 border-slate-700/60'
                      : 'bg-slate-900/40 border-slate-800/40 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleToggle(schedule)}
                      className="shrink-0 mt-0.5 text-slate-400 hover:text-emerald-300 transition"
                      aria-label={schedule.enabled ? 'Matikan jadwal' : 'Aktifkan jadwal'}
                    >
                      {schedule.enabled ? (
                        <ToggleRight className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-100 truncate">
                          {schedule.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                          {schedule.cron}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">{schedule.prompt}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {schedule.nextRunAt
                            ? `Berikutnya ${new Date(schedule.nextRunAt).toLocaleString('id-ID')}`
                            : 'Cron tidak valid'}
                        </span>
                        {schedule.lastRunAt && (
                          <span>Terakhir {new Date(schedule.lastRunAt).toLocaleString('id-ID')}</span>
                        )}
                        <span className="text-slate-600">{schedule.model}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleRunNow(schedule)}
                        disabled={busyId === schedule.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition disabled:opacity-50"
                        aria-label="Jalankan sekarang"
                      >
                        {busyId === schedule.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(schedule)}
                        disabled={busyId === schedule.id}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                        aria-label="Hapus jadwal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {schedule.lastResult && (
                    <p className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-700/40 line-clamp-2">
                      Hasil terakhir: {schedule.lastResult}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center gap-2 shrink-0">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Jadwal baru
            </button>
          )}
          {statusMsg && (
            <span
              className={`text-[11px] flex items-center gap-1 min-w-0 ${
                statusMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {statusMsg.type === 'error' && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate">{statusMsg.text}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
