'use client';
// components/ux-v0/Discovery.tsx — the question being asked, and the conversation so far.
//
// A question is set like a page in a good catalogue, not a form: its number
// and subject in the margin, the question in Socria's voice, one line on why
// it matters, and a short index of answers to pick from. Picking one answers
// at once; "+" takes it into your own words to combine or change; a number
// key picks it too. Skip, write the brief, or go straight to a design are
// always there, so the questions never stand between the designer and the
// work. Earlier answers live in the rail, each one editable, and editing one
// updates what SocriaUX understands.

import { useEffect, useState } from 'react';
import { TOPIC_LABEL, type Discovery, type DiscoveryQuestion } from '@/lib/ux-v0/types';

const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');

export function QuestionBand({
  q,
  n,
  busy,
  ready,
  answered,
  note,
  onAnswer,
  onSkip,
  onBrief,
  onCombine,
  onDesignNow,
}: {
  q: DiscoveryQuestion | null;
  n: number;
  busy: string | null;
  ready: boolean;
  answered: number;
  note: string;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
  onBrief: () => void;
  /** take a suggested answer into the designer's own words, to combine or change */
  onCombine: (answer: string) => void;
  /** write the brief from what is known and design at once, in the direction SocriaUX chooses */
  onDesignNow: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => setChosen([]), [q?.id]);

  // 1–9 pick a suggested answer, as the numbers beside them say
  useEffect(() => {
    if (!q || busy || !q.options.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key) - 1;
      const o = Number.isInteger(i) && i >= 0 ? q.options[i] : undefined;
      if (!o) return;
      e.preventDefault();
      if (q.multi) setChosen((c) => (c.includes(o) ? c.filter((x) => x !== o) : [...c, o]));
      else onAnswer(o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, busy, onAnswer]);

  if (busy && !q) {
    return (
      <section className="v0-question st-ask is-waiting" aria-label="Socria asks">
        <div className="st-ask-meta">
          <span className="st-glyph g-question is-breathing" aria-hidden="true" />
        </div>
        <div className="st-ask-main">
          <p className="st-ask-status" role="status" aria-live="polite">
            {busy}
          </p>
        </div>
      </section>
    );
  }

  if (!q) {
    return (
      <section className="v0-question is-ready st-ask" aria-label="Discovery">
        <div className="st-ask-meta">
          <span className="st-glyph g-idea" aria-hidden="true" />
          <span className="st-ask-n">{answered ? `${answered} answered` : 'Discovery'}</span>
        </div>
        <div className="st-ask-main">
          <p className="v0-q-text st-q">{ready ? 'Enough to write the brief.' : 'Say more, or write the brief when you are ready.'}</p>
          <p className="v0-q-why st-why">{note || (ready ? 'Keep what fits on the board below; it all goes into the brief.' : 'Anything you add below sharpens what SocriaUX understands.')}</p>
          <div className="st-ask-acts">
            <button type="button" className="sb-btn is-primary" onClick={onBrief} disabled={!!busy}>
              Write the brief
            </button>
            <button type="button" className="sb-link is-go" onClick={onDesignNow} disabled={!!busy}>
              Design it now <span className="sb-ar">→</span>
            </button>
            {busy && (
              <span className="st-ask-status" role="status">
                {busy}
              </span>
            )}
          </div>
        </div>
      </section>
    );
  }

  const toggle = (o: string) => setChosen((c) => (c.includes(o) ? c.filter((x) => x !== o) : [...c, o]));
  return (
    <section className="v0-question st-ask" aria-label="Socria asks" aria-live="polite">
      <div className="st-ask-meta">
        <span className="st-glyph g-question" aria-hidden="true" />
        <span className="st-ask-n">Question {n}</span>
        <span className="st-ask-topic">{TOPIC_LABEL[q.topic]}</span>
      </div>
      <div className="st-ask-main" key={q.id}>
        <p className="v0-q-text st-q">{q.question}</p>
        {q.why && <p className="v0-q-why st-why">{q.why}</p>}
        {q.options.length > 0 && (
          <ul className="v0-options st-options" aria-label={q.multi ? 'Suggested answers: choose any' : 'Suggested answers'}>
            {q.options.map((o, i) => {
              const on = chosen.includes(o);
              return (
                <li key={o} className={`st-option${on ? ' is-on' : ''}`} style={{ ['--i' as string]: i }}>
                  <button
                    type="button"
                    className={`v0-option st-pick${on ? ' is-on' : ''}`}
                    aria-pressed={q.multi ? on : undefined}
                    disabled={!!busy}
                    onClick={() => (q.multi ? toggle(o) : onAnswer(o))}
                  >
                    <span className="st-pick-n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="st-pick-t" id={`st-o-${q.id}-${i}`}>
                      {o}
                    </span>
                    <span className="st-pick-go" aria-hidden="true">
                      {q.multi ? (on ? '✓' : '') : '→'}
                    </span>
                  </button>
                  <button type="button" className="st-add" onClick={() => onCombine(o)} disabled={!!busy} aria-label="Add to your own answer" aria-describedby={`st-o-${q.id}-${i}`} title="Add to your own answer, to combine or change">
                    +
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="st-ask-acts">
          {q.multi && chosen.length > 0 && (
            <button type="button" className="sb-btn is-primary is-sm" onClick={() => (onAnswer(chosen.join('; ')), setChosen([]))} disabled={!!busy}>
              Use {chosen.length === 1 ? 'this' : `these ${chosen.length}`}
            </button>
          )}
          <button type="button" className="sb-link is-meta" onClick={onSkip} disabled={!!busy}>
            Skip
          </button>
          {answered >= 1 && (
            <button type="button" className="sb-link is-meta" onClick={onBrief} disabled={!!busy}>
              Write the brief now
            </button>
          )}
          <button type="button" className="sb-link is-meta is-strong" onClick={onDesignNow} disabled={!!busy}>
            Design it now <span className="sb-ar">→</span>
          </button>
          <span className="st-ask-hint">{busy ? <span role="status">{busy}</span> : q.options.length ? 'Or answer in your own words below.' : 'Answer in your own words below.'}</span>
        </div>
      </div>
    </section>
  );
}

/** The conversation so far: what is being made, what is understood, every answer editable. */
export function QuestionsRail({ discovery, intent, onEdit, onIntent }: { discovery: Discovery; intent: string; onEdit: (id: string, answer: string) => void; onIntent: (v: string) => void }) {
  const answered = discovery.questions.filter((q) => q.answer || q.skipped);
  return (
    <div className="v0-rail-body st-rail">
      <section className="st-rail-sec">
        <h3 className="st-rail-label">What you are making</h3>
        <EditLine value={intent} onSave={onIntent} big />
      </section>
      {discovery.understanding.summary && (
        <section className="st-rail-sec">
          <h3 className="st-rail-label">Understood so far</h3>
          <p className="st-understood">{discovery.understanding.summary}</p>
        </section>
      )}
      <section className="st-rail-sec">
        <h3 className="st-rail-label">
          The conversation <span className="st-count">{answered.length}</span>
        </h3>
        {!answered.length && <p className="v0-empty">Nothing answered yet. Each answer you give appears here, to change whenever you like.</p>}
        <ol className="v0-answers st-answers">
          {answered.map((q, i) => (
            <li key={q.id}>
              <span className="st-answer-n" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <p className="st-answer-q">{q.question}</p>
                {q.skipped ? <p className="st-answer-skipped">Skipped</p> : <EditLine value={q.answer} onSave={(v) => onEdit(q.id, v)} />}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function EditLine({ value, onSave, big = false }: { value: string; onSave: (v: string) => void; big?: boolean }) {
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <p className={`v0-editable st-editable${big ? ' is-big' : ''}`}>
        <span>{value || '—'}</span>
        <button type="button" className="sb-link is-meta" onClick={() => (setV(value), setEditing(true))}>
          Edit
        </button>
      </p>
    );
  }
  return (
    <div className="v0-editline st-editline">
      <textarea
        className="v0-field"
        rows={2}
        value={v}
        autoFocus
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') (e.stopPropagation(), setEditing(false));
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && v.trim()) (onSave(v.trim()), setEditing(false));
        }}
        aria-label="Edit"
      />
      <span className="st-editline-acts">
        <button type="button" className="sb-link is-meta is-strong" onClick={() => (onSave(v.trim()), setEditing(false))} disabled={!v.trim()}>
          Save
        </button>
        <button type="button" className="sb-link is-meta" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </span>
    </div>
  );
}
