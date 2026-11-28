'use client';
// components/new-logos/primitives/Plot.tsx — Cartesian axes drawing functions of x, data read from a table, and
// points worked out from the shared state. Series are told apart by line pattern and direct labels, never by colour
// alone (the surface is monochrome). Hovering reads the value of every function at the pointer. Below the axes, the
// series are listed and, where the artifact may be edited, written in place.

import { useMemo, useRef, useState } from 'react';
import { evalIn, samplePlot, ticks } from '@/lib/new-logos/compose';
import { formatNumber } from '@/lib/new-logos/expr';
import { newItemId, type PlotSeries } from '@/lib/new-logos/primitives';
import { CommitInput, useSize, type PrimProps } from './common';

const DASH: Record<string, string | undefined> = { solid: undefined, dashed: '7 5', dotted: '1.5 4' };
const M = { l: 44, r: 14, t: 10, b: 26 };

export function PlotPrim({ p, comp, scope, editable, run }: PrimProps<'plot'>) {
  const d = p.data;
  const boxRef = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(boxRef);
  const [hover, setHover] = useState<number | null>(null);
  const width = Math.max(120, w), height = Math.max(80, h);
  const pw = width - M.l - M.r, ph = height - M.t - M.b;
  const smp = useMemo(() => samplePlot(d, comp, scope, Math.max(120, Math.min(600, Math.round(pw)))), [d, comp, scope, pw]);
  const sx = (x: number) => M.l + ((x - smp.x.min) / (smp.x.max - smp.x.min)) * pw;
  const sy = (y: number) => M.t + ph - ((y - smp.y.min) / (smp.y.max - smp.y.min)) * ph;
  const xt = ticks(smp.x.min, smp.x.max, Math.max(2, Math.round(pw / 70)));
  const yt = ticks(smp.y.min, smp.y.max, Math.max(2, Math.round(ph / 42)));
  const clipId = `clip-${p.id}`;
  const inY = (y: number) => y >= smp.y.min && y <= smp.y.max;
  const fns = d.series.filter((s): s is Extract<PlotSeries, { kind: 'fn' }> => s.kind === 'fn');
  const update = (series: PlotSeries[]) => run([{ op: 'update', id: p.id, data: { series } as unknown as Record<string, unknown> }]);

  // the reading at the pointer: each function's value there
  const reading = hover === null ? [] : fns.map((s) => ({ s, y: evalIn(scope, s.expr, { x: hover }).value })).filter((r) => Number.isFinite(r.y));

  const path = (seg: [number, number][]) =>
    seg.map(([x, y], k) => `${k ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(Math.max(smp.y.min - (smp.y.max - smp.y.min) * 2, Math.min(smp.y.max + (smp.y.max - smp.y.min) * 2, y))).toFixed(1)}`).join('');

  return (
    <div className="nl-prim-plot">
      <div className="nl-plot-box" ref={boxRef}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Plot: ${d.series.map((s) => (s.kind === 'fn' ? `y = ${s.expr}` : s.label || s.kind)).join('; ') || 'nothing yet'}`}
          className="nl-cv-noDrag"
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const k = r.width / width;
            const px = (e.clientX - r.left) / k;
            setHover(px >= M.l && px <= M.l + pw ? smp.x.min + ((px - M.l) / pw) * (smp.x.max - smp.x.min) : null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={M.l} y={M.t} width={pw} height={ph} />
            </clipPath>
          </defs>
          {d.grid ? (
            <g className="nl-plot-grid">
              {xt.map((t) => (
                <line key={`gx${t}`} x1={sx(t)} x2={sx(t)} y1={M.t} y2={M.t + ph} />
              ))}
              {yt.map((t) => (
                <line key={`gy${t}`} y1={sy(t)} y2={sy(t)} x1={M.l} x2={M.l + pw} />
              ))}
            </g>
          ) : null}
          <g className="nl-plot-axes">
            <rect x={M.l} y={M.t} width={pw} height={ph} className="nl-plot-frame" />
            {smp.y.min < 0 && smp.y.max > 0 ? <line x1={M.l} x2={M.l + pw} y1={sy(0)} y2={sy(0)} className="nl-plot-zero" /> : null}
            {smp.x.min < 0 && smp.x.max > 0 ? <line y1={M.t} y2={M.t + ph} x1={sx(0)} x2={sx(0)} className="nl-plot-zero" /> : null}
            {xt.map((t) => (
              <text key={`tx${t}`} x={sx(t)} y={M.t + ph + 16} textAnchor="middle">
                {formatNumber(t, 3)}
              </text>
            ))}
            {yt.map((t) => (
              <text key={`ty${t}`} x={M.l - 6} y={sy(t) + 4} textAnchor="end">
                {formatNumber(t, 3)}
              </text>
            ))}
            {d.x.label ? (
              <text x={M.l + pw} y={M.t + ph - 6} textAnchor="end" className="nl-plot-axlabel">
                {d.x.label}
              </text>
            ) : null}
            {d.y.label ? (
              <text x={M.l + 6} y={M.t + 13} className="nl-plot-axlabel">
                {d.y.label}
              </text>
            ) : null}
          </g>
          <g clipPath={`url(#${clipId})`}>
            {smp.curves.map((c) => (
              <g key={c.id} className="nl-plot-series">
                {c.segments.map((seg, k) => (seg.length > 1 ? <path key={k} d={path(seg)} strokeDasharray={DASH[c.style]} className="nl-plot-line" /> : null))}
                {c.points?.map(([x, y], k) => (inY(y) ? <circle key={`p${k}`} cx={sx(x)} cy={sy(y)} r={3.2} className="nl-plot-datum" /> : null))}
              </g>
            ))}
            {smp.points.map((pt) =>
              !pt.error && Number.isFinite(pt.x) && Number.isFinite(pt.y) ? (
                <g key={pt.id} className="nl-plot-point">
                  <line x1={sx(pt.x)} x2={sx(pt.x)} y1={sy(pt.y)} y2={M.t + ph} className="nl-plot-drop" />
                  <circle cx={sx(pt.x)} cy={sy(pt.y)} r={4.5} />
                  <text x={sx(pt.x) + 8} y={sy(pt.y) - 8}>
                    {`${pt.label ? `${pt.label} ` : ''}(${formatNumber(pt.x, 3)}, ${formatNumber(pt.y, 3)})`}
                  </text>
                </g>
              ) : null
            )}
            {/* direct labels where each function leaves the plot, when there is more than one to tell apart */}
            {fns.length > 1
              ? smp.curves
                  .filter((c) => fns.some((f) => f.id === c.id))
                  .map((c) => {
                    const seg = [...c.segments].reverse().find((s) => s.some(([, y]) => inY(y)));
                    const last = seg ? [...seg].reverse().find(([, y]) => inY(y)) : undefined;
                    return last ? (
                      <text key={`l${c.id}`} x={Math.min(sx(last[0]) - 4, M.l + pw - 4)} y={sy(last[1]) - 6} textAnchor="end" className="nl-plot-direct">
                        {c.label}
                      </text>
                    ) : null;
                  })
              : null}
          </g>
          {hover !== null ? (
            <g className="nl-plot-hover" aria-hidden="true">
              <line x1={sx(hover)} x2={sx(hover)} y1={M.t} y2={M.t + ph} />
              {reading.map((r) => (inY(r.y) ? <circle key={r.s.id} cx={sx(hover)} cy={sy(r.y)} r={3.5} /> : null))}
            </g>
          ) : null}
        </svg>
        {hover !== null && reading.length ? (
          <div className="nl-plot-tip" style={{ left: Math.min(sx(hover) + 10, width - 150), top: M.t + 4 }} aria-hidden="true">
            <div>x = {formatNumber(hover)}</div>
            {reading.map((r) => (
              <div key={r.s.id}>
                {r.s.label || r.s.expr}: {formatNumber(r.y)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <ul className="nl-plot-legend">
        {d.series.map((s) => {
          const err = smp.curves.find((c) => c.id === s.id)?.error ?? smp.points.find((x) => x.id === s.id)?.error;
          return (
            <li key={s.id}>
              <svg width="22" height="10" aria-hidden="true">
                {s.kind === 'point' ? <circle cx="11" cy="5" r="3.5" className="nl-plot-key-dot" /> : s.kind === 'table' && s.mark === 'points' ? <circle cx="11" cy="5" r="3" className="nl-plot-key-ring" /> : <line x1="1" x2="21" y1="5" y2="5" strokeDasharray={DASH[s.style]} className="nl-plot-key" />}
              </svg>
              {s.kind === 'fn' ? (
                editable ? (
                  <label className="nl-plot-expr">
                    <span>y =</span>
                    <CommitInput className="nl-in is-mono" aria-label="Function of x" value={s.expr} onCommit={(v) => update(d.series.map((x) => (x.id === s.id ? { ...x, expr: v } : x)))} />
                  </label>
                ) : (
                  <span className="nl-plot-name">{s.label || `y = ${s.expr}`}</span>
                )
              ) : s.kind === 'point' ? (
                editable ? (
                  <span className="nl-plot-expr">
                    <span>(</span>
                    <CommitInput className="nl-in is-mono" aria-label="Point x" value={s.x} onCommit={(v) => update(d.series.map((x) => (x.id === s.id ? { ...x, x: v } : x)))} />
                    <span>,</span>
                    <CommitInput className="nl-in is-mono" aria-label="Point y" value={s.y} onCommit={(v) => update(d.series.map((x) => (x.id === s.id ? { ...x, y: v } : x)))} />
                    <span>)</span>
                  </span>
                ) : (
                  <span className="nl-plot-name">{s.label || `(${s.x}, ${s.y})`}</span>
                )
              ) : (
                <span className="nl-plot-name">{smp.curves.find((c) => c.id === s.id)?.label ?? 'Data'}</span>
              )}
              {err ? <span className="nl-prim-error is-inline">{err}</span> : null}
              {editable ? (
                <button type="button" className="nl-icon-btn is-quiet" aria-label="Remove this series" onClick={() => update(d.series.filter((x) => x.id !== s.id))}>
                  ×
                </button>
              ) : null}
            </li>
          );
        })}
        {editable && d.series.length < 8 ? (
          <li className="nl-plot-add">
            <button type="button" className="nl-btn is-quiet is-small" onClick={() => update([...d.series, { id: newItemId('s'), kind: 'fn', expr: 'x', label: '', style: (['solid', 'dashed', 'dotted'] as const)[fns.length % 3] }])}>
              + Function
            </button>
            <button type="button" className="nl-btn is-quiet is-small" onClick={() => update([...d.series, { id: newItemId('s'), kind: 'point', x: '0', y: '0', label: '' }])}>
              + Point
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
