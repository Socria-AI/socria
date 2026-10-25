// app/logos-5-internal/Architecture.tsx — how Logos 5 works, for the people who build it.
//
// One long page, read top to bottom: the system, a turn through the chat
// route, the runtime's six subsystems, allocation, Metacognitive Regulation,
// evidence, the prompt, the stream gate, the workspace, memory, data, the
// switches, and what is measured. The diagrams are HTML and inline SVG so they
// reflow on a phone and need no script.
//
// BEHIND THE NEW SOCRIA'S ACCESS CODE (page.tsx), and unlisted: never
// indexed, disallowed in robots.ts, not in the sitemap, linked from nowhere.
// It describes the code and holds no data; the
// sources it summarises are docs/LOGOS-5.md, docs/LOGOS-5-RUNTIME.md,
// docs/MR.md and docs/CORE-4-ARCHITECTURE.md, which stay the reference.

import './logos5-internal.css';

const CONTENTS: [string, string][] = [
  ['overview', 'The system'],
  ['turn', 'A turn, end to end'],
  ['runtime', 'The runtime'],
  ['paths', 'Paths and models'],
  ['allocation', 'Allocation'],
  ['mr', 'Metacognitive Regulation'],
  ['evidence', 'Evidence and checks'],
  ['prompt', 'The prompt'],
  ['stream', 'The stream gate'],
  ['workspace', 'The workspace'],
  ['memory', 'Memory'],
  ['data', 'Data'],
  ['switches', 'Switches and rollback'],
  ['measured', 'Measured and tested'],
  ['limits', 'Known limits'],
  ['sources', 'Where things live'],
];

/** The chat route, in the order it runs (app/api/logos/chat/route.ts). */
const TURN: { step: string; what: string; where: string; kind: 'gate' | 'read' | 'decide' | 'model' | 'out' | 'after' }[] = [
  { step: 'Who is asking', what: 'A Clerk session or the typed access key, then the rate limit; guests get the same route with nothing remembered. A fixed reply (the “Can you?” answer) is given here, before any counter or model.', where: 'route.ts', kind: 'gate' },
  { step: 'Who else is here', what: 'A shared line of thinking or a room: nobody’s memory in or out, Socria answers the person who asked, MR keeps no per-person state.', where: 'lib/share/turn.ts', kind: 'gate' },
  { step: 'Documents', what: 'Attached files are lettered (A1, A2…) and their passages, plus the passage selected in a document view, travel in this turn.', where: 'lib/docs', kind: 'read' },
  { step: 'Reads started early', what: 'MR’s settings and this conversation’s ledger rows (and, with consent, “from now on” preferences from other conversations) start here and run beside the allowance checks.', where: 'lib/mr/store.ts', kind: 'read' },
  { step: 'Metered boundaries', what: 'The plan’s allowance: a conversation is counted once, messages per day, files on the turn that carries them. Charged later, never before the reply can be made.', where: 'lib/usage', kind: 'gate' },
  { step: 'Orchestrate', what: 'The path (fast, standard, verified), the intent (Rules A–D), which view to reveal, which calls run, which model.', where: 'lib/runtime/orchestrate.ts', kind: 'decide' },
  { step: 'Cognitive state', what: 'Objective, intent, domain, what is open, open questions and assumptions, their stated preferences, progress. Derived every turn; never stored as memory.', where: 'lib/runtime/state.ts', kind: 'decide' },
  { step: 'Allocation', what: 'Core 4’s split and allocator, replayed over the conversation: what Socria does, supports, and leaves with them; the withhold contract; the question budget.', where: 'lib/runtime/allocation.ts · replay.ts', kind: 'decide' },
  { step: 'Metacognitive Regulation', what: 'Reads how they want to be helped, decides one typed, scoped, revocable adjustment, and narrows the move. Below their words and the app’s policies; deterministic, no model call.', where: 'lib/mr', kind: 'decide' },
  { step: 'Behavioral control', what: 'The compact core and the blocks this turn needs (maths, documents, the picture, building a model, the guard, length).', where: 'lib/runtime/behavior.ts', kind: 'decide' },
  { step: 'Presentation', what: 'Whether an inline element (chart, slider, comparison, reasoning, choices, draft, an overview of concepts, steps or a timeline) is offered, decided in code; prose is the default and a list asked for is a list.', where: 'lib/runtime/presentation.ts', kind: 'decide' },
  { step: 'Epistemic control', what: 'What kind of claim the turn asks for and what evidence exists: documents, web sources when the gate opens, the engine’s computations, memory with provenance. Evidence gets ids.', where: 'lib/runtime/epistemic.ts', kind: 'decide' },
  { step: 'The prompt, in two parts', what: 'Stable instructions first and alone (cacheable), then history in steps of sixteen, then this turn’s context last. MR’s lines go only in the turn’s part.', where: 'route.ts', kind: 'decide' },
  { step: 'One model call', what: 'The reply, streamed — or held, on the verified path, so it can be checked and retried once.', where: 'OpenAI', kind: 'model' },
  { step: 'The stream gate', what: 'Sentence by sentence: citations to evidence never given are removed, claimed tool runs that did not happen never stream, MR’s filters, inline blocks checked, the closing question capped.', where: 'lib/core4/stream-gate.ts', kind: 'out' },
  { step: 'After the reply', what: 'A late fact check with a plain correction if needed; MR’s content-free ledger rows; the Mind Graph write when there is something to remember; the map pass when it is due.', where: 'route.ts · lib/mind · /api/logos/map', kind: 'after' },
];

