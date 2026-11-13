'use client';
// components/logos6/SourcesCard.tsx — their documents against their thinking (Logos 6, Phase 3), drawn as the
// challenge card is: a label, hairline rows, the passage quoted, actions as words.
//   CheckCard    each claim and what their sources say of it
//   CompareCard  where two documents cut against each other, both passages quoted, never a winner

import { useState } from 'react';
import type { SourceCheck, Checked, Verdict } from '@/lib/logos6/evidence';
import { BOTH_CAN_HOLD, DISAGREE_LABEL, type DocCompare, type Disagreement, type Side } from '@/lib/logos6/disagree';
import './logos6.css';

const VERDICT: Record<Verdict, string> = {
  supported: 'Supported',
  partly: 'Partly supported',
  contradicted: 'Your source says otherwise',
  'not-found': 'Not in your sources',
};

function Passage({ name, k, quote, onOpen }: { name: string; k: string; quote: string; onOpen?: () => void }) {
  const text = `“${quote}”`;
  return (
    <span className="l6-meta-q">
      {onOpen ? (
        <button type="button" className="l6-quote" onClick={onOpen} title={`${name}, ${k} — open the passage`}>
          {text}
        </button>
      ) : (
        <span className="l6-quote is-still">{text}</span>
      )}{' '}
      <span className="l6-src">
        {name}, {k}
      </span>
    </span>
  );
}

export function CheckCard({ check, onOpen, onLink, readOnly }: { check: SourceCheck; onOpen?: (doc: string, block: string) => void; onLink?: (r: Checked) => void; readOnly?: boolean }) {
  const n = check.results.length;
  return (
    <section className="l6-card" aria-label="Checked against your sources">
      <header className="l6-head">
        <span className="l5-label">Against your sources</span>
        <span className="l6-aside">
          {n} {n === 1 ? 'claim' : 'claims'} · {check.docs} {check.docs === 1 ? 'document' : 'documents'}
        </span>
      </header>
      <ol className="l6-rows">
        {check.results.map((r, i) => (
          <li key={r.id} className={`l6-row is-${r.verdict}`}>
            <span className="l6-n" aria-hidden="true">
              {i + 1}
            </span>
            <div className="l6-body">
              <p className="l6-text">{r.claim}</p>
              <p className="l6-meta">
                <span className="l6-verdict">{VERDICT[r.verdict]}</span>
                {r.passage && (
                  <>
                    {' '}
                    <span aria-hidden="true">·</span> <Passage name={r.passage.name} k={r.passage.key} quote={r.passage.quote} onOpen={onOpen ? () => onOpen(r.passage!.doc, r.passage!.block) : undefined} />
                  </>
                )}
              </p>
              {!readOnly && onLink && r.node && r.passage && r.verdict !== 'not-found' && (
                <div className="l6-acts">
                  {check.taken?.[r.id] === 'linked' ? (
                    <span className="l6-state">Linked to its card</span>
                  ) : (
                    <button type="button" className="l5-link is-meta is-strong" onClick={() => onLink(r)}>
                      Link to the card
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {check.wordsOnly && <p className="l6-aside">Matched by wording only. No model answered, so “not in your sources” may mean “not in these words”.</p>}
    </section>
  );
}

function SideQuote({ s, onOpen }: { s: Side; onOpen?: (doc: string, block: string) => void }) {
  return (
    <p className="l6-meta">
      <Passage name={s.name} k={s.key} quote={s.quote} onOpen={onOpen ? () => onOpen(s.doc, s.block) : undefined} />
    </p>
  );
}

export function CompareCard({ compare, onOpen, onAct, readOnly }: { compare: DocCompare; onOpen?: (doc: string, block: string) => void; onAct?: (d: Disagreement, act: 'kept' | 'dismissed') => void; readOnly?: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? compare.pairs : compare.pairs.slice(0, 3);
  return (
    <section className="l6-card" aria-label="Where your sources disagree">
      <header className="l6-head">
        <span className="l5-label">{compare.pairs.length ? 'Where your sources disagree' : 'Your sources agree'}</span>
        <span className="l6-aside">{compare.docs.map((d) => d.name).join(' · ')}</span>
      </header>
      {compare.pairs.length ? (
        <ol className="l6-rows">
          {shown.map((d, i) => {
            const state = compare.taken?.[d.id];
            return (
              <li key={d.id} className={`l6-row${state === 'dismissed' ? ' is-out' : ''}`}>
                <span className="l6-n" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="l6-body">
                  <p className="l6-text">{d.about}</p>
                  <p className="l6-meta">
                    <span>{DISAGREE_LABEL[d.kind]}</span>
                    {BOTH_CAN_HOLD.has(d.kind) && <span> · both can hold</span>}
                  </p>
                  {state !== 'dismissed' && (
                    <div className="l6-pair">
                      <SideQuote s={d.a} onOpen={onOpen} />
                      <SideQuote s={d.b} onOpen={onOpen} />
                    </div>
                  )}
                  {d.because && state !== 'dismissed' && <p className="l6-aside">{d.because}</p>}
                  <div className="l6-acts">
                    {state === 'kept' && <span className="l6-state">On your map</span>}
                    {state === 'dismissed' && <span className="l6-state">Dismissed</span>}
                    {!readOnly && onAct && !state && (
                      <>
                        <button type="button" className="l5-link is-meta is-strong" onClick={() => onAct(d, 'kept')}>
                          Keep on map
                        </button>
                        <button type="button" className="l5-link is-meta" onClick={() => onAct(d, 'dismissed')}>
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="l6-text">On what was compared, they don’t contradict each other.</p>
      )}
      {compare.pairs.length > shown.length && (
        <button type="button" className="l5-link is-meta l6-more" onClick={() => setAll(true)}>
          {compare.pairs.length - shown.length} more
        </button>
      )}
      {compare.figuresOnly && <p className="l6-aside">Only the figures were compared. No model answered.</p>}
    </section>
  );
}

/** While a check or a comparison is on its way. */
export function SourcesPending({ what }: { what: 'check' | 'compare' }) {
  return (
    <p className="l6-pending" role="status" aria-live="polite">
      {what === 'check' ? 'Reading your sources…' : 'Reading your documents side by side…'}
    </p>
  );
}

/** Guess first: before a challenge opens on a line of study, their own guess at the weakest part. */
export function GuessFirst({ options, onGuess, onSkip }: { options: { id: string; label: string }[]; onGuess: (o: { id: string; label: string }) => void; onSkip: () => void }) {
  return (
    <section className="l6-card" aria-label="Guess first">
      <header className="l6-head">
        <span className="l5-label">Guess first</span>
      </header>
      <p className="l6-text">Which part do you think is weakest?</p>
      <ul className="l6-picks">
        {options.slice(0, 5).map((o) => (
          <li key={o.id}>
            <button type="button" className="l5-link" onClick={() => onGuess(o)}>
              {o.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="l6-acts">
        <button type="button" className="l5-link is-meta" onClick={onSkip}>
          Skip and show me
        </button>
      </div>
    </section>
  );
}
