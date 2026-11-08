'use client';

// components/OnePrompt.tsx
//
// The Socria One prompt: the sheet that opens at one boundary — a spent
// allowance, Voice, sharing — and answers the only question someone has at
// that moment: why did that stop, and how do I keep going.
//
// It is drawn in Logos 5's own paper (components/one/one-sheet.css), the same
// surface as the plan sheet (SocriaOneModal), with Socria One's blue kept for
// the monogram, the name and the one button that buys it. It used to be the
// /one cover's dark Prussian-blue plate at the scale of an interruption, which
// read as a page dropped over the conversation from somewhere else.
//
// What it drops is the comparison table: SocriaOneModal keeps that, for
// someone who has chosen to go and look at One. In front of someone who just
// pressed Explore and found it had stopped, a feature list is not an answer.
// So this says the answer, shows the month's count when it is a count, and the
// foot links to the page that carries everything.
//
// What is deliberately absent: any countdown, any "limited time", any
// animation beyond the one that gets it on screen without a jump. The price
// is on the face of it, because hiding it until checkout is its own kind of
// dark pattern. The dismissal is a real phrase, not only a grey ✕.

import { useEffect, useId, useRef } from 'react';
import { SOCRIA_ONE } from '@/lib/socria-one';
import { COUNTER_NOUN, COUNTERS, resetsAt, type Counter } from '@/lib/entitlements';
import { L5Close } from './logos5/L5Chrome';
import type { OnePromptView } from './useOnePrompt';
import './one/one-sheet.css';
import './logos5/l5-controls.css';

/**
 * The allowance a limit prompt is about, as a count — "3 of 3 conversations
 * used this month · starts again on 1 November" — from the same numbers the
 * server refused at (/api/logos/usage). Null for anything but a spent monthly
 * allowance.
 */
export function promptMeter(view: Pick<OnePromptView, 'reason'> | null, usage?: Partial<Record<string, { used: number; limit: number | null }>>, at = Date.now()): { line: string; used: number; limit: number } | null {
  const reason = view?.reason ?? '';
  const c = reason.endsWith('-spent') ? reason.slice(0, -'-spent'.length) : '';
  if (!(COUNTERS as readonly string[]).includes(c)) return null;
  const counter = c as Counter;
  const u = usage?.[counter];
  const noun = COUNTER_NOUN[counter];
  if (!u || u.limit === null || u.limit <= 0 || !noun) return null;
  const when = resetsAt(counter, at);
  const day = when ? new Date(when).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) : null;
  const used = Math.min(u.used, u.limit);
  return { used, limit: u.limit, line: `${used} of ${u.limit} free ${u.limit === 1 ? noun.one : noun.many} used this month${day ? ` · starts again on ${day}` : ''}` };
}

export function OnePrompt({
  view,
  onDismiss,
  onAccept,
  busy,
  error,
  usage,
}: {
  view: OnePromptView | null;
  onDismiss: () => void;
  /** Opens checkout. The caller reports the click; this only calls it. */
  onAccept: () => void;
  busy?: boolean;
  error?: string | null;
  /** the month's counts (/api/logos/usage), for a limit prompt's meter */
  usage?: Partial<Record<string, { used: number; limit: number | null }>>;
}) {
  const id = useId();
  const goRef = useRef<HTMLButtonElement>(null);
  const open = !!view?.open;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    // Move focus to the primary action so a keyboard user is not left behind
    // the page. Not a full focus trap — the sheet is four controls, and
    // tabbing out of it lands on the page they were already using.
    goRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!view || !open) return null;
  const meter = promptMeter(view, usage);

  return (
    <div className="os-scrim" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-s`}>
      <div className="os-back" onClick={onDismiss} aria-hidden="true" />
      <div className={`os-sheet is-${view.category}`}>
        <span className="os-grab" aria-hidden="true" />
        <L5Close label="Close" onClose={onDismiss} className="os-x" />

        {/* The price sits on the face, beside the name. */}
        <p className="os-brand">
          <span className="os-mono" aria-hidden="true">
            <span>I</span>
          </span>
          Socria One
          <span className="os-price">
            {SOCRIA_ONE.currency}
            {SOCRIA_ONE.price} a {SOCRIA_ONE.period}
          </span>
        </p>

        <h2 id={`${id}-t`} className="os-title">
          {view.title}
        </h2>
        <p id={`${id}-s`} className="os-sub">
          {view.body}
        </p>

        {meter && (
          <div className="os-meter">
            <span className="os-meter-bar" role="img" aria-label={`${meter.used} of ${meter.limit} used`}>
              <i style={{ width: `${Math.round((meter.used / meter.limit) * 100)}%` }} />
            </span>
            <span className="os-meter-l">{meter.line}</span>
          </div>
        )}

        {error && (
          <p className="os-err" role="alert">
            {error}
          </p>
        )}

        <div className="os-actions">
          <button ref={goRef} type="button" className="l5-btn is-primary is-one is-wide" onClick={onAccept} disabled={busy}>
            {busy ? (
              'Opening checkout…'
            ) : (
              <>
                {view.primary}
                <span className="l5-ar" aria-hidden="true">
                  →
                </span>
              </>
            )}
          </button>
          <button type="button" className="l5-btn is-quiet" onClick={onDismiss}>
            {view.secondary}
          </button>
        </div>

        <p className="os-foot">
          Cancel anytime. Your maps stay yours. <a href="/one">See everything One opens</a>
        </p>
      </div>
    </div>
  );
}
