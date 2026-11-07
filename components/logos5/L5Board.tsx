'use client';
// components/logos5/L5Board.tsx — THE ONE VIEW, SET AS A PAGE. (Logos 5.5, Revision II · Screen 7.)
//
// On a wide screen, a line of thinking is one page in three columns divided by
// hairlines on paper: the Logic Map on the left, lighting the ideas of the turn
// being read; the conversation in the middle, every turn numbered in lowercase
// roman, the one being read open and the rest folded to two lines, with the
// chatbox — a ruled line — at its foot; and what was brought and made on the
// right, each cell marking the turn it came with. Nothing floats over the page
// and there is no bar: the header's tabs move focus (the part chosen stays,
// the rest dims), and a cell pressed opens large beside the page (Split View),
// which narrows the Logic Map and takes the right column's place.
//
// Its rules are read in lib/logos5/oneView.ts; this file draws them.

import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { CanvasTurn } from '@/lib/logos5/canvas';
import { forward, mapCardIdeas, partOfTone, readingLabel, roman, shelfOf, stepStates, type Camera } from '@/lib/logos5/oneView';
import type { CanvasCard } from './L5Canvas';
import './page.css';

/** A preview is something to look at here, not to use: nothing in it takes focus or a click. */
function Inert({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.setAttribute('inert', '');
  }, []);
  return (
    <div ref={ref} className="lp-inert" aria-hidden="true">
      {children}
    </div>
  );
}

export interface BoardIdea {
  id: string;
  type: string;
  role?: string | null;
  /** what it is, as the page says it: "Question", "Step", "Concept" */
  kind: string;
  label: string;
}

export interface BoardMap {
  ideas: BoardIdea[];
  /** the ideas the turn being read put on the map */
  lit: ReadonlySet<string>;
  /** the ideas a later turn put there: not come up yet, drawn dashed */
  ahead?: ReadonlySet<string>;
  /** the turn being read, 0-based */
  at: number | null;
  /** the idea the chatbox is asking about */
  picked: string | null;
  /** an idea pressed: the chatbox asks about it */
  onIdea: (id: string) => void;
  /** the Logic Map, large beside the page, to edit */
  onOpen: () => void;
  /** what the map's drawing is of, when it holds one — "The water cycle" */
  title?: string | null;
}

/** How many ideas the column shows before "+ n more" (all of them when the Logic Map has focus). */
const MAP_SHOWN = 12;

