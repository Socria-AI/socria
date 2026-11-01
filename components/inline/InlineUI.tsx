'use client';
// components/inline/InlineUI.tsx — THE INLINE ELEMENTS, DRAWN IN THE CONVERSATION.
//
// Eighteen small things a reply can hold (lib/inline-ui.ts): a chart, a slider, a
// comparison, reasoning folded under its conclusion, choices to tap, a draft to
// edit, the parts of a subject to explore, steps or events in order, the ways
// an open piece of work could go next, a decision they weigh themselves, a
// picture of how parts connect, the case for and against one thing, a
// definition as one equation — and things to reason with: a graph whose
// numbers they drag, a small simulation, the working with their numbers, a
// question they work out and check.
// Each is drawn from a validated description, in the reading column,
// quietly — a thin rule, the conversation's own type, nothing that looks like
// a dashboard. What the person does with one (a slider moved, a choice tapped,
// a draft edited) is kept with the message (`host.onState`); the larger ones
// open in the Artifacts view as full artifacts (`host.onOpen`).
//
// Nothing here computes a claim: a chart draws the numbers it was given and
// says where they came from; a slider evaluates the formula it shows with the
// math engine's parser; a comparison marks the figures nothing checked.
//
// AN ELEMENT THAT BREAKS NEVER TAKES THE REPLY WITH IT. Each is drawn inside
// a boundary (InlineSafe): if drawing one throws — a shape nobody foresaw, a
// number past what the arithmetic holds — the element becomes its own words
// (inlinePlainText), in a paragraph where it stood, and the prose around it
// that refers to it still has something to refer to.

