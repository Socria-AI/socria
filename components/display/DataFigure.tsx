'use client';

// components/display/DataFigure.tsx — a table of numbers, and the charts it can be.
//
// Where every bar, point and slice goes is the kind's (lib/objects/
// display-data.ts: barLayout, xyLayout, pieLayout, histogramLayout,
// heatmapLayout — fractions of the plot, a negative bar below the zero line,
// a line broken where a value is missing). This draws them on PlotFrame and
// turns what the person does into operations: a cell typed, a bar clicked and
// its value changed where it stands, a row or column added, the columns
// drawn chosen. Where the numbers came from is said first, always.

import { useState } from 'react';
import {
  availability,
  barLayout,
  bindingsFor,
  displayOrder,
  fmtNum,
  heatmapLayout,
  histogramLayout,
  pieLayout,
  xyLayout,
  DATA_LIMITS,
  VIEW_NAME,
  type DataColumn,
  type DataState,
  type Scale,
} from '@/lib/objects/display-data';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { Confirm, Field, Inspector, NumberEdit, Stepper, Tool, useSelection } from './primitives';
import { PlotFrame, type Tick } from './PlotFrame';
import './data.css';

type D = Display<DataState>;
const SERIES = ['is-s0', 'is-s1', 'is-s2', 'is-s3'];
const BASIS: Record<DataState['basis'], { said: string; cls: string }> = {
  given: { said: 'Your numbers', cls: 'is-given' },
  source: { said: 'From your file', cls: 'is-source' },
  illustrative: { said: 'Example numbers — not yours', cls: 'is-example' },
};

const ticksOf = (sc: Scale): Tick[] => sc.ticks.map((v) => ({ at: sc.hi === sc.lo ? 0.5 : (v - sc.lo) / (sc.hi - sc.lo), label: fmtNum(v) }));
const titled = (c: DataColumn | null | undefined) => (c ? `${c.name}${c.unit ? ` (${c.unit})` : ''}` : undefined);
/** one series: its name; several: the unit they share (the legend names them) */
const yTitleOf = (ys: DataColumn[]) => (ys.length === 1 ? titled(ys[0]) : ys.length && ys.every((c) => c.unit && c.unit === ys[0].unit) ? ys[0].unit : undefined);

export function DataFigure(p: FigureProps) {
  const d = useDisplay<DataState>(p);
  const [sel, select] = useSelection(p);
  const [binding, setBinding] = useState(false);
  const s = d.state;
  const off = availability(s)[s.view];
  const cell = sel?.startsWith('cell:') ? sel.slice(5).split('|') : null;
  const b = BASIS[s.basis];
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={`${s.rows.length} row${s.rows.length === 1 ? '' : 's'}`}
      tools={
        <>
          {s.view !== 'table' && (
            <Tool label="Choose what is drawn" on={binding} onClick={() => setBinding((v) => !v)}>
              Columns
            </Tool>
          )}
          <Tool label="Add a row" onClick={() => d.act('addRow', { values: s.columns.map(() => '').join('|'), by: 'person' })} disabled={s.rows.length >= DATA_LIMITS.rows}>
            + Row
          </Tool>
        </>
      }
    >
      <p className={`dsp-data-basis ${b.cls}`}>
        {b.said}
        {d.live && s.basis === 'illustrative' && (
          <button type="button" className="dsp-tool" onClick={() => d.act('basis', { basis: 'given' })}>
            These are mine
          </button>
        )}
      </p>
      {binding && s.view !== 'table' && <Bindings s={s} d={d} />}
      {s.view === 'table' ? (
        <Table s={s} d={d} sel={sel} select={select} />
      ) : off ? (
        <p className="dsp-empty">{off}</p>
      ) : (
        <Chart s={s} d={d} sel={sel} select={select} />
      )}
      {cell && <CellInspector s={s} d={d} row={Number(cell[0])} col={cell[1]} onClose={() => select(null)} />}
      {s.view !== 'table' && !off && <Numbers s={s} />}
    </DisplayShell>
  );
}

