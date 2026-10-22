'use client';
// components/logos5/UniverseTime.tsx — the Universal Map in order: This month and All time.
//
// Laid out by lib/logos5/timeline.ts: the oldest conversation furthest left,
// the newest furthest right, each where it began; a subject's conversations
// that followed on within a week joined on one line; the quick ones along the
// floor. It opens at the newest end — today — and is scrolled back to find
// something: by trackpad or finger, the wheel, the arrow keys, dragging the
// empty line, "Earlier", or the whole history at the foot, whose window can
// be dragged. A ↩ before a thread goes back to where its subject was before.
// A search lights what it found and brings the newest of it into view.
// Pressing a conversation opens its card; pressing it again opens it. It
// comes in from today backwards: the newest rise first, and each thread is
// drawn out along its line.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { timeLayout, TIME_NARROW, TIME_WIDE, type TimeBead } from '@/lib/logos5/timeline';
import type { Homes } from '@/lib/logos5/spatial';
import type { Match, Tile } from '@/lib/logos5/universe';
import { colorVar, kindLine, shortDate, tileSaid } from './UniverseParts';

const css = (vars: Record<string, string | number>): CSSProperties => vars as unknown as CSSProperties;
/** before paint in a browser; nothing on the server, where there is nothing to scroll */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface TimeActs {
  /** a conversation pressed: its card, beside where it is on screen */
  onPreview: (id: string | null, at: DOMRect | null) => void;
  onOpen: (id: string) => void;
  onSelect: (ids: string[]) => void;
}

