'use client';
// components/ux-v0/Discovery.tsx — the question being asked, and the ones answered.
//
// The current question sits over the moodboard, in the serif, with why it is
// asked and a few suggested answers as words — or the composer below for
// their own. Never a chat log: earlier questions live in the rail, each
// answer editable, and editing one updates what SocriaUX understands.

import { useState } from 'react';
import { TOPIC_LABEL, type Discovery, type DiscoveryQuestion } from '@/lib/ux-v0/types';

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
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  if (busy && !q) {
    return (
      <div className="v0-question">
        <p className="v0-quiet" role="status" aria-live="polite">
          {busy}
        </p>
      </div>
    );
  }
  if (!q) {
    return (
      <div className="v0-question is-ready sb-card is-idea">
        <span className="sb-label v0-asks-label">
          <span className="sb-glyph" aria-hidden="true" />
          {ready ? 'Enough to write the brief.' : 'Discovery'}
        </span>
        <p className="v0-q-text">{ready ? 'SocriaUX has what it needs to draft the brief. Keep what fits on the board below, then write it.' : 'Say more below, or write the brief when you are ready.'}</p>
        {note && <p className="v0-quiet">{note}</p>}
        <div className="v0-q-acts">
          <button type="button" className="sb-btn is-primary" onClick={onBrief} disabled={!!busy || answered < 1}>
            Write the brief
          </button>
        </div>
      </div>
    );
  }
  const toggle = (o: string) => setChosen((c) => (c.includes(o) ? c.filter((x) => x !== o) : [...c, o]));
  return (
    <div className="v0-question sb-card is-question sb-floating" aria-live="polite">
      <span className="sb-label v0-asks-label">
        <span className="sb-glyph is-question" aria-hidden="true" />
        Socria asks
        <span className="v0-asks-n">
          Question {n}, about {TOPIC_LABEL[q.topic].toLowerCase()}
        </span>
      </span>
      <p className="v0-q-text">{q.question}</p>
      {q.why && <p className="v0-q-why">{q.why}</p>}
      {q.options.length > 0 && (
        <div className="v0-options" role={q.multi ? 'group' : undefined} aria-label="Suggested answers">
          {q.options.map((o) => (
            <button
              key={o}
              type="button"
              className={`sb-btn v0-option${chosen.includes(o) ? ' is-on' : ''}`}
              aria-pressed={q.multi ? chosen.includes(o) : undefined}
              disabled={!!busy}
              onClick={() => (q.multi ? toggle(o) : onAnswer(o))}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      <div className="v0-q-acts">
        {q.multi && chosen.length > 0 && (
          <button type="button" className="sb-btn is-primary" onClick={() => (onAnswer(chosen.join('; ')), setChosen([]))} disabled={!!busy}>
            Use {chosen.length === 1 ? 'this' : 'these'}
          </button>
        )}
        <button type="button" className="sb-btn is-sm v0-on-q" onClick={onSkip} disabled={!!busy}>
          Skip
        </button>
        {answered >= 2 && (
          <button type="button" className="sb-btn is-sm v0-on-q" onClick={onBrief} disabled={!!busy}>
            Write the brief now
          </button>
        )}
        {busy && (
          <span className="v0-quiet" role="status">
            {busy}
          </span>
        )}
      </div>
    </div>
  );
}

export function QuestionsRail({ discovery, intent, onEdit, onIntent }: { discovery: Discovery; intent: string; onEdit: (id: string, answer: string) => void; onIntent: (v: string) => void }) {
  const answered = discovery.questions.filter((q) => q.answer || q.skipped);
  const known = Object.entries(discovery.understanding.known);
  return (
    <div className="v0-rail-body">
      <section className="v0-cellset">
        <span className="sb-label">What you want to make</span>
        <EditLine value={intent} onSave={onIntent} />
      </section>
      {discovery.understanding.summary && (
        <section className="v0-cellset">
          <span className="sb-label">Understood so far</span>
          <p className="v0-body">{discovery.understanding.summary}</p>
          {known.length > 0 && (
            <dl className="v0-kv">
              {known.map(([k, v]) => (
                <div key={k} className="v0-kv-row">
                  <dt>{TOPIC_LABEL[k as keyof typeof TOPIC_LABEL] ?? k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}
      <section className="v0-cellset">
        <span className="sb-label">Answered</span>
        {!answered.length && <p className="v0-empty">Nothing yet.</p>}
        <ol className="v0-answers">
          {answered.map((q) => (
            <li key={q.id}>
              <p className="v0-quiet">{q.question}</p>
              {q.skipped ? <p className="v0-quiet">Skipped</p> : <EditLine value={q.answer} onSave={(v) => onEdit(q.id, v)} />}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function EditLine({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <p className="v0-body v0-editable">
        {value || '—'}{' '}
        <button type="button" className="sb-link is-meta" onClick={() => (setV(value), setEditing(true))}>
          Edit
        </button>
      </p>
    );
  }
  return (
    <div className="v0-editline">
      <textarea className="v0-field" rows={2} value={v} onChange={(e) => setV(e.target.value)} aria-label="Edit" />
      <span className="v0-q-acts">
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
