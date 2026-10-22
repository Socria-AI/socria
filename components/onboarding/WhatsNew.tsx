'use client';
// components/onboarding/WhatsNew.tsx
//
// "WE KILLED THE CHATBOT." — what changed, told once, to somebody who used
// Socria before the map (lib/first-run.ts wantsWhatsNew decides who).
//
// Three beats, each one sentence and a drawing that does what the sentence
// says. Nothing to answer, nothing to fill in:
//
//   killed   the chat window is gone and nothing in it was lost — the drawing
//            folds a conversation into the map, bubble by bubble
//   map      how to read it: subjects as circles, conversations as discs, a
//            link you made as a dashed line; the lenses at the top, Today and
//            This week as a map, This month and All time as a line through time
//   box      everything starts in the one box at the foot — ask, or drop your
//            notes in and they are sorted onto the map — and Projects are on it
//
// Over the map it lifts away on the last beat to show the real one; over
// Core's chat the last beat is the way there. Skip, or Esc, at any point:
// either way it is never shown again, on any device (`socria.new`).

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { readName } from '@/lib/onboarding-name';
import { track } from '@/lib/analytics';
import './whats-new.css';

type Beat = 'killed' | 'map' | 'box';
const BEATS: Beat[] = ['killed', 'map', 'box'];

/** Words rising one after another, on mount. */
function Rise({ text, from = 0 }: { text: string; from?: number }) {
  let i = from;
  return (
    <>
      {text.split(/(\s+)/).map((p, k) =>
        /^\s+$/.test(p) || !p ? (
          p
        ) : (
          <span className="wn-w" key={k}>
            <i style={{ '--i': i++ } as React.CSSProperties}>{p}</i>
          </span>
        )
      )}
    </>
  );
}

/** "All 23 of your conversations are on it." — what was kept, counted. */
export function keptLine(kept: number): string {
  if (kept <= 0) return 'Nothing you had was lost.';
  if (kept === 1) return 'Your conversation is on it — nothing was lost.';
  return `All ${kept.toLocaleString('en-US')} of your conversations are on it — nothing was lost.`;
}

