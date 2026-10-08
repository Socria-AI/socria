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
// TWO deliberate differences from /chat's copy, each because the control has
// nothing to act on here:
//   · the row that opens a session is a button, not a link — in Logos, opening
//     a line of thinking is a swap in place, so there is nowhere to navigate;
//   · the collapse control is NOT in this rail. `.s-close` is mobile-only in
//     app-shell.css and stays that way; Logos's desktop collapse (it shows three
//     columns, so it needs one) lives in the Logos header beside the other
//     layout controls. Chrome the Core rail does not have does not get added to
//     it here.
//
// PROJECTS ARE HERE TOO, when the host hands them down. A Project is a folder
// of conversations, and a line of thinking is a conversation — the two kinds
// share a table, a rail and now a folder. The folder's own actions are the
// Core rail's (new in this project, settings, move to), and what "new" makes
// is a line of thinking, because that is what this surface makes.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Logo } from './Logo';
import { RewardsBadges } from './rewards/RewardsBadges';
import { MapGlyph } from './MapGlyph';
import { NodeTile } from './NodeTile';
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

/** A Project, as a rail needs it: a folder of conversations. The same shape /chat keeps. */
export interface RailProject {
  id: string;
  name: string;
  archived: boolean;
  updatedAt: number;
}

const FOLDER_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l1.8 2h9A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
  </svg>
);
// The foot's Memory row: the Mind Graph, as three joined nodes (as in the Core rail).
const MEMORY_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="6.5" cy="7" r="2.3" />
    <circle cx="17.5" cy="8.5" r="2.3" />
    <circle cx="11" cy="17.5" r="2.3" />
    <path d="M8.8 7.3l6.4.9M7.4 9.1l2.7 6.3M16.2 10.4l-3.9 5.2" />
  </svg>
);
const PLUS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
);
const DOTS_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
);
const MOVE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l1.8 2h9A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
    <path d="M10 13.5h5M13 11.5l2 2-2 2" />
  </svg>
);

