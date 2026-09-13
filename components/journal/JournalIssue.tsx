'use client';
// components/journal/JournalIssue.tsx
//
// Socria — Issue No. 4 · the interrogation.
//
// The homepage. Eight questions, four readings, one live demonstration of the
// product refusing to answer, and a close that admits the last question was
// always going to be the reader's.
//
// Ported from the Claude Design prototype's journal-issue.jsx. The structure
// and every word are the design's; what changed is that the links point at
// real routes instead of flat .html files, and the two places the prototype
// said "Writing" now say "Blog", which is what the section is called
// everywhere else in the app.
//
// A CLIENT COMPONENT, because drivers.ts does direct DOM work — splitting
// headlines into per-word spans, scrubbing an SVG against scroll. The page is
// stateless after mount, so React never re-renders the nodes it rewrites.
// Adding state that re-renders a section would undo the word-splitting inside
// it; if this page ever needs state, isolate it below the sections that get
// split.

import { useEffect } from 'react';
import Link from 'next/link';
import {
  Grain,
  Progress,
  Count,
  Mast,
  Turn,
  Silence,
  Reading,
  Fig,
  TradeFig,
  GuardType,
  Refusal,
  PrintLink,
  Label,
  InkMark,
} from './parts';
import { Button, Logo, Transcript, DefinitionEntry, LogosNode, type NodeType } from './ds';
import { Stage } from './Stage';
import { initJournal } from './drivers';

/* The map that draws itself during Reading III. */
const MAP_NODES: { t: NodeType; l: string; x: number; y: number }[] = [
  { t: 'question', l: 'Should I take the job?', x: 14, y: 50 },
  { t: 'claim', l: 'It pays more', x: 44, y: 18 },
  { t: 'claim', l: "I've stopped growing", x: 42, y: 82 },
  { t: 'assumption', l: 'money = progress', x: 74, y: 26 },
  { t: 'evidence', l: 'two people who left', x: 72, y: 82 },
  { t: 'tension', l: 'security ↔ growth', x: 56, y: 50 },
];
const MAP_EDGES: [number, number, string, number][] = [
  [0, 1, 'person', 1],
  [0, 2, 'person', 2],
  [1, 3, 'question', 3],
  [2, 4, 'evidence', 4],
  [1, 5, 'question', 5],
  [2, 5, 'question', 5],
];

function SelfMap() {
  return (
    <div
      className="mapbox"
      role="img"
      aria-label="A Thinking Map drawn from one question: two claims, an assumption, a piece of evidence and an unresolved tension."
    >
      <svg className="edges" viewBox="0 0 100 100" preserveAspectRatio="none">
        {MAP_EDGES.map(([a, b, rel, after], i) => (
          <path
            key={i}
            className={`e-${rel}`}
            data-after={after}
            vectorEffect="non-scaling-stroke"
            d={`M${MAP_NODES[a].x},${MAP_NODES[a].y} L${MAP_NODES[b].x},${MAP_NODES[b].y}`}
          />
        ))}
      </svg>
      {MAP_NODES.map((n, i) => (
        <div className={`mapnode n-${n.t}`} key={i} style={{ left: `${n.x}%`, top: `${n.y}%` }}>
          <LogosNode type={n.t} label={n.l} state={n.t === 'tension' ? 'focused' : 'default'} />
        </div>
      ))}
    </div>
  );
}

function GroundFig() {
  return (
    <Fig
      n="II"
      caption="A claim, and what holds it up."
      claim="One of these can be checked."
      keys={[
        ['person', 'The claim'],
        ['question', 'Assumption'],
        ['evidence', 'Evidence'],
      ]}
    >
      <svg
        viewBox="0 0 640 230"
        role="img"
        aria-label="A claim resting on one unexamined assumption and one checkable piece of evidence."
      >
        <rect x="238" y="22" width="164" height="46" fill="none" stroke="var(--person)" strokeWidth="1.6" />
        <text className="fl person" x="320" y="50" textAnchor="middle">
          The claim
        </text>
        <path
          className="l-question draw"
          style={{ '--len': 230, '--dly': '.2s' } as never}
          strokeDasharray="6 6"
          d="M280,70 L164,158"
        />
        <path className="l-evidence draw" style={{ '--len': 230, '--dly': '.8s' } as never} d="M360,70 L476,158" />
        <circle
          className="pop"
          style={{ '--dly': '1.1s' } as never}
          cx="150"
          cy="172"
          r="16"
          fill="none"
          stroke="var(--question)"
          strokeWidth="1.8"
          strokeDasharray="4 4"
        />
        <circle
          className="pop"
          style={{ '--dly': '1.4s' } as never}
          cx="490"
          cy="172"
          r="16"
          fill="none"
          stroke="var(--evidence)"
          strokeWidth="1.8"
        />
        <text className="fl question pop" style={{ '--dly': '1.3s' } as never} x="150" y="208" textAnchor="middle">
          Unexamined
        </text>
        <text className="fl evidence pop" style={{ '--dly': '1.6s' } as never} x="490" y="208" textAnchor="middle">
          Checkable
        </text>
        <text className="fl faint pop" style={{ '--dly': '1.8s' } as never} x="320" y="208" textAnchor="middle">
          It shows you which is which
        </text>
      </svg>
    </Fig>
  );
}

