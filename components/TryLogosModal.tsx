'use client';

// The invitation to try Socria Logos.
//
// A list of features cannot sell this product, because what makes Logos worth
// trying is a set of things you have to WATCH. So the hero is a short tour
// that plays: four scenes, each staging one feature with the app's own markup,
// cycling on a single clock. Dots let someone jump straight to one.
//
//   i.   The map assembles out of a sentence, tension drawn last.
//   ii.  A node is pressed and Challenge writes back where it breaks.
//   iii. The Board works a problem and keeps the mistake.
//   iv.  The guard declines to hand over the answer.
//
// Everything inside the stage carries .logos-root, so these are the real node
// cards, the real Board, the real guard bar — not drawings of them.

import { useEffect, useRef, useState } from 'react';
import { LogosMark } from './LogosMark';
import { NodeGlyph } from './NodeGlyph';
import { MathBoard } from './MathBoard';
import type { LogosNodeType, ThinkingMap } from '@/lib/logos';

const STAGE_H = 232;

/* ── i. the map ──────────────────────────────────────────────────── */
const TYPED = 'I got an offer with a lot more money — honestly I’ve stopped growing here.';

interface Beat {
  id: string;
  type: LogosNodeType;
  label: string;
  /** x as a percentage of the stage, y in px from its top */
  x: number;
  y: number;
  at: number;
}

const BEATS: Beat[] = [
  { id: 'pay', type: 'claim', label: 'It pays more', x: 1, y: 0, at: 1400 },
  { id: 'grow', type: 'claim', label: 'I’ve stopped growing', x: 53, y: 14, at: 1950 },
  { id: 'assume', type: 'assumption', label: 'More money means progress', x: 0, y: 76, at: 2650 },
  { id: 'value', type: 'value', label: 'Work that teaches me', x: 52, y: 90, at: 3250 },
  { id: 'tension', type: 'tension', label: 'Security ↔ growth', x: 26, y: 152, at: 4050 },
];

const WIRES: { key: string; d: string; at: number }[] = [
  { key: 'pay-assume', d: 'M 23 23 C 22 28, 22 33, 22 37', at: 2950 },
  { key: 'grow-value', d: 'M 75 30 C 75 35, 74 40, 74 44', at: 3550 },
  { key: 'assume-tension', d: 'M 22 60 C 27 65, 38 71, 46 74', at: 4350 },
  { key: 'value-tension', d: 'M 74 67 C 69 69, 58 72, 51 74', at: 4350 },
];

/* ── iii. the board ──────────────────────────────────────────────── */
const BOARD_MAP: ThinkingMap = {
  context: 'math',
  intent: 'learning',
  nodes: [
    { id: 'g1', type: 'given', label: 'quadratic', tex: 'x^2 - 5x + 6 = 0' },
    { id: 's1', type: 'equation', label: 'factored', tex: '(x-2)(x-3) = 0' },
    {
      id: 'e1',
      type: 'error',
      label: 'sign slip',
      tex: 'x = -2,\\ -3',
      flag: 'error',
      note: 'the roots flip when you solve each factor',
    },
    { id: 'r1', type: 'result', label: 'the roots', tex: 'x = 2,\\ 3' },
  ],
  edges: [
    { from: 'g1', to: 's1', relation: 'transforms_to', op: 'factor' },
    { from: 's1', to: 'e1', relation: 'transforms_to', op: 'set each = 0' },
    { from: 'e1', to: 'r1', relation: 'revises', op: 'fix the sign' },
  ],
};
const BOARD_STEPS = [900, 2100, 3300, 4600];

/* ── the tour ────────────────────────────────────────────────────── */
const SCENES = [
  { id: 'map', n: 'i', label: 'Your reasoning, drawn live', dur: 7400 },
  { id: 'moves', n: 'ii', label: 'Press on any thought', dur: 7000 },
  { id: 'board', n: 'iii', label: 'Mathematics, kept honest', dur: 7200 },
  { id: 'guard', n: 'iv', label: 'It will not hand you the answer', dur: 6400 },
] as const;

const TOTAL = SCENES.reduce((a, s) => a + s.dur, 0);
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, s) => a + s.dur, 0));

const DISPATCHES = [
  {
    n: 'i',
    h: 'Your reasoning, drawn as you talk',
    p: 'Claims, assumptions, tensions and evidence appear beside the conversation and reorganize as your mind does — because a thought you can see is a thought you can argue with.',
  },
  {
    n: 'ii',
    h: 'Press on any thought',
    p: 'Challenge it and get the ways it could break. Trace it and read the moment you first said it, quoted back word for word.',
  },
  {
    n: 'iii',
    h: 'It will not do your thinking',
    p: 'Working a problem to learn it? Logos guides and withholds the answer — in the chat, on the map, on the board, all at once — until you reach it yourself.',
  },
];

