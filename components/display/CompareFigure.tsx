'use client';

// components/display/CompareFigure.tsx — options weighed against what matters.
//
// Every number here is the kind's (lib/objects/display-compare.ts): the
// weighted totals, the ranking and whether two options are too close to
// call, the weight at which the order would turn. This draws them and turns
// what the person does into operations: a score typed into its cell, a
// weight slid — and the ranking moves as it is released — an option or a
// thing that matters added, renamed or taken away.

import { useRef, useState } from 'react';
import {
  cellGrid,
  completeness,
  flipStrip,
  rankBars,
  ranking,
  sensitivity,
  totals,
  COMPARE_LIMITS,
  type CompareState,
  type GridCell,
} from '@/lib/objects/display-compare';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { Confirm, Field, Inspector, NumberEdit, Slider, Tool, useSelection } from './primitives';
import './compare.css';

type D = Display<CompareState>;
const one = (n: number | null) => (n === null ? '—' : (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, ''));

export function CompareFigure(p: FigureProps) {
  const d = useDisplay<CompareState>(p);
  const [sel, select] = useSelection(p);
  const [shown, setShown] = useState(false);
  const optRef = useRef<HTMLDivElement>(null);
  const critRef = useRef<HTMLDivElement>(null);
  const s = d.state;
  const rk = ranking(s);
  const done = completeness(s);
  // practising: the totals are what is being worked out
  const hide = !!p.guarded && !shown;
  const leader = rk.leader ? s.options.find((o) => o.id === rk.leader)?.name : null;
  const aside = hide ? `${done.scored} of ${done.cells} scored` : rk.tooClose ? 'Too close to call' : leader ? `${leader} leads` : `${done.scored} of ${done.cells} scored`;
  const cell = sel?.startsWith('cell:') ? sel.slice(5).split('|') : null;
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={aside}
      tools={
        <>
          <Tool label="Add an option" onClick={() => optRef.current?.querySelector('input')?.focus()} disabled={s.options.length >= COMPARE_LIMITS.options}>
            + Option
          </Tool>
          <Tool label="Add something that matters" onClick={() => critRef.current?.querySelector('input')?.focus()} disabled={s.criteria.length >= COMPARE_LIMITS.criteria}>
            + What matters
          </Tool>
        </>
      }
    >
      {hide && (
        <p className="dsp-cmp-hide">
          Work out the weighted totals first, then check.{' '}
          <button type="button" className="dsp-tool" onClick={() => setShown(true)}>
            Show the totals
          </button>
        </p>
      )}
      {s.view === 'ranking' && !hide ? (
        <Ranking s={s} />
      ) : s.view === 'sensitivity' && !hide ? (
        <Sensitivity s={s} />
      ) : (
        <Matrix s={s} d={d} sel={sel} select={select} hide={hide} />
      )}
      {cell && <CellInspector s={s} d={d} option={cell[0]} criterion={cell[1]} onClose={() => select(null)} />}
      {d.live && (
        <div className="dsp-cmp-adds">
          <div ref={optRef}>
            {s.options.length < COMPARE_LIMITS.options && <AddRow label="Add an option" placeholder="Add an option…" onAdd={(name) => d.act('addOption', { name, by: 'person' })} />}
          </div>
          <div ref={critRef}>
            {s.criteria.length < COMPARE_LIMITS.criteria && (
              <AddRow label="Add something that matters" placeholder="Add something that matters…" onAdd={(name) => d.act('addCriterion', { name, weight: 5, by: 'person' })} />
            )}
          </div>
        </div>
      )}
    </DisplayShell>
  );
}

