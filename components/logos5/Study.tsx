'use client';
// components/logos5/Study.tsx — Logos 5's study path, drawn.
//
//   StudyIntake     "What are you working on?" — files and a sentence; Socria sorts it
//   StudyBoard      the files as topics, with the files' own words and pages
//   TopicInspector  one topic: every quote, and what to do with it
//   StudyPractice   practice made from the files, checked when submitted
//   StudySteps      where you are: Components · Practice · Logic Map
//
// Nothing here talks to a model or a database. It draws a study
// (lib/logos5/study.ts) and says what the person did; LogosApp does the rest.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Attachment } from '@/lib/logos-attachments';
import {
  INTENT_KEYS,
  INTENTS,
  TOPIC_KIND_LABEL,
  blanksOf,
  checkPractice,
  clozeHint,
  filledOf,
  intentOf,
  layoutTopics,
  money,
  shortName,
  sortedSaid,
  sourcesOf,
  whereSaid,
  type Gap,
  type Intent,
  type Practice,
  type StudyFile,
  type StudyQuote,
  type StudyState,
  type StudyTopic,
} from '@/lib/logos5/study';
import './study.css';

/** a layout effect in the browser; on the server (which renders first) an ordinary one, so nothing warns */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export type StudyTab = 'components' | 'practice' | 'logic';

// ── where you are ────────────────────────────────────────────────────

export function StudySteps({ tab, onTab, practiced, logicSeen }: { tab: StudyTab; onTab: (t: StudyTab) => void; practiced: boolean; logicSeen: boolean }) {
  const steps: { id: StudyTab; n: number; label: string; sub?: string }[] = [
    { id: 'components', n: 1, label: 'Components' },
    { id: 'practice', n: 2, label: 'Practice', ...(practiced ? {} : { sub: 'pick a topic' }) },
    { id: 'logic', n: 3, label: 'Logic Map', ...(logicSeen ? {} : { sub: 'on request' }) },
  ];
  return (
    <nav className="l5s-steps" aria-label="Study">
      {steps.map((s) => (
        <button key={s.id} type="button" className={`l5s-step${tab === s.id ? ' is-on' : ''}`} aria-current={tab === s.id ? 'page' : undefined} aria-label={`${s.n}. ${s.label}`} title={s.label} onClick={() => onTab(s.id)}>
          <span className="l5s-step-n">{s.n}</span>
          <span className="l5s-step-l">{s.label}</span>
          {s.sub && <span className="l5s-step-sub">({s.sub})</span>}
        </button>
      ))}
    </nav>
  );
}

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

// ── the intake ───────────────────────────────────────────────────────

interface IntakeFile {
  id: string;
  name: string;
  status: 'reading' | 'ready' | 'error';
  att?: Attachment;
  error?: string;
}

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.odt,.odp,.ods,.rtf,.md,.txt,.csv,.tsv,.html,.htm,.tex,.ipynb,.png,.jpg,.jpeg,.webp';

const STEPS = ['Drop or ask', 'Socria sorts it', 'Pick a starting point', 'Study or dig in'];

