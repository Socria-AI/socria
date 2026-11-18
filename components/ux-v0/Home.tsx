'use client';
// components/ux-v0/Home.tsx — the SocriaUX home: an entrance, and the collection.
//
// Drawn as a design museum's archive rather than a dashboard: a Swiss grid,
// big type set against small archival labels, generous paper, hairline rules,
// and the designer's work shown as exhibits — each a live miniature of the
// design itself (drawn by the same renderer, in a sealed frame), a number in
// the collection, a wall label with its kind, its state and its dates. It is
// still the place work is made and kept: the question to begin a work and the
// door for a design to critique open the page, and every work can be found
// (search, kind, order), opened, and deleted (asked in place, "Keep it"
// focused). An index view lists the collection as a catalogue for when there
// are many. Brandbook Version 2: Cormorant Garamond for what Socria says,
// Geist for everything operated, moss on paper, one apricot arch for the
// question, flat colour, no shadows but what floats.

import { useEffect, useMemo, useRef, useState } from 'react';
import { renderDesign } from '@/lib/ux-v0/render';
import { buildSandboxDoc } from '@/lib/ux-v0/sandbox';
import { getArtifact, getProject } from '@/lib/ux-v0/store';
import { currentSpec, type ProjectSummary } from '@/lib/ux-v0/types';
import { preloadUploads, withUploads } from './uploads';

export interface RemoteWork {
  id: string;
  name: string;
  updatedAt: number;
}

interface Props {
  signedIn: boolean;
  ready: boolean;
  list: ProjectSummary[];
  elsewhere: RemoteWork[];
  error: string;
  nonce: string;
  onCreate: (intent: string) => void;
  onCritique: (file: File) => void;
  onOpen: (id: string) => void;
  onDelete: (s: ProjectSummary) => void;
}

type Filter = 'all' | 'create' | 'critique';
type Order = 'recent' | 'oldest' | 'title';
type View = 'exhibits' | 'index';

const EXAMPLES = ['a premium coffee shop website', 'a portfolio for an illustrator', 'a landing page for a student society', 'a booking screen for a yoga studio'];

const STEPS: [string, string][] = [
  ['Questions', 'A few, one at a time, until the idea is clear.'],
  ['References', 'Licensed images on a moodboard you keep or remove.'],
  ['Brief', 'Written for you to edit and approve.'],
  ['Direction', 'Three visual languages to choose, change or lock.'],
  ['Design', 'Drawn, checked at desktop and phone, yours to change.'],
];

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const date = (t: number) => DATE.format(new Date(t));
const num = (n: number) => `No. ${String(n).padStart(3, '0')}`;

const MEDIUM: Record<string, string> = { html: 'an HTML page', png: 'a PNG image', jpg: 'a JPG image', svg: 'an SVG drawing' };

function kindLine(s: ProjectSummary): string {
  if (s.mode === 'critique') return s.medium ? `Critique of ${MEDIUM[s.medium]}` : 'Critique';
  const page = s.pageType === 'app-screen' ? 'App screen' : s.pageType === 'website' ? 'Website' : 'Design';
  return s.direction ? `${page} · ${s.direction}` : page;
}

function stateLine(s: ProjectSummary): string {
  const cards = s.cards ? ` · ${s.cards} card${s.cards === 1 ? '' : 's'}` : '';
  switch (s.stage) {
    case 'design':
      return `${s.versions > 1 ? `Designed, ${s.versions} versions` : 'Designed'}${cards}`;
    case 'direction':
      return `Choosing a direction${cards}`;
    case 'brief':
      return `Brief drafted${cards}`;
    case 'discovery':
      return `In discovery${cards}`;
    case 'imported':
      return `Under critique${cards}`;
    default:
      return 'Not yet begun';
  }
}

const read = <T extends string>(key: string, allowed: readonly T[], d: T): T => {
  try {
    const v = window.localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : d;
  } catch {
    return d;
  }
};
const keep = (key: string, v: string) => {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* storage refused: the choice lasts the visit */
  }
};

// ── the plate: what a work looks like, drawn small ────────────────────

type Shown = { kind: 'page'; html: string } | { kind: 'image'; url: string } | null;

/**
 * A work's plate. A generated design is drawn by the renderer at 1280 px and
 * scaled to the plate; an imported image is shown as itself; an imported page
 * in its sandbox. All in frames with no scripts at all, and only once the
 * plate comes near the screen. A work still being shaped shows its studies
 * (the references kept for it) or, before those, the idea in words.
 */
