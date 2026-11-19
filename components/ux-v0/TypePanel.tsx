'use client';
// components/ux-v0/TypePanel.tsx — the design's typography, edited on the canvas.
//
// The two faces (from SocriaUX's list, served from Google Fonts), the headline's weight, its case and tracking,
// the scale between sizes, how an emphasised word is set and how small labels are set. Every control writes the
// design's own tokens or look through a patch: one version per change, Undo takes it back, and a change to type
// kept in the art direction, locked in the Creative DNA, or outside the designer's design system is asked about
// first (the Workspace checks it, as it checks a change asked for in words). The renderer (lib/ux-v0/render.ts)
// reads exactly these values; nothing here is a picture of a control.

import { useEffect, useState } from 'react';
import { FONTS, knownFont, nearestWeight } from '@/lib/ux-v0/fonts';
import { CASES, EMPHASES, LABELS, TRACKINGS, type DesignTokens, type Look, type Patch } from '@/lib/ux-v0/spec';

const CASE_LABEL: Record<(typeof CASES)[number], string> = { sentence: 'Sentence', upper: 'Capitals' };
const TRACK_LABEL: Record<(typeof TRACKINGS)[number], string> = { tight: 'Tight', normal: 'Normal', wide: 'Wide' };
const EMPH_LABEL: Record<(typeof EMPHASES)[number], string> = { italic: 'Italic', accent: 'In the accent', underline: 'Underlined', highlight: 'Highlighted', none: 'Not set apart' };
const LABEL_LABEL: Record<(typeof LABELS)[number], string> = { caps: 'Small capitals', sentence: 'Sentence case', mono: 'Monospaced', rule: 'With a rule', quiet: 'Quiet' };
const KIND_LABEL: Record<string, string> = { serif: 'Serif', sans: 'Sans serif', mono: 'Monospaced' };
const KINDS = ['serif', 'sans', 'mono'];

/** The weights a face can be set in: every hundred across a variable family's range, or a static family's own. */
export function weightsFor(name: string): number[] {
  const f = knownFont(name);
  if (!f) return [400, 700];
  if (f.variable) {
    const out: number[] = [];
    for (let w = Math.ceil(f.weights[0] / 100) * 100; w <= f.weights[1]; w += 100) out.push(w);
    return out;
  }
  return [...f.weights].sort((a, b) => a - b);
}

