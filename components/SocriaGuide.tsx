'use client';

// components/SocriaGuide.tsx — WHAT SOCRIA DOES: short tutorials, one at a time.
//
// Reached from the ⋯ menu. It replaces the old walk through what Logos could
// do (Logos 2 and 3's map, cards, "+ View" and Draft), which described a
// screen that no longer exists. These are the screen as it is: the Universal
// Map, a line of thinking and its four views, Split View and the conversation
// on any side, Make, your own material, Write, Quick capture, search, voice
// and words, and Memory — each shown working in miniature (the brand book:
// show the working surface), told in three steps, with the limit said in the
// same breath as the capability, and, where it can be, a way to try it now.
//
// Set by the brand book: warm paper, moss, ink at its strengths; Instrument
// Serif for what is said, Inter for what is operated; the contents set like
// the book's own, each tutorial opened like a spread (a roman numeral in moss
// italic, its name as a micro-label); hairlines, not cards; the one forward
// action a pill, the optional one a serif-italic link on a moss rule; motion
// that settles, and none at all with reduced motion.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './socria-guide.css';

/** Kept from the walk this replaced: set when it is closed. */
export const GUIDE_SEEN_KEY = 'socria.logos.guide.v1';

/** What a tutorial can let them try, done by the press it stands for. */
export interface GuideActions {
  onHome?: () => void;
  onNew?: () => void;
  onSearch?: () => void;
  onCapture?: () => void;
  onWrite?: () => void;
  onMemory?: () => void;
}

export interface Tutorial {
  id: string;
  /** its name in the contents and on its spread */
  name: string;
  title: ReactNode;
  stand: string;
  steps: ReactNode[];
  /** the limit, said where the capability is */
  note?: string;
  demo: ReactNode;
  try?: { label: string; run: keyof GuideActions };
  /** part of Socria One where the plan does not include it */
  one?: boolean;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const WORDS = [
  'No things',
  'One thing',
  'Two things',
  'Three things',
  'Four things',
  'Five things',
  'Six things',
  'Seven things',
  'Eight things',
  'Nine things',
  'Ten things',
  'Eleven things',
  'Twelve things',
];

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '');

/** A delay for one piece of a demo, in seconds. */
const at = (d: number) => ({ ['--d' as string]: `${d}s` });

// ── the demos: each a working surface in miniature ─────────────────────

const HomeDemo = (
  <div className="sg-d sg-d-home">
    <div className="sg-lens" aria-hidden="true">
      <span className="is-on">Today</span>
      <span>This week</span>
      <span>This month</span>
      <span>All time</span>
    </div>
    <svg className="sg-home-map" viewBox="0 0 360 150" aria-hidden="true">
      <circle className="sg-ring" cx="108" cy="76" r="58" style={at(0.1)} />
      <circle className="sg-ring" cx="262" cy="72" r="50" style={at(0.3)} />
      <path className="sg-curve" d="M160 64 C 190 40, 214 44, 226 52" style={at(1.1)} />
      <line className="sg-spoke" x1="108" y1="76" x2="70" y2="40" style={at(0.9)} />
      <line className="sg-spoke" x1="108" y1="76" x2="146" y2="112" style={at(1)} />
      <line className="sg-spoke" x1="262" y1="72" x2="300" y2="104" style={at(1.05)} />
      <circle className="sg-disc" cx="108" cy="76" r="17" style={at(0.45)} />
      <circle className="sg-disc is-b" cx="262" cy="72" r="15" style={at(0.6)} />
      <circle className="sg-dot" cx="70" cy="40" r="4" style={at(1)} />
      <circle className="sg-dot" cx="146" cy="112" r="4" style={at(1.1)} />
      <circle className="sg-dot" cx="300" cy="104" r="4" style={at(1.15)} />
    </svg>
    <span className="sg-home-l sg-in" style={{ ...at(0.7), left: '8%', top: '74%' }}>
      Biology – Exam Review
    </span>
    <span className="sg-home-l sg-in" style={{ ...at(0.85), left: '61%', top: '20%' }}>
      Austin or Dallas
    </span>
    <div className="sg-findbox sg-in" style={at(1.4)}>
      Find, or start something new…
    </div>
  </div>
);

