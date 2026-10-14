// components/dashboard/charts.tsx
//
// The developer dashboard's few chart forms, server-rendered as plain HTML.
//
// HTML, not a scaled SVG: a column chart in a viewBox stretched to the card
// distorts its rounded ends and its text, and these cards are fluid from a
// phone to a wide desktop. Flex columns and bars keep text crisp at any width.
//
// The rules they follow (the dataviz method this codebase uses):
//   - one hue for a single series (the moss mark), gray for what is context
//     ("skipped", "no conversations yet"); categorical slots, in fixed order,
//     only for part-to-whole — and colour always follows the category, never
//     its rank, so a filter cannot repaint anything
//   - thin marks: bars at most 24px, 4px rounded at the data end, square at
//     the baseline, a 2px surface gap between touching segments
//   - every mark is focusable and labelled; hovering or focusing one shows
//     its value (components/dashboard/DashboardTooltip.tsx), and every chart
//     has a table view, so no value is reachable only by hovering
//   - text wears ink, never the series colour: a swatch beside the label
//     carries identity
//
// No hooks, no state: these render on the server and ship no JavaScript.

import type { ReactNode } from 'react';
import type { Bar, Kpi } from '@/lib/dashboard/types';

// ── numbers ─────────────────────────────────────────────────────────────

export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 10_000) return `${(n / 1000).toFixed(a >= 100_000 ? 0 : 1)}K`;
  return n.toLocaleString('en-US');
}

