'use client';

// app/transfer/ut-austin-fall-2026/AskSocria.tsx — "Reason through it with
// Socria": a small chatbox at the bottom of the transfer page.
//
// It rises a moment after the page opens, and closes for the rest of the visit
// when they close it (the button near the top opens it again). What they type
// is handed to Socria Logos 5.5 the way onboarding hands over its sentence
// (lib/onboarding-script.ts carry), with the figures they were looking at
// (lib/transfer/explore.ts askMessage), and sent as soon as the chat opens —
// they land on Socria answering, in a conversation of their own.

import { useEffect, useRef, useState } from 'react';
import { carry } from '@/lib/onboarding-script';

const CLOSED_KEY = 'socria.transfer.ask.closed';
const DELAY_MS = 2200;

export function AskSocria({ open, setOpen, message, starters }: { open: boolean; setOpen: (v: boolean) => void; message: (question: string) => string; starters: readonly string[] }) {
  const [text, setText] = useState('');
  const [going, setGoing] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  // the rise on its own never takes the cursor from what they are reading
  const rose = useRef(false);

  // rise once, a moment in, unless they closed it earlier in this visit
  useEffect(() => {
    let closed = false;
    try {
      closed = sessionStorage.getItem(CLOSED_KEY) === '1';
    } catch {}
    if (closed) return;
    const t = setTimeout(() => {
      rose.current = true;
      setOpen(true);
    }, DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // opened from a button: put the cursor in the box
  useEffect(() => {
    if (!open) rose.current = false;
    else if (!rose.current) box.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(CLOSED_KEY, '1');
    } catch {}
  };

  const send = (question: string) => {
    if (going) return;
    setGoing(true);
    carry(typeof window !== 'undefined' ? window.sessionStorage : null, {
      text: message(question),
      intent: 'transfer-ut-austin-fall-2026',
      surface: 'logos',
      model: 'logos-3',
      send: true,
    });
    window.location.assign('/chat');
  };

  if (!open) return null;
  return (
    <aside className="xf-ask" role="dialog" aria-label="Reason through it with Socria" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <header className="xf-ask-head">
        <div>
          <p className="xf-ask-kicker">Socria Logos 5.5 · free to try</p>
          <h2>Reason through it with Socria</h2>
        </div>
        <button type="button" className="xf-ask-close" onClick={close} aria-label="Close">
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>
      <p className="xf-ask-lede">Ask about these results or your own application. Socria takes what you&rsquo;re looking at with it, and helps you think it through rather than guessing your odds.</p>
      <ul className="xf-ask-starters">
        {starters.map((s) => (
          <li key={s}>
            <button type="button" onClick={() => send(s)} disabled={going}>
              {s}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="xf-ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send(text);
        }}
      >
        <textarea
          ref={box}
          rows={2}
          value={text}
          maxLength={600}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (text.trim()) send(text);
            }
          }}
          placeholder="Ask Socria anything about your transfer…"
          aria-label="Your question"
        />
        <button type="submit" className="xf-ask-send" disabled={!text.trim() || going} aria-label="Ask Socria">
          {going ? (
            <span className="xf-ask-spin" aria-hidden />
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
            </svg>
          )}
        </button>
      </form>
      <p className="xf-ask-foot">Opens Socria in this tab. No account needed to start.</p>
    </aside>
  );
}