const RUNTIME: { name: string; file: string; in: string; out: string }[] = [
  { name: 'Inference Orchestration', file: 'orchestrate.ts', in: 'the turn, the open view, the workspace', out: 'path · intent · view · calls · model' },
  { name: 'Cognitive State', file: 'state.ts', in: 'the conversation and the workspace', out: 'objective, domain, open questions, assumptions, preferences, progress' },
  { name: 'Cognitive Allocation', file: 'allocation.ts', in: 'the state, Core 4 replayed, the engine’s verdicts', out: 'the split, the move, the question budget, the withhold' },
  { name: 'Behavioral Control', file: 'behavior.ts', in: 'the allocation and the intent', out: 'the compact core and this turn’s blocks' },
  { name: 'Epistemic Control', file: 'epistemic.ts', in: 'documents, web, computations, memory', out: 'evidence with ids, rules, claim labels' },
  { name: 'Representation', file: 'representation.ts', in: 'everything already stored', out: 'typed objects with ids, provenance and links' },
];

const PATHS: [string, string, string][] = [
  ['Fast', 'No model', 'Map edits, scene and object commands, view and interface requests, displays made from the map.'],
  ['Standard', 'One reply call', 'Talk and most questions. No map pass, no second memory store; the Mind Graph writes only when there is something to remember.'],
  ['Verified', 'Reply + evidence + checks', 'Mathematics, a question needing current information (the web gate), their documents, a pushback on an earlier answer, a build request, a request for structure.'],
];

const RULES: [string, string, string][] = [
  ['A', 'Talk', 'Stays in Chat. From another view on a wide screen the conversation docks beside it. The Logic Map never opens for talk.'],
  ['B', 'Documents', 'Read into Content in the background, said under the turn. The screen does not move.'],
  ['C', 'Something to make', 'Opens Artifacts with the conversation beside it; what the turn asked for is selected there.'],
  ['D', 'Structure', 'Opens the Logic Map with the conversation beside it, so the reply is read beside the map it draws.'],
];

const DATA: [string, string, string][] = [
  ['conversations', 'yes — the conversation', 'the thread, its map, its workspace; deleted with the conversation'],
  ['mind_nodes · mind_edges · mind_sources · mind_pending', 'yes — memory, with provenance', 'the Mind Graph: what they said, confirmed, their files, sources, Socria’s readings'],
  ['mind_projects', 'yes', 'Projects and their standing instructions'],
  ['user_profiles', 'some', 'profile and settings; `mr` holds MR’s switches, consent and content-free markers'],
  ['mr_ledger', 'no — codes, ids, times', 'MR’s exposures, decisions, outcomes, integrity findings; 180 days'],
  ['core4_turns', 'no', 'Core 4’s per-turn trace (Core 4 surface)'],
  ['logos_usage', 'no', 'allowance counters'],
  ['shares · share_members · share_comments', 'yes', 'shared lines of thinking and rooms'],
];

