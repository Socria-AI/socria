'use client';
// components/logos5/L5Tip.tsx — A SMALL CARD, POINTING AT WHAT IT IS ABOUT.
//
// The tips a new person gets and the features now and then
// (lib/logos5/tips.ts): a title, a sentence, "Got it", and for a feature a
// "Show me" that does the thing. It finds what it points at on the page and
// sits beside it — below when there is room, above when not — and follows it
// if the page moves. If the thing goes (another view opened), so does the
// card. It never covers what it points at, and nothing about it is modal.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Tip } from '@/lib/logos5/tips';
import './tips.css';

const GAP = 12;
const EDGE = 12;

/** The first match of a selector list that is on screen. */
function visibleOf(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth) return el;
  }
  return null;
}

export function L5Tip({
  tip,
  body,
  onClose,
  onAction,
  onGone,
}: {
  tip: Tip;
  /** what it says, device words filled in (tipBody) */
  body: string;
  /** "Got it", or Escape */
  onClose: () => void;
  /** "Show me" — features only */
  onAction?: () => void;
  /** what it points at is no longer on screen */
  onGone: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ x: number; y: number; side: 'below' | 'above'; arrow: number } | null>(null);
  const goneRef = useRef(onGone);
  goneRef.current = onGone;

  useLayoutEffect(() => {
    let raf = 0;
    let missing = 0;
    const measure = () => {
      const a = visibleOf(tip.anchor);
      const c = card.current;
      if (!a || !c) {
        // a moment to settle (a view opening) before the card lets go
        if (++missing > 40) goneRef.current();
        raf = requestAnimationFrame(measure);
        return;
      }
      missing = 0;
      const r = a.getBoundingClientRect();
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      const cx = r.left + r.width / 2;
      // above, it clears the whole of what it must not cover (the box someone types in), not just its target
      const keep = tip.avoid ? a.closest(tip.avoid) : null;
      const top = keep ? Math.min(r.top, keep.getBoundingClientRect().top) : r.top;
      const below = r.bottom + GAP + h <= innerHeight - EDGE || top - GAP - h < EDGE;
      const x = Math.max(EDGE, Math.min(innerWidth - EDGE - w, cx - w / 2));
      const y = below ? r.bottom + GAP : top - GAP - h;
      const arrow = Math.max(16, Math.min(w - 16, cx - x));
      setPlace((p) => (p && Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5 && p.side === (below ? 'below' : 'above') && Math.abs(p.arrow - arrow) < 0.5 ? p : { x, y, side: below ? 'below' : 'above', arrow }));
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [tip.anchor, tip.avoid]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.activeElement && card.current?.contains(document.activeElement)) onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  return (
    <div
      ref={card}
      className={`l5tip is-${tip.kind}${place ? ` is-${place.side} is-placed` : ''}`}
      role="note"
      aria-label={tip.title}
      style={place ? ({ transform: `translate(${Math.round(place.x)}px, ${Math.round(place.y)}px)`, '--arrow': `${Math.round(place.arrow)}px` } as React.CSSProperties) : undefined}
    >
      <span className="l5tip-k">
        <i aria-hidden="true" />
        {tip.kind === 'tip' ? 'A tip' : 'Something to try'}
      </span>
      <p className="l5tip-t">{tip.title}</p>
      <p className="l5tip-b">{body}</p>
      <span className="l5tip-row">
        {onAction && (
          <button type="button" className="l5tip-go" onClick={onAction}>
            Show me
          </button>
        )}
        <button type="button" className="l5tip-ok" onClick={onClose}>
          Got it
        </button>
      </span>
    </div>
  );
}
