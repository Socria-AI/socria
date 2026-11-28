'use client';
// components/new-logos/represent/RepInspector.tsx — INSPECTING AN ITEM: the second of three levels.
//
// The canvas shows the least that is useful; selecting an item opens this beside it (a sheet from the bottom on a
// narrow screen): what it is and what it rests on, its reasoning, what bears on it (what supports it, what goes
// against it, what it would explain, the open questions that would tell it apart), its earlier wordings, its
// documents — and what can be done with it, all deterministic and reversible: reword it, weigh a possibility, answer
// an open question (which then revises the picture), make a connection's standing explicit, keep it in the
// workspace, point the next question at it, remove it. Focus (the third level) is the item alone, at full size.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BASIS_WORD,
  FROM_WORD,
  KIND_WORD,
  REL_STATUS_WORD,
  REL_WORD,
  STATUS_WORD,
  bearingOn,
  isModelKind,
  itemById,
  relationsOf,
  otherEnd,
  type HypothesisStatus,
  type RepItem,
  type RepRelation,
  type Representation,
} from '@/lib/new-logos/representation';
import type { RepOp } from '@/lib/new-logos/representation-ops';
import { SourceGlyph } from '../sources/Library';

const STATUS_ORDER: HypothesisStatus[] = ['open', 'stronger', 'weaker', 'ruled_out'];

function standing(it: RepItem): string {
  switch (it.kind) {
    case 'statement':
      return `${it.role === 'answer' ? 'Answer' : it.role === 'support' ? 'Support' : 'Statement'} · ${BASIS_WORD[it.basis]}`;
    case 'hypothesis':
      return `Possibility · ${STATUS_WORD[it.status]}`;
    case 'observation':
      return `Observation · ${FROM_WORD[it.from]}`;
    case 'metric':
      return `Measure · ${BASIS_WORD[it.basis]}`;
    case 'unknown':
      return it.answer ? 'Open question · answered' : 'Open question';
    default:
      return KIND_WORD[it.kind];
  }
}

/** The bottom of the screen the panel leaves free: the omnibox, and the line above it that says what changed. */
const BOTTOM_BAND = 150;

