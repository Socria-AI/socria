'use client';
// components/logos5/UniverseBoards.tsx — the Universal Map as columns, as a
// timeline, and as a few cards.
//
// Columns: each Project a column, its conversations in order — drag a card
// up or down to put it where you want it, into another column to file it
// there, a column by its name to move the column. On a touch screen, press
// and hold to pick a card up. Timeline: each Project a lane, each stretch of
// time a column, ending at today. A few cards: what is shown while there are
// too few conversations for a map to help.

import { useEffect, useRef, useState } from 'react';
import { isDrag } from '@/lib/canvas';
import { timelineOf, type Group, type Match, type Tile } from '@/lib/logos5/universe';
import type { Arrangement } from '@/lib/logos5/arrange';
import { Glyph, StarMark, TileCard, accentOf, cssVars, groupHex } from './UniverseParts';

type ColDrag =
  | { kind: 'card'; id: string; from: string; x: number; y: number; ox: number; oy: number; w: number; over: { g: string; i: number } | null }
  | { kind: 'col'; key: string; x: number; y: number; ox: number; w: number; over: number | null };

interface Press {
  kind: 'card' | 'col';
  id: string;
  g: string;
  sx: number;
  sy: number;
  touch: boolean;
  held: boolean;
  moved: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  rect: DOMRect;
}

