'use client';

// components/ux-v0/graphics/ConceptPanel.tsx — a concept as something to work with, not to accept or turn down.
//
// The Concept tab shows each creative decision of the artboard in words (its palette, type, composition, forms,
// ground, depth and mood), where it came from (as the concept was made, your call, or taken from another concept),
// a few ways to move it on its own, and — when it has changed — a way to put just that decision back. Below, the
// concepts kept: keep this one, explore from a copy, compare them side by side, go back to one, or take one decision
// from it. Anything else is said in words; every change is previewed first.

import { useMemo } from 'react';
import type { Artboard, GraphicDoc } from '@/lib/ux-v0/graphics/doc';
import type { GraphicDirection } from '@/lib/ux-v0/graphics/compose';
import type { Measure } from '@/lib/ux-v0/graphics/text';
import { renderArtboard } from '@/lib/ux-v0/graphics/render';
import { decisionViews, readDecisions, type DecisionKey, type DecisionView } from '@/lib/ux-v0/graphics/creative/decisions';
import { takeFrom } from '@/lib/ux-v0/graphics/creative/execute';
import type { CreativePlan } from '@/lib/ux-v0/graphics/creative/plan';
import { CHARACTER_LABEL } from '@/lib/ux-v0/graphics/creative/lexicon';

/** A few ways to move each decision on its own: the words they say, so the conversation shows them as said. */
const MOVES: Record<DecisionKey, readonly [string, string][]> = {
  palette: [
    ['Warmer', 'make the colours warmer'],
    ['Cooler', 'make the colours cooler'],
    ['Darker', 'make the colours darker'],
    ['Lighter', 'make the colours lighter'],
    ['Muted', 'make the colours more muted'],
    ['Vivid', 'make the colours more vivid'],
  ],
  type: [
    ['Editorial', 'make the typography more editorial'],
    ['Refined', 'make the typography more refined'],
    ['Expressive', 'make the typography more expressive'],
    ['Heavier', 'make the typography heavier'],
  ],
  composition: [
    ['Rethink it', 'completely rethink the composition'],
    ['More room', 'give the composition more space'],
    ['Asymmetric', 'make the composition asymmetric'],
    ['Unexpected', 'make the composition unexpected'],
  ],
  forms: [
    ['More abstract', 'make the forms more abstract'],
    ['More literal', 'make the forms more realistic'],
    ['Fewer', 'fewer forms'],
    ['Larger', 'make the forms larger'],
    ['Organic instead', 'replace the forms with organic forms'],
  ],
  background: [
    ['Graded', 'make the background a gradient'],
    ['Flat', 'make the background flat'],
    ['Textured', 'add texture to the background'],
    ['Darker', 'make the background darker'],
  ],
  depth: [
    ['More depth', 'add more depth'],
    ['Flatter', 'make it flatter'],
  ],
  mood: [
    ['Sophisticated', 'make it more sophisticated'],
    ['Expressive', 'make it more expressive'],
    ['Alive', 'make the design feel more alive'],
    ['Original', 'this feels too generic, try something more original'],
  ],
};

const SOURCE_WORDS: Record<DecisionView['source'], string> = { engine: 'as conceived', you: 'your call', concept: 'from a concept' };

export interface ConceptPanelProps {
  doc: GraphicDoc;
  board: Artboard;
  dir: GraphicDirection | null;
  /** a preview is waiting: moves wait until it is applied or discarded */
  waiting: boolean;
  onAsk: (words: string) => void;
  onPlan: (plan: CreativePlan, words: string) => void;
  onKeep: () => void;
  onDuplicate: () => void;
  onCompare: () => void;
  onRevisit: (id: string) => void;
  onForget: (id: string) => void;
  /** composition moves of the generative engine (kept from before: rethink, unexpected, four alternatives…) */
  extra?: React.ReactNode;
}

