'use client';
// components/logos5/L5Canvas.tsx — THE LINE OF THINKING, ZOOMED OUT.
//
// The turns run down the middle as a spine; beside each one, what it made —
// the live elements of its reply, the notes, the practice — and the Logic Map
// beside the turns that drew it, joined by thin lines measured from where the
// cards actually land. Anything can be brought into focus: it opens large and
// live, the rest steps back, the turn that made it lights up, and the chatbox
// can be aimed at it. The chatbox stays docked throughout: what is said here
// is said to Socria, and the reply arrives as a new turn on the spine.
//
// What goes on the canvas is read in lib/logos5/canvas.ts; this file draws it.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import { ZOOM, clampZoom, inFilter, sidesFor, type CanvasFilter, type CanvasLane, type CanvasTurn } from '@/lib/logos5/canvas';
import './canvas.css';

export interface CanvasCard {
  key: string;
  lane: CanvasLane;
  tone: 'map' | 'artifact' | 'content' | 'practice';
  /** "Logic Map · 5 ideas", "Artifact · Live graph" */
  kicker: string;
  title: string;
  /** the turn that made it; null — beside no turn in particular */
  turn: number | null;
  /** drawn small on the canvas, not to be used there */
  preview: ReactNode;
  /** drawn large and live when it is in focus; the preview, live, when absent */
  full?: () => ReactNode;
  /** a line under it: "Kept as you left it" */
  note?: string;
  onAsk?: () => void;
  onOpen?: () => void;
}

const FILTERS: { id: CanvasFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'ideas', label: 'Ideas' },
  { id: 'made', label: 'Artifacts' },
  { id: 'chats', label: 'Conversations' },
];

const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** A preview is something to look at here, not to use: nothing in it takes focus or a click. */
function Inert({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.setAttribute('inert', '');
  }, []);
  return (
    <div ref={ref} className="lcv-inert" aria-hidden="true">
      {children}
    </div>
  );
}

