'use client';
// components/new-logos/sources/SourceBadge.tsx — the SOURCE INDICATOR: a small mark on a component that has sources
// (a page and a number, quiet until wanted). Pressing it shows, in a popover over the canvas, the documents behind the
// component: each passage it points at, in the source's own words, where it is (page), how the component stands on it
// (quoted, derived, an interpretation) and who made the tie (the person, or the assistant citing it) — so a finding that
// rests on a source is never confused with the assistant's reading of one. "Open at passage" opens the source in focus
// there. A reference can be removed (the source stays), and another source added.
//
// For an exchange the documents come from the conversation itself: those attached to its question and those its
// replies cite.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { excerptOf, matchMentions, type SourceRefRow } from '@/lib/new-logos/sources';
import { SourceGlyph } from './Library';
import { useSources } from './state';

const GROUND_WORDS: Record<string, string> = { verbatim: 'Quoted', derived: 'Worked out from it', interpretation: 'An interpretation', unsupported: 'Not supported by it' };
const pageOf = (passage: string | null) => (passage ? Number(/^p(\d+)\./.exec(passage)?.[1] ?? 0) : 0);

function Pop({ anchor, onClose, children, label }: { anchor: HTMLElement; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => setHost(document.querySelector('.nl-root') ?? document.body), []);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', esc);
    };
  }, [anchor, onClose]);
  if (!host) return null;
  const r = anchor.getBoundingClientRect();
  const w = Math.min(340, window.innerWidth - 16);
  const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
  const below = r.bottom + 6 + 320 < window.innerHeight;
  return createPortal(
    <div ref={ref} className="nl-srcpop nl-cv-ui" role="dialog" aria-label={label} style={{ left, width: w, ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }) }}>
      {children}
    </div>,
    host
  );
}

