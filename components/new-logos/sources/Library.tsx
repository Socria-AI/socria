'use client';
// components/new-logos/sources/Library.tsx — THE SOURCE LIBRARY: a small button in the bottom-left corner, and, when
// it is pressed, a popover above it. Nothing else: no page, no panel, no tab. It is laid over whatever is there and
// moves nothing (the canvas keeps its size, place and camera), takes no part in panning or zooming, and closes on a
// click elsewhere or Escape.
//
// In it: bring files in (choose or drop; each is kept and read — sources.ts says how), find a source by name and narrow
// by kind or by whether it is in use, see how well each was read, open one in focus, rename it, see what uses it
// (components, conversations, canvases), drag it onto a canvas (or "Place on canvas" where dragging is not available),
// and delete it for good — only after saying exactly what that does. Documents already brought into conversations are
// offered too, so nothing brought in before is out of view.

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { displayTitle } from '@/lib/new-logos/convo';
import { SOURCE_DRAG, statusLabel, usesOf, type SourceMeta } from '@/lib/new-logos/sources';
import { useNL } from '../state';
import { ConfirmDialog, nodeHref, nodeTitle } from '../ui';
import { CommitInput } from '../primitives/common';
import { useSources } from './state';

type Filter = 'all' | 'document' | 'image' | 'used' | 'unused';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'document', label: 'Documents' },
  { id: 'image', label: 'Images' },
  { id: 'used', label: 'In use' },
  { id: 'unused', label: 'Not in use' },
];

/** A file, as a small drawing: a page, a picture, or lines of text. */
export function SourceGlyph({ kind, size = 14 }: { kind: SourceMeta['kind']; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true } as const;
  if (kind === 'image')
    return (
      <svg {...p}>
        <rect x="2.5" y="3" width="11" height="10" />
        <path d="m3.5 12 3.5-4 2.5 2.5 1.5-1.5 2 3" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...p}>
      <path d="M4 1.8h5.5L12.5 5v9.2H4z" strokeLinejoin="round" />
      <path d="M9.3 1.8V5h3.2" strokeLinejoin="round" />
      {kind === 'text' ? <path d="M6 8h4.5M6 10.2h4.5M6 12.4h3" strokeLinecap="round" /> : <path d="M6 9h4.5M6 11.5h3" strokeLinecap="round" />}
    </svg>
  );
}

const sizeWords = (n: number) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : n ? `${n} B` : '');
const canvasHref = (key: string) => (key.startsWith('o:') ? `/new-logos/w/${encodeURIComponent(key.slice(2))}` : key.startsWith('c:') ? `/new-logos/c/${encodeURIComponent(key.slice(2))}` : '/new-logos');

