// app/docs/Diagrams.tsx — the wiki's diagrams, as inline SVG.
//
// Server components, no script: each is a picture of how the product is put
// together AT THE LEVEL A READER NEEDS — what happens, in what order, and
// where it lands. No model names, no thresholds, no mechanisms that keep
// anything safe; those are internal (app/dev/architecture).
//
// Colours are classes over the wiki's tokens (docs.css, "Diagrams"), never
// literal fills, so a diagram follows whatever ground .docs-root is given.
// Every figure carries a title and a description for screen readers, and
// the caption says in words what the drawing shows.

import type { ReactNode } from 'react';

type Tone = 'now' | 'past' | 'plain';

/** A box with up to four lines of words, the first one stronger. */
function Box({ x, y, w, h, lines, tone = 'plain', center = true }: { x: number; y: number; w: number; h: number; lines: string[]; tone?: Tone; center?: boolean }) {
  const lh = 15;
  const top = y + h / 2 - ((lines.length - 1) * lh) / 2 + 4;
  const tx = center ? x + w / 2 : x + 10;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} className={`dg-box${tone === 'plain' ? '' : ` is-${tone}`}`} />
      {lines.map((l, i) => (
        <text key={i} x={tx} y={top + i * lh} textAnchor={center ? 'middle' : 'start'} className={`dg-t${i === 0 ? ' is-strong' : ' is-small'}`}>
          {l}
        </text>
      ))}
    </g>
  );
}

