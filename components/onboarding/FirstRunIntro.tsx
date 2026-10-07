'use client';
// components/onboarding/FirstRunIntro.tsx
//
// ONE ONBOARDING, FOR ALL OF SOCRIA.
//
// Five short beats on paper, each one answered or skipped, nothing performing
// itself:
//
//   premise   "Most AI gives you an answer. Socria helps you build the thinking
//              behind one."
//   name      what they want to be called (lib/onboarding-name.ts)
//   who       what they mostly think about (lib/onboarding-roles.ts)
//   how       how they like to think something through — which IS the choice
//             of model: talking it through (Core 4) or seeing it laid out
//             (Logos 2), asked as a preference rather than a product menu
//   thought   the question, a field, and five starting points worded for them
//
// Whatever they write goes, verbatim, into the composer of the surface they
// chose. It is the SAME component on /onboarding, over the chat and over
// Logos, so it is read once rather than three times (lib/first-run.ts). Over a
// surface somebody has already opened, the model question is not asked — the
// surface is their answer.

import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/journal/ds';
import { ObIcon } from './ObIcon';
import { ROLES, readRole, roleOf, writeRole, type IntentId, type Role } from '@/lib/onboarding-roles';
import { readName, sanitizeName, writeName } from '@/lib/onboarding-name';
import { track } from '@/lib/analytics';
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
 * Five ways in. Each changes the placeholder and the one example under the
 * field — never what the person may bring.
 */
export interface Intent {
  id: IntentId;
  title: string;
  /** when this is the way in, in a few words */
  when: string;
  placeholder: string;
  /** one real example, pressable — it prefills, it never sends */
  eg: string;
}

export const INTENTS: Intent[] = [
  { id: 'decide', title: 'Make a decision', when: 'Both options keep pulling at you', placeholder: 'The decision you keep turning over…', eg: 'Offered a job. More money, bigger company. I keep going back and forth.' },
  { id: 'understand', title: 'Understand something', when: 'It has not clicked yet', placeholder: 'The thing that will not sit still…', eg: 'I can do the chain rule fine but I genuinely do not know what a derivative is.' },
  { id: 'develop', title: 'Develop an idea', when: 'It is only half-formed', placeholder: 'The idea, as far as it goes…', eg: 'A newsletter about how cities decide things. I have the name and nothing else.' },
  { id: 'problem', title: 'Work through a problem', when: 'Something is stuck', placeholder: 'The problem, in your own words…', eg: 'Our churn doubled after the price change and I cannot tell which half caused it.' },
  { id: 'research', title: 'Research something', when: 'The sources disagree', placeholder: 'What you are trying to find out…', eg: 'Two papers on whether remote work hurts junior developers. One says yes, one says no.' },
];

/** How they like to think — and so which model they start on. */
export type StartModel = 'core-4' | 'logos-2';
const HOW: { model: StartModel; title: string; line: string; name: string }[] = [
  { model: 'core-4', title: 'Talk it through', line: 'A conversation that asks the questions you would skip, and leaves the thinking to you.', name: 'Socria Core 4' },
  { model: 'logos-2', title: 'See it laid out', line: 'The same conversation, with your reasoning drawn as a live map beside it.', name: 'Socria Logos 2' },
];

const MAX = 2000;
type Beat = 'premise' | 'name' | 'who' | 'how' | 'thought';

