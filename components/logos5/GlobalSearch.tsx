'use client';
// components/logos5/GlobalSearch.tsx — SEARCH EVERYTHING (Cmd/Ctrl+K).
//
// One box over the whole workspace: every line of thinking, what was said in
// it, the documents and their passages, what was made (charts, models,
// plans, the writing and its cards), the nodes of every map. Fuzzy — a prefix
// or a slip of the finger still finds it. Reads the representation layer's
// index (lib/runtime/representation.ts), which is derived from what is
// stored, so search can never show something that is not there.
//
// A dialog: focus goes into it and comes back when it closes; ↑ ↓ move through
// the results, Enter opens one, Escape closes.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { indexWorkspace, searchWorkspace, type EntityKind, type Hit, type IndexDoc } from '@/lib/runtime/representation';
import type { LogosSession } from '@/lib/logos-sessions';

const KIND_LABEL: Record<EntityKind, string> = {
  conversation: 'Line of thinking',
  message: 'Said',
  document: 'Document',
  passage: 'Passage',
  artifact: 'Artifact',
  writing: 'Writing',
  card: 'Card',
  node: 'Map',
};

export function GlobalSearch({
  sessions,
  docs,
  more,
  titleOf,
  onPick,
  onClose,
  now,
  initial,
}: {
  sessions: readonly LogosSession[];
  /** the documents already read for the line of thinking that is open */
  docs: ReadonlyMap<string, IndexDoc>;
  /** every other document this device has read — fetched when the box opens, searched when it arrives */
  more?: () => Promise<readonly IndexDoc[]>;
  /** the line of thinking a result belongs to, by name */
  titleOf: (session: string) => string;
  onPick: (hit: Hit) => void;
  onClose: () => void;
  now: number;
  /** what to search for as it opens — "search for rent", said (lib/logos5/commands.ts) */
  initial?: string;
}) {
  const [q, setQ] = useState(initial ?? '');
  const [at, setAt] = useState(0);
  const [extra, setExtra] = useState<readonly IndexDoc[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const back = useRef<HTMLElement | null>(typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
  const moreRef = useRef(more);
  moreRef.current = more;
  useEffect(() => {
    let off = false;
    void moreRef.current?.().then((d) => !off && setExtra(d), () => {});
    return () => {
      off = true;
    };
  }, []);
  const index = useMemo(() => indexWorkspace(sessions, [...docs.values(), ...extra]), [sessions, docs, extra]);
  const hits = useMemo(() => searchWorkspace(index, q, { limit: 30, now }), [index, q, now]);
  useEffect(() => {
    input.current?.focus();
    const was = back.current;
    return () => was?.focus?.();
  }, []);
  useEffect(() => setAt(0), [q]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAt((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAt((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && hits[at] && !(e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) {
      e.preventDefault();
      onPick(hits[at]);
    }
  };
  useEffect(() => {
    document.getElementById(`l5gs-hit-${at}`)?.scrollIntoView({ block: 'nearest' });
  }, [at]);
  return (
    <div className="l5gs-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="l5gs" role="dialog" aria-modal="true" aria-label="Search everything" onKeyDown={onKey}>
        <div className="l5gs-in">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations, content, artifacts, maps…"
            aria-label="Search everything"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="l5gs-list"
            aria-activedescendant={hits.length ? `l5gs-hit-${at}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="l5v-kbd">Esc</kbd>
        </div>
        {q.trim() && !hits.length ? (
          <p className="l5gs-empty">Nothing matches “{q.trim()}”.</p>
        ) : !q.trim() ? (
          <p className="l5gs-empty">Type to search every line of thinking, what was said in it, your documents, what was made and every map.</p>
        ) : (
          <ul className="l5gs-list" id="l5gs-list" role="listbox" aria-label="Results">
            {hits.map((h, i) => (
              <li
                key={h.entity.id}
                id={`l5gs-hit-${i}`}
                role="option"
                aria-selected={i === at}
                className={`l5gs-hit${i === at ? ' is-on' : ''}`}
                onPointerEnter={() => setAt(i)}
                onClick={() => onPick(h)}
              >
                <span className={`l5gs-kind is-${h.entity.kind}`}>{h.entity.sub && h.entity.kind === 'artifact' ? h.entity.sub : KIND_LABEL[h.entity.kind]}</span>
                <span className="l5gs-main">
                  <span className="l5gs-t">{h.entity.kind === 'message' || h.entity.kind === 'passage' ? h.snippet : h.entity.title}</span>
                  {h.entity.session && h.entity.kind !== 'conversation' && <span className="l5gs-s">{titleOf(h.entity.session)}</span>}
                  {h.entity.kind === 'passage' && <span className="l5gs-s">{h.entity.title}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
