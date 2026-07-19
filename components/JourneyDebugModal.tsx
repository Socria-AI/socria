'use client';

// A lightweight viewer for the cross-conversation thinking journey — not a
// product surface, just a way to inspect what Socria has actually captured
// while testing. Read-only.

import { useEffect } from 'react';
import type { UserUnderstanding } from '@/lib/socria-prompt';

function timeAgo(ts: number): string {
  if (!ts) return '';
  const d = Math.max(0, Math.round((Date.now() - ts) / 86400000));
  if (d === 0) return 'earlier today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  const m = Math.round(d / 30);
  return m <= 1 ? 'about a month ago' : `about ${m} months ago`;
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

  const hasContent =
    !!journey &&
    (journey.narrative.length > 0 ||
      journey.openThreads.length > 0 ||
      journey.timeline.length > 0);

  return (
    <div className="core3-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="core3-modal-card import-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="core3-modal-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="core3-modal-content">
          <p className="core3-modal-eyebrow">Debug view</p>
          <h2 className="core3-modal-title">
            Thinking <span className="core3-modal-title-accent">journey</span>
          </h2>
          <p className="import-modal-sub">
            What Socria has captured about you across conversations, on this
            device{journey?.updatedAt ? ` — last updated ${timeAgo(journey.updatedAt)}` : ''}.
          </p>

          {!hasContent && (
            <p className="import-fine" style={{ marginTop: 16 }}>
              Nothing yet. This fills in every 4 messages once a conversation
              has some substance — check back after a longer exchange.
            </p>
          )}

          {!!journey?.narrative.length && (
            <div className="import-step">
              <div className="import-step-head">
                <span>Understanding</span>
              </div>
              <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'rgba(31,31,31,0.75)' }}>
                {journey.narrative.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {!!journey?.openThreads.length && (
            <div className="import-step">
              <div className="import-step-head">
                <span>Open threads</span>
              </div>
              <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'rgba(31,31,31,0.75)' }}>
                {journey.openThreads.map((t, i) => (
                  <li key={i}>
                    <strong>{t.topic}</strong> — {t.status}
                    {t.lastTouched && (
                      <span style={{ color: 'rgba(31,31,31,0.4)' }}> ({timeAgo(t.lastTouched)})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!journey?.timeline.length && (
            <div className="import-step">
              <div className="import-step-head">
                <span>Timeline</span>
              </div>
              <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'rgba(31,31,31,0.75)' }}>
                {journey.timeline.map((e, i) => (
                  <li key={i}>
                    <span style={{ color: 'rgba(31,31,31,0.4)' }}>
                      {new Date(e.at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}:
                    </span>{' '}
                    {e.event}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
