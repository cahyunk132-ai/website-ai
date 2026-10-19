'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Sparkles, Check, Search, Zap, ShieldCheck, Lock } from 'lucide-react';
import { ModelCapability, ProviderId } from '@/lib/ai/types';
import { Tier, tierLabel } from '@/lib/ai/tiers';

interface ModelSelectorProps {
  models: ModelCapability[];
  selectedModelId: string;
  selectedProvider: 'auto' | ProviderId;
  onSelectModel: (modelId: string) => void;
  onSelectProvider: (provider: 'auto' | ProviderId) => void;
  /** The tier of the account: models of a higher tier are locked. */
  userTier?: Tier;
  /** Called when a locked model is clicked. */
  onLockedModel?: (model: ModelCapability) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  selectedModelId,
  selectedProvider,
  onSelectModel,
  onSelectProvider,
  userTier = 4,
  onLockedModel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [freeOnly, setFreeOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModel =
    models.find(
      (m) =>
        m.id === selectedModelId &&
        (selectedProvider === 'auto' || m.provider === selectedProvider)
    ) ||
    models.find((m) => m.id === selectedModelId) ||
    models[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const isLocked = (model: ModelCapability) => (model.minTier ?? 0) > userTier;

  const filteredModels = models.filter((m) => {
    const matchesProvider = selectedProvider === 'auto' || m.provider === selectedProvider;
    const matchesFree = !freeOnly || m.isFreeQuotaEligible;
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesProvider && matchesFree && matchesSearch;
  });

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Selector Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 text-xs text-slate-200 transition shadow-sm max-w-[120px] sm:max-w-[180px] lg:max-w-none min-w-0"
      >
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span className="font-semibold text-slate-100 truncate text-[11px] sm:text-xs min-w-0">
          {selectedModel?.name?.replace(' (Radox Free)', '')?.replace(' (InkStone Free)', '') || 'Select Model'}
        </span>
        {selectedModel?.isFreeQuotaEligible && (
          <span className="hidden sm:inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 shrink-0">
            FREE
          </span>
        )}
        <span className="hidden md:inline-block text-[11px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800 shrink-0">
          {selectedProvider === 'auto' ? 'Auto' : selectedModel?.provider}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Mobile backdrop for easy dismissal */}
          <div
            className="fixed inset-0 z-40 bg-black/60 sm:hidden"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed sm:absolute inset-x-2 sm:inset-x-auto sm:left-0 top-safe-header sm:top-full sm:mt-2 sm:w-[460px] sm:max-w-[calc(100vw-2rem)] max-h-[82dvh] sm:max-h-[34rem] rounded-2xl bg-slate-950 border border-slate-700/80 shadow-2xl shadow-black/90 z-50 flex flex-col overflow-hidden animate-fadeIn">
            {/* Header Controls: Free Tier Toggle & Provider Filters */}
            <div className="p-3 border-b border-slate-800 bg-slate-900 space-y-2.5 shrink-0">
              {/* Free Tier Filter Switch */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Filter Mode:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setFreeOnly(!freeOnly)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition border ${
                    freeOnly
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/60 shadow-sm'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {freeOnly && <Check className="w-3 h-3 text-emerald-400" />}
                  <span>{freeOnly ? 'Free Tier Models Only' : 'Show All Models'}</span>
                </button>
              </div>

              {/* Provider Filter Tabs (Segmented Control) */}
              <div className="flex items-center gap-1 text-xs bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => onSelectProvider('auto')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition text-center ${
                    selectedProvider === 'auto'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  Auto Route
                </button>
                <button
                  type="button"
                  onClick={() => onSelectProvider('radox')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition text-center ${
                    selectedProvider === 'radox'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  Radox AI
                </button>
                <button
                  type="button"
                  onClick={() => onSelectProvider('inkstone')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition text-center ${
                    selectedProvider === 'inkstone'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  Intern InkStone
                </button>
              </div>

              {/* Quick Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by model name or capability..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-base sm:text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Model Items */}
            <div className="max-h-80 sm:max-h-[26rem] overflow-y-auto p-2.5 pb-5 space-y-2 bg-slate-950">
              {filteredModels.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No models match the filter.
                  {freeOnly && (
                    <button
                      onClick={() => setFreeOnly(false)}
                      className="block mx-auto mt-2 text-cyan-400 hover:underline"
                    >
                      Disable "Free Tier Only"
                    </button>
                  )}
                </div>
              ) : (
                filteredModels.map((model) => {
                  const isSelected =
                    model.id === selectedModelId &&
                    (selectedProvider === 'auto' || model.provider === selectedProvider);
                  const locked = isLocked(model);
                  return (
                    <div
                      key={`${model.provider}-${model.id}`}
                      onClick={() => {
                        if (locked) {
                          onLockedModel?.(model);
                          return;
                        }
                        onSelectModel(model.id);
                        onSelectProvider(model.provider);
                        setIsOpen(false);
                      }}
                      title={
                        locked
                          ? `Butuh ${tierLabel(model.minTier)} - upgrade akun kamu untuk memakai model ini.`
                          : undefined
                      }
                      className={`p-3 rounded-xl transition border text-left ${
                        locked
                          ? 'cursor-not-allowed bg-slate-900/50 border-slate-800/70 opacity-70 hover:opacity-90'
                          : `cursor-pointer ${
                              isSelected
                                ? 'bg-slate-900 border-cyan-500/80 text-slate-100 shadow-md ring-1 ring-cyan-500/30'
                                : 'bg-slate-900/90 border-slate-800 hover:bg-slate-900 hover:border-slate-700 text-slate-300'
                            }`
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-xs text-slate-100 truncate">{model.name}</span>
                          {model.isFreeQuotaEligible && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 shrink-0">
                              FREE
                            </span>
                          )}
                          {locked && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700/60 shrink-0 flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" />
                              {tierLabel(model.minTier).toUpperCase()}
                            </span>
                          )}
                          <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                            {model.provider === 'inkstone' ? 'InkStone' : 'Radox'}
                          </span>
                        </div>
                        <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-mono font-medium shrink-0 ml-2">
                          {model.contextWindow >= 1000000
                            ? `${Math.round(model.contextWindow / 1000000)}M ctx`
                            : `${Math.round(model.contextWindow / 1000)}k ctx`}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2 mb-2 leading-relaxed">
                        {model.description}
                      </p>

                      {locked && (
                        <p className="text-[10px] text-amber-300/90 mb-2 flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          Butuh {tierLabel(model.minTier)} (tier {model.minTier})
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1">
                        {model.tags?.map((tag) => (
                          <span
                            key={tag}
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${
                              tag === 'Free Tier'
                                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800 font-medium'
                                : 'bg-slate-950 text-slate-400 border-slate-800'
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                        {model.fallbackModelId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                            ↳ Fallback: {model.fallbackModelId}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
  </div>
  );
};
