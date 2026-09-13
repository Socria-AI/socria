'use client';
// components/journal/Stage.tsx
//
// The stage — Core 3.1, then the turn into Logos, then the Board. Fourteen
// steps, driven by scroll position (the driver lives in drivers.ts and finds
// everything through `.st[data-step]`).
//
// This is the part of the issue that is not an argument about the product: it
// IS the product, running. A visitor watches one conversation refuse to write
// a conclusion, then watches the same refusal happen on a plot. Nothing here
// is a screenshot.
//
// `data-step` is the whole contract. The driver toggles `.on` on every element
// whose step has been reached, and toggles `.logos` / `.plot` on the app frame
// at steps 4 and 9. Renumber a step here and the choreography silently
// reorders — nothing throws.

import type { ReactNode } from 'react';
import { LogosNode, Message, InsightCard, SynthesisCard, Composer, GuardBar, type NodeType } from './ds';

/* Map geometry, in % of the pane.
 *
 * x/y are the node's ANCHOR EDGE, not its centre: a node with ax:'l' keeps its
 * left edge at x%, so a card can never run off the pane whatever its width. */
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
  { s: 4, t: 'question', l: 'Can I finish this essay?', x: 6, y: 50, ax: 'l', ay: 'c' },
  { s: 4, t: 'claim', l: 'Remote work is better', x: 40, y: 8, ax: 'l', ay: 't' },
  { s: 5, t: 'assumption', l: '“most” = people like me', x: 94, y: 36, ax: 'r', ay: 'c' },
  { s: 6, t: 'tension', l: 'freedom ↔ boundaries', x: 50, y: 66, ax: 'l', ay: 'c' },
  { s: 6, t: 'evidence', l: 'people who need the office', x: 94, y: 94, ax: 'r', ay: 'b' },
];

/* Edge endpoints: roughly where each card's centre lands. */
const SC: [number, number][] = [
  [16, 50],
  [56, 17],
  [78, 36],
  [64, 66],
  [76, 88],
];
const SE: [number, number, string, number][] = [
  [0, 1, 'person', 4],
  [1, 2, 'question', 5],
  [1, 3, 'question', 6],
  [3, 4, 'evidence', 6],
];

function anchor(n: StageNode): React.CSSProperties {
  const st: React.CSSProperties = {};
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
  as?: 'div' | 'g';
  [k: string]: unknown;
}) {
  const Component = Tag as 'div';
  return (
    <Component className={`st ${cls || ''}`} data-step={s} {...rest}>
      {children}
    </Component>
  );
}

