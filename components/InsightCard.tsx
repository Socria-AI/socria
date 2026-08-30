'use client';

import type { Insight } from '@/lib/socria-prompt';

export function InsightCard({
  insight,
  onContinue,
  onShare,
}: {
  insight: Insight;
  onContinue: () => void;
  onShare: () => void;
}) {
  return (
    <div className="insight-card" role="region" aria-label="Insight">
      <div className="insight-card-eyebrow">
        <span className="insight-card-sparkle" aria-hidden>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2z" />
          </svg>
        </span>
        Insight Card
      </div>

      <p className="insight-card-label">{insight.headerLabel}</p>
      <p className="insight-card-text">{insight.text}</p>

      <div className="insight-card-actions">
        <button
          type="button"
          onClick={onContinue}
          className="insight-card-secondary"
        >
          Continue conversation
        </button>
        <button
          type="button"
          onClick={onShare}
          className="insight-card-primary"
        >
          <span className="insight-card-primary-shine" aria-hidden />
          <span className="insight-card-primary-label">Share insight</span>
          <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
