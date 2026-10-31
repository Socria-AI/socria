'use client';
// components/onboarding/FirstRunIntro.tsx
//
// ONE ONBOARDING, FOR ALL OF SOCRIA.
//
// Four short beats on paper, each one answered or skipped, nothing performing
// itself:
//
//   premise   "Most AI gives you an answer. Socria helps you build the thinking
//              behind one."
//   name      what they want to be called (lib/onboarding-name.ts)
//   who       what they mostly think about (lib/onboarding-roles.ts)
//   thought   the question, a field, and five starting points worded for them
//
// Whatever they write goes, verbatim, into Logos 5's composer. It is the SAME
// component on /onboarding and over Logos, so it is read once rather than
// twice (lib/first-run.ts).
//
// There was a fifth beat, "how do you like to think something through?",
// which was the choice of model: talking it through (Core 4) or seeing it laid
// out (Logos). It went with the Core chat on 24 October 2026 (docs/ARCHIVE.md):
// there is one surface, so there is nothing to choose.

import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/ds';
import { ObIcon } from './ObIcon';
import { ROLES, readRole, roleOf, writeRole, type IntentId, type Role } from '@/lib/onboarding-roles';
import { readName, sanitizeName, writeName } from '@/lib/onboarding-name';
import { track } from '@/lib/analytics';
import { INTENTS, type Intent } from '@/lib/onboarding-intents';
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

const MAX = 2000;
type Beat = 'premise' | 'name' | 'who' | 'thought';

export function FirstRunIntro({
  surface: _surface,
  onStart,
  onSkip,
  defaultName,
  signedIn = false,
}: {
  /** which surface mounted it — kept for callers; the questions are the same everywhere */
  surface: 'core' | 'logos';
  /** an account to change the answers in later; a guest has none, and is not told to look for one */
  signedIn?: boolean;
  /** the thought, verbatim, and the starting point they picked */
  onStart: (text: string, intent: string | null) => void;
  onSkip: () => void;
  /** a name the account already knows, to start the field with */
  defaultName?: string | null;
}) {
  const [beat, setBeat] = useState<Beat>('premise');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role | null>(null);
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
    const order: Beat[] = ['premise', 'name', 'who', 'thought'];
    for (let i = order.indexOf(from) + 1; i < order.length; i++) {
      const b = order[i];
      if (b === 'name' && known.current.name) continue;
      if (b === 'who' && known.current.role) continue;
      return b;
    }
    return 'thought';
  };

  // Every answer on this screen, as a step and a kind — a role id, a starting
  // point, or 'skipped' — counted anonymously (lib/product-events.ts) so the
  // developer dashboard can say what people choose. Never their words, never
  // their name: for the name, only whether they gave one.
  const answer = (step: 'premise' | 'name' | 'who' | 'thought' | 'example', kind: string) =>
    track('onboarding_answered', { step, kind });

  const saveName = (v: string | null) => {
    const clean = writeName(v);
    // what was kept, not what was typed: a name that cleans to nothing was not given
    answer('name', clean ? 'given' : 'skipped');
    known.current.name = clean;
    setName(clean ?? '');
    setBeat(next('name'));
  };
  const pickRole = (r: Role | null) => {
    answer('who', r?.id ?? 'skipped');
    writeRole(r?.id ?? null);
    setRole(r);
    if (r) track('onboarding_role_chosen', { kind: r.id });
    setIntent(null);
    setBeat(next('who'));
  };
  const begin = (v: string) => {
    const s = (v || '').replace(/\s+$/, '').slice(0, MAX);
    if (!s.trim()) return;
    answer('thought', intent?.id ?? 'none');
    onStart(s, intent?.id ?? null);
  };

  // the starting points, in the order that fits them, worded for their life
  const ways: Intent[] = (role ? role.order : INTENTS.map((i) => i.id)).map((id) => {
    const base = INTENTS.find((i) => i.id === id)!;
    const w = role?.ways[id];
    return w ? { ...base, placeholder: w.placeholder, eg: w.eg } : base;
  });
  const first = sanitizeName(name)?.split(' ')[0] ?? null;
  const steps: Beat[] = ['name', 'who', 'thought'];
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
        <button
          type="button"
          className="ob-skip"
          onClick={() => {
            answer(beat, 'skip_all');
            onSkip();
          }}
        >
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
              <button
                type="button"
                className="ob-primary"
                onClick={() => {
                  answer('premise', 'continued');
                  setBeat(next('premise'));
                }}
              >
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
              So the examples fit.{signedIn ? ' Change it any time in Manage Account.' : ''}
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
                <button type="button" onClick={() => { answer('example', intent.id); setText(intent.eg); area.current?.focus(); }}>
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
