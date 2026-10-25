'use client';
// components/logos5/Study.tsx — Logos 5's study path, drawn.
//
//   StudyBoard      the files as topics, with the files' own words and pages
//   TopicInspector  one topic: every quote, and what to do with it
//   StudyPractice   practice made from the files, checked when submitted
//   StudySteps      where you are: Components · Practice · Logic Map
//
// Nothing here talks to a model or a database. It draws a study
// (lib/logos5/study.ts) and says what the person did; LogosApp does the rest.
// A study is begun from the Universal Map's box (UniverseParts.tsx
// FindOrStart): files dropped there are sorted into the topics drawn here.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  STUDY_ACCEPT,
  TOPIC_KIND_LABEL,
  blanksOf,
  checkPractice,
  clozeHint,
  filledOf,
  boardRows,
  kindSaid,
  questionsSaid,
  money,
  shortName,
  sortedSaid,
  sourcesOf,
  whereSaid,
  type Gap,
  type Practice,
  type StudyFile,
  type StudyQuote,
  type StudyState,
  type StudyTopic,
} from '@/lib/logos5/study';
import { MakeGallery } from './MakeGallery';
import './study.css';

/** a layout effect in the browser; on the server (which renders first) an ordinary one, so nothing warns */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** What a line of thinking's screen shows: its files as topics, what was made from it, or its Logic Map. */
export type StudyTab = 'components' | 'artifacts' | 'logic';

// ── a file's place, as a chip ────────────────────────────────────────

export function SourceChip({ q, files, long = false, onOpen }: { q: StudyQuote; files: StudyFile[]; long?: boolean; onOpen?: (q: StudyQuote) => void }) {
  const f = files.find((x) => x.doc === q.doc);
  const said = long ? whereSaid(q, files) : `${f ? shortName(f.name) : 'File'} · p.${q.page}`;
  return onOpen ? (
    <button type="button" className="l5s-chip is-src" onClick={(e) => (e.stopPropagation(), onOpen(q))} title={`Open ${whereSaid(q, files)}`}>
      <span aria-hidden="true">◇</span> {said}
    </button>
  ) : (
    <span className="l5s-chip is-src">
      <span aria-hidden="true">◇</span> {said}
    </span>
  );
}

// ── the board ────────────────────────────────────────────────────────

