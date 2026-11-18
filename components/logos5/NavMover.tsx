'use client';
// components/logos5/NavMover.tsx — "Move the views": left (the default), top or right (./nav-side.ts).

import { useEffect, useRef, useState } from 'react';
import { NAV_SIDES, NAV_SIDE_SAID, type NavSide } from './nav-side';

export function NavMover({ side, onSide, compact = false }: { side: NavSide; onSide: (s: NavSide) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span className="ls-navmove" ref={ref}>
      <button type="button" className="l5-link ls-navmove-b" aria-expanded={open} onClick={() => setOpen((v) => !v)} title="Move the views to the left, the top or the right" aria-label="Move the views">
        {compact ? '⇄' : 'Move the views'}
      </button>
      {open && (
        <span className="ls-navmove-menu" role="group" aria-label="Where the views sit">
          {NAV_SIDES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={side === s}
              onClick={() => {
                onSide(s);
                setOpen(false);
              }}
            >
              {NAV_SIDE_SAID[s]}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
