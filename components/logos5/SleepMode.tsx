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
import { DAY_RESET_WORDS, TRIAL_ENDED_NOTE, dayOfLine, daysLeftLine, dayResetLine, endsAtWords, todayLine, type TrialState } from '@/lib/trial';
import { L5Close } from './L5Chrome';
import './sleep.css';

/** Something the server said is resting, with its state. */
export const SLEEP_EVENT = 'socria:sleep';
/** The server said the trial is over (a 402 with `trialEnded`). */
export const TRIAL_ENDED_EVENT = 'socria:trial-ended';

/** Hear the trial end from any route — the reply, the map, a reading — so every surface agrees at once. */
export function useTrialEndedWatch(onEnded: (body: { error?: string; reason?: string }) => void) {
  const cb = useRef(onEnded);
  cb.current = onEnded;
  useEffect(() => {
    const on = (e: Event) => cb.current(((e as CustomEvent).detail ?? {}) as { error?: string; reason?: string });
    window.addEventListener(TRIAL_ENDED_EVENT, on);
    return () => window.removeEventListener(TRIAL_ENDED_EVENT, on);
  }, []);
}

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
      // the trial over (lib/trial.ts): a 402 with `trialEnded` from any route
      if (res.status === 402) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (/\/api\//.test(url)) {
          res
            .clone()
            .json()
            .then((b) => {
              if (b?.trialEnded) window.dispatchEvent(new CustomEvent(TRIAL_ENDED_EVENT, { detail: b }));
            })
            .catch(() => {});
        }
      }
      if (res.status === 429) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (/\/api\//.test(url)) {
          res
            .clone()
            .json()
            .then((b) => {
              if (b?.sleep && typeof b.resetAt === 'number') {
                const day = b.period === 'day';
                const s: SleepState = {
                  asleep: true,
                  used: Number(b.used) || 0,
                  limit: Number(b.limit) || 0,
                  left: 0,
                  weekStart: typeof b.weekStart === 'number' ? b.weekStart : b.resetAt - (day ? 86_400_000 : WEEK_MS),
                  resetAt: b.resetAt,
                  ...(day ? { period: 'day' as const } : {}),
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

/** "7:00 pm" in their own time — or '' where theirs is UTC itself. */
function localClock(at: number, timeZone?: string): string {
  try {
    const f = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) });
    const zone = f.resolvedOptions().timeZone;
    if (!zone || /^(?:UTC|Etc\/UTC|Etc\/GMT|GMT|Etc\/Universal|Universal|Etc\/Zulu|Zulu)$/i.test(zone)) return '';
    return f.format(new Date(at));
  } catch {
    return '';
  }
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
  // the trial's day resets at 00:00 UTC: their own time is said as a clock time, not a weekday
  const local = sleep ? (sleep.period === 'day' ? localClock(sleep.resetAt, timeZone) : localReset(sleep.resetAt, { timeZone })) : '';
  return { now, left, local };
}

/** "Monday 00:00 UTC" (the trial's day: "00:00 UTC"), with their own time beside it where they have one — each kept whole on a narrow screen. */
function ResetWithLocal({ local, day = false }: { local: string; day?: boolean }) {
  return (
    <>
      <span className="sl-keep">{day ? DAY_RESET_WORDS : RESET_WORDS}</span>
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
  trial,
}: {
  sleep: SleepState | null;
  open: boolean;
  onClose: () => void;
  /** offers Socria One; absent, it is not offered */
  onUpgrade?: () => void;
  onWake: () => void;
  /** the zone their own time is said in; the browser's when absent */
  timeZone?: string;
  /** the trial, when the day counted is the trial's: "Day 3 of 7" */
  trial?: TrialState | null;
}) {
  const { left, local } = useWake(sleep, onWake, timeZone);
  const closeRef = useRef<HTMLButtonElement>(null);
  const day = sleep?.period === 'day';
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
        <L5Close label="Close" onClose={onClose} className="sl-x" />
        <div className="sl-moon">
          <Moon size={30} />
        </div>
        <h2 id="sl-t" className="sl-t">
          Socria is resting
        </h2>
        <p id="sl-b" className="sl-b">
          {day
            ? `You’ve used today’s ${formatTokens(sleep.limit)} trial tokens. Everything you’ve made is still here — open any conversation, move your Logic Maps, edit your writing, keep drafting.`
            : `You’ve used this week’s ${formatTokens(sleep.limit)} free tokens. Everything you’ve made is still here — open any conversation, move your Logic Maps, edit your writing, keep drafting.`}
        </p>
        <p className="sl-when" aria-live="polite">
          <span className="sl-when-k">Wakes in</span>
          <span className="sl-when-v">{wakesIn(left)}</span>
          <span className="sl-when-at">
            <ResetWithLocal local={local} day={day} />
          </span>
        </p>
        {day && trial?.status === 'active' && (
          <p className="sl-trial">
            {dayOfLine(trial)} of your trial · {daysLeftLine(trial).replace(' in your trial', '')}
          </p>
        )}
        {/* the controls standard: the one filled control is the button that buys One, in One's blue; staying is a word */}
        <div className="sl-acts">
          <button ref={closeRef} type="button" className="l5-btn is-quiet" onClick={onClose}>
            Keep exploring
          </button>
          {onUpgrade && (
            <button type="button" className="l5-btn is-primary is-one" onClick={onUpgrade}>
              {day ? 'Continue with Socria One' : 'Stay awake with Socria One'}
            </button>
          )}
        </div>
        {onUpgrade && <p className="sl-one">{day ? 'Socria One has no daily limit.' : 'Socria One has no weekly limit.'}</p>}
      </div>
    </div>
  );
}

export function SleepBar({ sleep, onOpen, onWake, timeZone }: { sleep: SleepState | null; onOpen: () => void; onWake: () => void; timeZone?: string }) {
  const { left, local } = useWake(sleep, onWake, timeZone);
  if (!sleep?.asleep) return null;
  const words = sleep.period === 'day' ? DAY_RESET_WORDS : RESET_WORDS;
  return (
    <button
      type="button"
      className="sl-bar"
      onClick={onOpen}
      aria-label={`Socria is resting until ${words}${local ? ` (${local} your time)` : ''}, in ${wakesIn(left)}. You can keep drafting; sending waits.`}
    >
      <Moon size={15} />
      <span className="sl-bar-t">Resting until {words}</span>
      <span className="sl-bar-n">{wakesIn(left)}</span>
    </button>
  );
}

/**
 * THE WEEK'S TOKENS, AS A RING beside the box's tools — free accounts only. It fills clockwise as the
 * week's tokens are spent; filled solid, Socria is resting. Hover or press it for what is left and when
 * it resets; pressed while resting, it opens the Sleep screen.
 */
export function SleepRing({ sleep, onOpen, onWake, timeZone, trial }: { sleep: SleepState | null; onOpen: () => void; onWake: () => void; timeZone?: string; trial?: TrialState | null }) {
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
  const day = sleep.period === 'day';
  const trialWords = day && trial?.status === 'active' ? ` ${dayOfLine(trial)} of your trial; ${daysLeftLine(trial).toLowerCase()}.` : '';
  const said = day
    ? sleep.asleep
      ? `Socria is resting. ${todayLine(sleep)}; wakes ${DAY_RESET_WORDS}, in ${wakesIn(left)}${local ? ` (${local} your time)` : ''}.${trialWords}`
      : `${todayLine(sleep)} · ${dayResetLine(sleep, now)}${local ? ` — ${local} your time` : ''}.${trialWords}`
    : sleep.asleep
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
          <span className="sl-ringtip-t">{day ? 'Today’s trial tokens' : 'This week’s tokens'}</span>
          <span className="sl-ringtip-b">{day ? todayLine(sleep) : leftLine(sleep)}</span>
          <span className="sl-ringtip-r">
            Resets {day ? DAY_RESET_WORDS : RESET_WORDS} <span className="sl-keep">(in {wakesIn(left)})</span>
          </span>
          {local && <span className="sl-ringtip-l">{local} your time</span>}
          {day && trial?.status === 'active' && (
            <span className="sl-ringtip-trial">
              {dayOfLine(trial)} · {daysLeftLine(trial)}
              {trial.endsAt ? <span className="sl-ringtip-l">Ends {endsAtWords(trial.endsAt, { timeZone })}</span> : null}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

// ── THE TRIAL OVER (lib/trial.ts) ────────────────────────────────────
//
// Said once, when it happens (and again only if they try to send), as a calm card: what has ended, that
// everything they made is still theirs to open, move and edit, and one way on — Socria One. While it
// lasts, one line over the conversation box says so, and the box still takes their words (they can
// draft; sending opens the card). Nothing else in Logos 5 changes: every conversation, Logic Map,
// artifact and document opens as before, and everything done by hand works.

export function TrialEndedScreen({ open, onClose, onUpgrade, note }: { open: boolean; onClose: () => void; onUpgrade: () => void; note?: string }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sl-scrim" role="dialog" aria-modal="true" aria-labelledby="tr-t" aria-describedby="tr-b">
      <div className="sl-back" onClick={onClose} aria-hidden="true" />
      <div className="sl-card tr-card">
        <L5Close label="Close" onClose={onClose} className="sl-x" />
        <span className="l5-label tr-k">Your trial</span>
        <h2 id="tr-t" className="sl-t">
          Seven days are up
        </h2>
        <p id="tr-b" className="sl-b">
          {note || TRIAL_ENDED_NOTE}
        </p>
        <ul className="tr-keep">
          <li>Every conversation, Logic Map and artifact stays open</li>
          <li>Move, write, rename, organise and export by hand</li>
          <li>Socria One picks up exactly where you left off</li>
        </ul>
        <div className="sl-acts">
          <button ref={closeRef} type="button" className="l5-btn is-quiet" onClick={onClose}>
            Keep browsing
          </button>
          <button type="button" className="l5-btn is-primary is-one" onClick={onUpgrade}>
            Continue with Socria One
          </button>
        </div>
      </div>
    </div>
  );
}

/** While the trial is over: one line over the conversation box. Pressed, the card. */
export function TrialEndedBar({ on, onOpen }: { on: boolean; onOpen: () => void }) {
  if (!on) return null;
  return (
    <button type="button" className="sl-bar tr-bar" onClick={onOpen} aria-label="Your trial has ended. New AI requests need Socria One; everything you made stays open.">
      <span className="sl-bar-t">Your trial has ended</span>
      <span className="sl-bar-n">Continue with Socria One</span>
    </button>
  );
}
