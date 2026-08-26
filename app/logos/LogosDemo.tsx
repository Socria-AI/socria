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

import { useEffect, useMemo, useRef, useState } from 'react';
import { ThinkingMap } from '@/components/ThinkingMap';
import { MathBoard } from '@/components/MathBoard';
import { LogosMark } from '@/components/LogosMark';
import { NodeGlyph } from '@/components/NodeGlyph';
import { PersonalityDial } from '@/components/PersonalityDial';
import { THINKING_DEPTHS } from '@/lib/socria-prompt';
import { DEFAULT_PERSONALITY, PERSONALITY_DIMENSIONS } from '@/lib/logos-personality';
import {
  DEMO_BOARD_STEPS,
  DEMO_DEPTH_ANSWERS,
  DEMO_MAP,
  DEMO_MATH_MAP,
  DEMO_MOVE_RESULTS,
  DEMO_TURNS,
} from './demo-data';

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
                {m.role === 'assistant' && <span className="lg-msg-who">Socria Logos</span>}
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

/**
 * The Board, filling in a step at a time.
 *
 * A still of a finished board shows the notation but not the argument for it,
 * which is the ORDER: the mistake goes down, stays down, and the correction
 * arrives beside it. So this draws itself. The board is the real component —
 * it is handed a map that grows — and the reveal is the map, not a video.
 *
 * It waits until it is on screen before starting, or the whole thing would be
 * over several sections above where anyone is reading.
 */
export function DemoBoard() {
  const [step, setStep] = useState(0);
  const [armed, setArmed] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const total = DEMO_BOARD_STEPS.length;

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setArmed(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArmed(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!armed || step >= total) return;
    // Anyone who has asked for less motion gets the finished board at once,
    // which is the honest still — nothing about it is only in the animation.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setStep(total);
      return;
    }
    const t = setTimeout(() => setStep((v) => v + 1), step === 0 ? 420 : 1150);
    return () => clearTimeout(t);
  }, [armed, step, total]);

  // The board takes a map, so the reveal is a map with fewer nodes in it.
  // Edges appear only once both of their ends have been written down.
  const shown = useMemo(() => {
    const ids = new Set(DEMO_BOARD_STEPS.slice(0, step).map((s) => s.id));
    return {
      ...DEMO_MATH_MAP,
      nodes: DEMO_MATH_MAP.nodes.filter((n) => ids.has(n.id)),
      edges: DEMO_MATH_MAP.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    };
  }, [step]);

  const done = step >= total;

  return (
    <div ref={hostRef}>
      <Frame label="The Board — watch the working go down, mistake and all" height={476}>
        <div className="ui-boarddemo">
          <div className="lg-panel ui-boardpane">
            <div className="lg-map-wrap">
              <div className="lg-map">
                <MathBoard map={shown} width={880} height={406} />
              </div>
            </div>
          </div>
          <div className="ui-boardbar">
            <span className="ui-boardsay" aria-live="polite">
              {step === 0 ? 'a clear board' : DEMO_BOARD_STEPS[step - 1].say}
            </span>
            <span className="ui-boardpips" aria-hidden="true">
              {DEMO_BOARD_STEPS.map((s, i) => (
                <span key={s.id} className={`ui-pip${i < step ? ' is-on' : ''}`} />
              ))}
            </span>
            <button
              type="button"
              className="ui-boardreplay"
              onClick={() => setStep(0)}
              disabled={!done}
            >
              Replay
            </button>
          </div>
        </div>
      </Frame>
    </div>
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
          <span className="lg-msg-who">Socria Logos</span>
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

/**
 * Depth — the control, and the same sentence answered at each setting.
 *
 * The menu alone only proves the setting exists. What people want to know is
 * what it buys, and the answer is not "more words": the four replies here sit
 * at four different altitudes over one question, and every one of them still
 * ends by handing the thinking back.
 */
export function DemoControls() {
  const [depth, setDepth] = useState('balanced');
  const answer = DEMO_DEPTH_ANSWERS[depth];
  return (
    <Frame label="Pick a depth — this is the same question, answered there" height={560}>
      <div className="ui-ctrldemo">
        <div className="ui-ctrlpane">
          <div className="lg-composer">
            <div className="lg-composer-box">
              <div className="lg-composer-row">
                <span className="ui-placeholder">What are you thinking through?</span>
              </div>
            </div>
          </div>
          <div className="lg-tools ui-ctrltools">
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
          <div className="lg-depth-menu ui-depthmenu" role="listbox">
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

        <div className="ui-answerpane">
          <div className="lg-thread ui-depththread">
            <div className="lg-msg lg-msg-user">
              <div className="lg-msg-stack">
                <div className="lg-msg-body">{DEMO_TURNS[0].content}</div>
              </div>
            </div>
            <div className="lg-msg lg-msg-assistant" key={depth}>
              <span className="lg-msg-who">Socria Logos</span>
              <div className="lg-msg-stack">
                <div className="lg-msg-body">
                  {answer.body.split('\n\n').map((para, i) => (
                    <p key={i} className="ui-para">
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="ui-depthnote">{answer.note}</p>
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
    <Frame label="The nine dials, as the app presents them — turn one" height={430}>
      <div className="ui-personademo">
        <h3 className="lg-style-title">Socria Personality</h3>
        <p className="lg-style-sub">
          How Socria communicates while it thinks with you. Depth stays separate.
        </p>
        <div className="lg-persona-grid">
          {PERSONALITY_DIMENSIONS.map((d) => (
            <PersonalityDial
              key={d.id}
              dimension={d}
              value={p[d.id] ?? d.options[0].id}
              onChange={(next) => setP((prev) => ({ ...prev, [d.id]: next }))}
            />
          ))}
        </div>
      </div>
    </Frame>
  );
}