export function L5Canvas({
  turns,
  cards,
  composer,
  narrow,
  onBack,
  onJump,
  onHome,
}: {
  turns: CanvasTurn[];
  cards: CanvasCard[];
  /** the chatbox, docked at the bottom */
  composer: ReactNode;
  narrow: boolean;
  onBack: () => void;
  /** back into the conversation, at this turn */
  onJump: (turn: CanvasTurn) => void;
  /** to the Universal Map — given when the header (which carries ‹ Universal Map) is hidden */
  onHome?: () => void;
}) {
  const [filter, setFilter] = useState<CanvasFilter>('all');
  const [zoom, setZoom] = useState<number>(ZOOM.start);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pinch = useRef(0);

  const shown = useMemo(() => cards.filter((c) => inFilter(c.lane, filter)), [cards, filter]);
  const focused = focusKey ? cards.find((c) => c.key === focusKey) ?? null : null;
  const side = useMemo(() => {
    const out: Record<string, 'l' | 'r'> = {};
    const groups = new Map<number | null, CanvasCard[]>();
    for (const c of shown) groups.set(c.turn, [...(groups.get(c.turn) ?? []), c]);
    for (const g of groups.values()) Object.assign(out, sidesFor(g));
    return out;
  }, [shown]);
  const rows = useMemo(() => {
    const r: { turn: CanvasTurn | null; left: CanvasCard[]; right: CanvasCard[] }[] = turns.map((t) => ({
      turn: t,
      left: shown.filter((c) => c.turn === t.index && side[c.key] === 'l'),
      right: shown.filter((c) => c.turn === t.index && side[c.key] === 'r'),
    }));
    const loose = shown.filter((c) => c.turn === null || c.turn >= turns.length);
    if (loose.length) r.push({ turn: null, left: loose.filter((c) => side[c.key] === 'l'), right: loose.filter((c) => side[c.key] !== 'l') });
    return r;
  }, [turns, shown, side]);

  // THE LINES: from each turn to what it made, measured where the cards actually are
  const drawWires = useCallback(() => {
    const board = boardRef.current;
    const svg = svgRef.current;
    if (!board || !svg) return;
    if (narrow) {
      svg.innerHTML = '';
      return;
    }
    const box = (el: Element | null) => {
      const h = el as HTMLElement | null;
      return h ? { l: h.offsetLeft, t: h.offsetTop, w: h.offsetWidth, h: h.offsetHeight } : null;
    };
    const turnEls = Array.from(board.querySelectorAll<HTMLElement>('[data-turn]'));
    let out = '';
    if (turnEls.length) {
      const first = box(turnEls[0])!;
      const last = box(turnEls[turnEls.length - 1])!;
      const x = first.l + first.w / 2;
      out += `<path class="lcv-spine" d="M${x} ${Math.max(0, first.t - 28)} L${x} ${last.t + last.h + 28}"/>`;
    }
    for (const el of Array.from(board.querySelectorAll<HTMLElement>('[data-card-turn]'))) {
      const t = board.querySelector(`[data-turn="${el.dataset.cardTurn}"]`);
      const a = box(t);
      const b = box(el);
      if (!a || !b) continue;
      const left = el.dataset.side === 'l';
      const ax = left ? a.l : a.l + a.w;
      const ay = a.t + Math.min(46, a.h / 2);
      const bx = left ? b.l + b.w : b.l;
      const by = Math.min(Math.max(ay, b.t + 26), b.t + b.h - 26);
      const mx = (ax + bx) / 2;
      out += `<path class="lcv-wire" d="M${ax} ${ay} C${mx} ${ay} ${mx} ${by} ${bx} ${by}"/><circle class="lcv-knot" cx="${ax}" cy="${ay}" r="3.5"/><circle class="lcv-end" cx="${bx}" cy="${by}" r="2.6"/>`;
    }
    svg.setAttribute('width', String(board.scrollWidth));
    svg.setAttribute('height', String(board.scrollHeight));
    svg.innerHTML = out;
  }, [narrow]);
  useLayoutEffect(() => {
    drawWires();
  }, [drawWires, rows, zoom, focusKey]);
  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => drawWires());
    ro.observe(board);
    for (const el of Array.from(board.children)) ro.observe(el);
    return () => ro.disconnect();
  }, [drawWires, rows]);

  // ESCAPE: out of focus first, then back to the conversation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (focusKey) {
        e.preventDefault();
        setFocusKey(null);
        return;
      }
      if (editable(e.target)) return;
      e.preventDefault();
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusKey, onBack]);

  // A PINCH (a trackpad's is a wheel with ctrl): closer or further; closer than the closest is the conversation
  const onWheel = (e: ReactWheelEvent) => {
    if (!e.ctrlKey || narrow) return;
    e.preventDefault();
    if (e.deltaY < 0 && zoom >= ZOOM.max) {
      pinch.current += -e.deltaY;
      if (pinch.current > 60) {
        pinch.current = 0;
        onBack();
      }
      return;
    }
    pinch.current = 0;
    setZoom((z) => clampZoom(z - e.deltaY * 0.004));
  };

  const cardEl = (c: CanvasCard, at: 'l' | 'r') => {
    const open = () => setFocusKey(c.key);
    return (
      <div
        key={c.key}
        className={`lcv-card is-${c.tone}${c.key === focusKey ? ' is-focus' : ''}`}
        data-side={at}
        {...(c.turn !== null && c.turn < turns.length ? { 'data-card-turn': String(c.turn) } : {})}
        role="button"
        tabIndex={0}
        aria-label={`${c.kicker}: ${c.title}. Open it here`}
        onClick={open}
        onKeyDown={(e: ReactKeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        <div className="lcv-kick">
          <span className="lcv-dot" aria-hidden="true" />
          <span className="lcv-kick-t">{c.kicker}</span>
          {c.turn !== null && c.turn < turns.length && <span className="lcv-kick-r">Turn {c.turn + 1}</span>}
        </div>
        {c.title && <div className="lcv-title">{c.title}</div>}
        <div className="lcv-prev">
          <Inert>{c.preview}</Inert>
        </div>
        {c.note && <div className="lcv-note">{c.note}</div>}
      </div>
    );
  };

  const origin = focused?.turn ?? null;
  return (
    <div className={`lcv${narrow ? ' is-narrow' : ''}${focused ? ' is-focusing' : ''}`}>
      <div className="lcv-bar" role="toolbar" aria-label="The whole line of thinking">
        {onHome && (
          <button type="button" className="lcv-home" onClick={onHome} aria-label="Universal Map">
            <span aria-hidden="true">‹</span> {narrow ? 'Map' : 'Universal Map'}
          </button>
        )}
        <div className="lcv-seg" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? 'is-on' : ''} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        {!narrow && (
          <div className="lcv-zoom" role="group" aria-label="Zoom">
            <button type="button" onClick={() => setZoom((z) => clampZoom(z - ZOOM.step))} disabled={zoom <= ZOOM.min} aria-label="Zoom out">
              −
            </button>
            <span className="lcv-zoom-n" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" onClick={() => setZoom((z) => clampZoom(z + ZOOM.step))} disabled={zoom >= ZOOM.max} aria-label="Zoom in">
              +
            </button>
          </div>
        )}
        {/* the way back is never the part a phone's width cuts off */}
        <button type="button" className="lcv-back" onClick={onBack} aria-label="Back to chat">
          {narrow ? (
            <>
              <span aria-hidden="true">‹</span> Chat
            </>
          ) : (
            <>
              Back to chat <span aria-hidden="true">↵</span>
            </>
          )}
        </button>
      </div>

      <div
        className="lcv-scroll"
        onWheel={onWheel}
        onClick={(e) => {
          if (focused && e.target === e.currentTarget) setFocusKey(null);
        }}
      >
        <div className="lcv-board" ref={boardRef} style={narrow ? undefined : { zoom }}>
          <svg className="lcv-wires" ref={svgRef} aria-hidden="true" />
          {turns.length === 0 && (
            <div className="lcv-empty">
              <p>Nothing here yet. Say what you are working through, and the conversation and what it makes will be laid out here.</p>
            </div>
          )}
          {rows.map((row, i) => (
            <div className="lcv-row" key={row.turn?.key ?? `loose-${i}`}>
              <div className="lcv-side is-l">{row.left.map((c) => cardEl(c, 'l'))}</div>
              {row.turn ? (
                <button
                  type="button"
                  className={`lcv-turn${row.turn.index === origin ? ' is-origin' : ''}${row.turn.pending ? ' is-pending' : ''}`}
                  data-turn={row.turn.index}
                  onClick={() => onJump(row.turn!)}
                  aria-label={`Turn ${row.turn.index + 1}${row.turn.asked ? `: ${row.turn.asked}` : ''}. Back to the conversation here`}
                >
                  {/* who said what: you, in your bubble on the right; Socria, by its mark, beneath */}
                  {row.turn.asked && (
                    <span className="lcv-you">
                      <span className="lcv-who is-you">You</span>
                      <span className="lcv-ask">{row.turn.asked}</span>
                    </span>
                  )}
                  {(row.turn.said || row.turn.pending || row.turn.synthesis) && (
                    <span className="lcv-soc">
                      <span className="lcv-who is-socria">
                        <span className="lcv-av" aria-hidden="true">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/socria-mark.png" alt="" width={12} height={12} />
                        </span>
                        Socria
                      </span>
                      {row.turn.synthesis ? (
                        <span className="lcv-said is-synth">{row.turn.said}</span>
                      ) : row.turn.pending ? (
                        <span className="lcv-said is-wait">Replying…</span>
                      ) : (
                        <span className="lcv-said">{row.turn.said}</span>
                      )}
                    </span>
                  )}
                </button>
              ) : (
                <div className="lcv-loose">Also in this line of thinking</div>
              )}
              <div className="lcv-side is-r">{row.right.map((c) => cardEl(c, 'r'))}</div>
            </div>
          ))}
        </div>
      </div>

      {focused && (
        <section className={`lcv-focus is-${focused.tone}`} aria-label={focused.title || focused.kicker}>
          <div className="lcv-focus-h">
            <span className="lcv-dot" aria-hidden="true" />
            <span className="lcv-kick-t">{focused.kicker}</span>
            {focused.turn !== null && focused.turn < turns.length && <span className="lcv-kick-r">Made in turn {focused.turn + 1}</span>}
            <button type="button" className="lcv-x" onClick={() => setFocusKey(null)} aria-label="Close">
              ×
            </button>
          </div>
          {focused.title && <h2 className="lcv-focus-t">{focused.title}</h2>}
          <div className="lcv-focus-b">{focused.full ? focused.full() : focused.preview}</div>
          <div className="lcv-focus-a">
            {focused.onAsk && (
              <button type="button" className="lcv-act is-primary" onClick={() => focused.onAsk?.()}>
                Ask about this
              </button>
            )}
            {focused.turn !== null && focused.turn < turns.length && (
              <button type="button" className="lcv-act" onClick={() => onJump(turns[focused.turn!])}>
                Jump to turn {focused.turn + 1}
              </button>
            )}
            {focused.onOpen && (
              <button type="button" className="lcv-act" onClick={() => focused.onOpen?.()}>
                Open full <span aria-hidden="true">↗</span>
              </button>
            )}
          </div>
        </section>
      )}

      <div className="lcv-dock">{composer}</div>
    </div>
  );
}

