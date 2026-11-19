'use client';
// components/ux-v0/SectionEditor.tsx — change the selected part yourself.
//
// For an element of a generated design: the words of the exact field it was
// drawn from, the section's layout (its kind's own variants), how a booking or
// an opening is set (which side, what proportion, how the times show… only the
// settings its layout draws), its ground, its spacing and its place, or take
// it out. Every control applies a real patch
// (lib/ux-v0/spec.ts applyPatch) as a new version that Undo takes back; none
// is decoration. A locked section's controls are off until it is unlocked
// (lib/ux-v0/edit.ts), and a locked section is carried through a new
// generation, asked about before a model changes it, and never auto-repaired.

import { useEffect, useRef, useState } from 'react';
import { fieldLabel, textAt, textPatch } from '@/lib/ux-v0/edit';
import { PADS, SHAPE_EFFECTIVE, SHAPE_FIELDS, TONES, kindDef, shapeDefault, type DesignSpec, type Patch } from '@/lib/ux-v0/spec';
import type { Piece } from '@/lib/ux-v0/compose';

const TONE_LABEL: Record<(typeof TONES)[number], string> = { base: 'Page', alt: 'Alternate', accent: 'Accent', accent2: 'Second accent', invert: 'Inverted' };
const PAD_LABEL: Record<(typeof PADS)[number], string> = { s: 'Tight', m: 'Even', l: 'Generous' };
const words = (v: string) => v.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** How a booking or an opening is set (lib/ux-v0/spec.ts SHAPE_FIELDS), in words. */
const SHAPE_LABEL: Record<string, Record<string, string>> = {
  booking: { side: 'Side', times: 'Times', summary: 'Your choice', ratio: 'Proportion', density: 'Density', align: 'Heading' },
  hero: { align: 'Alignment', side: 'Words', valign: 'Words sit', measure: 'Line length', scale: 'Headline size', ratio: 'Words’ share' },
};
const SHAPE_VALUE: Record<string, string> = { start: 'Left', end: 'Right', tiles: 'Tiles', rows: 'Rows', pills: 'Pills', card: 'Card', inline: 'Plain', bar: 'By the button', airy: 'Airy', even: 'Even', dense: 'Dense', left: 'Left', center: 'Centred', top: 'Top', middle: 'Middle', bottom: 'Bottom' };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const shapeShown = (kind: string, k: string, v: number) => (k === 'ratio' ? (kind === 'booking' ? `${pct(v)} · ${pct(1 - v)}` : `${pct(v)} words`) : pct(v));

/** A setting with a range: drawn as it moves, applied once when it is let go (one version, not one per pixel). */
function ShapeRange({ label, min, max, value, shown, disabled, onCommit }: { label: string; min: number; max: number; value: number; shown: (v: number) => string; disabled: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  const sent = useRef(value);
  useEffect(() => {
    setV(value);
    sent.current = value;
  }, [value]);
  const commit = () => {
    const r = Math.round(v * 100) / 100;
    if (Math.abs(r - sent.current) < 0.005) return;
    sent.current = r;
    onCommit(r);
  };
  return (
    <label className="v0-edit-row v0-edit-range">
      <span className="v0-edit-l">
        {label} <span className="v0-quiet">{shown(v)}</span>
      </span>
      <input type="range" min={min} max={max} step={0.01} value={v} disabled={disabled} aria-valuetext={shown(v)} onChange={(e) => setV(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  );
}

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

      {(SHAPE_EFFECTIVE[sec.kind]?.[sec.variant] ?? []).map((k) => {
        // only the settings this layout draws: the others would change nothing you could see
        const field = SHAPE_FIELDS[sec.kind]?.[k];
        const label = SHAPE_LABEL[sec.kind]?.[k] ?? words(k);
        const cur = sec.shape?.[k] ?? shapeDefault(sec.kind, sec.variant)[k];
        const set = (v: string | number, said: string) => onPatch({ op: 'shape', sectionId: sec.id, shape: { [k]: v }, summary: `${def.label}: ${label.toLowerCase()} ${said}` }, `the ${name}: ${label.toLowerCase()} ${said}`);
        if (!field) return null;
        if (field.t === 'num')
          return <ShapeRange key={k} label={label} min={field.min} max={field.max} value={typeof cur === 'number' ? cur : (field.min + field.max) / 2} shown={(v) => shapeShown(sec.kind, k, v)} disabled={locked} onCommit={(v) => set(v, shapeShown(sec.kind, k, v))} />;
        return (
          <div key={k} className="v0-edit-row" role="group" aria-label={label}>
            <span className="v0-edit-l">{label}</span>
            <span className="sb-seg v0-edit-seg">
              {field.values.map((v) => (
                <button key={v} type="button" className={`sb-seg-item${cur === v ? ' is-on' : ''}`} aria-pressed={cur === v} disabled={locked} onClick={() => cur !== v && set(v, (SHAPE_VALUE[v] ?? words(v)).toLowerCase())}>
                  {SHAPE_VALUE[v] ?? words(v)}
                </button>
              ))}
            </span>
          </div>
        );
      })}

      {sec.kind === 'compose' && (sec.content.root as Piece | undefined)?.t === 'grid' && (sec.content.root as Extract<Piece, { t: 'grid' }>).children.length >= 2 && (() => {
        // a composed section's own arrangement: the proportion of its first two columns, and which side is which
        const root = sec.content.root as Extract<Piece, { t: 'grid' }>;
        const [a, b = 1] = root.cols;
        const share = a / (a + b);
        const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
        const setShare = (v: number) => {
          const left = Math.max(2, Math.min(10, Math.round(v * 12)));
          const g = gcd(left, 12 - left);
          const cols = [left / g, (12 - left) / g, ...root.cols.slice(2)];
          onPatch({ op: 'content', sectionId: sec.id, content: { root: { ...root, cols } }, summary: `${def.label}: columns at ${cols[0]} : ${cols[1]}` }, `the ${name}’s columns at ${cols[0]} : ${cols[1]}`);
        };
        const swap = () => {
          const children = [root.children[1], root.children[0], ...root.children.slice(2)];
          const cols = [root.cols[1] ?? 1, root.cols[0], ...root.cols.slice(2)];
          onPatch({ op: 'content', sectionId: sec.id, content: { root: { ...root, children, cols } }, summary: `${def.label}: sides swapped` }, `the ${name}’s sides swapped`);
        };
        return (
          <>
            <ShapeRange label="Columns" min={0.17} max={0.83} value={share} shown={(v) => `${Math.round(v * 12)} : ${12 - Math.round(v * 12)}`} disabled={locked} onCommit={setShare} />
            <div className="v0-edit-row v0-edit-acts" role="group" aria-label="Its arrangement">
              <button type="button" className="sb-link is-meta" disabled={locked} onClick={swap}>
                Swap sides
              </button>
            </div>
          </>
        );
      })()}

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
