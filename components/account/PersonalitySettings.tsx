'use client';

// components/account/PersonalitySettings.tsx
//
// Manage Account → Personalization → Socria Personality.
//
// The nine dials and the person's own instructions that Logos keeps behind
// its "Socria Personality" sheet, brought to where the rest of how Socria
// talks with you lives. One store, two doors: both write through
// lib/logos-personality.ts and lib/logos-style.ts, and an open Logos hears
// the change and uses it from its next message (PERSONALITY_CHANGED).
//
// THE ORDER OF WHAT WINS, said where the controls are: the Conversation
// Style above sets the character; a dial someone moves here wins on the one
// aspect it names; their own words come after both. None of it touches the
// protected principles — the authorship line, the learning guard.
//
// The dials save as they move, like the style picker above them. The words
// save on Save, because half a sentence is not an instruction.

import { useEffect, useRef, useState } from 'react';
import { PersonalityDial } from '@/components/PersonalityDial';
import {
  DEFAULT_PERSONALITY,
  PERSONALITY_CHANGED,
  PERSONALITY_DIMENSIONS,
  isDefaultPersonality,
  storePersonality,
  storedPersonality,
  type Personality,
} from '@/lib/logos-personality';
import { MAX_STYLE, storeStyle, storedStyle } from '@/lib/logos-style';

export function PersonalitySettings() {
  const [persona, setPersona] = useState<Personality>(DEFAULT_PERSONALITY);
  const [words, setWords] = useState('');
  const [saved, setSaved] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const savedRef = useRef('');

  // Read after mount (it lives in this browser), and again whenever Logos —
  // here or in another tab — saves. Words being typed and not yet saved are
  // kept: a dial moved mid-sentence saves the dial, not an empty box.
  useEffect(() => {
    const read = () => {
      setPersona(storedPersonality());
      const w = storedStyle();
      setWords((prev) => (prev.trim() === savedRef.current.trim() ? w : prev));
      savedRef.current = w;
      setSaved(w);
    };
    read();
    const fromOtherTab = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith('socria.')) read();
    };
    window.addEventListener(PERSONALITY_CHANGED, read);
    window.addEventListener('storage', fromOtherTab);
    return () => {
      window.removeEventListener(PERSONALITY_CHANGED, read);
      window.removeEventListener('storage', fromOtherTab);
    };
  }, []);

  const move = (next: Personality) => {
    setPersona(next);
    storePersonality(next);
    setNote('Saved. Logos uses it from your next message.');
  };

  const dirty = words.trim() !== saved.trim();

  return (
    <div className="persona">
      <div className="lg-tokens">
        <div className="lg-persona-grid">
          {PERSONALITY_DIMENSIONS.map((d) => (
            <PersonalityDial
              key={d.id}
              dimension={d}
              value={persona[d.id] ?? d.options[0].id}
              onChange={(next) => move({ ...persona, [d.id]: next })}
            />
          ))}
        </div>
        {!isDefaultPersonality(persona) && (
          <button type="button" className="lg-persona-reset" onClick={() => move(DEFAULT_PERSONALITY)}>
            Reset to Socria defaults
          </button>
        )}
      </div>

      <label className="persona-words">
        <span className="persona-words-h">In your own words</span>
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
        Kept in this browser. Your personality, not your principles: your thinking, your authorship and the learning
        guard stay yours on every setting.
      </p>
    </div>
  );
}
