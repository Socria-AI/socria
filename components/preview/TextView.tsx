'use client';

// components/preview/TextView.tsx — a text file as itself: code with its lines,
// Markdown as it renders (its source a press away), a web page drawn in a sealed
// frame, a notebook as its cells. The file is text, so its text IS the preview.

import { useEffect, useMemo, useState } from 'react';
import { RichText } from '@/components/RichText';
import type { PreviewKind } from '@/lib/preview/kinds';

/** The most text drawn; a longer file says how much more there is. */
const MAX_CHARS = 1_500_000;

export function TextView({ blob, kind, name, zoom, onError }: { blob: Blob; kind: PreviewKind; name: string; zoom: number; onError: (msg: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [cut, setCut] = useState(0);
  const [source, setSource] = useState(false);
  const [wrap, setWrap] = useState(true);
  useEffect(() => {
    let live = true;
    blob
      .text()
      .then((t) => {
        if (!live) return;
        setCut(Math.max(0, t.length - MAX_CHARS));
        setText(t.slice(0, MAX_CHARS));
      })
      .catch(() => live && onError('This file could not be read as text.'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  const notebook = useMemo(() => (text !== null && /\.ipynb$/i.test(name) ? readNotebook(text) : null), [text, name]);
  if (text === null) return <p className="fp-wait">Opening the file…</p>;
  const rendered = kind === 'markdown' || kind === 'html' || !!notebook;
  return (
    <div className="fp-text" style={{ fontSize: `${Math.round(14 * zoom * 10) / 10}px` }}>
      <div className="fp-text-bar">
        {rendered && (
          <button type="button" className="l5-link is-meta" aria-pressed={source} onClick={() => setSource((s) => !s)}>
            {source ? 'Show it rendered' : 'Show the source'}
          </button>
        )}
        {(!rendered || source) && (
          <button type="button" className="l5-link is-meta" aria-pressed={wrap} onClick={() => setWrap((w) => !w)}>
            {wrap ? 'Don’t wrap lines' : 'Wrap lines'}
          </button>
        )}
      </div>
      {!source && kind === 'markdown' ? (
        <article className="fp-md l5-prose">
          <RichText text={text} rich math />
        </article>
      ) : !source && kind === 'html' ? (
        <SealedPage html={text} title={name} />
      ) : !source && notebook ? (
        <div className="fp-nb">
          {notebook.map((c, i) =>
            c.kind === 'markdown' ? (
              <article key={i} className="fp-md l5-prose">
                <RichText text={c.text} rich math />
              </article>
            ) : (
              <div key={i} className="fp-nb-cell">
                <pre className="fp-code is-wrap">{c.text}</pre>
                {c.out.map((o, j) =>
                  o.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={j} className="fp-nb-img" src={o.image} alt={`Output of cell ${i + 1}`} />
                  ) : (
                    <pre key={j} className="fp-nb-out">
                      {o.text}
                    </pre>
                  )
                )}
              </div>
            )
          )}
        </div>
      ) : (
        <Lines text={text} wrap={wrap} />
      )}
      {cut > 0 && <p className="fp-note">The last {cut.toLocaleString()} characters are not shown here. Download the file to see all of it.</p>}
    </div>
  );
}

function Lines({ text, wrap }: { text: string; wrap: boolean }) {
  const lines = useMemo(() => text.replace(/\r\n?/g, '\n').split('\n'), [text]);
  return (
    <div className={`fp-code${wrap ? ' is-wrap' : ''}`} role="region" aria-label="File contents">
      {lines.map((l, i) => (
        <div key={i} className="fp-line">
          <span className="fp-ln" aria-hidden="true">
            {i + 1}
          </span>
          <span className="fp-lt">{l || ' '}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A web page drawn in a frame that can run nothing and fetch nothing: no scripts,
 * no forms, no pictures from elsewhere (only those inside the file), no navigation.
 */
function SealedPage({ html, title }: { html: string; title: string }) {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><base target="_blank"></head><body>${html.replace(/<meta[^>]+http-equiv[^>]*>/gi, '')}</body></html>`;
  return <iframe className="fp-html" title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={doc} />;
}

interface NbCell {
  kind: 'markdown' | 'code';
  text: string;
  out: { text?: string; image?: string }[];
}

/** A Jupyter notebook's cells, with their text and picture outputs. */
function readNotebook(json: string): NbCell[] | null {
  try {
    const nb = JSON.parse(json) as { cells?: { cell_type?: string; source?: string | string[]; outputs?: { text?: string | string[]; data?: Record<string, string | string[]> }[] }[] };
    if (!Array.isArray(nb.cells)) return null;
    const join = (s: string | string[] | undefined) => (Array.isArray(s) ? s.join('') : s ?? '');
    return nb.cells.slice(0, 500).map((c) => ({
      kind: c.cell_type === 'markdown' ? 'markdown' : 'code',
      text: join(c.source),
      out: (c.outputs ?? []).slice(0, 20).map((o) => {
        const png = o.data?.['image/png'];
        if (png) return { image: `data:image/png;base64,${join(png).replace(/\s/g, '')}` };
        return { text: join(o.text ?? o.data?.['text/plain']).slice(0, 20_000) };
      }),
    }));
  } catch {
    return null;
  }
}
