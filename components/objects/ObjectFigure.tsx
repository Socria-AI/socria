'use client';

// An object of thought, drawn as itself — the matrix, the curve — and worked
// in. What it shows is a VIEW of canonical state (lib/objects/); what a person
// does to it comes back up as an operation (onOp), is computed there, and
// returns as the next state. Nothing here keeps state of its own beyond what
// the hand is in the middle of: a half-typed operation, which entries were
// just changed (so the eye can follow the step), a slider mid-drag.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  compileState,
  currentOf,
  equationsOf,
  kindOf,
  lead,
  originSaid,
  slopeAt,
  stepWho,
  type FunctionState,
  type MatrixState,
  type ThoughtObject,
} from '@/lib/objects';
import { TeX } from '@/components/TeX';
import { planOf } from '@/lib/objects/scene-plan';
import type { SceneState } from '@/lib/objects/scene';
import './objects.css';

export type FigureMode = 'live' | 'trail' | 'card';

export interface FigureProps {
  obj: ThoughtObject;
  at: number;
  mode: FigureMode;
  guarded?: boolean;
  /** the selected part of THIS object, if any ('r2', 'e2.1', 'p:a') */
  sel?: string | null;
  onSelect?: (part: string | null) => void;
  /** an operation the person chose; the answer is whether it was computed, and why not if not */
  onOp?: (op: string, args: Record<string, string | number>, suggested?: boolean) => { ok: boolean; why?: string };
  /** read an operation out of words — the same reader the composer uses */
  readOp?: (text: string) => { op: string; args: Record<string, string | number> } | null;
  onSeek?: (at: number) => void;
  /** operations Socria suggested, offered — never applied by themselves */
  suggestions?: { op: string; args: Record<string, string | number>; said: string }[];
  /** open a view that lives elsewhere (a 2 × 2 matrix on the plane) */
  onView?: (view: string) => void;
}

export function ObjectFigure(p: FigureProps) {
  if (p.obj.kind === 'matrix') return <MatrixFigure {...p} />;
  if (p.obj.kind === 'function') return <FunctionFigure {...p} />;
  if (p.obj.kind === 'scene') return <SceneFigure {...p} />;
  return null;
}

// ── scene ────────────────────────────────────────────────────────────

/**
 * A Live 3D scene on the map: its plan — every part's outline seen from
 * above, computed from its geometry (lib/objects/scene-plan.ts) — and the
 * way into the 3D view, where it is built and worked on.
 */
