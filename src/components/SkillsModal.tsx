'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  BookOpen,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  Plus,
  Pin,
  PinOff,
  Search,
  Sparkles,
  Pencil,
  User,
  Cpu,
} from 'lucide-react';

export interface SkillItem {
  id: string;
  userId: string | null;
  slug: string;
  name: string;
  description: string;
  content: string;
  category: string;
  icon: string;
  tags: string[];
  kind: 'system' | 'preset' | 'user';
  isActive: boolean;
  isPinned: boolean;
  sortOrder: number;
}

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Slugs currently pinned as preset personas. */
  pinnedSlugs: string[];
  onTogglePin: (slug: string, pinned: boolean) => void;
  onChanged?: () => void;
}

const EMPTY_DRAFT = {
  name: '',
  description: '',
  content: '',
  category: 'general',
};

export const SkillsModal: React.FC<SkillsModalProps> = ({
  isOpen,
  onClose,
  pinnedSlugs,
  onTogglePin,
  onChanged,
}) => {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [showForm, setShowForm] = useState(false);

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/skills');
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
      }
    } catch {
      // keep the previous state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSkills();
      setSearch('');
      setStatusMsg(null);
      setShowForm(false);
      setEditingId(null);
      setDraft({ ...EMPTY_DRAFT });
    }
  }, [isOpen]);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(skills.map((skill) => skill.category)));
    return ['all', ...unique];
  }, [skills]);

  const visibleSkills = useMemo(() => {
    const term = search.trim().toLowerCase();
    return skills.filter((skill) => {
      if (activeCategory !== 'all' && skill.category !== activeCategory) return false;
      if (!term) return true;
      return (
        skill.name.toLowerCase().includes(term) ||
        skill.description.toLowerCase().includes(term) ||
        skill.slug.includes(term) ||
        skill.tags?.some((tag) => tag.toLowerCase().includes(term))
      );
    });
  }, [skills, search, activeCategory]);

  const handleTogglePin = async (skill: SkillItem) => {
    const next = !pinnedSlugs.includes(skill.slug);
    onTogglePin(skill.slug, next);
    await fetchSkills();
    onChanged?.();
  };

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.content.trim()) {
      setStatusMsg({ type: 'error', text: 'Nama dan isi skill wajib diisi.' });
      return;
    }

    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch(
        editingId ? `/api/skills/${editingId}` : '/api/skills',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        }
      );
      const data = await res.json();

      if (res.ok) {
        setStatusMsg({
          type: 'success',
          text: editingId ? 'Skill berhasil diperbarui.' : 'Skill berhasil dibuat.',
        });
        setShowForm(false);
        setEditingId(null);
        setDraft({ ...EMPTY_DRAFT });
        await fetchSkills();
        onChanged?.();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Gagal menyimpan skill.' });
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Network error saat menyimpan skill.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skill: SkillItem) => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/skills/${skill.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg({ type: 'success', text: `Skill "${skill.name}" dihapus.` });
        await fetchSkills();
        onChanged?.();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Gagal menghapus skill.' });
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Network error saat menghapus skill.' });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (skill: SkillItem) => {
    setEditingId(skill.id);
    setDraft({
      name: skill.name,
      description: skill.description,
      content: skill.content,
      category: skill.category,
    });
    setShowForm(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 max-h-[92dvh] flex flex-col pb-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span>Agent Skills</span>
                <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800/50 font-normal">
                  Progressive Disclosure
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Agent memuat skill saat dibutuhkan. Pin skill untuk menjadikannya persona aktif.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          {/* Search + filters */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari skill..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-base sm:text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition whitespace-nowrap ${
                    activeCategory === category
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Summary banner */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-amber-950/70 text-amber-400 border border-amber-800/50 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-200">
                  {pinnedSlugs.length} persona aktif • {visibleSkills.length} skill tersedia
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  Skill yang tidak dipin otomatis ditemukan agent lewat deskripsi singkat.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowForm((prev) => !prev);
                setEditingId(null);
                setDraft({ ...EMPTY_DRAFT });
              }}
              className="p-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition shrink-0"
              title="Buat skill baru"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Create / edit form */}
          {showForm && (
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-500/25 space-y-2.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {editingId ? 'Edit Skill' : 'Skill Baru'}
              </label>
              <input
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Nama skill (contoh: SQL Review)"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-base sm:text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
              <input
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Deskripsi singkat (agent memakai ini untuk menemukan skill)"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-base sm:text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
              <textarea
                rows={7}
                value={draft.content}
                onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Instruksi lengkap skill dalam Markdown..."
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-base sm:text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono resize-y leading-relaxed"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setDraft({ ...EMPTY_DRAFT });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !draft.name.trim() || !draft.content.trim()}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-semibold transition flex items-center gap-1.5"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Simpan
                </button>
              </div>
            </div>
          )}

          {/* Skill list */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Memuat skill...
            </div>
          ) : visibleSkills.length === 0 ? (
            <div className="p-6 text-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-500 bg-slate-950/40">
              Tidak ada skill yang cocok.
            </div>
          ) : (
            <div className="space-y-2 max-h-[46dvh] overflow-y-auto pr-0.5">
              {visibleSkills.map((skill) => {
                const isPinned = pinnedSlugs.includes(skill.slug);
                const isUserSkill = Boolean(skill.userId);

                return (
                  <div
                    key={skill.id}
                    className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/80 text-xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-100">{skill.name}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/60 text-slate-400">
                            /{skill.slug}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded border font-sans font-bold bg-slate-900 text-slate-400 border-slate-700/60">
                            {skill.category}
                          </span>
                          {isUserSkill ? (
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/40 font-sans font-bold">
                              <User className="w-2.5 h-2.5" />
                              CUSTOM
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/40 font-sans font-bold">
                              <Cpu className="w-2.5 h-2.5" />
                              SYSTEM
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          {skill.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isUserSkill && (
                          <button
                            type="button"
                            onClick={() => startEdit(skill)}
                            className="touch-target-sm p-1.5 rounded text-slate-500 hover:text-cyan-400 hover:bg-slate-900 transition"
                            title="Edit skill"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isUserSkill && (
                          <button
                            type="button"
                            onClick={() => handleDelete(skill)}
                            disabled={saving}
                            className="touch-target-sm p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition"
                            title="Hapus skill"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleTogglePin(skill)}
                          className={`touch-target-sm p-1.5 rounded transition ${
                            isPinned
                              ? 'text-amber-400 bg-amber-950/60 border border-amber-800/50'
                              : 'text-slate-500 hover:text-amber-400 hover:bg-slate-900'
                          }`}
                          title={isPinned ? 'Lepas sebagai persona' : 'Pin sebagai persona aktif'}
                        >
                          {isPinned ? (
                            <Pin className="w-3.5 h-3.5" />
                          ) : (
                            <PinOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {isPinned && (
                      <div className="flex items-center gap-1.5 text-[10px] text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded-lg px-2 py-1">
                        <Pin className="w-3 h-3" />
                        Persona aktif — dimuat otomatis di setiap permintaan.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Status message */}
          {statusMsg && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-fadeIn ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-800/80 text-rose-200'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Skill library tersinkronisasi dengan database</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