export function FirstRunIntro({
  surface: _surface,
  onStart,
  onSkip,
  askModel = false,
  defaultName,
  suggest,
}: {
  /** which surface mounted it — kept for callers; the questions are the same everywhere */
  surface: 'core' | 'logos';
  /** the thought, verbatim; the starting point they picked; the model they chose, if asked */
  onStart: (text: string, intent: string | null, model: StartModel | null) => void;
  onSkip: (model?: StartModel | null) => void;
  /** ask how they like to think (and so which model) — only where no surface is chosen yet */
  askModel?: boolean;
  /** a name the account already knows, to start the field with */
  defaultName?: string | null;
  /** an answer to pre-select on the model question (the Logos page's door) */
  suggest?: StartModel | null;
}) {
  const [beat, setBeat] = useState<Beat>('premise');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [model, setModel] = useState<StartModel | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const known = useRef<{ name: string | null; role: Role | null }>({ name: null, role: null });

  useEffect(() => {
    const n = readName();
    const r = roleOf(readRole());
    known.current = { name: n, role: r };
    setName(n ?? sanitizeName(defaultName) ?? '');
    setRole(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (beat === 'thought') area.current?.focus();
    if (beat === 'name') nameRef.current?.focus();
  }, [beat]);

  // The beats this person still needs, in order — anything already answered
  // on this browser is not asked again.
  const next = (from: Beat): Beat => {
    const order: Beat[] = ['premise', 'name', 'who', 'how', 'thought'];
    for (let i = order.indexOf(from) + 1; i < order.length; i++) {
      const b = order[i];
      if (b === 'name' && known.current.name) continue;
      if (b === 'who' && known.current.role) continue;
      if (b === 'how' && !askModel) continue;
      return b;
    }
    return 'thought';
  };

  const saveName = (v: string | null) => {
    const clean = writeName(v);
    known.current.name = clean;
    setName(clean ?? '');
    setBeat(next('name'));
  };
  const pickRole = (r: Role | null) => {
    writeRole(r?.id ?? null);
    setRole(r);
    if (r) track('onboarding_role_chosen', { kind: r.id });
    setIntent(null);
    setBeat(next('who'));
  };
  const pickHow = (m: StartModel | null) => {
    setModel(m);
    if (m) track('onboarding_model_chosen', { kind: m });
    setBeat('thought');
  };
  const begin = (v: string) => {
    const s = (v || '').replace(/\s+$/, '').slice(0, MAX);
    if (!s.trim()) return;
    onStart(s, intent?.id ?? null, model);
  };

  // the starting points, in the order that fits them, worded for their life
  const ways: Intent[] = (role ? role.order : INTENTS.map((i) => i.id)).map((id) => {
    const base = INTENTS.find((i) => i.id === id)!;
    const w = role?.ways[id];
    return w ? { ...base, placeholder: w.placeholder, eg: w.eg } : base;
  });
  const first = sanitizeName(name)?.split(' ')[0] ?? null;
  const steps: Beat[] = ['name', 'who', ...(askModel ? (['how'] as Beat[]) : []), 'thought'];
  const stepAt = steps.indexOf(beat);

  return (
    <div className="ob ob-first" role="dialog" aria-label="Beginning">
      <span className="ob-grain" aria-hidden="true" />

      <div className="ob-top">
        <Logo size="sm" markSrc="/socria-mark.png" />
        {stepAt >= 0 && (
          <span className="ob-steps" aria-label={`Step ${stepAt + 1} of ${steps.length}`}>
            {steps.map((b, i) => (
              <i key={b} className={i <= stepAt ? 'on' : undefined} />
            ))}
          </span>
        )}
        <button type="button" className="ob-skip" onClick={() => onSkip(model)}>
          Skip
        </button>
      </div>

      <div className="ob-stage">
        {beat === 'premise' && (
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
              <button type="button" className="ob-primary" onClick={() => setBeat(next('premise'))}>
                Start thinking
              </button>
            </div>
          </div>
        )}

        {beat === 'name' && (
          <div className="ob-wrap" key="name">
            <h1 className="ob-q ob-q-sm">
              <Rise text="First — what should we call you?" />
            </h1>
            <form
              className="ob-name ob-fade"
              style={{ '--d': '.35s' } as React.CSSProperties}
              onSubmit={(e) => {
                e.preventDefault();
                if (sanitizeName(name)) saveName(name);
              }}
            >
              <input
                ref={nameRef}
                value={name}
                maxLength={40}
                autoComplete="given-name"
                placeholder="Your name"
                aria-label="What should we call you?"
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" className="ob-primary" disabled={!sanitizeName(name)}>
                Continue
              </button>
            </form>
            {name.trim() && !sanitizeName(name) && <p className="ob-sub">Just a name — letters, spaces, an apostrophe or a hyphen.</p>}
            <p className="ob-fade" style={{ '--d': '.5s' } as React.CSSProperties}>
              <button type="button" className="ob-later" onClick={() => saveName(null)}>
                Rather not say
              </button>
            </p>
          </div>
        )}

        {beat === 'who' && (
          <div className="ob-wrap ob-wrap-wide" key="who">
            <h1 className="ob-q ob-q-sm">
              <Rise text={first ? `Good to meet you, ${first}. What do you mostly think about?` : 'What do you mostly think about?'} />
            </h1>
            <p className="ob-sub ob-fade" style={{ '--d': '.35s' } as React.CSSProperties}>
              So the examples fit. Change it any time in Manage Account.
            </p>
            <div className="ob-roles ob-fade" style={{ '--d': '.5s' } as React.CSSProperties} role="list">
              {ROLES.map((r) => (
                <button key={r.id} type="button" role="listitem" className={`ob-card${role?.id === r.id ? ' is-on' : ''}`} onClick={() => pickRole(r)}>
                  <span className="ob-card-ic"><ObIcon name={r.id} /></span>
                  <span className="ob-card-t">{r.title}</span>
                  <span className="ob-card-d">{r.line}</span>
                </button>
              ))}
            </div>
            <p className="ob-fade" style={{ '--d': '.7s' } as React.CSSProperties}>
              <button type="button" className="ob-later" onClick={() => pickRole(null)}>
                Rather not say
              </button>
            </p>
          </div>
        )}

        {beat === 'how' && (
          <div className="ob-wrap ob-wrap-wide" key="how">
            <h1 className="ob-q ob-q-sm">
              <Rise text="How do you like to think something through?" />
            </h1>
            <p className="ob-sub ob-fade" style={{ '--d': '.35s' } as React.CSSProperties}>
              Either way, you can switch any time from the model menu.
            </p>
            <div className="ob-how ob-fade" style={{ '--d': '.5s' } as React.CSSProperties} role="radiogroup" aria-label="How you like to think">
              {HOW.map((h) => (
                <button
                  key={h.model}
                  type="button"
                  role="radio"
                  aria-checked={model === h.model}
                  className={`ob-howc${model === h.model || (!model && suggest === h.model) ? ' is-on' : ''}`}
                  onClick={() => pickHow(h.model)}
                >
                  <HowPicture kind={h.model} />
                  <span className="ob-howc-t">{h.title}</span>
                  <span className="ob-howc-d">{h.line}</span>
                  <span className="ob-howc-n">{h.name}</span>
                </button>
              ))}
            </div>
            <p className="ob-fade" style={{ '--d': '.7s' } as React.CSSProperties}>
              <button type="button" className="ob-later" onClick={() => pickHow(null)}>
                Not sure yet — choose for me
              </button>
            </p>
          </div>
        )}

        {beat === 'thought' && (
          <div className="ob-wrap ob-wrap-wide" key="thought">
            <h1 className="ob-q ob-q-sm">
              <Rise text={first ? `What are you trying to figure out, ${first}?` : 'What are you trying to figure out?'} />
            </h1>
            <p className="ob-kick ob-fade" style={{ '--d': '.3s' } as React.CSSProperties}>
              Pick a way in, or just start writing.
            </p>
            {/* Five starting points, as cards — in the order that fits what
                they mostly think about. Pressing one changes the placeholder
                and the example beneath; it never fills the field. */}
            <div className="ob-ways ob-fade" style={{ '--d': '.4s' } as React.CSSProperties} role="group" aria-label="Starting points">
              {ways.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`ob-way${intent?.id === o.id ? ' is-on' : ''}`}
                  aria-pressed={intent?.id === o.id}
                  onClick={() => {
                    setIntent((cur) => (cur?.id === o.id ? null : o));
                    area.current?.focus();
                  }}
                >
                  <span className="ob-way-ic"><ObIcon name={o.id === 'research' ? 'research-intent' : o.id} size={24} /></span>
                  <span className="ob-way-t">{o.title}</span>
                  <span className="ob-way-d">{o.when}</span>
                </button>
              ))}
            </div>
            <div className="ob-field ob-fade" style={{ '--d': '.55s' } as React.CSSProperties}>
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
                aria-label="What are you trying to figure out?"
              />
              <button type="button" className="ob-go" onClick={() => begin(text)} disabled={!text.trim()} aria-label="Start">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            {intent && !text.trim() ? (
              <p className="ob-eg-card ob-fade" style={{ '--d': '.05s' } as React.CSSProperties}>
                <span className="ob-eg-k">For instance</span>
                <button type="button" onClick={() => { setText(intent.eg); area.current?.focus(); }}>
                  “{intent.eg}”
                </button>
                <span className="ob-eg-use">Press to use it</span>
              </p>
            ) : (
              <p className="ob-hint ob-fade" style={{ '--d': '.7s' } as React.CSSProperties}>
                Something real. Enter to begin.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A small picture of each way of thinking — what the screen will look like. */
function HowPicture({ kind }: { kind: StartModel }) {
  if (kind === 'core-4') {
    return (
      <svg className="ob-howc-pic" viewBox="0 0 160 84" aria-hidden="true">
        <rect x="8" y="10" width="92" height="20" rx="10" className="b1" />
        <rect x="60" y="36" width="92" height="20" rx="10" className="b2" />
        <rect x="8" y="62" width="70" height="16" rx="8" className="b1" />
        <circle cx="18" cy="20" r="3" className="dot" />
      </svg>
    );
  }
  return (
    <svg className="ob-howc-pic" viewBox="0 0 160 84" aria-hidden="true">
      <rect x="6" y="12" width="44" height="12" rx="6" className="b1" />
      <rect x="6" y="30" width="36" height="12" rx="6" className="b2" />
      <rect x="6" y="48" width="40" height="12" rx="6" className="b1" />
      <line x1="62" y1="6" x2="62" y2="78" className="rule" />
      <path d="M92 22 L122 16 M92 22 L104 52 M122 16 L140 46 M104 52 L140 46" className="edge" />
      <rect x="80" y="15" width="24" height="14" rx="3" className="n" />
      <rect x="112" y="9" width="24" height="14" rx="3" className="n" />
      <rect x="92" y="45" width="24" height="14" rx="3" className="n" />
      <rect x="128" y="39" width="24" height="14" rx="3" className="n on" />
    </svg>
  );
}
