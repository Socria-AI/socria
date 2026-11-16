// lib/ux-v0/selection.ts — one selection shape for both ways of selecting.
//
// An element picked in a page and a rectangle drawn over a page or an image
// both become a SelectionContext: what it is, where it sits, what it contains,
// and what can be measured about it. The reasoning engine reads only this, so
// it never needs to know how the selection was made.
//
// MEASURED, NOT JUDGED. Contrast against the colour actually behind the text,
// the size of a target, the size of type, line length, labels and link text
// are computed here from the browser's own computed styles, and passed to the
// model as facts. The critique gate (lib/ux-v0/critique.ts) holds the model to
// them: an issue it raises must cite one of these, or something in the
// selection itself.

import { contrastRatio, isLargeText } from '../ux/audit';
import { fitSelection, uid, type Box, type ElementCapture, type Measured, type SelectionContext, type Viewport } from './types';

// ── colour ───────────────────────────────────────────────────────────

const NAMED: Record<string, string> = { white: '#ffffff', black: '#000000' };

/** A CSS colour as the browser computes it (rgb/rgba/#hex) → #rrggbb, or null when unknown or translucent. */
export function cssHex(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  const h = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (h) return h[1].length === 3 ? `#${h[1][0]}${h[1][0]}${h[1][1]}${h[1][1]}${h[1][2]}${h[1][2]}` : `#${h[1]}`;
  const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (alpha < 0.85) return null;
  return `#${[m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, Math.round(parseFloat(x)))).toString(16).padStart(2, '0')).join('')}`;
}

const px = (v: string | undefined): number => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
};

// ── naming ───────────────────────────────────────────────────────────

const ROLE_WORD: Record<string, string> = {
  button: 'Button',
  link: 'Link',
  heading: 'Heading',
  img: 'Image',
  textbox: 'Field',
  combobox: 'Menu',
  checkbox: 'Checkbox',
  radio: 'Option',
  navigation: 'Navigation',
  banner: 'Header',
  contentinfo: 'Footer',
  main: 'Main content',
  form: 'Form',
  list: 'List',
  listitem: 'List item',
  table: 'Table',
  region: 'Section',
  article: 'Article',
  complementary: 'Aside',
  paragraph: 'Paragraph',
  figure: 'Figure',
  label: 'Label',
};

const TAG_WORD: Record<string, string> = { section: 'Section', div: 'Block', span: 'Text', p: 'Paragraph', header: 'Header', footer: 'Footer', ul: 'List', li: 'List item', svg: 'Graphic' };

/** "Button “Book a table”", "Heading “Our menu”", "Section “Visit us”". */
export function labelFor(c: ElementCapture): string {
  const word = ROLE_WORD[c.role] ?? TAG_WORD[c.tag] ?? (c.tag ? c.tag.toUpperCase() : 'Element');
  const words = (c.name || c.text).replace(/\s+/g, ' ').trim();
  const quote = words ? ` “${words.length > 40 ? `${words.slice(0, 39)}…` : words}”` : '';
  return `${word}${quote}`;
}

// ── facts ────────────────────────────────────────────────────────────

const GENERIC_LINKS = /^(click here|here|read more|learn more|more|link|this|go|details)$/i;

