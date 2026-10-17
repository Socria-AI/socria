'use client';

// components/display/DocumentFigure.tsx — a document the person attached, as it was read.
//
// Every passage is shown with the key a reply cites it by, on its page, and
// with what is doubtful about it said beside it: read from the page image,
// uncertain, handwriting, symbols that could not be decoded, corrected by the
// person, marked by them as read wrongly. Nothing is smoothed over.
//
// What the person can do here is theirs alone, and every bit of it is undone
// as easily: correct a passage (their words, flagged as theirs — what the
// reading said is kept), mark one as read wrongly, chart a table (a new data
// display, naming where its numbers came from), send an equation the engine
// can compute with to the conversation, and read scanned pages from their
// pictures. Selecting a passage tells the next turn that "this" means it.
//
// The reading is not in the display's state (lib/objects/display-document.ts):
// it comes from the documents this device holds (docs-context.ts).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FigureProps } from '@/components/objects/figures';
import { chartFromTable, formatSaid, functionFromEquation, pageWord, type DocumentState } from '@/lib/objects/display-document';
import { correctable, correctBlock, editsIn, markMisread, restoreBlock } from '@/lib/docs/edit';
import type { DocBlock, DocCheck, DocTable, SourceDoc } from '@/lib/docs/types';
import { DisplayShell, useDisplay, type Display } from './DisplayShell';
import { useSelection } from './primitives';
import { useDocs, type DocsApi } from './docs-context';
import './document.css';
import { LOGOS4 } from '@/lib/logos4/flags';
import { browserStorage, readingAt, rememberReading } from '@/lib/logos4/resume';

type D = Display<DocumentState>;

/** Passages drawn at first; more as the person reads on, or as a citation asks for one further in. */
const FIRST = 300;
const MORE = 300;

/** What is doubtful about a passage, in the words shown beside it. */
function tagsOf(b: DocBlock): string[] {
  const out: string[] = [];
  if (b.method === 'vision') out.push('read from the page image');
  if (b.flags?.includes('handwriting')) out.push('handwriting');
  if (b.flags?.includes('illegible')) out.push('partly illegible');
  if (b.flags?.includes('uncertain') || (b.conf !== undefined && b.conf < 0.6)) out.push('uncertain');
  if (b.flags?.includes('unverified-numbers')) out.push('numbers not confirmed by the page’s own text');
  if (b.flags?.includes('symbols-missing')) out.push('some symbols could not be decoded');
  if (b.flags?.includes('corrected')) out.push('corrected by you');
  if (b.flags?.includes('misread')) out.push('you marked it as read wrongly');
  return out;
}

