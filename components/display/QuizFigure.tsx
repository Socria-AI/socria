'use client';

// components/display/QuizFigure.tsx — the quiz, one question at a time, and its review.
//
// Draws the quiz display's canonical state (lib/objects/display-quiz.ts) and sends what the student does back
// as operations, so the Everything view and the expanded workspace — both draw this, from the same object —
// never disagree. It keeps nothing of its own but what is being typed, which card is open, and whether a
// request is in flight.
//
// Answers are graded by the server (app/api/logos/quiz/grade): the browser holds only sealed keys, so nothing
// in the markup, an attribute or the network gives an answer away before it is submitted. An answer is
// recorded before it is sent for grading, so a lost connection loses nothing: the answer waits, and "Check
// again" grades it.
//
// Taking:  the question (with its figure), the options or the box, Submit; then, by the quiz's mode, the
//          feedback (practice: right and why, or a cue and one more try), right or not (marks), or nothing
//          (an exam simulation); then the next question, chosen by what the answers show.
// Review:  the score, the questions missed first — the answer given, the right one, why in a sentence or two,
//          and Dive deeper — the topics to look at again, and three ways on: practise the weak spots, another
//          quiz, back to the conversation.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { compileExpr } from '@/lib/logos-math';
import { currentQuestion, mayAdvance, questionDone, reviewInputOf, type QuizState } from '@/lib/objects/display-quiz';
import { progressOf, DIFFICULTY_SAID } from '@/lib/quiz/adapt';
import { answerText, reviewOf, type ReviewItem } from '@/lib/quiz/review';
import { QUIZ_MODE_SAID, QUESTION_TYPE_SAID, type Graded, type QuizFigure as Fig, type QuizQuestion } from '@/lib/quiz/types';
import type { FigureProps } from '@/components/objects/figures';
import { MathText } from '@/components/TeX';
import { useDisplay } from './DisplayShell';
import './quiz.css';

type S = QuizState;

/** A request to the grading route; null when it could not be made (offline, or refused), with why. */
async function gradeRoute(body: Record<string, unknown>): Promise<{ ok: true; results: Record<string, { graded?: Graded; shown?: { correct: string; why: string } }> } | { ok: false; why: string }> {
  try {
    const r = await fetch('/api/logos/quiz/grade', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.results) return { ok: false, why: r.status === 403 ? 'This quiz belongs to another account.' : r.status === 429 ? 'Too many at once — wait a moment.' : (j?.error as string) || 'That could not be checked just now.' };
    return { ok: true, results: j.results };
  } catch {
    return { ok: false, why: 'You seem to be offline. Your answer is saved.' };
  }
}

export function QuizFigure(p: FigureProps) {
  const d = useDisplay<S>(p);
  const s = d.state;
  const live = d.live;
  if (!s) return null;
  if (p.mode !== 'live') return <QuizCard s={s} />;
  return s.phase === 'review' && s.view === 'review' ? <Review p={p} s={s} live={live} act={d.act} /> : <Taking p={p} s={s} live={live} act={d.act} why={d.why} />;
}

/** The quiz as a card, in a trail or a list: its name, how far along, its score once finished. */
function QuizCard({ s }: { s: S }) {
  const r = reviewOf(reviewInputOf(s));
  const prog = progressOf(s.asked, s.records, s.count);
  return (
    <div className="qz qz-card">
      <p className="qz-kicker">Quiz · {QUIZ_MODE_SAID[s.mode]}</p>
      <p className="qz-card-t">{s.title}</p>
      <p className="qz-card-s">{s.phase === 'review' ? `${r.right}/${r.total} right` : `${prog.done} of ${prog.total} answered`}</p>
    </div>
  );
}

type Act = (op: string, args: Record<string, string | number>) => boolean;

// ── taking the quiz ──────────────────────────────────────────────────

