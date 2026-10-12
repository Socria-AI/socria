// lib/docs/pptx.ts — a presentation, read slide by slide.
//
// The old reader wrote each slide's text runs out in the order the file lists
// its shapes — which is the order they were drawn, not the order they are
// read. This reads a slide the way a person does:
//
//   · one page per slide, in the presentation's own order, sized as the slide
//   · the title first, then the rest top to bottom and left to right, each
//     shape where it sits (boxes from the slide, or from its layout when a
//     placeholder takes its position from there)
//   · bullet points as list items, with their levels
//   · tables with their cells; charts from the numbers they cache; SmartArt
//     as an outline; equations (PowerPoint's own) in linear notation;
//     spreadsheets embedded on a slide as the tables they show
//   · pictures' alt text, and the picture itself for a vision reading on
//     request
//   · speaker notes, as notes at the end of their slide
//
// Slide numbers and dates in the slide furniture are left out; hidden slides
// are read and said to be hidden.
//
// PURE — works over OfficeParts.

import { DocBuilder, type MediaRef, type ReaderOut } from './build';
import type { RawPage } from './checks';
import { alternate, chartRawText, coreTitle, diagramRawText, guessHead, mimeOf, pictureInfo, readChart, readDiagram, relsOf, visible, type OfficeParts, type Rel } from './office';
import { equationText } from './omml';
import { toScript } from './text';
import type { BlockKind, Box, DocCheck } from './types';
import { attr, first, kid, kids, parseXml, relId, textOf, type XNode } from './xml';
import { embeddedWorkbook } from './xlsx';

const BUDGET = 300_000;
const EMU_PER_PT = 12_700;

interface Xfrm {
  x: number;
  y: number;
  w: number;
  h: number;
}

function xfrmOf(n: XNode | undefined): Xfrm | null {
  const off = kid(n, 'a:off');
  const ext = kid(n, 'a:ext');
  if (!off || !ext) return null;
  const v = [Number(attr(off, 'x')), Number(attr(off, 'y')), Number(attr(ext, 'cx')), Number(attr(ext, 'cy'))];
  return v.every(Number.isFinite) ? { x: v[0], y: v[1], w: v[2], h: v[3] } : null;
}

/** A group's transform: its children's coordinates into the slide's. */
type Map2 = (r: Xfrm) => Xfrm;
const IDENTITY: Map2 = (r) => r;

function groupMap(grpSpPr: XNode | undefined, outer: Map2): Map2 {
  const x = kid(grpSpPr, 'a:xfrm');
  const off = kid(x, 'a:off');
  const ext = kid(x, 'a:ext');
  const chOff = kid(x, 'a:chOff');
  const chExt = kid(x, 'a:chExt');
  if (!off || !ext || !chOff || !chExt) return outer;
  const [ox, oy, ew, eh, cx, cy, cw, ch] = [attr(off, 'x'), attr(off, 'y'), attr(ext, 'cx'), attr(ext, 'cy'), attr(chOff, 'x'), attr(chOff, 'y'), attr(chExt, 'cx'), attr(chExt, 'cy')].map(Number);
  const sx = cw ? ew / cw : 1;
  const sy = ch ? eh / ch : 1;
  return (r) => outer({ x: ox + (r.x - cx) * sx, y: oy + (r.y - cy) * sy, w: r.w * sx, h: r.h * sy });
}

interface Placeholder {
  type: string;
  idx?: string;
}

const phOf = (nvPr: XNode | undefined): Placeholder | null => {
  const ph = kid(nvPr, 'p:ph');
  if (!ph) return null;
  return { type: attr(ph, 'type') ?? 'obj', ...(attr(ph, 'idx') !== undefined ? { idx: attr(ph, 'idx') } : {}) };
};

/** Where a placeholder that does not say sits: the same placeholder on the layout, else on the master. */
function inheritedXfrm(parts: OfficeParts, layoutPart: string | undefined, ph: Placeholder): Xfrm | null {
  const look = (part: string | undefined): Xfrm | null => {
    if (!part) return null;
    const xml = parts.text(part);
    if (!xml) return null;
    const sps = findShapes(parseXml(xml));
    const same = (p: Placeholder | null) => !!p && ((ph.idx !== undefined && p.idx === ph.idx) || (p.type === ph.type && ph.idx === undefined));
    const titleLike = (t: string) => t === 'title' || t === 'ctrTitle';
    const hit = sps.find((s) => same(phOf(kid(kid(s, 'p:nvSpPr'), 'p:nvPr')))) ?? sps.find((s) => titleLike(ph.type) && titleLike(phOf(kid(kid(s, 'p:nvSpPr'), 'p:nvPr'))?.type ?? ''));
    return hit ? xfrmOf(kid(kid(hit, 'p:spPr'), 'a:xfrm')) : null;
  };
  const fromLayout = look(layoutPart);
  if (fromLayout) return fromLayout;
  const master = layoutPart ? [...relsOf(parts, layoutPart).values()].find((r) => /slideMaster$/i.test(r.type))?.target : undefined;
  return look(master);
}

