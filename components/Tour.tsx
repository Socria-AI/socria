'use client';
// components/Tour.tsx
//
// Four anchored notes, once, then never again.
//
// Not a carousel and not a blocking modal. One SVG draws the scrim, cuts a
// hole around the control being named, rings it in ink and runs a leader to
// the note — so the page stays visibly the subject and the note is an aside.
//
// A STEP WHOSE CONTROL IS NOT ON SCREEN IS SKIPPED, not drawn pointing at
// the corner. The sessions rail is not rendered on a narrow window, and a
// tour that rings empty space to explain something invisible is the failure
// this most easily falls into.

import { useCallback, useEffect, useState } from 'react';
import { ROMAN, TOUR_STEPS, inkRect, nextStep } from '@/lib/tour';

interface Box { x: number; y: number; w: number; h: number }

export function Tour({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);

  const measure = useCallback((idx: number): Box | null => {
    const step = TOUR_STEPS[idx];
    if (!step) return null;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // Zero-sized means present in the tree but not actually shown.
    if (r.width < 4 || r.height < 4) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, []);

  // Walk forward to the first step whose control is really on screen.
  const settle = useCallback(
    (from: number) => {
      let at: number | null = from;
      while (at !== null) {
        const b = measure(at);
        if (b) {
          setI(at);
          setBox(b);
          return;
        }
        at = nextStep(at);
      }
      onDone();
    },
    [measure, onDone]
  );

  useEffect(() => {
    if (!open) return;
    setVw(window.innerWidth);
    setVh(window.innerHeight);
    // A frame's grace so the chat has laid out before anything is measured.
    const t = requestAnimationFrame(() => settle(0));
    const sync = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
      setBox(measure(i));
    };
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [open, i, measure, settle]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onDone]);

  if (!open || !box) return null;
  const step = TOUR_STEPS[i];
  const pad = 6;
  const bx = box.x - pad;
  const by = box.y - pad;
  const bw = box.w + pad * 2;
  const bh = box.h + pad * 2;

  const advance = () => {
    const n = nextStep(i);
    if (n === null) onDone();
    else settle(n);
  };

  // The note sits beside the hole, clamped so it never leaves the window.
  const NW = 288;
  const noteX =
    step.place === 'right'
      ? Math.min(bx + bw + 18, vw - NW - 16)
      : Math.min(Math.max(16, bx + bw / 2 - NW / 2), vw - NW - 16);
  const noteY =
    step.place === 'above'
      ? Math.max(16, by - 150)
      : step.place === 'below'
        ? Math.min(by + bh + 16, vh - 170)
        : Math.min(Math.max(16, by), vh - 170);

  return (
    <div className="tour-scrim" role="dialog" aria-modal="false" aria-label={step.title}>
      <svg className="tour-svg" width={vw} height={vh} aria-hidden="true">
        <defs>
          <mask id="tour-hole">
            <rect x="0" y="0" width={vw} height={vh} fill="#fff" />
            <rect x={bx} y={by} width={bw} height={bh} rx="8" fill="#000" />
          </mask>
        </defs>
        <rect x="0" y="0" width={vw} height={vh} mask="url(#tour-hole)" className="tour-dot" />
        <path d={inkRect(bx, by, bw, bh)} className="tour-ring" />
        <path
          className="tour-leader"
          d={`M${bx + bw / 2},${by + bh / 2} Q${(bx + bw / 2 + noteX) / 2},${
            (by + bh / 2 + noteY) / 2
          } ${noteX + NW / 2},${noteY + 20}`}
        />
      </svg>

      <div className="tour-note" style={{ left: noteX, top: noteY, width: NW }}>
        <div className="tn-head">
          <span className="tn-num">{ROMAN[i]}.</span>
          <span className="tn-ticks" aria-hidden="true">
            {TOUR_STEPS.map((s, n) => (
              <i key={s.anchor} className={n <= i ? 'on' : ''} />
            ))}
          </span>
        </div>
        <p className="tn-t">{step.title}</p>
        {/* Ours, from a fixed table — never anything a person typed. */}
        <p className="tn-b" dangerouslySetInnerHTML={{ __html: step.body }} />
        <div className="tn-foot">
          <button type="button" className="tn-skip" onClick={onDone}>
            Skip
          </button>
          <button type="button" className="tn-next" onClick={advance}>
            {nextStep(i) === null ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
