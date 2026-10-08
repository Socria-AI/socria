'use client';
// components/StructureView.tsx
//
// THE STRUCTURE LENS OF LOGOS 3 — the whole panel, in detail. Where the
// card layout shows a label per box, this reads the map as a document
// (lib/logos-structure.ts): every part under what it serves, what kind of
// part it is and how it hangs there, its note, whether it is settled, and
// every other relation it has, each one a link to the part it names.
//
// Selecting a part is the same act as selecting its card: the conversation
// becomes about it, and its comments and actions follow. Nothing here edits
// the map.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LogosNode, ThinkingMap } from '@/lib/logos';
import { structureOutline, type StructItem } from '@/lib/logos-structure';
import { MODE_META, NODE_MODES, type NodeMode } from '@/lib/logos-explore';
import { NodeGlyph } from './NodeGlyph';
import { MathText, TeX } from './TeX';
import './structure-view.css';

/** Under the Answer Guard a concluding part would spell the answer, so it is masked — as on its card. */
const masked = (guarded: boolean | undefined, type: LogosNode['type']) =>
  !!guarded && (type === 'result' || type === 'verification' || type === 'counterexample');

const STATUS: Partial<Record<NonNullable<LogosNode['status']>, string>> = {
  supported: 'Supported',
  resolved: 'Settled',
  revised: 'Revised',
};
const OPENING = new Set<LogosNode['type']>(['question', 'tension', 'unknown', 'conjecture']);

export function StructureView({
  map,
  width,
  height,
  guarded,
  onSelect,
  onAction,
  researchLocked,
  grounded,
}: {
  map: ThinkingMap;
  width: number;
  height: number;
  guarded?: boolean;
  onSelect?: (id: string) => void;
  onAction?: (mode: NodeMode, node: { id: string; label: string; type: LogosNode['type'] }) => void;
  researchLocked?: boolean;
  grounded?: Record<string, number>;
}) {
  const outline = useMemo(() => structureOutline(map), [map]);
  const [sel, setSel] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // a part that left the map is no longer selected
  useEffect(() => {
    if (sel && !map.nodes.some((n) => n.id === sel)) setSel(null);
  }, [map.nodes, sel]);

  function pick(id: string, scroll = false) {
    setSel(id);
    onSelect?.(id);
    if (scroll) {
      const el = root.current?.querySelector<HTMLElement>(`.lg-sv-row[data-id="${CSS.escape(id)}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus({ preventScroll: true });
    }
  }

  if (!outline.total) {
    return (
      <div className="lg-sv is-empty" style={{ width, height }}>
        <p className="lg-sv-empty">Nothing to lay out yet. Say what you are working through, and its structure appears here.</p>
      </div>
    );
  }

  const item = (it: StructItem, depth: number) => {
    const n = it.node;
    const hide = masked(guarded, n.type);
    const on = sel === n.id;
    const status = STATUS[n.status ?? 'open'] ?? (OPENING.has(n.type) ? 'Open' : null);
    return (
      <li key={n.id} className={`lg-sv-item${on ? ' is-sel' : ''}`}>
        <button
          type="button"
          className={`lg-sv-row t-${n.type}${n.flag ? ` is-${n.flag}` : ''}`}
          data-id={n.id}
          aria-pressed={on}
          onClick={() => pick(n.id)}
        >
          <span className="lg-sv-kind">
            <NodeGlyph type={n.type} />
            <span>{n.role ?? n.type}</span>
            {it.via && <em>{it.via}</em>}
          </span>
          <span className="lg-sv-label">{hide ? <TeX tex={'=\\ ?'} /> : n.tex ? <TeX tex={n.tex} /> : n.label}</span>
          {n.note && !hide && (
            <span className="lg-sv-note">
              <MathText>{n.note}</MathText>
            </span>
          )}
          <span className="lg-sv-meta">
            {status && <span className={`lg-sv-status s-${status.toLowerCase()}`}>{status}</span>}
            {n.flag === 'verified' && <span className="lg-sv-status s-checked">Checked</span>}
            {n.flag === 'error' && <span className="lg-sv-status s-error">Went wrong here</span>}
            {!!grounded?.[n.id] && <span>Grounded in {grounded[n.id]} {grounded[n.id] === 1 ? 'piece' : 'pieces'} of your material</span>}
            {!!n.merged?.length && <span>{n.merged.length} folded in</span>}
            {n.by && <span>Added by {n.by.name}</span>}
            {it.children.length > 0 && <span>{it.children.length} beneath</span>}
          </span>
        </button>
        {it.links.length > 0 && (
          <ul className="lg-sv-links">
            {it.links.map((l, i) => (
              <li key={`${l.other.id}-${l.relation}-${i}`} className={l.relation === 'conflicts' ? 'is-conflict' : undefined}>
                <span className="ph">{l.phrase}</span>
                <button type="button" onClick={() => pick(l.other.id, true)}>
                  {masked(guarded, l.other.type) ? '= ?' : l.other.label}
                </button>
                {l.op && <i>{l.op}</i>}
              </li>
            ))}
          </ul>
        )}
        {on && onAction && (
          <div className="lg-sv-acts" role="group" aria-label={`Work on ${n.label}`}>
            {NODE_MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={m === 'research' && researchLocked ? 'is-locked' : undefined}
                title={MODE_META[m].blurb}
                onClick={() => onAction(m, { id: n.id, label: n.label, type: n.type })}
              >
                {MODE_META[m].label}
              </button>
            ))}
          </div>
        )}
        {it.children.length > 0 && <ol className="lg-sv-list is-nested">{it.children.map((c) => item(c, depth + 1))}</ol>}
      </li>
    );
  };

  return (
    <div className="lg-sv" ref={root} style={{ width, height }} aria-label="The structure, in detail">
      <div className="lg-sv-doc">
        <p className="lg-sv-sum">{outline.summary}</p>
        {outline.sections.map((s) => (
          <section key={s.key} className={`lg-sv-sec k-${s.key}`}>
            <h3>{s.title}</h3>
            {s.blurb && <p className="lg-sv-blurb">{s.blurb}</p>}
            <ol className="lg-sv-list">{s.items.map((it) => item(it, 0))}</ol>
          </section>
        ))}
      </div>
    </div>
  );
}
