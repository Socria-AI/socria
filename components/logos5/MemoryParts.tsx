'use client';
// components/logos5/MemoryParts.tsx — the pieces of the Memory view
// (components/logos5/MemoryView.tsx): the marks for a memory's state, the
// legend, a memory's row in a list, the inspector, and a change with the
// person's say over it.
//
// Every state has a shape and a word, never a colour alone; every decision
// says, in plain words, what it will do before it is made.

import { useEffect, useState, type ReactNode } from 'react';
import {
  CHANGE_KIND,
  REGION,
  agoOf,
  dayOf,
  knownBy,
  relWord,
  stateWords,
  type ChangeIn,
  type EdgeIn,
  type Memory,
  type RegionId,
} from '@/lib/logos5/memoryAtlas';
import { whereFrom } from '@/lib/mind/types';

export type Decision = 'confirm' | 'reject' | 'forget' | 'supersede';

/** A conversation a memory was learned in, from the atlas. */
export interface PlaceIn {
  id: string;
  title: string;
  surface: 'core' | 'logos';
}

/** One step of a memory's history (lib/mind/evolve.ts EvolutionStep). */
export interface Step {
  at: number;
  kind: 'origin' | 'replaced' | 'replaced-by' | 'reworded' | 'tension' | 'corrected';
  label: string;
  text: string;
  other?: string;
  review?: string;
}

export const regionVar = (r: RegionId) => `var(--l5mm-${r})`;

// ── icons, drawn in one line weight ──
const ICON: Record<string, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  x: <path d="M7 7l10 10M17 7L7 17" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  pencil: <path d="M4 20l4.2-1 10.4-10.4a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20z" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />,
  ext: <path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5" />,
  chat: <path d="M5 18l-1 3 4-1.5c1.2.6 2.6 1 4 1 4.4 0 8-3.1 8-7s-3.6-7-8-7-8 3.1-8 7c0 1.4.4 2.6 1 3.5z" />,
  file: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
    </>
  ),
  hand: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L3.6 15a1.5 1.5 0 0 1 2.4-1.8L8 15" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  swap: <path d="M7 7h11l-3-3M17 17H6l3 3" />,
  reword: <path d="M4 19h4l10-10-4-4L4 15v4zM13 6l4 4" />,
  tension: (
    <>
      <path d="M12 4l9 15H3z" />
      <path d="M12 10v4M12 16.6v.4" />
    </>
  ),
  back: <path d="M15 18l-6-6 6-6" />,
  chevR: <path d="M9 6l6 6-6 6" />,
  chevD: <path d="M6 9l6 6 6-6" />,
  plus: <path d="M6 12h12M12 6v12" />,
  minus: <path d="M6 12h12" />,
  net: (
    <>
      <circle cx="6" cy="7" r="2.4" />
      <circle cx="17" cy="6" r="2" />
      <circle cx="12" cy="17" r="2.6" />
      <path d="M8.2 8.2l2.6 6.5M15.6 7.6l-2.6 7M8.3 6.7l6.7-.6" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r=".6" />
      <circle cx="4" cy="12" r=".6" />
      <circle cx="4" cy="18" r=".6" />
    </>
  ),
  full: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
};

export function Icon({ name, size = 16 }: { name: keyof typeof ICON | string; size?: number }) {
  return (
    <svg className="l5mm-ico" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {ICON[name]}
    </svg>
  );
}

// ── the marks: the same shapes the network draws ──

export type MarkKind = 'confirmed' | 'proposed' | 'recent' | 'warn' | 'older' | 'pin';

export function Mark({ kind, c = 'var(--l5mm-ink-mark)', size = 16 }: { kind: MarkKind; c?: string; size?: number }) {
  return (
    <svg className={`l5mm-mark is-${kind}`} viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" style={{ color: c }}>
      {kind === 'warn' ? (
        <>
          <path d="M8 1.8l6.6 11.6H1.4z" className="l5mm-mark-warn" />
          <path d="M8 6.2v3.4M8 11.3v.2" className="l5mm-mark-on" />
        </>
      ) : kind === 'pin' ? (
        <>
          <path d="M8 9.6v5" className="l5mm-mark-pinline" />
          <circle cx="8" cy="5.8" r="4" className="l5mm-mark-pin" />
        </>
      ) : (
        <g opacity={kind === 'older' ? 0.42 : 1}>
          {kind === 'recent' && <circle cx="8" cy="8" r="7.4" className="l5mm-mark-ring" />}
          <circle cx="8" cy="8" r={kind === 'recent' ? 4.2 : 5.6} className="l5mm-mark-body" strokeDasharray={kind === 'proposed' ? '2.6 2.1' : undefined} />
          <circle cx="8" cy="8" r={kind === 'recent' ? 1.8 : 2.6} className="l5mm-mark-core" opacity={kind === 'proposed' ? 0.4 : 0.6} />
        </g>
      )}
    </svg>
  );
}

