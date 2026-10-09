'use client';
// components/rewards/RewardsPopups.tsx
//
// THE TWO SOCRIA REWARDS POPUPS, each with a picture of what it offers:
//
//   Give 7. Get 7.          two gifts, one going each way, and the link to send
//   The 5-Node Challenge    a small map lit as far as their best map has come
//
// and, on Core, the moment the challenge is complete.
//
// Mounted once per surface by the page. It opens three ways:
//
//   • the person presses a mark beside the Socria mark (RewardsBadges) —
//     always, at once, never rationed;
//   • the challenge is complete in the answer just received (Core only:
//     Logos says so with its own chip, ChallengeChip) — once per browser;
//   • they arrive: at most once a visit, never into a room something else is
//     already speaking in, and rarely — lib/rewards/popup-rule.ts decides.
//
// Every number on it is the server's answer (useRewards). Nothing here counts
// nodes, grants days or stacks them: that rewards stack end to end, up to the
// bank cap, is promo-engine.ts's rule 2 and 3, and the popups only say so.
// No countdowns, no streaks, no "only today" — the same as everywhere else
// Socria Rewards appears.

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { track } from '@/lib/analytics';
import {
  POPUP_RULES,
  pickPopup,
  readPopupMemory,
  remember,
  writePopupMemory,
  type PopupFacts,
  type PopupKind,
} from '@/lib/rewards/popup-rule';
import { OPEN_REWARDS_POPUP, pentagon, rewardsSetupPending } from './RewardsBadges';
import { DONE_SEEN_KEY, readFlag, useRewards, writeFlag, type RewardsView } from './useRewards';
import './rewards-pop.css';

/** This browser's memory of the popups (lib/rewards/popup-rule.ts). Swept with everything else on sign-out. */
export const POPUP_MEMORY_KEY = 'socria.rewards.popup.v1';
/** This visit: set once a popup has opened by itself, so a second never does. */
export const POPUP_VISIT_KEY = 'socria.rewards.popup.visit.v1';

type Shown = PopupKind | 'done';
type Trigger = 'visit' | 'icon' | 'earned';

function visitSpoken(): boolean {
  try {
    return sessionStorage.getItem(POPUP_VISIT_KEY) === '1';
  } catch {
    // no way to remember the visit: never open by itself, or it would open on every page
    return true;
  }
}
function markVisit(): void {
  try {
    sessionStorage.setItem(POPUP_VISIT_KEY, '1');
  } catch {}
}
/** Something else already holds the screen: a sheet, a prompt, the tour. */
function screenTaken(): boolean {
  return !!document.querySelector('[aria-modal="true"], .tour-layer');
}

export function factsOf(view: RewardsView | null): PopupFacts {
  return {
    enabled: !!view?.enabled && !view.unavailable,
    give: !!view?.link,
    challenge: view?.challenge?.state === 'open',
  };
}

