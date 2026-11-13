'use client';
// components/logos6/ChallengeCard.tsx — a challenge, in the conversation (lib/challenge/challenge.ts).
//
// Drawn as the conversation's other elements are: between hairlines, a label, rows. Each finding is one sentence,
// then the words it rests on (pressed, they open where they are) and three words: Keep on map, Dismiss, Discuss.
// Why it matters and how to settle it are a press away (More). No pills: the composer's Send is the surface's one
// filled control.

import { useState } from 'react';
import { KIND_LABEL, SHOWN, checkedLine, stateOf, type Anchor, type Challenge, type Finding, type FindingState } from '@/lib/challenge/challenge';
import './logos6.css';

export type FindingAct = 'kept' | 'considered' | 'dismissed' | 'talked' | 'resolved' | 'more';

export interface ChallengeCardProps {
  challenge: Challenge;
  latest?: boolean;
  onAct: (f: Finding, act: FindingAct) => void;
  onAnchor?: (a: Anchor) => void;
  readOnly?: boolean;
}

const WHERE: Record<Anchor['from'], string> = { said: 'You said', idea: 'On your map', source: 'Your source', earlier: 'Before, you said' };
const SETTLED: Partial<Record<FindingState, string>> = { kept: 'On your map', considered: 'Dismissed', dismissed: 'Dismissed', resolved: 'Resolved' };

function Quote({ a, onAnchor }: { a: Anchor; onAnchor?: (a: Anchor) => void }) {
  const text = `“${a.quote}”`;
  const where = a.from === 'source' ? `${WHERE.source}, ${a.ref}` : WHERE[a.from];
  return onAnchor && a.from !== 'earlier' ? (
    <button type="button" className="l6-quote" onClick={() => onAnchor(a)} title={`${where} — show where`}>
      {text}
    </button>
  ) : (
    <span className="l6-quote is-still" title={where}>
      {text}
    </span>
  );
}

function Row({ f, n, state, onAct, onAnchor, readOnly }: { f: Finding; n: number; state: FindingState; onAct: ChallengeCardProps['onAct']; onAnchor?: ChallengeCardProps['onAnchor']; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const out = state === 'considered' || state === 'dismissed';
  const details = !!(f.matters || f.settle);
  return (
    <li className={`l6-row${out ? ' is-out' : ''}`}>
      <span className="l6-n" aria-hidden="true">
        {n}
      </span>
      <div className="l6-body">
        <p className="l6-text">{f.text}</p>
        {!out && (
          <p className="l6-meta">
            <span>{KIND_LABEL[f.kind]}</span>
            {f.anchors.slice(0, 2).map((a, i) => (
              <span key={i} className="l6-meta-q">
                {' '}
                <span aria-hidden="true">·</span> <Quote a={a} onAnchor={onAnchor} />
              </span>
            ))}
          </p>
        )}
        {open && details && (
          <dl className="l6-details">
            {f.matters && (
              <>
                <dt>If it’s wrong</dt>
                <dd>{f.matters}</dd>
              </>
            )}
            {f.settle && (
              <>
                <dt>To settle it</dt>
                <dd>{f.settle}</dd>
              </>
            )}
          </dl>
        )}
        <div className="l6-acts">
          {SETTLED[state] && <span className="l6-state">{SETTLED[state]}</span>}
          {!readOnly && state === 'open' && (
            <>
              <button type="button" className="l5-link is-meta is-strong" onClick={() => onAct(f, 'kept')}>
                Keep on map
              </button>
              <button type="button" className="l5-link is-meta" onClick={() => onAct(f, 'dismissed')}>
                Dismiss
              </button>
              <button type="button" className="l5-link is-meta" onClick={() => onAct(f, 'talked')}>
                Discuss
              </button>
            </>
          )}
          {!readOnly && state === 'kept' && (
            <button type="button" className="l5-link is-meta" onClick={() => onAct(f, 'resolved')}>
              Mark resolved
            </button>
          )}
          {details && !out && (
            <button type="button" className="l5-link is-meta" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? 'Less' : 'More'}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function ChallengeCard({ challenge: c, onAct, onAnchor, readOnly }: ChallengeCardProps) {
  const [all, setAll] = useState(false);
  const shown = all ? c.findings : c.findings.slice(0, SHOWN);
  const more = c.findings.length - shown.length;
  return (
    <section className="l6-card" aria-label="Worth checking">
      <header className="l6-head">
        <span className="l5-label">{c.findings.length ? 'Worth checking' : 'Checked'}</span>
        <span className="l6-aside">{checkedLine(c)}</span>
      </header>
      {c.guess && (
        <p className="l6-note-line">
          {c.guess.hit ? <>Your guess, “{c.guess.label}”, is among these.</> : <>You guessed “{c.guess.label}”. Compare it with these.</>}
        </p>
      )}
      {c.findings.length ? (
        <ol className="l6-rows">
          {shown.map((f, i) => (
            <Row key={f.id} f={f} n={i + 1} state={stateOf(c, f.id)} onAct={onAct} onAnchor={onAnchor} readOnly={readOnly} />
          ))}
        </ol>
      ) : (
        <div className="l6-holds">
          <p className="l6-text">This holds up on what’s here.</p>
          {c.why && <p className="l6-aside">{c.why}</p>}
          {c.weakest && <p className="l6-aside">Weakest point, and it’s minor: {c.weakest}</p>}
        </div>
      )}
      {more > 0 && (
        <button
          type="button"
          className="l5-link is-meta l6-more"
          onClick={() => {
            setAll(true);
            onAct(c.findings[SHOWN], 'more');
          }}
        >
          {more} more
        </button>
      )}
      {c.structural && <p className="l6-aside">From your map’s structure only. No model answered.</p>}
    </section>
  );
}

/** While a challenge is on its way. */
export function ChallengePending({ scope }: { scope: Challenge['scope']['kind'] }) {
  const what = scope === 'card' ? 'this card' : scope === 'selection' ? 'the cards you picked' : scope === 'document' ? 'your document' : 'this line of thinking';
  return (
    <p className="l6-pending" role="status" aria-live="polite">
      Checking {what}…
    </p>
  );
}
