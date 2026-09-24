'use client';

// Introducing Socria Core 4.
//
// It takes the slot the Logos invitation held — the one thing the chat opens
// with, once, for somebody who has not seen it. Logos is not gone; it is one
// surface among several now, and the thing worth a person's first thirty
// seconds is the model they are about to talk to.
//
// EVERYTHING IN THE STAGE IS THE REAL THING, which is the same rule the Logos
// tour set for itself and the only rule that keeps a product tour honest:
//
//   the dials are the picker's own <Dial>, reading READABILITY_OPTIONS and
//   LENGTH_OPTIONS, inside .app-root so the real stylesheet applies. Move one
//   here and it moves exactly as it moves in the composer;
//   the web disclosure is renderDisclosure() — the function the chat route
//   itself calls — rendered through <RichText>, the renderer every reply goes
//   through. Not a screenshot of a search: the same two functions;
//   the memory cards are the design system's LogosNode, the component the Mind
//   Graph and the onboarding both draw with;
//   the reply text is <RichText> in the chat's own bubble chrome.
//
// A drawing of a feature can be made to look better than the feature. That is
// exactly why it must not be used to sell one.
//
// FOUR SCENES, ON A CLOCK, with dots to jump. The clock exists because the
// first scene has to make its point in the time somebody gives a modal, and
// the dots exist because the fourth is the one a sceptic wants.

import { useEffect, useRef, useState } from 'react';
import { Dial } from './ModelPicker';
import { ModelGlyph } from './ModelGlyph';
import { RichText } from './RichText';
import { LogosNode } from './journal/ds';
import {
  READABILITY_OPTIONS,
  LENGTH_OPTIONS,
  type Readability,
  type ReplyLength,
} from '@/lib/socria-prompt';
import { renderDisclosure } from '@/lib/core4/web';

const STAGE_H = 236;

const SCENES = [
  { id: 'proportion', n: 'i', label: 'It answers in proportion', dur: 7600 },
  { id: 'dials', n: 'ii', label: 'You set how it reads', dur: 7000 },
  { id: 'memory', n: 'iii', label: 'It remembers, and shows you', dur: 6800 },
  { id: 'web', n: 'iv', label: 'It checks, and says so', dur: 7000 },
] as const;

const TOTAL = SCENES.reduce((a, s) => a + s.dur, 0);
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, s) => a + s.dur, 0));

/* ── i. the same model, two lengths, because the turns are different ── */
const SHORT_ASK = 'I’m worried I’m not doing enough for McCombs.';
const SHORT_REPLY = 'Enough for *what*, though — the application, or the version of yourself you think they want?';
const LONG_ASK = 'Churn is 4.1% monthly and the raise closes in March. What breaks?';
const LONG_REPLY =
  'The raise, if churn holds. At 4.1% you lose **39%** of the book before March, so the ARR you are raising *on* is not the ARR you will have — and the number a term sheet is written against is the trailing one. What is the cohort split behind that 4.1%?';

/* ── iv. the disclosure, written by the function that writes it live ── */
const RESEARCH = {
  query: 'texas franchise tax filing deadline 2026',
  why: 'they asked for it',
  provider: 'brave',
  sources: [
    {
      n: 1,
      title: 'Franchise Tax — filing deadlines',
      url: 'https://comptroller.texas.gov/taxes/franchise',
      site: 'comptroller.texas.gov',
      snippet: '',
    },
    {
      n: 2,
      title: 'Annual report and extension rules',
      url: 'https://comptroller.texas.gov/taxes/franchise/filing-extensions',
      site: 'comptroller.texas.gov',
      snippet: '',
    },
  ],
};
const WEB_REPLY =
  'The annual report is due **15 May**, not the date on your calendar [1]. An extension moves the filing, not the payment [2] — so the cash still has to be there in May either way.';