const SWITCHES: [string, string, string][] = [
  ['LOGOS_RUNTIME', 'on', 'off: the route as it was — old prompt assembly, no epistemic checks, 24-message window'],
  ['LOGOS_PERSONA', 'Logos 5 persona on the new Socria', 'classic: the old Logos prompt everywhere; v5: the Logos 5 persona everywhere'],
  ['LOGOS_ALLOCATION', 'core4', 'lite: the split and the move alone; only the Answer Guard withholds'],
  ['LOGOS_MR', 'on', 'off: the route byte-identical to before MR; shadow: decide and trace, enforce nothing'],
  ['LOGOS_IFR · LOGOS_MR_ARM · LOGOS_MR_POLICY', 'on · full · current', 'the IFR factor, the comparison arms, pinning an earlier policy (rollback)'],
  ['LOGOS_MR_DELIBERATE', 'off', 'on: at most two small model calls per conversation when MR’s rules conflict'],
  ['LOGOS_MR_STORE', 'on', 'off: MR never reads or writes its ledger'],
  ['NEXT_PUBLIC_LOGOS5', 'on', 'off: no access code field in Manage Account (the Logos 4 screen it brought back is archived)'],
  ['NEXT_PUBLIC_LOGOS5_MAP_EVERY_TURN', 'off', 'on: a map pass on every turn'],
];

const SOURCES: [string, string][] = [
  ['The screen', 'components/LogosApp.tsx · components/logos5/* · lib/logos5/views.ts'],
  ['The chat route', 'app/api/logos/chat/route.ts'],
  ['The runtime', 'lib/runtime/{orchestrate,state,allocation,replay,behavior,presentation,epistemic,representation}.ts'],
  ['Core 4, shared', 'lib/core4/{split,allocate,stream-gate,signals,web}.ts'],
  ['Metacognitive Regulation', 'lib/mr/* · app/api/mr · components/account/MRSettings.tsx'],
  ['Accuracy and the engine', 'lib/accuracy · lib/inline-ui.ts'],
  ['Memory', 'lib/mind/* · app/api/mind'],
  ['The map', 'app/api/logos/map'],
  ['Writing', 'lib/write · app/api/logos/write'],
  ['The reference documents', 'docs/LOGOS-5.md · docs/LOGOS-5-RUNTIME.md · docs/MR.md · docs/CORE-4-ARCHITECTURE.md'],
];

function Sec({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="l5i-sec" id={id} aria-labelledby={`${id}-h`}>
      <p className="l5i-n">{String(n).padStart(2, '0')}</p>
      <h2 id={`${id}-h`}>{title}</h2>
      {children}
    </section>
  );
}