export function pct(n: number, of: number): string {
  if (!of) return '—';
  const p = (100 * n) / of;
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDate(t: number): string {
  const d = new Date(t);
  return `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** A tick top that reads as a number, not as an accident: 1, 2, 5 × 10^k. */
function niceMax(v: number): number {
  if (v <= 4) return Math.max(1, Math.ceil(v));
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// ── frames ──────────────────────────────────────────────────────────────

export function Card({ title, sub, children, wide = false, table }: { title: string; sub?: ReactNode; children: ReactNode; wide?: boolean; table?: ReactNode }) {
  return (
    <section className={`dash-card${wide ? ' is-wide' : ''}`} aria-label={title}>
      <header className="dash-card-head">
        <h3>{title}</h3>
        {sub ? <p>{sub}</p> : null}
      </header>
      {children}
      {table ? (
        <details className="dash-table-toggle">
          <summary>Show as a table</summary>
          {table}
        </details>
      ) : null}
    </section>
  );
}

export function BarsTable({ bars, head = ['', 'Count', 'Share'], total }: { bars: Bar[]; head?: string[]; total?: number }) {
  const of = total ?? bars.reduce((s, b) => s + b.n, 0);
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.id}>
              <th scope="row">{b.label}</th>
              <td>{b.n.toLocaleString('en-US')}</td>
              {head.length > 2 ? <td>{pct(b.n, of)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── figures ─────────────────────────────────────────────────────────────

export function Hero({ kpi }: { kpi: Kpi }) {
  return (
    <div className="dash-hero">
      <span className="dash-hero-label">{kpi.label}</span>
      <span className="dash-hero-value">{compact(kpi.value)}</span>
      {kpi.hint ? <span className="dash-hero-hint">{kpi.hint}</span> : null}
    </div>
  );
}

export function StatTile({ kpi }: { kpi: Kpi }) {
  const d = kpi.delta;
  return (
    <div className="dash-tile">
      <span className="dash-tile-label">{kpi.label}</span>
      <span className="dash-tile-value">{kpi.display ?? compact(kpi.value)}</span>
      {kpi.hint ? <span className="dash-tile-hint">{kpi.hint}</span> : null}
      {d ? (
        <span className={`dash-tile-delta ${d.n > 0 ? 'is-up' : d.n < 0 ? 'is-down' : 'is-flat'}`}>
          <span aria-hidden="true">{d.n > 0 ? '▲' : d.n < 0 ? '▼' : '■'}</span> {d.n > 0 ? '+' : ''}
          {d.n.toLocaleString('en-US')} <span className="dash-tile-vs">vs {d.vs}</span>
        </span>
      ) : null}
    </div>
  );
}

// ── charts ──────────────────────────────────────────────────────────────

/**
 * Columns over time (or over ordered bins), one series. Labels on the first,
 * middle and last column only; every column's value is on hover, on focus,
 * and in the table.
 */
export function Columns({ bins, unit, label }: { bins: { label: string; start?: number; n: number; muted?: boolean }[]; unit?: 'day' | 'week'; label: string }) {
  const max = niceMax(Math.max(0, ...bins.map((b) => b.n)));
  // Time: the first, middle and last dates are enough, and more collide.
  // Ordered categories (0, 1, 2–4 …) are each a label worth reading.
  const timeline = bins.some((b) => b.start !== undefined);
  const shown = new Set(timeline ? [0, Math.floor((bins.length - 1) / 2), bins.length - 1] : bins.map((_, i) => i));
  const tickLabel = (b: { label: string; start?: number }) => (b.start !== undefined ? (unit === 'week' ? `w/c ${shortDate(b.start)}` : shortDate(b.start)) : b.label);
  return (
    <div className="dash-cols" role="group" aria-label={label}>
      <div className="dash-cols-axis" aria-hidden="true">
        <span>{compact(max)}</span>
        <span>{compact(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="dash-cols-plot">
        <div className="dash-gridlines" aria-hidden="true">
          <i />
          <i />
          <i className="is-base" />
        </div>
        <div className="dash-cols-bars" style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }}>
          {bins.map((b, i) => (
            <div
              key={`${b.label}-${i}`}
              className={`dash-col${b.muted ? ' is-muted' : ''}`}
              tabIndex={0}
              aria-label={`${tickLabel(b)}: ${b.n}`}
              data-tip-value={b.n.toLocaleString('en-US')}
              data-tip-label={tickLabel(b)}
            >
              <span className="dash-col-mark" style={{ height: `${max ? (100 * b.n) / max : 0}%` }} />
            </div>
          ))}
        </div>
        <div className={`dash-cols-x${timeline ? '' : ' is-categories'}`} aria-hidden="true" style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }}>
          {bins.map((b, i) => (
            <span key={i}>{shown.has(i) ? tickLabel(b) : ''}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal bars, one series: a label, a thin bar, the value at its tip.
 * `of` is what a bar's share is a share of (defaults to the bars' total).
 */
export function BarList({ bars, of, label, empty = 'Nothing counted yet.' }: { bars: Bar[]; of?: number; label: string; empty?: string }) {
  const total = of ?? bars.reduce((s, b) => s + b.n, 0);
  const max = Math.max(1, ...bars.map((b) => b.n));
  if (!bars.some((b) => b.n > 0)) return <p className="dash-empty">{empty}</p>;
  return (
    <ul className="dash-bars" aria-label={label}>
      {bars.map((b) => (
        <li
          key={b.id}
          className={b.muted ? 'is-muted' : undefined}
          tabIndex={0}
          aria-label={`${b.label}: ${b.n}, ${pct(b.n, total)}`}
          data-tip-value={`${b.n.toLocaleString('en-US')} · ${pct(b.n, total)}`}
          data-tip-label={b.label}
        >
          <span className="dash-bar-label">{b.label}</span>
          <span className="dash-bar-track" aria-hidden="true">
            {b.n > 0 ? <span className="dash-bar-mark" style={{ width: `${(100 * b.n) / max}%` }} /> : null}
          </span>
          <span className="dash-bar-value">
            {b.n.toLocaleString('en-US')} <span className="dash-bar-share">{pct(b.n, total)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Part-to-whole: one stacked bar and a legend that is also the readout.
 * Colour follows each part's position in its fixed list, so the same
 * category is the same colour whatever the counts.
 */
export function Stacked({ parts, label }: { parts: Bar[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  if (!total) return <p className="dash-empty">No accounts in this range yet.</p>;
  // Five categorical slots and no more: a sixth colour would be a cycled or
  // generated one. Past five, the honest form is a list of bars.
  if (parts.filter((p) => !p.muted).length > 5) return <BarList bars={parts} label={label} />;
  return (
    <div className="dash-stack" role="group" aria-label={label}>
      <div className="dash-stack-bar">
        {parts.map((p, i) =>
          p.n ? (
            <span
              key={p.id}
              className={`dash-seg ${p.muted ? 'is-muted' : `s${(i % 5) + 1}`}`}
              style={{ flexGrow: p.n }}
              tabIndex={0}
              aria-label={`${p.label}: ${p.n}, ${pct(p.n, total)}`}
              data-tip-value={`${p.n.toLocaleString('en-US')} · ${pct(p.n, total)}`}
              data-tip-label={p.label}
            />
          ) : null
        )}
      </div>
      <ul className="dash-legend">
        {parts.map((p, i) => (
          <li key={p.id}>
            <span className={`dash-swatch ${p.muted ? 'is-muted' : `s${(i % 5) + 1}`}`} aria-hidden="true" />
            <span className="dash-legend-label">{p.label}</span>
            <span className="dash-legend-value">
              {p.n.toLocaleString('en-US')} <span className="dash-bar-share">{pct(p.n, total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
