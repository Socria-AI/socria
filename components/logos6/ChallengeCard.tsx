'use client';
// components/logos6/ChallengeCard.tsx — WORTH CHECKING (Logos 6, Phase 1; lib/challenge/challenge.ts).
//
// A challenge, in the conversation, as itself. Three findings at most at first — each its kind, the one thing
// worth checking, the words it rests on (pressed, they open where they are: the message, the card, the
// passage), what moves if it is wrong, and one thing to do to settle it — and four answers, each the person's:
// keep it on the map, I've thought about this, not relevant, talk it through. "This holds up" is drawn as an
// answer, not as an empty state. What was checked is said at the top, so the card is never generic even by look.

import { useState } from 'react';
import { KIND_LABEL, SHOWN, checkedLine, stateOf, type Anchor, type Challenge, type Finding, type FindingState } from '@/lib/challenge/challenge';
import './logos6.css';

export type FindingAct = 'kept' | 'considered' | 'dismissed' | 'talked' | 'resolved' | 'more';

export interface ChallengeCardProps {
  challenge: Challenge;
  /** the latest message in the conversation: its actions are live; an older card's are too, but quieter */
  latest?: boolean;
  /** what the person did with one finding */
  onAct: (f: Finding, act: FindingAct) => void;
  /** a quote pressed: open where it is */
  onAnchor?: (a: Anchor) => void;
  /** read-only (a shared room watched, a reader): nothing to press but the quotes */
  readOnly?: boolean;
}

const WHERE: Record<Anchor['from'], string> = {
  said: 'You said',
  idea: 'On your map',
  source: 'Your source',
  earlier: 'Earlier, you held',
};

const STATE_WORDS: Partial<Record<FindingState, string>> = {
  kept: 'On your map',
  considered: 'You’ve thought about this',
  dismissed: 'Not relevant',
  resolved: 'Resolved by you',
};

function Quote({ a, onAnchor }: { a: Anchor; onAnchor?: (a: Anchor) => void }) {
  const where = a.from === 'source' ? `${WHERE.source}${a.ref ? ` (${a.ref})` : ''}` : WHERE[a.from];
  const body = (
    <>
      <span className="l6c-where">{where}:</span> <q className="l6c-q">{a.quote}</q>
    </>
  );
  return onAnchor && a.from !== 'earlier' ? (
    <button type="button" className="l6c-anchor" onClick={() => onAnchor(a)} title="Show where this is">
      {body}
    </button>
  ) : (
    <span className="l6c-anchor is-still">{body}</span>
  );
}

function Row({ f, n, state, onAct, onAnchor, readOnly }: { f: Finding; n: number; state: FindingState; onAct: ChallengeCardProps['onAct']; onAnchor?: ChallengeCardProps['onAnchor']; readOnly?: boolean }) {
  const settled = state !== 'open';
  const quiet = state === 'considered' || state === 'dismissed';
  return (
    <li className={`l6c-f is-${f.kind}${quiet ? ' is-quiet' : ''}${state === 'kept' || state === 'resolved' ? ' is-kept' : ''}`}>
      <span className="l6c-n" aria-hidden="true">
        {n}
      </span>
      <div className="l6c-body">
        <p className="l6c-kind">
          {KIND_LABEL[f.kind]}
          {f.question && <span className="l6c-unsure"> · worth asking</span>}
          {settled && STATE_WORDS[state] && <span className="l6c-state"> · {STATE_WORDS[state]}</span>}
        </p>
        <p className="l6c-text">{f.text}</p>
        {!quiet && (
          <>
            <p className="l6c-quotes">
              {f.anchors.map((a, i) => (
                <Quote key={`${a.from}:${a.ref}:${i}`} a={a} onAnchor={onAnchor} />
              ))}
            </p>
            {f.matters && (
              <p className="l6c-more">
                <span className="l6c-k">If it’s wrong:</span> {f.matters}
              </p>
            )}
            {f.settle && (
              <p className="l6c-more">
                <span className="l6c-k">To settle it:</span> {f.settle}
              </p>
            )}
          </>
        )}
        {!readOnly && state === 'open' && (
          <div className="l6c-acts" role="group" aria-label={`What to do with: ${f.text}`}>
            <button type="button" className="l6c-act is-keep" onClick={() => onAct(f, 'kept')}>
              Keep on map
            </button>
            <button type="button" className="l6c-act" onClick={() => onAct(f, 'considered')}>
              I’ve thought about this
            </button>
            <button type="button" className="l6c-act" onClick={() => onAct(f, 'dismissed')}>
              Not relevant
            </button>
            <button type="button" className="l6c-act" onClick={() => onAct(f, 'talked')}>
              Talk it through
            </button>
          </div>
        )}
        {!readOnly && state === 'kept' && (
          <div className="l6c-acts">
            <button type="button" className="l6c-act" onClick={() => onAct(f, 'resolved')}>
              Mark resolved
            </button>
            <button type="button" className="l6c-act" onClick={() => onAct(f, 'talked')}>
              Talk it through
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function ChallengeCard({ challenge: c, latest, onAct, onAnchor, readOnly }: ChallengeCardProps) {
  const [all, setAll] = useState(false);
  const shown = all ? c.findings : c.findings.slice(0, SHOWN);
  const more = c.findings.length - shown.length;
  return (
    <section className={`l6c${latest ? ' is-latest' : ''}`} aria-label="Worth checking">
      <header className="l6c-head">
        <h3 className="l6c-title">{c.findings.length ? 'Worth checking' : 'This holds up'}</h3>
        <span className="l6c-checked">Checked: {checkedLine(c)}</span>
      </header>
      {c.guess && (
        <p className="l6c-guess">
          {c.guess.hit ? (
            <>
              Your guess, <q>{c.guess.label}</q>, is one of them.
            </>
          ) : (
            <>
              You guessed <q>{c.guess.label}</q>. These came first — worth comparing with yours.
            </>
          )}
        </p>
      )}
      {c.findings.length ? (
        <ol className="l6c-list">
          {shown.map((f, i) => (
            <Row key={f.id} f={f} n={i + 1} state={stateOf(c, f.id)} onAct={onAct} onAnchor={onAnchor} readOnly={readOnly} />
          ))}
        </ol>
      ) : (
        <div className="l6c-holds">
          <p className="l6c-text">{c.why || 'On what’s here — your words, your map and your sources — nothing failed the checks.'}</p>
          {c.weakest && (
            <p className="l6c-more">
              <span className="l6c-k">The weakest point, and it’s minor:</span> {c.weakest}
            </p>
          )}
        </div>
      )}
      {more > 0 && (
        <button
          type="button"
          className="l6c-showmore"
          onClick={() => {
            setAll(true);
            onAct(c.findings[SHOWN], 'more');
          }}
        >
          Show {more} more
        </button>
      )}
      {c.structural && <p className="l6c-note">Read from your map’s structure alone: no model answered just now.</p>}
    </section>
  );
}

/** While a challenge is on its way: what is being checked, said truthfully. */
export function ChallengePending({ scope }: { scope: Challenge['scope']['kind'] }) {
  const what = scope === 'card' ? 'this card' : scope === 'selection' ? 'the cards you picked' : scope === 'document' ? 'your document' : 'this line of thinking';
  return (
    <div className="l6c-pending" role="status" aria-live="polite">
      <span className="l6c-dot" aria-hidden="true" />
      Checking {what}: your words, your map and your sources…
    </div>
  );
}
