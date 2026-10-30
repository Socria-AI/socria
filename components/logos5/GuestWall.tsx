'use client';
// components/logos5/GuestWall.tsx — A GUEST'S ONE LINE OF THINKING, said once.
//
// Signed out, Logos 5 is open to anyone: one line of thinking and its map
// (lib/guest-pass.ts). Starting a second is where an account comes in, and
// this says so plainly — what the limit is, that signing up is free, and that
// the line of thinking they have comes with them (LogosApp carries it in on
// their first sign-in). No upsell, no countdown: keep going or sign up.

import { useEffect, useRef } from 'react';
import { GUEST_TURNS } from '@/lib/guest-limits';

export function GuestWall({ open, signUpHref, signInHref, onClose }: { open: boolean; signUpHref: string; signInHref: string; onClose: () => void }) {
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
          <button type="button" className="l5-guestwall-stay" onClick={onClose}>
            Keep going with this one
          </button>
        </div>
        <p className="l5-guestwall-in">
          Have an account? <a href={signInHref}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
