'use client';

// components/display/ExerciseFigure.tsx — labels hidden, recalled by the person.
//
// Made from something already in the workspace — a diagram, the map's own
// ideas (lib/objects/display-make.ts) — never a quiz about a topic. A hidden
// label is NOT on the page: it is not in the markup, a title, an attribute or
// a screen reader's text until the person gets it right or chooses to see it.
// Cues have every hidden label masked out. Answers are graded by the kind
// against the source's own label; hints climb a ladder, one rung when asked.

import { useState } from 'react';
import {
  EXERCISE_LIMITS,
  exerciseHint,
  feedbackFor,
  hiddenNumber,
  tally,
  tallyLine,
  withoutHidden,
  type ExercisePart,
  type ExerciseState,
} from '@/lib/objects/display-exercise';
import type { FigureProps } from '@/components/objects/figures';
import { DisplayShell, useDisplay, type Display } from './DisplayShell';
import { Tool } from './primitives';
import { NodeLinks } from './NodeLinks';
import './exercise.css';

type S = ExerciseState;
type D = Display<S>;
const W = 560;
const H = 360;

/** May this part's label be on the page? Shown labels, revealed ones and ones got right — nothing still to recall. */
const visibleLabel = (s: S, p: ExercisePart) => !s.hidden.includes(p.id) || s.revealed.includes(p.id) || s.graded[p.id] === 'right';

export function ExerciseFigure(p: FigureProps) {
  const d = useDisplay<S>(p);
  const s = d.state;
  const t = tally(s);
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={t.hidden ? `${t.right} of ${t.hidden} right${t.toGo ? ` · ${t.toGo} to go` : ''}` : 'every label showing'}
      tools={
        <>
          <Tool label="Hide every label" onClick={() => d.act('hideAll', {})}>
            Hide all
          </Tool>
          <Tool label="Another round on the ones to practise" onClick={() => d.act('again', {})} disabled={!t.hidden}>
            Again
          </Tool>
          <Tool label="Start over" onClick={() => d.act('reset', {})}>
            Start over
          </Tool>
        </>
      }
    >
      <p className="dsp-ex-source">
        From {s.source.kind === 'diagram' ? 'the diagram' : 'your map'} “{s.source.title}”
        {!s.source.verified && <span className="dsp-ex-unverified"> — drawn by Socria and not checked against a reference: a schematic to practise with, not an authority.</span>}
      </p>
      {s.view === 'label' && s.structure ? <Picture d={d} /> : s.view === 'results' ? <Results s={s} /> : <Recall d={d} />}
      <p className="dsp-ex-tally" role="status">
        {tallyLine(s)}
      </p>
    </DisplayShell>
  );
}

function Picture({ d }: { d: D }) {
  const s = d.state;
  const st = s.structure!;
  const bw = 132;
  const bh = 46;
  const at = new Map(st.nodes.map((n) => [n.id, n]));
  const boxes = s.parts
    .filter((p) => at.get(p.id)?.x !== undefined)
    .map((p) => {
      const n = at.get(p.id)!;
      return { id: p.id, x: bw / 2 + (n.x ?? 0) * (W - bw), y: bh / 2 + (n.y ?? 0) * (H - bh), w: bw, h: bh };
    });
  const unplaced = s.parts.filter((p) => at.get(p.id)?.x === undefined);
  return (
    <>
      <NodeLinks
        width={W}
        height={H}
        boxes={boxes}
        label={`Labeling: ${s.title}`}
        lines={st.edges.filter((e) => boxes.some((b) => b.id === e.from) && boxes.some((b) => b.id === e.to)).map((e) => ({ from: e.from, to: e.to, arrow: false }))}
        boxClass={(id) => {
          const part = s.parts.find((x) => x.id === id)!;
          const g = s.graded[id];
          return `dsp-ex-box${s.hidden.includes(id) ? ' is-hidden' : ''}${g ? ` is-${g}` : ''}${s.revealed.includes(id) ? ' is-revealed' : ''}${visibleLabel(s, part) ? '' : ' is-secret'}`;
        }}
        renderBox={(b) => <Slot d={d} part={s.parts.find((x) => x.id === b.id)!} compact />}
      />
      {unplaced.length > 0 && (
        <ul className="dsp-ex-list">
          {unplaced.map((p) => (
            <li key={p.id}>
              <Slot d={d} part={p} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Recall({ d }: { d: D }) {
  const s = d.state;
  return (
    <ol className="dsp-ex-list">
      {s.parts
        .filter((p) => s.hidden.includes(p.id))
        .map((p) => (
          <li key={p.id}>
            {p.cue && <span className="dsp-ex-cue">{withoutHidden(s, p.cue)}</span>}
            <Slot d={d} part={p} />
          </li>
        ))}
    </ol>
  );
}

/** One label: showing, or a numbered blank the person fills in — with its hint, its grade and the choice to see it. */
function Slot({ d, part, compact }: { d: D; part: ExercisePart; compact?: boolean }) {
  const s = d.state;
  const [v, setV] = useState(s.answers[part.id] ?? '');
  const hidden = s.hidden.includes(part.id);
  const n = hidden ? hiddenNumber(s, part.id) : 0;
  const g = s.graded[part.id];
  const revealed = s.revealed.includes(part.id);
  if (!hidden) return <span className="dsp-ex-label">{part.answer}</span>;
  if (revealed || g === 'right') {
    return (
      <span className="dsp-ex-label">
        <span className="dsp-ex-n">{n}</span> {part.answer}
        <span className="dsp-ex-fb">{feedbackFor(g, { revealed, answer: revealed ? part.answer : undefined })}</span>
      </span>
    );
  }
  const hints = s.hints[part.id] ?? 0;
  return (
    <span className={`dsp-ex-slot${compact ? ' is-compact' : ''}`}>
      <span className="dsp-ex-n" aria-hidden="true">
        {n}
      </span>
      <form
        className="dsp-ex-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) d.act('answer', { part: part.id, text: v.trim(), by: 'person' });
        }}
      >
        <input value={v} onChange={(e) => setV(e.target.value)} maxLength={EXERCISE_LIMITS.answer} aria-label={`Label ${n}`} placeholder={`Label ${n}`} disabled={!d.live} />
      </form>
      {g && <span className={`dsp-ex-fb is-${g}`}>{feedbackFor(g)}</span>}
      {hints > 0 && <span className="dsp-ex-hint">{exerciseHint(s, part.id, hints)}</span>}
      {d.live && (
        <span className="dsp-ex-acts">
          <button type="button" className="dsp-tool" disabled={hints >= EXERCISE_LIMITS.hints} onClick={() => d.act('hint', { part: part.id })}>
            Hint
          </button>
          <button type="button" className="dsp-tool" onClick={() => d.act('reveal', { part: part.id })}>
            Show it
          </button>
        </span>
      )}
    </span>
  );
}

function Results({ s }: { s: S }) {
  const t = tally(s);
  return (
    <div className="dsp-ex-results">
      <dl className="dsp-ex-counts">
        {(
          [
            ['Right', t.right],
            ['Close', t.close],
            ['Wrong', t.wrong],
            ['Shown', t.revealed],
            ['To go', t.toGo],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="dsp-empty">About this round only — round {s.rounds}. Not a measure of you.</p>
    </div>
  );
}
