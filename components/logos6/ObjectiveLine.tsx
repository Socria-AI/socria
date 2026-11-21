'use client';
// components/logos6/ObjectiveLine.tsx — WHAT THIS CHAT IS FOR, over the chatbox (Logos 6, lib/logos6/objective.ts).
//
// One quiet line: the objective, where it came from, and what the chat holds for it in counts. Pressed, the goal is
// edited in place (their words from then on); "What this chat holds" opens the work — decisions, open questions,
// sources, what was made, quizzes, the subjects within it — each a way into the view that has it. All of it is read
// from the chat itself, so it is there with no model at all. Never a form before the first message: an empty chat
// only says how it works.

import { useEffect, useRef, useState } from 'react';
import { KIND_SAID, SOURCE_SAID, workCounts, type Objective, type ObjectiveWork } from '@/lib/logos6/objective';
import './objective.css';

export type ObjectiveView = 'logic_map' | 'content' | 'artifacts';

export function ObjectiveLine(p: {
  objective: Objective | null;
  work: ObjectiveWork | null;
  /** the chat has no messages yet */
  empty: boolean;
  readOnly?: boolean;
  narrow?: boolean;
  onSet: (goal: string, outcome: string) => void;
  onForgetNote?: (text: string) => void;
  onOpen?: (v: ObjectiveView) => void;
}) {
  const { objective: o, work: w } = p;
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState(o?.goal ?? '');
  const [outcome, setOutcome] = useState(o?.outcome ?? '');
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

  if (!o) {
    if (!p.empty) return null;
    return (
      <p className="l6o-hint" role="note">
        <span className="l6o-k">One chat, one objective</span> Say what you want to work towards — Socria keeps it in view as the work builds up here.
      </p>
    );
  }
  const counts = w ? workCounts(w) : '';
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
          <span className="l6o-k">Objective</span>
          {p.readOnly ? (
            <span className="l6o-goal">{o.goal}</span>
          ) : (
            <button type="button" className="l6o-goal" title="Change this chat’s objective" aria-label={`Objective: ${o.goal}. Press to change it.`} onClick={() => setEditing(true)}>
              {o.goal}
            </button>
          )}
          <span className="l6o-src" title={o.kind ? KIND_SAID[o.kind] : undefined}>
            {SOURCE_SAID[o.source]}
          </span>
          {counts && (
            <button type="button" className="l5-link is-meta l6o-holds" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              What this chat holds <span className="l6o-n">{counts}</span>
            </button>
          )}
        </p>
      )}
      {open && w && (
        <div className="l6o-panel" role="group" aria-label="What this chat holds for its objective">
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
