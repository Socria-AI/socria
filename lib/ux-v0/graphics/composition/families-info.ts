// lib/ux-v0/graphics/composition/families-info.ts — the information-oriented families.
//
// The facts organised as information: stations on a line, nodes in a diagram, numbered panels, labelled figures, a
// drawing sheet, a dense grid, a slide. Built only from what the brief gives (its words, its details, its points, its
// numbers): no figure, number or label is invented. A key figure is a typographic setting of the words given (a date's
// numerals, the headline's initial), marked decorative because the words themselves are set in full beside it.

import { newId, type Node, type TextNode } from '../doc';
import type { Anchor } from './schema';
import { around, cells, disc, figure, headline, info, inkOn, line, pattern, photo, placeAt, prim, rect, setHeight, splitH, splitV, type Box, type CC, fitText } from './kit';

type Family = (c: CC) => void;

/** The facts to arrange, in order: the subtitle, each detail, the action, each point (all given by the brief). */
function facts(c: CC): { role: 'subhead' | 'meta' | 'cta' | 'body'; text: string }[] {
  const b = c.x.brief.content;
  return [
    ...(b.subhead ? [{ role: 'subhead' as const, text: b.subhead }] : []),
    ...c.k.metaLines(c.x).map((m) => ({ role: 'meta' as const, text: m })),
    ...(b.items ?? []).slice(0, 4).map((t) => ({ role: 'body' as const, text: t })),
    ...(b.cta ? [{ role: 'cta' as const, text: `${b.cta} →` }] : []),
  ];
}

/** A short text set in a box, sized for a label or a station. */
function label(c: CC, role: 'subhead' | 'meta' | 'cta' | 'body' | 'logo', text: string, box: Box, s: Partial<TextNode> = {}): TextNode {
  const size = s.size ?? Math.max(c.k.minText(c.x), c.u * (role === 'subhead' ? 3 : 2.4));
  const t = c.k.text(c.x, role, text, box, { size, autoHeight: true, ...(role === 'cta' ? { weight: 700 } : {}), ...s });
  t.h = Math.max(size * 1.25, setHeight(c, t));
  return t;
}

const brandAt = (c: CC, a: Anchor): Node[] =>
  c.x.brief.content.brand ? [label(c, 'logo', c.x.brief.content.brand, placeAt(c.safe, a, c.safe.w * 0.4, c.u * 5), { weight: 700, align: a[1] === 'r' ? 'right' : 'left', case: 'none', tracking: 20 })] : [];