/** Which column goes along, which are drawn against it. */
function Bindings({ s, d }: { s: DataState; d: D }) {
  const b = bindingsFor(s, s.view);
  const nums = s.columns.filter((c) => c.type === 'number');
  return (
    <div className="dsp-row dsp-data-bind">
      <Field label={s.view === 'histogram' ? 'Values' : 'Along the bottom'}>
        <select value={b.x?.id ?? ''} onChange={(e) => d.act('bind', { x: e.target.value })}>
          {s.columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      {s.view !== 'histogram' && (
        <Field label="Drawn">
          <span className="dsp-data-series">
            {nums.map((c) => {
              const on = b.y.some((x) => x.id === c.id);
              return (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = on ? b.y.filter((x) => x.id !== c.id).map((x) => x.id) : [...b.y.map((x) => x.id), c.id];
                      d.act('bind', { y: next.join(',') });
                    }}
                  />
                  {c.name}
                </label>
              );
            })}
          </span>
        </Field>
      )}
      {s.view === 'histogram' && (
        <Field label="Bins">
          <Stepper value={histogramLayout(s)?.bars.length ?? 5} min={DATA_LIMITS.minBins} max={DATA_LIMITS.maxBins} label="Bins" onChange={(n) => d.act('bins', { n })} />
        </Field>
      )}
    </div>
  );
}

