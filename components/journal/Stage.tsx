'use client';
// components/journal/Stage.tsx
//
// The stage — two acts of equal length, both driven by scroll (Copy 11).
//   Act I:  a question in Core 4 turns into Logos 3, and the Thinking Map draws.
//   Act II: the question becomes a model the engine solves, live; then Live 3D
//           draws the wing it is about, from one message.
// The right pane is the product's own: two tabs, the Map and the workspace.
//
// This is the part of the issue that is not an argument about the product: it
// IS the product, running. The conversation is set down here; everything in
// the pane is the product's own code. The map is drawn with the design
// system's own cards. The model is the engine's lift example, built through the
// same on-ramp a conversation uses and drawn by the same ModelView, controls
// and all — move them. The wing is what Live 3D's own reader makes of the
// message on the left, drawn by the workspace's own canvas — turn it. Both are
// started only once the stage is near, so the rest of the issue does not wait
// for them (lib/logos3-showcase.ts, components/logos3/LiveExample.tsx).
//
// `data-step` is the whole contract. The driver (drivers.ts driveStage) finds
// every `.st[data-step]` and scrubs it from the scroll position, opens the
// pane as Logos arrives, and crossfades the two layers at the act boundary.
// STEPS and ACT2 here must match STAGE_STEPS and STAGE_ACT2 there; renumber a
// step and the choreography silently reorders — nothing throws. The second
// layer keeps the class the driver and the stylesheet's static, print and
// frozen rules key on (`layer-board`, and the window's `board` state); it
// holds the workspace now.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LogosNode, Message, SynthesisCard, Composer, GuardBar, type NodeType } from './ds';
import { LiveFigure } from '@/components/logos3/LiveExample';
import { STAGE_DESIGN, STAGE_MODEL } from '@/lib/logos3-showcase';

/* Map geometry, in % of the map layer. x/y are the node's ANCHOR EDGE, not
   its centre, so a card can never run off the pane whatever its width. */
interface StageNode {
  s: number;
  t: NodeType;
  l: string;
  x: number;
  y: number;
  ax: 'l' | 'r';
  ay: 't' | 'c' | 'b';
}

const SN: StageNode[] = [
  { s: 3, t: 'question', l: 'How does a plane stay up?', x: 6, y: 48, ax: 'l', ay: 'c' },
  { s: 3, t: 'claim', l: 'The wings push air down', x: 40, y: 8, ax: 'l', ay: 't' },
  { s: 4, t: 'assumption', l: '“faster on top” is the whole story', x: 94, y: 34, ax: 'r', ay: 'c' },
  { s: 5, t: 'tension', l: 'more lift ↔ more speed', x: 48, y: 64, ax: 'l', ay: 'c' },
  { s: 5, t: 'evidence', l: 'it needs a long runway', x: 94, y: 92, ax: 'r', ay: 'b' },
];
const SC: [number, number][] = [
  [16, 48],
  [56, 16],
  [78, 34],
  [62, 64],
  [76, 86],
];
const SE: [number, number, string, number][] = [
  [0, 1, 'person', 3],
  [1, 2, 'question', 4],
  [1, 3, 'question', 5],
  [3, 4, 'evidence', 5],
];

function anchor(n: StageNode): CSSProperties {
  const st: CSSProperties = {};
  if (n.ax === 'r') st.right = `${100 - n.x}%`;
  else st.left = `${n.x}%`;
  if (n.ay === 'b') st.bottom = `${100 - n.y}%`;
  else st.top = `${n.y}%`;
  st.transform = n.ay === 'c' ? 'translateY(-50%)' : 'none';
  return st;
}

function St({
  s,
  cls,
  children,
  as: Tag = 'div',
  ...rest
}: {
  s: number;
  cls?: string;
  children?: ReactNode;
  as?: 'div' | 'span' | 'g' | 'svg';
  [k: string]: unknown;
}) {
  const Component = Tag as 'div';
  return (
    <Component className={`st ${cls || ''}`} data-step={s} {...rest}>
      {children}
    </Component>
  );
}

/** Mounts its children once the stage is within a screen or so — the engine and the 3D canvas start then, not with the page. */
function WhenNear({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '100% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return (
    <div ref={host} className="lm-host">
      {near ? children : fallback}
    </div>
  );
}

const STEPS = 13;
const ACT2 = 7;

