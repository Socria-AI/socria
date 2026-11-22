'use client';
// components/ux-v0/studio/Collection.tsx — the work kept: every design, graphic, board and conversation in this browser
// (and, signed in, with the account), shown as exhibits — each a live miniature drawn by the same renderer as its
// workspace, in a sealed frame — or as an index. It can be searched, filtered by kind, ordered, opened and deleted
// (asked in place, “Keep it” focused). Moved here from the earlier home, unchanged in what it does.

import { useEffect, useMemo, useRef, useState } from 'react';
import { renderDesign } from '@/lib/ux-v0/render';
import { renderArtboard } from '@/lib/ux-v0/graphics/render';
import { boardOverviewSvg, websiteSchematicSvg } from '@/lib/ux-v0/boards/export';
import { mockupSvg } from '@/lib/ux-v0/boards/mockup';
import { fontStylesheet } from '@/lib/ux-v0/fonts';
import { buildSandboxDoc } from '@/lib/ux-v0/sandbox';
import { getArtifact, getProject } from '@/lib/ux-v0/store';
import { currentSpec, type ProjectSummary } from '@/lib/ux-v0/types';
import { preloadUploads, withUploads } from '../uploads';
import { Search } from './glyphs';

export interface RemoteWork {
  id: string;
  name: string;
  updatedAt: number;
}

type Filter = 'all' | 'create' | 'critique' | 'conversation';
type Order = 'recent' | 'oldest' | 'title';
type View = 'exhibits' | 'index';

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const date = (t: number) => DATE.format(new Date(t));
export const num = (n: number) => `No. ${String(n).padStart(3, '0')}`;

const MODE_LABEL: Record<string, string> = { graphic: 'Graphic', website: 'Website', logo: 'Logo', system: 'Design system', board: 'Board', critique: 'Critique' };

const MEDIUM: Record<string, string> = { html: 'an HTML page', png: 'a PNG image', jpg: 'a JPG image', svg: 'an SVG drawing' };

const GRAPHIC_KIND: Record<string, string> = {
  poster: 'Poster',
  social: 'Social post',
  carousel: 'Carousel',
  ad: 'Advertisement',
  banner: 'Banner',
  magazine: 'Magazine cover',
  book: 'Book cover',
  album: 'Album cover',
  card: 'Business card',
  label: 'Label',
  infographic: 'Infographic',
  identity: 'Identity board',
  announcement: 'Announcement',
  presentation: 'Slide',
  campaign: 'Campaign',
};

export function kindLine(s: ProjectSummary): string {
  if (s.studio?.status === 'discovering') return `${MODE_LABEL[s.studio.mode] ?? 'Work'} · in conversation`;
  if (s.board !== undefined) return `Board · ${s.board} material${s.board === 1 ? '' : 's'}${s.direction ? ` · ${s.direction}` : ''}`;
  if (s.graphic) return `${GRAPHIC_KIND[s.graphic] ?? 'Graphic'}${s.direction ? ` · ${s.direction}` : ''}`;
  if (s.mode === 'critique') return s.medium ? `Critique of ${MEDIUM[s.medium]}` : 'Critique';
  const page = s.pageType === 'app-screen' ? 'App screen' : s.pageType === 'website' ? 'Website' : 'Design';
  return s.direction ? `${page} · ${s.direction}` : page;
}