/** What matters down the side, the options across, a score in every cell, a weight on every row. */
function Matrix({ s, d, sel, select, hide }: { s: CompareState; d: D; sel: string | null; select: (id: string | null) => void; hide: boolean }) {
  const grid = cellGrid(s);
  const tot = new Map(totals(s).map((t) => [t.option, t]));
  const rk = ranking(s);
  const place = new Map(rk.entries.map((e) => [e.option, e]));
  const name = (id: string) => s.options.find((o) => o.id === id)?.name ?? id;
  return (
    <div className="dsp-cmp-wrap">
      <table className="dsp-cmp">
        <thead>
          <tr>
            <th className="dsp-cmp-corner">What matters</th>
            <th className="dsp-cmp-wcol">Weight</th>
            {s.options.map((o) => (
              <th key={o.id} className={`dsp-cmp-opt${o.by === 'socria' ? ' is-socria' : ''}${!hide && rk.leader === o.id ? ' is-lead' : ''}`}>
                {d.live ? (
                  <Edit value={o.name} label={`Option ${o.name}`} max={COMPARE_LIMITS.name} onDone={(v) => v && d.act('renameOption', { id: o.id, name: v, by: 'person' })} />
                ) : (
                  o.name
                )}
                {o.note && <span className="dsp-cmp-optnote">{o.note}</span>}
                {d.live && s.options.length > COMPARE_LIMITS.minOptions && (
                  <span className="dsp-cmp-rm">
                    <Confirm label="×" ask={`Remove ${o.name}?`} onConfirm={() => d.act('removeOption', { id: o.id })} />
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.criteria.map((c, ri) => (
            <tr key={c.id}>
              <th scope="row" className={`dsp-cmp-crit${c.by === 'socria' ? ' is-socria' : ''}`}>
                {d.live ? (
                  <Edit value={c.name} label={`What matters: ${c.name}`} max={COMPARE_LIMITS.name} onDone={(v) => v && d.act('renameCriterion', { id: c.id, name: v, by: 'person' })} />
                ) : (
                  c.name
                )}
                {d.live && s.criteria.length > COMPARE_LIMITS.minCriteria && (
                  <span className="dsp-cmp-rm">
                    <Confirm label="×" ask={`Remove ${c.name}?`} onConfirm={() => d.act('removeCriterion', { id: c.id })} />
                  </span>
                )}
              </th>
              <td className="dsp-cmp-w">
                {d.live ? (
                  <Slider value={c.weight} min={0} max={10} label={`How much ${c.name} matters`} onCommit={(w) => d.act('weight', { criterion: c.id, weight: w, by: 'person' })} />
                ) : (
                  <span className="dsp-cmp-wv">{c.weight}</span>
                )}
              </td>
              {grid.rows[ri].map((g) => (
                <Cell key={g.option} g={g} s={s} d={d} on={sel === `cell:${g.option}|${g.criterion}`} onSelect={() => select(sel === `cell:${g.option}|${g.criterion}` ? null : `cell:${g.option}|${g.criterion}`)} />
              ))}
            </tr>
          ))}
        </tbody>
        {!hide && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={2} className="dsp-cmp-totlabel">
                Weighted score <span>out of 10</span>
              </th>
              {s.options.map((o) => {
                const t = tot.get(o.id);
                const e = place.get(o.id);
                return (
                  <td key={o.id} className={`dsp-cmp-total${rk.leader === o.id ? ' is-lead' : ''}`}>
                    <strong>{one(t?.total ?? null)}</strong>
                    {t && t.low !== null && t.high !== null && t.high - t.low > 0.05 && (
                      <span className="dsp-cmp-band">
                        {one(t.low)}–{one(t.high)}
                      </span>
                    )}
                    {e?.closeTo.length ? <span className="dsp-cmp-close">close to {e.closeTo.map(name).join(', ')}</span> : null}
                    {t && t.unscored > 0 && <span className="dsp-cmp-missing">{t.unscored} not scored</span>}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Cell({ g, s, d, on, onSelect }: { g: GridCell; s: CompareState; d: D; on: boolean; onSelect: () => void }) {
  const opt = s.options.find((o) => o.id === g.option)?.name ?? '';
  const crit = s.criteria.find((c) => c.id === g.criterion)?.name ?? '';
  return (
    <td
      className={`dsp-cmp-cell${g.value === null ? ' is-empty' : ''}${on ? ' is-sel' : ''}${g.by === 'socria' ? ' is-socria' : ''}`}
      style={g.shade !== null ? ({ '--shade': g.shade } as React.CSSProperties) : undefined}
    >
      <span className="dsp-cmp-cellrow">
        {d.live ? (
          <NumberEdit value={g.value} label={`${opt} on ${crit}, out of 10`} min={0} max={10} placeholder="–" onDone={(v) => d.act('score', { option: g.option, criterion: g.criterion, value: v === null ? '' : v, by: 'person' })} />
        ) : (
          <span className="dsp-cmp-v">{g.value ?? '–'}</span>
        )}
        <button type="button" className="dsp-cmp-more" onClick={onSelect} aria-label={`Details of ${opt} on ${crit}`} aria-pressed={on}>
          ⋯
        </button>
      </span>
      {g.note && <span className="dsp-cmp-note">{g.note}</span>}
      {g.low !== null && g.high !== null && g.high - g.low > 0 && (
        <span className="dsp-cmp-range">
          {g.low}–{g.high}
        </span>
      )}
    </td>
  );
}

function CellInspector({ s, d, option, criterion, onClose }: { s: CompareState; d: D; option: string; criterion: string; onClose: () => void }) {
  const g = cellGrid(s).rows.flat().find((x) => x.option === option && x.criterion === criterion);
  if (!g) return null;
  const opt = s.options.find((o) => o.id === option)?.name ?? '';
  const crit = s.criteria.find((c) => c.id === criterion)?.name ?? '';
  const ro = !d.live;
  return (
    <Inspector title={`${opt} · ${crit}`} by={g.by ?? undefined} onClose={onClose}>
      <div className="dsp-fields">
        <Field label="Score (0–10)">
          <NumberEdit value={g.value} label="Score" disabled={ro} onDone={(v) => d.act('score', { option, criterion, value: v === null ? '' : v, by: 'person' })} />
        </Field>
        <Field label="Could be as low as">
          <NumberEdit
            value={g.value !== null && g.low !== g.value ? g.low : null}
            label="Lowest it might be"
            disabled={ro || g.value === null}
            onDone={(v) => g.value !== null && d.act('score', { option, criterion, value: g.value, low: v === null ? '' : v, ...(g.high !== null && g.high !== g.value ? { high: g.high } : {}), by: 'person' })}
          />
        </Field>
        <Field label="Or as high as">
          <NumberEdit
            value={g.value !== null && g.high !== g.value ? g.high : null}
            label="Highest it might be"
            disabled={ro || g.value === null}
            onDone={(v) => g.value !== null && d.act('score', { option, criterion, value: g.value, high: v === null ? '' : v, ...(g.low !== null && g.low !== g.value ? { low: g.low } : {}), by: 'person' })}
          />
        </Field>
        <Field label="The fact behind it" wide>
          {ro ? <span className="dsp-ro">{g.note ?? '—'}</span> : <Edit value={g.note ?? ''} label="Note" max={COMPARE_LIMITS.scoreNote ?? 120} placeholder="$1,200 a month, 40 minutes by train…" onDone={(note) => d.act('note', { option, criterion, note, by: 'person' })} />}
        </Field>
      </div>
      <p className="dsp-cmp-hint">Unsure? Give a range: the totals carry it, and two options whose ranges overlap are said to be too close to call.</p>
    </Inspector>
  );
}

/** Best first, each with how sure it is. */
function Ranking({ s }: { s: CompareState }) {
  const bars = rankBars(s);
  const name = (id: string) => s.options.find((o) => o.id === id)?.name ?? id;
  return (
    <ol className="dsp-cmp-rank">
      {bars.map((b) => (
        <li key={b.option}>
          <span className="dsp-cmp-place">{b.place}</span>
          <span className="dsp-cmp-rname">{b.name}</span>
          <span className="dsp-cmp-track" aria-hidden="true">
            {b.x0 !== null && b.x1 !== null && <span className="dsp-cmp-bandbar" style={{ left: `${b.x0 * 100}%`, width: `${Math.max(0.5, (b.x1 - b.x0) * 100)}%` }} />}
            {b.x !== null && <span className="dsp-cmp-bar" style={{ width: `${b.x * 100}%` }} />}
          </span>
          <span className="dsp-cmp-rv">
            {b.x === null ? 'no score yet' : one(b.x * 10)}
            {b.closeTo.length > 0 && <em> · too close to {b.closeTo.map(name).join(', ')}</em>}
            {b.unscored > 0 && <em> · {b.unscored} not scored</em>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** For each thing that matters: how much more (or less) it would have to matter for the order to turn. */
function Sensitivity({ s }: { s: CompareState }) {
  const strip = flipStrip(s);
  const sen = sensitivity(s);
  if (!strip || !sen) return <p className="dsp-empty">Score at least two options to see what would change the order.</p>;
  const name = (id: string) => s.options.find((o) => o.id === id)?.name ?? id;
  return (
    <div className="dsp-cmp-sens">
      <p className="dsp-cmp-legend">
        <span className="dsp-cmp-key is-lead" /> {name(sen.leader)} leads
        <span className="dsp-cmp-key is-run" /> {name(sen.runnerUp)} would lead
      </p>
      {strip.rows.map((r, i) => {
        const c = s.criteria.find((x) => x.id === r.criterion)!;
        const f = sen.flips[i];
        const said =
          f.at === null
            ? `No weight from 0 to 10 changes who leads.`
            : `${name(sen.runnerUp)} would lead if this mattered ${f.dir === 'up' ? 'more' : 'less'} — past ${one(f.at)}${f.whole !== null ? ` (from ${f.whole})` : ''}.`;
        return (
          <div key={r.criterion} className="dsp-cmp-strip">
            <span className="dsp-cmp-sname">{c.name}</span>
            <span className="dsp-cmp-sbar" aria-hidden="true">
              {r.segments.map((g, k) => (
                <span key={k} className={`dsp-cmp-seg${g.lead === sen.leader ? ' is-lead' : g.lead ? ' is-run' : ''}`} style={{ left: `${g.from * 100}%`, width: `${(g.to - g.from) * 100}%` }} />
              ))}
              <span className="dsp-cmp-now" style={{ left: `${r.now * 100}%` }} title={`now ${c.weight}`} />
              {r.flip !== null && <span className="dsp-cmp-flip" style={{ left: `${r.flip * 100}%` }} />}
            </span>
            <span className="dsp-cmp-said">{said}</span>
          </div>
        );
      })}
    </div>
  );
}
