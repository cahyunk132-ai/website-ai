'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  LogOut,
  ShieldCheck,
  ChevronDown,
  Sparkles,
  KeyRound,
  CheckCircle2,
  Crown,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

interface UserProfileMenuProps {
  /** Opens the premium panel (plan, quota and upgrade). */
  onOpenPremium?: () => void;
}

export const UserProfileMenu: React.FC<UserProfileMenuProps> = ({ onOpenPremium }) => {
  const { user, logout, openAuthModal } = useAuth();
  const isPremium = user?.plan === 'premium';
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) {
    return (
      <button
        onClick={openAuthModal}
        className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition active:scale-[0.99]"
      >
        <KeyRound className="w-4 h-4" />
        <span>Masuk / Daftar Akun</span>
      </button>
    );
  }

  const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();

  return (
    <div className="relative w-full" ref={menuRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-2 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 text-left transition group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-100 truncate">{user.name}</span>
              {user.role === 'admin' ? (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/40 font-mono">
                  ADMIN
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono">
                  PRO
                </span>
              )}
              {isPremium && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 font-mono flex items-center gap-0.5">
                  <Crown className="w-2.5 h-2.5" />
                  PREMIUM
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ml-1.5 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 p-2 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-1.5 text-xs z-50 animate-fadeIn">
          {/* User Details */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/70 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Status Sesi:</span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Aktif (Secure Cookie)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">User ID:</span>
              <span className="text-[10px] font-mono text-cyan-300 truncate max-w-[140px]">
                {user.id.slice(0, 12)}...
              </span>
            </div>
          </div>

          {/* Premium / Plan */}
          {onOpenPremium && (
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenPremium();
              }}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl transition text-xs ${
                isPremium
                  ? 'text-amber-300 hover:text-amber-200 hover:bg-amber-950/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Crown className={`w-3.5 h-3.5 ${isPremium ? 'text-amber-400' : 'text-slate-400'}`} />
              <span>{isPremium ? 'Paket Premium' : 'Upgrade ke Premium'}</span>
            </button>
          )}

          {/* Switch Account */}
          <button
            onClick={() => {
              setIsOpen(false);
              openAuthModal();
            }}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition text-xs"
          >
            <User className="w-3.5 h-3.5 text-cyan-400" />
            <span>Ganti Akun</span>
          </button>

          {/* Logout Button */}
          <button
            onClick={async () => {
              setIsOpen(false);
              await logout();
            }}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-transparent hover:border-red-900/40 transition text-xs font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar (Logout)</span>
          </button>
        </div>
      )}
    </div>
  );
};
