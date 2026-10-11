'use client';

// components/mind/MindChanges.tsx — how Socria's understanding of you has changed, and your say over it.
//
// Every change the memory records (lib/mind/evolve.ts), read from the graph
// itself: a position that replaced another, two claims in tension, better
// words for a claim, a possible contradiction Socria noticed. The ones read
// from a conversation wait here for the person: confirm, say it was not a
// change (what it displaced comes back exactly, and the same reading is not
// made again), or — when the change created the newer claim — forget that
// claim. Each shows what rests on it, one press from the memory itself.
// Older changes are kept as history, never presented as needing a decision.

import { useState } from 'react';
import { Label } from '@/components/journal/ds';
import type { Change, EvolutionStep } from '@/lib/mind/evolve';

const KIND: Record<Change['kind'], string> = {
  superseded: 'Changed position',
  conflict: 'In tension',
  'possible-conflict': 'Possibly in tension',
  revised: 'Reworded',
};
const when = (t: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'an unrecorded day');

export function MindChanges({
  changes,
  busy,
  onSelect,
  onDecide,
}: {
  changes: Change[];
  busy: boolean;
  onSelect: (id: string) => void;
  onDecide: (id: string, decision: 'confirm' | 'reject' | 'forget') => void;
}) {
  const [history, setHistory] = useState(false);
  const proposed = changes.filter((c) => c.review === 'proposed');
  const settled = changes.filter((c) => c.review !== 'proposed');
  if (!changes.length) return null;
  return (
    <section className="mem-changes" aria-labelledby="mem-changes-h">
      <Label tone="moss">How your thinking has changed</Label>
      <h2 id="mem-changes-h">{proposed.length ? `Socria read ${proposed.length === 1 ? 'a change' : `${proposed.length} changes`} in your thinking.` : 'Every change is settled.'}</h2>
      <p className="deck">
        Nothing is overwritten: what you thought before is kept, and the change is a link between the two. A change Socria read from a conversation is <em>its reading</em> until you say so — confirm it, or say it was not a change and
        what it displaced comes back exactly. In the graph, a solid ring marks what changed; a dashed ring, what may be affected.
      </p>
      {proposed.length > 0 && (
        <ul className="clist">
          {proposed.map((c) => (
            <Row key={c.id} c={c} busy={busy} onSelect={onSelect} onDecide={onDecide} />
          ))}
        </ul>
      )}
      {settled.length > 0 && (
        <div className="chist">
          <button type="button" className="chist-t" aria-expanded={history} onClick={() => setHistory((h) => !h)}>
            {history ? 'Hide' : 'Show'} the history ({settled.length})
          </button>
          {history && (
            <ul className="clist is-history">
              {settled.map((c) => (
                <Row key={c.id} c={c} busy={busy} onSelect={onSelect} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ c, busy, onSelect, onDecide }: { c: Change; busy: boolean; onSelect: (id: string) => void; onDecide?: (id: string, d: 'confirm' | 'reject' | 'forget') => void }) {
  const reject = c.kind === 'superseded' ? 'Not a change' : c.kind === 'revised' ? 'Keep the earlier words' : 'They don’t conflict';
  const confirm = c.kind === 'superseded' ? 'Yes, I changed my mind' : c.kind === 'revised' ? 'Keep the new words' : 'Yes, they’re in tension';
  return (
    <li className={`crow is-${c.kind}${c.review === 'proposed' ? ' is-proposed' : ''}`}>
      <span className="ck">
        {KIND[c.kind]} · {when(c.at)}
        {c.surface !== 'user' ? ` · read from ${c.surface === 'logos' ? 'a Logos session' : c.surface === 'core' ? 'a conversation' : c.surface === 'file' ? 'a file' : 'Socria'}` : ' · your edit'}
        {c.review === 'confirmed' && !c.legacy ? ' · confirmed' : c.legacy ? ' · recorded before review began' : ''}
      </span>
      {c.kind === 'revised' ? (
        <p className="cbody">
          <button type="button" className="cl" onClick={() => onSelect(c.to.id)}>
            {c.to.label}
          </button>
          : <span className="cwas">“{c.was}”</span> → <span className="cnow">“{c.to.content}”</span>
        </p>
      ) : (
        <p className="cbody">
          <button type="button" className="cl" onClick={() => onSelect(c.from.id)}>
            {c.from.label}
          </button>{' '}
          <span className="cwas">— {c.from.content}</span>
          <span className="carrow" aria-hidden="true">
            {c.kind === 'superseded' ? ' → ' : ' ⟷ '}
          </span>
          <span className="sr">{c.kind === 'superseded' ? ' became ' : ' is in tension with '}</span>
          <button type="button" className="cl" onClick={() => onSelect(c.to.id)}>
            {c.to.label}
          </button>{' '}
          <span className="cnow">— {c.to.content}</span>
        </p>
      )}
      {c.note && c.kind !== 'possible-conflict' && <p className="cnote">Recorded: {c.note}</p>}
      {c.affected.length > 0 && (
        <p className="caff">
          May affect:{' '}
          {c.affected.slice(0, 6).map((a, i) => (
            <span key={a.id}>
              {i ? ', ' : ''}
              <button type="button" className="cl" onClick={() => onSelect(a.id)}>
                {a.label}
              </button>
            </span>
          ))}
          {c.affected.length > 6 ? ` and ${c.affected.length - 6} more` : ''}
        </p>
      )}
      {onDecide && (
        <span className="cacts">
          <button type="button" className="ok" disabled={busy} onClick={() => onDecide(c.id, 'confirm')}>
            {confirm}
          </button>
          <button type="button" className="no" disabled={busy} onClick={() => onDecide(c.id, 'reject')}>
            {reject}
          </button>
          {c.canForget && (
            <button type="button" className="no" disabled={busy} onClick={() => onDecide(c.id, 'forget')} title={`Forget “${c.to.label}” — it will not come back`}>
              That’s not what I think
            </button>
          )}
        </span>
      )}
    </li>
  );
}

const STEP: Record<EvolutionStep['kind'], string> = {
  origin: 'First noted',
  replaced: 'Changed',
  'replaced-by': 'Changed',
  reworded: 'Reworded',
  tension: 'Tension',
  corrected: 'You corrected it',
};

/** One memory's history, oldest first — shown in its panel. */
export function MindEvolution({ steps, onSelect }: { steps: EvolutionStep[] | null; onSelect: (id: string) => void }) {
  if (!steps) return <p className="note">Reading its history…</p>;
  if (steps.length <= 1) return <p className="note">No change recorded — this is how it was first noted.</p>;
  return (
    <ol className="mem-evo">
      {steps.map((s, i) => (
        <li key={i} className={`is-${s.kind}${s.review === 'proposed' ? ' is-proposed' : ''}`}>
          <span className="evk">
            {STEP[s.kind]} · {when(s.at)}
            {s.review === 'proposed' ? ' · waiting for you' : ''}
          </span>
          <span className="evt">
            {s.other ? (
              <button type="button" className="cl" onClick={() => onSelect(s.other!)}>
                {s.text}
              </button>
            ) : (
              s.text
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
