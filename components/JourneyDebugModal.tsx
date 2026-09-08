'use client';

// What Socria remembers about you — the viewer, on every plan.
//
// This used to be a read-only page of the cross-conversation journey: the
// narrative, the open threads, the timeline. It now also shows the durable
// entries (lib/person-memory.ts) — the specific things Socria knows and
// carries into conversations — and, for the first time, lets a person forget
// one. Trust is not a paid feature: seeing what is held and removing it is
// free on every plan, the same principle that keeps Trace and Correction open
// at every tier.
//
// The register is editorial, not administrative. Headings say what a group
// IS to the person ("How you tend to reason"), never the extractor's word
// for it; an entry shows when it last came up, never how many times or how
// sure the model was; and the one sentence about the free tier appears only
// when there is something it is not carrying, says what One does, and has
// no number in it. A count beside a price is a meter, and this product does
// not run meters.

import { useEffect, useState } from 'react';
import type { UserUnderstanding } from '@/lib/socria-prompt';
import type { Plan } from '@/lib/socria-one';
import {
  dormantCount,
  groupByKind,
  visibleEntries,
  type EntryKind,
  type MemoryEntry,
} from '@/lib/person-memory';

function timeAgo(ts: number): string {
  if (!ts) return '';
  const d = Math.max(0, Math.round((Date.now() - ts) / 86400000));
  if (d === 0) return 'earlier today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  const m = Math.round(d / 30);
  return m <= 1 ? 'a month ago' : `${m} months ago`;
}

/**
 * What each group is called to the person. Insight folds into pattern: a
 * realisation about how you think is part of how you think, and a heading
 * for two items is a heading too many.
 */
const HEADING: Record<Exclude<EntryKind, 'insight'>, string> = {
  pattern: 'How you tend to reason',
  value: 'What you care about',
  constraint: 'What you’re working within',
  decision: 'What you’ve decided',
  preference: 'How you like to work',
  fact: 'About you',
};
const ORDER: Exclude<EntryKind, 'insight'>[] = [
  'pattern',
  'value',
  'constraint',
  'decision',
  'preference',
  'fact',
];

