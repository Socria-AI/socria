'use client';

// components/preview/FilePreview.tsx — a file, opened as itself, beside the conversation.
//
// Three things kept apart (docs/FILE-PREVIEW.md): the ORIGINAL (kept on this device
// and with the account), the PREVIEW (the original drawn — real pages, slides, a
// grid, the picture), and the READING (what Socria took from it to reason with, in
// its own tab and labelled so). Opening a file never pours its text into the
// conversation.
//
// On a wide screen it is a panel on the right and the conversation stays where it
// was, usable; on a phone it fills the screen, with the way back to the conversation
// at the top. Escape closes it; ← → move through pages and slides; + − and 0 zoom.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloseGlyph } from '@/components/logos5/L5Chrome';
import { docNow, loadDocs, onDoc } from '@/lib/docs/client';
import { analysable } from '@/lib/docs/brief';
import type { BriefDiagram } from '@/lib/docs/brief-map';
import type { SourceDoc } from '@/lib/docs/types';
import { blockAt, markOf, pickable, unitOf, validBox, type Mark } from '@/lib/preview/locate';
import { AnalysisPane } from './AnalysisPane';
import { countLabel, kindLabel, previewKindOf, sizeLabel, storedTypeFor } from '@/lib/preview/kinds';
import { findOriginal, whyNot, type Found } from '@/lib/preview/originals';
import type { PreviewTarget } from './types';
import { PdfView } from './PdfView';
import { DocxView } from './DocxView';
import { SlidesView } from './SlidesView';
import { SheetView } from './SheetView';
import { ImageView } from './ImageView';
import { TextView } from './TextView';
import { ReadingPane } from './ReadingPane';
import './preview.css';

const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

type Tab = 'preview' | 'analysis' | 'reading';

