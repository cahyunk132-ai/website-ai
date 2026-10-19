'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Check } from 'lucide-react';

export interface OverflowMenuItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
  /** Renders a separator above the entry. */
  separator?: boolean;
  /** Renders the entry as active. */
  active?: boolean;
}

interface HeaderOverflowMenuProps {
  items: OverflowMenuItem[];
  theme: 'dark' | 'light';
  title?: string;
}

/**
 * Dropdown for the secondary header actions.
 *
 * The header used to hold eleven buttons in a row, which overflowed the
 * toolbar on a laptop and made the buttons overlap. Everything that is not
 * used on every single click now lives in this menu, so the header always
 * fits and the action stays one click away.
 */
export const HeaderOverflowMenu: React.FC<HeaderOverflowMenuProps> = ({
  items,
  theme,
  title = 'Menu lainnya',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`p-2 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs transition flex items-center gap-1.5 ${
          theme === 'dark'
            ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
            : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
        }`}
        title={title}
      >
        <MoreHorizontal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="hidden lg:inline font-medium">More</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl shadow-black/50 z-50 overflow-hidden animate-fadeIn"
        >
          <div className="max-h-[70dvh] overflow-y-auto p-1.5">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    item.run();
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition ${
                    item.separator ? 'mt-1 border-t border-slate-800 pt-2.5' : ''
                  } hover:bg-slate-800/80`}
                >
                  <div className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-100 truncate flex items-center gap-1.5">
                      {item.label}
                      {item.active && <Check className="w-3 h-3 text-cyan-400 shrink-0" />}
                    </div>
                    {item.hint && (
                      <div className="text-[10px] text-slate-500 truncate">{item.hint}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
