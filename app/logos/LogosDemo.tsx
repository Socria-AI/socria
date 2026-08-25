'use client';

// The /logos page's demonstrations — the real Logos interface, running.
//
// These are not drawings of the product. `<ThinkingMap>` and `<MathBoard>` are
// the same components the app renders, mounted with canned reasoning from
// demo-data.ts, inside a frame that contains them. The surrounding chrome —
// the thread, the composer, the header pills, the node menu — is built from
// the app's own .lg-* classes, so what a visitor reads here is what they meet
// when they open it.
//
// Containment: .logos-root is `position: fixed; inset: 0` in the app, which
// would swallow the page. `.lg-demo` (in logos.css) puts it back into flow at
// a fixed height; everything inside then styles itself normally.

import { useState } from 'react';
import { ThinkingMap } from '@/components/ThinkingMap';
import { MathBoard } from '@/components/MathBoard';
import { LogosMark } from '@/components/LogosMark';
import { NodeGlyph } from '@/components/NodeGlyph';
import { THINKING_DEPTHS } from '@/lib/socria-prompt';
import { DEFAULT_PERSONALITY, PERSONALITY_DIMENSIONS } from '@/lib/logos-personality';
import { DEMO_MAP, DEMO_MATH_MAP, DEMO_TURNS } from './demo-data';

/** A framed slice of the product, captioned. */
function Frame({
  label,
  height = 420,
  children,
}: {
  label: string;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <figure className="ui-frame">
      {/* The design system has no browser-chrome vocabulary, so the frame
          announces itself the way its other exhibits do: a small letterspaced
          rule, not traffic lights. */}
      <div className="ui-chrome" aria-hidden="true">
        <span className="ui-addr">Socria Logos · live</span>
      </div>
      <div className="ui-body" style={{ height }}>
        <div className="logos-root lg-demo">{children}</div>
      </div>
      <figcaption className="ui-cap">{label}</figcaption>
    </figure>
  );
}