/** The chart the view asks for, from the kind's layout. */
function Chart({ s, d, sel, select }: { s: DataState; d: D; sel: string | null; select: (id: string | null) => void }) {
  const pick = (row: number, col: string) => select(sel === `cell:${row}|${col}` ? null : `cell:${row}|${col}`);
  const isSel = (row: number, col: string) => sel === `cell:${row}|${col}`;
  const b = bindingsFor(s, s.view);
  if (s.view === 'bar') {
    const L = barLayout(s);
    if (!L) return null;
    const step = L.groups.length ? 1 / L.groups.length : 1;
    return (
      <>
        <Legend names={L.series.map((x) => x.name)} />
        <PlotFrame label={`Bar chart of ${L.series.map((x) => x.name).join(', ')} by ${b.x?.name ?? ''}`} yTicks={ticksOf(L.scale)} baseline={L.baseline} xTicks={L.groups.map((g, i) => ({ at: (i + 0.5) * step, label: g.label }))} xTitle={titled(b.x)} yTitle={yTitleOf(b.y)}>
          {(pl) =>
            L.bars.map((r) => (
              <rect
                key={`${r.row}:${r.series}`}
                className={`dsp-data-bar ${SERIES[r.series % 4]}${isSel(r.row, r.col) ? ' is-sel' : ''}${r.value < 0 ? ' is-neg' : ''}`}
                x={pl.px(r.x0)}
                width={Math.max(1, pl.px(r.x1) - pl.px(r.x0))}
                y={pl.py(r.y1)}
                height={Math.max(0.5, pl.py(r.y0) - pl.py(r.y1))}
                onClick={() => pick(r.row, r.col)}
                tabIndex={0}
                role="button"
                aria-label={`${L.groups.find((g) => g.row === r.row)?.label}: ${fmtNum(r.value)}`}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(r.row, r.col))}
              >
                <title>{`${L.groups.find((g) => g.row === r.row)?.label}: ${fmtNum(r.value)}`}</title>
              </rect>
            ))
          }
        </PlotFrame>
      </>
    );
  }
  if (s.view === 'line' || s.view === 'area' || s.view === 'scatter') {
    const L = xyLayout(s, s.view);
    if (!L) return null;
    const xTicks: Tick[] = L.xCats ? L.xCats : L.xDates ? L.xDates.ticks.map((t) => ({ at: t.at, label: t.label })) : L.xScale ? ticksOf(L.xScale) : [];
    const zero = L.yScale.lo < 0 && L.yScale.hi > 0 ? (0 - L.yScale.lo) / (L.yScale.hi - L.yScale.lo) : null;
    return (
      <>
        <Legend names={L.series.map((x) => x.name)} />
        <PlotFrame label={`${VIEW_NAME[s.view]} of ${L.series.map((x) => x.name).join(', ')} against ${L.x.name}`} yTicks={ticksOf(L.yScale)} xTicks={xTicks} baseline={zero} xTitle={titled(b.x)} yTitle={yTitleOf(b.y)}>
          {(pl) =>
            L.series.map((sr, si) => {
              // a missing value breaks the line: one path per unbroken run
              const runs: (typeof sr.points)[] = [];
              for (const pt of sr.points) {
                if (!runs.length || pt.gap) runs.push([]);
                runs[runs.length - 1].push(pt);
              }
              const base = pl.py(zero ?? 0);
              return (
                <g key={sr.col} className={`dsp-data-series-g ${SERIES[si % 4]}`}>
                  {s.view !== 'scatter' &&
                    runs.map((run, k) =>
                      run.length ? (
                        <g key={k}>
                          {s.view === 'area' && run.length > 1 && (
                            <path className="dsp-data-area" d={`M${pl.px(run[0].x)},${base} ${run.map((pt) => `L${pl.px(pt.x)},${pl.py(pt.y)}`).join(' ')} L${pl.px(run[run.length - 1].x)},${base} Z`} />
                          )}
                          <path className="dsp-data-line" d={run.map((pt, i) => `${i ? 'L' : 'M'}${pl.px(pt.x)},${pl.py(pt.y)}`).join(' ')} />
                        </g>
                      ) : null
                    )}
                  {sr.points.map((pt) => (
                    <circle
                      key={pt.row}
                      className={`dsp-data-pt${isSel(pt.row, sr.col) ? ' is-sel' : ''}`}
                      cx={pl.px(pt.x)}
                      cy={pl.py(pt.y)}
                      r={s.view === 'scatter' ? 4.5 : 3.5}
                      tabIndex={0}
                      role="button"
                      aria-label={`${pt.xv}: ${fmtNum(pt.yv)}`}
                      onClick={() => pick(pt.row, sr.col)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(pt.row, sr.col))}
                    >
                      <title>{`${pt.xv}: ${fmtNum(pt.yv)}`}</title>
                    </circle>
                  ))}
                </g>
              );
            })
          }
        </PlotFrame>
      </>
    );
  }
  if (s.view === 'pie') {
    const L = pieLayout(s);
    if (!L) return null;
    const R = 110;
    const C = 130;
    const pt = (a: number, r = R) => [C + r * Math.sin(a * 2 * Math.PI), C - r * Math.cos(a * 2 * Math.PI)];
    return (
      <div className="dsp-data-pie">
        <svg viewBox="0 0 260 260" role="img" aria-label={`Pie chart: ${L.slices.map((x) => `${x.label} ${Math.round(x.share * 100)}%`).join(', ')}`}>
          {L.slices.map((sl, i) => {
            const [x0, y0] = pt(sl.a0);
            const [x1, y1] = pt(sl.a1);
            const big = sl.a1 - sl.a0 > 0.5 ? 1 : 0;
            const whole = sl.a1 - sl.a0 > 0.9999;
            const [lx, ly] = pt((sl.a0 + sl.a1) / 2, R * 0.66);
            return (
              <g key={sl.row} className={`dsp-data-slice ${SERIES[i % 4]}${isSel(sl.row, L.col) ? ' is-sel' : ''}`} onClick={() => pick(sl.row, L.col)}>
                {whole ? <circle cx={C} cy={C} r={R} /> : <path d={`M${C},${C} L${x0},${y0} A${R},${R} 0 ${big} 1 ${x1},${y1} Z`} />}
                {sl.share >= 0.06 && (
                  <text x={lx} y={ly} textAnchor="middle">
                    {Math.round(sl.share * 100)}%
                  </text>
                )}
                <title>{`${sl.label}: ${fmtNum(sl.value)} (${Math.round(sl.share * 1000) / 10}%)`}</title>
              </g>
            );
          })}
        </svg>
        <ul className="dsp-data-key">
          {L.slices.map((sl, i) => (
            <li key={sl.row}>
              <span className={`dsp-data-sw ${SERIES[i % 4]}`} />
              {sl.label} <em>{fmtNum(sl.value)}</em>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (s.view === 'histogram') {
    const L = histogramLayout(s);
    if (!L) return null;
    const col = s.columns.find((c) => c.id === L.col);
    const edges = L.bars.length ? [L.bars[0].lo, ...L.bars.map((x) => x.hi)] : [];
    const span = edges.length ? edges[edges.length - 1] - edges[0] || 1 : 1;
    return (
      <PlotFrame label={`Histogram of ${col?.name ?? ''}`} yTicks={ticksOf(L.yScale)} xTicks={edges.map((e) => ({ at: (e - edges[0]) / span, label: fmtNum(e) }))} xTitle={titled(col)} yTitle="How many">
        {(pl) =>
          L.bars.map((r, i) => (
            <rect key={i} className="dsp-data-bar is-s0" x={pl.px(r.x0) + 0.5} width={Math.max(1, pl.px(r.x1) - pl.px(r.x0) - 1)} y={pl.py(r.y1)} height={Math.max(0, pl.py(r.y0) - pl.py(r.y1))}>
              <title>{`${fmtNum(r.lo)} to ${fmtNum(r.hi)}: ${r.count}`}</title>
            </rect>
          ))
        }
      </PlotFrame>
    );
  }
  if (s.view === 'heatmap') {
    const L = heatmapLayout(s);
    if (!L) return null;
    return (
      <div className="dsp-data-heat-wrap">
        <table className="dsp-data-heat">
          <thead>
            <tr>
              <th />
              {L.xs.map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {L.ys.map((y, yi) => (
              <tr key={y}>
                <th scope="row">{y}</th>
                {L.xs.map((x, xi) => {
                  const c = L.cells.find((k) => k.x === xi && k.y === yi);
                  return (
                    <td key={x} style={c ? { background: c.colour, color: c.position > 0.62 || c.position < 0.12 ? '#fff' : undefined } : undefined} title={c ? `${y}, ${x}: ${fmtNum(c.value)}${c.count > 1 ? ` (sum of ${c.count})` : ''}` : 'no value'}>
                      {c ? fmtNum(c.value) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="dsp-data-scale">
          {fmtNum(L.scale.lo)} <span className={`dsp-data-ramp is-${L.scale.kind}`} /> {fmtNum(L.scale.hi)}
          {L.summed > 0 && <em> · {L.summed} cell{L.summed === 1 ? '' : 's'} add up repeated rows</em>}
        </p>
      </div>
    );
  }
  return null;
}

function Legend({ names }: { names: string[] }) {
  if (names.length < 2) return null;
  return (
    <ul className="dsp-data-key is-row">
      {names.map((n, i) => (
        <li key={n}>
          <span className={`dsp-data-sw ${SERIES[i % 4]}`} />
          {n}
        </li>
      ))}
    </ul>
  );
}

/** The grid itself: every cell editable, empty cells empty. */
function Table({ s, d, sel, select }: { s: DataState; d: D; sel: string | null; select: (id: string | null) => void }) {
  const order = displayOrder(s);
  const sortBy = (col: string) => {
    const dir = s.sort?.col === col && s.sort.dir === 'asc' ? 'desc' : 'asc';
    d.act('sort', { col, dir });
  };
  return (
    <div className="dsp-data-grid-wrap">
      <table className="dsp-table dsp-data-grid">
        <thead>
          <tr>
            {s.columns.map((c) => (
              <th key={c.id} className={c.type === 'number' ? 'is-num' : ''}>
                {d.live ? <Edit value={c.name} label={`Column ${c.name}`} max={DATA_LIMITS.name} onDone={(name) => name && d.act('renameColumn', { col: c.id, name, by: 'person' })} /> : c.name}
                <span className="dsp-data-colmeta">
                  {c.unit && <span>{c.unit}</span>}
                  <button type="button" className="dsp-data-sort" onClick={() => sortBy(c.id)} disabled={!d.live} aria-label={`Sort by ${c.name}`}>
                    {s.sort?.col === c.id ? (s.sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                  </button>
                  {d.live && s.columns.length > 1 && <Confirm label="×" ask={`Remove column ${c.name}?`} onConfirm={() => d.act('removeColumn', { col: c.id })} />}
                </span>
              </th>
            ))}
            {d.live && <th aria-label="Row actions" />}
          </tr>
        </thead>
        <tbody>
          {order.map((ri) => {
            const row = s.rows[ri];
            return (
              <tr key={ri} className={row.by === 'socria' ? 'is-socria' : ''}>
                {s.columns.map((c, ci) => {
                  const v = row.cells[ci];
                  return (
                    <td key={c.id} className={`${c.type === 'number' ? 'is-num' : ''}${sel === `cell:${ri}|${c.id}` ? ' is-sel' : ''}`}>
                      {d.live ? (
                        c.type === 'number' ? (
                          <NumberEdit value={typeof v === 'number' ? v : null} label={`Row ${ri + 1}, ${c.name}`} onDone={(n) => d.act('cell', { row: ri, col: c.id, value: n === null ? '' : String(n), by: 'person' })} />
                        ) : (
                          <Edit value={v === null || v === undefined ? '' : String(v)} label={`Row ${ri + 1}, ${c.name}`} max={DATA_LIMITS.text} onDone={(t) => d.act('cell', { row: ri, col: c.id, value: t, by: 'person' })} />
                        )
                      ) : v === null || v === undefined ? (
                        <span className="dsp-data-empty">—</span>
                      ) : typeof v === 'number' ? (
                        fmtNum(v)
                      ) : (
                        String(v)
                      )}
                    </td>
                  );
                })}
                {d.live && (
                  <td className="dsp-data-rowx">
                    <button type="button" className="dsp-x" onClick={() => d.act('removeRow', { row: ri })} aria-label={`Remove row ${ri + 1}`}>
                      ×
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {d.live && s.columns.length < DATA_LIMITS.columns && <AddColumn d={d} />}
    </div>
  );
}

function AddColumn({ d }: { d: D }) {
  const [type, setType] = useState<'number' | 'text' | 'date' | 'category'>('number');
  return (
    <AddRow
      label="Add a column"
      placeholder="Add a column…"
      onAdd={(name) => d.act('addColumn', { name, type, by: 'person' })}
      extra={
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Column holds">
          <option value="number">numbers</option>
          <option value="text">words</option>
          <option value="category">categories</option>
          <option value="date">dates</option>
        </select>
      }
    />
  );
}

function CellInspector({ s, d, row, col, onClose }: { s: DataState; d: D; row: number; col: string; onClose: () => void }) {
  const ci = s.columns.findIndex((c) => c.id === col);
  const c = s.columns[ci];
  const r = s.rows[row];
  if (!c || !r) return null;
  const label = s.columns.find((x) => x.type !== 'number');
  const name = label ? String(r.cells[s.columns.indexOf(label)] ?? `Row ${row + 1}`) : `Row ${row + 1}`;
  const v = r.cells[ci];
  return (
    <Inspector title={`${name} · ${c.name}`} by={r.by} onClose={onClose}>
      <div className="dsp-fields">
        <Field label={titled(c) ?? c.name}>
          {d.live ? (
            <NumberEdit value={typeof v === 'number' ? v : null} label={`${name}, ${c.name}`} onDone={(n) => d.act('cell', { row, col, value: n === null ? '' : String(n), by: 'person' })} />
          ) : (
            <span>{typeof v === 'number' ? fmtNum(v) : '—'}</span>
          )}
        </Field>
      </div>
    </Inspector>
  );
}

/** Every number the chart draws, for a screen reader or a careful eye. */
function Numbers({ s }: { s: DataState }) {
  const order = displayOrder(s);
  return (
    <details className="dsp-details">
      <summary>The numbers</summary>
      <table className="dsp-table">
        <thead>
          <tr>
            {s.columns.map((c) => (
              <th key={c.id} className={c.type === 'number' ? 'is-num' : ''}>
                {titled(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((ri) => (
            <tr key={ri}>
              {s.columns.map((c, ci) => {
                const v = s.rows[ri].cells[ci];
                return (
                  <td key={c.id} className={c.type === 'number' ? 'is-num' : ''}>
                    {v === null || v === undefined ? '—' : typeof v === 'number' ? fmtNum(v) : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
