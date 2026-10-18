'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Sparkles, Check, Search, Zap, ShieldCheck } from 'lucide-react';
import { ModelCapability, ProviderId } from '@/lib/ai/types';

interface ModelSelectorProps {
  models: ModelCapability[];
  selectedModelId: string;
  selectedProvider: 'auto' | ProviderId;
  onSelectModel: (modelId: string) => void;
  onSelectProvider: (provider: 'auto' | ProviderId) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  selectedModelId,
  selectedProvider,
  onSelectModel,
  onSelectProvider,
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
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 text-xs text-slate-200 transition shadow-sm"
      >
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-semibold text-slate-100">{selectedModel?.name || 'Select Model'}</span>
        {selectedModel?.isFreeQuotaEligible && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
            FREE TIER
          </span>
        )}
        <span className="text-[11px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
          {selectedProvider === 'auto' ? 'Auto Fallback' : selectedModel?.provider}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-84 sm:w-96 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-800 shadow-2xl z-50 overflow-hidden">
          {/* Header Controls: Free Tier Toggle & Provider Filters */}
          <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/80 space-y-2">
            {/* Free Tier Filter Switch */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Filter Mode:</span>
              </span>
              <button
                type="button"
                onClick={() => setFreeOnly(!freeOnly)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  freeOnly
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {freeOnly && <Check className="w-3 h-3 text-emerald-400" />}
                <span>{freeOnly ? 'Free Tier Models Only' : 'Show All Models'}</span>
              </button>
            </div>

            {/* Provider Filter Tabs */}
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => onSelectProvider('auto')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedProvider === 'auto'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                Auto Route
              </button>
              <button
                onClick={() => onSelectProvider('radox')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedProvider === 'radox'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                Radox AI
              </button>
              <button
                onClick={() => onSelectProvider('inkstone')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedProvider === 'inkstone'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                Intern InkStone
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Model Items */}
          <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
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
                return (
                  <div
                    key={`${model.provider}-${model.id}`}
                    onClick={() => {
                      onSelectModel(model.id);
                      onSelectProvider(model.provider);
                      setIsOpen(false);
                    }}
                    className={`p-2.5 rounded-xl cursor-pointer transition border text-left ${
                      isSelected
                        ? 'bg-slate-800/90 border-cyan-500/50 text-slate-100 shadow-sm'
                        : 'border-transparent hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-100">{model.name}</span>
                        {model.isFreeQuotaEligible && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
                            FREE
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-mono">
                        {model.contextWindow >= 1000000
                          ? `${Math.round(model.contextWindow / 1000000)}M ctx`
                          : `${Math.round(model.contextWindow / 1000)}k ctx`}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 mb-2 leading-relaxed">
                      {model.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-1">
                      {model.tags?.map((tag) => (
                        <span
                          key={tag}
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            tag === 'Free Tier'
                              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50 font-medium'
                              : 'bg-slate-950/70 text-slate-400 border-slate-800'
                          }`}
                        >
                          {tag}
                        </span>
                      ))}
                      {model.fallbackModelId && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-800/40">
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
      )}
    </div>
  );
};
