'use client';
// app/logos/LogosIssue.tsx — Issue No. 1 · Logos.
//
// The Logos page in the journal's editorial register, ported from
// `Socria Logos.html`. It is built out of the same parts the homepage
// already uses — Grain, Progress, Count, Mast, Turn, Reading, Silence,
// DepthFig — so this is a new arrangement of furniture that was already
// here rather than a second design system.
//
// WHAT IT REPLACES. The previous /logos (LogosStory) stays in the tree and
// keeps working: docs/DocsDemo and docs/content/overview both mount
// LogosDemo, so nothing that page carried is lost by this becoming the
// address people land on.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Count,
  DepthFig,
  Grain,
  Mast,
  PrintLink,
  Progress,
  Reading,
  Silence,
  Turn,
} from '@/components/journal/parts';
import { LogosNode, Transcript, type NodeType } from '@/components/journal/ds';
import { LogosMark } from '@/components/LogosMark';
import { initJournal } from '@/components/journal/drivers';
import { Colophon } from '@/components/Colophon';

/* The map that answers the cursor. Six nodes from one question, and not one
   of them is a conclusion. */
const N: { t: NodeType; l: string; x: number; y: number }[] = [
  { t: 'question', l: 'Should I take the job?', x: 14, y: 50 },
  { t: 'claim', l: 'It pays more', x: 44, y: 18 },
  { t: 'claim', l: "I've stopped growing", x: 42, y: 82 },
  { t: 'assumption', l: 'money = progress', x: 74, y: 26 },
  { t: 'evidence', l: 'two people who left', x: 72, y: 82 },
  { t: 'tension', l: 'security ↔ growth', x: 56, y: 50 },
];
const E: [number, number, string, number][] = [
  [0, 1, 'person', 1],
  [0, 2, 'person', 2],
  [1, 3, 'question', 3],
  [2, 4, 'evidence', 4],
  [1, 5, 'question', 5],
  [2, 5, 'question', 5],
];

function SelfMap() {
  // Point at a node and what it rests on lights, what it pulls against
  // pulses, and everything else steps back.
  const [focus, setFocus] = useState(-1);
  const near = (i: number) =>
    focus < 0 ? false : E.some(([a, b]) => (a === focus && b === i) || (b === focus && a === i));
  const stateOf = (n: (typeof N)[number], i: number) =>
    focus < 0
      ? n.t === 'tension'
        ? 'focused'
        : 'default'
      : i === focus
        ? 'focused'
        : near(i)
          ? 'lit'
          : 'dim';

  return (
    <div
      className={'mapbox' + (focus >= 0 ? ' has-focus' : '')}
      role="img"
      aria-label="A Thinking Map drawn live from one question."
      onPointerLeave={() => setFocus(-1)}
    >
      <svg className="edges" viewBox="0 0 100 100" preserveAspectRatio="none">
        {E.map(([a, b, rel, after], i) => (
          <path
            key={i}
            className={'e-' + rel + (a === focus || b === focus ? ' lit' : '')}
            data-after={after}
            vectorEffect="non-scaling-stroke"
            d={`M${N[a].x},${N[a].y} L${N[b].x},${N[b].y}`}
          />
        ))}
      </svg>
      {N.map((n, i) => (
        <div
          className={'mapnode n-' + n.t + (i === focus ? ' is-focus' : near(i) ? ' is-near' : '')}
          key={i}
          style={{ left: n.x + '%', top: n.y + '%' }}
          onPointerEnter={() => setFocus(i)}
        >
          <LogosNode type={n.t} label={n.l} state={stateOf(n, i)} />
        </div>
      ))}
      <span className="map-hint" aria-hidden="true">
        {focus < 0
          ? 'point at a node'
          : N[focus].t === 'tension'
            ? 'the tension — what it pulls between'
            : 'what it rests on, and what it pulls against'}
      </span>
    </div>
  );
}

