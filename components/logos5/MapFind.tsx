'use client';
// components/logos5/MapFind.tsx — FINDING A CONVERSATION ON THE UNIVERSAL MAP, AND THE WAY BACK.
//
// One small control at the top of the map ("Find on your map", or "/") that opens into a panel. Empty, it lists
// what was worked on most recently — each with when, its subject, Show on the map and Open. Typed into, it finds
// conversations (by title, the ideas their maps grew, where they stand), subjects and ideas, each said for what it
// is (lib/logos5/mapSearch.ts). Anything outside the scale the map is at is said to be ("Outside Today"), and
// choosing it widens the map to the narrowest scale that shows it before the camera goes there. Arrow keys move
// through the results, Enter goes, Escape closes. After a jump, "Back to where you were" returns the camera.
//
// It reads only what the map already holds; nothing is sent anywhere.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { SCALE_SAID, type Scale } from '@/lib/logos5/scales';
import { whenShort, type MapFound } from '@/lib/logos5/mapSearch';

const KIND_SAID: Record<MapFound['kind'], string> = { conversation: 'Conversations', subject: 'Subjects', idea: 'Ideas' };

function KindMark({ kind, chat }: { kind: MapFound['kind']; chat?: boolean }) {
  if (kind === 'subject')
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" className="l5f-mark is-subject">
        <circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.2 2" />
        <circle cx="8.4" cy="9" r="2.4" fill="currentColor" opacity="0.75" />
        <circle cx="12.6" cy="12" r="1.5" fill="currentColor" opacity="0.5" />
      </svg>
    );
  if (kind === 'idea')
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" className="l5f-mark is-idea">
        <circle cx="10" cy="10" r="2.6" fill="currentColor" />
        <path d="M10 3.2v2.2M10 14.6v2.2M3.2 10h2.2M14.6 10h2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" className={`l5f-mark is-conv${chat ? ' is-chat' : ''}`}>
      <circle cx="10" cy="10" r="6" fill="currentColor" opacity={chat ? 0.35 : 0.85} />
      {chat && <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />}
    </svg>
  );
}

