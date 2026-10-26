'use client';
// components/logos5/MakePicker.tsx — WHAT TO MAKE, chosen before asking.
//
// Beside the length dial in the composer's tool row: pick a chart, a table, a
// timeline… — each shown as it will be drawn (MakeGallery) — and the next
// message asks for exactly that, in words (lib/logos5/make.ts). Picked, the button names the choice and an × takes it
// back; sent, it clears, so a choice never lingers into the next message.

import { useEffect, useRef, useState } from 'react';
import { makeChoice } from '@/lib/logos5/make';
import { templateChoice } from '@/lib/logos5/templates';
import { MakeGallery } from './MakeGallery';
import { useTemplates } from './useTemplates';
import '@/app/app-shell.css';

export function MakePicker({ value, onChange }: { value: string | null; onChange: (next: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  const own = useTemplates();
  // a choice of the list, or one of their own templates
  const now = makeChoice(value, own.map(templateChoice));
  return (
    <span className="app-root app-inline">
      <div className={`mp l5-make${now ? ' is-set' : ''}`} ref={box} data-tour="make">
        <button
          type="button"
          className={`mp-btn${open ? ' open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={now ? `Making a ${now.label.toLowerCase()}. Change what to make` : 'Choose what to make'}
          title="Choose what to make"
        >
          <svg className="l5-concise-i" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
            <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
            <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
            <path d="M11.25 9.25v4M9.25 11.25h4" />
          </svg>
          <span className="nm">{now ? now.label : 'Make'}</span>
        </button>
        {now && (
          <button type="button" className="l5-make-x" onClick={() => onChange(null)} aria-label={`Stop making a ${now.label.toLowerCase()}`} title="Just send a message">
            ×
          </button>
        )}
        {open && (
          <div className="mp-sheet" role="dialog" aria-label="Choose what to make">
            <p className="mp-lbl">Make</p>
            <MakeGallery
              compact
              own={own}
              selected={value}
              onPick={(id) => {
                onChange(id === value ? null : id);
                setOpen(false);
              }}
            />
            <p className="mp-note">Each is drawn as it will be. Choose one, then say what it is about — it is kept in Artifacts. For anything else, choose Your own and describe it.</p>
          </div>
        )}
      </div>
    </span>
  );
}
