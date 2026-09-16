'use client';
// components/FindPanel.tsx
//
// Find inside the open conversation.
//
// Opens on what YOU said, which is the design's idea and a good one: in a
// long thread the line somebody is hunting for is almost always their own,
// and searching everything by default buries it under replies that are
// longer, more numerous, and not theirs.

import { useEffect, useRef, useState } from 'react';
import { countsOf, findIn, saidIn, splitMatch, type FindScope, type Turn } from '@/lib/find';

export function FindPanel({
  turns,
  onJump,
  onClose,
}: {
  turns: Turn[];
  onJump: (i: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<FindScope>('you');
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const said = saidIn(turns);
  const counts = countsOf(said);
  const hits = findIn(said, q, scope);
  const TABS: [FindScope, string, number][] = [
    ['you', 'You', counts.you],
    ['socria', 'Socria', counts.socria],
    ['all', 'Everything', counts.all],
  ];

  const bare = said.length === 0;
  const typed = q.trim();

  return (
    // The register's own scope. Every rule below lives in app/app-shell.css
    // as `.app-root .find-*`; without this wrapper the panel renders with no
    // styling at all. `app-inline` is display:contents, so the panel is still
    // a direct flex child of .chat-row and sits as a column beside the
    // conversation rather than floating over it.
    <div className="app-root app-inline">
      <div className="find" role="search" aria-label="Find in this conversation">
        <div className="find-top">
          <span className="lbl">Find in this conversation</span>
          <button type="button" className="x" onClick={onClose} aria-label="Close find">
            ×
          </button>
        </div>

        <div className="find-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
          </svg>
          <input
            ref={field}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="a word you used"
            aria-label="Search this conversation"
          />
          {q && (
            <button type="button" className="clear" onClick={() => setQ('')} aria-label="Clear">
              ×
            </button>
          )}
        </div>

        <div className="find-tabs" role="tablist">
          {TABS.map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={scope === id}
              className={scope === id ? 'on' : ''}
              onClick={() => setScope(id)}
            >
              {label}
              <span className="n">{n}</span>
            </button>
          ))}
        </div>

        {/* What the list below is, said before you read it. */}
        <p className="find-count">
          {bare
            ? 'nothing to search yet'
            : typed
              ? hits.length
                ? `${hits.length} ${hits.length === 1 ? 'line' : 'lines'}`
                : 'nothing yet'
              : 'every line, newest last'}
        </p>

        <div className="find-hits">
          {hits.map((s) => (
            <button
              key={s.i}
              type="button"
              className={`find-hit ${s.who}`}
              onClick={() => {
                onJump(s.i);
                onClose();
              }}
            >
              <span className="w">{s.who === 'you' ? 'You' : 'Socria'}</span>
              <span className="t">
                {splitMatch(s.text, typed).map((part, k) =>
                  part.hit ? <mark key={k}>{part.text}</mark> : <span key={k}>{part.text}</span>
                )}
              </span>
            </button>
          ))}
          {bare && (
            <p className="find-none">
              Nothing said yet.{' '}
              <em>Ask something, and this is where you will find it again.</em>
            </p>
          )}
          {!bare && !hits.length && typed && (
            <p className="find-none">
              No line here contains that. <em>Try one word fewer.</em>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
