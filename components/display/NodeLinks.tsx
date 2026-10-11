'use client';

// components/display/NodeLinks.tsx — boxes joined by lines, as a kind laid them out.
//
// The argument map, the diagram and the labeling exercise all draw a set of
// boxes and the lines between them. Where each box goes is the kind's to
// compute (tidyTree, flowLayout, conceptLayout… — centres and sizes in
// pixels); this canvas only draws it: HTML boxes (so words wrap, buttons
// focus and screen readers read) over an SVG layer of lines that meet the
// box edges, with arrowheads and labels. It scrolls inside its frame when the
// picture is larger than the room, and can let a box be dragged — the new
// centre is handed back on release, and the kind decides what it means.

import { useId, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';

export interface NLBox {
  id: string;
  /** centre, in the layout's pixels */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NLLine {
  from: string;
  to: string;
  /** classes for the line: a relation, a kind of connection ('back', 'across', 'is-best') */
  className?: string;
  label?: string;
  arrow?: boolean;
  dashed?: boolean;
}

/** Where the segment from a box's centre towards a point leaves the box. */
function edge(b: NLBox, tx: number, ty: number): [number, number] {
  const dx = tx - b.x;
  const dy = ty - b.y;
  if (!dx && !dy) return [b.x, b.y];
  const sx = dx ? b.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? b.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return [b.x + dx * s, b.y + dy * s];
}

const PAD = 14;

export function NodeLinks({
  width,
  height,
  boxes,
  lines,
  renderBox,
  label,
  draggable,
  onDrop,
  boxClass,
}: {
  width: number;
  height: number;
  boxes: NLBox[];
  lines: NLLine[];
  /** the content of each box */
  renderBox: (b: NLBox) => ReactNode;
  /** what the picture is, for a screen reader */
  label: string;
  /** may this box be dragged */
  draggable?: (id: string) => boolean;
  /** a box let go at a new centre (layout pixels) */
  onDrop?: (id: string, x: number, y: number) => void;
  boxClass?: (id: string) => string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [drag, setDrag] = useState<{ id: string; sx: number; sy: number; dx: number; dy: number } | null>(null);
  const moved = useRef(false);
  const at = new Map(boxes.map((b) => [b.id, drag && drag.id === b.id ? { ...b, x: b.x + drag.dx, y: b.y + drag.dy } : b]));
  const W = Math.max(width, 1) + PAD * 2;
  const H = Math.max(height, 1) + PAD * 2;

  const down = (e: RPointerEvent<HTMLDivElement>, id: string) => {
    moved.current = false;
    if (!draggable?.(id) || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ id, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0 });
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    setDrag({ ...drag, dx, dy });
  };
  const up = () => {
    if (!drag) return;
    const b = boxes.find((x) => x.id === drag.id);
    const d = drag;
    setDrag(null);
    if (b && moved.current) onDrop?.(d.id, Math.min(width, Math.max(0, b.x + d.dx)), Math.min(height, Math.max(0, b.y + d.dy)));
  };

  return (
    <div className="dsp-nl" role="group" aria-label={label}>
      <div className="dsp-nl-stage" style={{ width: W, height: H }}>
        <svg className="dsp-nl-lines" width={W} height={H} aria-hidden="true">
          <defs>
            <marker id={`${uid}-a`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" className="dsp-nl-head" />
            </marker>
          </defs>
          {lines.map((l, i) => {
            const a = at.get(l.from);
            const b = at.get(l.to);
            if (!a || !b) return null;
            const [x1, y1] = edge(a, b.x, b.y);
            const [x2, y2] = edge(b, a.x, a.y);
            return (
              <g key={`${l.from}>${l.to}:${i}`} className={`dsp-nl-line ${l.className ?? ''}`}>
                <line
                  x1={x1 + PAD}
                  y1={y1 + PAD}
                  x2={x2 + PAD}
                  y2={y2 + PAD}
                  strokeDasharray={l.dashed ? '4 3' : undefined}
                  markerEnd={l.arrow === false ? undefined : `url(#${uid}-a)`}
                />
                {l.label && (
                  <text x={(x1 + x2) / 2 + PAD} y={(y1 + y2) / 2 + PAD - 4} textAnchor="middle">
                    {l.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {boxes.map((b0) => {
          const b = at.get(b0.id)!;
          const can = !!draggable?.(b.id);
          return (
            <div
              key={b.id}
              className={`dsp-nl-box${can ? ' is-draggable' : ''}${drag?.id === b.id ? ' is-dragging' : ''} ${boxClass?.(b.id) ?? ''}`}
              style={{ left: b.x - b.w / 2 + PAD, top: b.y - b.h / 2 + PAD, width: b.w, minHeight: b.h }}
              data-worked={can ? '' : undefined}
              onPointerDown={(e) => down(e, b.id)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => setDrag(null)}
              onClickCapture={(e) => {
                // a drag is not a click
                if (moved.current) {
                  e.stopPropagation();
                  moved.current = false;
                }
              }}
            >
              {renderBox(b)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