/** The scale between sizes, as a range drawn as it moves and applied once when let go: one version, not one per step. */
function Ratio({ value, disabled, onCommit }: { value: number; disabled?: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => Math.abs(v - value) >= 0.005 && onCommit(Math.round(v * 100) / 100);
  return (
    <label className="mp-row">
      <span className="mp-l">Scale</span>
      <input type="range" min={1.15} max={1.7} step={0.01} value={v} disabled={disabled} onChange={(e) => setV(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} aria-valuetext={`each size ${v.toFixed(2)} times the last`} />
      <span className="mp-v">{v.toFixed(2)}</span>
    </label>
  );
}

function Faces({ label, value, bodyOnly, disabled, onPick }: { label: string; value: string; bodyOnly?: boolean; disabled?: boolean; onPick: (name: string) => void }) {
  const known = !!knownFont(value);
  return (
    <label className="mp-row">
      <span className="mp-l">{label}</span>
      <select className="v0-select" value={value} disabled={disabled} onChange={(e) => onPick(e.target.value)}>
        {!known && <option value={value}>{value}</option>}
        {KINDS.map((k) => {
          const faces = FONTS.filter((f) => f.kind === k && !(bodyOnly && f.displayOnly));
          return faces.length ? (
            <optgroup key={k} label={KIND_LABEL[k]}>
              {faces.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
      </select>
    </label>
  );
}

function Seg<T extends string>({ label, value, options, names, disabled, onPick }: { label: string; value: T; options: readonly T[]; names: Record<string, string>; disabled?: boolean; onPick: (v: T) => void }) {
  return (
    <div className="mp-row" role="group" aria-label={label}>
      <span className="mp-l">{label}</span>
      <span className="sb-seg v0-edit-seg">
        {options.map((o) => (
          <button key={o} type="button" className={`sb-seg-item${value === o ? ' is-on' : ''}`} aria-pressed={value === o} disabled={disabled} onClick={() => value !== o && onPick(o)}>
            {names[o] ?? o}
          </button>
        ))}
      </span>
    </div>
  );
}

function Pick<T extends string>({ label, value, options, names, disabled, onPick }: { label: string; value: T; options: readonly T[]; names: Record<string, string>; disabled?: boolean; onPick: (v: T) => void }) {
  return (
    <label className="mp-row">
      <span className="mp-l">{label}</span>
      <select className="v0-select" value={value} disabled={disabled} onChange={(e) => onPick(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {names[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TypePanel({ tokens, look, disabled, onChange }: { tokens: DesignTokens; look: Look; disabled?: boolean; onChange: (patches: Patch[], label: string) => void }) {
  const display = tokens.fonts.display;
  const body = tokens.fonts.body;
  const weights = weightsFor(display);
  const weight = nearestWeight(display, look.weight);
  const lookPatch = (l: Partial<Look>, summary: string): Patch => ({ op: 'look', look: l, summary: `Type: ${summary}` });
  return (
    <div className="mp tp" role="group" aria-label="The type">
      <p className="v0-adjust-l">The faces and how headlines are set. Each change is a version Undo takes back.</p>
      <Faces
        label="Headlines"
        value={display}
        disabled={disabled}
        onPick={(name) => {
          // a face with other weights keeps the headline's weight as near as it has
          const w = nearestWeight(name, look.weight);
          const patches: Patch[] = [{ op: 'tokens', tokens: { fonts: { display: name } }, summary: `Headlines in ${name}` }];
          if (w !== look.weight) patches.push(lookPatch({ weight: w }, `headline weight ${w}`));
          onChange(patches, `headlines in ${name}`);
        }}
      />
      <Faces label="Text" value={body} bodyOnly disabled={disabled} onPick={(name) => onChange([{ op: 'tokens', tokens: { fonts: { body: name } }, summary: `Text in ${name}` }], `the text in ${name}`)} />
      {weights.length > 1 && (
        <Pick
          label="Weight"
          value={String(weight)}
          options={weights.map(String)}
          names={Object.fromEntries(weights.map((w) => [String(w), `${w}${w === 400 ? ' · regular' : w === 700 ? ' · bold' : w <= 300 ? ' · light' : w >= 800 ? ' · heavy' : ''}`]))}
          disabled={disabled}
          onPick={(v) => onChange([lookPatch({ weight: Number(v) }, `headline weight ${v}`)], `headlines at weight ${v}`)}
        />
      )}
      <Seg label="Case" value={look.case} options={CASES} names={CASE_LABEL} disabled={disabled} onPick={(v) => onChange([lookPatch({ case: v }, `headlines in ${CASE_LABEL[v].toLowerCase()}`)], `headlines in ${CASE_LABEL[v].toLowerCase()}`)} />
      <Seg label="Tracking" value={look.tracking} options={TRACKINGS} names={TRACK_LABEL} disabled={disabled} onPick={(v) => onChange([lookPatch({ tracking: v }, `${TRACK_LABEL[v].toLowerCase()} tracking`)], `${TRACK_LABEL[v].toLowerCase()} tracking for headlines`)} />
      <Ratio value={look.ratio} disabled={disabled} onCommit={(v) => onChange([lookPatch({ ratio: v }, `a type scale of ${v.toFixed(2)}`)], `a type scale of ${v.toFixed(2)}`)} />
      <Pick label="Emphasis" value={look.emphasis} options={EMPHASES} names={EMPH_LABEL} disabled={disabled} onPick={(v) => onChange([lookPatch({ emphasis: v }, `emphasis ${EMPH_LABEL[v].toLowerCase()}`)], `an emphasised word ${EMPH_LABEL[v].toLowerCase()}`)} />
      <Pick label="Labels" value={look.label} options={LABELS} names={LABEL_LABEL} disabled={disabled} onPick={(v) => onChange([lookPatch({ label: v }, `labels in ${LABEL_LABEL[v].toLowerCase()}`)], `small labels in ${LABEL_LABEL[v].toLowerCase()}`)} />
    </div>
  );
}