export function Stage() {
  return (
    <section className="stage-sec" data-screen-label="The stage" style={{ '--steps': STEPS } as never}>
      <div className="pin">
        <div className="cue">
          <span className="lbl moss">Watch it happen · the Thinking Map, then the model and the wing</span>
          <span className="scr">scroll to advance the conversation ↓</span>
        </div>

        <div className="app" id="stage-app">
          <div className="bar">
            <div className="l">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/socria-mark.png" alt="" />
              <span className="nm">Socria</span>
              <span className="model"><i></i>
                <span className="m-core">Core 4</span>
                <span className="m-logos">Logos 3 · Thinking Map</span>
                <span className="m-board">Logos 3 · Workspace</span>
              </span>
            </div>
            <a className="r open-it" href="/chat">Try this yourself <span className="ar" aria-hidden="true">→</span></a>
          </div>

          <div className="body">
            <div className="pane-chat">
              <div className="thread">
                {/* Act I — the map */}
                <St s={0} cls="from-user"><Message role="user" text="My daughter asked how a plane stays up, and I couldn't explain it. Can you just give me the answer?" /></St>
                <St s={1}><Message role="assistant" text="You'll explain it better once it's yours. *What do you think holds it up?*" /></St>
                <St s={2} cls="from-user"><Message role="user" text="The wings push air down? Or the air goes faster over the top?" /></St>
                <St s={3}><Message role="assistant" text="*Both are part of it.* What would make either one push harder?" /></St>
                <St s={4} cls="from-user"><Message role="user" text="…going faster. Or a bigger wing. I'd never thought about speed at all." /></St>
                <St s={5}><SynthesisCard title="What you have so far" markSrc="/socria-logo.png" sections={[
                  { label:"Tensions", items:["more lift ↔ more speed — and so a longer runway"] },
                  { label:"Assumptions", items:["“faster on top” explains it on its own"] }
                ]} /></St>
                <St s={6}><Message role="assistant" text="Speed and wing size are your two dials. *Let's see how much each one turns.*" /></St>

                {/* Act II — the model, then the wing */}
                <St s={7} cls="from-user"><Message role="user" text={STAGE_MODEL.said} /></St>
                <St s={8}><Message role="assistant" text="It's built, and live — move it. *How fast must it go before the lift matches its weight?*" /></St>
                <St s={9} cls="guard"><GuardBar text="While you're learning, the answer stays yours to reach." hintLabel="A hint" revealLabel="Show me anyway" hintsLeft={2} /></St>
                <St s={10} cls="from-user"><Message role="user" text="A 1,000 kg plane weighs about 9.8 kN… the curve reaches that near 45 m/s. That's the runway." /></St>
                <St s={11} cls="from-user"><Message role="user" text={STAGE_DESIGN.said} /></St>
              </div>
              <div className="foot">
                <Composer placeholder="Say what you are actually trying to work out…" note="Nothing here is sent anywhere. Your reasoning is yours." showAttach={false} />
              </div>
            </div>

            <div className="pane-map" aria-label="The Logos pane: a Thinking Map, then the model and the wing">
              <div className="ptabs" role="tablist">
                <button role="tab" data-v="map">Thinking Map</button>
                <button role="tab" data-v="board">Model · Live 3D</button>
                <span className="pn">built from your words</span>
              </div>

              <div className="layer layer-map" aria-label="The Thinking Map, drawn from the conversation">
                <svg className="edges" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {SE.map(([a,b,rel,s],i) => (
                    <path key={i} className={"st e-" + rel} data-step={s} vectorEffect="non-scaling-stroke" pathLength="1"
                          d={`M${SC[a][0]},${SC[a][1]} L${SC[b][0]},${SC[b][1]}`} />
                  ))}
                </svg>
                {SN.map((n,i) => (
                  <div key={i} className={"mapnode st n-" + n.t} data-step={n.s} style={anchor(n)}>
                    <LogosNode type={n.t} label={n.l} state={n.t === "tension" ? "focused" : "default"} />
                  </div>
                ))}
              </div>

              <div className="layer layer-board" aria-label="The workspace: the model the engine built, and the wing Live 3D drew">
                <div className="lm-ws">
                  <div className="lm-tile lm-model lg-tokens">
                    <WhenNear fallback={<span className="lm-wait">Building the model…</span>}>
                      <LiveFigure item={STAGE_MODEL} />
                    </WhenNear>
                  </div>
                  <div className="lm-tile lm-3d lg-tokens">
                    <span className="lm-h">Live 3D</span>
                    <St s={11} cls="lm-fig">
                      <WhenNear fallback={<span className="lm-wait">Starting the 3D view…</span>}>
                        <LiveFigure item={STAGE_DESIGN} />
                      </WhenNear>
                    </St>
                    <span className="lm-empty">Describe a part in the chat and it is drawn here.</span>
                  </div>
                  <St s={12} cls="pnote">the model never said 45 — the curve showed you where 9.8 kN was</St>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="acts" aria-hidden="true">
          <div className="act"><span className="an">I · The Thinking Map</span>
            <span className="ticks">{Array.from({length:ACT2}).map((_,i) => <i key={i} data-step={i}><b></b></i>)}</span></div>
          <div className="act"><span className="an">II · The model, then the wing</span>
            <span className="ticks">{Array.from({length:STEPS-ACT2}).map((_,i) => <i key={i} data-step={i+ACT2}><b></b></i>)}</span></div>
        </div>
      </div>
    </section>
  );
}