const StartDemo = (
  <div className="sg-d sg-d-start">
    <div className="sg-you">
      <span className="sg-type" style={at(0.2)}>
        I can’t tell if I want this job or just the idea of it.
      </span>
    </div>
    <p className="sg-reply sg-in" style={at(2.1)}>
      You said “the idea of it” — what would the job itself have to be, for that to be enough?
    </p>
    <p className="sg-said sg-in" style={at(2.9)}>
      You ask → it asks back → you see your thinking
    </p>
  </div>
);

const ViewsDemo = (
  <div className="sg-d sg-d-views">
    <div className="sg-tabs" aria-hidden="true">
      <span>Chat</span>
      <span>Content</span>
      <span>Artifacts</span>
      <span>Logic Map</span>
      <i className="sg-tabline" />
    </div>
    <div className="sg-panes" aria-hidden="true">
      <div className="sg-pane" style={at(0)}>
        <span className="sg-bubble">Make a chart of my month</span>
        <span className="sg-line w80" />
        <span className="sg-line w60" />
      </div>
      <div className="sg-pane" style={at(1)}>
        <span className="sg-card">lecture-3.pdf</span>
        <span className="sg-card">notes.docx</span>
        <span className="sg-card">whiteboard.jpg</span>
      </div>
      <div className="sg-pane" style={at(2)}>
        <span className="sg-bars">
          <i style={{ height: '82%' }} />
          <i style={{ height: '34%' }} />
          <i style={{ height: '18%' }} />
        </span>
      </div>
      <div className="sg-pane is-last" style={at(3)}>
        <span className="sg-node">Rent is fixed</span>
        <span className="sg-node is-q">Which costs can move?</span>
        <span className="sg-node is-t">Freedom vs. security</span>
      </div>
    </div>
  </div>
);

const SplitDemo = (
  <div className="sg-d sg-d-split">
    <div className="sg-screen" aria-hidden="true">
      <div className="sg-screen-bar">
        <i />
        <i />
        <i />
      </div>
      <div className="sg-screen-body">
        <span className="sg-bars is-wide">
          <i style={{ height: '70%' }} />
          <i style={{ height: '42%' }} />
          <i style={{ height: '88%' }} />
          <i style={{ height: '30%' }} />
        </span>
        <div className="sg-convo">
          <span className="sg-convo-h">
            <b>⠿</b> Conversation
          </span>
          <span className="sg-line w70" />
          <span className="sg-line w50" />
          <span className="sg-convo-box" />
        </div>
      </div>
    </div>
    <p className="sg-said sg-in" style={at(0.4)}>
      Dragged to an edge · or a side pressed · or “put the chat on the left”
    </p>
  </div>
);

const MakeDemo = (
  <div className="sg-d sg-d-make">
    <div className="sg-tiles" aria-hidden="true">
      <span className="sg-tile is-pick" style={at(0.1)}>
        <span className="sg-bars is-mini">
          <i style={{ height: '80%' }} />
          <i style={{ height: '45%' }} />
          <i style={{ height: '25%' }} />
        </span>
        Chart
      </span>
      <span className="sg-tile" style={at(0.2)}>
        <span className="sg-grid" />
        Comparison
      </span>
      <span className="sg-tile" style={at(0.3)}>
        <span className="sg-time" />
        Timeline
      </span>
      <span className="sg-tile" style={at(0.4)}>
        <span className="sg-ticks" />
        Checklist
      </span>
    </div>
    <div className="sg-made sg-in" style={at(1.3)} aria-hidden="true">
      <span className="sg-made-l">Monthly costs · Chart</span>
      <span className="sg-bars is-made">
        <i style={{ height: '86%', ...at(1.7) }} />
        <i style={{ height: '30%', ...at(1.85) }} />
        <i style={{ height: '12%', ...at(2) }} />
      </span>
      <span className="sg-made-k">
        <em>Rent</em>
        <em>Food</em>
        <em>Transport</em>
      </span>
    </div>
  </div>
);

