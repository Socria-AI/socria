'use client';
// components/logos5/NavMover.tsx — "Move the views": left (the default), top or right (./nav-side.ts).
//
// The choices float over the page, beside the button and inside the window, so no row, rail or bar that holds the
// button can cut them off: the views along the top scroll sideways, and that row clipped a menu that hung below it.
// They are drawn into the app's root (so they keep its colours and type) at a fixed place worked out from the button,
// below it, or above it where the window has no room below.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NAV_SIDES, NAV_SIDE_SAID, type NavSide } from './nav-side';

const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Where the choices go: under the button (or over it, with no room under), on the button's side of the window. */
export function menuPlace(b: { left: number; right: number; top: number; bottom: number }, m: { width: number; height: number }, win: { width: number; height: number }) {
  const gap = 6,
    edge = 8;
  const top = b.bottom + gap + m.height <= win.height - edge ? b.bottom + gap : Math.max(edge, b.top - gap - m.height);
  const start = (b.left + b.right) / 2 < win.width / 2 ? b.left : b.right - m.width;
  const left = Math.min(Math.max(edge, start), Math.max(edge, win.width - m.width - edge));
  return { left: Math.round(left), top: Math.round(top) };
}

export function NavMover({ side, onSide, compact = false }: { side: NavSide; onSide: (s: NavSide) => void; compact?: boolean }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const open = !!host;
  const close = (refocus: boolean) => {
    setHost(null);
    setAt(null);
    if (refocus) btn.current?.focus({ preventScroll: true });
  };
  // placed before it is seen, and kept beside the button as the page scrolls or the window changes
  useBeforePaint(() => {
    if (!open) return;
    const place = () => {
      const b = btn.current?.getBoundingClientRect();
      const m = menu.current?.getBoundingClientRect();
      if (!b || !m) return;
      const next = menuPlace(b, m, { width: window.innerWidth, height: window.innerHeight });
      setAt((p) => (p && p.left === next.left && p.top === next.top ? p : next));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  // once it is in place, the choice already made has the focus, so the keys reach the choices (they are drawn
  // elsewhere in the page than the button)
  const placed = !!at;
  useEffect(() => {
    if (open && placed) menu.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
  }, [open, placed]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !menu.current?.contains(t)) close(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span className="ls-navmove" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="l5-link ls-navmove-b"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => (open ? close(false) : setHost((wrap.current?.closest('.logos-root') as HTMLElement | null) ?? document.body))}
        title="Move the views to the left, the top or the right"
        aria-label="Move the views"
      >
        {compact ? '⇄' : 'Move the views'}
      </button>
      {host &&
        createPortal(
          <span
            ref={menu}
            className="ls-navmove-menu is-floating lg-tokens"
            role="group"
            aria-label="Where the views sit"
            style={at ? { left: at.left, top: at.top } : { left: 0, top: 0, visibility: 'hidden' }}
            // tabbing away from the choices puts them away
            onBlur={(e) => {
              const to = e.relatedTarget as Node | null;
              if (to && !menu.current?.contains(to) && to !== btn.current) close(false);
            }}
          >
            {NAV_SIDES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={side === s}
                onClick={() => {
                  onSide(s);
                  close(true);
                }}
              >
                {NAV_SIDE_SAID[s]}
              </button>
            ))}
          </span>,
          host
        )}
    </span>
  );
}
