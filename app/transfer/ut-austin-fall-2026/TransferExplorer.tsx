'use client';

// app/transfer/ut-austin-fall-2026/TransferExplorer.tsx — the page itself:
// filters, the headline, four pictures of the data and every response.
// Everything it says is worked out in lib/transfer/explore.ts.

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DECISIONS,
  DECISION_LABEL,
  DECISION_SHORT,
  GPA_BANDS,
  HOURS_BANDS,
  NO_FILTERS,
  ROWS,
  SOURCE,
  activeCount,
  byDay,
  byGroup,
  dayLabel,
  filterRows,
  fromQuery,
  headline,
  medians,
  options,
  outcome,
  pct,
  search,
  sortRows,
  themeShares,
  themesOf,
  toQuery,
  type Decision,
  type Filters,
  type Group,
  type Outcome,
  type SortKey,
  type TransferRow,
} from '@/lib/transfer/explore';
import { AskSocria } from './AskSocria';

const fill = (d: Decision) => `var(--xf-${d})`;
const gpaText = (v: number | null) => (v == null ? '—' : v.toFixed(2));
const PAGE = 40;

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** A small, fixed nudge per response, so answers that share a GPA and hours do not hide each other. */
function jitter(id: number) {
  const a = Math.sin(id * 12.9898) * 43758.5453;
  const b = Math.sin(id * 78.233) * 12543.1234;
  return [a - Math.floor(a) - 0.5, b - Math.floor(b) - 0.5];
}

// ── pieces ───────────────────────────────────────────────────────────

function Key({ unknown }: { unknown?: boolean }) {
  return (
    <ul className="xf-key" aria-label="Key">
      {DECISIONS.map((d) => (
        <li key={d}>
          <span className="xf-dot" style={{ background: fill(d) }} aria-hidden />
          {DECISION_LABEL[d]}
        </li>
      ))}
      {unknown ? (
        <li>
          <span className="xf-dot is-other" aria-hidden />
          Outside your filters
        </li>
      ) : null}
    </ul>
  );
}

/** One bar split by outcome, with a 2px gap between the parts. */
function OutcomeBar({ o, tall }: { o: Outcome; tall?: boolean }) {
  return (
    <span className={`xf-obar${tall ? ' is-tall' : ''}`} aria-hidden>
      {DECISIONS.map((d) => (o[d] ? <span key={d} style={{ flexGrow: o[d], background: fill(d) }} /> : null))}
    </span>
  );
}

function Section({ id, title, note, children, wide }: { id?: string; title: string; note?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`xf-card${wide ? ' is-wide' : ''}`} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <header className="xf-card-head">
        <h2 id={id ? `${id}-h` : undefined}>{title}</h2>
        {note ? <p className="xf-card-note">{note}</p> : null}
      </header>
      {children}
    </section>
  );
}

// ── GPA × hours ──────────────────────────────────────────────────────

const ALL_GPA = ROWS.map((r) => r.gpa).filter((v): v is number => v != null);
const ALL_HOURS = ROWS.map((r) => r.hours).filter((v): v is number => v != null);
const X0 = Math.max(2, Math.floor(Math.min(...ALL_GPA) * 4) / 4);
// A few people reported far more hours than anyone else; past 110 they are drawn on the top edge and said so.
const Y1 = Math.min(110, Math.ceil(Math.max(...ALL_HOURS) / 10) * 10);
const ABOVE = ALL_HOURS.filter((v) => v > Y1).sort((a, b) => a - b);