export function WhatsNew({
  surface,
  kept,
  onDone,
  onSkip,
}: {
  /** where it is shown: over the map, or over Core's chat (where the last beat leads to the map) */
  surface: 'core' | 'logos';
  /** how many conversations they have, all of them on the map now */
  kept: number;
  /** the last beat's button: the map is shown (Logos) or opened (Core) */
  onDone: () => void;
  onSkip: () => void;
}) {
  const [at, setAt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [first, setFirst] = useState<string | null>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const beat = BEATS[at];
  const last = at === BEATS.length - 1;
  const cta = surface === 'logos' ? 'Show me my map' : 'Take me to my map';

  useEffect(() => {
    track('whats_new_started', { surface });
    setFirst(readName()?.split(' ')[0] ?? null);
  }, [surface]);
  // Focus comes in with it — onto the dialog when it arrives, so Tab starts
  // inside it, and onto the way forward at every step after.
  useEffect(() => {
    (at ? primary.current : root.current)?.focus({ preventScroll: true });
  }, [at]);

  // Over the map, the last button lifts this away to show the real one; the
  // map is already there underneath. Without motion, at once.
  const finish = useCallback(() => {
    if (leaving) return;
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) return onDone();
    setLeaving(true);
    window.setTimeout(onDone, 520);
  }, [leaving, onDone]);
  const next = useCallback(() => (last ? finish() : setAt((a) => Math.min(a + 1, BEATS.length - 1))), [last, finish]);
  const back = useCallback(() => setAt((a) => Math.max(0, a - 1)), []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (leaving) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [leaving, next, back, onSkip]);

  // On <body> itself, beside the sky: on Celestial the app steps out of sight
  // behind it (app/celestial.css) and it floats on the live sky.
  const page = (
    <div
      ref={root}
      tabIndex={-1}
      className={`wn${leaving ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wn-title"
      data-beat={beat}
      data-surface={surface}
    >
      <span className="wn-sky" aria-hidden="true" />
      <div className="wn-top">
        <span className="wn-brand">
          <img src="/socria-mark.png" alt="" width={22} height={22} />
          <span>Socria</span>
        </span>
        <span className="wn-steps" role="img" aria-label={`Step ${at + 1} of ${BEATS.length}`}>
          {BEATS.map((b, i) => (
            <i key={b} className={i === at ? 'on' : i < at ? 'was' : undefined} />
          ))}
        </span>
        <button type="button" className="wn-skip" onClick={onSkip}>
          Skip
        </button>
      </div>

      <div className="wn-stage" key={beat}>
        <div className="wn-art" aria-hidden="true">
          {beat === 'killed' ? <ArtFold /> : beat === 'map' ? <ArtRead /> : <ArtBox />}
        </div>
        <div className="wn-words">
          {beat === 'killed' && (
            <>
              <p className="wn-kick wn-fade" style={{ '--d': '.05s' } as React.CSSProperties}>
                Welcome back{first ? `, ${first}` : ''}
              </p>
              <h1 className="wn-q" id="wn-title">
                <span className="wn-line">
                  <Rise text="We killed the chatbot." />
                </span>
                <span className="wn-line wn-line-2">
                  <Rise text="Socria is a map of your thinking now." from={4} />
                </span>
              </h1>
              <p className="wn-sf wn-fade" style={{ '--d': '.75s' } as React.CSSProperties}>
                No more chat window and a list of old threads — one map of everything you’ve studied. {keptLine(kept)}
              </p>
            </>
          )}
          {beat === 'map' && (
            <>
              <p className="wn-kick wn-fade" style={{ '--d': '.05s' } as React.CSSProperties}>
                How to read it
              </p>
              <h1 className="wn-q" id="wn-title">
                <Rise text="Your map, not a list." />
              </h1>
              <p className="wn-sf wn-fade" style={{ '--d': '.45s' } as React.CSSProperties}>
                Each subject is a circle and each conversation a disc inside it — the more you put in, the bigger it grows. A dashed
                line is a link you made between subjects.
              </p>
              <p className="wn-sf wn-sf-2 wn-fade" style={{ '--d': '.6s' } as React.CSSProperties}>
                The lens at the top shows <em>Today</em> or <em>This week</em> as a map, and <em>This month</em> or{' '}
                <em>All time</em> as a line through time.
              </p>
            </>
          )}
          {beat === 'box' && (
            <>
              <p className="wn-kick wn-fade" style={{ '--d': '.05s' } as React.CSSProperties}>
                Where it starts
              </p>
              <h1 className="wn-q" id="wn-title">
                <Rise text="Everything starts in one box." />
              </h1>
              <p className="wn-sf wn-fade" style={{ '--d': '.45s' } as React.CSSProperties}>
                Ask anything, or drop in your notes, slides or a PDF — Socria sorts them into topics and puts them on your map.
              </p>
              <p className="wn-sf wn-sf-2 wn-fade" style={{ '--d': '.6s' } as React.CSSProperties}>
                Your Projects are on it too: drag a conversation onto one to file it.
              </p>
            </>
          )}
          <div className="wn-row wn-fade" style={{ '--d': beat === 'killed' ? '1.1s' : '.8s' } as React.CSSProperties}>
            {at > 0 && (
              <button type="button" className="wn-back" onClick={back}>
                <span aria-hidden="true">←</span> Back
              </button>
            )}
            <button ref={primary} type="button" className="wn-primary" onClick={next}>
              {last ? cta : 'Next'}
              <span aria-hidden="true">{last ? '↗' : '→'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? page : createPortal(page, document.body);
}

// ── the drawings ──────────────────────────────────────────────────────
//
// One small map, drawn the way the real one is (components/logos5/
// UniverseBubbles.tsx): subjects as dashed circles named FIELD · COURSE, the
// conversation you would pick up again haloed, quick questions as dots on
// spokes, and one link you made across subjects with its card. The first
// drawing ends on it; the second reads it.

const BIO = { x: 124, y: 170, r: 80, label: 'BIOLOGY · BIOL 1306' };
const CHEM = { x: 276, y: 150, r: 58, label: 'CHEMISTRY · CHEM 1311' };
type Hub = { id: string; x: number; y: number; r: number; c: 1 | 2; title: string[]; halo?: boolean };
const HUBS: Hub[] = [
  { id: 'enz', x: 114, y: 160, r: 31, c: 1, title: ['Enzymes'], halo: true },
  { id: 'mit', x: 160, y: 214, r: 17, c: 1, title: ['Mitosis'] },
  { id: 'rat', x: 276, y: 146, r: 24, c: 2, title: ['Reaction', 'rates'] },
];
/** A quick question: a dot on a spoke, its words on the side away from the ring. */
type Dot = { x: number; y: number; from: string; label?: string; side?: 'l' | 'r' };
const DOTS: Dot[] = [
  { x: 64, y: 198, from: 'enz', label: 'What’s ATP?', side: 'r' },
  { x: 78, y: 114, from: 'enz' },
  { x: 302, y: 110, from: 'rat' },
  { x: 306, y: 186, from: 'rat', label: 'Why heat?', side: 'l' },
];
const LINK = 'M 144 150 C 168 116, 226 112, 252 140';

const hubOf = (id: string) => HUBS.find((h) => h.id === id)!;
/** The spoke from a hub's edge to its dot. */
function spoke(d: Dot) {
  const h = hubOf(d.from);
  const a = Math.atan2(d.y - h.y, d.x - h.x);
  return { x1: h.x + Math.cos(a) * (h.r + 3), y1: h.y + Math.sin(a) * (h.r + 3), x2: d.x, y2: d.y };
}

/** A dashed path drawn on, end to end: a mask stroke runs along it. */
function Drawn({ d, id, className, delay }: { d: string; id: string; className: string; delay: string }) {
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="280">
        <path d={d} pathLength={1} className="wn-draw" style={{ '--d': delay } as React.CSSProperties} />
      </mask>
      <path d={d} className={className} mask={`url(#${id})`} />
    </>
  );
}

function HubDisc({ h, i, cls = 'wn-pop', base }: { h: Hub; i: number; cls?: string; base: string }) {
  return (
    <g className={cls} style={{ '--i': i, '--b': base } as React.CSSProperties}>
      {h.halo && <circle className="wn-halo" cx={h.x} cy={h.y} r={h.r + 7} />}
      <circle className={`wn-disc c${h.c}`} cx={h.x} cy={h.y} r={h.r} />
      <text className="wn-hubt" x={h.x} y={h.y + (h.title.length > 1 ? -2 : 3.5)} fontSize={h.r > 25 ? 11 : 8.5}>
        {h.title.map((t, k) => (
          <tspan key={k} x={h.x} dy={k ? 10 : 0}>
            {t}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function TheMap({ id, labels, base }: { id: string; labels: boolean; base: string }) {
  return (
    <g className="wn-map">
      {[BIO, CHEM].map((s, k) => (
        <g key={s.label}>
          <circle className="wn-ring" cx={s.x} cy={s.y} r={s.r} style={{ '--i': k, '--b': base } as React.CSSProperties} />
          {labels && (
            <text className="wn-name wn-in" x={s.x} y={s.y - s.r - 10} style={{ '--i': k, '--b': base } as React.CSSProperties}>
              {s.label}
            </text>
          )}
        </g>
      ))}
      {DOTS.map((d, k) => {
        const s = spoke(d);
        return (
          <g key={k} className="wn-in" style={{ '--i': k + 3, '--b': base } as React.CSSProperties}>
            <line className="wn-spoke" {...s} />
            <circle className={`wn-dot c${hubOf(d.from).c}`} cx={d.x} cy={d.y} r={4.5} />
            {labels && d.label && (
              <text className={`wn-dotl ${d.side === 'l' ? 'to-l' : 'to-r'}`} x={d.x + (d.side === 'l' ? -8 : 8)} y={d.y + 3}>
                {d.label}
              </text>
            )}
          </g>
        );
      })}
      <Drawn d={LINK} id={`${id}-l`} className="wn-link" delay={`calc(${base} + .55s)`} />
      {HUBS.map((h, k) => (
        <HubDisc key={h.id} h={h} i={k} base={base} />
      ))}
      {labels && (
        <g className="wn-in wn-card" style={{ '--i': 6, '--b': base } as React.CSSProperties}>
          <rect x={150} y={96} width={98} height={22} rx={11} />
          <text x={199} y={110.5}>
            You linked these
          </text>
        </g>
      )}
    </g>
  );
}

/** A conversation as it used to be — and folded into the map. */
const BUBBLES: { x: number; y: number; w: number; you?: boolean; to: [number, number] }[] = [
  { x: 26, y: 22, w: 178, to: [114, 160] },
  { x: 150, y: 66, w: 184, you: true, to: [276, 146] },
  { x: 26, y: 110, w: 214, to: [160, 214] },
  { x: 178, y: 154, w: 156, you: true, to: [64, 198] },
  { x: 26, y: 198, w: 150, to: [306, 186] },
];
const BUB_H = 34;
/** how far the folded map sits above where the second drawing reads it */
const LIFT = 22;

function ArtFold() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg viewBox="0 0 360 280" className="wn-svg wn-fold">
      {/* the map ends where the chat was: the middle of the drawing */}
      <g transform={`translate(0 ${-LIFT})`}>
        <TheMap id={id} labels={false} base="2.8s" />
      </g>
      {BUBBLES.map((b, k) => {
        const cx = b.x + b.w / 2;
        const cy = b.y + BUB_H / 2;
        return (
          <g
            key={k}
            className="wn-bub"
            style={{ '--i': k, '--dx': `${b.to[0] - cx}px`, '--dy': `${b.to[1] - LIFT - cy}px` } as React.CSSProperties}
          >
            <g className="wn-bub-in">
              <rect className={`wn-bubble${b.you ? ' you' : ''}`} x={b.x} y={b.y} width={b.w} height={BUB_H} rx={15} />
              <rect className="wn-bline" x={b.x + 14} y={b.y + 10} width={b.w * 0.62} height={5} rx={2.5} />
              <rect className="wn-bline" x={b.x + 14} y={b.y + 19} width={b.w * 0.38} height={5} rx={2.5} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** The lens pill, its thumb walking Today → This week → This month → All time. */
const LENSES = ['Today', 'This week', 'This month', 'All time'];
const PILL = { x: 48, y: 12, w: 264, h: 26 };

const BEADS: { x: number; r: number; c: 1 | 2; halo?: boolean }[] = [
  { x: 44, r: 5, c: 1 },
  { x: 70, r: 9, c: 2 },
  { x: 98, r: 6, c: 1 },
  { x: 128, r: 13, c: 1 },
  { x: 160, r: 7, c: 2 },
  { x: 190, r: 10, c: 1 },
  { x: 224, r: 17, c: 1, halo: true },
  { x: 256, r: 6, c: 2 },
  { x: 284, r: 12, c: 2 },
  { x: 312, r: 7, c: 1 },
];

function ArtRead() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const seg = PILL.w / LENSES.length;
  return (
    <svg viewBox="0 0 360 280" className="wn-svg wn-read">
      <g className="wn-pill wn-in" style={{ '--i': 0, '--b': '.1s' } as React.CSSProperties}>
        <rect className="wn-track" x={PILL.x} y={PILL.y} width={PILL.w} height={PILL.h} rx={PILL.h / 2} />
        <rect className="wn-thumb" x={PILL.x + 2} y={PILL.y + 2} width={seg - 4} height={PILL.h - 4} rx={(PILL.h - 4) / 2} />
        {LENSES.map((l, k) => (
          <text key={l} className="wn-lens" x={PILL.x + seg * k + seg / 2} y={PILL.y + 17}>
            {l}
          </text>
        ))}
      </g>
      <g className="wn-as-map">
        <TheMap id={id} labels base=".25s" />
      </g>
      <g className="wn-as-time">
        <line className="wn-base" x1={28} y1={178} x2={332} y2={178} />
        {['AUG', 'SEP', 'OCT'].map((m, k) => (
          <g key={m}>
            <line className="wn-tick" x1={74 + k * 100} y1={190} x2={74 + k * 100} y2={196} />
            <text className="wn-name" x={74 + k * 100} y={210}>
              {m}
            </text>
          </g>
        ))}
        <path className="wn-link" d="M 128 165 C 168 108, 246 108, 284 166" />
        {BEADS.map((b, k) => (
          <g key={k}>
            {b.halo && <circle className="wn-halo" cx={b.x} cy={178} r={b.r + 6} />}
            <circle className={`wn-disc c${b.c}`} cx={b.x} cy={178} r={b.r} />
          </g>
        ))}
        <text className="wn-dotl" x={224} y={148}>
          Enzymes
        </text>
      </g>
    </svg>
  );
}

/** The box at the foot: typed into, a file dropped in, sent — and it lands on the map. */
const TYPED = 'Make sense of my lab notes';
const TOPICS: { x: number; y: number; t: string }[] = [
  { x: 230, y: 134, t: 'Titration' },
  { x: 294, y: 134, t: 'Molarity' },
  { x: 262, y: 152, t: 'Error' },
];

function ArtBox() {
  return (
    <svg viewBox="0 0 360 280" className="wn-svg wn-box">
      {/* what was already there: a subject, and a Project, folded */}
      <g className="wn-in" style={{ '--i': 0, '--b': '.05s' } as React.CSSProperties}>
        <circle className="wn-ring still" cx={100} cy={100} r={64} />
        <text className="wn-name" x={100} y={26}>
          BIOLOGY · BIOL 1306
        </text>
        <line className="wn-spoke" x1={74} y1={110} x2={56} y2={132} />
        <circle className="wn-dot c1" cx={54} cy={134} r={4.5} />
        <circle className="wn-disc c1" cx={96} cy={92} r={25} />
        <text className="wn-hubt" x={96} y={95.5} fontSize={10}>
          Enzymes
        </text>
        <circle className="wn-disc c1 soft" cx={134} cy={134} r={14} />
        <text className="wn-hubt" x={134} y={136.5} fontSize={7.5}>
          Cells
        </text>
      </g>
      <g className="wn-in wn-fold-chip" style={{ '--i': 1, '--b': '.05s' } as React.CSSProperties}>
        <rect x={214} y={14} width={124} height={30} rx={15} />
        <circle className="wn-pdot" cx={232} cy={29} r={4.5} />
        <text className="wn-chipt" x={244} y={33}>
          Thesis
        </text>
        <text className="wn-tag" x={286} y={32}>
          PROJECT
        </text>
      </g>

      {/* what arrives: a new subject, sorted into topics */}
      <g className="wn-arrive">
        <circle className="wn-ring" cx={262} cy={124} r={52} />
        <text className="wn-name wn-late" x={262} y={62}>
          CHEMISTRY · LAB
        </text>
        {TOPICS.map((p, k) => (
          <g key={p.t} className="wn-topic" style={{ '--i': k } as React.CSSProperties}>
            <circle className="wn-dot c2" cx={p.x} cy={p.y} r={4.5} />
            <text className="wn-dotl" x={p.x} y={p.y + 14}>
              {p.t}
            </text>
          </g>
        ))}
        <g className="wn-fly">
          <circle className="wn-disc c2" cx={262} cy={112} r={20} />
          <text className="wn-hubt" x={262} y={115.5} fontSize={9}>
            Lab 4
          </text>
        </g>
      </g>

      {/* the box */}
      <g className="wn-chip">
        <rect x={40} y={176} width={110} height={22} rx={11} />
        <path className="wn-doc" d="M 52 181 h 7 l 4 4 v 9 h -11 z" />
        <text x={68} y={191}>
          lab-04.pdf
        </text>
      </g>
      <g className="wn-in" style={{ '--i': 2, '--b': '.05s' } as React.CSSProperties}>
        <rect className="wn-field" x={16} y={204} width={328} height={54} rx={27} />
        <path className="wn-clip" d="M 44 236 l 7 -7 a 4 4 0 0 0 -6 -6 l -9 9 a 6.5 6.5 0 0 0 9 9 l 8 -8" />
        <text className="wn-ph" x={62} y={235.5}>
          Search or start something new…
        </text>
        <text className="wn-typed" x={62} y={235.5}>
          {[...TYPED].map((ch, k) => (
            <tspan key={k} style={{ '--k': k } as React.CSSProperties}>
              {ch}
            </tspan>
          ))}
        </text>
        <g className="wn-send">
          <circle cx={318} cy={231} r={17} />
          <path d="M 318 239 V 224 M 312 229.5 L 318 223.5 L 324 229.5" />
        </g>
      </g>
    </svg>
  );
}
