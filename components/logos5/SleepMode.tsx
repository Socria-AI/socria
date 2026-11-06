'use client';
// components/logos5/SleepMode.tsx — SOCRIA, RESTING (lib/sleep.ts).
//
// A free account has a week of tokens, and when they are spent Socria sleeps
// until the reset — Monday 00:00 UTC. Three pieces, all calm:
//
//   SleepScreen  said once, when it happens (and again only if they try to send):
//                a moon, "Socria is resting", what still works, when it wakes —
//                in UTC and in their own time — and, offered, never pressed,
//                Socria One, which has no weekly limit. "Keep exploring"
//                closes it.
//   SleepBar     while it lasts, one line over the conversation box: resting
//                until Monday 00:00 UTC, in how long. The box still takes their
//                words — they can draft, and sending waits — and everything
//                else in Logos 5 works as before: conversations, Logic Maps,
//                artifacts, writing, Files, by hand.
//   SleepRing    the week at a glance beside the box's tools: a circle that fills
//                as the week's tokens are spent; hover or press it for what is
//                left and when it resets.
//
// useSleepWatch hears a 429 Sleep reply from ANY route (the map, a reading, the
// study tools), so every surface agrees without each one being taught.

import { useEffect, useRef, useState } from 'react';
import { RESET_WORDS, WEEK_MS, allowanceLine, formatTokens, leftLine, localReset, wakesIn, type SleepState } from '@/lib/sleep';
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
                const s: SleepState = {
                  asleep: true,
                  used: Number(b.used) || 0,
                  limit: Number(b.limit) || 0,
                  left: 0,
                  weekStart: typeof b.weekStart === 'number' ? b.weekStart : b.resetAt - WEEK_MS,
                  resetAt: b.resetAt,
                };
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

/** When Socria wakes — how long, and the moment in their own time — and a call when the reset comes. */
function useWake(sleep: SleepState | null, onWake: () => void, timeZone?: string) {
  const now = useNow(!!sleep);
  const left = sleep ? sleep.resetAt - now : 0;
  // the reset already answered, so each week's is answered once
  const woke = useRef<number | null>(null);
  useEffect(() => {
    if (!sleep) return;
    // the week is over: asleep, Socria wakes; awake, the count starts again — either way, read it afresh
    if (left <= 0 && woke.current !== sleep.resetAt) {
      woke.current = sleep.resetAt;
      onWake();
    }
  }, [sleep, left, onWake]);
  return { now, left, local: sleep ? localReset(sleep.resetAt, { timeZone }) : '' };
}

/** "Monday 00:00 UTC", with their own time beside it where they have one — each kept whole on a narrow screen. */
function ResetWithLocal({ local }: { local: string }) {
  return (
    <>
      <span className="sl-keep">{RESET_WORDS}</span>
      {local && (
        <>
          {' · '}
          <span className="sl-keep">{local} your time</span>
        </>
      )}
    </>
  );
}

export function SleepScreen({
  sleep,
  open,
  onClose,
  onUpgrade,
  onWake,
  timeZone,
}: {
  sleep: SleepState | null;
  open: boolean;
  onClose: () => void;
  /** offers Socria One; absent, it is not offered */
  onUpgrade?: () => void;
  onWake: () => void;
  /** the zone their own time is said in; the browser's when absent */
  timeZone?: string;
}) {
  const { left, local } = useWake(sleep, onWake, timeZone);
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
          You’ve used this week’s {formatTokens(sleep.limit)} free tokens. Everything you’ve made is still here — open any conversation, move your Logic Maps, edit your writing, keep drafting.
        </p>
        <p className="sl-when" aria-live="polite">
          <span className="sl-when-k">Wakes in</span>
          <span className="sl-when-v">{wakesIn(left)}</span>
          <span className="sl-when-at">
            <ResetWithLocal local={local} />
          </span>
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
        {onUpgrade && <p className="sl-one">Socria One has no weekly limit.</p>}
      </div>
    </div>
  );
}

export function SleepBar({ sleep, onOpen, onWake, timeZone }: { sleep: SleepState | null; onOpen: () => void; onWake: () => void; timeZone?: string }) {
  const { left, local } = useWake(sleep, onWake, timeZone);
  if (!sleep?.asleep) return null;
  return (
    <button
      type="button"
      className="sl-bar"
      onClick={onOpen}
      aria-label={`Socria is resting until ${RESET_WORDS}${local ? ` (${local} your time)` : ''}, in ${wakesIn(left)}. You can keep drafting; sending waits.`}
    >
      <Moon size={15} />
      <span className="sl-bar-t">Resting until {RESET_WORDS}</span>
      <span className="sl-bar-n">{wakesIn(left)}</span>
    </button>
  );
}

/**
 * THE WEEK'S TOKENS, AS A RING beside the box's tools — free accounts only. It fills clockwise as the
 * week's tokens are spent; filled solid, Socria is resting. Hover or press it for what is left and when
 * it resets; pressed while resting, it opens the Sleep screen.
 */
export function SleepRing({ sleep, onOpen, onWake, timeZone }: { sleep: SleepState | null; onOpen: () => void; onWake: () => void; timeZone?: string }) {
  const { now, left, local } = useWake(sleep, onWake, timeZone);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!shown) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setShown(false);
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [shown]);
  if (!sleep) return null;
  const share = sleep.asleep ? 1 : Math.max(0, Math.min(1, sleep.used / Math.max(1, sleep.limit)));
  const R = 6.5;
  const C = 2 * Math.PI * R;
  const said = sleep.asleep
    ? `Socria is resting. ${leftLine(sleep)}; wakes ${RESET_WORDS}, in ${wakesIn(left)}${local ? ` (${local} your time)` : ''}.`
    : `${allowanceLine(sleep, now)}${local ? ` — ${local} your time` : ''}.`;
  return (
    <span className="sl-ringwrap" ref={ref}>
      <button
        type="button"
        className={`sl-ring${sleep.asleep ? ' is-asleep' : ''}${share >= 0.8 && !sleep.asleep ? ' is-low' : ''}`}
        aria-label={said}
        aria-expanded={shown}
        title={said}
        onClick={() => (sleep.asleep ? onOpen() : setShown((v) => !v))}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r={R} className="sl-ring-track" />
          {sleep.asleep ? (
            <circle cx="8" cy="8" r={R} className="sl-ring-full" />
          ) : (
            share > 0 && <circle cx="8" cy="8" r={R} className="sl-ring-used" strokeDasharray={`${share * C} ${C}`} transform="rotate(-90 8 8)" />
          )}
        </svg>
      </button>
      {shown && !sleep.asleep && (
        <span className="sl-ringtip" role="status">
          <span className="sl-ringtip-t">This week’s tokens</span>
          <span className="sl-ringtip-b">{leftLine(sleep)}</span>
          <span className="sl-ringtip-r">
            Resets {RESET_WORDS} <span className="sl-keep">(in {wakesIn(left)})</span>
          </span>
          {local && <span className="sl-ringtip-l">{local} your time</span>}
        </span>
      )}
    </span>
  );
}
