'use client';

// "Add context" on a node opens this. The person is looking at one piece of
// their own reasoning — "Should we launch Socria One in September?" — and
// chooses the material that grounds it: their planning doc from Drive, the
// launch page in Notion, the actual calendar, an email thread, a page from
// the web, a paste, a file.
//
// Two rules shape everything here:
//   1. Chosen, never dumped. Every item is searched for and clicked by the
//      person, for this node. There is no "sync everything" anywhere.
//   2. Context, not authority. Each attached item carries whose thinking it
//      is (my thinking / source material / context), correctable in place,
//      and every prompt that reads it is told the material informs the
//      thinking without getting to settle it.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogosNodeType } from '@/lib/logos';
import {
  DEFAULT_ORIGIN,
  MAX_CONTEXTS_PER_NODE,
  SOURCE_META,
  type NodeContext,
  type SourceKind,
} from '@/lib/logos-sources';
import {
  ORIGINS,
  ORIGIN_LABEL,
  guessOrigin,
  type AttachmentOrigin,
} from '@/lib/logos-attachments';
import { isImageFile, isTextFile, prepareImage, readTextFile } from '@/lib/logos-upload';
import { NodeGlyph } from './NodeGlyph';

interface SourceInfo {
  kind: SourceKind;
  label: string;
  blurb: string;
  searches: boolean;
  connected: boolean;
  hint?: string;
}

interface Item {
  id: string;
  title: string;
  detail?: string;
}

let seq = 0;
const ctxId = () => `ctx_${++seq}_${Date.now().toString(36)}`;

function defaultOrigin(kind: SourceKind, text: string): AttachmentOrigin {
  const d = DEFAULT_ORIGIN[kind];
  return d === 'guess' ? guessOrigin(text) : d;
}

