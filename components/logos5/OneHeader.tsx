'use client';
// components/logos5/OneHeader.tsx — SOCRIA ONE, A PRESS AWAY, AND A WORD WHEN THEY COME BACK.
//
// A free account had no way to Socria One but the ⋯ menu. This puts a small
// button beside the account chip, and when somebody comes back, a small note
// under it — "Welcome back" and one true sentence about what One adds — rather
// than a sheet over their work.
//
// When to say it is not decided here: it is the "welcome-back" prompt
// (lib/one-prompt.ts), with its rules — never to a member, never on a first
// visit, never in a reflective conversation, once a tab, hours apart — and
// its four lines in turn. This only asks, once, when the Universal Map is on
// screen and nothing else is, and draws the answer small.

import { useEffect, useRef } from 'react';
import './tips.css';

export function OneButton({
  onOpen,
  note,
}: {
  /** the plan sheet, as the ⋯ menu's Socria One opens it */
  onOpen: () => void;
  /** the note on return, when the welcome-back prompt said yes */
  note: { first: string | null; title: string; line: string; onSee: () => void; onLater: () => void } | null;
}) {
  return (
    <>
      <button
        type="button"
        className={`l5-onebtn${note ? ' has-note' : ''}`}
        onClick={onOpen}
        aria-label="Socria One"
        title="Socria One — unlimited conversations, with Voice and sharing"
      >
        <i aria-hidden="true" />
        <span className="l5-onebtn-l">Socria One</span>
        <span className="l5-onebtn-s" aria-hidden="true">
          One
        </span>
      </button>
      {note && (
        <div className="l5-onenote" role="dialog" aria-label="Socria One">
          <p className="l5-onenote-k">{note.first ? `Welcome back, ${note.first}.` : 'Welcome back.'}</p>
          <p className="l5-onenote-t">{note.title}</p>
          <p className="l5-onenote-b">{note.line}</p>
          <span className="l5tip-row">
            <button type="button" className="l5tip-go" onClick={note.onSee}>
              See Socria One
            </button>
            <button type="button" className="l5tip-ok" onClick={note.onLater}>
              Not now
            </button>
          </span>
        </div>
      )}
    </>
  );
}

/** Asks for the welcome-back once a visit, when `ready`; the prompt's own rules decide whether it shows. */
export function WelcomeBack({ ready, ask }: { ready: boolean; ask: (reason: 'welcome-back') => unknown }) {
  const asked = useRef(false);
  useEffect(() => {
    if (!ready || asked.current) return;
    asked.current = true;
    ask('welcome-back');
  }, [ready, ask]);
  return null;
}
