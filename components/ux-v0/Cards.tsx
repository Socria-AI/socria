'use client';
// components/ux-v0/Cards.tsx — reasoning, attached to the part of the design it is about.
//
// Each card belongs to one selection and carries its whole history: the first
// comment and SocriaUX's reasoning, then every follow-up, inside the card —
// never an alternating chat. It is drawn as Logos 6 draws a challenge: between
// hairlines, a label, the reading, the questions in the serif, principles and
// issues as rows with their evidence, and actions as words.

import type { CardTurn, ReasoningCard, Verdict } from '@/lib/ux-v0/types';

const VERDICT: Record<Verdict, string> = { works: 'Works', mixed: 'Mixed', problem: 'Worth changing', unclear: 'Open question' };

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function Turn({ t, first, onRetry, pending }: { t: CardTurn; first: boolean; onRetry?: () => void; pending: boolean }) {
  const r = t.reasoning;
  return (
    <div className={`v0-turn${first ? ' is-first' : ''}`}>
      <p className="v0-you">
        <span className="v0-you-k">{first ? 'You' : 'You, again'}</span> {t.comment}
      </p>
      {pending && !r && !t.error && (
        <p className="v0-quiet" role="status" aria-live="polite">
          Reading the selection…
        </p>
      )}
      {t.error && (
        <p className="v0-error-line" role="alert">
          {t.error}{' '}
          {onRetry && (
            <button type="button" className="sb-link is-meta is-strong" onClick={onRetry}>
              Try again
            </button>
          )}
        </p>
      )}
      {r && (
        <div className="v0-reasoning">
          <p className="v0-read">
            <span className={`v0-verdict v-${r.verdict}`}>{VERDICT[r.verdict]}</span> {r.read}
          </p>
          {r.questions.length > 0 && (
            <div className="v0-asks">
              {r.questions.map((q, i) => (
                <p key={i} className="v0-ask">
                  {q}
                </p>
              ))}
            </div>
          )}
          {r.issues.length > 0 && (
            <ol className="v0-rows">
              {r.issues.map((x, i) => (
                <li key={i} className="v0-row">
                  <span className="v0-row-n" aria-hidden="true">
                    <span className="sb-glyph is-objection" />
                  </span>
                  <div>
                    <p className="v0-row-text">{x.text}</p>
                    <p className="v0-row-meta">
                      Rests on <span className="v0-quote">“{x.evidence}”</span>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {r.principles.length > 0 && (
            <dl className="v0-principles">
              {r.principles.map((x, i) => (
                <div key={i}>
                  <dt>{x.name}</dt>
                  <dd>{x.applies}</dd>
                </div>
              ))}
            </dl>
          )}
          {r.alternatives.length > 0 && (
            <div className="v0-alts">
              <span className="sb-label">You could</span>
              <ul>
                {r.alternatives.map((x, i) => (
                  <li key={i}>
                    <span>{x.text}</span>
                    <span className="v0-tradeoff">Trade-off: {x.tradeoff}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.basis && <p className="v0-basis">{r.basis}</p>}
        </div>
      )}
    </div>
  );
}

export function CardView({
  card,
  active,
  pendingTurn,
  onActivate,
  onShow,
  onState,
  onRetry,
}: {
  card: ReasoningCard;
  active: boolean;
  pendingTurn: string | null;
  onActivate: () => void;
  onShow: () => void;
  onState: (s: ReasoningCard['state']) => void;
  onRetry: (turnId: string) => void;
}) {
  return (
    <article className={`v0-card${active ? ' is-active' : ''}${card.state === 'dismissed' ? ' is-out' : ''}`} aria-label={`Card ${card.n}: ${card.selection.label}`}>
      <header className="v0-card-head">
        <span className="v0-card-n" aria-hidden="true">
          {card.n}
        </span>
        <button type="button" className="v0-card-on" onClick={onShow} title="Show it on the design">
          {card.selection.label}
        </button>
        <span className="v0-card-when">
          {card.selection.viewport ? `${card.selection.viewport} · ` : ''}
          {ago(card.updatedAt)}
        </span>
      </header>
      {card.turns.map((t, i) => (
        <Turn key={t.id} t={t} first={i === 0} pending={pendingTurn === t.id} onRetry={t.error ? () => onRetry(t.id) : undefined} />
      ))}
      <div className="v0-card-acts">
        {card.state === 'kept' && <span className="v0-state">Kept</span>}
        {card.state !== 'dismissed' && (
          <button type="button" className={`sb-link is-meta${active ? ' is-strong' : ''}`} onClick={onActivate} aria-pressed={active}>
            {active ? 'Replying' : 'Reply'}
          </button>
        )}
        {card.state === 'open' && (
          <button type="button" className="sb-link is-meta" onClick={() => onState('kept')}>
            Keep
          </button>
        )}
        {card.state !== 'dismissed' ? (
          <button type="button" className="sb-link is-meta" onClick={() => onState('dismissed')}>
            Dismiss
          </button>
        ) : (
          <button type="button" className="sb-link is-meta" onClick={() => onState('open')}>
            Restore
          </button>
        )}
        <button type="button" className="sb-link is-meta" onClick={onShow}>
          Show on design
        </button>
      </div>
    </article>
  );
}

export function CardsRail({
  cards,
  active,
  pendingTurn,
  onActivate,
  onShow,
  onState,
  onRetry,
  empty,
}: {
  cards: ReasoningCard[];
  active: string | null;
  pendingTurn: string | null;
  onActivate: (id: string | null) => void;
  onShow: (id: string) => void;
  onState: (id: string, s: ReasoningCard['state']) => void;
  onRetry: (cardId: string, turnId: string) => void;
  empty: string;
}) {
  const live = cards.filter((c) => c.state !== 'dismissed').sort((a, b) => b.updatedAt - a.updatedAt);
  const out = cards.filter((c) => c.state === 'dismissed');
  return (
    <div className="v0-cards">
      {!live.length && <p className="v0-empty">{empty}</p>}
      {live.map((c) => (
        <CardView
          key={c.id}
          card={c}
          active={active === c.id}
          pendingTurn={pendingTurn}
          onActivate={() => onActivate(active === c.id ? null : c.id)}
          onShow={() => onShow(c.id)}
          onState={(s) => onState(c.id, s)}
          onRetry={(t) => onRetry(c.id, t)}
        />
      ))}
      {out.length > 0 && (
        <details className="v0-dismissed">
          <summary className="sb-link is-meta">Dismissed ({out.length})</summary>
          {out.map((c) => (
            <CardView key={c.id} card={c} active={false} pendingTurn={null} onActivate={() => undefined} onShow={() => onShow(c.id)} onState={(s) => onState(c.id, s)} onRetry={() => undefined} />
          ))}
        </details>
      )}
    </div>
  );
}
