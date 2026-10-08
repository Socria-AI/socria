'use client';
// components/rewards/RewardsPanel.tsx
//
// SOCRIA REWARDS, in the account — where someone looks for it, never where
// they are thinking.
//
//   Create 5 nodes. Get 7 days free.
//   Invite a friend. Give 7 days. Get 7 days.
//
// Everything on it is the server's answer (useRewards): the challenge's
// progress from their stored maps, the link with their own code, how many
// friends have joined and become active, what each reward did. No streaks, no
// countdowns, no "only today". The one action it invites is copying a link.

import { useState } from 'react';
import { track } from '@/lib/analytics';
import { useRewards, type RewardsHistoryItem, type RewardsView } from './useRewards';
import './rewards.css';

const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dateOf = (ms: number | null | undefined) => (ms ? DATE.format(new Date(ms)) : '');

const SOURCE: Record<RewardsHistoryItem['source'], string> = {
  challenge: 'The 5-Node Challenge',
  referral_signup: 'Joined with a friend’s invitation',
  referral_activation: 'A friend started using Socria',
};

function statusOf(h: RewardsHistoryItem): string {
  switch (h.status) {
    case 'active':
      return h.endsAt ? `Active until ${dateOf(h.endsAt)}` : 'Active';
    case 'banked':
      return 'Saved for later';
    case 'expired':
      return 'Used';
    case 'capped':
      return 'Past this month’s limit';
    case 'bank_full':
      return 'Not added — 30 days already waiting';
    default:
      return 'Being added';
  }
}

export function RewardsPanel({ enabled }: { enabled: boolean }) {
  const { view } = useRewards({ enabled });
  if (!view || !view.enabled) return null;
  return (
    <div className="sec rw">
      <span className="lbl">Socria Rewards</span>
      <PromoLine view={view} />
      <Challenge view={view} />
      <Referral view={view} />
      <History items={view.history ?? []} />
    </div>
  );
}

function PromoLine({ view }: { view: RewardsView }) {
  const p = view.promo;
  if (!p) return null;
  if (p.active) {
    return (
      <p className="rw-promo">
        Socria One from Rewards · <strong>{p.daysLeft} {p.daysLeft === 1 ? 'day' : 'days'} left</strong>
        {p.until ? <span className="rw-dim"> · until {dateOf(p.until)}</span> : null}
        {p.bankedDays > 0 ? <span className="rw-dim"> · {p.bankedDays} more saved</span> : null}
      </p>
    );
  }
  if (p.bankedDays > 0) {
    return (
      <p className="rw-promo">
        <strong>{p.bankedDays} days</strong> of Socria One saved — they start when your membership ends, and
        never cut it short.
      </p>
    );
  }
  return null;
}

function Challenge({ view }: { view: RewardsView }) {
  const c = view.challenge;
  const days = view.limits?.challengeDays ?? 7;
  if (!c || c.state === 'off') return null;
  return (
    <div className="rw-block">
      <h4 className="rw-h">The 5-Node Challenge</h4>
      {c.state === 'member' ? (
        <p className="rw-p">You already have Socria One, so there is nothing to unlock here.</p>
      ) : c.state === 'done' ? (
        <p className="rw-p rw-done">
          <span className="rw-tick" aria-hidden="true">✓</span> Complete — {days} days of Socria One unlocked
          {c.at ? <span className="rw-dim"> on {dateOf(c.at)}</span> : null}.
        </p>
      ) : (
        <>
          <p className="rw-p">
            Create a {c.target}-node mind map. Get {days} days of Socria One free.
          </p>
          <div className="rw-progress" role="progressbar" aria-valuemin={0} aria-valuemax={c.target} aria-valuenow={c.progress} aria-label="5-Node Challenge progress">
            <span className="rw-bar">
              <i style={{ width: `${(100 * c.progress) / c.target}%` }} />
            </span>
            <span className="rw-n">
              Progress: {c.progress}/{c.target} nodes
            </span>
          </div>
          {c.needsOwnWords && (
            <p className="rw-hint">Add a sentence of your own to that conversation — a starting card sent as it is doesn’t count as your words.</p>
          )}
        </>
      )}
    </div>
  );
}

function Referral({ view }: { view: RewardsView }) {
  const r = view.referral;
  const [copied, setCopied] = useState(false);
  if (!r || !view.link) return null;
  const give = view.limits?.signupDays ?? 7;
  const get = view.limits?.activationDays ?? 7;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(view.link!);
    } catch {
      // the field is selectable either way
    }
    setCopied(true);
    track('rewards_referral_link_copied', { surface: 'account' });
    setTimeout(() => setCopied(false), 2200);
  };
  return (
    <div className="rw-block">
      <h4 className="rw-h">
        Give {give}. Get {get}.
      </h4>
      <p className="rw-p">
        Give your friends {give === 7 ? 'seven' : give} days of Socria One. Earn {get === 7 ? 'seven' : get} days when they start using Socria.
      </p>
      <div className="rw-link">
        <input readOnly value={view.link} aria-label="Your referral link" onFocus={(e) => e.currentTarget.select()} spellCheck={false} />
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="rw-stats">
        <span>
          Referrals: {r.rewardedThisMonth}/{r.monthlyCap} rewarded this month
        </span>
        <span>Earned: {r.earnedDays} days</span>
        {r.waiting > 0 && <span>{r.waiting === 1 ? 'One friend is' : `${r.waiting} friends are`} getting started</span>}
      </p>
      <p className="rw-fine">
        A friend counts once they’ve had two real conversations with Socria. Up to {r.monthlyCap} rewarded a month; up to {view.limits?.bankCapDays ?? 30} days can be waiting at once.
      </p>
    </div>
  );
}

function History({ items }: { items: RewardsHistoryItem[] }) {
  if (!items.length) return null;
  return (
    <details className="rw-history">
      <summary>Reward history</summary>
      <ul>
        {items.map((h, i) => (
          <li key={`${h.source}-${h.at}-${i}`}>
            <span className="rw-hs">{SOURCE[h.source]}</span>
            <span className="rw-hd">{h.days > 0 ? `${h.days} days` : '—'}</span>
            <span className="rw-hst">{statusOf(h)}</span>
            <span className="rw-ha">{dateOf(h.at)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
