'use client';
// components/FirstMap.tsx
//
// Three cards, over a real map, waiting on a real hand.
//
// Deliberately NOT a modal. A modal would cover the thing it is talking
// about and make the sequence something to get past rather than something to
// do — and the whole point is that the person presses a card on their own
// map while the sentence explaining it is still on screen.
//
// It sits at the bottom of the map pane at every width. The pill this
// replaces was `hidden sm:block`, so on a phone there was no invitation at
// all; that is the specific mistake not to repeat, and a bottom sheet is
// where a thumb already is.

import { byId, indexOf, STEPS, type State } from '@/lib/onboarding';

export function FirstMap({
  state,
  onSkip,
  onFinish,
}: {
  state: State;
  onSkip: () => void;
  onFinish: () => void;
}) {
  if (state.at === 'idle' || state.at === 'done') return null;
  const step = byId(state.at);
  const i = indexOf(state);
  const last = i === STEPS.length - 1;

  return (
    <div className="lg-fm" role="region" aria-label="Getting started">
      <div className="lg-fm-card">
        <div className="lg-fm-head">
          <span className="lg-fm-dots" aria-hidden="true">
            {STEPS.map((s, n) => (
              <i key={s.id} className={n <= i ? 'is-on' : ''} />
            ))}
          </span>
          {/* Always reachable, never the biggest thing on the card. */}
          <button type="button" className="lg-fm-skip" onClick={onSkip}>
            Skip
          </button>
        </div>

        <p className="lg-fm-title">{step.title}</p>
        <p className="lg-fm-body">{step.body}</p>

        <div className="lg-fm-foot">
          {/* The cue is an instruction, not a button, for every step but the
              last — there is nothing to press here, the thing to press is
              the map. On the last beat there IS nothing left to do, so it
              becomes the way out. */}
          {last ? (
            <button type="button" className="lg-fm-go" onClick={onFinish}>
              Got it
            </button>
          ) : (
            <span className="lg-fm-cue">{step.cue}</span>
          )}
        </div>
      </div>
    </div>
  );
}
