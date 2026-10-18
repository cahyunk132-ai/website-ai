'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Cpu, ShieldCheck, Zap, Eye, Sparkles } from 'lucide-react';
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModel = models.find((m) => m.id === selectedModelId) || models[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredModels =
    selectedProvider === 'auto'
      ? models
      : models.filter((m) => m.provider === selectedProvider);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 transition shadow-sm"
      >
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <span className="font-semibold text-slate-100">{selectedModel?.name || 'Select Model'}</span>
        <span className="text-[11px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
          {selectedProvider === 'auto' ? 'Auto Fallback' : selectedModel?.provider}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 md:w-96 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-800 shadow-2xl z-50 overflow-hidden">
          {/* Provider Filter Tabs */}
          <div className="p-2 border-b border-slate-800/80 bg-slate-950/60 flex items-center gap-1 overflow-x-auto text-xs">
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
              Radox
            </button>
            <button
              onClick={() => onSelectProvider('inkstone')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                selectedProvider === 'inkstone'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              InkStone
            </button>
            <button
              onClick={() => onSelectProvider('experiential')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                selectedProvider === 'experiential'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Experiential
            </button>
          </div>

          {/* Model Items */}
          <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
            {filteredModels.map((model) => {
              const isSelected = model.id === selectedModelId;
              return (
                <div
                  key={model.id}
                  onClick={() => {
                    onSelectModel(model.id);
                    setIsOpen(false);
                  }}
                  className={`p-2.5 rounded-xl cursor-pointer transition border text-left ${
                    isSelected
                      ? 'bg-slate-800/90 border-cyan-500/50 text-slate-100 shadow-sm'
                      : 'border-transparent hover:bg-slate-800/50 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-slate-100">{model.name}</span>
                    <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-mono">
                      {Math.round(model.contextWindow / 1000)}k ctx
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mb-2 leading-relaxed">
                    {model.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {model.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950/70 text-slate-400 border border-slate-800"
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
            })}
          </div>
        </div>
      )}
    </div>
  );
};
