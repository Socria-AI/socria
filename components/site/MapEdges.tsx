'use client';
// components/site/MapEdges.tsx — the lines between the cards on the landing's
// Logic Map, drawn from where the cards actually are.
//
// The cards are laid out by the grid, and their heights depend on the font,
// the width and how a label wraps, so no fixed coordinates would hold. Each
// edge is measured from the two cards' boxes, relative to the canvas the svg
// fills, and measured again whenever either changes size. The curve is the
// design's: straight down when one card is below the other, a sideways S when
// they share a row.

import { useEffect, useRef, useState } from 'react';

export interface MapEdge {
  from: string;
  to: string;
  /** an edge the reasoning stands on: drawn in the map's green */
  on?: boolean;
}

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  cx: number;
  cy: number;
}

/** The path from one card to another, as the design draws it. */
export function edgePath(a: Box, b: Box): string {
  if (b.t >= a.b - 2) {
    const my = (a.b + b.t) / 2;
    return `M${a.cx},${a.b} C${a.cx},${my} ${b.cx},${my} ${b.cx},${b.t}`;
  }
  const left = a.cx < b.cx;
  const x1 = left ? a.r : a.l;
  const x2 = left ? b.l : b.r;
  const mx = (x1 + x2) / 2;
  return `M${x1},${a.cy} C${mx},${a.cy} ${mx},${b.cy} ${x2},${b.cy}`;
}

const key = (e: MapEdge) => `${e.from}>${e.to}`;

/** Sits inside the canvas; finds the cards by their `data-pn` names. */
export function MapEdges({ edges }: { edges: readonly MapEdge[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [paths, setPaths] = useState<Record<string, string>>({});

  useEffect(() => {
    const canvas = ref.current?.parentElement;
    if (!canvas) return;
    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const o = canvas.getBoundingClientRect();
        const box = (name: string): Box | null => {
          const el = canvas.querySelector(`[data-pn="${name}"]`);
          if (!el) return null;
          const b = el.getBoundingClientRect();
          if (!b.height) return null;
          return {
            l: b.left - o.left,
            t: b.top - o.top,
            r: b.right - o.left,
            b: b.bottom - o.top,
            cx: (b.left + b.right) / 2 - o.left,
            cy: (b.top + b.bottom) / 2 - o.top,
          };
        };
        const next: Record<string, string> = {};
        for (const e of edges) {
          const a = box(e.from);
          const b = box(e.to);
          if (a && b) next[key(e)] = edgePath(a, b);
        }
        setPaths(next);
      });
    };
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    canvas.querySelectorAll('[data-pn]').forEach((el) => ro.observe(el));
    draw();
    // A card's height changes again when the faces arrive.
    document.fonts?.ready.then(draw).catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [edges]);

  return (
    <svg ref={ref} className="s-edges" aria-hidden="true">
      {edges.map((e) => (
        <path key={key(e)} className={e.on ? 'is-on' : undefined} d={paths[key(e)]} />
      ))}
    </svg>
  );
}