/** Round tick steps for an axis that runs to `max`. */
function niceTicks(max: number, want = 3): number[] {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((s) => max / s <= want) ?? 500;
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

function Scatter({ shown }: { shown: ReadonlySet<number> }) {
  const [ref, w] = useWidth<HTMLDivElement>(640);
  const h = Math.round(Math.min(420, Math.max(280, w * 0.62)));
  const m = { l: 40, r: 16, t: 28, b: 38 };
  const x = (v: number) => m.l + ((v - X0) / (4 - X0)) * (w - m.l - m.r);
  const y = (v: number) => h - m.b - (v / Y1) * (h - m.t - m.b);
  const pts = useMemo(
    () =>
      ROWS.filter((r) => r.gpa != null && r.hours != null).map((r) => {
        const [jx, jy] = jitter(r.id);
        return { r, cx: x(Math.min(4, r.gpa! + jx * 0.018)), cy: y(Math.min(Y1, r.hours! + jy * 1.6)) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, h],
  );
  const [hover, setHover] = useState<{ r: TransferRow; cx: number; cy: number } | null>(null);
  const [pinned, setPinned] = useState(false);
  const live = pts.filter((p) => shown.has(p.r.id));
  const nearest = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    let best: (typeof pts)[number] | null = null;
    let bd = e.pointerType === 'touch' ? 26 * 26 : 16 * 16;
    for (const p of live) {
      const d = (p.cx - px) ** 2 + (p.cy - py) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  };
  const xt: number[] = [];
  for (let v = X0; v <= 4.0001; v += 0.25) xt.push(Math.round(v * 100) / 100);
  const yt: number[] = [];
  for (let v = 0; v <= Y1; v += Y1 > 80 ? 20 : 10) yt.push(v);
  const off = pts.length - live.length;

  return (
    <div className="xf-plot" ref={ref}>
      <svg
        width={w}
        height={h}
        role="img"
        aria-label={`GPA against credit hours for ${live.length} responses, coloured by decision.`}
        onPointerMove={(e) => {
          if (pinned) return;
          const p = nearest(e);
          setHover(p);
        }}
        onPointerLeave={() => !pinned && setHover(null)}
        onPointerDown={(e) => {
          const p = nearest(e);
          setHover(p);
          setPinned(!!p);
        }}
      >
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line className="xf-gl" x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} />
            <text className="xf-tick" x={m.l - 8} y={y(v)} dy="0.32em" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={`x${v}`} className="xf-tick" x={x(v)} y={h - m.b + 18} textAnchor="middle">
            {v.toFixed(2)}
          </text>
        ))}
        <line className="xf-axis" x1={m.l} x2={w - m.r} y1={h - m.b} y2={h - m.b} />
        <text className="xf-axis-label" x={w - m.r} y={h - 4} textAnchor="end">
          GPA →
        </text>
        <text className="xf-axis-label" x={4} y={10}>
          Credit hours ↑
        </text>
        {pts
          .filter((p) => !shown.has(p.r.id))
          .map((p) => (
            <circle key={p.r.id} className="xf-pt is-other" cx={p.cx} cy={p.cy} r={3} />
          ))}
        {live.map((p) => (
          <circle
            key={p.r.id}
            className={`xf-pt${hover?.r.id === p.r.id ? ' is-on' : ''}`}
            cx={p.cx}
            cy={p.cy}
            r={hover?.r.id === p.r.id ? 6.5 : 4.5}
            style={{ fill: fill(p.r.decision) }}
          />
        ))}
      </svg>
      {hover ? (
        <div
          className="xf-tip"
          role="status"
          style={{
            left: Math.min(Math.max(hover.cx, 120), w - 120),
            top: hover.cy,
            transform: hover.cy < 150 ? 'translate(-50%, 18px)' : 'translate(-50%, calc(-100% - 14px))',
          }}
        >
          <p className="xf-tip-title">{hover.r.major}</p>
          <p className="xf-tip-sub">{hover.r.college}</p>
          <p className="xf-tip-row">
            <span className="xf-dot" style={{ background: fill(hover.r.decision) }} aria-hidden />
            {DECISION_LABEL[hover.r.decision]}
          </p>
          <p className="xf-tip-row is-num">
            GPA {gpaText(hover.r.gpa)} · {hover.r.hours} hours · {hover.r.cap ? 'CAP' : 'External'}
          </p>
          {hover.r.extra ? <p className="xf-tip-extra">“{hover.r.extra.length > 110 ? `${hover.r.extra.slice(0, 108).trim()}…` : `${hover.r.extra}${hover.r.cut ? '…' : ''}`}”</p> : null}
        </div>
      ) : null}
      <p className="xf-plot-foot">
        {live.length} {live.length === 1 ? 'response' : 'responses'} with a GPA on the 4.0 scale and a number of hours
        {off ? `; the other ${off} in grey` : ''}.{ABOVE.length ? ` ${ABOVE.length === 1 ? `One response with ${ABOVE[0]} hours sits` : `${ABOVE.length} responses with more than ${Y1} hours sit`} on the top edge.` : ''} Tap or hover a dot.
      </p>
    </div>
  );
}