/** The mark that stands for a memory in a list. */
export function markOf(m: Memory): MarkKind {
  if (m.state.warn) return 'warn';
  if (m.state.proposed) return 'proposed';
  if (m.state.recent) return 'recent';
  if (m.state.faded) return 'older';
  return 'confirmed';
}

const LEGEND: [MarkKind, string][] = [
  ['confirmed', 'Current'],
  ['proposed', 'Proposed'],
  ['recent', 'Updated this week'],
  ['warn', 'Possible contradiction'],
  ['older', 'Older'],
  ['pin', 'Important'],
];

/** What the marks mean: in full on the overview, folded to one control once a region is open. */
export function Legend({ folded }: { folded: boolean }) {
  const [open, setOpen] = useState(false);
  if (folded && !open)
    return (
      <button type="button" className="l5mm-legend-pill" onClick={() => setOpen(true)} aria-expanded={false}>
        {LEGEND.map(([k]) => (
          <Mark key={k} kind={k} size={13} />
        ))}
        <span>What the marks mean</span>
      </button>
    );
  return (
    <div className={`l5mm-legend${folded ? ' is-pop' : ''}`} role="group" aria-label="What the marks mean">
      {LEGEND.map(([k, w]) => (
        <span key={k}>
          <Mark kind={k} />
          {w}
        </span>
      ))}
      {folded && (
        <button type="button" className="l5mm-legend-x" onClick={() => setOpen(false)} aria-label="Fold the legend">
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

// ── a memory, as a row of a list: the list is the graph's other half ──

export function MemoryRow({ m, on, onPick, big }: { m: Memory; on: boolean; onPick: (id: string) => void; big?: boolean }) {
  return (
    <button type="button" className={`l5mm-row${on ? ' is-on' : ''}${m.state.faded ? ' is-faded' : ''}${big ? ' is-big' : ''}`} onClick={() => onPick(m.id)} aria-current={on || undefined}>
      <span className="l5mm-row-g">
        <Mark kind={markOf(m)} c={regionVar(m.region)} size={big ? 18 : 14} />
      </span>
      <span className="l5mm-row-t">
        {m.label}
        {big && <small>{`${m.type} · ${stateWords(m, Date.now()).join(' · ')}`}</small>}
        {!big && <span className="l5mm-sr">{` — ${stateWords(m, Date.now()).join(', ')}`}</span>}
      </span>
      {m.state.pinned && (
        <span className="l5mm-row-pin" aria-hidden="true">
          <Mark kind="pin" size={big ? 15 : 13} />
        </span>
      )}
    </button>
  );
}

// ── a change, and what each answer to it does ──

export interface Choice {
  decision: Decision;
  label: string;
  /** what it will do, said before it is done */
  does: string;
  tone: 'primary' | 'plain' | 'quiet';
}

/** The choices a change offers, each saying what it will do. Only what the store can do. */
export function choicesFor(c: ChangeIn): Choice[] {
  const older = c.from.label, newer = c.to.label;
  if (c.kind === 'superseded')
    return [
      { decision: 'confirm', label: 'Yes, I changed my mind', does: `“${newer}” stands; “${older}” stays in its history.`, tone: 'primary' },
      { decision: 'reject', label: 'Not a change', does: `Socria puts back “${older}” exactly as it was.`, tone: 'plain' },
      ...(c.canForget ? [{ decision: 'forget' as const, label: 'That’s not what I think', does: `“${newer}” is forgotten, and not learned again.`, tone: 'quiet' as const }] : []),
    ];
  if (c.kind === 'revised')
    return [
      { decision: 'confirm', label: 'Keep the new words', does: 'The new wording stands; the old one stays in its history.', tone: 'primary' },
      { decision: 'reject', label: 'Keep the earlier words', does: `Socria puts back “${c.was ?? c.from.content}”.`, tone: 'plain' },
    ];
  if (c.kind === 'possible-conflict')
    return [
      { decision: 'supersede', label: 'It changed — keep the newer', does: `“${older}” becomes an earlier position, kept as history.`, tone: 'primary' },
      { decision: 'reject', label: 'Both are true', does: 'Socria keeps both, and stops asking.', tone: 'plain' },
      ...(c.canForget ? [{ decision: 'forget' as const, label: 'Forget the newer one', does: `“${newer}” is removed, and not learned again.`, tone: 'quiet' as const }] : []),
    ];
  return [
    { decision: 'supersede', label: 'It changed — keep the newer', does: `“${older}” becomes an earlier position, kept as history.`, tone: 'primary' },
    { decision: 'confirm', label: 'Yes, they’re in tension', does: 'Both stand, marked as in tension with each other.', tone: 'plain' },
    { decision: 'reject', label: 'They don’t conflict', does: 'Both stand, and are no longer treated as in tension.', tone: 'quiet' },
  ];
}

const KIND_ICON: Record<ChangeIn['kind'], string> = { superseded: 'swap', revised: 'reword', conflict: 'tension', 'possible-conflict': 'tension' };

/** What a change reached — never its own two sides, which a tension reaches through itself. */
export const reachOf = (c: ChangeIn) => c.affected.filter((a) => a.id !== c.from.id && a.id !== c.to.id);

export function reviewWords(c: ChangeIn, now: number): string {
  if (c.review === 'proposed') return c.kind === 'possible-conflict' ? 'Waiting for you' : 'Proposed · waiting for you';
  if (c.legacy) return `Recorded ${dayOf(c.at, now)}`;
  if (c.review === 'rejected') return 'Turned down by you';
  return c.surface === 'user' ? 'Your change' : 'Confirmed by you';
}

const surfaceWord = (s?: string) => (s === 'logos' ? 'Logos' : s === 'core' ? 'A conversation' : s === 'file' ? 'A file' : s === 'user' ? 'You' : 'Socria');

/** One change: what it was, what it is, in whose words, and what it reached. */
export function ChangeCard({
  c,
  now,
  on,
  busy,
  onPick,
  onDecide,
  onShow,
  places,
  compact,
}: {
  c: ChangeIn;
  now: number;
  on?: boolean;
  busy?: boolean;
  onPick?: () => void;
  onDecide?: (id: string, d: Decision) => void;
  onShow?: (memoryId: string) => void;
  places?: ReadonlyMap<string, string>;
  compact?: boolean;
}) {
  const where = c.conversationId ? places?.get(c.conversationId) : undefined;
  const vs = c.kind === 'conflict' || c.kind === 'possible-conflict';
  const reached = reachOf(c);
  return (
    <article className={`l5mm-ch${on ? ' is-on' : ''}${c.review === 'proposed' ? ' is-proposed' : ''}${vs ? ' is-vs' : ''}`} onClick={onPick}>
      <div className="l5mm-ch-h">
        <span className="l5mm-kind">
          <Icon name={KIND_ICON[c.kind]} size={14} />
          {CHANGE_KIND[c.kind]}
        </span>
        <span className={`l5mm-rv${c.review === 'proposed' ? (vs ? ' is-warn' : ' is-prop') : ' is-ok'}`}>{reviewWords(c, now)}</span>
        <span className="l5mm-src">
          {where ? `${where} · ` : ''}
          {surfaceWord(c.surface)} · {dayOf(c.at, now)}
        </span>
      </div>
      <div className="l5mm-ft">
        <button type="button" className="l5mm-ft-m is-old" onClick={(e) => (e.stopPropagation(), onShow?.(c.from.id))}>
          <small>{c.kind === 'revised' ? `${c.from.type} · was` : vs ? `${c.from.type} · held first` : `${c.from.type} · was`}</small>
          {c.kind === 'revised' ? c.was ?? c.from.content : c.from.label}
        </button>
        <span className="l5mm-ft-ar" aria-hidden="true">
          {vs ? <em>vs</em> : <Icon name="chevR" size={15} />}
        </span>
        <button type="button" className="l5mm-ft-m" onClick={(e) => (e.stopPropagation(), onShow?.(c.to.id))}>
          <small>{c.kind === 'revised' ? `${c.to.type} · now` : vs ? `${c.to.type} · since` : `${c.to.type} · now`}</small>
          {c.kind === 'revised' ? c.to.content : c.to.label}
        </button>
      </div>
      {c.note && c.kind !== 'possible-conflict' && !/^changed from:/.test(c.note) && <p className="l5mm-note">“{c.note}”</p>}
      {!compact && reached.length > 0 && (
        <div className="l5mm-reach">
          {`Reached ${reached.length === 1 ? 'one memory' : `${reached.length} memories`}:`}
          {reached.slice(0, 5).map((a) => (
            <button key={a.id} type="button" className="l5mm-rchip" onClick={(e) => (e.stopPropagation(), onShow?.(a.id))}>
              {a.label}
            </button>
          ))}
          {reached.length > 5 && <span>and {reached.length - 5} more</span>}
        </div>
      )}
      {onDecide && c.review === 'proposed' && (
        <div className="l5mm-btns">
          {choicesFor(c).map((ch) => (
            <button
              key={ch.decision}
              type="button"
              className={`l5mm-btn is-${ch.tone}`}
              disabled={busy}
              title={ch.does}
              onClick={(e) => {
                e.stopPropagation();
                onDecide(c.id, ch.decision);
              }}
            >
              {ch.decision === 'confirm' && ch.tone === 'primary' && <Icon name="check" size={14} />}
              {ch.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

// ── the inspector: what it is, its state, why Socria keeps it, what it touches ──

export function Inspector({
  m,
  now,
  edges,
  byId,
  places,
  changes,
  history,
  busy,
  note,
  onClose,
  onSelect,
  onOpenPlace,
  onSave,
  onChallenge,
  onConfirm,
  onForget,
  onDecide,
  sheet,
}: {
  m: Memory;
  now: number;
  edges: readonly EdgeIn[];
  byId: ReadonlyMap<string, Memory>;
  places: readonly PlaceIn[];
  changes: readonly ChangeIn[];
  history: Step[] | null;
  busy: boolean;
  note: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onOpenPlace: (p: PlaceIn) => void;
  onSave: (label: string, content: string) => void;
  onChallenge: (why: string) => void;
  /** "Yes — that's right": held as theirs (PATCH confirm) — offered until they have */
  onConfirm?: () => void;
  onForget: () => void;
  onDecide: (id: string, d: Decision) => void;
  sheet?: boolean;
}) {
  const [mode, setMode] = useState<'see' | 'edit' | 'challenge' | 'forget'>('see');
  const [label, setLabel] = useState(m.label);
  const [content, setContent] = useState(m.content);
  const [why, setWhy] = useState('');
  // what was saved comes back from the store: the editor closes on it (a write
  // that failed changes nothing here, and leaves the editor open with the reason)
  useEffect(() => {
    setMode('see');
    setWhy('');
  }, [m.label, m.content, m.status, m.updatedAt]);
  const c = regionVar(m.region);
  const words = stateWords(m, now);
  const pending = changes.filter((x) => x.review === 'proposed' && (x.to.id === m.id || x.from.id === m.id));
  const links = edges
    .filter((e) => e.sourceId === m.id || e.targetId === m.id)
    .map((e) => ({ e, out: e.sourceId === m.id, other: byId.get(e.sourceId === m.id ? e.targetId : e.sourceId) }))
    .filter((x): x is { e: EdgeIn; out: boolean; other: Memory } => !!x.other);
  // why Socria keeps it: the conversations and files the record names, and their own hand
  const firstAt = new Map<string, number>();
  for (const p of m.provenance) if (p.conversationId && p.at && !firstAt.has(p.conversationId)) firstAt.set(p.conversationId, p.at);
  const files = [...new Set(m.provenance.map((p) => p.sourceNodeId).filter((x): x is string => !!x))].map((id) => byId.get(id)).filter((x): x is Memory => !!x);
  const yours = m.provenance.filter((p) => p.surface === 'user' && p.at);
  const markFor = (w: string): { kind: MarkKind; cls?: string } =>
    /contradiction|tension|isn’t right/.test(w)
      ? { kind: 'warn', cls: ' is-warn' }
      : /Proposed|lightly|reading/.test(w)
        ? { kind: 'proposed' }
        : /Updated/.test(w)
          ? { kind: 'recent' }
          : /earlier|Archived|Older/.test(w)
            ? { kind: 'older' }
            : /Important/.test(w)
              ? { kind: 'pin' }
              : { kind: 'confirmed' };
  const head = (
    <div className="l5mm-insp-top">
      <span className="l5mm-pill" style={{ ['--c' as string]: c }}>
        <span className="l5mm-dot" />
        {m.type} · {REGION[m.region].name}
      </span>
      <button type="button" className="l5mm-x" aria-label="Close" onClick={onClose}>
        <Icon name="x" />
      </button>
    </div>
  );
  return (
    <aside className={`l5mm-insp${sheet ? ' is-sheet' : ''}`} aria-label={`Memory: ${m.label}`} role={sheet ? 'dialog' : undefined}>
      {sheet && <div className="l5mm-grab" aria-hidden="true" />}
      <div className="l5mm-insp-body">
        {head}
        {mode === 'edit' ? (
          <div className="l5mm-edit">
            <label>
              <span className="l5mm-k">What it is called</span>
              <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label>
              <span className="l5mm-k">What Socria remembers</span>
              <textarea value={content} maxLength={400} rows={4} onChange={(e) => setContent(e.target.value)} />
            </label>
          </div>
        ) : (
          <div>
            <h2 className="l5mm-h2">{m.label}</h2>
            {m.content && <p className="l5mm-says">{m.content}</p>}
          </div>
        )}
        <div className="l5mm-states">
          {words.map((w) => {
            const k = markFor(w);
            return (
              <span key={w} className={`l5mm-st${k.cls ?? ''}`}>
                <Mark kind={k.kind} c={c} size={14} />
                {w}
              </span>
            );
          })}
        </div>
        {pending.map((p) => (
          <div key={p.id} className="l5mm-change">
            <div className="l5mm-change-h">
              <span>
                <b>Socria read a change</b> · {dayOf(p.at, now)}
              </span>
              <span className="l5mm-kind is-quiet">
                <Icon name={KIND_ICON[p.kind]} size={13} />
                {CHANGE_KIND[p.kind]}
              </span>
            </div>
            <div className="l5mm-wasnow">
              <span className="l5mm-lb">{p.kind === 'revised' || p.kind === 'superseded' ? 'Was' : 'First'}</span>
              <span className="l5mm-was">{p.kind === 'revised' ? p.was ?? p.from.content : p.from.label}</span>
              <span className="l5mm-lb">{p.kind === 'revised' || p.kind === 'superseded' ? 'Now' : 'Then'}</span>
              <span className="l5mm-now">{p.kind === 'revised' ? p.to.content : p.to.label}</span>
            </div>
            <div className="l5mm-btns is-wrap">
              {choicesFor(p).map((ch) => (
                <button key={ch.decision} type="button" className={`l5mm-btn is-${ch.tone}`} disabled={busy} title={ch.does} onClick={() => onDecide(p.id, ch.decision)}>
                  {ch.label}
                </button>
              ))}
            </div>
            <span className="l5mm-fine">Held lightly until you decide.</span>
          </div>
        ))}
        <section className="l5mm-sec">
          <span className="l5mm-k">Why Socria remembers this</span>
          <div className="l5mm-why">
            <div className="l5mm-why-row">
              <span className="l5mm-why-ic">
                <Icon name="hand" size={14} />
              </span>
              <span className="l5mm-why-t">
                {knownBy(m)}
                <small>{`${m.createdAt ? `First remembered ${dayOf(m.createdAt, now)}` : 'First remembered'}${m.seen > 1 ? ` · came up ${m.seen} times` : ''}`}</small>
              </span>
            </div>
            {places.slice(0, 4).map((p) => (
              <div key={p.id} className="l5mm-why-row">
                <span className="l5mm-why-ic">
                  <Icon name="chat" size={14} />
                </span>
                <span className="l5mm-why-t">
                  {`In “${p.title}”`}
                  <small>{`${p.surface === 'core' ? 'Chat' : 'Logos'}${firstAt.get(p.id) ? ` · ${dayOf(firstAt.get(p.id)!, now)}` : ''}`}</small>
                </span>
                <button type="button" className="l5mm-lnk" onClick={() => onOpenPlace(p)}>
                  Open <Icon name="ext" size={12} />
                </button>
              </div>
            ))}
            {files.map((s) => (
              <div key={s.id} className="l5mm-why-row">
                <span className="l5mm-why-ic">
                  <Icon name="file" size={14} />
                </span>
                <span className="l5mm-why-t">
                  {`From your file “${s.label}”`}
                  <small>A source you added</small>
                </span>
                <button type="button" className="l5mm-lnk" onClick={() => onSelect(s.id)}>
                  Show
                </button>
              </div>
            ))}
            {yours.slice(-2).map((p, i) => (
              <div key={`${p.at}-${i}`} className="l5mm-why-row">
                <span className="l5mm-why-ic">
                  <Icon name="pencil" size={14} />
                </span>
                <span className="l5mm-why-t">
                  {p.note && p.note !== 'edited by hand' ? `You said: “${p.note}”` : p.note ? 'You edited it' : 'You added it'}
                  <small>{dayOf(p.at ?? 0, now)}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
        {links.length > 0 && (
          <section className="l5mm-sec">
            <span className="l5mm-k">Connected to</span>
            <div className="l5mm-rel">
              {links.slice(0, 8).map(({ e, out, other }) => (
                <button key={e.id} type="button" className="l5mm-rel-row" onClick={() => onSelect(other.id)}>
                  <span className="l5mm-via">{relWord(e.relationship, out)}</span>
                  <span className="l5mm-to" style={{ ['--c' as string]: regionVar(other.region) }}>
                    <span className="l5mm-dot" />
                    {other.label}
                  </span>
                </button>
              ))}
              {links.length > 8 && <span className="l5mm-fine">and {links.length - 8} more</span>}
            </div>
          </section>
        )}
        <section className="l5mm-sec">
          <span className="l5mm-k">History</span>
          {history === null ? (
            <p className="l5mm-fine">Reading its history…</p>
          ) : (
            <ol className="l5mm-hist">
              {(history.length ? history : [{ at: m.createdAt, kind: 'origin', label: m.label, text: m.content } as Step]).map((s, i) => (
                <li key={i} className={s.review === 'proposed' ? 'is-proposed' : undefined}>
                  <span className="l5mm-hist-d">{dayOf(s.at, now)}</span>
                  <span className="l5mm-hist-rail" aria-hidden="true">
                    <i />
                  </span>
                  <span className="l5mm-hist-t">
                    {s.kind === 'origin' ? (s.label === m.label ? 'First remembered' : `Began as “${s.label}”`) : s.kind === 'reworded' ? 'Reworded' : s.kind === 'replaced' ? 'Changed position' : s.kind === 'tension' ? 'In tension' : s.kind === 'corrected' ? 'You corrected it' : 'Changed'}
                    {s.review === 'proposed' ? ' — waiting for you' : ''}
                    {s.kind !== 'origin' &&
                      (s.other ? (
                        <button type="button" className="l5mm-hist-o" onClick={() => onSelect(s.other!)}>
                          {s.text}
                        </button>
                      ) : (
                        <small>{s.text}</small>
                      ))}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        {note && (
          <p className="l5mm-say" role="status">
            {note}
          </p>
        )}
      </div>
      <div className="l5mm-insp-foot">
        {mode === 'edit' ? (
          <>
            <button type="button" className="l5mm-btn is-primary" disabled={busy || !label.trim()} onClick={() => onSave(label.trim(), content.trim())}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="l5mm-btn" onClick={() => setMode('see')}>
              Cancel
            </button>
          </>
        ) : mode === 'challenge' ? (
          <div className="l5mm-challenge">
            <textarea value={why} rows={2} maxLength={300} placeholder="What’s not right about it?" onChange={(e) => setWhy(e.target.value)} aria-label="What’s not right about it?" />
            <div className="l5mm-btns">
              <button type="button" className="l5mm-btn is-primary" disabled={busy || !why.trim()} onClick={() => onChallenge(why.trim())}>
                Tell Socria
              </button>
              <button type="button" className="l5mm-btn" onClick={() => setMode('see')}>
                Cancel
              </button>
            </div>
          </div>
        ) : mode === 'forget' ? (
          <>
            <span className="l5mm-sure">Forget it for good? Socria won’t learn it again.</span>
            <button type="button" className="l5mm-btn is-danger" disabled={busy} onClick={onForget}>
              {busy ? 'Forgetting…' : 'Forget'}
            </button>
            <button type="button" className="l5mm-btn" onClick={() => setMode('see')}>
              Keep it
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="l5mm-btn"
              onClick={() => {
                setLabel(m.label);
                setContent(m.content);
                setMode('edit');
              }}
            >
              <Icon name="pencil" size={14} />
              Edit
            </button>
            {onConfirm && whereFrom(m) !== 'confirmed' && (
              <button type="button" className="l5mm-btn is-primary" disabled={busy} onClick={onConfirm} title="Yes — this is right. Socria holds it as yours, and won’t reword it.">
                That’s right
              </button>
            )}
            <button type="button" className="l5mm-btn" onClick={() => setMode('challenge')}>
              This isn’t right
            </button>
            <span className="l5mm-sp" />
            <button type="button" className="l5mm-btn is-quiet is-danger" onClick={() => setMode('forget')}>
              <Icon name="trash" size={14} />
              Forget
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

export { agoOf };
