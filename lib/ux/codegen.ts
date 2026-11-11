// lib/ux/codegen.ts — an artboard, as the HTML and CSS a developer would start from.
//
// Not a design-to-code generator: a teaching instrument. The output is
// deliberately the honest translation of what is on the artboard — flow layout
// recovered from the positions (rows become flex rows, a shape that contains
// other elements becomes a section around them), semantic elements chosen
// from each element's kind, and a comment wherever the design leaves the
// developer a decision it did not make (a field with no label, an image with
// no description). The designer can read their own design as code, and ask
// SocriaUX about any line of it.

import type { Artboard, UXElement } from './model';

export interface Generated {
  html: string;
  css: string;
  /** a complete document, for the preview frame */
  doc: string;
  /** decisions the design left open, found while translating */
  notes: string[];
}

interface Box {
  el: UXElement | null;
  x: number;
  y: number;
  w: number;
  h: number;
  children: Box[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const px = (n: number) => `${Math.max(0, Math.round(n))}px`;

const inside = (outer: UXElement, inner: UXElement) =>
  inner !== outer &&
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/** Containers: rects (and images) that wrap other elements; everything else nests into the smallest one around it. */
function buildTree(ab: Artboard): Box {
  const root: Box = { el: null, x: 0, y: 0, w: ab.w, h: ab.h, children: [] };
  const els = ab.elements.filter((e) => e.x + e.w > 0 && e.y + e.h > 0 && e.x < ab.w && e.y < ab.h);
  const boxes = new Map<string, Box>(els.map((e) => [e.id, { el: e, x: e.x, y: e.y, w: e.w, h: e.h, children: [] }]));
  for (const e of els) {
    const parents = els.filter((o) => o.kind === 'rect' && inside(o, e)).sort((a, b) => a.w * a.h - b.w * b.h);
    const parent = parents[0] ? boxes.get(parents[0].id)! : root;
    parent.children.push(boxes.get(e.id)!);
  }
  return root;
}

/** Rows: elements whose vertical extents overlap belong to one row. */
function rowsOf(children: Box[]): Box[][] {
  const sorted = [...children].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Box[][] = [];
  let bottom = -Infinity;
  for (const b of sorted) {
    const row = rows[rows.length - 1];
    if (row && b.y < bottom - 2) {
      row.push(b);
      bottom = Math.max(bottom, b.y + b.h);
    } else {
      rows.push([b]);
      bottom = b.y + b.h;
    }
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

export function generateCode(ab: Artboard): Generated {
  const css: string[] = [];
  const notes: string[] = [];
  const counts: Record<string, number> = {};
  const headings = ab.elements.filter((e) => e.kind === 'heading').sort((a, b) => b.fontSize - a.fontSize || a.y - b.y);
  const h1 = headings[0]?.id;
  const cls = (kind: string) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    return `${kind}-${counts[kind]}`;
  };

  const elementCss = (e: UXElement, c: string, containerW: number) => {
    const rules: string[] = [];
    const fullWidth = e.w >= containerW * 0.9;
    switch (e.kind) {
      case 'heading':
      case 'text':
        rules.push(`margin: 0`, fullWidth ? `max-width: 100%` : `max-width: ${px(e.w)}`);
        break;
      case 'button':
        rules.push(
          fullWidth ? `width: 100%` : `min-width: ${px(e.w)}`,
          `min-height: ${px(e.h)}`,
          `padding: 0 ${px(Math.min(24, e.h / 2))}`,
          e.variant === 'ghost' ? `background: transparent` : `background: ${e.fill}`,
          e.variant === 'secondary' ? `border: 1px solid ${e.color}` : `border: none`,
          `cursor: pointer`
        );
        break;
      case 'input':
        rules.push(`display: flex`, `flex-direction: column`, `gap: 6px`, fullWidth ? `width: 100%` : `width: ${px(e.w)}`);
        css.push(
          `.${c} input {\n  min-height: ${px(e.h)};\n  padding: 0 12px;\n  border: 1px solid #8a887f;\n  border-radius: ${px(e.radius)};\n  background: ${e.fill};\n  color: ${e.color};\n  font: inherit;\n}\n.${c} input:focus-visible {\n  outline: 2px solid #354620;\n  outline-offset: 2px;\n}`
        );
        break;
      case 'checkbox':
        rules.push(`display: flex`, `align-items: center`, `gap: 10px`, `min-height: ${px(Math.max(24, e.h))}`);
        break;
      case 'link':
        rules.push(`display: inline-flex`, `align-items: center`, `min-height: ${px(e.h)}`);
        break;
      case 'image':
        rules.push(fullWidth ? `width: 100%` : `width: ${px(e.w)}`, `aspect-ratio: ${Math.round(e.w)} / ${Math.round(e.h)}`, `background: ${e.fill}`, `object-fit: cover`);
        break;
      case 'rect':
        rules.push(fullWidth ? `width: 100%` : `width: ${px(e.w)}`, `min-height: ${px(e.h)}`, `background: ${e.fill}`, `box-sizing: border-box`);
        break;
      case 'nav':
        rules.push(`display: flex`, `align-items: center`, `gap: 24px`, `width: 100%`, `min-height: ${px(e.h)}`, `padding: 0 24px`, `box-sizing: border-box`, `background: ${e.fill}`);
        break;
    }
    if (e.kind !== 'rect' && e.kind !== 'image') rules.push(`color: ${e.kind === 'button' && e.variant !== 'primary' ? e.color : e.color}`);
    if (e.kind !== 'rect' && e.kind !== 'image') rules.push(`font-size: ${px(e.fontSize)}`, `font-weight: ${e.fontWeight}`);
    if (e.radius && e.kind !== 'input') rules.push(`border-radius: ${e.radius >= 999 ? '999px' : px(e.radius)}`);
    css.push(`.${c} {\n  ${rules.join(';\n  ')};\n}`);
  };

  const markup = (b: Box, depth: number, containerW: number): string => {
    const e = b.el!;
    const pad = '  '.repeat(depth);
    const c = cls(e.kind);
    elementCss(e, c, containerW);
    const text = esc(e.text.trim());
    switch (e.kind) {
      case 'heading':
        return `${pad}<${e.id === h1 ? 'h1' : 'h2'} class="${c}">${text}</${e.id === h1 ? 'h1' : 'h2'}>`;
      case 'text':
        return `${pad}<p class="${c}">${text}</p>`;
      case 'button':
        return `${pad}<button type="button" class="${c}">${text || 'Button'}</button>`;
      case 'link':
        return `${pad}<a class="${c}" href="#">${text || 'Link'}</a>`;
      case 'input': {
        if (!e.label.trim()) {
          notes.push(`The field “${e.text || 'input'}” has no visible label; the code gives it an aria-label, but sighted users still lose the prompt once they type.`);
          return `${pad}<!-- No visible label in the design: decide what it says. -->\n${pad}<label class="${c}">\n${pad}  <input type="text" placeholder="${esc(e.text)}" aria-label="${esc(e.text || 'Input')}">\n${pad}</label>`;
        }
        return `${pad}<label class="${c}">\n${pad}  <span>${esc(e.label)}</span>\n${pad}  <input type="text"${e.text.trim() ? ` placeholder="${esc(e.text)}"` : ''}>\n${pad}</label>`;
      }
      case 'checkbox':
        if (!e.label.trim()) notes.push('A checkbox has no label; nobody can tell what it agrees to.');
        return `${pad}<label class="${c}">\n${pad}  <input type="checkbox">\n${pad}  <span>${esc(e.label || 'Label')}</span>\n${pad}</label>`;
      case 'image':
        if (!e.text.trim() || e.text.trim().toLowerCase() === 'image') notes.push('An image has no description: decide whether it is decorative (alt="") or informative (describe it).');
        return `${pad}<div class="${c}" role="img" aria-label="${esc(e.text.trim() && e.text.trim().toLowerCase() !== 'image' ? e.text : 'Describe this image')}"></div>`;
      case 'nav': {
        const items = e.text.split(/\s*[·|•]\s*/).map((s) => s.trim()).filter(Boolean);
        return `${pad}<nav class="${c}" aria-label="Main">\n${items.map((i) => `${pad}  <a href="#">${esc(i)}</a>`).join('\n')}\n${pad}</nav>`;
      }
      case 'rect': {
        const inner = layout(b, depth + 1);
        return `${pad}<section class="${c}">\n${inner}\n${pad}</section>`;
      }
    }
    return '';
  };

  let rowCount = 0;
  const layout = (container: Box, depth: number): string => {
    const pad = '  '.repeat(depth);
    const rows = rowsOf(container.children);
    const out: string[] = [];
    let prevBottom = container.y;
    const cw = container.w;
    for (const row of rows) {
      const top = Math.min(...row.map((r) => r.y));
      const left = Math.min(...row.map((r) => r.x)) - container.x;
      const gapTop = top - prevBottom;
      prevBottom = Math.max(...row.map((r) => r.y + r.h));
      if (row.length === 1) {
        const b = row[0];
        const c = `row-${++rowCount}`;
        const wide = b.el!.kind === 'nav';
        css.push(`.${c} {\n  margin-top: ${px(gapTop)};\n  padding-left: ${px(wide ? 0 : left)};${wide ? '' : `\n  padding-right: ${px(Math.max(0, container.w - (b.x - container.x) - b.w))};`}\n}`);
        out.push(`${pad}<div class="${c}">\n${markup(b, depth + 1, wide ? cw : cw - left * 2)}\n${pad}</div>`);
      } else {
        const gaps = row.slice(1).map((b, i) => b.x - (row[i].x + row[i].w));
        const gap = Math.max(0, Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length));
        const c = `row-${++rowCount}`;
        css.push(`.${c} {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: ${px(gap)};\n  margin-top: ${px(gapTop)};\n  padding-left: ${px(left)};\n}`);
        out.push(`${pad}<div class="${c}">\n${row.map((b) => markup(b, depth + 1, b.w)).join('\n')}\n${pad}</div>`);
      }
    }
    return out.join('\n');
  };

  const tree = buildTree(ab);
  const body = layout(tree, 2);
  const screenCss = `*, *::before, *::after {\n  box-sizing: border-box;\n}\nbody {\n  margin: 0;\n  font-family: Inter, system-ui, -apple-system, sans-serif;\n  line-height: 1.45;\n}\n.screen {\n  width: 100%;\n  max-width: ${px(ab.w)};\n  min-height: ${px(ab.h)};\n  margin: 0 auto;\n  padding-bottom: 32px;\n  background: ${ab.background};\n}\nbutton:focus-visible, a:focus-visible {\n  outline: 2px solid #354620;\n  outline-offset: 2px;\n}`;
  const html = `<main class="screen">\n  <!-- ${esc(ab.name)} — generated from the artboard; spacing is in px from the design, map it to your spacing scale -->\n${body}\n</main>`;
  const cssText = [screenCss, ...css].join('\n\n');
  const doc = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(ab.name)}</title>\n<style>\n${cssText}\n</style>\n</head>\n<body>\n${html}\n</body>\n</html>`;
  return { html, css: cssText, doc, notes };
}