/** The whole thing: conversation on the left, live map on the right. */
export function DemoSplit() {
  return (
    <Frame label="The conversation and its map, side by side — as it actually runs" height={470}>
      <div className="lg-split rail-closed" style={{ height: '100%' }}>
        <section className="lg-convo">
          <header className="lg-head">
            <span className="lg-word">
              <LogosMark size={22} />
            </span>
            <span className="lg-head-note">A reasoning environment</span>
            <span className="lg-depth-btn" style={{ marginLeft: 'auto' }}>
              Balanced
            </span>
          </header>
          <div className="lg-thread" style={{ overflow: 'hidden' }}>
            {DEMO_TURNS.map((m, i) => (
              <div key={i} className={`lg-msg lg-msg-${m.role}`}>
                {m.role === 'assistant' && <span className="lg-msg-who">Logos</span>}
                <div className="lg-msg-stack">
                  <div className="lg-msg-body">{m.content}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="lg-composer">
            <div className="lg-composer-box">
              <div className="lg-composer-row">
                <span className="ui-placeholder">What are you thinking through?</span>
              </div>
            </div>
          </div>
        </section>
        <section className="lg-panel">
          <header className="lg-panel-head">
            <span className="lg-panel-title">
              Thinking Map<em className="lg-panel-context">deciding</em>
            </span>
            <span className="lg-panel-state">7 nodes</span>
          </header>
          <ThinkingMap map={DEMO_MAP} initialLens="graph" />
        </section>
      </div>
    </Frame>
  );
}

/** The same reasoning under a different lens. */
export function DemoLenses() {
  const [lens, setLens] = useState<'graph' | 'structure' | 'tensions' | 'evidence'>('structure');
  const LENSES = [
    { id: 'graph', label: 'Graph', blurb: 'everything at once, alive and settling' },
    { id: 'structure', label: 'Structure', blurb: 'what rests on what' },
    { id: 'tensions', label: 'Tensions', blurb: 'what pulls against what' },
    { id: 'evidence', label: 'Evidence', blurb: 'which claims are actually held up' },
  ] as const;
  return (
    <div className="ui-lenses">
      <div className="ui-lenstabs" role="tablist" aria-label="Lens">
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={lens === l.id}
            className={`lg-lens${lens === l.id ? ' is-on' : ''}`}
            onClick={() => setLens(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p className="ui-lensblurb">{LENSES.find((l) => l.id === lens)!.blurb}</p>
      <Frame label="Switch lens and the same thinking rearranges — try it" height={380}>
        <div className="lg-panel" style={{ height: '100%' }}>
          <ThinkingMap key={lens} map={DEMO_MAP} initialLens={lens} />
        </div>
      </Frame>
    </div>
  );
}

/** A node, and the four things you can do to it. */
export function DemoMoves() {
  const MOVES = [
    { id: 'explore', label: 'Explore', blurb: 'What this idea is, and what it isn’t' },
    { id: 'challenge', label: 'Challenge', blurb: 'Where this would break' },
    { id: 'research', label: 'Research', blurb: 'What the evidence actually says' },
    { id: 'trace', label: 'Trace', blurb: 'Where this came from' },
  ];
  return (
    <Frame label="Click any node — the menu the app actually opens" height={470}>
      <div className="ui-menudemo">
        <button type="button" className="lg-node lg-node-assumption lg-st-open is-focused" style={{ width: 200 }}>
          <span className="lg-node-head">
            <NodeGlyph type="assumption" />
            <span className="lg-node-type">assumption</span>
          </span>
          <span className="lg-node-label">More money means progress</span>
          <span className="lg-node-note">unexamined — you have not said why these are the same thing</span>
        </button>
        <div className="lg-acts" role="menu" style={{ position: 'static', transform: 'none' }}>
          {MOVES.map((m) => (
            <span key={m.id} className={`lg-act lg-act-${m.id}`} role="menuitem">
              <span className="lg-act-label">{m.label}</span>
              <span className="lg-act-blurb">{m.blurb}</span>
            </span>
          ))}
          <span className="lg-act lg-act-context" role="menuitem">
            <span className="lg-act-label">Add context</span>
            <span className="lg-act-blurb">Ground it in your material</span>
          </span>
        </div>
      </div>
    </Frame>
  );
}

/** The Board, with the guard on. */
export function DemoBoard() {
  return (
    <Frame label="The Board — the same working, by hand" height={360}>
      <div className="lg-panel" style={{ height: '100%' }}>
        <div className="lg-map-wrap" style={{ height: '100%' }}>
          <div className="lg-map">
            <MathBoard map={DEMO_MATH_MAP} width={620} height={330} guarded />
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** The Answer Guard bar, verbatim from the app. */
export function DemoGuard() {
  return (
    <Frame label="While you are learning — the bar the app shows, and the door out of it" height={300}>
      <div className="ui-guarddemo">
        <div className="lg-msg lg-msg-user">
          <div className="lg-msg-stack">
            <div className="lg-msg-body">just tell me x</div>
          </div>
        </div>
        <div className="lg-msg lg-msg-assistant">
          <span className="lg-msg-who">Logos</span>
          <div className="lg-msg-body">
            Not yet — you are one step away. What does setting each factor to zero give you?
          </div>
        </div>
        <div className="lg-guard" role="note">
          <span className="lg-guard-dot" aria-hidden="true" />
          <span className="lg-guard-text">Guiding, not solving — you’re working this one out.</span>
          <span className="lg-guard-hint">Another hint</span>
          <span className="lg-guard-reveal">Show solution</span>
        </div>
      </div>
    </Frame>
  );
}

/** Depth and personality — the controls beside the composer. */
export function DemoControls() {
  const [depth, setDepth] = useState('balanced');
  return (
    <Frame label="Depth, where it lives — beside the box you type in" height={490}>
      <div className="ui-ctrldemo">
        <div className="lg-composer">
          <div className="lg-composer-box">
            <div className="lg-composer-row">
              <span className="ui-placeholder">What are you thinking through?</span>
            </div>
          </div>
        </div>
        <div className="lg-tools" style={{ margin: '10px 0 0' }}>
          <div className="lg-depth">
            <span className="lg-depth-btn">
              {THINKING_DEPTHS.find((d) => d.id === depth)!.label}
            </span>
          </div>
          <div className="lg-model">
            <span className="lg-model-btn">
              <LogosMark size={14} />
              <span className="lg-model-name">Logos</span>
            </span>
          </div>
        </div>
        <div className="lg-depth-menu is-up ui-depthmenu" role="listbox">
          {THINKING_DEPTHS.map((d) => (
            <button
              key={d.id}
              type="button"
              role="option"
              aria-selected={depth === d.id}
              className={`lg-depth-opt${depth === d.id ? ' is-on' : ''}`}
              onClick={() => setDepth(d.id)}
            >
              <span className="lg-depth-opt-label">{d.label}</span>
              <span className="lg-depth-opt-desc">{d.description}</span>
            </button>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** The personality settings, as the sheet actually presents them. */
export function DemoPersonality() {
  const [p, setP] = useState<Record<string, string>>({
    ...DEFAULT_PERSONALITY,
    base: 'casual',
    directness: 'blunt',
    challenge: 'rigorous',
    questioning: 'fewer',
  });
  return (
    <Frame label="The nine settings, as the app presents them — change one" height={430}>
      <div className="ui-personademo">
        <h3 className="lg-style-title">Socria Personality</h3>
        <p className="lg-style-sub">
          How Socria communicates while it thinks with you. Depth stays separate.
        </p>
        <div className="lg-persona-grid">
          {PERSONALITY_DIMENSIONS.map((d) => (
            <label key={d.id} className="lg-persona-field">
              <span className="lg-persona-label">{d.label}</span>
              <select
                className="lg-persona-select"
                value={p[d.id] ?? d.options[0].id}
                onChange={(e) => setP((prev) => ({ ...prev, [d.id]: e.target.value }))}
              >
                {d.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
    </Frame>
  );
}
