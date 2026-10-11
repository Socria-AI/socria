'use client';

// components/display/PlotFrame.tsx — the axes every chart in a display stands on.
//
// A chart's kind computes where everything goes as fractions of the plot
// (0..1 across, 0..1 up — display-data barLayout, xyLayout…, the market's
// window); this frame turns those fractions into a drawing of a fixed aspect
// that scales with its container: ticks and their labels, light gridlines,
// a baseline where zero is, and the axes' titles — what each axis measures,
// in words, which a chart without cannot be read by. It draws nothing of its
// own beyond the axes, and computes nothing.

import type { ReactNode } from 'react';

export interface Tick {
  /** where along the axis, 0..1 */
  at: number;
  label: string;
}

export interface Plot {
  /** fraction across → x in the drawing */
  px: (f: number) => number;
  /** fraction up → y in the drawing (0 at the bottom) */
  py: (f: number) => number;
  /** the plot area in the drawing */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function PlotFrame({
  width = 560,
  height = 300,
  xTicks = [],
  yTicks = [],
  xTitle,
  yTitle,
  baseline,
  label,
  children,
  pad = { l: 48, r: 14, t: 14, b: 40 },
}: {
  width?: number;
  height?: number;
  xTicks?: Tick[];
  yTicks?: Tick[];
  xTitle?: string;
  yTitle?: string;
  /** where zero sits up the plot, 0..1 — drawn as the baseline */
  baseline?: number | null;
  /** what the chart shows, for a screen reader (a table beside it says the numbers) */
  label: string;
  children: (p: Plot) => ReactNode;
  pad?: { l: number; r: number; t: number; b: number };
}) {
  const left = pad.l;
  const right = width - pad.r;
  const top = pad.t;
  const bottom = height - pad.b;
  const p: Plot = {
    px: (f) => left + f * (right - left),
    py: (f) => bottom - f * (bottom - top),
    left,
    right,
    top,
    bottom,
  };
  const clamp = (f: number) => Math.min(1, Math.max(0, f));
  return (
    <svg className="dsp-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <g className="dsp-plot-grid" aria-hidden="true">
        {yTicks.map((t, i) => (
          <line key={`gy${i}`} x1={left} x2={right} y1={p.py(clamp(t.at))} y2={p.py(clamp(t.at))} />
        ))}
      </g>
      <g className="dsp-plot-axis" aria-hidden="true">
        <line x1={left} x2={left} y1={top} y2={bottom} />
        <line x1={left} x2={right} y1={bottom} y2={bottom} />
        {baseline !== undefined && baseline !== null && baseline > 0.0001 && baseline < 0.9999 && (
          <line className="dsp-plot-zero" x1={left} x2={right} y1={p.py(baseline)} y2={p.py(baseline)} />
        )}
      </g>
      <g className="dsp-plot-ticks" aria-hidden="true">
        {yTicks.map((t, i) => (
          <text key={`ty${i}`} x={left - 6} y={p.py(clamp(t.at)) + 3.5} textAnchor="end">
            {t.label}
          </text>
        ))}
        {xTicks.map((t, i) => (
          <text key={`tx${i}`} x={p.px(clamp(t.at))} y={bottom + 15} textAnchor="middle">
            {t.label}
          </text>
        ))}
      </g>
      {(xTitle || yTitle) && (
        <g className="dsp-plot-titles" aria-hidden="true">
          {xTitle && (
            <text x={(left + right) / 2} y={height - 6} textAnchor="middle">
              {xTitle}
            </text>
          )}
          {yTitle && (
            <text x={12} y={(top + bottom) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(top + bottom) / 2})`}>
              {yTitle}
            </text>
          )}
        </g>
      )}
      {children(p)}
    </svg>
  );
}
