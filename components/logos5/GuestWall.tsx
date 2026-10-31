'use client';
// components/logos5/GuestWall.tsx — A GUEST'S ONE LINE OF THINKING, said once.
//
// Signed out, Logos 5 is open to anyone: one line of thinking and its map
// (lib/guest-pass.ts). Starting a second is where an account comes in, and
// this says so plainly — what the limit is, that signing up is free, and that
// the line of thinking they have comes with them (LogosApp carries it in on
// their first sign-in). No upsell, no countdown: keep going or sign up.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GUEST_TURNS } from '@/lib/guest-limits';

export function GuestWall({
  open,
  spent = false,
  signUpHref,
  signInHref,
  onClose,
}: {
  open: boolean;
  /** the guest's messages are used up — not "another line of thinking": there is nothing to keep going with */
  spent?: boolean;
  signUpHref: string;
  signInHref: string;
  onClose: () => void;
}) {
  const primary = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!open) return;
    primary.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="l5-guestwall" role="presentation" onClick={onClose}>
      <div className="l5-guestwall-card" role="dialog" aria-modal="true" aria-labelledby="l5-guestwall-h" aria-describedby="l5-guestwall-d" onClick={(e) => e.stopPropagation()}>
        <p className="l5-guestwall-k">You&rsquo;re a guest</p>
        <h2 className="l5-guestwall-h" id="l5-guestwall-h">
          {GUEST_TURNS} messages, and one map
        </h2>
        <p className="l5-guestwall-d" id="l5-guestwall-d">
          That&rsquo;s what Socria gives a guest. Sign up free to keep going &mdash; your conversation and its map come with you.
        </p>
        <div className="l5-guestwall-acts">
          <a ref={primary} className="l5-guestwall-go" href={signUpHref}>
            Sign up free
          </a>
          {/* Out of messages, "Keep going with this one" promised what the next
              send took back — it reopened this. The way out says what it does. */}
          <button type="button" className="l5-guestwall-stay" onClick={onClose}>
            {spent ? 'Not now' : 'Keep going with this one'}
          </button>
        </div>
        <p className="l5-guestwall-in">
          Have an account? <a href={signInHref}>Sign in</a>
        </p>
      </div>
    </div>
  );
}

/**
 * A GUEST USING SOCRIA A LOT: a small card at the bottom centre, once a tab,
 * after a few messages (LogosApp shows it from GUEST_NUDGE_AT). What an
 * account adds, said truthfully — more messages and maps, and replies that
 * build on what Socria remembers about you — with Sign up free and a close.
 */
export function GuestNudge({
  open,
  inline = false,
  spent = false,
  signUpHref,
  onClose,
}: {
  open: boolean;
  /** in the conversation's own dock, above the box, in its flow — covering nothing; otherwise floating, lifted clear of the box */
  inline?: boolean;
  /** the guest's messages are used up: said plainly, for as long as it is true, with no close */
  spent?: boolean;
  signUpHref: string;
  onClose: () => void;
}) {
  const lift = useComposerLift(open && !inline);
  if (!open) return null;
  return (
    <div className={`l5-guestnudge${inline ? ' is-inline' : ''}`} role="status" aria-live="polite" style={inline || lift === null ? undefined : { bottom: lift }}>
      <span className="l5-guestnudge-spark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5" />
        </svg>
      </span>
      <span className="l5-guestnudge-t">
        {spent ? (
          <>
            <b>You&rsquo;ve used your {GUEST_TURNS} free messages.</b> Sign up free to keep going &mdash; this conversation and its map come with you.
          </>
        ) : (
          <>
            <b>Enjoying Socria?</b> Sign up free for better answers and more of it — keep going past {GUEST_TURNS} messages, as many maps as you like, and replies that remember you.
          </>
        )}
      </span>
      <a className="l5-guestnudge-go" href={signUpHref}>
        Sign up free
      </a>
      {!spent && (
        <button type="button" className="l5-guestnudge-x" onClick={onClose} aria-label="Not now">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * How far above the bottom of the screen the card must sit to clear the box
 * to write in — measured, never assumed. The box grows as somebody types, can
 * be moved to any side, and is taller on a phone, so a fixed offset put the
 * card over its top edge: a click meant for the box landed on the card, at the
 * moment the guest was most engaged. Null leaves the stylesheet's offset (no
 * box at the bottom of the screen to clear).
 */
function useComposerLift(open: boolean): number | null {
  const [lift, setLift] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const h = window.innerHeight;
      let top = Infinity;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('.logos-root .lg-composer'))) {
        const r = el.getBoundingClientRect();
        // only a box in the lower half of the screen is one the card could land on
        if (r.width > 0 && r.height > 0 && r.top > h / 2) top = Math.min(top, r.top);
      }
      const next = Number.isFinite(top) ? Math.round(h - top + 12) : null;
      setLift((was) => (was === next ? was : next));
    };
    place();
    // the box changes height as it is typed in, and moves when it is dragged:
    // checked again on resize, on the box's own resize, and every second while shown
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    document.querySelectorAll<HTMLElement>('.logos-root .lg-composer').forEach((el) => ro?.observe(el));
    window.addEventListener('resize', place);
    const tick = window.setInterval(place, 1000);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', place);
      window.clearInterval(tick);
    };
  }, [open]);
  return lift;
}
