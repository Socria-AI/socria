'use client';

// The left rail in Logos — WHICH IS THE CORE SURFACE'S RAIL, not a second one.
//
// WHAT THIS FILE WAS, AND WHY IT CHANGED. Logos had a rail of its own design:
// `lg-rail-*` classes, a tab bar (All / Maps / Chats), map thumbnails, its own
// collapse behaviour, its own footer. /chat's sidebar — the one every Core model
// shows — is `s-bar`: a search box, a "Maps only" chip, rows grouped by date, and
// a footer with the memory link. Two designs for one thing, and moving between
// models meant the left side of the screen rearranged itself for no reason the
// person could see.
//
// So this is now the same markup, the same class names and the same helpers as
// the Core rail (app/chat/page.tsx and app/app-shell.css, scoped under
// `.app-root`). Everything Logos-specific about the DATA stays — a line of
// thinking carries the count of nodes in its map, and a chat row opens the Core
// surface on that conversation — because that is a fact about the sessions rather
// than a reason to draw a different sidebar.
//
// THREE deliberate differences from /chat's copy, each because the control has
// nothing to act on here:
//   · no Projects section and no import row — Projects are a Core-side structure
//     this rail has no handle on, and showing an empty folder list would be
//     showing a control that does nothing;
//   · the row that opens a session is a button, not a link — in Logos, opening
//     a line of thinking is a swap in place, so there is nowhere to navigate;
//   · the collapse control is NOT in this rail. `.s-close` is mobile-only in
//     app-shell.css and stays that way; Logos's desktop collapse (it shows three
//     columns, so it needs one) lives in the Logos header beside the other
//     layout controls. Chrome the Core rail does not have does not get added to
//     it here.

