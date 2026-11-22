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

import { PROC_KINDS, PROC_LABEL, PROC_SAYS, type ProcKind } from '@/lib/ux-v0/assets';
import { useEffect, useRef, useState } from 'react';
import { fieldLabel, textAt, textPatch } from '@/lib/ux-v0/edit';
import { BREAKPOINTS, BREAKPOINT_LABEL, PADS, SHAPE_EFFECTIVE, SHAPE_FIELDS, TONES, describeResponsive, kindDef, shapeDefault, stacksPicture, type Breakpoint, type BreakpointRule, type DesignSpec, type Patch, type Section } from '@/lib/ux-v0/spec';
import type { Piece } from '@/lib/ux-v0/compose';
import type { MoodboardRef } from '@/lib/ux-v0/types';
import { CompositionExplorer } from './CompositionExplorer';
import type { CompositionStrategy } from '@/lib/ux-v0/strategy';

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

/** One choice among a few, as a row of buttons; the one shown is pressed. */
function SegRow({ label, value, options, disabled, onPick }: { label: string; value: string; options: [string, string][]; disabled: boolean; onPick: (v: string, said: string) => void }) {
  return (
    <div className="v0-edit-row" role="group" aria-label={label}>
      <span className="v0-edit-l">{label}</span>
      <span className="sb-seg v0-edit-seg">
        {options.map(([v, l]) => (
          <button key={v || 'auto'} type="button" className={`sb-seg-item${value === v ? ' is-on' : ''}`} aria-pressed={value === v} disabled={disabled} onClick={() => value !== v && onPick(v, l)}>
            {l}
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * What changes at a narrower width: the designer's own decisions for tablets and phones (lib/ux-v0/spec.ts
 * Responsive), each one a "responsive" patch, a version Undo takes back. "As designed" takes a rule away.
 */
function WidthRules({ sec, label, name, locked, viewport, onPatch }: { sec: Section; label: string; name: string; locked: boolean; viewport?: 'desktop' | 'tablet' | 'mobile'; onPatch: (patch: Patch, label: string) => void }) {
  const [bp, setBp] = useState<Breakpoint>(viewport === 'tablet' ? 'tablet' : 'mobile');
  useEffect(() => {
    if (viewport === 'tablet' || viewport === 'mobile') setBp(viewport);
  }, [viewport]);
  const rule: BreakpointRule = sec.responsive?.[bp] ?? {};
  const where = BREAKPOINT_LABEL[bp].toLowerCase();
  const set = (k: keyof BreakpointRule, v: string | boolean, said: string) =>
    onPatch({ op: 'responsive', sectionId: sec.id, breakpoint: bp, rule: { [k]: v === '' ? null : v }, summary: `${label} ${where}: ${said.toLowerCase()}` }, `the ${name} ${where}: ${said.toLowerCase()}`);
  const hasPicture = stacksPicture(sec);
  const said = describeResponsive(sec.responsive);
  return (
    <div className="v0-edit-bp" role="group" aria-label="At other widths">
      <div className="v0-edit-row">
        <span className="v0-edit-l">At other widths</span>
        <span className="sb-seg v0-edit-seg" role="radiogroup" aria-label="Width">
          {BREAKPOINTS.map((b) => (
            <button key={b} type="button" role="radio" aria-checked={bp === b} className={`sb-seg-item${bp === b ? ' is-on' : ''}`} onClick={() => setBp(b)}>
              {b === 'tablet' ? 'Tablet' : 'Phone'}
            </button>
          ))}
        </span>
      </div>
      <SegRow label="Shown" value={rule.hide ? 'hide' : ''} options={[['', 'Shown'], ['hide', 'Hidden']]} disabled={locked} onPick={(v) => set('hide', v === 'hide', v === 'hide' ? 'hidden' : 'shown')} />
      {!rule.hide && (
        <>
          <SegRow label="Words" value={rule.align ?? ''} options={[['', 'As designed'], ['start', 'Left'], ['center', 'Centred']]} disabled={locked} onPick={(v, l) => set('align', v, v ? `words ${l}` : 'words as designed')} />
          <SegRow label="Spacing" value={rule.pad ?? ''} options={[['', 'As designed'], ['s', 'Tight'], ['m', 'Even'], ['l', 'Generous']]} disabled={locked} onPick={(v, l) => set('pad', v, v ? `${l} spacing` : 'spacing as designed')} />
          <SegRow label="Headings" value={rule.type ?? ''} options={[['', 'As designed'], ['s', 'Smaller'], ['l', 'Larger']]} disabled={locked} onPick={(v, l) => set('type', v, v ? `headings ${l}` : 'headings as designed')} />
          {sec.images.length > 0 && <SegRow label="Crop" value={rule.crop ?? ''} options={[['', 'As designed'], ['wide', 'Wide'], ['square', 'Square'], ['tall', 'Tall']]} disabled={locked} onPick={(v, l) => set('crop', v, v ? `pictures cropped ${l}` : 'pictures as designed')} />}
          {hasPicture && <SegRow label="Picture" value={rule.media ?? ''} options={[['', 'As designed'], ['first', 'First'], ['last', 'Last']]} disabled={locked} onPick={(v, l) => set('media', v, v ? `picture ${l === 'First' ? 'before' : 'after'} the words` : 'picture as designed')} />}
        </>
      )}
      {said.length > 0 && <p className="v0-quiet v0-edit-bp-said">{said.join(' · ')}</p>}
    </div>
  );
}

/** Where the picture's subject is: nine places; what stays in view however a layout or a width crops it. */
function FocalPoint({ refId, refs, locked, onFocus }: { refId: string; refs: readonly MoodboardRef[]; locked: boolean; onFocus: (refId: string, x: number, y: number) => void }) {
  const ref = refs.find((r) => r.id === refId);
  if (!ref) return null;
  const at = ref.focus ?? { x: 50, y: 50 };
  const STOPS = [15, 50, 85];
  const NAME = ['top', 'middle', 'bottom'];
  const SIDE = ['left', 'centre', 'right'];
  return (
    <div className="v0-edit-row" role="group" aria-label="The picture’s subject">
      <span className="v0-edit-l">Subject at</span>
      <span className="v0-focal" role="radiogroup" aria-label="Where the picture’s subject is">
        {STOPS.map((y, yi) =>
          STOPS.map((x, xi) => {
            const on = Math.abs(at.x - x) < 18 && Math.abs(at.y - y) < 18;
            return <button key={`${x}-${y}`} type="button" role="radio" aria-checked={on} aria-label={`${NAME[yi]} ${SIDE[xi]}`} title={`${NAME[yi]} ${SIDE[xi]}`} className={`v0-focal-dot${on ? ' is-on' : ''}`} disabled={locked} onClick={() => onFocus(refId, x, y)} />;
          })
        )}
      </span>
    </div>
  );
}

export function SectionEditor({
  spec,
  sectionId,
  path,
  onPatch,
  onLock,
  onMakeArt,
  imageGen,
  onPhotograph,
  viewport,
  refs,
  onFocus,
  strategy,
  rejected,
  onHold,
  onReject,
}: {
  spec: DesignSpec;
  sectionId: string;
  path: string;
  onPatch: (patch: Patch, label: string) => void;
  onLock: (sectionId: string, locked: boolean) => void;
  /** a picture made for this part by SocriaUX, in the design's colours (lib/ux-v0/assets.ts) */
  onMakeArt?: (sectionId: string, kind: ProcKind) => void;
  /** a photograph from an image model, when the server offers one (its price said first) */
  imageGen?: { enabled: boolean; why: string; price: number } | null;
  onPhotograph?: (sectionId: string) => void;
  /** the width the canvas shows: the width the "At other widths" controls start at */
  viewport?: 'desktop' | 'tablet' | 'mobile';
  /** the moodboard's pictures, and setting where a picture's subject is (kept with the picture) */
  refs?: readonly MoodboardRef[];
  onFocus?: (refId: string, x: number, y: number) => void;
  /** exploring other compositions for this part: the direction's strategy, what was set aside, holding one */
  strategy?: CompositionStrategy | null;
  rejected?: readonly string[];
  onHold?: (sectionId: string, held: boolean) => void;
  onReject?: (signature: string) => void;
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
      {onMakeArt && def.images[1] > 0 && !locked && (
        <div className="v0-edit-row">
          <span className="v0-edit-l">Pictures · art made for it</span>
          <span className="v0-edit-arts" role="group" aria-label="Make art for this part">
            {PROC_KINDS.map((k) => (
              <button key={k} type="button" className="sb-link is-meta" title={`${PROC_LABEL[k]}: ${PROC_SAYS[k]}`} onClick={() => onMakeArt(sec.id, k)}>
                {PROC_LABEL[k]}
              </button>
            ))}
          </span>
          <span className="v0-quiet">Drawn by SocriaUX in this design’s own colours, in place of its first picture; kept on the moodboard with where it came from. Undo takes it back.</span>
          {imageGen && (
            <span className="v0-edit-foot">
              {imageGen.enabled ? (
                <button type="button" className="sb-link is-meta is-strong" onClick={() => onPhotograph?.(sec.id)}>
                  A photograph from an image model (about US${imageGen.price.toFixed(2)})
                </button>
              ) : (
                <span className="v0-quiet">Photographs from an image model: {imageGen.why.replace(/\.$/, '').toLowerCase()}.</span>
              )}
            </span>
          )}
        </div>
      )}
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

      {sec.kind === 'features' && Array.isArray(sec.content.items) && sec.content.items.length >= 3 && sec.content.items.length <= 6 && (
        <SegRow
          label="Told as"
          value={sec.story ? 'story' : ''}
          options={[['', 'A list'], ['story', 'The pinned story']]}
          disabled={locked}
          onPick={(v) => onPatch({ op: 'story', sectionId: sec.id, story: v === 'story', summary: v === 'story' ? `${def.label} told as the pinned story` : `${def.label} no longer the story` }, v === 'story' ? `the ${name} told as the pinned story (where the motion tells one)` : `the ${name} as a list`)}
        />
      )}
      {onFocus && refs && sec.images.length > 0 && <FocalPoint refId={sec.images[0]} refs={refs} locked={locked} onFocus={onFocus} />}

      <WidthRules sec={sec} label={def.label} name={name} locked={locked} viewport={viewport} onPatch={onPatch} />
      {!locked && onHold && onReject && <CompositionExplorer spec={spec} sec={sec} refs={refs ?? []} strategy={strategy} rejected={rejected ?? []} onPatch={onPatch} onHold={onHold} onReject={onReject} />}

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
