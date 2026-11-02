'use client';
// components/logos5/L5Tips.tsx — WHEN TO SAY A TIP, OR NOW AND THEN A FEATURE.
//
// The rules are lib/logos5/tips.ts's; this is the clock and the memory. Every
// few seconds, while nothing else is on the screen and nothing is under way,
// it asks which card to show — a tip in someone's first fortnight, a feature
// at most once a visit and days apart — and shows it beside what it is about
// (L5Tip). A card counts as seen once it has been on screen a few seconds, or
// pressed; one that a view change took away early can come back later.
// Nothing here is stored but what was seen and when (in this browser; Manage
// Account's "Show hints again" clears the seen list).

import { useEffect, useRef, useState } from 'react';
import { readSeen, markSeen } from '@/lib/hints';
import { FEATURE_SETTLE_MS, TIP_LEDGER_KEY, parseLedger, pickTip, tipBody, type Tip, type TipAction, type TipContext } from '@/lib/logos5/tips';
import { LOGOS_TOUR_KEY } from '@/lib/tour';
import { L5Tip } from './L5Tip';

/** How often to look, and how long a card is on screen before it counts as seen. */
const LOOK_MS = 4000;
const SEEN_AFTER_MS = 4000;

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    s.getItem(TIP_LEDGER_KEY);
    return s;
  } catch {
    // a browser that keeps nothing would show every card every visit: none, then
    return null;
  }
}

function visible(selector: string): boolean {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth) return true;
  }
  return false;
}

export function L5Tips({
  ctx,
  quiet,
  hidden,
  onAction,
}: {
  /** where they are and what they can use; the map card and the keyboard are read here */
  ctx: Omit<TipContext, 'mapCard' | 'mac' | 'toured'>;
  /** something is under way (an answer arriving): no new card now */
  quiet: boolean;
  /** something else is on the screen (an onboarding, a sheet, a tour, AR Mode): no card at all */
  hidden: boolean;
  onAction: (a: TipAction) => void;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const visit = useRef({ tips: 0, features: 0 });
  const loadedAt = useRef(Date.now());
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  // look for one, now and then, while nothing else is going on
  useEffect(() => {
    if (tip || quiet || hidden) return;
    const look = () => {
      const store = storage();
      if (!store) return;
      const c: TipContext = { ...ctxRef.current, mapCard: visible('.lcv-card.is-map'), mac, toured: !!store.getItem(LOGOS_TOUR_KEY) };
      const now = Date.now();
      const pick = pickTip(c, { seen: readSeen(store), ...parseLedger(store.getItem(TIP_LEDGER_KEY)) }, now, visit.current);
      if (!pick || !visible(pick.anchor)) return;
      // a feature waits until the visit has settled — never the first thing anyone sees
      if (pick.kind === 'feature' && now - loadedAt.current < FEATURE_SETTLE_MS) return;
      const ledger = parseLedger(store.getItem(TIP_LEDGER_KEY));
      try {
        store.setItem(TIP_LEDGER_KEY, JSON.stringify(pick.kind === 'tip' ? { ...ledger, lastTipAt: now } : { ...ledger, lastFeatureAt: now }));
      } catch {}
      if (pick.kind === 'tip') visit.current.tips += 1;
      else visit.current.features += 1;
      setTip(pick);
    };
    const first = window.setTimeout(look, 1800);
    const every = window.setInterval(look, LOOK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [tip, quiet, hidden, mac]);

  // on screen a few seconds is seen: it is not shown again
  useEffect(() => {
    if (!tip || hidden) return;
    const t = window.setTimeout(() => {
      const s = storage();
      if (s) markSeen(s, tip.id);
    }, SEEN_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [tip, hidden]);

  // something else took the screen: the card steps aside
  useEffect(() => {
    if (hidden) setTip(null);
  }, [hidden]);

  if (!tip || hidden) return null;
  const done = () => {
    const s = storage();
    if (s) markSeen(s, tip.id);
    setTip(null);
  };
  return (
    <L5Tip
      key={tip.id}
      tip={tip}
      body={tipBody(tip, { mac })}
      onClose={done}
      onAction={
        tip.action
          ? () => {
              const a = tip.action!;
              done();
              onAction(a);
            }
          : undefined
      }
      onGone={() => setTip(null)}
    />
  );
}
