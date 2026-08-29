'use client';

// The invitation to try Socria Logos.
//
// A list of features cannot sell this product, because the thing that makes
// Logos worth trying is something you have to WATCH: you talk, and the shape
// of your reasoning appears beside you. So the hero is not a screenshot — it
// is that moment, staged. A line is typed, and the map assembles itself out of
// it: a claim, the assumption underneath, the value pulling the other way, and
// the tension between them drawn last, because the tension is the payoff. Then
// it holds, and begins again.
//
// The nodes are the app's real classes and glyphs (.lg-node, NodeGlyph), so
// what someone sees here is what they meet when they open it.

import { useEffect, useRef, useState } from 'react';
import { LogosMark } from './LogosMark';
import { NodeGlyph } from './NodeGlyph';
import type { LogosNodeType } from '@/lib/logos';

/** The line that is "typed", and the map it produces. */
const TYPED = 'I got an offer with a lot more money — honestly I’ve stopped growing here.';

/** The stage's fixed height, so node rows can be placed in real pixels. */
const STAGE_H = 206;

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
  { id: 'pay', type: 'claim', label: 'It pays more', x: 1, y: 0, at: 1500 },
  { id: 'grow', type: 'claim', label: 'I’ve stopped growing', x: 53, y: 14, at: 2100 },
  { id: 'assume', type: 'assumption', label: 'More money means progress', x: 0, y: 76, at: 2900 },
  { id: 'value', type: 'value', label: 'Work that teaches me', x: 52, y: 90, at: 3600 },
  { id: 'tension', type: 'tension', label: 'Security ↔ growth', x: 26, y: 152, at: 4500 },
];

/**
 * Edges draw once both ends exist. The svg is a 0–100 box stretched over the
 * stage, so these are percentages of STAGE_H vertically — computed from the
 * rows above rather than eyeballed.
 */
const WIRES: { from: string; to: string; d: string; at: number }[] = [
  { from: 'pay', to: 'assume', d: 'M 23 23 C 22 28, 22 33, 22 37', at: 3250 },
  { from: 'grow', to: 'value', d: 'M 75 30 C 75 35, 74 40, 74 44', at: 3950 },
  { from: 'assume', to: 'tension', d: 'M 22 60 C 27 65, 38 71, 46 74', at: 4850 },
  { from: 'value', to: 'tension', d: 'M 74 67 C 69 69, 58 72, 51 74', at: 4850 },
];

const LOOP = 8200;

const DISPATCHES = [
  {
    n: 'i',
    h: 'Your reasoning, drawn as you talk',
    p: 'Claims, assumptions, tensions and evidence appear beside the conversation and reorganize as your mind does — because a thought you can see is a thought you can argue with.',
  },
  {
    n: 'ii',
    h: 'Press on any thought',
    p: 'Challenge it and get the three ways it could break. Trace it and read the moment you first said it, quoted back word for word.',
  },
  {
    n: 'iii',
    h: 'It will not do your thinking',
    p: 'Working a problem to learn it? Logos guides and withholds the answer — on the page, on the board, everywhere at once — until you reach it yourself.',
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
  const raf = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(dontShow);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dontShow, onClose]);

  // One clock drives the whole staging. Anyone who has asked for less motion
  // gets the finished map immediately — the point survives without the reveal.
  useEffect(() => {
    if (!open) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setT(LOOP);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      setT((now - start) % LOOP);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [open]);

  if (!open) return null;

  const typedChars = Math.max(0, Math.min(TYPED.length, Math.round((t - 260) / 17)));
  const typing = t > 200 && typedChars < TYPED.length;

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

        {/* the hero: a sentence, and the reasoning inside it taking shape */}
        <div className="tl-stage logos-root" aria-hidden="true">
          <div className="tl-said">
            <span className="tl-said-text">{TYPED.slice(0, typedChars)}</span>
            {typing && <span className="tl-caret" />}
          </div>
          <div className="tl-map" style={{ height: STAGE_H }}>
            <svg className="tl-wires" viewBox="0 0 100 100" preserveAspectRatio="none">
              {WIRES.map((w) => (
                <path
                  key={`${w.from}-${w.to}`}
                  d={w.d}
                  className={`tl-wire${t > w.at ? ' is-in' : ''}`}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {BEATS.map((b) => (
              <span
                key={b.id}
                className={`lg-node lg-node-${b.type} tl-node${t > b.at ? ' is-in' : ''}`}
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
