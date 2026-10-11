'use client';

// components/display/PlanFigure.tsx — a plan, drawn as the view it is set to.
//
// Five views of ONE state (lib/objects/display-plan.ts): a timeline, a board,
// a checklist, a storyboard and a list. Switching view changes how the plan
// is shown, never what is in it. Everything the hand does here is an
// operation the plan computes — dragging a bar is `shift`, ticking a box is
// `status`, dropping a card in a column is `status`, reordering a frame is
// `move` — so it lands in the plan's history, undoes, syncs and replays like
// a step said in words.
//
// Every gesture has a keyboard and a button path too: a bar moves with the
// arrow keys, a card with its arrows, a frame with its arrows. Dragging is a
// convenience, never the only way.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { clashes, timelineBars, planTicks, STATUS_WORD, PLAN_LIMITS, type PlanItem, type PlanState, type Status } from '@/lib/objects/display-plan';
import { addDays, dayDiff, sayDay, todayDay } from '@/lib/objects/display-base';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { useSelection } from './primitives';

type D = Display<PlanState>;
type Select = (id: string | null) => void;

const COLUMNS: Status[] = ['todo', 'doing', 'done'];

/** "20 Oct" — the year only when it is not this one's neighbourhood. */
function shortDay(day: string, year?: string): string {
  const said = sayDay(day);
  return year && day.slice(0, 4) === year ? said.replace(/ \d{4}$/, '') : said;
}

export function PlanFigure(p: FigureProps) {
  const d = useDisplay<PlanState>(p);
  const [sel, select] = useSelection(p);
  const s = d.state;
  const clash = clashes(s);
  const done = s.items.filter((i) => i.status === 'done').length;
  const aside =
    s.view === 'checklist' || s.view === 'board' || s.items.some((i) => i.status)
      ? `${done} of ${s.items.length} done`
      : clash.length
        ? `${clash.length} clash${clash.length === 1 ? '' : 'es'}`
        : null;
  const selected = sel ? (s.items.find((i) => i.id === sel) ?? null) : null;
  const year = String(new Date().getUTCFullYear());

  const add = (text: string, extra: Record<string, string> = {}) => d.act('add', { text, by: 'person', ...extra });

  return (
    <DisplayShell p={p} d={d} aside={aside}>
      {!s.items.length ? (
        <p className="dsp-empty">
          Nothing in this plan yet. Add the first thing below — or say it in the chat: “add the essay draft on Friday”.
        </p>
      ) : s.view === 'timeline' ? (
        <Timeline s={s} d={d} sel={sel} select={select} year={year} />
      ) : s.view === 'board' ? (
        <Board s={s} d={d} sel={sel} select={select} year={year} add={add} />
      ) : s.view === 'checklist' ? (
        <Checklist s={s} d={d} sel={sel} select={select} year={year} />
      ) : s.view === 'storyboard' ? (
        <Storyboard s={s} d={d} sel={sel} select={select} />
      ) : (
        <List s={s} d={d} sel={sel} select={select} />
      )}
      {selected && <ItemEditor s={s} d={d} item={selected} onClose={() => select(null)} />}
      {d.live && s.view !== 'board' && s.items.length < PLAN_LIMITS.items && (
        <AddDated
          label={s.view === 'storyboard' ? 'Add a frame' : 'Add an item'}
          placeholder={s.view === 'storyboard' ? 'What happens next…' : 'Something to do, or that happens…'}
          dated={s.view === 'timeline'}
          onAdd={(text, date) => add(text, date ? { date } : {})}
        />
      )}
    </DisplayShell>
  );
}

/** "Add …", with a day beside the words when the view is about time. */
function AddDated({
  label,
  placeholder,
  dated,
  onAdd,
}: {
  label: string;
  placeholder: string;
  dated: boolean;
  onAdd: (text: string, date: string) => boolean;
}) {
  const [date, setDate] = useState('');
  return (
    <AddRow
      label={label}
      placeholder={placeholder}
      onAdd={(text) => {
        const ok = onAdd(text, date);
        if (ok) setDate('');
        return ok;
      }}
      extra={
        dated ? (
          <input type="date" className="dsp-date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="On which day (optional)" />
        ) : undefined
      }
    />
  );
}

// ── timeline ─────────────────────────────────────────────────────────

const ROW = 30;
const LANE = 22;

