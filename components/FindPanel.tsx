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

  return (
    <div className="find" role="search" aria-label="Find in this conversation">
      <div className="find-top">
        <span className="lbl">Find in this conversation</span>
        <button type="button" className="find-x" onClick={onClose} aria-label="Close find">
          ×
        </button>
      </div>

      <div className="find-field">
        <input
          ref={field}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="a word you remember saying…"
          aria-label="Search this conversation"
        />
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
            {label} <span className="find-count">{n}</span>
          </button>
        ))}
      </div>

      <div className="find-hits">
        {hits.length === 0 ? (
          <p className="find-none">
            {said.length === 0
              ? 'Nothing has been said here yet.'
              : 'No line in this scope matches that.'}
          </p>
        ) : (
          hits.map((s) => (
            <button
              key={s.i}
              type="button"
              className="find-hit"
              onClick={() => {
                onJump(s.i);
                onClose();
              }}
            >
              <span className="who">{s.who === 'you' ? 'You' : 'Socria'}</span>
              <span className="txt">
                {splitMatch(s.text, q).map((p, k) =>
                  p.hit ? <mark key={k}>{p.text}</mark> : <span key={k}>{p.text}</span>
                )}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
