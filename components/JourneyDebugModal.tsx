'use client';

// The user's cross-conversation thinking journey — an evolving understanding,
// open threads, and a timeline of meaningful developments. Read-only; presented
// as a quiet editorial page rather than a data dump.

import { useEffect } from 'react';
import type { UserUnderstanding } from '@/lib/socria-prompt';

function timeAgo(ts: number): string {
  if (!ts) return '';
  const d = Math.max(0, Math.round((Date.now() - ts) / 86400000));
  if (d === 0) return 'earlier today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  const m = Math.round(d / 30);
  return m <= 1 ? 'a month ago' : `${m} months ago`;
}

export function JourneyDebugModal({
  open,
  onClose,
  journey,
}: {
  open: boolean;
  onClose: () => void;
  journey: UserUnderstanding | null;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const narrative = journey?.narrative ?? [];
  const threads = journey?.openThreads ?? [];
  const timeline = journey?.timeline ?? [];
  const hasContent =
    narrative.length > 0 || threads.length > 0 || timeline.length > 0;

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
              Your thinking <span className="jrn-title-em">journey</span>
            </h2>
            <p className="jrn-sub">
              What Socria has come to understand about how you think — held
              quietly, and brought up only when it helps.
              {journey?.updatedAt ? ` Updated ${timeAgo(journey.updatedAt)}.` : ''}
            </p>
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
        </div>
      </div>
    </div>
  );
}
