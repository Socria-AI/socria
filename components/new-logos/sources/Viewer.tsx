'use client';
// components/new-logos/sources/Viewer.tsx — FOCUS: one source, over everything, opened where it was asked for.
//
// Two ways to see it: the ORIGINAL (the file as itself — a PDF's pages through the existing viewer,
// components/preview/PdfView, with the passage marked where the reading boxed it; an image as itself) and the
// READING (what was read from it, block by block, the passage highlighted and brought into view). The original comes
// from this device or the account's private file storage (lib/preview/originals.ts findOriginal). Escape, or the close
// button, puts the canvas back exactly as it was: the viewer is laid over it, never beside it.

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SourceDoc } from '@/lib/docs/types';
import { markOf } from '@/lib/preview/locate';
import { statusLabel } from '@/lib/new-logos/sources';
import { useSources } from './state';

const PdfView = dynamic(() => import('@/components/preview/PdfView').then((m) => m.PdfView), { ssr: false, loading: () => <p className="nl-hint nl-viewer-wait">Opening the pages…</p> });

type Tab = 'original' | 'reading';
const unitWord = (format: string) => (format === 'pptx' || format === 'odp' ? 'Slide' : format === 'xlsx' || format === 'ods' ? 'Sheet' : 'Page');

export function SourceViewer() {
  const { viewer, openViewer, sources, reading } = useSources();
  const source = viewer ? sources.find((s) => s.id === viewer.sourceId) : undefined;
  const [doc, setDoc] = useState<SourceDoc | null | undefined>(undefined);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('reading');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [seq, setSeq] = useState(1);
  const readingRef = useRef<HTMLDivElement>(null);
  const passage = viewer?.passage ?? null;
  const isPdf = !!source && (source.format === 'pdf' || source.mime === 'application/pdf');
  const isImage = !!source && source.kind === 'image';

  // the reading and the original, when a source is opened
  useEffect(() => {
    if (!viewer || !source) return;
    let live = true;
    setDoc(undefined);
    setBlob(null);
    setWhy(null);
    setTab(isPdf || isImage ? 'original' : 'reading');
    void reading(source.id).then((d) => live && setDoc(d));
    if (source.file_id && (isPdf || isImage)) {
      void import('@/lib/preview/originals').then(async ({ findOriginal }) => {
        const got = await findOriginal({ file: source.file_id ?? undefined, doc: source.doc_id ?? undefined }, { account: true, headers: () => ({}) });
        if (!live) return;
        if (got.blob) setBlob(got.blob);
        else setWhy(got.why === 'offline' ? 'The original could not be fetched just now. Check the connection and try again.' : 'The original of this file is not available here. What was read from it is under Reading.');
      });
    } else if (!source.file_id) setWhy('Only what was read from this file was kept. It is under Reading.');
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.sourceId]);

  // a passage asked for: its page in the original, and the passage itself in the reading
  const mark = useMemo(() => (doc && passage ? markOf(doc, passage, seq) : null), [doc, passage, seq]);
  useEffect(() => {
    if (!mark) return;
    setPage(mark.page);
    setSeq((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark?.block]);
  useEffect(() => {
    if (tab !== 'reading' || !passage) return;
    const el = readingRef.current?.querySelector<HTMLElement>(`[data-block="${CSS.escape(passage)}"]`);
    el?.scrollIntoView({ block: 'center' });
  }, [tab, passage, doc]);

  const imageUrl = useMemo(() => (blob && isImage ? URL.createObjectURL(blob) : null), [blob, isImage]);
  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    if (!viewer) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        openViewer(null);
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [viewer, openViewer]);

  if (!viewer || !source) return null;
  const unit = unitWord(source.format);
  let lastPage = 0;

  return (
    <div className="nl-viewer nl-cv-ui" role="dialog" aria-modal="true" aria-label={`${source.name}, in focus`} onPointerDown={(e) => e.target === e.currentTarget && openViewer(null)}>
      <div className="nl-viewer-box">
        <div className="nl-viewer-head">
          <div className="nl-viewer-title">
            <strong>{source.name}</strong>
            <span className="nl-hint">{statusLabel(source, doc)}</span>
          </div>
          <div className="nl-seg" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={tab === 'original'} aria-pressed={tab === 'original'} onClick={() => setTab('original')}>
              Original
            </button>
            <button type="button" role="tab" aria-selected={tab === 'reading'} aria-pressed={tab === 'reading'} onClick={() => setTab('reading')}>
              Reading
            </button>
          </div>
          {tab === 'original' && isPdf && pages ? (
            <div className="nl-row nl-viewer-pages">
              <button type="button" className="nl-icon-btn" aria-label={`Previous ${unit.toLowerCase()}`} disabled={page <= 1} onClick={() => (setPage(page - 1), setSeq((n) => n + 1))}>
                ‹
              </button>
              <span className="nl-hint">
                {unit} {page} of {pages}
              </span>
              <button type="button" className="nl-icon-btn" aria-label={`Next ${unit.toLowerCase()}`} disabled={page >= pages} onClick={() => (setPage(page + 1), setSeq((n) => n + 1))}>
                ›
              </button>
            </div>
          ) : null}
          <span className="nl-grow" />
          <button type="button" className="nl-icon-btn" aria-label="Close" onClick={() => openViewer(null)}>
            ×
          </button>
        </div>
        <div className="nl-viewer-body">
          {tab === 'original' ? (
            blob && isPdf ? (
              <PdfView blob={blob} zoom={1} goto={{ n: page, seq }} onPages={setPages} onPage={setPage} onError={(m) => setWhy(m || 'The pages could not be drawn.')} mark={mark} />
            ) : blob && imageUrl ? (
              <div className="nl-viewer-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt={source.name} />
              </div>
            ) : why ? (
              <p className="nl-hint nl-viewer-wait">{why}</p>
            ) : isPdf || isImage ? (
              <p className="nl-hint nl-viewer-wait">Finding the original…</p>
            ) : (
              <p className="nl-hint nl-viewer-wait">This kind of file is shown by what was read from it. See Reading.</p>
            )
          ) : (
            <div className="nl-viewer-reading" ref={readingRef}>
              {doc === undefined ? (
                <p className="nl-hint">Opening…</p>
              ) : !doc ? (
                <p className="nl-hint">Nothing was read from this file.</p>
              ) : (
                doc.blocks.map((b) => {
                  const sep = b.page !== lastPage && doc.pageCount > 1;
                  lastPage = b.page;
                  const on = b.id === passage;
                  const El = b.kind === 'title' || (b.kind === 'heading' && (b.level ?? 2) <= 1) ? 'h3' : b.kind === 'heading' ? 'h4' : b.kind === 'table' || b.kind === 'code' ? 'pre' : 'p';
                  return (
                    <div key={b.id}>
                      {sep ? (
                        <div className="nl-viewer-page" aria-hidden="true">
                          {unit} {b.page}
                        </div>
                      ) : null}
                      <El data-block={b.id} className={`nl-viewer-block is-${b.kind}${on ? ' is-on' : ''}`}>
                        {b.kind === 'list' ? '• ' : ''}
                        {b.text}
                      </El>
                    </div>
                  );
                })
              )}
              {doc?.unread ? (
                <p className="nl-hint">
                  {unit}s {doc.unread.from}–{doc.unread.to} were not read.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
