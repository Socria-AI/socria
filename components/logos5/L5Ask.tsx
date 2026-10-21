'use client';
// components/logos5/L5Ask.tsx — "Asking about": a card on the map, asked
// about where it is.
//
// Pressing a card on the Logic Map opens this beside it (inside the map's own
// card menu, so the card's other actions are a press away under it). It says
// which card, the last thing asked about it and Socria's answer — streaming,
// if it is on its way — where the card came from, and takes the next question
// right there. What is asked here is an ordinary turn of the conversation,
// with the card as its Point & Ask subject: nothing new is stored.

import { useState } from 'react';

export interface AskExchange {
  /** what was asked about the card, in the person's words */
  q: string;
  /** Socria's answer — or what has arrived of it */
  a: string;
  streaming: boolean;
}

export function L5Ask({
  label,
  exchange,
  came,
  quick,
  onAsk,
  onClose,
  busy,
}: {
  label: string;
  exchange: AskExchange | null;
  /** where the card came from: "Came from 2 messages", pressed to show them */
  came: { said: string; onShow?: () => void } | null;
  /** questions a press away: what the chip says, and what is asked */
  quick: { label: string; text: string }[];
  onAsk: (text: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [text, setText] = useState('');
  const send = (t: string) => {
    const q = t.trim();
    if (!q || busy) return;
    onAsk(q);
    setText('');
  };
  return (
    <div className="l5-ask" role="group" aria-label={`Asking about ${label}`}>
      <div className="l5-ask-head">
        <span className="l5-ask-what">
          <span className="l5-ask-k">Asking about</span>
          <span className="l5-ask-t">{label}</span>
        </span>
        <button type="button" className="l5-ask-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {exchange && (
        <>
          <p className="l5-ask-q">{exchange.q}</p>
          <p className={`l5-ask-a${exchange.streaming ? ' is-streaming' : ''}`}>
            {exchange.a || (exchange.streaming ? 'Thinking…' : '')}
            {came && !exchange.streaming && (
              <>
                {' '}
                {came.onShow ? (
                  <button type="button" className="l5-ask-from" onClick={came.onShow}>
                    {came.said} ›
                  </button>
                ) : (
                  <span className="l5-ask-from">{came.said}</span>
                )}
              </>
            )}
          </p>
        </>
      )}
      {!exchange && came && (
        <p className="l5-ask-a">
          {came.onShow ? (
            <button type="button" className="l5-ask-from" onClick={came.onShow}>
              {came.said} ›
            </button>
          ) : (
            <span className="l5-ask-from">{came.said}</span>
          )}
        </p>
      )}
      <div className="l5-ask-chips">
        {quick.map((q) => (
          <button key={q.label} type="button" className="l5-ask-chip" disabled={busy} onClick={() => send(q.text)}>
            {q.label}
          </button>
        ))}
      </div>
      <form
        className="l5-ask-in"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about this card…" aria-label={`Ask about ${label}`} style={{ fontSize: 16 }} />
        <button type="submit" className="l5-ask-go" aria-label="Ask" disabled={!text.trim() || busy}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
