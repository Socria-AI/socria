'use client';
// components/logos5/L5Board.tsx — ONE BOARD. THE CHATBOX IS THE CHAT. (Logos 5.5, VIII · One view.)
//
// Built on the canvas (L5Canvas.tsx, lib/logos5/canvas.ts), on a wide screen
// the line of thinking's only view. The conversation runs down the middle;
// what each turn brought or made sits on the right, wired to its turn; the
// Logic Map is one card pinned on the left that lights the ideas of the turn
// being read. The turn being read is not on the board: it is open in full in
// the sheet above the chatbox, and the spine runs into it. There is no bar —
// no filters, no zoom group, no Back to chat: the tabs move the camera (each
// brings its part forward and the rest steps back; Logic Map opens all the
// ideas), and zoom is a tray in the corner. Nothing floats over the board; a
// card pressed opens large beside it (Split View), and the board fits itself
// to the room left.
//
// Its rules are read in lib/logos5/oneView.ts; this file draws them.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import type { CanvasTurn } from '@/lib/logos5/canvas';
import { BOARD_ZOOM, clampBoardZoom, fitZoom, forward, mapCardIdeas, partOfTone, pinnedLabel, type Camera } from '@/lib/logos5/oneView';
import type { CanvasCard } from './L5Canvas';
import './board.css';

/** A preview is something to look at here, not to use: nothing in it takes focus or a click. */
function Inert({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.setAttribute('inert', '');
  }, []);
  return (
    <div ref={ref} className="lob-inert" aria-hidden="true">
      {children}
    </div>
  );
}

export interface BoardIdea {
  id: string;
  type: string;
  /** what it is, as the card says it: "Question", "Step", "Concept" */
  kind: string;
  label: string;
}

export interface BoardMap {
  ideas: BoardIdea[];
  /** the ideas the turn being read put on the map */
  lit: ReadonlySet<string>;
  /** the turn being read, 0-based */
  at: number | null;
  /** the idea the chatbox is asking about */
  picked: string | null;
  /** an idea pressed: the chatbox asks about it */
  onIdea: (id: string) => void;
  /** the Logic Map, large beside the board, to edit */
  onOpen: () => void;
  /** what the map's drawing is of, when it holds one — "The water cycle" (Logos 5.5) */
  title?: string | null;
}

const BOARD_W = 320 + 112 + 440 + 112 + 320 + 64;