/** What can be measured about one element. */
export function factsFor(c: ElementCapture, viewport: Viewport | null): Measured[] {
  const out: Measured[] = [];
  const size = px(c.styles['font-size']);
  const weight = px(c.styles['font-weight']) || 400;
  const text = (c.text || '').trim();
  const fg = cssHex(c.styles.color);
  const bg = c.background === 'image' ? null : cssHex(c.background);

  if (text && fg) {
    if (bg) {
      const ratio = contrastRatio(fg, bg);
      const need = isLargeText({ fontSize: size, fontWeight: weight }) ? 3 : 4.5;
      out.push({ id: 'contrast', label: 'Text contrast', value: `${ratio.toFixed(2)}:1 (${fg} on ${bg}; needs ${need}:1)`, ok: ratio >= need, principle: 'WCAG 1.4.3 Contrast' });
    } else if (c.background === 'image') {
      out.push({ id: 'contrast', label: 'Text contrast', value: 'text over an image: contrast varies across it', ok: false, principle: 'WCAG 1.4.3 Contrast' });
    }
  }
  if (c.interactive) {
    const min = Math.min(c.box.w, c.box.h);
    const touch = viewport === 'mobile' ? 44 : 24;
    out.push({ id: 'target', label: 'Target size', value: `${Math.round(c.box.w)}×${Math.round(c.box.h)}px (smallest side ${Math.round(min)}px; ${touch}px wanted${viewport === 'mobile' ? ' on touch' : ''})`, ok: min >= touch, principle: viewport === 'mobile' ? "Fitts's law · touch targets" : 'WCAG 2.5.8 Target Size' });
  }
  if (text && size) {
    const bodyMin = viewport === 'mobile' && c.tag === 'p' ? 16 : 12;
    out.push({ id: 'type-size', label: 'Type size', value: `${size}px, weight ${weight}`, ok: size >= bodyMin, principle: 'Legibility' });
    if (text.length > 120 && c.box.w > 0) {
      const perLine = Math.round(c.box.w / (size * 0.5));
      out.push({ id: 'measure', label: 'Line length', value: `about ${perLine} characters a line`, ok: perLine <= 90, principle: 'Readable measure (45–75 characters)' });
      const lh = px(c.styles['line-height']);
      if (lh) out.push({ id: 'leading', label: 'Line height', value: `${(lh / size).toFixed(2)} × the type size`, ok: lh / size >= 1.3, principle: 'Readable leading' });
    }
  }
  if (c.tag === 'img') out.push({ id: 'alt', label: 'Text alternative', value: c.attrs.alt === undefined ? 'no alt attribute' : c.attrs.alt ? `alt “${c.attrs.alt.slice(0, 60)}”` : 'alt="" (decorative)', ok: c.attrs.alt !== undefined, principle: 'WCAG 1.1.1 Non-text content' });
  if (/^(textbox|combobox|checkbox|radio)$/.test(c.role) && !c.name) out.push({ id: 'label', label: 'Field label', value: 'no accessible name', ok: false, principle: 'WCAG 3.3.2 Labels' });
  if (c.role === 'textbox' && c.name && c.attrs.placeholder && c.name === c.attrs.placeholder.trim()) out.push({ id: 'label', label: 'Field label', value: 'named only by its placeholder', ok: false, principle: 'WCAG 3.3.2 Labels' });
  if (c.role === 'link' && GENERIC_LINKS.test(text)) out.push({ id: 'link-text', label: 'Link text', value: `“${text}” says nothing on its own`, ok: false, principle: 'WCAG 2.4.4 Link purpose' });
  return out.slice(0, 8);
}

/** What can be measured about a region's elements, taken together. */
export function regionFacts(els: ElementCapture[], viewport: Viewport | null): Measured[] {
  if (!els.length) return [];
  const out: Measured[] = [];
  const interactive = els.filter((e) => e.interactive).length;
  const sizes = [...new Set(els.map((e) => Math.round(px(e.styles['font-size']))).filter(Boolean))].sort((a, b) => b - a);
  const colors = [...new Set(els.map((e) => cssHex(e.styles.color)).filter(Boolean))];
  out.push({ id: 'density', label: 'Interactive elements', value: `${interactive} of ${els.length} selected`, ok: interactive <= (viewport === 'mobile' ? 4 : 7), principle: "Hick's law · cognitive load" });
  if (sizes.length) out.push({ id: 'type-steps', label: 'Type sizes', value: `${sizes.length} (${sizes.slice(0, 6).join(', ')}px)`, ok: sizes.length <= 4, principle: 'Typographic hierarchy' });
  if (colors.length) out.push({ id: 'colours', label: 'Text colours', value: `${colors.length} (${colors.slice(0, 5).join(', ')})`, ok: colors.length <= 4, principle: 'Consistency' });
  let worst: { ratio: number; label: string } | null = null;
  for (const e of els) {
    const fg = cssHex(e.styles.color);
    const bg = e.background === 'image' ? null : cssHex(e.background);
    if (!fg || !bg || !(e.text || '').trim()) continue;
    const ratio = contrastRatio(fg, bg);
    if (!worst || ratio < worst.ratio) worst = { ratio, label: labelFor(e) };
  }
  if (worst) out.push({ id: 'contrast-min', label: 'Lowest text contrast', value: `${worst.ratio.toFixed(2)}:1 on ${worst.label}`, ok: worst.ratio >= 4.5, principle: 'WCAG 1.4.3 Contrast' });
  const smallest = sizes[sizes.length - 1];
  if (smallest) out.push({ id: 'type-min', label: 'Smallest type', value: `${smallest}px`, ok: smallest >= 12, principle: 'Legibility' });
  const overlaps = overlappingTargets(els);
  if (overlaps !== null) out.push({ id: 'overlap', label: 'Overlapping targets', value: overlaps ? `${overlaps} pair${overlaps === 1 ? '' : 's'} drawn over one another` : 'None', ok: overlaps === 0, principle: 'WCAG 2.5.8 Target Size · Fitts’s law' });
  return out;
}