const MOVES: [string, string, string, string][] = [
  ['i', 'Explore', 'Open the thought further — what is inside it you have not said yet?', 'M8,38 L22,18 M22,18 L38,30 M22,18 L22,6'],
  ['ii', 'Challenge', 'It argues the other side, properly — the strongest version of it.', 'M6,23 H18 M14,17 L20,23 L14,29 M40,23 H28 M32,17 L26,23 L32,29'],
  ['iii', 'Research', 'Send the node into the world and bring real sources back to it.', 'M20,20 m-11,0 a11,11 0 1,0 22,0 a11,11 0 1,0 -22,0 M28,28 L40,40'],
  ['iv', 'Trace', 'Walk backward — what does this rest on, and does the chain hold?', 'M8,36 C16,30 14,20 22,16 C30,12 34,14 40,8 M40,8 L32,9 M40,8 L39,16'],
];

export function LogosIssue() {
  useEffect(() => {
    return initJournal();
  }, []);

  return (
    <div className="jr-root lg-issue">
      <Grain />
      <Progress />
      <Count />
      <Mast current="logos" cta={{ href: '/onboarding', t: 'Open Logos' }} />

      <section className="cover" data-screen-label="Cover">
        <div className="wrap">
          <p className="lbl moss">Issue No. 1 · Logos · MMXXVI</p>
          <div className="rv" style={{ margin: 'clamp(20px,4vh,38px) 0 0' }}>
            <LogosMark size={92} />
          </div>
          <h1 data-split="">
            Watch yourself <span className="em">think.</span>
          </h1>
          <p className="st rv d2">
            Conversation on one side. A map of your own reasoning on the other, drawing itself as
            you speak.
          </p>
          <div className="begin">
            <span className="lbl">Begin</span>
            <span className="ln" />
          </div>
        </div>
      </section>

      <Turn
        i="i"
        who="Logos asks"
        socria
        answer="It goes into sentences, and sentences disappear the moment the next one arrives. Nothing you said an hour ago is holding still."
      >
        Where does your thinking actually go?
      </Turn>

      <Turn
        i="ii"
        who="You might say"
        answer="Which is exactly the problem. A conversation is a queue, and a queue is the wrong shape for an argument."
      >
        Into the conversation.
      </Turn>

      <Turn
        i="iii"
        who="Logos asks"
        socria
        answer="Every message you send is read twice — once to answer you, once to map you. The second reading is the one you can see."
      >
        Then why can&rsquo;t you see it?
      </Turn>

      <Reading
        n="I"
        name="The map"
        id="map"
        title={
          <>
            Your reasoning, drawn in your <span className="em">own words.</span>
          </>
        }
        deck="Claims, assumptions, evidence and tensions — placed where you can look at them, and reorganised as you think."
      >
        <div className="cols">
          <p className="drop">
            <span className="kick">Logos</span>Say one sentence and it is quietly parsed for the
            claims it makes, the assumptions underneath them, and the tensions it leaves unresolved.
            Those become nodes. The nodes become a shape — the shape you could never hold in your
            head at once.
          </p>
          <p>
            Nothing on the map is Logos&rsquo;s opinion. Every node carries your phrasing, verbatim,
            which is why an assumption written back to you in your own words is so much harder to
            wave away than a correction would be.
          </p>
          <p className="breakout">
            The tension is the most useful node on any map, and the one you would never have drawn
            yourself.
          </p>
          <p>
            Four lenses read the same map differently: the Graph for its whole shape, Structure for
            the argument, Tensions for the friction, Evidence for what is actually standing on
            something.
          </p>
        </div>
        <SelfMap />
        <div className="lg-moves">
          {MOVES.map(([rn, h, p, d]) => (
            <div className="lg-move" key={rn}>
              <span className="rn">{rn}.</span>
              <h3>{h}</h3>
              <p>{p}</p>
              <svg viewBox="0 0 46 46" aria-hidden="true">
                <path d={d} />
              </svg>
            </div>
          ))}
        </div>
      </Reading>

      <Silence>Six nodes. Not one of them is a conclusion.</Silence>

      <Turn
        i="iv"
        who="Logos asks"
        socria
        answer="A dashed ring means unexamined. A solid one means checkable. From the inside those two feel identical, which is the entire reason the map exists."
      >
        Which of these did you assume?
      </Turn>

      <Turn
        i="v"
        who="You might say"
        answer="It will — but it will not replace your solution with a clean one. It walks your steps and points at the exact place the reasoning broke."
      >
        Just check my working.
      </Turn>

      <Turn
        i="vi"
        who="Logos asks"
        socria
        answer="Usually you know. The Board keeps the mistake on the page, struck through with the fix beside it, because an erased error teaches nothing."
      >
        Which step do you think broke?
      </Turn>

      <Reading
        n="II"
        name="The board"
        id="board"
        title={
          <>
            A chalkboard, not a <span className="em">chatbox.</span>
          </>
        }
        deck="Scratch space for mathematics: serif notation, handwritten working, and mistakes kept where you can learn from them."
      >
        <div className="cols">
          <p className="drop">
            <span className="kick">The board</span>Notation renders as you write it. Ask Logos to
            check the work and it does not hand back a tidy solution — it finds the first wrong step
            and names it, which is the only feedback that transfers.
          </p>
          <p>
            Errors are struck through, not deleted, with the correction beside them. The record of a
            mind at work is more useful than a clean page, and considerably more honest.
          </p>
          <p className="breakout">While you&rsquo;re learning, the answer stays yours to reach.</p>
          <p>
            The Answer Guard holds here too. Ask to skip the step you are standing on and it will
            put you back on it, with a question easier to answer than the one you asked.
          </p>
        </div>
        <div className="board">
          <span className="bt">The Board · working</span>
          <div className="eq">
            <span className="row">x² − 5x + 6 = 0</span>
            <span className="row">(x − 2)(x − 3) = 0</span>
            <span className="row">
              x ={' '}
              <span className="strike">
                −2, −3
                <svg viewBox="0 0 100 12" preserveAspectRatio="none">
                  <path d="M2,7 C24,3 48,10 68,5 C82,2 94,7 98,5" />
                </svg>
              </span>
              <span className="fix">x = 2, 3</span>
            </span>
          </div>
          <p className="note">sign slip — the roots flip when you solve each factor</p>
        </div>
        <div className="fig" style={{ marginTop: 'clamp(24px,4vh,40px)' }}>
          <Transcript
            lines={[
              { who: 'you', text: 'Just tell me x.' },
              {
                who: 'socria',
                text: "Not yet. You're one step away — what does dividing both sides by three do here?",
              },
            ]}
          />
        </div>
      </Reading>

      <Turn
        i="vii"
        who="Logos asks"
        socria
        aside="pick the one the question deserves"
        answer="Quick, Balanced, Deep, Abstract. You set how far the thinking goes. Never how fast the answer arrives."
      >
        How deep, this time?
      </Turn>

      <Reading
        n="III"
        name="The depths"
        id="depths"
        title={
          <>
            How far the thinking goes, and <span className="em">nothing else.</span>
          </>
        }
        deck="Four registers, drawn outward from the question you brought. The dial sets depth; it has never set speed."
      >
        <div className="cols">
          <p className="drop">
            <span className="kick">The dial</span>Quick is plain and conversational, for when you
            only need to think out loud. Balanced is the everyday register. Deep is slow and
            rigorous, and Abstract goes to principles and first causes — which is a place worth
            reaching, and a terrible default.
          </p>
          <p>
            Elevated language appears only when it is <em>more precise</em> than the plain word,
            never to sound clever.{' '}
            <span className="jargon">Directionally correct. We can iterate post-launch.</span> The
            vocabulary follows the depth you asked for, and the depth follows the question.
          </p>
        </div>
        <DepthFig />
      </Reading>

      <section className="close" id="open" data-screen-label="Close">
        <div className="glow" aria-hidden="true" />
        <div className="wrap">
          <div className="rv" style={{ marginBottom: '26px' }}>
            <LogosMark size={76} />
          </div>
          <h2 data-split="">
            Think For <span className="em">Yourself.</span>
          </h2>
          <p className="coda rv d2">
            Bring a question you have been carrying. Watch your own thinking take a shape.
          </p>
          <div className="row rv d2">
            <Link className="btn-xl" href="/chat?model=logos">
              Open Logos <span aria-hidden="true">→</span>
            </Link>
            <Link className="btn-link" href="/one">
              or continue with One
            </Link>
          </div>
          <Colophon className="colophon">
            <span>
              <PrintLink />
            </span>
          </Colophon>
        </div>
      </section>
    </div>
  );
}