export function L5Board({
  turns,
  reading,
  cards,
  map,
  camera,
  open,
  composer,
  besideOpen,
  follow = false,
  onRead,
}: {
  turns: CanvasTurn[];
  /** the turn open on the page — the newest unless another was pressed */
  reading: number | null;
  /** what was brought and made, each marking the turn it came with */
  cards: CanvasCard[];
  map: BoardMap | null;
  /** the header's tab: which part has focus */
  camera: Camera;
  /** the open turn, drawn as the conversation draws it: you, the prose, Socria's question, the actions */
  open: ReactNode;
  /** the chatbox: a ruled line at the foot of the conversation */
  composer: ReactNode;
  /** something is open large beside the page: the Logic Map narrows and the right column gives way */
  besideOpen: boolean;
  /** the newest turn is still arriving: kept in view as it grows */
  follow?: boolean;
  /** a folded turn pressed: it opens and the rest fold */
  onRead: (turn: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLElement>(null);
  const count = turns.length;
  const newest = reading !== null && reading === count - 1;

  // THE TURN IN VIEW: the newest sits at the foot, by the chatbox; an earlier one opened is brought to the top
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    const el = openRef.current;
    if (!sc) return;
    if (newest || !el) sc.scrollTop = sc.scrollHeight;
    else sc.scrollTop = Math.max(0, el.offsetTop - 8);
  }, [reading, count, newest]);
  // while the newest is still being written, its last words stay in view
  useEffect(() => {
    const sc = scrollRef.current;
    const el = openRef.current;
    if (!follow || !sc || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      sc.scrollTop = sc.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [follow, reading]);

  const dim = (part: Parameters<typeof forward>[1]) => (forward(camera, part) ? '' : ' is-dim');

  // THE LOGIC MAP: the question, the givens side by side, the steps on a rail, then every other idea
  const shelves = useMemo(() => {
    if (!map) return null;
    const all = camera === 'logic_map';
    const { shown, more } = mapCardIdeas(map.ideas, map.lit, all, MAP_SHOWN);
    const keep = new Set(shown.map((n) => n.id));
    // shown in the map's own order, not the order they were chosen in
    const inOrder = map.ideas.filter((n) => keep.has(n.id));
    const question = inOrder.find((n) => shelfOf(n) === 'question') ?? null;
    const givens = inOrder.filter((n) => shelfOf(n) === 'given');
    const steps = inOrder.filter((n) => shelfOf(n) === 'step');
    const ideas = inOrder.filter((n) => n !== question && shelfOf(n) !== 'given' && shelfOf(n) !== 'step');
    const states = stepStates(steps, map.lit);
    return { question, givens, steps, ideas, states, more };
  }, [map, camera]);

  const node = (n: BoardIdea, extra = '') => {
    if (!map) return null;
    const lit = map.lit.has(n.id);
    const ahead = !lit && !!map.ahead?.has(n.id);
    return (
      <button
        key={n.id}
        type="button"
        className={`lp-node is-${shelfOf(n)}${lit ? ' is-lit' : ''}${ahead ? ' is-ahead' : ''}${map.picked === n.id ? ' is-picked' : ''}${extra}`}
        aria-pressed={map.picked === n.id}
        onClick={() => map.onIdea(n.id)}
        title={`Ask about “${n.label}”`}
      >
        <span className="lp-node-k">{n.kind}</span>
        <span className="lp-node-t">{n.label}</span>
      </button>
    );
  };

  const cellEl = (c: CanvasCard) => {
    const part = partOfTone(c.tone);
    const wired = c.turn !== null && c.turn < count;
    const now = wired && c.turn === reading;
    const press = () => {
      if (c.onOpen) c.onOpen();
      else if (wired) onRead(c.turn!);
    };
    return (
      <div
        key={c.key}
        className={`l5-cell lp-cell is-${c.tone}${now ? ' is-now' : ''}${dim(part)}`}
        data-part={part}
        role="button"
        tabIndex={0}
        aria-label={`${c.kicker}${c.title ? `: ${c.title}` : ''}. ${c.onOpen ? 'Open it beside the page' : 'Read its turn'}`}
        onClick={press}
        onKeyDown={(e: ReactKeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            press();
          }
        }}
      >
        <div className="lp-cell-k">
          <span className={`l5-label${now ? ' is-lit' : ''}`}>{c.kicker}</span>
          {wired && (
            <span className={`lp-cell-n${now ? ' is-now' : ''}`}>
              {now && <span className="lp-dot" aria-hidden="true" />}Turn {roman(c.turn! + 1)}
            </span>
          )}
        </div>
        {c.title && <div className="l5-cell-title">{c.title}</div>}
        {c.preview ? (
          <div className="lp-cell-p">
            <Inert>{c.preview}</Inert>
          </div>
        ) : null}
        {c.note && <div className="l5-cell-meta">{c.note}</div>}
        {c.onOpen && (
          <span className="l5-link is-go lp-cell-go" aria-hidden="true">
            Open beside <span className="l5-ar">→</span>
          </span>
        )}
      </div>
    );
  };

  const turnEl = (t: CanvasTurn) => {
    const n = `${roman(t.index + 1)}.`;
    if (t.index === reading) {
      return (
        <article key={t.key} ref={openRef} className="l5-turn is-open" data-turn={t.index} aria-label={`Turn ${roman(t.index + 1)}, open`}>
          <span className="l5-turn-n" aria-hidden="true">
            {n}
          </span>
          <div className="l5-turn-body">{open}</div>
        </article>
      );
    }
    const q = t.pending ? 'Replying…' : t.asks || t.said;
    return (
      <button
        key={t.key}
        type="button"
        className={`l5-turn is-folded${t.synthesis ? ' is-synth' : ''}`}
        data-turn={t.index}
        onClick={() => onRead(t.index)}
        aria-label={`Turn ${roman(t.index + 1)}${t.asked ? `: ${t.asked}` : ''}. Open it`}
      >
        <span className="l5-turn-n" aria-hidden="true">
          {n}
        </span>
        <span className="lp-fold">
          <span className="l5-turn-you1">{t.asked ? <>You · {t.asked}</> : t.synthesis ? 'Where the thinking stands' : 'Socria'}</span>
          {q && <span className="l5-turn-q1">{q}</span>}
        </span>
      </button>
    );
  };

  const ideaCount = map?.ideas.length ?? 0;
  const litNote = map && map.at !== null && map.lit.size > 0 ? `Turn ${roman(map.at + 1)} lit` : '';

  return (
    <div className={`lp cam-${camera}${besideOpen ? ' is-split' : ''}`}>
      {/* THE LOGIC MAP: one column that reads the turn in view */}
      <section className={`lp-col lp-map l5-dots${dim('map')}`} data-part="map" aria-label="Logic Map">
        <header className="lp-head">
          <button type="button" className="lp-head-k" onClick={map?.onOpen} disabled={!map} title="Open the Logic Map beside the page, to edit it">
            <span className="l5-label">{map?.title ? <>Logic Map · {map.title}</> : <>Logic Map · {ideaCount} {ideaCount === 1 ? 'idea' : 'ideas'}</>}</span>
          </button>
          {litNote && <span className="lp-meta">{litNote}</span>}
        </header>
        {map && shelves ? (
          <div className="lp-ideas">
            {shelves.question && node(shelves.question)}
            {shelves.givens.length > 0 && <div className="lp-givens">{shelves.givens.map((n) => node(n))}</div>}
            {shelves.steps.length > 0 && (
              <ol className="lp-steps" aria-label="Steps">
                {shelves.steps.map((n) => (
                  <li key={n.id} className={`lp-step is-${map.ahead?.has(n.id) && !map.lit.has(n.id) ? 'ahead' : shelves.states.get(n.id) ?? 'done'}`}>
                    <span className="lp-step-dot" aria-hidden="true" />
                    {node(n)}
                  </li>
                ))}
              </ol>
            )}
            {shelves.ideas.map((n) => node(n))}
            {shelves.more > 0 && (
              <button type="button" className="l5-link is-go lp-more" onClick={map.onOpen}>
                {shelves.more} more {shelves.more === 1 ? 'idea' : 'ideas'} <span className="l5-ar">→</span>
              </button>
            )}
          </div>
        ) : (
          <p className="lp-empty">Ideas you put into words land here as the conversation goes.</p>
        )}
        {map && <p className="lp-cap">Ideas from the turn you’re reading are lit. Dashed ones haven’t come up yet.</p>}
      </section>

      {/* THE CONVERSATION: numbered turns, the one being read open, the chatbox at the foot */}
      <section className={`lp-col lp-convo${dim('turns')}`} data-part="turns" aria-label="The conversation">
        <header className="lp-head">
          <span className="l5-label">
            The conversation · {count} {count === 1 ? 'turn' : 'turns'}
          </span>
          <span className="lp-meta">{readingLabel(reading, count)}</span>
        </header>
        <div className="lp-turns" ref={scrollRef}>
          <div className="lp-turns-in">{turns.map(turnEl)}</div>
        </div>
        <div className="lp-compose">{composer}</div>
      </section>

      {/* WHAT WAS BROUGHT AND MADE: cells between hairlines, each marking its turn */}
      {!besideOpen && (
        <section className="lp-col lp-made" data-part="made" aria-label="Brought and made">
          <header className="lp-head">
            <span className="l5-label">Brought and made · {cards.length}</span>
          </header>
          <div className="lp-cells">
            {cards.length ? cards.map(cellEl) : <p className="lp-empty">What you bring in, and what is made as you go — a file, a photo, a chart — sits here beside the turn it came with.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
