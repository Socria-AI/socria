'use client';
// components/ux-v0/studio/SystemPicker.tsx — which design system a work is made in, chosen in one place for every kind
// of work: none (SocriaUX proposes an identity), or one of the person's own (kept in this browser, or with their
// account). Only published systems can be built in; the manager is one step away for the rest.

import { useEffect, useRef, useState } from 'react';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { publishedContent } from '@/lib/ux-v0/dsi/registry';
import { roleHex } from '@/lib/ux-v0/dsi/tokens';
import { Check, Down, Plus, Swatches } from './glyphs';

/** The systems a work can be built in: active, with a published version. */
export const usableSystems = (xs: readonly SystemRecord[]) => xs.filter((r) => r.status === 'active' && r.published > 0);

function coloursOf(r: SystemRecord): string[] {
  const c = publishedContent(r, 'latest');
  if (!c) return [];
  return (['background', 'text', 'accent'] as const).map((k) => roleHex(c, k)).filter((x): x is string => !!x);
}

export function SystemPicker({ systems, value, onChange, onManage, onImport, label = true, align = 'start' }: { systems: readonly SystemRecord[]; value: string | null; onChange: (id: string | null) => void; onManage?: () => void; onImport?: () => void; label?: boolean; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const usable = usableSystems(systems);
  const chosen = usable.find((r) => r.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        box.current?.querySelector<HTMLButtonElement>('.sd-sys-btn')?.focus();
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className={`sd-sys${open ? ' is-open' : ''} is-${align}`} ref={box}>
      <button type="button" className={`sd-pill sd-sys-btn${chosen ? ' is-set' : ''}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} title="The design system this work is made in">
        {chosen ? (
          <span className="sd-sys-dots" aria-hidden="true">
            {coloursOf(chosen).map((c, i) => (
              <span key={`${c}-${i}`} style={{ background: c }} />
            ))}
          </span>
        ) : (
          <Swatches size={15} />
        )}
        <span className="sd-sys-name">
          {label && <span className="sd-sys-k">Design system</span>}
          {chosen ? chosen.name : 'None'}
        </span>
        <Down size={14} />
      </button>
      {open && (
        <div className="sd-pop" role="group" aria-label="Design system">
          <p className="sd-pop-k">Make it in</p>
          <button type="button" className={`sd-pop-item${!chosen ? ' is-on' : ''}`} aria-pressed={!chosen} onClick={() => pick(null)}>
            <span className="sd-pop-t">No design system</span>
            <span className="sd-pop-h">SocriaUX proposes an identity from your words</span>
            {!chosen && <Check size={15} />}
          </button>
          {usable.map((r) => (
            <button key={r.id} type="button" className={`sd-pop-item${chosen?.id === r.id ? ' is-on' : ''}`} aria-pressed={chosen?.id === r.id} onClick={() => pick(r.id)}>
              <span className="sd-sys-dots" aria-hidden="true">
                {coloursOf(r).map((c, i) => (
                  <span key={`${c}-${i}`} style={{ background: c }} />
                ))}
              </span>
              <span className="sd-pop-t">
                {r.name}
                {r.isDefault ? <span className="sd-pop-tag">Default</span> : null}
              </span>
              <span className="sd-pop-h">
                Version {r.published}
                {r.owner ? ' · with your account' : ' · in this browser'}
              </span>
              {chosen?.id === r.id && <Check size={15} />}
            </button>
          ))}
          {systems.length > usable.length && <p className="sd-pop-note">{systems.length - usable.length} more not yet published: publish a version to build in it.</p>}
          <div className="sd-pop-foot">
            {onImport && (
              <button type="button" className="sd-textlink" onClick={() => (setOpen(false), onImport())}>
                <Plus size={13} /> Bring one in
              </button>
            )}
            {onManage && (
              <button type="button" className="sd-textlink" onClick={() => (setOpen(false), onManage())}>
                Manage design systems
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