export function LogosRail({
  sessions,
  chats,
  activeId,
  open,
  syncing,
  onSelect,
  onOpenChat,
  onNew,
  onDelete,
  onRename,
  onToggle,
  projects,
  onOpenProject,
  onNewInProject,
  onProjectSettings,
  onCreateProject,
  onMoveSession,
  onMoveChat,
  rewards = false,
}: {
  sessions: LogosSession[];
  /**
   * The Core conversations, so one rail shows everything. Absent where Logos
   * is mounted somewhere that has no chats to offer, in which case the rail
   * is exactly what it was.
   */
  chats?: { id: string; title: string; updatedAt: number; projectId?: string | null }[];
  /**
   * The person's Projects. Undefined where there are none to offer — a host
   * that has not loaded them, or nobody signed in — and then there is no
   * Projects section at all, rather than an empty one.
   */
  projects?: RailProject[];
  /** start a line of thinking inside this Project */
  /** a folder's name was pressed: open the Project's home rather than only folding */
  onOpenProject?: (projectId: string) => void;
  onNewInProject?: (projectId: string) => void;
  onProjectSettings?: (projectId: string) => void;
  /** make a Project; resolves to its id, or null if it could not be made */
  onCreateProject?: (name: string) => Promise<string | null>;
  /** file a line of thinking under a Project (null takes it out) */
  onMoveSession?: (id: string, projectId: string | null) => void;
  /** file a Core chat — the host's state, so the host does it */
  onMoveChat?: (id: string, projectId: string | null) => void;
  activeId: string | null;
  open: boolean;
  syncing: boolean;
  onSelect: (id: string) => void;
  /** open a Core conversation: back to the chat surface, on that one */
  onOpenChat?: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onToggle: () => void;
  /** signed in: Socria Rewards' marks beside the Socria mark (components/rewards/RewardsBadges.tsx) */
  rewards?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [mapsOnly, setMapsOnly] = useState(false);
  // Which row is being renamed, and what is in the box. One at a time: two
  // open editors in a list is a way to lose the one you meant.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  /** Which folders are open. */
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  /** The name being typed for a new folder; null when not making one. */
  const [folderDraft, setFolderDraft] = useState<string | null>(null);
  /** The row whose "Move to" menu is open. */
  const [moving, setMoving] = useState<string | null>(null);
  /** A row waiting to go into the folder being named from its menu. */
  const [pendingMove, setPendingMove] = useState<{ kind: 'logos' | 'chat'; id: string } | null>(null);

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
  // A row in a folder is shown in its folder, not also in the dated list —
  // unless the person is searching, when every row is a candidate wherever
  // it lives. A row whose Project no longer exists is simply unfiled.
  const live = useMemo(() => new Set((projects ?? []).map((p) => p.id)), [projects]);
  const filed = (item: { projectId?: string | null }) => !!item.projectId && live.has(item.projectId);
  const railHits = railFiltering ? searchRail(allRail, query, mapsOnly) : allRail.filter((i) => !filed(i));
  const railGroups = groupRail(railHits);
  const railHasMaps = allRail.some((i) => i.nodes > 0);
  const canFile = !!projects && (!!onMoveSession || !!onMoveChat);

  const toggleFolder = (id: string) =>
    setOpenFolders((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  const move = (item: { kind: 'logos' | 'chat'; id: string }, pid: string | null) => {
    setMoving(null);
    if (item.kind === 'logos') onMoveSession?.(item.id, pid);
    else onMoveChat?.(item.id, pid);
    if (pid) setOpenFolders((o) => (o.includes(pid) ? o : [...o, pid]));
  };

  const createFolder = async () => {
    const name = (folderDraft ?? '').replace(/\s+/g, ' ').trim();
    const carry = pendingMove;
    setFolderDraft(null);
    setPendingMove(null);
    if (!name || !onCreateProject) return;
    const id = await onCreateProject(name);
    if (!id) return;
    setOpenFolders((o) => [...o, id]);
    if (carry) move(carry, id);
  };

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
          {item.nodes ? <NodeTile count={item.nodes} seed={item.id} /> : <span className="s-gap" aria-hidden="true" />}
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

    // A line of thinking with a map carries a small map; anything else
    // carries the gap, so every title starts on the same vertical line. The
    // same rule /chat's rail uses — it is how the two kinds are told apart.
    const mark = item.nodes ? (
      <NodeTile count={item.nodes} seed={item.id} />
    ) : (
      <span className="s-gap" aria-hidden="true" />
    );
    const count = item.nodes ? <span className="n">{item.nodes}</span> : null;
    const fileable = canFile && (isChat ? !!onMoveChat : !!onMoveSession);
    const inProject = filed(item) ? item.projectId! : null;

    return (
      <div key={rowKey}>
      <div
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
            show you what you lost. Filing is different — a folder is a fact
            about the list, not the conversation — so either kind can be moved
            from here when the host has given this rail a way to do it. */}
        {(!isChat || fileable) && (
          <span className="s-act">
            {!isChat && (
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
            )}
            {fileable && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMoving((m) => (m === rowKey ? null : rowKey));
                }}
                aria-label={`Move ${item.title} to a project`}
                aria-expanded={moving === rowKey}
                title="Move to project"
              >
                {MOVE_ICON}
              </button>
            )}
            {!isChat && (
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
            )}
          </span>
        )}
      </div>
      {moving === rowKey && projects && (
        <div className="s-move" role="menu" aria-label="Move to a project">
          <p>Move to</p>
          {projects.filter((pr) => !pr.archived).map((pr) => (
            <button
              key={pr.id}
              type="button"
              role="menuitem"
              aria-current={inProject === pr.id}
              onClick={() => move({ kind: item.kind, id: item.id }, pr.id)}
            >
              {pr.name}
            </button>
          ))}
          {inProject && (
            <button type="button" role="menuitem" onClick={() => move({ kind: item.kind, id: item.id }, null)}>
              Out of the project
            </button>
          )}
          {onCreateProject && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setPendingMove({ kind: item.kind, id: item.id });
                setMoving(null);
                setFolderDraft('');
              }}
            >
              New project…
            </button>
          )}
        </div>
      )}
      </div>
    );
  };

  /** A folder, and — when open — the rows in it: lines of thinking and chats alike. */
  const folderRow = (pr: RailProject) => {
    const kids = allRail.filter((i) => i.projectId === pr.id);
    const open = openFolders.includes(pr.id);
    return (
      <div key={`p-${pr.id}`}>
        <div className="s-row s-fold">
          <button
            type="button"
            className="s-open"
            aria-expanded={open}
            onClick={() => (onOpenProject ? onOpenProject(pr.id) : toggleFolder(pr.id))}
            title={pr.name}
          >
            {/* With a home to open, the name opens it and the chevron only folds. */}
            <span
              className="chev"
              aria-hidden="true"
              onClick={onOpenProject ? (e) => { e.stopPropagation(); toggleFolder(pr.id); } : undefined}
            >
              {open ? '▾' : '▸'}
            </span>
            <span className="s-glyph" aria-hidden="true">{FOLDER_ICON}</span>
            <span className="t">{pr.name}</span>
            {kids.length > 0 && <span className="n">{kids.length}</span>}
          </button>
          <span className="s-act">
            {onNewInProject && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onNewInProject(pr.id); }}
                aria-label={`New line of thinking in ${pr.name}`}
                title="New line of thinking in this project"
              >
                {PLUS_ICON}
              </button>
            )}
            {onProjectSettings && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onProjectSettings(pr.id); }}
                aria-label={`${pr.name} settings`}
                title="Project settings"
              >
                {DOTS_ICON}
              </button>
            )}
          </span>
        </div>
        {open && (
          <div className="s-kids">
            {kids.length
              ? kids.map(renderRow)
              : <p className="s-none">Nothing here yet. <em>Start one with +.</em></p>}
          </div>
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
        <RewardsBadges enabled={rewards} />
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
                    <MapGlyph size={13} />
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
        {/* Projects: folders, above the dated list. Hidden while searching — a
            search looks through every row wherever it is filed, and the
            folders would show the same rows twice. */}
        {projects && !syncing && !railFiltering && (
          <section className="s-proj" aria-label="Projects">
            <div className="s-proj-h">
              <p className="s-when">Projects</p>
              {onCreateProject && (
                <button
                  type="button"
                  onClick={() => { setPendingMove(null); setFolderDraft(''); }}
                  aria-label="New project"
                  title="New project"
                >
                  +
                </button>
              )}
            </div>
            {folderDraft !== null && (
              <div className="s-row s-new-proj">
                <span className="s-glyph" aria-hidden="true">{FOLDER_ICON}</span>
                <input
                  autoFocus
                  className="s-rename"
                  value={folderDraft}
                  maxLength={80}
                  placeholder="Name the project"
                  aria-label="New project name"
                  onChange={(e) => setFolderDraft(e.target.value)}
                  onBlur={() => void createFolder()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { setPendingMove(null); setFolderDraft(null); }
                  }}
                />
              </div>
            )}
            {projects.filter((pr) => !pr.archived).map(folderRow)}
            {!projects.length && folderDraft === null && (
              <p className="s-none">Group your thinking into a project, and Socria keeps <em>its</em> context in view.</p>
            )}
            {projects.some((pr) => pr.archived) && (
              <details className="s-arch">
                <summary>Archived · {projects.filter((pr) => pr.archived).length}</summary>
                {projects.filter((pr) => pr.archived).map(folderRow)}
              </details>
            )}
          </section>
        )}
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
        {/* The same rows, in the same style, as the Core rail's foot. Memory
            only: importing history from other AIs feeds Core's answers, not
            Logos's, so it is offered where it does something. /memory IS the
            Mind Graph, and the older Cores' Journey is on that page too. */}
        <nav className="s-foot-nav" aria-label="Memory">
          <Link href="/memory" className="s-link">
            {MEMORY_ICON}
            <span>Memory</span>
          </Link>
        </nav>
      </div>
    </aside>
  );
}