const ContentDemo = (
  <div className="sg-d sg-d-content">
    <div className="sg-files" aria-hidden="true">
      <span className="sg-file sg-drop" style={at(0.1)}>
        lecture-3.pdf <em>14 pages</em>
      </span>
      <span className="sg-file sg-drop" style={at(0.35)}>
        notes.docx <em>2,100 words</em>
      </span>
      <span className="sg-file sg-drop" style={at(0.6)}>
        whiteboard.jpg <em>read</em>
      </span>
    </div>
    <p className="sg-micro sg-in" style={at(1.2)}>
      Sorted into topics, in their own words
    </p>
    <div className="sg-topics" aria-hidden="true">
      <span className="sg-topic sg-in" style={at(1.4)}>
        Supply and demand
      </span>
      <span className="sg-topic is-start sg-in" style={at(1.55)}>
        Elasticity <b>start here</b>
      </span>
      <span className="sg-topic sg-in" style={at(1.7)}>
        Price controls
      </span>
    </div>
  </div>
);

const WriteDemo = (
  <div className="sg-d sg-d-write">
    <div className="sg-page" aria-hidden="true">
      <span className="sg-page-h">The case for staying</span>
      <p>
        For most of the year I described what I want as independence, <mark style={at(0.6)}>and said it in a way that sounded settled.</mark>
      </p>
      <span className="sg-line w90" />
      <span className="sg-line w70" />
    </div>
    <div className="sg-panel sg-in" style={at(1)} aria-hidden="true">
      <span className="sg-panel-h">Socria</span>
      <span>Check</span>
      <span className="is-on">Improve</span>
      <span>Think it through</span>
    </div>
    <div className="sg-edit sg-in" style={at(1.8)} aria-hidden="true">
      <s>sounded settled</s> <span>was still a guess</span>
      <span className="sg-edit-acts">
        <b>Accept</b> <i>Keep mine</i>
      </span>
    </div>
  </div>
);

const CaptureDemo = (
  <div className="sg-d sg-d-capture">
    <p className="sg-micro">Quick capture</p>
    <div className="sg-capbox" aria-hidden="true">
      <span className="sg-type" style={at(0.2)}>
        Call the landlord before Friday
      </span>
    </div>
    <div className="sg-capitem sg-in" style={at(1.7)} aria-hidden="true">
      <span className="sg-micro">Today · 9:41 AM</span>
      <span className="sg-captext">Call the landlord before Friday</span>
      <span className="sg-capgo">Think it through →</span>
    </div>
  </div>
);