/** The indicator on a component (a node): its references, and adding one. Nothing is drawn while it has none. */
export function NodeSources({ nodeId, adding, onAddingDone }: { nodeId: string; adding?: boolean; onAddingDone?: () => void }) {
  const { refs, sources, reading, readingNow, removeRef, addRef, openViewer } = useSources();
  const mine = refs.filter((r) => r.node_id === nodeId);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const show = open || !!adding;
  useEffect(() => {
    if (!show) return;
    for (const id of new Set(mine.map((r) => r.source_id))) void reading(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, mine.length]);
  const close = () => {
    setOpen(false);
    setPick('');
    onAddingDone?.();
  };
  const distinct = new Set(mine.map((r) => r.source_id)).size;
  if (!distinct && !adding) return null;
  const candidates = matchMentions(
    sources.filter((s) => !mine.some((r) => r.source_id === s.id && !r.passage)).map((s) => ({ kind: 'source' as const, id: s.id, label: s.name, hint: '' })),
    pick,
    6
  );
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`nl-srcbadge${distinct ? '' : ' is-empty'}`}
        aria-label={distinct ? `${distinct} source${distinct === 1 ? '' : 's'}` : 'Sources'}
        aria-expanded={show}
        title={distinct ? `Backed by ${distinct} source${distinct === 1 ? '' : 's'}` : 'Add a source'}
        onClick={() => (show ? close() : setOpen(true))}
      >
        <SourceGlyph kind="document" size={11} />
        {distinct ? <span>{distinct}</span> : null}
      </button>
      {show && btn.current ? (
        <Pop anchor={btn.current} onClose={close} label="Sources of this">
          {mine.length ? (
            <ul className="nl-srcpop-list">
              {mine.map((r: SourceRefRow) => {
                const s = sources.find((x) => x.id === r.source_id);
                const doc = readingNow(r.source_id);
                const words = r.quote || (r.passage ? excerptOf(doc, r.passage, 240) : '');
                const page = pageOf(r.passage);
                return (
                  <li key={r.id}>
                    <div className="nl-srcpop-row">
                      <SourceGlyph kind={s?.kind ?? 'document'} />
                      <strong className="nl-srcpop-name">{s?.name ?? 'A removed source'}</strong>
                      <button type="button" className="nl-icon-btn is-quiet" aria-label="Remove this reference (the source stays)" title="Remove this reference (the source stays)" onClick={() => void removeRef(r.id)}>
                        ×
                      </button>
                    </div>
                    {words ? <blockquote className="nl-srcpop-quote">{words}</blockquote> : null}
                    <div className="nl-srcpop-meta">
                      {page ? <span>Page {page}</span> : null}
                      {r.ground ? <span>{GROUND_WORDS[r.ground]}</span> : null}
                      <span>{r.origin === 'ai' ? 'Cited by the assistant' : 'Added by you'}</span>
                      {s ? (
                        <button type="button" className="nl-linkish" onClick={() => (openViewer({ sourceId: s.id, passage: r.passage }), close())}>
                          {r.passage ? 'Open at passage' : 'Open'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="nl-hint">No sources yet.</p>
          )}
          <div className="nl-srcpop-add">
            <input className="nl-in is-small" placeholder="Add a source: type its name" aria-label="Add a source" value={pick} onChange={(e) => setPick(e.target.value)} autoFocus={!!adding} />
            {pick || adding ? (
              <ul className="nl-srcpop-pick">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => void addRef({ sourceId: c.id, nodeId }).then(() => setPick(''))}>
                      {c.label}
                    </button>
                  </li>
                ))}
                {!candidates.length ? <li className="nl-hint">{sources.length ? 'Nothing by that name.' : 'The library is empty: add files with Sources, bottom left.'}</li> : null}
              </ul>
            ) : null}
          </div>
        </Pop>
      ) : null}
    </>
  );
}

/** The indicator on an exchange: the documents its question attached and its replies cite. */
export function ExchangeSources({ docs }: { docs: { doc_id: string; name: string; passages: string[] }[] }) {
  const { sources, reading, readingNow, openViewer } = useSources();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const known = docs.map((d) => ({ ...d, source: sources.find((s) => s.doc_id === d.doc_id) }));
  useEffect(() => {
    if (!open) return;
    for (const k of known) if (k.source) void reading(k.source.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!docs.length) return null;
  return (
    <>
      <button ref={btn} type="button" className="nl-srcbadge" aria-label={`${docs.length} source${docs.length === 1 ? '' : 's'}`} aria-expanded={open} title={`Draws on ${docs.length} source${docs.length === 1 ? '' : 's'}`} onClick={() => setOpen(!open)}>
        <SourceGlyph kind="document" size={11} />
        <span>{docs.length}</span>
      </button>
      {open && btn.current ? (
        <Pop anchor={btn.current} onClose={() => setOpen(false)} label="Sources of this exchange">
          <ul className="nl-srcpop-list">
            {known.map((k) => {
              const doc = k.source ? readingNow(k.source.id) : undefined;
              return (
                <li key={k.doc_id}>
                  <div className="nl-srcpop-row">
                    <SourceGlyph kind="document" />
                    <strong className="nl-srcpop-name">{k.source?.name ?? k.name}</strong>
                  </div>
                  {k.passages.length ? (
                    k.passages.slice(0, 4).map((p) => (
                      <div key={p} className="nl-srcpop-cite">
                        <blockquote className="nl-srcpop-quote">{excerptOf(doc, p, 200) || `Passage on page ${pageOf(p)}`}</blockquote>
                        <div className="nl-srcpop-meta">
                          <span>Page {pageOf(p)}</span>
                          <span>Cited in the reply</span>
                          {k.source ? (
                            <button type="button" className="nl-linkish" onClick={() => (openViewer({ sourceId: k.source!.id, passage: p }), setOpen(false))}>
                              Open at passage
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="nl-srcpop-meta">
                      <span>Attached to the question</span>
                      {k.source ? (
                        <button type="button" className="nl-linkish" onClick={() => (openViewer({ sourceId: k.source!.id }), setOpen(false))}>
                          Open
                        </button>
                      ) : (
                        <span>Not in the library</span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Pop>
      ) : null}
    </>
  );
}