/**
 * Interactive elements whose boxes cross: a press meant for one can land on
 * the other. One nested inside another (a link inside a card) is not a
 * crossing. Null when there are fewer than two targets to compare.
 */
export function overlappingTargets(els: ElementCapture[]): number | null {
  const t = els.filter((e) => e.interactive && e.box.w > 0 && e.box.h > 0).map((e) => e.box);
  if (t.length < 2) return null;
  const within = (a: Box, b: Box) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      const a = t[i];
      const b = t[j];
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 1 && iy > 1 && !within(a, b) && !within(b, a)) n++;
    }
  }
  return n;
}

// ── building selections ──────────────────────────────────────────────

export function elementSelection(c: ElementCapture, artifactId: string, viewport: Viewport | null, now = Date.now()): SelectionContext {
  const where = [c.section, c.parent].filter(Boolean).join(' · ');
  return fitSelection({
    id: uid('sel'),
    type: 'element',
    artifactId,
    viewport,
    element: c,
    region: null,
    crop: null,
    surrounding: where ? `Inside ${where}.` : '',
    measured: factsFor(c, viewport),
    label: labelFor(c),
    createdAt: now,
  });
}

export function regionSelection(
  box: Box,
  found: { elements: ElementCapture[]; container: string } | null,
  crop: { dataUrl: string; box: Box } | null,
  artifactId: string,
  viewport: Viewport | null,
  now = Date.now()
): SelectionContext {
  const els = found?.elements ?? [];
  const label = `Area ${Math.round(box.w)} × ${Math.round(box.h)}${els.length ? ` · ${els.length} element${els.length === 1 ? '' : 's'}` : ''}`;
  return fitSelection({
    id: uid('sel'),
    type: 'region',
    artifactId,
    viewport,
    element: null,
    region: { box, elements: els, container: found?.container ?? '' },
    crop,
    surrounding: found?.container ? `Within ${found.container}.` : `At ${Math.round(box.x)}, ${Math.round(box.y)} in the image.`,
    measured: regionFacts(els, viewport),
    label,
    createdAt: now,
  });
}

/** A rectangle from two points, in whatever space they share; null when it is too small to mean anything. */
export function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }, min = 6): Box | null {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  if (w < min || h < min) return null;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Clamp a rectangle to the artifact's bounds. */
export function clampBox(b: Box, width: number, height: number): Box | null {
  const x = Math.max(0, Math.min(width, b.x));
  const y = Math.max(0, Math.min(height, b.y));
  const w = Math.max(0, Math.min(width, b.x + b.w) - x);
  const h = Math.max(0, Math.min(height, b.y + b.h) - y);
  return w >= 4 && h >= 4 ? { x, y, w, h } : null;
}

/** The size to draw a crop at: its natural size, at most `max` on the long side. */
export function cropSize(b: Box, max = 1024): { w: number; h: number; scale: number } {
  const long = Math.max(b.w, b.h);
  const scale = long > max ? max / long : 1;
  return { w: Math.max(1, Math.round(b.w * scale)), h: Math.max(1, Math.round(b.h * scale)), scale };
}

/** All the text the critique gate may accept as evidence, lower-cased. */
export function evidenceText(sel: SelectionContext, extra = ''): string {
  const parts: string[] = [sel.label, sel.surrounding, extra];
  const add = (c: ElementCapture) => {
    parts.push(c.tag, c.role, c.name, c.text, c.path, c.section, c.parent, c.background, ...Object.values(c.attrs), ...Object.entries(c.styles).map(([k, v]) => `${k}: ${v} ${v}`));
    parts.push(`${Math.round(c.box.w)}×${Math.round(c.box.h)}`, `${Math.round(c.box.w)}x${Math.round(c.box.h)}`, `${Math.round(c.box.w)} × ${Math.round(c.box.h)}`);
    const hx = cssHex(c.styles.color);
    const bg = cssHex(c.background);
    if (hx) parts.push(hx);
    if (bg) parts.push(bg);
  };
  if (sel.element) add(sel.element);
  for (const e of sel.region?.elements ?? []) add(e);
  for (const m of sel.measured) parts.push(m.label, m.value);
  return parts.join(' \n ').toLowerCase().replace(/\s+/g, ' ');
}