export function Stage() {
  const steps = 14;
  return (
    <section
      className="stage-sec"
      data-screen-label="The stage"
      style={{ '--steps': steps } as never}
    >
      <div className="pin">
        <div className="cue">
          <span className="lbl moss">Watch it happen · Core 3.1, then Logos, then the Board</span>
          <span className="scr">scroll to advance the conversation ↓</span>
        </div>

        <div className="app" id="stage-app">
          <div className="bar">
            <div className="l">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/socria-mark.png" alt="" />
              <span className="nm">Socria</span>
              <span className="model">
                <i />
                <span className="m-core">Core 3.1</span>
                <span className="m-logos">Logos · Thinking Map</span>
              </span>
            </div>
            <span className="r">an essay, and then a plot</span>
          </div>

          <div className="body">
            <div className="pane-chat">
              <div className="thread">
                <St s={0} cls="from-user">
                  <Message role="user" text="I can't finish this essay. Can you just write the conclusion for me?" />
                </St>
                <St s={1}>
                  <Message role="assistant" text="Not yet. What is the essay actually *arguing*? Say it in one sentence." />
                </St>
                <St s={2} cls="from-user">
                  <Message role="user" text="That remote work is better for most people." />
                </St>
                <St s={3}>
                  <Message role="assistant" text="*Most people* is the load-bearing word. Who is it not true for?" />
                </St>
                <St s={4}>
                  <InsightCard
                    label="Noticed"
                    eyebrow="An assumption"
                    text="“Most people” — you have not yet said who it leaves out. Logos has drawn it with a dashed ring."
                  />
                </St>
                <St s={6} cls="from-user">
                  <Message role="user" text="…people who need the office to switch off. I hadn't thought about them at all." />
                </St>
                <St s={7}>
                  <SynthesisCard
                    title="What you have so far"
                    markSrc="/socria-logo.png"
                    sections={[
                      {
                        label: 'Themes',
                        items: ['Autonomy over where the work happens', 'The cost of never leaving it'],
                      },
                      {
                        label: 'Tensions',
                        items: ['freedom ↔ boundaries — unresolved, and now on the map'],
                      },
                      { label: 'Assumptions', items: ['“most people” meant people like you'] },
                    ]}
                  />
                </St>
                <St s={7}>
                  <Message role="assistant" text="The conclusion you couldn't write is the tension you hadn't named. *Write that.*" />
                </St>
                <St s={9} cls="from-user">
                  <Message role="user" text="Different question. Check my working: 3(x + 4) = 27, so 3x + 12 = 27, so 3x = 39, so x = 13. Plot it?" />
                </St>
                <St s={11}>
                  <Message role="assistant" text="Step three — *what is 27 − 12?*" />
                </St>
                <St s={12} cls="from-user">
                  <Message role="user" text="15. So 3x = 15 and x = 5." />
                </St>
                <St s={8} cls="guard">
                  <GuardBar
                    text="While you're learning, the answer stays yours to reach."
                    hintLabel="A hint"
                    revealLabel="Show me anyway"
                    hintsLeft={2}
                  />
                </St>
                <St s={13}>
                  <Message role="assistant" text="It is. And you got there — which is the *only version of that sentence worth having.*" />
                </St>
              </div>
              <div className="foot">
                <Composer
                  placeholder="Say what you are actually trying to work out…"
                  note="Nothing here is sent anywhere. Your reasoning is yours."
                  showAttach={false}
                />
              </div>
            </div>

            <div className="pane-map" aria-label="The Thinking Map, drawn from the conversation">
              <span className="ph">Thinking Map · your words, verbatim</span>
              <svg className="edges" viewBox="0 0 100 100" preserveAspectRatio="none">
                {SE.map(([a, b, rel, s], i) => (
                  <path
                    key={i}
                    className={`st e-${rel}`}
                    data-step={s}
                    vectorEffect="non-scaling-stroke"
                    d={`M${SC[a][0]},${SC[a][1]} L${SC[b][0]},${SC[b][1]}`}
                  />
                ))}
              </svg>
              {SN.map((n, i) => (
                <div key={i} className={`mapnode st n-${n.t}`} data-step={n.s} style={anchor(n)}>
                  <LogosNode type={n.t} label={n.l} state={n.t === 'tension' ? 'focused' : 'default'} />
                </div>
              ))}
              <div
                className="plot"
                aria-label="Logos plots the working: the line y = 3(x + 4) and the line y = 27 meet at x = 5, not at x = 13"
              >
                <span className="bt">Logos · the plot of your working</span>
                <svg viewBox="0 0 400 300">
                  <line className="ax" x1="40" y1="270" x2="386" y2="270" />
                  <line className="ax" x1="40" y1="14" x2="40" y2="270" />
                  <text className="pl faint" x="386" y="290" textAnchor="end">
                    x
                  </text>
                  <text className="pl faint" x="26" y="20" textAnchor="end">
                    y
                  </text>
                  <St s={9} as="g">
                    <path className="fn" d="M40,220 L380,20" />
                    <text className="pl person" x="300" y="46" textAnchor="end">
                      y = 3(x + 4)
                    </text>
                    <path className="lvl" d="M40,157.5 L386,157.5" />
                    <text className="pl question" x="46" y="150">
                      y = 27
                    </text>
                    <circle className="pt q" cx="316" cy="157.5" r="6" />
                    <text className="pl question" x="316" y="182" textAnchor="middle">
                      x = 13 ?
                    </text>
                  </St>
                  <St s={10} as="g">
                    <path className="gap" d="M316,157.5 L316,57.5" />
                    <circle className="pt hollow" cx="316" cy="57.5" r="5" />
                    <text className="pl faint" x="326" y="62">
                      where the line actually is
                    </text>
                  </St>
                  <St s={12} as="g">
                    <circle className="pt p" cx="146" cy="157.5" r="6" />
                    <text className="pl person" x="146" y="182" textAnchor="middle">
                      x = 5
                    </text>
                    <path className="drop" d="M146,157.5 L146,270" />
                  </St>
                </svg>
                <St s={11} cls="note">
                  the plot never said 5 — it showed where 13 wasn&rsquo;t
                </St>
              </div>
            </div>
          </div>
        </div>

        <div className="ticks" aria-hidden="true">
          {Array.from({ length: steps }).map((_, i) => (
            <i key={i} data-step={i}>
              <b />
            </i>
          ))}
        </div>
      </div>
    </section>
  );
}