export function SourceLibrary() {
  const { nodes, conversations, say } = useNL();
  const { setup, sources, refs, placements, pending, uploading, upload, adopt, rename, remove, openViewer, placer, libraryAsk } = useSources();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [since, setSince] = useState<number | null>(null);
  // asked to open by a command ("find the document I uploaded yesterday"): open, looking for that
  useEffect(() => {
    if (!libraryAsk) return;
    setOpen(true);
    setQuery(libraryAsk.query ?? '');
    setSince(libraryAsk.since ?? null);
  }, [libraryAsk]);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SourceMeta | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropping, setDropping] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (confirming) return;
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirming && !renaming) setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', esc);
    };
  }, [open, confirming, renaming]);

  const used = useMemo(() => {
    const out = new Map<string, ReturnType<typeof usesOf>>();
    for (const s of sources) out.set(s.id, usesOf(s, refs, nodes, conversations.values(), placements));
    return out;
  }, [sources, refs, nodes, conversations, placements]);
  const count = (s: SourceMeta) => {
    const u = used.get(s.id);
    return u ? u.nodes.length + u.canvases.length : 0;
  };

  const q = query.trim().toLowerCase();
  const shown = sources.filter((s) => {
    if (since !== null && (s.created_at ?? 0) < since) return false;
    if (q && !s.name.toLowerCase().includes(q) && !s.file_name.toLowerCase().includes(q)) return false;
    if (filter === 'document') return s.kind !== 'image';
    if (filter === 'image') return s.kind === 'image';
    if (filter === 'used') return count(s) > 0;
    if (filter === 'unused') return count(s) === 0;
    return true;
  });
  const shownPending = filter === 'image' || filter === 'used' ? [] : pending.filter((d) => !q || d.name.toLowerCase().includes(q));

  const take = (files: FileList | File[] | null) => {
    const list = files ? [...files] : [];
    if (list.length) void upload(list);
  };

  return (
    <div className={`nl-lib nl-cv-ui${open ? ' is-open' : ''}`} ref={boxRef}>
      {open ? (
        <div
          className={`nl-lib-pop${dragging ? ' is-dragging' : ''}${dropping ? ' is-drop' : ''}`}
          role="dialog"
          aria-label="Sources"
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setDropping(false);
            take(e.dataTransfer.files);
          }}
        >
          <div className="nl-lib-head">
            <input className="nl-in" type="search" placeholder="Find a source" aria-label="Find a source" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button type="button" className="nl-btn is-small" onClick={() => fileRef.current?.click()} disabled={setup === false}>
              Upload
            </button>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => (take(e.target.files), (e.target.value = ''))} />
          </div>
          <div className="nl-lib-filters" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          {setup === false ? <p className="nl-hint nl-lib-note">Sources are not set up on this database yet.</p> : null}
          {uploading.length ? (
            <ul className="nl-lib-list" aria-label="Being added">
              {uploading.map((u) => (
                <li key={u.name} className="nl-lib-item is-busy">
                  <span className="nl-lib-name">{u.name}</span>
                  <span className="nl-hint">Keeping and reading…</span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="nl-lib-list nl-cv-scroll" aria-label="Sources">
            {shown.map((s) => {
              const u = used.get(s.id);
              const n = count(s);
              const isOpen = expanded === s.id;
              return (
                <li
                  key={s.id}
                  className={`nl-lib-item${isOpen ? ' is-open' : ''}`}
                  draggable={renaming !== s.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(SOURCE_DRAG, s.id);
                    e.dataTransfer.setData('text/plain', s.name);
                    e.dataTransfer.effectAllowed = 'copy';
                    // the popover steps aside so the canvas under it can take the drop
                    window.setTimeout(() => setDragging(true), 0);
                  }}
                  onDragEnd={() => setDragging(false)}
                  title="Drag onto the canvas to place it there"
                >
                  <div className="nl-lib-row">
                    <SourceGlyph kind={s.kind} />
                    {renaming === s.id ? (
                      <CommitInput
                        autoFocus
                        className="nl-in is-small"
                        aria-label="Name"
                        value={s.name}
                        onFocus={(e) => e.currentTarget.select()}
                        onCommit={(v) => void rename(s.id, v)}
                        onBlur={() => setRenaming(null)}
                      />
                    ) : (
                      <button type="button" className="nl-lib-name" onClick={() => setExpanded(isOpen ? null : s.id)} aria-expanded={isOpen}>
                        {s.name}
                      </button>
                    )}
                    <span className={`nl-lib-uses${n ? '' : ' is-none'}`} title={n ? `Used in ${n} place${n === 1 ? '' : 's'}` : 'Not used yet'}>
                      {n || ''}
                    </span>
                  </div>
                  <div className="nl-lib-meta">
                    <span className={`nl-lib-status is-${s.status}`}>{statusLabel(s)}</span>
                    {s.size ? <span>{sizeWords(s.size)}</span> : null}
                  </div>
                  {isOpen ? (
                    <div className="nl-lib-detail">
                      <div className="nl-row">
                        <button type="button" className="nl-btn is-small" onClick={() => (openViewer({ sourceId: s.id }), setOpen(false))}>
                          Focus
                        </button>
                        {placer ? (
                          <button type="button" className="nl-btn is-small" onClick={() => (placer(s.id), setOpen(false))}>
                            Place on canvas
                          </button>
                        ) : null}
                        <button type="button" className="nl-btn is-quiet is-small" onClick={() => setRenaming(s.id)}>
                          Rename
                        </button>
                        <button type="button" className="nl-btn is-quiet is-small is-danger" onClick={() => setConfirming(s)}>
                          Delete…
                        </button>
                      </div>
                      <div className="nl-lib-uselist">
                        {u && (u.nodes.length || u.conversations.length || u.canvases.length) ? (
                          <>
                            {u.nodes.map((nd) => (
                              <Link key={nd.id} href={nodeHref(nd)} onClick={() => setOpen(false)}>
                                Referenced by {nodeTitle(nd, conversations)}
                              </Link>
                            ))}
                            {u.conversations.map((c) => (
                              <Link key={c} href={`/new-logos/c/${encodeURIComponent(c)}`} onClick={() => setOpen(false)}>
                                In the conversation {displayTitle(conversations.get(c)?.title)}
                              </Link>
                            ))}
                            {u.canvases.map((k) => (
                              <Link key={k} href={canvasHref(k)} onClick={() => setOpen(false)}>
                                On the canvas of {k.startsWith('o:') ? nodes.find((x) => x.id === k.slice(2))?.title ?? 'an objective' : displayTitle(conversations.get(k.slice(2))?.title)}
                              </Link>
                            ))}
                          </>
                        ) : (
                          <span className="nl-hint">Not used by anything yet.</span>
                        )}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {shownPending.length ? (
            <div className="nl-lib-pending">
              <div className="nl-label">In your conversations</div>
              <ul className="nl-lib-list">
                {shownPending.slice(0, 20).map((d) => (
                  <li key={d.doc_id} className="nl-lib-item is-pending">
                    <div className="nl-lib-row">
                      <SourceGlyph kind="document" />
                      <span className="nl-lib-name is-plain">{d.name}</span>
                      <button type="button" className="nl-btn is-quiet is-small" onClick={() => void adopt(d)} disabled={setup === false}>
                        Add to library
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!sources.length && !shownPending.length && !uploading.length && setup !== false ? (
            <p className="nl-hint nl-lib-note">No sources yet. Upload files or drop them here. They stay here, out of the way, until you place one on a canvas or mention it with @.</p>
          ) : null}
        </div>
      ) : null}
      <button type="button" className="nl-lib-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} title="Sources">
        <SourceGlyph kind="document" size={15} />
        <span>Sources</span>
        {sources.length ? <span className="nl-lib-count">{sources.length}</span> : null}
      </button>
      {confirming ? (
        <ConfirmDialog
          title="Delete this source?"
          body={`“${confirming.name}” will be deleted from the library, with the ${refs.filter((r) => r.source_id === confirming.id).length} reference${refs.filter((r) => r.source_id === confirming.id).length === 1 ? '' : 's'} to it. Its original file is removed from your storage too, unless a conversation still shows it. What components say in their own words stays. This cannot be undone. To take it off one component or canvas only, remove that reference instead.`}
          action="Delete source"
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            const s = confirming;
            setConfirming(null);
            void remove(s.id).then((r) => say(r.ok ? (r.originalReleased ? `“${s.name}” deleted, with its original.` : `“${s.name}” deleted. Its original stays wherever a conversation still shows it.`) : r.error ?? 'Not deleted.'));
          }}
        />
      ) : null}
    </div>
  );
}
