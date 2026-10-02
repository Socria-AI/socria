'use client';
// components/onboarding/FirstRunIntro.tsx
//
// THE PREMISE, ONCE, THEN THE PERSON'S OWN THOUGHT.
//
// Two beats on paper, and nothing performs itself. The first is the frame
// through which everything after it is read — "Most AI gives you an answer.
// Socria helps you build the thinking behind one." — and the second is a
// question with a field under it. The field is the whole screen; the five
// starting points beside it are scaffolding a person may ignore, and most
// will. Whatever they write goes, verbatim, into the composer of whichever
// surface mounted this: the chat, or Logos. Neither is explained here.
//
// It is the SAME component on /onboarding, in the chat and in Logos, which
// is how the premise is read once rather than three times: the record
// (lib/first-run.ts) says whether it has been shown, and every surface asks
// the record. It is skippable at both beats, and skipping counts as shown.
//
// What it is not: a slideshow, a feature list, a tour of the furniture, a
// rehearsed exchange. The product's first reply is the product's.

import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/journal/ds';
import '@/app/onboarding/onboarding.css';

/* ── words, rising on mount. Nothing here depends on scroll. ── */
function Rise({ text, from = 0 }: { text: string; from?: number }) {
  const parts = text.split(/(\s+)/);
  let i = from;
  return (
    <span>
      {parts.map((p, k) =>
        /^\s+$/.test(p) ? (
          p
        ) : (
          <span className="ob-w" key={k}>
            <i style={{ '--i': i++ } as React.CSSProperties}>{p}</i>
          </span>
        )
      )}
    </span>
  );
}

/**
 * Five ways in. Textual, quiet, optional. Each changes only the placeholder
 * and the one example under the field — never what the person may bring.
 */
export interface Intent {
  id: string;
  title: string;
  placeholder: string;
  /** one real example, pressable — it prefills, it never sends */
  eg: string;
}

export const INTENTS: Intent[] = [
  {
    id: 'decide',
    title: 'Make a decision',
    placeholder: 'The decision you keep turning over…',
    eg: 'Offered a job. More money, bigger company. I keep going back and forth.',
  },
  {
    id: 'understand',
    title: 'Understand something',
    placeholder: 'The thing that will not sit still…',
    eg: 'I can do the chain rule fine but I genuinely do not know what a derivative is.',
  },
  {
    id: 'develop',
    title: 'Develop an idea',
    placeholder: 'The idea, as far as it goes…',
    eg: 'A newsletter about how cities decide things. I have the name and nothing else.',
  },
  {
    id: 'problem',
    title: 'Work through a problem',
    placeholder: 'The problem, in your own words…',
    eg: 'Our churn doubled after the price change and I cannot tell which half caused it.',
  },
  {
    id: 'research',
    title: 'Research something',
    placeholder: 'What you are trying to find out…',
    eg: 'Two papers on whether remote work hurts junior developers. One says yes, one says no.',
  },
];

const MAX = 2000;

export function FirstRunIntro({
  surface,
  onStart,
  onSkip,
}: {
  /** which composer the thought is going to; it changes one question, nothing else */
  surface: 'core' | 'logos';
  /** the thought, verbatim, and the starting point they picked if any */
  onStart: (text: string, intent: string | null) => void;
  onSkip: () => void;
}) {
  const [beat, setBeat] = useState<'premise' | 'intent'>('premise');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (beat === 'intent') area.current?.focus();
  }, [beat]);

  const begin = (v: string) => {
    const s = (v || '').replace(/\s+$/, '').slice(0, MAX);
    if (!s.trim()) return;
    onStart(s, intent?.id ?? null);
  };

  const question = surface === 'logos' ? 'What are you trying to understand?' : 'What are you trying to figure out?';

  return (
    <div className="ob ob-first" role="dialog" aria-label="Beginning">
      <span className="ob-grain" aria-hidden="true" />

      <div className="ob-top">
        <Logo size="sm" markSrc="/socria-mark.png" />
        <button type="button" className="ob-skip" onClick={onSkip}>
          Skip
        </button>
      </div>

      <div className="ob-stage">
        {beat === 'premise' ? (
          <div className="ob-wrap" key="premise">
            <h1 className="ob-q ob-premise">
              <span className="ob-line">
                <Rise text="Most AI gives you an answer." />
              </span>
              <span className="ob-line ob-line-2">
                <Rise text="Socria helps you build the thinking behind one." from={6} />
              </span>
            </h1>
            <div className="ob-row ob-fade" style={{ '--d': '1.35s' } as React.CSSProperties}>
              <button type="button" className="ob-primary" onClick={() => setBeat('intent')}>
                Start thinking
              </button>
            </div>
          </div>
        ) : (
          <div className="ob-wrap" key="intent">
            <h1 className="ob-q">
              <Rise text={question} />
            </h1>
            <div className="ob-field ob-fade" style={{ '--d': '.4s' } as React.CSSProperties}>
              <textarea
                ref={area}
                rows={2}
                value={text}
                maxLength={MAX}
                placeholder={intent?.placeholder ?? 'In your own words…'}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    begin(text);
                  }
                }}
                aria-label={question}
              />
              <button
                type="button"
                className="ob-go"
                onClick={() => begin(text)}
                disabled={!text.trim()}
                aria-label="Start"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            <p className="ob-hint ob-fade" style={{ '--d': '.55s' } as React.CSSProperties}>
              Something real. Enter to begin.
            </p>
            {/* Five starting points, as text. Pressing one changes the
                placeholder and the example beneath; it never fills the field. */}
            <p className="ob-intents ob-fade" style={{ '--d': '.7s' } as React.CSSProperties} aria-label="Starting points">
              {INTENTS.map((o, i) => (
                <span key={o.id}>
                  {i > 0 && <span className="ob-dot" aria-hidden="true">·</span>}
                  <button
                    type="button"
                    className={intent?.id === o.id ? 'is-on' : undefined}
                    aria-pressed={intent?.id === o.id}
                    onClick={() => {
                      setIntent((cur) => (cur?.id === o.id ? null : o));
                      area.current?.focus();
                    }}
                  >
                    {o.title}
                  </button>
                </span>
              ))}
            </p>
            {intent && !text.trim() && (
              <p className="ob-eg-line ob-fade" style={{ '--d': '.05s' } as React.CSSProperties}>
                <span className="ob-eg-k">for instance</span>
                <button type="button" onClick={() => { setText(intent.eg); area.current?.focus(); }}>
                  {intent.eg}
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
