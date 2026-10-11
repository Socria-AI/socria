'use client';

// components/display/MarketFigure.tsx — supply and demand, worked: predict, then reveal.
//
// Every number is the kind's (lib/objects/display-market.ts, on the economics
// in lib/logos-econ.ts): the curves as shifted, where they cross, what buyers
// pay and sellers keep under a tax or subsidy, what a binding control leaves
// short or over, the welfare areas. This draws them on one frame and turns
// what the person does into operations. In practice a change is POSED and
// not applied: the curves stay as they were until the person has predicted
// and chosen to reveal — the answer is never on the page before that.

import { useState } from 'react';
import {
  QUESTION,
  SCENARIOS,
  amount,
  explainChange,
  fmt,
  marketCurves,
  marketWindow,
  money,
  outcome,
  segmentIn,
  type Dir,
  type MarketState,
  type Side,
} from '@/lib/objects/display-market';
import type { FigureProps } from '@/components/objects/figures';
import { DisplayShell, useDisplay, type Display } from './DisplayShell';
import { Field, Group, NumberEdit, Segmented, Tool } from './primitives';
import { PlotFrame, type Plot } from './PlotFrame';
import './market.css';

type S = MarketState;
type D = Display<S>;
const DIRS: { id: Dir; label: string }[] = [
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'same', label: 'Same' },
];

export function MarketFigure(p: FigureProps) {
  const d = useDisplay<S>(p);
  const s = d.state;
  const now = outcome(s, s.applied);
  const waiting = !!s.pending && !s.revealed;
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={waiting ? 'predict, then reveal' : now.price !== null ? `${money(now.price, s.units)} · ${amount(now.quantity, s.units)}` : 'nothing trades'}
      tools={
        <>
          <Tool label="Pose the next scenario" onClick={() => d.act('next', {})} disabled={waiting}>
            Next scenario
          </Tool>
          <Tool label="Reset the market" onClick={() => d.act('reset', {})}>
            Reset
          </Tool>
        </>
      }
    >
      {s.view === 'graph' ? <Graph s={s} /> : <Numbers s={s} />}
      <Practice d={d} />
      {!waiting && <Levers d={d} />}
      <Log s={s} />
    </DisplayShell>
  );
}

// ── the graph ────────────────────────────────────────────────────────

