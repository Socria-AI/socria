'use client';
// components/rewards/ChallengeChip.tsx
//
// The 5-Node Challenge, beside the work it is about.
//
//   The 5-Node Challenge
//   Create a 5-node mind map. Get 7 days of Socria One free.
//   Progress: 3/5 nodes
//
// A small pill in the Logos header, and nothing louder: it never opens by
// itself while the challenge is in progress, never counts down, never sends
// anything. Pressed, it says what the challenge is and how far along the
// person's best map is — a number the server read from their stored maps
// (useRewards), never one counted here. "Not now" puts it away for good on
// this browser; the account's Socria Rewards section still has it.
//
// Completing it is the one moment it speaks up: the card opens once to say
// so, quietly, and goes when they go back to thinking.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import {
  CHIP_HIDDEN_KEY,
  DONE_SEEN_KEY,
  STARTED_KEY,
  VIEWED_KEY,
  readFlag,
  useRewards,
  writeFlag,
  type RewardsView,
} from './useRewards';
import './rewards.css';

// measured before paint, so a card that would run off a narrow screen never flashes there
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const EDGE = 12;

function Dots({ n, of }: { n: number; of: number }) {
  return (
    <span className="rwc-dots" aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < n ? 'on' : undefined} />
      ))}
    </span>
  );
}

export function ChallengeChip({ enabled, onOpenAccount }: { enabled: boolean; onOpenAccount?: () => void }) {
  const { view } = useRewards({ enabled });
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [doneSeen, setDoneSeen] = useState(true);
  const [shift, setShift] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setHidden(readFlag(CHIP_HIDDEN_KEY) === 'hidden');
    setDoneSeen(readFlag(DONE_SEEN_KEY) === '1');
  }, []);

  const c = view?.enabled ? view.challenge : undefined;
  const target = c && 'target' in c ? c.target : 5;
  const days = view?.limits?.challengeDays ?? 7;
  const showOpen = c?.state === 'open' && !hidden;
  const showDone = c?.state === 'done' && !doneSeen;

  // first sight, and first progress — once per browser, shape only
  useEffect(() => {
    if (!showOpen) return;
    if (readFlag(VIEWED_KEY) !== '1') {
      writeFlag(VIEWED_KEY, '1');
      track('rewards_challenge_viewed', { surface: 'logos' });
    }
    if (c?.state === 'open' && c.progress > 0 && readFlag(STARTED_KEY) !== '1') {
      writeFlag(STARTED_KEY, '1');
      track('rewards_challenge_started', { surface: 'logos' });
    }
  }, [showOpen, c]);

  // completed: the one time it opens without being asked
  useEffect(() => {
    if (showDone) setOpen(true);
  }, [showDone]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The card hangs from the chip's left edge; where the chip sits near the right of a narrow
  // header, it slides left just enough to stay on screen — never past the left edge.
  useBeforePaint(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const place = () => {
      const chip = ref.current;
      const card = cardRef.current;
      if (!chip || !card) return;
      const left = chip.getBoundingClientRect().left;
      const over = left + card.offsetWidth - (document.documentElement.clientWidth - EDGE);
      setShift(over > 0 ? -Math.min(over, Math.max(0, left - EDGE)) : 0);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  function toAccount() {
    setOpen(false);
    onOpenAccount?.();
    // open where the section is, not at the top of the sheet
    setTimeout(() => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document.querySelector('.acct-sheet .rw')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }, 120);
  }

  function close() {
    setOpen(false);
    if (c?.state === 'done') {
      writeFlag(DONE_SEEN_KEY, '1');
      setDoneSeen(true);
    }
  }

  if (!c || (!showOpen && !showDone)) return null;

  return (
    <span className="rwc" ref={ref}>
      <button
        type="button"
        className={`rwc-chip${c.state === 'done' ? ' is-done' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpen(true))}
        title="The 5-Node Challenge"
      >
        {c.state === 'open' ? (
          <>
            <Dots n={c.progress} of={target} />
            <span className="rwc-chip-t">
              {c.progress}/{target}
            </span>
          </>
        ) : (
          <span className="rwc-chip-t">✓ {days} days</span>
        )}
      </button>
      {open && (
        <span
          className="rwc-card"
          role="dialog"
          aria-label="The 5-Node Challenge"
          ref={cardRef}
          style={shift ? { left: shift } : undefined}
        >
          {c.state === 'open' ? (
            <OpenCard
              c={c}
              days={days}
              onNotNow={() => {
                writeFlag(CHIP_HIDDEN_KEY, 'hidden');
                setHidden(true);
                setOpen(false);
              }}
              onOpenAccount={onOpenAccount ? toAccount : undefined}
            />
          ) : (
            <DoneCard view={view!} days={days} onGo={close} />
          )}
        </span>
      )}
    </span>
  );
}

function OpenCard({
  c,
  days,
  onNotNow,
  onOpenAccount,
}: {
  c: Extract<NonNullable<RewardsView['challenge']>, { state: 'open' }>;
  days: number;
  onNotNow: () => void;
  onOpenAccount?: () => void;
}) {
  return (
    <>
      <span className="rwc-k">The 5-Node Challenge</span>
      <span className="rwc-h">
        Create a {c.target}-node mind map. Get {days} days of Socria One free.
      </span>
      <span className="rwc-progress">
        <Dots n={c.progress} of={c.target} />
        <span>
          Progress: {c.progress}/{c.target} nodes
        </span>
      </span>
      <span className="rwc-note">
        {c.needsOwnWords
          ? 'Your map is there — add a sentence of your own to that conversation. A starting card sent as it is doesn’t count as your words.'
          : 'Think something through here. Five connected ideas from what you say is all it takes — no card needed, nothing to share.'}
      </span>
      <span className="rwc-acts">
        {onOpenAccount && (
          <button type="button" className="rwc-link" onClick={onOpenAccount}>
            Socria Rewards
          </button>
        )}
        <button type="button" className="rwc-quiet" onClick={onNotNow}>
          Not now
        </button>
      </span>
    </>
  );
}

function DoneCard({ view, days, onGo }: { view: RewardsView; days: number; onGo: () => void }) {
  const banked = view.challenge?.state === 'done' && view.challenge.outcome === 'banked';
  return (
    <>
      <span className="rwc-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      </span>
      <span className="rwc-h rwc-h-done">Challenge Complete!</span>
      <span className="rwc-note">
        {banked
          ? `Your ${days} days of Socria One are saved, and start when your membership ends.`
          : `You've unlocked ${days} days of Socria One.`}
      </span>
      <span className="rwc-acts">
        <button type="button" className="rwc-go" onClick={onGo}>
          Start Exploring Socria One
        </button>
      </span>
    </>
  );
}