/** The words of a passage with what was searched for marked. */
function Marked({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const out: ReactNode[] = [];
  const low = text.toLowerCase();
  let at = 0;
  for (let i = low.indexOf(q); i >= 0 && out.length < 200; i = low.indexOf(q, at)) {
    if (i > at) out.push(text.slice(at, i));
    out.push(<mark key={i}>{text.slice(i, i + q.length)}</mark>);
    at = i + q.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

export function DocumentFigure(p: FigureProps) {
  const d = useDisplay<DocumentState>(p);
  const s = d.state;
  const docs = useDocs();
  const doc = docs?.docs.get(s.doc) ?? null;
  if (p.mode !== 'live') return <DisplayShell p={p} d={d}>{null}</DisplayShell>;
  if (!doc || !docs) {
    return (
      <DisplayShell p={p} d={d} aside={`${s.pages} ${pageWord(s.format, s.pages)} · ${formatSaid(s.format)}`}>
        <p className="dsp-empty">
          The reading of “{s.name}” is not on this device — a document stays on the device that read it. Attach the file here to open it.
        </p>
      </DisplayShell>
    );
  }
  return <Reading p={p} d={d} doc={doc} docs={docs} />;
}

function Reading({ p, d, doc, docs }: { p: FigureProps; d: D; doc: SourceDoc; docs: DocsApi }) {
  const s = d.state;
  const [sel, select] = useSelection(p);
  const [find, setFind] = useState('');
  const [hit, setHit] = useState(0);
  const [limit, setLimit] = useState(FIRST);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const letter = docs.letterOf(doc.id);
  const keyOf = (id: string) => `${letter ?? ''}${id.slice(1)}`;
  const visible = useMemo(() => doc.blocks.filter((b) => b.kind !== 'header' && b.kind !== 'footer'), [doc]);
  const q = find.trim().toLowerCase();
  const hits = useMemo(() => (q.length >= 2 ? visible.filter((b) => b.text.toLowerCase().includes(q)).map((b) => b.id) : []), [visible, q]);
  const waiting = doc.pages.filter((pg) => pg.ocr === 'needed').map((pg) => pg.n);
  const busy = docs.reading[doc.id];
  const issues = doc.checks.filter((c) => c.level !== 'ok');

  // a passage asked for further in than is drawn is drawn, and brought into view
  const index = sel ? visible.findIndex((b) => b.id === sel) : -1;
  useEffect(() => {
    if (index >= limit) setLimit(index + MORE);
  }, [index, limit]);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sel || s.view !== 'reading') return;
    const el = bodyRef.current?.querySelector(`[data-block="${CSS.escape(sel)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [sel, s.view, limit]);

  // INSTANT RESUME (Logos 4): a document opens where it was read to, on this
  // device — unless a citation or a search asked for a passage of its own —
  // and remembers how far it is read as it is scrolled.
  const resumeAt = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!LOGOS4.resume || p.mode !== 'live' || s.view !== 'reading') return;
    if (resumeAt.current === undefined) resumeAt.current = sel ? null : readingAt(browserStorage(), doc.id);
    const at = resumeAt.current;
    if (!at) return;
    const i = visible.findIndex((b) => b.id === at);
    if (i < 0) {
      resumeAt.current = null;
      return;
    }
    if (i >= limit) {
      setLimit(i + MORE);
      return;
    }
    resumeAt.current = null;
    requestAnimationFrame(() => bodyRef.current?.querySelector(`[data-block="${CSS.escape(at)}"]`)?.scrollIntoView({ block: 'start' }));
  }, [p.mode, s.view, limit, doc.id, visible, sel]);
  useEffect(() => {
    if (!LOGOS4.resume || p.mode !== 'live') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = (e: Event) => {
      const root = bodyRef.current;
      const target = e.target;
      // only a scroll that moves this view: its own, or one of the boxes it sits in
      if (!root || !(target instanceof Node) || !target.contains(root)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const top = target instanceof Element ? target.getBoundingClientRect().top : 0;
        for (const el of root.querySelectorAll<HTMLElement>('[data-block]')) {
          if (el.getBoundingClientRect().bottom > top + 8) {
            if (el.dataset.block) rememberReading(browserStorage(), doc.id, el.dataset.block);
            break;
          }
        }
      }, 500);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      if (timer) clearTimeout(timer);
    };
  }, [p.mode, doc.id]);

  const goTo = (id: string) => {
    if (s.view !== 'reading') d.act('view', { view: 'reading' });
    select(id);
  };
  const keep = (next: SourceDoc | null, why: string) => {
    if (!next) return setNote(why);
    setNote(null);
    docs.save(next);
  };
  const readWaiting = async () => {
    setNote(null);
    const r = await docs.readPages(doc.id, waiting.slice(0, 24));
    if (r.stopped) setNote(r.stopped);
    else if (waiting.length > 24) setNote(`Read ${r.read} ${pageWord(doc.format, r.read)}; ${waiting.length - 24} more wait — read them when you need them.`);
  };

  return (
    <DisplayShell
      p={p}
      d={d}
      aside={`${doc.pageCount} ${pageWord(doc.format, doc.pageCount)} · ${formatSaid(doc.format)}${letter ? ` · cited as ${letter}` : ''}`}
    >
      <div className="doc-fig" ref={bodyRef}>
        <div className="doc-bar">
          <input
            className="dsp-edit doc-find"
            type="search"
            value={find}
            placeholder="Find in the document"
            aria-label="Find in the document"
            onChange={(e) => {
              setFind(e.target.value);
              setHit(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hits.length) {
                const i = (hit + (e.shiftKey ? hits.length - 1 : 1)) % hits.length;
                setHit(i);
                goTo(hits[i]);
              }
            }}
          />
          {q.length >= 2 && (
            <span className="doc-hits" role="status">
              {hits.length ? `${hits.length} passage${hits.length === 1 ? '' : 's'}` : 'not found'}
              {hits.length > 0 && (
                <>
                  <button type="button" className="dsp-tool" onClick={() => goTo(hits[(hit + hits.length - 1) % hits.length])} aria-label="Previous">
                    ↑
                  </button>
                  <button type="button" className="dsp-tool" onClick={() => goTo(hits[(hit + 1) % hits.length])} aria-label="Next">
                    ↓
                  </button>
                </>
              )}
            </span>
          )}
          {issues.length > 0 && s.view !== 'checks' && (
            <button type="button" className="doc-warn" onClick={() => d.act('view', { view: 'checks' })} disabled={!d.live}>
              {issues.length} check{issues.length === 1 ? '' : 's'} found something
            </button>
          )}
        </div>
        {(waiting.length > 0 || busy) && (
          <p className="doc-scan" role="status">
            {busy
              ? `Reading ${pageWord(doc.format, 2)} from their pictures — ${busy.done} of ${busy.of}…`
              : `${waiting.length} ${pageWord(doc.format, waiting.length)} ${waiting.length === 1 ? 'is a picture' : 'are pictures'} with no text to read — ${waiting.slice(0, 8).join(', ')}${waiting.length > 8 ? '…' : ''}.`}
            {!busy && d.live && (
              <button type="button" className="dsp-tool" onClick={() => void readWaiting()}>
                Read {waiting.length > 24 ? 'the first 24' : waiting.length === 1 ? 'it' : 'them'} from the {waiting.length === 1 ? 'picture' : 'pictures'}
              </button>
            )}
          </p>
        )}
        {note && (
          <p className="dsp-why" role="status">
            {note}
          </p>
        )}
        {s.view === 'reading' && (
          <Passages
            p={p}
            d={d}
            doc={doc}
            visible={visible}
            limit={limit}
            onMore={() => setLimit((n) => n + MORE)}
            sel={sel}
            select={select}
            keyOf={keyOf}
            q={q}
            editing={editing}
            setEditing={setEditing}
            keep={keep}
          />
        )}
        {s.view === 'outline' && <Outline doc={doc} visible={visible} keyOf={keyOf} goTo={goTo} />}
        {s.view === 'checks' && <Checks doc={doc} keyOf={keyOf} goTo={goTo} />}
      </div>
    </DisplayShell>
  );
}

function Passages({
  p,
  d,
  doc,
  visible,
  limit,
  onMore,
  sel,
  select,
  keyOf,
  q,
  editing,
  setEditing,
  keep,
}: {
  p: FigureProps;
  d: D;
  doc: SourceDoc;
  visible: DocBlock[];
  limit: number;
  onMore: () => void;
  sel: string | null;
  select: (id: string | null) => void;
  keyOf: (id: string) => string;
  q: string;
  editing: string | null;
  setEditing: (id: string | null) => void;
  keep: (next: SourceDoc | null, why: string) => void;
}) {
  const shown = visible.slice(0, limit);
  const tables = useMemo(() => new Map(doc.tables.map((t) => [t.id, t])), [doc]);
  const figures = useMemo(() => new Map(doc.figures.map((f) => [f.id, f])), [doc]);
  const pages = useMemo(() => new Map(doc.pages.map((pg) => [pg.n, pg])), [doc]);
  const out: ReactNode[] = [];
  let page = 0;
  for (const b of shown) {
    if (b.page !== page) {
      // the pages between, with nothing read on them, are said, not skipped
      for (let n = page + 1; n < b.page; n++) {
        const pg = pages.get(n);
        if (pg) out.push(<PageHead key={`pg${n}`} n={n} doc={doc} empty={pg.ocr === 'needed' ? 'a picture, not read yet' : pg.ocr === 'failed' ? 'could not be read from its picture' : 'nothing on it could be read'} />);
      }
      page = b.page;
      out.push(<PageHead key={`pg${page}`} n={page} doc={doc} />);
    }
    const on = sel === b.id;
    const tags = tagsOf(b);
    const t = b.table ? tables.get(b.table) : undefined;
    const f = b.figure ? figures.get(b.figure) : undefined;
    out.push(
      <div
        key={b.id}
        data-block={b.id}
        className={`doc-b is-${b.kind}${on ? ' is-sel' : ''}${b.method === 'vision' ? ' is-vision' : ''}${b.flags?.includes('misread') ? ' is-doubted' : ''}${b.flags?.includes('corrected') ? ' is-corrected' : ''}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, textarea, input, a, table')) return;
          select(on ? null : b.id);
        }}
      >
        <button type="button" className="doc-key" aria-pressed={on} onClick={() => select(on ? null : b.id)} title={`Replies cite this passage as [${keyOf(b.id)}]`}>
          {keyOf(b.id)}
        </button>
        <div className="doc-main">
          {editing === b.id ? (
            <Correcting
              b={b}
              onDone={(text) => {
                setEditing(null);
                if (text !== null) keep(correctBlock(doc, b.id, text), 'Nothing was changed — the words are the same.');
              }}
            />
          ) : t ? (
            <TableOf t={t} q={q} />
          ) : f ? (
            <div className="doc-t-fig">
              <span className="doc-fig-kind">{f.kind === 'chart' ? `Chart${f.chart ? ` · ${f.chart}` : ''}` : f.kind === 'equation' ? 'Equation (an embedded object, not readable as text)' : f.kind === 'diagram' ? 'Diagram' : f.kind === 'drawing' ? 'Drawing' : 'Figure'}</span>
              {f.caption && <span className="doc-t-cap"><Marked text={f.caption} q={q} /></span>}
              {f.alt && f.alt !== f.caption && <span className="doc-t-alt">Its description in the file: <Marked text={f.alt} q={q} /></span>}
              {b.text && b.text !== f.alt && <span className="doc-t-alt"><Marked text={b.text} q={q} /></span>}
              {f.described && <span className="doc-t-int">Described by a vision model — an interpretation, not the document’s words: {f.described}</span>}
            </div>
          ) : (
            <Text b={b} q={q} />
          )}
          {tags.length > 0 && <span className="doc-tags">{tags.join(' · ')}</span>}
          {on && editing !== b.id && (
            <Actions p={p} d={d} doc={doc} b={b} t={t} f={f} setEditing={setEditing} keep={keep} />
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="doc-pass">
      {out.length ? out : <p className="dsp-empty">Nothing in it could be read as text.</p>}
      {visible.length > shown.length && (
        <button type="button" className="dsp-open doc-more" onClick={onMore}>
          Show more — {visible.length - shown.length} passages further on
        </button>
      )}
      {doc.unread && (
        <p className="doc-unread">
          {pageWord(doc.format, 2).replace(/^./, (c) => c.toUpperCase())} {doc.unread.from}–{doc.unread.to} were not read: the document is longer than one reading holds.
        </p>
      )}
    </div>
  );
}

function PageHead({ n, doc, empty }: { n: number; doc: SourceDoc; empty?: string }) {
  return (
    <div className={`doc-page${empty ? ' is-empty' : ''}`}>
      <span>
        {pageWord(doc.format).replace(/^./, (c) => c.toUpperCase())} {n}
      </span>
      {empty && <em>{empty}</em>}
    </div>
  );
}

function Text({ b, q }: { b: DocBlock; q: string }) {
  const body = <Marked text={b.text} q={q} />;
  switch (b.kind) {
    case 'title':
      return <p className="doc-t-title">{body}</p>;
    case 'heading':
      return <p className={`doc-t-h is-l${Math.min(4, b.level ?? 1)}`}>{body}</p>;
    case 'list':
      return (
        <p className="doc-t-li" style={{ paddingLeft: `${Math.max(0, (b.level ?? 1) - 1) * 14}px` }}>
          {body}
        </p>
      );
    case 'quote':
      return <blockquote className="doc-t-q">{body}</blockquote>;
    case 'equation':
      return <p className="doc-t-eq">{body}</p>;
    case 'code':
      return <pre className="doc-t-code">{body}</pre>;
    case 'caption':
    case 'footnote':
    case 'note':
      return <p className="doc-t-small">{body}</p>;
    default:
      return <p className="doc-t-p">{body}</p>;
  }
}

function TableOf({ t, q }: { t: DocTable; q: string }) {
  return (
    <div className="doc-t-table">
      {t.caption && (
        <span className="doc-t-cap">
          <Marked text={t.caption} q={q} />
        </span>
      )}
      <div className="doc-table-wrap">
        <table>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) =>
                  i < t.head ? (
                    <th key={j} scope="col">
                      <Marked text={c} q={q} />
                    </th>
                  ) : (
                    <td key={j}>{c ? <Marked text={c} q={q} /> : <span className="doc-cell-empty" aria-label="empty" />}</td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A passage being corrected: the person's words, committed with Save (or ⌘Enter), dropped with Escape. */
function Correcting({ b, onDone }: { b: DocBlock; onDone: (text: string | null) => void }) {
  const [v, setV] = useState(b.text);
  return (
    <div className="doc-correct">
      <textarea
        className="doc-correct-in"
        value={v}
        autoFocus
        aria-label="What the passage says"
        rows={Math.min(10, Math.max(2, Math.ceil(b.text.length / 70)))}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone(null);
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onDone(v);
        }}
      />
      <span className="doc-correct-do">
        <button type="button" className="dsp-tool" onClick={() => onDone(v)}>
          Save my correction
        </button>
        <button type="button" className="dsp-tool" onClick={() => onDone(null)}>
          Cancel
        </button>
        <span className="doc-correct-say">It will be shown — and given to Socria — as corrected by you.</span>
      </span>
    </div>
  );
}

function Actions({
  p,
  d,
  doc,
  b,
  t,
  f,
  setEditing,
  keep,
}: {
  p: FigureProps;
  d: D;
  doc: SourceDoc;
  b: DocBlock;
  t?: DocTable;
  f?: SourceDoc['figures'][number];
  setEditing: (id: string | null) => void;
  keep: (next: SourceDoc | null, why: string) => void;
}) {
  const [said, setSaid] = useState<string | null>(null);
  const fn = b.kind === 'equation' ? functionFromEquation(b) : null;
  const chartable = t?.id ?? (f?.table && doc.tables.some((x) => x.id === f.table) ? f.table : undefined);
  const chart = () => {
    if (!chartable || !p.onWorkspace) return;
    const made = chartFromTable(doc, chartable);
    if (!made) return setSaid('That table holds nothing to chart.');
    const r = p.onWorkspace({ type: 'make', kind: 'data', state: made.state, from: { obj: p.obj.id }, origin: 'source' });
    setSaid(r.ok ? (made.left.length ? `Charted beside this — left out: ${made.left.join('; ')}.` : 'Charted beside this, with where its numbers came from.') : r.why ?? 'It could not be charted.');
  };
  return (
    <div className="doc-acts">
      <span className="doc-acts-hint">Selected — what you ask next is about this passage.</span>
      {d.live && (
        <span className="doc-acts-do">
          {correctable(b) && (
            <button type="button" className="dsp-tool" onClick={() => setEditing(b.id)}>
              Correct it
            </button>
          )}
          {b.flags?.includes('corrected') && (
            <button type="button" className="dsp-tool" onClick={() => keep(restoreBlock(doc, b.id), 'It was not corrected.')}>
              Take back my correction
            </button>
          )}
          <button
            type="button"
            className="dsp-tool"
            onClick={() => keep(markMisread(doc, b.id, !b.flags?.includes('misread')), 'Nothing to change.')}
            title="Socria is told not to rely on a passage you doubt"
          >
            {b.flags?.includes('misread') ? 'It is read rightly' : 'It was read wrongly'}
          </button>
          {chartable && p.onWorkspace && (
            <button type="button" className="dsp-tool" onClick={chart}>
              Chart it
            </button>
          )}
          {fn && p.onDraft && (
            <button type="button" className="dsp-tool" onClick={() => p.onDraft?.(fn)} title={`Put “${fn}” in the conversation, to send and work with`}>
              Work with it
            </button>
          )}
        </span>
      )}
      {said && (
        <span className="doc-acts-said" role="status">
          {said}
        </span>
      )}
    </div>
  );
}

function Outline({ doc, visible, keyOf, goTo }: { doc: SourceDoc; visible: DocBlock[]; keyOf: (id: string) => string; goTo: (id: string) => void }) {
  const items = visible.filter((b) => b.kind === 'title' || b.kind === 'heading' || b.kind === 'table' || b.kind === 'figure' || b.kind === 'equation');
  if (!items.length) return <p className="dsp-empty">It has no headings, tables, figures or equations — its passages are under Reading.</p>;
  const tables = new Map(doc.tables.map((t) => [t.id, t]));
  const figures = new Map(doc.figures.map((f) => [f.id, f]));
  const said = (b: DocBlock): string => {
    if (b.kind === 'table') return `Table — ${tables.get(b.table ?? '')?.caption ?? `${tables.get(b.table ?? '')?.rows.length ?? 0} rows`}`;
    if (b.kind === 'figure') {
      const f = figures.get(b.figure ?? '');
      return `${f?.kind === 'chart' ? 'Chart' : 'Figure'} — ${f?.caption ?? f?.alt ?? b.text ?? ''}`.replace(/ — $/, '');
    }
    if (b.kind === 'equation') return `Equation — ${b.text}`;
    return b.text;
  };
  return (
    <ol className="doc-outline">
      {items.slice(0, 600).map((b) => (
        <li key={b.id} className={`is-${b.kind}${b.kind === 'heading' ? ` is-l${Math.min(4, b.level ?? 1)}` : ''}`}>
          <button type="button" onClick={() => goTo(b.id)}>
            <span className="doc-outline-text">{said(b).slice(0, 160)}</span>
            <span className="doc-outline-key">
              {keyOf(b.id)} · {pageWord(doc.format)} {b.page}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

const MARK: Record<DocCheck['level'], string> = { ok: '✓', warn: '!', fail: '×' };

function Checks({ doc, keyOf, goTo }: { doc: SourceDoc; keyOf: (id: string) => string; goTo: (id: string) => void }) {
  const edits = editsIn(doc);
  const byMethod = { text: 0, structured: 0, vision: 0, none: 0 };
  for (const pg of doc.pages) byMethod[pg.method] += 1;
  const firstOn = (n: number) => doc.blocks.find((b) => b.page === n && b.kind !== 'header' && b.kind !== 'footer')?.id;
  return (
    <div className="doc-checks">
      <p className="doc-how">
        {[
          byMethod.text ? `${byMethod.text} ${pageWord(doc.format, byMethod.text)} read from the file’s own text` : '',
          byMethod.structured ? `${byMethod.structured} from its own structure` : '',
          byMethod.vision ? `${byMethod.vision} from ${byMethod.vision === 1 ? 'a picture' : 'pictures'} by a vision model` : '',
          byMethod.none ? `${byMethod.none} with nothing read yet` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        .
      </p>
      <ul className="doc-check-list">
        {doc.checks.map((c, i) => (
          <li key={`${c.id}-${i}`} className={`is-${c.level}`}>
            <span className="doc-check-mark" aria-label={c.level === 'ok' ? 'passed' : c.level === 'warn' ? 'a warning' : 'failed'}>
              {MARK[c.level]}
            </span>
            <span className="doc-check-says">
              {c.says}
              {(c.blocks?.length || c.pages?.length) && (
                <span className="doc-check-at">
                  {(c.blocks ?? []).slice(0, 12).map((id) => (
                    <button key={id} type="button" onClick={() => goTo(id)}>
                      {keyOf(id)}
                    </button>
                  ))}
                  {!c.blocks?.length &&
                    (c.pages ?? []).slice(0, 12).map((n) => {
                      const id = firstOn(n);
                      return id ? (
                        <button key={n} type="button" onClick={() => goTo(id)}>
                          {pageWord(doc.format)} {n}
                        </button>
                      ) : (
                        <span key={n}>
                          {pageWord(doc.format)} {n}
                        </span>
                      );
                    })}
                </span>
              )}
            </span>
          </li>
        ))}
        {!doc.checks.length && <li className="is-ok">No checks were run on this reading.</li>}
      </ul>
      {(edits.corrected > 0 || edits.misread > 0) && (
        <p className="doc-edits">
          {[edits.corrected ? `You corrected ${edits.corrected} passage${edits.corrected === 1 ? '' : 's'}` : '', edits.misread ? `marked ${edits.misread} as read wrongly` : ''].filter(Boolean).join(' and ')}
          . Socria is told so wherever they are given to it.
        </p>
      )}
    </div>
  );
}
