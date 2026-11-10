'use client';

// components/preview/PdfView.tsx — a PDF's own pages, drawn by pdf.js in the browser.
//
// Every page is laid out at its own size from the start (so scrolling and the page
// count are right before anything is drawn), and a page is drawn only as it comes
// near the screen, at the sharpness the screen needs: a 300-page PDF opens as fast
// as a 3-page one. Zoom redraws what is in view. The pages are pictures of the
// original — the reading Socria reasons with is elsewhere.

import { useEffect, useRef, useState } from 'react';
import type { Box } from '@/lib/docs/types';
import { markRect, type Mark } from '@/lib/preview/locate';

interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void>; cancel?: () => void };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy?: () => Promise<void>;
  loadingTask?: { destroy(): Promise<void> };
}

export function PdfView({
  blob,
  zoom,
  goto,
  onPages,
  onPage,
  onError,
  mark,
  hit,
  onPick,
}: {
  blob: Blob;
  zoom: number;
  goto: { n: number; seq: number };
  onPages: (n: number) => void;
  onPage: (n: number) => void;
  onError: (msg: string) => void;
  /** a passage to show, marked where the reading boxed it */
  mark?: Mark | null;
  /** the box of the passage under a point of a page, for the faint box that follows the pointer */
  hit?: (page: number, fx: number, fy: number) => Box | null;
  /** a press on a page: the passage there, to ask about */
  onPick?: (page: number, fx: number, fy: number) => void;
}) {
  const [hover, setHover] = useState<{ page: number; box: Box } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [width, setWidth] = useState(0);
  const [near, setNear] = useState<Set<number>>(() => new Set([1, 2]));

  // open the file once
  useEffect(() => {
    let live = true;
    let opened: PdfDoc | null = null;
    (async () => {
      try {
        const { getDocumentProxy } = await import('unpdf');
        const pdf = (await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()))) as unknown as PdfDoc;
        opened = pdf;
        if (!live) return;
        // every page's size, a few at a time, so the layout is right before the pictures arrive
        const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
        const all = Array.from({ length: pdf.numPages }, () => ({ w: first.width, h: first.height }));
        setDoc(pdf);
        setSizes(all);
        onPages(pdf.numPages);
        for (let n = 2; n <= Math.min(pdf.numPages, 400) && live; n++) {
          const vp = (await pdf.getPage(n)).getViewport({ scale: 1 });
          if (vp.width !== first.width || vp.height !== first.height) {
            all[n - 1] = { w: vp.width, h: vp.height };
            if (n % 20 === 0 || n === pdf.numPages) setSizes([...all]);
          }
        }
        if (live) setSizes([...all]);
      } catch (e) {
        const name = (e as { name?: string })?.name ?? '';
        onError(/password/i.test(name) || /password/i.test(String(e)) ? 'This PDF is protected with a password, so it cannot be previewed here. Download it to open it with its password.' : 'This PDF could not be opened. It may be damaged.');
      }
    })();
    return () => {
      live = false;
      void (opened?.loadingTask?.destroy() ?? opened?.destroy?.())?.catch?.(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  // the width pages fit
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // which pages are near the screen, and which one is the page being read
  useEffect(() => {
    const el = box.current;
    if (!el || !sizes.length) return;
    const pages = [...el.querySelectorAll<HTMLElement>('[data-pdf-page]')];
    const io = new IntersectionObserver(
      (entries) => {
        setNear((prev) => {
          const next = new Set(prev);
          for (const en of entries) {
            const n = Number((en.target as HTMLElement).dataset.pdfPage);
            if (en.isIntersecting) next.add(n);
          }
          return next.size === prev.size ? prev : next;
        });
      },
      { root: el, rootMargin: '900px 0px' }
    );
    pages.forEach((p) => io.observe(p));
    const onScroll = () => {
      const mid = el.scrollTop + el.clientHeight * 0.35;
      let n = 1;
      for (const p of pages) if (p.offsetTop <= mid) n = Number(p.dataset.pdfPage);
      onPage(n);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes.length]);

  // a page asked for from the toolbar
  useEffect(() => {
    if (!goto.seq) return;
    box.current?.querySelector(`[data-pdf-page="${goto.n}"]`)?.scrollIntoView({ block: 'start' });
  }, [goto]);

  // a passage asked for: its page, scrolled so the passage sits a little below the top
  useEffect(() => {
    if (!mark?.seq || !sizes.length) return;
    const el = box.current;
    const pageEl = el?.querySelector<HTMLElement>(`[data-pdf-page="${mark.page}"]`);
    if (!el || !pageEl) return;
    const y = pageEl.offsetTop + (mark.box ? mark.box[1] * pageEl.offsetHeight : 0) - Math.min(120, el.clientHeight * 0.18);
    el.scrollTo({ top: Math.max(0, y), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark?.seq, sizes.length]);

  /** where on its page a pointer is, as fractions of the page */
  const at = (e: React.MouseEvent<HTMLDivElement>, n: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { page: n, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
  };

  const fit = Math.max(200, width - 32);
  return (
    <div ref={box} className="fp-pdf" tabIndex={0} aria-label="Pages" {...(onPick ? { 'data-pick': '' } : {})}>
      {sizes.map((s, k) => {
        const w = Math.round(fit * zoom);
        const h = Math.round((w * s.h) / s.w);
        const marked = mark && mark.page === k + 1 && mark.box ? markRect(mark.box, w, h) : null;
        const hovered = hover && hover.page === k + 1 && !(mark?.box && mark.page === hover.page && mark.box.join() === hover.box.join()) ? markRect(hover.box, w, h) : null;
        return (
          <div
            key={k}
            className="fp-pdf-page"
            data-pdf-page={k + 1}
            style={{ width: w, height: h }}
            onClick={onPick ? (e) => { const p = at(e, k + 1); onPick(p.page, p.fx, p.fy); } : undefined}
            onMouseMove={hit ? (e) => { const p = at(e, k + 1); const b = hit(p.page, p.fx, p.fy); setHover((h0) => (b ? (h0 && h0.page === p.page && h0.box.join() === b.join() ? h0 : { page: p.page, box: b }) : null)); } : undefined}
            onMouseLeave={hit ? () => setHover(null) : undefined}
          >
            {doc && near.has(k + 1) ? <PageCanvas doc={doc} n={k + 1} width={w} /> : null}
            {hovered && <span className="fp-hover" style={hovered} aria-hidden="true" />}
            {marked && <span key={mark!.seq} className="fp-mark" style={marked} aria-hidden="true" />}
            <span className="fp-pdf-n" aria-hidden="true">
              {k + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PageCanvas({ doc, n, width }: { doc: PdfDoc; n: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let task: { cancel?: () => void } | null = null;
    // a moment's grace while zooming, so a run of steps draws once
    const t = window.setTimeout(async () => {
      try {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale: (width / base.width) * dpr });
        const c = ref.current;
        if (!c || !live) return;
        const off = document.createElement('canvas');
        off.width = Math.ceil(vp.width);
        off.height = Math.ceil(vp.height);
        const ctx = off.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, off.width, off.height);
        const r = page.render({ canvasContext: ctx, viewport: vp });
        task = r;
        await r.promise;
        if (!live || !ref.current) return;
        c.width = off.width;
        c.height = off.height;
        c.getContext('2d')?.drawImage(off, 0, 0);
      } catch {
        if (live) setFailed(true);
      }
    }, 80);
    return () => {
      live = false;
      window.clearTimeout(t);
      task?.cancel?.();
    };
  }, [doc, n, width]);
  if (failed) return <p className="fp-pdf-fail">Page {n} could not be drawn.</p>;
  return <canvas ref={ref} className="fp-pdf-canvas" aria-label={`Page ${n}`} role="img" />;
}
