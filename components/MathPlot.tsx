'use client';

// The plot lens: draws the function(s) on the map. Pure SVG over samples from
// the safe evaluator — no plotting library, no eval. Up to four curves overlay
// so you can compare them, each in the palette, with a small legend.

import { useMemo } from 'react';
import type { ThinkingMap } from '@/lib/logos';
import { plottableNodes } from '@/lib/logos-layout';
import { samplePlot } from '@/lib/logos-math';
import { TeX } from './TeX';

const CURVE_COLORS = ['var(--lg-primary)', 'var(--lg-accent)', 'var(--lg-tension)', '#6B5F7A'];

export function MathPlot({
  map,
  width,
  height,
  guarded,
}: {
  map: ThinkingMap;
  width: number;
  height: number;
  guarded?: boolean;
}) {
  const curves = useMemo(() => {
    const fns = plottableNodes(map);
    return fns
      .map((f, i) => {
        const data = samplePlot(f.fn);
        return data ? { ...f, data, color: CURVE_COLORS[i % CURVE_COLORS.length] } : null;
      })
      .filter(Boolean) as NonNullable<ReturnType<typeof samplePlot> extends infer D ? any : never>[];
  }, [map]);

  if (!curves.length) {
    return (
      <div className="lg-map-empty">
        <p>No function to plot yet.</p>
      </div>
    );
  }

  // shared viewport across curves
  const xMin = -10, xMax = 10;
  const yMin = Math.min(...curves.map((c) => c.data.yMin));
  const yMax = Math.max(...curves.map((c) => c.data.yMax));

  const pad = { l: 40, r: 20, t: 24, b: 28 };
  const W = Math.max(280, width - 32);
  const H = Math.max(240, height - 60);
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const sx = (x: number) => pad.l + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin || 1)) * plotH;

  // gridlines at integer-ish intervals
  const xStep = niceStep(xMax - xMin);
  const yStep = niceStep(yMax - yMin);
  const xTicks: number[] = [];
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) xTicks.push(round(x));
  const yTicks: number[] = [];
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) yTicks.push(round(y));

  const pathFor = (data: (typeof curves)[number]['data']) => {
    let d = '';
    let pen = false;
    for (const s of data.samples) {
      // break the line across NaN / out-of-view (asymptotes)
      if (!Number.isFinite(s.y) || s.y < yMin - (yMax - yMin) || s.y > yMax + (yMax - yMin)) {
        pen = false;
        continue;
      }
      const X = sx(s.x);
      const Y = sy(s.y);
      d += `${pen ? 'L' : 'M'} ${X.toFixed(1)} ${Y.toFixed(1)} `;
      pen = true;
    }
    return d;
  };

  return (
    <div className="lg-plot">
      <svg viewBox={`0 0 ${W} ${H}`} className="lg-plot-svg" role="img" aria-label="Function plot">
        {/* grid */}
        {xTicks.map((x) => (
          <line key={`gx${x}`} x1={sx(x)} y1={pad.t} x2={sx(x)} y2={pad.t + plotH} className="lg-plot-grid" />
        ))}
        {yTicks.map((y) => (
          <line key={`gy${y}`} x1={pad.l} y1={sy(y)} x2={pad.l + plotW} y2={sy(y)} className="lg-plot-grid" />
        ))}
        {/* axes (x=0, y=0 if in view) */}
        {yMin <= 0 && yMax >= 0 && (
          <line x1={pad.l} y1={sy(0)} x2={pad.l + plotW} y2={sy(0)} className="lg-plot-axis" />
        )}
        {xMin <= 0 && xMax >= 0 && (
          <line x1={sx(0)} y1={pad.t} x2={sx(0)} y2={pad.t + plotH} className="lg-plot-axis" />
        )}
        {/* tick labels */}
        {xTicks.filter((x) => x !== 0).map((x) => (
          <text key={`tx${x}`} x={sx(x)} y={pad.t + plotH + 16} className="lg-plot-tick" textAnchor="middle">
            {x}
          </text>
        ))}
        {yTicks.filter((y) => y !== 0).map((y) => (
          <text key={`ty${y}`} x={pad.l - 6} y={sy(y) + 3} className="lg-plot-tick" textAnchor="end">
            {y}
          </text>
        ))}
        {/* curves */}
        {curves.map((c) => (
          <path key={c.id} d={pathFor(c.data)} fill="none" stroke={c.color} strokeWidth={2} className="lg-plot-curve" />
        ))}
      </svg>
      <div className="lg-plot-legend">
        {curves.map((c) => (
          <span key={c.id} className="lg-plot-key">
            <i style={{ background: c.color }} />
            <TeX tex={c.node.tex || c.node.label} />
          </span>
        ))}
      </div>
      {/* Under the Answer Guard the curve stays — a faithful drawing of a
          function they already hold is a thinking aid, not the tool stating a
          result — but the plot never annotates roots, intercepts or extrema
          with their values, so it can't hand over what Chat is withholding. */}
      {guarded && (
        <p className="lg-plot-guardnote">
          reading the shape is one way in — the exact values stay yours until you reveal them
        </p>
      )}
    </div>
  );
}

function niceStep(range: number): number {
  const raw = range / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}
function round(n: number): number {
  return Math.abs(n) < 1e-9 ? 0 : Math.round(n * 1000) / 1000;
}