export function TimeView({
  tiles,
  tileById,
  homes,
  now,
  from = null,
  narrow = false,
  activeId,
  selected,
  starred,
  matchOf,
  focus,
  endKey = 0,
  top,
  bottom = 0,
  acts,
}: {
  /** the conversations shown: hidden and filtered ones already left out */
  tiles: readonly Tile[];
  tileById: Map<string, Tile>;
  homes: Homes;
  now: number;
  /** where the line begins (This month: the first); null for the first conversation */
  from?: number | null;
  narrow?: boolean;
  activeId: string | null;
  selected: readonly string[];
  starred: ReadonlySet<string>;
  /** with a search: what each conversation matched, or null for nothing */
  matchOf: ((id: string) => Match | null) | null;
  /** go to this one — a ↩ pressed on the map, "Find it in time" — once per `n` */
  focus?: { id: string; n: number } | null;
  /** changes when the line should go back to today */
  endKey?: number;
  /** how much of the top the page's own words cover, and of the foot the box that finds or starts */
  top: number;
  bottom?: number;
  acts: TimeActs;
}) {
  const L = useMemo(() => timeLayout({ tiles, homes, now, from, narrow }), [tiles, homes, now, from, narrow]);
  const S = narrow ? TIME_NARROW : TIME_WIDE;
  const scroller = useRef<HTMLDivElement>(null);
  const actsRef = useRef(acts);
  actsRef.current = acts;
  const [view, setView] = useState({ left: 0, top: 0, w: 0, h: 0 });
  const raf = useRef(0);
  /** where the line was when a card was opened: moved well away from it, the card closes */
  const cardAt = useRef<number | null>(null);
  const read = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setView({ left: el.scrollLeft, top: el.scrollTop, w: el.clientWidth, h: el.clientHeight });
    if (cardAt.current !== null && Math.abs(el.scrollLeft - cardAt.current) > 40) {
      cardAt.current = null;
      actsRef.current.onPreview(null, null);
    }
  }, []);
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(read);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => read());
    ro.observe(el);
    return () => ro.disconnect();
  }, [read]);

  // it opens at today — and goes back there when the stretch changes or the lens is pressed again
  const toEnd = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  useBeforePaint(() => {
    toEnd();
    read();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, endKey]);

  // going to one: brought to the middle, and lit for a moment
  const [flash, setFlash] = useState<string | null>(null);
  const goTo = useCallback(
    (id: string, smooth = true) => {
      const el = scroller.current;
      const b = L.byId.get(id);
      if (!el || !b) return;
      el.scrollTo({ left: Math.max(0, b.x - el.clientWidth / 2), top: Math.max(0, b.y - el.clientHeight / 2), behavior: smooth ? 'smooth' : 'auto' });
      setFlash(id);
    },
    [L]
  );
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
  }, [flash]);
  useEffect(() => {
    if (focus) goTo(focus.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  // a search: the newest of what it found, brought into view when it is not
  const found = useMemo(() => (matchOf ? L.beads.filter((b) => matchOf(b.id)) : []), [matchOf, L]);
  const foundKey = found.map((b) => b.id).join(',');
  useEffect(() => {
    const el = scroller.current;
    if (!el || !found.length) return;
    const newest = [...found].sort((a, b) => b.x - a.x)[0];
    if (newest.x < el.scrollLeft + 40 || newest.x > el.scrollLeft + el.clientWidth - 40) goTo(newest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundKey]);

  // a wheel turned up and down goes back and forth, unless there is more to see up and down
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      if (el.scrollHeight > el.clientHeight + 4 && !e.shiftKey) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  // the empty line, dragged with a mouse, moves it; pressed, lets go of what was chosen
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.pointerType !== 'mouse' || e.button !== 0 || t.closest('[data-bead], button')) return;
    const el = scroller.current!;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const el = scroller.current!;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    el.scrollLeft = d.left - (e.clientX - d.x);
    el.scrollTop = d.top - (e.clientY - d.y);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    scroller.current?.releasePointerCapture?.(e.pointerId);
    if (d && !d.moved) {
      acts.onPreview(null, null);
      acts.onSelect([]);
    }
  };

  // pressed: its card; pressed again while its card is open, or twice, it opens
  const pressed = useRef<{ id: string; t: number } | null>(null);
  const press = (id: string, el: HTMLElement) => {
    const at = Date.now();
    if (pressed.current?.id === id && at - pressed.current.t < 4000) {
      pressed.current = null;
      acts.onOpen(id);
      return;
    }
    pressed.current = { id, t: at };
    acts.onSelect([id]);
    cardAt.current = scroller.current?.scrollLeft ?? null;
    acts.onPreview(id, (el.querySelector('.l5t-star') ?? el).getBoundingClientRect());
  };

  const sel = useMemo(() => new Set(selected), [selected]);
  const colorOf = (id: string) => colorVar(homes.of.get(id)?.color ?? null);
  const edge = narrow ? 70 : 56;
  const seen = (x: number, pad = 0) => x >= view.left - pad && x <= view.left + view.w + pad;
  const earlier = L.beads.filter((b) => b.x < view.left + 30).length;
  const later = L.beads.filter((b) => b.x > view.left + view.w - 30).length;
  const atEnd = view.w > 0 && view.left + view.w >= L.width - 60;
  // a thread running on past the left edge keeps its name there
  const pinned = L.threads.filter((t) => t.name && t.ids.length > 1 && t.x0 < view.left + 30 && t.x1 > view.left + 60);
  const wide = (x: number) => x - view.left;

  const bead = (b: TimeBead) => {
    const t = tileById.get(b.id);
    if (!t) return null;
    const m = matchOf ? matchOf(b.id) : null;
    const bare = b.x - view.left < edge;
    const cls = [
      'l5t-bead',
      b.hub ? 'is-hub' : 'is-dot',
      `is-${b.label}`,
      t.kind === 'core' ? 'is-chat' : '',
      sel.has(b.id) ? 'is-sel' : '',
      b.id === activeId ? 'is-here' : '',
      matchOf && !m ? 'is-dim' : '',
      matchOf && m ? 'is-found' : '',
      flash === b.id ? 'is-flash' : '',
      bare ? 'is-bare' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div
        key={b.id}
        className={cls}
        style={{ left: b.x, top: b.y, ...css({ '--c': colorOf(b.id), '--r': `${b.r}px`, '--lw': `${S.label}px`, '--in': `${Math.round(Math.min(640, Math.max(0, L.width - b.x) * 0.42))}ms` }) }}
        data-bead={b.id}
        role="button"
        tabIndex={matchOf && !m ? -1 : 0}
        aria-pressed={sel.has(b.id)}
        aria-label={tileSaid(t, homes.of.get(b.id)?.name)}
        title={b.label === 'none' || bare ? t.title : undefined}
        onClick={(e) => press(b.id, e.currentTarget)}
        onDoubleClick={() => acts.onOpen(b.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') acts.onOpen(b.id);
          else if (e.key === ' ') {
            e.preventDefault();
            press(b.id, e.currentTarget);
          }
        }}
      >
        <span className="l5t-hit" aria-hidden="true" />
        <span className="l5t-star" aria-hidden="true" />
        {b.label !== 'none' && (
          <span className="l5t-words" aria-hidden="true">
            <span className="l5t-t">
              {starred.has(b.id) ? <Starred title={t.title} /> : t.title}
            </span>
            {b.hub && (
              <span className="l5t-k">
                {kindLine(t)}
                {t.open && (
                  <span className="l5n-q" title="Socria asked something and is waiting for you">
                    ?
                  </span>
                )}
              </span>
            )}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={`l5t${narrow ? ' is-narrow' : ''}`} style={{ top, bottom }}>
      <div
        className="l5t-scroll"
        ref={scroller}
        onScroll={onScroll}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => (drag.current = null)}
        tabIndex={0}
        role="region"
        aria-label="Your conversations in order — the oldest on the left, the newest on the right. Arrow keys move along it; each conversation can be pressed."
      >
        <div className="l5t-track" style={{ width: L.width, height: Math.max(L.height, view.h) }}>
          {L.days
            .filter((d) => d.mark !== 'day' && d.x < L.weekX - 2)
            .map((d) => (
              <div key={`wk:${d.at}`} className={`l5t-wk is-${d.mark}`} style={{ left: d.x }}>
                {wide(d.x) > 26 && <span>{d.mark === 'month' ? MONTH_NAMES[new Date(d.at).getMonth()] : `Week of ${shortDate(d.at)}`}</span>}
              </div>
            ))}
          <div className="l5t-thisweek" style={{ left: L.weekX, width: Math.max(0, L.width - L.weekX) }}>
            <span>This week</span>
          </div>
          <div className="l5t-now" style={{ left: L.nowX }}>
            <span>Now</span>
          </div>
          {L.gaps.map((g) => (
            <div key={`gap:${g.from}`} className="l5t-gap" style={{ left: g.x, width: g.w }}>
              <span className="l5t-gap-mark" aria-hidden="true">···</span>
              <span className="l5t-gap-t">{g.label}</span>
              <span className="l5t-gap-s">nothing begun</span>
            </div>
          ))}
          <svg className="l5t-lines" width={L.width} height={Math.max(L.height, view.h)} aria-hidden="true">
            {L.threads
              .filter((t) => t.ids.length > 1)
              .map((t) => {
                const pts = t.ids.map((id) => L.byId.get(id)!);
                const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
                const quiet = matchOf && !t.ids.some((id) => matchOf(id));
                return (
                  <g key={t.key} className={quiet ? 'is-dim' : ''} style={css({ '--c': colorVar(t.color) })}>
                    <path className="l5t-halo" d={d} pathLength={1} />
                    <path className="l5t-line" d={d} pathLength={1} />
                  </g>
                );
              })}
          </svg>
          {L.threads
            .filter((t) => t.name && t.ids.length > 1 && !pinned.includes(t))
            .map((t) => (
              <span key={`name:${t.key}`} className={`l5t-name${matchOf && !t.ids.some((id) => matchOf(id)) ? ' is-dim' : ''}`} style={{ left: t.x0 - 9, top: t.y - 30, ...css({ '--c': colorVar(t.color) }) }}>
                {t.name}
              </span>
            ))}
          {L.threads
            .filter((t) => t.back && seen(t.x0, 200))
            .map((t) => {
              const back = t.back!;
              const was = tileById.get(back.id);
              const r = L.byId.get(t.ids[0])!.r;
              return (
                <button
                  key={`back:${t.key}`}
                  type="button"
                  className={`l5t-back${matchOf ? ' is-dim' : ''}`}
                  style={{ left: t.x0 - r - 10, top: t.y, ...css({ '--c': colorVar(t.color) }) }}
                  title={`Where ${t.name || 'this'} was before: “${was?.title ?? 'a conversation'}”, ${shortDate(back.at)}`}
                  onClick={() => goTo(back.id)}
                >
                  ↩ <b>{shortDate(back.at)}</b>
                </button>
              );
            })}
          {L.beads.map(bead)}
        </div>
      </div>

      <div className="l5t-pins" aria-hidden="true">
        {pinned.map((t) => (
          <span key={`pin:${t.key}`} className={`l5t-name is-pinned${matchOf && !t.ids.some((id) => matchOf(id)) ? ' is-dim' : ''}`} style={{ top: t.y - 30 - view.top, ...css({ '--c': colorVar(t.color) }) }}>
            {t.name}
          </span>
        ))}
        {L.floorY !== null && (
          <span className="l5t-name is-pinned is-floor" style={{ top: L.floorY - 32 - view.top }}>
            Quick questions
          </span>
        )}
      </div>

      <div className="l5t-axis" aria-hidden="true">
        {L.days
          .filter((d) => seen(d.x + d.w / 2) && wide(d.x + d.w / 2) > 24 && wide(d.x + d.w / 2) < view.w - 24)
          .map((d) => (
            <span key={`day:${d.at}`} className={`l5t-day is-${d.mark}${d.today ? ' is-today' : ''}`} style={{ left: wide(d.x + d.w / 2) }}>
              {narrow ? d.short : d.label}
            </span>
          ))}
      </div>

      {earlier > 0 && (
        <button type="button" className="l5t-more is-l" onClick={() => scroller.current?.scrollBy({ left: -view.w * 0.8, behavior: 'smooth' })}>
          ‹ Earlier <small>{earlier}</small>
        </button>
      )}
      {!atEnd && (
        <button type="button" className="l5t-today" onClick={() => toEnd(true)}>
          {later > 0 ? (
            <>
              Later <small>{later}</small> · Today →
            </>
          ) : (
            <>Today →</>
          )}
        </button>
      )}

      <Scrub L={L} view={view} found={found} colorOf={colorOf} narrow={narrow} onSeek={(left) => scroller.current && (scroller.current.scrollLeft = left)} />
    </div>
  );
}

/** A starred one's name: the star — a character, so it wraps as words do — held to its last word. */
function Starred({ title }: { title: string }) {
  const cut = title.lastIndexOf(' ');
  return (
    <>
      {cut > 0 ? `${title.slice(0, cut)} ` : ''}
      <span className="l5t-last">
        {cut > 0 ? title.slice(cut + 1) : title}
        {'\u00a0'}
        <span className="l5t-starred" aria-label="starred">
          ★
        </span>
      </span>
    </>
  );
}

/** The whole of it, at the foot: every conversation a tick, the window looked through; drag it, or press anywhere. */
function Scrub({
  L,
  view,
  found,
  colorOf,
  narrow,
  onSeek,
}: {
  L: ReturnType<typeof timeLayout>;
  view: { left: number; w: number };
  found: readonly TimeBead[];
  colorOf: (id: string) => string;
  narrow: boolean;
  onSeek: (left: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [sw, setSw] = useState(0);
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setSw(el.clientWidth));
    ro.observe(el);
    setSw(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const k = sw && L.width ? sw / L.width : 0;
  const hits = useMemo(() => new Set(found.map((b) => b.id)), [found]);
  const seek = (clientX: number) => {
    const el = bar.current;
    if (!el || !k) return;
    const x = (clientX - el.getBoundingClientRect().left) / k;
    onSeek(Math.max(0, x - view.w / 2));
  };
  const months = L.days.filter((d, i) => i === 0 || d.mark === 'month');
  return (
    <div className="l5t-scrub">
      {!narrow && <span className="l5t-scrub-say">The whole history — drag the window, or press a day.</span>}
      <div
        className="l5t-scrub-bar"
        ref={bar}
        role="scrollbar"
        aria-label="Where you are in the whole history"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.round(L.width)}
        aria-valuenow={Math.round(view.left)}
        tabIndex={-1}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          seek(e.clientX);
        }}
        onPointerMove={(e) => e.buttons && seek(e.clientX)}
      >
        {months.map((d) => (
          <span key={`m:${d.at}`} className="l5t-scrub-m" style={{ left: d.x * k }}>
            {MONTH_NAMES[new Date(d.at).getMonth()].slice(0, 3)}
          </span>
        ))}
        {L.gaps.map((g) => (
          <span key={`g:${g.from}`} className="l5t-scrub-gap" style={{ left: g.x * k, width: Math.max(2, g.w * k) }} />
        ))}
        {L.beads.map((b) => (
          <span key={b.id} className={`l5t-scrub-t${b.hub ? '' : ' is-dot'}${hits.has(b.id) ? ' is-hit' : ''}`} style={{ left: b.x * k, ...css({ '--c': colorOf(b.id) }) }} />
        ))}
        {k > 0 && view.w > 0 && <span className="l5t-scrub-win" style={{ left: view.left * k, width: Math.max(10, view.w * k) }} />}
      </div>
    </div>
  );
}
