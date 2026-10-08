'use client';

// A short walk through what Logos can do, shown once on a first visit and
// reachable afterwards from the "?" in the header.
//
// It demonstrates rather than lists: each step animates the actual behaviour
// in miniature, because "the map reorganizes as you think" means nothing as a
// sentence and is obvious the moment you watch two nodes fold into one.
//
// Logos 3 walks a different path through the same idea (STEPS_3): what it
// adds is said where it happens — a model built from a description, the chat
// box that works everything, the views opened beside the map, and a second
// person with Socria between you. What it shares with Logos 2 (the map, the
// cards, your own material, the draft) is said in the same words.

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
      <span className="lgg-who">Socria</span>
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

const Ground = (
  <div className="lgg-demo lgg-ground">
    <span className="lgg-node lgg-ground-node" data-t="question">
      Launch Socria One in September?
      <b className="lgg-ground-badge">⎘ 1</b>
    </span>
    <div className="lgg-ground-srcs">
      {['Drive', 'Notion', 'Calendar', 'Gmail', 'Web', 'Paste'].map((x, i) => (
        <span key={x} style={{ animationDelay: `${0.45 + i * 0.08}s` }}>
          {x}
        </span>
      ))}
    </div>
    <div className="lgg-ground-doc">
      <i />
      <span>
        Socria One — launch plan
        <em>Google Drive · source material</em>
      </span>
    </div>
  </div>
);

const MathDemo = (
  <div className="lgg-demo lgg-math">
    <span className="lgg-node lgg-math-1" data-t="equation">2x + 6 = 14</span>
    <span className="lgg-math-op lgg-math-op-1">−6 both sides</span>
    <span className="lgg-node lgg-math-2 is-err" data-t="step">
      2x = 20
      <b className="lgg-math-flag">where it diverged</b>
    </span>
    <span className="lgg-math-op lgg-math-op-2">÷ 2</span>
    <span className="lgg-node lgg-math-3" data-t="result">x = 10</span>
  </div>
);

/* ── Logos 3, in miniature ─────────────────────────────────────────── */

const Built = (
  <div className="lgg-demo lgg-built">
    <div className="lgg-bubble lgg-bubble-user">A mass on a spring, with a damper. Let me change the damping.</div>
    <div className="lgg-built-model">
      <svg viewBox="0 0 220 64" className="lgg-built-plot" aria-hidden="true">
        <line x1="0" y1="32" x2="220" y2="32" className="lgg-built-axis" />
        <path className="lgg-built-curve" d="M0 6 C 12 6, 14 56, 26 56 S 40 14, 52 14 S 66 48, 78 48 S 92 22, 104 22 S 118 40, 130 40 S 144 28, 156 28 S 170 35, 182 35 S 196 31, 220 32" />
      </svg>
      <div className="lgg-built-slider">
        <span>damping c</span>
        <i><b /></i>
        <em>0.6 N·s/m</em>
      </div>
      <p className="lgg-built-said">computed by the engine, not written by the AI</p>
    </div>
  </div>
);

// R2 − 3R1 on [1 2 1; 3 8 1; 0 4 1]: the second row becomes [0 2 −2]. Every
// cell has its place in the grid, so the new row lands exactly on the old one.
const ONEBOX_ROWS = [
  ['1', '2', '1'],
  ['3', '8', '1'],
  ['0', '4', '1'],
];
const OneBox = (
  <div className="lgg-demo lgg-onebox">
    <div className="lgg-onebox-grid" aria-hidden="true">
      {ONEBOX_ROWS.flatMap((row, r) =>
        row.map((v, c) => (
          <span key={`${r}.${c}`} className={r === 1 ? 'is-row' : undefined} style={{ gridRow: r + 1, gridColumn: c + 1 }}>
            {v}
          </span>
        ))
      )}
      {['0', '2', '−2'].map((v, c) => (
        <span key={`n${c}`} className="is-new" style={{ gridRow: 2, gridColumn: c + 1 }}>
          {v}
        </span>
      ))}
    </div>
    <div className="lgg-onebox-box">
      <span>R2 ← R2 − 3R1</span>
      <i>↵</i>
    </div>
    <p className="lgg-onebox-said">computed exactly · undo takes it back</p>
  </div>
);

const Views = (
  <div className="lgg-demo lgg-views">
    <span className="lgg-views-add">+ View</span>
    <div className="lgg-views-tiles">
      <span className="is-map">Map</span>
      <span className="is-model">Model</span>
      <span className="is-params">Parameters</span>
      <span className="is-3d">Live 3D</span>
    </div>
  </div>
);

