'use client';

// components/account/LogosInstructions.tsx
//
// Manage Account → Personalization → Your own words, in Logos.
//
// "How should Socria work with you?" — the person's standing instructions,
// which Logos keeps behind its own sheet, from here too. One store, two doors:
// both write through lib/logos-style.ts, and an open Logos hears the change and
// uses it from its next message (STYLE_CHANGED).
//
// There are no dials. Socria's personality is the Conversation Style above,
// and it is the same in Core 4 and in Logos; these words layer over it.
//
// They save on Save, because half a sentence is not an instruction — and words
// being typed survive a save made somewhere else.

import { useEffect, useRef, useState } from 'react';
import { MAX_STYLE, STYLE_CHANGED, storeStyle, storedStyle } from '@/lib/logos-style';

export function LogosInstructions() {
  const [words, setWords] = useState('');
  const [saved, setSaved] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const savedRef = useRef('');

  // Read after mount (they live in this browser), and again whenever Logos —
  // here or in another tab — saves.
  useEffect(() => {
    const read = () => {
      const w = storedStyle();
      setWords((prev) => (prev.trim() === savedRef.current.trim() ? w : prev));
      savedRef.current = w;
      setSaved(w);
    };
    read();
    const fromOtherTab = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith('socria.')) read();
    };
    window.addEventListener(STYLE_CHANGED, read);
    window.addEventListener('storage', fromOtherTab);
    return () => {
      window.removeEventListener(STYLE_CHANGED, read);
      window.removeEventListener('storage', fromOtherTab);
    };
  }, []);

  const dirty = words.trim() !== saved.trim();

  return (
    <div className="persona">
      <label className="persona-words">
        <span className="persona-words-h">How should Socria work with you?</span>
        <textarea
          value={words}
          onChange={(e) => setWords(e.target.value)}
          maxLength={MAX_STYLE}
          rows={4}
          placeholder={'Talk casually with me. Keep responses concise.\nChallenge my assumptions more, and ask fewer questions.'}
        />
      </label>
      <div className="persona-row">
        <button
          type="button"
          className="persona-save"
          disabled={!dirty}
          onClick={() => {
            storeStyle(words);
            setSaved(words.trim());
            savedRef.current = words.trim();
            setNote('Saved. Logos uses it from your next message.');
          }}
        >
          Save
        </button>
        {words.trim() && (
          <button type="button" className="persona-clear" onClick={() => setWords('')}>
            Clear
          </button>
        )}
        {note && (
          <span className="persona-note" role="status">
            {note}
          </span>
        )}
      </div>
      <p className="persona-fine">
        Kept in this browser. How Socria works with you, not its principles: your thinking, your authorship and the
        learning guard stay yours whatever you write.
      </p>
    </div>
  );
}