function Taking({ p, s, live, act, why }: { p: FigureProps; s: S; live: boolean; act: Act; why: string | null }) {
  const cur = currentQuestion(s);
  const [viewing, setViewing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | 'grading' | 'revealing' | 'finishing'>(null);
  const [error, setError] = useState<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const shownQ = viewing ? s.pool.find((q) => q.id === viewing) ?? cur : cur;
  const rec = shownQ ? s.records[shownQ.id] : undefined;
  const lastAttempt = rec?.attempts[rec.attempts.length - 1];
  const pending = !!lastAttempt && !lastAttempt.graded && s.mode !== 'exam';
  const done = shownQ ? questionDone(s, rec) : false;
  const prog = progressOf(s.asked, s.records, s.count);
  const index = shownQ ? s.asked.indexOf(shownQ.id) : -1;
  const isLast = s.asked.length >= s.count;

  // a new question: a clean box, and the heading in focus for a screen reader
  useEffect(() => {
    setDraft('');
    setPicked([]);
    setError(null);
    if (cur && !viewing) requestAnimationFrame(() => headRef.current?.focus({ preventScroll: true }));
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const answerNow = (): string => (shownQ?.type === 'multi' ? [...picked].sort().join(',') : shownQ?.type === 'single' || shownQ?.type === 'truefalse' ? picked[0] ?? '' : draft.trim());

  async function grade(q: QuizQuestion, answer: string, attempt: number) {
    setBusy('grading');
    setError(null);
    const r = await gradeRoute({ sessionId: p.session, quiz: s.quiz, action: 'grade', items: [{ qid: q.id, sealed: q.sealed, answer, attempt }] });
    setBusy(null);
    if (!r.ok) return setError(r.why);
    const g = r.results[q.id]?.graded;
    if (!g) return setError('That could not be checked just now.');
    act('grade', { q: q.id, n: attempt, g: JSON.stringify(g) });
    p.onWorkspace?.({ type: 'quiz', obj: p.obj.id, action: 'graded', q: q.id });
    requestAnimationFrame(() => feedRef.current?.focus({ preventScroll: true }));
  }

  async function submit() {
    if (!cur || busy || !live) return;
    const answer = answerNow();
    if (!answer) return setError(cur.type === 'multi' ? 'Choose at least one.' : cur.options ? 'Choose an answer.' : 'Type an answer first.');
    const attempt = s.records[cur.id]?.attempts.length ?? 0;
    if (!act('answer', { q: cur.id, a: answer, t: Date.now(), helped: 0 })) return;
    if (s.mode === 'exam') return requestAnimationFrame(() => feedRef.current?.focus({ preventScroll: true }));
    await grade(cur, answer, attempt);
  }

  async function reveal() {
    if (!cur || busy) return;
    setBusy('revealing');
    const r = await gradeRoute({ sessionId: p.session, quiz: s.quiz, action: 'reveal', items: [{ qid: cur.id, sealed: cur.sealed }] });
    setBusy(null);
    if (!r.ok) return setError(r.why);
    const shown = r.results[cur.id]?.shown;
    if (shown) act('reveal', { q: cur.id, correct: shown.correct, why: shown.why });
  }

  async function finish() {
    if (busy) return;
    setBusy('finishing');
    act('finish', { t: Date.now() });
    await finishGrades(p, { ...s, phase: 'review' }, act);
    setBusy(null);
    p.onWorkspace?.({ type: 'quiz', obj: p.obj.id, action: 'finished' });
  }

  const next = () => {
    setViewing(null);
    if (!act('next', {})) return;
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const typing = (e.target as HTMLElement).closest('input[type="text"], textarea');
    if (!cur || viewing) return;
    if (!typing && cur.options && /^[1-6]$/.test(e.key) && !done) {
      const o = cur.options[Number(e.key) - 1];
      if (o) {
        e.preventDefault();
        setPicked((x) => (cur.type === 'multi' ? (x.includes(o.id) ? x.filter((y) => y !== o.id) : [...x, o.id]) : [o.id]));
      }
    }
    // Enter submits (and goes on), as the chat box does; Shift+Enter is a new line in a written answer
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!done && !pending) void submit();
      else if (done && mayAdvance(s)) next();
    }
  };

  // not started: what it is, what it is made from, and Start
  if (!s.asked.length) {
    return (
      <div className="qz qz-live" aria-label={`Quiz: ${s.title}`}>
        <Head s={s} />
        <div className="qz-intro">
          <p className="qz-intro-n">
            {s.count} {s.count === 1 ? 'question' : 'questions'} · one at a time · {QUIZ_MODE_SAID[s.mode]}
          </p>
          <Basis s={s} />
          {live && (
            <button type="button" className="qz-primary" onClick={next} autoFocus>
              Start
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!shownQ) return null;
  const graded = lastAttempt?.graded ?? null;
  const reviewing = !!viewing && viewing !== cur?.id;
  return (
    <div className="qz qz-live" onKeyDown={onKey} aria-label={`Quiz: ${s.title}`}>
      <Head s={s} />
      <Progress s={s} current={cur?.id ?? null} viewing={viewing} onView={(id) => setViewing(id === cur?.id ? null : id)} />
      <div className="qz-q" key={shownQ.id}>
        <p className="qz-q-meta">
          <span className="qz-q-n">
            Question {index + 1} of {s.count}
          </span>
          <span className="qz-chip">{shownQ.topic}</span>
          <span className="qz-q-d" title={`Difficulty: ${DIFFICULTY_SAID[shownQ.difficulty]}`}>
            {DIFFICULTY_SAID[shownQ.difficulty]}
          </span>
        </p>
        <h3 className="qz-stem" ref={headRef} tabIndex={-1}>
          <MathText>{shownQ.stem}</MathText>
        </h3>
        {shownQ.figure && <QuizPlot fig={shownQ.figure} />}
        <Answer q={shownQ} rec={rec} live={live && !reviewing && !done && !pending && !busy} picked={picked} setPicked={setPicked} draft={draft} setDraft={setDraft} graded={s.mode !== 'exam' ? graded : null} mode={s.mode} />
        <div className="qz-feed" ref={feedRef} tabIndex={-1} aria-live="polite">
          {busy === 'grading' && <p className="qz-checking">Checking…</p>}
          {error && (
            <p className="qz-error" role="alert">
              {error}
              {pending && cur && lastAttempt && (
                <button type="button" className="qz-link" onClick={() => void grade(cur, lastAttempt.answer, rec!.attempts.length - 1)}>
                  Check again
                </button>
              )}
            </p>
          )}
          {!busy && <Feedback s={s} q={shownQ} rec={rec} live={live && !reviewing} onRetry={() => setPicked([])} onReveal={() => void reveal()} onSelf={(mark) => act('selfmark', { q: shownQ.id, mark })} />}
        </div>
        {why && <p className="qz-error">{why}</p>}
      </div>
      {live && (
        <div className="qz-foot">
          {reviewing ? (
            <button type="button" className="qz-secondary" onClick={() => setViewing(null)}>
              Back to question {s.asked.indexOf(cur!.id) + 1}
            </button>
          ) : !done ? (
            <button type="button" className="qz-primary" onClick={() => void submit()} disabled={!!busy || pending || !answerNow()}>
              {s.mode === 'exam' ? 'Save answer' : 'Submit'}
            </button>
          ) : isLast ? (
            <button type="button" className="qz-primary" onClick={() => void finish()} disabled={!!busy}>
              {busy === 'finishing' ? 'Checking your answers…' : 'See your results'}
            </button>
          ) : (
            <button type="button" className="qz-primary" onClick={next} disabled={!mayAdvance(s)}>
              Next question
            </button>
          )}
          {!reviewing && !isLast && (
            <button type="button" className="qz-link qz-end" onClick={() => void finish()} disabled={!!busy}>
              End quiz now
            </button>
          )}
          <span className="qz-foot-n" aria-hidden="true">
            {prog.done}/{prog.total}
          </span>
        </div>
      )}
    </div>
  );
}

/** The head: the course and mode, the title. */
function Head({ s }: { s: S }) {
  return (
    <header className="qz-head">
      <p className="qz-kicker">
        {s.basis.course ? `${s.basis.course}${s.basis.instructor ? ` · ${s.basis.instructor}` : ''} · ` : ''}
        {QUIZ_MODE_SAID[s.mode]}
      </p>
      <h2 className="qz-title">{s.title}</h2>
    </header>
  );
}

/** Where the questions came from, and how the professor's style was used — said plainly. */
function Basis({ s }: { s: S }) {
  const b = s.basis;
  const from = b.sources.length ? `From ${b.sources.slice(0, 3).map((x) => x.title).join(', ')}${b.sources.length > 3 ? ` and ${b.sources.length - 3} more` : ''}.` : null;
  return (
    <div className="qz-basis">
      {from && <p>{from}</p>}
      {b.grounding === 'mixed' && <p>Some questions use general knowledge of the subject; they are marked.</p>}
      {b.grounding === 'general' && <p>No course material was available, so these questions come from general knowledge of the subject.</p>}
      {b.style && b.style.basis !== 'unknown' && <p>{b.style.said}</p>}
      {b.missing.map((m) => (
        <p key={m} className="qz-missing">
          {m}
        </p>
      ))}
    </div>
  );
}

/** The progress strip: a dot per question; answered ones may be looked back at (read only). */
function Progress({ s, current, viewing, onView }: { s: S; current: string | null; viewing: string | null; onView: (id: string) => void }) {
  const dots = Array.from({ length: s.count }, (_, i) => s.asked[i] ?? null);
  return (
    <nav className="qz-prog" aria-label="Questions">
      <div className="qz-bar" role="progressbar" aria-valuemin={0} aria-valuemax={s.count} aria-valuenow={progressOf(s.asked, s.records, s.count).done} aria-label="Questions answered">
        <span style={{ width: `${(progressOf(s.asked, s.records, s.count).done / s.count) * 100}%` }} />
      </div>
      <ol className="qz-dots">
        {dots.map((id, i) => {
          const r = id ? s.records[id] : undefined;
          const g = r?.attempts[r.attempts.length - 1]?.graded?.grade;
          const state = !id ? 'is-todo' : s.mode === 'exam' ? (r?.attempts.length ? 'is-answered' : 'is-now') : g ? (g === 'right' || g === 'close' || (g === 'unsure' && r?.selfMark === 'right') ? 'is-right' : g === 'unsure' && !r?.selfMark ? 'is-answered' : 'is-wrong') : 'is-now';
          return (
            <li key={i}>
              <button type="button" className={`qz-dot ${state}${(viewing ?? current) === id ? ' is-on' : ''}`} disabled={!id || !r?.attempts.length} onClick={() => id && onView(id)} aria-label={`Question ${i + 1}${!id ? ', not yet asked' : state === 'is-right' ? ', right' : state === 'is-wrong' ? ', not right' : r?.attempts.length ? ', answered' : ', now'}`}>
                {i + 1}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The options, or the box: accessible as native radios and checkboxes; nothing in them says which is right. */
function Answer({
  q,
  rec,
  live,
  picked,
  setPicked,
  draft,
  setDraft,
  graded,
  mode,
}: {
  q: QuizQuestion;
  rec: S['records'][string] | undefined;
  live: boolean;
  picked: string[];
  setPicked: (f: (x: string[]) => string[]) => void;
  draft: string;
  setDraft: (v: string) => void;
  graded: Graded | null;
  mode: S['mode'];
}) {
  const last = rec?.attempts[rec.attempts.length - 1];
  const given = live ? null : last?.answer ?? null;
  const name = `qz-${q.id}`;
  if (q.options) {
    const chosen = given !== null ? given.split(',') : picked;
    const showRight = !!rec?.shown && mode === 'practice';
    return (
      <fieldset className={`qz-opts${q.type === 'truefalse' ? ' is-tf' : ''}`} disabled={!live}>
        <legend className="qz-sr">{QUESTION_TYPE_SAID[q.type]}</legend>
        {q.options.map((o, i) => {
          const on = chosen.includes(o.id);
          const isRightText = showRight && rec?.shown?.correct.split('; ').includes(o.text);
          const cls = ['qz-opt', on ? 'is-on' : '', graded && on ? (graded.grade === 'right' || graded.grade === 'close' ? 'is-right' : 'is-wrong') : '', isRightText ? 'is-key' : ''].filter(Boolean).join(' ');
          return (
            <label key={o.id} className={cls}>
              <input
                type={q.type === 'multi' ? 'checkbox' : 'radio'}
                name={name}
                value={o.id}
                checked={on}
                onChange={() => setPicked((x) => (q.type === 'multi' ? (x.includes(o.id) ? x.filter((y) => y !== o.id) : [...x, o.id]) : [o.id]))}
              />
              <span className="qz-opt-k" aria-hidden="true">
                {q.type === 'truefalse' ? '' : 'ABCDEF'[i]}
              </span>
              <span className="qz-opt-t">
                <MathText>{o.text}</MathText>
              </span>
            </label>
          );
        })}
        {q.type === 'multi' && <p className="qz-hint">Choose all that apply.</p>}
      </fieldset>
    );
  }
  const multiline = q.type === 'short';
  return (
    <div className="qz-box">
      <label className="qz-sr" htmlFor={name}>
        Your answer
      </label>
      {multiline ? (
        <textarea id={name} className="qz-input" rows={3} value={given ?? draft} onChange={(e) => setDraft(e.target.value)} disabled={!live} placeholder="A word, a phrase or a sentence" maxLength={400} />
      ) : (
        <div className="qz-num">
          {q.unit === '$' && <span className="qz-unit">$</span>}
          <input
            id={name}
            type="text"
            inputMode={q.type === 'numeric' ? 'decimal' : 'text'}
            className="qz-input"
            value={given ?? draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!live}
            placeholder={q.type === 'expression' ? 'e.g. 3x^2 - 2' : 'Your answer'}
            autoComplete="off"
            spellCheck={false}
            maxLength={120}
          />
          {q.unit && q.unit !== '$' && <span className="qz-unit">{q.unit}</span>}
        </div>
      )}
      {q.type === 'numeric' && <p className="qz-hint">Fractions, decimals and roots are all fine (3/4, 0.75, sqrt(2)).</p>}
    </div>
  );
}

/** What the grade says, by the mode: in practice a cue and one more try after a first miss. */
function Feedback({ s, q, rec, live, onRetry, onReveal, onSelf }: { s: S; q: QuizQuestion; rec: S['records'][string] | undefined; live: boolean; onRetry: () => void; onReveal: () => void; onSelf: (m: 'right' | 'wrong') => void }) {
  const last = rec?.attempts[rec.attempts.length - 1];
  if (!last) return null;
  if (s.mode === 'exam') return <p className="qz-saved">Answer saved. Results come at the end.</p>;
  const g = last.graded;
  if (!g) return null;
  if (rec?.revealed && rec.shown)
    return (
      <div className="qz-fb is-shown">
        <p className="qz-fb-t">The answer: {rec.shown.correct}</p>
        {rec.shown.why && <p className="qz-fb-why">{rec.shown.why}</p>}
      </div>
    );
  if (s.mode === 'marks') return <p className={`qz-fb-mark ${g.grade === 'right' || g.grade === 'close' ? 'is-right' : 'is-wrong'}`}>{g.grade === 'right' || g.grade === 'close' ? 'Right.' : g.grade === 'partial' ? 'Partly right.' : g.grade === 'unsure' ? 'Recorded — checked at the end.' : 'Not right.'} Explanations come at the end.</p>;
  if (g.grade === 'unsure')
    return (
      <div className="qz-fb is-unsure">
        <p className="qz-fb-t">Check yours against this answer:</p>
        <p className="qz-fb-model">{g.correct}</p>
        {g.why && <p className="qz-fb-why">{g.why}</p>}
        {rec?.selfMark ? (
          <p className="qz-fb-why">You marked it {rec.selfMark === 'right' ? 'right' : 'not right'}.</p>
        ) : (
          live && (
            <p className="qz-self">
              Was yours right?{' '}
              <button type="button" className="qz-secondary" onClick={() => onSelf('right')}>
                Yes
              </button>
              <button type="button" className="qz-secondary" onClick={() => onSelf('wrong')}>
                No
              </button>
            </p>
          )
        )}
      </div>
    );
  if (g.grade === 'right' || g.grade === 'close')
    return (
      <div className="qz-fb is-right">
        <p className="qz-fb-t">{g.grade === 'close' ? 'Right — with a slip.' : rec!.attempts.length > 1 ? 'Right, on the second try.' : 'Right.'}</p>
        {g.mistake && g.grade === 'close' && <p className="qz-fb-why">{g.mistake.note}</p>}
        {g.why && <p className="qz-fb-why">{g.why}</p>}
      </div>
    );
  // a miss: a first one gets a cue and one more try; after that, the answer and why
  const first = rec!.attempts.length === 1 && !questionDone(s, rec);
  return (
    <div className="qz-fb is-wrong">
      <p className="qz-fb-t">{g.grade === 'partial' ? 'Partly right.' : 'Not quite.'}</p>
      {g.mistake && g.mistake.evidence !== 'insufficient' && <p className="qz-fb-may">{g.mistake.evidence === 'confirmed' ? g.mistake.note : `This may suggest: ${g.mistake.note.replace(/^(this|that) may (mean|suggest)\s*/i, '')}`}</p>}
      {first ? (
        <>
          {g.cue && <p className="qz-fb-cue">{g.cue}</p>}
          {live && (
            <p className="qz-fb-acts">
              <button type="button" className="qz-secondary" onClick={onRetry}>
                Try again
              </button>
              <button type="button" className="qz-link" onClick={onReveal}>
                Show the answer
              </button>
            </p>
          )}
        </>
      ) : (
        <>
          {g.correct && <p className="qz-fb-ans">The answer: {g.correct}</p>}
          {g.why && <p className="qz-fb-why">{g.why}</p>}
        </>
      )}
      {q.sources[0] && (
        <p className="qz-src">
          From {q.sources[0].title}
          {q.sources[0].page ? `, p. ${q.sources[0].page}` : ''}
        </p>
      )}
    </div>
  );
}

/** At the end: grade what waits (an exam's answers, a lost connection's) and keep the answer and why for every question. */
async function finishGrades(p: FigureProps, s: S, act: Act): Promise<boolean> {
  const items = s.asked.map((id) => {
    const q = s.pool.find((x) => x.id === id)!;
    const r = s.records[id];
    const last = r?.attempts[r.attempts.length - 1];
    return { qid: id, sealed: q.sealed, answer: last?.answer ?? '', attempt: r?.attempts.length ? r.attempts.length - 1 : 0 };
  });
  // the ones still to come, too, so the review can show what they were
  const r = await gradeRoute({ sessionId: p.session, quiz: s.quiz, action: 'finish', items });
  if (!r.ok) return false;
  for (const id of s.asked) {
    const res = r.results[id];
    const rec = s.records[id];
    const n = rec?.attempts.length ? rec.attempts.length - 1 : -1;
    if (res?.graded && n >= 0 && !rec.attempts[n].graded) act('grade', { q: id, n, g: JSON.stringify(res.graded) });
    const shown = res?.graded?.correct ? { correct: res.graded.correct, why: res.graded.why ?? '' } : res?.shown;
    if (shown && !rec?.shown) act('shown', { q: id, correct: shown.correct, why: shown.why });
  }
  return true;
}

// ── the review ───────────────────────────────────────────────────────

function Review({ p, s, live, act }: { p: FigureProps; s: S; live: boolean; act: Act }) {
  const r = useMemo(() => reviewOf(reviewInputOf(s)), [s]);
  const [showRight, setShowRight] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // answers still waiting for a grade (a connection lost at the end): checked again, here
  const waiting = s.asked.filter((id) => {
    const rec = s.records[id];
    const last = rec?.attempts[rec.attempts.length - 1];
    return (last && !last.graded) || !rec?.shown;
  });
  const checkNow = async () => {
    setBusy(true);
    setError(null);
    const ok = await finishGrades(p, s, act);
    setBusy(false);
    if (!ok) setError('They could not be checked just now. Try again in a moment.');
    else p.onWorkspace?.({ type: 'quiz', obj: p.obj.id, action: 'finished' });
  };
  const ws = (action: 'deep-dive' | 'practice' | 'another' | 'return', q?: string, how?: 'reasoning' | 'similar' | 'concept') => p.onWorkspace?.({ type: 'quiz', obj: p.obj.id, action, ...(q ? { q } : {}), ...(how ? { how } : {}) });
  const pct = r.total ? Math.round((r.right / r.total) * 100) : 0;
  return (
    <div className="qz qz-live qz-review" aria-label={`Quiz results: ${s.title}`}>
      <header className="qz-head">
        <p className="qz-kicker">Results{s.basis.course ? ` · ${s.basis.course}` : ''}</p>
        <h2 className="qz-title">{s.title}</h2>
      </header>
      <section className="qz-score" aria-label="Score">
        <p className="qz-score-n">
          <span className="qz-score-big">{r.right}</span>
          <span className="qz-score-of">/{r.total}</span>
        </p>
        <div className="qz-score-side">
          <p className="qz-score-pct">{pct}%</p>
          <ul className="qz-counts">
            <li className="is-right">{r.right} right</li>
            {r.helped > 0 && <li className="is-helped">{r.helped} right on a second try</li>}
            <li className="is-wrong">{r.wrong} missed</li>
            {r.unanswered > 0 && <li className="is-none">{r.unanswered} unanswered</li>}
          </ul>
        </div>
      </section>
      {r.topics.length > 0 && (
        <section className="qz-topics" aria-label="Topics to review">
          <p className="qz-label">To review</p>
          <ul>
            {r.topics.map((t) => (
              <li key={t.topic} className="qz-chip is-review">
                {t.topic} · {t.missed} of {t.of}
              </li>
            ))}
          </ul>
        </section>
      )}
      {waiting.length > 0 && (
        <p className="qz-waiting" role="status">
          {waiting.length === 1 ? 'One answer is' : `${waiting.length} answers are`} still to be checked.{' '}
          {live && (
            <button type="button" className="qz-link" onClick={() => void checkNow()} disabled={busy}>
              {busy ? 'Checking…' : 'Check now'}
            </button>
          )}
          {error && <span className="qz-error"> {error}</span>}
        </p>
      )}
      {r.perfect ? (
        <section className="qz-perfect">
          <p className="qz-perfect-t">Every answer right.</p>
          <p>One quiz does not show it will stay — a harder set, or the same ideas again in a few days, would.</p>
        </section>
      ) : (
        r.missed.length > 0 && (
          <section className="qz-missed" aria-label="Questions you missed">
            <p className="qz-label">Questions you missed</p>
            {r.missed.map((it) => (
              <ReviewCard key={it.q.id} it={it} open={open === it.q.id} live={live} onToggle={() => setOpen((x) => (x === it.q.id ? null : it.q.id))} onDive={(how) => (act('look', { q: it.q.id }), ws('deep-dive', it.q.id, how))} />
            ))}
          </section>
        )
      )}
      {r.items.some((it) => it.outcome === 'right') && (
        <section className="qz-rights">
          <button type="button" className="qz-link" onClick={() => setShowRight((x) => !x)} aria-expanded={showRight}>
            {showRight ? 'Hide' : 'Show'} the ones you got right ({r.items.filter((it) => it.outcome === 'right').length})
          </button>
          {showRight && r.items.filter((it) => it.outcome === 'right').map((it) => <ReviewCard key={it.q.id} it={it} open={false} live={false} onToggle={() => {}} onDive={() => {}} />)}
        </section>
      )}
      {live && (
        <nav className="qz-next" aria-label="What next">
          {r.missed.length > 0 && (
            <button type="button" className="qz-primary" onClick={() => ws('practice')}>
              Practise weak spots
            </button>
          )}
          <button type="button" className={r.missed.length ? 'qz-secondary' : 'qz-primary'} onClick={() => ws('another')}>
            {r.perfect ? 'A harder quiz' : 'Take another quiz'}
          </button>
          <button type="button" className="qz-link" onClick={() => ws('return')}>
            Back to the conversation
          </button>
        </nav>
      )}
      <footer className="qz-review-foot">
        <Basis s={s} />
        {s.phase === 'review' && (
          <button type="button" className="qz-link" onClick={() => act('view', { view: 'quiz' })}>
            Look through the questions
          </button>
        )}
      </footer>
    </div>
  );
}

function ReviewCard({ it, open, live, onToggle, onDive }: { it: ReviewItem; open: boolean; live: boolean; onToggle: () => void; onDive: (how: 'reasoning' | 'similar' | 'concept') => void }) {
  const helped = it.outcome === 'helped';
  const wrong = it.outcome === 'wrong' || it.outcome === 'partial' || helped;
  return (
    <article className={`qz-rc ${wrong ? 'is-wrong' : 'is-right'}`} aria-label={`Question ${it.n}: ${it.q.topic}`}>
      <p className="qz-rc-meta">
        <span className="qz-q-n">Question {it.n}</span>
        <span className="qz-chip">{it.q.topic}</span>
        {helped && <span className="qz-rc-tag">Right on the second try</span>}
      </p>
      <p className="qz-rc-stem">
        <MathText>{it.q.stem}</MathText>
      </p>
      {it.q.figure && <QuizPlot fig={it.q.figure} small />}
      <dl className="qz-rc-ans">
        <div className={wrong ? 'is-wrong' : 'is-right'}>
          <dt>{helped ? 'Your first answer' : 'Your answer'}</dt>
          <dd>{it.yours ?? 'No answer'}</dd>
        </div>
        {wrong && it.correct && (
          <div className="is-right">
            <dt>Correct answer</dt>
            <dd>
              <MathText>{it.correct}</MathText>
            </dd>
          </div>
        )}
      </dl>
      {it.why && (
        <p className="qz-rc-why">
          <span className="qz-label-in">Why</span> {it.why}
        </p>
      )}
      {wrong && it.mistake && it.mistake.evidence !== 'insufficient' && <p className="qz-fb-may">{it.mistake.evidence === 'confirmed' ? it.mistake.note : `This may suggest: ${it.mistake.note.replace(/^(this|that) may (mean|suggest)\s*/i, '')}`}</p>}
      {it.q.sources[0] && (
        <p className="qz-src">
          From {it.q.sources[0].title}
          {it.q.sources[0].page ? `, p. ${it.q.sources[0].page}` : ''}
        </p>
      )}
      {wrong && live && (
        <div className="qz-dive">
          <button type="button" className="qz-dive-btn" aria-expanded={open} onClick={onToggle}>
            Dive deeper
          </button>
          {open && (
            <div className="qz-dive-opts" role="group" aria-label={`Go deeper on question ${it.n}`}>
              <button type="button" className="qz-secondary" onClick={() => onDive('reasoning')}>
                Understand the reasoning
              </button>
              <button type="button" className="qz-secondary" onClick={() => onDive('similar')}>
                Try a similar question
              </button>
              <button type="button" className="qz-secondary" onClick={() => onDive('concept')}>
                Review the concept
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ── a figure: curves drawn from their own expressions, so what is shown is what is graded ──

function QuizPlot({ fig, small = false }: { fig: Fig; small?: boolean }) {
  const W = small ? 320 : 460;
  const H = small ? 200 : 280;
  const pad = { l: 46, r: 18, t: 14, b: 38 };
  const sx = (x: number) => pad.l + ((x - fig.x.min) / (fig.x.max - fig.x.min)) * (W - pad.l - pad.r);
  const sy = (y: number) => H - pad.b - ((y - fig.y.min) / (fig.y.max - fig.y.min)) * (H - pad.t - pad.b);
  const paths = fig.curves.map((c) => {
    const f = compileExpr(c.expr, ['x']);
    if (!f) return { c, d: '', end: null as null | [number, number] };
    let d = '';
    let pen = false;
    let end: [number, number] | null = null;
    for (let i = 0; i <= 160; i++) {
      const x = fig.x.min + ((fig.x.max - fig.x.min) * i) / 160;
      const y = f.eval({ x });
      if (!Number.isFinite(y) || y < fig.y.min - (fig.y.max - fig.y.min) * 0.02 || y > fig.y.max + (fig.y.max - fig.y.min) * 0.02) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(Math.min(fig.y.max, Math.max(fig.y.min, y))).toFixed(1)}`;
      pen = true;
      end = [sx(x), sy(Math.min(fig.y.max, Math.max(fig.y.min, y)))];
    }
    return { c, d, end };
  });
  const ticks = (min: number, max: number) => {
    const step = Math.pow(10, Math.floor(Math.log10((max - min) / 4)));
    const nice = [1, 2, 5, 10].map((m) => m * step).find((s) => (max - min) / s <= 6) ?? step * 10;
    const out: number[] = [];
    for (let v = Math.ceil(min / nice) * nice; v <= max + 1e-9; v += nice) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  };
  return (
    <figure className={`qz-plot${small ? ' is-small' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${fig.title ?? 'Graph'}: ${fig.curves.map((c) => c.label || c.id).join(', ')} against ${fig.x.label}`}>
        {ticks(fig.y.min, fig.y.max).map((v) => (
          <g key={`y${v}`}>
            <line className="qz-grid" x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} />
            <text className="qz-tick" x={pad.l - 6} y={sy(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {ticks(fig.x.min, fig.x.max).map((v) => (
          <text key={`x${v}`} className="qz-tick" x={sx(v)} y={H - pad.b + 16} textAnchor="middle">
            {v}
          </text>
        ))}
        <line className="qz-axis" x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} />
        <line className="qz-axis" x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} />
        <text className="qz-axis-l" x={(W + pad.l) / 2} y={H - 6} textAnchor="middle">
          {fig.x.label}
        </text>
        <text className="qz-axis-l" x={12} y={(H - pad.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(H - pad.b) / 2})`}>
          {fig.y.label}
        </text>
        {paths.map(({ c, d, end }, i) => (
          <g key={c.id} className={`qz-curve c${i % 4}`}>
            <path d={d} strokeDasharray={c.dashed ? '6 5' : undefined} />
            {end && (
              <text x={Math.min(end[0] + 4, W - pad.r - 2)} y={Math.max(end[1] - 6, pad.t + 10)} textAnchor={end[0] > W - 60 ? 'end' : 'start'}>
                {c.label || c.id}
              </text>
            )}
          </g>
        ))}
        {(fig.points ?? []).map((pt) => (
          <g key={pt.label} className="qz-pt">
            <circle cx={sx(pt.x)} cy={sy(pt.y)} r={4} />
            <text x={sx(pt.x) + 7} y={sy(pt.y) - 7}>
              {pt.label}
            </text>
          </g>
        ))}
      </svg>
      {fig.title && <figcaption>{fig.title}</figcaption>}
    </figure>
  );
}


