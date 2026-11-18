'use client';
// components/ux-v0/SectionEditor.tsx — change the selected part yourself.
//
// For an element of a generated design: the words of the exact field it was
// drawn from, the section's layout (its kind's own variants), its ground, its
// spacing and its place, or take it out. Every control applies a real patch
// (lib/ux-v0/spec.ts applyPatch) as a new version that Undo takes back; none
// is decoration. A locked section's controls are off until it is unlocked
// (lib/ux-v0/edit.ts), and a locked section is carried through a new
// generation, asked about before a model changes it, and never auto-repaired.

import { useEffect, useState } from 'react';
import { fieldLabel, textAt, textPatch } from '@/lib/ux-v0/edit';
import { PADS, TONES, kindDef, type DesignSpec, type Patch } from '@/lib/ux-v0/spec';

const TONE_LABEL: Record<(typeof TONES)[number], string> = { base: 'Page', alt: 'Alternate', accent: 'Accent', accent2: 'Second accent', invert: 'Inverted' };
const PAD_LABEL: Record<(typeof PADS)[number], string> = { s: 'Tight', m: 'Even', l: 'Generous' };
const words = (v: string) => v.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** The colour each ground is in this design, so the choice is seen, not named only. */
const groundColour = (spec: DesignSpec, t: (typeof TONES)[number]): string => {
  const c = spec.tokens.colors;
  switch (t) {
    case 'alt':
      return c.surface;
    case 'accent':
      return c.accent;
    case 'accent2':
      return spec.look?.accent2 || c.accent;
    case 'invert':
      return c.text;
    default:
      return c.background;
  }
};

export function SectionEditor({
  spec,
  sectionId,
  path,
  onPatch,
  onLock,
}: {
  spec: DesignSpec;
  sectionId: string;
  path: string;
  onPatch: (patch: Patch, label: string) => void;
  onLock: (sectionId: string, locked: boolean) => void;
}) {
  const idx = spec.sections.findIndex((s) => s.id === sectionId);
  const sec = idx >= 0 ? spec.sections[idx] : null;
  const text = sec && path ? textAt(sec, path) : null;
  const [draft, setDraft] = useState(text?.value ?? '');
  // a new selection, or a new version of the section, starts from its own words
  useEffect(() => setDraft(text?.value ?? ''), [sectionId, path, text?.value]);
  if (!sec) return null;
  const def = kindDef(sec.kind);
  if (!def) return null;
  const locked = !!sec.locked;
  const name = def.label.toLowerCase();
  const tone = sec.tone ?? 'base';
  const pad = sec.pad ?? 'm';
  const commitText = () => {
    const p = text ? textPatch(sec, path, draft) : null;
    if (p) onPatch(p, `new words for the ${fieldLabel(path)}`);
  };

  return (
    <section className={`v0-cellset v0-edit${locked ? ' is-locked' : ''}`} aria-label={`Change the ${name}`}>
      <div className="v0-edit-head">
        <span className="sb-label">This section · {def.label}</span>
        <button type="button" className={`v0-lock${locked ? ' is-on' : ''}`} aria-pressed={locked} onClick={() => onLock(sec.id, !locked)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2" y="5.5" width="8" height="5.5" rx="1.3" fill="currentColor" />
            <path d={locked ? 'M4 5.6V4a2 2 0 0 1 4 0v1.6' : 'M4 5.6V4a2 2 0 0 1 3.9-.7'} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          {locked ? 'Locked' : 'Lock it'}
        </button>
      </div>
      {locked && <p className="v0-quiet">Kept exactly as it is: a new generation carries it over, a change by SocriaUX is asked about first, and the automatic repairs leave it alone. Unlock it to change it.</p>}

      {text && (
        <label className="v0-edit-row">
          <span className="v0-edit-l">Words · {fieldLabel(path)}</span>
          <textarea
            className="v0-field v0-edit-text"
            value={draft}
            maxLength={text.max}
            rows={Math.min(5, Math.max(1, Math.ceil(draft.length / 34)))}
            disabled={locked}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitText();
              }
              if (e.key === 'Escape') setDraft(text.value);
            }}
          />
          <span className="v0-edit-foot">
            <span className="v0-quiet">
              {draft.length}/{text.max}
            </span>
            <button type="button" className="sb-link is-meta is-strong" disabled={locked || draft.trim() === text.value} onClick={commitText}>
              Use these words
            </button>
          </span>
        </label>
      )}

      {def.variants.length > 1 && (
        <label className="v0-edit-row">
          <span className="v0-edit-l">Layout</span>
          <select className="v0-select" value={sec.variant} disabled={locked} onChange={(e) => onPatch({ op: 'variant', sectionId: sec.id, variant: e.target.value, summary: `${def.label}: ${words(e.target.value)} layout` }, `the ${name} as ${words(e.target.value).toLowerCase()}`)}>
            {def.variants.map((v) => (
              <option key={v} value={v}>
                {words(v)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="v0-edit-row" role="group" aria-label="Ground">
        <span className="v0-edit-l">Ground</span>
        <span className="sb-seg v0-edit-seg">
          {TONES.map((t) => (
            <button key={t} type="button" className={`sb-seg-item${tone === t ? ' is-on' : ''}`} aria-pressed={tone === t} disabled={locked} title={TONE_LABEL[t]} onClick={() => tone !== t && onPatch({ op: 'tone', sectionId: sec.id, tone: t, summary: `${def.label} on the ${TONE_LABEL[t].toLowerCase()} ground` }, `the ${name} on the ${TONE_LABEL[t].toLowerCase()} ground`)}>
              <span className="v0-tone-dot" style={{ background: groundColour(spec, t) }} aria-hidden="true" />
              <span className="v0-sr">{TONE_LABEL[t]}</span>
            </button>
          ))}
        </span>
      </div>

      <div className="v0-edit-row" role="group" aria-label="Spacing">
        <span className="v0-edit-l">Spacing</span>
        <span className="sb-seg v0-edit-seg">
          {PADS.map((p) => (
            <button key={p} type="button" className={`sb-seg-item${pad === p ? ' is-on' : ''}`} aria-pressed={pad === p} disabled={locked} onClick={() => pad !== p && onPatch({ op: 'tone', sectionId: sec.id, pad: p, summary: `${PAD_LABEL[p]} spacing for the ${name}` }, `${PAD_LABEL[p].toLowerCase()} spacing for the ${name}`)}>
              {PAD_LABEL[p]}
            </button>
          ))}
        </span>
      </div>

      <div className="v0-edit-row v0-edit-acts" role="group" aria-label="Its place">
        <button type="button" className="sb-link is-meta" disabled={locked || idx === 0} onClick={() => onPatch({ op: 'move', sectionId: sec.id, to: idx - 1, summary: `Moved the ${name} up` }, `the ${name} moved up`)}>
          Move up
        </button>
        <button type="button" className="sb-link is-meta" disabled={locked || idx === spec.sections.length - 1} onClick={() => onPatch({ op: 'move', sectionId: sec.id, to: idx + 1, summary: `Moved the ${name} down` }, `the ${name} moved down`)}>
          Move down
        </button>
        <button type="button" className="sb-link is-meta v0-edit-remove" disabled={locked || spec.sections.length <= 1} onClick={() => onPatch({ op: 'remove', sectionId: sec.id, summary: `Took out the ${name}` }, `the ${name} taken out`)}>
          Take it out
        </button>
      </div>
    </section>
  );
}