export function FilePreview({
  target,
  account,
  headers,
  onClose,
  onOpenReading,
  onAsk,
  onAskText,
  onMap,
}: {
  target: PreviewTarget;
  account: boolean;
  headers: () => Record<string, string>;
  onClose: () => void;
  onOpenReading?: (docId: string) => void;
  onAsk?: (docId: string, blockId: string) => void;
  onAskText?: (text: string) => void;
  onMap?: (d: BriefDiagram) => void;
}) {
  const kind = previewKindOf(target.name, target.mime, target.format);
  const hasReading = !!(target.doc || target.reading || target.text);
  const [tab, setTab] = useState<Tab>(target.tab ?? 'preview');
  // THE READING (lib/docs): what Socria read from the file — for the analysis, for marking a passage in
  // the original, and for "What Socria read". Held here once, so every tab reads the same one.
  const [doc, setDoc] = useState<SourceDoc | null>(() => (target.doc ? docNow(target.doc) : null));
  const [mark, setMark] = useState<Mark | null>(null);
  const [marked, setMarked] = useState<boolean | null>(null);
  const seq = useRef(0);
  const [found, setFound] = useState<Found | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState(target.pages ?? 0);
  const [page, setPage] = useState(1);
  const [goto, setGoto] = useState({ n: 1, seq: 0 });
  const [error, setError] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closing = useRef(onClose);
  closing.current = onClose;

  // the original: this device, then the account
  useEffect(() => {
    let live = true;
    setFound(null);
    if (kind === 'none' && !target.file && !target.doc) {
      setFound({ blob: null, why: 'not-kept' });
      return;
    }
    void findOriginal({ file: target.file, doc: target.doc }, { account, headers }).then((f) => live && setFound(f));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.file, target.doc, account]);

  useEffect(() => {
    if (!target.doc) return;
    let live = true;
    void loadDocs([target.doc]).then((d) => live && d[0] && setDoc(d[0]));
    const off = onDoc((d) => d.id === target.doc && setDoc(d));
    return () => {
      live = false;
      off();
    };
  }, [target.doc]);

  /** a passage chosen — from a citation, the analysis, the reading or a press on the page — marked and shown */
  const markPassage = useCallback(
    (block: string, show: Tab | null = 'preview') => {
      if (!doc) return;
      seq.current += 1;
      const m = markOf(doc, block, seq.current);
      if (!m) return;
      setMark(m);
      setMarked(m.box ? true : null);
      if (show) setTab(show);
    },
    [doc]
  );
  // opened at a passage (a citation pressed), or moved to another while open
  useEffect(() => {
    if (doc && target.passage) markPassage(target.passage, target.tab ?? 'preview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, target.passage, target.n]);
  const canAnalyse = !!doc && analysable(doc);
  const canPick = !!doc && doc.blocks.some((b) => validBox(b.box));
  const hit = useCallback((page: number, fx: number, fy: number) => (doc && pickable(doc, page) ? blockAt(doc, page, fx, fy)?.box ?? null : null), [doc]);
  const pick = useCallback(
    (page: number, fx: number, fy: number) => {
      const b = doc ? blockAt(doc, page, fx, fy) : null;
      if (b) markPassage(b.id, null);
    },
    [doc, markPassage]
  );
  const ask = () => {
    if (!mark || !onAsk) return;
    onAsk(mark.doc, mark.block);
    // on a phone the conversation is under the preview: it comes back, the passage named in the composer
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches) onClose();
  };

  // the keyboard, and focus in and back out
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !panel.current?.contains(t)) return;
      if (e.key === 'Escape' && !document.fullscreenElement) {
        e.stopPropagation();
        closing.current();
        return;
      }
      // the rest only while the preview has the keyboard
      if (!panel.current?.contains(document.activeElement)) return;
      if ((e.key === '+' || e.key === '=') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setZoom((z) => ZOOMS.find((x) => x > z + 0.001) ?? z);
      } else if (e.key === '-' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setZoom((z) => [...ZOOMS].reverse().find((x) => x < z - 0.001) ?? z);
      } else if (e.key === '0' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      back?.focus?.({ preventScroll: true });
    };
  }, []);

  const go = useCallback((n: number) => {
    setGoto((g) => ({ n, seq: g.seq + 1 }));
    setPage(n);
  }, []);
  // ← → for PDF pages (slides take their own)
  useEffect(() => {
    if (kind !== 'pdf' && kind !== 'docx') return;
    const onKey = (e: KeyboardEvent) => {
      if (!panel.current?.contains(document.activeElement)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(Math.min(pages || 1, page + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(Math.max(1, page - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind, page, pages, go]);

  const onPage = useCallback((n: number) => setPage(n), []);
  const onPages = useCallback((n: number) => setPages(n), []);
  const onError = useCallback((m: string) => setError(m), []);

  const blob = found && found.blob ? found.blob : null;
  // a photo whose original is not at hand: the conversation's copy, said so
  const copySrc = !blob && kind === 'image' ? target.preview || target.thumb : undefined;

  const meta = useMemo(() => {
    const bits = [kindLabel(target.name, kind), sizeLabel(target.size ?? blob?.size), countLabel(kind, pages || target.pages), dims ? `${dims.w} × ${dims.h}` : '', target.at ? `attached ${new Date(target.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''];
    return bits.filter(Boolean).join(' · ');
  }, [target, kind, blob, pages, dims]);

  const where = found?.blob ? (found.from === 'account' ? 'Opened from your account' : 'Kept on this device') : '';

  const download = () => {
    if (!blob) return;
    const url = URL.createObjectURL(new Blob([blob], { type: storedTypeFor(target.name, blob.type) }));
    const a = document.createElement('a');
    a.href = url;
    a.download = target.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const paged = kind === 'pdf' || kind === 'slides' || kind === 'docx';
  const zoomable = tab === 'preview' && !!(blob || copySrc) && !error && kind !== 'none' && kind !== 'html';

  const onMarked = useCallback((found: boolean) => setMarked(found), []);
  const markFor = tab === 'preview' ? mark : null;

  let body: React.ReactNode;
  if (tab === 'analysis' && doc) body = <AnalysisPane doc={doc} headers={headers} onGo={(b) => markPassage(b)} {...(onAskText ? { onAskText: (t: string) => { onAskText(t); if (window.matchMedia('(max-width: 860px)').matches) onClose(); } } : {})} {...(onMap ? { onMap: (d: BriefDiagram) => { onMap(d); onClose(); } } : {})} />;
  else if (tab === 'reading')
    body = (
      <ReadingPane
        docId={target.doc}
        text={target.text}
        reading={target.reading}
        given={doc}
        focus={mark?.block ?? null}
        {...(doc ? { onPick: (b: string) => markPassage(b, null) } : {})}
        {...(onOpenReading && target.doc ? { onOpenReading: () => onOpenReading(target.doc!) } : {})}
      />
    );
  else if (error) body = <Fallback say={error} canRead={hasReading} onRead={() => setTab('reading')} onDownload={blob ? download : undefined} />;
  else if (!found) body = <p className="fp-wait">Opening {target.name}…</p>;
  else if (!blob && copySrc) body = <ImageView blob={null} src={copySrc} name={target.name} zoom={zoom} onZoom={setZoom} onSize={(w, h) => setDims({ w, h })} onError={onError} />;
  else if (!blob) body = <Fallback say={whyNot((found as Exclude<Found, { blob: Blob }>).why)} canRead={hasReading} onRead={() => setTab('reading')} />;
  else if (kind === 'pdf') body = <PdfView blob={blob} zoom={zoom} goto={goto} onPages={onPages} onPage={onPage} onError={onError} mark={markFor} {...(canPick ? { hit, onPick: pick } : {})} />;
  else if (kind === 'docx') body = <DocxView blob={blob} zoom={zoom} goto={goto} onPages={onPages} onPage={onPage} onError={onError} mark={markFor} onMarked={onMarked} />;
  else if (kind === 'slides') body = <SlidesView blob={blob} zoom={zoom} goto={goto} onPages={onPages} onPage={onPage} onError={onError} mark={markFor} {...(canPick ? { hit, onPick: pick } : {})} />;
  else if (kind === 'sheet' || kind === 'delimited') body = <SheetView blob={blob} name={target.name} delimited={kind === 'delimited'} zoom={zoom} onPages={onPages} onError={onError} mark={markFor} onMarked={onMarked} />;
  else if (kind === 'image') body = <ImageView blob={blob} name={target.name} zoom={zoom} onZoom={setZoom} onSize={(w, h) => setDims({ w, h })} onError={onError} />;
  else if (kind === 'markdown' || kind === 'html' || kind === 'text') body = <TextView blob={blob} kind={kind} name={target.name} zoom={zoom} onError={onError} mark={markFor} onMarked={onMarked} />;
  else body = <Fallback say={`There is no visual preview for ${kindLabel(target.name, kind).replace(/ files?$/i, '')} files yet. You can download the original, and Socria has read it.`} canRead={hasReading} onRead={() => setTab('reading')} onDownload={download} />;

  return (
    <div ref={panel} className="fp" role="dialog" aria-modal="false" aria-labelledby="fp-name" data-kind={kind}>
      <header className="fp-head">
        <button ref={closeBtn} type="button" className="fp-back" onClick={onClose}>
          <span aria-hidden="true">‹</span> Back to the conversation
        </button>
        <div className="fp-title">
          <h2 id="fp-name" className="fp-name" title={target.name}>
            {target.name}
          </h2>
          <p className="fp-meta">
            {meta}
            {where ? <span className="fp-where"> · {where}</span> : null}
            {copySrc ? <span className="fp-where"> · a smaller copy — the original is not on this device</span> : null}
          </p>
        </div>
        <div className="fp-acts">
          {blob && (
            <button type="button" className="l5-link is-meta" onClick={download}>
              Download original
            </button>
          )}
          <button type="button" className="l5-icon l5-close fp-x" aria-label="Close the preview" title="Close (Esc)" onClick={onClose}>
            <CloseGlyph />
          </button>
        </div>
      </header>

      <div className="fp-bar">
        {hasReading && (
          <div className="fp-switch" role="tablist" aria-label="What to show">
            <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>
              Preview
            </button>
            {canAnalyse && (
              <button type="button" role="tab" aria-selected={tab === 'analysis'} onClick={() => setTab('analysis')}>
                Analysis
              </button>
            )}
            <button type="button" role="tab" aria-selected={tab === 'reading'} onClick={() => setTab('reading')}>
              What Socria read
            </button>
          </div>
        )}
        {tab === 'preview' && paged && pages > 1 && !error && blob && (
          <div className="fp-pager" aria-label={kind === 'slides' ? 'Slides' : 'Pages'}>
            <button type="button" className="fp-tool" onClick={() => go(Math.max(1, page - 1))} disabled={page <= 1} aria-label={kind === 'slides' ? 'Previous slide' : 'Previous page'}>
              ‹
            </button>
            <span className="fp-pageno" aria-live="polite">
              {page} / {pages}
            </span>
            <button type="button" className="fp-tool" onClick={() => go(Math.min(pages, page + 1))} disabled={page >= pages} aria-label={kind === 'slides' ? 'Next slide' : 'Next page'}>
              ›
            </button>
          </div>
        )}
        {zoomable && (
          <div className="fp-zoom" aria-label="Zoom">
            <button type="button" className="fp-tool" onClick={() => setZoom((z) => [...ZOOMS].reverse().find((x) => x < z - 0.001) ?? z)} disabled={zoom <= ZOOMS[0]} aria-label="Zoom out">
              −
            </button>
            <button type="button" className="fp-tool fp-zoom-n" onClick={() => setZoom(1)} title="Fit to the panel" aria-label={`Zoom ${Math.round(zoom * 100)}%, press to fit`}>
              {zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}
            </button>
            <button type="button" className="fp-tool" onClick={() => setZoom((z) => ZOOMS.find((x) => x > z + 0.001) ?? z)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in">
              +
            </button>
          </div>
        )}
      </div>

      {mark && doc && tab !== 'analysis' && (
        <div className="fp-strip" role="region" aria-label="The passage chosen">
          <div>
            <span className="fp-strip-where">
              {unitOf(doc.format)} {mark.page}
              {mark.kind === 'table' ? ' · a table' : mark.kind === 'figure' ? ' · a figure' : mark.kind === 'equation' ? ' · an equation' : ''}
            </span>
            <p className="fp-strip-words">{mark.kind === 'table' ? mark.text.split('\n')[0] : mark.text}</p>
          </div>
          <div className="fp-strip-acts">
            {onAsk && (
              <button type="button" className="l5-link is-go" onClick={ask}>
                Ask about this <span className="l5-ar">→</span>
              </button>
            )}
            {tab === 'preview' ? (
              <button type="button" className="l5-link is-meta" onClick={() => setTab('reading')}>
                See it as read
              </button>
            ) : (
              blob && (
                <button type="button" className="l5-link is-meta" onClick={() => markPassage(mark.block)}>
                  Show it in the file
                </button>
              )
            )}
            <button type="button" className="l5-link is-meta" onClick={() => setMark(null)} aria-label="Let go of this passage">
              Done
            </button>
          </div>
          {tab === 'preview' && marked === false && <p className="fp-strip-note">Its words could not be found on the page drawn here — they are above, as Socria read them.</p>}
        </div>
      )}

      <div className="fp-body">{body}</div>
    </div>
  );
}

function Fallback({ say, canRead, onRead, onDownload }: { say: string; canRead: boolean; onRead: () => void; onDownload?: () => void }) {
  return (
    <div className="fp-fallback">
      <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <path d="M13 6h15l9 9v26a1 1 0 0 1-1 1H13a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
        <path d="M28 6v9h9" />
      </svg>
      <p>{say}</p>
      <div className="fp-fallback-acts">
        {canRead && (
          <button type="button" className="l5-link is-go" onClick={onRead}>
            See what Socria read <span className="l5-ar">→</span>
          </button>
        )}
        {onDownload && (
          <button type="button" className="l5-link" onClick={onDownload}>
            Download original
          </button>
        )}
      </div>
    </div>
  );
}