const findShapes = (root: XNode): XNode[] => {
  const out: XNode[] = [];
  const walk = (n: XNode) => {
    for (const c of kids(n)) {
      if (c.name === 'p:sp') out.push(c);
      else if (c.name === 'p:grpSp' || c.name === 'p:spTree' || c.name === 'p:cSld') walk(c);
      else if (c.name === 'mc:AlternateContent') for (const a of alternate(c)) walk({ name: '#', attrs: {}, children: [a] });
      else if (c.name === 'p:sldLayout' || c.name === 'p:sldMaster' || c.name === 'p:sld' || c.name === 'p:notes' || c.name === '#root') walk(c);
    }
  };
  walk(root);
  return out;
};

interface Para {
  text: string;
  level: number;
  bullet: boolean;
  bulletNone: boolean;
  math: string[];
  plain: string;
}

/** A text body's paragraphs: runs, fields, breaks and equations. */
function paragraphs(txBody: XNode | undefined): Para[] {
  const out: Para[] = [];
  for (const p of kids(txBody, 'a:p')) {
    const pPr = kid(p, 'a:pPr');
    let text = '';
    let plain = '';
    const math: string[] = [];
    const visit = (nodes: XNode[]) => {
      for (const c of nodes) {
        if (c.name === 'a:r' || c.name === 'a:fld') {
          let t = kids(c, 'a:t').map(textOf).join('');
          const base = Number(attr(kid(c, 'a:rPr'), 'baseline') ?? 0);
          if (base && /\S/.test(t)) t = toScript(t, base > 0 ? 'sup' : 'sub') ?? t;
          text += t;
          plain += t;
        } else if (c.name === 'a:br') {
          text += '\n';
          plain += '\n';
        } else if (c.name === 'mc:AlternateContent') visit(alternate(c));
        else if (c.name === 'a14:m') {
          for (const m of kids(c).filter((x) => x.name === 'm:oMathPara' || x.name === 'm:oMath')) {
            const e = equationText(m);
            if (e) {
              math.push(e);
              text += text && !/\s$/.test(text) ? ` ${e} ` : `${e} `;
            }
          }
        }
      }
    };
    visit(kids(p));
    out.push({
      text: text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(),
      plain: plain.trim(),
      math,
      level: Math.min(4, Number(attr(pPr, 'lvl') ?? 0) + 1),
      bullet: !!kid(pPr, 'a:buChar') || !!kid(pPr, 'a:buAutoNum'),
      bulletNone: !!kid(pPr, 'a:buNone'),
    });
  }
  return out;
}

interface Shape {
  order: number;
  box?: Xfrm;
  title: boolean;
  emit: (b: DocBuilder, page: number, box: Box | undefined) => void;
}