function Graph({ s }: { s: S }) {
  const c = marketCurves(s);
  const w = marketWindow(s);
  const now = outcome(s, s.applied);
  const fq = (q: number) => q / w.qMax;
  const fp = (v: number) => v / w.pMax;
  const seg = (l: { intercept: number; slope: number }, p: Plot, cls: string, key: string) => {
    const g = segmentIn(l, w.qMax, w.pMax);
    if (!g) return null;
    return <line key={key} className={cls} x1={p.px(fq(g.q0))} y1={p.py(fp(g.p0))} x2={p.px(fq(g.q1))} y2={p.py(fp(g.p1))} />;
  };
  const shifted = c.demand.intercept !== c.demand0.intercept || c.supply.intercept !== c.supply0.intercept;
  const label = (l: { intercept: number; slope: number }, p: Plot, text: string, cls: string) => {
    const g = segmentIn(l, w.qMax, w.pMax);
    if (!g) return null;
    return (
      <text className={cls} x={p.px(fq(g.q1)) - 4} y={p.py(fp(g.p1)) - 6} textAnchor="end">
        {text}
      </text>
    );
  };
  return (
    <PlotFrame
      width={560}
      height={320}
      label={`Supply and demand: ${now.price !== null ? `buyers pay ${fmt(now.price)} and ${fmt(now.quantity)} is traded` : 'nothing is traded'}`}
      xTicks={w.qTicks.map((q) => ({ at: fq(q), label: fmt(q) }))}
      yTicks={w.pTicks.map((v) => ({ at: fp(v), label: fmt(v) }))}
      xTitle={`Quantity${s.units?.quantity ? ` (${s.units.quantity})` : ''}`}
      yTitle={`Price${s.units?.price ? ` (${s.units.price})` : ''}`}
      baseline={0}
    >
      {(p) => (
        <g className="dsp-mk">
          {shifted && seg(c.demand0, p, 'dsp-mk-ghost', 'd0')}
          {shifted && seg(c.supply0, p, 'dsp-mk-ghost', 's0')}
          {seg(c.demand, p, 'dsp-mk-demand', 'd')}
          {seg(c.supply, p, 'dsp-mk-supply', 's')}
          {c.wedged && seg(c.wedged.line, p, 'dsp-mk-wedge', 'w')}
          {label(c.demand, p, 'D', 'dsp-mk-lab')}
          {label(c.supply, p, 'S', 'dsp-mk-lab')}
          {c.wedged && label(c.wedged.line, p, c.wedged.curve === 'supply' ? 'S + tax' : 'D − tax', 'dsp-mk-lab is-wedge')}
          {s.applied.ceiling !== null && <ControlLine p={p} at={fp(s.applied.ceiling)} text={`ceiling ${fmt(s.applied.ceiling)}`} />}
          {s.applied.floor !== null && <ControlLine p={p} at={fp(s.applied.floor)} text={`floor ${fmt(s.applied.floor)}`} />}
          {now.control?.binds && (
            <line className="dsp-mk-gap" x1={p.px(fq(Math.min(now.control.qd, now.control.qs)))} x2={p.px(fq(Math.max(now.control.qd, now.control.qs)))} y1={p.py(fp(now.control.at))} y2={p.py(fp(now.control.at))} />
          )}
          {now.price !== null && now.quantity > 0 && (
            <g className="dsp-mk-eq">
              <line className="dsp-mk-guide" x1={p.px(fq(now.quantity))} x2={p.px(fq(now.quantity))} y1={p.py(0)} y2={p.py(fp(now.price))} />
              <line className="dsp-mk-guide" x1={p.px(0)} x2={p.px(fq(now.quantity))} y1={p.py(fp(now.price))} y2={p.py(fp(now.price))} />
              {now.received !== null && now.received !== now.price && <line className="dsp-mk-guide" x1={p.px(0)} x2={p.px(fq(now.quantity))} y1={p.py(fp(now.received))} y2={p.py(fp(now.received))} />}
              <circle cx={p.px(fq(now.quantity))} cy={p.py(fp(now.price))} r={4} />
            </g>
          )}
        </g>
      )}
    </PlotFrame>
  );
}

function ControlLine({ p, at, text }: { p: Plot; at: number; text: string }) {
  return (
    <g className="dsp-mk-ctl">
      <line x1={p.left} x2={p.right} y1={p.py(at)} y2={p.py(at)} />
      <text x={p.right - 4} y={p.py(at) - 4} textAnchor="end">
        {text}
      </text>
    </g>
  );
}