/** The system: the screen, the routes, the services, the stores. */
function SystemDiagram() {
  const col = (title: string, items: string[], tone: string) => (
    <div className={`l5i-col l5i-${tone}`}>
      <p className="l5i-col-h">{title}</p>
      <ul>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
  return (
    <figure className="l5i-fig" aria-labelledby="fig-system">
      <div className="l5i-system">
        {col('The screen (browser)', ['Universal Map — home', 'A line of thinking: Chat · Content · Artifacts · Logic Map', 'Split View · search (⌘K)', 'Writing Space · Memory', 'Push to talk · the composer'], 'client')}
        <div className="l5i-arrow" aria-hidden="true">
          <span>HTTPS · streamed text</span>
        </div>
        {col('The server (Next.js routes)', ['/api/logos/chat — every turn', '/api/logos/map — the Logic Map', '/api/logos/organize · practice · read · write', '/api/conversations · /api/mind · /api/mr', '/api/transcribe · /api/extract-memory'], 'server')}
        <div className="l5i-arrow" aria-hidden="true">
          <span>calls · reads · writes</span>
        </div>
        <div className="l5i-stack">
          {col('Models', ['Reply: OPENAI_MODEL_LOGOS (Sol)', 'Map: OPENAI_MODEL_LOGOS_MAP (Terra)', 'Memory and titles: a small model'], 'model')}
          {col('Stores', ['Supabase: conversations, Mind Graph, Projects, mr_ledger, profiles, usage, shares', 'This device: Content layout, Split View width, documents read'], 'store')}
        </div>
      </div>
      <figcaption id="fig-system">
        The browser holds the workspace; one route answers every turn; models are called only where a path needs them; what is kept lives in Supabase, and a few
        layout choices stay on the device.
      </figcaption>
    </figure>
  );
}

/** Precedence, as a ladder: the higher rung always wins. */
function PrecedenceDiagram() {
  const rungs: [string, string][] = [
    ['Safety', 'nothing changes on a safety turn'],
    ['Their words', 'what they said this turn, as IFR confirmed it'],
    ['App policy', 'the Answer Guard, a Core 4 withhold — never loosened'],
    ['ACS', 'the allocation’s move and budget'],
    ['MR', 'narrows what is left; never widens it'],
  ];
  return (
    <figure className="l5i-fig" aria-labelledby="fig-prec">
      <svg className="l5i-svg" viewBox="0 0 640 300" role="img" aria-labelledby="fig-prec">
        {rungs.map(([t, d], i) => {
          const y = 14 + i * 56;
          const w = 600 - i * 60;
          return (
            <g key={t}>
              <rect x={20 + i * 30} y={y} width={w} height={44} rx={8} className={i === 4 ? 'l5i-r-mr' : 'l5i-r'} />
              <text x={36 + i * 30} y={y + 20} className="l5i-t-b">
                {i + 1}. {t}
              </text>
              <text x={36 + i * 30} y={y + 36} className="l5i-t-s">
                {d}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption id="fig-prec">Precedence (lib/mr/execute.ts constrain): each layer may only act within what the layers above it leave.</figcaption>
    </figure>
  );
}

/** MR's loop over a conversation. */
function LoopDiagram() {
  const steps: [string, string][] = [
    ['Observe', 'their words, and the course of the turns (questions that did not help, failed attempts, repeated confusion)'],
    ['Decide', 'one typed, scoped decision — or none, which is most turns'],
    ['Enforce', 'in code where it can be: the reply filters, the token ceiling, the move'],
    ['Measure', 'the reply that went out, against what was in force'],
    ['Fold', 'next turn: judge the outcome; expire, revoke or roll back MR’s own adjustments'],
  ];
  return (
    <figure className="l5i-fig" aria-labelledby="fig-loop">
      <ol className="l5i-chain l5i-loop">
        {steps.map(([t, d]) => (
          <li key={t}>
            <b>{t}</b>
            <span>{d}</span>
          </li>
        ))}
      </ol>
      <p className="l5i-loop-back" aria-hidden="true">
        ↺ and again on the next turn — about a millisecond, no model call
      </p>
      <figcaption id="fig-loop">
        Metacognitive Regulation’s loop. Their own instruction is never ended by an outcome or a reading — only by words of theirs that the rule lists.
      </figcaption>
    </figure>
  );
}

/** The prompt, in the order the model reads it. */
function PromptDiagram() {
  return (
    <figure className="l5i-fig" aria-labelledby="fig-prompt">
      <div className="l5i-prompt">
        <div className="l5i-pp l5i-pp-stable">
          <b>Stable instructions</b>
          <span>the Logos 5 core, the length line · alone in their message · the cache prefix</span>
        </div>
        <div className="l5i-pp l5i-pp-hist">
          <b>History</b>
          <span>the conversation, its window moving in steps of sixteen so it stays cacheable</span>
        </div>
        <div className="l5i-pp l5i-pp-turn">
          <b>This turn</b>
          <span>allocation, MR’s lines, evidence with ids, the blocks this turn needs, the newest message</span>
        </div>
      </div>
      <figcaption id="fig-prompt">What changes every turn goes last, so what does not can be served from the provider’s prompt cache.</figcaption>
    </figure>
  );
}

/** The stream gate's order of work on each sentence. */
function StreamDiagram() {
  const steps: [string, string][] = [
    ['cut', 'at a sentence end or a paragraph break; code blocks whole'],
    ['citations', 'a [W7] or link no source carried is removed'],
    ['MR filters', 'their “stop asking”, check-ins, improvement claims'],
    ['tool claims', '“I ran it in Python” that did not happen never streams'],
    ['opener', '“Great question —” is taken off'],
    ['questions held', 'released if exposition follows; the close capped by budget'],
    ['inline blocks', 'a ```ui block sanitised to one shape, or dropped'],
  ];
  return (
    <figure className="l5i-fig" aria-labelledby="fig-stream">
      <ol className="l5i-chain">
        {steps.map(([t, d]) => (
          <li key={t}>
            <b>{t}</b>
            <span>{d}</span>
          </li>
        ))}
      </ol>
      <figcaption id="fig-stream">
        Every reply passes the same gate, streamed or held (lib/core4/stream-gate.ts). Nothing is removed from the middle of a reply except what a rule names.
      </figcaption>
    </figure>
  );
}

/** The workspace's screens. */
function ScreenDiagram() {
  return (
    <figure className="l5i-fig" aria-labelledby="fig-screen">
      <div className="l5i-screens">
        <div className="l5i-home">
          <b>Universal Map</b>
          <span>home · Today · This week · This month · All time · Projects</span>
        </div>
        <div className="l5i-arrow l5i-arrow-down" aria-hidden="true">
          <span>open a line of thinking</span>
        </div>
        <div className="l5i-views">
          {['Chat', 'Content', 'Artifacts', 'Logic Map'].map((v) => (
            <div key={v} className="l5i-view">
              {v}
            </div>
          ))}
          <div className="l5i-beside">Split View: one panel beside whichever view is open (desktop)</div>
        </div>
      </div>
      <figcaption id="fig-screen">
        One state machine (lib/logos5/views.ts): a view and, on a wide screen, one thing beside it. The server’s own reading of the turn decides where the screen goes.
      </figcaption>
    </figure>
  );
}

export function Architecture() {
  return (
    <div className="site-root lg-tokens l5i">
      <header className="l5i-mast">
        <span className="l5i-mark">Socria</span>
        <span className="l5i-tag">Internal · not indexed</span>
      </header>
      <main className="l5i-main">
        <div className="l5i-hero">
          <p className="l5i-eb">Architecture · Logos 5</p>
          <h1>How Logos 5 works</h1>
          <p className="l5i-deck">
            One workspace, conversation first. A turn is one route, six small deterministic subsystems and, on most turns, one model call. This page follows a turn
            from the composer to the stored row, and says where each piece lives.
          </p>
        </div>

        <nav className="l5i-toc" aria-label="Contents">
          <p className="l5i-col-h">Contents</p>
          <ol>
            {CONTENTS.map(([id, t]) => (
              <li key={id}>
                <a href={`#${id}`}>{t}</a>
              </li>
            ))}
          </ol>
        </nav>

        <Sec id="overview" n={1} title="The system">
          <p>
            Logos 5 is the new Socria’s screen. The browser keeps the workspace — the Universal Map, each line of thinking and its four views — and sends every
            turn to one route, <code>/api/logos/chat</code>. That route decides, in code, how much to do: some turns need no model at all, most need one reply,
            and a few are checked against evidence before they are sent. Everything that is kept is kept in Supabase; nothing about a person is inferred into a
            label.
          </p>
          <SystemDiagram />
          <p className="l5i-note">
            <b>Six subsystems, not six agents.</b> Each is a pure function over the turn and the workspace, called in sequence by the route. They decide; the model
            writes.
          </p>
        </Sec>

        <Sec id="turn" n={2} title="A turn, end to end">
          <p>The chat route runs these steps in this order. Grey steps can end the turn early; green ones decide; the model is called once.</p>
          <figure className="l5i-fig" aria-labelledby="fig-turn">
            <ol className="l5i-turn">
              {TURN.map((t, i) => (
                <li key={t.step} className={`l5i-k-${t.kind}`}>
                  <span className="l5i-turn-n">{i + 1}</span>
                  <div>
                    <b>{t.step}</b>
                    <p>{t.what}</p>
                    <code>{t.where}</code>
                  </div>
                </li>
              ))}
            </ol>
            <figcaption id="fig-turn">The order of work in app/api/logos/chat/route.ts.</figcaption>
          </figure>
          <div className="l5i-legend" aria-hidden="true">
            <span className="l5i-k-gate">boundary</span>
            <span className="l5i-k-read">read</span>
            <span className="l5i-k-decide">decide (no model)</span>
            <span className="l5i-k-model">model</span>
            <span className="l5i-k-out">out</span>
            <span className="l5i-k-after">after the stream</span>
          </div>
        </Sec>

        <Sec id="runtime" n={3} title="The runtime">
          <p>
            <code>lib/runtime/</code> holds the six subsystems. Each takes what the one before it decided and adds one thing. None of them calls a model.
          </p>
          <figure className="l5i-fig" aria-labelledby="fig-runtime">
            <div className="l5i-runtime">
              {RUNTIME.map((r, i) => (
                <div key={r.name} className="l5i-rt">
                  <p className="l5i-rt-n">{i + 1}</p>
                  <b>{r.name}</b>
                  <code>{r.file}</code>
                  <p>
                    <span>in</span> {r.in}
                  </p>
                  <p>
                    <span>out</span> {r.out}
                  </p>
                </div>
              ))}
            </div>
            <figcaption id="fig-runtime">The runtime’s six subsystems, in the order the route calls them.</figcaption>
          </figure>
          <ul className="l5i-list">
            <li>
              <b>State is derived, never stored.</b> The objective, the domain (business, research, engineering, writing, learning, creative, mathematics,
              everyday), open questions and assumptions from the map’s digest, their own stated preferences, progress. Nothing about health, beliefs or identity is
              inferred.
            </li>
            <li>
              <b>Representation is an index, not a second store.</b> Conversations, messages, documents and passages, artifacts, map nodes and writing get stable ids
              (<code>conv:</code>, <code>doc:</code>, <code>blk:</code>, <code>node:</code>…) with provenance and links. Search, the Content view and provenance chips
              read it, so it cannot drift from the data.
            </li>
          </ul>
        </Sec>

        <Sec id="paths" n={4} title="Paths and models">
          <div className="l5i-table-wrap">
            <table className="l5i-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Cost</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {PATHS.map(([p, c, w]) => (
                  <tr key={p}>
                    <td>
                      <b>{p}</b>
                    </td>
                    <td>{c}</td>
                    <td>{w}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <b>The map pass</b> runs on a structure or build request, while the Logic Map is the open view, on opening a map older than the conversation, and in the
            background once a line of thinking has three substantive turns, then every fourth. <b>Models</b> come from one table: the reply on{' '}
            <code>OPENAI_MODEL_LOGOS</code>, the map on <code>OPENAI_MODEL_LOGOS_MAP</code>, memory extraction and titles on a small model. The reply’s ceiling
            follows their one setting — Concise, Balanced, Detailed: 480, 700 or 1,200 tokens.
          </p>
        </Sec>

        <Sec id="allocation" n={5} title="Allocation">
          <p>
            Allocation decides who owns each part of the work. It is Core 4’s split and Core 4’s allocator, run over the conversation the client already sends:
            each of their messages is replayed through Core 4’s own <code>mergeState</code>, <code>allocate</code> and <code>recordTurn</code>, with deterministic
            readers in place of Core 4’s model reader. Same rules, same code, nothing written.
          </p>
          <div className="l5i-three">
            <div>
              <b>Socria does</b>
              <span>calculations (computed, never recalled), formatting, retrieval, explanations of established facts</span>
            </div>
            <div>
              <b>Socria supports</b>
              <span>reasoning — a hint and a check when they are learning, the full answer when they are not</span>
            </div>
            <div>
              <b>Theirs</b>
              <span>consequential decisions, and the substance of writing that will be theirs</span>
            </div>
          </div>
          <ul className="l5i-list">
            <li>
              <b>Withholding needs their words.</b> A withhold is rendered as <code>KEEP WITH THEM</code>, <code>BECAUSE THEY SAID</code> (a quote — Core 4 will not
              withhold without one) and <code>THEY CAN HAVE</code> (the alternative). An inference never withholds anything.
            </li>
            <li>
              <b>The ladder.</b> Earlier attempts are decided again by the maths engine, so someone genuinely stuck reaches a worked explanation instead of endless
              hints.
            </li>
            <li>
              <b>Graded stays graded.</b> Once they say work is graded, it rides on every later request for the answer, until they say it is not.
            </li>
            <li>
              <b>No computed answer reaches a turn that is holding it back</b>: the accuracy plan is drawn again with the result withheld.
            </li>
          </ul>
        </Sec>

        <Sec id="mr" n={6} title="Metacognitive Regulation">
          <p>
            MR reads how the person wants to be helped — from their own words and the course of the conversation — and issues a <b>typed, scoped, expiring</b>{' '}
            decision that the runtime enforces in code. Most turns it decides nothing. It is <b>on by default</b> (<code>LOGOS_MR=off</code> turns it off for a
            deployment) and each person can switch it off in their settings.
          </p>
          <PrecedenceDiagram />
          <LoopDiagram />
          <ul className="l5i-list">
            <li>
              <b>The decision contract.</b> Policy version, intervention id, trigger, evidence references, target, typed controls (question budget, verbosity
              ceiling, strategy, scaffolding, answer first, no reveal), scope, expiry, confidence, evaluation plan, rollback.
            </li>
            <li>
              <b>Enforced, not suggested.</b> A “stop asking” is a hard filter on the reply, sentence by sentence; “shorter” lowers <code>max_tokens</code>; the
              strategy narrows the allocation’s move. What can only be asked of the model is measured after the reply, never assumed.
            </li>
            <li>
              <b>What starts an adjustment is read strictly; what ends one, generously.</b> A false start changes how someone is helped who asked for nothing; a
              missed ending keeps an old instruction in force against their newest words.
            </li>
            <li>
              <b>“From now on.”</b> Carried into other conversations only with their consent, and in force until they take it back. A quiz or a request for
              questions lifts it in that conversation only.
            </li>
            <li>
              <b>Recorded without content.</b> The ledger holds codes, ids and times — never a sentence — for 180 days; going off the record or incognito records
              nothing.
            </li>
          </ul>
        </Sec>

        <Sec id="evidence" n={7} title="Evidence and checks">
          <p>
            Before the reply, Epistemic Control names the kind of claim the turn asks for (a fact, a current fact, a figure, a reading of their documents, a
            calculation, an opinion, a creative task) and collects the evidence there is, each piece with an id: <code>[A3.12]</code> for a passage,{' '}
            <code>[W2]</code> for a web source. The reply may cite only those.
          </p>
          <ul className="l5i-list">
            <li>While it streams, a citation to evidence never given, or a link no source carried, is removed.</li>
            <li>
              After it, figures in a factual answer are checked against the evidence and claims are labelled <b>supported</b>, <b>qualified</b>, <b>unverified</b>{' '}
              or <b>contradicted</b>; conflicting sources are named.
            </li>
            <li>
              A contradicted or fabricated claim triggers one corrective retry on a held turn, or a plain correction after a streamed one. Brainstorming and creative
              work are not gated: the checks are for claims of fact.
            </li>
          </ul>
        </Sec>

        <Sec id="prompt" n={8} title="The prompt">
          <PromptDiagram />
          <p>
            The Logos 5 core is short: who Socria is, how it speaks, how it handles questions, disagreement, uncertainty, incomplete requests and memory. The voice is
            a capable colleague’s — direct, warm, practical, honest — and an incomplete request is met with a concrete start, not a demand for more information.
            The blocks that change per turn (maths, documents, the picture, building a model, the guard, MR) go after the history.
          </p>
        </Sec>

        <Sec id="stream" n={9} title="The stream gate">
          <StreamDiagram />
        </Sec>

        <Sec id="workspace" n={10} title="The workspace">
          <ScreenDiagram />
          <div className="l5i-table-wrap">
            <table className="l5i-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>The turn is</th>
                  <th>The screen</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map(([r, t, s]) => (
                  <tr key={r}>
                    <td>
                      <b>{r}</b>
                    </td>
                    <td>{t}</td>
                    <td>{s}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            The client and the server call the same reader (<code>routeTurn</code>), so the view that opens and the work that runs cannot disagree. Search indexes
            the representation layer and opens a result where it lives. Loading shows only milestones that happened: files read, sent, sources found, writing the
            reply, drawing the map.
          </p>
        </Sec>

        <Sec id="memory" n={11} title="Memory">
          <p>
            The Mind Graph is the one store of what Socria remembers about a person, and <b>an inference never silently becomes a fact</b> — in code, not only in
            the extractor’s instructions.
          </p>
          <ul className="l5i-list">
            <li>
              <b>Stated means said.</b> A claim labelled stated must be carried by the person’s own words in that turn, with the same polarity. Otherwise it is
              stored as Socria’s reading and waits for a second conversation.
            </li>
            <li>
              <b>A file is not the person.</b> Knowledge in a file is researched; a claim about them from a file stays tentative.
            </li>
            <li>
              <b>Recall says where each memory came from</b> — <code>[said]</code>, <code>[confirmed]</code>, <code>[file]</code>, <code>[source]</code>,{' '}
              <code>[reading]</code> — and the reply is told never to present a reading as something they said.
            </li>
            <li>
              <b>They can confirm, edit and dispute.</b> Once they have, extraction reinforces a memory but never rewords it.
            </li>
            <li>
              <b>Private and incognito.</b> A private conversation never corroborates a claim elsewhere; an incognito one is never remembered.
            </li>
          </ul>
        </Sec>

        <Sec id="data" n={12} title="Data">
          <div className="l5i-table-wrap">
            <table className="l5i-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Holds their text?</th>
                  <th>For</th>
                </tr>
              </thead>
              <tbody>
                {DATA.map(([t, h, f]) => (
                  <tr key={t}>
                    <td>
                      <code>{t}</code>
                    </td>
                    <td>{h}</td>
                    <td>{f}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Every table is covered by row-level security, account export and account deletion (held by the privacy suites). Shared lines of thinking, rooms, guests
            and incognito conversations write no per-person memory or MR rows.
          </p>
        </Sec>

        <Sec id="switches" n={13} title="Switches and rollback">
          <div className="l5i-table-wrap">
            <table className="l5i-table">
              <thead>
                <tr>
                  <th>Switch</th>
                  <th>Default</th>
                  <th>Otherwise</th>
                </tr>
              </thead>
              <tbody>
                {SWITCHES.map(([s, d, o]) => (
                  <tr key={s}>
                    <td>
                      <code>{s}</code>
                    </td>
                    <td>{d}</td>
                    <td>{o}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Each switch is read per request, so rolling back is an environment change, not a deploy of older code. No stored row is rewritten by any of them.</p>
        </Sec>

        <Sec id="measured" n={14} title="Measured and tested">
          <ul className="l5i-list">
            <li>
              <b>273 test suites</b> run on every change: the runtime’s modules, the real chat route through fake models and databases, the screen through jsdom,
              privacy coverage of every table, and 14 suites for MR.
            </li>
            <li>
              <b>Cost per interaction</b> (<code>evals/logos5/measure.mjs</code>): calls by purpose, input tokens, and the cacheable prefix, over a scripted
              ten-turn conversation.
            </li>
            <li>
              <b>Behaviour</b> (<code>evals/logos5/run.mjs</code>, with an API key): 31 scenarios graded without a judge model — answering rather than withholding,
              no invented memory or sources, the view chosen, the voice on social turns.
            </li>
            <li>
              <b>MR’s benchmark</b> (<code>evals/mr/run.mjs</code>): against a simulated assistant, unnecessary questions 1.00 → 0.00 per scenario and compliance
              with their own instructions 0.33 → 1.00 for a question-prone model. About the control plane, not about people or a real model.
            </li>
          </ul>
        </Sec>

        <Sec id="limits" n={15} title="Known limits">
          <ul className="l5i-list">
            <li>The instruction readers (MR’s and the runtime’s) are English sentence patterns with documented misses.</li>
            <li>How a real model follows the prompt-level controls has not been measured live here.</li>
            <li>MR’s ledger needs its migration applied by hand; until then MR regulates from the transcript and writes nothing.</li>
            <li>
              The core stream gate splits a code block that arrives in pieces; the text reaching the person is the same unless something in between changes it.
            </li>
            <li>The full lists are in docs/LOGOS-5-RUNTIME.md §9 and docs/MR.md §10.</li>
          </ul>
        </Sec>

        <Sec id="sources" n={16} title="Where things live">
          <div className="l5i-table-wrap">
            <table className="l5i-table">
              <tbody>
                {SOURCES.map(([a, b]) => (
                  <tr key={a}>
                    <td>
                      <b>{a}</b>
                    </td>
                    <td>
                      <code>{b}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>
      </main>
      <footer className="l5i-foot">Socria · internal architecture note · the reference documents in docs/ are the source of truth.</footer>
    </div>
  );
}
