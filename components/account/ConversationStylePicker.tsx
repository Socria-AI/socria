'use client';
// components/account/ConversationStylePicker.tsx
//
// Manage Account → Personalization → Conversation style.
//
// Four characters for one Socria, chosen once for the account and used in
// Core 4 and in Logos (lib/conversation-style.ts). The choice is the
// account's, so it follows the person to every device; this tab hears it at
// once and the next message — in a new conversation or one already open —
// is written in it.
//
// The sample under the four is the point of the section: the same message,
// answered by Core 4 and by Logos in the style in view. Hovering or focusing
// a style previews it; choosing one keeps it. The lines are illustrative,
// written for this sheet — the product's replies are its own.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  CONVERSATION_STYLES,
  STYLE_META,
  STYLE_SAMPLE_PROMPT,
  type ConversationStyle,
} from '@/lib/conversation-style';
import { restoreConversationStyle, saveConversationStyle, useConversationStyle, type StyleSave } from '@/components/useConversationStyle';

const SAID: Record<StyleSave | 'saving', string> = {
  saving: 'Saving…',
  account: 'Saved. Your next message uses it, on every device.',
  device: 'Saved on this device. Your account cannot keep it yet, so other devices will not see it.',
  failed: 'That did not save, so nothing changed. Try again in a moment.',
};

export function ConversationStylePicker({ signedIn = true }: { signedIn?: boolean }) {
  const { style } = useConversationStyle(signedIn);
  const [preview, setPreview] = useState<ConversationStyle | null>(null);
  const [status, setStatus] = useState<StyleSave | 'saving' | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  const choose = async (next: ConversationStyle) => {
    if (next === style) return;
    const before = style;
    setStatus('saving');
    const where = await saveConversationStyle(next);
    if (where === 'failed') restoreConversationStyle(before);
    setStatus(where);
    if (settle.current) clearTimeout(settle.current);
    // the plain confirmation fades; the two that need reading stay
    if (where === 'account') settle.current = setTimeout(() => setStatus(null), 4000);
  };

  // A radio group moves with the arrow keys, and only the chosen one is a tab stop.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = CONVERSATION_STYLES.length;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const j = (i + step + n) % n;
    buttons.current[j]?.focus();
    void choose(CONVERSATION_STYLES[j]);
  };

  const shown = STYLE_META[preview ?? style];

  return (
    <div className="cs">
      <div className="cs-grid" role="radiogroup" aria-label="Conversation style" onMouseLeave={() => setPreview(null)}>
        {CONVERSATION_STYLES.map((id, i) => {
          const m = STYLE_META[id];
          const on = style === id;
          return (
            <button
              key={id}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={`cs-o${on ? ' on' : ''}`}
              data-style={id}
              onClick={() => void choose(id)}
              onKeyDown={(e) => onKey(e, i)}
              onMouseEnter={() => setPreview(id)}
              onFocus={() => setPreview(id)}
              onBlur={() => setPreview(null)}
            >
              <span className="cs-name">
                {m.label}
                {id === 'thinker' && <span className="cs-tag">Default</span>}
              </span>
              <span className="cs-line">{m.line}</span>
            </button>
          );
        })}
      </div>

      <figure className="cs-sample" aria-label={`How ${shown.label} might sound`}>
        <p className="cs-ask">
          <span className="cs-who">You</span>
          {STYLE_SAMPLE_PROMPT}
        </p>
        <p className="cs-say">
          <span className="cs-who">Core 4</span>
          <span className="cs-q">{shown.sample.core}</span>
        </p>
        <p className="cs-say">
          <span className="cs-who">Logos</span>
          <span className="cs-q">{shown.sample.logos}</span>
        </p>
        <figcaption className="cs-cap">
          {preview && preview !== style ? `${shown.label}, previewed — choose it to keep it.` : 'For example. Each product keeps its own voice in every style.'}
        </figcaption>
      </figure>

      <p className="cs-note">
        It changes how Socria sounds. Never what is true, what stays yours to work out, or your Depth. In Logos, any
        Personality dials you have moved fine-tune it.
      </p>
      <p className={`cs-status${status === 'failed' ? ' is-bad' : ''}`} role="status" aria-live="polite">
        {status ? SAID[status] : ''}
      </p>
    </div>
  );
}
