'use client';

// The left rail: every line of thinking you've kept, each shown with the map
// it produced. The thumbnail is the point — you recognise a session by the
// shape its reasoning took, not by reading a title.

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapThumb } from './MapThumb';
import { relTime, type LogosSession } from '@/lib/logos-sessions';
import {
  SESSION_TABS,
  cleanTitle,
  filterByTab,
  shouldShowTabs,
  tabCounts,
  type SessionTab,
} from '@/lib/session-rail';

export function LogosRail({
  sessions,
  activeId,
  open,
  syncing,
  cloud,
  onSelect,
  onNew,
  onDelete,
  onRename,
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
  onRename: (id: string, title: string) => void;
  onToggle: () => void;
}) {
  const [tab, setTab] = useState<SessionTab>('all');
  // Which row is being renamed, and what is in the box. One at a time: two
  // open editors in a list is a way to lose the one you meant.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const railItems = useMemo(
    () => sessions.map((s) => ({ ...s, nodes: s.map.nodes.length })),
    [sessions],
  );
  const tabbed = shouldShowTabs(railItems);
  const counts = tabCounts(railItems);
  // A tab that empties out from under somebody — the last map deleted while
  // Maps is selected — returns them to All rather than to a blank list.
  const active: SessionTab = tabbed && counts[tab] > 0 ? tab : 'all';
  const shown = tabbed ? filterByTab(railItems, active) : railItems;

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = (id: string) => {
    const next = cleanTitle(draft);
    // An empty box means they changed their mind, not that they want the
    // session called nothing.
    if (next) onRename(id, next);
    setEditing(null);
  };
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

          {/* Only when it divides something. A switcher whose every option
              but one leads to "nothing here" teaches people not to press it,
              and a tab bar over three rows is furniture. */}
          {tabbed && (
            <div className="lg-rail-tabs" role="tablist" aria-label="Filter">
              {SESSION_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active === t.id}
                  className={`lg-rail-tab${active === t.id ? ' is-on' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  <span className="lg-rail-tabn">{counts[t.id]}</span>
                </button>
              ))}
            </div>
          )}

          <div className="lg-rail-list">
            {syncing && sessions.length === 0 && (
              <p className="lg-rail-note">Loading your sessions…</p>
            )}
            {!syncing && sessions.length === 0 && (
              <p className="lg-rail-note">
                Nothing kept yet. Start thinking and this fills in.
              </p>
            )}

            {tabbed && shown.length === 0 && (
              <p className="lg-rail-note">Nothing here yet.</p>
            )}

            {shown.map((s) => (
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
                  {editing === s.id ? (
                    <input
                      ref={input}
                      className="lg-rail-rename"
                      value={draft}
                      autoFocus
                      aria-label="Rename this line of thinking"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setDraft(e.target.value)}
                      // Blur commits as well as Enter: clicking away from a
                      // box you have typed in should keep what you typed.
                      onBlur={() => commit(s.id)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') commit(s.id);
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                  ) : (
                    <span
                      className="lg-rail-name"
                      // The title itself is the affordance, the way a file
                      // name is — the button beside it is for anyone who does
                      // not know that.
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setDraft(s.title);
                        setEditing(s.id);
                      }}
                      title={s.title}
                    >
                      {s.title}
                    </span>
                  )}
                  <span className="lg-rail-sub">
                    {s.map.nodes.length
                      ? `${s.map.nodes.length} node${s.map.nodes.length === 1 ? '' : 's'}`
                      : 'no map yet'}
                    {s.updatedAt ? ` · ${relTime(s.updatedAt)}` : ''}
                  </span>
                </span>
                {/* Out of the way while renaming, so the box gets the row. */}
                {editing !== s.id && (
                  <>
                  <button
                    type="button"
                    className="lg-rail-ren"
                    aria-label={`Rename ${s.title}`}
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraft(s.title);
                      setEditing(s.id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
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
                  </>
                )}
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