export function ConceptPanel(p: ConceptPanelProps) {
  const views = useMemo(() => decisionViews(p.doc, p.board.id, p.dir), [p.doc, p.board.id, p.dir]);
  const kept = p.doc.concepts ?? [];
  const revert = (v: DecisionView) => p.onPlan({ intent: 'global', summary: `the ${v.label.toLowerCase()} put back as it was`, keep: [], changes: [{ decision: 'revert', target: v.key }], by: 'reader' }, `put back the ${v.label.toLowerCase()}`);
  return (
    <section className="gx-panel gx-concept" aria-label="Concept">
      <p className="gx-panel-h">Concept</p>
      {p.board.concept && (
        <>
          <p className="gx-concept-idea">{p.board.concept.idea}</p>
          <p className="v0-quiet">{p.board.concept.artDirection}</p>
          <dl className="gx-concept-dl">
            {(Object.entries(p.board.concept.strategies) as [string, string][])
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
        </>
      )}
      <p className="v0-quiet gx-concept-lede">Every decision below can change on its own; the rest stays as it is. Or say anything in words — “keep the composition, make the type more editorial”.</p>
      <ol className="gx-decisions">
        {views.map((v) => (
          <li key={v.key} className="gx-decision">
            <div className="gx-decision-h">
              <b>{v.label}</b>
              <span className={`gx-src is-${v.source}`} title={v.said ? `You said: ${v.said}` : undefined}>
                {SOURCE_WORDS[v.source]}
              </span>
            </div>
            <p className="gx-decision-v">
              {v.swatches?.length ? (
                <span className="gx-decision-sw" aria-hidden="true">
                  {v.swatches.map((c, i) => (
                    <i key={`${c}-${i}`} style={{ background: c }} />
                  ))}
                </span>
              ) : null}
              {v.value}
            </p>
            <div className="gx-decision-acts">
              {MOVES[v.key].map(([label, words]) => (
                <button key={label} type="button" className="gx-move" disabled={p.waiting} onClick={() => p.onAsk(words)} title={`“${words}”`}>
                  {label}
                </button>
              ))}
              {v.revertible && (
                <button type="button" className="gx-move is-back" disabled={p.waiting} onClick={() => revert(v)} title="Only this decision goes back to what it was before its last change">
                  Put back
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="gx-panel-sub">Concepts</p>
      <div className="gx-concept-acts">
        <button type="button" className="sb-btn is-sm" onClick={p.onKeep}>
          Keep this concept
        </button>
        <button type="button" className="sb-btn is-sm" onClick={p.onDuplicate} title="A copy beside it to explore from; the original stays as it is">
          Explore a copy
        </button>
        <button type="button" className="sb-btn is-sm" onClick={p.onCompare} disabled={!kept.length && p.doc.artboards.length < 2}>
          Compare
        </button>
        <button type="button" className="sb-btn is-sm" disabled={p.waiting} onClick={() => p.onAsk('another interpretation of this concept')}>
          Another interpretation
        </button>
        <button type="button" className="sb-btn is-sm" disabled={p.waiting} onClick={() => p.onAsk('new concepts')}>
          New concepts
        </button>
      </div>
      {kept.length ? (
        <ol className="gx-kept" reversed>
          {[...kept].reverse().map((c) => (
            <li key={c.id}>
              <span>
                <b>{c.name}</b>
                <em className="v0-quiet">
                  {new Date(c.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {c.said ? ` · after “${c.said.slice(0, 48)}${c.said.length > 48 ? '…' : ''}”` : ''}
                </em>
              </span>
              <span className="gx-kept-acts">
                <button type="button" className="sb-link is-meta" onClick={() => p.onRevisit(c.id)}>
                  Go back to it
                </button>
                <button type="button" className="sb-link is-meta" disabled={p.waiting} onClick={() => p.onPlan(takeFrom(c.id, ['type'], `the typography of “${c.name}”`), `the typography of ${c.name}`)}>
                  Its type
                </button>
                <button type="button" className="sb-link is-meta" disabled={p.waiting} onClick={() => p.onPlan(takeFrom(c.id, ['palette'], `the colours of “${c.name}”`), `the colours of ${c.name}`)}>
                  Its colours
                </button>
                <button type="button" className="sb-link is-meta" disabled={p.waiting} onClick={() => p.onPlan(takeFrom(c.id, ['forms'], `the forms of “${c.name}”`), `the forms of ${c.name}`)}>
                  Its forms
                </button>
                <button type="button" className="sb-link is-meta" onClick={() => p.onForget(c.id)}>
                  Let go
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="v0-quiet">Nothing kept yet. Keep a concept to come back to it, compare it, or take its type, colours or forms into another.</p>
      )}
      {p.extra}
    </section>
  );
}

/** Concepts side by side: this artboard now, the kept ones and the other artboards, each with what it decided. */
export function ConceptCompare(p: { doc: GraphicDoc; board: Artboard; measure: Measure; href: (id: string, src: string) => string; waiting: boolean; onClose: () => void; onRevisit: (id: string) => void; onTake: (plan: CreativePlan, words: string) => void; onShow: (boardId: string) => void }) {
  const cards = useMemo(() => {
    const now = { id: p.board.id, name: 'This artboard, now', doc: p.doc, board: p.board, kind: 'now' as const };
    const kept = (p.doc.concepts ?? []).map((c) => ({ id: c.id, name: c.name, doc: { ...p.doc, tokens: c.tokens, artboards: [c.board] } as GraphicDoc, board: c.board, kind: 'kept' as const }));
    const others = p.doc.artboards.filter((b) => b.id !== p.board.id).map((b) => ({ id: b.id, name: b.name, doc: p.doc, board: b, kind: 'artboard' as const }));
    return [now, ...kept, ...others].slice(0, 9).map((c, i) => {
      const d = readDecisions(c.doc, c.board.id);
      const svg = renderArtboard(c.doc, c.board, { measure: p.measure, href: p.href, idPrefix: `cmp${i}-` }).replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, '<svg$1 width="100%" height="100%"');
      return { ...c, svg, ratio: c.board.width / c.board.height, d };
    });
  }, [p.doc, p.board, p.measure, p.href]);
  return (
    <div className="gx-compare" role="dialog" aria-label="Concepts side by side">
      <header className="gx-compare-h">
        <p className="gx-compare-t">Concepts side by side</p>
        <button type="button" className="sb-btn is-sm" onClick={p.onClose}>
          Close
        </button>
      </header>
      <ol className="gx-compare-grid">
        {cards.map((c) => (
          <li key={`${c.kind}-${c.id}`} className={`gx-compare-card is-${c.kind}`}>
            <div className="gx-compare-art" style={{ aspectRatio: String(c.ratio) }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: c.svg }} />
            <p className="gx-compare-name">{c.name}</p>
            <dl className="gx-compare-dl">
              <div>
                <dt>Colour</dt>
                <dd>
                  <span className="gx-decision-sw" aria-hidden="true">
                    {[c.d.palette.ground, c.d.palette.ink, c.d.palette.accent].map((x, i) => (
                      <i key={`${x}-${i}`} style={{ background: x }} />
                    ))}
                  </span>
                  {c.d.palette.mode === 'dark' ? 'dark ground' : 'light ground'}
                </dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>
                  {c.d.type.display} — {CHARACTER_LABEL[c.d.type.character]}
                </dd>
              </div>
              <div>
                <dt>Forms</dt>
                <dd>{c.d.forms.label}</dd>
              </div>
            </dl>
            {c.kind !== 'now' && (
              <p className="gx-compare-acts">
                {c.kind === 'kept' ? (
                  <button type="button" className="sb-link is-meta" onClick={() => p.onRevisit(c.id)}>
                    Go back to it
                  </button>
                ) : (
                  <button type="button" className="sb-link is-meta" onClick={() => p.onShow(c.id)}>
                    Show it
                  </button>
                )}
                <button type="button" className="sb-link is-meta" disabled={p.waiting} onClick={() => p.onTake(takeFrom(c.id, ['type'], `the typography of “${c.name}”`), `the typography of ${c.name}`)}>
                  Its type here
                </button>
                <button type="button" className="sb-link is-meta" disabled={p.waiting} onClick={() => p.onTake(takeFrom(c.id, ['palette'], `the colours of “${c.name}”`), `the colours of ${c.name}`)}>
                  Its colours here
                </button>
                <button type="button" className="sb-link is-meta" disabled={p.waiting} onClick={() => p.onTake(takeFrom(c.id, ['forms'], `the forms of “${c.name}”`), `the forms of ${c.name}`)}>
                  Its forms here
                </button>
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