/** A presentation into a SourceDoc: one page per slide. */
export function readPptx(parts: OfficeParts, meta: { id: string; name: string }): ReaderOut {
  let pres = 'ppt/presentation.xml';
  const rootRels = parts.text('_rels/.rels');
  if (rootRels) for (const r of kids(first(parseXml(rootRels), 'Relationships'), 'Relationship')) if (/officeDocument$/.test(r.attrs.Type ?? '') && r.attrs.Target) pres = r.attrs.Target.replace(/^\//, '');
  const xml = parts.text(pres) ?? '';
  const root = parseXml(xml);
  const prels = relsOf(parts, pres);
  const sz = first(root, 'p:sldSz');
  const W = Number(attr(sz, 'cx')) || 12_192_000;
  const H = Number(attr(sz, 'cy')) || 6_858_000;
  let slides = kids(first(root, 'p:sldIdLst'), 'p:sldId')
    .map((s) => prels.get(relId(s) ?? ''))
    .filter((r): r is Rel => !!r && !r.external);
  // a package written without its presentation part: the slides by name, in numeric order (slide2 before slide10)
  if (!slides.length) {
    const re = /^ppt\/slides\/slide(\d+)\.xml$/;
    slides = parts
      .names()
      .filter((n) => re.test(n))
      .sort((a, b) => Number(re.exec(a)![1]) - Number(re.exec(b)![1]))
      .map((n, i) => ({ id: `s${i}`, type: 'slide', target: n, external: false }));
  }
  if (!slides.length) throw new Error('it has no slides inside it');

  const b = new DocBuilder('structured');
  const raw: RawPage[] = [];
  const notes: DocCheck[] = [];
  const media: { figure: number; part: string }[] = [];
  const sizes = new Map<number, { w: number; h: number }>();
  let unread: { from: number; to: number } | undefined;
  const hidden: number[] = [];

  slides.forEach((rel, i) => {
    const page = i + 1;
    if (unread) return;
    if (page > 1 && b.chars > BUDGET) {
      unread = { from: page, to: slides.length };
      return;
    }
    sizes.set(page, { w: W / EMU_PER_PT, h: H / EMU_PER_PT });
    const sx = parts.text(rel.target);
    if (!sx) return;
    const sroot = parseXml(sx);
    if (attr(first(sroot, 'p:sld'), 'show') === '0') hidden.push(page);
    const srels = relsOf(parts, rel.target);
    const layout = [...srels.values()].find((r) => /slideLayout$/i.test(r.type))?.target;
    const shapes: Shape[] = [];
    const rawParts: string[] = [];
    let order = 0;
    const norm = (r: Xfrm | null | undefined): Box | undefined => {
      if (!r || !W || !H) return undefined;
      const c = (v: number) => Math.min(1, Math.max(0, v));
      return [c(r.x / W), c(r.y / H), c((r.x + r.w) / W), c((r.y + r.h) / H)];
    };

    const visit = (n: XNode, map: Map2) => {
      for (const c of kids(n)) {
        if (c.name === 'mc:AlternateContent') {
          visit({ name: '#', attrs: {}, children: alternate(c) }, map);
          continue;
        }
        if (c.name === 'p:grpSp') {
          visit(c, groupMap(kid(c, 'p:grpSpPr'), map));
          continue;
        }
        if (c.name === 'p:sp') {
          const nvPr = kid(kid(c, 'p:nvSpPr'), 'p:nvPr');
          const ph = phOf(nvPr);
          if (ph && /^(sldNum|dt|hdr)$/.test(ph.type)) continue;
          const own = xfrmOf(kid(kid(c, 'p:spPr'), 'a:xfrm'));
          const box = own ? map(own) : ph ? inheritedXfrm(parts, layout, ph) : null;
          const paras = paragraphs(kid(c, 'p:txBody')).filter((p) => p.text);
          if (!paras.length) continue;
          const isTitle = !!ph && (ph.type === 'title' || ph.type === 'ctrTitle');
          // a placeholder that names no type holds content ("obj"), which PowerPoint bullets
          const isBody = !!ph && (ph.type === 'body' || ph.type === 'obj');
          const footer = ph?.type === 'ftr';
          shapes.push({
            order: order++,
            ...(box ? { box } : {}),
            title: isTitle,
            emit: (bb, pg, bx) => {
              for (const p of paras) {
                let kind: BlockKind;
                let level: number | undefined;
                let tex: string | undefined;
                if (p.math.length && !p.plain.trim()) {
                  kind = 'equation';
                  tex = p.math.join('; ');
                } else if (isTitle) {
                  kind = pg === 1 && ph?.type === 'ctrTitle' ? 'title' : 'heading';
                  level = kind === 'heading' ? 1 : undefined;
                } else if (footer) kind = 'footer';
                else if (ph?.type === 'subTitle') kind = 'paragraph';
                else if ((isBody && !p.bulletNone) || p.bullet) {
                  kind = 'list';
                  level = p.level;
                } else kind = 'paragraph';
                bb.block({ page: pg, kind, text: p.text, ...(level ? { level } : {}), ...(tex ? { tex } : {}), ...(bx ? { box: bx } : {}) });
              }
            },
          });
          continue;
        }
        if (c.name === 'p:graphicFrame') {
          const own = xfrmOf(kid(c, 'p:xfrm'));
          const box = own ? map(own) : null;
          const info = pictureInfo(first(c, 'p:cNvPr'));
          const tbl = first(c, 'a:tbl');
          const chartRef = first(c, 'c:chart') ?? first(c, 'cx:chart');
          const dgm = first(c, 'dgm:relIds');
          const ole = first(c, 'p:oleObj');
          if (tbl) {
            const rows: string[][] = [];
            for (const tr of kids(tbl, 'a:tr')) {
              const row: string[] = [];
              for (const tc of kids(tr, 'a:tc')) {
                const merged = /^(1|true)$/.test(attr(tc, 'hMerge') ?? '') || /^(1|true)$/.test(attr(tc, 'vMerge') ?? '');
                row.push(merged ? '' : paragraphs(kid(tc, 'a:txBody')).map((p) => p.text).filter(Boolean).join('\n'));
              }
              rows.push(row);
            }
            const width = Math.max(0, ...rows.map((r) => r.length));
            for (const r of rows) while (r.length < width) r.push('');
            const firstRow = /^(1|true)$/.test(attr(kid(tbl, 'a:tblPr'), 'firstRow') ?? '');
            shapes.push({ order: order++, ...(box ? { box } : {}), title: false, emit: (bb, pg, bx) => void bb.table({ page: pg, rows, head: firstRow ? 1 : guessHead(rows), ...(bx ? { box: bx } : {}) }) });
          } else if (chartRef) {
            const r = srels.get(relId(chartRef) ?? '');
            const cxml = r && !r.external ? parts.text(r.target) : null;
            const chart = cxml ? readChart(cxml) : null;
            rawParts.push(cxml ? chartRawText(cxml) : '', info.alt ?? '', info.title ?? '');
            shapes.push({
              order: order++,
              ...(box ? { box } : {}),
              title: false,
              emit: (bb, pg, bx) => {
                const t = chart && chart.rows.length > 1 ? bb.table({ page: pg, rows: chart.rows, head: chart.head, ...(chart.title ? { caption: chart.title } : {}) }) : undefined;
                bb.figure(
                  { page: pg, kind: 'chart', ...(chart ? { chart: chart.kind } : {}), ...(chart?.title ? { caption: chart.title } : {}), ...(info.alt ? { alt: info.alt } : {}), ...(t !== undefined ? { table: t } : {}), ...(bx ? { box: bx } : {}) },
                  [chart?.title, ...(chart?.axes ?? []), info.alt, info.title].filter(Boolean).join('\n'),
                  chart ? undefined : ['illegible']
                );
              },
            });
          } else if (dgm) {
            const r = srels.get(attr(dgm, 'dm') ?? '');
            const dxml = r && !r.external ? parts.text(r.target) : null;
            const items = dxml ? readDiagram(dxml) : [];
            rawParts.push(dxml ? diagramRawText(dxml) : '', info.alt ?? '', info.title ?? '');
            shapes.push({
              order: order++,
              ...(box ? { box } : {}),
              title: false,
              emit: (bb, pg, bx) => {
                bb.figure({ page: pg, kind: 'diagram', ...(info.alt ? { alt: info.alt } : {}), ...(bx ? { box: bx } : {}) }, [info.alt, info.title].filter(Boolean).join('\n'));
                for (const d of items) bb.block({ page: pg, kind: 'list', level: d.level, text: d.text, ...(bx ? { box: bx } : {}) });
              },
            });
          } else if (ole) {
            const r = srels.get(relId(ole) ?? '');
            const prog = attr(ole, 'progId') ?? '';
            shapes.push({
              order: order++,
              ...(box ? { box } : {}),
              title: false,
              emit: (bb, pg, bx) => {
                if (r && !r.external && /\.xlsx$/i.test(r.target) && parts.open) {
                  try {
                    const inner = parts.open(r.target);
                    const got = inner ? embeddedWorkbook(inner, bb, pg, notes) : null;
                    if (got) {
                      rawParts.push(got.raw);
                      return;
                    }
                  } catch {
                    // said below
                  }
                }
                const eq = /^equation|mathtype|dsmt/i.test(prog);
                bb.figure({ page: pg, kind: eq ? 'equation' : 'object', ...(bx ? { box: bx } : {}) }, '', ['illegible']);
              },
            });
          }
          continue;
        }
        if (c.name === 'p:pic') {
          const info = pictureInfo(first(c, 'p:cNvPr'));
          if (info.decorative || info.hidden) continue;
          const own = xfrmOf(kid(kid(c, 'p:spPr'), 'a:xfrm'));
          const box = own ? map(own) : null;
          const blip = first(c, 'a:blip');
          const r = srels.get(attr(blip, 'embed') ?? '');
          const video = !!first(c, 'a:videoFile') || !!first(c, 'a:audioFile');
          rawParts.push(info.alt ?? '', info.title ?? '');
          shapes.push({
            order: order++,
            ...(box ? { box } : {}),
            title: false,
            emit: (bb, pg, bx) => {
              const f = bb.figure({ page: pg, kind: video ? 'object' : 'image', ...(info.alt ? { alt: info.alt } : {}), ...(bx ? { box: bx } : {}) }, [info.alt, info.title].filter(Boolean).join('\n'));
              if (!video && r && !r.external) media.push({ figure: f, part: r.target });
            },
          });
        }
      }
    };
    visit(first(sroot, 'p:spTree') ?? sroot, IDENTITY);

    // reading order: the title, then top to bottom in bands, left to right within a band
    const band = H * 0.06;
    shapes.sort((a, c) => {
      if (a.title !== c.title) return a.title ? -1 : 1;
      if (!a.box || !c.box) return a.order - c.order;
      const ra = Math.floor(a.box.y / band);
      const rc = Math.floor(c.box.y / band);
      return ra - rc || a.box.x - c.box.x || a.order - c.order;
    });
    for (const s of shapes) s.emit(b, page, norm(s.box));

    // speaker notes
    const notesPart = [...srels.values()].find((r) => /notesSlide$/i.test(r.type))?.target ?? (srels.size ? undefined : rel.target.replace('slides/slide', 'notesSlides/notesSlide'));
    const nx = notesPart ? parts.text(notesPart) : null;
    if (nx) {
      const nroot = parseXml(nx);
      // the notes' words for the checks, read from their XML directly
      rawParts.push(rawSlide(nroot, []));
      for (const sp of findShapes(nroot)) {
        const ph = phOf(kid(kid(sp, 'p:nvSpPr'), 'p:nvPr'));
        if (ph?.type !== 'body') continue;
        const text = paragraphs(kid(sp, 'p:txBody'))
          .map((p) => p.text)
          .filter(Boolean)
          .join('\n');
        if (text) b.block({ page, kind: 'note', text });
      }
    }
    raw.push({ n: page, text: rawSlide(sroot, rawParts) });
  });

  if (hidden.length) notes.push({ id: 'unread', level: 'ok', says: `Slide${hidden.length === 1 ? '' : 's'} ${hidden.join(', ')} ${hidden.length === 1 ? 'is' : 'are'} hidden in the presentation; read too.`, pages: hidden });
  const doc = b.build({ id: meta.id, name: meta.name, format: 'pptx', pageCount: slides.length, title: coreTitle(parts), sizes, ...(unread ? { unread } : {}) });
  return {
    doc,
    raw,
    notes,
    media: media
      .map((m) => ({ figure: `f${m.figure + 1}`, page: doc.figures[m.figure]?.page ?? 1, part: m.part, mime: mimeOf(m.part) }))
      .filter((m): m is MediaRef => visible(m.mime)),
  };
}

/**
 * Every word a slide holds, from its XML directly — text runs and fields in
 * every shape and table, equations — plus what the reader took from parts
 * the slide points at (charts, diagrams, notes, alt text), for the checks.
 */
function rawSlide(sroot: XNode, extra: string[]): string {
  const out: string[] = [];
  const walk = (n: XNode) => {
    for (const c of kids(n)) {
      if (c.name === 'mc:AlternateContent') {
        walk({ name: '#', attrs: {}, children: alternate(c) });
        continue;
      }
      if (c.name === 'p:sp') {
        const ph = phOf(kid(kid(c, 'p:nvSpPr'), 'p:nvPr'));
        if (ph && /^(sldNum|dt|hdr)$/.test(ph.type)) continue;
      }
      if (c.name === 'p:graphicFrame' && !first(c, 'a:tbl')) continue;
      if (c.name === 'a:r' || c.name === 'a:fld') {
        const t = kids(c, 'a:t').map(textOf).join('');
        const base = Number(attr(kid(c, 'a:rPr'), 'baseline') ?? 0);
        out.push(base && /\S/.test(t) ? (toScript(t, base > 0 ? 'sup' : 'sub') ?? t) : t);
        continue;
      }
      if (c.name === 'm:t') {
        out.push(` ${textOf(c)} `);
        continue;
      }
      if (c.name === 'a:p' || c.name === 'a:tc') {
        walk(c);
        out.push('\n');
        continue;
      }
      walk(c);
    }
  };
  walk(sroot);
  return [...out, '\n', ...extra.filter(Boolean)].join('');
}
