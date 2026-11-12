'use client';
// components/logos5/GiftNote.tsx — A SMALL NOTE ABOUT A GIFT (lib/gifts.ts).
//
// The tip card's own look (tips.css, .l5tip), pinned to the top right instead
// of pointing at something: a label, a title, a sentence, one action and a
// word to close it. Never modal, never over a sheet (it sits below them), closes
// on Escape, and goes by itself after a while if left alone — unless the
// pointer is resting on it.

import { useEffect, useRef, useState } from 'react';
import { GIFT_NOTES, endSaid, inTryVisit, lastNoteAt, noteAllowed, offered, readThemeGift, themeGiftDue, themeTryEnded, writeThemeGift, type GiftNoteKind, type ThemeGift } from '@/lib/gifts';
import './tips.css';

const LINGER_MS = 16_000;

export function GiftNote({ kind, onAction, onClose }: { kind: GiftNoteKind; onAction: () => void; onClose: () => void }) {
  const note = GIFT_NOTES[kind];
  const [held, setHeld] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (held) return;
    const t = setTimeout(() => closeRef.current(), LINGER_MS);
    return () => clearTimeout(t);
  }, [held, kind]);

  return (
    <div className="l5tip l5gift is-placed" role="status" aria-live="polite" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocus={() => setHeld(true)}>
      <span className="l5tip-k">
        <i aria-hidden />
        {kind === 'theme-ended' ? 'Socria One' : 'Socria One · on us'}
      </span>
      <p className="l5tip-t">{note.title}</p>
      <p className="l5tip-b">{note.body}</p>
      <span className="l5tip-row">
        <button type="button" className="l5tip-ok" onClick={onClose}>
          {note.dismiss}
        </button>
        <button type="button" className="l5tip-go" onClick={onAction}>
          {note.action}
        </button>
      </span>
    </div>
  );
}

/**
 * The one try of Celestial, checked once per visit when the app is idle (`ready`): first the end of a
 * try taken in an earlier visit (their own theme back, said once), else the offer if it has never been
 * made. Waits a little after becoming ready, so nothing appears the moment the page opens.
 */
export function ThemeGiftCheck({
  ready,
  settleMs = 15_000,
  onEnded,
  onDue,
}: {
  ready: boolean;
  settleMs?: number;
  /** the try is over: put their theme back and say so */
  onEnded: (g: ThemeGift) => void;
  /** an offer is due */
  onDue: () => void;
}) {
  const done = useRef(false);
  const cb = useRef({ onEnded, onDue });
  cb.current = { onEnded, onDue };
  useEffect(() => {
    if (!ready || done.current) return;
    const t = setTimeout(() => {
      done.current = true;
      const now = Date.now();
      const g = readThemeGift(now);
      writeThemeGift(g); // remembers when this browser first came
      if (themeTryEnded(g, inTryVisit())) {
        writeThemeGift(endSaid(g));
        cb.current.onEnded(g);
      } else if (themeGiftDue(g, now) && noteAllowed('theme-offer', lastNoteAt(), now)) {
        writeThemeGift(offered(g, now));
        cb.current.onDue();
      }
    }, settleMs);
    return () => clearTimeout(t);
  }, [ready, settleMs]);
  return null;
}