export function L5Board({
  turns,
  reading,
  cards,
  map,
  camera,
  dock,
  besideOpen,
  onRead,
}: {
  turns: CanvasTurn[];
  /** the turn open in the sheet above the chatbox (not drawn on the board); null when the sheet is folded */
  reading: number | null;
  /** what was brought and made, each beside the turn it came with */
  cards: CanvasCard[];
  map: BoardMap | null;
  camera: Camera;
  /** the sheet and the chatbox, docked at the foot of the spine */
  dock: ReactNode;
  /** something is open large beside the board: it fits itself to the room left */
  besideOpen: boolean;
  /** a turn pressed: read in full above the chatbox */
  onRead: (turn: number) => void;
}) {
  const [zoom, setZoom] = useState<number>(BOARD_ZOOM.start);
  const scrollRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const onBoard = (t: CanvasTurn) => t.index !== reading;
  const rows = useMemo(() => {
    const out: { turn: CanvasTurn | null; cards: CanvasCard[] }[] = turns.filter(onBoard).map((t) => ({ turn: t, cards: cards.filter((c) => c.turn === t.index) }));
    // what the turn in the sheet made, and what came with no turn in particular: at the foot, beside where the spine runs into the sheet
    const tail = cards.filter((c) => c.turn === null || c.turn === reading || c.turn >= turns.length);
    if (tail.length) out.push({ turn: null, cards: tail });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, cards, reading]);

  // THE LINES: the spine down the middle and into the sheet; from each turn to what it made, measured where the cards land
  const drawWires = useCallback(() => {
    const board = boardRef.current;
    const svg = svgRef.current;
    if (!board || !svg) return;
    const box = (el: Element | null) => {
      const h = el as HTMLElement | null;
      return h ? { l: h.offsetLeft + (h.offsetParent && h.offsetParent !== board ? (h.offsetParent as HTMLElement).offsetLeft : 0), t: h.offsetTop + (h.offsetParent && h.offsetParent !== board ? (h.offsetParent as HTMLElement).offsetTop : 0), w: h.offsetWidth, h: h.offsetHeight } : null;
    };
    const spineCell = board.querySelector<HTMLElement>('[data-spine]');
    const sc = box(spineCell);
    const x = sc ? sc.l + sc.w / 2 : board.scrollWidth / 2;
    const end = board.scrollHeight;
    let out = `<path class="lob-spine" d="M${x} 0 L${x} ${end}"/>`;
    for (const el of Array.from(board.querySelectorAll<HTMLElement>('[data-card-turn]'))) {
      const b = box(el);
      if (!b) continue;
      const t = board.querySelector(`[data-turn="${el.dataset.cardTurn}"]`);
      const a = box(t);
      const ax = a ? a.l + a.w : x;
      const ay = a ? a.t + Math.min(40, a.h / 2) : end - 8;
      const bx = b.l;
      const by = Math.min(Math.max(ay, b.t + 26), b.t + b.h - 26);
      const mx = (ax + bx) / 2;
      out += `<path class="lob-wire" d="M${ax} ${ay} C${mx} ${ay} ${mx} ${by} ${bx} ${by}"/><circle class="lob-knot" cx="${ax}" cy="${ay}" r="3"/><circle class="lob-end" cx="${bx}" cy="${by}" r="2.5"/>`;
    }
    svg.setAttribute('width', String(board.scrollWidth));
    svg.setAttribute('height', String(end));
    svg.innerHTML = out;
  }, []);
  useLayoutEffect(() => {
    drawWires();
  }, [drawWires, rows, zoom, map?.ideas.length, camera]);
  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => drawWires());
    ro.observe(board);
    for (const el of Array.from(board.querySelectorAll('.lob-cell, .lob-mapcol'))) ro.observe(el);
    return () => ro.disconnect();
  }, [drawWires, rows]);

  // the dock's height, kept as room at the foot of the board so the newest turn is never under the chatbox
  useEffect(() => {
    const d = dockRef.current;
    const root = rootRef.current;
    if (!d || !root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => root.style.setProperty('--lob-dock', `${Math.ceil(d.offsetHeight)}px`));
    ro.observe(d);
    return () => ro.disconnect();
  }, []);

  // THE CAMERA: the conversation is the foot of the board; Files and Artifacts the first of theirs; the Logic Map its top
  const firstRun = useRef(true);
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const behavior: ScrollBehavior = firstRun.current ? 'auto' : 'smooth';
    firstRun.current = false;
    if (camera === 'chat') return void sc.scrollTo?.({ top: sc.scrollHeight, behavior });
    if (camera === 'logic_map') return void sc.scrollTo?.({ top: 0, behavior });
    const el = boardRef.current?.querySelector<HTMLElement>(`[data-part="${camera === 'content' ? 'content' : 'artifacts'}"]`);
    if (el) el.scrollIntoView?.({ block: 'center', behavior });
  }, [camera]);
  // a new turn: the foot of the board, where it arrives
  const count = turns.length;
  useEffect(() => {
    if (camera !== 'chat') return;
    const sc = scrollRef.current;
    sc?.scrollTo?.({ top: sc.scrollHeight, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // FITTED: whole when the room allows, smaller when it does not; with something opened large beside it (Split View)
  // it fits itself to the room left. A zoom chosen by hand is kept until what is beside changes.
  const byHand = useRef(false);
  const fit = useCallback(() => {
    const room = scrollRef.current?.clientWidth ?? BOARD_W;
    const z = fitZoom(BOARD_W, room);
    setZoom(besideOpen ? Math.min(BOARD_ZOOM.beside, z) : z);
  }, [besideOpen]);
  useEffect(() => {
    byHand.current = false;
    fit();
  }, [fit]);
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!byHand.current) fit();
    });
    ro.observe(sc);
    return () => ro.disconnect();
  }, [fit]);
  const zoomBy = (f: (z: number) => number) => {
    byHand.current = true;
    setZoom((z) => clampBoardZoom(f(z)));
  };

  const onWheel = (e: ReactWheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomBy((z) => z - e.deltaY * 0.004);
  };

  const back = (part: Parameters<typeof forward>[1]) => (forward(camera, part) ? '' : ' is-back');
  const allIdeas = camera === 'logic_map';
  const ideas = map ? mapCardIdeas(map.ideas, map.lit, allIdeas) : null;

  const cardEl = (c: CanvasCard) => {
    const part = partOfTone(c.tone);
    const wired = c.turn !== null && c.turn < turns.length;
    const open = () => {
      if (c.onOpen) c.onOpen();
      else if (wired) onRead(c.turn!);
    };
    return (
      <div
        key={c.key}
        className={`lob-card is-${c.tone}${back(part)}`}
        data-part={part}
        {...(wired ? { 'data-card-turn': String(c.turn) } : {})}
        role="button"
        tabIndex={0}
        aria-label={`${c.kicker}: ${c.title}. ${c.onOpen ? 'Open it beside the board' : 'Read its turn'}`}
        onClick={open}
        onKeyDown={(e: ReactKeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        <div className="lob-card-k">
          <span className="l5-label">{c.kicker}</span>
          {wired && <span className="lob-n">Turn {c.turn! + 1}</span>}
        </div>
        {c.title && <div className="lob-card-t">{c.title}</div>}
        <div className="lob-card-p">
          <Inert>{c.preview}</Inert>
        </div>
        {c.note && <div className="lob-card-n">{c.note}</div>}
      </div>
    );
  };

  return (
    <div ref={rootRef} className={`lob cam-${camera}${besideOpen ? ' has-beside' : ''}`}>
      <div className="lob-scroll" ref={scrollRef} onWheel={onWheel}>
        <div className="lob-board" ref={boardRef} style={{ zoom, ['--lob-rows' as string]: String(rows.length + 1) }}>
          <svg className="lob-wires" ref={svgRef} aria-hidden="true" />
          {/* THE LOGIC MAP, pinned: one card that reads the turn in view */}
          <div className="lob-mapcol">
            {map && ideas && (
              <section className={`lob-map l5-holder${back('map')}${allIdeas ? ' is-all' : ''}`} aria-label="Logic Map">
                <div className="lob-map-h">
                  <button type="button" className="lob-map-k" onClick={map.onOpen} title="Open the Logic Map beside the board, to edit it">
                    <span className="lob-dot" aria-hidden="true" />
                    <span className="l5-label">
                      {map.title ? <>Logic Map · {map.title}</> : <>Logic Map · {map.ideas.length} {map.ideas.length === 1 ? 'idea' : 'ideas'}</>}
                    </span>
                  </button>
                  <span className="lob-n">{pinnedLabel(map.at, map.lit.size)}</span>
                </div>
                <div className="lob-ideas">
                  {ideas.shown.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`lob-idea${n.type === 'question' ? ' is-q' : ''}${map.lit.has(n.id) ? ' is-lit' : ''}${map.picked === n.id ? ' is-picked' : ''}`}
                      aria-pressed={map.picked === n.id}
                      onClick={() => map.onIdea(n.id)}
                      title={`Ask about “${n.label}”`}
                    >
                      <span className="l5-label">{n.kind}</span>
                      <span className="lob-idea-t">{n.label}</span>
                    </button>
                  ))}
                </div>
                {ideas.more > 0 && (
                  <button type="button" className="lob-more" onClick={map.onOpen}>
                    + {ideas.more} more {ideas.more === 1 ? 'idea' : 'ideas'}
                  </button>
                )}
              </section>
            )}
          </div>
          {rows.map((row, i) => (
            <div className="lob-row" key={row.turn?.key ?? `tail-${i}`} style={{ gridRow: i + 1 }}>
              <div className="lob-cell is-spine" {...(i === 0 ? { 'data-spine': '' } : {})}>
                {row.turn && (
                  <button
                    type="button"
                    className={`lob-turn${back('turns')}${row.turn.pending ? ' is-pending' : ''}`}
                    data-turn={row.turn.index}
                    onClick={() => onRead(row.turn!.index)}
                    aria-label={`Turn ${row.turn.index + 1}${row.turn.asked ? `: ${row.turn.asked}` : ''}. Read it above the chatbox`}
                  >
                    {row.turn.asked && <span className="lob-you">{row.turn.asked}</span>}
                    {(row.turn.said || row.turn.pending || row.turn.synthesis) && (
                      <>
                        {row.turn.asked && <span className="lob-rule" aria-hidden="true" />}
                        <span className="lob-soc">
                          <span className="lob-who">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/socria-mark.png" alt="" width={12} height={12} />
                            Socria
                          </span>
                          <span className="lob-n">Turn {row.turn.index + 1}</span>
                        </span>
                        <span className={`lob-said${row.turn.synthesis ? ' is-synth' : ''}`}>{row.turn.pending ? 'Replying…' : row.turn.said}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="lob-cell is-made">{row.cards.map(cardEl)}</div>
            </div>
          ))}
          {/* the spine runs on, under the sheet and into the chatbox */}
          <div className="lob-foot" style={{ gridRow: rows.length + 1 }} aria-hidden="true" />
        </div>
      </div>

      {/* zoom: a tray in the corner, not a bar */}
      <div className="lob-tray" role="group" aria-label="Zoom">
        <button type="button" className="l5-icon" onClick={() => zoomBy((z) => z - BOARD_ZOOM.step)} disabled={zoom <= BOARD_ZOOM.min} aria-label="Zoom out">
          −
        </button>
        <span className="lob-tray-n" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" className="l5-icon" onClick={() => zoomBy((z) => z + BOARD_ZOOM.step)} disabled={zoom >= BOARD_ZOOM.max} aria-label="Zoom in">
          +
        </button>
        <span className="lob-tray-rule" aria-hidden="true" />
        <button type="button" className="l5-icon" onClick={() => {
            byHand.current = false;
            fit();
          }} aria-label="Fit the board to the screen" title="Fit">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      </div>

      <div className="lob-dock" ref={dockRef}>
        {dock}
      </div>
    </div>
  );
}

// ── the reply, in full, above the chatbox ─────────────────────────────

const Chevron = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={up ? 'M7 14l5-5 5 5' : 'M7 10l5 5 5-5'} />
  </svg>
);

/**
 * THE CHATBOX IS THE CHAT: the turn being read — the newest unless another was pressed — open in full
 * above the chatbox, the spine running into it. ↑ and ↓ step through the turns; Fold lays it onto the
 * board as a turn. While the newest is still arriving, it follows the words.
 */
export function ReplySheet({
  label,
  onUp,
  onDown,
  onFold,
  follow,
  foot,
  children,
}: {
  /** "Turn 3 of 3" */
  label: string;
  onUp: (() => void) | null;
  onDown: (() => void) | null;
  onFold: () => void;
  /** the newest, still arriving: kept scrolled to its last words */
  follow: boolean;
  /** under the reply: the way to what its turn made */
  foot?: ReactNode;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    el.scrollTop = follow ? el.scrollHeight : 0;
  }, [label, follow]);
  useEffect(() => {
    const el = body.current;
    if (!follow || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      el.scrollTop = el.scrollHeight;
    });
    for (const c of Array.from(el.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [follow, children]);
  return (
    <section className="lob-sheet" aria-label={`Socria, ${label}`}>
      <div className="lob-sheet-h">
        <span className="lob-who">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/socria-mark.png" alt="" width={14} height={14} />
          Socria
        </span>
        <span className="lob-n">{label}</span>
        <span className="lob-sheet-acts">
          <button type="button" className="l5-icon" onClick={onUp ?? undefined} disabled={!onUp} aria-label="The turn before" title="The turn before">
            <Chevron up />
          </button>
          <button type="button" className="l5-icon" onClick={onDown ?? undefined} disabled={!onDown} aria-label="The turn after" title="The turn after">
            <Chevron />
          </button>
          <button type="button" className="l5-btn is-sm is-quiet lob-fold" onClick={onFold} title="Fold it onto the board as a turn">
            Fold <Chevron />
          </button>
        </span>
      </div>
      <div className="lob-sheet-b" ref={body}>
        {children}
      </div>
      {foot && <div className="lob-sheet-f">{foot}</div>}
    </section>
  );
}