export function TryLogosModal({
  open,
  onClose,
  onTry,
  onUnlock,
  isSignedIn,
}: {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
  onTry: () => void;
  /** the access key path, kept for people without an account */
  onUnlock: (key: string) => boolean;
  isSignedIn: boolean;
}) {
  const [dontShow, setDontShow] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState(false);
  const [t, setT] = useState(0);
  /** set when a dot is clicked: the tour continues from that scene */
  const offset = useRef(0);
  const raf = useRef(0);
  const still = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(dontShow);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dontShow, onClose]);

  // One clock drives the whole tour. Anyone who has asked for less motion gets
  // each scene at rest instead — every scene still reads, it just does not play.
  useEffect(() => {
    if (!open) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      still.current = true;
      setT(STARTS[0] + SCENES[0].dur - 400);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      setT((now - start + offset.current) % TOTAL);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [open]);

  if (!open) return null;

  let si = 0;
  for (let i = SCENES.length - 1; i >= 0; i--) if (t >= STARTS[i]) { si = i; break; }
  const scene = SCENES[si];
  // local time inside the scene, which every scene animates against
  const st = t - STARTS[si];

  const goTo = (i: number) => {
    offset.current = (offset.current + (STARTS[i] - t) + TOTAL) % TOTAL;
    setT(STARTS[i]);
  };

  const typedChars = Math.max(0, Math.min(TYPED.length, Math.round((st - 200) / 15)));
  const boardShown = BOARD_STEPS.filter((s) => st > s).length;
  const boardMap: ThinkingMap = {
    ...BOARD_MAP,
    nodes: BOARD_MAP.nodes.slice(0, boardShown),
    edges: BOARD_MAP.edges.filter((e) => {
      const ids = new Set(BOARD_MAP.nodes.slice(0, boardShown).map((n) => n.id));
      return ids.has(e.from) && ids.has(e.to);
    }),
  };

  function submitKey() {
    if (onUnlock(keyInput.trim())) {
      setKeyError(false);
      setKeyInput('');
      return;
    }
    setKeyError(true);
  }

  return (
    <div
      className="core3-modal-backdrop"
      onClick={() => onClose(dontShow)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="try-logos-title"
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
          <span className="j3-folio">Issue №&nbsp;4 · Logos</span>
        </div>

        {/* the tour */}
        <div className="tl-stage logos-root">
          <div className="tl-scene" style={{ height: STAGE_H }} aria-hidden="true">
            {/* i · the map assembles out of a sentence */}
            {scene.id === 'map' && (
              <div className="tl-pane">
                <div className="tl-said">
                  <span className="tl-said-text">{TYPED.slice(0, typedChars)}</span>
                  {typedChars < TYPED.length && <span className="tl-caret" />}
                </div>
                <div className="tl-map">
                  <svg className="tl-wires" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {WIRES.map((w) => (
                      <path
                        key={w.key}
                        d={w.d}
                        className={`tl-wire${st > w.at ? ' is-in' : ''}`}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>
                  {BEATS.map((b) => (
                    <span
                      key={b.id}
                      className={`lg-node lg-node-${b.type} tl-node${st > b.at ? ' is-in' : ''}`}
                      style={{ left: `${b.x}%`, top: b.y }}
                    >
                      <span className="lg-node-head">
                        <NodeGlyph type={b.type} />
                        <span className="lg-node-type">{b.type}</span>
                      </span>
                      <span className="lg-node-label">{b.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ii · a node is pressed, and Challenge writes back */}
            {scene.id === 'moves' && (
              <div className="tl-pane tl-moves">
                <div className="tl-moves-left">
                  <span className="lg-node lg-node-assumption tl-node is-in">
                    <span className="lg-node-head">
                      <NodeGlyph type="assumption" />
                      <span className="lg-node-type">assumption</span>
                    </span>
                    <span className="lg-node-label">More money means progress</span>
                  </span>
                  <div className={`tl-menu${st > 500 ? ' is-in' : ''}`}>
                    {['Explore', 'Challenge', 'Research', 'Trace'].map((m) => (
                      <span
                        key={m}
                        className={`tl-menu-item${m === 'Challenge' && st > 1500 ? ' is-on' : ''}`}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
                <div className={`tl-result${st > 2200 ? ' is-in' : ''}`}>
                  <span className="tl-result-head">Where this breaks</span>
                  <ul>
                    {[
                      'A higher salary can price the same work — the market moved, not your ceiling.',
                      'Senior titles often trade learning for scope.',
                      'The stagnation might be the team, not the role. That travels.',
                    ].map((p, i) => (
                      <li key={p} className={st > 2800 + i * 550 ? 'is-in' : undefined}>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* iii · the working goes down, and the mistake stays */}
            {scene.id === 'board' && (
              <div className="tl-pane tl-boardpane">
                {/* The Board's chain is 92px a row, so four steps need ~400px.
                    It is laid out at full size and scaled to the stage rather
                    than cramped — the working stays legible either way. */}
                <div className="tl-boardscale">
                  <MathBoard map={boardMap} width={810} height={400} />
                </div>
              </div>
            )}

            {/* iv · the guard declines, and offers the door */}
            {scene.id === 'guard' && (
              <div className="tl-pane tl-guardpane">
                <div className={`lg-msg lg-msg-user${st > 300 ? ' tl-in' : ' tl-out'}`}>
                  <div className="lg-msg-stack">
                    <div className="lg-msg-body">just tell me x</div>
                  </div>
                </div>
                <div className={`lg-msg lg-msg-assistant${st > 1200 ? ' tl-in' : ' tl-out'}`}>
                  <span className="lg-msg-who">Socria</span>
                  <div className="lg-msg-body">
                    Not yet — you are one step away. What does setting each
                    factor to zero give you?
                  </div>
                </div>
                <div className={`lg-guard${st > 2400 ? ' tl-in' : ' tl-out'}`} role="note">
                  <span className="lg-guard-dot" aria-hidden="true" />
                  <span className="lg-guard-text">
                    Guiding, not solving — you’re working this one out.
                  </span>
                  <span className="lg-guard-hint">Another hint</span>
                  <span className="lg-guard-reveal">Show solution</span>
                </div>
              </div>
            )}
          </div>

          <div className="tl-rail">
            <span className="tl-rail-label">
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
                      i === si && !still.current
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
            Now open to everyone
          </p>
          <h2 id="try-logos-title" className="j3-title reveal-in" style={{ animationDelay: '130ms' }}>
            Watch your thinking{' '}
            <span className="j3-title-em">take shape</span>.
          </h2>
          <p className="j3-standfirst reveal-in" style={{ animationDelay: '200ms' }}>
            Every other AI hands you an answer and leaves you no wiser. Logos
            draws the structure of your own reasoning beside you as you talk —
            and hands the thinking back.
          </p>

          <ol className="j3-dispatches">
            {DISPATCHES.map((d, i) => (
              <li
                key={d.n}
                className="j3-dispatch reveal-in"
                style={{ animationDelay: `${280 + i * 70}ms` }}
              >
                <span className="j3-dispatch-n">{d.n}.</span>
                <div>
                  <h3>{d.h}</h3>
                  <p>{d.p}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="tl-free reveal-in" style={{ animationDelay: '520ms' }}>
            Free to start — and whatever you build stays yours, at every tier.
          </p>

          {!isSignedIn && (
            <div className="tl-keywrap reveal-in" style={{ animationDelay: '560ms' }}>
              <button
                type="button"
                className="lg-gate-toggle tl-keytoggle"
                aria-expanded={keyOpen}
                onClick={() => setKeyOpen((v) => !v)}
              >
                Have an access key?
              </button>
              <div className="core3-modal-key-row" hidden={!keyOpen}>
                <input
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Enter key"
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    if (keyError) setKeyError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitKey();
                    }
                  }}
                  className={`core3-modal-key-input${keyError ? ' core3-modal-key-input-error' : ''}`}
                  aria-invalid={keyError}
                  aria-label="Access key"
                />
                <button type="button" onClick={submitKey} className="core3-modal-key-btn">
                  Unlock
                </button>
              </div>
              {keyError && (
                <span className="core3-modal-key-error" role="alert">
                  That key isn&rsquo;t right.
                </span>
              )}
            </div>
          )}

          <div className="core3-modal-footer reveal-in" style={{ animationDelay: '620ms' }}>
            <label className="core3-modal-checkbox">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
              />
              <span>Don&rsquo;t show again</span>
            </label>
            <button type="button" onClick={onTry} className="core3-modal-primary tl-primary">
              <span className="core3-modal-primary-shine" aria-hidden />
              <span className="tl-primary-mark" aria-hidden>
                <LogosMark size={15} />
              </span>
              <span className="core3-modal-primary-label">
                {isSignedIn ? 'Open Logos' : 'Sign in to open Logos'}
              </span>
              <span aria-hidden className="core3-modal-primary-arrow">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