function SceneFigure({ obj, at, mode, sel, onSelect, onView }: FigureProps) {
  const st = (obj.states[at] ?? currentOf(obj)) as SceneState;
  const step = at > 0 ? obj.steps[at - 1] : null;
  const plan = useMemo(() => planOf(st), [st]);
  const W = mode === 'live' ? 336 : 150;
  const H = mode === 'live' ? 150 : 64;
  const b = plan.bounds;
  const pad = 6;
  const span = b ? Math.max(b[2] - b[0], b[3] - b[1], 1e-6) : 1;
  const k = b ? Math.min((W - 2 * pad) / Math.max(b[2] - b[0], span * 0.2), (H - 2 * pad) / Math.max(b[3] - b[1], span * 0.2)) : 1;
  const ox = b ? W / 2 - ((b[0] + b[2]) / 2) * k : W / 2;
  const oz = b ? H / 2 - ((b[1] + b[3]) / 2) * k : H / 2;
  const d = (ring: [number, number][]) => ring.map(([x, z], i) => `${i ? 'L' : 'M'}${(ox + x * k).toFixed(1)} ${(oz + z * k).toFixed(1)}`).join(' ') + ' Z';
  return (
    <div className={`obj obj-scene obj-${mode}`}>
      <Head obj={obj} at={at} mode={mode} />
      {st.nodes.length ? (
        <svg className="obj-plan" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${obj.name} seen from above: ${st.nodes.length} part${st.nodes.length === 1 ? '' : 's'}`}>
          {plan.parts.map((pp) => (
            <path
              key={pp.id}
              d={pp.rings.map(d).join(' ')}
              fillRule="evenodd"
              fill={pp.color}
              fillOpacity={0.55}
              stroke={sel === pp.id ? 'var(--lg-primary)' : 'var(--lg-ink-60)'}
              strokeWidth={sel === pp.id ? 1.6 : 0.8}
              strokeDasharray={pp.silhouette ? undefined : '3 2'}
              onClick={mode === 'live' && onSelect ? () => onSelect(sel === pp.id ? null : pp.id) : undefined}
            />
          ))}
        </svg>
      ) : (
        <p className="obj-scene-empty">Nothing built yet.</p>
      )}
      {mode === 'live' && (
        <footer className="obj-scene-foot">
          <span>Seen from above · a geometric preview</span>
          {onView && (
            <button type="button" onClick={() => onView('3d')}>
              Open in 3D
            </button>
          )}
        </footer>
      )}
      {mode === 'trail' && step && <p className="obj-scene-step">{step.said}</p>}
    </div>
  );
}

/** "-1/2" as a typeset fraction; whole numbers as they are; a real minus sign. */
function Num({ v }: { v: string }) {
  const m = /^(-?)(\d+)\/(\d+)$/.exec(v);
  if (m)
    return (
      <span className="obj-frac">
        {m[1] ? '−' : ''}
        <span className="obj-frac-n">{m[2]}</span>
        <span className="obj-frac-d">{m[3]}</span>
      </span>
    );
  return <>{v.replace(/^-/, '−')}</>;
}

function Head({ obj, at, mode, children }: { obj: ThoughtObject; at: number; mode: FigureMode; children?: React.ReactNode }) {
  const k = kindOf(obj.kind)!;
  const st = obj.states[at] ?? currentOf(obj);
  const sub = at > 0 ? <sub>{at}</sub> : null;
  return (
    <header className="obj-head">
      <span className="obj-name">
        {obj.name}
        {mode !== 'live' && sub}
      </span>
      {mode === 'live' && <span className="obj-shape">{k.shape(st)}</span>}
      {mode === 'trail' && at === obj.at && <span className="obj-now">now</span>}
      {children}
    </header>
  );
}

// ── matrix ───────────────────────────────────────────────────────────

function MatrixFigure({ obj, at, mode, guarded, sel, onSelect, onOp, readOp, onSeek, suggestions, onView }: FigureProps) {
  const st = (obj.states[at] ?? currentOf(obj)) as MatrixState;
  const prev = at > 0 ? (obj.states[at - 1] as MatrixState) : null;
  const step = at > 0 ? obj.steps[at - 1] : null;
  const k = kindOf('matrix')!;
  const [view, setView] = useState<'grid' | 'equations'>('grid');
  const [draft, setDraft] = useState('');
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // THE STEP, FOLLOWED BY THE EYE. When the state changes under a live
  // figure, the entries that changed are marked and their old values lift
  // away — once, briefly. Motion that says "your step did this", nothing else.
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const seenAt = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== 'live') return;
    const first = seenAt.current === null;
    const moved = !first && seenAt.current !== at;
    seenAt.current = at;
    const recent = step && Date.now() - step.at < 5000;
    if (!prev || !(moved || (first && recent))) return;
    const s = new Set<string>();
    st.rows.forEach((r, i) => r.forEach((v, j) => {
      if (prev.rows[i]?.[j] !== v) s.add(`${i}.${j}`);
    }));
    setFlash(s);
    const t = setTimeout(() => setFlash(new Set()), 1900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, mode]);

  const rows = st.rows.length;
  const cols = st.rows[0].length;
  const target = step && (step.op === 'comb' || step.op === 'scale') ? Number(step.args.i) - 1 : null;
  const swapped = step && step.op === 'swap' ? [Number(step.args.i) - 1, Number(step.args.j) - 1] : [];
  const pick = (part: string) => onSelect?.(sel === part ? null : part);
  const leads = useMemo(() => st.rows.map((r) => lead(r.map((v) => ({ n: v === '0' ? 0 : 1, d: 1 })))), [st]);

  if (mode === 'card' || mode === 'trail') {
    const shown = mode === 'card' ? st.rows.slice(0, 4) : st.rows;
    return (
      <div className={`obj obj-matrix is-${mode}`} onClick={mode === 'trail' && onSeek ? () => onSeek(at) : undefined}>
        <Head obj={obj} at={at} mode={mode} />
        <div className="obj-grid is-small" style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}>
          {shown.map((r, i) =>
            r.map((v, j) => (
              <span key={`${i}.${j}`} className={`obj-cell${st.aug && j === cols - 1 ? ' is-rhs' : ''}${prev && prev.rows[i]?.[j] !== v ? ' was-changed' : ''}`}>
                <Num v={v} />
              </span>
            ))
          )}
        </div>
        {mode === 'card' && rows > 4 && <span className="obj-more">+{rows - 4} rows</span>}
      </div>
    );
  }

  const tryOp = (op: string, args: Record<string, string | number>, suggested?: boolean) => {
    const r = onOp?.(op, args, suggested);
    if (!r) return;
    if (r.ok) {
      setDraft('');
      setSaid(null);
    } else setSaid({ ok: false, text: r.why ?? 'That could not be done.' });
  };
  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    const read = readOp?.(t);
    if (!read) {
      setSaid({ ok: false, text: 'Write a row operation — R2 ← R2 − 3R1, R1 ↔ R3, or R3 ← (1/2)R3.' });
      return;
    }
    tryOp(read.op, read.args);
  };
  // Templates the person completes: the operation's FORM, with the rows they
  // selected — never the multiplier, which is the thinking.
  const selRows = sel && /^r(\d+)$/.test(sel) ? Number(sel.slice(1)) : null;
  const template = (kind: 'swap' | 'scale' | 'comb') => {
    const a = selRows ?? 2;
    const b = a === 1 ? 2 : 1;
    const t = kind === 'swap' ? `R${a} ↔ R${b}` : kind === 'scale' ? `R${a} ← ·R${a}` : `R${a} ← R${a} + ·R${b}`;
    setDraft(t);
    setSaid(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const dot = t.indexOf('·');
      if (dot >= 0) el.setSelectionRange(dot, dot);
    });
  };
  const views = k.views.filter((v) => !v.unavailable || !v.unavailable(st));

  return (
    <div className="obj obj-matrix is-live" role="group" aria-label={`Matrix ${obj.name}, ${k.shape(st)}`}>
      <Head obj={obj} at={at} mode={mode}>
        <span className="obj-origin" title={originSaid(obj)}>
          {obj.origin === 'person' ? 'yours' : obj.origin === 'source' ? 'from your material' : 'read by Socria — check it'}
        </span>
        {views.length > 1 && (
          <span className="obj-views" role="tablist" aria-label="Show as">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={v.id === view}
                className={v.id === view ? 'is-on' : ''}
                title={v.shows}
                onClick={() => (v.id === 'grid' || v.id === 'equations' ? setView(v.id) : onView?.(v.id))}
              >
                {v.label}
              </button>
            ))}
          </span>
        )}
      </Head>

      {view === 'equations' ? (
        <ol className="obj-eqs">
          {equationsOf(st).map((e, i) => (
            <li key={i}>
              <button type="button" className={sel === `r${i + 1}` ? 'is-sel' : ''} onClick={() => pick(`r${i + 1}`)}>
                <span className="obj-eq-n">({i + 1})</span>
                <TeX tex={e} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="obj-gridwrap">
          <div className="obj-grid" role="grid" style={{ gridTemplateColumns: `auto repeat(${cols}, minmax(34px, auto)) auto` }}>
            <span className="obj-corner" />
            {Array.from({ length: cols }, (_, j) => (
              <button key={`c${j}`} type="button" className={`obj-colh${sel === `c${j + 1}` ? ' is-sel' : ''}`} onClick={() => pick(`c${j + 1}`)} aria-label={`Column ${j + 1}`}>
                {j + 1}
              </button>
            ))}
            <span />
            {st.rows.map((r, i) => {
              const rowSel = sel === `r${i + 1}`;
              return (
                <div key={i} role="row" className={`obj-row${rowSel ? ' is-sel' : ''}${target === i || swapped.includes(i) ? ' is-target' : ''}`} style={{ display: 'contents' }}>
                  <button type="button" className="obj-rowh" onClick={() => pick(`r${i + 1}`)} aria-label={`Row ${i + 1}`} aria-pressed={rowSel}>
                    R<sub>{i + 1}</sub>
                  </button>
                  {r.map((v, j) => {
                    const id = `e${i + 1}.${j + 1}`;
                    const changed = flash.has(`${i}.${j}`);
                    return (
                      <button
                        key={j}
                        type="button"
                        role="gridcell"
                        className={`obj-cell${sel === id ? ' is-sel' : ''}${rowSel || sel === `c${j + 1}` ? ' in-sel' : ''}${changed ? ' is-changed' : ''}${
                          !guarded && leads[i] === j ? ' is-lead' : ''
                        }${st.aug && j === cols - 1 ? ' is-rhs' : ''}`}
                        onClick={() => pick(id)}
                        aria-label={`Entry ${i + 1}, ${j + 1}: ${v}`}
                      >
                        {changed && prev && <span className="obj-was" aria-hidden="true"><Num v={prev.rows[i][j]} /></span>}
                        <span className="obj-v"><Num v={v} /></span>
                      </button>
                    );
                  })}
                  <span className="obj-rowop" aria-hidden={!(target === i && step)}>
                    {target === i && step ? step.said.replace(/^R\d+\s*/, '') : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step && (
        <p className={`obj-step${step.note && /not 0|nonzero back/.test(step.note) ? ' is-off' : ''}`}>
          <span className="obj-step-op">{step.said}</span>
          <span className="obj-step-who">{stepWho(step)} · computed</span>
          {step.note && <span className="obj-step-note">{step.note}</span>}
        </p>
      )}

      {onOp && (
        <form
          className="obj-ops"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <span className="obj-ops-tpl" aria-label="Operation forms">
            <button type="button" onClick={() => template('swap')} title="Swap two rows">↔</button>
            <button type="button" onClick={() => template('scale')} title="Multiply a row by a number">×k</button>
            <button type="button" onClick={() => template('comb')} title="Add a multiple of another row">+k·R</button>
          </span>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaid(null);
            }}
            placeholder="R2 ← R2 − 3R1"
            aria-label={`A row operation on ${obj.name}`}
            spellCheck={false}
          />
          <button type="submit" className="obj-ops-go" disabled={!draft.trim()}>
            Apply
          </button>
        </form>
      )}
      {said && <p className="obj-refused" role="alert">{said.text}</p>}

      {!guarded && !!suggestions?.length && (
        <p className="obj-suggest">
          {suggestions.map((s) => (
            <span key={s.said}>
              <span className="obj-suggest-k">Socria suggested</span> {s.said}
              <button type="button" onClick={() => tryOp(s.op, s.args, true)}>
                Try it
              </button>
            </span>
          ))}
        </p>
      )}

      {obj.states.length > 1 && onSeek && (
        <nav className="obj-hist" aria-label="Steps">
          <button type="button" disabled={at === 0} onClick={() => onSeek(at - 1)} aria-label="Step back">
            ‹
          </button>
          <span>
            {at === 0 ? 'as it started' : `after step ${at}`} · {obj.states.length - 1} step{obj.states.length === 2 ? '' : 's'}
          </span>
          <button type="button" disabled={at === obj.states.length - 1} onClick={() => onSeek(at + 1)} aria-label="Step forward">
            ›
          </button>
        </nav>
      )}
    </div>
  );
}

// ── function ─────────────────────────────────────────────────────────

const GW = 340;
const GH = 170;

function useCurve(st: FunctionState) {
  return useMemo(() => {
    const f = compileState(st);
    if (!f) return null;
    const n = 220;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const x = st.lo + ((st.hi - st.lo) * i) / n;
      const y = f(x);
      if (Number.isFinite(y)) pts.push([x, y]);
    }
    if (!pts.length) return null;
    let y0 = Math.min(...pts.map((p) => p[1]));
    let y1 = Math.max(...pts.map((p) => p[1]));
    if (y1 - y0 < 1e-9) {
      y0 -= 1;
      y1 += 1;
    }
    const pad = (y1 - y0) * 0.08;
    y0 -= pad;
    y1 += pad;
    const sx = (x: number) => ((x - st.lo) / (st.hi - st.lo)) * GW;
    const sy = (y: number) => GH - ((y - y0) / (y1 - y0)) * GH;
    let d = '';
    let pen = false;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const jump = i > 0 && Math.abs(sy(y) - sy(pts[i - 1][1])) > GH * 0.9;
      d += `${!pen || jump ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(y).toFixed(1)} `;
      pen = true;
    }
    return { f, d, sx, sy, y0, y1 };
  }, [st]);
}

function FunctionFigure({ obj, at, mode, guarded, sel, onSelect, onOp, readOp, onSeek }: FigureProps) {
  const st = (obj.states[at] ?? currentOf(obj)) as FunctionState;
  const step = at > 0 ? obj.steps[at - 1] : null;
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const shown = preview ? { ...st, params: { ...st.params, ...preview } } : st;
  const c = useCurve(shown);
  const [draft, setDraft] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const pick = (part: string) => onSelect?.(sel === part ? null : part);
  const fmt = (v: number) => String(Math.round(v * 1000) / 1000).replace(/^-/, '−');

  if (mode !== 'live') {
    return (
      <div className={`obj obj-fn is-${mode}`} onClick={mode === 'trail' && onSeek ? () => onSeek(at) : undefined}>
        <Head obj={obj} at={at} mode={mode} />
        <svg viewBox={`0 0 ${GW} ${GH}`} className="obj-plot is-small" aria-hidden="true">
          {c && <path d={c.d} className="obj-curve" />}
        </svg>
        {mode === 'trail' && step && <span className="obj-mini">{step.said}</span>}
      </div>
    );
  }

  const x0 = st.x0;
  const slope = x0 !== undefined && !guarded ? slopeAt(st, x0) : null;
  const fx0 = x0 !== undefined && c ? c.f(x0) : null;
  const run = (op: string, args: Record<string, string | number>) => {
    const r = onOp?.(op, args);
    if (r && !r.ok) setSaid(r.why ?? 'That could not be done.');
    else setSaid(null);
  };
  const texExpr = st.expr.replace(/\*/g, ' ').replace(/\bsqrt\(([^)]*)\)/g, '\\sqrt{$1}');

  return (
    <div className="obj obj-fn is-live" role="group" aria-label={`Function ${obj.name}`}>
      <Head obj={obj} at={at} mode={mode}>
        <span className="obj-origin">{obj.origin === 'person' ? 'yours' : 'read by Socria — check it'}</span>
      </Head>
      <button type="button" className={`obj-fn-eq${sel === 'eq' ? ' is-sel' : ''}`} onClick={() => pick('eq')}>
        <TeX tex={`${obj.name}(${st.v}) = ${texExpr}`} />
      </button>
      <svg
        viewBox={`0 0 ${GW} ${GH}`}
        className="obj-plot"
        role="img"
        aria-label={`Graph of ${obj.name} from ${st.lo} to ${st.hi}`}
        onClick={(e) => {
          if (!c) return;
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = st.lo + ((e.clientX - r.left) / r.width) * (st.hi - st.lo);
          run('point', { x: Math.round(x * 100) / 100 });
        }}
      >
        {c && c.y0 < 0 && c.y1 > 0 && <line x1={0} x2={GW} y1={c.sy(0)} y2={c.sy(0)} className="obj-axis" />}
        {c && st.lo < 0 && st.hi > 0 && <line y1={0} y2={GH} x1={c.sx(0)} x2={c.sx(0)} className="obj-axis" />}
        {c && <path d={c.d} className={`obj-curve${preview ? ' is-preview' : ''}`} />}
        {c && x0 !== undefined && fx0 !== null && Number.isFinite(fx0) && (
          <g className="obj-point">
            {slope !== null && (
              <line
                x1={c.sx(st.lo)}
                x2={c.sx(st.hi)}
                y1={c.sy(fx0 + slope * (st.lo - x0))}
                y2={c.sy(fx0 + slope * (st.hi - x0))}
                className="obj-tangent"
              />
            )}
            <circle cx={c.sx(x0)} cy={c.sy(fx0)} r={4} />
          </g>
        )}
      </svg>
      <div className="obj-fn-facts">
        <span>
          {st.v} from {fmt(st.lo)} to {fmt(st.hi)}
        </span>
        {x0 !== undefined && fx0 !== null && (
          <button type="button" className={sel === 'pt' ? 'is-sel' : ''} onClick={() => pick('pt')}>
            ({fmt(x0)}, {fmt(fx0)}){slope !== null ? ` · slope ≈ ${fmt(slope)}` : ''}
          </button>
        )}
      </div>
      {Object.entries(st.params).map(([name, v]) => (
        <label key={name} className={`obj-param${sel === `p:${name}` ? ' is-sel' : ''}`}>
          <button type="button" onClick={() => pick(`p:${name}`)}>{name}</button>
          <input
            type="range"
            min={-10}
            max={10}
            step={0.1}
            value={preview?.[name] ?? v}
            onChange={(e) => setPreview({ [name]: Number(e.target.value) })}
            onPointerUp={(e) => {
              const val = Number((e.target as HTMLInputElement).value);
              setPreview(null);
              if (val !== v) run('param', { name, value: val });
            }}
            onKeyUp={(e) => {
              const val = Number((e.target as HTMLInputElement).value);
              setPreview(null);
              if (val !== v) run('param', { name, value: val });
            }}
            aria-label={`Parameter ${name}`}
          />
          <span className="obj-param-v">{fmt(preview?.[name] ?? v)}</span>
        </label>
      ))}
      {step && (
        <p className="obj-step">
          <span className="obj-step-op">{step.said}</span>
          <span className="obj-step-who">{stepWho(step)} · computed</span>
          {step.note && <span className="obj-step-note">{step.note}</span>}
        </p>
      )}
      {onOp && (
        <form
          className="obj-ops"
          onSubmit={(e) => {
            e.preventDefault();
            const read = readOp?.(draft.trim());
            if (!read) {
              setSaid(`Try "${Object.keys(st.params)[0] ?? 'a'} = 2", "look at ${st.v} = 1", or "show −10 to 10".`);
              return;
            }
            run(read.op, read.args);
            setDraft('');
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`look at ${st.v} = 1`} aria-label={`Something to do to ${obj.name}`} spellCheck={false} />
          <button type="submit" className="obj-ops-go" disabled={!draft.trim()}>
            Apply
          </button>
        </form>
      )}
      {said && <p className="obj-refused" role="alert">{said}</p>}
      {obj.states.length > 1 && onSeek && (
        <nav className="obj-hist" aria-label="Steps">
          <button type="button" disabled={at === 0} onClick={() => onSeek(at - 1)} aria-label="Step back">‹</button>
          <span>{at === 0 ? 'as it started' : `after step ${at}`} · {obj.states.length - 1} step{obj.states.length === 2 ? '' : 's'}</span>
          <button type="button" disabled={at === obj.states.length - 1} onClick={() => onSeek(at + 1)} aria-label="Step forward">›</button>
        </nav>
      )}
    </div>
  );
}
