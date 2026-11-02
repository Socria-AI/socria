'use client';
// components/onboarding/FirstRunIntro.tsx
//
// ONE ONBOARDING, FOR ALL OF SOCRIA.
//
// Four short beats on paper, each one answered or skipped, nothing performing
// itself:
//
//   premise   what Socria is, in its own words, typed out — the parts that
//             matter in green — and what it is not: "We're not building humanity's
//             replacement."
//   name      what they want to be called (lib/onboarding-name.ts)
//   who       what brings them to Socria — studying, trying to understand
//             something, a decision… (lib/onboarding-paths.ts)
//   thought   three ways to start down that path, each a whole first message
//             they can take and change, or their own words
//
// Whatever they start with becomes their first conversation, and it counts
// like any other (the caller says so under the field, for a free plan). It
// is the SAME component on /onboarding and over Logos 5, so it is read once
// rather than twice (lib/first-run.ts).
//
// Behind the beats, a Logic Map draws itself a node at a time: each answer
// adds one, so by the time they start, the shape they are about to make is
// already on the page.

import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/ds';
import { ObIcon } from './ObIcon';
import { readRole, roleOf, writeRole } from '@/lib/onboarding-roles';
import { readName, sanitizeName, writeName } from '@/lib/onboarding-name';
import { INTENTS } from '@/lib/onboarding-intents';
import { PATHS, pathForRole, usesFor, type Path, type UseCase } from '@/lib/onboarding-paths';
import { track } from '@/lib/analytics';
import '@/app/onboarding/onboarding.css';
import './welcome.css';

/** What Socria is, as it says it. `hl` is set in green: the parts that matter. */
export const PREMISE: readonly (readonly { t: string; hl?: boolean }[])[] = [
  [
    { t: 'Socria is ' },
    { t: 'Human-First AI', hl: true },
    { t: ' built to ' },
    { t: 'expand what people can see, understand, and do', hl: true },
    { t: ', without surrendering the ability to ' },
    { t: 'think for themselves', hl: true },
    { t: '.' },
  ],
  [
    { t: 'We’re not building humanity’s replacement. We’re building technology that ' },
    { t: 'makes humanity more capable', hl: true },
    { t: '.' },
  ],
];

