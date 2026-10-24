'use client';
// components/logos5/ConcisePicker.tsx — HOW MUCH SOCRIA SAYS. The one setting.
//
// Logos 5 is one model, so the composer no longer offers a choice of models:
// the chip that read "Logos 5 · Balanced" opened a menu of Core registers, Logos
// surfaces and depths, and none of it was a choice a person in Logos 5 needed
// to make. What is left is the one thing worth setting — how long the answers
// run — as the same dial Core 4 uses for it (ModelPicker's Dial), kept in the
// same place (lib/socria-model-store.ts LENGTH_KEY), so the two surfaces agree.
//
// The setting travels with every turn as `length` (the reply's own length
// rule, app/api/logos/chat) and sets the depth the other Logos surfaces read,
// so a concise Socria is concise everywhere (LogosApp guidance()).

import { useEffect, useRef, useState } from 'react';
import type { ReplyLength } from '@/lib/socria-prompt';
import { Dial } from '../ModelPicker';
import '@/app/app-shell.css';

/** Logos 5's words for the three positions: the middle is the default, and reads as one. */
export const CONCISENESS: ReadonlyArray<{ id: ReplyLength; label: string; description: string }> = [
  { id: 'concise', label: 'Concise', description: 'The shortest answer that carries it. More when you ask.' },
  { id: 'standard', label: 'Balanced', description: 'Brief when brief will do; more when the question needs it.' },
  { id: 'detailed', label: 'Detailed', description: 'Room to cover what matters — never padding.' },
];

export function ConcisePicker({ value, onChange }: { value: ReplyLength; onChange: (next: ReplyLength) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // pointerdown, so the sheet is gone before whatever was pressed outside it reacts
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
  const now = CONCISENESS.find((c) => c.id === value) ?? CONCISENESS[1];
  return (
    <span className="app-root app-inline">
      <div className="mp l5-concise" ref={box}>
        <button
          type="button"
          className={`mp-btn${open ? ' open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`How much Socria says: ${now.label}`}
          title="How much Socria says"
        >
          <svg className="l5-concise-i" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M3 4.5h10M3 8h7M3 11.5h4" />
          </svg>
          <span className="nm">{now.label}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>
        {open && (
          <div className="mp-sheet" role="dialog" aria-label="How much Socria says">
            <p className="mp-lbl">How much it says</p>
            <Dial name="How much it says" options={CONCISENESS} value={now.id} onPick={onChange} />
            <p className="mp-note">The length of the answers — never how carefully they are thought through.</p>
          </div>
        )}
      </div>
    </span>
  );
}