function Plate({ s, ratio, nonce }: { s: ProjectSummary; ratio: number; nonce: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [shown, setShown] = useState<Shown>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return setNear(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setNear(true), io.disconnect()), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!near || (s.stage !== 'design' && s.stage !== 'imported')) return;
    let url = '';
    let live = true;
    (async () => {
      const p = await getProject(s.id);
      if (!p || !live) return;
      // the same sealed document the workspace frames: no scripts, the nonce policy
      const seal = (html: string) => buildSandboxDoc(html, { parse: (h) => new DOMParser().parseFromString(h, 'text/html'), runScripts: false, nonce, inspector: '' }).doc;
      const spec = currentSpec(p);
      if (spec) {
        await preloadUploads(p.moodboard.refs, true);
        if (!live) return;
        return setShown({ kind: 'page', html: seal(renderDesign(spec, withUploads(p.moodboard.refs, true)).html) });
      }
      const a = p.artifact?.type === 'imported' ? p.artifact : null;
      if (!a) return;
      const rec = await getArtifact(a.id);
      if (!rec || !live) return;
      if (a.kind === 'html') {
        const html = await rec.data.text();
        if (live) setShown({ kind: 'page', html: seal(html) });
      } else {
        url = URL.createObjectURL(rec.data);
        setShown({ kind: 'image', url });
      }
    })().catch(() => undefined);
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [near, s.id, s.stage, s.updatedAt, nonce]);

  // the page is laid out at desktop width and scaled down to the plate, whatever shape the plate takes
  const scale = size.w / 1280;
  return (
    <div className={`mu-plate is-${s.stage}`} ref={box} style={{ aspectRatio: String(ratio) }} aria-hidden="true">
      {shown?.kind === 'page' && size.w > 0 && (
        <iframe className="mu-plate-frame" title="" sandbox="" srcDoc={shown.html} tabIndex={-1} style={{ width: 1280, height: Math.ceil(size.h / scale), transform: `scale(${scale})` }} />
      )}
      {shown?.kind === 'image' && <img className="mu-plate-img" src={shown.url} alt="" />}
      {!shown && s.studies.length > 0 && (
        <span className={`mu-studies n-${s.studies.length}`}>
          {s.studies.map((u) => (
            <img key={u} src={u} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          ))}
        </span>
      )}
      {!shown && !s.studies.length && (
        <span className="mu-idea">
          <span className={`mu-glyph g-${s.mode === 'critique' ? 'file' : 'question'}`} />
          <span className="mu-idea-text">{s.intent ? `“${s.intent}”` : 'Not yet begun.'}</span>
        </span>
      )}
    </div>
  );
}

// ── the home ─────────────────────────────────────────────────────────

/** the rhythm of the exhibition grid after the featured work: 5|7, 4|4|4, 7|5, 4|4|4 */
const SPANS = [5, 7, 4, 4, 4, 7, 5, 4, 4, 4];
const RATIO: Record<number, number> = { 12: 16 / 9, 7: 16 / 10, 5: 4 / 5, 4: 4 / 3 };