export function RewardsPopups({
  enabled,
  quiet,
  surface,
  onOpenLogos,
}: {
  /** signed in */
  enabled: boolean;
  /** nothing else is speaking: no tour, no onboarding exchange, no sheet or prompt — the page decides */
  quiet: boolean;
  surface: 'core' | 'logos';
  /** the challenge's way in, from a surface that is not Logos */
  onOpenLogos?: () => void;
}) {
  const { view } = useRewards({ enabled });
  const [open, setOpen] = useState<{ kind: Shown; trigger: Trigger } | null>(null);
  const back = useRef<HTMLElement | null>(null);
  const earned = useRef(false);

  // pressed: a mark beside the Socria mark asked
  useEffect(() => {
    const on = (e: Event) => {
      const kind = (e as CustomEvent<{ kind?: unknown }>).detail?.kind;
      if (kind !== 'give' && kind !== 'challenge') return;
      back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen({ kind, trigger: 'icon' });
      track('rewards_popup_viewed', { kind, trigger: 'icon', surface });
    };
    window.addEventListener(OPEN_REWARDS_POPUP, on);
    return () => window.removeEventListener(OPEN_REWARDS_POPUP, on);
  }, [surface]);

  // earned, on Core: the answer that granted it is the one that says justNow
  const c = view?.enabled ? view.challenge : undefined;
  if (surface === 'core' && c?.state === 'done' && c.justNow && readFlag(DONE_SEEN_KEY) !== '1') earned.current = true;

  // by itself: on arrival, into a quiet room, rarely
  useEffect(() => {
    if (!view?.enabled || !quiet || open) return;
    const t = setTimeout(() => {
      if (screenTaken()) return;
      if (earned.current) {
        earned.current = false;
        writeFlag(DONE_SEEN_KEY, '1');
        setOpen({ kind: 'done', trigger: 'earned' });
        return;
      }
      if (visitSpoken()) return;
      // decided once a visit, on arrival — not again an hour into it when a gap has run out
      markVisit();
      const now = Date.now();
      const memory = readPopupMemory(readFlag(POPUP_MEMORY_KEY));
      const kind = pickPopup(factsOf(view), memory, now);
      if (!kind) return;
      writeFlag(POPUP_MEMORY_KEY, writePopupMemory(remember(memory, kind, 'shown', now)));
      back.current = null;
      setOpen({ kind, trigger: 'visit' });
      track('rewards_popup_viewed', { kind, trigger: 'visit', surface });
    }, POPUP_RULES.settleMs);
    return () => clearTimeout(t);
  }, [view, quiet, open, surface]);

  /** They did what it asked — copied the link, went to make the map: that one rests longest. */
  const act = useCallback(() => {
    if (!open || open.kind === 'done') return;
    const memory = readPopupMemory(readFlag(POPUP_MEMORY_KEY));
    writeFlag(POPUP_MEMORY_KEY, writePopupMemory(remember(memory, open.kind, 'acted', Date.now())));
  }, [open]);

  const close = useCallback(
    (how: 'closed' | 'not_now' | 'acted') => {
      if (!open) return;
      if (open.kind !== 'done') {
        if (how === 'acted') act();
        else track('rewards_popup_dismissed', { kind: open.kind, trigger: open.trigger, surface, outcome: how });
        if (how === 'not_now') {
          const memory = readPopupMemory(readFlag(POPUP_MEMORY_KEY));
          writeFlag(POPUP_MEMORY_KEY, writePopupMemory(remember(memory, open.kind, 'notNow', Date.now())));
        }
      }
      setOpen(null);
      const to = back.current;
      back.current = null;
      if (to?.isConnected) to.focus();
    },
    [open, surface, act]
  );

  // switched on and not yet set up here (RewardsBadges rewardsSetupPending):
  // the gift's popup says what is missing rather than nothing happening
  const setup = rewardsSetupPending(view);
  // a popup whose reward stopped meaning anything while it was open goes
  const stale =
    !!open &&
    !(setup && open.kind === 'give') &&
    (!view?.enabled ||
      (open.kind === 'give' && !view.link) ||
      (open.kind === 'challenge' && c?.state !== 'open' && c?.state !== 'done'));
  useEffect(() => {
    if (stale) setOpen(null);
  }, [stale]);

  if (open && setup && open.kind === 'give') return <SetupPending onClose={() => close('closed')} />;
  if (!open || !view?.enabled || stale) return null;
  // the challenge, completed while its popup was open, is shown complete
  const kind: Shown = open.kind === 'challenge' && c?.state === 'done' ? 'done' : open.kind;
  return <Popup kind={kind} view={view} onClose={close} onAct={act} onOpenLogos={onOpenLogos} surface={surface} />;
}

