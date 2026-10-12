'use client';

// components/DocPreview.tsx — a document, looked at where it was attached.
//
// Under a document's chip in the conversation: a PDF shows its own pages,
// drawn in the browser from the original this device kept (lib/docs/client.ts
// openOriginalPdf) — nothing is sent anywhere to show them. Anything else (a
// Word file, slides, a spreadsheet), or a PDF whose original is not kept on
// this device, shows its reading page by page, and says that is what it is.

import { useEffect, useState, type ReactNode } from 'react';
import { docNow, openOriginalPdf } from '@/lib/docs/client';
import type { DocBlock, SourceDoc } from '@/lib/docs/types';
import { useDocs } from '@/components/display/docs-context';

type Pdf = Awaited<ReturnType<typeof openOriginalPdf>>;

const WORD: Record<string, [string, string]> = { pptx: ['Slide', 'slides'], odp: ['Slide', 'slides'], xlsx: ['Sheet', 'sheets'], ods: ['Sheet', 'sheets'] };

export function DocPreview({ docId, name, format, pages, onOpen }: { docId: string; name: string; format?: string; pages?: number; onOpen?: () => void }) {
  const docs = useDocs();
  const doc = docs?.docs.get(docId) ?? docNow(docId);
  const isPdf = format === 'pdf';
  // undefined: still opening; null: no original here
  const [pdf, setPdf] = useState<Pdf | undefined>(isPdf ? undefined : null);
  const [n, setN] = useState(1);
  const [img, setImg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isPdf) return;
    let live = true;
    let opened: Pdf = null;
    openOriginalPdf(docId)
      .then((p) => {
        opened = p;
        if (live) setPdf(p);
        else p?.close();
      })
      .catch(() => live && setPdf(null));
    return () => {
      live = false;
      opened?.close();
    };
  }, [docId, isPdf]);

  useEffect(() => {
    if (!pdf) return;
    let live = true;
    setImg(null);
    setFailed(false);
    pdf
      .draw(n)
      .then((url) => live && setImg(url))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [pdf, n]);

  const total = pdf ? pdf.pages : (doc?.pageCount ?? pages ?? 1);
  const unit = WORD[format ?? ''] ?? ['Page', 'pages'];
  const go = (k: number) => setN((x) => Math.min(total, Math.max(1, x + k)));

  let body: ReactNode;
  let said: string | null = null;
  if (isPdf && pdf === undefined) body = <p className="lg-pv-wait">Opening the PDF…</p>;
  else if (pdf) body = img ? <img className="lg-pv-img" src={img} alt={`${name}, page ${n}`} /> : <p className="lg-pv-wait">{failed ? 'This page could not be drawn.' : `Drawing page ${n}…`}</p>;
  else {
    said = isPdf ? 'The original file is not kept on this device, so this is its reading — the text as Socria read it.' : 'Shown as Socria read it: its headings, text and tables, not its original layout.';
    body = doc ? <Reading doc={doc} page={n} unit={unit[0]} /> : <p className="lg-pv-wait">The reading of this document is not on this device.</p>;
  }

  return (
    <div className="lg-pv" role="group" aria-label={`Preview of ${name}`}>
      {said && <p className="lg-pv-said">{said}</p>}
      <div className="lg-pv-page">{body}</div>
      <div className="lg-pv-bar">
        {total > 1 && (
          <span className="lg-pv-nav">
            <button type="button" onClick={() => go(-1)} disabled={n <= 1} aria-label={`Previous ${unit[0].toLowerCase()}`}>
              ‹
            </button>
            <span>
              {unit[0]} {n} of {total}
            </span>
            <button type="button" onClick={() => go(1)} disabled={n >= total} aria-label={`Next ${unit[0].toLowerCase()}`}>
              ›
            </button>
          </span>
        )}
        {onOpen && (
          <button type="button" className="lg-pv-open" onClick={onOpen}>
            Open beside the map
          </button>
        )}
      </div>
    </div>
  );
}

/** One page of a document's reading, laid out plainly. */
function Reading({ doc, page, unit }: { doc: SourceDoc; page: number; unit: string }) {
  const blocks = doc.blocks.filter((b) => b.page === page && b.kind !== 'header' && b.kind !== 'footer');
  const pg = doc.pages.find((p) => p.n === page);
  if (!blocks.length) {
    return <p className="lg-pv-wait">{pg?.ocr === 'needed' ? `${unit} ${page} is a picture that has not been read yet.` : `Nothing on ${unit.toLowerCase()} ${page} could be read as text.`}</p>;
  }
  return <div className="lg-pv-text">{blocks.map((b) => <Block key={b.id} b={b} doc={doc} />)}</div>;
}

function Block({ b, doc }: { b: DocBlock; doc: SourceDoc }) {
  if (b.kind === 'table' && b.table) {
    const t = doc.tables.find((x) => x.id === b.table);
    if (t) {
      return (
        <div className="lg-pv-table">
          <table>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => (i < t.head ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
  if (b.kind === 'figure') {
    const f = b.figure ? doc.figures.find((x) => x.id === b.figure) : undefined;
    return <p className="lg-pv-fig">[{f?.kind === 'chart' ? 'Chart' : 'Figure'}{f?.caption || f?.alt || b.text ? `: ${f?.caption || f?.alt || b.text}` : ''}]</p>;
  }
  if (b.kind === 'title') return <h4 className="lg-pv-title">{b.text}</h4>;
  if (b.kind === 'heading') return <h5 className="lg-pv-h">{b.text}</h5>;
  if (b.kind === 'equation') return <p className="lg-pv-eq">{b.text}</p>;
  if (b.kind === 'code') return <pre className="lg-pv-code">{b.text}</pre>;
  if (b.kind === 'caption' || b.kind === 'footnote' || b.kind === 'note') return <p className="lg-pv-small">{b.text}</p>;
  return <p className={b.kind === 'list' ? 'lg-pv-li' : undefined}>{b.text}</p>;
}
