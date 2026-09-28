'use client';

// The left rail: everything you have been working on, whichever surface made
// it, most recent first. A line of thinking is shown with the map it produced
// — the thumbnail is the point, since you recognise a session by the shape its
// reasoning took rather than by reading a title — and a chat is shown without
// one, because it does not have one.
//
// WHY CHATS ARE HERE AT ALL. /chat's sidebar has listed both kinds in one
// order since the rail was built: they are the same thing to the person
// reading the list. Logos had only half of that — its rail listed its own
// sessions and nothing else, so from inside Logos the rest of your thinking
// did not exist and the only way to a chat was to leave first. Opening one
// from here switches back to the Core model you came from with that
// conversation open, which is the same swap the "Socria chat" button makes,
// with a destination.

import { useEffect, useMemo, useRef, useState } from 'react';
import { FEEDBACK_URL } from '@/lib/feedback';
import { MapThumb } from './MapThumb';
import { relTime, type LogosSession } from '@/lib/logos-sessions';
import {
  SESSION_TABS,
  cleanTitle,
  filterByTab,
  mergeRail,
  shouldShowTabs,
  tabCounts,
  type SessionTab,
} from '@/lib/session-rail';

export function LogosRail({
  sessions,
  chats,
  activeId,
  open,
  syncing,
  cloud,
  onSelect,
  onOpenChat,
  onNew,
  onDelete,
  onRename,
  onToggle,
}: {
  sessions: LogosSession[];
  /**
   * The Core conversations, so one rail shows everything. Absent where Logos
   * is mounted somewhere that has no chats to offer, in which case the rail
   * is exactly what it was.
   */
  chats?: { id: string; title: string; updatedAt: number }[];
  activeId: string | null;
  open: boolean;
  syncing: boolean;
  /** true when sessions are synced to the account rather than this browser */
  cloud: boolean;
  onSelect: (id: string) => void;
  /** open a Core conversation: back to the chat surface, on that one */
  onOpenChat?: (id: string) => void;
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
    () =>
      mergeRail(
        sessions.map((s) => ({ ...s, nodes: s.map.nodes.length })),
        // Without a handler there is nowhere for a chat row to go, so it is
        // not offered: a row that does nothing is worse than a row that is
        // not there.
        onOpenChat ? (chats ?? []) : [],
      ),
    [sessions, chats, onOpenChat],
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

            {shown.map((s) => {
              // A chat opens the other surface; a line of thinking opens here.
              const isChat = s.kind === 'chat';
              const open = () => (isChat ? onOpenChat?.(s.id) : onSelect(s.id));
              return (
              <div
                key={`${s.kind}-${s.id}`}
                className={`lg-rail-item${
                  !isChat && s.id === activeId ? ' is-active' : ''
                }${isChat ? ' is-chat' : ''}`}
                onClick={open}
                role="button"
                tabIndex={0}
                title={isChat ? `${s.title} — opens in Socria chat` : undefined}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open();
                  }
                }}
              >
                {/* THE THUMBNAIL IS THE MARK. A session with a map carries
                    its map, and that is the whole of what distinguishes the
                    two kinds in this list — no heading, no badge, no second
                    icon set. A chat gets the same box, empty, so every title
                    still starts on the same vertical line. */}
                {isChat ? (
                  <span className="lg-thumb is-chat" aria-hidden="true">
                    <svg viewBox="0 0 58 38" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M16 13h26M16 19h20M16 25h13" />
                    </svg>
                  </span>
                ) : (
                  <MapThumb map={s.map} />
                )}
                <span className="lg-rail-meta">
                  {editing === s.id && !isChat ? (
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
                        if (isChat) return;
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
                    {isChat
                      ? 'Socria chat'
                      : s.map.nodes.length
                        ? `${s.map.nodes.length} node${s.map.nodes.length === 1 ? '' : 's'}`
                        : 'no map yet'}
                    {s.updatedAt ? ` · ${relTime(s.updatedAt)}` : ''}
                  </span>
                </span>
                {/* Out of the way while renaming, so the box gets the row —
                    and absent entirely on a chat, whose rename and delete
                    live where the chat does. A destructive button on a row
                    that belongs to another surface is a way to lose something
                    from a screen that cannot show you what you lost. */}
                {editing !== s.id && !isChat && (
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
              );
            })}
          </div>

          <p className="lg-rail-foot">
            {cloud ? 'Synced to your account' : 'Kept in this browser'}
            <a className="lg-rail-feedback" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
              Send feedback <span aria-hidden="true">↗</span>
            </a>
          </p>
        </>
      )}
    </aside>
  );
}