const SearchDemo = (
  <div className="sg-d sg-d-search">
    <div className="sg-searchbox" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4.2-4.2" />
      </svg>
      <span className="sg-type is-short" style={at(0.2)}>
        rent
      </span>
      <kbd>{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
    </div>
    <ul className="sg-results" aria-hidden="true">
      {[
        ['“…rent is most of it — three times the next cost…”', 'Chat'],
        ['lease-terms.pdf · the clause on renewal', 'Content'],
        ['Monthly costs · a chart', 'Artifacts'],
        ['Rent is fixed', 'Logic Map'],
      ].map(([t, w], i) => (
        <li key={t} className="sg-in" style={at(0.9 + i * 0.12)}>
          <span>{t}</span>
          <em>{w}</em>
        </li>
      ))}
    </ul>
  </div>
);

const VoiceDemo = (
  <div className="sg-d sg-d-voice">
    <div className="sg-mic" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3.5" width="6" height="11" rx="3" />
        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
      </svg>
      <span className="sg-level">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="sg-micro">Hold to talk</span>
    </div>
    <p className="sg-heard" aria-hidden="true">
      {['open', 'the', 'logic', 'map'].map((w, i) => (
        <span key={w} className="sg-in" style={at(0.5 + i * 0.28)}>
          {w}{' '}
        </span>
      ))}
    </p>
    <p className="sg-reply sg-in" style={at(2)}>
      Opened the Logic Map.
    </p>
    <span className="sg-exp sg-in" style={at(2.4)}>
      Experimental
    </span>
  </div>
);

const MemoryDemo = (
  <div className="sg-d sg-d-memory">
    {[
      ['Work', 'Weighing a job in Austin against staying in Dallas', 'From “Austin or Dallas” · Oct 28'],
      ['Goals', 'Wants a year that builds something of their own', 'From “What next?” · Oct 12'],
      ['Learning', 'Studying for a biology exam on cell transport', 'From “Biology – Exam Review” · Oct 30'],
    ].map(([r, t, w], i) => (
      <div key={r} className="sg-mem sg-in" style={at(0.2 + i * 0.25)} aria-hidden="true">
        <span className="sg-micro">{r}</span>
        <span className="sg-memtext">{t}</span>
        <span className="sg-memfrom">
          {w}
          <i>Edit · This isn’t right · Forget</i>
        </span>
      </div>
    ))}
  </div>
);

// ── the tutorials ─────────────────────────────────────────────────────

/** The tutorials, in the order they are met: Quick capture only where it is on; Memory says when it needs an account. */
export function socriaTutorials(o: { capture: boolean; memory: boolean }): Tutorial[] {
  const k = isMac() ? '⌘K' : 'Ctrl K';
  const all: (Tutorial | null)[] = [
    {
      id: 'home',
      name: 'The Universal Map',
      title: (
        <>
          Everything you’ve thought through, on <em>one</em> map.
        </>
      ),
      stand: 'Socria opens on the Universal Map. Every line of thinking you have had is on it — the long sessions larger, quick questions small beside them.',
      steps: [
        <>Choose how much to see, top right: Today, This week, This month or All time.</>,
        <>Press a line of thinking for its card; press again, or Continue, to open it.</>,
        <>Type in the box at the foot to find something — or to start something new.</>,
      ],
      note: 'This month and All time are drawn as a line through time, the oldest on the left.',
      demo: HomeDemo,
      try: { label: 'Open the Universal Map', run: 'onHome' },
    },
    {
      id: 'start',
      name: 'A line of thinking',
      title: (
        <>
          Say what you’re working <em>through</em>.
        </>
      ),
      stand:
        'Socria’s first move is a question. It reflects back something specific in what you said and asks what opens it up — the answer still arrives, after you have found the shape of your own argument.',
      steps: [
        <>Type it in the box — or hold the mic and say it.</>,
        <>Enter sends; Shift + Enter starts a new line.</>,
        <>Reply as you would to a person. Each line of thinking keeps its own map, content and artifacts.</>,
      ],
      demo: StartDemo,
      try: { label: 'Start a new line of thinking', run: 'onNew' },
    },
    {
      id: 'views',
      name: 'Four views',
      title: (
        <>
          One line of thinking, <em>four</em> ways to see it.
        </>
      ),
      stand: 'Chat is where it opens. Content holds what you brought, Artifacts what was made, and the Logic Map your own ideas — in the shape your thinking takes.',
      steps: [
        <>Switch with the tabs under the title, or the arrow keys once a tab has focus.</>,
        <>Ask for a chart and Artifacts opens; ask for the structure and the Logic Map does — with the conversation beside it.</>,
        <>A dot on a tab means something new arrived there.</>,
      ],
      note: 'Everything on the Logic Map is something you said. Nothing on it is Socria’s opinion.',
      demo: ViewsDemo,
    },
    {
      id: 'split',
      name: 'Split View',
      title: (
        <>
          Two views side by side — the conversation <em>wherever</em> you want it.
        </>
      ),
      stand: 'Split View opens a second view beside the one you are in. The conversation docks on the side you choose — left, right, top or bottom — and stays there.',
      steps: [
        <>Press Split View, top right, and pick what goes beside.</>,
        <>Drag the conversation by its header to any edge, or press one of its four side buttons.</>,
        <>Or say it: “put the chat on the left”.</>,
      ],
      note: 'A phone shows one view at a time, so there is nothing to place there.',
      demo: SplitDemo,
    },
    {
      id: 'make',
      name: 'Make',
      title: (
        <>
          Choose what to make, <em>then</em> say what it’s about.
        </>
      ),
      stand: 'A chart, a comparison, a timeline, a study plan, a checklist, a flowchart — each drawn as it will be before you pick it, and made from your words.',
      steps: [<>Press Make, under the box.</>, <>Pick one from the gallery — or one of your own, under Yours.</>, <>Say what it is about. What is made is kept in Artifacts.</>],
      note: 'The templates you save are kept on this device.',
      demo: MakeDemo,
    },
    {
      id: 'content',
      name: 'Your material',
      title: (
        <>
          Bring your <em>own</em> material.
        </>
      ),
      stand: 'Documents, notes and pictures are read into Content. Files are sorted into topics in their own words, and practice is made from them when you ask.',
      steps: [
        <>Press the paperclip, or drop files on the box.</>,
        <>Open Content: each one is a card — drag to arrange, drop one on another to stack them.</>,
        <>Ask about any of it in the conversation, or ask for practice from it.</>,
      ],
      note: 'Your documents are never changed.',
      demo: ContentDemo,
    },
    {
      id: 'write',
      name: 'Write',
      title: (
        <>
          Your page — Socria only when you <em>ask</em>.
        </>
      ),
      stand:
        'A word processor beside your thinking. Select your own words and ask Socria to check them, improve them, or think them through with you. Nothing reaches the page unless you put it there.',
      steps: [
        <>Open Write from the ⋯ menu, or Start writing in Artifacts.</>,
        <>Write as you would anywhere — headings, tables, pictures; Word and PDF out.</>,
        <>Open the Socria panel for Check, Improve or Think it through.</>,
      ],
      demo: WriteDemo,
      try: { label: 'Open Write', run: 'onWrite' },
      one: true,
    },
    o.capture
      ? {
          id: 'capture',
          name: 'Quick capture',
          title: (
            <>
              Keep a thought for <em>later</em>.
            </>
          ),
          stand: 'Two taps: open it, and save. A photo is one more. Nothing is sent or filed until you choose.',
          steps: [
            <>Open Quick capture from the ⋯ menu, or the + beside the box.</>,
            <>Or start any message with “capture:” — it is kept, not sent.</>,
            <>Later: think it through, add it to the map, or use it in a message.</>,
          ],
          demo: CaptureDemo,
          try: { label: 'Open Quick capture', run: 'onCapture' },
        }
      : null,
    {
      id: 'search',
      name: 'Search',
      title: (
        <>
          Find anything you’ve <em>thought</em>.
        </>
      ),
      stand: 'One search across every line of thinking — what was said, your documents and their passages, artifacts, your writing, the ideas on your maps — each opened where it lives.',
      steps: [
        <>Press {k} from anywhere, or the search bar at the top.</>,
        <>Type a few words; a slip in a word is forgiven.</>,
        <>Pick a result: a turn is scrolled to, a passage selected, an idea lit on its map.</>,
      ],
      demo: SearchDemo,
      try: { label: 'Open search', run: 'onSearch' },
    },
    {
      id: 'voice',
      name: 'Say it',
      title: (
        <>
          Say it <em>instead</em>.
        </>
      ),
      stand: 'Hold the mic to talk instead of typing. Socria Voice lets you think out loud — and run the workspace in words, spoken or typed.',
      steps: [
        <>Hold the mic, speak, let go: your words land in the box.</>,
        <>Press Voice for a spoken conversation.</>,
        <>Say — or type — what you would press: “open the Logic Map”, “save the map as an image”, “hide the bars”.</>,
      ],
      note: 'Socria Voice is experimental. It can mishear, so anything that cannot be undone asks first.',
      demo: VoiceDemo,
    },
    {
      id: 'memory',
      name: 'Memory',
      title: (
        <>
          See what Socria <em>remembers</em> — and why.
        </>
      ),
      stand: 'As you think things through, what Socria learns about you gathers in Memory, each piece with where it was learned — yours to edit, correct or forget.',
      steps: [<>Open Memory from your account, top right.</>, <>Look through it as a network, what changed, and what waits for your review.</>, <>Correct anything that is not right, or forget it.</>],
      note: o.memory ? 'Memory is kept with your account, not in this browser.' : 'Memory is kept for an account — sign in to have one.',
      demo: MemoryDemo,
      try: { label: 'Open Memory', run: 'onMemory' },
    },
  ];
  return all.filter((t): t is Tutorial => !!t);
}

// ── the guide ─────────────────────────────────────────────────────────

export function SocriaGuide({
  open,
  onClose,
  actions = {},
  writeIncluded = true,
  capture = true,
  memory = true,
}: {
  open: boolean;
  onClose: () => void;
  actions?: GuideActions;
  /** Write is in their plan; when it is not, its tutorial says it is part of Socria One */
  writeIncluded?: boolean;
  /** Quick capture is on in this deployment */
  capture?: boolean;
  /** signed in: Memory is theirs to open */
  memory?: boolean;
}) {
  const list = useMemo(() => socriaTutorials({ capture, memory }), [capture, memory]);
  const [i, setI] = useState(0);
  const [toc, setToc] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const backTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setI(0);
    setToc(false);
    backTo.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => root.current?.focus());
    return () => {
      backTo.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]');
      if (e.key === 'Escape') {
        e.preventDefault();
        if (toc) setToc(false);
        else onClose();
        return;
      }
      if (typing) return;
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, list.length - 1));
      else if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0));
      else if (e.key === 'Home') setI(0);
      else if (e.key === 'End') setI(list.length - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, toc, list.length]);

  if (!open) return null;
  const t = list[Math.min(i, list.length - 1)];
  const n = list.indexOf(t);
  const last = n === list.length - 1;
  const run = t.try ? actions[t.try.run] : undefined;
  const go = (to: number) => {
    setI(to);
    setToc(false);
  };

  return (
    <div className="sg-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={root} className={`sg${toc ? ' is-toc' : ''}`} role="dialog" aria-modal="true" aria-labelledby="sg-title" tabIndex={-1}>
        {/* THE CONTENTS: set like the book's own */}
        <nav className="sg-toc" aria-label="Tutorials">
          <div className="sg-toc-head">
            <p className="sg-lbl">What Socria does</p>
            <button type="button" className="sg-toc-close" onClick={() => setToc(false)} aria-label="Back to the tutorial">
              ×
            </button>
            <p className="sg-toc-title">{WORDS[list.length] ?? `${list.length} things`}, in the order you’ll meet them.</p>
          </div>
          <ol className="sg-toc-list" style={{ ['--read' as string]: `${((n + 1) / list.length) * 100}%` }}>
            {list.map((x, k) => (
              <li key={x.id}>
                <button type="button" className={`sg-toc-b${k === n ? ' is-on' : ''}`} aria-current={k === n ? 'step' : undefined} onClick={() => go(k)}>
                  <span className="sg-toc-n">{String(k + 1).padStart(2, '0')}</span>
                  <span className="sg-toc-t">{x.name}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="sg-toc-foot">You ask — it asks back — you see your thinking.</p>
        </nav>

        {/* THE SPREAD: one tutorial */}
        <section className="sg-spread">
          <p className="sg-sr" aria-live="polite">
            {`${n + 1} of ${list.length}: ${t.name}`}
          </p>
          <header className="sg-head">
            <button type="button" className="sg-tocbtn" onClick={() => setToc(true)} aria-label="All tutorials">
              {ROMAN[n] ?? n + 1} of {ROMAN[list.length - 1] ?? list.length}
            </button>
            <p className="sg-spreadhead">
              <span className="sg-num">{ROMAN[n] ?? n + 1}</span>
              <span className="sg-lbl">{t.name}</span>
              {t.one && !writeIncluded && <span className="sg-one">Socria One</span>}
            </p>
            <button type="button" className="sg-x" onClick={onClose} aria-label="Close the tutorials">
              ×
            </button>
          </header>

          {/* keyed on the tutorial, so it comes in afresh and its demo plays from the top */}
          <div className="sg-body" key={t.id}>
            <h2 id="sg-title" className="sg-title">
              {t.title}
            </h2>
            <p className="sg-stand">{t.stand}</p>
            <div className="sg-work">
              <figure className="sg-plate" aria-label={`${t.name}, shown in miniature`}>
                {t.demo}
              </figure>
              <div className="sg-how">
                <ol className="sg-steps">
                  {t.steps.map((s, k) => (
                    <li key={k} style={at(0.35 + k * 0.12)}>
                      <span className="sg-step-n">{k + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
                {t.note && <p className="sg-note">{t.note}</p>}
                {t.one && !writeIncluded && <p className="sg-note">Part of Socria One.</p>}
                {t.try && run && (
                  <button
                    type="button"
                    className="sg-try"
                    onClick={() => {
                      onClose();
                      run();
                    }}
                  >
                    {t.try.label} <span aria-hidden="true">→</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <footer className="sg-foot">
            <span className="sg-progress" aria-hidden="true">
              <i style={{ width: `${((n + 1) / list.length) * 100}%` }} />
            </span>
            <span className="sg-count">
              {n + 1} of {list.length}
            </span>
            <span className="sg-grow" />
            {n > 0 && (
              <button type="button" className="sg-back" onClick={() => go(n - 1)}>
                Back
              </button>
            )}
            <button type="button" className="sg-next" onClick={() => (last ? onClose() : go(n + 1))}>
              {last ? 'Start thinking' : 'Next'} <span aria-hidden="true">→</span>
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}