export function stateLine(s: ProjectSummary): string {
  if (s.studio?.status === 'discovering') return 'Still being discussed';
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

type Shown = { kind: 'page'; html: string } | { kind: 'image'; url: string } | { kind: 'svg'; svg: string } | null;

/**
 * A work's plate. A generated design is drawn by the renderer at 1280 px and
 * scaled to the plate; an imported image is shown as itself; an imported page
 * in its sandbox. All in frames with no scripts at all, and only once the
 * plate comes near the screen. A work still being shaped shows its studies
 * (the references kept for it) or, before those, the idea in words.
 */
export function Plate({ s, ratio, nonce }: { s: ProjectSummary; ratio: number; nonce: string }) {
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
    const urls: string[] = [];
    let live = true;
    (async () => {
      const p = await getProject(s.id);
      if (!p || !live) return;
      // a board: its overview without the notes, drawn by the same renderer as its export (websites as schematics)
      const bd = p.medium === 'board' ? p.board : null;
      if (bd && bd.system) {
        const sys = bd.system;
        const faces = fontStylesheet([sys.tokens.fonts.display, sys.tokens.fonts.body, 'Inter']);
        if (faces && !document.querySelector(`link[data-mu-faces="b-${sys.tokens.fonts.display}-${sys.tokens.fonts.body}"]`)) {
          const l = document.createElement('link');
          l.rel = 'stylesheet';
          l.href = faces;
          l.dataset.muFaces = `b-${sys.tokens.fonts.display}-${sys.tokens.fonts.body}`;
          document.head.appendChild(l);
        }
        const blank = (_id: string, src: string) => (src.startsWith('upload:') ? '' : src);
        const ov = boardOverviewSvg(bd, {
          annotations: false,
          refHref: () => '',
          materialSvg: (m, prefix) => {
            if (m.type === 'graphic' && m.doc) return { svg: renderArtboard(m.doc, m.doc.artboards[0], { href: blank, idPrefix: `pl-${s.id}-${prefix}` }), w: m.doc.artboards[0].width, h: m.doc.artboards[0].height };
            if (m.type === 'mockup') {
              const src = bd.materials.find((x) => x.id === m.source?.material);
              const a = src?.type === 'graphic' ? src.doc?.artboards[0] : null;
              return mockupSvg(m.template, src?.type === 'graphic' && src.doc && a ? { svg: renderArtboard(src.doc, a, { href: blank, idPrefix: `pl-${s.id}-${prefix}s` }), w: a.width, h: a.height, ground: a.background ?? undefined } : null, sys, `pl-${s.id}-${prefix}`);
            }
            if (m.type === 'website') return { svg: websiteSchematicSvg(null, 1280, 820, false), w: 1280, h: 820 };
            return null;
          },
        });
        if (!live) return;
        return setShown({ kind: 'svg', svg: ov.svg.replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, '<svg$1 width="100%" height="100%"') });
      }
      // a graphic: its first artboard, drawn by the same renderer as its editor and its exports
      const gdoc = p.medium === 'graphic' ? p.graphic?.doc : null;
      if (gdoc) {
        const map = new Map<string, string>();
        for (const a of gdoc.assets) {
          if (!a.src.startsWith('upload:')) continue;
          const rec = await getArtifact(a.src.slice('upload:'.length));
          if (rec) {
            const u = URL.createObjectURL(rec.data);
            urls.push(u);
            map.set(a.id, u);
          }
        }
        if (!live) return;
        const faces = fontStylesheet([gdoc.tokens.fonts.display, gdoc.tokens.fonts.body]);
        if (faces && !document.querySelector(`link[data-mu-faces="${faces.length}-${gdoc.tokens.fonts.display}-${gdoc.tokens.fonts.body}"]`)) {
          const l = document.createElement('link');
          l.rel = 'stylesheet';
          l.href = faces;
          l.dataset.muFaces = `${faces.length}-${gdoc.tokens.fonts.display}-${gdoc.tokens.fonts.body}`;
          document.head.appendChild(l);
        }
        const svg = renderArtboard(gdoc, gdoc.artboards[0], { href: (id, src) => map.get(id) ?? (src.startsWith('upload:') ? '' : src), idPrefix: `pl-${s.id}-` }).replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, '<svg$1 width="100%" height="100%"');
        return setShown({ kind: 'svg', svg });
      }
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
      urls.forEach((u) => URL.revokeObjectURL(u));
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
      {shown?.kind === 'svg' && <div className="mu-plate-svg" dangerouslySetInnerHTML={{ __html: shown.svg }} />}
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

// ── the collection ───────────────────────────────────────────────────

/** the rhythm of the exhibition grid after the featured work: 5|7, 4|4|4, 7|5, 4|4|4 */
const SPANS = [5, 7, 4, 4, 4, 7, 5, 4, 4, 4];
const RATIO: Record<number, number> = { 12: 16 / 9, 7: 16 / 10, 5: 4 / 5, 4: 4 / 3 };

export function Collection(p: { signedIn: boolean; ready: boolean; list: ProjectSummary[]; elsewhere: RemoteWork[]; nonce: string; onOpen: (id: string) => void; onDelete: (s: ProjectSummary) => void; onBegin: () => void }) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [order, setOrder] = useState<Order>('recent');
  const [view, setView] = useState<View>('exhibits');

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
    const xs = p.list.filter((s) => (filter === 'all' || (filter === 'conversation' ? s.studio?.status === 'discovering' : s.mode === filter && s.studio?.status !== 'discovering')) && matches(s));
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
  const talking = p.list.filter((s) => s.studio?.status === 'discovering').length;

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
        Delete “{s.name}”{s.studio?.status === 'discovering' ? ' and its conversation' : ' and its cards'}? It goes from this browser{p.signedIn ? ' and from your account' : ''}, and cannot be brought back.
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
    <section className="mu-collection sd-collection" id="collection" aria-labelledby="mu-coll" tabIndex={-1}>
      <div className="mu-coll-head">
        <h2 className="mu-h2" id="mu-coll">
          Everything you have <em>made</em>.
        </h2>
        <p className="mu-coll-note">{p.signedIn ? 'Kept in this browser and with your account.' : 'Kept in this browser. Sign in to keep it across devices.'}</p>
      </div>

      {total > 0 && (
        <div className="mu-tools" role="toolbar" aria-label="Find and arrange your work">
          <label className="mu-search">
            <span className="mu-vh">Find a work</span>
            <Search size={15} />
            <input type="search" value={query} placeholder="Find by title or idea" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <span className="sb-seg is-tight" role="radiogroup" aria-label="Kind">
            {(
              [
                ['all', 'All'],
                ['create', 'Created'],
                ['critique', 'Critiqued'],
                ...(talking ? ([['conversation', 'In conversation']] as const) : []),
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
          <p className="mu-empty-t">Nothing here yet.</p>
          <p className="mu-empty-b">Your first work begins with the question above — a sentence is enough.</p>
          <button type="button" className="sb-link is-go" onClick={p.onBegin}>
            To the question <span className="sb-ar">↑</span>
          </button>
        </div>
      )}

      {total > 0 && count === 0 && (
        <div className="mu-empty">
          <p className="mu-empty-t">Nothing matches{q ? ` “${query.trim()}”` : ''}.</p>
          <button
            type="button"
            className="sb-link is-go"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
          >
            Show everything
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
  );
}
