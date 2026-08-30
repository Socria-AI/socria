'use client';

// The left rail: every line of thinking you've kept, each shown with the map
// it produced. The thumbnail is the point — you recognise a session by the
// shape its reasoning took, not by reading a title.

import { MapThumb } from './MapThumb';
import { relTime, type LogosSession } from '@/lib/logos-sessions';

export function LogosRail({
  sessions,
  activeId,
  open,
  syncing,
  cloud,
  onSelect,
  onNew,
  onDelete,
  onToggle,
}: {
  sessions: LogosSession[];
  activeId: string | null;
  open: boolean;
  syncing: boolean;
  /** true when sessions are synced to the account rather than this browser */
  cloud: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onToggle: () => void;
}) {
  return (
    <aside className={`lg-rail${open ? '' : ' is-collapsed'}`} aria-label="Your sessions">
      <div className="lg-rail-top">
        <button
          type="button"
          className="lg-rail-toggle"
          onClick={onToggle}
          aria-label={open ? 'Hide sessions' : 'Show sessions'}
          title={open ? 'Hide sessions' : 'Show sessions'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
        </button>
        {open && <span className="lg-rail-title">Lines of thinking</span>}
      </div>

      {open && (
        <>
          <button type="button" className="lg-rail-new" onClick={onNew}>
            <span aria-hidden="true">+</span> New line of thinking
          </button>

          <div className="lg-rail-list">
            {syncing && sessions.length === 0 && (
              <p className="lg-rail-note">Loading your sessions…</p>
            )}
            {!syncing && sessions.length === 0 && (
              <p className="lg-rail-note">
                Nothing kept yet. Start thinking and this fills in.
              </p>
            )}

            {sessions.map((s) => (
              <div
                key={s.id}
                className={`lg-rail-item${s.id === activeId ? ' is-active' : ''}`}
                onClick={() => onSelect(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(s.id);
                  }
                }}
              >
                <MapThumb map={s.map} />
                <span className="lg-rail-meta">
                  <span className="lg-rail-name">{s.title}</span>
                  <span className="lg-rail-sub">
                    {s.map.nodes.length
                      ? `${s.map.nodes.length} node${s.map.nodes.length === 1 ? '' : 's'}`
                      : 'no map yet'}
                    {s.updatedAt ? ` · ${relTime(s.updatedAt)}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="lg-rail-del"
                  aria-label={`Delete ${s.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <p className="lg-rail-foot">
            {cloud ? 'Synced to your account' : 'Kept in this browser'}
          </p>
        </>
      )}
    </aside>
  );
}
