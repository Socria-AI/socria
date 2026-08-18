'use client';

// A short walk through what Logos can do, shown once on a first visit and
// reachable afterwards from the "?" in the header.
//
// It demonstrates rather than lists: each step animates the actual behaviour
// in miniature, because "the map reorganizes as you think" means nothing as a
// sentence and is obvious the moment you watch two nodes fold into one.

import { useEffect, useState } from 'react';

export const GUIDE_SEEN_KEY = 'socria.logos.guide.v1';

interface Step {
  kicker: string;
  title: string;
  body: string;
  example?: string;
  demo: JSX.Element;
}

/* ── miniature demos ──────────────────────────────────────────────── */

const Talk = (
  <div className="lgg-demo lgg-talk">
    <div className="lgg-bubble lgg-bubble-user">
      I can’t tell if I want this career or just the idea of it.
    </div>
    <div className="lgg-bubble lgg-bubble-logos">
      <span className="lgg-who">Logos</span>
      You said “the idea of it,” which suggests you’ve already noticed a gap.
    </div>
  </div>
);

const MapForm = (
  <div className="lgg-demo lgg-map">
    <svg viewBox="0 0 260 130" className="lgg-wires" aria-hidden="true">
      <path className="lgg-wire lgg-wire-1" d="M78 40 C 110 46, 120 60, 130 72" />
      <path className="lgg-wire lgg-wire-2" d="M182 44 C 160 52, 148 62, 138 72" />
    </svg>
    <span className="lgg-node lgg-node-a" data-t="value">Freedom to build</span>
    <span className="lgg-node lgg-node-b" data-t="tension">Security vs. autonomy</span>
    <span className="lgg-node lgg-node-c" data-t="question">Which freedom do I mean?</span>
  </div>
);

const Actions = (
  <div className="lgg-demo lgg-actions">
    <span className="lgg-node lgg-node-still" data-t="claim">Autonomy is not independence</span>
    <div className="lgg-menu">
      {['Explore', 'Challenge', 'Research', 'Trace'].map((a, i) => (
        <span key={a} style={{ animationDelay: `${0.5 + i * 0.09}s` }}>
          {a}
        </span>
      ))}
    </div>
  </div>
);

const Reorganize = (
  <div className="lgg-demo lgg-reorg">
    <span className="lgg-node lgg-merge-a" data-t="value">Independence</span>
    <span className="lgg-node lgg-merge-b" data-t="value">Being my own boss</span>
    <span className="lgg-node lgg-merge-c" data-t="value">
      Freedom to build
      <em>+2 folded in</em>
    </span>
    <span className="lgg-node lgg-resolve" data-t="question">
      Do I want it? <b>✓ resolved</b>
    </span>
  </div>
);

const Material = (
  <div className="lgg-demo lgg-material">
    <div className="lgg-chip lgg-chip-1">
      <i />
      <span>
        journal-aug.txt
        <em>1,240 words</em>
      </span>
    </div>
    <div className="lgg-chip lgg-chip-2">
      <i className="is-img" />
      <span>
        whiteboard.jpg
        <em>read</em>
      </span>
    </div>
    <div className="lgg-origins">
      <span>My thinking</span>
      <span className="is-on">Source material</span>
      <span>Context</span>
    </div>
  </div>
);

const Draft = (
  <div className="lgg-demo lgg-draft">
    <p>
      For most of the year I described what I want as independence,{' '}
      <mark>and said it in a way that sounded settled.</mark>
    </p>
    <div className="lgg-menu lgg-menu-draft">
      {['Clarify', 'Challenge', 'Trace', 'Research', 'Refine'].map((a, i) => (
        <span key={a} style={{ animationDelay: `${0.9 + i * 0.07}s` }}>
          {a}
        </span>
      ))}
    </div>
  </div>
);

const STEPS: Step[] = [
  {
    kicker: 'Start here',
    title: 'Think out loud.',
    body: 'Logos won’t hand you an answer. It reflects something specific back and asks the question that opens your thinking further.',
    example: 'Deciding, drafting, researching, planning, or working something out — it meets whichever you’re doing.',
    demo: Talk,
  },
  {
    kicker: 'While you talk',
    title: 'Your thinking takes shape beside you.',
    body: 'After every message the Thinking Map is rebuilt from the conversation — not from the reply. It grows while the answer is still arriving.',
    example: 'It reads what kind of thinking is happening and changes what it looks for: goals and tradeoffs for a decision, claims and counterpoints for an essay, characters and themes for a story.',
    demo: MapForm,
  },
  {
    kicker: 'Any card',
    title: 'Nothing on the map is inert.',
    body: 'Click a piece of your reasoning to Explore what the idea is, Challenge where it would break, Research what the evidence says, or Trace where it came from.',
    example: 'Each one opens a thread you can keep talking in — and none of them hands you a verdict.',
    demo: Actions,
  },
  {
    kicker: 'As you go',
    title: 'The map reorganizes, not just grows.',
    body: 'Ideas that turn out to be the same thing merge. Questions you answer are marked resolved. Beliefs you change are kept beside the ones that replaced them.',
    example: 'Nothing is deleted quietly — watching a belief get replaced is the point.',
    demo: Reorganize,
  },
  {
    kicker: 'Bring your own',
    title: 'Paste notes. Drop images.',
    body: 'Long text becomes an attached note instead of swallowing the box. Images are read once, so the map sees what you saw.',
    example: 'Tag anything you didn’t write as source material, and Logos won’t mistake its author’s convictions for yours.',
    demo: Material,
  },
  {
    kicker: 'When you’re ready',
    title: 'Turn it into something.',
    body: 'Open the Draft and write with your map beside you. Select your own words for Clarify, Challenge, Trace, Research or Refine.',
    example: 'Refine proposes a wording — you accept it or keep yours. Nothing reaches the page unless you put it there.',
    demo: Draft,
  },
];

export function LogosGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!open) return;
    setI(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, STEPS.length - 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <div className="lgg-veil" role="dialog" aria-modal="true" aria-label="What Logos does">
      <div className="lgg">
        <header className="lgg-head">
          <span className="lgg-kicker">{step.kicker}</span>
          <button type="button" className="lgg-skip" onClick={onClose}>
            {last ? 'Close' : 'Skip'}
          </button>
        </header>

        {/* Keyed on the step so every demo replays from the top. */}
        <div className="lgg-stage" key={i}>
          {step.demo}
        </div>

        <div className="lgg-copy">
          <h2>{step.title}</h2>
          <p>{step.body}</p>
          {step.example && <p className="lgg-example">{step.example}</p>}
        </div>

        <footer className="lgg-foot">
          <div className="lgg-dots">
            {STEPS.map((s, n) => (
              <button
                key={s.title}
                type="button"
                className={n === i ? 'is-on' : undefined}
                onClick={() => setI(n)}
                aria-label={`Step ${n + 1}: ${s.title}`}
              />
            ))}
          </div>
          <div className="lgg-nav">
            {i > 0 && (
              <button type="button" className="lgg-back" onClick={() => setI(i - 1)}>
                Back
              </button>
            )}
            <button
              type="button"
              className="lgg-next"
              onClick={() => (last ? onClose() : setI(i + 1))}
            >
              {last ? 'Start thinking' : 'Next'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
