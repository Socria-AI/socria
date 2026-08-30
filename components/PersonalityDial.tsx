'use client';

// A round dial for one personality dimension.
//
// Every dimension is a short ordered list of registers — Gentle · Default ·
// Blunt — which a dropdown flattens into a menu you have to open to read. A
// dial shows the whole range at once and where you sit in it, and the nine of
// them together read as a panel of settings rather than a form.
//
// It is a real control, not a decoration: click a tick, drag the needle, or
// focus it and use the arrow keys. A faint mark stays at the Socria default's
// position, so you can see at a glance which dimensions you have moved.

import { useCallback, useEffect, useRef, useState } from 'react';
import { dialOrder, type PersonalityDimension } from '@/lib/logos-personality';

/** The needle's travel: a 250° sweep, leaving the bottom open like a knob. */
const START = -125;
const END = 125;

function angleFor(index: number, count: number): number {
  if (count <= 1) return 0;
  return START + (index * (END - START)) / (count - 1);
}

/** Point on a circle of radius r, measuring degrees clockwise from 12 o'clock. */
function pointAt(deg: number, r: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: 50 + r * Math.sin(rad), y: 50 - r * Math.cos(rad) };
}

export function PersonalityDial({
  dimension,
  value,
  onChange,
  className = '',
}: {
  dimension: PersonalityDimension;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  // Laid out as the dimension reads on a dial, which is not the order the
  // options are authored in — see dialOrder.
  const opts = dialOrder(dimension);
  const count = opts.length;
  const homeId = dimension.options[0].id;
  const index = Math.max(
    0,
    opts.findIndex((o) => o.id === value)
  );
  const active = opts[index] ?? opts[0];
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  // Which option a point in the dial is asking for. Below the sweep — the open
  // sector at the bottom — there is no nearest tick in the honest sense, so
  // the two ends split it between them rather than the needle jumping across.
  const indexFromEvent = useCallback(
    (clientX: number, clientY: number): number => {
      const el = svgRef.current;
      if (!el) return index;
      const box = el.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const deg = (Math.atan2(clientX - cx, cy - clientY) * 180) / Math.PI;
      if (deg < START) return deg < -177.5 ? count - 1 : 0;
      if (deg > END) return count - 1;
      const step = (END - START) / (count - 1);
      return Math.round((deg - START) / step);
    },
    [count, index]
  );

  const set = useCallback(
    (i: number) => {
      const clamped = Math.min(count - 1, Math.max(0, i));
      const next = opts[clamped];
      if (next && next.id !== value) onChange(next.id);
    },
    [count, onChange, opts, value]
  );

  // The pointer leaves the dial constantly while dragging a small circle, so
  // the move/up listeners live on the window for the duration of the drag.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      set(indexFromEvent(e.clientX, e.clientY));
    };
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, indexFromEvent, set]);

  function onKeyDown(e: React.KeyboardEvent) {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowUp') set(index + 1);
    else if (k === 'ArrowLeft' || k === 'ArrowDown') set(index - 1);
    else if (k === 'Home') set(0);
    else if (k === 'End') set(count - 1);
    else return;
    e.preventDefault();
  }

  const needle = pointAt(angleFor(index, count), 25);
  const homeIndex = Math.max(0, opts.findIndex((o) => o.id === homeId));
  const home = pointAt(angleFor(homeIndex, count), 38.5);
  const moved = active.id !== homeId;

  return (
    <div className={`lg-dial${moved ? ' is-moved' : ''}${dragging ? ' is-dragging' : ''} ${className}`}>
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        className="lg-dial-face"
        role="slider"
        tabIndex={0}
        aria-label={dimension.label}
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={index}
        aria-valuetext={active.label}
        onKeyDown={onKeyDown}
        // No preventDefault: it would swallow the click's own focus, and
        // focusing by hand instead makes a plain click look like keyboard
        // navigation and draw the focus ring. Dragging is kept from selecting
        // text by user-select on the wrapper.
        onPointerDown={(e) => {
          setDragging(true);
          set(indexFromEvent(e.clientX, e.clientY));
        }}
      >
        {/* one tick per register, the current one longer and lit */}
        {opts.map((o, i) => {
          const deg = angleFor(i, count);
          const a = pointAt(deg, 35);
          const b = pointAt(deg, i === index ? 43.5 : 41);
          return (
            <line
              key={o.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={`lg-dial-tick${i === index ? ' is-on' : ''}`}
            />
          );
        })}

        {/* where Socria's own default sits, so a moved dial reads as moved */}
        {moved && <circle cx={home.x} cy={home.y} r={1.5} className="lg-dial-home" />}

        <circle cx={50} cy={50} r={30} className="lg-dial-ring" />
        <line x1={50} y1={50} x2={needle.x} y2={needle.y} className="lg-dial-needle" />
        <circle cx={50} cy={50} r={3.4} className="lg-dial-hub" />
      </svg>
      <span className="lg-dial-name">{dimension.label}</span>
      <span className="lg-dial-value">{active.label}</span>
    </div>
  );
}
