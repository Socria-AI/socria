'use client';

// components/preview/SlidesView.tsx — a presentation, slide by slide.
//
// The slide being looked at fills the stage at its own proportions; the others run
// down the side (along the bottom on a phone) to jump to. Arrow keys move through
// them, and Present shows the slide full screen. Each slide is drawn at its real
// size in pixels and scaled to fit, so text sits where the file puts it. A chart or
// SmartArt is shown as what it is, labelled — never guessed at.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Box } from '@/lib/docs/types';
import { markRect, type Mark } from '@/lib/preview/locate';
import { openPackage, type Package } from '@/lib/preview/ooxml';
import { px, readDeck, type Deck, type Para, type Shape, type Slide, type TextBody } from '@/lib/preview/slides';

export function SlidesView({
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
  /** a passage to show: its slide, and its box marked where the reading has one */
  mark?: Mark | null;
  /** the box of the passage under a point of the slide, for the faint box that follows the pointer */
  hit?: (page: number, fx: number, fy: number) => Box | null;
  /** a press on the slide: the passage there, to ask about */
  onPick?: (page: number, fx: number, fy: number) => void;
}) {
  const [hover, setHover] = useState<Box | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [pkg, setPkg] = useState<Package | null>(null);
  const [cur, setCur] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const p = await openPackage(await blob.arrayBuffer());
        const d = await readDeck(p);
        if (!live) return;
        setPkg(p);
        setDeck(d);
        onPages(d.slides.length);
      } catch (e) {
        if (live) onError(e instanceof Error && e.message ? e.message : 'This presentation could not be opened.');
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  const media = useMedia(pkg, deck);

  useEffect(() => {
    if (goto.seq && deck) setCur(Math.max(0, Math.min(deck.slides.length - 1, goto.n - 1)));
  }, [goto, deck]);
  // a passage asked for: its slide
  useEffect(() => {
    if (mark?.seq && deck) setCur(Math.max(0, Math.min(deck.slides.length - 1, mark.page - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark?.seq, deck]);
  useEffect(() => setHover(null), [cur]);
  useEffect(() => onPage(cur + 1), [cur, onPage]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, [deck]);

  // arrows move through the slides while the preview has the keyboard
  useEffect(() => {
    if (!deck) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (!t?.closest?.('.fp') && !document.fullscreenElement) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && document.fullscreenElement)) {
        e.preventDefault();
        setCur((c) => Math.min(deck.slides.length - 1, c + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCur((c) => Math.max(0, c - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deck]);

  if (!deck) return <p className="fp-wait">Opening the slides…</p>;
  const slide = deck.slides[cur];
  const fit = stageW ? (stageW - 32) / px(deck.width) : 0.5;
  const scale = Math.max(0.05, fit * zoom);
  const present = () => {
    const el = stage.current?.querySelector<HTMLElement>('.fp-slide-main');
    void el?.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="fp-slides">
      <div className="fp-slides-rail" role="listbox" aria-label="Slides">
        {deck.slides.map((s, i) => (
          <button key={s.n} type="button" role="option" aria-selected={i === cur} className={`fp-thumb${i === cur ? ' is-on' : ''}${s.hidden ? ' is-hidden' : ''}`} onClick={() => setCur(i)} aria-label={`Slide ${s.n}${s.hidden ? ' (hidden)' : ''}`}>
            <span className="fp-thumb-n">{s.n}</span>
            <SlideCanvas deck={deck} slide={s} scale={128 / px(deck.width)} media={media} thumb />
          </button>
        ))}
      </div>
      <div className="fp-slides-stage" ref={stage}>
        <div
          className="fp-slide-main"
          {...(onPick ? { 'data-pick': '' } : {})}
          onClick={(e) => {
            if (document.fullscreenElement) return setCur((c) => Math.min(deck.slides.length - 1, c + 1));
            const p = pointOn(e);
            if (p && onPick) onPick(slide.n, p.fx, p.fy);
          }}
          onMouseMove={hit ? (e) => { const p = pointOn(e); const b = p ? hit(slide.n, p.fx, p.fy) : null; setHover((h0) => (b ? (h0 && h0.join() === b.join() ? h0 : b) : null)); } : undefined}
          onMouseLeave={hit ? () => setHover(null) : undefined}
        >
          {(() => {
            const sc = document.fullscreenElement ? Math.min(window.innerWidth / px(deck.width), window.innerHeight / px(deck.height)) : scale;
            const w = px(deck.width) * sc;
            const h = px(deck.height) * sc;
            const marked = !document.fullscreenElement && mark && mark.page === slide.n && mark.box ? markRect(mark.box, w, h, 6) : null;
            const hovered = !document.fullscreenElement && hover && !(marked && mark?.box?.join() === hover.join()) ? markRect(hover, w, h, 6) : null;
            return (
              <SlideCanvas deck={deck} slide={slide} scale={sc} media={media}>
                {hovered && <span className="fp-hover" style={hovered} aria-hidden="true" />}
                {marked && <span key={mark!.seq} className="fp-mark" style={marked} aria-hidden="true" />}
              </SlideCanvas>
            );
          })()}
        </div>
        <div className="fp-slides-under">
          <span className="fp-slides-where">
            Slide {slide.n} of {deck.slides.length}
            {slide.hidden ? ' · hidden in the slide show' : ''}
          </span>
          <button type="button" className="l5-link is-meta" onClick={present}>
            Present
          </button>
        </div>
        {slide.notes && (
          <section className="fp-notes" aria-label="Speaker notes">
            <h3>Speaker notes</h3>
            <p>{slide.notes}</p>
          </section>
        )}
      </div>
    </div>
  );
}

/** The deck's pictures as object URLs, made once and let go with the preview. */
function useMedia(pkg: Package | null, deck: Deck | null): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!pkg || !deck) return;
    let live = true;
    const made: string[] = [];
    (async () => {
      const paths = new Set<string>();
      for (const s of deck.slides) {
        if (s.bg?.image) paths.add(s.bg.image);
        for (const sh of s.shapes) if (sh.image) paths.add(sh.image);
      }
      const out = new Map<string, string>();
      for (const p of paths) {
        const bytes = await pkg.bytes(p).catch(() => null);
        if (!bytes || !live) continue;
        // a picture format browsers cannot draw (EMF, WMF, TIFF) is left as a labelled box
        if (!/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(p)) continue;
        const type = /\.svg$/i.test(p) ? 'image/svg+xml' : /\.png$/i.test(p) ? 'image/png' : /\.gif$/i.test(p) ? 'image/gif' : /\.bmp$/i.test(p) ? 'image/bmp' : /\.webp$/i.test(p) ? 'image/webp' : 'image/jpeg';
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
        made.push(url);
        out.set(p, url);
      }
      if (live) setUrls(out);
    })();
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [pkg, deck]);
  return urls;
}

const FONT_FALLBACK = "'Calibri', 'Carlito', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const fontOf = (name?: string) => (name ? `'${name.replace(/'/g, '')}', ${FONT_FALLBACK}` : FONT_FALLBACK);

/** A few common outlines as CSS: the rest are drawn as the box they sit in. */
const CLIP: Record<string, string> = {
  triangle: 'polygon(50% 0, 100% 100%, 0 100%)',
  rtTriangle: 'polygon(0 0, 100% 100%, 0 100%)',
  diamond: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
  rightArrow: 'polygon(0 30%, 62% 30%, 62% 0, 100% 50%, 62% 100%, 62% 70%, 0 70%)',
  leftArrow: 'polygon(100% 30%, 38% 30%, 38% 0, 0 50%, 38% 100%, 38% 70%, 100% 70%)',
  upArrow: 'polygon(30% 100%, 30% 38%, 0 38%, 50% 0, 100% 38%, 70% 38%, 70% 100%)',
  downArrow: 'polygon(30% 0, 30% 62%, 0 62%, 50% 100%, 100% 62%, 70% 62%, 70% 0)',
  chevron: 'polygon(0 0, 75% 0, 100% 50%, 75% 100%, 0 100%, 25% 50%)',
  homePlate: 'polygon(0 0, 80% 0, 100% 50%, 80% 100%, 0 100%)',
  pentagon: 'polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%)',
  hexagon: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)',
  parallelogram: 'polygon(25% 0, 100% 0, 75% 100%, 0 100%)',
  trapezoid: 'polygon(20% 0, 80% 0, 100% 100%, 0 100%)',
  star5: 'polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
};

/** Where a pointer is on the slide drawn inside the element it moved over, as fractions of the slide. */
function pointOn(e: React.MouseEvent<HTMLElement>): { fx: number; fy: number } | null {
  const el = e.currentTarget.querySelector<HTMLElement>('.fp-slide');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const fy = (e.clientY - r.top) / r.height;
  return fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1 ? { fx, fy } : null;
}

export function SlideCanvas({ deck, slide, scale, media, thumb, children }: { deck: Deck; slide: Slide; scale: number; media: Map<string, string>; thumb?: boolean; children?: ReactNode }) {
  const W = px(deck.width);
  const H = px(deck.height);
  const bgImage = slide.bg?.image ? media.get(slide.bg.image) : undefined;
  return (
    <div className="fp-slide" style={{ width: W * scale, height: H * scale }} aria-label={thumb ? undefined : `Slide ${slide.n}`} role={thumb ? undefined : 'img'}>
      <div className="fp-slide-in" style={{ width: W, height: H, transform: `scale(${scale})`, background: slide.bg?.color ?? '#fff', ...(bgImage ? { backgroundImage: `url("${bgImage}")`, backgroundSize: 'cover' } : {}) }}>
        {slide.shapes.map((s, i) => (
          <ShapeView key={i} s={s} media={media} />
        ))}
      </div>
      {children}
    </div>
  );
}

function ShapeView({ s, media }: { s: Shape; media: Map<string, string> }) {
  const box: CSSProperties = {
    left: px(s.x),
    top: px(s.y),
    width: px(s.w),
    height: px(s.h),
    ...(s.rot || s.flipH || s.flipV ? { transform: `rotate(${s.rot ?? 0}deg)${s.flipH ? ' scaleX(-1)' : ''}${s.flipV ? ' scaleY(-1)' : ''}` } : {}),
  };
  if (s.kind === 'picture' || s.kind === 'media') {
    const url = s.image ? media.get(s.image) : undefined;
    return (
      <div className="fp-sh" style={box}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={s.name ?? ''} className="fp-sh-img" draggable={false} />
        ) : (
          <span className="fp-sh-ph">{s.kind === 'media' ? 'Video' : 'Picture'}</span>
        )}
      </div>
    );
  }
  if (s.kind === 'chart' || s.kind === 'diagram') {
    return (
      <div className="fp-sh fp-sh-obj" style={box}>
        <span className="fp-sh-ph">
          {s.kind === 'chart' ? 'Chart' : 'Diagram'}
          {s.label && !/^(chart|diagram|content placeholder)\s*\d*$/i.test(s.label) ? ` · ${s.label}` : ''}
        </span>
      </div>
    );
  }
  if (s.kind === 'table' && s.table) {
    const total = s.table.cols.reduce((a, b) => a + b, 0) || 1;
    return (
      <div className="fp-sh" style={box}>
        <table className="fp-sh-tbl">
          <colgroup>
            {s.table.cols.map((c, i) => (
              <col key={i} style={{ width: `${(c / total) * 100}%` }} />
            ))}
          </colgroup>
          <tbody>
            {s.table.rows.map((r, ri) => (
              <tr key={ri} style={{ height: px(r.h) }}>
                {r.cells.map((c, ci) =>
                  c.merged ? null : (
                    <td key={ci} colSpan={c.span} rowSpan={c.rowSpan} style={{ background: c.fill, padding: `${px(c.text.inset[1])}px ${px(c.text.inset[2])}px ${px(c.text.inset[3])}px ${px(c.text.inset[0])}px`, verticalAlign: c.text.anchor }}>
                      <Paras paras={c.text.paras} />
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  // a line: drawn from corner to corner of its box
  if (s.geom === 'line' || s.geom === 'straightConnector1' || /Connector/.test(s.geom ?? '')) {
    const w = Math.max(1, px(s.line?.width ?? 12700));
    return (
      <svg className="fp-sh" style={{ ...box, overflow: 'visible' }} viewBox={`0 0 ${Math.max(1, px(s.w))} ${Math.max(1, px(s.h))}`} preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="0" x2={px(s.w)} y2={px(s.h)} stroke={s.line?.color ?? '#000'} strokeWidth={w} strokeDasharray={s.line?.dash ? `${w * 3} ${w * 2}` : undefined} />
      </svg>
    );
  }
  const shape: CSSProperties = {
    ...box,
    ...(s.fill ? { background: s.fill } : {}),
    ...(s.line ? { boxShadow: `inset 0 0 0 ${Math.max(1, px(s.line.width))}px ${s.line.color}` } : {}),
    ...(s.geom === 'ellipse' ? { borderRadius: '50%' } : s.geom === 'roundRect' ? { borderRadius: Math.min(px(s.w), px(s.h)) * 0.16 } : {}),
    ...(s.geom && CLIP[s.geom] ? { clipPath: CLIP[s.geom] } : {}),
  };
  return (
    <div className="fp-sh" style={shape}>
      {s.text && <Body body={s.text} />}
    </div>
  );
}

function Body({ body }: { body: TextBody }) {
  const style: CSSProperties = {
    padding: `${px(body.inset[1])}px ${px(body.inset[2])}px ${px(body.inset[3])}px ${px(body.inset[0])}px`,
    justifyContent: body.anchor === 'middle' ? 'center' : body.anchor === 'bottom' ? 'flex-end' : 'flex-start',
    whiteSpace: body.wrap ? 'pre-wrap' : 'pre',
    ...(body.vertical ? { writingMode: 'vertical-rl' } : {}),
  };
  return (
    <div className="fp-sh-text" style={style}>
      <Paras paras={body.paras} />
    </div>
  );
}

function Paras({ paras }: { paras: Para[] }) {
  return (
    <>
      {paras.map((p, i) => {
        const size = p.runs.find((r) => r.size)?.size ?? 18;
        return (
          <p
            key={i}
            className="fp-sh-p"
            style={{
              textAlign: p.align ?? 'left',
              paddingLeft: p.level * 28 + (p.bullet ? 22 : 0),
              textIndent: p.bullet ? -22 : undefined,
              lineHeight: p.line ? p.line * 1.2 : 1.2,
              marginTop: p.before ? (p.before * 4) / 3 : i ? (size * 4) / 3 * 0.2 : 0,
              fontSize: (size * 4) / 3,
            }}
          >
            {p.bullet && <span className="fp-sh-bul" style={{ display: 'inline-block', width: 22, textIndent: 0 }}>{p.bullet}</span>}
            {p.runs.map((r, j) =>
              r.br ? (
                <br key={j} />
              ) : (
                <span
                  key={j}
                  style={{
                    ...(r.size ? { fontSize: (r.size * 4) / 3 } : {}),
                    ...(r.b ? { fontWeight: 700 } : {}),
                    ...(r.i ? { fontStyle: 'italic' } : {}),
                    ...(r.u || r.strike ? { textDecoration: `${r.u ? 'underline' : ''} ${r.strike ? 'line-through' : ''}`.trim() } : {}),
                    color: r.color ?? '#000',
                    fontFamily: fontOf(r.font),
                    ...(r.sup ? { verticalAlign: 'super', fontSize: '0.65em' } : r.sub ? { verticalAlign: 'sub', fontSize: '0.65em' } : {}),
                  }}
                >
                  {r.t}
                </span>
              )
            )}
          </p>
        );
      })}
    </>
  );
}
