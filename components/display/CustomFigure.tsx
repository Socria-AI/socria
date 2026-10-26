'use client';

// components/display/CustomFigure.tsx — a custom artifact, drawn from its blocks.
//
// Whatever was asked for — a habit tracker, a recipe scaler, a packing list
// with a countdown — is a handful of primitives (lib/objects/display-custom.ts),
// and this draws each one and makes it work: a list ticks, a table takes its
// cells and works out its calc columns and totals, a number moves on its
// slider or stepper, a value and a progress bar follow it live, a chart is
// drawn from its table, a choice picks, a field is written in, a timer counts
// down. Every change is an operation on the object, so it undoes, syncs and is
// read by the conversation like any other display; the timer's running is the
// only thing kept here, since a countdown is not a change to the artifact.
//
// "Save as template" keeps the artifact's shape on this device
// (lib/logos5/templates.ts), and it is offered in Make from then on.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FigureProps } from '@/components/objects/figures';
import { allBlocks, chartData, computeCustom, sayValue, type Block, type Computed, type CustomState } from '@/lib/objects/display-custom';
import { saveTemplate } from '@/lib/logos5/templates';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { NumberEdit, Slider, Stepper, Tool } from './primitives';
import './custom.css';

type D = Display<CustomState>;
type Of<T extends Block['type']> = Extract<Block, { type: T }>;

const store = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function CustomFigure(p: FigureProps) {
  const d = useDisplay<CustomState>(p);
  const s = d.state;
  const c = useMemo(() => computeCustom(s), [s]);
  const [saved, setSaved] = useState<string | null>(null);
  // said of this artifact only: another drawn in its place starts without it
  useEffect(() => setSaved(null), [p.obj.id]);
  const n = allBlocks(s).filter((b) => b.type !== 'group').length;
  const save = () => {
    const r = saveTemplate(store(), s, Date.now());
    setSaved(r ? `Saved as a template, “${r.saved.name}” — it is in Make, under Yours, on this device.` : 'This could not be kept as a template.');
  };
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={`${n} block${n === 1 ? '' : 's'}${s.from ? ` · from your template “${s.from}”` : ''}`}
      tools={
        p.mode === 'live' ? (
          <Tool label="Save as template" onClick={save} title="Keep this artifact's shape, to make again for something else">
            Save as template
          </Tool>
        ) : null
      }
    >
      <div className="dsp-cu">
        {s.about && <p className="dsp-cu-about">{s.about}</p>}
        {s.blocks.map((b) => (
          <BlockView key={b.id} b={b} s={s} c={c} d={d} guarded={!!p.guarded} />
        ))}
        {saved && (
          <p className="dsp-cu-saved" role="status">
            {saved}
          </p>
        )}
      </div>
    </DisplayShell>
  );
}