/** What a card says about where it comes from and what it holds: places in the files, questions, counts. */
function chipsOf(t: StudyTopic, files: StudyFile[]): { key: string; label: string; src: boolean }[] {
  const out: { key: string; label: string; src: boolean }[] = [];
  const asked = new Map((t.questions ?? []).map((q) => [q.doc, q.ns]));
  const seen = new Set<string>();
  for (const q of t.quotes) {
    const f = files.find((x) => x.doc === q.doc);
    const name = f ? shortName(f.name) : 'File';
    const ns = asked.get(q.doc);
    // a file of questions is named by its questions, not its pages
    const key = ns ? q.doc : `${q.doc}:${q.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: ns ? `${name} ${questionsSaid(ns)}` : `${name} · p.${q.page}`, src: true });
  }
  if (t.quotes.length > 1) out.push({ key: 'quotes', label: `${t.quotes.length} quotes`, src: false });
  if (t.tables) out.push({ key: 'tables', label: t.tables === 1 ? '1 table' : `${t.tables} tables`, src: false });
  if (t.formulas) out.push({ key: 'formulas', label: t.formulas === 1 ? '1 formula' : `${t.formulas} formulas`, src: false });
  if (t.terms) out.push({ key: 'terms', label: `${t.terms} ${t.terms === 1 ? 'term' : 'terms'}`, src: false });
  return out;
}

function TopicCard({
  t,
  files,
  start,
  dim,
  on,
  compact,
  onPick,
  cardRef,
}: {
  t: StudyTopic;
  files: StudyFile[];
  start: boolean;
  dim: boolean;
  on: boolean;
  /** beneath the lead row: its name, its count and two chips */
  compact: boolean;
  onPick: () => void;
  cardRef: (el: HTMLButtonElement | null) => void;
}) {
  const chips = chipsOf(t, files);
  const n = sourcesOf(t);
  // a compact card keeps one place and what it holds besides
  const shown = compact ? [...chips.filter((c) => c.src).slice(0, 2), ...chips.filter((c) => !c.src && c.key !== 'quotes')].slice(0, 2) : chips.slice(0, 4);
  const chipEls = shown.map((c) => (
    <span key={c.key} className={`l5s-chip${c.src ? ' is-src' : ''}`}>
      {c.src && <span aria-hidden="true">◇</span>} {c.label}
    </span>
  ));
  return (
    <button
      ref={cardRef}
      type="button"
      className={`l5s-card is-${t.kind}${compact ? ' is-compact' : ''}${start ? ' is-start' : ''}${dim ? ' is-dim' : ''}${on ? ' is-on' : ''}`}
      onClick={onPick}
      aria-pressed={on}
      aria-label={`${t.title}, ${kindSaid(t).toLowerCase()}, ${n} ${n === 1 ? 'source' : 'sources'}${start ? ', recommended start' : ''}`}
    >
      {start && <span className="l5s-tab">Recommended start</span>}
      {compact ? (
        <span className="l5s-card-top">
          <span className="l5s-card-title">{t.title}</span>
          <span className="l5s-card-n">{n}</span>
        </span>
      ) : (
        <>
          <span className="l5s-card-top">
            <span className="l5s-kind">{kindSaid(t)}</span>
            <span className="l5s-card-n">
              {n} {n === 1 ? 'source' : 'sources'}
            </span>
          </span>
          <span className="l5s-card-title">{t.title}</span>
          {t.quotes[0] && <span className="l5s-card-quote">“{t.quotes[0].text}”</span>}
        </>
      )}
      {chipEls.length > 0 && <span className="l5s-card-foot">{chipEls}</span>}
    </button>
  );
}

export function StudyBoard({
  study,
  selected,
  onSelect,
  inspector,
  start,
  narrow,
}: {
  study: StudyState;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** the topic's own panel, when one is selected */
  inspector?: ReactNode;
  /** the "where do you want to start?" panel */
  start?: ReactNode;
  narrow: boolean;
}) {
  const rows = useMemo(() => boardRows(study.topics, study.start), [study.topics, study.start]);
  const byId = useMemo(() => new Map(study.topics.map((t) => [t.id, t])), [study.topics]);
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const [paths, setPaths] = useState<{ id: string; d: string; lit: boolean }[]>([]);
  const links = useMemo(() => study.topics.flatMap((t) => t.after.map((a) => ({ from: a, to: t.id }))), [study.topics]);

  // the links between cards are drawn from where the cards actually are
  useBrowserLayoutEffect(() => {
    const el = box.current;
    if (!el || narrow) {
      setPaths([]);
      return;
    }
    const draw = () => {
      const o = el.getBoundingClientRect();
      const out: { id: string; d: string; lit: boolean }[] = [];
      for (const l of links) {
        let a = cards.current.get(l.from)?.getBoundingClientRect();
        let b = cards.current.get(l.to)?.getBoundingClientRect();
        if (!a || !b) continue;
        let d: string;
        if (b.top > a.bottom - 4 || a.top > b.bottom - 4) {
          // one row to the next: from the bottom of the upper card to the top of the lower
          if (a.top > b.top) [a, b] = [b, a];
          const x1 = a.left + a.width / 2 - o.left;
          const y1 = a.bottom - o.top;
          const x2 = b.left + b.width / 2 - o.left;
          const y2 = b.top - o.top;
          const my = (y1 + y2) / 2;
          d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
        } else {
          // side by side in a row
          if (a.left > b.left) [a, b] = [b, a];
          const x1 = a.right - o.left;
          const y1 = a.top + a.height / 2 - o.top;
          const x2 = b.left - o.left;
          const y2 = b.top + b.height / 2 - o.top;
          const mx = (x1 + x2) / 2;
          d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
        }
        out.push({ id: `${l.from}-${l.to}`, d, lit: !!selected && (l.from === selected || l.to === selected) });
      }
      setPaths(out);
    };
    draw();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    ro?.observe(el);
    for (const c of cards.current.values()) ro?.observe(c);
    return () => ro?.disconnect();
  }, [links, selected, narrow, rows, inspector]);

  const card = (id: string, compact: boolean) => {
    const t = byId.get(id);
    if (!t) return null;
    return (
      <TopicCard
        key={t.id}
        t={t}
        files={study.files}
        start={t.id === study.start}
        dim={!!selected && selected !== t.id}
        on={selected === t.id}
        compact={compact}
        onPick={() => onSelect(selected === t.id ? null : t.id)}
        cardRef={(el) => {
          if (el) cards.current.set(t.id, el);
          else cards.current.delete(t.id);
        }}
      />
    );
  };

  return (
    <div className={`l5s-boardwrap${inspector ? ' has-inspector' : ''}`}>
      <div className="l5s-boardcol">
        <div className="l5s-board" ref={box} onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
          <svg className="l5s-links" aria-hidden="true">
            {paths.map((p) => (
              <path key={p.id} d={p.d} className={p.lit ? 'is-lit' : ''} />
            ))}
          </svg>
          <div className={`l5s-lead is-${rows.lead.length}`} onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
            {rows.lead.map((id) => card(id, false))}
          </div>
          {rows.rest.length > 0 && (
            <div className="l5s-rest" onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
              {rows.rest.map((id) => card(id, true))}
            </div>
          )}
        </div>
        {start}
      </div>
      {inspector}
    </div>
  );
}

/** "SOCRIA · sorted 3 files into 7 topics — Where do you want to start?" */
export function StartPanel({
  study,
  onStudy,
  onDeep,
  onRecommend,
  onClose,
  note,
}: {
  study: StudyState;
  onStudy: () => void;
  onDeep: () => void;
  onRecommend: () => void;
  onClose: () => void;
  note?: string | null;
}) {
  return (
    <section className="l5s-start" aria-label="Where to start">
      <button type="button" className="l5s-x l5s-start-x" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <p className="l5s-start-k">
        <b>Socria</b> · {sortedSaid(study)}
        {study.plain ? ' by their own headings' : ''}
      </p>
      <h3 className="l5s-start-q">
        Where do you want to start? <span>Or should I recommend a focus area?</span>
      </h3>
      {note && <p className="l5s-note">{note}</p>}
      <div className="l5s-start-opts">
        <button type="button" className="l5s-opt" onClick={onStudy}>
          <span className="l5s-opt-ic" aria-hidden="true">
            ✎
          </span>
          <span>
            <b>Test yourself</b>
            <small>Fill-in-the-blank questions made from your files — checked when you submit</small>
          </span>
        </button>
        <button type="button" className="l5s-opt" onClick={onDeep}>
          <span className="l5s-opt-ic" aria-hidden="true">
            ⌖
          </span>
          <span>
            <b>Deep analysis</b>
            <small>Ask a hard question and see its anchors, evidence and traps as a Logic Map</small>
          </span>
        </button>
      </div>
      <div className="l5s-start-foot">
        <button type="button" className="l5s-btn" onClick={onRecommend}>
          Recommend for me
        </button>
        <span>or click any topic above</span>
      </div>
    </section>
  );
}

// ── one topic ────────────────────────────────────────────────────────

export function TopicInspector({
  topic,
  study,
  onClose,
  onPractice,
  onExplain,
  onChallenge,
  onWhy,
  onOpen,
  making,
  why,
}: {
  topic: StudyTopic;
  study: StudyState;
  onClose: () => void;
  onPractice: () => void;
  onExplain: () => void;
  onChallenge: () => void;
  onWhy: () => void;
  onOpen: (q: StudyQuote) => void;
  making: boolean;
  /** why this one is the place to start, when it was recommended */
  why?: string | null;
}) {
  const n = sourcesOf(topic);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [topic.id]);
  return (
    <aside className="l5s-insp" aria-label={topic.title} ref={ref} tabIndex={-1}>
      <div className="l5s-insp-head">
        <p className="l5s-insp-k">
          Topic · {n} {n === 1 ? 'source' : 'sources'}
        </p>
        <button type="button" className="l5s-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <h3 className="l5s-insp-t">{topic.title}</h3>
      {topic.summary && <p className="l5s-insp-sum">{topic.summary}</p>}
      {why && <p className="l5s-insp-why">Recommended start — {why}</p>}
      <div className="l5s-quotes">
        {topic.quotes.map((q, i) => (
          <figure key={i} className="l5s-quote">
            <blockquote>“{q.text}”</blockquote>
            <figcaption>
              <SourceChip q={q} files={study.files} long onOpen={onOpen} />
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="l5s-insp-k">Do something with it</p>
      <div className="l5s-acts">
        <button type="button" className="l5s-act is-primary" onClick={onPractice} disabled={making}>
          {making ? 'Making practice…' : 'Practice this'}
        </button>
        <button type="button" className="l5s-act" onClick={onExplain}>
          Explain it simply
        </button>
        <button type="button" className="l5s-act" onClick={onChallenge}>
          Challenge me
        </button>
        <button type="button" className="l5s-act" onClick={onWhy}>
          Ask why <span aria-hidden="true">→</span> Logic Map
        </button>
      </div>
      <p className="l5s-fine">Every quote is the file’s own words, with its page. Nothing here is generated until you ask.</p>
    </aside>
  );
}

// ── practice ─────────────────────────────────────────────────────────

/** The accounts offered as a person types — the answers' among the chart's common ones, so the list gives nothing away. */
const COMMON_ACCOUNTS = [
  'Cash',
  'Accounts Receivable',
  'Supplies',
  'Prepaid Rent',
  'Prepaid Insurance',
  'Equipment',
  'Accumulated Depreciation',
  'Accounts Payable',
  'Wages Payable',
  'Interest Payable',
  'Unearned Revenue',
  'Notes Payable',
  'Owner’s Capital',
  'Service Revenue',
  'Interest Revenue',
  'Wages Expense',
  'Rent Expense',
  'Supplies Expense',
  'Insurance Expense',
  'Depreciation Expense',
  'Interest Expense',
  'Utilities Expense',
];

function madeFrom(p: Practice, files: StudyFile[]): StudyQuote[] {
  const seen = new Set<string>();
  const out: StudyQuote[] = [];
  const all = [...p.made, ...(p.journal?.events.map((e) => e.cite) ?? []), ...(p.cloze?.map((c) => c.quote) ?? [])];
  for (const q of all) {
    const k = `${q.doc}:${q.page}`;
    if (seen.has(k) || !files.some((f) => f.doc === q.doc)) continue;
    seen.add(k);
    out.push(q);
  }
  return out.slice(0, 3);
}

function Mark({ ok }: { ok: boolean | undefined }) {
  if (ok === undefined) return null;
  return (
    <span className={`l5s-mark ${ok ? 'is-ok' : 'is-no'}`} aria-label={ok ? 'right' : 'not right'}>
      {ok ? '✓' : '✗'}
    </span>
  );
}

export function StudyPractice({
  study,
  practice,
  onAnswers,
  onCheck,
  onAgain,
  onMore,
  onWhy,
  onOpen,
  onPick,
  making,
}: {
  study: StudyState;
  practice: Practice;
  /** what was typed — kept as they type (a moment after) */
  onAnswers: (answers: Record<string, string>) => void;
  onCheck: (answers: Record<string, string>) => void;
  /** take the check back and try again */
  onAgain: () => void;
  onMore: () => void;
  onWhy: (gap: Gap | null) => void;
  onOpen: (q: StudyQuote) => void;
  /** another practice set of this study */
  onPick: (id: string) => void;
  making: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(practice.answers);
  const [hint, setHint] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setAnswers(practice.answers);
    setHint(null);
  }, [practice.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const checked = practice.checked;
  const live = checked ? checkPractice(practice, practice.answers) : null;
  const marks = live?.marks ?? {};
  const set = (id: string, v: string) => {
    if (checked) return;
    const next = { ...answers, [id]: v };
    setAnswers(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onAnswers(next), 700);
  };
  const of = blanksOf(practice).length;
  const filled = filledOf(practice, answers);
  const topic = study.topics.find((t) => t.id === practice.topic);
  const from = madeFrom(practice, study.files);
  const others = study.practice.filter((p) => p.id !== practice.id).slice(-3).reverse();
  const kindSaid = practice.kind === 'journal' ? 'Journal entries' : 'Fill in the blank';
  const accounts = useMemo(() => [...new Set([...COMMON_ACCOUNTS, ...(practice.journal?.accounts ?? [])])].sort((a, b) => a.localeCompare(b)), [practice.journal?.accounts]);
  const listId = `l5s-acc-${practice.id}`;

  const fromLine = (
    <p className="l5s-pr-from">
      {checked ? 'Checked against ' : 'Made from '}
      {from.map((q, i) => (
        <span key={i}>
          {i > 0 && (i === from.length - 1 ? ' and ' : ', ')}
          <SourceChip q={q} files={study.files} onOpen={onOpen} />
        </span>
      ))}
      {checked ? (practice.kind === 'journal' ? ' and the debit = credit rule' : '') : practice.kind === 'journal' ? ' — your numbers, blanks for you to fill.' : ' — the files’ own sentences, a word taken out of each.'}
    </p>
  );

  return (
    <div className="l5s-practice">
      <div className="l5s-pr-main">
        <p className="l5s-pr-k">
          Practice · {kindSaid}
          {checked ? ' · Checked' : ''}
        </p>
        <h2 className="l5s-pr-t">{practice.title}</h2>
        {fromLine}
        {practice.kind === 'journal' && practice.journal && (
          <div className="l5s-jwrap">
            <table className="l5s-jtable">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Account</th>
                  <th scope="col" className="is-num">
                    Debit
                  </th>
                  <th scope="col" className="is-num">
                    Credit
                  </th>
                  {checked && <th scope="col" className="is-mark" aria-label="Checked" />}
                </tr>
              </thead>
              {practice.journal.events.map((e) => (
                <tbody key={e.id} className="l5s-jev">
                  {e.lines.map((l, i) => {
                    const a = marks[`${e.id}.${l.id}.account`];
                    const m = marks[`${e.id}.${l.id}.amount`];
                    const row = checked ? (a && m ? 'is-ok' : 'is-no') : '';
                    return (
                      <tr key={l.id} className={row}>
                        {i === 0 && (
                          <th scope="row" rowSpan={e.lines.length} className="l5s-jev-t">
                            <span>{e.text}</span>
                            {!checked && (
                              <span className="l5s-hintwrap">
                                <button type="button" className="l5s-hintbtn" aria-expanded={hint === e.id} onClick={() => setHint((h) => (h === e.id ? null : e.id))}>
                                  ? Hint
                                </button>
                                {hint === e.id && (
                                  <span className="l5s-hint" role="note">
                                    <b>Which accounts are affected here?</b>
                                    <span>{e.hint}</span>
                                    <small>
                                      A hint, not the answer · from <SourceChip q={e.cite} files={study.files} onOpen={onOpen} />
                                    </small>
                                  </span>
                                )}
                              </span>
                            )}
                          </th>
                        )}
                        <td>
                          <input
                            className={`l5s-in${checked ? (a ? ' is-ok' : ' is-no') : ''}`}
                            list={listId}
                            value={answers[`${e.id}.${l.id}.account`] ?? ''}
                            onChange={(ev) => set(`${e.id}.${l.id}.account`, ev.target.value)}
                            readOnly={!!checked}
                            aria-label={`Account, line ${i + 1} of “${e.text}”`}
                            placeholder="Account"
                          />
                        </td>
                        {(['dr', 'cr'] as const).map((side) => (
                          <td key={side} className="is-num">
                            <input
                              className={`l5s-in is-num${checked && (answers[`${e.id}.${l.id}.${side}`] ?? '').trim() ? (m ? ' is-ok' : ' is-no') : ''}`}
                              inputMode="decimal"
                              value={answers[`${e.id}.${l.id}.${side}`] ?? ''}
                              onChange={(ev) => set(`${e.id}.${l.id}.${side}`, ev.target.value)}
                              readOnly={!!checked}
                              aria-label={`${side === 'dr' ? 'Debit' : 'Credit'}, line ${i + 1} of “${e.text}”`}
                              placeholder={side === 'dr' ? 'Debit' : 'Credit'}
                            />
                          </td>
                        ))}
                        {checked && (
                          <td className="is-mark">
                            <Mark ok={a && m} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
            <datalist id={listId}>
              {accounts.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
        )}
        {practice.kind === 'cloze' && (
          <ol className="l5s-cloze">
            {(practice.cloze ?? []).map((c) => {
              const mk = marks[c.id];
              return (
                <li key={c.id} className={checked ? (mk ? 'is-ok' : 'is-no') : ''}>
                  <p>
                    {c.before}
                    <input
                      className={`l5s-in is-blank${checked ? (mk ? ' is-ok' : ' is-no') : ''}`}
                      value={answers[c.id] ?? ''}
                      onChange={(ev) => set(c.id, ev.target.value)}
                      readOnly={!!checked}
                      aria-label="Blank"
                      style={{ width: `${Math.max(6, c.answer.length + 2)}ch` }}
                    />
                    {c.after}
                    {checked && <Mark ok={mk} />}
                  </p>
                  <span className="l5s-cloze-foot">
                    <SourceChip q={c.quote} files={study.files} onOpen={onOpen} />
                    {!checked && (
                      <button type="button" className="l5s-hintbtn" aria-expanded={hint === c.id} onClick={() => setHint((h) => (h === c.id ? null : c.id))}>
                        ? Hint
                      </button>
                    )}
                    {hint === c.id && !checked && (
                      <span className="l5s-hint is-inline" role="note">
                        {clozeHint(c)} <small>— a hint, not the answer</small>
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <div className="l5s-pr-bar">
          {!checked ? (
            <>
              <button type="button" className="l5s-go" onClick={() => onCheck(answers)}>
                Check my answers
              </button>
              <span className="l5s-pr-count">
                {filled} of {of} blanks filled · nothing is graded until you submit
              </span>
            </>
          ) : (
            <>
              <button type="button" className="l5s-btn" onClick={onMore} disabled={making}>
                {making ? 'Making more…' : 'Try 3 more like these'}
              </button>
              <button type="button" className="l5s-btn" onClick={() => onWhy(checked.gaps[0] ?? null)}>
                Why? <span aria-hidden="true">→</span> Logic Map
              </button>
              <button type="button" className="l5s-link" onClick={onAgain}>
                Try these again
              </button>
            </>
          )}
        </div>
        {others.length > 0 && (
          <p className="l5s-pr-others">
            Earlier:{' '}
            {others.map((p) => (
              <button key={p.id} type="button" className="l5s-chip is-btn" onClick={() => onPick(p.id)}>
                {study.topics.find((t) => t.id === p.topic)?.title ?? 'Practice'}
                {p.checked ? ` · ${p.checked.right}/${p.checked.of}` : ''}
              </button>
            ))}
          </p>
        )}
      </div>
      <aside className="l5s-pr-side">
        {!checked && practice.journal?.balance && (
          <section className="l5s-side-card">
            <p className="l5s-pr-k">Check your balance</p>
            <p className="l5s-eq-l">After the adjustments:</p>
            <p className="l5s-eq">
              <span className="l5s-eq-v">{money(practice.journal.balance.assets)}</span>
              <span>=</span>
              <input className="l5s-in is-num" inputMode="decimal" placeholder="Liabilities" aria-label="Liabilities" value={answers['balance.liabilities'] ?? ''} onChange={(ev) => set('balance.liabilities', ev.target.value)} />
              <span>+</span>
              <input className="l5s-in is-num" inputMode="decimal" placeholder="Equity" aria-label="Equity" value={answers['balance.equity'] ?? ''} onChange={(ev) => set('balance.equity', ev.target.value)} />
            </p>
            <p className="l5s-fine">Fill the two boxes from your entries. The equation has to hold — Socria checks it when you submit.</p>
          </section>
        )}
        {!checked && topic && (
          <section className="l5s-side-card is-quiet">
            <p className="l5s-pr-k">From the topic</p>
            <p className="l5s-side-t">{topic.title}</p>
            {topic.quotes[0] && (
              <figure className="l5s-quote is-sm">
                <blockquote>“{topic.quotes[0].text}”</blockquote>
                <figcaption>
                  <SourceChip q={topic.quotes[0]} files={study.files} onOpen={onOpen} />
                </figcaption>
              </figure>
            )}
          </section>
        )}
        {checked && live && (
          <>
            <section className="l5s-side-card is-result">
              <p className="l5s-pr-k">Your result</p>
              <p className="l5s-score">
                <b>{live.right}</b> of {live.of}
              </p>
              {(live.balanced !== null || live.equation !== null) && (
                <p className="l5s-rules">
                  {live.balanced !== null && (
                    <span>
                      Debits equal credits <Mark ok={live.balanced} />
                    </span>
                  )}
                  {live.equation !== null && (
                    <span>
                      The equation holds <Mark ok={live.equation} />
                    </span>
                  )}
                </p>
              )}
            </section>
            {live.gaps.length > 0 ? (
              <section className="l5s-gaps">
                <p className="l5s-pr-k">{gapsSaid(live.gaps.length)} to close</p>
                {live.gaps.slice(0, 4).map((g) => (
                  <article key={g.id} className="l5s-gap">
                    <p className="l5s-gap-l">{g.label}</p>
                    <p className="l5s-gap-a">{g.answer}</p>
                    <p className="l5s-gap-w">{g.why}</p>
                    <SourceChip q={g.cite} files={study.files} long onOpen={onOpen} />
                  </article>
                ))}
              </section>
            ) : (
              <p className="l5s-allright">Every blank right — from your own files.</p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

const WORDS = ['No gaps', 'One gap', 'Two gaps', 'Three gaps', 'Four gaps'];
const gapsSaid = (n: number) => WORDS[n] ?? `${n} gaps`;

// ── components, before there are any ─────────────────────────────────

/**
 * A line of thinking with no files yet: where they go, and what was said so
 * far, each a press away from where it is in the conversation.
 */
export function ComponentsEmpty({
  said,
  onFiles,
  reading,
  onShow,
  narrow,
}: {
  said: { id: string; text: string }[];
  onFiles: (files: File[]) => void;
  /** files being read now, said in their place */
  reading: string | null;
  onShow: (messageId: string) => void;
  narrow: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="l5s-cempty">
      <div className="l5s-cempty-head">
        {!narrow && <span className="l5s-eyebrow">Components</span>}
        <h2>Nothing to sort yet.</h2>
        <p>{narrow ? 'Drop notes, slides or a PDF and Socria sorts them into topics here.' : 'Drop notes, slides or a PDF and Socria sorts them into topics here, in the files’ own words. The map and the artifacts read the same material.'}</p>
      </div>
      <button
        type="button"
        className={`l5s-cdrop${over ? ' is-over' : ''}`}
        disabled={!!reading}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer?.files?.length) onFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <span className="l5s-cdrop-t">{reading ?? (narrow ? 'Choose files' : <>Drop files here, or <u>choose them</u></>)}</span>
        {!narrow && !reading && <span className="l5s-cdrop-s">PDF, Word, PowerPoint, Excel, notes, a photo of a page</span>}
      </button>
      <input
        ref={ref}
        type="file"
        multiple
        accept={STUDY_ACCEPT}
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
      {said.length > 0 && (
        <div className="l5s-csaid">
          <span className="l5s-eyebrow">Said in this conversation · {said.length}</span>
          {said.slice(-4).map((x) => (
            <button key={x.id} type="button" className="l5s-csaid-i" onClick={() => onShow(x.id)}>
              {x.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── artifacts: what was made ─────────────────────────────────────────

export interface ArtifactItem {
  key: string;
  /** what it is: Chart, Plan, Document, Practice… */
  kind: string;
  title: string;
  /** what the line above it says, when it is not something made from the conversation */
  eyebrow?: string;
  /** drawn edge to edge, with its own chrome and no label over it — the person's writing */
  bare?: boolean;
  render: () => ReactNode;
}

/** Everything made in a line of thinking, one at a time: a strip to choose, the one chosen at full size. */
export function ArtifactsView({
  items,
  selected,
  onSelect,
  narrow,
  onWrite,
  onMake,
}: {
  items: ArtifactItem[];
  selected: string | null;
  onSelect: (key: string) => void;
  narrow: boolean;
  /** start the person's own writing — offered, never opened for them */
  onWrite?: () => void;
  /** choose what to make before asking (lib/logos5/make.ts); the composer then asks what it is about */
  onMake?: (id: string) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  // what to make, each drawn as it will be (MakeGallery): Socria fills the template from the conversation
  const choices = onMake ? (
    <div className="l5s-make">
      <MakeGallery
        onPick={(id) => {
          setChoosing(false);
          onMake(id);
        }}
      />
    </div>
  ) : null;
  if (!items.length)
    return (
      <div className="l5s-cempty is-arts">
        <div className="l5s-cempty-head">
          {!narrow && <span className="l5s-eyebrow">Artifacts</span>}
          <h2>Nothing made yet.</h2>
          <p>Ask for a chart of your numbers, a plan, a comparison or a worksheet — or practise a topic from your files — and it is kept here, made from the conversation.</p>
          {choices && <p className="l5s-make-h">Or choose one below — each is drawn as it will be — then say what it is about.</p>}
          {onWrite && (
            <button type="button" className="l5s-write-start" onClick={onWrite}>
              Start writing <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
        {choices}
      </div>
    );
  const cur = items.find((i) => i.key === selected) ?? items[items.length - 1];
  return (
    <div className="l5s-arts">
      {(items.length > 1 || onWrite || onMake) && (
        <div className="l5s-arts-strip" role="tablist" aria-label="Artifacts">
          {items.map((it) => (
            <button key={it.key} type="button" role="tab" aria-selected={it.key === cur.key} className={`l5s-art-pill${it.key === cur.key ? ' is-on' : ''}`} onClick={() => onSelect(it.key)}>
              <span className="l5s-art-k">{it.kind}</span>
              <span className="l5s-art-t">{it.title}</span>
            </button>
          ))}
          {onWrite && (
            <button type="button" className="l5s-art-pill is-add" onClick={onWrite}>
              <span className="l5s-art-t">+ Write</span>
            </button>
          )}
          {onMake && (
            <button type="button" className="l5s-art-pill is-add" aria-expanded={choosing} onClick={() => setChoosing((v) => !v)}>
              <span className="l5s-art-t">+ Make</span>
            </button>
          )}
        </div>
      )}
      {choosing && choices}
      <section className={`l5s-art${cur.bare ? ' is-bare' : ''}`} aria-label={cur.title}>
        {/* the person's writing has its own chrome, and needs no label over it */}
        {!cur.bare && <p className="l5s-art-eyebrow">{cur.eyebrow ?? `Artifact · ${cur.kind} · made from the conversation`}</p>}
        <div className="l5s-art-body">{cur.render()}</div>
      </section>
    </div>
  );
}

/** Nothing practised yet: the way to the first. */
export function PracticeEmpty({ study, onPractice, making }: { study: StudyState; onPractice: (topic: string) => void; making: string | null }) {
  const start = study.topics.find((t) => t.id === study.start) ?? study.topics[0];
  return (
    <div className="l5s-empty">
      <p className="l5s-pr-k">Practice</p>
      <h2 className="l5s-pr-t">Practice is made from your files when you ask for it.</h2>
      <p className="l5s-pr-from">Pick a topic on the board and press “Practice this” — or start where Socria recommends.</p>
      {start && (
        <button type="button" className="l5s-go" onClick={() => onPractice(start.id)} disabled={!!making}>
          {making ? 'Making practice…' : `Practice “${start.title}”`} <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
}