// ── the Logic Map, small ─────────────────────────────────────────────

export interface MapNodeLite {
  id: string;
  type: string;
  label: string;
  origin?: string;
}

/** The map's ideas as a small tree: the one most connected on top, what hangs from it beneath. */
export function MapPreview({ nodes, edges }: { nodes: MapNodeLite[]; edges: { from: string; to: string }[] }) {
  if (!nodes.length) return null;
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const root = nodes.find((n) => n.type === 'question') ?? [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0];
  const linked = new Set(edges.filter((e) => e.from === root.id || e.to === root.id).map((e) => (e.from === root.id ? e.to : e.from)));
  const rest = [...nodes.filter((n) => n.id !== root.id && linked.has(n.id)), ...nodes.filter((n) => n.id !== root.id && !linked.has(n.id))];
  const kids = rest.slice(0, 4);
  const more = nodes.length - 1 - kids.length;
  const kind = (n: MapNodeLite) => n.type.replace(/_/g, ' ');
  return (
    <div className="lcv-map">
      <div className={`lcv-node is-${root.type}`}>
        <span className="lcv-node-k">{kind(root)}</span>
        {root.label}
      </div>
      {kids.length > 0 && (
        <div className="lcv-kids">
          {kids.map((n) => (
            <div key={n.id} className={`lcv-node is-${n.type}`}>
              <span className="lcv-node-k">{kind(n)}</span>
              {n.label}
            </div>
          ))}
        </div>
      )}
      {more > 0 && <div className="lcv-more">+ {more} more {more === 1 ? 'idea' : 'ideas'}</div>}
    </div>
  );
}