import { Component, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { compileExpr } from '@/lib/logos-math';
import { linearScale, scaleAt, fmtNum } from '@/lib/objects/display-data';
import { CLAIM_SAID, decideLeaning, decideTally, graphReadings, HOLDS_SAID, inlinePlainText, meanSaid, pathAsk, SCORE_SAID, WEIGHT_SAID, type BalanceItem, type BalanceSpec, type DiagramSpec, type EquationSpec, type ChartSpec, type CheckPart, type ClaimSpec, type CompareSpec, type GraphFeature, type ConceptsSpec, type DecideSpec, type DraftSpec, type GraphSpec, type InlineSpec, type InlineState, type OptionsSpec, type ParamSpec, type PathsSpec, type PredictSpec, type ReasoningSpec, type SequenceSpec, type SimSpec, type SliderSpec, type StepsSpec } from '@/lib/inline-ui';
import { checkTyped, compileOver, compileOverT, curveFeatures, fitWindow, fitWindowAll, fmtPoint, fmtVal, prettyExpr, sampleCurve, samplePath, timeAt, type Feature, type Pt, type Seg } from '@/lib/inline-math';
import { DIAGRAM_ROLE_SAID, diagramColumns, diagramFigure, linksOf, treeRows } from '@/lib/inline-diagram';
import { TeX } from '@/components/TeX';
import { copyText } from '@/lib/copy-text';
import './inline.css';

export interface InlineHost {
  /** what was done with each element, by its position in the reply */
  state?: Record<string, InlineState>;
  onState?: (n: number, s: InlineState) => void;
  /** a choice tapped: sent as their next message */
  onChoose?: (text: string) => void;
  /** a chart or a comparison opened as a full artifact in the Artifacts view (once; after that, what it made opens) */
  onOpen?: (n: number, spec: InlineSpec) => void;
  /** choices can still be tapped — nothing has been said since this reply */
  live?: boolean;
  /**
   * Going deeper from any reply, not only the latest (a way it could go, a
   * decision talked through): sent as their next message, so the whole
   * conversation comes with it. Absent while something is being written, and
   * where the conversation cannot be added to.
   */
  onExplore?: (text: string) => void;
}

type RenderInline = (text: string, key: string) => ReactNode;

/** One element: drawn, waiting to be (the reply is still writing it), or nothing (it was not one of the kinds). */
export function InlineBlock({ spec, open, n, host, renderInline }: { spec: InlineSpec | null; open: boolean; n: number; host?: InlineHost; renderInline: RenderInline }) {
  if (open) {
    return (
      <div className="ln-pending" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    );
  }
  if (!spec) return null;
  const state = host?.state?.[String(n)];
  const setState = (s: InlineState) => host?.onState?.(n, s);
  const el = <InlineSafe spec={spec}>{drawn(spec, n, host, state, setState, renderInline)}</InlineSafe>;
  // KEEP (lib/objects/display-kept.ts): anything worth coming back to goes into Artifacts as it was left,
  // with the reply it came from. A chart, a comparison and a decision carry their own larger form's button.
  if (!host?.onOpen || !KEEPABLE.has(spec.type)) return el;
  const kept = !!state?.artifact;
  return (
    <div className="ln-keepable">
      {el}
      <button
        type="button"
        className={`ln-keep${kept ? ' is-kept' : ''}`}
        onClick={() => host.onOpen!(n, spec)}
        title={kept ? 'Open what you kept, in Artifacts' : 'Keep this in Artifacts, as you left it'}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {kept ? <path d="M3.5 8.5 6.5 11.5 12.5 4.5" /> : <path d="M4 2.5h8v11l-4-2.8-4 2.8z" />}
        </svg>
        {kept ? 'Kept — open in Artifacts' : 'Keep'}
      </button>
    </div>
  );
}

/** Kept with a press of Keep: everything but the ways onward (they are only ever a next message), and the three with larger forms of their own. */
const KEEPABLE = new Set<InlineSpec['type']>(['graph', 'sim', 'claim', 'check', 'steps', 'slider', 'reasoning', 'concepts', 'sequence', 'draft', 'diagram', 'balance', 'equation']);

/** An element that could not be drawn, said instead: its words where it stood (nothing, if even they cannot be said). */
export function InlineFallback({ spec }: { spec: InlineSpec }) {
  let text = '';
  try {
    text = inlinePlainText(spec);
  } catch {
    text = '';
  }
  return text ? <p className="ln-fallback">{text}</p> : null;
}

/**
 * The boundary each element is drawn in: what throws while drawing it is
 * caught here, and the element is said in words instead (InlineFallback) — the
 * reply, the conversation and the page go on. A new spec is tried afresh.
 */
export class InlineSafe extends Component<{ spec: InlineSpec; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { spec: InlineSpec }) {
    if (prev.spec !== this.props.spec && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? <InlineFallback spec={this.props.spec} /> : this.props.children;
  }
}

function drawn(spec: InlineSpec, n: number, host: InlineHost | undefined, state: InlineState | undefined, setState: (s: InlineState) => void, renderInline: RenderInline) {
  switch (spec.type) {
    case 'chart':
      return <InlineChart spec={spec} onOpen={host?.onOpen ? () => host.onOpen!(n, spec) : undefined} />;
    case 'slider':
      return <InlineSlider spec={spec} state={state} onState={setState} />;
    case 'compare':
      return <InlineCompare spec={spec} onOpen={host?.onOpen ? () => host.onOpen!(n, spec) : undefined} />;
    case 'reasoning':
      return <InlineReasoning spec={spec} state={state} onState={setState} renderInline={renderInline} />;
    case 'options':
      return <InlineOptions spec={spec} state={state} live={!!host?.live && !!host?.onChoose} onPick={(i, text) => { setState({ ...state, chosen: i }); host?.onChoose?.(text); }} />;
    case 'draft':
      return <InlineDraft spec={spec} state={state} onState={setState} />;
    case 'concepts':
      return <InlineConcepts spec={spec} state={state} onState={setState} onAsk={host?.live ? host?.onChoose : undefined} renderInline={renderInline} />;
    case 'sequence':
      return <InlineSequence spec={spec} state={state} onState={setState} renderInline={renderInline} />;
    case 'paths':
      return <InlinePaths spec={spec} state={state} onState={setState} onExplore={host?.onExplore ?? (host?.live ? host?.onChoose : undefined)} renderInline={renderInline} />;
    case 'decide':
      return <InlineDecide spec={spec} state={state} onState={host?.onState ? setState : undefined} onAsk={host?.onExplore ?? (host?.live ? host?.onChoose : undefined)} onOpen={host?.onOpen ? (s) => host.onOpen!(n, s) : undefined} />;
    case 'graph':
      return <InlineGraph spec={spec} state={state} onState={setState} shared={!!host?.onState} renderInline={renderInline} />;
    case 'sim':
      return <InlineSim spec={spec} state={state} onState={setState} shared={!!host?.onState} />;
    case 'check':
      return (
        <div className="ln ln-check">
          <CheckBox part={spec} state={state} onState={setState} renderInline={renderInline} />
        </div>
      );
    case 'steps':
      return <InlineSteps spec={spec} state={state} onState={setState} renderInline={renderInline} />;
    case 'claim':
      return <InlineClaim spec={spec} state={state} onState={setState} shared={!!host?.onState} renderInline={renderInline} />;
    case 'diagram':
      return <InlineDiagram spec={spec} state={state} onState={setState} renderInline={renderInline} />;
    case 'balance':
      return <InlineBalance spec={spec} renderInline={renderInline} />;
    case 'equation':
      return <InlineEquation spec={spec} renderInline={renderInline} />;
  }
}

function OpenButton({ onOpen, what }: { onOpen?: () => void; what: string }) {
  if (!onOpen) return null;
  return (
    <button type="button" className="ln-open" onClick={onOpen} title={`Open this ${what} in Artifacts`}>
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" />
      </svg>
      Open in Artifacts
    </button>
  );
}

// ── chart ────────────────────────────────────────────────────────────

const BASIS_SAID: Record<ChartSpec['basis'], string> = {
  given: 'Your numbers',
  source: 'From the sources this turn',
  illustrative: 'Example numbers — not real data',
};

function fmtWith(v: number, unit?: string): string {
  const s = fmtNum(v);
  if (!unit) return s;
  if (/^[$£€¥₹]$/.test(unit)) return v < 0 ? `-${unit}${s.replace(/^-/, '')}` : `${unit}${s}`;
  // a percentage, a degree: no space before the sign
  return /^(?:%|‰|°)$/.test(unit) ? `${s}${unit}` : `${s} ${unit}`;
}

/** Whole percentages that add up to 100 (largest remainder): a legend that sums to 99 reads as an error. */
function percents(shares: number[]): number[] {
  const raw = shares.map((x) => x * 100);
  const out = raw.map(Math.floor);
  let left = Math.round(100 - out.reduce((a, b) => a + b, 0));
  // the largest remainders round up; a tie (to float noise) goes to the larger slice
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => (Math.abs(b[0] - a[0]) > 1e-9 ? b[0] - a[0] : raw[b[1]] - raw[a[1]]));
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

function InlineChart({ spec, onOpen }: { spec: ChartSpec; onOpen?: () => void }) {
  const [hot, setHot] = useState<Hot | null>(null);
  const [plot, width] = useWidth<HTMLDivElement>(520);
  // a pie is part-to-whole at a glance: two slices say less than two bars, and past six it is noise
  const kind = spec.kind === 'pie' && (spec.x.length < 3 || spec.x.length > 6) ? 'bar' : spec.kind;
  const many = spec.series.length > 1;
  const summary = `${spec.title ? `${spec.title}. ` : ''}${spec.x.map((x, i) => `${x}: ${spec.series.map((s) => fmtWith(s.values[i], spec.unit)).join(', ')}`).join('; ')}.`;
  return (
    <figure className={`ln ln-chart is-${kind}${many ? ' is-many' : ''}`}>
      {spec.title && <figcaption className="ln-title">{spec.title}</figcaption>}
      <div className="ln-plot" ref={plot} role="group" aria-label={summary}>
        {kind === 'pie' ? <Pie spec={spec} hot={hot?.i ?? null} setHot={(i) => setHot(i === null ? null : { s: 0, i, x: 0, y: 0 })} /> : <Axes spec={spec} kind={kind} width={width} hot={hot} setHot={setHot} />}
        {hot && kind !== 'pie' && (
          <p className="ln-tip" style={{ left: Math.max(56, Math.min(width - 56, hot.x)), top: hot.y }}>
            <b>{spec.x[hot.i]}</b>
            {many && <span>{spec.series[hot.s].name || `Series ${hot.s + 1}`}</span>}
            <span className="ln-tip-v">{fmtWith(spec.series[hot.s].values[hot.i], spec.unit)}</span>
          </p>
        )}
      </div>
      {many && (
        <ul className="ln-legend" aria-label="Series">
          {spec.series.map((s, i) => (
            <li key={i}>
              <span className={`ln-key s${i + 1}`} aria-hidden="true" />
              {s.name || `Series ${i + 1}`}
            </li>
          ))}
        </ul>
      )}
      {/* a block that is one pixel and clips what is in it: a table, however wide its numbers, never widens the page */}
      <div className="ln-sr">
      <table>
        <caption>{spec.title || 'Chart'}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            {spec.series.map((s, i) => (
              <th key={i} scope="col">{s.name || spec.unit || 'Value'}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.x.map((x, r) => (
            <tr key={r}>
              <th scope="row">{x}</th>
              {spec.series.map((s, i) => (
                <td key={i}>{fmtWith(s.values[r], spec.unit)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="ln-foot">
        <span className={`ln-basis${spec.basis === 'illustrative' ? ' is-example' : ''}`}>{BASIS_SAID[spec.basis]}</span>
        <OpenButton onOpen={onOpen} what="chart" />
      </div>
    </figure>
  );
}

/** The mark under the pointer or the focus: which one, and where its top is, in the plot's own pixels. */
type Hot = { s: number; i: number; x: number; y: number };

/**
 * The width a plot actually has, so its words are drawn at their real size: an
 * SVG scaled into a phone's column would shrink an 11px tick label to seven.
 */
function useWidth<T extends HTMLElement>(fallback: number): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setW((cur) => (Math.abs(cur - next) >= 2 ? next : cur));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const CH = 6.4; // the width of a tick label's character, near enough, at 11px

function Axes({ spec, kind, width, hot, setHot }: { spec: ChartSpec; kind: 'bar' | 'line'; width: number; hot: Hot | null; setHot: (h: Hot | null) => void }) {
  const W = Math.max(240, width);
  const H = W < 420 ? 172 : 196;
  const all = spec.series.flatMap((s) => s.values);
  // a bar's length is its value, so its axis always holds zero (lib/objects/display-data.ts)
  const sc = linearScale(all, { zero: kind === 'bar', want: W < 420 ? 3 : 4 });
  const PAD = { l: 10 + Math.max(...sc.ticks.map((t) => fmtNum(t).length)) * CH, r: 10, t: 12, b: 28 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + ih - scaleAt(sc, v) * ih;
  const n = spec.x.length;
  const band = iw / n;
  const groups = spec.series.length;
  // thin marks with a 2px gap between neighbours
  const barW = Math.max(3, Math.min(32, (band * 0.62 - (groups - 1) * 2) / groups));
  const zero = y(Math.max(sc.lo, Math.min(sc.hi, 0)));
  // as many labels along the bottom as fit, every other one when they would collide
  const longest = Math.min(14, Math.max(...spec.x.map((l) => l.length)));
  const every = Math.max(1, Math.ceil((longest * CH + 10) / band));
  const fit = Math.max(3, Math.floor((band * every - 8) / CH));
  const label = (l: string) => (l.length > fit ? `${l.slice(0, fit - 1)}…` : l);
  const cx = (i: number) => PAD.l + band * (i + 0.5);
  const mark = (si: number, i: number, top: number) => ({
    tabIndex: 0,
    role: 'img',
    'aria-label': `${spec.x[i]}${groups > 1 ? `, ${spec.series[si].name || `series ${si + 1}`}` : ''}: ${fmtWith(spec.series[si].values[i], spec.unit)}`,
    onMouseEnter: () => setHot({ s: si, i, x: cx(i), y: top }),
    onMouseLeave: () => setHot(null),
    onFocus: () => setHot({ s: si, i, x: cx(i), y: top }),
    onBlur: () => setHot(null),
    onClick: () => setHot({ s: si, i, x: cx(i), y: top }),
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={`ln-svg${hot ? ' has-hot' : ''}`}>
      {sc.ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'ln-zero' : 'ln-grid'} />
          <text x={PAD.l - 6} y={y(t)} className="ln-ytick" dominantBaseline="middle" textAnchor="end">
            {fmtNum(t)}
          </text>
        </g>
      ))}
      {spec.x.map((l, i) =>
        i % every === 0 ? (
          <text key={i} x={cx(i)} y={H - 9} className="ln-xtick" textAnchor="middle">
            {label(l)}
          </text>
        ) : null
      )}
      {kind === 'bar'
        ? spec.series.map((s, si) =>
            s.values.map((v, i) => {
              const x = cx(i) - (groups * barW + (groups - 1) * 2) / 2 + si * (barW + 2);
              const top = Math.min(y(v), zero);
              const h = Math.max(1, Math.abs(zero - y(v)));
              return (
                <rect
                  key={`${si}-${i}`}
                  x={x}
                  y={top}
                  width={barW}
                  height={h}
                  rx={Math.min(4, barW / 2)}
                  className={`ln-bar s${groups > 1 ? si + 1 : 0}${hot?.s === si && hot.i === i ? ' is-hot' : ''}`}
                  {...mark(si, i, top)}
                />
              );
            })
          )
        : spec.series.map((s, si) => (
            <g key={si}>
              <polyline points={s.values.map((v, i) => `${cx(i)},${y(v)}`).join(' ')} className={`ln-line s${groups > 1 ? si + 1 : 0}`} />
              {s.values.map((v, i) => (
                <circle key={i} cx={cx(i)} cy={y(v)} r={hot?.s === si && hot.i === i ? 5.5 : 4} className={`ln-dot s${groups > 1 ? si + 1 : 0}${hot?.s === si && hot.i === i ? ' is-hot' : ''}`} {...mark(si, i, y(v))} />
              ))}
            </g>
          ))}
    </svg>
  );
}

function Pie({ spec, hot, setHot }: { spec: ChartSpec; hot: number | null; setHot: (i: number | null) => void }) {
  const values = spec.series[0].values;
  const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  let at = -Math.PI / 2;
  const R = 70;
  const r = 44;
  const c = 76;
  const arcs = values.map((v, i) => {
    const a0 = at;
    const a1 = at + (Math.max(0, v) / total) * Math.PI * 2;
    at = a1;
    const share = Math.max(0, v) / total;
    const p = (a: number, rad: number) => `${(c + rad * Math.cos(a)).toFixed(2)},${(c + rad * Math.sin(a)).toFixed(2)}`;
    // a slice that is the whole ring is two halves: one arc cannot start and end at the same point
    const d =
      share >= 0.9999
        ? `M${p(-Math.PI / 2, R)} A${R},${R} 0 1 1 ${p(Math.PI / 2, R)} A${R},${R} 0 1 1 ${p(-Math.PI / 2, R)} M${p(-Math.PI / 2, r)} A${r},${r} 0 1 0 ${p(Math.PI / 2, r)} A${r},${r} 0 1 0 ${p(-Math.PI / 2, r)} Z`
        : `M${p(a0, R)} A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 0 ${p(a0, r)} Z`;
    return { d, i, share };
  });
  const pct = percents(arcs.map((a) => a.share));
  return (
    <div className={`ln-pie${hot !== null ? ' has-hot' : ''}`}>
      <svg viewBox="0 0 152 152" width="152" height="152" className="ln-svg is-pie">
        {arcs.map((a) =>
          a.share > 0 ? (
            <path
              key={a.i}
              d={a.d}
              fillRule="evenodd"
              className={`ln-slice k${a.i}${hot === a.i ? ' is-hot' : ''}`}
              tabIndex={0}
              aria-label={`${spec.x[a.i]}: ${fmtWith(values[a.i], spec.unit)}, ${pct[a.i]}%`}
              onMouseEnter={() => setHot(a.i)}
              onMouseLeave={() => setHot(null)}
              onFocus={() => setHot(a.i)}
              onBlur={() => setHot(null)}
              onClick={() => setHot(a.i)}
            />
          ) : null
        )}
      </svg>
      {/* every slice named with its amount and share: identity is never the colour alone */}
      <ul className="ln-pie-key">
        {arcs.map((a) => (
          <li key={a.i} className={hot === a.i ? 'is-hot' : ''} onMouseEnter={() => setHot(a.i)} onMouseLeave={() => setHot(null)}>
            <span className={`ln-key k${a.i}`} aria-hidden="true" />
            <span className="ln-pie-l">{spec.x[a.i]}</span>
            <span className="ln-pie-v">{fmtWith(values[a.i], spec.unit)}</span>
            <span className="ln-pie-p">{pct[a.i]}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── slider ───────────────────────────────────────────────────────────

function InlineSlider({ spec, state, onState }: { spec: SliderSpec; state?: InlineState; onState: (s: InlineState) => void }) {
  const compiled = useMemo(() => compileExpr(spec.formula, spec.vars.map((v) => v.name)), [spec]);
  const start = useMemo(() => Object.fromEntries(spec.vars.map((v) => [v.name, state?.values?.[v.name] ?? v.value])), [spec, state]);
  const [values, setValues] = useState<Record<string, number>>(start);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);
  const result = compiled ? compiled.eval(values) : NaN;
  const digits = spec.result.digits ?? 2;
  const shown = Number.isFinite(result) ? fmtWith(Number(result.toFixed(digits)), spec.result.unit) : '—';
  const set = (name: string, v: number) => {
    const next = { ...values, [name]: v };
    setValues(next);
    // kept with the message once the hand stops, not on every pixel
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onState({ ...state, values: next }), 400);
  };
  return (
    <div className="ln ln-slider">
      {spec.title && <p className="ln-title">{spec.title}</p>}
      <p className="ln-result" aria-live="polite">
        <span className="ln-result-k">{spec.result.label}</span>
        <span className="ln-result-v">{shown}</span>
      </p>
      {spec.vars.map((v) => (
        <label key={v.name} className="ln-var">
          <span className="ln-var-top">
            <span className="ln-var-k">{v.label}</span>
            <span className="ln-var-v">{fmtWith(values[v.name], v.unit)}</span>
          </span>
          <input
            type="range"
            min={v.min}
            max={v.max}
            step={v.step}
            value={values[v.name]}
            aria-valuetext={fmtWith(values[v.name], v.unit)}
            onChange={(e) => set(v.name, Number(e.target.value))}
          />
        </label>
      ))}
      <div className="ln-foot">
        <span className="ln-formula" title={`What the result is computed from: ${spec.formula}`}>
          {spec.result.label} = <FormulaText formula={spec.formula} names={spec.vars.map((v) => v.name)} labels={Object.fromEntries(spec.vars.map((v) => [v.name, v.name]))} />
        </span>
      </div>
    </div>
  );
}

// ── comparison ───────────────────────────────────────────────────────

function InlineCompare({ spec, onOpen }: { spec: CompareSpec; onOpen?: () => void }) {
  const anyUnchecked = spec.rows.some((r) => r.unchecked?.length);
  return (
    <div className="ln ln-compare">
      {spec.title && <p className="ln-title">{spec.title}</p>}
      <div className="ln-scroll">
        <table className="ln-table">
          <thead>
            <tr>
              <td />
              {spec.options.map((o, i) => (
                <th key={i} scope="col" className={spec.pick === i ? 'is-pick' : ''}>
                  {o}
                  {spec.pick === i && <span className="ln-pick">leaning</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.rows.map((r, ri) => (
              <tr key={ri}>
                <th scope="row">{r.label}</th>
                {r.values.map((v, i) => {
                  const unchecked = r.unchecked?.includes(i);
                  return (
                    <td key={i} className={`${spec.pick === i ? 'is-pick' : ''}${unchecked ? ' is-unchecked' : ''}`} title={unchecked ? 'Not checked against anything you gave or a source this turn' : undefined}>
                      {v}
                      {unchecked && <sup aria-label="not checked">◦</sup>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ln-foot">
        {anyUnchecked ? <span className="ln-basis">◦ not checked against anything you gave or a source — worth confirming</span> : <span />}
        <OpenButton onOpen={onOpen} what="comparison" />
      </div>
    </div>
  );
}

// ── reasoning ────────────────────────────────────────────────────────

function InlineReasoning({ spec, state, onState, renderInline }: { spec: ReasoningSpec; state?: InlineState; onState: (s: InlineState) => void; renderInline: RenderInline }) {
  return (
    <details className="ln ln-reason" open={!!state?.open} onToggle={(e) => onState({ ...state, open: (e.currentTarget as HTMLDetailsElement).open })}>
      <summary>
        <span className="ln-why">Why</span>
        <span className="ln-sum">{renderInline(spec.summary, 'sum')}</span>
        <span className="ln-count">{spec.steps.length} step{spec.steps.length === 1 ? '' : 's'}</span>
      </summary>
      <ol>
        {spec.steps.map((s, i) => (
          <li key={i}>{renderInline(s, `st${i}`)}</li>
        ))}
      </ol>
    </details>
  );
}

// ── the parts of a subject ───────────────────────────────────────────

/**
 * An overview to explore, not a list to read: each part named with its line;
 * open one and its fuller explanation shows beneath, with the parts it
 * connects to lit and a press away. Taken further in the conversation ("Go
 * deeper"), or seen whole as a map of how they connect (the Logic Map, asked
 * for in words, so the screen follows the runtime's own rule D).
 */
function InlineConcepts({
  spec,
  state,
  onState,
  onAsk,
  renderInline,
}: {
  spec: ConceptsSpec;
  state?: InlineState;
  onState: (s: InlineState) => void;
  onAsk?: (text: string) => void;
  renderInline: RenderInline;
}) {
  const id = useId();
  const picked = state?.picked !== undefined && state.picked < spec.items.length ? state.picked : null;
  const cur = picked !== null ? spec.items[picked] : null;
  const indexOf = (name: string) => spec.items.findIndex((x) => x.name === name);
  // connected either way: what this part names, and what names it
  const linked = new Set<number>(
    cur ? [...(cur.links ?? []).map(indexOf), ...spec.items.map((x, i) => (x.links?.includes(cur.name) ? i : -1))].filter((i) => i >= 0 && i !== picked) : []
  );
  const pick = (i: number | null) => onState({ ...state, picked: i ?? undefined });
  // what an opened part says: in its own panel under the cards, or — on a phone, where the cards stack —
  // directly under the card pressed, so it is never a scroll away (one of the two is drawn at each width)
  const detail = (where: 'panel' | 'inline') =>
    cur && (
      <div className={`ln-concept is-${where}`} {...(where === 'panel' ? { id: `${id}-d`, 'aria-live': 'polite' as const } : {})}>
        <p className="ln-concept-h">{cur.name}</p>
        <p className="ln-concept-d">{renderInline(cur.detail ?? cur.gist, `d-${where}`)}</p>
        {linked.size > 0 && (
          <p className="ln-concept-links">
            <span className="ln-basis">Connects to</span>
            {[...linked].map((i) => (
              <button key={i} type="button" className="ln-link" onClick={() => pick(i)}>
                {spec.items[i].name}
              </button>
            ))}
          </p>
        )}
      </div>
    );
  return (
    <div className="ln ln-concepts" role="group" aria-label={spec.title || 'The parts of it'}>
      {spec.title && <p className="ln-title">{spec.title}</p>}
      <ul className="ln-cards">
        {spec.items.map((x, i) => (
          <li key={i}>
            <button
              type="button"
              className={`ln-card${picked === i ? ' is-on' : ''}${linked.has(i) ? ' is-linked' : ''}`}
              aria-expanded={picked === i}
              aria-controls={`${id}-d`}
              onClick={() => pick(picked === i ? null : i)}
            >
              <span className="ln-card-n">{x.name}</span>
              <span className="ln-card-g">{renderInline(x.gist, `g${i}`)}</span>
            </button>
            {picked === i && detail('inline')}
          </li>
        ))}
      </ul>
      {detail('panel')}
      <div className="ln-foot">
        <span className="ln-basis">{cur ? `${picked! + 1} of ${spec.items.length}` : 'Open one to read more'}</span>
        {onAsk && (
          <span className="ln-acts">
            {cur && (
              <button type="button" className="ln-open" onClick={() => onAsk(`Take me further into ${cur.name}.`)}>
                Go deeper
              </button>
            )}
            <button type="button" className="ln-open" onClick={() => onAsk(`Map out how these connect: ${spec.items.map((x) => x.name).join(', ')}.`)} title="Draw how these parts connect, in the Logic Map">
              See how they connect
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

// ── steps, or events in time ─────────────────────────────────────────

/**
 * The order is the point: steps numbered (and ticked off as they are done,
 * kept with the message), or events against their dates. An item with more to
 * say opens in place.
 */
function InlineSequence({ spec, state, onState, renderInline }: { spec: SequenceSpec; state?: InlineState; onState: (s: InlineState) => void; renderInline: RenderInline }) {
  const steps = spec.kind === 'steps';
  const done = new Set(state?.done ?? []);
  const picked = state?.picked;
  const toggle = (i: number) => {
    const next = new Set(done);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onState({ ...state, done: [...next].sort((a, b) => a - b) });
  };
  return (
    <div className={`ln ln-seq is-${spec.kind}`}>
      {spec.title && <p className="ln-title">{spec.title}</p>}
      <ol className="ln-seq-list">
        {spec.items.map((x, i) => {
          const open = picked === i && !!x.detail;
          return (
            <li key={i} className={`ln-seq-item${done.has(i) ? ' is-done' : ''}${open ? ' is-open' : ''}`}>
              <span className="ln-seq-mark" aria-hidden="true">
                {steps ? (done.has(i) ? '✓' : i + 1) : ''}
              </span>
              <div className="ln-seq-body">
                {!steps && <span className="ln-seq-when">{x.when}</span>}
                {x.detail ? (
                  <button type="button" className="ln-seq-label" aria-expanded={open} onClick={() => onState({ ...state, picked: open ? undefined : i })}>
                    {renderInline(x.label, `l${i}`)}
                  </button>
                ) : (
                  <span className="ln-seq-label">{renderInline(x.label, `l${i}`)}</span>
                )}
                {open && <p className="ln-seq-detail">{renderInline(x.detail!, `d${i}`)}</p>}
              </div>
              {steps && <input type="checkbox" className="ln-seq-check" aria-label={`Done: step ${i + 1}`} checked={done.has(i)} onChange={() => toggle(i)} />}
            </li>
          );
        })}
      </ol>
      {steps && (
        <div className="ln-foot">
          <span className="ln-basis" aria-live="polite">
            {done.size ? `${done.size} of ${spec.items.length} done` : 'Tick each off as you go'}
          </span>
        </div>
      )}
    </div>
  );
}

// ── ways deeper ──────────────────────────────────────────────────────

/**
 * Where an open piece of work could go next: each way a row — its name and a
 * line on what opening it gives them — never a card. Opening one sends it as
 * their next message, so the conversation carries on with everything said so
 * far; an explored way is marked and the others stay, to come back to. Where
 * nothing can be sent (read-only, or a reply is being written) they are the
 * words they are.
 */
function InlinePaths({ spec, state, onState, onExplore, renderInline }: { spec: PathsSpec; state?: InlineState; onState: (s: InlineState) => void; onExplore?: (text: string) => void; renderInline: RenderInline }) {
  const done = new Set(state?.done ?? []);
  const title = spec.title || 'Where it could go next';
  const explore = (i: number) => {
    if (!onExplore) return;
    onState({ ...state, done: [...new Set([...done, i])].sort((a, b) => a - b) });
    onExplore(pathAsk(spec.items[i]));
  };
  return (
    <div className="ln ln-paths" role="group" aria-label={title}>
      <p className="ln-paths-h" aria-hidden="true">
        {title}
      </p>
      <ul className="ln-paths-list">
        {spec.items.map((x, i) => {
          const words = (
            <>
              <span className="ln-path-l">
                {onExplore && <span className="ln-sr">Go deeper: </span>}
                {renderInline(x.label, `l${i}`)}
              </span>
              {x.gist && <span className="ln-path-g">{renderInline(x.gist, `g${i}`)}</span>}
            </>
          );
          return (
            <li key={i} className={done.has(i) ? 'is-done' : undefined}>
              {onExplore ? (
                <button type="button" className="ln-path" onClick={() => explore(i)}>
                  {words}
                  <span className="ln-path-go" aria-hidden="true">
                    {done.has(i) ? 'Explored' : '→'}
                  </span>
                  {done.has(i) && <span className="ln-sr"> (explored)</span>}
                </button>
              ) : (
                <div className="ln-path is-still">{words}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── a decision, weighed by them ──────────────────────────────────────

function Dots({ n }: { n: number }) {
  return (
    <span className="ln-dots" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < n ? 'is-on' : undefined} />
      ))}
    </span>
  );
}

/**
 * A decision laid out to be weighed: the options across, what it rests on
 * down, and in each cell Socria's first reading (three dots, poor to strong).
 * How much each thing matters is theirs — tap to change it — and so is any
 * reading they see differently; the leaning under it is the arithmetic of
 * their weights, said in a sentence and never more. "Talk it through" carries
 * their weighing into the conversation; it opens in Artifacts as a full
 * comparison, with the ranking and the sensitivity view.
 */
function InlineDecide({ spec, state, onState, onAsk, onOpen }: { spec: DecideSpec; state?: InlineState; onState?: (s: InlineState) => void; onAsk?: (text: string) => void; onOpen?: (spec: DecideSpec) => void }) {
  // with nowhere to keep it (a shared, read-only view), weighing still works — for this visit
  const [local, setLocal] = useState<InlineState | undefined>(undefined);
  const st = onState ? state : local ?? state;
  const set = (s: InlineState) => (onState ? onState(s) : setLocal(s));
  const t = decideTally(spec, st);
  const leaning = decideLeaning(spec, t);
  const changed = (ri: number, oi: number) => t.scores[ri][oi] !== spec.rows[ri].scores[oi];
  const weigh = (ri: number) => set({ ...st, weights: t.weights.map((w, i) => (i === ri ? (w + 1) % 4 : w)) });
  const rate = (ri: number, oi: number) => set({ ...st, scores: t.scores.map((row, i) => (i === ri ? row.map((v, j) => (j === oi ? (v + 1) % 4 : v)) : row)) });
  const said = () =>
    `Here is how I weighed it: ${spec.rows.map((r, ri) => `${r.label} ${WEIGHT_SAID[t.weights[ri]]}`).join('; ')}. ${leaning.replace(/ Say what matters more and it may change\.$/, '')} What am I not seeing?`;
  const handOff = (): DecideSpec => ({
    ...spec,
    ...(st?.weights ? { weights: t.weights } : {}),
    rows: spec.rows.map((r, ri) => {
      const theirs = r.scores.map((_v, oi) => (changed(ri, oi) ? oi : -1)).filter((oi) => oi >= 0);
      return { ...r, scores: t.scores[ri], ...(theirs.length ? { theirs } : {}) };
    }),
  });
  const pct = (v: number) => (t.most ? Math.round((v / t.most) * 100) : 0);
  return (
    <div className="ln ln-decide" role="group" aria-label={spec.title || `Deciding: ${spec.options.join(' or ')}`}>
      {spec.title && <p className="ln-title">{spec.title}</p>}
      <div className="ln-scroll">
        <table className="ln-table ln-decide-t">
          <thead>
            <tr>
              <td className="ln-decide-k">
                <span className="ln-basis">What it rests on</span>
              </td>
              {spec.options.map((o, oi) => (
                <th key={oi} scope="col" className={t.leaders.length === 1 && t.leaders[0] === oi && t.most > 0 ? 'is-lead' : undefined}>
                  {o}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.rows.map((r, ri) => (
              <tr key={ri} className={t.weights[ri] === 0 ? 'is-off' : undefined}>
                <th scope="row">
                  <span className="ln-decide-l">{r.label}</span>
                  {r.note && <span className="ln-decide-note">{r.note}</span>}
                  <button type="button" className="ln-weight" onClick={() => weigh(ri)} aria-label={`How much ${r.label} matters to you: ${WEIGHT_SAID[t.weights[ri]]}. Press to change.`}>
                    <Dots n={t.weights[ri]} />
                    <span>{WEIGHT_SAID[t.weights[ri]]}</span>
                  </button>
                </th>
                {spec.options.map((o, oi) => (
                  <td key={oi}>
                    <button
                      type="button"
                      className={`ln-rate${changed(ri, oi) ? ' is-theirs' : ''}`}
                      onClick={() => rate(ri, oi)}
                      aria-label={`${o} on ${r.label}: ${SCORE_SAID[t.scores[ri][oi]]}${changed(ri, oi) ? ', your reading' : ''}. Press to change.`}
                    >
                      <Dots n={t.scores[ri][oi]} />
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                <span className="ln-basis">{t.weighed ? 'With your weights' : 'Weighted evenly'}</span>
              </th>
              {spec.options.map((o, oi) => (
                <td key={oi}>
                  <span className={`ln-decide-bar${t.leaders.length === 1 && t.leaders[0] === oi && t.most > 0 ? ' is-lead' : ''}`} role="img" aria-label={`${o}: ${t.totals[oi]} of ${t.most}`}>
                    <i style={{ width: `${pct(t.totals[oi])}%` }} />
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="ln-decide-lean" aria-live="polite">
        {leaning}
      </p>
      <div className="ln-foot">
        <span className="ln-basis">The first reading in each cell is Socria’s; tap any you see differently.</span>
        <span className="ln-acts">
          {onAsk && (
            <button type="button" className="ln-open" onClick={() => onAsk(said())}>
              Talk it through
            </button>
          )}
          <OpenButton onOpen={onOpen ? () => onOpen(handOff()) : undefined} what="decision" />
        </span>
      </div>
    </div>
  );
}

// ── choices ──────────────────────────────────────────────────────────

function InlineOptions({ spec, state, live, onPick }: { spec: OptionsSpec; state?: InlineState; live: boolean; onPick: (i: number, text: string) => void }) {
  const chosen = state?.chosen;
  const done = chosen !== undefined || !live;
  return (
    <div className={`ln ln-options${done ? ' is-done' : ''}`} role="group" aria-label={spec.prompt || 'Choose one, or just type'}>
      {spec.prompt && <p className="ln-title">{spec.prompt}</p>}
      <div className="ln-chips">
        {spec.options.map((o, i) => (
          <button key={i} type="button" className={`ln-chip${chosen === i ? ' is-on' : ''}`} disabled={done} aria-pressed={chosen === i} onClick={() => onPick(i, o.reply ?? o.label)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── draft ────────────────────────────────────────────────────────────

const DRAFT_SAID: Record<NonNullable<DraftSpec['kind']>, string> = { email: 'Email', message: 'Message', note: 'Note', paragraph: 'Paragraph', post: 'Post', letter: 'Letter', invite: 'Invitation', bio: 'Bio', agenda: 'Agenda' };

function InlineDraft({ spec, state, onState }: { spec: DraftSpec; state?: InlineState; onState: (s: InlineState) => void }) {
  const [text, setText] = useState(state?.text ?? spec.text);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const edited = text !== spec.text;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 480)}px`;
  }, [text]);
  const keep = (t: string) => onState({ ...state, text: t === spec.text ? undefined : t });
  return (
    <div className="ln ln-draft">
      <div className="ln-draft-head">
        <span className="ln-title">{spec.title || (spec.kind ? DRAFT_SAID[spec.kind] : 'Draft')}</span>
        {edited && <span className="ln-edited">edited</span>}
      </div>
      <textarea ref={ref} value={text} aria-label={`${spec.title || 'Draft'} — edit in place`} spellCheck onChange={(e) => setText(e.target.value)} onBlur={() => keep(text)} />
      <div className="ln-foot">
        <span />
        <span className="ln-acts">
          {edited && (
            <button
              type="button"
              className="ln-open"
              onClick={() => {
                setText(spec.text);
                keep(spec.text);
              }}
            >
              Undo edits
            </button>
          )}
          <button
            type="button"
            className="ln-open"
            onClick={async () => {
              if (await copyText(text)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              }
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      </div>
    </div>
  );
}


// ── a formula, read as maths; its numbers to drag ────────────────────

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
/** A value moved onto a parameter's own steps, within its range. */
function onSteps(v: number, p: ParamSpec): number {
  const n = Math.round((v - p.min) / p.step);
  return r6(Math.min(p.max, Math.max(p.min, p.min + n * p.step)));
}

/**
 * A NUMBER TO DRAG, inside the equation: a slider in all but looks — dragged
 * sideways, or focused and moved with the arrow keys (Shift for ten steps,
 * Home and End for the ends). Locked while a prediction is still to be made.
 */
function Scrub({ p, value, shown, hot, locked, onChange, onHot }: { p: ParamSpec; value: number; shown: string; hot: boolean; locked: boolean; onChange: (v: number) => void; onHot: (on: boolean) => void }) {
  const drag = useRef<{ id: number; x: number; v: number } | null>(null);
  const set = (v: number) => onChange(onSteps(v, p));
  return (
    <span
      role="slider"
      tabIndex={locked ? -1 : 0}
      aria-label={p.label}
      aria-valuemin={p.min}
      aria-valuemax={p.max}
      aria-valuenow={value}
      aria-valuetext={`${p.label} ${fmtVal(value)}${p.unit ? ` ${p.unit}` : ''}`}
      aria-disabled={locked || undefined}
      className={`ln-scrub${hot ? ' is-hot' : ''}${locked ? ' is-locked' : ''}`}
      title={locked ? 'Answer the question first' : `Drag sideways, or use the arrow keys, to change ${p.label}`}
      onFocus={() => onHot(true)}
      onBlur={() => onHot(false)}
      onKeyDown={(e) => {
        if (locked) return;
        if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          set(e.key === 'Home' ? p.min : p.max);
          return;
        }
        const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        set(value + d * p.step * (e.shiftKey ? 10 : 1));
      }}
      onPointerDown={(e) => {
        if (locked || e.button !== 0) return;
        drag.current = { id: e.pointerId, x: e.clientX, v: value };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onHot(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        set(d.v + Math.round((e.clientX - d.x) / 8) * p.step);
      }}
      onPointerUp={() => {
        drag.current = null;
        onHot(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        onHot(false);
      }}
    >
      {shown}
    </span>
  );
}

/**
 * An expression laid out as maths (lib/inline-math.ts prettyExpr). With
 * `values`, each parameter is drawn as its number — the number to drag when
 * `onScrub` is given — and a sign meeting a negative number reads as one
 * ("+ −2x" is "− 2x"). Without, parameters are their names.
 */
function Expr({ segs, params, values, hot, locked, onScrub, onHot }: { segs: Seg[]; params: readonly ParamSpec[]; values?: Record<string, number>; hot?: string | null; locked?: boolean; onScrub?: (name: string, v: number) => void; onHot?: (name: string | null) => void }) {
  const byName = new Map(params.map((p) => [p.name, p]));
  const draw = (list: Seg[], key: string): ReactNode[] => {
    // how each sign before a negative number is read
    const signAt = new Map<number, string | null>();
    const absAt = new Set<number>();
    if (values) {
      list.forEach((g, i) => {
        if (g.k !== 'param' || !(values[g.v] < 0)) return;
        const prev = list[i - 1];
        if (!prev || prev.k !== 'op' || (prev.v !== '+' && prev.v !== '−')) return;
        signAt.set(i - 1, prev.unary ? (prev.v === '−' ? null : '−') : prev.v === '+' ? '−' : '+');
        absAt.add(i);
      });
    }
    return list.map((g, i) => {
      const k = `${key}-${i}`;
      switch (g.k) {
        case 'num':
          return <span key={k}>{g.v}</span>;
        case 'var':
          return (
            <i key={k} className="ln-eq-v">
              {g.v}
            </i>
          );
        case 'fn':
          return (
            <span key={k} className="ln-eq-f">
              {g.v}
            </span>
          );
        case 'sup':
          return <sup key={k}>{draw(g.s, k)}</sup>;
        case 'op': {
          const v = signAt.has(i) ? signAt.get(i) : g.v;
          if (v === null || v === undefined) return null;
          const binary = !g.unary && (v === '+' || v === '−');
          return (
            <span key={k} className={binary ? 'ln-eq-op' : undefined}>
              {v}
            </span>
          );
        }
        case 'param': {
          const p = byName.get(g.v);
          if (!values || !p) {
            return (
              <i key={k} className="ln-eq-v">
                {g.v}
              </i>
            );
          }
          const v = values[g.v] ?? p.value;
          const shown = fmtVal(absAt.has(i) ? Math.abs(v) : v);
          if (!onScrub) {
            return (
              <span key={k} className="ln-eq-p">
                {shown}
              </span>
            );
          }
          return <Scrub key={k} p={p} value={v} shown={shown} hot={hot === g.v} locked={!!locked} onChange={(nv) => onScrub(g.v, nv)} onHot={(on) => onHot?.(on ? g.v : null)} />;
        }
      }
    });
  };
  return <>{draw(segs, 'e')}</>;
}

/** A formula as maths, its names in italic — or, where it cannot be read, as written. */
function FormulaText({ formula, names }: { formula: string; names: string[]; labels?: Record<string, string> }) {
  const segs = useMemo(() => prettyExpr(formula, names), [formula, names]);
  if (!segs) return <code>{formula}</code>;
  return (
    <span className="ln-eq is-small">
      <Expr segs={segs} params={[]} />
    </span>
  );
}

// ── shared: a prediction first, and the note that what is done is shared ──

function Predict({ predict, picked, onPick, onSkip }: { predict: PredictSpec; picked?: number; onPick?: (i: number) => void; onSkip?: () => void }) {
  if (picked !== undefined) {
    return (
      <p className="ln-predicted">
        <span className="ln-k">You predicted</span> {predict.options[picked]}
      </p>
    );
  }
  return (
    <div className="ln-predict" role="group" aria-label={predict.prompt}>
      <p className="ln-k">Before you change anything</p>
      <p className="ln-q">{predict.prompt}</p>
      <div className="ln-chips">
        {predict.options.map((o, i) => (
          <button key={i} type="button" className="ln-chip" disabled={!onPick} onClick={() => onPick?.(i)}>
            {o}
          </button>
        ))}
        {onSkip && (
          <button type="button" className="ln-skip" onClick={onSkip}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

function SharedNote({ what }: { what: string }) {
  return (
    <p className="ln-shared">
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </svg>
      What you {what} here goes to Socria with your next message.
    </p>
  );
}

/**
 * The plot's own rectangle, as a clip for what is drawn in it. The picture's
 * SVG lets its labels spill past the edge (overflow: visible), so a steep curve
 * — x³ at the window's ends — once ran out of the card, across the reply and
 * the ways deeper under it. The lines are clipped to the plot; labels are not.
 */
function useClipId(): string {
  return `lnclip${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}
function PlotClip({ id, W, H }: { id: string; W: number; H: number }) {
  return (
    <defs>
      <clipPath id={id}>
        <rect x={0} y={-1} width={W} height={H + 2} />
      </clipPath>
    </defs>
  );
}

/** A polyline through points, the pen lifted where a point is undefined; a value far off the window is held at its edge, not drawn to infinity. */
function pathOf(pts: readonly Pt[], X: (x: number) => number, Y: (y: number) => number, y0: number, y1: number): string {
  const lo = y0 - 3 * (y1 - y0), hi = y1 + 3 * (y1 - y0);
  let d = '';
  let pen = false;
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(Math.max(lo, Math.min(hi, p.y))).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** The grid and axes of a window, its zero lines drawn where they fall inside it. */
function Grid({ x0, x1, y0, y1, X, Y, W, H }: { x0: number; x1: number; y0: number; y1: number; X: (x: number) => number; Y: (y: number) => number; W: number; H: number }) {
  const xs = linearScale([x0, x1], { want: Math.max(3, Math.round(W / 90)) }).ticks.filter((t) => t > x0 && t < x1);
  const ys = linearScale([y0, y1], { want: Math.max(3, Math.round(H / 60)) }).ticks.filter((t) => t > y0 && t < y1);
  const ax = y0 <= 0 && 0 <= y1 ? Y(0) : null;
  const ay = x0 <= 0 && 0 <= x1 ? X(0) : null;
  return (
    <g className="ln-axes" aria-hidden="true">
      {xs.map((t) => (
        <line key={`x${t}`} x1={X(t)} x2={X(t)} y1={0} y2={H} />
      ))}
      {ys.map((t) => (
        <line key={`y${t}`} x1={0} x2={W} y1={Y(t)} y2={Y(t)} />
      ))}
      {ax !== null && <line className="is-axis" x1={0} x2={W} y1={ax} y2={ax} />}
      {ay !== null && <line className="is-axis" x1={ay} x2={ay} y1={0} y2={H} />}
      {xs.filter((t) => t !== 0).map((t) => (
        <text key={`tx${t}`} x={X(t)} y={Math.min(H - 4, (ax ?? H - 16) + 14)} textAnchor="middle">
          {fmtVal(t)}
        </text>
      ))}
      {ys.filter((t) => t !== 0).map((t) => (
        <text key={`ty${t}`} x={Math.min(W - 4, (ay ?? 0) + 6)} y={Y(t) + 4}>
          {fmtVal(t)}
        </text>
      ))}
    </g>
  );
}

// ── a graph to change ────────────────────────────────────────────────

const FEATURE_KINDS: Partial<Record<GraphFeature, Feature['kind']>> = { turning: 'turning', roots: 'root', intercept: 'intercept' };
/** The second and third curves on one graph: each its own ink, named at its end. */
const CURVE_TONE = ['', 'is-second', 'is-third'];
type Compiled = NonNullable<ReturnType<typeof compileOver>>;

function InlineGraph({ spec, state, onState, shared, renderInline }: { spec: GraphSpec; state?: InlineState; onState: (s: InlineState) => void; shared: boolean; renderInline: RenderInline }) {
  const names = useMemo(() => spec.params.map((p) => p.name), [spec]);
  const c = useMemo(() => compileOver(spec.expr, names), [spec, names]);
  const segs = useMemo(() => prettyExpr(spec.expr, names), [spec, names]);
  // more curves over the same x and parameters (supply beside demand), each drawable or left off
  const others = useMemo(
    () => (spec.curves ?? []).flatMap((g) => {
      const cc = compileOver(g.expr, names);
      return cc ? [{ label: g.label, expr: g.expr, c: cc as Compiled, segs: prettyExpr(g.expr, names) }] : [];
    }),
    [spec, names]
  );
  const start = useMemo(() => Object.fromEntries(spec.params.map((p) => [p.name, p.value])), [spec]);
  // parameters that are x positions on the curve: points dragged along it, never part of an equation
  const positions = useMemo(() => new Set(spec.at ?? []), [spec]);
  const [values, setValues] = useState<Record<string, number>>(() => ({ ...start, ...(state?.values ?? {}) }));
  const [hot, setHot] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | undefined>(state?.predicted);
  const [skipped, setSkipped] = useState(!!state?.skipped);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const clip = useClipId();
  const W = Math.max(240, width);
  const H = W < 420 ? 210 : 260;
  const [x0, x1] = spec.x;
  const f = (x: number, v: Record<string, number> = values) => (c ? c.eval({ ...v, x }) : NaN);
  const curves = useMemo(() => [c, ...others.map((o) => o.c)].filter(Boolean) as Compiled[], [c, others]);
  const pointYs = (v: Record<string, number>) => (spec.at ?? []).map((n) => (c ? c.eval({ ...v, x: v[n] }) : NaN)).filter(Number.isFinite);
  // the window: as the reply gave it, or around what matters on every curve as it started — widened, never
  // narrowed, when what they change takes it further
  const auto = useMemo(() => (c ? fitWindowAll(curves, [start], x0, x1, pointYs(start)) : ([-10, 10] as [number, number])), [c, curves, start, x0, x1]);
  const reach = useMemo(() => (c ? fitWindowAll(curves, [values], x0, x1, pointYs(values)) : auto), [c, curves, values, x0, x1, auto]);
  const [y0, y1] = spec.y ?? [Math.min(auto[0], reach[0]), Math.max(auto[1], reach[1])];
  const X = (x: number) => ((x - x0) / (x1 - x0)) * W;
  const Y = (y: number) => ((y1 - y) / (y1 - y0)) * H;
  const fit = useMemo(() => (c ? sampleCurve(c, start, x0, x1, 200) : null), [c, start, x0, x1]);
  const cur = useMemo(() => (c ? sampleCurve(c, values, x0, x1) : null), [c, values, x0, x1]);
  const changed = names.some((n) => values[n] !== start[n]);
  // only a parameter in an equation reshapes a curve: a point moved along it changes no curve
  const reshaped = names.some((n) => !positions.has(n) && values[n] !== start[n]);
  const kinds = spec.features.map((k) => FEATURE_KINDS[k]).filter((k): k is Feature['kind'] => !!k);
  const feats = useMemo(() => (c && kinds.length ? curveFeatures(c, values, x0, x1, kinds) : []), [c, values, x0, x1, kinds.join()]);
  const startTurn = useMemo(() => (c && kinds.includes('turning') ? curveFeatures(c, start, x0, x1, ['turning'])[0] ?? null : null), [c, start, x0, x1, kinds.join()]);
  const nowTurn = feats.find((k) => k.kind === 'turning') ?? null;
  // the chord, where a tangent matches it, a tangent, where the curves meet, the readings — on the curve as it is now
  const readings = useMemo(() => graphReadings(spec, values), [spec, values]);
  const was = useMemo(() => graphReadings(spec, start), [spec, start]);
  const ordered = [...feats.filter((k) => k.kind === 'turning').slice(0, 2), ...feats.filter((k) => k.kind === 'intercept'), ...feats.filter((k) => k.kind === 'root').slice(0, 2), ...(spec.quiet ? [] : readings.crossings)].filter((k) => k.y >= y0 && k.y <= y1);
  // every point is drawn; a label that would sit on another's is left off (its point says enough)
  const labelled: Feature[] = [];
  for (const k of ordered) {
    if (labelled.length >= 4) break;
    const crowd = labelled.some((g) => Math.abs(X(g.x) - X(k.x)) < 64 && Math.abs(Y(g.y) - Y(k.y)) < 30);
    if (!crowd) labelled.push(k);
  }
  const locked = !!spec.predict && picked === undefined && !skipped;
  const save = (next: InlineState) => onState({ ...latest.current, ...next });
  const set = (name: string, v: number) => {
    const next = { ...values, [name]: v };
    setValues(next);
    // kept with the message once the hand stops, not on every pixel
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save({ values: next }), 400);
  };
  // what changed, said once: the turning point, the average slope and where it is matched, where the curves meet
  const observe: string[] = [];
  if (reshaped && startTurn && nowTurn && (startTurn.x !== nowTurn.x || startTurn.y !== nowTurn.y)) {
    const dx = nowTurn.x - startTurn.x, dy = nowTurn.y - startTurn.y;
    const way = [dx < 0 ? 'left' : dx > 0 ? 'right' : '', dy < 0 ? 'down' : dy > 0 ? 'up' : ''].filter(Boolean).join(' and ');
    observe.push(`The turning point moved ${way}, from ${fmtPoint(startTurn)} to ${fmtPoint(nowTurn)}.`);
  }
  if (!spec.quiet && changed && was.chord && readings.chord && fmtVal(was.chord.slope) !== fmtVal(readings.chord.slope)) {
    observe.push(`The average slope went from ${fmtVal(was.chord.slope)} to ${fmtVal(readings.chord.slope)}${readings.mean?.at.length ? ` — and the tangent still matches it, now at x = ${readings.mean.at.map((v) => fmtVal(v)).join(' and x = ')}` : ''}.`);
  }
  if (!spec.quiet && reshaped && was.crossings[0] && readings.crossings[0] && fmtPoint(was.crossings[0]) !== fmtPoint(readings.crossings[0])) {
    observe.push(`Where the curves meet moved from ${fmtPoint(was.crossings[0])} to ${fmtPoint(readings.crossings[0])}.`);
  }
  // the readings, in a row under the picture: none under the Answer Guard
  const rows: { k: string; v: string }[] = [];
  if (!spec.quiet) {
    if (readings.chord) rows.push({ k: 'average slope', v: fmtVal(readings.chord.slope) });
    if (readings.mean) {
      if (readings.mean.at.length && !readings.mean.everywhere) rows.push({ k: 'tangent matches at', v: readings.mean.at.map((v) => `x = ${fmtVal(v)}`).join(', ') });
      else rows.push({ k: '', v: readings.mean.everywhere ? 'Every point matches: the curve is straight between the ends.' : readings.mean.fails === 'break' ? 'The curve breaks between the ends, so the theorem promises no point.' : readings.mean.fails === 'corner' ? 'No tangent matches: the curve turns a corner, where it has no single slope.' : 'No tangent between the ends matches it.' });
    }
    if (readings.tangent) rows.push({ k: `slope at x = ${fmtVal(readings.tangent.x)}`, v: readings.tangent.slope === null ? 'none — a corner' : fmtVal(readings.tangent.slope) });
    for (const ro of readings.readouts) rows.push({ k: ro.label, v: `${fmtVal(ro.value, ro.digits)}${ro.unit ? ` ${ro.unit}` : ''}` });
  }
  const toPlot = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: x0 + ((e.clientX - r.left) / r.width) * (x1 - x0), px: ((e.clientX - r.left) / r.width) * W, py: ((e.clientY - r.top) / r.height) * H };
  };
  /** The point on the curve under the pointer, within reach of a finger. */
  const near = (px: number, py: number): string | null => {
    if (locked) return null;
    let best: string | null = null, bd = 22;
    for (const n of spec.at ?? []) {
      const y = f(values[n]);
      if (!Number.isFinite(y)) continue;
      const d = Math.hypot(X(values[n]) - px, Y(y) - py);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  };
  const moveTo = (n: string, x: number) => {
    const p = spec.params.find((q) => q.name === n);
    if (!p) return;
    const v = Math.min(p.max, Math.max(p.min, Math.round((x - p.min) / p.step) * p.step + p.min));
    set(n, Number(v.toFixed(6)));
  };
  const probeAt = (x: number) => {
    if (!c) return;
    const y = f(x);
    setProbe(Number.isFinite(y) ? { x, y } : null);
  };
  const label = (k: Feature) => {
    const px = X(k.x), py = Y(k.y);
    const right = px > W - 90;
    return { px, py, tx: right ? px - 9 : px + 9, ty: k.kind === 'turning' && !k.max ? py + 18 : py - 9, anchor: right ? ('end' as const) : ('start' as const) };
  };
  /** A curve's name at its right end, where it is inside the window. */
  const endLabel = (cc: Compiled, text: string, key: string, tone: string) => {
    for (let i = 0; i <= 40; i++) {
      const x = x1 - ((x1 - x0) * i) / 80;
      const y = cc.eval({ ...values, x });
      if (Number.isFinite(y) && y >= y0 && y <= y1) {
        return (
          <text key={key} className={`ln-curve-name ${tone}`} x={X(x) - 4} y={Math.max(12, Y(y) - 8)} textAnchor="end">
            {text}
          </text>
        );
      }
    }
    return null;
  };
  /** A straight line through (x, y) with slope m, a fraction of the window wide each side. */
  const through = (x: number, y: number, m: number, frac = 0.18) => {
    const L = (x1 - x0) * frac;
    return { x1: X(x - L), y1: Y(y - m * L), x2: X(x + L), y2: Y(y + m * L) };
  };
  const shapeParams = spec.params.filter((p) => !positions.has(p.name));
  const ariaParts = [
    `Graph of ${[spec.label ? `${spec.label}, y = ${spec.expr}` : `y = ${spec.expr}`, ...others.map((o) => `${o.label ? `${o.label}, ` : ''}y = ${o.expr}`)].join('; ')}`,
    nowTurn ? `turning point ${fmtPoint(nowTurn)}` : '',
    readings.chord ? `chord from x = ${fmtVal(readings.chord.a)} to x = ${fmtVal(readings.chord.b)}${spec.quiet ? '' : `, average slope ${fmtVal(readings.chord.slope)}`}` : '',
    readings.mean && !spec.quiet ? meanSaid(readings.mean) : '',
    readings.tangent && !spec.quiet ? `slope at x = ${fmtVal(readings.tangent.x)}: ${readings.tangent.slope === null ? 'none, a corner' : fmtVal(readings.tangent.slope)}` : '',
    !spec.quiet && readings.crossings.length ? `the curves meet at ${readings.crossings.map(fmtPoint).join(' and ')}` : '',
  ].filter(Boolean);
  return (
    <div className="ln ln-graph" role="group" aria-label={spec.title || 'A graph you can change'}>
      {spec.title && <p className="ln-title">{spec.title}</p>}
      <div className="ln-graph-head">
        <div className="ln-eqs">
          <p className="ln-eq">
            {spec.label && <span className="ln-eq-name">{spec.label}</span>}
            <i className="ln-eq-v">y</i>
            <span className="ln-eq-op">=</span>
            {segs ? <Expr segs={segs} params={spec.params} values={values} hot={hot} locked={locked} onScrub={set} onHot={setHot} /> : <code>{spec.expr}</code>}
          </p>
          {others.map((o, i) => (
            <p key={i} className={`ln-eq ${CURVE_TONE[i + 1]}`}>
              {o.label && <span className="ln-eq-name">{o.label}</span>}
              <i className="ln-eq-v">y</i>
              <span className="ln-eq-op">=</span>
              {o.segs ? <Expr segs={o.segs} params={spec.params} values={values} hot={hot} locked={locked} onScrub={set} onHot={setHot} /> : <code>{o.expr}</code>}
            </p>
          ))}
        </div>
        {!locked && (positions.size > 0 ? <span className="ln-hint">Drag the points along the curve</span> : shapeParams.length > 0 ? <span className="ln-hint">Drag a number</span> : null)}
      </div>
      {spec.predict && picked === undefined && !skipped && (
        <Predict
          predict={spec.predict}
          onPick={(i) => {
            setPicked(i);
            save({ predicted: i });
          }}
          onSkip={() => {
            setSkipped(true);
            save({ skipped: true });
          }}
        />
      )}
      <div ref={ref} className={`ln-plot${positions.size ? ' has-handles' : ''}${drag ? ' is-dragging' : ''}`}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          aria-label={ariaParts.join('; ')}
          onPointerDown={(e) => {
            const p = toPlot(e);
            const n = near(p.px, p.py);
            if (n) {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              setDrag(n);
              setHot(n);
              setProbe(null);
              moveTo(n, p.x);
            } else probeAt(p.x);
          }}
          onPointerMove={(e) => {
            const p = toPlot(e);
            if (drag) moveTo(drag, p.x);
            else probeAt(p.x);
          }}
          onPointerUp={() => {
            if (drag) {
              setDrag(null);
              setHot(null);
            }
          }}
          onPointerCancel={() => {
            setDrag(null);
            setHot(null);
          }}
          onPointerLeave={() => {
            if (!drag) setProbe(null);
          }}
        >
          <PlotClip id={clip} W={W} H={H} />
          <Grid x0={x0} x1={x1} y0={y0} y1={y1} X={X} Y={Y} W={W} H={H} />
          <g clipPath={`url(#${clip})`}>
          {reshaped && fit && <path className="ln-curve is-ghost" d={pathOf(fit.pts, X, Y, y0, y1)} />}
          {reshaped &&
            others.map((o, i) => {
              const s = sampleCurve(o.c, start, x0, x1, 200);
              return s ? <path key={`g${i}`} className={`ln-curve is-ghost ${CURVE_TONE[i + 1]}`} d={pathOf(s.pts, X, Y, y0, y1)} /> : null;
            })}
          {cur && <path className="ln-curve" d={pathOf(cur.pts, X, Y, y0, y1)} />}
          {others.map((o, i) => {
            const s = sampleCurve(o.c, values, x0, x1);
            return s ? <path key={`c${i}`} className={`ln-curve ${CURVE_TONE[i + 1]}`} d={pathOf(s.pts, X, Y, y0, y1)} /> : null;
          })}
          {c && spec.label && endLabel(c, spec.label, 'n0', '')}
          {others.map((o, i) => (o.label ? endLabel(o.c, o.label, `n${i + 1}`, CURVE_TONE[i + 1]) : null))}
          {readings.chord && (
            <g className="ln-chord">
              <line x1={X(readings.chord.a)} y1={Y(readings.chord.ya)} x2={X(readings.chord.b)} y2={Y(readings.chord.yb)} />
            </g>
          )}
          {readings.chord &&
            !spec.quiet &&
            readings.mean?.at.map((cx, i) => {
              const cy = f(cx);
              if (!Number.isFinite(cy)) return null;
              const l = through(cx, cy, readings.chord!.slope, 0.16);
              return (
                <g key={`mv${i}`} className="ln-mv">
                  <line {...l} />
                  <circle cx={X(cx)} cy={Y(cy)} r={4.5} />
                  <text x={X(cx) + 7} y={Y(cy) + 16}>{readings.mean!.at.length > 1 ? `c${i + 1}` : 'c'}</text>
                </g>
              );
            })}
          {readings.tangent && readings.tangent.slope !== null && (
            <g className="ln-tan">
              <line {...through(readings.tangent.x, readings.tangent.y, readings.tangent.slope, 0.22)} />
            </g>
          )}
          </g>
          {reshaped && !spec.quiet && was.crossings.map((k, i) => (fmtPoint(k) !== fmtPoint(readings.crossings[i] ?? { x: NaN, y: NaN }) ? <circle key={`gx${i}`} className="ln-pt is-ghost" cx={X(k.x)} cy={Y(k.y)} r={4} /> : null))}
          {reshaped && startTurn && nowTurn && (startTurn.x !== nowTurn.x || startTurn.y !== nowTurn.y) && <circle className="ln-pt is-ghost" cx={X(startTurn.x)} cy={Y(startTurn.y)} r={4} />}
          {ordered.map((k, i) => {
            const l = label(k);
            return (
              <g key={i} className={`ln-feat is-${k.kind}`}>
                <circle className="ln-pt" cx={l.px} cy={l.py} r={k.kind === 'turning' || k.kind === 'crossing' ? 5 : 3.5} />
                {labelled.includes(k) && (
                  <text x={l.tx} y={l.ty} textAnchor={l.anchor}>
                    {fmtPoint(k)}
                  </text>
                )}
              </g>
            );
          })}
          {(spec.at ?? []).map((n) => {
            const x = values[n];
            const y = f(x);
            if (!Number.isFinite(y) || y < y0 || y > y1) return null;
            const p = spec.params.find((q) => q.name === n);
            return (
              <g key={`h${n}`} className={`ln-handle${drag === n ? ' is-drag' : ''}${hot === n ? ' is-hot' : ''}${locked ? ' is-locked' : ''}`} aria-hidden="true">
                <circle cx={X(x)} cy={Y(y)} r={7} />
                <text x={X(x)} y={Y(y) - 12} textAnchor="middle">
                  {p?.label && p.label.length <= 8 ? p.label : n}
                </text>
              </g>
            );
          })}
          {probe && !drag && probe.y >= y0 && probe.y <= y1 && (
            <g className="ln-probe" aria-hidden="true">
              <circle cx={X(probe.x)} cy={Y(probe.y)} r={3.5} />
              <text x={Math.min(W - 6, X(probe.x) + 8)} y={Math.max(14, Y(probe.y) - 8)} textAnchor={X(probe.x) > W - 90 ? 'end' : 'start'}>
                {fmtPoint(probe)}
              </text>
            </g>
          )}
        </svg>
      </div>
      {reshaped && (
        <p className="ln-was" aria-hidden="true">
          <span className="is-now">now</span>
          <span className="is-ghost">as it started</span>
        </p>
      )}
      {rows.length > 0 && (
        <p className="ln-read ln-graph-read" aria-live="polite">
          {rows.map((r, i) => (
            <span key={i} className={`ln-reading${r.k ? '' : ' is-note'}`}>
              {r.k && <span className="ln-k">{r.k}</span>}
              <b>{r.v}</b>
            </span>
          ))}
        </p>
      )}
      {spec.params.length > 0 && (
        <div className="ln-graph-vars">
          {spec.params.map((p) => (
            <label key={p.name} className={`ln-var${hot === p.name ? ' is-hot' : ''}`}>
              <span className="ln-var-top">
                <span className="ln-var-k">{p.label}</span>
                <span className="ln-var-v">{fmtWith(values[p.name] ?? p.value, p.unit)}</span>
              </span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={values[p.name] ?? p.value}
                disabled={locked}
                aria-label={positions.has(p.name) ? `${p.label}: a point on the curve` : p.label}
                aria-valuetext={fmtWith(values[p.name] ?? p.value, p.unit)}
                onChange={(e) => set(p.name, Number(e.target.value))}
                onFocus={() => setHot(p.name)}
                onBlur={() => setHot(null)}
              />
            </label>
          ))}
        </div>
      )}
      {(picked !== undefined || observe.length > 0) && (
        <div className="ln-after" aria-live="polite">
          {spec.predict && picked !== undefined && <Predict predict={spec.predict} picked={picked} />}
          {observe.map((o, i) => (
            <p key={i} className="ln-observe">
              {renderInline(o, `obs${i}`)}
            </p>
          ))}
        </div>
      )}
      {shared && spec.params.length > 0 && <SharedNote what="change" />}
    </div>
  );
}

// ── a claim, inspected ───────────────────────────────────────────────

const VERDICT_LABEL: Record<ClaimSpec['verdict'], string> = { holds: 'Holds', fails: 'Doesn’t hold', partly: 'Partly holds', unsettled: 'Not settled' };
const HOLDS_MARK: Record<ClaimSpec['parts'][number]['holds'], string> = { yes: '✓', no: '✕', partly: '◐', unclear: '?' };

/**
 * A claim put up to be checked: the verdict, and the parts it rests on — each
 * marked as holding or not, its basis opened on a press — and, in the
 * conversation, a way to say which part they doubt, which goes to Socria with
 * their next message. The evidence is one press away, never a wall of it.
 */
function InlineClaim({ spec, state, onState, shared, renderInline }: { spec: ClaimSpec; state?: InlineState; onState: (s: InlineState) => void; shared: boolean; renderInline: RenderInline }) {
  const [open, setOpen] = useState<number | null>(null);
  const doubted = new Set(state?.doubted ?? []);
  const toggle = (i: number) => {
    const next = new Set(doubted);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onState({ ...state, doubted: [...next].sort((a, b) => a - b) });
  };
  return (
    <div className="ln ln-claim" role="group" aria-label={`The claim: ${spec.claim} — ${CLAIM_SAID[spec.verdict]}`}>
      <div className="ln-claim-head">
        <p className="ln-k">The claim</p>
        <p className="ln-claim-text">“{spec.claim}”</p>
        <span className={`ln-verdict-chip is-${spec.verdict}`}>{VERDICT_LABEL[spec.verdict]}</span>
      </div>
      <ul className="ln-claim-parts">
        {spec.parts.map((p, i) => (
          <li key={i} className={`ln-part is-${p.holds}${doubted.has(i) ? ' is-doubted' : ''}`}>
            <button type="button" className="ln-part-row" aria-expanded={p.basis ? open === i : undefined} onClick={() => p.basis && setOpen(open === i ? null : i)}>
              <span className={`ln-mark is-${p.holds}`} aria-hidden="true">
                {HOLDS_MARK[p.holds]}
              </span>
              <span className="ln-sr">{HOLDS_SAID[p.holds]}: </span>
              <span className="ln-part-text">{renderInline(p.text, `p${i}`)}</span>
              {p.basis && (
                <span className="ln-part-more" aria-hidden="true">
                  {open === i ? '−' : '+'}
                </span>
              )}
            </button>
            {open === i && p.basis && <p className="ln-part-basis">{renderInline(p.basis, `b${i}`)}</p>}
            {shared && (
              <button type="button" className={`ln-doubt${doubted.has(i) ? ' is-on' : ''}`} aria-pressed={doubted.has(i)} onClick={() => toggle(i)}>
                {doubted.has(i) ? 'You doubt this' : 'I doubt this'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {shared && <SharedNote what="mark" />}
    </div>
  );
}

// ── a simulation, small ──────────────────────────────────────────────

function InlineSim({ spec, state, onState, shared }: { spec: SimSpec; state?: InlineState; onState: (s: InlineState) => void; shared: boolean }) {
  const names = useMemo(() => spec.params.map((p) => p.name), [spec]);
  const cx = useMemo(() => compileOverT(spec.x, names), [spec, names]);
  const cy = useMemo(() => compileOverT(spec.y, names), [spec, names]);
  const start = useMemo(() => Object.fromEntries(spec.params.map((p) => [p.name, p.value])), [spec]);
  const [values, setValues] = useState<Record<string, number>>(() => ({ ...start, ...(state?.values ?? {}) }));
  const [tries, setTries] = useState<Record<string, number>[]>(state?.tries ?? []);
  const [picked, setPicked] = useState<number | undefined>(state?.predicted);
  const [skipped, setSkipped] = useState(!!state?.skipped);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const clip = useClipId();
  const W = Math.max(240, width);
  const H = W < 420 ? 170 : 210;
  const [x0, x1] = spec.view.x;
  const [y0, y1] = spec.view.y;
  const X = (x: number) => ((x - x0) / (x1 - x0)) * W;
  const Y = (y: number) => ((y1 - y) / (y1 - y0)) * H;
  const pathAt = (vals: Record<string, number>): Pt[] => (cx && cy ? samplePath(cx, cy, vals, timeAt(spec.t[0], names, vals), timeAt(spec.t[1], names, vals)) : []);
  const same = (a: Record<string, number>, b: Record<string, number>) => names.every((n) => a[n] === b[n]);
  const locked = !!spec.predict && picked === undefined && !skipped;
  const save = (next: InlineState) => onState({ ...latest.current, ...next });
  const set = (name: string, v: number) => {
    const next = { ...values, [name]: v };
    setValues(next);
    // a setting they stopped on is a try: kept, and drawn faintly from then on
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setTries((prev) => {
        const t = [...prev.filter((x) => !same(x, next)), next].slice(-4);
        save({ values: next, tries: t });
        return t;
      });
    }, 600);
  };
  const reading = (vals: Record<string, number>) =>
    (spec.readouts ?? []).map((ro) => {
      const c = compileOver(ro.expr, names);
      const v = c ? c.eval({ ...vals, x: 0 }) : NaN;
      return { label: ro.label, shown: Number.isFinite(v) ? fmtWith(Number(v.toFixed(ro.digits ?? 2)), ro.unit) : '—' };
    });
  const tag = (t: Record<string, number>) => spec.params.filter((p) => t[p.name] !== start[p.name] || spec.params.length === 1).slice(0, 1).map((p) => fmtWith(t[p.name], p.unit)).join(' ') || fmtWith(t[names[0]], spec.params[0].unit);
  const ghosts = tries.filter((t) => !same(t, values));
  const nowPath = pathAt(values);
  const endOf = (pts: Pt[]) => [...pts].reverse().find((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ?? null;
  const nowEnd = endOf(nowPath);
  return (
    <div className="ln ln-sim" role="group" aria-label={spec.title || 'A simulation you can change'}>
      {spec.title && <p className="ln-title">{spec.title}</p>}
      {spec.predict && picked === undefined && !skipped && (
        <Predict
          predict={spec.predict}
          onPick={(i) => {
            setPicked(i);
            save({ predicted: i });
          }}
          onSkip={() => {
            setSkipped(true);
            save({ skipped: true });
          }}
        />
      )}
      <div ref={ref} className="ln-plot">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${spec.title || 'A simulation'}: ${spec.params.map((p) => `${p.label} ${fmtWith(values[p.name], p.unit)}`).join(', ')}${reading(values).map((r) => `, ${r.label} ${r.shown}`).join('')}`}>
          <PlotClip id={clip} W={W} H={H} />
          {y0 <= 0 && 0 <= y1 && <line className="ln-ground" x1={0} x2={W} y1={Y(0)} y2={Y(0)} />}
          <g clipPath={`url(#${clip})`}>
          {ghosts.map((t, i) => {
            const pts = pathAt(t);
            const end = endOf(pts);
            return (
              <g key={i} className="ln-try">
                <path className="ln-curve is-ghost" d={pathOf(pts, X, Y, y0, y1)} />
                {end && (
                  <text x={Math.min(W - 4, X(end.x))} y={Math.max(12, Y(end.y) - 6)} textAnchor="end">
                    {tag(t)}
                  </text>
                )}
              </g>
            );
          })}
          <path className="ln-curve" d={pathOf(nowPath, X, Y, y0, y1)} />
          </g>
          {nowEnd && <circle className="ln-pt" cx={X(nowEnd.x)} cy={Y(nowEnd.y)} r={4.5} />}
        </svg>
      </div>
      <div className="ln-graph-vars">
        {spec.params.map((p) => (
          <label key={p.name} className="ln-var">
            <span className="ln-var-top">
              <span className="ln-var-k">{p.label}</span>
              <span className="ln-var-v">{fmtWith(values[p.name], p.unit)}</span>
            </span>
            <input type="range" min={p.min} max={p.max} step={p.step} value={values[p.name]} disabled={locked} aria-valuetext={fmtWith(values[p.name], p.unit)} onChange={(e) => set(p.name, Number(e.target.value))} />
          </label>
        ))}
      </div>
      {!!spec.readouts?.length && (
        <p className="ln-read" aria-live="polite">
          {reading(values).map((r) => (
            <span key={r.label}>
              {r.label} <b>{r.shown}</b>
            </span>
          ))}
        </p>
      )}
      {spec.predict && picked !== undefined && (
        <div className="ln-after">
          <Predict predict={spec.predict} picked={picked} />
        </div>
      )}
      {shared && <SharedNote what="try" />}
    </div>
  );
}

// ── a question they work out and check ───────────────────────────────

/**
 * Their turn: a question, a box, Check. The answer is worked out from the
 * question's own formula and compared with what they typed (lib/inline-math.ts
 * checkTyped); how it comes out is shown once they have it, or after two tries
 * — and when there is nothing to show, an invitation to say what they tried.
 */
function CheckBox({ part, state, onState, renderInline, kicker = 'Your turn' }: { part: CheckPart; state?: InlineState; onState: (s: InlineState) => void; renderInline: RenderInline; kicker?: string }) {
  const [typed, setTyped] = useState(state?.answer ?? '');
  const [mine, setMine] = useState<InlineState>(state ?? {});
  const [note, setNote] = useState<string | null>(null);
  const id = useId();
  const attempts = mine.attempts ?? 0;
  const right = mine.right === true;
  const tried = attempts > 0;
  const check = () => {
    const r = checkTyped(part.answer, typed, part.tolerance);
    if (r.got === null) {
      setNote('Type a number — 2, −1/2 or 0.75 all work.');
      return;
    }
    setNote(null);
    const next: InlineState = { ...mine, answer: typed.trim(), right: r.right, attempts: attempts + 1 };
    setMine(next);
    onState(next);
  };
  const reveal = right || attempts >= 2;
  return (
    <div className="ln-checkbox">
      <p className="ln-k">{kicker}</p>
      <p className="ln-q" id={`${id}-q`}>
        {renderInline(part.prompt, 'q')}
      </p>
      <form
        className="ln-answer"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim() && !right) check();
        }}
      >
        <label>
          {part.label && <span className="ln-answer-k">{part.label} =</span>}
          <input value={typed} inputMode="decimal" autoComplete="off" spellCheck={false} aria-describedby={`${id}-q`} aria-label={part.label ? `Your answer for ${part.label}` : 'Your answer'} disabled={right} onChange={(e) => setTyped(e.target.value)} />
          {part.unit && <span className="ln-answer-u">{part.unit}</span>}
        </label>
        <button type="submit" className="l5-btn is-sm" disabled={!typed.trim() || right}>
          Check
        </button>
        <span className="ln-verdict" aria-live="polite">
          {note ? <span className="is-note">{note}</span> : right ? <span className="is-right">✓ Right{attempts > 1 ? ` — on try ${attempts}` : ''}</span> : tried ? <span className="is-wrong">Not quite{attempts < 2 ? ' — try again' : ''}</span> : null}
        </span>
      </form>
      {reveal && part.explain && <p className="ln-explain">{renderInline(part.explain, 'x')}</p>}
      {!right && attempts >= 2 && !part.explain && <p className="ln-explain is-ask">Say what you tried in the box — Socria will work through it with you.</p>}
    </div>
  );
}

// ── the working, with their numbers ──────────────────────────────────

function InlineSteps({ spec, state, onState, renderInline }: { spec: StepsSpec; state?: InlineState; onState: (s: InlineState) => void; renderInline: RenderInline }) {
  const [whys, setWhys] = useState<number[]>(state?.whys ?? []);
  const latest = useRef(state);
  latest.current = state;
  const toggle = (i: number) => {
    const next = whys.includes(i) ? whys.filter((x) => x !== i) : [...whys, i].sort((a, b) => a - b);
    setWhys(next);
    onState({ ...latest.current, whys: next });
  };
  return (
    <div className="ln ln-steps" role="group" aria-label={spec.title || 'The working'}>
      {spec.title && <p className="ln-title">{spec.title}</p>}
      <ol className="ln-lines">
        {spec.lines.map((l, i) => {
          const open = whys.includes(i);
          return (
            <li key={i} className={open ? 'is-open' : undefined}>
              <span className="ln-step">
                <TeX tex={l.tex} />
              </span>
              {l.why && (
                <button type="button" className="ln-whybtn" aria-expanded={open} onClick={() => toggle(i)}>
                  {open ? 'Why ▴' : 'Why? ▾'}
                </button>
              )}
              {open && l.why && <p className="ln-why-said">{renderInline(l.why, `w${i}`)}</p>}
            </li>
          );
        })}
      </ol>
      {spec.check && <CheckBox part={spec.check} state={state} onState={(s) => onState({ ...latest.current, ...s, whys })} renderInline={renderInline} />}
    </div>
  );
}

// ── how the parts connect ────────────────────────────────────────────

/**
 * A cycle, a hierarchy, a flow or the causes of something, drawn as the
 * connections they are (lib/inline-diagram.ts places them). Each part is a
 * button: opened, its line shows in a panel under the figure with what leads
 * to it and what it leads to, a press away. On a phone — or wherever the
 * picture would squeeze its words past reading — the same parts are a list
 * with connectors instead: a cycle ends on the way back to its start, a tree
 * is an indented outline, a flow and the causes run top to bottom into what
 * they lead to. Both forms are in the markup and the width picks one (CSS),
 * so nothing has to be measured before it is drawn, and nothing scrolls
 * sideways. A screen reader is given the whole diagram in words as well
 * (inlinePlainText): every part and every connection.
 *
 * In causes, the part each plays is said in words on the part and shown by
 * its weight and line — heavy for an underlying cause, a bar for the trigger,
 * dashed for an amplifier, filled for the effect — never by colour alone.
 */
function InlineDiagram({ spec, state, onState, renderInline }: { spec: DiagramSpec; state?: InlineState; onState: (s: InlineState) => void; renderInline: RenderInline }) {
  const id = useId();
  const marker = `lnarrow${id.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const fig = useMemo(() => diagramFigure(spec, Math.max(240, width)), [spec, width]);
  const byId = useMemo(() => new Map(spec.nodes.map((nd) => [nd.id, nd])), [spec]);
  const open = state?.node && byId.has(state.node) ? state.node : null;
  const pick = (nid: string | null) => onState({ ...state, node: nid ?? undefined });
  const toggle = (nid: string) => pick(open === nid ? null : nid);
  const cur = open ? byId.get(open)! : null;
  const links = open ? linksOf(spec, open) : null;
  const name = spec.title || (spec.view === 'cycle' ? 'A cycle' : spec.view === 'tree' ? 'How it is organised' : spec.view === 'causes' ? 'What led to it' : 'How it flows');
  // the part an opened part says: in a panel under the figure, or under the list item pressed (one of the two is seen at each width)
  const detail = (where: 'panel' | 'inline') =>
    cur && (
      <div className={`ln-dg-panel is-${where}`} {...(where === 'panel' ? { id: `${id}-d`, 'aria-live': 'polite' as const } : {})}>
        {cur.role && <p className="ln-k">{DIAGRAM_ROLE_SAID[cur.role]}</p>}
        <p className="ln-dg-panel-h">{cur.label}</p>
        {cur.detail && <p className="ln-dg-panel-d">{renderInline(cur.detail, `d-${where}`)}</p>}
        {links && (links.from.length > 0 || links.to.length > 0) && (
          <p className="ln-dg-panel-links">
            {links.from.length > 0 && <span className="ln-basis">{spec.view === 'tree' ? 'Under' : 'Comes from'}</span>}
            {links.from.map((nd) => (
              <button key={`f${nd.id}`} type="button" className="ln-link" onClick={() => pick(nd.id)}>
                {nd.label}
              </button>
            ))}
            {links.to.length > 0 && <span className="ln-basis">{spec.view === 'tree' ? 'Over' : 'Leads to'}</span>}
            {links.to.map((nd) => (
              <button key={`t${nd.id}`} type="button" className="ln-link" onClick={() => pick(nd.id)}>
                {nd.label}
              </button>
            ))}
          </p>
        )}
      </div>
    );
  const node = (nid: string, where: 'fig' | 'list') => {
    const nd = byId.get(nid)!;
    return (
      <button
        type="button"
        className={`ln-dg-node${nd.role ? ` is-${nd.role}` : ''}${open === nid ? ' is-on' : ''}${nd.detail ? ' has-detail' : ''}`}
        aria-expanded={open === nid}
        aria-controls={`${id}-d`}
        onClick={() => toggle(nid)}
        data-where={where}
      >
        {nd.role && <span className="ln-dg-role">{DIAGRAM_ROLE_SAID[nd.role]}</span>}
        <span className="ln-dg-label">{nd.label}</span>
      </button>
    );
  };
  // the list: a cycle in its order and back; a tree as an outline; a flow or causes in column order
  const order = spec.view === 'tree' ? treeRows(spec) : (spec.view === 'cycle' ? spec.nodes.map((nd) => nd.id) : diagramColumns(spec).flat()).map((nid) => ({ id: nid, depth: 0 }));
  // an outline's indent says what is under what; arrows between its lines would say something else
  const leadsToNext = (i: number) => spec.view !== 'tree' && (spec.view === 'cycle' || (i + 1 < order.length && spec.edges.some(([a, b]) => a === order[i].id && b === order[i + 1].id)));
  const List = spec.view === 'tree' ? 'ul' : 'ol';
  return (
    <div ref={ref} className={`ln ln-diagram is-${spec.view}${fig ? '' : ' is-listed'}`} role="group" aria-label={name} aria-describedby={`${id}-alt`}>
      {spec.title && <p className="ln-title">{spec.title}</p>}
      {fig && (
        <div className="ln-dg-fig" style={{ height: fig.H }}>
          <svg viewBox={`0 0 ${fig.W} ${fig.H}`} width={fig.W} height={fig.H} aria-hidden="true" focusable="false">
            <defs>
              <marker id={marker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,1 L9,5 L0,9 z" />
              </marker>
            </defs>
            {fig.links.map((l) => (
              <path
                key={`${l.from}-${l.to}`}
                d={l.d}
                className={`ln-dg-link${open && (l.from === open || l.to === open) ? ' is-on' : ''}${byId.get(l.from)?.role === 'amplifier' ? ' is-amplifier' : ''}`}
                markerEnd={spec.view === 'tree' ? undefined : `url(#${marker})`}
              />
            ))}
          </svg>
          {fig.boxes.map((b) => (
            <span key={b.id} className="ln-dg-at" style={{ left: b.cx - b.w / 2, top: b.cy - b.h / 2, width: b.w, height: b.h }}>
              {node(b.id, 'fig')}
            </span>
          ))}
        </div>
      )}
      <List className={`ln-dg-list is-${spec.view}`}>
        {order.map((r, i) => {
          const to = spec.view === 'tree' ? [] : linksOf(spec, r.id).to;
          // a connection that is not simply on to the next item is said under it
          const elsewhere = spec.view === 'cycle' ? [] : to.filter((nd) => !(leadsToNext(i) && nd.id === order[i + 1]?.id));
          return (
            <li key={r.id} className={`ln-dg-item${leadsToNext(i) ? ' is-next' : ''}${spec.view === 'tree' ? ` is-d${r.depth}` : ''}`} style={spec.view === 'tree' ? ({ '--d': r.depth } as React.CSSProperties) : undefined}>
              {node(r.id, 'list')}
              {elsewhere.length > 0 && <span className="ln-dg-to">→ {elsewhere.map((nd) => nd.label).join(', ')}</span>}
              {open === r.id && detail('inline')}
            </li>
          );
        })}
        {spec.view === 'cycle' && (
          <li className="ln-dg-back">
            <span aria-hidden="true">↺ </span>Back to the start: {spec.nodes[0].label}
          </li>
        )}
      </List>
      {detail('panel')}
      <p id={`${id}-alt`} className="ln-sr">
        {inlinePlainText(spec)}
      </p>
      <div className="ln-foot">
        <span className="ln-basis">{cur ? '' : spec.nodes.some((nd) => nd.detail) ? 'Open a part to read more' : 'Open a part to see what it connects to'}</span>
      </div>
    </div>
  );
}

// ── for and against ──────────────────────────────────────────────────

/**
 * The case either way, side by side: what is for it and what is against it,
 * a few words each, more on one when it is opened, and under both the one
 * thing it turns on for most people. It leans neither way. Two columns with a
 * hairline between them where there is room; on a phone, For then Against,
 * the footer last.
 */
function InlineBalance({ spec, renderInline }: { spec: BalanceSpec; renderInline: RenderInline }) {
  const [open, setOpen] = useState<string | null>(null);
  const side = (key: 'for' | 'against', items: readonly BalanceItem[]) => (
    <div className={`ln-bal-side is-${key}`}>
      <p className="ln-k" aria-hidden="true">
        {key === 'for' ? 'For' : 'Against'}
      </p>
      <ul className="ln-bal-list" aria-label={key === 'for' ? 'For' : 'Against'}>
        {items.map((x, i) => {
          const k = `${key}${i}`;
          const mark = (
            <span className="ln-bal-mark" aria-hidden="true">
              {key === 'for' ? '+' : '−'}
            </span>
          );
          return (
            <li key={k} className={`ln-bal-item${open === k ? ' is-open' : ''}`}>
              {x.detail ? (
                <button type="button" className="ln-bal-row" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
                  {mark}
                  <span className="ln-bal-text">{renderInline(x.text, `t${k}`)}</span>
                  <span className="ln-bal-more" aria-hidden="true">
                    {open === k ? '−' : '+'}
                  </span>
                </button>
              ) : (
                <span className="ln-bal-row is-still">
                  {mark}
                  <span className="ln-bal-text">{renderInline(x.text, `t${k}`)}</span>
                </span>
              )}
              {open === k && x.detail && <p className="ln-bal-detail">{renderInline(x.detail, `d${k}`)}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
  return (
    <div className="ln ln-balance" role="group" aria-label={`For and against: ${spec.subject}`}>
      <p className="ln-title">{spec.subject}</p>
      <div className="ln-bal-cols">
        {side('for', spec.for)}
        {side('against', spec.against)}
      </div>
      {spec.turns_on && (
        <p className="ln-bal-turns">
          <span className="ln-k">Turns on</span>
          <span className="ln-bal-turns-t">{renderInline(spec.turns_on, 'turns')}</span>
        </p>
      )}
    </div>
  );
}

// ── a definition, as one equation ────────────────────────────────────

/** A term's symbol as maths when it is maths ("r", "P_0", "\pi"), as words when it is words ("new customers"). */
const isTexSym = (sym: string) => /[\\^_{}]/.test(sym) || /^[A-Za-z](?:_?\d)?$/.test(sym);

/**
 * The equation, displayed (KaTeX, as the working is), what each term means
 * as a two-column list under it, and one worked example on a quiet line.
 * A wide equation scrolls inside its own box, never the page; on a phone the
 * terms stack, the symbol over its meaning.
 */
function InlineEquation({ spec, renderInline }: { spec: EquationSpec; renderInline: RenderInline }) {
  return (
    <div className="ln ln-equation" role="group" aria-label={spec.title || 'The equation'}>
      {spec.title && <p className="ln-title">{spec.title}</p>}
      <div className="ln-scroll ln-eqn-tex">
        <TeX tex={spec.tex} display />
      </div>
      {!!spec.terms?.length && (
        <dl className="ln-eqn-terms">
          {spec.terms.map((t, i) => (
            <div key={i} className="ln-eqn-term">
              <dt>{isTexSym(t.sym) ? <TeX tex={t.sym} /> : t.sym}</dt>
              <dd>{renderInline(t.means, `m${i}`)}</dd>
            </div>
          ))}
        </dl>
      )}
      {spec.example && (
        <p className="ln-eqn-ex">
          <span className="ln-k">For example</span>
          <span className="ln-eqn-ex-t">
            <TeX tex={spec.example.tex} />
          </span>
        </p>
      )}
    </div>
  );
}
