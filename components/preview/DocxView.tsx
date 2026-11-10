'use client';

// components/preview/DocxView.tsx — a Word document laid out as Word lays it out.
//
// docx-preview reads the original .docx — its styles, page size and margins,
// headings, tables, pictures, headers and footers, footnotes — and builds the pages.
// They are built inside a shadow root, so the document's own styles cannot reach
// the rest of Socria and Socria's cannot reach the document. Links are kept only
// when they go somewhere ordinary (http, https, mailto) and open in a new tab.

import { useEffect, useRef, useState } from 'react';

export function DocxView({ blob, zoom, goto, onPages, onPage, onError }: { blob: Blob; zoom: number; goto?: { n: number; seq: number }; onPages: (n: number) => void; onPage?: (n: number) => void; onError: (msg: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement | null>(null);
  const [docWidth, setDocWidth] = useState(816);
  const [boxWidth, setBoxWidth] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = '';
    const style = document.createElement('style');
    // the page's frame: paper on a quiet ground, each page its own sheet
    style.textContent = `
      :host { display: block; }
      .fp-docx-root { transform-origin: top left; }
      .fp-docx-root .docx-wrapper { background: transparent !important; padding: 0 !important; display: flex; flex-direction: column; align-items: center; gap: 18px; }
      .fp-docx-root .docx-wrapper > section.docx { margin: 0 !important; box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 6px 22px -10px rgba(0,0,0,.25) !important; }
      .fp-docx-root a[href] { color: #1f5fbf; }
    `;
    const styles = document.createElement('div');
    const body = document.createElement('div');
    body.className = 'fp-docx-root';
    root.append(style, styles, body);
    page.current = body;
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        await renderAsync(blob, body, styles, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: false,
          useBase64URL: true,
          experimental: true,
        });
        if (!live) return;
        // links: only to ordinary places, in a new tab; anything else is text
        for (const a of body.querySelectorAll('a')) {
          const href = a.getAttribute('href') ?? '';
          if (/^(https?:|mailto:)/i.test(href)) {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
          } else if (!href.startsWith('#')) a.removeAttribute('href');
        }
        // no script, no frame, no form, nothing that runs or reaches out — whatever the file held
        body.querySelectorAll('script, iframe, object, embed, form, link, meta').forEach((n) => n.remove());
        const sections = body.querySelectorAll('section.docx');
        onPages(Math.max(1, sections.length));
        const first = sections[0] as HTMLElement | undefined;
        if (first) setDocWidth(first.offsetWidth || 816);
        setReady(true);
      } catch {
        if (live) onError('This Word document could not be opened. It may be damaged, or saved in an older format (.doc).');
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  useEffect(() => {
    const el = host.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // zoom 1 fits the page to the panel (never larger than the page's own size)
  const fit = boxWidth ? Math.min(1, (boxWidth - 32) / docWidth) : 1;
  const scale = fit * zoom;
  useEffect(() => {
    if (page.current) (page.current.style as CSSStyleDeclaration & { zoom: string }).zoom = String(scale);
  }, [scale, ready]);

  // a page asked for from the toolbar, and the page being read reported back as the document scrolls
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!goto?.seq) return;
    const sections = page.current?.querySelectorAll<HTMLElement>('section.docx');
    sections?.[goto.n - 1]?.scrollIntoView({ block: 'start' });
  }, [goto]);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !ready || !onPage) return;
    const onScroll = () => {
      const sections = [...(page.current?.querySelectorAll<HTMLElement>('section.docx') ?? [])];
      const top = el.getBoundingClientRect().top + el.clientHeight * 0.35;
      let n = 1;
      sections.forEach((s, k) => {
        if (s.getBoundingClientRect().top <= top) n = k + 1;
      });
      onPage(n);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ready, onPage]);

  return (
    <div ref={scroller} className="fp-docx" tabIndex={0} aria-label="Document pages">
      {!ready && <p className="fp-wait">Laying out the pages…</p>}
      <div ref={host} />
    </div>
  );
}
