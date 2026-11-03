'use client';
// components/logos5/SleepMode.tsx — SOCRIA, RESTING (lib/sleep.ts).
//
// When a free account's day of thinking time is spent, Socria sleeps until the
// next reset. Two pieces, both calm:
//
//   SleepScreen  said once, when it happens (and again only if they try to send):
//                a moon, "Socria is resting", what still works, when it wakes,
//                and — offered, never pressed — Socria One, which has no daily
//                limit. "Keep exploring" closes it.
//   SleepBar     while it lasts, one line over the conversation box: resting
//                until a time, in how long. The box still takes their words —
//                they can draft — and everything else in Logos 5 works as before:
//                conversations, Logic Maps, artifacts, writing, by hand.
//
// useSleepWatch hears a 429 Sleep reply from ANY route (the map, a reading, the
// study tools), so every surface agrees without each one being taught.

import { useEffect, useRef, useState } from 'react';
import { wakeClock, wakesIn, type SleepState } from '@/lib/sleep';
import './sleep.css';

/** Something the server said is resting, with its state. */
export const SLEEP_EVENT = 'socria:sleep';

/**
 * Watch every same-origin API reply for Sleep Mode (a 429 with `sleep: true`)
 * and hand its state to `onSleep`. Installed once; the original fetch is
 * restored when the watcher goes.
 */
export function useSleepWatch(onSleep: (s: SleepState) => void) {
  const cb = useRef(onSleep);
  cb.current = onSleep;
  useEffect(() => {
    if (typeof window === 'undefined' || !window.fetch) return;
    const original = window.fetch;
    const watched: typeof fetch = async (input, init) => {
      const res = await original(input, init);
      if (res.status === 429) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (/\/api\//.test(url)) {
          res
            .clone()
            .json()
            .then((b) => {
              if (b?.sleep && typeof b.resetAt === 'number') {
                const s: SleepState = { asleep: true, used: Number(b.used) || 0, limit: Number(b.limit) || 0, left: 0, resetAt: b.resetAt };
                cb.current(s);
                window.dispatchEvent(new CustomEvent(SLEEP_EVENT, { detail: s }));
              }
            })
            .catch(() => {});
        }
      }
      return res;
    };
    window.fetch = watched;
    return () => {
      if (window.fetch === watched) window.fetch = original;
    };
  }, []);
}

/** The time now, ticking every `every` ms while `on`. */
function useNow(on: boolean, every = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(t);
  }, [on, every]);
  return now;
}

function Moon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22.5 20.5A9.5 9.5 0 0 1 11.5 7a9.5 9.5 0 1 0 11 13.5Z" />
      <path d="M23 7.5v3M21.5 9h3M26.5 13.5v2M25.5 14.5h2" strokeWidth="1.2" />
    </svg>
  );
}

/** When Socria wakes, in words and as a clock time; and a call when that moment comes. */
function useWake(sleep: SleepState | null, onWake: () => void) {
  const asleep = !!sleep?.asleep;
  const now = useNow(asleep);
  const left = sleep ? sleep.resetAt - now : 0;
  const woke = useRef(false);
  useEffect(() => {
    if (!asleep) {
      woke.current = false;
      return;
    }
    if (left <= 0 && !woke.current) {
      woke.current = true;
      onWake();
    }
  }, [asleep, left, onWake]);
  return { left, clock: sleep ? wakeClock(sleep.resetAt) : '' };
}

export function SleepScreen({
  sleep,
  open,
  onClose,
  onUpgrade,
  onWake,
}: {
  sleep: SleepState | null;
  open: boolean;
  onClose: () => void;
  /** offers Socria One; absent, it is not offered */
  onUpgrade?: () => void;
  onWake: () => void;
}) {
  const { left, clock } = useWake(sleep, onWake);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open || !sleep?.asleep) return null;
  return (
    <div className="sl-scrim" role="dialog" aria-modal="true" aria-labelledby="sl-t" aria-describedby="sl-b">
      <div className="sl-back" onClick={onClose} aria-hidden="true" />
      <div className="sl-card">
        <div className="sl-moon">
          <Moon size={30} />
        </div>
        <h2 id="sl-t" className="sl-t">
          Socria is resting
        </h2>
        <p id="sl-b" className="sl-b">
          You’ve used today’s free thinking time. Everything you’ve made is still here — open any conversation, move your Logic Maps, edit your writing.
        </p>
        <p className="sl-when" aria-live="polite">
          <span className="sl-when-k">Wakes in</span>
          <span className="sl-when-v">{wakesIn(left)}</span>
          {clock && <span className="sl-when-at">at {clock}</span>}
        </p>
        <div className="sl-acts">
          <button ref={closeRef} type="button" className="sl-btn" onClick={onClose}>
            Keep exploring
          </button>
          {onUpgrade && (
            <button type="button" className="sl-btn is-one" onClick={onUpgrade}>
              Stay awake with Socria One
            </button>
          )}
        </div>
        {onUpgrade && <p className="sl-one">Socria One has no daily limit.</p>}
      </div>
    </div>
  );
}

export function SleepBar({ sleep, onOpen, onWake }: { sleep: SleepState | null; onOpen: () => void; onWake: () => void }) {
  const { left, clock } = useWake(sleep, onWake);
  if (!sleep?.asleep) return null;
  return (
    <button type="button" className="sl-bar" onClick={onOpen} aria-label={`Socria is resting. Wakes in ${wakesIn(left)}${clock ? `, at ${clock}` : ''}.`}>
      <Moon size={15} />
      <span className="sl-bar-t">Resting{clock ? ` until ${clock}` : ''}</span>
      <span className="sl-bar-n">{wakesIn(left)}</span>
    </button>
  );
}
