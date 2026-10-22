'use client';
// components/logos5/L5Line.tsx — A LINE OF THINKING, ON A DESKTOP: the view,
// and the conversation box, which can float over it.
//
// The box is the conversation in either shape (lib/logos5/box.ts): unfolded,
// the thread with its composer; folded, the composer alone over the views.
// Docked, it sits where it always has. Its head — or the grip on a folded
// composer — drags it anywhere over the views, where it stays (per browser).
// Its tools: float or dock it, put it in the middle, and hide the views
// behind it, which leaves the conversation alone, centred and given room.
// Keyboard: the handle takes the arrow keys (Shift moves further).
//
// A phone keeps its sheet (LogosApp): a box dragged by a thumb over a map
// the same thumb pans is two gestures fighting for one finger.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DOCKED, anchorOf, keepInside, placeBox, readBox, writeBox, type BoxPlace } from '@/lib/logos5/box';

const store = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

interface Drag {
  id: number;
  x0: number;
  y0: number;
  /** where in the box it was taken hold of */
  dx: number;
  dy: number;
  moved: boolean;
}

export function L5Line({
  convoOpen,
  setConvo,
  turnsSaid,
  thread,
  dock,
  peek,
  view,
  studyTab,
}: {
  convoOpen: boolean;
  setConvo: (open: boolean) => void;
  turnsSaid: string;
  thread: ReactNode;
  dock: ReactNode;
  peek: ReactNode;
  view: ReactNode;
  studyTab: string;
}) {
  const [box, setBoxNow] = useState<BoxPlace>(() => readBox(store()));
  const setBox = useCallback((next: BoxPlace) => {
    setBoxNow(next);
    writeBox(store(), next);
  }, []);
  const floating = box.float || box.focus;

  const roomRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const sizes = () => {
    const room = roomRef.current?.getBoundingClientRect();
    const el = boxRef.current?.getBoundingClientRect();
    return room && el ? { room, el, roomS: { w: room.width, h: room.height }, boxS: { w: el.width, h: el.height } } : null;
  };

  // WHERE IT GOES: from where it was left (or the middle), inside the room,
  // whenever the room, the box or its shape changes — never while held
  const place = useCallback(() => {
    if (dragRef.current?.moved) return;
    if (!floating) return setPos(null);
    const s = sizes();
    if (s) setPos(placeBox(box, s.roomS, s.boxS));
  }, [box, floating]);
  useLayoutEffect(() => {
    place();
  }, [place, convoOpen]);
  useEffect(() => {
    const room = roomRef.current;
    if (!room || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place());
    ro.observe(room);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [place, convoOpen]);

  // ── dragging it ──
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
    const s = sizes();
    if (!s) return;
    dragRef.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dx: Math.min(e.clientX - s.el.left, 380),
      dy: Math.min(e.clientY - s.el.top, 40),
      moved: false,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* it still drags; it may just escape the window */
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
      d.moved = true;
      // taken out of its dock, or out of the middle: it is where the hand is now
      if (!box.float || box.centered) setBoxNow((b) => ({ ...b, float: true, centered: false }));
    }
    const s = sizes();
    if (!s) return;
    setPos(keepInside(e.clientX - s.room.left - d.dx, e.clientY - s.room.top - d.dy, s.roomS, s.boxS));
    e.preventDefault();
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    if (!d.moved) return;
    const s = sizes();
    if (!s) return;
    const { ax, ay } = anchorOf(s.el.left - s.room.left, s.el.top - s.room.top, s.roomS, s.boxS);
    setBox({ ...box, float: true, centered: false, ax, ay });
  };
  // the arrow keys, for whoever does not drag
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 96 : 24;
    const by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!by || (e.target as Element) !== e.currentTarget) return;
    e.preventDefault();
    const s = sizes();
    if (!s) return;
    const at = keepInside(s.el.left - s.room.left + by[0], s.el.top - s.room.top + by[1], s.roomS, s.boxS);
    setPos(at);
    setBox({ ...box, float: true, centered: false, ...anchorOf(at.left, at.top, s.roomS, s.boxS) });
  };
  const handle = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  // ── its tools ──
  const toggleFloat = () => setBox(floating ? { ...DOCKED } : { ...box, float: true, centered: true });
  const center = () => setBox({ ...box, float: true, centered: true });
  const toggleViews = () => {
    if (box.focus) return setBox({ ...box, focus: false });
    setBox({ ...box, float: true, centered: true, focus: true });
    // the views hidden, the conversation is what there is: unfolded
    if (!convoOpen) setConvo(true);
  };
  // folded, the composer goes back over the views — which come back with it
  const fold = () => {
    if (box.focus) setBox({ ...box, focus: false });
    setConvo(false);
  };
  // Esc leaves the conversation alone, from anywhere in it
  useEffect(() => {
    if (!box.focus) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"]')) setBox({ ...box, focus: false });
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [box, setBox]);

  const tools = (
    <span className="l5x-box-tools">
      <button type="button" className="l5x-box-tool" onClick={center} aria-label="Put it in the middle" title="Put it in the middle">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" />
        </svg>
      </button>
      <button
        type="button"
        className="l5x-box-tool"
        onClick={toggleViews}
        aria-pressed={box.focus}
        aria-label={box.focus ? 'Show the views' : 'Hide the views'}
        title={box.focus ? 'Show the views (Esc)' : 'Hide the views — the conversation alone'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {box.focus ? (
            <>
              <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
              <circle cx="12" cy="12" r="2.8" />
            </>
          ) : (
            <>
              <path d="M4 4l16 16" />
              <path d="M9.6 5.8A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.7 17.7 0 0 1-2.9 3.7M6.2 7.6A17 17 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9.6 9.6 0 0 0 4.1-.9" />
            </>
          )}
        </svg>
      </button>
      <button
        type="button"
        className="l5x-box-tool"
        onClick={toggleFloat}
        aria-label={floating ? 'Dock it beside the views' : 'Float it over the views'}
        title={floating ? 'Dock it beside the views' : 'Float it over the views — then drag it anywhere'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {floating ? (
            <>
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d="M9.5 4.5v15" />
            </>
          ) : (
            <>
              <rect x="3.5" y="7.5" width="13" height="12" rx="2.5" />
              <path d="M13 3.5h7.5V11M20.5 3.5L12.5 11.5" />
            </>
          )}
        </svg>
      </button>
    </span>
  );

  const placed = floating && pos ? { left: pos.left, top: pos.top } : undefined;
  return (
    <div
      ref={roomRef}
      className={`l5x${convoOpen ? ' has-convo' : ''}${floating ? ' is-floating' : ''}${box.focus ? ' is-focus' : ''}${pos ? '' : ' is-placing'}`}
    >
      {convoOpen && (
        <aside ref={(el) => void (boxRef.current = el)} className="l5x-convo" aria-label="Conversation" style={placed}>
          <div
            className="l5x-convo-head"
            {...handle}
            onKeyDown={onKey}
            tabIndex={0}
            aria-label="The conversation — drag to move it, or use the arrow keys"
            title="Drag to move it"
          >
            <span className="l5x-convo-t">
              Conversation{' '}
              <button type="button" className="l5x-convo-fold" onClick={fold}>
                {turnsSaid} · fold it away ›
              </button>
            </span>
            <span className="l5x-convo-acts">
              {tools}
              <button type="button" className="l5-iconbtn" aria-label="Fold the conversation away" title="Fold the conversation away" onClick={fold}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
            </span>
          </div>
          {thread}
        </aside>
      )}
      <section className={`l5x-canvas is-${studyTab}`} aria-hidden={box.focus || undefined}>
        <div className="l5x-view">{view}</div>
      </section>
      {/* beside the views, not in them: hiding them never hides it */}
      {!convoOpen && (
        <div ref={(el) => void (boxRef.current = el)} className="l5x-omni" style={placed}>
          <div
            className="l5x-omni-bar"
            {...handle}
            onKeyDown={onKey}
            tabIndex={0}
            aria-label="The composer — drag to move it, or use the arrow keys"
            title="Drag to move it"
          >
            <span className="l5x-grip" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            {tools}
          </div>
          {peek}
          {dock}
        </div>
      )}
    </div>
  );
}