function BlockView({ b, s, c, d, guarded }: { b: Block; s: CustomState; c: Computed; d: D; guarded: boolean }) {
  switch (b.type) {
    case 'text':
      return b.size === 'title' ? <h3 className="dsp-cu-title">{b.text}</h3> : b.size === 'heading' ? <h4 className="dsp-cu-head">{b.text}</h4> : <p className={b.size === 'note' ? 'dsp-cu-note' : 'dsp-cu-p'}>{b.text}</p>;
    case 'list':
      return <ListBlock b={b} d={d} />;
    case 'table':
      return <TableBlock b={b} c={c} d={d} />;
    case 'number':
      return <NumberBlock b={b} d={d} />;
    case 'value':
      return (
        <div className="dsp-cu-value" role="group" aria-label={b.label}>
          <span className="dsp-cu-label">{b.label}</span>
          <output className="dsp-cu-big" title={c.values[b.id] === null ? 'This cannot be worked out from what is here yet' : `= ${b.expr}`}>
            {sayValue(c.values[b.id] ?? null, b.decimals, b.unit)}
          </output>
        </div>
      );
    case 'chart':
      return <ChartBlock b={b} s={s} c={c} />;
    case 'progress': {
      const v = c.progress[b.id];
      const pct = v === null || v === undefined ? null : Math.round(v * 100);
      return (
        <div className="dsp-cu-progress">
          <span className="dsp-cu-label">{b.label}</span>
          <div className="dsp-cu-bar" role="progressbar" aria-label={b.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
            <i style={{ width: `${pct ?? 0}%` }} />
          </div>
          <span className="dsp-cu-pct">{pct === null ? '—' : `${pct}%`}</span>
        </div>
      );
    }
    case 'choice':
      return <ChoiceBlock b={b} d={d} guarded={guarded} />;
    case 'field':
      return <FieldBlock b={b} d={d} />;
    case 'timer':
      return <TimerBlock b={b} />;
    case 'group':
      return (
        <section className="dsp-cu-group" aria-label={b.label}>
          {b.label && <h4 className="dsp-cu-head">{b.label}</h4>}
          <div className={`dsp-cu-grid is-${b.columns}`}>
            {b.blocks.map((x) => (
              <div key={x.id} className="dsp-cu-cell">
                <BlockView b={x} s={s} c={c} d={d} guarded={guarded} />
              </div>
            ))}
          </div>
        </section>
      );
  }
}

function ListBlock({ b, d }: { b: Of<'list'>; d: D }) {
  const done = b.items.filter((i) => i.done).length;
  return (
    <section className="dsp-cu-list" aria-label={b.label ?? 'List'}>
      {(b.label || b.check) && (
        <h4 className="dsp-cu-head">
          {b.label ?? 'List'}
          {b.check && b.items.length > 0 && <span className="dsp-cu-count">{`${done} of ${b.items.length}`}</span>}
        </h4>
      )}
      <ul>
        {b.items.map((i) => (
          <li key={i.id} className={i.done ? 'is-done' : ''}>
            {b.check && <input type="checkbox" checked={!!i.done} disabled={!d.live} aria-label={i.text} onChange={() => d.act('tick', { id: b.id, item: i.id, by: 'person' })} />}
            {d.live ? <Edit value={i.text} label={`Item: ${i.text}`} max={160} onDone={(text) => (text ? d.act('editItem', { id: b.id, item: i.id, text, by: 'person' }) : d.act('removeItem', { id: b.id, item: i.id }))} /> : <span>{i.text}</span>}
            {d.live && (
              <button type="button" className="dsp-cu-x" aria-label={`Remove ${i.text}`} onClick={() => d.act('removeItem', { id: b.id, item: i.id })}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {d.live && <AddRow label={`Add to ${b.label ?? 'the list'}`} placeholder="Add an item" onAdd={(text) => d.act('addItem', { id: b.id, text, by: 'person' })} />}
    </section>
  );
}

function TableBlock({ b, c, d }: { b: Of<'table'>; c: Computed; d: D }) {
  const totals = c.totals[b.id] ?? {};
  const hasTotals = b.columns.some((x) => x.total);
  return (
    <section className="dsp-cu-table" aria-label={b.label ?? 'Table'}>
      {b.label && <h4 className="dsp-cu-head">{b.label}</h4>}
      <div className="dsp-cu-scroll">
        <table>
          <thead>
            <tr>
              {b.columns.map((col) => (
                <th key={col.id} scope="col" className={col.kind === 'number' || col.kind === 'calc' ? 'is-num' : col.kind === 'check' ? 'is-check' : ''} title={col.kind === 'calc' ? `= ${col.expr}` : undefined}>
                  {col.label}
                  {col.unit ? ` (${col.unit})` : ''}
                </th>
              ))}
              {d.live && <th aria-label="Remove a row" />}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={r.id}>
                {b.columns.map((col) => {
                  const v = r.cells[col.id];
                  const label = `${col.label}, row ${ri + 1}`;
                  if (col.kind === 'calc') return <td key={col.id} className="is-num is-calc">{sayValue(c.cells[b.id]?.[r.id]?.[col.id] ?? null, 2)}</td>;
                  if (col.kind === 'check')
                    return (
                      <td key={col.id} className="is-check">
                        <input type="checkbox" checked={v === true} disabled={!d.live} aria-label={label} onChange={(e) => d.act('cell', { id: b.id, row: r.id, col: col.id, value: e.target.checked ? 'true' : '', by: 'person' })} />
                      </td>
                    );
                  if (col.kind === 'number')
                    return (
                      <td key={col.id} className="is-num">
                        {d.live ? <NumberEdit value={typeof v === 'number' ? v : null} label={label} onDone={(n) => d.act('cell', { id: b.id, row: r.id, col: col.id, value: n === null ? '' : n, by: 'person' })} /> : typeof v === 'number' ? sayValue(v, 6) : ''}
                      </td>
                    );
                  return <td key={col.id}>{d.live ? <Edit value={typeof v === 'string' ? v : ''} label={label} onDone={(t) => d.act('cell', { id: b.id, row: r.id, col: col.id, value: t, by: 'person' })} /> : String(v ?? '')}</td>;
                })}
                {d.live && (
                  <td className="is-x">
                    <button type="button" className="dsp-cu-x" aria-label={`Remove row ${ri + 1}`} onClick={() => d.act('removeRow', { id: b.id, row: r.id })}>
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {hasTotals && (
            <tfoot>
              <tr>
                {b.columns.map((col, i) => (
                  <td key={col.id} className={col.total ? 'is-num' : ''}>
                    {col.total ? sayValue(totals[col.id] ?? null, 2, col.unit) : i === 0 ? 'Total' : ''}
                  </td>
                ))}
                {d.live && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {d.live && (
        <button type="button" className="dsp-cu-add" onClick={() => d.act('addRow', { id: b.id, by: 'person' })}>
          + Row
        </button>
      )}
    </section>
  );
}

function NumberBlock({ b, d }: { b: Of<'number'>; d: D }) {
  const fmt = (n: number) => sayValue(n, 6, b.unit);
  const set = (n: number | null) => n !== null && d.act('set', { id: b.id, value: n, label: `${b.label} to ${n}`, by: 'person' });
  return (
    <div className="dsp-cu-number" role="group" aria-label={b.label}>
      <span className="dsp-cu-label">{b.label}</span>
      {b.control === 'slider' && b.min !== undefined && b.max !== undefined ? (
        <Slider value={b.value} min={b.min} max={b.max} step={b.step} label={b.label} onCommit={set} disabled={!d.live} format={fmt} />
      ) : b.control === 'stepper' ? (
        <Stepper value={b.value} min={b.min ?? -1e9} max={b.max ?? 1e9} step={b.step} label={b.label} onChange={set} disabled={!d.live} format={fmt} />
      ) : (
        <span className="dsp-cu-field">
          <NumberEdit value={b.value} label={b.label} min={b.min} max={b.max} step={b.step} onDone={set} disabled={!d.live} />
          {b.unit && <span className="dsp-cu-unit">{b.unit}</span>}
        </span>
      )}
    </div>
  );
}

function ChoiceBlock({ b, d, guarded }: { b: Of<'choice'>; d: D; guarded: boolean }) {
  const [checked, setChecked] = useState(false);
  // a new pick is checked afresh
  const pickedKey = b.picked.join(',');
  useEffect(() => setChecked(false), [pickedKey]);
  const pick = (i: number) => {
    const next = b.multi ? (b.picked.includes(i) ? b.picked.filter((x) => x !== i) : [...b.picked, i].sort((x, y) => x - y)) : [i];
    d.act('set', { id: b.id, value: next.join(','), label: b.label, by: 'person' });
  };
  const right = checked && b.answer ? b.answer.length === b.picked.length && b.answer.every((x) => b.picked.includes(x)) : null;
  return (
    <fieldset className="dsp-cu-choice" disabled={!d.live}>
      <legend className="dsp-cu-label">{b.label}</legend>
      <div className="dsp-cu-options" role={b.multi ? 'group' : 'radiogroup'} aria-label={b.label}>
        {b.options.map((o, i) => {
          const on = b.picked.includes(i);
          const mark = checked && b.answer ? (b.answer.includes(i) ? ' is-right' : on ? ' is-wrong' : '') : '';
          return (
            <button key={i} type="button" role={b.multi ? 'checkbox' : 'radio'} aria-checked={on} className={`dsp-cu-opt${on ? ' is-on' : ''}${mark}`} onClick={() => pick(i)}>
              {o}
            </button>
          );
        })}
      </div>
      {b.answer && b.picked.length > 0 && (
        <div className="dsp-cu-check">
          <button type="button" onClick={() => setChecked(true)}>
            Check
          </button>
          {checked && <span role="status">{right ? 'Right.' : guarded ? 'Not yet — have another look.' : 'Not quite — the right one is marked.'}</span>}
        </div>
      )}
    </fieldset>
  );
}

function FieldBlock({ b, d }: { b: Of<'field'>; d: D }) {
  const [v, setV] = useState(b.value);
  useEffect(() => setV(b.value), [b.value]);
  const commit = () => v !== b.value && d.act('set', { id: b.id, value: v, label: b.label, by: 'person' });
  return (
    <label className="dsp-cu-fieldb">
      <span className="dsp-cu-label">{b.label}</span>
      {b.multiline ? (
        <textarea value={v} placeholder={b.placeholder} disabled={!d.live} rows={4} maxLength={2000} onChange={(e) => setV(e.target.value)} onBlur={commit} />
      ) : (
        <input value={v} placeholder={b.placeholder} disabled={!d.live} maxLength={2000} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      )}
    </label>
  );
}

/** A countdown. Running is kept here, not in the artifact: counting down changes nothing in it. */
function TimerBlock({ b }: { b: Of<'timer'> }) {
  const [left, setLeft] = useState(b.seconds);
  const [running, setRunning] = useState(false);
  const end = useRef<number | null>(null);
  useEffect(() => {
    setLeft(b.seconds);
    setRunning(false);
  }, [b.seconds]);
  useEffect(() => {
    if (!running) return;
    end.current = Date.now() + left * 1000;
    const t = setInterval(() => {
      const rest = Math.max(0, Math.round(((end.current ?? 0) - Date.now()) / 1000));
      setLeft(rest);
      if (!rest) setRunning(false);
    }, 250);
    return () => clearInterval(t);
    // left is read once, when it starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <div className={`dsp-cu-timer${left === 0 ? ' is-up' : ''}`} role="timer" aria-label={b.label ?? 'Timer'}>
      {b.label && <span className="dsp-cu-label">{b.label}</span>}
      <span className="dsp-cu-clock" aria-live="off">
        {mm}
      </span>
      <span className="dsp-cu-timer-acts">
        <button type="button" onClick={() => (left === 0 ? (setLeft(b.seconds), setRunning(true)) : setRunning((r) => !r))}>
          {running ? 'Pause' : left === 0 ? 'Again' : left < b.seconds ? 'Resume' : 'Start'}
        </button>
        <button type="button" disabled={left === b.seconds && !running} onClick={() => (setRunning(false), setLeft(b.seconds))}>
          Reset
        </button>
      </span>
      {left === 0 && <span role="status">Time’s up.</span>}
    </div>
  );
}

const TONES = ['var(--dsp-primary)', 'var(--dsp-accent)', 'var(--dsp-tension)', 'color-mix(in srgb, var(--dsp-primary) 55%, white)', 'color-mix(in srgb, var(--dsp-accent) 55%, white)', 'color-mix(in srgb, var(--dsp-tension) 55%, white)'];

/** Bars, a line or a pie, from the chart's data — drawn plainly, labelled, and read out as a list too. */
function ChartBlock({ b, s, c }: { b: Of<'chart'>; s: CustomState; c: Computed }) {
  const data = chartData(s, b, c);
  const said = data.map((p) => `${p.label}: ${sayValue(p.value, 2)}`).join(', ');
  if (!data.length)
    return (
      <figure className="dsp-cu-chart is-empty">
        {b.label && <figcaption className="dsp-cu-label">{b.label}</figcaption>}
        <p className="dsp-cu-note">Nothing to draw yet — it fills in as the table does.</p>
      </figure>
    );
  const W = 360;
  const H = 180;
  const max = Math.max(...data.map((p) => p.value), 0);
  const min = Math.min(...data.map((p) => p.value), 0);
  const span = max - min || 1;
  const y = (v: number) => 12 + (H - 40) * (1 - (v - min) / span);
  let body: JSX.Element;
  if (b.chart === 'pie') {
    const total = data.reduce((t, p) => t + Math.max(0, p.value), 0) || 1;
    let a0 = -Math.PI / 2;
    body = (
      <>
        {data.map((p, i) => {
          const a1 = a0 + (Math.max(0, p.value) / total) * Math.PI * 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const [x0, y0, x1, y1] = [180 + 70 * Math.cos(a0), 90 + 70 * Math.sin(a0), 180 + 70 * Math.cos(a1), 90 + 70 * Math.sin(a1)];
          const d = data.length === 1 ? 'M180 20 A70 70 0 1 1 179.9 20 Z' : `M180 90 L${x0} ${y0} A70 70 0 ${large} 1 ${x1} ${y1} Z`;
          a0 = a1;
          return <path key={i} d={d} fill={TONES[i % TONES.length]} stroke="var(--dsp-panel)" strokeWidth="2" />;
        })}
      </>
    );
  } else {
    const step = (W - 40) / data.length;
    body = (
      <>
        <line x1="30" y1={y(0)} x2={W - 6} y2={y(0)} className="dsp-cu-axis" />
        {b.chart === 'line' ? (
          <polyline fill="none" stroke="var(--dsp-primary)" strokeWidth="2.5" points={data.map((p, i) => `${36 + step * i + step / 2},${y(p.value)}`).join(' ')} />
        ) : (
          data.map((p, i) => <rect key={i} x={36 + step * i + step * 0.15} width={step * 0.7} y={Math.min(y(p.value), y(0))} height={Math.max(1, Math.abs(y(0) - y(p.value)))} rx="3" fill="var(--dsp-primary)" />)
        )}
        {data.map((p, i) => (
          <text key={i} x={36 + step * i + step / 2} y={H - 8} textAnchor="middle" className="dsp-cu-tick">
            {p.label.length > 10 ? `${p.label.slice(0, 9)}…` : p.label}
          </text>
        ))}
      </>
    );
  }
  return (
    <figure className="dsp-cu-chart">
      {b.label && <figcaption className="dsp-cu-label">{b.label}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${b.label ?? 'Chart'}: ${said}`}>
        {body}
      </svg>
      {b.chart === 'pie' && (
        <ul className="dsp-cu-legend">
          {data.map((p, i) => (
            <li key={i}>
              <i style={{ background: TONES[i % TONES.length] }} />
              {p.label} · {sayValue(p.value, 2)}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
