'use client';

import { useState } from 'react';
import { SOCRIA_MODELS, type SocriaModel } from '@/lib/socria-prompt';

export function ModelPicker({
  value,
  onChange,
  isSignedIn = true,
  onLockedAttempt,
}: {
  value: SocriaModel;
  onChange: (next: SocriaModel) => void;
  isSignedIn?: boolean;
  onLockedAttempt?: (locked: SocriaModel) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = SOCRIA_MODELS[value];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 font-serif italic text-ink/55 hover:text-ink text-sm transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{current.label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-ink/10 bg-white shadow-lg z-40 overflow-hidden">
            {(Object.keys(SOCRIA_MODELS) as SocriaModel[]).map((id) => {
              const m = SOCRIA_MODELS[id];
              const active = id === value;
              const locked = m.requiresAuth && !isSignedIn;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (locked) {
                      onLockedAttempt?.(id);
                    } else {
                      onChange(id);
                    }
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    active
                      ? 'bg-moss-50/50'
                      : 'hover:bg-ink/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-serif text-[15px] text-ink flex items-center gap-2">
                      {m.label}
                      {locked && (
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          className="text-ink/40"
                          aria-label="Sign in required"
                        >
                          <rect x="4" y="11" width="16" height="10" rx="2" />
                          <path d="M8 11V8a4 4 0 018 0v3" />
                        </svg>
                      )}
                    </span>
                    {active ? (
                      <span className="text-moss-700 text-xs shrink-0">●</span>
                    ) : locked ? (
                      <span className="text-[11px] uppercase tracking-wider text-moss-700 font-medium shrink-0">
                        Unlock
                      </span>
                    ) : m.href ? (
                      <span
                        className="text-[13px] text-ink/30 shrink-0"
                        aria-label="Opens its own view"
                      >
                        ↗
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[12px] text-ink/55 leading-snug">
                    {m.description}
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