function Numbers({ s }: { s: S }) {
  const now = outcome(s, s.applied);
  const u = s.units;
  const rows: [string, string][] = [
    ['Buyers pay', now.price === null ? '—' : money(now.price, u)],
    ['Sellers keep', now.received === null ? '—' : money(now.received, u)],
    ['Quantity traded', amount(now.quantity, u)],
  ];
  if (now.control) rows.push([now.control.kind === 'ceiling' ? 'Price ceiling' : 'Price floor', `${money(now.control.at, u)}${now.control.binds ? ` — binds: ${now.control.qd > now.control.qs ? 'shortage' : 'surplus'} of ${amount(Math.abs(now.control.imbalance), u)}` : ' — does not bind'}`]);
  if (now.welfare) {
    rows.push(['Consumer surplus', money(now.welfare.consumer, u)], ['Producer surplus', money(now.welfare.producer, u)]);
    if (now.welfare.government) rows.push([now.welfare.government > 0 ? 'Tax revenue' : 'Subsidy cost', money(Math.abs(now.welfare.government), u)]);
    rows.push(['Deadweight loss', money(now.welfare.deadweight, u)]);
  }
  return (
    <table className="dsp-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td className="is-num">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── practice: pose, predict, reveal ──────────────────────────────────

function Practice({ d }: { d: D }) {
  const s = d.state;
  const [price, setPrice] = useState<Dir | null>(null);
  const [quantity, setQuantity] = useState<Dir | null>(null);
  const [pv, setPv] = useState<number | null>(null);
  const [qv, setQv] = useState<number | null>(null);
  const [why, setWhy] = useState('');
  const [pick, setPick] = useState(0);
  const last = s.log[s.log.length - 1];
  if (!s.pending) {
    return (
      <div className="dsp-mk-practice">
        <span className="dsp-sub">Practise</span>
        <div className="dsp-mk-row">
          <select value={pick} onChange={(e) => setPick(Number(e.target.value))} aria-label="A scenario" disabled={!d.live}>
            {SCENARIOS.map((x, i) => (
              <option key={x} value={i}>
                {x}
              </option>
            ))}
          </select>
          <button type="button" className="dsp-tool" disabled={!d.live} onClick={() => d.act('pose', { scenario: pick })}>
            Pose it
          </button>
        </div>
      </div>
    );
  }
  if (!s.revealed) {
    return (
      <div className="dsp-mk-practice is-waiting">
        <p className="dsp-mk-posed">
          <span className="dsp-sub">The change</span> {s.pending.text}
        </p>
        <p className="dsp-mk-q">{QUESTION}</p>
        {s.prediction ? (
          <p className="dsp-mk-pred">
            Your prediction: price {s.prediction.price ?? '—'}
            {s.prediction.priceValue !== null ? ` (to ${fmt(s.prediction.priceValue)})` : ''}, quantity {s.prediction.quantity ?? '—'}
            {s.prediction.quantityValue !== null ? ` (to ${fmt(s.prediction.quantityValue)})` : ''}
            {s.prediction.why ? ` — because ${s.prediction.why}` : ''}
          </p>
        ) : (
          d.live && (
            <form
              className="dsp-mk-form"
              onSubmit={(e) => {
                e.preventDefault();
                d.act('predict', { ...(price ? { price } : {}), ...(quantity ? { quantity } : {}), ...(pv !== null ? { priceValue: pv } : {}), ...(qv !== null ? { quantityValue: qv } : {}), ...(why.trim() ? { why: why.trim() } : {}), by: 'person' });
              }}
            >
              <Group label="Price buyers pay">
                <Segmented label="Price buyers pay" options={DIRS} value={price} onChange={setPrice} />
              </Group>
              <Field label="to (optional)">
                <NumberEdit value={pv} label="Predicted price" onDone={setPv} />
              </Field>
              <Group label="Quantity traded">
                <Segmented label="Quantity traded" options={DIRS} value={quantity} onChange={setQuantity} />
              </Group>
              <Field label="to (optional)">
                <NumberEdit value={qv} label="Predicted quantity" onDone={setQv} />
              </Field>
              <Field label="Why you think so" wide>
                <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={400} aria-label="Why you think so" placeholder="in your words" />
              </Field>
              <button type="submit" disabled={!price && !quantity && pv === null && qv === null}>
                Lock in my prediction
              </button>
            </form>
          )
        )}
        {d.live && (
          <button type="button" className="dsp-mk-reveal" onClick={() => d.act('reveal', {})}>
            {s.prediction ? 'Reveal' : 'Reveal without predicting'}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="dsp-mk-practice is-revealed">
      <p className="dsp-mk-posed">
        <span className="dsp-sub">The change</span> {s.pending.text}
      </p>
      {last && (
        <p className="dsp-mk-result">
          Buyers pay {last.result.priceBefore === null ? '—' : fmt(last.result.priceBefore)} → {last.result.priceAfter === null ? '—' : fmt(last.result.priceAfter)} ({last.result.price ?? '—'}); traded{' '}
          {last.result.quantityBefore === null ? '—' : fmt(last.result.quantityBefore)} → {last.result.quantityAfter === null ? '—' : fmt(last.result.quantityAfter)} ({last.result.quantity ?? '—'}).
          {last.predicted
            ? ` Your prediction: price ${last.right.price === null ? 'not predicted' : last.right.price ? 'right' : 'not right'}, quantity ${last.right.quantity === null ? 'not predicted' : last.right.quantity ? 'right' : 'not right'}.`
            : ' You did not predict this one.'}
        </p>
      )}
      <ul className="dsp-mk-why">
        {explainChange(s, s.pending.change).map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

// ── the levers ───────────────────────────────────────────────────────

function Levers({ d }: { d: D }) {
  const s = d.state;
  const a = s.applied;
  const step = Math.max(1, Math.round(marketWindow(s).qMax / 10));
  return (
    <details className="dsp-details dsp-mk-levers">
      <summary>Change the market yourself</summary>
      <div className="dsp-fields">
        <Field label="Demand: P = a + bQ">
          <span className="dsp-mk-pair">
            <NumberEdit value={s.demand.intercept} label="Demand intercept" disabled={!d.live} onDone={(v) => v !== null && d.act('param', { curve: 'demand', intercept: v, by: 'person' })} />
            <NumberEdit value={s.demand.slope} label="Demand slope" disabled={!d.live} onDone={(v) => v !== null && d.act('param', { curve: 'demand', slope: v, by: 'person' })} />
          </span>
        </Field>
        <Field label="Supply: P = a + bQ">
          <span className="dsp-mk-pair">
            <NumberEdit value={s.supply.intercept} label="Supply intercept" disabled={!d.live} onDone={(v) => v !== null && d.act('param', { curve: 'supply', intercept: v, by: 'person' })} />
            <NumberEdit value={s.supply.slope} label="Supply slope" disabled={!d.live} onDone={(v) => v !== null && d.act('param', { curve: 'supply', slope: v, by: 'person' })} />
          </span>
        </Field>
        <Group label="Tax per unit">
          <span className="dsp-mk-pair">
            <NumberEdit value={a.tax} label="Tax per unit" min={0} disabled={!d.live} onDone={(v) => d.act('tax', { t: v ?? 0, on: a.on })} />
            <Segmented<Side> label="Who pays it" options={[{ id: 'sellers', label: 'Sellers' }, { id: 'buyers', label: 'Buyers' }]} value={a.on} disabled={!d.live || !a.tax} onChange={(on) => d.act('tax', { t: a.tax, on })} />
          </span>
        </Group>
        <Field label="Subsidy per unit">
          <NumberEdit value={a.subsidy} label="Subsidy per unit" min={0} disabled={!d.live} onDone={(v) => d.act('subsidy', { s: v ?? 0, on: a.on })} />
        </Field>
        <Group label="Shift demand">
          <span className="dsp-mk-pair">
            <button type="button" className="dsp-tool" disabled={!d.live} onClick={() => d.act('shift', { curve: 'demand', by: -step })} aria-label={`Shift demand left by ${step}`}>
              ← {step}
            </button>
            <button type="button" className="dsp-tool" disabled={!d.live} onClick={() => d.act('shift', { curve: 'demand', by: step })} aria-label={`Shift demand right by ${step}`}>
              {step} →
            </button>
          </span>
        </Group>
        <Group label="Shift supply">
          <span className="dsp-mk-pair">
            <button type="button" className="dsp-tool" disabled={!d.live} onClick={() => d.act('shift', { curve: 'supply', by: -step })} aria-label={`Shift supply left by ${step}`}>
              ← {step}
            </button>
            <button type="button" className="dsp-tool" disabled={!d.live} onClick={() => d.act('shift', { curve: 'supply', by: step })} aria-label={`Shift supply right by ${step}`}>
              {step} →
            </button>
          </span>
        </Group>
        <Field label="Price ceiling">
          <NumberEdit value={a.ceiling} label="Price ceiling" placeholder="none" disabled={!d.live} onDone={(v) => d.act('ceiling', { p: v === null ? '' : v })} />
        </Field>
        <Field label="Price floor">
          <NumberEdit value={a.floor} label="Price floor" placeholder="none" disabled={!d.live} onDone={(v) => d.act('floor', { p: v === null ? '' : v })} />
        </Field>
      </div>
    </details>
  );
}

function Log({ s }: { s: S }) {
  if (!s.log.length) return null;
  const right = s.log.filter((l) => l.right.price && l.right.quantity).length;
  return (
    <details className="dsp-details">
      <summary>
        Past scenarios — {right} of {s.log.length} predicted right on both
      </summary>
      <ol className="dsp-mk-log">
        {s.log.map((l, i) => (
          <li key={i}>
            {l.text}: price {l.result.price ?? '—'}, quantity {l.result.quantity ?? '—'}
            {l.predicted ? ` — you: ${l.right.price ? 'price right' : 'price not right'}, ${l.right.quantity ? 'quantity right' : 'quantity not right'}` : ' — not predicted'}
          </li>
        ))}
      </ol>
    </details>
  );
}