/** An arrowhead marker, one per figure so ids never collide on a page. */
function Arrowheads({ id }: { id: string }) {
  return (
    <defs>
      <marker id={`${id}-a`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" className="dg-arrow" />
      </marker>
      <marker id={`${id}-g`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" className="dg-arrow is-accent" />
      </marker>
    </defs>
  );
}

function Figure({ id, title, desc, viewBox, caption, children }: { id: string; title: string; desc: string; viewBox: string; caption: ReactNode; children: ReactNode }) {
  return (
    <figure className="d-diagram">
      <div className="d-diagram-frame">
        <svg viewBox={viewBox} role="img" aria-labelledby={`${id}-t ${id}-d`}>
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          <Arrowheads id={id} />
          {children}
        </svg>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** Every model, in order: two lines that met in Logos 5. Not to scale. */
export function HistoryTimeline() {
  const id = 'dg-history';
  const core = 70;
  const logos = 205;
  return (
    <Figure
      id={id}
      viewBox="0 0 760 300"
      title="Socria's models, from Core 2 to Logos 5"
      desc="Two lines. The Core line: Core 2, retired on 2 October 2026 into Core 3.1, and Core 4 beside it. The Logos line: Logos, Logos 2, Logos 3, Logos 3.5 on 11 October and Logos 4 on 19 October. The Core conversations moved into Logos 5 on 21 October, and on 24 October 2026 Logos 5 became the only Socria."
      caption={
        <>
          Two lines that met. The Core models were conversations; the Logos models were an environment
          around one. Their conversations all open in Logos 5, which has been the only Socria since
          24 October 2026. Ordered, not drawn to scale.
        </>
      }
    >
      <text x={20} y={22} className="dg-t is-small">CORE — a conversation</text>
      <text x={20} y={157} className="dg-t is-small">LOGOS — an environment around one</text>

      <Box x={20} y={core - 22} w={110} h={44} lines={['Core 2', 'questions only']} tone="past" />
      <Box x={170} y={core - 22} w={120} h={44} lines={['Core 3 · 3.1', 'memory, syntheses']} tone="past" />
      <Box x={330} y={core - 22} w={120} h={44} lines={['Core 4', 'whose work is it?']} tone="past" />
      <path d={`M130,${core} L166,${core}`} className="dg-line" markerEnd={`url(#${id}-a)`} />
      <text x={148} y={core - 28} textAnchor="middle" className="dg-t is-small">2 Oct</text>

      {/* the Core conversations, gathered and carried across */}
      <path d={`M230,${core + 22} L230,112 L560,112`} className="dg-line is-soft" />
      <path d={`M390,${core + 22} L390,112`} className="dg-line is-soft" />
      <path d="M560,112 C590,112 596,126 606,128" className="dg-line is-accent" markerEnd={`url(#${id}-g)`} />
      <text x={470} y={106} textAnchor="middle" className="dg-t is-small">Core chats open in Logos 5 · 21 Oct</text>

      <Box x={20} y={logos - 22} w={88} h={44} lines={['Logos', 'the live map']} tone="past" />
      <Box x={122} y={logos - 22} w={86} h={44} lines={['Logos 2', 'models']} tone="past" />
      <Box x={222} y={logos - 22} w={96} h={44} lines={['Logos 3', 'solved, in 3D']} tone="past" />
      <Box x={332} y={logos - 22} w={92} h={44} lines={['Logos 3.5', 'displays']} tone="past" />
      <Box x={438} y={logos - 22} w={104} h={44} lines={['Logos 4', 'everyday tools']} tone="past" />
      {[108, 208, 318, 424].map((x, i) => (
        <path key={i} d={`M${x},${logos} L${x + 12},${logos}`} className="dg-line" markerEnd={`url(#${id}-a)`} />
      ))}
      <path d={`M542,${logos} C580,${logos} 588,160 606,152`} className="dg-line is-accent" markerEnd={`url(#${id}-g)`} />

      <Box x={610} y={108} w={130} h={58} lines={['Logos 5', 'the only Socria', 'since 24 Oct 2026']} tone="now" />

      <path d="M20,262 L740,262" className="dg-line is-soft" />
      <text x={20} y={282} className="dg-t is-small">before October 2026</text>
      <text x={378} y={282} textAnchor="middle" className="dg-t is-small">11 Oct</text>
      <text x={490} y={282} textAnchor="middle" className="dg-t is-small">19 Oct</text>
      <text x={675} y={282} textAnchor="middle" className="dg-t is-accent">24 Oct</text>
    </Figure>
  );
}

/** Which earlier model each part of Logos 5 came from. */
export function CarriedIntoLogos5() {
  const id = 'dg-carried';
  const left: [string, string, number][] = [
    ['Core 3.1', 'remembered the thread', 20],
    ['Core 4', 'whose work is it?', 62],
    ['Logos', 'the live map', 128],
    ['Logos 2', 'models you own', 170],
    ['Logos 3', 'solved, in 3D', 212],
    ['Logos 3.5', 'displays, documents', 270],
    ['Logos 4', 'everyday tools', 338],
  ];
  const right: [string, number][] = [
    ['Synthesize', 20],
    ['Who does which part', 54],
    ['Answers checked, not recalled', 88],
    ['The Logic Map', 128],
    ['Models you move and undo', 170],
    ['Studio: designs in 3D', 212],
    ['Charts, plans, comparisons', 246],
    ['Documents read and cited', 280],
    ['Memory you can correct', 314],
    ['Point & Ask, push to talk', 348],
  ];
  const links: [number, number][] = [
    [0, 0],
    [1, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [5, 7],
    [5, 8],
    [6, 9],
  ];
  const H = 28;
  return (
    <Figure
      id={id}
      viewBox="0 0 760 390"
      title="What each earlier model carried into Logos 5"
      desc="Core 3.1 gave Logos 5 Synthesize. Core 4 gave it the decision about who does which part of the work, and answers that are checked rather than recalled. The original Logos gave it the Logic Map. Logos 2 gave models you move and undo. Logos 3 gave designs drawn in 3D. Logos 3.5 gave the everyday displays, documents read and cited, and a memory you can correct. Logos 4 gave Point & Ask and voice."
      caption={<>Nothing in Logos 5 started from nothing. Each part on the right came from a model on the left, and most of them were rebuilt on the way.</>}
    >
      <text x={20} y={12} className="dg-t is-small">EARLIER</text>
      <text x={740} y={12} textAnchor="end" className="dg-t is-small">IN LOGOS 5</text>
      {links.map(([l, r], i) => {
        const y1 = left[l][2] + H / 2 + 4;
        const y2 = right[r][1] + H / 2 + 4;
        return <path key={i} d={`M270,${y1} C380,${y1} 410,${y2} 516,${y2}`} className="dg-line is-accent" markerEnd={`url(#${id}-g)`} />;
      })}
      {left.map(([name, what, y]) => (
        <g key={name}>
          <rect x={20} y={y + 4} width={250} height={H} rx={7} className="dg-box is-past" />
          <text x={30} y={y + 22} className="dg-t is-strong">{name}</text>
          <text x={102} y={y + 22} className="dg-t is-small">{what}</text>
        </g>
      ))}
      {right.map(([name, y]) => (
        <g key={name}>
          <rect x={520} y={y + 4} width={220} height={H} rx={7} className="dg-box is-now" />
          <text x={532} y={y + 22} className="dg-t">{name}</text>
        </g>
      ))}
    </Figure>
  );
}

/** Home, a line of thinking and its four views — and what opens each. */
export function LineOfThinking() {
  const id = 'dg-views';
  const tabs: [string, string[]][] = [
    ['Chat', ['Talk and questions.', 'A reply turns', 'interactive only', 'where it helps.']],
    ['Content', ['The files you drop,', 'read and kept.', 'Replies cite their', 'passages.']],
    ['Artifacts', ['What is made: your', 'writing, charts,', 'models, 3D.', 'Opens when you ask.']],
    ['Logic Map', ['The structure of', 'the thinking —', 'drawn when you ask', 'for structure.']],
  ];
  return (
    <Figure
      id={id}
      viewBox="0 0 760 290"
      title="The Universal Map and a line of thinking"
      desc="Home is the Universal Map, every conversation on one map. Opening one gives a line of thinking with four views: Chat for talk, Content for your files, Artifacts for what is made, and the Logic Map for structure. Split View docks one more panel beside whichever view is open."
      caption={
        <>
          Home is the Universal Map. A line of thinking opens on Chat; the view changes only when what you
          asked for lives somewhere else — a file goes to Content, something made to Artifacts, structure to
          the Logic Map — and on a wide screen the conversation stays beside it.
        </>
      }
    >
      <Box x={20} y={40} w={170} h={200} lines={['The Universal Map', 'every conversation', 'on one map:', 'today, this week,', 'this month, all time']} />
      <path d="M190,140 L228,140" className="dg-line is-accent" markerEnd={`url(#${id}-g)`} />
      <rect x={236} y={20} width={504} height={250} rx={12} className="dg-box" />
      <text x={252} y={42} className="dg-t is-small">A LINE OF THINKING</text>
      {tabs.map(([name, lines], i) => {
        const x = 252 + i * 122;
        return (
          <g key={name}>
            <rect x={x} y={54} width={112} height={30} rx={15} className={`dg-box${i === 0 ? ' is-now' : ''}`} />
            <text x={x + 56} y={74} textAnchor="middle" className="dg-t is-strong">{name}</text>
            {lines.map((l, k) => (
              <text key={k} x={x + 56} y={110 + k * 16} textAnchor="middle" className="dg-t is-small">{l}</text>
            ))}
          </g>
        );
      })}
      <rect x={252} y={196} width={478} height={56} rx={8} className="dg-box is-past" />
      <text x={491} y={219} textAnchor="middle" className="dg-t is-strong">Split View</text>
      <text x={491} y={237} textAnchor="middle" className="dg-t is-small">one more panel beside whichever view is open — on a wide screen</text>
    </Figure>
  );
}

/** One turn, at the level a reader needs. */
export function OneTurn() {
  const id = 'dg-turn';
  const steps: [string, string[]][] = [
    ['You say something', ['a question, a file,', 'a hello, an attempt']],
    ['Read in code', ['the exchange, the', 'view, whose part']],
    ['Evidence gathered', ['your files, sources,', 'what is computed']],
    ['One reply', ['streamed as it is', 'written']],
    ['Checked as it lands', ['citations must exist,', 'numbers worked out']],
  ];
  return (
    <Figure
      id={id}
      viewBox="0 0 760 150"
      title="What happens when you send a message in Logos 5"
      desc="Your message is read in code: what kind of exchange it is, which view it needs, and which part of the work is yours. The evidence it needs is gathered: your documents, sources, and what the engine computes. Then one reply is written and streamed, and checked as it lands: a citation must point at something that was really given, and numbers are worked out rather than recalled."
      caption={
        <>
          Most turns are one model call. Everything before it is code that reads your words; everything
          after it is code that checks the reply. Neither part guesses about you: a reading Socria cannot
          make is left out, and the reply is only ever given more help for it, never less.
        </>
      }
    >
      {steps.map(([name, lines], i) => {
        const x = 10 + i * 150;
        return (
          <g key={name}>
            <Box x={x} y={34} w={140} h={74} lines={[name, ...lines]} tone={i === 3 ? 'now' : 'plain'} />
            {i < steps.length - 1 && <path d={`M${x + 140},71 L${x + 149},71`} className="dg-line" markerEnd={`url(#${id}-a)`} />}
          </g>
        );
      })}
      <text x={10} y={22} className="dg-t is-small">YOUR TURN</text>
      <text x={748} y={134} textAnchor="end" className="dg-t is-small">a greeting skips the middle: talk is answered as talk</text>
    </Figure>
  );
}
