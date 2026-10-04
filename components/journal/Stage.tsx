'use client';
// components/journal/Stage.tsx
//
// The stage — two acts of equal length, both driven by scroll (Copy 11).
//   Act I:  an essay in Core 4 turns into Logos 2, and the Thinking Map draws.
//   Act II: some algebra goes onto the Board — the working, and where the
//           mistake is, without naming it.
// The right pane is the product's own: two tabs, Map and Board.
//
// This is the part of the issue that is not an argument about the product: it
// IS the product, running. Nothing here is a screenshot.
//
// `data-step` is the whole contract. The driver (drivers.ts driveStage) finds
// every `.st[data-step]` and scrubs it from the scroll position, opens the
// pane as Logos arrives, and crossfades the two layers at the act boundary.
// STEPS and ACT2 here must match STAGE_STEPS and STAGE_ACT2 there; renumber a
// step and the choreography silently reorders — nothing throws.

import type { CSSProperties, ReactNode } from 'react';
import { LogosNode, Message, SynthesisCard, Composer, GuardBar, type NodeType } from './ds';

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
  { s: 3, t: 'question', l: 'Can I finish this essay?', x: 6, y: 48, ax: 'l', ay: 'c' },
  { s: 3, t: 'claim', l: 'Remote work is better', x: 40, y: 8, ax: 'l', ay: 't' },
  { s: 4, t: 'assumption', l: '“most” = people like me', x: 94, y: 34, ax: 'r', ay: 'c' },
  { s: 5, t: 'tension', l: 'freedom ↔ boundaries', x: 48, y: 64, ax: 'l', ay: 'c' },
  { s: 5, t: 'evidence', l: 'people who need the office', x: 94, y: 92, ax: 'r', ay: 'b' },
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

const STEPS = 13;
const ACT2 = 7;

