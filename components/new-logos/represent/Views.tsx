'use client';
// components/new-logos/represent/Views.tsx — THE SAME INFORMATION, SHOWN ANOTHER WAY (an item's `view`).
//
// Every view here is drawn from the item's own data, live — nothing is copied: a table drawn as a plot follows the
// table as its cells change; its measures (totals, averages, extremes) are worked out from it; a plot's table is its
// functions read at even steps; an equation's graph is the function itself. Changing the view back loses nothing,
// because the data was never touched (lib/new-logos/engine/transforms.ts).

import { computeTable, evalIn } from '@/lib/new-logos/compose';
import { formatNumber } from '@/lib/new-logos/expr';
import type { ItemOf } from '@/lib/new-logos/representation';
import type { ArtifactOp } from '@/lib/new-logos/artifact-ops';
import type { Primitive } from '@/lib/new-logos/primitives';
import { PrimitiveBody } from '../primitives/Primitive';
import type { RepModel } from './RepObject';

const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : formatNumber(v, 4));

function cellsOf(it: ItemOf<'matrix'>, model: RepModel) {
  if (it.prim.type !== 'table') return null;
  const data = it.prim.data;
  return { data, rows: computeTable(data, model.scope) };
}

/** A table as a plot: one number column across, another up — the table's own data, followed as it changes. */
export function TableAsPlot({ it, model, selected, run }: { it: ItemOf<'matrix'>; model: RepModel; selected: boolean; run: (ops: ArtifactOp[]) => void }) {
  const c = cellsOf(it, model);
  if (!c) return null;
  const nums = c.data.columns.filter((col) => col.kind !== 'text');
  const xc = c.data.columns.find((col) => col.id === it.view?.x) ?? nums[0];
  const yc = c.data.columns.find((col) => col.id === it.view?.y) ?? nums[1];
  if (!xc || !yc) return <p className="nl-hint">A plot needs two columns of numbers.</p>;
  const xs = c.rows.map((r) => r[xc.id]?.value).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  const lo = xs.length ? Math.min(...xs) : 0, hi = xs.length ? Math.max(...xs) : 1;
  const pad = (hi - lo || 1) * 0.08;
  const plot = {
    id: `${it.prim.id}`,
    type: 'plot',
    x: 0,
    y: 0,
    w: 420,
    h: 260,
    label: '',
    data: { x: { min: lo - pad, max: hi + pad, label: xc.name }, y: { min: 0, max: 1, label: yc.name, auto: true }, grid: true, series: [{ id: 's1', kind: 'table', table: it.prim.id, x: xc.key, y: yc.key, label: yc.name, mark: 'line', style: 'solid' }] },
  } as unknown as Primitive;
  return (
    <div className="nl-r-prim is-plot">
      <PrimitiveBody p={plot} comp={model.comp} scope={model.scope} editable={false} selected={selected} run={run} />
    </div>
  );
}

/** A table as bars: one number column against the rows' names. */
export function TableAsBars({ it, model }: { it: ItemOf<'matrix'> & { view?: { y?: string; x?: string } }; model: RepModel }) {
  const c = cellsOf(it, model);
  if (!c) return null;
  const yc = c.data.columns.find((col) => col.id === it.view?.y) ?? c.data.columns.find((col) => col.kind !== 'text');
  const lc = c.data.columns.find((col) => col.id === it.view?.x) ?? c.data.columns.find((col) => col.kind === 'text');
  if (!yc) return <p className="nl-hint">Bars need a column of numbers.</p>;
  const rows = c.rows.map((r, k) => ({ label: lc ? r[lc.id]?.text || `Row ${k + 1}` : `Row ${k + 1}`, v: r[yc.id]?.value ?? null }));
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.v ?? 0))) || 1;
  return (
    <figure className="nl-r-bars" aria-label={`${yc.name} by ${lc?.name ?? 'row'}`}>
      <figcaption className="nl-r-label">{yc.name}</figcaption>
      {rows.map((r, k) => (
        <div key={k} className="nl-r-bar">
          <span className="nl-r-bar-label">{r.label}</span>
          <span className="nl-r-bar-track">
            <span className="nl-r-bar-fill" style={{ width: `${(Math.abs(r.v ?? 0) / max) * 100}%` }} />
          </span>
          <span className="nl-r-bar-value">{num(r.v)}</span>
        </div>
      ))}
    </figure>
  );
}

/** A table as measures: each number column's total, average and extremes, worked out from it. */
export function TableAsMetrics({ it, model }: { it: ItemOf<'matrix'>; model: RepModel }) {
  const c = cellsOf(it, model);
  if (!c) return null;
  const cols = c.data.columns.filter((col) => col.kind !== 'text');
  return (
    <div className="nl-r-metrics">
      {cols.map((col) => {
        const vs = c.rows.map((r) => r[col.id]?.value).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
        const total = vs.reduce((a, b) => a + b, 0);
        return (
          <div key={col.id} className="nl-r-metricset">
            <div className="nl-r-label">{col.name}</div>
            <div className="nl-r-mrow">
              <span>
                <b>{num(total)}</b> total
              </span>
              <span>
                <b>{num(vs.length ? total / vs.length : null)}</b> average
              </span>
              <span>
                <b>{num(vs.length ? Math.min(...vs) : null)}</b>–<b>{num(vs.length ? Math.max(...vs) : null)}</b>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A plot as the table of its functions' values at even steps across its range. */
export function PlotAsTable({ it, model }: { it: ItemOf<'plot'>; model: RepModel }) {
  if (it.prim.type !== 'plot') return null;
  const d = it.prim.data;
  const fns = d.series.filter((s): s is Extract<typeof s, { kind: 'fn' }> => s.kind === 'fn');
  const n = 9;
  const xs = Array.from({ length: n }, (_, k) => d.x.min + ((d.x.max - d.x.min) * k) / (n - 1));
  return (
    <table className="nl-r-table">
      <thead>
        <tr>
          <th>{d.x.label || 'x'}</th>
          {fns.map((s) => (
            <th key={s.id}>{s.label || `y = ${s.expr}`}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {xs.map((x) => (
          <tr key={x}>
            <td>{num(x)}</td>
            {fns.map((s) => (
              <td key={s.id}>{num(evalIn(model.scope, s.expr, { x }).value)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** An equation that is a function of x, drawn. */
export function EquationAsPlot({ it, model, selected, run }: { it: ItemOf<'equation'>; model: RepModel; selected: boolean; run: (ops: ArtifactOp[]) => void }) {
  if (it.prim.type !== 'equation') return null;
  const d = it.prim.data;
  const expr = d.params.includes('x') && d.name ? `${d.name}(x)` : d.expr;
  const plot = {
    id: `${it.prim.id}`,
    type: 'plot',
    x: 0,
    y: 0,
    w: 420,
    h: 260,
    label: '',
    data: { x: { min: -10, max: 10, label: 'x' }, y: { min: -10, max: 10, label: d.name || 'y', auto: true }, grid: true, series: [{ id: 's1', kind: 'fn', expr, label: d.name ? `${d.name}${d.params.length ? `(${d.params.join(', ')})` : ''}` : '', style: 'solid' }] },
  } as unknown as Primitive;
  return (
    <div className="nl-r-prim is-plot">
      <PrimitiveBody p={plot} comp={model.comp} scope={model.scope} editable={false} selected={selected} run={run} />
    </div>
  );
}