/** The words of a title with what was searched for set apart. */
function Marked({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export interface RecentItem {
  id: string;
  title: string;
  at: number;
  where: string | null;
  scale: Scale;
  inView: boolean;
  chat?: boolean;
}

export function MapFind({
  open,
  onOpenChange,
  query,
  onQuery,
  results,
  recent,
  scale,
  now,
  narrow = false,
  inputRef,
  onGo,
  onOpenChat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQuery: (q: string) => void;
  /** what the words find (lib/logos5/mapSearch.ts searchMap) */
  results: readonly MapFound[];
  /** what was worked on most recently, shown while nothing is typed */
  recent: readonly RecentItem[];
  /** the scale the map is at now */
  scale: Scale;
  now: number;
  narrow?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  /** go there on the map: a conversation, a subject, the conversations that hold an idea */
  onGo: (f: Pick<MapFound, 'kind' | 'id' | 'ids' | 'scale' | 'inView'>) => void;
  /** open the conversation itself */
  onOpenChat: (id: string) => void;
}) {
  const own = useRef<HTMLInputElement>(null);
  const input = inputRef ?? own;
  const panel = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const q = query.trim();
  const rows: (Pick<MapFound, 'kind' | 'id' | 'ids' | 'scale' | 'inView' | 'title' | 'excerpt' | 'at' | 'where' | 'chat'>)[] = useMemo(
    () => (q ? [...results] : recent.map((r) => ({ kind: 'conversation' as const, id: r.id, ids: [r.id], scale: r.scale, inView: r.inView, title: r.title, excerpt: null, at: r.at, where: r.where, chat: r.chat }))),
    [q, results, recent]
  );
  useEffect(() => setActive(0), [q, open]);
  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open, input]);
  // the active row kept in view as the arrows move through a long list
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const go = (i: number) => {
    const r = rows[i];
    if (r) onGo(r);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        const r = rows[active];
        if (r?.kind === 'conversation') onOpenChat(r.id);
      } else go(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (q) onQuery('');
      else onOpenChange(false);
    }
  };

  if (!open)
    return (
      <button type="button" className="l5f-trigger" onClick={() => onOpenChange(true)} aria-label="Find on your map: conversations, subjects and ideas" title="Find on your map ( / )">
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="8.6" cy="8.6" r="5.4" />
          <path d="M12.6 12.6l4 4" />
        </svg>
        <span className="l5f-trigger-l">Find on your map</span>
        {!narrow && <kbd className="l5f-kbd">/</kbd>}
      </button>
    );

  // grouped by kind, in the order searchMap gives them; recent is one group
  const groups: { label: string; from: number; to: number }[] = [];
  rows.forEach((r, i) => {
    const label = q ? KIND_SAID[r.kind] : 'Recent';
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.to = i;
    else groups.push({ label, from: i, to: i });
  });

  return (
    <div
      className={`l5f${narrow ? ' is-narrow' : ''}`}
      role="dialog"
      aria-label="Find on your map"
      ref={panel}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !q) onOpenChange(false);
      }}
    >
      <div className="l5f-field">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="8.6" cy="8.6" r="5.4" />
          <path d="M12.6 12.6l4 4" />
        </svg>
        <input
          ref={input}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="A conversation, a subject, an idea…"
          aria-label="Find on your map"
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls="l5f-list"
          aria-activedescendant={rows.length ? `l5f-row-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" className="l5f-close" onClick={() => (onQuery(''), onOpenChange(false))} aria-label="Close">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>
      {rows.length ? (
        <ul className="l5f-list" id="l5f-list" role="listbox" aria-label={q ? 'What your map holds that matches' : 'Recent conversations'}>
          {groups.map((g) => (
            <li key={g.label} className="l5f-group" role="presentation">
              <p className="l5f-group-t" aria-hidden="true">
                {g.label}
              </p>
              <ul role="presentation">
                {rows.slice(g.from, g.to + 1).map((r, j) => {
                  const i = g.from + j;
                  return (
                    <li
                      key={`${r.kind}:${r.id}`}
                      id={`l5f-row-${i}`}
                      data-row={i}
                      role="option"
                      aria-selected={i === active}
                      className={`l5f-row is-${r.kind}${i === active ? ' is-active' : ''}${r.inView ? '' : ' is-out'}`}
                      onMouseEnter={() => setActive(i)}
                    >
                      <button type="button" className="l5f-go" onClick={() => go(i)} title={r.kind === 'conversation' ? 'Show it on the map' : 'Show them on the map'}>
                        <KindMark kind={r.kind} chat={r.chat} />
                        <span className="l5f-text">
                          <span className="l5f-title">
                            <Marked text={r.title} q={q} />
                          </span>
                          {r.excerpt && (
                            <span className="l5f-excerpt">
                              <Marked text={r.excerpt} q={q} />
                            </span>
                          )}
                          <span className="l5f-meta">
                            {r.where && <span className="l5f-where">{r.where}</span>}
                            <span className="l5f-when">{whenShort(r.at, now)}</span>
                            {!r.inView && <span className="l5f-out">Outside {SCALE_SAID[scale].long} · shows in {SCALE_SAID[r.scale].long}</span>}
                          </span>
                        </span>
                      </button>
                      {r.kind === 'conversation' && (
                        <button type="button" className="l5f-open" onClick={() => onOpenChat(r.id)} aria-label={`Open “${r.title}”`} title="Open the conversation">
                          Open
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="l5f-none">{q ? `Nothing on your map matches “${q}”.` : 'Nothing here yet.'}</p>
      )}
      <p className="l5f-hint" aria-hidden="true">
        ↑ ↓ to move · Enter shows it on the map · {narrow ? '' : '⌘ Enter opens it · '}Esc closes
      </p>
    </div>
  );
}

/** After a jump to what was found: the way back to where the map was. */
export function BackPill({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="l5f-back" onClick={onBack} title="Back to where you were (Backspace)">
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 5L3 10l5 5M3.5 10H13a4 4 0 0 1 0 8h-1.5" />
      </svg>
      Back to where you were
    </button>
  );
}
