'use client';
// components/inline/InlineUI.tsx — THE INLINE ELEMENTS, DRAWN IN THE CONVERSATION.
//
// Six small things a reply can hold (lib/inline-ui.ts): a chart, a slider, a
// comparison, reasoning folded under its conclusion, choices to tap, a draft to
// edit. Each is drawn from a validated description, in the reading column,
// quietly — a thin rule, the conversation's own type, nothing that looks like
// a dashboard. What the person does with one (a slider moved, a choice tapped,
// a draft edited) is kept with the message (`host.onState`); the larger ones
// open in the Artifacts view as full artifacts (`host.onOpen`).
//
// Nothing here computes a claim: a chart draws the numbers it was given and
// says where they came from; a slider evaluates the formula it shows with the
// math engine's parser; a comparison marks the figures nothing checked.

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { compileExpr } from '@/lib/logos-math';
import { linearScale, scaleAt, fmtNum } from '@/lib/objects/display-data';
import type { ChartSpec, CompareSpec, DraftSpec, InlineSpec, InlineState, OptionsSpec, ReasoningSpec, SliderSpec } from '@/lib/inline-ui';
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
}

type RenderInline = (text: string, key: string) => ReactNode;

/** One element: drawn, waiting to be (the reply is still writing it), or nothing (it was not one of the six). */
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
      <table className="ln-sr">
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
        <span className="ln-formula" title="What the result is computed from">
          {spec.result.label} = <code>{spec.formula}</code>
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

const DRAFT_SAID: Record<NonNullable<DraftSpec['kind']>, string> = { email: 'Email', message: 'Message', note: 'Note', paragraph: 'Paragraph', post: 'Post' };

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
