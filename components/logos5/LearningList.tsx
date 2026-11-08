'use client';
// components/logos5/LearningList.tsx — WHAT YOU HAVE BEEN LEARNING, as the explanation engine keeps it.
//
// The ledger lives in this browser only (lib/logos5/learning.ts): a concept,
// when it last came up, and when it comes back for a quick recall. Shown here so
// the continuity Socria uses can be seen and corrected — read-only, with a
// Forget for each concept and for all of it. Nothing here is on the server.

import { useEffect, useState } from 'react';
import { INTERVAL_DAYS, type LedgerEntry } from '@/lib/runtime/explain';
import { clearLedger, forgetTopic, readLedger } from '@/lib/logos5/learning';

const DAY = 86_400_000;

function ago(at: number, now: number): string {
  const d = Math.floor((now - at) / DAY);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
}

function dueIn(e: LedgerEntry, now: number): string {
  const at = e.last + INTERVAL_DAYS[Math.min(e.box, INTERVAL_DAYS.length - 1)] * DAY;
  const d = Math.ceil((at - now) / DAY);
  if (d <= 0) return 'comes back next time it fits';
  if (d === 1) return 'comes back tomorrow';
  return `comes back in ${d} days`;
}

export function LearningList() {
  const [list, setList] = useState<LedgerEntry[] | null>(null);
  const [now] = useState(() => Date.now());
  useEffect(() => setList(readLedger()), []);
  if (!list) return null;
  return (
    <section className="l5mm-once l5mm-learn" aria-label="What you have been learning">
      <span className="l5mm-k">What you have been learning — kept in this browser only</span>
      {list.length ? (
        <>
          <ul className="l5mm-learn-list">
            {list.slice(0, 20).map((e) => (
              <li key={e.topic}>
                <span className="l5mm-learn-topic">{e.topic}</span>
                <span className="l5mm-learn-when">
                  last met {ago(e.met ?? e.last, now)} · {dueIn(e, now)}
                </span>
                <button type="button" className="l5mm-learn-forget" onClick={() => setList(forgetTopic(e.topic))} aria-label={`Forget ${e.topic}`}>
                  Forget
                </button>
              </li>
            ))}
          </ul>
          <p className="l5mm-fine">
            Socria uses this to bring a topic back for a quick recall at the right time, and to avoid an explanation that did not help before.{' '}
            <button
              type="button"
              className="l5mm-learn-forget"
              onClick={() => {
                clearLedger();
                setList([]);
              }}
            >
              Forget all
            </button>
          </p>
        </>
      ) : (
        <p className="l5mm-fine">Nothing yet. When you learn something with Socria, the topic is noted here so it can come back for a quick recall later.</p>
      )}
    </section>
  );
}