export const INFORMATION: Record<string, Family> = {
  'infographic-hierarchy': (c) => {
    const kind = c.s('figure');
    const at = c.s('at');
    const S = c.safe;
    const meta = c.k.metaLines(c.x);
    const digits = meta.map((m) => m.match(/\d+(?:\s*[–-]\s*\d+)?/)?.[0]).find(Boolean);
    const key = kind === 'date' && digits ? digits.replace(/\s+/g, '') : (c.x.brief.content.headline.trim()[0] ?? '');
    const figBox = at === 'top' ? { x: S.x, y: S.y, w: S.w * (c.land ? 0.5 : 1), h: S.h * (c.land ? 0.9 : 0.4) } : { x: S.x, y: S.y + S.h * 0.22, w: S.w * (c.land ? 0.5 : 1), h: S.h * 0.4 };
    const big = fitText(
      c,
      c.k.text(c.x, 'label', key, figBox, {
        name: 'Key figure (set from the words)',
        decorative: true,
        color: c.pal.accent,
        lineHeight: 0.86,
        align: 'left',
        font: c.x.dir.tokens.fonts.display,
        weight: Math.max(600, c.x.dir.look.weight),
        tracking: -10,
      } as never),
      c.u * 60,
    );
    big.h = Math.min(figBox.h, setHeight(c, big) + c.u);
    c.out.push(big);
    c.rel('hierarchy', 'figure', 'headline', { priority: 'soft' });
    const rest = c.land ? { x: S.x + S.w * 0.54, y: S.y, w: S.w * 0.46, h: S.h } : at === 'top' ? { x: S.x, y: big.y + big.h + c.u * 3, w: S.w, h: S.y + S.h - (big.y + big.h + c.u * 3) } : { x: S.x, y: S.y, w: S.w, h: S.h };
    const t = headline(c, at === 'top' || c.land ? { ...rest, h: rest.h * 0.42 } : { x: S.x, y: S.y, w: S.w, h: S.h * 0.2 }, { align: 'left' });
    c.out.push(t);
    // each fact labelled under a rule, as data is
    let y = c.land || at === 'top' ? t.y + t.h + c.u * 4 : big.y + big.h + c.u * 4;
    const x0 = c.land ? rest.x : S.x;
    const w = c.land ? rest.w : S.w * 0.7;
    for (const f of facts(c)) {
      if (y > S.y + S.h - c.u * 6) break;
      c.out.push(line(c, x0, y, x0 + w, y, c.pal.ink, Math.max(0.6, c.u * 0.2), { name: 'Rule' }));
      const l = label(c, f.role, f.text, { x: x0, y: y + c.u * 1.2, w, h: c.u * 6 });
      c.out.push(l);
      y = l.y + l.h + c.u * 2.5;
    }
    c.out.push(...brandAt(c, 'br'));
    c.rel('align', 'details', 'headline', { at: 'tl' });
  },

  timeline: (c) => {
    const vertical = c.s('orient') === 'vertical' && !c.land;
    const axis = c.n('axis');
    const S = c.safe;
    const list = facts(c);
    if (vertical) {
      const t = headline(c, { x: S.x, y: S.y, w: S.w, h: S.h * 0.3 * c.ts }, { align: 'left' });
      c.out.push(t);
      const top = t.y + t.h + c.u * 5;
      const ax = S.x + S.w * Math.min(0.4, axis);
      c.out.push(line(c, ax, top, ax, S.y + S.h - c.u * 2, c.pal.ink, Math.max(1, c.u * 0.4), { name: 'Time line' }));
      const step = (S.y + S.h - top - c.u * 4) / Math.max(1, list.length);
      list.forEach((f, i) => {
        const y = top + c.u * 2 + i * step;
        c.out.push(disc(c, around(ax, y + c.u * 1.2, c.u * 2.6), c.paint(i), { name: 'Station' }));
        c.out.push(label(c, f.role, f.text, { x: ax + c.u * 4, y, w: S.x + S.w - ax - c.u * 4, h: Math.max(c.u * 5, step - c.u) }));
      });
    } else {
      const t = headline(c, { x: S.x, y: S.y, w: S.w * (c.land ? 0.6 : 1), h: S.h * (c.land ? 0.4 : 0.3) }, { align: 'left' });
      c.out.push(t);
      const ay = Math.max(t.y + t.h + c.u * 8, S.y + S.h * Math.max(0.45, axis));
      c.out.push(line(c, S.x, ay, S.x + S.w, ay, c.pal.ink, Math.max(1, c.u * 0.4), { name: 'Time line' }));
      const step = S.w / Math.max(1, list.length);
      list.forEach((f, i) => {
        const x = S.x + i * step;
        c.out.push(disc(c, around(x + c.u * 1.3, ay, c.u * 2.6), c.paint(i), { name: 'Station' }));
        c.out.push(label(c, f.role, f.text, { x, y: ay + c.u * 3, w: step - c.u * 2, h: S.y + S.h - ay - c.u * 3 }, { size: Math.max(c.k.minText(c.x), c.u * 2.2) }));
      });
    }
    c.out.push(...brandAt(c, 'tr'));
    c.rel('distribute', 'details', 'frame', { priority: 'hard' });
    c.rel('follow-path', 'details', 'figure');
  },

  diagrammatic: (c) => {
    const layout = c.s('layout');
    const S = c.safe;
    const list = facts(c).slice(0, 5);
    const [headRoom, diagram] = c.land ? splitH(S, 0.34, c.u * 4) : splitV(S, 0.26, c.u * 4);
    c.out.push(headline(c, headRoom, { align: 'left' }, { valign: c.land ? 'middle' : 'top' }));
    const n = list.length;
    const nodes: [number, number][] = [];
    if (layout === 'star') {
      const cx = diagram.x + diagram.w / 2;
      const cy = diagram.y + diagram.h / 2;
      const R = Math.min(diagram.w, diagram.h) * 0.36;
      c.out.push(figure(c, 0, around(cx, cy, R * 0.6), c.paint(0)));
      list.forEach((_, i) => nodes.push([cx + Math.cos((i / n) * Math.PI * 2 - Math.PI / 2) * R, cy + Math.sin((i / n) * Math.PI * 2 - Math.PI / 2) * R]));
      nodes.forEach(([x, y]) => c.out.push(line(c, cx, cy, x, y, c.pal.muted, Math.max(0.6, c.u * 0.2), { name: 'Connector' })));
    } else if (layout === 'tree') {
      const rootX = diagram.x + diagram.w / 2;
      const rootY = diagram.y + c.u * 4;
      c.out.push(disc(c, around(rootX, rootY, c.u * 4), c.paint(0), { name: 'Root' }));
      list.forEach((_, i) => nodes.push([diagram.x + diagram.w * ((i + 0.5) / n), diagram.y + diagram.h * (0.42 + (i % 2) * 0.28)]));
      nodes.forEach(([x, y]) => c.out.push(line(c, rootX, rootY, x, y, c.pal.muted, Math.max(0.6, c.u * 0.2), { name: 'Connector' })));
    } else {
      list.forEach((_, i) => nodes.push(c.land ? [diagram.x + diagram.w * ((i + 0.5) / n), diagram.y + diagram.h * (i % 2 ? 0.62 : 0.32)] : [diagram.x + diagram.w * (i % 2 ? 0.66 : 0.18), diagram.y + diagram.h * ((i + 0.5) / n)]));
      for (let i = 1; i < nodes.length; i++) c.out.push(line(c, nodes[i - 1][0], nodes[i - 1][1], nodes[i][0], nodes[i][1], c.pal.muted, Math.max(0.6, c.u * 0.2), { name: 'Connector' }));
    }
    list.forEach((f, i) => {
      const [x, y] = nodes[i];
      c.out.push(disc(c, around(x, y, c.u * 3), c.paint(i + 1), { name: 'Node' }));
      const w = Math.min(diagram.w * (c.land ? 1 / n : 0.42), c.u * 34);
      const lx = Math.max(S.x, Math.min(S.x + S.w - w, x - (c.land ? w / 2 : -c.u * 3)));
      c.out.push(label(c, f.role, f.text, { x: c.land ? lx : x + c.u * 3, y: y + (c.land ? c.u * 3 : -c.u * 1.5), w: c.land ? w : Math.min(w, S.x + S.w - x - c.u * 3), h: c.u * 8 }, { size: Math.max(c.k.minText(c.x), c.u * 2.2) }));
    });
    c.out.push(...brandAt(c, 'br'));
    c.rel('group', 'details', 'figure');
    c.rel('distribute', 'details', undefined, { value: n });
  },

  'data-led': (c) => {
    const S = c.safe;
    const data = c.x.brief.content.data ?? [];
    const [top, rest] = splitV(S, 0.28, c.u * 3);
    c.out.push(headline(c, top, { align: 'left' }));
    if (data.length) {
      const [chartBox, side] = c.land ? splitH(rest, 0.64, c.u * 4) : splitV(rest, 0.68, c.u * 3);
      c.out.push({
        id: newId('c'),
        type: 'chart',
        role: 'data',
        name: 'Chart',
        chart: c.s('chart') === 'dots' ? 'line' : 'bar',
        data,
        colors: [c.pal.accent, c.pal.accent2, c.pal.muted],
        values: true,
        font: c.x.dir.tokens.fonts.body,
        color: c.pal.ink,
        ...(c.x.brief.content.dataSource ? { source: c.x.brief.content.dataSource } : {}),
        ...(c.x.brief.content.dataUnit ? { unit: c.x.brief.content.dataUnit } : {}),
        ...chartBox,
        rotation: 0,
        opacity: 1,
      } as Node);
      c.out.push(...info(c, side, { align: 'left' }));
      c.rel('hierarchy', 'figure', 'details');
    } else {
      c.notes.push('no numbers');
      c.out.push(...info(c, rest, { align: 'left' }));
    }
  },

  'comparison-layout': (c) => {
    const vertical = c.s('split') === 'vertical' || c.land;
    const divider = c.s('divider');
    const S = c.safe;
    const items = c.x.brief.content.items ?? [];
    const [top, body] = splitV(S, 0.3, c.u * 3);
    c.out.push(headline(c, top, { align: 'center' }));
    const [a, b] = vertical ? splitH(body, 0.5, c.u * 6) : splitV(body, 0.5, c.u * 6);
    // two sides: the two points given, else the subtitle and the details, set against each other
    type Side = { role: 'subhead' | 'meta' | 'body'; text: string }[];
    const left: Side = items.length >= 2 ? [{ role: 'body', text: items[0] }] : c.x.brief.content.subhead ? [{ role: 'subhead', text: c.x.brief.content.subhead }] : [];
    const right: Side = items.length >= 2 ? [{ role: 'body', text: items[1] }] : c.k.metaLines(c.x).map((m) => ({ role: 'meta' as const, text: m }));
    c.out.push(rect(c, a, c.paint(0), { name: 'Side', opacity: 0.16 }), rect(c, b, c.paint(1), { name: 'Side', opacity: 0.16 }));
    const set = (box: Box, list: typeof left) => {
      let y = box.y + c.u * 3;
      for (const f of list) {
        const l = label(c, f.role, f.text, { x: box.x + c.u * 3, y, w: box.w - c.u * 6, h: c.u * 8 }, { align: 'center', size: Math.max(c.k.minText(c.x), c.u * (f.role === 'subhead' ? 3.4 : 2.8)) });
        c.out.push(l);
        y = l.y + l.h + c.u * 2;
      }
    };
    set(a, left);
    set(b, right);
    if (divider === 'rule')
      c.out.push(
        vertical ? line(c, a.x + a.w + c.u * 3, body.y, a.x + a.w + c.u * 3, body.y + body.h, c.pal.ink, Math.max(1, c.u * 0.5)) : line(c, body.x, a.y + a.h + c.u * 3, body.x + body.w, a.y + a.h + c.u * 3, c.pal.ink, Math.max(1, c.u * 0.5)),
      );
    else if (divider === 'versus') c.out.push(disc(c, around(vertical ? a.x + a.w + c.u * 3 : body.x + body.w / 2, vertical ? body.y + body.h / 2 : a.y + a.h + c.u * 3, c.u * 8), c.pal.accent, { name: 'Divide' }));
    const used = new Set([...left, ...right].map((f) => f.text));
    const restWords = [c.x.brief.content.cta ? `${c.x.brief.content.cta} →` : ''].filter((w) => w && !used.has(w));
    if (restWords.length) c.out.push(label(c, 'cta', restWords[0], placeAt(S, 'bc', S.w * 0.6, c.u * 6), { align: 'center' }));
    c.out.push(...brandAt(c, 'tr'));
    c.rel('mirror', 'details', 'frame', { priority: 'aesthetic' });
    c.rel('contrast', 'details', 'details');
  },

  'annotated-editorial': (c) => {
    const kind = c.s('figure');
    const notes = Math.round(c.n('notes'));
    const S = c.safe;
    const [headRoom, stage] = c.land ? splitH(S, 0.36, c.u * 4) : splitV(S, 0.26, c.u * 3);
    c.out.push(headline(c, headRoom, { align: 'left' }, { valign: c.land ? 'middle' : 'top' }));
    const d = Math.min(stage.w, stage.h) * 0.48;
    const cx = stage.x + stage.w * (c.land ? 0.5 : 0.5);
    const cy = stage.y + stage.h * 0.46;
    const p = kind === 'image' ? photo(c, 0, around(cx, cy, d), { mask: 'ellipse' }) : null;
    c.out.push(p ?? (kind === 'circle' ? disc(c, around(cx, cy, d), c.paint(0)) : figure(c, 0, around(cx, cy, d), c.paint(0))));
    const list = facts(c).slice(0, notes + 1);
    list.forEach((f, i) => {
      const a = -Math.PI * 0.75 + (i / Math.max(1, list.length - 1)) * Math.PI * 1.5;
      const ex = cx + Math.cos(a) * d * 0.52;
      const ey = cy + Math.sin(a) * d * 0.52;
      const right = Math.cos(a) >= 0;
      const lx = right ? Math.min(S.x + S.w - c.u * 20, cx + d * 0.7) : Math.max(S.x, cx - d * 0.7 - c.u * 26);
      const ly = Math.max(stage.y, Math.min(stage.y + stage.h - c.u * 6, cy + Math.sin(a) * d * 0.8));
      c.out.push(line(c, ex, ey, right ? lx - c.u : lx + c.u * 26, ly + c.u * 1.2, c.pal.ink, Math.max(0.6, c.u * 0.2), { name: 'Leader' }));
      c.out.push(label(c, f.role, f.text, { x: lx, y: ly, w: Math.min(c.u * 26, S.x + S.w - lx), h: c.u * 6 }, { align: right ? 'left' : 'right', size: Math.max(c.k.minText(c.x), c.u * 2.2) }));
    });
    c.out.push(...brandAt(c, 'br'));
    c.rel('surround', 'details', 'figure');
    c.rel('follow-path', 'details', 'figure', { priority: 'aesthetic' });
  },

  'technical-schematic': (c) => {
    const grid = Math.round(c.n('grid'));
    const dims = c.s('dims') === 'on';
    const block = c.s('head') === 'title-block';
    const S = c.safe;
    c.out.push(prim(c, 'grid', { cols: grid, rows: Math.round(grid * (c.H / c.W)) }, { x: 0, y: 0, w: c.W, h: c.H }, null, { name: 'Drawing grid', stroke: { color: c.pal.muted, width: Math.max(0.4, c.u * 0.08) }, opacity: 0.5 }));
    const figRoom = block ? { x: S.x, y: S.y, w: S.w * (c.land ? 0.62 : 1), h: S.h * (c.land ? 1 : 0.6) } : { x: S.x, y: S.y + S.h * 0.3, w: S.w, h: S.h * 0.5 };
    const d = Math.min(figRoom.w, figRoom.h) * 0.66;
    const cx = figRoom.x + figRoom.w / 2;
    const cy = figRoom.y + figRoom.h / 2;
    c.out.push(figure(c, 0, around(cx, cy, d), null, { stroke: { color: c.pal.ink, width: Math.max(1, c.u * 0.35) } }));
    c.out.push(line(c, cx - d * 0.62, cy, cx + d * 0.62, cy, c.pal.accent, Math.max(0.5, c.u * 0.15), { name: 'Centre line' }), line(c, cx, cy - d * 0.62, cx, cy + d * 0.62, c.pal.accent, Math.max(0.5, c.u * 0.15), { name: 'Centre line' }));
    if (dims) {
      c.out.push(prim(c, 'arrow-line', { head: 8, double: 1 }, { x: cx - d / 2, y: cy + d / 2 + c.u * 3, w: d, h: c.u * 3 }, null, { name: 'Dimension', stroke: { color: c.pal.ink, width: Math.max(0.6, c.u * 0.2) } }));
      c.out.push(prim(c, 'annotation', { kind: 1, ticks: 10 }, { x: cx + d / 2 + c.u * 3, y: cy - d / 2, w: c.u * 3, h: d }, null, { name: 'Ticks', stroke: { color: c.pal.ink, width: Math.max(0.6, c.u * 0.2) } }));
    }
    c.rel('align', 'figure', 'frame', { at: 'mc' });
    if (block) {
      const tb = c.land ? { x: S.x + S.w * 0.66, y: S.y + S.h * 0.4, w: S.w * 0.34, h: S.h * 0.6 } : { x: S.x, y: S.y + S.h * 0.64, w: S.w, h: S.h * 0.36 };
      c.out.push(rect(c, tb, null, { name: 'Title block', stroke: { color: c.pal.ink, width: Math.max(1, c.u * 0.35) } }));
      const [hb, db] = splitV({ x: tb.x + c.u * 2, y: tb.y + c.u * 2, w: tb.w - c.u * 4, h: tb.h - c.u * 4 }, 0.5, c.u * 2);
      c.out.push(line(c, tb.x, hb.y + hb.h + c.u, tb.x + tb.w, hb.y + hb.h + c.u, c.pal.ink, Math.max(0.6, c.u * 0.25)));
      c.out.push(headline(c, hb, { align: 'left' }, { valign: 'middle' }), ...info(c, db, { align: 'left', scale: 0.85 }));
      c.rel('contain', 'headline', 'frame', { priority: 'hard' });
    } else {
      c.out.push(headline(c, { x: S.x, y: S.y, w: S.w, h: S.h * 0.26 }, { align: 'left' }));
      c.out.push(...info(c, placeAt(S, 'bl', S.w * 0.7, S.h * 0.18), { align: 'left', fromFoot: true }));
    }
  },

  'sequential-narrative': (c) => {
    const panels = Math.round(c.n('panels'));
    const dir = c.s('dir');
    const S = c.safe;
    const rows = dir === 'across' || c.land ? 1 : dir === 'down' ? panels : 2;
    const cols = dir === 'across' || c.land ? panels : dir === 'down' ? 1 : 2;
    const grid = cells(S, rows, cols, c.u * 2).slice(0, panels);
    const list = facts(c);
    grid.forEach((g, i) => {
      c.out.push(rect(c, g, null, { name: 'Panel', stroke: { color: c.pal.ink, width: Math.max(1, c.u * 0.35) } }));
      c.out.push(c.k.text(c.x, 'label', String(i + 1).padStart(2, '0'), { x: g.x + c.u * 2, y: g.y + c.u * 2, w: g.w * 0.4, h: c.u * 5 }, { size: Math.max(c.k.minText(c.x), c.u * 2.6), weight: 700, color: c.pal.accent }));
      const inner = { x: g.x + c.u * 2.5, y: g.y + c.u * 8, w: g.w - c.u * 5, h: g.h - c.u * 10 };
      if (i === 0) c.out.push(headline(c, inner, { align: 'left' }));
      else {
        const f = list[i - 1];
        if (f) c.out.push(label(c, f.role, f.text, inner, { size: Math.max(c.k.minText(c.x), c.u * (f.role === 'subhead' ? 3.4 : 2.8)) }));
        else c.out.push(figure(c, i, around(inner.x + inner.w / 2, inner.y + inner.h / 2, Math.min(inner.w, inner.h) * 0.6), c.paint(i)));
      }
    });
    // what the panels could not hold goes in the last one, under its own words
    const leftover = list.slice(panels - 1);
    if (leftover.length) {
      const g = grid[grid.length - 1];
      let y = g.y + g.h * 0.55;
      for (const f of leftover) {
        const l = label(c, f.role, f.text, { x: g.x + c.u * 2.5, y, w: g.w - c.u * 5, h: c.u * 5 }, { size: Math.max(c.k.minText(c.x), c.u * 2.2) });
        c.out.push(l);
        y = l.y + l.h + c.u;
      }
    }
    c.out.push(...brandAt(c, 'br'));
    c.rel('distribute', 'details', 'frame', { value: panels, priority: 'hard' });
    c.rel('hierarchy', 'headline', 'details');
  },

  'information-dense-grid': (c) => {
    const n = Math.round(c.n('cells'));
    const fig = c.s('figure');
    const S = c.safe;
    const cols = c.land ? 4 : n >= 9 ? 3 : 2;
    const rows = Math.ceil(n / cols);
    const grid = cells(S, rows, cols, c.u * 1.4);
    const list = facts(c);
    // the headline takes the first two cells across
    const head = { x: grid[0].x, y: grid[0].y, w: grid[Math.min(1, cols - 1)].x + grid[Math.min(1, cols - 1)].w - grid[0].x, h: grid[0].h };
    c.out.push(rect(c, head, null, { name: 'Cell', stroke: { color: c.pal.ink, width: Math.max(0.6, c.u * 0.2) } }));
    c.out.push(headline(c, { x: head.x + c.u * 1.5, y: head.y + c.u * 1.5, w: head.w - c.u * 3, h: head.h - c.u * 3 }, { align: 'left' }));
    let k = 0;
    for (let i = Math.min(2, cols); i < grid.length; i++) {
      const g = grid[i];
      c.out.push(rect(c, g, null, { name: 'Cell', stroke: { color: c.pal.ink, width: Math.max(0.6, c.u * 0.2) } }));
      const f = list[k];
      if (f) {
        c.out.push(label(c, f.role, f.text, { x: g.x + c.u * 1.5, y: g.y + c.u * 1.5, w: g.w - c.u * 3, h: g.h - c.u * 3 }, { size: Math.max(c.k.minText(c.x), c.u * 2.1) }));
        k++;
      } else if (fig === 'dots') c.out.push(pattern(c, 'dots', { x: g.x + c.u, y: g.y + c.u, w: g.w - c.u * 2, h: g.h - c.u * 2 }, { scale: 0.8 }, ['accent'], 1));
      else if (fig === 'bars')
        for (let b = 0; b < 4; b++)
          c.out.push(rect(c, { x: g.x + c.u * 2 + (b * (g.w - c.u * 4)) / 4, y: g.y + g.h * (0.3 + ((b * 37 + i) % 5) / 10), w: (g.w - c.u * 4) / 4 - c.u, h: g.h * (0.6 - ((b * 37 + i) % 5) / 10) }, c.paint(b), { name: 'Mark' }));
      else c.out.push(figure(c, i, around(g.x + g.w / 2, g.y + g.h / 2, Math.min(g.w, g.h) * 0.5), c.paint(i)));
    }
    // facts the cells could not hold: kept, under the grid's last cell
    if (k < list.length) c.out.push(...info(c, placeAt(S, 'br', S.w * 0.5, S.h * 0.18), { align: 'right', fromFoot: true }));
    else c.out.push(...brandAt(c, 'br'));
    c.rel('contain', 'details', 'frame', { priority: 'hard' });
    c.rel('spacing', 'frame', undefined, { value: (c.u * 1.4) / c.W });
  },

  'presentation-oriented': (c) => {
    const side = c.s('figure');
    const rule = c.s('rule') === 'on';
    const S = c.safe;
    const [main, figRoom] = side === 'bottom' && !c.land ? splitV(S, 0.62, c.u * 4) : side === 'left' ? (splitH(S, 0.38, c.u * 5).reverse() as [Box, Box]) : splitH(S, 0.6, c.u * 5);
    const t = headline(c, { ...main, h: main.h * 0.4 }, { align: 'left' });
    c.out.push(t);
    let y = t.y + t.h + c.u * 2;
    if (rule) {
      c.out.push(line(c, main.x, y, main.x + main.w * 0.3, y, c.pal.accent, Math.max(1, c.u * 0.6), { name: 'Rule' }));
      y += c.u * 3;
    }
    for (const f of facts(c)) {
      if (y > main.y + main.h - c.u * 4) break;
      const l = label(c, f.role, f.role === 'meta' || f.role === 'body' ? `— ${f.text}` : f.text, { x: main.x, y, w: main.w, h: c.u * 6 });
      // a bullet is typography, not wording: the words checked are the brief's own (kept exact after the dash)
      if (f.role === 'meta' || f.role === 'body') l.text = f.text;
      c.out.push(l);
      y = l.y + l.h + c.u * 2;
    }
    const fb = { x: figRoom.x + figRoom.w * 0.08, y: figRoom.y + figRoom.h * 0.08, w: figRoom.w * 0.84, h: figRoom.h * 0.84 };
    const p = photo(c, 0, fb);
    c.out.push(p ?? figure(c, 0, { x: fb.x, y: fb.y, w: Math.min(fb.w, fb.h), h: Math.min(fb.w, fb.h) }, c.paint(0)));
    c.out.push(...brandAt(c, side === 'bottom' ? 'tr' : 'bl'));
    c.rel('align', 'details', 'headline', { at: 'tl', priority: 'hard' });
    c.rel('anchor', 'headline', 'safe', { at: 'tl' });
  },
};

void inkOn;