/** Give 7, Get 7 on a deployment whose Rewards tables do not exist yet: what it is, and what it needs. */
function SetupPending({ onClose }: { onClose: () => void }) {
  const id = useId().replace(/:/g, '');
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    goRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="rwp-scrim" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`}>
      <div className="rwp-back" onClick={onClose} aria-hidden="true" />
      <div className="rwp-sheet is-give">
        <button type="button" className="rwp-x" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <p className="rwp-eyebrow">Socria Rewards · Give 7, Get 7</p>
        <h2 className="rwp-title" id={`${id}-t`}>
          Not set up on this deployment <em>yet</em>
        </h2>
        <p className="rwp-body" id={`${id}-b`}>
          Rewards is switched on here, but its tables are not in this database, so there is no invite link to give. Run the Socria Rewards
          block of <code>supabase/schema.sql</code> on this database and the link appears in this popup.
        </p>
        <div className="rwp-acts">
          <button type="button" ref={goRef} className="rwp-go" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function Popup({
  kind,
  view,
  onClose,
  onAct,
  onOpenLogos,
  surface,
}: {
  kind: Shown;
  view: RewardsView;
  onClose: (how: 'closed' | 'not_now' | 'acted') => void;
  onAct: () => void;
  onOpenLogos?: () => void;
  surface: 'core' | 'logos';
}) {
  const id = useId().replace(/:/g, '');
  const goRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose('closed');
    };
    window.addEventListener('keydown', onKey);
    goRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const limits = {
    challenge: view.limits?.challengeDays ?? 7,
    give: view.limits?.signupDays ?? 7,
    get: view.limits?.activationDays ?? 7,
    cap: view.limits?.bankCapDays ?? 30,
  };

  return (
    <div className="rwp-scrim" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`}>
      <div className="rwp-back" onClick={() => onClose('closed')} aria-hidden="true" />
      <div className={`rwp-sheet is-${kind}`}>
        <button type="button" className="rwp-x" onClick={() => onClose('closed')} aria-label="Close">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        {kind === 'give' ? (
          <Give view={view} limits={limits} id={id} goRef={goRef} onClose={onClose} onAct={onAct} />
        ) : kind === 'challenge' ? (
          <Challenge view={view} limits={limits} id={id} goRef={goRef} onClose={onClose} onOpenLogos={onOpenLogos} surface={surface} />
        ) : (
          <Done view={view} limits={limits} id={id} goRef={goRef} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

type Limits = { challenge: number; give: number; get: number; cap: number };
type PartProps = {
  view: RewardsView;
  limits: Limits;
  id: string;
  goRef: RefObject<HTMLButtonElement>;
  onClose: (how: 'closed' | 'not_now' | 'acted') => void;
};

const word = (n: number) => (['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n));

// ── Give 7, Get 7 ────────────────────────────────────────────────────

function Give({ view, limits, id, goRef, onClose, onAct }: PartProps & { onAct: () => void }) {
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const r = view.referral;
  const capped = !!r && r.monthlyCap > 0 && r.rewardedThisMonth >= r.monthlyCap;
  const member = view.challenge?.state === 'member';
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(view.link!);
      ok = true;
    } catch {
      // not a secure context, or no permission: the field is selected, so the person can copy it
      field.current?.select();
      try {
        ok = document.execCommand('copy');
      } catch {}
    }
    if (ok) {
      // it stays open, saying so: closing on the click would take the word away before it is read
      setCopied(true);
      onAct();
      track('rewards_referral_link_copied', { surface: 'popup' });
      setTimeout(() => setCopied(false), 2200);
    }
  };
  return (
    <>
      <GiveVisual give={limits.give} get={limits.get} />
      <p className="rwp-eyebrow">Socria Rewards</p>
      <h2 id={`${id}-t`} className="rwp-title">
        Give <em>{limits.give}</em>. Get <em>{limits.get}</em>.
      </h2>
      <p id={`${id}-b`} className="rwp-body">
        Give your friends {word(limits.give)} days of Socria One. Earn {word(limits.get)} days when they start using Socria.
      </p>
      <div className="rwp-link">
        <input
          ref={field}
          readOnly
          value={view.link}
          aria-label="Your referral link"
          onFocus={(e) => e.currentTarget.select()}
          spellCheck={false}
        />
        <button ref={goRef} type="button" className="rwp-go" onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <Stack limits={limits} member={member} />
      <p className="rwp-fine">
        {capped
          ? `You’ve had this month’s ${r!.monthlyCap} rewards — friends still get their ${limits.give} days.`
          : `A friend counts once they’ve had two real conversations with Socria. Up to ${r?.monthlyCap ?? 4} rewarded a month.`}
        {member ? ' As a member, your days wait and begin when your membership ends. Your subscription is never changed.' : ''}
      </p>
      <div className="rwp-acts">
        <button type="button" className="rwp-not" onClick={() => onClose('not_now')}>
          Not now
        </button>
      </div>
    </>
  );
}

// ── the 5-Node Challenge ─────────────────────────────────────────────

function Challenge({ view, limits, id, goRef, onClose, onOpenLogos, surface }: PartProps & { onOpenLogos?: () => void; surface: 'core' | 'logos' }) {
  const c = view.challenge;
  if (c?.state !== 'open') return null;
  return (
    <>
      <ChallengeVisual n={c.progress} of={c.target} days={limits.challenge} />
      <p className="rwp-eyebrow">The 5-Node Challenge</p>
      <h2 id={`${id}-t`} className="rwp-title">
        Map <em>{c.target}</em> ideas. Get <em>{limits.challenge}</em> days.
      </h2>
      <p id={`${id}-b`} className="rwp-body">
        Create a {c.target}-node mind map. Get {limits.challenge} days of Socria One free.
      </p>
      <div
        className="rwp-meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={c.target}
        aria-valuenow={c.progress}
        aria-label="5-Node Challenge progress"
      >
        <span className="rwp-meter-bar">
          <i style={{ width: `${(100 * c.progress) / Math.max(1, c.target)}%` }} />
        </span>
        <span className="rwp-meter-n">
          Progress: {c.progress}/{c.target} nodes
        </span>
      </div>
      <p className="rwp-note">
        {c.needsOwnWords
          ? 'Your map is there — add a sentence of your own to that conversation. A starting card sent as it is doesn’t count as your words.'
          : 'Think something through in Logos. Five connected ideas from what you say is all it takes — no card needed, nothing to share.'}
      </p>
      <Stack limits={limits} member={false} />
      <div className="rwp-acts">
        <button type="button" className="rwp-not" onClick={() => onClose('not_now')}>
          Not now
        </button>
        {surface === 'core' && onOpenLogos ? (
          <button
            ref={goRef}
            type="button"
            className="rwp-go"
            onClick={() => {
              onClose('acted');
              onOpenLogos();
            }}
          >
            Start a map in Logos <span aria-hidden="true">→</span>
          </button>
        ) : (
          <button ref={goRef} type="button" className="rwp-go" onClick={() => onClose('acted')}>
            Back to my map <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </>
  );
}

// ── complete ─────────────────────────────────────────────────────────

function Done({ view, limits, id, goRef, onClose }: PartProps) {
  const c = view.challenge;
  const banked = c?.state === 'done' && c.outcome === 'banked';
  const target = c && 'target' in c ? c.target : 5;
  return (
    <>
      <ChallengeVisual n={target} of={target} days={limits.challenge} done />
      <p className="rwp-eyebrow">The 5-Node Challenge</p>
      <h2 id={`${id}-t`} className="rwp-title">Challenge complete.</h2>
      <p id={`${id}-b`} className="rwp-body">
        {banked
          ? `Your ${limits.challenge} days of Socria One are saved, and start when your membership ends.`
          : `You've unlocked ${limits.challenge} days of Socria One.`}
      </p>
      <Stack limits={limits} member={banked} after />
      <div className="rwp-acts">
        <button ref={goRef} type="button" className="rwp-go" onClick={() => onClose('acted')}>
          Start Exploring Socria One
        </button>
      </div>
    </>
  );
}

// ── rewards stack: the challenge's days, then a friend's, end to end ─

function Stack({ limits, member, after }: { limits: Limits; member: boolean; after?: boolean }) {
  const a = limits.challenge;
  const b = limits.get;
  const said = after
    ? `Invite a friend and their ${b} days for you join the end of these — rewards stack, up to ${limits.cap} days waiting at once.`
    : member
      ? `Every friend who starts using Socria adds ${b} more days to the end — up to ${limits.cap} days waiting at once.`
      : `Do both and they stack: ${a} + ${b} = ${a + b} days of Socria One, one after the other — up to ${limits.cap} days waiting at once.`;
  return (
    <div className="rwp-stack">
      <span className="rwp-stack-cells" aria-hidden="true">
        {Array.from({ length: a }, (_, i) => (
          <i key={`a${i}`} className="a" style={{ '--i': i } as CSSProperties} />
        ))}
        <b>+</b>
        {Array.from({ length: b }, (_, i) => (
          <i key={`b${i}`} className="b" style={{ '--i': a + i } as CSSProperties} />
        ))}
      </span>
      <span className="rwp-stack-t">{said}</span>
    </div>
  );
}

// ── the pictures ─────────────────────────────────────────────────────

function Gift({ x, y, s = 1, id, late }: { x: number; y: number; s?: number; id: string; late?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={`rwp-gift${late ? ' late' : ''}`}>
      <ellipse cx="0" cy="25" rx="26" ry="4" className="rwp-shadow" />
      <rect x="-21" y="-2" width="42" height="27" rx="3" fill={`url(#${id}-gold)`} />
      <rect x="-3" y="-2" width="6" height="27" className="rwp-ribbon" />
      <g className="rwp-lid">
        <rect x="-24" y="-12" width="48" height="11" rx="2.5" fill={`url(#${id}-gold)`} />
        <rect x="-3" y="-12" width="6" height="11" className="rwp-ribbon" />
        <path d="M0-12c-4-8-13-10-14.5-5.2C-16-12.6-7.6-11.6 0-12Zm0 0c4-8 13-10 14.5-5.2C16-12.6 7.6-11.6 0-12Z" className="rwp-bow" />
      </g>
      </g>
    </g>
  );
}

function Sparkles({ at }: { at: [number, number, number][] }) {
  return (
    <g className="rwp-sparks">
      {at.map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <path
            d="M0-6C.7-1.6 1.6-.7 6 0 1.6.7.7 1.6 0 6-.7 1.6-1.6.7-6 0-1.6-.7-.7-1.6 0-6Z"
            style={{ '--d': `${(i * 0.37) % 2.2}s` } as CSSProperties}
          />
        </g>
      ))}
    </g>
  );
}

function GiveVisual({ give, get }: { give: number; get: number }) {
  const id = useId().replace(/:/g, '');
  // over the top, your gift goes out; along the bottom, theirs comes back
  const out = 'M108 64C140 22 180 22 212 64';
  const home = 'M212 100C180 136 140 136 108 100';
  return (
    <svg className="rwp-visual" viewBox="0 0 320 146" role="img" aria-label={`A gift of ${give} days going to a friend, and ${get} days coming back to you`}>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBE7A6" />
          <stop offset="0.5" stopColor="#E6B24C" />
          <stop offset="1" stopColor="#C47A2C" />
        </linearGradient>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0" stopColor="#F7DF94" stopOpacity="0.5" />
          <stop offset="1" stopColor="#F7DF94" stopOpacity="0" />
        </radialGradient>
        <path id={`${id}-out`} d={out} />
        <path id={`${id}-home`} d={home} />
      </defs>
      <circle cx="74" cy="84" r="54" fill={`url(#${id}-halo)`} className="rwp-halo" />
      <circle cx="246" cy="84" r="54" fill={`url(#${id}-halo)`} className="rwp-halo h2" />
      <path d={out} className="rwp-arc" />
      <path d={home} className="rwp-arc b" />
      <g className="rwp-mover">
        {[0, 0.8, 1.6].map((b) => (
          <circle key={`o${b}`} r="3.2" className="rwp-mote">
            <animateMotion dur="2.4s" begin={`${b}s`} repeatCount="indefinite">
              <mpath href={`#${id}-out`} />
            </animateMotion>
          </circle>
        ))}
        {[0.4, 1.2, 2].map((b) => (
          <circle key={`h${b}`} r="3.2" className="rwp-mote b">
            <animateMotion dur="2.4s" begin={`${b}s`} repeatCount="indefinite">
              <mpath href={`#${id}-home`} />
            </animateMotion>
          </circle>
        ))}
      </g>
      <Gift x={74} y={84} s={1.22} id={id} />
      <Gift x={246} y={84} s={1.22} id={id} late />
      {/* what each of them gets: the friend's from you, yours when they start */}
      <text x="246" y="40" className="rwp-plus">+{give}</text>
      <text x="74" y="40" className="rwp-plus b">+{get}</text>
      <text x="74" y="136" className="rwp-cap">you</text>
      <text x="246" y="136" className="rwp-cap">a friend</text>
      <Sparkles at={[[26, 22, 0.9], [128, 52, 0.6], [194, 50, 0.7], [298, 24, 1], [300, 112, 0.6], [22, 116, 0.7], [160, 84, 0.8]]} />
    </svg>
  );
}

function ChallengeVisual({ n, of, days, done }: { n: number; of: number; days: number; done?: boolean }) {
  const id = useId().replace(/:/g, '');
  // a small map: one idea, four from it, one link across — five connected nodes
  const at = [
    { x: 150, y: 30 },
    { x: 66, y: 66 },
    { x: 234, y: 66 },
    { x: 100, y: 110 },
    { x: 200, y: 110 },
  ];
  const links: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 4],
    [3, 4],
  ];
  const lit = Math.max(0, Math.min(5, Math.round((5 * n) / Math.max(1, of))));
  const seal = pentagon(0, 0, 21);
  return (
    <svg
      className={`rwp-visual rwp-map${done ? ' is-done' : ''}`}
      viewBox="0 0 320 140"
      role="img"
      aria-label={done ? 'A five-node map, every node lit' : `A five-node map with ${lit} of 5 nodes lit`}
    >
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBE7A6" />
          <stop offset="0.5" stopColor="#E6B24C" />
          <stop offset="1" stopColor="#C47A2C" />
        </linearGradient>
      </defs>
      {links.map(([a, b], i) => (
        <line
          key={i}
          x1={at[a].x}
          y1={at[a].y}
          x2={at[b].x}
          y2={at[b].y}
          pathLength={1}
          className={a < lit && b < lit ? 'rwp-edge on' : 'rwp-edge'}
          style={{ '--i': i } as CSSProperties}
        />
      ))}
      {at.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y})`}>
          <g className={i < lit ? 'rwp-node on' : i === lit ? 'rwp-node next' : 'rwp-node'} style={{ '--i': i } as CSSProperties}>
            <rect x="-30" y="-11" width="60" height="22" rx="7" className="rwp-node-card" />
            {i < lit && (
              <>
                <rect x="-20" y="-4.5" width={i === 0 ? 40 : 28 + ((i * 7) % 12)} height="3" rx="1.5" className="rwp-node-line" />
                <rect x="-20" y="1.5" width={i === 0 ? 26 : 16 + ((i * 5) % 10)} height="3" rx="1.5" className="rwp-node-line dim" />
              </>
            )}
          </g>
        </g>
      ))}
      <g transform="translate(286 30)">
        <polygon points={seal.map((p) => `${p.x},${p.y}`).join(' ')} className="rwp-seal-ghost" />
        <g className="rwp-seal">
          <circle r="17" fill={`url(#${id}-gold)`} />
          <circle r="13.5" className="rwp-seal-rule" />
          <text y="2" className="rwp-seal-n">{days}</text>
          <text y="10" className="rwp-seal-d">days</text>
        </g>
      </g>
      <Sparkles at={done ? [[30, 24, 1], [120, 18, 0.7], [182, 22, 0.8], [40, 120, 0.8], [270, 118, 1], [154, 132, 0.6], [304, 70, 0.7]] : [[256, 104, 0.6], [300, 62, 0.7], [24, 30, 0.6]]} />
    </svg>
  );
}
