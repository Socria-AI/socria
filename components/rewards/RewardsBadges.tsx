'use client';
// components/rewards/RewardsBadges.tsx
//
// Socria Rewards, beside the Socria mark at the top of the rail: two marks,
// small enough to sit in the gap after the wordmark, bright enough to be
// noticed there.
//
//   🎁  Give 7, Get 7         — while they have a link to give
//   ⬠  The 5-Node Challenge  — while it is open to them; its ring is their progress
//
// Pressing one opens its popup (RewardsPopups, mounted once per surface by
// the page) — that is the person asking, and it is never rationed. The marks
// themselves are the server's answer (useRewards): a challenge already done,
// or a member it cannot help, has no mark; rewards switched off, no marks.
//
// Motion is decoration and nothing else — a turning ring, a glint, a node
// that breathes — and all of it stops for anybody who has asked their system
// for less motion (rewards-pop.css).

import { useId } from 'react';
import type { PopupKind } from '@/lib/rewards/popup-rule';
import { useRewards } from './useRewards';
import './rewards-pop.css';

/** Asks the page's RewardsPopups to open one. */
export const OPEN_REWARDS_POPUP = 'socria:rewards-popup';

export function openRewardsPopup(kind: PopupKind): void {
  window.dispatchEvent(new CustomEvent<{ kind: PopupKind }>(OPEN_REWARDS_POPUP, { detail: { kind } }));
}

/** Five nodes round a pentagon, the first at the top. Shared with the popup's map. */
export function pentagon(cx: number, cy: number, r: number): { x: number; y: number }[] {
  return Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return { x: +(cx + r * Math.cos(a)).toFixed(2), y: +(cy + r * Math.sin(a)).toFixed(2) };
  });
}

function GiftGlyph({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="rwb-svg">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F7DF94" />
          <stop offset="0.55" stopColor="#E3AE45" />
          <stop offset="1" stopColor="#C9822F" />
        </linearGradient>
      </defs>
      <g className="rwb-lid">
        <path d="M12 8.2C10.6 5.3 7.6 4.6 7.1 6.3c-.45 1.55 2.2 1.95 4.9 1.9Z" fill={`url(#${id}-g)`} />
        <path d="M12 8.2c1.4-2.9 4.4-3.6 4.9-1.9.45 1.55-2.2 1.95-4.9 1.9Z" fill={`url(#${id}-g)`} />
        <rect x="3.6" y="8.1" width="16.8" height="4.1" rx="1.1" fill={`url(#${id}-g)`} />
        <rect x="11" y="8.1" width="2" height="4.1" className="rwb-ribbon" />
      </g>
      <rect x="5" y="12.6" width="14" height="8.4" rx="1.3" fill={`url(#${id}-g)`} />
      <rect x="11" y="12.6" width="2" height="8.4" className="rwb-ribbon" />
    </svg>
  );
}

function ChallengeGlyph({ n, of }: { n: number; of: number }) {
  const pts = pentagon(12, 12.5, 5.6);
  const lit = Math.max(0, Math.min(5, Math.round((5 * n) / Math.max(1, of))));
  const pct = Math.max(0, Math.min(100, (100 * n) / Math.max(1, of)));
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="rwb-svg">
      <circle cx="12" cy="12" r="10.6" className="rwb-track" />
      <circle cx="12" cy="12" r="10.6" className="rwb-glint" pathLength={100} strokeDasharray="7 93" />
      <circle
        cx="12"
        cy="12"
        r="10.6"
        className="rwb-arc"
        pathLength={100}
        strokeDasharray={`${pct} 100`}
        transform="rotate(-90 12 12)"
      />
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="rwb-links" />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i < lit ? 1.9 : 1.55}
          className={i < lit ? 'rwb-node on' : i === lit ? 'rwb-node next' : 'rwb-node'}
        />
      ))}
    </svg>
  );
}

export function RewardsBadges({ enabled }: { enabled: boolean }) {
  const { view } = useRewards({ enabled });
  const id = useId().replace(/:/g, '');
  if (!view?.enabled) return null;
  const c = view.challenge;
  const give = view.limits?.signupDays ?? 7;
  const get = view.limits?.activationDays ?? 7;
  const showGive = !!view.link;
  const open = c?.state === 'open' ? c : null;
  if (!showGive && !open) return null;
  return (
    <span className="rwb" role="group" aria-label="Socria Rewards">
      {showGive && (
        <button
          type="button"
          className="rwb-i rwb-give"
          onClick={() => openRewardsPopup('give')}
          aria-haspopup="dialog"
          aria-label={`Give ${give}, Get ${get}: invite a friend`}
          title={`Give ${give}, Get ${get}`}
        >
          <GiftGlyph id={id} />
          <i className="rwb-spark s1" aria-hidden="true" />
          <i className="rwb-spark s2" aria-hidden="true" />
        </button>
      )}
      {open && (
        <button
          type="button"
          className="rwb-i rwb-chal"
          onClick={() => openRewardsPopup('challenge')}
          aria-haspopup="dialog"
          aria-label={`The 5-Node Challenge: ${open.progress} of ${open.target} nodes`}
          title={`The 5-Node Challenge · ${open.progress}/${open.target}`}
        >
          <ChallengeGlyph n={open.progress} of={open.target} />
          <i className="rwb-spark s1" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
