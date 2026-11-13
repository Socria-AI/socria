'use client';
// components/logos6/SourcesCard.tsx — THEIR DOCUMENTS, AGAINST THEIR THINKING (Logos 6, Phase 3).
//
// Two cards, each in the conversation as itself:
//   CheckCard    each claim, and what their sources say of it: supported, partly, contradicted, not found — the
//                passage it rests on a press away, and "Link to the card" to keep the pointer on the map
//   CompareCard  where two documents cut against each other: both passages quoted, what kind of disagreement it
//                is, and — where the kind means it — that both can hold. Never which one is right.

import { useState } from 'react';
import type { SourceCheck, Checked, Verdict } from '@/lib/logos6/evidence';
import { BOTH_CAN_HOLD, DISAGREE_LABEL, type DocCompare, type Disagreement, type Side } from '@/lib/logos6/disagree';
import './logos6.css';

const VERDICT: Record<Verdict, string> = {
  supported: 'Supported',
  partly: 'Partly supported',
  contradicted: 'Your source says otherwise',
  'not-found': 'Not found in your sources',
};

function Passage({ name, k, quote, onOpen }: { name: string; k: string; quote: string; onOpen?: () => void }) {
  const body = (
    <>
      <span className="l6c-where">
        {name} · {k}:
      </span>{' '}
      <q className="l6c-q">{quote}</q>
    </>
  );
  return onOpen ? (
    <button type="button" className="l6c-anchor" onClick={onOpen} title="Open the passage">
      {body}
    </button>
  ) : (
    <span className="l6c-anchor is-still">{body}</span>
  );
}

export function CheckCard({
  check,
  onOpen,
  onLink,
  readOnly,
}: {
  check: SourceCheck;
  onOpen?: (doc: string, block: string) => void;
  onLink?: (r: Checked) => void;
  readOnly?: boolean;
}) {
  const n = check.results.length;
  return (
    <section className="l6c l6s" aria-label="Checked against your sources">
      <header className="l6c-head">
        <h3 className="l6c-title">Checked against your sources</h3>
        <span className="l6c-checked">
          {n} {n === 1 ? 'claim' : 'claims'} · {check.docs} {check.docs === 1 ? 'document' : 'documents'}
        </span>
      </header>
      <ol className="l6c-list">
        {check.results.map((r, i) => (
          <li key={r.id} className={`l6c-f l6s-v is-${r.verdict}`}>
            <span className="l6c-n" aria-hidden="true">
              {i + 1}
            </span>
            <div className="l6c-body">
              <p className="l6c-kind">{VERDICT[r.verdict]}</p>
              <p className="l6c-text">{r.claim}</p>
              {r.passage && (
                <p className="l6c-quotes">
                  <Passage name={r.passage.name} k={r.passage.key} quote={r.passage.quote} onOpen={onOpen ? () => onOpen(r.passage!.doc, r.passage!.block) : undefined} />
                </p>
              )}
              {r.why && <p className="l6c-more">{r.why}</p>}
              {!readOnly && onLink && r.node && r.passage && r.verdict !== 'not-found' && (
                <div className="l6c-acts">
                  {check.taken?.[r.id] === 'linked' ? (
                    <span className="l6c-state">Linked to its card</span>
                  ) : (
                    <button type="button" className="l6c-act" onClick={() => onLink(r)}>
                      Link to the card
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {check.wordsOnly && <p className="l6c-note">Checked by the words alone: no model answered just now, so “not found” may only mean “not in these words”.</p>}
    </section>
  );
}

function SideQuote({ s, onOpen }: { s: Side; onOpen?: (doc: string, block: string) => void }) {
  return <Passage name={s.name} k={s.key} quote={s.quote} onOpen={onOpen ? () => onOpen(s.doc, s.block) : undefined} />;
}

export function CompareCard({
  compare,
  onOpen,
  onAct,
  readOnly,
}: {
  compare: DocCompare;
  onOpen?: (doc: string, block: string) => void;
  onAct?: (d: Disagreement, act: 'kept' | 'dismissed') => void;
  readOnly?: boolean;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? compare.pairs : compare.pairs.slice(0, 3);
  return (
    <section className="l6c l6s" aria-label="Where your sources disagree">
      <header className="l6c-head">
        <h3 className="l6c-title">{compare.pairs.length ? 'Where your sources disagree' : 'Your sources agree here'}</h3>
        <span className="l6c-checked">{compare.docs.map((d) => d.name).join(' · ')}</span>
      </header>
      {compare.pairs.length ? (
        <ol className="l6c-list">
          {shown.map((d, i) => {
            const state = compare.taken?.[d.id];
            return (
              <li key={d.id} className={`l6c-f l6s-pair${state === 'dismissed' ? ' is-quiet' : ''}${state === 'kept' ? ' is-kept' : ''}`}>
                <span className="l6c-n" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="l6c-body">
                  <p className="l6c-kind">
                    {DISAGREE_LABEL[d.kind]}
                    {BOTH_CAN_HOLD.has(d.kind) && <span className="l6c-state"> · both can hold</span>}
                    {state === 'kept' && <span className="l6c-state"> · on your map</span>}
                  </p>
                  <p className="l6c-text">{d.about}</p>
                  <div className="l6s-sides">
                    <SideQuote s={d.a} onOpen={onOpen} />
                    <SideQuote s={d.b} onOpen={onOpen} />
                  </div>
                  {d.because && <p className="l6c-more">{d.because}</p>}
                  {!readOnly && onAct && !state && (
                    <div className="l6c-acts">
                      <button type="button" className="l6c-act is-keep" onClick={() => onAct(d, 'kept')}>
                        Keep on map
                      </button>
                      <button type="button" className="l6c-act" onClick={() => onAct(d, 'dismissed')}>
                        Not relevant
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="l6c-text">On what was compared, they don’t cut against each other.</p>
      )}
      {compare.pairs.length > shown.length && (
        <button type="button" className="l6c-showmore" onClick={() => setAll(true)}>
          Show {compare.pairs.length - shown.length} more
        </button>
      )}
      {compare.figuresOnly && <p className="l6c-note">Only their figures were compared: no model answered just now.</p>}
    </section>
  );
}

/** While a check or a comparison is on its way. */
export function SourcesPending({ what }: { what: 'check' | 'compare' }) {
  return (
    <div className="l6c-pending" role="status" aria-live="polite">
      <span className="l6c-dot" aria-hidden="true" />
      {what === 'check' ? 'Reading your sources for what they say about it…' : 'Reading your documents side by side…'}
    </div>
  );
}

/** Guess first (Phase 4): before a challenge opens, their own guess at the weakest part — one press skips it. */
export function GuessFirst({ options, onGuess, onSkip }: { options: { id: string; label: string }[]; onGuess: (o: { id: string; label: string }) => void; onSkip: () => void }) {
  return (
    <section className="l6c l6g" aria-label="Guess first">
      <header className="l6c-head">
        <h3 className="l6c-title">Guess first</h3>
        <span className="l6c-checked">trying first helps it stick — or skip it</span>
      </header>
      <p className="l6c-text">Before you see them: which part do you think is weakest?</p>
      <div className="l6c-acts">
        {options.slice(0, 5).map((o) => (
          <button key={o.id} type="button" className="l6c-act" onClick={() => onGuess(o)}>
            {o.label.length > 60 ? `${o.label.slice(0, 59)}…` : o.label}
          </button>
        ))}
        <button type="button" className="l6c-act is-keep" onClick={onSkip}>
          Skip — show me
        </button>
      </div>
    </section>
  );
}