export function JourneyDebugModal({
  open,
  onClose,
  journey,
  plan = 'free',
  signedIn = false,
  onForget,
  onForgetAll,
}: {
  open: boolean;
  onClose: () => void;
  journey: UserUnderstanding | null;
  /** which plan's window onto the store is shown */
  plan?: Plan;
  /** forgetting is written to the account; signed out it is local only */
  signedIn?: boolean;
  /** forget one entry — the caller writes it and hands back the new state */
  onForget?: (id: string) => Promise<void> | void;
  /** forget everything Socria holds — the caller calls the account route */
  onForgetAll?: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setConfirmAll(false);
  }, [open]);

  if (!open) return null;

  const narrative = journey?.narrative ?? [];
  const threads = journey?.openThreads ?? [];
  const timeline = journey?.timeline ?? [];
  const now = Date.now();
  const all: MemoryEntry[] = journey?.entries ?? [];
  const carried = visibleEntries(all, plan, now);
  const dormant = dormantCount(all, plan);
  const groups = groupByKind(carried.map((e) => (e.kind === 'insight' ? { ...e, kind: 'pattern' as const } : e)));
  const hasContent =
    narrative.length > 0 || threads.length > 0 || timeline.length > 0 || all.length > 0;

  const forget = async (id: string) => {
    if (!onForget || busy) return;
    setBusy(id);
    try {
      await onForget(id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="core3-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="jrn-title">
      <div className="core3-modal-card jrn-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="core3-modal-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="jrn-body">
          <header className="jrn-head">
            <span className="jrn-eyebrow">Across your conversations</span>
            <h2 id="jrn-title" className="jrn-title">
              What Socria <span className="jrn-title-em">remembers</span>
            </h2>
            <p className="jrn-sub">
              What Socria has come to know about how you think — held quietly,
              brought up only when it helps, and yours to take back.
              {journey?.updatedAt ? ` Updated ${timeAgo(journey.updatedAt)}.` : ''}
            </p>
            {/* Only when there is something the free tier is not carrying;
                what One does, and no number — the count is in the docs. */}
            {dormant > 0 && plan !== 'one' && (
              <p className="jrn-sub jrn-plan-line">
                Socria One keeps everything it learns about how you think; the
                free tier carries what has mattered most.
              </p>
            )}
          </header>

          {!hasContent && (
            <div className="jrn-empty">
              <span className="jrn-empty-mark" aria-hidden="true">
                <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="20" cy="20" r="13" />
                  <path d="M20 14v6l4 3" strokeLinecap="round" />
                </svg>
              </span>
              <p className="jrn-empty-title">Nothing recorded yet.</p>
              <p className="jrn-empty-note">
                This begins to fill in once a conversation has some real
                substance — a few exchanges into something that matters. Come
                back after a longer talk.
              </p>
            </div>
          )}

          {ORDER.map((kind) => {
            const g = groups.find((x) => x.kind === kind);
            if (!g) return null;
            return (
              <section key={kind} className="jrn-section">
                <span className="jrn-label">{HEADING[kind]}</span>
                <ul className="jrn-notes jrn-entries">
                  {g.entries.map((e) => (
                    <li key={e.id} className={`jrn-entry${busy === e.id ? ' is-busy' : ''}`}>
                      <span className="jrn-entry-text">{e.text}</span>
                      {e.lastSeen > 0 && (
                        <span className="jrn-entry-when">came up {timeAgo(e.lastSeen)}</span>
                      )}
                      {onForget && (
                        <button
                          type="button"
                          className="jrn-forget"
                          aria-label="Forget this"
                          title="Forget this"
                          disabled={busy !== null}
                          onClick={() => void forget(e.id)}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {narrative.length > 0 && (
            <section className="jrn-section">
              <span className="jrn-label">Understanding</span>
              <ul className="jrn-notes">
                {narrative.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}

          {threads.length > 0 && (
            <section className="jrn-section">
              <span className="jrn-label">Open threads</span>
              <div className="jrn-threads">
                {threads.map((t, i) => (
                  <div key={i} className="jrn-thread">
                    <div className="jrn-thread-top">
                      <span className="jrn-thread-topic">{t.topic}</span>
                      {t.lastTouched > 0 && (
                        <span className="jrn-thread-age">{timeAgo(t.lastTouched)}</span>
                      )}
                    </div>
                    <p className="jrn-thread-status">{t.status}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {timeline.length > 0 && (
            <section className="jrn-section">
              <span className="jrn-label">The journey so far</span>
              <ol className="jrn-timeline">
                {timeline.map((e, i) => (
                  <li key={i} className="jrn-tl-item">
                    <span className="jrn-tl-rail" aria-hidden="true">
                      <span className="jrn-tl-dot" />
                    </span>
                    <div className="jrn-tl-content">
                      <span className="jrn-tl-month">
                        {new Date(e.at).toLocaleDateString('en-US', {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="jrn-tl-event">{e.event}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {hasContent && onForgetAll && (
            <footer className="jrn-foot">
              {confirmAll ? (
                <span className="jrn-foot-confirm">
                  <span>Forget everything Socria has learned about you? Conversations stay; the memory goes.</span>
                  <button
                    type="button"
                    className="jrn-foot-yes"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy('all');
                      try {
                        await onForgetAll();
                      } finally {
                        setBusy(null);
                        setConfirmAll(false);
                      }
                    }}
                  >
                    Forget everything
                  </button>
                  <button type="button" className="jrn-foot-no" onClick={() => setConfirmAll(false)}>
                    Keep it
                  </button>
                </span>
              ) : (
                <button type="button" className="jrn-foot-link" onClick={() => setConfirmAll(true)}>
                  Forget everything
                </button>
              )}
              {!signedIn && (
                <span className="jrn-foot-note">Kept in this browser.</span>
              )}
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}
