'use client';
// components/Logos2Cover.tsx
//
// The cover of Logos 2: what it is, shown by being it.
//
// This is the one introduction the product keeps for its environment. It
// takes the slot the Core 4 announcement held in the chat — the pill beside
// the composer, the sheet a gated pick opens — and it IS the gate somebody
// without an account meets on the Logos surface itself, so the two doors say
// the same thing in the same words.
//
// THE STAGE IS THE REAL THING, which is the only rule that keeps a cover
// honest: it mounts the product's own ModelView on a model the engine built
// and validated from the library — the saddle — with its own controls. Move
// `a` here and the surface recomputes the way it will inside. Not a film of
// the feature, not a drawing of it: the feature, in a smaller frame.
//
// AND ALMOST NO PROSE AROUND IT. A title, one standfirst, the terms, and the
// way in. The terms are read from the plan table rather than written here, so
// "two lines of thinking a month" cannot go stale while the number it
// describes changes underneath it.

import { useEffect, useMemo, useState } from 'react';
import { ModelView } from '@/components/model/ModelView';
import { ModelGlyph } from '@/components/ModelGlyph';
import { modelById } from '@/lib/model/library';
import { PLANS } from '@/lib/entitlements';

/** "Two", for the terms line — a numeral past what reads as a word. */
function spell(n: number | null): string {
  if (n === null) return 'Unlimited';
  return (['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][n] ?? String(n));
}

/** The free month, as the plan table states it. Exported so a suite can hold it to the table. */
export function freeTerms(): string {
  const n = PLANS.free.counters.chats;
  if (n === null) return 'Every line of thinking, free.';
  return `${spell(n)} line${n === 1 ? '' : 's'} of thinking a month, free. Socria One for every one after.`;
}

export function Logos2Cover({
  as,
  open = true,
  isSignedIn,
  onClose,
  onStart,
  primaryHref,
  onUnlock,
}: {
  /** a sheet over the chat, or the gate on the Logos surface itself */
  as: 'modal' | 'gate';
  open?: boolean;
  isSignedIn: boolean;
  /** modal only: closed, with whether they asked not to see it again */
  onClose?: (dontShowAgain: boolean) => void;
  /** modal only: open Logos 2, or go to sign-in — the caller decides which */
  onStart?: () => void;
  /** gate only: where signing in goes */
  primaryHref?: string;
  /** the access-key path, kept for people without an account; true when it opened */
  onUnlock?: (key: string) => boolean | Promise<boolean>;
}) {
  const [dontShow, setDontShow] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [key, setKey] = useState('');
  const [keyError, setKeyError] = useState(false);
  // Built once per cover. The library sanitises on the way out, exactly as a
  // model arriving from a conversation would be.
  const model = useMemo(() => modelById('saddle'), []);

  useEffect(() => {
    if (!open || as !== 'modal' || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(dontShow);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, as, onClose, dontShow]);

  if (!open) return null;

  const submitKey = async () => {
    const typed = key.trim();
    if (!typed || !onUnlock) return;
    const ok = await onUnlock(typed);
    setKeyError(!ok);
  };

  const card = (
    <div className={`core3-modal-card j3-card l2-card${as === 'gate' ? ' is-gate' : ''}`} onClick={(e) => e.stopPropagation()}>
      {as === 'modal' && onClose && (
        <button type="button" onClick={() => onClose(dontShow)} className="core3-modal-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      <div className="j3-masthead">
        <span className="j3-brand">Socria</span>
        <span className="j3-folio">Logos 2</span>
      </div>

      <div className="l2-head">
        <h2 id="logos2-cover-title" className="j3-title reveal-in" style={{ animationDelay: '60ms' }}>
          Your thinking, as a model <span className="j3-title-em">you can move.</span>
        </h2>
        <p className="j3-standfirst reveal-in" style={{ animationDelay: '130ms' }}>
          Say what you are working through. Logos 2 builds a model of it beside you — quantities,
          relationships, what depends on what. Move a value and what depends on it moves. Ask about
          anything on it by name.
        </p>
      </div>

      {/* The real thing: a sentence, and the model the engine built from one like it. */}
      <div className="l2-stage reveal-in lg-tokens" style={{ animationDelay: '200ms' }}>
        <p className="l2-said">
          <span className="l2-said-k">You</span>
          Why is a saddle point not a maximum, when it looks like a top from one side?
        </p>
        <div className="l2-frame">
          {model && <ModelView model={model} fill />}
        </div>
        <p className="l2-cue">
          Live, and the engine&rsquo;s own. <em>Move a or b.</em>
        </p>
      </div>

      <div className="j3-body l2-body">
        {/* The terms, read from the plan table. */}
        <p className="l2-terms reveal-in" style={{ animationDelay: '260ms' }}>{freeTerms()}</p>

        <div className="core3-modal-footer reveal-in" style={{ animationDelay: '300ms' }}>
          {as === 'modal' ? (
            <label className="core3-modal-checkbox">
              <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
              <span>Don&rsquo;t show again</span>
            </label>
          ) : (
            <span />
          )}
          {as === 'gate' && primaryHref ? (
            <a href={primaryHref} className="core3-modal-primary">
              <span className="core3-modal-primary-shine" aria-hidden />
              <span className="tl-primary-mark" aria-hidden>
                <ModelGlyph model="logos-2" size={15} />
              </span>
              <span className="core3-modal-primary-label">Sign in to open Logos 2</span>
              <span aria-hidden className="core3-modal-primary-arrow">→</span>
            </a>
          ) : (
            <button type="button" onClick={onStart} className="core3-modal-primary">
              <span className="core3-modal-primary-shine" aria-hidden />
              <span className="tl-primary-mark" aria-hidden>
                <ModelGlyph model="logos-2" size={15} />
              </span>
              <span className="core3-modal-primary-label">
                {isSignedIn ? 'Open Logos 2' : 'Sign in to open Logos 2'}
              </span>
              <span aria-hidden className="core3-modal-primary-arrow">→</span>
            </button>
          )}
        </div>

        {/* The access key stays for people without an account — comped
            members, anyone handed a code — behind a quiet disclosure. */}
        {onUnlock && !isSignedIn && (
          <div className="l2-key">
            <button type="button" className="l2-key-toggle" aria-expanded={keyOpen} onClick={() => setKeyOpen((v) => !v)}>
              Have an access key?
            </button>
            {keyOpen && (
              <div className="l2-key-row">
                <input
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Access key"
                  value={key}
                  className={keyError ? 'is-error' : undefined}
                  aria-label="Access key"
                  onChange={(e) => {
                    setKey(e.target.value);
                    if (keyError) setKeyError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submitKey();
                    }
                  }}
                />
                <button type="button" onClick={() => void submitKey()}>Enter</button>
              </div>
            )}
            {keyError && (
              <span className="l2-key-error" role="alert">
                That key isn&rsquo;t right.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (as === 'gate') {
    return (
      <div className="lg-gate l2-gate" role="region" aria-labelledby="logos2-cover-title">
        {card}
      </div>
    );
  }
  return (
    <div
      className="core3-modal-backdrop"
      onClick={() => onClose?.(dontShow)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logos2-cover-title"
    >
      {card}
    </div>
  );
}
