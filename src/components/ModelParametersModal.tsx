'use client';

import React from 'react';
import { X, Sliders, RotateCcw, Sparkles, Brain, Cpu, MessageSquareCode } from 'lucide-react';

interface ModelParametersModalProps {
  isOpen: boolean;
  onClose: () => void;
  temperature: number;
  onTemperatureChange: (val: number) => void;
  topP: number;
  onTopPChange: (val: number) => void;
  maxTokens: number;
  onMaxTokensChange: (val: number) => void;
  systemPrompt: string;
  onSystemPromptChange: (val: string) => void;
  selectedModelName: string;
}

export const ModelParametersModal: React.FC<ModelParametersModalProps> = ({
  isOpen,
  onClose,
  temperature,
  onTemperatureChange,
  topP,
  onTopPChange,
  maxTokens,
  onMaxTokensChange,
  systemPrompt,
  onSystemPromptChange,
  selectedModelName,
}) => {
  if (!isOpen) return null;

  const handleResetDefaults = () => {
    onTemperatureChange(0.7);
    onTopPChange(0.9);
    onMaxTokensChange(4096);
    onSystemPromptChange('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Model Tuning & Parameters</span>
              </h2>
              <p className="text-[11px] text-slate-400 truncate max-w-[280px]">
                Active Model: <span className="text-cyan-400 font-mono">{selectedModelName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Temperature Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Temperature</span>
              </label>
              <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                {temperature.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={temperature}
              onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            {/* Presets */}
            <div className="flex gap-1.5 pt-1">
              {[
                { label: 'Precise', val: 0.2 },
                { label: 'Balanced', val: 0.7 },
                { label: 'Creative', val: 1.2 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onTemperatureChange(p.val)}
                  className={`flex-1 py-1 text-[11px] rounded-lg border font-medium transition ${
                    Math.abs(temperature - p.val) < 0.05
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label} ({p.val})
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Higher values make output more random and creative; lower values make it more focused and deterministic.
            </p>
          </div>

          {/* Top_P Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-violet-400" />
                <span>Top P (Nucleus Sampling)</span>
              </label>
              <span className="text-xs font-mono font-bold text-violet-400 bg-violet-950/60 px-2 py-0.5 rounded border border-violet-800/40">
                {topP.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={topP}
              onChange={(e) => onTopPChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
            />
            <p className="text-[11px] text-slate-500">
              Controls model diversity via nucleus sampling. 0.5 means only tokens comprising top 50% probability mass are considered.
            </p>
          </div>

          {/* Max Output Tokens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span>Max Output Tokens</span>
              </label>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                {maxTokens}
              </span>
            </div>
            <input
              type="range"
              min="256"
              max="16384"
              step="256"
              value={maxTokens}
              onChange={(e) => onMaxTokensChange(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex gap-1.5 pt-1">
              {[1024, 2048, 4096, 8192].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onMaxTokensChange(val)}
                  className={`flex-1 py-1 text-[11px] rounded-lg border font-mono transition ${
                    maxTokens === val
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {val >= 1024 ? `${val / 1024}k` : val}
                </button>
              ))}
            </div>
          </div>

          {/* Custom System Prompt */}
          <div className="space-y-2 border-t border-slate-800/80 pt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <MessageSquareCode className="w-3.5 h-3.5 text-amber-400" />
                <span>Custom System Prompt (Per-Conversation)</span>
              </label>
              {systemPrompt && (
                <span className="text-[10px] text-amber-400 font-mono">
                  {systemPrompt.length} chars
                </span>
              )}
            </div>
            <textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              placeholder="e.g. You are an expert TypeScript architect. Respond concisely with production-grade code, unit tests, and security considerations..."
              className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 leading-relaxed font-sans"
            />
            <p className="text-[11px] text-slate-500">
              Overrides default assistant instructions for this conversation session.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Defaults</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-md shadow-cyan-600/20"
          >
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  );
};
