'use client';
// components/new-logos/represent/RepPreview.tsx — A CONVERSATION'S REPRESENTATION, IN SMALL: where the conversation is
// shown inside another workspace (an objective's canvas, its card). Its question, then the few items that matter most
// — the answer, what is known, the possibilities with their standing, what is still open — each marked as it is on
// its own canvas; the whole picture is a click away. Read only: it is changed where it lives.

import { useEffect, useState } from 'react';
import { KIND_WORD, STATUS_WORD, sanitizeRepresentation, type RepItem, type Representation } from '@/lib/new-logos/representation';

const ORDER: RepItem['kind'][] = ['statement', 'observation', 'hypothesis', 'metric', 'unknown', 'caveat', 'timeline', 'sequence', 'equation', 'variable', 'plot', 'matrix', 'entity', 'document', 'diagram', 'media'];

export function useRepPreview(convId: string | null | undefined, nonce = 0): Representation | null {
  const [rep, setRep] = useState<Representation | null>(null);
  useEffect(() => {
    if (!convId) return;
    let gone = false;
    void fetch(`/api/new-logos/representations?key=${encodeURIComponent(`c:${convId}`)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !gone && j?.ok && setRep(sanitizeRepresentation(j.representation)))
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [convId, nonce]);
  return rep;
}

export function RepPreview({ rep, max = 5 }: { rep: Representation; max?: number }) {
  const questions = rep.items.filter((i) => i.kind === 'question');
  const q = questions[questions.length - 1];
  const rest = rep.items.filter((i) => i.kind !== 'question').sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const shown = rest.slice(0, max);
  return (
    <div className="nl-rprev">
      {q ? <p className="nl-rprev-q">{q.text}</p> : null}
      <ul>
        {shown.map((it) => (
          <li key={it.id} className={`is-${it.kind}${it.kind === 'hypothesis' ? ` is-${it.status}` : ''}`}>
            <span className="nl-rprev-kind">{it.kind === 'hypothesis' ? (it.status === 'open' ? 'Possibly' : STATUS_WORD[it.status]) : KIND_WORD[it.kind]}</span>
            <span>{it.text || KIND_WORD[it.kind]}</span>
          </li>
        ))}
      </ul>
      {rest.length > shown.length ? <p className="nl-hint">and {rest.length - shown.length} more</p> : null}
    </div>
  );
}