export function Home(p: Props) {
  const [intent, setIntent] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [order, setOrder] = useState<Order>('recent');
  const [view, setView] = useState<View>('exhibits');
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // the visitor's last way of looking at the collection
  useEffect(() => {
    setView(read('socriaux.home.view', ['exhibits', 'index'] as const, 'exhibits'));
    setOrder(read('socriaux.home.order', ['recent', 'oldest', 'title'] as const, 'recent'));
  }, []);

  // numbers in the collection: the order works were begun in, the first No. 001
  const numbers = useMemo(() => new Map([...p.list].sort((a, b) => a.createdAt - b.createdAt).map((s, i) => [s.id, i + 1])), [p.list]);

  const q = query.trim().toLowerCase();
  const matches = (s: { name: string; intent?: string }) => !q || s.name.toLowerCase().includes(q) || (s.intent ?? '').toLowerCase().includes(q);
  const shown = useMemo(() => {
    const xs = p.list.filter((s) => (filter === 'all' || s.mode === filter) && matches(s));
    if (order === 'oldest') xs.sort((a, b) => a.createdAt - b.createdAt);
    else if (order === 'title') xs.sort((a, b) => a.name.localeCompare(b.name));
    else xs.sort((a, b) => b.updatedAt - a.updatedAt);
    return xs;
  }, [p.list, filter, order, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const remote = filter === 'all' ? p.elsewhere.filter((r) => matches(r)) : [];
  // the hang: the latest work featured across the wall (when the collection is shown whole and
  // by recency), then the rhythm; a work left alone on the last row hangs small, not as an empty wall
  const lead = !q && filter === 'all' && order === 'recent';
  const spans = useMemo(() => {
    const xs = shown.map((_, i) => (lead && i === 0 ? 12 : SPANS[(i - (lead ? 1 : 0)) % SPANS.length]));
    let row = 0;
    let start = 0;
    xs.forEach((w, i) => {
      if (row + w > 12) (row = 0), (start = i);
      row += w;
    });
    if (xs.length > 1 && start === xs.length - 1 && xs[start] !== 12) xs[start] = 4;
    return xs;
  }, [shown, lead]);
  const total = p.list.length + p.elsewhere.length;
  const count = shown.length + remote.length;

  const begin = () => {
    const v = intent.trim();
    if (v) p.onCreate(v);
    else field.current?.focus();
  };

  const confirmRow = (s: ProjectSummary) => (
    <div
      className="v0-confirm mu-confirm"
      role="group"
      aria-label={`Delete ${s.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') (e.stopPropagation(), setDeleting(null));
      }}
    >
      <p>
        Delete “{s.name}” and its cards? It goes from this browser{p.signedIn ? ' and from your account' : ''}, and cannot be brought back.
      </p>
      <div className="v0-confirm-acts">
        <button
          type="button"
          className="sb-btn is-sm is-danger is-solid"
          onClick={() => {
            setDeleting(null);
            p.onDelete(s);
          }}
        >
          Delete it
        </button>
        <button type="button" className="sb-btn is-sm" autoFocus onClick={() => setDeleting(null)}>
          Keep it
        </button>
      </div>
    </div>
  );

  const label = (s: ProjectSummary, big = false) => (
    <div className="mu-label">
      <p className="mu-no">{num(numbers.get(s.id) ?? 0)}</p>
      <h3 className={`mu-title${big ? ' is-big' : ''}`}>
        <button type="button" className="v0-list-open mu-open" onClick={() => p.onOpen(s.id)} aria-describedby={`mu-l-${s.id}`}>
          {s.name || 'Untitled'}
        </button>
      </h3>
      <p className="mu-meta" id={`mu-l-${s.id}`}>
        <span>{kindLine(s)}</span>
        <span>{stateLine(s)}</span>
        <span className="mu-dates">
          Begun <time dateTime={new Date(s.createdAt).toISOString()}>{date(s.createdAt)}</time>
          {s.updatedAt - s.createdAt > 60_000 && (
            <>
              {' · '}updated <time dateTime={new Date(s.updatedAt).toISOString()}>{date(s.updatedAt)}</time>
            </>
          )}
        </span>
      </p>
      <button type="button" className="sb-link is-meta mu-delete" onClick={() => setDeleting(s.id)}>
        Delete
      </button>
    </div>
  );

  return (
    <div className="v0-home-page sb mu">
      <a className="mu-skip" href="#collection">
        Skip to the collection
      </a>
      <header className="mu-mast">
        <div className="mu-mast-id">
          <a className="mu-mark" href="/" aria-label="Socria, home">
            <img src="/socria-mark.png" alt="" width={20} height={20} />
            <span className="mu-wordmark">Socria</span>
          </a>
          <span className="mu-product">UX</span>
        </div>
        <nav className="mu-nav" aria-label="SocriaUX">
          <a href="#begin">Begin a work</a>
          <a href="#collection">The collection</a>
        </nav>
        <div className="mu-mast-r">
          {p.signedIn ? (
            <a className="sb-link is-meta" href="/account">
              Account
            </a>
          ) : (
            <a className="sb-link is-meta is-strong" href="/sign-in?redirect_url=/ux-v0">
              Sign in
            </a>
          )}
        </div>
      </header>

      <main>
        <section className="mu-entrance" id="begin" aria-label="Begin a work">
          <p className="mu-kicker">
            <span>SocriaUX</span>
            <span>Design, by asking first.</span>
            <span className="mu-kicker-n">{p.ready ? `${total} work${total === 1 ? '' : 's'} in the collection` : ''}</span>
          </p>
          <h1 className="mu-question" id="mu-question">
            What do you want to <em>make</em>?
          </h1>
          <div className="mu-arch" aria-hidden="true">
            <span className="mu-arch-shape" />
            <span className="mu-caption">
              <b>Fig. 1</b> The question comes first.
            </span>
          </div>
          <p className="mu-lede">Describe it in a sentence. SocriaUX asks a few questions, gathers licensed references and drafts a brief you approve, before anything is drawn.</p>
          <div className="mu-compose">
            <div className="mu-field v0-intent-line">
              <textarea
                ref={field}
                rows={2}
                value={intent}
                placeholder="A website for…"
                aria-label="What do you want to make?"
                onChange={(e) => setIntent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && intent.trim()) {
                    e.preventDefault();
                    begin();
                  }
                }}
              />
              <button type="button" className="sb-btn is-primary" onClick={begin} disabled={!intent.trim()}>
                Begin
              </button>
            </div>
            <p className="mu-examples">
              <span>For instance</span>
              {EXAMPLES.map((x) => (
                <button key={x} type="button" className="mu-example" onClick={() => (setIntent(x.charAt(0).toUpperCase() + x.slice(1)), field.current?.focus())}>
                  {x}
                </button>
              ))}
            </p>
          </div>
          <section
            className={`v0-way-drop mu-door${dropping ? ' is-over' : ''}`}
            aria-labelledby="mu-door-t"
            onDragOver={(e) => {
              e.preventDefault();
              setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropping(false);
              const f = e.dataTransfer.files?.[0];
              if (f) p.onCritique(f);
            }}
          >
            <p className="mu-door-k">Or, critique</p>
            <h2 className="mu-door-t" id="mu-door-t">
              Bring a design to look at closely.
            </h2>
            <p className="mu-door-b">HTML, PNG, JPG or SVG. Choose one or drop it here, then select any part and reason it through.</p>
            <button type="button" className="sb-link is-go" onClick={() => fileInput.current?.click()}>
              Choose a file <span className="sb-ar">→</span>
            </button>
          </section>
          {p.error && (
            <p className="v0-error-line mu-error" role="alert">
              {p.error}
            </p>
          )}
        </section>

        <ol className="mu-steps" aria-label="How a work is made">
          {STEPS.map(([t, d], i) => (
            <li key={t}>
              <span className="mu-step-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="mu-step-t">{t}</span>
              <span className="mu-step-d">{d}</span>
            </li>
          ))}
        </ol>

        <section className="mu-collection" id="collection" aria-labelledby="mu-coll" tabIndex={-1}>
          <div className="mu-coll-head">
            <h2 className="mu-h2" id="mu-coll">
              The collection.
            </h2>
            <p className="mu-coll-note">{p.signedIn ? 'Kept in this browser and with your account.' : 'Kept in this browser. Sign in to keep it across devices.'}</p>
          </div>

          {total > 0 && (
            <div className="mu-tools" role="toolbar" aria-label="Find and arrange the collection">
              <label className="mu-search">
                <span className="mu-vh">Find a work</span>
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <circle cx="7" cy="7" r="4.6" />
                  <path d="M10.4 10.4 14 14" />
                </svg>
                <input type="search" value={query} placeholder="Find by title or idea" onChange={(e) => setQuery(e.target.value)} />
              </label>
              <span className="sb-seg is-tight" role="radiogroup" aria-label="Kind">
                {(
                  [
                    ['all', 'All'],
                    ['create', 'Created'],
                    ['critique', 'Critiqued'],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={filter === v} className={`sb-seg-item${filter === v ? ' is-on' : ''}`} onClick={() => setFilter(v)}>
                    {l}
                  </button>
                ))}
              </span>
              <label className="mu-order">
                <span>Order</span>
                <select
                  className="v0-select"
                  value={order}
                  onChange={(e) => {
                    const v = e.target.value as Order;
                    setOrder(v);
                    keep('socriaux.home.order', v);
                  }}
                >
                  <option value="recent">Recently changed</option>
                  <option value="oldest">Order begun</option>
                  <option value="title">Title</option>
                </select>
              </label>
              <span className="sb-seg is-tight mu-views" role="radiogroup" aria-label="View">
                {(
                  [
                    ['exhibits', 'Exhibits'],
                    ['index', 'Index'],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={view === v}
                    className={`sb-seg-item${view === v ? ' is-on' : ''}`}
                    onClick={() => {
                      setView(v);
                      keep('socriaux.home.view', v);
                    }}
                  >
                    {l}
                  </button>
                ))}
              </span>
              <p className="mu-count" role="status">
                {q || filter !== 'all' ? `${count} of ${total} works` : `${total} work${total === 1 ? '' : 's'}`}
              </p>
            </div>
          )}

          {p.ready && total === 0 && (
            <div className="mu-empty">
              <p className="mu-empty-t">The collection is empty.</p>
              <p className="mu-empty-b">Your first work begins with the question above, or with a design you bring to critique.</p>
              <button type="button" className="sb-link is-go" onClick={() => field.current?.focus()}>
                To the question <span className="sb-ar">↑</span>
              </button>
            </div>
          )}

          {total > 0 && count === 0 && (
            <div className="mu-empty">
              <p className="mu-empty-t">Nothing in the collection matches{q ? ` “${query.trim()}”` : ''}.</p>
              <button
                type="button"
                className="sb-link is-go"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Show the whole collection
              </button>
            </div>
          )}

          {view === 'exhibits' && count > 0 && (
            <ul className="mu-exhibits">
              {shown.map((s, i) => {
                const featured = lead && i === 0;
                const span = spans[i];
                return (
                  <li key={s.id} className={`v0-list-row mu-exhibit s${span}${featured ? ' is-featured' : ''}${deleting === s.id ? ' is-asking' : ''}`} style={{ ['--i' as string]: Math.min(i, 9) }}>
                    <Plate s={s} ratio={featured ? 16 / 10 : RATIO[span]} nonce={p.nonce} />
                    {deleting === s.id ? confirmRow(s) : label(s, featured)}
                  </li>
                );
              })}
              {remote.map((r, i) => (
                <li key={r.id} className="v0-list-row mu-exhibit s4 is-remote" style={{ ['--i' as string]: Math.min(shown.length + i, 9) }}>
                  <div className="mu-plate is-remote" aria-hidden="true" style={{ aspectRatio: '4 / 3' }}>
                    <span className="mu-idea">
                      <span className="mu-glyph g-idea" />
                      <span className="mu-idea-text">Kept with your account.</span>
                    </span>
                  </div>
                  <div className="mu-label">
                    <p className="mu-no">From another device</p>
                    <h3 className="mu-title">
                      <button type="button" className="v0-list-open mu-open" onClick={() => p.onOpen(r.id)}>
                        {r.name || 'Untitled'}
                      </button>
                    </h3>
                    <p className="mu-meta">
                      <span className="mu-dates">
                        Updated <time dateTime={new Date(r.updatedAt).toISOString()}>{date(r.updatedAt)}</time>
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {view === 'index' && count > 0 && (
            <ol className="mu-index">
              <li className="mu-index-head" aria-hidden="true">
                <span>No.</span>
                <span>Title</span>
                <span>Kind</span>
                <span>State</span>
                <span>Changed</span>
                <span />
              </li>
              {shown.map((s) =>
                deleting === s.id ? (
                  <li key={s.id} className="v0-list-row mu-row is-asking">
                    {confirmRow(s)}
                  </li>
                ) : (
                  <li key={s.id} className="v0-list-row mu-row">
                    <span className="mu-row-n">{String(numbers.get(s.id) ?? 0).padStart(3, '0')}</span>
                    <button type="button" className="v0-list-open mu-row-open" onClick={() => p.onOpen(s.id)}>
                      {s.name || 'Untitled'}
                    </button>
                    <span className="mu-row-k">{kindLine(s)}</span>
                    <span className="mu-row-s">{stateLine(s)}</span>
                    <time className="mu-row-d" dateTime={new Date(s.updatedAt).toISOString()}>
                      {date(s.updatedAt)}
                    </time>
                    <button type="button" className="sb-link is-meta mu-delete" onClick={() => setDeleting(s.id)} aria-label="Delete" title={`Delete ${s.name}`}>
                      Delete
                    </button>
                  </li>
                )
              )}
              {remote.map((r) => (
                <li key={r.id} className="v0-list-row mu-row is-remote">
                  <span className="mu-row-n">—</span>
                  <button type="button" className="v0-list-open mu-row-open" onClick={() => p.onOpen(r.id)}>
                    {r.name || 'Untitled'}
                  </button>
                  <span className="mu-row-k">From another device</span>
                  <span className="mu-row-s" />
                  <time className="mu-row-d" dateTime={new Date(r.updatedAt).toISOString()}>
                    {date(r.updatedAt)}
                  </time>
                  <span />
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>

      <footer className="mu-colophon">
        <div className="mu-colophon-mark">
          <img src="/socria-mark.png" alt="" width={18} height={18} />
          <span className="mu-wordmark">Socria</span>
          <span className="mu-tagline">Think For Yourself.</span>
        </div>
        <p>SocriaUX asks before it designs, shows its working, and keeps every decision yours.</p>
        <p className="mu-colophon-q">
          <a className="sb-link is-meta" href="/">
            Socria
          </a>
          {p.signedIn && (
            <a className="sb-link is-meta" href="/account">
              Account
            </a>
          )}
        </p>
      </footer>

      <input
        ref={fileInput}
        type="file"
        accept=".html,.htm,.png,.jpg,.jpeg,.svg,text/html,image/png,image/jpeg,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) p.onCritique(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
