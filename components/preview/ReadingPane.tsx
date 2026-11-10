'use client';

// components/preview/ReadingPane.tsx — "What Socria read": the reading, said to be the reading.
//
// The preview shows the file. This shows what Socria took from it to reason with —
// its headings, text, tables and figure captions, page by page, as the reader found
// them — under a line that says exactly that, so the two are never mistaken for
// each other.

import { useEffect, useRef, useState } from 'react';
import { docNow, loadDocs, onDoc } from '@/lib/docs/client';
import type { DocBlock, SourceDoc } from '@/lib/docs/types';
import { MathText } from '@/components/TeX';

export function ReadingPane({
  docId,
  text,
  reading,
  onOpenReading,
  given,
  focus,
  onPick,
}: {
  docId?: string;
  text?: string;
  reading?: string;
  onOpenReading?: () => void;
  /** the reading, when the preview already holds it */
  given?: SourceDoc | null;
  /** a passage to bring into view, marked */
  focus?: string | null;
  /** a passage pressed: chosen, to ask about or to see in the file */
  onPick?: (block: string) => void;
}) {
  const [doc, setDoc] = useState<SourceDoc | null>(() => given ?? (docId ? docNow(docId) : null));
  const [looked, setLooked] = useState(!docId || !!doc);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (given) setDoc(given);
  }, [given]);
  useEffect(() => {
    if (!focus || !doc) return;
    const el = holder.current?.querySelector<HTMLElement>(`[data-block="${CSS.escape(focus)}"]`);
    el?.scrollIntoView({ block: 'center' });
  }, [focus, doc]);
  useEffect(() => {
    if (!docId || given) return;
    let live = true;
    void loadDocs([docId]).then((d) => {
      if (!live) return;
      setDoc(d[0] ?? null);
      setLooked(true);
    });
    const off = onDoc((d) => d.id === docId && setDoc(d));
    return () => {
      live = false;
      off();
    };
  }, [docId]);

  return (
    <div className="fp-reading" ref={holder}>
      <p className="fp-reading-said">
        This is what Socria read from the file — the text, tables and captions it reasons with and cites. It is not how the file looks; that is the Preview.
      </p>
      {onOpenReading && doc && (
        <button type="button" className="l5-link is-go" onClick={onOpenReading}>
          Open it with its citation keys <span className="l5-ar">→</span>
        </button>
      )}
      {doc ? (
        <DocReading doc={doc} focus={focus ?? null} {...(onPick ? { onPick } : {})} />
      ) : reading ? (
        <p className="fp-reading-p">{reading}</p>
      ) : text ? (
        <pre className="fp-reading-pre">{text}</pre>
      ) : (
        <p className="fp-wait">{looked ? 'What Socria read from this file is not on this device.' : 'Looking for what Socria read…'}</p>
      )}
    </div>
  );
}

function DocReading({ doc, focus, onPick }: { doc: SourceDoc; focus: string | null; onPick?: (block: string) => void }) {
  const pages = [...new Set(doc.blocks.map((b) => b.page))].sort((a, b) => a - b);
  const unit = doc.format === 'pptx' || doc.format === 'odp' ? 'Slide' : doc.format === 'xlsx' || doc.format === 'ods' ? 'Sheet' : 'Page';
  return (
    <div className="fp-reading-doc">
      {pages.map((p) => {
        const blocks = doc.blocks.filter((b) => b.page === p && b.kind !== 'header' && b.kind !== 'footer');
        const pg = doc.pages.find((x) => x.n === p);
        return (
          <section key={p} className="fp-reading-page" aria-label={`${unit} ${p}`}>
            <h4 className="fp-reading-n">
              {unit} {p}
              {pg?.ocr === 'done' ? ' · read from its picture' : pg?.ocr === 'needed' ? ' · a picture not yet read' : ''}
            </h4>
            {blocks.length ? (
              blocks.map((b) => (
                <div
                  key={b.id}
                  data-block={b.id}
                  className={`fp-reading-b${focus === b.id ? ' is-on' : ''}${onPick ? ' is-pick' : ''}`}
                  {...(onPick ? { role: 'button', tabIndex: 0, onClick: () => onPick(b.id), onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(b.id)) } : {})}
                >
                  <Block b={b} doc={doc} />
                </div>
              ))
            ) : (
              <p className="fp-wait">Nothing on this {unit.toLowerCase()} could be read as text.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Block({ b, doc }: { b: DocBlock; doc: SourceDoc }) {
  if (b.kind === 'table' && b.table) {
    const t = doc.tables.find((x) => x.id === b.table);
    if (t) {
      return (
        <div className="fp-reading-table">
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
    return <p className="fp-reading-fig">[{f?.kind === 'chart' ? 'Chart' : 'Figure'}{f?.caption || f?.alt || b.text ? `: ${f?.caption || f?.alt || b.text}` : ''}]</p>;
  }
  if (b.kind === 'title') return <h4 className="fp-reading-title">{b.text}</h4>;
  if (b.kind === 'heading') return <h5 className="fp-reading-h">{b.text}</h5>;
  if (b.kind === 'equation') return <p className="fp-reading-eq"><MathText>{b.text}</MathText></p>;
  if (b.kind === 'code') return <pre className="fp-reading-pre">{b.text}</pre>;
  if (b.kind === 'caption' || b.kind === 'footnote' || b.kind === 'note') return <p className="fp-reading-small">{b.text}</p>;
  return <p className={b.kind === 'list' ? 'fp-reading-li' : 'fp-reading-p'}>{b.text}</p>;
}