function GuardFig() {
  return (
    <Fig n="III" caption="The answer, arriving too early." claim="Held at the line."
      keys={[
        ['machine', 'The answer'],
        ['person', 'You'],
      ]}
    >
      <svg viewBox="0 0 640 190" role="img" aria-label="The answer travels toward you and stops at a moss line.">
        <path className="l-machine draw" style={{ '--len': 280, '--dly': '.2s' } as never} d="M46,95 L282,95" />
        <path className="l-machine pop" style={{ '--dly': '1.1s' } as never} d="M268,86 L284,95 L268,104" fill="none" />
        <line className="pop" style={{ '--dly': '1.3s' } as never} x1="318" y1="26" x2="318" y2="164" stroke="var(--person)" strokeWidth="2.4" />
        <text className="fl machine" x="46" y="76">
          The answer
        </text>
        <text className="fl person pop" style={{ '--dly': '1.5s' } as never} x="338" y="76">
          Your turn to reach it
        </text>
        <circle className="pop" style={{ '--dly': '1.7s' } as never} cx="556" cy="95" r="6" fill="var(--person)" />
        <text className="fl faint pop" style={{ '--dly': '1.9s' } as never} x="556" y="124" textAnchor="middle">
          You
        </text>
      </svg>
    </Fig>
  );
}

