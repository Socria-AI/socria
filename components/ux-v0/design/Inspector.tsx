'use client';
// components/ux-v0/design/Inspector.tsx — the selected element's real CSS, edited by hand.
//
// What is shown is what the frame measured (computed styles); what is changed is written onto the element as inline
// style by id (lib/ux-v0/design/elements.ts applyHandEdit), so it wins over the stylesheet and is exactly what the
// next request's HTML shows the designer. No model is asked for anything here.
//
// It is also where the person's authority is exercised: an element or a whole artboard protected, an artboard's state
// (exploration … approved), the typefaces and colours to stay with. What is protected cannot be changed here either
// until it is unlocked — the controls are held, and say why.

import { useEffect, useState } from 'react';
import { GRAPHIC_FONTS } from '@/lib/ux-v0/fonts';
import { ARTBOARD_STATES, STATE_LABEL, isElementLocked, type ArtboardState, type DesignArtboard, type DesignPins } from '@/lib/ux-v0/design/doc';
import { FORMATS, sizeLabel } from '@/lib/ux-v0/design/formats';
import type { HandEdit } from '@/lib/ux-v0/design/elements';
import type { BrandFact } from '@/lib/ux-v0/design/brandcheck';
import type { FaceStatus } from '@/lib/ux-v0/design/typefaces';
import type { ElementPick } from './Canvas';

const firstFace = (v: string) => (v.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
const pxNum = (v: string | undefined) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : '';
};
function hexOf(c: string | undefined): string {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c ?? '');
  if (!m) return /^#[0-9a-f]{6}$/i.test(c ?? '') ? (c as string) : '#000000';
  return `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`;
}
const transparent = (c: string | undefined) => !c || /rgba\([^)]*,\s*0\)$/.test(c) || c === 'transparent';