type Row = { kind: 'lane'; lane: string; y: number } | { kind: 'bar'; item: PlanItem; x0: number; x1: number; y: number };

interface Drag {
  id: string;
  mode: 'move' | 'end';
  from: number;
  width: number;
  days: number;
}

function Timeline({ s, d, sel, select, year }: { s: PlanState; d: D; sel: string | null; select: Select; year: string }) {
  const { bars, lanes, span: sp } = timelineBars(s);
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const moved = useRef(false);
  const [today, setToday] = useState<string | null>(null);
  // read where the person is looking, after the first paint — never inside an operation
  useEffect(() => setToday(todayDay()), []);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const hint = `${uid}-hint`;

  if (!sp) {
    return (
      <div className="dsp-tl-none">
        <p className="dsp-empty">Nothing here has a day yet. Give items days below and they line up in time.</p>
        <Undated s={s} d={d} select={select} />
      </div>
    );
  }
  const total = Math.max(1, sp.days);
  const ticks = planTicks(sp);
  const byId = new Map(s.items.map((i) => [i.id, i]));
  const named = lanes.some((l) => l !== '');
  const rows: Row[] = [];
  let y = 0;
  for (const lane of lanes) {
    if (named) {
      rows.push({ kind: 'lane', lane: lane || 'Other', y });
      y += LANE;
    }
    for (const b of bars.filter((x) => x.lane === lane)) {
      const item = byId.get(b.id);
      if (!item) continue;
      rows.push({ kind: 'bar', item, x0: b.x0, x1: b.x1, y });
      y += ROW;
    }
  }
  const height = Math.max(y, ROW);
  const at = new Map<string, Extract<Row, { kind: 'bar' }>>();
  for (const r of rows) if (r.kind === 'bar') at.set(r.item.id, r);
  const clash = new Map(clashes(s).map((c) => [c.item, c]));
  const todayX = today && dayDiff(sp.start, today) >= 0 && dayDiff(today, sp.end) >= 0 ? dayDiff(sp.start, today) / total : null;

  const begin = (e: RPointerEvent<HTMLElement>, id: string, mode: Drag['mode']) => {
    moved.current = false;
    if (!d.live || e.button !== 0) return;
    const w = track.current?.getBoundingClientRect().width ?? 0;
    if (w <= 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ id, mode, from: e.clientX, width: w, days: 0 });
  };
  const during = (e: RPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const days = Math.round(((e.clientX - drag.from) / drag.width) * total);
    if (days !== drag.days) setDrag({ ...drag, days });
  };
  const finish = () => {
    if (!drag) return;
    const { id, mode, days } = drag;
    setDrag(null);
    if (!days) return;
    moved.current = true;
    const item = byId.get(id);
    if (!item?.date) return;
    if (mode === 'move') d.act('shift', { id, days });
    else resize(item, days);
  };
  const resize = (item: PlanItem, days: number) => {
    if (!item.date) return;
    const end = addDays(item.end ?? item.date, days);
    if (dayDiff(item.date, end) > 0) d.act('date', { id: item.id, date: item.date, end });
    else if (item.end) d.act('date', { id: item.id, date: item.date, end: '' });
  };
  const keys = (e: KeyboardEvent<HTMLButtonElement>, item: PlanItem) => {
    if (!d.live || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const sign = e.key === 'ArrowLeft' ? -1 : 1;
    if (e.altKey) resize(item, sign);
    else d.act('shift', { id: item.id, days: sign * (e.shiftKey ? 7 : 1) });
  };

  return (
    <div className="dsp-tl">
      <div className="dsp-tl-axis" aria-hidden="true">
        <span />
        <div className="dsp-tl-ticks">
          {ticks.map((t) => (
            <span key={t.day} style={{ left: `${t.x * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      <div className="dsp-tl-body" style={{ height }}>
        <div className="dsp-tl-labels">
          {rows.map((r) =>
            r.kind === 'lane' ? (
              <span key={`lane:${r.lane}`} className="dsp-tl-lane" style={{ top: r.y }}>
                {r.lane}
              </span>
            ) : (
              <button
                key={r.item.id}
                type="button"
                className={`dsp-tl-label${sel === r.item.id ? ' is-sel' : ''}${r.item.status === 'done' ? ' is-done' : ''}${r.item.by === 'socria' ? ' is-socria' : ''}`}
                style={{ top: r.y, height: ROW }}
                onClick={() => select(sel === r.item.id ? null : r.item.id)}
                title={r.item.by === 'socria' ? 'Drafted by Socria' : undefined}
              >
                {r.item.text}
              </button>
            )
          )}
        </div>
        <div className="dsp-tl-track" ref={track}>
          {ticks.map((t) => (
            <span key={t.day} className="dsp-tl-grid" style={{ left: `${t.x * 100}%` }} aria-hidden="true" />
          ))}
          {todayX !== null && <span className="dsp-tl-today" style={{ left: `${todayX * 100}%` }} title={`Today, ${sayDay(today!)}`} aria-hidden="true" />}
          <svg className="dsp-tl-links" width="100%" height={height} aria-hidden="true">
            <defs>
              <marker id={`${uid}-a`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" className="dsp-tl-head" />
              </marker>
              <marker id={`${uid}-c`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" className="dsp-tl-head is-clash" />
              </marker>
            </defs>
            {s.links.map((l) => {
              const a = at.get(l.from);
              const b = at.get(l.to);
              if (!a || !b) return null;
              const bad = clash.get(l.to)?.waitsOn === l.from;
              return (
                <line
                  key={`${l.from}>${l.to}`}
                  className={`dsp-tl-link${bad ? ' is-clash' : ''}`}
                  x1={`${a.x1 * 100}%`}
                  y1={a.y + ROW / 2}
                  x2={`${b.x0 * 100}%`}
                  y2={b.y + ROW / 2}
                  markerEnd={`url(#${uid}-${bad ? 'c' : 'a'})`}
                />
              );
            })}
          </svg>
          {rows.map((r) => {
            if (r.kind !== 'bar' || !r.item.date) return null;
            const item = r.item;
            const live = drag?.id === item.id ? drag : null;
            const px = live ? (live.days / total) * live.width : 0;
            const c = clash.get(item.id);
            const said = `${item.text}: ${sayDay(item.date!)}${item.end ? ` to ${sayDay(item.end)}` : ''}${
              c ? `, ${c.by} day${c.by === 1 ? '' : 's'} before ${byId.get(c.waitsOn)?.text ?? 'what it waits on'}, which it waits on` : ''
            }`;
            return (
              <button
                key={item.id}
                type="button"
                className={`dsp-bar${sel === item.id ? ' is-sel' : ''}${c ? ' is-clash' : ''}${item.status === 'done' ? ' is-done' : ''}${
                  item.by === 'socria' ? ' is-socria' : ''
                }${live ? ' is-dragging' : ''}${d.live ? ' is-live' : ''}`}
                style={{
                  left: `${r.x0 * 100}%`,
                  width: live?.mode === 'end' ? `calc(${(r.x1 - r.x0) * 100}% + ${px}px)` : `${(r.x1 - r.x0) * 100}%`,
                  top: r.y + 5,
                  transform: live?.mode === 'move' ? `translateX(${px}px)` : undefined,
                }}
                aria-label={said}
                aria-describedby={d.live ? hint : undefined}
                title={said}
                onPointerDown={(e) => begin(e, item.id, 'move')}
                onPointerMove={during}
                onPointerUp={finish}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => keys(e, item)}
                onClick={() => {
                  if (moved.current) return;
                  select(sel === item.id ? null : item.id);
                }}
              >
                {live && live.days !== 0 && (
                  <span className="dsp-bar-tip">
                    {live.mode === 'move'
                      ? shortDay(addDays(item.date!, live.days), year)
                      : `ends ${shortDay(addDays(item.end ?? item.date!, live.days), year)}`}
                  </span>
                )}
                {d.live && (
                  <span
                    className="dsp-bar-end"
                    aria-hidden="true"
                    onPointerDown={(e) => begin(e, item.id, 'end')}
                    onPointerMove={during}
                    onPointerUp={finish}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      {d.live && (
        <p id={hint} className="dsp-sr">
          Arrow keys move it a day, Shift with an arrow a week; Alt with an arrow makes it last a day longer or shorter.
        </p>
      )}
      {clash.size > 0 && (
        <ul className="dsp-clashes" aria-label="Clashes">
          {[...clash.values()].map((c) => (
            <li key={`${c.item}<${c.waitsOn}`}>
              ‘{byId.get(c.item)?.text}’ is {c.by} day{c.by === 1 ? '' : 's'} before ‘{byId.get(c.waitsOn)?.text}’, which it waits on.
            </li>
          ))}
        </ul>
      )}
      <Undated s={s} d={d} select={select} />
    </div>
  );
}

/** What has no day yet: listed under the timeline, each with a place to give it one. */
function Undated({ s, d, select }: { s: PlanState; d: D; select: Select }) {
  const items = s.items.filter((i) => !i.date);
  if (!items.length) return null;
  return (
    <div className="dsp-undated">
      <p className="dsp-sub">No day yet</p>
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" className="dsp-item-text" onClick={() => select(i.id)}>
              {i.text}
            </button>
            {d.live && (
              <input
                type="date"
                className="dsp-date"
                aria-label={`Day for ${i.text}`}
                onChange={(e) => e.target.value && d.act('date', { id: i.id, date: e.target.value })}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── board ────────────────────────────────────────────────────────────

function Board({
  s,
  d,
  sel,
  select,
  year,
  add,
}: {
  s: PlanState;
  d: D;
  sel: string | null;
  select: Select;
  year: string;
  add: (text: string, extra?: Record<string, string>) => boolean;
}) {
  const [over, setOver] = useState<Status | null>(null);
  const colOf = (i: PlanItem): Status => i.status ?? 'todo';
  const moveTo = (id: string, status: Status) => d.act('status', { id, status });
  return (
    <div className="dsp-board">
      {COLUMNS.map((c, ci) => {
        const items = s.items.filter((i) => colOf(i) === c);
        return (
          <section
            key={c}
            className={`dsp-col${over === c ? ' is-over' : ''}`}
            aria-label={`${STATUS_WORD[c]}, ${items.length}`}
            onDragOver={(e) => {
              if (!d.live) return;
              e.preventDefault();
              if (over !== c) setOver(c);
            }}
            onDragLeave={(e) => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/x-socria-item');
              const it = s.items.find((i) => i.id === id);
              if (it && colOf(it) !== c) moveTo(id, c);
            }}
          >
            <h4 className="dsp-col-head">
              {STATUS_WORD[c]} <span>{items.length}</span>
            </h4>
            <ul>
              {items.map((i) => (
                <li
                  key={i.id}
                  className={`dsp-cardi${sel === i.id ? ' is-sel' : ''}${i.by === 'socria' ? ' is-socria' : ''}`}
                  draggable={d.live}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/x-socria-item', i.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <button type="button" className="dsp-item-text" onClick={() => select(sel === i.id ? null : i.id)}>
                    {i.text}
                  </button>
                  {(i.date || i.lane) && (
                    <span className="dsp-cardi-meta">
                      {i.date && <span className="dsp-chip">{shortDay(i.date, year)}</span>}
                      {i.lane && <span className="dsp-chip is-lane">{i.lane}</span>}
                    </span>
                  )}
                  {d.live && (
                    <span className="dsp-cardi-moves">
                      {ci > 0 && (
                        <button type="button" onClick={() => moveTo(i.id, COLUMNS[ci - 1])} aria-label={`Move ${i.text} to ${STATUS_WORD[COLUMNS[ci - 1]]}`}>
                          ←
                        </button>
                      )}
                      {ci < COLUMNS.length - 1 && (
                        <button type="button" onClick={() => moveTo(i.id, COLUMNS[ci + 1])} aria-label={`Move ${i.text} to ${STATUS_WORD[COLUMNS[ci + 1]]}`}>
                          →
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {d.live && s.items.length < PLAN_LIMITS.items && (
              <AddRow label={`Add to ${STATUS_WORD[c]}`} placeholder="Add a card…" onAdd={(text) => add(text, { status: c })} />
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── checklist ────────────────────────────────────────────────────────

function Checklist({ s, d, sel, select, year }: { s: PlanState; d: D; sel: string | null; select: Select; year: string }) {
  const done = s.items.filter((i) => i.status === 'done').length;
  const uid = useId();
  return (
    <div className="dsp-check">
      <div className="dsp-progress" role="progressbar" aria-label="Done" aria-valuemin={0} aria-valuemax={s.items.length} aria-valuenow={done}>
        <span style={{ width: `${s.items.length ? (done / s.items.length) * 100 : 0}%` }} />
      </div>
      <ul>
        {s.items.map((i) => (
          <li key={i.id} className={`${i.status === 'done' ? 'is-done' : ''}${sel === i.id ? ' is-sel' : ''}`}>
            <input
              id={`${uid}-${i.id}`}
              type="checkbox"
              checked={i.status === 'done'}
              disabled={!d.live}
              onChange={(e) => d.act('status', { id: i.id, status: e.target.checked ? 'done' : 'todo' })}
            />
            <label htmlFor={`${uid}-${i.id}`} className="dsp-check-text">
              {i.text}
            </label>
            {i.status === 'doing' && <span className="dsp-chip is-doing">doing</span>}
            {i.date && <span className="dsp-chip">{shortDay(i.date, year)}</span>}
            <button type="button" className="dsp-more" onClick={() => select(sel === i.id ? null : i.id)} aria-label={`Details of ${i.text}`}>
              ⋯
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── storyboard ───────────────────────────────────────────────────────

function Storyboard({ s, d, sel, select }: { s: PlanState; d: D; sel: string | null; select: Select }) {
  const [over, setOver] = useState<number | null>(null);
  return (
    <ol className="dsp-story">
      {s.items.map((i, n) => (
        <li
          key={i.id}
          className={`dsp-frame${sel === i.id ? ' is-sel' : ''}${over === n ? ' is-over' : ''}${i.by === 'socria' ? ' is-socria' : ''}`}
          draggable={d.live}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/x-socria-item', i.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (!d.live) return;
            e.preventDefault();
            if (over !== n) setOver(n);
          }}
          onDragLeave={() => setOver((o) => (o === n ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            const id = e.dataTransfer.getData('text/x-socria-item');
            if (id && id !== i.id) d.act('move', { id, to: n });
          }}
        >
          <span className="dsp-frame-n">{n + 1}</span>
          <button type="button" className="dsp-frame-text" onClick={() => select(sel === i.id ? null : i.id)}>
            {i.text}
          </button>
          {i.note && <p className="dsp-frame-note">{i.note}</p>}
          {d.live && (
            <span className="dsp-frame-moves">
              <button type="button" disabled={n === 0} onClick={() => d.act('move', { id: i.id, to: n - 1 })} aria-label={`Move ${i.text} earlier`}>
                ←
              </button>
              <button
                type="button"
                disabled={n === s.items.length - 1}
                onClick={() => d.act('move', { id: i.id, to: n + 1 })}
                aria-label={`Move ${i.text} later`}
              >
                →
              </button>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

// ── list ─────────────────────────────────────────────────────────────

function List({ s, d, sel, select }: { s: PlanState; d: D; sel: string | null; select: Select }) {
  return (
    <ol className="dsp-list">
      {s.items.map((i, n) => (
        <li key={i.id} className={`${sel === i.id ? 'is-sel' : ''}${i.by === 'socria' ? ' is-socria' : ''}`}>
          <button type="button" className="dsp-list-n" onClick={() => select(sel === i.id ? null : i.id)} aria-label={`Details of ${i.text}`}>
            {n + 1}
          </button>
          {d.live ? (
            <Edit value={i.text} label={`Item ${n + 1}`} max={PLAN_LIMITS.text} onDone={(text) => text && d.act('text', { id: i.id, text })} />
          ) : (
            <span className="dsp-item-text">{i.text}</span>
          )}
          {i.date && <span className="dsp-chip">{sayDay(i.date)}</span>}
          {i.status && <span className={`dsp-chip is-${i.status}`}>{STATUS_WORD[i.status]}</span>}
          {d.live && (
            <span className="dsp-list-moves">
              <button type="button" disabled={n === 0} onClick={() => d.act('move', { id: i.id, to: n - 1 })} aria-label={`Move ${i.text} up`}>
                ↑
              </button>
              <button type="button" disabled={n === s.items.length - 1} onClick={() => d.act('move', { id: i.id, to: n + 1 })} aria-label={`Move ${i.text} down`}>
                ↓
              </button>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

// ── one item, in full ────────────────────────────────────────────────

/**
 * Everything about the selected item, editable where it stands — the same in
 * every view, so a timeline bar and a board card are changed the same way.
 */
function ItemEditor({ s, d, item, onClose }: { s: PlanState; d: D; item: PlanItem; onClose: () => void }) {
  const waitsOn = s.links.filter((l) => l.to === item.id);
  const could = s.items.filter((x) => x.id !== item.id && !waitsOn.some((l) => l.from === x.id));
  const lanes = [...new Set(s.items.map((x) => x.lane).filter(Boolean) as string[])];
  const name = (id: string) => s.items.find((x) => x.id === id)?.text ?? id;
  const ro = !d.live;
  return (
    <div className="dsp-editor" role="group" aria-label={`Item: ${item.text}`}>
      <div className="dsp-editor-head">
        {ro ? (
          <strong>{item.text}</strong>
        ) : (
          <Edit value={item.text} label="What it is" max={PLAN_LIMITS.text} onDone={(text) => text && d.act('text', { id: item.id, text })} />
        )}
        <span className="dsp-editor-by">{item.by === 'person' ? 'yours' : 'drafted by Socria'}</span>
        <button type="button" className="dsp-x" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="dsp-editor-grid">
        <label>
          <span>Day</span>
          <input
            type="date"
            className="dsp-date"
            value={item.date ?? ''}
            disabled={ro}
            onChange={(e) => d.act('date', { id: item.id, date: e.target.value })}
          />
        </label>
        <label>
          <span>Until</span>
          <input
            type="date"
            className="dsp-date"
            value={item.end ?? ''}
            min={item.date ? addDays(item.date, 1) : undefined}
            disabled={ro || !item.date}
            title={item.date ? undefined : 'Give it a day first'}
            onChange={(e) => item.date && d.act('date', { id: item.id, date: item.date, end: e.target.value })}
          />
        </label>
        <label>
          <span>Status</span>
          <select
            value={item.status ?? ''}
            disabled={ro}
            onChange={(e) => e.target.value && d.act('status', { id: item.id, status: e.target.value })}
          >
            {!item.status && <option value="">—</option>}
            {COLUMNS.map((c) => (
              <option key={c} value={c}>
                {STATUS_WORD[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Lane</span>
          {ro ? (
            <span className="dsp-ro">{item.lane ?? '—'}</span>
          ) : (
            <LaneField value={item.lane ?? ''} lanes={lanes} onDone={(lane) => d.act('lane', { id: item.id, lane })} />
          )}
        </label>
      </div>
      <label className="dsp-editor-note">
        <span>Note</span>
        {ro ? (
          <span className="dsp-ro">{item.note ?? '—'}</span>
        ) : (
          <Edit value={item.note ?? ''} label="Note" max={PLAN_LIMITS.note} placeholder="Anything to remember about it" onDone={(note) => d.act('note', { id: item.id, note })} />
        )}
      </label>
      <div className="dsp-editor-waits">
        <span>Waits on</span>
        {waitsOn.map((l) => (
          <span key={l.from} className="dsp-chip is-link">
            {name(l.from)}
            {!ro && (
              <button type="button" onClick={() => d.act('unlink', { from: l.from, to: item.id })} aria-label={`No longer waits on ${name(l.from)}`}>
                ×
              </button>
            )}
          </span>
        ))}
        {!waitsOn.length && <span className="dsp-ro">nothing</span>}
        {!ro && could.length > 0 && (
          <select
            value=""
            aria-label="Make it wait on"
            onChange={(e) => e.target.value && d.act('link', { from: e.target.value, to: item.id, by: 'person' })}
          >
            <option value="">+ waits on…</option>
            {could.map((x) => (
              <option key={x.id} value={x.id}>
                {x.text}
              </option>
            ))}
          </select>
        )}
      </div>
      {!ro && (
        <div className="dsp-editor-foot">
          <button
            type="button"
            className="dsp-danger"
            onClick={() => {
              if (d.act('remove', { id: item.id })) onClose();
            }}
          >
            Remove from the plan
          </button>
        </div>
      )}
    </div>
  );
}

/** A lane: one of the plan's lanes, a new one, or none. */
function LaneField({ value, lanes, onDone }: { value: string; lanes: string[]; onDone: (v: string) => void }) {
  const id = useId();
  return (
    <>
      <Edit value={value} label="Lane" max={PLAN_LIMITS.lane} placeholder="none" onDone={onDone} className="dsp-lane-in" list={lanes.length ? id : undefined} />
      {lanes.length > 0 && (
        <datalist id={id}>
          {lanes.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      )}
    </>
  );
}
