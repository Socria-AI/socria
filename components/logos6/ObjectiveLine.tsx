'use client';
// components/logos6/ObjectiveLine.tsx — WHAT THIS CHAT IS FOR, over the chatbox (Logos 6, lib/logos6/objective.ts).
//
// One quiet line: what the chat is working towards, and what it holds for it in a few counts. Pressed, the goal is
// edited in place (their words from then on); the counts open the work — decisions, open questions, sources, what was
// made, quizzes, milestones, the subjects within it — each a way into the view that has it. Where the objective came
// from is said on the goal, as its title, not as more words on the line. All of it is read from the chat itself, so it
// is there with no model at all. An empty chat shows nothing here: the new chat and the box already ask what it is for.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { KIND_SAID, SOURCE_SAID, workCounts, type Objective, type ObjectiveWork } from '@/lib/logos6/objective';
import './objective.css';

export type ObjectiveView = 'logic_map' | 'content' | 'artifacts';

export function ObjectiveLine(p: {
  objective: Objective | null;
  work: ObjectiveWork | null;
  readOnly?: boolean;
  narrow?: boolean;
  onSet: (goal: string, outcome: string) => void;
  onForgetNote?: (text: string) => void;
  /** a milestone ticked off or back on (only ever by them), and one added */
  onMilestone?: (text: string, done: boolean) => void;
  onAddMilestone?: (text: string) => void;
  onOpen?: (v: ObjectiveView) => void;
}) {
  const { objective: o, work: w } = p;
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState(o?.goal ?? '');
  const [outcome, setOutcome] = useState(o?.outcome ?? '');
  const [step, setStep] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editing) {
      setGoal(o?.goal ?? '');
      setOutcome(o?.outcome ?? '');
    }
  }, [o?.goal, o?.outcome, editing]);
  // the panel goes away on Escape or a press elsewhere
  useEffect(() => {
    if (!open && !editing) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setEditing(false);
      }
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open, editing]);

  // THE PANEL'S ROOM: it opens upwards from the line, so it is no taller than the room between the line and the top of
  // the view it is in (the space, or the conversation page), and never runs up under the bar above it. Measured when it
  // opens and when the window changes size: the box under the line grows with a draft, a note or a hint.
  const [room, setRoom] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = box.current;
      if (!el) return;
      const ceiling = Math.max(0, el.closest('.ls, .lp')?.getBoundingClientRect().top ?? 0);
      setRoom(Math.max(140, Math.floor(el.getBoundingClientRect().top - ceiling - 16)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  if (!o) return null;
  const counts = w ? workCounts(w) : '';
  // the line keeps to a few counts; the rest are a press away
  const parts = counts ? counts.split(' · ') : [];
  const shown = parts.length > 3 ? `${parts.slice(0, 3).join(' · ')} · more` : counts;
  const from = `${o.kind ? `${KIND_SAID[o.kind]} · ` : ''}${SOURCE_SAID[o.source]}`;
  /** into the view that has it; the panel goes away */
  const go = (v: ObjectiveView) => {
    setOpen(false);
    p.onOpen?.(v);
  };
  const save = () => {
    const g = goal.trim();
    if (g.length >= 2) p.onSet(g, outcome.trim());
    setEditing(false);
  };
  return (
    <div className={`l6o${p.narrow ? ' is-narrow' : ''}`} ref={box}>
      {editing ? (
        <form
          className="l6o-edit"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="l6o-field">
            <span className="l6o-k">Objective</span>
            <input value={goal} maxLength={100} autoFocus onChange={(e) => setGoal(e.target.value)} placeholder="What you are working towards" aria-label="This chat’s objective" />
          </label>
          <label className="l6o-field">
            <span className="l6o-k">Outcome</span>
            <input value={outcome} maxLength={220} onChange={(e) => setOutcome(e.target.value)} placeholder="Optional: how you will know it is done" aria-label="The outcome you want" />
          </label>
          <span className="l6o-acts">
            <button type="submit" className="l5-link is-go">
              Keep
            </button>
            <button type="button" className="l5-link is-meta" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </span>
        </form>
      ) : (
        <p className="l6o-row">
          <span className="l6o-k">Working towards</span>
          {p.readOnly ? (
            <span className="l6o-goal" title={from}>
              {o.goal}
            </span>
          ) : (
            <button type="button" className="l6o-goal" title={`${from}. Press to change it.`} aria-label={`Objective: ${o.goal}. Press to change it.`} onClick={() => setEditing(true)}>
              {o.goal}
            </button>
          )}
          {counts && (
            <button type="button" className="l5-link is-meta l6o-holds" aria-expanded={open} aria-label={`What this chat holds: ${counts}`} onClick={() => setOpen((v) => !v)}>
              {shown}
            </button>
          )}
        </p>
      )}
      {open && w && (
        <div className="l6o-panel" role="group" aria-label="What this chat holds for its objective" style={room ? ({ '--l6o-room': `${room}px` } as CSSProperties) : undefined}>
          {o.outcome && <p className="l6o-outcome">Outcome: {o.outcome}</p>}
          {/* the canvas and the conversation themselves, always a way in */}
          <section className="l6o-sec">
            <span className="l6o-k">
              The work so far
              {w.ideas > 0 && p.onOpen && (
                <button type="button" className="l5-link l6o-go" onClick={() => go('logic_map')}>
                  Open the Mind Map <span className="l5-ar">→</span>
                </button>
              )}
            </span>
            <ul>
              <li>
                {w.ideas} {w.ideas === 1 ? 'idea' : 'ideas'} on the Mind Map · {w.turns} {w.turns === 1 ? 'message' : 'messages'} from you
              </li>
            </ul>
          </section>
          <Section title="Subjects within it" items={w.threads} />
          <Section title="Decided" items={w.decisions} go={p.onOpen ? () => go('logic_map') : undefined} goSaid="On the Mind Map" />
          <Section title="Open questions" items={w.questions} go={p.onOpen ? () => go('logic_map') : undefined} goSaid="On the Mind Map" />
          <Section title="Assumed, not yet checked" items={w.assumptions} go={p.onOpen ? () => go('logic_map') : undefined} goSaid="On the Mind Map" />
          <Section title="Settled" items={w.resolved} />
          <Section title="Sources" items={w.sources} go={p.onOpen ? () => go('content') : undefined} goSaid="In Files" />
          <Section title="Made here" items={w.artifacts} go={p.onOpen ? () => go('artifacts') : undefined} goSaid="In Artifacts" />
          <Section
            title="Quizzes"
            items={w.quizzes.map((z) => `${z.title}: ${z.total ? `${z.right}/${z.total}` : 'not started'}${z.missed.length ? ` — missed ${z.missed.join(', ')}` : ''}${z.finished || !z.total ? '' : ' (in progress)'}`)}
            go={p.onOpen ? () => go('artifacts') : undefined}
            goSaid="In Artifacts"
          />
          {(o.milestones?.length || (p.onAddMilestone && !p.readOnly)) ? (
            <section className="l6o-sec">
              <span className="l6o-k">Milestones — yours to tick off</span>
              {o.milestones?.length ? (
                <ul className="l6o-steps">
                  {o.milestones.map((m) => (
                    <li key={m.t}>
                      <label>
                        <input type="checkbox" checked={!!m.done} disabled={p.readOnly || !p.onMilestone} onChange={(e) => p.onMilestone?.(m.t, e.target.checked)} />
                        <span className={m.done ? 'is-done' : undefined}>{m.t}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
              {p.onAddMilestone && !p.readOnly && (
                <form
                  className="l6o-addstep"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (step.trim().length >= 2) p.onAddMilestone!(step.trim());
                    setStep('');
                  }}
                >
                  <input value={step} maxLength={120} onChange={(e) => setStep(e.target.value)} placeholder="Add a milestone" aria-label="Add a milestone" />
                </form>
              )}
            </section>
          ) : null}
          {o.notes?.length ? (
            <section className="l6o-sec">
              <span className="l6o-k">Keep in mind</span>
              <ul>
                {o.notes.map((n) => (
                  <li key={n.t}>
                    {n.t}
                    {p.onForgetNote && !p.readOnly && (
                      <button type="button" className="l5-link is-meta l6o-x" aria-label={`Forget: ${n.t}`} onClick={() => p.onForgetNote!(n.t)}>
                        Forget
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Section({ title, items, go, goSaid }: { title: string; items: readonly string[]; go?: () => void; goSaid?: string }) {
  if (!items.length) return null;
  return (
    <section className="l6o-sec">
      <span className="l6o-k">
        {title}
        {go && (
          <button type="button" className="l5-link l6o-go" onClick={go}>
            {goSaid} <span className="l5-ar">→</span>
          </button>
        )}
      </span>
      <ul>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
