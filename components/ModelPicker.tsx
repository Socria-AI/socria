'use client';

import { useState } from 'react';
import { SOCRIA_MODELS, type SocriaModel } from '@/lib/socria-prompt';

export function ModelPicker({
  value,
  onChange,
}: {
  value: SocriaModel;
  onChange: (next: SocriaModel) => void;
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
          <div className="absolute right-0 mt-2 w-72 rounded-xl border border-ink/10 bg-white shadow-lg z-40 overflow-hidden">
            {(Object.keys(SOCRIA_MODELS) as SocriaModel[]).map((id) => {
              const m = SOCRIA_MODELS[id];
              const active = id === value;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    active
                      ? 'bg-moss-50/50'
                      : 'hover:bg-ink/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-[15px] text-ink">
                      {m.label}
                    </span>
                    {active && (
                      <span className="text-moss-700 text-xs">●</span>
                    )}
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
