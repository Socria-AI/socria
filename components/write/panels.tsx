'use client';

// components/write/panels.tsx — find and replace, the outline, the page, a link, a picture's description.
//
// What a word processor keeps beside its page, kept small: each is opened by
// the person, changes nothing until they press the button that says what it
// does, and is closed with Escape.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_FONT,
  DEFAULT_PAGE,
  DEFAULT_SIZE,
  findAll,
  FONT_KEYS,
  FONTS,
  hrefValue,
  outlineOf,
  PAPER,
  type Hit,
  type PageSetup,
  type PaperSize,
  type WriteDoc,
} from '@/lib/write/doc';

// ── find and replace ────────────────────────────────────────────────

export function FindBar({
  doc,
  replace,
  onHits,
  onReveal,
  onReplace,
  onClose,
}: {
  doc: WriteDoc;
  replace: boolean;
  onHits: (hits: Hit[], current: number) => void;
  onReveal: (h: Hit) => void;
  onReplace: (hits: Hit[], text: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [rep, setRep] = useState('');
  const [showRep, setShowRep] = useState(replace);
  const [matchCase, setMatchCase] = useState(false);
  const [whole, setWhole] = useState(false);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  useEffect(() => setShowRep((v) => v || replace), [replace]);
  const hits = useMemo(() => findAll(doc, q, { matchCase, wholeWord: whole }), [doc, q, matchCase, whole]);
  const cur = hits.length ? Math.min(at, hits.length - 1) : -1;
  useEffect(() => {
    onHits(hits, cur);
    // the hits change with every keystroke of the search; the parent only draws them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, cur]);
  useEffect(() => () => onHits([], -1), [onHits]);
  const go = (dir: 1 | -1) => {
    if (!hits.length) return;
    const next = (cur + dir + hits.length) % hits.length;
    setAt(next);
    onReveal(hits[next]);
  };
  return (
    <div className="w-find" role="search" aria-label="Find in your writing" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="w-row">
        <input
          ref={input}
          className="w-input"
          value={q}
          placeholder="Find in your writing"
          aria-label="Find"
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              go(e.shiftKey ? -1 : 1);
            }
          }}
        />
        <span className="w-find-count" aria-live="polite">
          {q ? (hits.length ? `${cur + 1} of ${hits.length}` : 'None') : ''}
        </span>
        <button type="button" className="w-btn is-quiet" aria-label="Previous match" disabled={!hits.length} onClick={() => go(-1)}>
          ↑
        </button>
        <button type="button" className="w-btn is-quiet" aria-label="Next match" disabled={!hits.length} onClick={() => go(1)}>
          ↓
        </button>
        <button type="button" className={`w-btn is-quiet${showRep ? ' is-on' : ''}`} aria-pressed={showRep} onClick={() => setShowRep((v) => !v)}>
          Replace
        </button>
        <button type="button" className="w-x" aria-label="Close find" onClick={onClose}>
          ×
        </button>
      </div>
      {showRep && (
        <div className="w-row">
          <input className="w-input" value={rep} placeholder="Replace with" aria-label="Replace with" onChange={(e) => setRep(e.target.value)} />
          <button type="button" className="w-btn" disabled={cur < 0} onClick={() => onReplace([hits[cur]], rep)}>
            Replace
          </button>
          <button type="button" className="w-btn" disabled={!hits.length} onClick={() => onReplace(hits, rep)}>
            Replace all{hits.length ? ` ${hits.length}` : ''}
          </button>
        </div>
      )}
      <div className="w-row is-wrap w-find-opts">
        <label className="w-toggle">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case
        </label>
        <label className="w-toggle">
          <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> Whole words
        </label>
      </div>
    </div>
  );
}

// ── the outline ─────────────────────────────────────────────────────

export function OutlinePanel({
  doc,
  onGo,
  onMove,
  onStructure,
}: {
  doc: WriteDoc;
  onGo: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  /** a reverse outline of the argument, read by Socria — in its panel */
  onStructure?: () => void;
}) {
  const items = useMemo(() => outlineOf(doc), [doc]);
  return (
    <div className="w-outline">
      <p className="w-quiet">Your headings. Moving a section moves everything under it too.</p>
      {!items.length && <p className="w-quiet">The headings you write appear here. Make a line a heading from the toolbar’s style menu, or start it with “# ”.</p>}
      <ol className="w-outline-list">
        {items.map((it) => (
          <li key={it.id} className={`lvl-${it.level}`}>
            <button type="button" className="w-outline-go" onClick={() => onGo(it.id)} title="Go to this heading">
              {it.text}
            </button>
            <span className="w-outline-acts">
              <button type="button" className="w-mini" aria-label={`Move “${it.text}” up`} onClick={() => onMove(it.id, -1)}>
                ↑
              </button>
              <button type="button" className="w-mini" aria-label={`Move “${it.text}” down`} onClick={() => onMove(it.id, 1)}>
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      {onStructure && (
        <button type="button" className="w-link-btn" onClick={onStructure}>
          How is the argument organised? Ask Socria →
        </button>
      )}
    </div>
  );
}

// ── the page ────────────────────────────────────────────────────────

const MARGINS: [string, [number, number, number, number]][] = [
  ['Normal (1 in)', [1, 1, 1, 1]],
  ['Narrow (0.5 in)', [0.5, 0.5, 0.5, 0.5]],
  ['Moderate (1 in · 0.75 in)', [1, 0.75, 1, 0.75]],
  ['Wide (1 in · 2 in)', [1, 2, 1, 2]],
];

export function PagePanel({ doc, onChange }: { doc: WriteDoc; onChange: (patch: Partial<Pick<WriteDoc, 'page' | 'font' | 'size' | 'view'>>) => void }) {
  const page = doc.page ?? DEFAULT_PAGE;
  const setPage = (p: Partial<PageSetup>) => onChange({ page: { ...page, ...p } });
  const preset = MARGINS.find(([, m]) => m.join() === page.m.join())?.[0] ?? 'Custom';
  const margin = (k: number, v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    const m = [...page.m] as PageSetup['m'];
    m[k] = Math.max(0.25, Math.min(3, Math.round(n * 100) / 100));
    setPage({ m });
  };
  return (
    <div className="w-pagesetup">
      <p className="w-quiet">How it prints, and how Word and PDF copies are laid out.</p>
      <label className="w-field">
        <span>Paper</span>
        <select className="w-input" value={page.size} onChange={(e) => setPage({ size: e.target.value as PaperSize })}>
          {(Object.keys(PAPER) as PaperSize[]).map((k) => (
            <option key={k} value={k}>
              {PAPER[k].label}
            </option>
          ))}
        </select>
      </label>
      <div className="w-field" role="radiogroup" aria-label="Orientation">
        <span>Orientation</span>
        <div className="w-row">
          {(['portrait', 'landscape'] as const).map((o) => (
            <label key={o} className="w-toggle">
              <input type="radio" name="w-orient" checked={page.orient === o} onChange={() => setPage({ orient: o })} /> {o === 'portrait' ? 'Portrait' : 'Landscape'}
            </label>
          ))}
        </div>
      </div>
      <label className="w-field">
        <span>Margins</span>
        <select
          className="w-input"
          value={preset}
          onChange={(e) => {
            const m = MARGINS.find(([n]) => n === e.target.value)?.[1];
            if (m) setPage({ m: [...m] as PageSetup['m'] });
          }}
        >
          {MARGINS.map(([n]) => (
            <option key={n}>{n}</option>
          ))}
          {preset === 'Custom' && <option>Custom</option>}
        </select>
      </label>
      <div className="w-margins">
        {(['Top', 'Right', 'Bottom', 'Left'] as const).map((side, k) => (
          <label key={side} className="w-field is-small">
            <span>{side} (in)</span>
            <input className="w-input" type="number" min={0.25} max={3} step={0.25} value={page.m[k]} onChange={(e) => margin(k, e.target.value)} />
          </label>
        ))}
      </div>
      <p className="w-eyebrow">The document’s own font</p>
      <div className="w-row">
        <select className="w-input" aria-label="Document font" value={FONT_KEYS.includes((doc.font ?? DEFAULT_FONT) as never) ? doc.font ?? DEFAULT_FONT : DEFAULT_FONT} onChange={(e) => onChange({ font: e.target.value })}>
          {FONT_KEYS.map((k) => (
            <option key={k} value={k}>
              {FONTS[k].label}
            </option>
          ))}
        </select>
        <select className="w-input is-narrow" aria-label="Document size" value={doc.size ?? DEFAULT_SIZE} onChange={(e) => onChange({ size: Number(e.target.value) })}>
          {[10, 10.5, 11, 11.5, 12, 13, 14, 16].map((n) => (
            <option key={n} value={n}>
              {n} pt
            </option>
          ))}
        </select>
      </div>
      <label className="w-toggle">
        <input type="checkbox" checked={doc.view === 'page'} onChange={(e) => onChange({ view: e.target.checked ? 'page' : 'flow' })} /> Show the writing as pages, at their real width, with where each page will likely end
      </label>
      <p className="w-quiet">Where pages end is an estimate; Word, a PDF reader or a printer decides it exactly.</p>
    </div>
  );
}

// ── a link ──────────────────────────────────────────────────────────

export function LinkEditor({ href, withText, rect, onApply, onRemove, onClose }: { href: string; withText: boolean; rect: DOMRect | null; onApply: (href: string, text?: string) => void; onRemove: () => void; onClose: () => void }) {
  const [v, setV] = useState(href);
  const [text, setText] = useState('');
  const ok = hrefValue(v.trim());
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const top = rect ? Math.min(rect.bottom + 8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 160) : 120;
  const left = rect ? Math.max(12, Math.min(rect.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 352)) : 24;
  return (
    <div className="w-linkedit" role="dialog" aria-label="Link" style={{ top, left }} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onApply(ok, withText ? text.trim() || undefined : undefined);
        }}
      >
        {withText && <input className="w-input" value={text} placeholder="Words to show (optional)" aria-label="Words to show" onChange={(e) => setText(e.target.value)} />}
        <div className="w-row">
          <input ref={input} className="w-input" value={v} placeholder="Paste or type an address" aria-label="Address" onChange={(e) => setV(e.target.value)} />
          <button type="submit" className="w-btn is-primary" disabled={!ok}>
            Apply
          </button>
        </div>
        {v.trim() && !ok && <p className="w-quiet">An address starts with https://, www., mailto: or tel:.</p>}
        <div className="w-row">
          {href && (
            <button type="button" className="w-btn is-quiet is-danger" onClick={onRemove}>
              Remove link
            </button>
          )}
          <button type="button" className="w-btn is-quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/** The card under a link the caret is in: where it goes, open it, change it, take it away. */
export function LinkBubble({ href, rect, onEdit, onRemove }: { href: string; rect: DOMRect; onEdit: () => void; onRemove: () => void }) {
  const top = Math.min(rect.bottom + 8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 60);
  const left = Math.max(12, Math.min(rect.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 340));
  return (
    <div className="w-linkbubble" role="dialog" aria-label="Link" style={{ top, left }} onMouseDown={(e) => e.preventDefault()}>
      <a href={href} target="_blank" rel="noopener noreferrer" className="w-linkbubble-url" title={href}>
        {href.replace(/^https?:\/\//, '').replace(/\/$/, '')}
      </a>
      <button type="button" className="w-btn is-quiet" onClick={onEdit}>
        Change
      </button>
      <button type="button" className="w-btn is-quiet" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

/** A picture's description — what a screen reader says, and what every export keeps. */
export function AltEditor({ alt, onSave, onClose }: { alt: string; onSave: (alt: string) => void; onClose: () => void }) {
  const [v, setV] = useState(alt);
  return (
    <div className="w-banner" role="dialog" aria-label="Describe the picture" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <p>Describe the picture for someone who cannot see it — it is read aloud, and kept in every export.</p>
      <form
        className="w-row"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(v);
        }}
      >
        <input className="w-input" autoFocus value={v} maxLength={300} placeholder="e.g. A bar chart of rents rising since 2020" aria-label="Description" onChange={(e) => setV(e.target.value)} />
        <button type="submit" className="w-btn is-primary">
          Save
        </button>
        <button type="button" className="w-btn is-quiet" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}