// ── outcomes by college or major ─────────────────────────────────────

function Groups({ groups, onPick, picked }: { groups: Group[]; onPick: (name: string) => void; picked: string | null }) {
  const [all, setAll] = useState(false);
  const top = all ? groups : groups.slice(0, 10);
  if (!groups.length) return <p className="xf-empty">Nothing matches these filters.</p>;
  return (
    <>
      <ol className="xf-groups">
        {top.map((g) => (
          <li key={g.name}>
            <button type="button" className={`xf-group${picked === g.name ? ' is-on' : ''}`} onClick={() => onPick(g.name)} aria-pressed={picked === g.name}>
              <span className="xf-group-name">{g.name}</span>
              <span className="xf-group-n">{g.n}</span>
              <OutcomeBar o={g} />
              <span className="xf-group-pct" title="Admitted, either major">
                {g.known ? `${pct(g.first + g.second, g)}%` : '—'}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {groups.length > 10 ? (
        <button type="button" className="xf-more" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${groups.length}`}
        </button>
      ) : null}
    </>
  );
}

// ── when decisions came ──────────────────────────────────────────────

function Timeline({ rows }: { rows: readonly TransferRow[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(640);
  const days = useMemo(() => byDay(ROWS), []);
  const shownDays = useMemo(() => {
    const m = new Map(byDay(rows).map((d) => [d.date, d]));
    return days.map((d) => m.get(d.date) ?? { ...d, n: 0, first: 0, second: 0, denied: 0, unknown: 0, known: 0 });
  }, [rows, days]);
  const [hover, setHover] = useState<number | null>(null);
  const h = 168;
  const m = { l: 28, r: 6, t: 8, b: 26 };
  const max = Math.max(1, ...days.map((d) => d.n));
  const step = (w - m.l - m.r) / days.length;
  const bw = Math.max(2, step - 2);
  const y = (v: number) => (v / max) * (h - m.t - m.b);
  const ticks = niceTicks(max);
  const every = Math.ceil(days.length / Math.max(2, Math.floor((w - m.l) / 64)));
  const d = hover != null ? shownDays[hover] : null;
  const busiest = shownDays.reduce((a, b) => (b.n > a.n ? b : a), shownDays[0]);

  return (
    <div className="xf-plot" ref={ref}>
      <svg
        width={w}
        height={h}
        role="img"
        aria-label={`Decisions per day from ${dayLabel(days[0].date)} to ${dayLabel(days[days.length - 1].date)}; the busiest day was ${dayLabel(busiest.date)} with ${busiest.n}.`}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const i = Math.floor((e.clientX - box.left - m.l) / step);
          setHover(i >= 0 && i < days.length ? i : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line className="xf-gl" x1={m.l} x2={w - m.r} y1={h - m.b - y(v)} y2={h - m.b - y(v)} />
            <text className="xf-tick" x={m.l - 6} y={h - m.b - y(v)} dy="0.32em" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {shownDays.map((day, i) => {
          let acc = 0;
          const x = m.l + i * step + (step - bw) / 2;
          return (
            <g key={day.date} opacity={hover == null || hover === i ? 1 : 0.45}>
              {DECISIONS.map((k) => {
                if (!day[k]) return null;
                const hh = y(day[k]);
                const top = h - m.b - acc - hh;
                acc += hh;
                return <rect key={k} x={x} y={top + 1} width={bw} height={Math.max(0, hh - 1)} rx={Math.min(2, bw / 2)} style={{ fill: fill(k) }} />;
              })}
              {day.n === 0 && days[i].n > 0 ? <rect className="xf-ghost" x={x} y={h - m.b - y(days[i].n)} width={bw} height={y(days[i].n)} rx={Math.min(2, bw / 2)} /> : null}
            </g>
          );
        })}
        <line className="xf-axis" x1={m.l} x2={w - m.r} y1={h - m.b} y2={h - m.b} />
        {days.map((day, i) =>
          i % every === 0 ? (
            <text key={day.date} className="xf-tick" x={m.l + i * step + step / 2} y={h - 8} textAnchor="middle">
              {dayLabel(day.date, true)}
            </text>
          ) : null,
        )}
      </svg>
      {d && hover != null ? (
        <div className="xf-tip" role="status" style={{ left: Math.min(Math.max(m.l + hover * step + step / 2, 90), w - 90), top: 0, transform: 'translate(-50%, calc(-100% - 6px))' }}>
          <p className="xf-tip-title">{dayLabel(d.date)}</p>
          {d.n ? (
            DECISIONS.filter((k) => d[k]).map((k) => (
              <p key={k} className="xf-tip-row">
                <span className="xf-dot" style={{ background: fill(k) }} aria-hidden />
                {d[k]} {DECISION_SHORT[k].toLowerCase()}
              </p>
            ))
          ) : (
            <p className="xf-tip-row">None {days[hover].n ? 'matching your filters' : 'reported'}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── what people said ─────────────────────────────────────────────────

function Themes({ rows }: { rows: readonly TransferRow[] }) {
  const { themes, answered } = useMemo(() => themeShares(rows), [rows]);
  if (answered.admitted < 3 || answered.denied < 3) {
    const few = answered.admitted < 3 && answered.denied < 3 ? 'answers' : answered.admitted < 3 ? 'admitted applicants’ answers' : 'denied applicants’ answers';
    return <p className="xf-empty">Too few {few} under these filters to compare.</p>;
  }
  const max = Math.max(1, ...themes.flatMap((t) => [t.admittedPct, t.deniedPct]));
  return (
    <>
      <ul className="xf-key is-small" aria-label="Key">
        <li>
          <span className="xf-dot" style={{ background: fill('first') }} aria-hidden />
          Admitted ({answered.admitted} answers)
        </li>
        <li>
          <span className="xf-dot" style={{ background: fill('denied') }} aria-hidden />
          Denied ({answered.denied} answers)
        </li>
      </ul>
      <ul className="xf-themes">
        {themes.map((t) => (
          <li key={t.name}>
            <span className="xf-theme-name">{t.name}</span>
            <span className="xf-theme-bars">
              <span className="xf-theme-bar">
                <span style={{ width: `${(t.admittedPct / max) * 100}%`, background: fill('first') }} />
                <em>{t.admittedPct}%</em>
              </span>
              <span className="xf-theme-bar">
                <span style={{ width: `${(t.deniedPct / max) * 100}%`, background: fill('denied') }} />
                <em>{t.deniedPct}%</em>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

// ── every response ───────────────────────────────────────────────────

function Responses({ rows }: { rows: readonly TransferRow[] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [open, setOpen] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => sortRows(search(rows, q), sort.key, sort.dir), [rows, q, sort]);
  useEffect(() => setShown(PAGE), [rows, q]);
  const head = (key: SortKey, label: string, cls = '') => {
    const on = sort.key === key;
    return (
      <th scope="col" className={cls} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => setSort({ key, dir: on && sort.dir === 'desc' ? 'asc' : on ? 'desc' : key === 'major' ? 'asc' : 'desc' })}>
          {label}
          <span className="xf-sort" aria-hidden>
            {on ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
          </span>
        </button>
      </th>
    );
  };
  return (
    <>
      <div className="xf-table-tools">
        <label className="xf-search">
          <span className="xf-visually-hidden">Search the responses</span>
          <svg viewBox="0 0 16 16" aria-hidden>
            <circle cx="7" cy="7" r="4.6" />
            <path d="M10.4 10.4 14 14" />
          </svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search majors, colleges, extracurriculars" />
        </label>
        <p className="xf-count" aria-live="polite">
          {list.length} of {rows.length}
        </p>
      </div>
      <div className="xf-table-wrap">
        <table className="xf-table">
          <thead>
            <tr>
              {head('decision', 'Decision')}
              {head('major', 'Major')}
              {head('gpa', 'GPA', 'is-num')}
              {head('hours', 'Hours', 'is-num')}
              <th scope="col" className="is-wide-only">
                Applicant
              </th>
              {head('date', 'Date', 'is-wide-only')}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, shown).map((r) => {
              const isOpen = open === r.id;
              const themes = themesOf(r.extra);
              return [
                <tr key={r.id} className={`xf-row${isOpen ? ' is-open' : ''}`} onClick={() => setOpen(isOpen ? null : r.id)}>
                  <td>
                    <span className="xf-decision">
                      <span className="xf-dot" style={{ background: fill(r.decision) }} aria-hidden />
                      <span>{DECISION_SHORT[r.decision]}</span>
                    </span>
                  </td>
                  <td>
                    <button type="button" className="xf-row-btn" aria-expanded={isOpen} onClick={(e) => (e.stopPropagation(), setOpen(isOpen ? null : r.id))}>
                      <span className="xf-major">{r.major}</span>
                      <span className="xf-college">{r.college}</span>
                    </button>
                  </td>
                  <td className="is-num">{r.gpa != null ? gpaText(r.gpa) : r.gpaRaw ? <span className="xf-raw">{r.gpaRaw}</span> : '—'}</td>
                  <td className="is-num">{r.hours ?? (r.hoursRaw ? <span className="xf-raw">…</span> : '—')}</td>
                  <td className="is-wide-only">
                    {r.cap ? <span className="xf-tag">CAP</span> : 'External'}
                    {r.residency && r.residency !== 'In-state' ? <span className="xf-res"> · {r.residency}</span> : null}
                  </td>
                  <td className="is-wide-only xf-date">{dayLabel(r.date, true)}</td>
                </tr>,
                isOpen ? (
                  <tr key={`${r.id}-d`} className="xf-detail">
                    <td colSpan={6}>
                      <div className="xf-detail-in">
                        <div className="xf-detail-said">
                          <p className="xf-label">Most significant extracurricular, in their words</p>
                          <p className="xf-quote">{r.extra ? `“${r.extra}${r.cut ? '…' : ''}”` : <span className="xf-muted">Nothing given.</span>}</p>
                          {themes.length ? (
                            <p className="xf-chips">
                              {themes.map((t) => (
                                <span key={t} className="xf-chip">
                                  {t}
                                </span>
                              ))}
                            </p>
                          ) : null}
                        </div>
                        <dl className="xf-facts">
                          <div>
                            <dt>Decision</dt>
                            <dd>{DECISION_LABEL[r.decision]}</dd>
                          </div>
                          <div>
                            <dt>Applied as</dt>
                            <dd>{r.cap ? 'CAP' : 'External transfer'}</dd>
                          </div>
                          <div>
                            <dt>Residency</dt>
                            <dd>{r.residency ?? 'Not said'}</dd>
                          </div>
                          <div>
                            <dt>Decision date</dt>
                            <dd>{dayLabel(r.date)} 2026</dd>
                          </div>
                          {r.majorRaw || r.note ? (
                            <div>
                              <dt>Major as written</dt>
                              <dd>{[r.majorRaw, r.note].filter(Boolean).join(' · ')}</dd>
                            </div>
                          ) : null}
                          {r.gpaRaw ? (
                            <div>
                              <dt>GPA as written</dt>
                              <dd>{r.gpaRaw}</dd>
                            </div>
                          ) : null}
                          {r.hoursRaw ? (
                            <div>
                              <dt>Hours as written</dt>
                              <dd>{r.hoursRaw}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
        {!list.length ? <p className="xf-empty">No responses match. Try fewer words or wider filters.</p> : null}
      </div>
      {list.length > shown ? (
        <button type="button" className="xf-more is-block" onClick={() => setShown(list.length)}>
          Show all {list.length} responses
        </button>
      ) : null}
    </>
  );
}

// ── the page ─────────────────────────────────────────────────────────

function Select({ label, value, onChange, children, disabled }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={`xf-select${value ? ' is-set' : ''}`}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {children}
      </select>
    </label>
  );
}

export function TransferExplorer() {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [ask, setAsk] = useState(false);
  const ready = useRef(false);

  useEffect(() => {
    setF(fromQuery(window.location.search));
    ready.current = true;
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    const url = `${window.location.pathname}${toQuery(f)}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', url);
  }, [f]);

  const set = (patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch }));
  const rows = useMemo(() => filterRows(ROWS, f), [f]);
  const shown = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const o = outcome(rows);
  const med = medians(rows);
  const head = headline(f, o);
  const colleges = useMemo(() => options(ROWS, 'college'), []);
  const majors = useMemo(() => options(f.college ? ROWS.filter((r) => r.college === f.college) : ROWS, 'major'), [f.college]);
  const residencies = useMemo(() => options(ROWS, 'residency'), []);
  const groupKey = f.college ? 'major' : 'college';
  const groups = useMemo(() => byGroup(filterRows(ROWS, { ...f, [groupKey]: null, ...(groupKey === 'college' ? { major: null } : {}) }), groupKey), [f, groupKey]);
  const all = outcome(ROWS);
  const n = activeCount(f);
  const dates = ROWS.map((r) => r.date).sort();

  return (
    <div className="xf">
      <div className="xf-wrap">
        <header className="xf-top">
          <Link href="/" className="xf-brand" aria-label="Socria home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/socria-mark.png" alt="" width={24} height={22} />
            <span>Socria</span>
          </Link>
          <a className="xf-top-link" href="#about">
            About this data
          </a>
        </header>

        <section className="xf-hero">
          <p className="xf-eyebrow">UT Austin · Fall 2026 transfer decisions</p>
          <h1>
            Who got in, <em>and with what.</em>
          </h1>
          <p className="xf-lede">
            {all.n} transfer applicants shared their decision, GPA, credit hours and the one thing they think mattered most. Filter it down to
            people like you.
          </p>
          <button type="button" className="xf-ask-btn" onClick={() => setAsk(true)}>
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
            </svg>
            Reason through it with Socria
          </button>
        </section>

        <div className="xf-filters" role="group" aria-label="Filters">
          <div className="xf-seg" role="radiogroup" aria-label="Applied as">
            {(
              [
                ['all', 'Everyone'],
                ['cap', 'CAP'],
                ['external', 'External'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={f.applicant === k} className={f.applicant === k ? 'is-on' : ''} onClick={() => set({ applicant: k })}>
                {label}
              </button>
            ))}
          </div>
          <Select label="College" value={f.college ?? ''} onChange={(v) => set({ college: v || null, major: null })}>
            <option value="">Any college</option>
            {colleges.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value} ({c.n})
              </option>
            ))}
          </Select>
          <Select label="Major" value={f.major ?? ''} onChange={(v) => set({ major: v || null })}>
            <option value="">Any major</option>
            {majors.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value} ({c.n})
              </option>
            ))}
          </Select>
          <Select label="GPA" value={f.gpa ?? ''} onChange={(v) => set({ gpa: v || null })}>
            <option value="">Any GPA</option>
            {GPA_BANDS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </Select>
          <Select label="Credit hours" value={f.hours ?? ''} onChange={(v) => set({ hours: v || null })}>
            <option value="">Any hours</option>
            {HOURS_BANDS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </Select>
          <Select label="Residency" value={f.residency ?? ''} onChange={(v) => set({ residency: v || null })}>
            <option value="">Anywhere</option>
            {residencies.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value} ({c.n})
              </option>
            ))}
          </Select>
          {n ? (
            <button type="button" className="xf-clear" onClick={() => setF(NO_FILTERS)}>
              Clear {n === 1 ? 'filter' : `${n} filters`}
            </button>
          ) : null}
        </div>

        <section className="xf-headline" aria-live="polite">
          <div className="xf-headline-words">
            <p className="xf-lead">{head.lead}</p>
            <p className="xf-result">{head.result}</p>
          </div>
          {o.known ? (
            <div className="xf-split">
              <OutcomeBar o={o} tall />
              <dl className="xf-stats">
                {DECISIONS.map((d) => (
                  <div key={d}>
                    <dt>
                      <span className="xf-dot" style={{ background: fill(d) }} aria-hidden />
                      {DECISION_LABEL[d]}
                    </dt>
                    <dd>
                      <strong>{o[d]}</strong>
                      <span>{pct(o[d], o)}%</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <dl className="xf-medians">
                <div>
                  <dt>Median GPA</dt>
                  <dd>
                    <span>
                      admitted <strong>{gpaText(med.gpa.admitted)}</strong>
                    </span>
                    <span>
                      denied <strong>{gpaText(med.gpa.denied)}</strong>
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Median credit hours</dt>
                  <dd>
                    <span>
                      admitted <strong>{med.hours.admitted ?? '—'}</strong>
                    </span>
                    <span>
                      denied <strong>{med.hours.denied ?? '—'}</strong>
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </section>

        <div className="xf-grid">
          <Section title="GPA and credit hours" note="Each dot is one person. Your filters are in colour." wide>
            <Key unknown={rows.length < ROWS.length} />
            <Scatter shown={shown} />
          </Section>

          <Section
            title={f.college ? `Majors in ${f.college}` : 'By college'}
            note={
              f.college ? (
                <>
                  Press a major to filter by it.{' '}
                  <button type="button" className="xf-inline" onClick={() => set({ college: null, major: null })}>
                    Back to every college
                  </button>
                </>
              ) : (
                'Share admitted on the right. Press a college to see its majors.'
              )
            }
          >
            <Groups
              groups={groups}
              picked={f.college ? f.major : f.college}
              onPick={(name) => (f.college ? set({ major: f.major === name ? null : name }) : set({ college: name, major: null }))}
            />
          </Section>

          <Section title="What they said mattered most" note="How often admitted and denied applicants named each kind of thing, sorted by keyword. What people chose to mention, not what decided anything.">
            <Themes rows={rows} />
          </Section>

          <Section title="When decisions came" note={`Decision dates people gave, ${dayLabel(dates[0])} to ${dayLabel(dates[dates.length - 1])}. Outlines are days with no one matching your filters.`} wide>
            <Timeline rows={rows} />
          </Section>

          <Section id="responses" title="Every response" note="Press a row to read what they said and the details as they wrote them." wide>
            <Responses rows={rows} />
          </Section>
        </div>

        <footer className="xf-about" id="about">
          <h2>About this data</h2>
          <div className="xf-about-cols">
            <p>
              These are answers to a form that UT Austin transfer applicants filled in themselves, the <em>Fall 2026 UT Austin External Transfer Forum
              Responses</em>: {all.n + SOURCE.left_out} responses with decision dates from {dayLabel(dates[0])} to {dayLabel(dates[dates.length - 1])} 2026. Nobody checked
              them, and the people who answer a form like this are not a fair sample of everyone who applied, so read the shares as what this group
              reported, not as anyone&rsquo;s odds.
            </p>
            <p>
              To make it searchable, majors were matched to UT&rsquo;s own names, and the wording people used is kept on each response. A GPA above 4.0
              (weighted) or hours written in words are shown as written and left out of the charts and medians. One response with impossible numbers (a
              GPA of 6 and 12,345 hours) was left out. Long answers were cut off in the source and end with an ellipsis.
            </p>
            <p>Socria is not part of UT Austin, and nothing here is advice from the university.</p>
          </div>
          <p className="xf-cta">
            Working on your own application?{' '}
            <button type="button" className="xf-inline" onClick={() => setAsk(true)}>
              Think it through with Socria
            </button>
          </p>
        </footer>
      </div>
      <AskSocria open={ask} setOpen={setAsk} filters={f} rows={rows} />
    </div>
  );
}