export function ContextPanel({
  open,
  node,
  attached,
  authHeaders,
  readImage,
  onAttach,
  onRemove,
  onOrigin,
  onClose,
}: {
  open: boolean;
  node: { id: string; label: string; type: LogosNodeType } | null;
  attached: NodeContext[];
  authHeaders: () => Record<string, string>;
  /** the existing vision pass, for image uploads */
  readImage: (dataUrl: string) => Promise<string>;
  onAttach: (nodeId: string, ctx: NodeContext) => void;
  onRemove: (nodeId: string, ctxId: string) => void;
  onOrigin: (nodeId: string, ctxId: string, origin: AttachmentOrigin) => void;
  onClose: () => void;
}) {
  const [sources, setSources] = useState<SourceInfo[] | null>(null);
  const [active, setActive] = useState<SourceKind | null>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0);

  const full = attached.length >= MAX_CONTEXTS_PER_NODE;

  // The source list reads env state server-side; fetch it once per open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/logos/sources', { headers: authHeaders() });
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled) setSources(json?.sources ?? []);
      } catch {
        // The listing route reads env state; if it fails we still know Web,
        // Paste and Upload always work, so the panel never dead-ends.
        if (!cancelled)
          setSources([
            { kind: 'web', label: SOURCE_META.web.label, blurb: SOURCE_META.web.blurb, searches: false, connected: true },
            { kind: 'paste', label: SOURCE_META.paste.label, blurb: SOURCE_META.paste.blurb, searches: false, connected: true },
            { kind: 'upload', label: SOURCE_META.upload.label, blurb: SOURCE_META.upload.blurb, searches: false, connected: true },
          ]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fresh node, fresh panel.
  useEffect(() => {
    setActive(null);
    setQuery('');
    setItems(null);
    setUrl('');
    setPasteText('');
    setError(null);
  }, [node?.id, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const info = (k: SourceKind) => sources?.find((s) => s.kind === k);

  const runSearch = useCallback(
    async (kind: SourceKind, q: string) => {
      const mySeq = ++searchSeq.current;
      setSearching(true);
      setError(null);
      try {
        const res = await fetch('/api/logos/sources/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ kind, query: q }),
        });
        const json = await res.json().catch(() => ({}));
        if (mySeq !== searchSeq.current) return;
        if (!res.ok) throw new Error(json?.error || 'That source did not answer.');
        setItems(json?.items ?? []);
      } catch (e: any) {
        if (mySeq !== searchSeq.current) return;
        setItems([]);
        setError(e?.message || 'That source did not answer.');
      } finally {
        if (mySeq === searchSeq.current) setSearching(false);
      }
    },
    [authHeaders]
  );

  function pick(kind: SourceKind) {
    setActive(kind);
    setQuery('');
    setItems(null);
    setError(null);
    const s = info(kind);
    // Searchable + connected → show what's recent before they even type.
    if (s?.connected && s.searches) void runSearch(kind, '');
  }

  function attach(ctx: Omit<NodeContext, 'id' | 'addedAt'>) {
    if (!node) return;
    onAttach(node.id, { ...ctx, id: ctxId(), addedAt: Date.now() });
  }

  async function attachItem(kind: SourceKind, item: Item) {
    if (full) return;
    setAttaching(item.id);
    setError(null);
    try {
      const res = await fetch('/api/logos/sources/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ kind, id: item.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'That item could not be read.');
      const c = json?.context;
      if (!c?.text) throw new Error('Nothing readable came back.');
      attach({
        source: kind,
        title: c.title || item.title,
        ref: c.ref,
        text: c.text,
        origin: defaultOrigin(kind, c.text),
      });
    } catch (e: any) {
      setError(e?.message || 'That item could not be read.');
    } finally {
      setAttaching(null);
    }
  }

  async function attachWeb() {
    if (!url.trim() || full) return;
    setAttaching('web');
    setError(null);
    try {
      const res = await fetch('/api/logos/sources/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ kind: 'web', url: url.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'That page could not be read.');
      attach({
        source: 'web',
        title: json.context.title,
        ref: json.context.ref,
        text: json.context.text,
        origin: 'source',
      });
      setUrl('');
    } catch (e: any) {
      setError(e?.message || 'That page could not be read.');
    } finally {
      setAttaching(null);
    }
  }

  function attachPaste() {
    const text = pasteText.trim();
    if (!text || full) return;
    attach({
      source: 'paste',
      title: text.replace(/\s+/g, ' ').slice(0, 60) + (text.length > 60 ? '…' : ''),
      text: text.slice(0, 16_000),
      origin: guessOrigin(text),
    });
    setPasteText('');
  }

  async function attachFiles(files: FileList) {
    // `full`/`attached` were captured at render; count our own additions so
    // the cap is honoured mid-loop rather than silently dropping files.
    let room = MAX_CONTEXTS_PER_NODE - attached.length;
    let dropped = 0;
    for (const f of Array.from(files).slice(0, 3)) {
      if (room <= 0) {
        dropped++;
        continue;
      }
      setError(null);
      try {
        if (isImageFile(f)) {
          setAttaching(f.name);
          const prepared = await prepareImage(f);
          const reading = await readImage(prepared.full);
          attach({ source: 'upload', title: prepared.name, text: reading, origin: 'context' });
          room--;
        } else if (isTextFile(f)) {
          const { text, name } = await readTextFile(f);
          if (text.trim()) {
            attach({
              source: 'upload',
              title: name,
              text: text.slice(0, 16_000),
              origin: guessOrigin(text),
            });
            room--;
          }
        } else {
          setError('Images and plain text files only.');
        }
      } catch (e: any) {
        setError(e?.message || 'That file could not be added.');
      } finally {
        setAttaching(null);
      }
    }
    if (dropped > 0) {
      setError(
        `Only ${MAX_CONTEXTS_PER_NODE} pieces fit on one node — ${dropped} file${dropped === 1 ? '' : 's'} left off.`
      );
    }
  }

  if (!open || !node) return null;
  const activeInfo = active ? info(active) : null;

  return (
    <div className="lg-explore lg-ctxp" role="dialog" aria-label="Add context to this idea">
      <header className="lg-x-head">
        <div className="lg-x-title">
          <span className={`lg-x-chip lg-node-${node.type}`}>
            <NodeGlyph type={node.type} />
            {node.type}
          </span>
          <span className="lg-x-label">{node.label}</span>
        </div>
        <button type="button" onClick={onClose} className="lg-x-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div className="lg-x-body">
        <p className="lg-ctxp-lead">
          Ground this piece of thinking in your real material. It informs — it
          doesn&rsquo;t decide.
        </p>

        {/* what's already attached */}
        {attached.length > 0 && (
          <div className="lg-ctxp-attached">
            <span className="lg-x-block-label">Grounding this node</span>
            {attached.map((c) => (
              <div key={c.id} className="lg-ctxp-item">
                <span className="lg-ctxp-kind">{SOURCE_META[c.source].label}</span>
                <span className="lg-ctxp-meta">
                  <span className="lg-ctxp-name">
                    {c.ref ? (
                      <a href={c.ref} target="_blank" rel="noopener noreferrer">
                        {c.title}
                      </a>
                    ) : (
                      c.title
                    )}
                  </span>
                  <span className="lg-ctxp-origin" role="radiogroup" aria-label="Whose thinking is this?">
                    {ORIGINS.map((o) => (
                      <button
                        key={o}
                        type="button"
                        role="radio"
                        aria-checked={c.origin === o}
                        className={c.origin === o ? 'is-on' : undefined}
                        onClick={() => onOrigin(node.id, c.id, o)}
                      >
                        {ORIGIN_LABEL[o]}
                      </button>
                    ))}
                  </span>
                </span>
                <button
                  type="button"
                  className="lg-att-x"
                  aria-label={`Remove ${c.title}`}
                  onClick={() => onRemove(node.id, c.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {full && (
          <p className="lg-ctxp-note">
            That&rsquo;s {MAX_CONTEXTS_PER_NODE} pieces on one node — remove one to add another.
            A node drowning in material stops being a thought.
          </p>
        )}

        {/* the sources */}
        {!full && (
          <div className="lg-ctxp-sources" role="tablist" aria-label="Where from?">
            {(sources ?? []).map((s) => (
              <button
                key={s.kind}
                type="button"
                role="tab"
                aria-selected={active === s.kind}
                className={`lg-ctxp-src${active === s.kind ? ' is-on' : ''}${s.connected ? '' : ' is-off'}`}
                title={s.connected ? s.blurb : (s.hint ?? 'Not connected')}
                onClick={() => pick(s.kind)}
              >
                {s.label}
                {!s.connected && <i aria-hidden="true" />}
              </button>
            ))}
            {sources === null && <span className="lg-ctxp-note">Checking your sources…</span>}
          </div>
        )}

        {/* per-source flow */}
        {!full && activeInfo && !activeInfo.connected && (
          <p className="lg-ctxp-hint">
            {activeInfo.label} isn&rsquo;t connected yet. {activeInfo.hint}
          </p>
        )}

        {!full && activeInfo?.connected && activeInfo.searches && (
          <div className="lg-ctxp-search">
            <input
              type="text"
              value={query}
              placeholder={`Search ${activeInfo.label}…`}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void runSearch(activeInfo.kind, query);
                }
              }}
              aria-label={`Search ${activeInfo.label}`}
            />
            <button type="button" onClick={() => void runSearch(activeInfo.kind, query)}>
              Search
            </button>
          </div>
        )}

        {!full && active === 'web' && (
          <div className="lg-ctxp-search">
            <input
              type="url"
              value={url}
              placeholder="Paste the page’s URL…"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void attachWeb();
                }
              }}
              aria-label="Page URL"
            />
            <button type="button" disabled={attaching === 'web'} onClick={() => void attachWeb()}>
              {attaching === 'web' ? 'Reading…' : 'Read it'}
            </button>
          </div>
        )}

        {!full && active === 'paste' && (
          <div className="lg-ctxp-paste">
            <textarea
              rows={5}
              value={pasteText}
              placeholder="Paste the material here…"
              onChange={(e) => setPasteText(e.target.value)}
            />
            <button type="button" disabled={!pasteText.trim()} onClick={attachPaste}>
              Attach
            </button>
          </div>
        )}

        {!full && active === 'upload' && (
          <div className="lg-ctxp-upload">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown,.txt,.md,.csv,.log,.json"
              className="lg-file"
              onChange={(e) => {
                if (e.target.files?.length) void attachFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button type="button" onClick={() => fileRef.current?.click()}>
              {attaching ? `Reading ${attaching}…` : 'Choose a file or an image'}
            </button>
          </div>
        )}

        {/* search results */}
        {!full && activeInfo?.connected && activeInfo.searches && (
          <div className="lg-ctxp-results">
            {searching && (
              <span className="lg-thinking" aria-label="Searching">
                <span /> <span /> <span />
              </span>
            )}
            {!searching &&
              items?.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="lg-ctxp-result"
                  disabled={!!attaching}
                  onClick={() => void attachItem(activeInfo.kind, it)}
                >
                  <span className="lg-ctxp-rtitle">
                    {attaching === it.id ? 'Reading…' : it.title}
                  </span>
                  {it.detail && <span className="lg-ctxp-rdetail">{it.detail}</span>}
                </button>
              ))}
            {!searching && items && items.length === 0 && !error && (
              <p className="lg-ctxp-note">Nothing found — try different words.</p>
            )}
          </div>
        )}

        {error && <p className="lg-x-error">{error}</p>}

        <p className="lg-x-fine">
          Context, not authority — your material informs the thinking; it doesn&rsquo;t
          get to settle it.
        </p>
      </div>
    </div>
  );
}
