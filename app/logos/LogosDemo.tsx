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
import { DEMO_MAP, DEMO_MATH_MAP, DEMO_MOVE_RESULTS, DEMO_TURNS } from './demo-data';

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
      <div className="lg-split lg-demo-split" style={{ height: '100%' }}>
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

/**
 * A node, the menu it opens, and what each move actually gives back.
 *
 * Click a move and the result panel below changes — the same anatomy the app
 * renders (concept, framing, points, the verbatim origins Trace quotes, the
 * connection, and the question it always ends on).
 */
export function DemoMoves() {
  const MOVES = [
    { id: 'explore', label: 'Explore', blurb: 'What this idea is, and what it isn’t' },
    { id: 'challenge', label: 'Challenge', blurb: 'Where this would break' },
    { id: 'research', label: 'Research', blurb: 'What the evidence actually says' },
    { id: 'trace', label: 'Trace', blurb: 'Where this came from' },
  ] as const;
  const POINTS_LABEL: Record<string, string> = {
    challenge: 'Pressure points',
    research: 'What the evidence says',
  };
  const [move, setMove] = useState<'explore' | 'challenge' | 'research' | 'trace'>('explore');
  const r = DEMO_MOVE_RESULTS[move];

  return (
    <Frame label="Click a move — this is what it hands back" height={560}>
      <div className="ui-movedemo">
        <div className="ui-movedemo-left">
          <button
            type="button"
            className="lg-node lg-node-assumption lg-st-open is-focused"
            style={{ width: '100%', maxWidth: 230 }}
          >
            <span className="lg-node-head">
              <NodeGlyph type="assumption" />
              <span className="lg-node-type">assumption</span>
            </span>
            <span className="lg-node-label">More money means progress</span>
          </button>
          <div className="lg-acts ui-acts" role="menu">
            {MOVES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="menuitem"
                className={`lg-act lg-act-${m.id}${move === m.id ? ' is-on' : ''}`}
                onClick={() => setMove(m.id)}
              >
                <span className="lg-act-label">{m.label}</span>
                <span className="lg-act-blurb">{m.blurb}</span>
              </button>
            ))}
            <span className="lg-act lg-act-context" role="menuitem">
              <span className="lg-act-label">Add context</span>
              <span className="lg-act-blurb">Ground it in your material</span>
            </span>
          </div>
        </div>

        <div className="lg-explore ui-xp">
          <header className="lg-x-head">
            <div className="lg-x-title">
              <span className="lg-x-chip lg-node-assumption">
                <NodeGlyph type="assumption" />
                assumption
              </span>
              <span className="lg-x-label">More money means progress</span>
            </div>
          </header>
          <div className="lg-x-body">
            {r.concept && <span className="lg-x-concept">{r.concept}</span>}
            {r.framing && <p className="lg-x-framing">{r.framing}</p>}

            {!!r.origins?.length && (
              <div className="lg-x-origins">
                <span className="lg-x-block-label">First said</span>
                {r.origins.map((o, i) => (
                  <blockquote key={i} className={`lg-x-origin lg-x-origin-${o.who}`}>
                    <span className="lg-x-origin-who">{o.who === 'you' ? 'You' : 'Logos'}</span>
                    {o.quote}
                  </blockquote>
                ))}
              </div>
            )}

            {!!r.lineage?.length && (
              <div className="lg-x-lineage">
                <span className="lg-x-block-label">Where it sits now</span>
                <ul>
                  {r.lineage.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}

            {!!r.points?.length && (
              <div className={`lg-x-points lg-x-points-${move}`}>
                <span className="lg-x-block-label">{POINTS_LABEL[move] ?? 'Points'}</span>
                <ul>
                  {r.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {r.connection && <p className="lg-x-connection">{r.connection}</p>}
            {r.question && <p className="lg-x-question">{r.question}</p>}

            {!!r.sources?.length && (
              <div className="lg-x-sources">
                <span className="lg-x-sources-label">Sources</span>
                {r.sources.map((src) => (
                  <span key={src.title}>
                    <span className="lg-x-src-title">
                      {src.title}
                      {src.cited && <span className="lg-x-cited">cited</span>}
                    </span>
                    <span className="lg-x-src-site">{src.site}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
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