const Together = (
  <div className="lgg-demo lgg-together">
    <div className="lgg-together-people">
      <span className="lgg-together-a">Maya</span>
      <span className="lgg-together-b">Sam</span>
    </div>
    <div className="lgg-bubble lgg-bubble-logos lgg-together-note">
      <span className="lgg-who">Socria</span>
      You both assume the budget is fixed. Maya is weighing speed, Sam is weighing risk.
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
    kicker: 'Numbers too',
    title: 'It follows your math, and shows the work.',
    body: 'Solve, prove, or calculate and Logos lays the work out as a chain — givens, each step, the result — with equations set in real notation.',
    example: 'Make a slip and it marks the first step that diverged and helps you repair it, instead of pasting a clean solution over your work.',
    demo: MathDemo,
  },
  {
    kicker: 'Bring your own',
    title: 'Paste notes. Drop images.',
    body: 'Long text becomes an attached note instead of swallowing the box. Images are read once, so the map sees what you saw.',
    example: 'Tag anything you didn’t write as source material, and Logos won’t mistake its author’s convictions for yours.',
    demo: Material,
  },
  {
    kicker: 'Any card, again',
    title: 'Ground it in your real material.',
    body: 'Add context to one piece of thinking straight from Drive, Notion, your calendar, your inbox, a page you’re reading, or a paste — chosen by you, attached to that node.',
    example: 'Your material gives Logos context, never authority. The planning doc informs the September question; it doesn’t get to answer it.',
    demo: Ground,
  },
  {
    kicker: 'When you’re ready',
    title: 'Turn it into something.',
    body: 'Open the Draft and write with your map beside you. Select your own words for Clarify, Challenge, Trace, Research or Refine.',
    example: 'Refine proposes a wording — you accept it or keep yours. Nothing reaches the page unless you put it there.',
    demo: Draft,
  },
];

/**
 * Logos 3's walk. Shared steps are the same objects, so a change to how the
 * map or the draft is described changes both walks at once.
 */
const at = (title: string) => STEPS.find((x) => x.title === title)!;
const STEPS_3: Step[] = [
  at('Think out loud.'),
  at('Your thinking takes shape beside you.'),
  {
    kicker: 'Say what it is',
    title: 'Describe it, and it’s built.',
    body: 'Describe a system — a spring, a circuit, a beam, a population — and Logos builds a live model of it, with units. Move a slider and everything that depends on it moves.',
    example: 'The model is computed by an engine, not written by the AI, and checked against exact results where they exist. When something is missing, it asks rather than guessing.',
    demo: Built,
  },
  {
    kicker: 'One box',
    title: 'The chat works everything.',
    body: 'Ask a question, or say what to do: “R2 ← R2 − 3R1” on a matrix, “a = 2” on a curve, “make it twice as tall” in Live 3D. Each step is computed exactly, and undo takes it back.',
    example: 'The buttons and sliders are there when your hands are faster. You never have to learn them.',
    demo: OneBox,
  },
  {
    kicker: '+ View',
    title: 'Open what you need beside it.',
    body: 'The map, a model, its parameters, the inspector, a model’s history or Live 3D, side by side. Select something in one and the others follow.',
    example: 'Live 3D is experimental: a geometric preview with exact sizes and masses, not a physical simulation.',
    demo: Views,
  },
  at('Nothing on the map is inert.'),
  {
    kicker: 'Together',
    title: 'Think it through with someone.',
    body: 'Share a line of thinking and work in it together: one map, one set of models. Socria sits between you and names where you agree, where you differ, and what neither of you has asked.',
    example: 'It does not take sides. Owners, editors, commenters and viewers each get what they should.',
    demo: Together,
  },
  at('Paste notes. Drop images.'),
  at('Turn it into something.'),
];

export function LogosGuide({ open, onClose, edition = 2 }: { open: boolean; onClose: () => void; edition?: 2 | 3 }) {
  const STEPS_SHOWN = edition === 3 ? STEPS_3 : STEPS;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!open) return;
    setI(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, STEPS_SHOWN.length - 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, STEPS_SHOWN.length]);

  if (!open) return null;
  const step = STEPS_SHOWN[i];
  const last = i === STEPS_SHOWN.length - 1;

  return (
    <div className="lgg-veil" role="dialog" aria-modal="true" aria-label={edition === 3 ? 'What Logos 3 does' : 'What Logos does'}>
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
            {STEPS_SHOWN.map((s, n) => (
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
