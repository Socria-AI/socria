'use client';

import { useState } from 'react';
import { THINKING_DEPTHS, type ThinkingDepth } from '@/lib/socria-prompt';

export function DepthPicker({
  value,
  onChange,
  dropUp = false,
  align = 'left',
}: {
  value: ThinkingDepth;
  onChange: (next: ThinkingDepth) => void;
  /** open the menu above the button — it sits at the bottom of the screen */
  dropUp?: boolean;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const current = THINKING_DEPTHS.find((d) => d.id === value)!;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[12px] text-ink/55 hover:text-ink transition-colors px-2 py-1 rounded-md border border-ink/10 hover:border-ink/30"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Thinking depth"
      >
        <span className="uppercase tracking-wider font-medium">
          {current.label}
        </span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`transition-transform ${
            dropUp ? (open ? '' : 'rotate-180') : open ? 'rotate-180' : ''
          }`}
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
          <div
            className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} ${
              dropUp ? 'bottom-full mb-2' : 'mt-2'
            } w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-ink/10 bg-white shadow-lg z-40 overflow-hidden`}
          >
            <div className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-[0.18em] text-ink/40 border-b border-ink/5">
              Thinking depth
            </div>
            {THINKING_DEPTHS.map((d) => {
              const active = d.id === value;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    onChange(d.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    active ? 'bg-moss-50/50' : 'hover:bg-ink/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] text-ink font-medium">
                      {d.label}
                    </span>
                    {active && <span className="text-moss-700 text-xs">●</span>}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink/55 leading-snug">
                    {d.description}
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