import { useMemo, useState } from 'react';
import { FEEDBACK_URL } from '@/lib/feedback';
import Link from 'next/link';
import { Logo } from './Logo';
import { ModelGlyph } from './ModelGlyph';
import { relTime, type LogosSession } from '@/lib/logos-sessions';
import {
  cleanTitle,
  groupRail,
  mergeRail,
  searchRail,
  shouldShowSearch,
} from '@/lib/session-rail';
// The .s-* rules live in app/app-shell.css and are scoped under `.app-root`, so
// the host wraps this in one. Imported here for the same reason ModelPicker
// imports it: a component that needs a stylesheet should carry it.
import '@/app/app-shell.css';

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
  const [query, setQuery] = useState('');
  const [mapsOnly, setMapsOnly] = useState(false);
  // Which row is being renamed, and what is in the box. One at a time: two
  // open editors in a list is a way to lose the one you meant.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const allRail = useMemo(
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

  // The same four helpers /chat uses, in the same order, so the two rails
  // cannot disagree about what a search finds or how rows are grouped.
  const railSearchable = shouldShowSearch(allRail);
  const railFiltering = railSearchable && (!!query || mapsOnly);
  const railHits = railFiltering ? searchRail(allRail, query, mapsOnly) : allRail;
  const railGroups = groupRail(railHits);
  const railHasMaps = allRail.some((i) => i.nodes > 0);

  const commitRename = (id: string) => {
    const next = cleanTitle(renameDraft);
    // An empty box means they changed their mind, not that they want the
    // session called nothing.
    if (next) onRename(id, next);
    setRenaming(null);
  };

  /** One row of the rail — the same shape as /chat's. */
  const renderRow = (item: (typeof allRail)[number]) => {
    const rowKey = `${item.kind}-${item.id}`;
    const isChat = item.kind === 'chat';
    const startRename = () => {
      setRenameDraft(item.title);
      setRenaming(rowKey);
    };

    // The box replaces the row rather than sitting inside it — the same rule
    // /chat follows, kept here so a rename looks identical on both surfaces.
    if (renaming === rowKey) {
      return (
        <div key={rowKey} className="s-row">
          {item.nodes ? (
            <span className="s-glyph" aria-hidden="true">
              <ModelGlyph model="logos" size={14} />
            </span>
          ) : (
            <span className="s-gap" aria-hidden="true" />
          )}
          <input
            autoFocus
            className="s-rename"
            value={renameDraft}
            maxLength={80}
            aria-label="Rename this session"
            onChange={(e) => setRenameDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            // Blur commits as well as Enter: clicking away from a box you
            // have typed in should keep what you typed.
            onBlur={() => commitRename(item.id)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename(item.id);
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
        </div>
      );
    }

    // A line of thinking with a map carries the Logos mark; anything else
    // carries the gap, so every title starts on the same vertical line. The
    // same rule /chat's rail uses — it is how the two kinds are told apart.
    const mark = item.nodes ? (
      <span className="s-glyph" aria-hidden="true">
        <ModelGlyph model="logos" size={14} />
      </span>
    ) : (
      <span className="s-gap" aria-hidden="true" />
    );
    const count = item.nodes ? <span className="n">{item.nodes}</span> : null;

    return (
      <div
        key={rowKey}
        className={`s-row${!isChat && item.id === activeId ? ' on' : ''}`}
      >
        <button
          type="button"
          className="s-open"
          onClick={() => (isChat ? onOpenChat?.(item.id) : onSelect(item.id))}
          onDoubleClick={isChat ? undefined : startRename}
          // The time a session was last touched is in the tooltip rather than
          // a second line, because the Core row has one line of metadata and
          // this is the same row.
          title={
            (isChat ? `${item.title} — opens in Socria chat` : item.title) +
            (item.updatedAt ? ` · ${relTime(item.updatedAt)}` : '')
          }
        >
          {mark}
          <span className="t">{item.title}</span>
          {count}
        </button>
        {/* Rename and delete belong to the surface that owns the row: a chat's
            live where the chat does, and a destructive button on somebody
            else's row is a way to lose something from a screen that cannot
            show you what you lost. */}
        {!isChat && (
          <span className="s-act">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startRename();
              }}
              aria-label={`Rename ${item.title}`}
              title="Rename"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              aria-label={`Delete ${item.title}`}
              title="Delete"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h16" />
                <path d="M9 7V5h6v2" />
                <path d="M6 7l1 13h10l1-13" />
              </svg>
            </button>
          </span>
        )}
      </div>
    );
  };

  return (
    // `data-open` says whether the drawer is in view; the stylesheet decides
    // what that means at each width, rather than a class that would hide the
    // rail on a desktop that has no way to bring it back.
    <aside className="s-bar" data-open={open ? 'yes' : 'no'} aria-label="Your sessions">
      <div className="s-top">
        <Logo />
        <button className="s-close" onClick={onToggle} aria-label="Close sidebar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <button className="s-new" onClick={onNew} title="Start a new line of thinking">
        <span className="p" aria-hidden="true">+</span>
        New line of thinking
      </button>

      {/* Search and the one filter, on the same rule as /chat: they earn their
          place once the list is long enough that the ordering cannot answer
          "which of these has the map I drew". */}
      {railSearchable && (
        <>
          <div className="s-find">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your sessions"
              aria-label="Search your sessions"
            />
            {query && (
              <button className="clear" onClick={() => setQuery('')} aria-label="Clear search">
                ×
              </button>
            )}
          </div>

          {(railHasMaps || query) && (
            <div className="s-filter">
              {railHasMaps && (
                <button className="chip" aria-pressed={mapsOnly} onClick={() => setMapsOnly((v) => !v)}>
                  <span className="s-glyph" aria-hidden="true">
                    <ModelGlyph model="logos" size={13} />
                  </span>
                  Maps only
                </button>
              )}
              {(query || mapsOnly) && (
                <span className="n">
                  {railHits.length} of {allRail.length}
                </span>
              )}
            </div>
          )}
        </>
      )}

      <div className="s-list">
        {syncing && !allRail.length ? (
          <p className="s-none">Loading sessions…</p>
        ) : !allRail.length ? (
          <p className="s-none">No sessions yet. <em>Start one.</em></p>
        ) : !railHits.length ? (
          railFiltering ? <p className="s-none">Nothing matches. <em>Try fewer words.</em></p> : null
        ) : (
          railGroups.map(({ group, items }) => (
            <section key={group}>
              <p className="s-when">{group}</p>
              {items.map(renderRow)}
            </section>
          ))
        )}
      </div>

      <div className="s-foot">
        {/* The same footer links, in the same order, as the Core rail — the
            memory link included, which used to be a button in the Logos header
            and is now in the one place the product keeps it. /memory IS the
            Mind Graph, and the older Cores' Journey is on that page too, with
            the per-entry forget the header button used to carry. */}
        <Link href="/memory" className="s-link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4l2.5 2.5" strokeLinecap="round" />
          </svg>
          <span>What Socria remembers</span>
        </Link>
        <p className="s-vow">
          {cloud
            ? 'Synced across your devices. Your reasoning is yours.'
            : 'Kept in this browser. Your reasoning is yours.'}
        </p>
        <a className="s-feedback" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
          Send feedback <span aria-hidden="true">↗</span>
        </a>
      </div>
    </aside>
  );
}