export function JournalIssue() {
  useEffect(() => {
    initJournal();
  }, []);

  return (
    <div className="jr-root">
      <Grain />
      <Progress />
      <Count />
      <Mast current="journal" cta={{ href: '/chat', t: 'Ask Socria' }} />

      {/* COVER */}
      <section className="cover" data-screen-label="Cover">
        <div className="wrap">
          <Label tone="moss">Issue No. 4 · Watch it think · MMXXVI</Label>
          <h1 data-split="">
            <span className="b">AI gets stronger.</span>
            <span className="b em">Humans should too.</span>
          </h1>
          <p className="st rv d2">
            What follows is not a pitch. It is the product, live, doing the only thing it does —
            and then eight questions about what you just watched.
          </p>
          <div className="begin">
            <span className="lbl">Begin</span>
            <span className="ln" />
          </div>
        </div>
      </section>

      <Turn
        i="i"
        who="Socria asks"
        socria
        ground="question"
        aside="be honest — when was the last time?"
        answer={
          <>
            Not updated a fact. <em>Changed your mind</em> — sat with something uncomfortable long
            enough that it moved. If that took more than a second to find, the rest of this issue is
            already the argument.
          </>
        }
      >
        When did you last change your mind?
      </Turn>

      <Stage />

      <Turn
        i="ii"
        who="Socria asks"
        socria
        ground="question"
        aside="it declined twice. did you notice the second?"
        answer={
          <>
            You asked it for a conclusion and got a question. You asked it for an answer and got{' '}
            <em>step three</em>. Neither refusal was a limitation. Both were the product.
          </>
        }
      >
        You just watched it say no. Twice.
      </Turn>

      <Reading
        n="I"
        name="The trade"
        id="trade"
        aside="the minute you skipped was the whole of it"
        title={
          <>
            Answering became the same gesture as <span className="em">thinking.</span>
          </>
        }
        deck="You asked for a conclusion. Somewhere in the last few years that became the same request as asking to think — and almost nobody noticed the substitution."
      >
        <div className="cols">
          <p className="drop">
            <span className="kick">The argument</span>A question appears, a paragraph arrives, the
            discomfort passes. What is lost is not the paragraph — the paragraph is usually fine.
            What is lost is the minute you would have spent disagreeing with yourself, and that
            minute was the whole of it.
          </p>
          <p>
            The failure stays invisible for about a year. Then one day you notice you are holding
            opinions you never argued for, and you cannot reconstruct how they got there. There was
            no moment of surrender. There was a series of reasonable Tuesdays.
          </p>
          <p className="breakout">
            The strongest case against us is that people do not want to think. That case is half
            right.
          </p>
          <p>
            People do not want to think about <em>everything</em>. Nobody wants to reason from first
            principles about a train ticket. But there is a small set of questions that are genuinely
            theirs — what to build, whom to trust, when to leave — and on those, being handed a
            conclusion is not a service. It is a loss disguised as help.
          </p>
          <p>
            The industry&rsquo;s answer to this is to keep asking how much more it can take off your
            hands. <span className="jargon">Let&rsquo;s circle back on this next sprint.</span> The
            question we would rather ask is the inverse, and it is the reason this issue exists at
            all.
          </p>
          <p>
            So Socria asks before it answers. It surfaces the assumption, it names the tension, and
            then — this is the hard part, engineering-wise — <em>it stops.</em>
          </p>
        </div>
        <TradeFig />
      </Reading>

      <Silence>It is waiting. That is not a loading state.</Silence>

      <Refusal i="iii" />

      <Turn
        i="iv"
        who="Socria asks"
        socria
        answer={
          <>
            That is usually the more useful question. Most requests for an answer are requests for{' '}
            <em>permission</em>, and you watched it refuse to hand that out — kindly, and across the
            chat, the map and the Board at once.
          </>
        }
      >
        What were you hoping it would say?
      </Turn>

      <Reading
        n="II"
        name="The refusal"
        id="refusal"
        tint
        title={
          <>
            A tool that knows <span className="em">when to stop.</span>
          </>
        }
        deck="You watched it decline twice — once in prose, once on the Board. Most assistants are rewarded for saying more. This one is rewarded for saying just enough."
      >
        <div className="cols">
          <p className="drop">
            <span className="kick">The guard</span>While you are learning, the answer stays yours to
            reach. That sentence is a product specification, not a slogan: the Answer Guard holds
            across every surface simultaneously, because a refusal that can be walked around is not a
            refusal.
          </p>
          <p>
            It is not withholding for its own sake. Ask for a fact and you get the fact. Ask to be
            carried past the one step you are actually standing on, and it will put you back on it —
            with a question that is easier to answer than the one you asked.
          </p>
          <p className="breakout">
            Not yet. You&rsquo;re one step away — what does dividing both sides by three do here?
          </p>
          <p>
            The difference between those two behaviours is the difference between a tool that makes
            you capable and a tool that makes you a customer.{' '}
            <span className="jargon">Directionally correct. We can iterate post-launch.</span> No:
            this one is load-bearing, and it shipped first.
          </p>
        </div>
        <div className="fig" style={{ marginTop: 'clamp(24px,4vh,40px)' }}>
          <Transcript
            lines={[
              { who: 'you', text: 'Just tell me x.' },
              {
                who: 'socria',
                text: "Not yet. You're one step away — what does dividing both sides by three do here?",
              },
              { who: 'you', text: '…it isolates x. Fine. x is 13.' },
              {
                who: 'socria',
                text: 'It is. And you got there — which is the only version of that sentence worth having.',
              },
            ]}
          />
        </div>
        <GuardFig />
        <GuardType answer="Divide by three: x = 13.">
          Not yet. You&rsquo;re one step away — what does dividing both sides by three do here?
        </GuardType>
      </Reading>

      <Turn
        i="v"
        who="Socria asks"
        socria
        ground="question"
        aside="which of yours has never been asked?"
        answer={
          <>
            &ldquo;Most people.&rdquo; Two words, and an entire essay was resting on them. Logos drew
            it with a dashed ring, next to the claim it was holding up — and then{' '}
            <em>it let you look at the difference.</em>
          </>
        }
      >
        Did you see the assumption before it did?
      </Turn>

      <Reading
        n="III"
        name="The map"
        id="map"
        title={
          <>
            Every message is read <span className="em">twice.</span>
          </>
        }
        deck="Three sentences from you became five nodes and an unresolved tension. That was the second reading, and you watched it happen."
      >
        <div className="cols">
          <p className="drop">
            <span className="kick">Logos</span>Say a sentence and it is quietly parsed for the claims
            it makes, the assumptions underneath them, and the tensions it leaves open. Those become
            nodes. The nodes become a shape. The shape is the thing you could never hold in your head
            at once.
          </p>
          <p>
            Nothing on the map is Socria&rsquo;s opinion. Every node carries your own words, verbatim
            — which is why an assumption written back to you in your own phrasing is so much harder
            to dismiss than a correction would be.
          </p>
          <p className="breakout">
            The tension is the most useful node on any map, and the one you would never have drawn
            yourself.
          </p>
          <p>
            Four moves work on any node: <em>explore</em> it, <em>challenge</em> it — properly, at its
            strongest — <em>research</em> it against the live web, or <em>trace</em> it backward to
            see what it rests on. The map reorganises as you think, because thinking is not additive.
          </p>
        </div>
        <SelfMap />
        <GroundFig />
      </Reading>

      <Silence>Five nodes, from three sentences. Not one of them is a conclusion.</Silence>

      <Turn
        i="vi"
        who="You might say"
        quiet
        answer="Nothing, to begin — and the free tier is a beginning rather than a demonstration. Everything you watched above is free: real maps, every lens, every move, the Board, drawn live and fully yours."
      >
        What does it cost?
      </Turn>

      <Turn
        i="vii"
        who="Socria asks"
        socria
        answer={
          <>
            Socria One is fifteen dollars a month and removes the ceiling. But the vow holds at either
            tier: <em>what you have made is yours,</em> and nothing you build is ever taken back.
          </>
        }
      >
        What is it worth to you?
      </Turn>

      <Reading
        n="IV"
        name="The line"
        id="line"
        tint
        title={
          <>
            A precise division of <span className="em">labour.</span>
          </>
        }
        deck="What Socria contributes, and what remains yours under every circumstance."
      >
        <div className="cols">
          <p className="drop">
            <span className="kick">The terms</span>Socria contributes structure, questions, research
            and critique. You keep intent, authorship, judgment and the conclusion. That division is
            not a setting, and there is no tier that changes it.
          </p>
          <p>
            Free gives you real Thinking Maps, every lens and every move on every node, Research
            experienced properly once per map, and the Board. Socria One — fifteen dollars a month —
            unbinds the branching, opens Research across the whole map, adds all four depths, Draft
            Space in full, persistent reasoning and connected sources.
          </p>
          <p className="breakout">Values that disappear when they&rsquo;re expensive aren&rsquo;t values.</p>
          <p>
            Which is why the guard does not relax for paying members, the map never fills itself in,
            and the conclusion stays the one node the product will not draw. <em>Reality wins.</em>
          </p>
        </div>
        <div className="fig" style={{ marginTop: 'clamp(24px,4vh,42px)' }}>
          <DefinitionEntry
            word="Socria"
            pronunciation="/ˈsoʊ.kri.ə/"
            pos="noun"
            gloss={
              <>
                A human-first AI that strengthens your thinking instead of replacing it. It asks
                questions, surfaces assumptions and reflects your reasoning back to you — but{' '}
                <em>never hands you the conclusion.</em>
              </>
            }
            coda={
              <>
                It doesn&rsquo;t think for you.
                <br />
                <em style={{ color: 'var(--moss-700)' }}>It helps you think more clearly.</em>
              </>
            }
          />
        </div>
      </Reading>

      <Turn
        i="viii"
        who="Socria asks, last"
        socria
        aside="go on — the margin is yours"
        answer="That is the one this issue could not print, because it is the only question here that was ever going to be yours."
      >
        You watched it ask every question.{' '}
        <InkMark shape="underline">Which one would you have asked?</InkMark>
      </Turn>

      {/* THE CLOSE */}
      <section className="close" data-screen-label="Close">
        <div className="glow" aria-hidden="true" />
        <div className="wrap">
          <div className="rv" style={{ marginBottom: '28px' }}>
            <Logo size="lg" showWordmark={false} onDark markSrc="/socria-mark.png" />
          </div>
          <h2 data-split="">
            Think For <span className="em">Yourself.</span>
          </h2>
          <p className="coda rv d2">
            Bring the question you have been carrying. It will not answer it — and that is the point.
          </p>
          <p className="said rv d2">
            <span data-readtime="">under a minute</span>, and I never gave you an answer.{' '}
            <em>Good.</em>
          </p>
          <div className="row rv d2">
            <Button as="a" href="/chat" variant="primary" size="xl" onDark arrow>
              Open Logos
            </Button>
            <Button as="a" href="/one" variant="link" onDark>
              or read the One issue
            </Button>
          </div>

          {/* The colophon carries the whole site, including the legal pages.
              `subprocessors` was previously reachable only by typing its URL —
              a page nobody could find is not a published policy. */}
          <div className="colophon">
            <span>Socria · Human-first AI</span>
            <span>
              <Link href="/logos">Logos</Link>
            </span>
            <span>
              <Link href="/blog">Blog</Link>
            </span>
            <span>
              <Link href="/docs">Docs</Link>
            </span>
            <span>
              <Link href="/privacy">Privacy</Link>
            </span>
            <span>
              <Link href="/terms">Terms</Link>
            </span>
            <span>
              <Link href="/security">Security</Link>
            </span>
            <span>
              <Link href="/subprocessors">Subprocessors</Link>
            </span>
            <span>
              <PrintLink />
            </span>
            <span className="it">Think For Yourself.</span>
            <span>
              © <span data-year="">{new Date().getFullYear()}</span>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