/* ── words, rising on mount. Nothing here depends on scroll. ── */
function Rise({ text, from = 0 }: { text: string; from?: number }) {
  const parts = text.split(/(\s+)/);
  let i = from;
  return (
    <span>
      {parts.map((p, k) =>
        /^\s+$/.test(p) || !p ? (
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

/** Characters in a premise paragraph. */
const lengthOf = (parts: readonly { t: string }[]) => parts.reduce((n, p) => n + p.t.length, 0);
/** How fast it types, per character. */
const TYPE_MS = 24;

/**
 * The premise, typed out a character at a time — its green words green as they arrive. The whole text is
 * there for a screen reader from the start; with reduced motion it is simply there. A press skips to the end.
 */
function Typed({ parts, shown, caret }: { parts: readonly { t: string; hl?: boolean }[]; shown: number; caret: boolean }) {
  let left = shown;
  return (
    <>
      <span className="obw-sr">{parts.map((p) => p.t).join('')}</span>
      <span aria-hidden="true">
        {parts.map((p, k) => {
          const take = Math.max(0, Math.min(p.t.length, left));
          left -= take;
          return (
            <span key={k} className={p.hl ? 'obw-hl' : undefined}>
              {p.t.slice(0, take)}
              {caret && take > 0 && take < p.t.length && <i className="obw-caret" />}
              {/* what is still to come holds its place, so the lines never move as they are typed */}
              {take < p.t.length && <span className="obw-ghost">{p.t.slice(take)}</span>}
            </span>
          );
        })}
      </span>
    </>
  );
}

/**
 * The Logic Map behind the beats: seven ideas and the lines between them,
 * drawn faintly. `lit` of them are on — one more with every answer.
 */
const MAP_NODES = [
  { x: 470, y: 250, r: 9 },
  { x: 330, y: 150, r: 6 },
  { x: 610, y: 135, r: 6 },
  { x: 650, y: 330, r: 7 },
  { x: 345, y: 360, r: 6 },
  { x: 520, y: 455, r: 5 },
  { x: 200, y: 255, r: 5 },
];
const MAP_EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [3, 5],
  [4, 5],
  [1, 6],
  [4, 6],
];
function ObMap({ lit }: { lit: number }) {
  return (
    <svg className="obw-map" viewBox="0 0 800 560" aria-hidden="true" focusable="false">
      {MAP_EDGES.map(([a, b], k) => {
        const on = Math.max(a, b) < lit;
        const A = MAP_NODES[a];
        const B = MAP_NODES[b];
        return <line key={k} className={`obw-edge${on ? ' is-on' : ''}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} pathLength={1} />;
      })}
      {MAP_NODES.map((n, k) => (
        <g key={k} className={`obw-node${k < lit ? ' is-on' : ''}${k === lit - 1 ? ' is-new' : ''}`}>
          <circle className="obw-halo" cx={n.x} cy={n.y} r={n.r * 3.2} />
          <circle className="obw-dot" cx={n.x} cy={n.y} r={n.r} />
        </g>
      ))}
    </svg>
  );
}

const MAX = 2000;
type Beat = 'premise' | 'name' | 'who' | 'thought';
/** how many ideas the map behind has lit, by beat */
const LIT: Record<Beat, number> = { premise: 1, name: 3, who: 5, thought: 7 };

export function FirstRunIntro({
  surface: _surface,
  onStart,
  onSkip,
  defaultName,
  signedIn = false,
  startNote = null,
}: {
  /** which surface mounted it — kept for callers; the questions are the same everywhere */
  surface: 'core' | 'logos';
  /** an account to change the answers in later; a guest has none, and is not told to look for one */
  signedIn?: boolean;
  /** the first message, verbatim, and the kind of thinking it starts (an intent id), if they took a way in */
  onStart: (text: string, intent: string | null) => void;
  onSkip: () => void;
  /** a name the account already knows, to start the field with */
  defaultName?: string | null;
  /** said under the field — that starting is one of the month's conversations, on a free plan */
  startNote?: string | null;
}) {
  const [beat, setBeat] = useState<Beat>('premise');
  const [name, setName] = useState('');
  const [path, setPath] = useState<Path | null>(null);
  const [use, setUse] = useState<UseCase | null>(null);
  const [text, setText] = useState('');
  const [leaving, setLeaving] = useState(false);
  // the premise, typed: how many characters are on screen
  const total0 = lengthOf(PREMISE[0]);
  const total = total0 + lengthOf(PREMISE[1]);
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (beat !== 'premise') return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTyped(total);
      return;
    }
    if (typed >= total) return;
    // a breath between the two sentences of the claim
    const t = window.setTimeout(() => setTyped((n) => n + 1), typed === total0 ? 520 : TYPE_MS);
    return () => window.clearTimeout(t);
  }, [beat, typed, total, total0]);
  const typedAll = typed >= total;
  const area = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const known = useRef<{ name: string | null; role: string | null }>({ name: null, role: null });
  useEffect(() => {
    const n = readName();
    const r = roleOf(readRole());
    known.current = { name: n, role: r?.id ?? null };
    setName(n ?? sanitizeName(defaultName) ?? '');
    // a role told to an earlier onboarding on this browser is a path already taken
    setPath(pathForRole(r?.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (beat === 'thought') area.current?.focus({ preventScroll: true });
    if (beat === 'name') nameRef.current?.focus({ preventScroll: true });
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

  // Every answer on this screen, as a step and a kind — a path id, a starting
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
  const pickPath = (p: Path | null) => {
    answer('who', p?.id ?? 'skipped');
    // what they mostly think about, when the path says — and only then (lib/onboarding-paths.ts)
    const r = roleOf(p?.role);
    writeRole(r?.id ?? null);
    if (r) track('onboarding_role_chosen', { kind: r.id });
    setPath(p);
    setUse(null);
    setText('');
    setBeat(next('who'));
  };
  const pickUse = (u: UseCase) => {
    if (use?.id === u.id) {
      setUse(null);
      setText('');
      area.current?.focus({ preventScroll: true });
      return;
    }
    answer('example', u.intent);
    setUse(u);
    setText(u.text);
    area.current?.focus({ preventScroll: true });
  };
  // the kind of thinking their way in starts — the intent of the way they took, if they took one
  const intent = use ? INTENTS.find((i) => i.id === use.intent) ?? null : null;
  const begin = (v: string) => {
    const s = (v || '').replace(/\s+$/, '').slice(0, MAX);
    if (!s.trim() || leaving) return;
    answer('thought', intent?.id ?? 'none');
    setLeaving(true);
    // the page lifts away, and their conversation is underneath it
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => onStart(s, intent?.id ?? null), still ? 0 : 480);
  };

  const uses = usesFor(path);
  const first = sanitizeName(name)?.split(' ')[0] ?? null;
  const steps: Beat[] = ['name', 'who', 'thought'];
  const stepAt = steps.indexOf(beat);

  return (
    <div className={`ob ob-first obw is-${beat}${leaving ? ' is-leaving' : ''}`} role="dialog" aria-label="Welcome to Socria">
      <span className="ob-grain" aria-hidden="true" />
      <ObMap lit={LIT[beat]} />

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
          <div className="ob-wrap obw-premise" key="premise">
            <p className="obw-eyebrow">Welcome to Socria</p>
            <h1 className="obw-say" onClick={() => setTyped(total)}>
              <Typed parts={PREMISE[0]} shown={typed} caret={typed < total0} />
            </h1>
            <p className="obw-say2" onClick={() => setTyped(total)}>
              <Typed parts={PREMISE[1]} shown={typed - total0} caret={typed >= total0 && !typedAll} />
            </p>
            <div className={`ob-row obw-after${typedAll ? ' is-in' : ''}`}>
              <button
                type="button"
                className="ob-primary obw-begin"
                onClick={() => {
                  answer('premise', 'continued');
                  setBeat(next('premise'));
                }}
              >
                Begin
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
              <span className="obw-aside">Three quick questions, then your first conversation.</span>
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
              <Rise text={first ? `Good to meet you, ${first}.` : 'Good to meet you.'} />
            </h1>
            <p className="obw-q2 ob-fade" style={{ '--d': '.3s' } as React.CSSProperties}>
              What brings you to Socria?
            </p>
            <p className="ob-sub ob-fade" style={{ '--d': '.4s' } as React.CSSProperties}>
              So the examples fit.{signedIn ? ' Change it any time in Manage Account.' : ''}
            </p>
            <div className="ob-roles obw-paths ob-fade" style={{ '--d': '.5s' } as React.CSSProperties} role="list">
              {PATHS.map((p, k) => (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  className={`ob-card${path?.id === p.id ? ' is-on' : ''}`}
                  style={{ '--k': k } as React.CSSProperties}
                  onClick={() => pickPath(p)}
                >
                  <span className="ob-card-ic">
                    <ObIcon name={p.icon} />
                  </span>
                  <span className="ob-card-t">{p.title}</span>
                  <span className="ob-card-d">{p.line}</span>
                </button>
              ))}
            </div>
            <p className="ob-fade" style={{ '--d': '.75s' } as React.CSSProperties}>
              <button type="button" className="ob-later" onClick={() => pickPath(null)}>
                Something else
              </button>
            </p>
          </div>
        )}

        {beat === 'thought' && (
          <div className="ob-wrap ob-wrap-wide" key="thought">
            <h1 className="ob-q ob-q-sm">
              <Rise text={first ? `Where shall we start, ${first}?` : 'Where shall we start?'} />
            </h1>
            <p className="ob-kick ob-fade" style={{ '--d': '.3s' } as React.CSSProperties}>
              {path ? `${path.title} — take one of these, or say it in your own words.` : 'Take one of these, or say it in your own words.'}
            </p>
            {/* Ways to start, as cards: each a whole first message. Pressing
                one puts it in the field, to change or send as it is; it never
                sends by itself. */}
            <div className={`ob-ways obw-uses n-${uses.length} ob-fade`} style={{ '--d': '.4s' } as React.CSSProperties} role="group" aria-label="Ways to start">
              {uses.map((u, k) => (
                <button
                  key={u.id}
                  type="button"
                  className={`ob-way${use?.id === u.id ? ' is-on' : ''}`}
                  style={{ '--k': k } as React.CSSProperties}
                  aria-pressed={use?.id === u.id}
                  onClick={() => pickUse(u)}
                >
                  <span className="ob-way-ic">
                    <ObIcon name={u.intent === 'research' ? 'research-intent' : u.intent} size={22} />
                  </span>
                  <span className="ob-way-t">{u.title}</span>
                  <span className="ob-way-d">“{u.text}”</span>
                </button>
              ))}
            </div>
            <div className={`ob-field ob-fade${use ? ' is-taken' : ''}`} style={{ '--d': '.55s' } as React.CSSProperties}>
              <textarea
                ref={area}
                rows={2}
                value={text}
                maxLength={MAX}
                placeholder="Or in your own words…"
                onChange={(e) => {
                  setText(e.target.value);
                  if (!e.target.value.trim()) setUse(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    begin(text);
                  }
                }}
                aria-label="Your first question"
              />
              <button type="button" className="ob-go" onClick={() => begin(text)} disabled={!text.trim() || leaving} aria-label="Start">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            <p className="ob-hint ob-fade" style={{ '--d': '.7s' } as React.CSSProperties}>
              {text.trim() ? 'Enter to begin — it becomes your first conversation.' : 'Something real. It becomes your first conversation.'}
              {startNote ? <span className="obw-note"> {startNote}</span> : null}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