const DISPATCHES = [
  {
    n: 'i',
    h: 'It decides how far to go — you do not',
    p: 'There is no depth dial to set in advance, because the right depth is a property of the turn and not of your mood. A worry gets a sentence. A question with real material behind it gets the whole answer.',
  },
  {
    n: 'ii',
    h: 'You say how it is written',
    p: 'Two dials: how it reads, and how much it says. They change the sentences and nothing else — Simple never means a worse answer, and the two move independently, so Advanced and Concise is a real setting.',
  },
  {
    n: 'iii',
    h: 'It holds what matters, and you can take it back',
    p: 'What Socria knows about how you think lives in the Mind Graph — visible on one page, correctable line by line, and deletable. It comes up when it helps and stays quiet when it does not.',
  },
];

export function IntroCore4Modal({
  open,
  onClose,
  onStart,
  isSignedIn,
}: {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
  /** switch to Core 4, or send them to sign-in — the caller decides which */
  onStart: () => void;
  isSignedIn: boolean;
}) {
  const [dontShow, setDontShow] = useState(false);
  const [t, setT] = useState(0);
  /** the dials in scene ii are LIVE — they are the real control, so they move */
  const [readability, setReadability] = useState<Readability>('standard');
  const [length, setLength] = useState<ReplyLength>('standard');
  const offset = useRef(0);
  const raf = useRef(0);
  /** a dial they touched stops the clock: nobody is dragged off a control mid-use */
  const held = useRef(false);

  useEffect(() => {
    if (!open) return;
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const start = performance.now();
    const tick = (now: number) => {
      if (!held.current) setT((now - start + offset.current) % TOTAL);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(dontShow);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose, dontShow]);

  if (!open) return null;

  let si = 0;
  for (let i = SCENES.length - 1; i >= 0; i--) if (t >= STARTS[i]) { si = i; break; }
  const scene = SCENES[si];
  const st = t - STARTS[si];

  const goTo = (i: number) => {
    held.current = false;
    offset.current = (offset.current + (STARTS[i] - t) + TOTAL) % TOTAL;
    setT(STARTS[i]);
  };
  /** stop the tour where it is, because they have started using it */
  const hold = () => {
    held.current = true;
  };

  return (
    <div
      className="core3-modal-backdrop"
      onClick={() => onClose(dontShow)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-core4-title"
    >
      <div className="core3-modal-card j3-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onClose(dontShow)}
          className="core3-modal-close"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="j3-masthead">
          <span className="j3-brand">Socria</span>
          <span className="j3-folio">Issue №&nbsp;5 · Core 4</span>
        </div>

        <div className="c4-stage">
          <div className="c4-scene" style={{ height: STAGE_H }}>
            {/* i · proportion: the same model, two turns, two lengths */}
            {scene.id === 'proportion' && (
              <div className="c4-pane">
                <div className={`c4-turn${st > 200 ? ' is-in' : ''}`}>
                  <span className="c4-said">{SHORT_ASK}</span>
                  <div className="c4-reply">
                    <RichText text={SHORT_REPLY} />
                  </div>
                </div>
                <div className={`c4-turn${st > 2600 ? ' is-in' : ''}`}>
                  <span className="c4-said">{LONG_ASK}</span>
                  <div className="c4-reply">
                    <RichText text={LONG_REPLY} />
                  </div>
                </div>
              </div>
            )}

            {/* ii · the dials, live — the picker's own control */}
            {scene.id === 'dials' && (
              <div className="c4-pane c4-dials app-root" onPointerDown={hold}>
                <p className="mp-lbl">How it reads</p>
                <Dial name="Readability" options={READABILITY_OPTIONS} value={readability} onPick={setReadability} />
                <p className="mp-lbl mp-lbl-2">How much it says</p>
                <Dial name="Length" options={LENGTH_OPTIONS} value={length} onPick={setLength} />
                <p className="c4-aside">
                  Neither one reaches the thinking. <em>Move them.</em>
                </p>
              </div>
            )}

            {/* iii · memory, as the cards the Mind Graph is drawn with */}
            {scene.id === 'memory' && (
              <div className="c4-pane c4-memory logos-root">
                <span className="c4-ph">What Socria remembers · yours to correct</span>
                <div className="c4-nodes">
                  <span className={`c4-nd${st > 300 ? ' is-in' : ''}`} style={{ left: '2%', top: 6 }}>
                    <LogosNode type="claim" label="Applying to McCombs BHP" />
                  </span>
                  <span className={`c4-nd${st > 900 ? ' is-in' : ''}`} style={{ left: '46%', top: 52 }}>
                    <LogosNode type="value" label="Wants the work to be hers" state="focused" />
                  </span>
                  <span className={`c4-nd${st > 1500 ? ' is-in' : ''}`} style={{ left: '6%', top: 108 }}>
                    <LogosNode type="assumption" label="Thinks essays are judged on polish" />
                  </span>
                </div>
                <p className="c4-aside">
                  Three sessions, one line each. <em>Every one of them deletable.</em>
                </p>
              </div>
            )}

            {/* iv · the web: the route's own disclosure, the chat's own renderer */}
            {scene.id === 'web' && (
              <div className="c4-pane c4-web">
                <span className="c4-said">When is the franchise report due this year?</span>
                <div className={`c4-reply${st > 300 ? ' is-in' : ''}`}>
                  <RichText text={renderDisclosure(RESEARCH).trimEnd()} />
                </div>
                <div className={`c4-reply${st > 1600 ? ' is-in' : ''}`}>
                  <RichText text={WEB_REPLY} />
                </div>
              </div>
            )}
          </div>

          <div className="c4-rail">
            <span className="c4-rail-label">
              <em>{scene.n}.</em> {scene.label}
            </span>
            <span className="tl-dots">
              {SCENES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={`tl-dot${i === si ? ' is-on' : ''}`}
                  onClick={() => goTo(i)}
                  aria-label={s.label}
                >
                  <span
                    className="tl-dot-fill"
                    style={
                      i === si && !held.current
                        ? { animationDuration: `${s.dur}ms`, animationDelay: `-${st}ms` }
                        : undefined
                    }
                  />
                </button>
              ))}
            </span>
          </div>
        </div>

        <div className="j3-body">
          <p className="j3-kicker reveal-in" style={{ animationDelay: '60ms' }}>
            New · Socria Core 4
          </p>
          <h2 id="intro-core4-title" className="j3-title reveal-in" style={{ animationDelay: '130ms' }}>
            It thinks <span className="j3-title-em">with you</span>, not for you.
          </h2>
          <p className="j3-standfirst reveal-in" style={{ animationDelay: '200ms' }}>
            Core 4 reads what kind of turn this is before it writes a word — and
            judges, every time, whether answering outright would take work that
            is worth doing yourself.
          </p>

          <ol className="j3-dispatches">
            {DISPATCHES.map((d, i) => (
              <li key={d.n} className="j3-dispatch reveal-in" style={{ animationDelay: `${280 + i * 70}ms` }}>
                <span className="j3-dispatch-n">{d.n}.</span>
                <div>
                  <h3>{d.h}</h3>
                  <p>{d.p}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="tl-free reveal-in" style={{ animationDelay: '520ms' }}>
            {isSignedIn
              ? 'Core 3.1 stays exactly where it is — this is a choice, not a migration.'
              : 'Core 4 needs an account, because it keeps something. Core 3.1 is open without one.'}
          </p>

          <div className="core3-modal-footer reveal-in" style={{ animationDelay: '620ms' }}>
            <label className="core3-modal-checkbox">
              <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
              <span>Don&rsquo;t show again</span>
            </label>
            <button type="button" onClick={onStart} className="core3-modal-primary">
              <span className="core3-modal-primary-shine" aria-hidden />
              {/* The picker's own glyph for this model — the same mark they
                  will see beside the composer once they are in it. */}
              <span className="tl-primary-mark" aria-hidden>
                <ModelGlyph model="core-4" size={15} />
              </span>
              <span className="core3-modal-primary-label">
                {isSignedIn ? 'Start on Core 4' : 'Sign in to try Core 4'}
              </span>
              <span aria-hidden className="core3-modal-primary-arrow">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