export function Stage() {
  return (
    <section className="stage-sec" data-screen-label="The stage" style={{ '--steps': STEPS } as never}>
      <div className="pin">
        <div className="cue">
          <span className="lbl moss">Watch it happen · the Thinking Map, then the Board</span>
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
                <span className="m-logos">Logos 2 · Thinking Map</span>
                <span className="m-board">Logos 2 · The Board</span>
              </span>
            </div>
            <a className="r open-it" href="/chat">Try this yourself <span className="ar" aria-hidden="true">→</span></a>
          </div>

          <div className="body">
            <div className="pane-chat">
              <div className="thread">
                {/* Act I — the map */}
                <St s={0} cls="from-user"><Message role="user" text="I can't finish this essay. Can you just write the conclusion for me?" /></St>
                <St s={1}><Message role="assistant" text="Not yet. What is the essay actually *arguing*? Say it in one sentence." /></St>
                <St s={2} cls="from-user"><Message role="user" text="That remote work is better for most people." /></St>
                <St s={3}><Message role="assistant" text="*Most people* is the load-bearing word. Who is it not true for?" /></St>
                <St s={4} cls="from-user"><Message role="user" text="…people who need the office to switch off. I hadn't thought about them at all." /></St>
                <St s={5}><SynthesisCard title="What you have so far" markSrc="/socria-logo.png" sections={[
                  { label:"Tensions", items:["freedom ↔ boundaries — unresolved, and now on the map"] },
                  { label:"Assumptions", items:["“most people” meant people like you"] }
                ]} /></St>
                <St s={6}><Message role="assistant" text="The conclusion you couldn't write is the tension you hadn't named. *Write that.*" /></St>

                {/* Act II — the Board */}
                <St s={7} cls="from-user"><Message role="user" text="Different question. Check my working? 3(x + 4) = 27, so 3x + 12 = 27, so 3x = 39, so x = 13." /></St>
                <St s={8}><Message role="assistant" text="It's on the Board, and plotted. *Where does your line actually cross 27?*" /></St>
                <St s={9} cls="guard"><GuardBar text="While you're learning, the answer stays yours to reach." hintLabel="A hint" revealLabel="Show me anyway" hintsLeft={2} /></St>
                <St s={10} cls="from-user"><Message role="user" text="…at 5, not 13. Oh — step three. 27 − 12 is 15, not 39." /></St>
                <St s={11}><Message role="assistant" text="*You found it before I said a word.* Which is the only version of that sentence worth having." /></St>

              </div>
              <div className="foot">
                <Composer placeholder="Say what you are actually trying to work out…" note="Nothing here is sent anywhere. Your reasoning is yours." showAttach={false} />
              </div>
            </div>

            <div className="pane-map" aria-label="The Logos pane: a Thinking Map, and the Board">
              <div className="ptabs" role="tablist">
                <button role="tab" data-v="map">Thinking Map</button>
                <button role="tab" data-v="board">The Board</button>
                <span className="pn">your words, verbatim</span>
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

              <div className="layer layer-board" aria-label="The Board: your working, and a plot of it">
                <div className="bdin">
                <div className="work">
                  <St s={7} as="span" cls="row"><span className="no">1</span>3(x + 4) = 27</St>
                  <St s={7} as="span" cls="row"><span className="no">2</span>3x + 12 = 27</St>
                  <St s={7} as="span" cls="row"><span className="no">3</span>
                    <span className="wrong">3x = 39
                      <St s={9} as="svg" cls="ring" viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M8,20 C6,8 30,3 52,4 C79,5 96,10 95,21 C94,33 69,38 45,37 C23,36 7,31 9,22"/></St>
                      <St s={11} as="svg" cls="strike" viewBox="0 0 100 12" preserveAspectRatio="none"><path d="M2,7 C24,3 48,10 68,5 C82,2 94,7 98,5"/></St>
                    </span>
                    <St s={11} as="span" cls="fix">3x = 15</St>
                    <St s={9} as="span" cls="hand">← look again</St>
                  </St>
                  <St s={7} as="span" cls="row"><span className="no">4</span>
                    <span className="wrong">x = 13
                      <St s={11} as="svg" cls="strike" viewBox="0 0 100 12" preserveAspectRatio="none"><path d="M2,6 C24,9 48,3 68,7 C82,9 94,4 98,6"/></St>
                    </span>
                    <St s={11} as="span" cls="fix">x = 5</St>
                  </St>
                </div>

                <div className="plotbox">
                  <svg viewBox="0 0 400 240" role="img"
                       aria-label="The line y = 3(x + 4) crosses y = 27 at x = 5. At x = 13 the line is at 51, well above 27.">
                    {[2,4,6,8,10,12,14].map(v => <line key={v} className="gl" x1={40 + v*21.6} y1="14" x2={40 + v*21.6} y2="220" />)}
                    <line className="ax" x1="40" y1="220" x2="388" y2="220"/><line className="ax" x1="40" y1="12" x2="40" y2="220"/>
                    <text className="pl faint" x="388" y="236" textAnchor="end">x</text>
                    <text className="pl faint" x="30" y="20" textAnchor="end">y</text>
                    {[5,13].map(v => <text key={v} className="tk" x={40 + v*21.6} y="234" textAnchor="middle">{v}</text>)}
                    <St s={8} as="g">
                      <path className="lvl" d="M40,127.3 L388,127.3"/>
                      <text className="pl question" x="46" y="120">y = 27</text>
                      <path className="fn" d="M40,178.8 L385.6,14"/>
                      <text className="pl person" x="250" y="72" textAnchor="end">y = 3(x + 4)</text>
                      <circle className="pt q" cx="320.8" cy="127.3" r="6"/>
                      <text className="pl question" x="320.8" y="150" textAnchor="middle">your x = 13</text>
                    </St>
                    <St s={9} as="g">
                      <path className="gap" d="M320.8,127.3 L320.8,45"/>
                      <circle className="pt hollow" cx="320.8" cy="45" r="5"/>
                      <text className="pl hint" x="312" y="38" textAnchor="end">the line is up here</text>
                    </St>
                    <St s={11} as="g">
                      <path className="drop" d="M148,127.3 L148,220"/>
                      <circle className="pt p fly" cx="148" cy="127.3" r="6.5"/>
                      <text className="pl person" x="148" y="150" textAnchor="middle">x = 5</text>
                    </St>
                  </svg>
                  <St s={12} cls="pnote">the plot never said 5 — it showed you where 13 wasn't</St>
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="acts" aria-hidden="true">
          <div className="act"><span className="an">I · The Thinking Map</span>
            <span className="ticks">{Array.from({length:ACT2}).map((_,i) => <i key={i} data-step={i}><b></b></i>)}</span></div>
          <div className="act"><span className="an">II · The Board</span>
            <span className="ticks">{Array.from({length:STEPS-ACT2}).map((_,i) => <i key={i} data-step={i+ACT2}><b></b></i>)}</span></div>
        </div>
      </div>
    </section>
  );
}