export function ColumnsBoard({
  groups,
  arr,
  now,
  activeId,
  matchOf,
  onOpen,
  onPreview,
  onMoveCard,
  onMoveColumn,
  onFold,
}: {
  groups: Group[];
  arr: Arrangement;
  now: number;
  activeId: string | null;
  matchOf: ((id: string) => Match | null) | null;
  onOpen: (id: string) => void;
  onPreview: (id: string, el: HTMLElement) => void;
  /** a card put down: in its column at a place, or in another column */
  onMoveCard: (id: string, to: string, at: number) => void;
  onMoveColumn: (key: string, at: number) => void;
  onFold: (key: string, folded: boolean) => void;
}) {
  const [drag, setDragState] = useState<ColDrag | null>(null);
  const dragRef = useRef<ColDrag | null>(null);
  const setDrag = (d: ColDrag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const press = useRef<Press | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const starred = new Set(arr.starred);

  const overCard = (x: number, y: number, id: string): { g: string; i: number } | null => {
    const col = document.elementFromPoint(x, y)?.closest('[data-col]') as HTMLElement | null;
    if (!col) return null;
    const g = col.getAttribute('data-col')!;
    const cards = [...col.querySelectorAll('[data-card]')].filter((c) => c.getAttribute('data-card') !== id);
    let i = cards.length;
    for (let k = 0; k < cards.length; k++) {
      const r = cards[k].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        i = k;
        break;
      }
    }
    return { g, i };
  };
  const overCol = (x: number, key: string): number => {
    const cols = [...(root.current?.querySelectorAll('[data-col]') ?? [])].filter((c) => c.getAttribute('data-col') !== key);
    let i = cols.length;
    for (let k = 0; k < cols.length; k++) {
      const r = cols[k].getBoundingClientRect();
      if (x < r.left + r.width / 2) {
        i = k;
        break;
      }
    }
    return i;
  };

  const start = (e: React.PointerEvent, kind: 'card' | 'col', id: string, g: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // while a search narrows the columns, an order cannot be set by where things land
    if (kind === 'card' && matchOf) return;
    if ((e.target as Element).closest('[data-control]')) return;
    // a mouse drag carries the card; it does not select the words it passes over
    if (e.pointerType === 'mouse') e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const touch = e.pointerType !== 'mouse';
    const p: Press = { kind, id, g, sx: e.clientX, sy: e.clientY, touch, held: !touch, moved: false, timer: null, rect: el.getBoundingClientRect() };
    if (touch)
      p.timer = setTimeout(() => {
        if (press.current === p && !p.moved) {
          p.held = true;
          el.classList.add('is-holding');
        }
      }, 380);
    press.current = p;
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      const dx = e.clientX - p.sx;
      const dy = e.clientY - p.sy;
      if (!p.moved) {
        if (!isDrag(dx, dy, p.touch ? 'touch' : 'mouse')) return;
        p.moved = true;
        if (p.timer) clearTimeout(p.timer);
        // a touch that did not wait is a scroll, not a drag
        if (!p.held) {
          press.current = null;
          return;
        }
      }
      e.preventDefault();
      if (p.kind === 'card') setDrag({ kind: 'card', id: p.id, from: p.g, x: e.clientX, y: e.clientY, ox: p.sx - p.rect.left, oy: p.sy - p.rect.top, w: p.rect.width, over: overCard(e.clientX, e.clientY, p.id) });
      else setDrag({ kind: 'col', key: p.id, x: e.clientX, y: e.clientY, ox: p.sx - p.rect.left, w: p.rect.width, over: overCol(e.clientX, p.id) });
    };
    const up = () => {
      const p = press.current;
      press.current = null;
      if (p?.timer) clearTimeout(p.timer);
      root.current?.querySelectorAll('.is-holding').forEach((x) => x.classList.remove('is-holding'));
      const d = dragRef.current;
      setDrag(null);
      if (d?.kind === 'card' && d.over) onMoveCard(d.id, d.over.g, d.over.i);
      if (d?.kind === 'col' && d.over !== null) onMoveColumn(d.key, d.over);
    };
    // once a card is held on a touch screen, the finger carries it rather than scrolling the page
    const still = (e: TouchEvent) => {
      if (press.current?.held && press.current.touch) e.preventDefault();
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', still, { passive: false });
    return () => {
      window.removeEventListener('touchmove', still);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [onMoveCard, onMoveColumn]);

  const otherCols = drag?.kind === 'col' ? groups.map((g) => g.key).filter((k) => k !== drag.key) : [];
  const tileOf = (id: string) => groups.flatMap((g) => g.tiles).find((t) => t.id === id) ?? null;
  const dragged = drag?.kind === 'card' ? tileOf(drag.id) : null;
  const draggedGroup = drag?.kind === 'card' ? groups.find((g) => g.key === drag.from) ?? null : null;

  return (
    <div className={`l5h-cols${drag ? ' is-dragging' : ''}`} ref={root} role="list" aria-label="Your conversations, a column for each Project">
      {groups.map((g) => {
        const folded = !!arr.frames[g.key]?.collapsed;
        const tiles = matchOf ? g.tiles.filter((t) => matchOf(t.id)) : g.tiles;
        // places are counted without what is being carried
        const showGap = drag?.kind === 'col' && drag.key !== g.key && otherCols.indexOf(g.key) === drag.over;
        const others = drag?.kind === 'card' ? tiles.filter((t) => t.id !== drag.id) : tiles;
        const lineAt = drag?.kind === 'card' && drag.over?.g === g.key ? drag.over.i : -1;
        return (
          <div key={g.key} className="l5h-colwrap">
            {showGap && <div className="l5h-colgap" aria-hidden="true" />}
            <section
              className={`l5h-col k-${g.kind}${folded ? ' is-folded' : ''}${drag?.kind === 'card' && drag.over?.g === g.key ? ' is-over' : ''}${drag?.kind === 'col' && drag.key === g.key ? ' is-lifted' : ''}`}
              data-col={g.key}
              role="listitem"
              aria-label={`${g.name}: ${g.tiles.length}`}
              style={cssVars({ '--fc': groupHex(g) })}
            >
              <header className="l5h-colhead" onPointerDown={(e) => start(e, 'col', g.key, g.key)} title="Drag to move this column">
                <span className="l5h-fdot" aria-hidden="true" />
                <span className="l5h-fname">{g.name}</span>
                <span className="l5h-fcount">{g.tiles.length}</span>
                <button type="button" data-control className="l5h-ffold" aria-expanded={!folded} aria-label={folded ? `Unfold ${g.name}` : `Fold ${g.name}`} onClick={() => onFold(g.key, !folded)}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={folded ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'} />
                  </svg>
                </button>
              </header>
              {!folded && (
                <div className="l5h-collist">
                  {tiles.map((t) => (
                    <div key={t.id} className="l5h-colitem">
                      {lineAt >= 0 && t.id !== (drag as { id?: string } | null)?.id && others.indexOf(t) === lineAt && <div className="l5h-dropline" aria-hidden="true" />}
                      <TileCard
                        tile={t}
                        accent={accentOf(t, g, arr.display.color, now)}
                        starred={starred.has(t.id)}
                        here={t.id === activeId}
                        labels={arr.display.labels}
                        dragging={drag?.kind === 'card' && drag.id === t.id}
                        onOpen={() => onOpen(t.id)}
                        onPreview={(el) => onPreview(t.id, el)}
                        handlers={{ onPointerDown: (e: React.PointerEvent) => start(e, 'card', t.id, g.key) }}
                      />
                    </div>
                  ))}
                  {lineAt >= others.length && <div className="l5h-dropline" aria-hidden="true" />}
                  {!tiles.length && <p className="l5h-colempty">{g.tiles.length ? 'Nothing here matches.' : g.kind === 'project' ? 'Drag a line of thinking here to file it.' : 'Nothing here yet.'}</p>}
                </div>
              )}
            </section>
          </div>
        );
      })}
      {drag?.kind === 'col' && drag.over === otherCols.length && <div className="l5h-colgap" aria-hidden="true" />}
      {dragged && draggedGroup && drag?.kind === 'card' && (
        <div className="l5h-ghost" style={{ left: drag.x - drag.ox, top: drag.y - drag.oy, width: drag.w }} aria-hidden="true">
          <TileCard tile={dragged} accent={accentOf(dragged, draggedGroup, arr.display.color, now)} starred={starred.has(dragged.id)} labels={arr.display.labels} onOpen={() => {}} />
        </div>
      )}
    </div>
  );
}

// ── the timeline ─────────────────────────────────────────────────────

export function TimelineBoard({
  groups,
  arr,
  now,
  matchOf,
  onPreview,
  onOpen,
}: {
  groups: Group[];
  arr: Arrangement;
  now: number;
  matchOf: ((id: string) => Match | null) | null;
  onPreview: (id: string, el: HTMLElement) => void;
  onOpen: (id: string) => void;
}) {
  const shown = matchOf ? groups.map((g) => ({ ...g, tiles: g.tiles.filter((t) => matchOf(t.id)) })) : groups;
  const tl = timelineOf(shown, now);
  const byId = new Map(groups.flatMap((g) => g.tiles.map((t) => [t.id, { t, g }] as const)));
  const scroller = useRef<HTMLDivElement>(null);
  const starred = new Set(arr.starred);
  // it ends at today: the newest is where the eye starts
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [tl.buckets.length]);
  if (!tl.lanes.length) return <p className="l5h-colempty is-wide">Nothing here matches.</p>;
  return (
    <div className="l5h-tl" ref={scroller}>
      <div className="l5h-tl-grid" style={{ gridTemplateColumns: `minmax(132px, 168px) repeat(${tl.buckets.length}, minmax(196px, 1fr))` }} role="table" aria-label="Your conversations by when you last worked in them">
        <div className="l5h-tl-corner" role="columnheader" />
        {tl.buckets.map((b) => (
          <div key={b.key} className={`l5h-tl-when${b.key === 'today' ? ' is-today' : ''}`} role="columnheader">
            {b.label}
          </div>
        ))}
        {tl.lanes.map((lane) => {
          const g = groups.find((x) => x.key === lane.key)!;
          return (
            <div key={lane.key} className="l5h-tl-row" role="row" style={cssVars({ '--fc': groupHex(g) })}>
              <div className="l5h-tl-lane" role="rowheader">
                <span className="l5h-fdot" aria-hidden="true" />
                {g.name}
              </div>
              {tl.buckets.map((b) => (
                <div key={b.key} className="l5h-tl-cell" role="cell">
                  {lane.cells[b.key].map((id) => {
                    const it = byId.get(id);
                    if (!it) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="l5h-tl-chip"
                        style={cssVars({ '--acc': accentOf(it.t, it.g, arr.display.color, now) })}
                        onClick={(e) => onPreview(id, e.currentTarget)}
                        onDoubleClick={() => onOpen(id)}
                        title={it.t.title}
                      >
                        <Glyph look={it.t.look} size={12} />
                        <span>{it.t.title}</span>
                        {starred.has(id) && <StarMark />}
                        {it.t.open && <span className="l5h-open" aria-label="a question is waiting" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── a few, as cards ──────────────────────────────────────────────────

/** While there are only a few conversations, they are shown large, a press from going on. */
export function FewCards({ groups, arr, now, activeId, matchOf, onOpen, onPreview }: { groups: Group[]; arr: Arrangement; now: number; activeId: string | null; matchOf: ((id: string) => Match | null) | null; onOpen: (id: string) => void; onPreview: (id: string, el: HTMLElement) => void }) {
  const starred = new Set(arr.starred);
  const shown = groups.map((g) => ({ ...g, tiles: (matchOf ? g.tiles.filter((t) => matchOf(t.id)) : g.tiles).slice().sort((a: Tile, b: Tile) => b.at - a.at) })).filter((g) => g.tiles.length);
  const titled = shown.length > 1 || shown.some((g) => g.kind === 'project');
  return (
    <div className="l5h-few">
      {shown.map((g) => (
        <section key={g.key} className="l5h-few-g" aria-label={g.name} style={cssVars({ '--fc': groupHex(g) })}>
          {titled && (
            <h3 className="l5h-few-h">
              <span className="l5h-fdot" aria-hidden="true" />
              {g.name}
            </h3>
          )}
          <div className="l5h-few-row">
            {g.tiles.map((t) => (
              <TileCard key={t.id} big tile={t} accent={accentOf(t, g, arr.display.color, now)} starred={starred.has(t.id)} here={t.id === activeId} labels={arr.display.labels} onOpen={() => onOpen(t.id)} onPreview={(el) => onPreview(t.id, el)} />
            ))}
          </div>
        </section>
      ))}
      {!shown.length && <p className="l5h-colempty is-wide">Nothing here matches.</p>}
      <p className="l5h-few-p">As you think more things through, they gather here into a map you can arrange — by Project, by hand, or by when.</p>
    </div>
  );
}