function Num({ label, value, onCommit, step = 1, suffix = 'px' }: { label: string; value: number | ''; onCommit: (v: string) => void; step?: number; suffix?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <label className="dx-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== String(value) && onCommit(v === '' ? '' : `${v}${suffix}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

export interface InspectorProps {
  pick: ElementPick | null;
  artboard: DesignArtboard | null;
  onEdit: (e: HandEdit) => void;
  onParent: () => void;
  onAsk: (prefill: string) => void;
  onFormat: (format: string) => void;
  onExport: (kind: 'png' | 'jpeg' | 'pdf' | 'svg' | 'html') => void;
  onComment: (text: string) => void;
  /** the person's authority (see the head of this file) */
  pins?: DesignPins;
  onState: (state: ArtboardState) => void;
  onApprove: () => void;
  onReopen: () => void;
  onLockArtboard: (locked: boolean) => void;
  onLockElement: (element: string, what: string | null) => void;
  onKeep: (what: 'faces' | 'colours') => void;
  onRelease: (what: 'faces' | 'colours') => void;
  onShow: (element: string) => void;
  onReview: () => void;
  /** the faces the artboard is set in, with what really draws each; and the way to see it in others */
  faces?: FaceStatus[];
  onCompareType?: (from: string) => void;
  /** the artboard against its brand, as checked (requirements apart from principles), and what was allowed here */
  brand?: { name: string; facts: BrandFact[]; allowed?: DesignPins; onAllow: (what: 'faces' | 'colours', value: string, on: boolean) => void } | null;
  /** more of the artboard panel, from the workspace (print marks, motion, exports that belong to its kind) */
  extra?: React.ReactNode;
  busy?: boolean;
}

const labelFor = (pick: ElementPick) => (pick.text ? `“${pick.text.slice(0, 40)}${pick.text.length > 40 ? '…' : ''}”` : pick.classes ? `the ${pick.tag} “${pick.classes.split(' ')[0]}”` : `the ${pick.tag}`);

export function Inspector({ pick, artboard, onEdit, onParent, onAsk, onFormat, onExport, onComment, pins, onState, onApprove, onReopen, onLockArtboard, onLockElement, onKeep, onRelease, onShow, onReview, extra, busy, brand, faces, onCompareType }: InspectorProps) {
  const [text, setText] = useState(pick?.text ?? '');
  const [note, setNote] = useState('');
  useEffect(() => setText(pick?.text ?? ''), [pick?.id, pick?.text]);
  if (!artboard) {
    return (
      <aside className="dx-inspect" aria-label="Inspector">
        <p className="dx-muted">Select an artboard or click anything on one to edit it. Double-click words to retype them; drag to move.</p>
      </aside>
    );
  }
  if (!pick) {
    return (
      <aside className="dx-inspect" aria-label="Artboard">
        <h3 className="dx-h">{artboard.name}</h3>
        <p className="dx-muted">
          {artboard.width} × {artboard.height} px
        </p>

        <h4 className="dx-sub">Where it stands</h4>
        {artboard.state === 'approved' ? (
          <div className="dx-approved" data-state="approved">
            <p>
              <strong>Approved.</strong> It is locked: nothing on it changes, by hand or by the designer, until you reopen it. The approved version stays in the history whatever happens next.
            </p>
            <button type="button" className="dx-btn" onClick={onReopen}>
              Reopen for changes
            </button>
          </div>
        ) : (
          <>
            <div className="dx-row">
              <label className="dx-field dx-grow">
                <span>Status</span>
                <select value={artboard.state ?? 'draft'} onChange={(e) => onState(e.target.value as ArtboardState)} aria-label="Status">
                  {ARTBOARD_STATES.filter((x) => x !== 'approved').map((x) => (
                    <option key={x} value={x}>
                      {STATE_LABEL[x]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="dx-btn dx-primary dx-approve" onClick={onApprove} disabled={busy} title="Mark it approved, lock it, and keep this version for good">
                Approve
              </button>
            </div>
            <label className="dx-toggle">
              <input type="checkbox" checked={!!artboard.locked} onChange={(e) => onLockArtboard(e.target.checked)} />
              <span>Lock the whole artboard</span>
            </label>
          </>
        )}
        {artboard.locks?.length ? (
          <>
            <h4 className="dx-sub">Protected on it</h4>
            <ul className="dx-locks">
              {artboard.locks.map((l) => (
                <li key={l.id}>
                  <button type="button" className="dx-linkish" onClick={() => onShow(l.id)} title="Show it on the artboard">
                    {l.what}
                  </button>
                  <button type="button" className="dx-btn dx-ghost dx-small" onClick={() => onLockElement(l.id, null)}>
                    Unlock
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h4 className="dx-sub">Keep across the project</h4>
        <div className="dx-row">
          <button type="button" className="dx-btn" onClick={() => onKeep('faces')} title="Everything made after this is held to these typefaces">
            Keep its typefaces
          </button>
          <button type="button" className="dx-btn" onClick={() => onKeep('colours')} title="Everything made after this is held to these colours, their tints and shades">
            Keep its colours
          </button>
        </div>
        {pins?.faces?.length ? (
          <p className="dx-kept" data-kept="faces">
            <span>Typefaces kept: {pins.faces.join(', ')}</span>
            <button type="button" className="dx-btn dx-ghost dx-small" onClick={() => onRelease('faces')}>
              Release
            </button>
          </p>
        ) : null}
        {pins?.colours?.length ? (
          <p className="dx-kept" data-kept="colours">
            <span className="dx-swatches" aria-label={`Colours kept: ${pins.colours.join(', ')}`}>
              {pins.colours.map((c) => (
                <i key={c} style={{ background: c }} title={c} />
              ))}
            </span>
            <button type="button" className="dx-btn dx-ghost dx-small" onClick={() => onRelease('colours')}>
              Release
            </button>
          </p>
        ) : null}
        <p className="dx-muted dx-small">What is kept is checked on everything made afterwards; anything outside it is said, never changed for you.</p>

        {faces?.length ? (
          <>
            <h4 className="dx-sub">Typefaces</h4>
            <ul className="dx-brand dx-typefaces">
              {faces.map((f) => (
                <li key={f.name} className={f.by === 'fallback' ? 'is-requirement' : ''} data-face={f.name} data-by={f.by}>
                  <span className="dx-brand-level">{f.by === 'library' ? 'From the library' : f.by === 'own' ? 'Your font' : 'Not available — a fallback is drawn'}</span>
                  <p>
                    <strong>{f.name}</strong>. {f.note}
                  </p>
                  {onCompareType && !artboard.locked ? (
                    <button type="button" className="dx-btn dx-ghost dx-small" onClick={() => onCompareType(f.name)}>
                      See it in other typefaces
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {brand ? (
          <>
            <h4 className="dx-sub">Against {brand.name}</h4>
            {!brand.facts.length ? <p className="dx-muted dx-small" data-brand="within">Within the brand: its colours, its typefaces and its logo as it is.</p> : null}
            <ul className="dx-brand">
              {brand.facts.map((f, i) => (
                <li key={`${f.about}${f.value}${i}`} className={`is-${f.level}`} data-brand={f.about}>
                  <span className="dx-brand-level">{f.level === 'requirement' ? 'Requirement' : 'Principle'}</span>
                  <p>{f.text[0].toUpperCase() + f.text.slice(1)}.</p>
                  {f.about !== 'logo' ? (
                    <button type="button" className="dx-btn dx-ghost dx-small" onClick={() => brand.onAllow(f.about === 'face' ? 'faces' : 'colours', f.value, true)} title="An exception for this project; the brand itself does not change">
                      Allow in this project
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {brand.allowed?.faces?.length || brand.allowed?.colours?.length ? (
              <p className="dx-kept" data-kept="allowed">
                <span>
                  Allowed here:{' '}
                  {[...(brand.allowed.faces ?? []).map((v) => ['faces', v] as const), ...(brand.allowed.colours ?? []).map((v) => ['colours', v] as const)].map(([what, v]) => (
                    <button key={v} type="button" className="dx-chiplet" onClick={() => brand.onAllow(what, v, false)} title="Stop allowing it">
                      {what === 'colours' ? <i style={{ background: v }} /> : null}
                      {v} ×
                    </button>
                  ))}
                </span>
              </p>
            ) : null}
            <p className="dx-muted dx-small">A requirement is the brand’s rule; a principle is its habit, and a departure from it is yours to make. Nothing is changed for you.</p>
          </>
        ) : null}

        <h4 className="dx-sub">Review</h4>
        <button type="button" className="dx-btn" onClick={onReview} disabled={busy}>
          Review this artboard
        </button>
        <p className="dx-muted dx-small">A critical look: what is happening on it and what it costs, sorted by kind. Nothing changes unless you apply a finding.</p>

        <label className="dx-field dx-wide" style={{ marginTop: 18 }}>
          <span>Format</span>
          <select value={artboard.format} disabled={!!artboard.locked} onChange={(e) => onFormat(e.target.value)}>
            {artboard.format === 'custom' && <option value="custom">Custom size</option>}
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} — {sizeLabel(f)}
              </option>
            ))}
          </select>
        </label>
        <p className="dx-muted dx-small">Changing the format asks the designer to recompose the artboard for its new shape.</p>
        <h4 className="dx-sub">Export</h4>
        <div className="dx-row">
          {(['png', 'jpeg', 'pdf', 'svg', 'html'] as const).map((k) => (
            <button key={k} type="button" className="dx-btn" onClick={() => onExport(k)}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="dx-muted dx-small">PNG and PDF are drawn from the artboard itself, print at its resolution. SVG opens in browsers (its contents are HTML), not in vector editors.</p>
        {extra}
      </aside>
    );
  }
  const st = pick.style;
  const set = (props: Record<string, string | null>) => onEdit({ op: 'style', id: pick.id, props });
  const face = firstFace(st['font-family'] ?? '');
  const hasText = pick.textual;
  const ownLock = (artboard.locks ?? []).some((l) => l.id === pick.id);
  const held = isElementLocked(artboard, pick.id);
  return (
    <aside className="dx-inspect" aria-label="Element">
      <div className="dx-pick">
        <span className="dx-tag">{pick.tag}</span>
        <span className="dx-pick-text">{pick.text ? `“${pick.text.slice(0, 48)}${pick.text.length > 48 ? '…' : ''}”` : pick.classes || 'element'}</span>
      </div>
      <div className="dx-row">
        {pick.parent && (
          <button type="button" className="dx-btn dx-ghost" onClick={onParent} title="Select the element that holds this one">
            Select parent
          </button>
        )}
        <button type="button" className="dx-btn dx-ghost" onClick={() => onAsk(pick.text ? `Change “${pick.text.slice(0, 40)}”: ` : 'Change this: ')}>
          Ask about this
        </button>
        {!artboard.locked && (
          <button type="button" className={`dx-btn${ownLock ? ' is-on' : ' dx-ghost'}`} aria-pressed={ownLock} onClick={() => onLockElement(pick.id, ownLock ? null : labelFor(pick))} title={ownLock ? 'Let it be changed again' : 'Protect it: the designer cannot change it, and neither can the canvas'}>
            {ownLock ? 'Unlock' : 'Lock'}
          </button>
        )}
      </div>
      {held && (
        <p className="dx-held" role="note">
          {artboard.locked ? (artboard.state === 'approved' ? 'This artboard is approved and locked. Reopen it to change anything on it.' : 'This artboard is locked. Unlock it to change anything on it.') : 'Protected: the designer cannot change it, and it cannot be changed here until you unlock it.'}
        </p>
      )}
      <fieldset className="dx-fields" disabled={held}>

      {hasText && (
        <>
          <h4 className="dx-sub">Words</h4>
          <textarea className="dx-text" value={text} rows={Math.min(6, Math.max(2, Math.ceil(text.length / 28)))} onChange={(e) => setText(e.target.value)} onBlur={() => text !== pick.text && onEdit({ op: 'text', id: pick.id, text })} />
          <h4 className="dx-sub">Type</h4>
          <label className="dx-field dx-wide">
            <span>Face</span>
            <select value={GRAPHIC_FONTS.some((f) => f.name === face) ? face : ''} onChange={(e) => set({ 'font-family': `'${e.target.value}', ${GRAPHIC_FONTS.find((f) => f.name === e.target.value)?.kind === 'serif' ? 'serif' : GRAPHIC_FONTS.find((f) => f.name === e.target.value)?.kind === 'mono' ? 'monospace' : 'sans-serif'}` })}>
              {!GRAPHIC_FONTS.some((f) => f.name === face) && <option value="">{face || 'Default'}</option>}
              {GRAPHIC_FONTS.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <div className="dx-grid">
            <Num label="Size" value={pxNum(st['font-size'])} onCommit={(v) => set({ 'font-size': v || null })} />
            <label className="dx-field">
              <span>Weight</span>
              <select value={st['font-weight'] ?? '400'} onChange={(e) => set({ 'font-weight': e.target.value })}>
                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                  <option key={w} value={String(w)}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <Num label="Leading" value={st['line-height'] === 'normal' ? '' : pxNum(st['line-height'])} onCommit={(v) => set({ 'line-height': v || null })} />
            <Num label="Tracking" value={st['letter-spacing'] === 'normal' ? 0 : pxNum(st['letter-spacing'])} step={0.1} onCommit={(v) => set({ 'letter-spacing': v || null })} />
          </div>
          <div className="dx-row dx-seg" role="group" aria-label="Alignment">
            {(['left', 'center', 'right', 'justify'] as const).map((a) => (
              <button key={a} type="button" className={`dx-btn dx-ghost${st['text-align'] === a || (a === 'left' && st['text-align'] === 'start') ? ' is-on' : ''}`} onClick={() => set({ 'text-align': a })}>
                {a[0].toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
          <div className="dx-row dx-seg" role="group" aria-label="Case and style">
            <button type="button" className={`dx-btn dx-ghost${st['text-transform'] === 'uppercase' ? ' is-on' : ''}`} onClick={() => set({ 'text-transform': st['text-transform'] === 'uppercase' ? 'none' : 'uppercase' })}>
              Capitals
            </button>
            <button type="button" className={`dx-btn dx-ghost${st['font-style'] === 'italic' ? ' is-on' : ''}`} onClick={() => set({ 'font-style': st['font-style'] === 'italic' ? 'normal' : 'italic' })}>
              Italic
            </button>
          </div>
        </>
      )}

      <h4 className="dx-sub">Colour</h4>
      <div className="dx-grid">
        {hasText && (
          <label className="dx-field">
            <span>Text</span>
            <input type="color" value={hexOf(st.color)} onChange={(e) => set({ color: e.target.value })} />
          </label>
        )}
        <label className="dx-field">
          <span>Fill</span>
          <input type="color" value={transparent(st['background-color']) ? '#ffffff' : hexOf(st['background-color'])} onChange={(e) => set({ 'background-color': e.target.value })} />
        </label>
        {pick.tag !== 'div' && st.fill && st.fill !== 'none' && !/^rgb\(0, 0, 0\)$/.test(st.fill) && (
          <label className="dx-field">
            <span>SVG fill</span>
            <input type="color" value={hexOf(st.fill)} onChange={(e) => set({ fill: e.target.value })} />
          </label>
        )}
        <Num label="Opacity %" value={Math.round(parseFloat(st.opacity ?? '1') * 100)} suffix="" onCommit={(v) => set({ opacity: v === '' ? null : String(Math.max(0, Math.min(100, Number(v))) / 100) })} />
      </div>
      {!transparent(st['background-color']) && (
        <button type="button" className="dx-btn dx-ghost dx-small" onClick={() => set({ 'background-color': 'transparent', background: null })}>
          No fill
        </button>
      )}

      <h4 className="dx-sub">Size and place</h4>
      <div className="dx-grid">
        <Num label="Width" value={Math.round(pick.box.w)} onCommit={(v) => set({ width: v || null })} />
        <Num label="Height" value={Math.round(pick.box.h)} onCommit={(v) => set({ height: v || null })} />
        <Num label="Radius" value={pxNum(st['border-radius'])} onCommit={(v) => set({ 'border-radius': v || null })} />
        <Num label="Rotate °" value={parseFloat(st.rotate) || 0} suffix="deg" onCommit={(v) => set({ rotate: v === '0deg' || !v ? null : v })} />
      </div>
      <p className="dx-muted dx-small">Drag on the artboard to move; arrow keys nudge by 1 px (with shift, 10).</p>

      <h4 className="dx-sub">Layer</h4>
      <div className="dx-row">
        <button type="button" className="dx-btn dx-ghost" onClick={() => onEdit({ op: 'order', id: pick.id, to: 'front' })}>
          To front
        </button>
        <button type="button" className="dx-btn dx-ghost" onClick={() => onEdit({ op: 'order', id: pick.id, to: 'back' })}>
          To back
        </button>
        <button type="button" className="dx-btn dx-ghost" onClick={() => onEdit({ op: 'duplicate', id: pick.id })}>
          Duplicate
        </button>
        <button type="button" className="dx-btn dx-ghost is-danger" onClick={() => onEdit({ op: 'remove', id: pick.id })}>
          Delete
        </button>
      </div>

      </fieldset>

      <h4 className="dx-sub">Note</h4>
      <div className="dx-row">
        <input className="dx-note-in" value={note} placeholder="Leave a note on this element" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && note.trim() && (onComment(note.trim()), setNote(''))} />
      </div>
    </aside>
  );
}