export function StudyIntake({
  readDocument,
  onOrganize,
  onAsk,
  busy,
  error,
  footer,
  below,
  narrow,
}: {
  readDocument: (file: File) => Promise<Attachment>;
  onOrganize: (atts: Attachment[], said: string, goal: Intent) => void;
  onAsk: (text: string) => void;
  busy: boolean;
  error?: string | null;
  /** the model picker, and anything else the composer would carry */
  footer?: ReactNode;
  /** under the card: picking up where they left off */
  below?: ReactNode;
  narrow: boolean;
}) {
  const [files, setFiles] = useState<IntakeFile[]>([]);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Intent | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const ready = files.filter((f) => f.status === 'ready' && f.att);
  const reading = files.some((f) => f.status === 'reading');
  const goal = picked ?? intentOf(text, ready.length + (reading ? 1 : 0));
  const docs = ready.filter((f) => f.att?.kind === 'doc');

  async function take(list: FileList | File[]) {
    setNotice(null);
    const all = Array.from(list).slice(0, Math.max(0, 6 - files.length));
    if (list.length > all.length) setNotice('Up to six files at a time.');
    for (const file of all) {
      const id = `f${++seq.current}`;
      setFiles((fs) => [...fs, { id, name: file.name, status: 'reading' }]);
      try {
        const att = await readDocument(file);
        setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, status: 'ready', att } : f)));
      } catch (e: any) {
        setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, status: 'error', error: e?.message || 'could not be read' } : f)));
      }
    }
  }

  const go = () => {
    if (busy || reading) return;
    if (docs.length) onOrganize(ready.map((f) => f.att!), text.trim(), goal);
    else if (text.trim() || ready.length) onAsk(text.trim());
  };
  const can = !busy && !reading && (docs.length > 0 || !!text.trim());
  const step = busy ? 1 : 0;

  return (
    <div className="l5s-intake">
      <div className="l5s-intake-in">
        <h2 className="l5s-hello">
          What are you <em>working on</em>?
        </h2>
        <p className="l5s-hello-sub">Drop your notes, slides or an exam review — or just ask. Socria sorts it; you pick where to go.</p>
        <div
          className={`l5s-drop${dragging ? ' is-over' : ''}${files.length ? ' has-files' : ''}`}
          onDragEnter={(e) => (e.preventDefault(), setDragging(true))}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer?.files?.length) void take(e.dataTransfer.files);
          }}
        >
          {files.length > 0 && (
            <ul className="l5s-files" aria-label="Files">
              {files.map((f) => (
                <li key={f.id} className={`l5s-file is-${f.status}`}>
                  <span className="l5s-file-ic" aria-hidden="true">
                    {f.status === 'reading' ? <span className="l5s-spin" /> : f.status === 'error' ? '!' : '▤'}
                  </span>
                  <span className="l5s-file-t">
                    <span className="l5s-file-n">{f.name}</span>
                    <span className="l5s-file-s">
                      {f.status === 'reading'
                        ? 'reading…'
                        : f.status === 'error'
                          ? f.error
                          : f.att?.kind === 'doc'
                            ? `${f.att.pages ?? 1} ${(f.att.pages ?? 1) === 1 ? 'page' : 'pages'} · read`
                            : 'read'}
                    </span>
                  </span>
                  <button type="button" className="l5s-x" aria-label={`Remove ${f.name}`} onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!files.length && (
            <button type="button" className="l5s-drop-cta" onClick={() => fileRef.current?.click()}>
              <span className="l5s-drop-ic" aria-hidden="true">
                ⇪
              </span>
              <span>
                <b>Drop files here</b> or <u>choose them</u>
                <small>PDF, Word, PowerPoint, Excel, notes, photos of a page</small>
              </span>
            </button>
          )}
          <div className="l5s-ask">
            <textarea
              value={text}
              rows={narrow ? 2 : 1}
              placeholder={files.length ? 'What should Socria help with? e.g. “get me ready for exam 2 on Thursday”' : narrow ? 'Or just ask…' : 'Or just ask — “help me get ready for exam 2 on Thursday”'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  go();
                }
              }}
              aria-label="What you are working on"
              style={{ fontSize: 16 }}
            />
            {files.length > 0 && (
              <button type="button" className="l5s-iconbtn" onClick={() => fileRef.current?.click()} aria-label="Add another file" title="Add another file">
                +
              </button>
            )}
          </div>
          <div className="l5s-drop-foot">
            {(text.trim() || files.length > 0) && (
              <div className="l5s-intent">
                <span className="l5s-intent-dot" aria-hidden="true" />
                <span>
                  Looks like: <b>{INTENTS[goal]}</b>
                </span>
                <span className="l5s-intent-sub">· nothing to set up —</span>
                <button type="button" className="l5s-link" onClick={() => setChoosing((v) => !v)} aria-expanded={choosing}>
                  change it any time
                </button>
                {choosing && (
                  <div className="l5s-intent-menu" role="menu">
                    {INTENT_KEYS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="menuitemradio"
                        aria-checked={goal === k}
                        onClick={() => {
                          setPicked(k);
                          setChoosing(false);
                        }}
                      >
                        {INTENTS[k]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" className="l5s-go" disabled={!can} onClick={go}>
              {busy ? 'Sorting…' : docs.length ? 'Organize it' : 'Ask'} <span aria-hidden="true">→</span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void take(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {notice && <p className="l5s-note">{notice}</p>}
        {error && (
          <p className="l5s-error" role="alert">
            {error}
          </p>
        )}
        {footer && <div className="l5s-intake-foot">{footer}</div>}
        {below}
      </div>
      <ol className="l5s-path" aria-label="How it works">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'is-on' : i < step ? 'is-done' : ''}>
            <span className="l5s-path-n">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── the board ────────────────────────────────────────────────────────

function TopicCard({
  t,
  files,
  start,
  dim,
  on,
  onPick,
  cardRef,
}: {
  t: StudyTopic;
  files: StudyFile[];
  start: boolean;
  dim: boolean;
  on: boolean;
  onPick: () => void;
  cardRef: (el: HTMLButtonElement | null) => void;
}) {
  const places = useMemo(() => {
    const seen = new Set<string>();
    return t.quotes.filter((q) => {
      const k = `${q.doc}:${q.page}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [t.quotes]);
  const n = sourcesOf(t);
  return (
    <button ref={cardRef} type="button" className={`l5s-card is-${t.kind}${start ? ' is-start' : ''}${dim ? ' is-dim' : ''}${on ? ' is-on' : ''}`} onClick={onPick} aria-pressed={on}>
      <span className="l5s-card-top">
        <span className="l5s-kind">{TOPIC_KIND_LABEL[t.kind]}</span>
        {start && <span className="l5s-badge">Recommended start</span>}
      </span>
      <span className="l5s-card-title">{t.title}</span>
      <span className="l5s-card-quote">“{t.quotes[0]?.text}”</span>
      <span className="l5s-card-foot">
        {places.slice(0, 2).map((q) => (
          <SourceChip key={`${q.doc}:${q.page}`} q={q} files={files} />
        ))}
        {t.tables > 0 && <span className="l5s-chip">{t.tables === 1 ? '1 table' : `${t.tables} tables`}</span>}
        {t.quotes.length > 1 && <span className="l5s-chip">{t.quotes.length} quotes</span>}
        <span className="l5s-card-n">
          {n} {n === 1 ? 'source' : 'sources'}
        </span>
      </span>
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
  const placed = useMemo(() => layoutTopics(study.topics, narrow ? 1 : 3), [study.topics, narrow]);
  const cols = useMemo(() => {
    const out: StudyTopic[][] = [];
    for (const p of placed) {
      const t = study.topics.find((x) => x.id === p.id);
      if (!t) continue;
      (out[p.col] ??= []).push(t);
    }
    return out.filter(Boolean);
  }, [placed, study.topics]);
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const [paths, setPaths] = useState<{ id: string; d: string; lit: boolean }[]>([]);
  // a link is drawn between neighbouring columns only: one that jumped a column would run behind the cards between
  const links = useMemo(() => {
    const col = new Map(placed.map((p) => [p.id, p.col]));
    return study.topics.flatMap((t) => t.after.filter((a) => Math.abs((col.get(a) ?? 0) - (col.get(t.id) ?? 0)) <= 1).map((a) => ({ from: a, to: t.id })));
  }, [study.topics, placed]);

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
        const a = cards.current.get(l.from)?.getBoundingClientRect();
        const b = cards.current.get(l.to)?.getBoundingClientRect();
        if (!a || !b) continue;
        const sameCol = Math.abs(a.left - b.left) < 20;
        let d: string;
        if (sameCol) {
          const x = a.left - o.left + a.width - 18 + el.scrollLeft;
          const y1 = a.bottom - o.top + el.scrollTop;
          const y2 = b.top - o.top + el.scrollTop;
          d = `M${x},${y1} C${x + 22},${y1 + (y2 - y1) / 2} ${x + 22},${y1 + (y2 - y1) / 2} ${x},${y2}`;
        } else {
          const x1 = a.right - o.left + el.scrollLeft;
          const y1 = a.top + a.height / 2 - o.top + el.scrollTop;
          const x2 = b.left - o.left + el.scrollLeft;
          const y2 = b.top + b.height / 2 - o.top + el.scrollTop;
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
  }, [links, selected, narrow, cols, inspector]);

  return (
    <div className={`l5s-boardwrap${inspector ? ' has-inspector' : ''}`}>
      <div className="l5s-boardcol">
        <div className="l5s-board" ref={box} onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
          <svg className="l5s-links" aria-hidden="true">
            {paths.map((p) => (
              <path key={p.id} d={p.d} className={p.lit ? 'is-lit' : ''} />
            ))}
          </svg>
          <div className="l5s-cols" onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
            {cols.map((col, i) => (
              <div key={i} className="l5s-col">
                {col.map((t) => (
                  <TopicCard
                    key={t.id}
                    t={t}
                    files={study.files}
                    start={t.id === study.start}
                    dim={!!selected && selected !== t.id}
                    on={selected === t.id}
                    onPick={() => onSelect(selected === t.id ? null : t.id)}
                    cardRef={(el) => {
                      if (el) cards.current.set(t.id, el);
                      else cards.current.delete(t.id);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
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
            <b>Study &amp; review</b>
            <small>Fill-in-the-blank practice made from your files — checked when you submit</small>
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
