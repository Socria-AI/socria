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
//
// The one layout question (what someone should see first) is answered with
// sketches instead: each answer drawn as a grey wireframe carrying the
// designer's own words, and "You decide" drawn as an open sketch beside them
// (lib/ux-v0/layout.ts, components/ux-v0/LayoutSketch.tsx).

import { useEffect, useMemo, useState } from 'react';
import { fontStack } from '@/lib/ux-v0/fonts';
import { LAYOUT_QUESTION_ID, sketchOptions } from '@/lib/ux-v0/layout';
import { LayoutSketch, sketchWords } from './LayoutSketch';
import { ASPECT_LABEL, takenFrom } from '@/lib/ux-v0/references';
import { TOPIC_LABEL, type Discovery, type DiscoveryQuestion, type Moodboard } from '@/lib/ux-v0/types';

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
  onDelegate,
  onSeeDirections,
  intent,
  words,
  board,
  onPicture,
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
  /** leave this question to SocriaUX */
  onDelegate: () => void;
  /** write the brief from what is known and open the directions (nothing is generated yet) */
  onSeeDirections: () => void;
  intent: string;
  /** everything the designer has said so far (the intent and their answers), to sketch the layout question in their words */
  words?: string;
  /** the board, to answer a visual question with a picture, a palette or a type pair */
  board: Moodboard;
  onPicture: (answer: string, refId?: string) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => setChosen([]), [q?.id]);
  // the layout question's answers, as sketches in the designer's words
  const layoutQ = q?.id === LAYOUT_QUESTION_ID;
  const sketches = useMemo(() => (layoutQ ? sketchOptions(words || intent) : []), [layoutQ, words, intent]);

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
            <button type="button" className="sb-link is-meta is-strong" onClick={onSeeDirections} disabled={!!busy}>
              See directions
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
  // a detailed intent already says much of what a question would ask
  const detailed = n === 1 && intent.trim().split(/\s+/).length >= 22;
  // a visual question can be answered with something on the board
  const visual = q.topic === 'visual' || q.topic === 'brand';
  const pictures = visual ? board.refs.filter((r) => r.state !== 'rejected' && !r.avoid && (r.thumb || r.url) && r.media !== 'video').slice(0, 5) : [];
  const palettes = visual ? board.palettes.filter((x) => x.state !== 'rejected').slice(0, 2) : [];
  const pairs = visual ? board.type.filter((x) => x.state !== 'rejected').slice(0, 2) : [];
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
        {detailed && (
          <p className="st-detailed">
            You have said a lot already.{' '}
            <button type="button" className="sb-link is-meta is-strong" onClick={onSeeDirections} disabled={!!busy}>
              Skip the questions and see directions
            </button>
          </p>
        )}
        {layoutQ && q.options.length > 0 && (
          <ul className="st-sketches" aria-label="Suggested answers, sketched with your words">
            {q.options.map((o, i) => {
              // the answer's own sketch: by its words, else by its place among the answers
              const sk = sketches.find((x) => x.label === o) ?? (sketches.length === q.options.length ? sketches[i] : null);
              return (
                <li key={o} className="st-sketch" style={{ ['--i' as string]: i }}>
                  <button type="button" className="st-sketch-pick" disabled={!!busy} onClick={() => onAnswer(o)}>
                    {sk && <LayoutSketch lead={sk.value} kind={sk.kind} task={sk.task} subject={sk.subject} words={sketchWords(intent, sk.subject)} />}
                    <span className="st-sketch-label">
                      <span className="st-pick-n" aria-hidden="true">
                        {i + 1}
                      </span>
                      <span>{o}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            <li className="st-sketch is-yours" style={{ ['--i' as string]: q.options.length }}>
              <button type="button" className="st-sketch-pick" disabled={!!busy} onClick={onDelegate} title="SocriaUX decides this, and will not ask it again">
                <LayoutSketch lead={null} kind={sketches[0]?.kind} task={sketches[0]?.task} subject={sketches[0]?.subject} words={sketchWords(intent, sketches[0]?.subject)} />
                <span className="st-sketch-label">
                  <span className="st-pick-n" aria-hidden="true" />
                  <span>
                    You decide
                    <small>Each direction leads its own way</small>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        )}
        {!layoutQ && q.options.length > 0 && (
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
        {(pictures.length > 0 || palettes.length > 0 || pairs.length > 0) && (
          <div className="st-visual">
            <span className="st-visual-l">Or answer with something on your board</span>
            <div className="st-visual-row">
              {pictures.map((r) => {
                const t = takenFrom(r);
                const what = t.take.length && !(t.take.length === 1 && t.take[0] === 'atmosphere') ? `, for its ${t.take.map((a) => ASPECT_LABEL[a].toLowerCase()).join(' and ')}` : '';
                return (
                  <button key={r.id} type="button" className="st-visual-pic" onClick={() => onPicture(`Like “${r.title || 'this reference'}”${what}`, r.id)} disabled={!!busy} aria-label={`Answer: like “${r.title || 'this reference'}”`}>
                    <img src={r.thumb || r.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  </button>
                );
              })}
              {palettes.map((x) => (
                <button key={x.id} type="button" className="st-visual-pal" onClick={() => onPicture(`The palette “${x.name}”: ${x.colors.map((c) => c.hex).join(', ')}`)} disabled={!!busy} aria-label={`Answer: the palette ${x.name}`}>
                  {x.colors.slice(0, 5).map((c, i) => (
                    <span key={i} style={{ background: c.hex }} />
                  ))}
                </button>
              ))}
              {pairs.map((t) => (
                <button key={t.id} type="button" className="st-visual-type" onClick={() => onPicture(`Type like ${t.display} with ${t.body}`)} disabled={!!busy} aria-label={`Answer: type like ${t.display} with ${t.body}`}>
                  <span style={{ fontFamily: fontStack(t.display) }}>Aa</span>
                  <small>{t.display}</small>
                </button>
              ))}
            </div>
          </div>
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
          <button type="button" className="sb-link is-meta" onClick={onDelegate} disabled={!!busy} title="SocriaUX decides this, and will not ask it again">
            You decide
          </button>
          {answered >= 1 && (
            <button type="button" className="sb-link is-meta" onClick={onBrief} disabled={!!busy}>
              Write the brief now
            </button>
          )}
          <button type="button" className="sb-link is-meta" onClick={onSeeDirections} disabled={!!busy}>
            See directions
          </button>
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
  const answered = discovery.questions.filter((q) => q.answer || q.skipped || q.delegated);
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
                {q.delegated ? <p className="st-answer-skipped">Left to SocriaUX</p> : q.skipped ? <p className="st-answer-skipped">Skipped</p> : <EditLine value={q.answer} onSave={(v) => onEdit(q.id, v)} />}
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