/** Where the panel goes: beside the item when there is room, else under or over it; a bottom sheet on a phone. */
function usePlacement(anchor: HTMLElement | null, width: number) {
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number; sheet: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    let raf = 0;
    let last = '';
    const tick = () => {
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const bar = document.querySelector('.nl-actbar')?.getBoundingClientRect();
      const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${vw},${vh},${bar ? `${Math.round(bar.left)},${Math.round(bar.top)},${Math.round(bar.right)},${Math.round(bar.bottom)}` : ''}`;
      if (key !== last) {
        last = key;
        if (vw < 640) setPos({ left: 0, top: 0, maxH: 0, sheet: true });
        else {
          const room = { right: vw - r.right, left: r.left };
          const right = room.right >= width + 20, leftSide = room.left >= width + 20;
          const left = right ? r.right + 12 : leftSide ? r.left - width - 12 : Math.max(8, Math.min(vw - width - 8, r.left));
          // never over the omnibox and the line above it, never past the bottom of the screen
          const floor = vh - BOTTOM_BAND;
          let top: number;
          let maxH: number;
          if (right || leftSide) {
            const want = Math.min(420, floor - 64);
            top = Math.max(64, Math.min(floor - want, r.top));
            maxH = floor - top;
          } else if (floor - (r.bottom + 12) >= 240) {
            top = r.bottom + 12;
            maxH = floor - top;
          } else {
            maxH = Math.max(160, r.top - 12 - 64);
            top = Math.max(64, r.top - 12 - Math.min(maxH, 640));
          }
          // never over the action bar for the same selection: below it
          if (bar && bar.width && left < bar.right && left + width > bar.left && top < bar.bottom + 8 && top + maxH > bar.top) {
            top = Math.round(bar.bottom + 8);
            maxH = floor - top;
          }
          setPos({ left, top, maxH: Math.max(160, Math.min(640, maxH)), sheet: false });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [anchor, width]);
  return pos;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="nl-ri-sec">
      <h3 className="nl-ri-h">{title}</h3>
      {children}
    </section>
  );
}

export function RepInspector({
  item,
  rep,
  anchor,
  busy,
  onClose,
  change,
  onSelect,
  onAskAbout,
  onAnswer,
  onKeep,
  onFocus,
  onSource,
  sourceName,
  backlinks,
  openBacklinks,
  onNavigate,
}: {
  item: RepItem;
  rep: Representation;
  anchor: HTMLElement | null;
  busy: boolean;
  onClose: () => void;
  change: (ops: RepOp[], summary?: string) => void;
  onSelect: (id: string) => void;
  onAskAbout: (it: RepItem) => void;
  onAnswer: (it: RepItem, answer: string) => void;
  onKeep: (it: RepItem, as: 'knowledge' | 'question' | 'decision') => void;
  onFocus: (it: RepItem) => void;
  onSource: (sourceId: string, passage?: string) => void;
  sourceName: (id: string) => string | null;
  /** what points at it: connections, what the model computes from it, where it is kept, what relies on it */
  backlinks?: { label: string; ref?: string; href?: string }[];
  /** opened to show where it is used (asked for in words, or from the action bar) */
  openBacklinks?: boolean;
  onNavigate?: (href: string) => void;
}) {
  const W = 340;
  const pos = usePlacement(anchor, W);
  const [host, setHost] = useState<Element | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [answer, setAnswer] = useState('');
  const [keepOpen, setKeepOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setHost(document.querySelector('.nl-root') ?? document.body), []);
  useEffect(() => {
    setEditing(false);
    setDraft(item.text);
    setAnswer('');
    setKeepOpen(false);
  }, [item.id, item.text]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) return setEditing(false);
      onClose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, editing]);
  if (!host || !pos) return null;

  const b = bearingOn(rep, item.id);
  const rels = relationsOf(rep, item.id);
  const name = (id: string) => itemById(rep, id)?.text || KIND_WORD[itemById(rep, id)?.kind ?? 'statement'];
  const link = (other: RepItem) => (
    <button key={other.id} type="button" className="nl-linkish nl-ri-link" onClick={() => onSelect(other.id)}>
      {other.text || KIND_WORD[other.kind]}
    </button>
  );
  const saveText = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== item.text) change([{ op: 'update', id: item.id, set: { text: t } }], `You reworded ‘${item.text.slice(0, 40)}’.`);
  };
  const toggleStanding = (r: RepRelation) => change([{ op: 'relate', from: r.from, to: r.to, kind: r.kind, status: r.status === 'established' ? 'unverified' : 'established', ...(r.label ? { label: r.label } : {}) }]);
  const keepAs: { as: 'knowledge' | 'question' | 'decision'; label: string }[] = [
    { as: 'knowledge', label: item.kind === 'hypothesis' ? 'As knowledge (a possibility)' : 'As knowledge' },
    { as: 'question', label: 'As a question' },
    { as: 'decision', label: 'As a decision' },
  ];

  const panel = (
    <div
      ref={ref}
      className={`nl-ri nl-cv-ui${pos.sheet ? ' is-sheet' : ''}`}
      role="dialog"
      aria-label={`${KIND_WORD[item.kind]}: ${item.text}`}
      style={pos.sheet ? undefined : { left: pos.left, top: pos.top, width: W, maxHeight: pos.maxH }}
    >
      <div className="nl-ri-head">
        <span className="nl-ri-kind">{standing(item)}</span>
        <span className="nl-grow" />
        <button type="button" className="nl-icon-btn is-quiet" aria-label="Focus on it" title="Focus: the item alone, at full size" onClick={() => onFocus(item)}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
          </svg>
        </button>
        <button type="button" className="nl-icon-btn is-quiet" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="nl-ri-body nl-cv-scroll">
        {editing ? (
          <textarea
            className="nl-textarea"
            autoFocus
            rows={3}
            aria-label="Its words"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveText}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                saveText();
              }
            }}
          />
        ) : (
          <p className="nl-ri-text">
            {item.text || KIND_WORD[item.kind]}
            {item.kind !== 'timeline' && item.kind !== 'sequence' ? (
              <button type="button" className="nl-ri-edit" aria-label="Reword it" title={item.by === 'ai' ? 'Reword it (it becomes yours to say)' : 'Reword it'} onClick={() => setEditing(true)}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                  <path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z" />
                </svg>
              </button>
            ) : null}
          </p>
        )}
        {item.detail ? <p className="nl-ri-detail">{item.detail}</p> : null}

        {item.kind === 'hypothesis' ? (
          <Section title="How it stands">
            <div className="nl-seg is-small" role="group" aria-label="How it stands">
              {STATUS_ORDER.map((s) => (
                <button key={s} type="button" aria-pressed={item.status === s} onClick={() => item.status !== s && change([{ op: 'status', id: item.id, status: s }], `You marked ‘${item.text.slice(0, 40)}’ ${STATUS_WORD[s].toLowerCase()}.`)}>
                  {STATUS_WORD[s]}
                </button>
              ))}
            </div>
            {item.because ? <p className="nl-hint">Because {item.because.charAt(0).toLowerCase()}{item.because.slice(1)}</p> : null}
            <p className="nl-hint">A possibility, not established. Its standing is said in words, never as a number.</p>
          </Section>
        ) : null}

        {item.kind === 'unknown' ? (
          <Section title={item.answer ? 'Answered' : 'Answer it'}>
            {item.answer ? <p className="nl-ri-answer">{item.answer}</p> : null}
            <form
              className="nl-ri-answerForm"
              onSubmit={(e) => {
                e.preventDefault();
                const a = answer.trim();
                if (a && !busy) onAnswer(item, a);
              }}
            >
              <textarea className="nl-textarea" rows={2} placeholder={item.answer ? 'Answer differently' : 'What you know about this'} aria-label="Your answer" value={answer} onChange={(e) => setAnswer(e.target.value)} />
              <button type="submit" className="nl-btn is-primary is-small" disabled={!answer.trim() || busy}>
                Answer
              </button>
            </form>
            <p className="nl-hint">Your answer is added as something you said, and the possibilities it bears on are weighed again.</p>
          </Section>
        ) : null}

        {b.supports.length ? <Section title="Supports it">{b.supports.map(link)}</Section> : null}
        {b.against.length ? <Section title="Goes against it">{b.against.map(link)}</Section> : null}
        {b.explains.length ? <Section title="Would explain">{b.explains.map(link)}</Section> : null}
        {b.open.length ? <Section title="Would tell it apart">{b.open.map(link)}</Section> : null}

        {rels.length ? (
          <Section title="Connections">
            <ul className="nl-ri-rels">
              {rels.map((r) => {
                const out = r.from === item.id;
                return (
                  <li key={r.id}>
                    <span className="nl-ri-rel">
                      {out ? 'It ' : ''}
                      {out ? r.label || REL_WORD[r.kind] : ''}
                      {out ? ' ' : ''}
                      <button type="button" className="nl-linkish" onClick={() => onSelect(otherEnd(r, item.id))}>
                        {name(otherEnd(r, item.id))}
                      </button>
                      {out ? '' : ` ${r.label || REL_WORD[r.kind]} it`}
                    </span>
                    <button
                      type="button"
                      className={`nl-ri-standing is-${r.status}`}
                      title="Whether this connection is established. Press to change."
                      aria-label={`${REL_STATUS_WORD[r.status]}. Press to mark it ${r.status === 'established' ? 'not established' : 'established'}`}
                      onClick={() => toggleStanding(r)}
                    >
                      {REL_STATUS_WORD[r.status]}
                    </button>
                    <button type="button" className="nl-icon-btn is-quiet" aria-label="Remove this connection" title="Remove this connection" onClick={() => change([{ op: 'unrelate', from: r.from, to: r.to, kind: r.kind }])}>
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        {backlinks?.length ? (
          <section className={`nl-ri-sec${openBacklinks ? ' is-asked' : ''}`} ref={(el) => (openBacklinks && el ? el.scrollIntoView({ block: 'nearest' }) : undefined)}>
            <h3 className="nl-ri-h">Where it is used</h3>
            <ul className="nl-ri-rels">
              {backlinks.map((b, k) => (
                <li key={k}>
                  {b.ref ? (
                    <button type="button" className="nl-linkish" onClick={() => onSelect(b.ref!.slice(2))}>
                      {b.label}
                    </button>
                  ) : b.href ? (
                    <button type="button" className="nl-linkish" onClick={() => onNavigate?.(b.href!)}>
                      {b.label}
                    </button>
                  ) : (
                    <span>{b.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : openBacklinks ? (
          <Section title="Where it is used">
            <p className="nl-hint">Nothing refers to it, depends on it, or was made from it yet.</p>
          </Section>
        ) : null}
        {item.was?.length ? (
          <Section title="Earlier">
            <ul className="nl-ri-was">
              {[...item.was].reverse().map((w, k) => (
                <li key={k}>
                  {w.text}
                  <span className="nl-hint"> · {w.by === 'person' ? 'yours' : 'the assistant’s'}</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {item.cites?.length ? (
          <Section title="From">
            {item.cites.map((c, k) => (
              <button key={k} type="button" className="nl-r-doc" onClick={() => onSource(c.sourceId, c.passage)}>
                <SourceGlyph kind="document" size={12} />
                <span>{sourceName(c.sourceId) ?? 'A source no longer in the library'}</span>
                {c.passage ? <span className="nl-r-page">{c.passage}</span> : null}
              </button>
            ))}
          </Section>
        ) : null}
        <p className="nl-hint nl-ri-who">{item.by === 'person' ? 'Yours.' : 'Put here by the assistant.'}</p>
      </div>
      <div className="nl-ri-foot">
        <button type="button" className="nl-btn is-small" onClick={() => onAskAbout(item)} disabled={busy}>
          Ask about this
        </button>
        {!isModelKind(item.kind) ? (
          <div className="nl-ri-keep">
            <button type="button" className="nl-btn is-quiet is-small" aria-expanded={keepOpen} onClick={() => setKeepOpen((o) => !o)}>
              {item.kept ? 'Kept' : 'Keep…'}
            </button>
            {keepOpen ? (
              <div className="nl-menu-pop" role="menu">
                {keepAs.map((k) => (
                  <button key={k.as} type="button" role="menuitem" onClick={() => (setKeepOpen(false), onKeep(item, k.as))}>
                    {k.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <span className="nl-grow" />
        <button type="button" className="nl-btn is-quiet is-small" onClick={() => change([{ op: 'remove', id: item.id }], `You removed ‘${(item.text || KIND_WORD[item.kind]).slice(0, 40)}’.`)}>
          Remove
        </button>
      </div>
    </div>
  );
  return createPortal(panel, host);
}
