// lib/ux-v0/assets.ts — pictures SocriaUX makes for a design: procedural art, in the design's own colours.
//
// A design should not depend on stock photographs and gradients for its visual vocabulary. Where a part of the
// page needs a picture and the designer has none to give it, SocriaUX can make one, in code, from the design
// itself: its palette, its direction, a seed. Each kind is a real drawing (SVG), not a placeholder:
//
//   field     an abstract composition of planes and arcs, set on a grid       (posters, statements, openings)
//   contour   topographic line work around one or two centres               (landscape, architecture, research)
//   lattice   a field of marks on a grid, a few set apart                     (systems, data, structure)
//   orbit     orbits and bodies, drawn as a diagram                           (science, astronomy, precision)
//   grain     a ground with grain and a pool of light                         (texture behind type, mood)
//   render    an object shaded as a product shot: a vessel or a bottle        (a product with no photograph yet)
//   form      a composition of the design's own shapes (lib/ux-v0/form.ts): a mass, its echoes, a cut, an outline
//   pattern   a repeat of the design's own figures, set as regularly or as loosely as its system is ordered
//
// The same seed draws the same picture, so a project stores only the recipe (kind, seed, ratio, palette) and
// the picture is drawn wherever it is shown. Each one is a moodboard reference of provider "socriaux": kept,
// usable as content, with its provenance (made by SocriaUX for this project, no third-party rights) and the
// reason it exists — a picture is made because a part asked for one, never to fill space.
//
// Photographic generation by an image model is a separate, server-side pathway (lib/ux-v0/image-gen-server.ts),
// off unless it is configured and paid for: nothing here calls a model.

import { figureFor, normalizeForm, deriveForm, type FormSystem } from './form';
import { shapeRings, smoothShape, svgPath } from './shape';

export const PROC_KINDS = ['field', 'contour', 'lattice', 'orbit', 'grain', 'render', 'form', 'pattern'] as const;
export type ProcKind = (typeof PROC_KINDS)[number];
export const PROC_RATIOS = ['1:1', '4:3', '3:4', '3:2', '16:9'] as const;
export type ProcRatio = (typeof PROC_RATIOS)[number];

export const PROC_LABEL: Record<ProcKind, string> = { field: 'Abstract field', contour: 'Contour lines', lattice: 'Lattice', orbit: 'Orbits', grain: 'Grain and light', render: 'Object render', form: 'Its own shapes', pattern: 'A pattern of its shapes' };
export const PROC_SAYS: Record<ProcKind, string> = {
  field: 'planes and arcs set on a grid',
  contour: 'topographic line work',
  lattice: 'a field of marks on a grid',
  orbit: 'orbits and bodies drawn as a diagram',
  grain: 'a ground with grain and a pool of light',
  render: 'an object shaded as a product shot',
  form: 'a composition of the design’s own shapes',
  pattern: 'a repeat of the design’s own figures',
};

export interface ProcSpec {
  kind: ProcKind;
  seed: number;
  ratio: ProcRatio;
  /** the design's colours: ground, ink, accent, and optionally a second ink and a muted tone */
  palette: string[];
  /** the design's shape system, for the kinds drawn in its own shapes (form, pattern) */
  form?: FormSystem;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function normalizeProc(v: unknown): ProcSpec | null {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  if (!r) return null;
  const kind = (PROC_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as ProcKind) : null;
  const palette = (Array.isArray(r.palette) ? r.palette : []).filter((x): x is string => typeof x === 'string' && HEX.test(x)).slice(0, 5);
  if (!kind || palette.length < 2) return null;
  return {
    kind,
    seed: typeof r.seed === 'number' && Number.isFinite(r.seed) ? Math.abs(Math.round(r.seed)) % 2147483647 : 1,
    ratio: (PROC_RATIOS as readonly string[]).includes(r.ratio as string) ? (r.ratio as ProcRatio) : '4:3',
    palette,
    ...((f) => (f && (kind === 'form' || kind === 'pattern') ? { form: f } : {}))(normalizeForm(r.form)),
  };
}

function rng(seed: number) {
  let a = (seed || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function size(ratio: ProcRatio): [number, number] {
  const [a, b] = ratio.split(':').map(Number);
  const W = 1200;
  return [W, Math.round((W * b) / a)];
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** The picture itself, as SVG. Deterministic: the same recipe draws the same picture. */
export function proceduralSvg(p: ProcSpec): string {
  const [W, H] = size(p.ratio);
  const R = rng(p.seed);
  const [ground, ink, accent = ink, second = accent, muted = ink] = p.palette;
  const parts: string[] = [];
  const defs: string[] = [];
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(R() * xs.length)];
  if (p.kind === 'field') {
    // a 12-column grid; three to five planes and arcs placed on it, one of them the accent
    const col = W / 12;
    const row = H / 8;
    const n = 3 + Math.floor(R() * 3);
    const inks = [ink, accent, second, muted];
    for (let i = 0; i < n; i++) {
      const x = Math.floor(R() * 9) * col;
      const y = Math.floor(R() * 6) * row;
      const w = (2 + Math.floor(R() * 6)) * col;
      const h = (2 + Math.floor(R() * 5)) * row;
      const fill = i === 0 ? accent : inks[Math.floor(R() * inks.length)];
      const kind = pick(['rect', 'circle', 'arc', 'rect']);
      if (kind === 'rect') parts.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"/>`);
      else if (kind === 'circle') parts.push(`<circle cx="${f1(x + w / 2)}" cy="${f1(y + h / 2)}" r="${f1(Math.min(w, h) / 2)}" fill="${fill}"/>`);
      else parts.push(`<path d="M${f1(x)} ${f1(y + h)}A${f1(w)} ${f1(h)} 0 0 1 ${f1(x + w)} ${f1(y)}V${f1(y + h)}Z" fill="${fill}"/>`);
    }
    parts.push(`<line x1="${f1(col)}" x2="${f1(W - col)}" y1="${f1(H - row * 0.6)}" y2="${f1(H - row * 0.6)}" stroke="${ink}" stroke-width="2"/>`);
  } else if (p.kind === 'contour') {
    // rings around one or two centres, each displaced by a few harmonics: a landscape read from above
    const centres = Array.from({ length: R() < 0.5 ? 1 : 2 }, () => [W * (0.25 + R() * 0.5), H * (0.3 + R() * 0.4)]);
    const harm = Array.from({ length: 4 }, (_, k) => ({ a: (R() * 0.18) / (k + 1), f: k + 2, ph: R() * Math.PI * 2 }));
    const rings = 16 + Math.floor(R() * 8);
    const maxR = Math.hypot(W, H) * 0.55;
    centres.forEach(([cx, cy], ci) => {
      for (let i = 1; i <= rings; i++) {
        const r = (maxR * i) / rings;
        const pts: string[] = [];
        // 72 points a ring, at whole units of a 1200-wide drawing: as smooth to the eye, a third lighter to send
        for (let k = 0; k <= 72; k++) {
          const t = (k / 72) * Math.PI * 2;
          const d = 1 + harm.reduce((s, h) => s + h.a * Math.sin(h.f * t + h.ph + i * 0.08 + ci), 0);
          pts.push(`${Math.round(cx + Math.cos(t) * r * d)},${Math.round(cy + Math.sin(t) * r * d * 0.82)}`);
        }
        const accentRing = ci === 0 && i === Math.floor(rings / 3);
        parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${accentRing ? accent : ink}" stroke-width="${accentRing ? 3 : 1.2}" opacity="${accentRing ? 1 : 0.7}"/>`);
      }
    });
  } else if (p.kind === 'lattice') {
    const step = 48 + Math.floor(R() * 4) * 12;
    const mark = pick(['dot', 'cross', 'dash']);
    const cx = W * (0.2 + R() * 0.6);
    const cy = H * (0.2 + R() * 0.6);
    const radius = Math.min(W, H) * (0.12 + R() * 0.1);
    for (let y = step; y < H; y += step)
      for (let x = step; x < W; x += step) {
        if (R() < 0.08) continue;
        const near = Math.hypot(x - cx, y - cy) < radius;
        const c = near ? accent : ink;
        if (mark === 'dot') parts.push(`<circle cx="${x}" cy="${y}" r="${near ? 6 : 3}" fill="${c}"/>`);
        else if (mark === 'cross') parts.push(`<path d="M${x - 6} ${y}H${x + 6}M${x} ${y - 6}V${y + 6}" stroke="${c}" stroke-width="${near ? 3 : 1.5}"/>`);
        else parts.push(`<path d="M${x - 9} ${y}H${x + 9}" stroke="${c}" stroke-width="${near ? 4 : 2}"/>`);
      }
  } else if (p.kind === 'orbit') {
    const cx = W * (0.35 + R() * 0.3);
    const cy = H / 2;
    const n = 5 + Math.floor(R() * 4);
    const maxR = Math.min(W, H) * 0.46;
    for (let i = 1; i <= n; i++) {
      const r = (maxR * i) / n;
      const tilt = 0.32 + R() * 0.2;
      parts.push(`<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(r)}" ry="${f1(r * tilt)}" fill="none" stroke="${ink}" stroke-width="1.2" opacity=".75"/>`);
      const t = R() * Math.PI * 2;
      const body = i === Math.ceil(n / 2);
      parts.push(`<circle cx="${f1(cx + Math.cos(t) * r)}" cy="${f1(cy + Math.sin(t) * r * tilt)}" r="${body ? 14 : 5}" fill="${body ? accent : ink}"/>`);
    }
    parts.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(maxR * 0.09)}" fill="${accent}"/>`);
  } else if (p.kind === 'grain') {
    defs.push(`<filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="${p.seed % 997}" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0"/></filter><filter id="b"><feGaussianBlur stdDeviation="${f1(Math.min(W, H) * 0.12)}"/></filter>`);
    parts.push(`<circle cx="${f1(W * (0.3 + R() * 0.4))}" cy="${f1(H * (0.3 + R() * 0.4))}" r="${f1(Math.min(W, H) * 0.32)}" fill="${accent}" opacity=".55" filter="url(#b)"/>`);
    parts.push(`<rect width="${W}" height="${H}" filter="url(#g)" opacity=".42"/>`);
  } else if (p.kind === 'form' || p.kind === 'pattern') {
    // the design's own shapes (lib/ux-v0/form.ts); a recipe without a system takes a neutral one of its seed
    const f = p.form ?? deriveForm({ seed: p.seed }).form;
    const inks = [accent, ink, second, muted];
    const place = (d: string, x: number, y: number, w: number, h: number, fill: string, extra = '') => `<path transform="translate(${f1(x)} ${f1(y)}) scale(${f1(w / 100)} ${f1(h / 100)})" d="${d}" fill="${fill}" fill-rule="evenodd"${extra}/>`;
    if (p.kind === 'form') {
      // a mass, set off-centre; its echoes behind and beside it; a cut of the ground across its edge; one outline
      const m = figureFor(f, 'mass', p.seed % 97, 'art');
      const mw = W * (0.42 + R() * 0.22);
      const mh = H * (0.5 + R() * 0.3);
      const mx = W * (0.08 + R() * (0.9 - 0.42 - 0.08));
      const my = H * (0.1 + R() * 0.25);
      const depth = Math.max(1, Math.round(f.depth / 34));
      for (let i = depth; i >= 1; i--) {
        const e = figureFor(f, 'echo', p.seed % 89 + i, 'art');
        const k = 0.45 + R() * 0.35;
        parts.push(place(svgPath(shapeRings(e), smoothShape(e)), mx + (R() - 0.3) * mw * 0.9, my + (R() - 0.3) * mh * 0.8, mw * k, mh * k, inks[(i + 1) % inks.length], ' opacity=".92"'));
      }
      parts.push(place(svgPath(shapeRings(m), smoothShape(m)), mx, my, mw, mh, accent));
      const c = figureFor(f, 'cut', p.seed % 83, 'art');
      parts.push(place(svgPath(shapeRings(c), smoothShape(c)), mx + mw * (0.55 + R() * 0.3), my + mh * (0.1 + R() * 0.5), mw * 0.36, mh * 0.36, ground));
      const o = figureFor(f, 'echo', p.seed % 71 + 7, 'art');
      parts.push(place(svgPath(shapeRings(o), smoothShape(o)), W * (0.05 + R() * 0.55), H * (0.08 + R() * 0.5), W * 0.38, H * 0.42, 'none', ` stroke="${ink}" stroke-width="2" vector-effect="non-scaling-stroke"`));
    } else {
      // a repeat: as many cells as the system is dense, set on a grid as regular as it is ordered, turned as it is kinetic
      const cols = 5 + Math.round((f.energy / 100) * 4);
      const rows = Math.max(3, Math.round((cols * H) / W));
      const cw = W / cols;
      const ch = H / rows;
      const jitter = (100 - f.order) / 100;
      for (let r0 = 0; r0 < rows; r0++)
        for (let c0 = 0; c0 < cols; c0++) {
          const k = r0 * cols + c0;
          const e = figureFor(f, k % 3 === 0 ? 'mass' : 'echo', k % 7, 'pattern');
          const s = 0.62 + (R() - 0.5) * jitter * 0.5;
          const x = c0 * cw + cw * (1 - s) / 2 + (R() - 0.5) * jitter * cw * 0.35;
          const y = r0 * ch + ch * (1 - s) / 2 + (R() - 0.5) * jitter * ch * 0.35;
          const turn = ((R() - 0.5) * f.energy * 1.2).toFixed(0);
          parts.push(`<g transform="rotate(${turn} ${f1(x + (cw * s) / 2)} ${f1(y + (ch * s) / 2)})">${place(svgPath(shapeRings(e), smoothShape(e)), x, y, cw * s, ch * s, (r0 + c0) % 4 === 0 ? accent : inks[1 + ((r0 * 3 + c0) % 3)])}</g>`);
        }
    }
  } else {
    // render: a turned object, lit from the left, on a shadow
    const vessel = R() < 0.5;
    const prof: [number, number][] = vessel
      ? [[0, -1], [0.5, -1], [0.6, -0.9], [0.7, -0.45], [0.68, 0.05], [0.5, 0.48], [0.3, 0.74], [0.27, 0.92], [0.33, 1]]
      : [[0, -1.05], [0.42, -1.05], [0.46, -0.98], [0.47, 0.25], [0.4, 0.45], [0.17, 0.62], [0.15, 0.95], [0.18, 1.05], [0, 1.05]];
    const cx = W / 2;
    const cy = H * 0.52;
    const k = H * 0.36;
    const right = prof.map(([r, y]) => `${f1(cx + r * k)},${f1(cy - y * k)}`);
    const left = [...prof].reverse().map(([r, y]) => `${f1(cx - r * k)},${f1(cy - y * k)}`);
    defs.push(`<linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient><filter id="sh"><feGaussianBlur stdDeviation="${f1(k * 0.08)}"/></filter>`);
    parts.push(`<ellipse cx="${f1(cx)}" cy="${f1(cy + k * 1.04)}" rx="${f1(k * 0.75)}" ry="${f1(k * 0.09)}" fill="${ink}" opacity=".28" filter="url(#sh)"/>`);
    parts.push(`<polygon points="${[...right, ...left].join(' ')}" fill="${accent}"/><polygon points="${[...right, ...left].join(' ')}" fill="url(#s)"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}<rect width="${W}" height="${H}" fill="${ground}"/>${parts.join('')}</svg>`;
}

/** The characters a data: URI cannot carry as they are. */
const URI_UNSAFE = /[\r\n%#()<>?[\\\]^`{|}]/g;

/**
 * The picture as an address a page can show (a data: URI, which the sandbox allows for pictures), escaped only
 * where a URI must be — not every comma and space of its line work — so a page carrying several weighs a quarter
 * less. Double quotes become single ones, which the drawing's attributes read the same.
 */
export function proceduralUri(p: ProcSpec): string {
  const svg = proceduralSvg(p).replace(/"/g, "'").replace(URI_UNSAFE, (c) => encodeURIComponent(c));
  return 'data:image/svg+xml;charset=utf-8,' + svg;
}

/** A recipe's stable id: the same recipe is the same picture, so it is stored once. */
export function procId(p: ProcSpec): string {
  let h = 0x811c9dc5;
  for (const ch of `${p.kind}|${p.seed}|${p.ratio}|${p.palette.join(',')}${p.form ? `|${JSON.stringify(p.form)}` : ''}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${p.kind}-${h.toString(36)}`;
}

/** A made picture as a moodboard reference: kept, usable as content, with its provenance and its reason. */
export function procRef(p: ProcSpec, reason: string, title = ''): Record<string, unknown> {
  const [W, H] = size(p.ratio);
  return {
    provider: 'socriaux',
    providerId: procId(p),
    proc: p,
    url: '',
    thumb: '',
    width: W,
    height: H,
    color: p.palette[2] ?? p.palette[1],
    title: title || PROC_LABEL[p.kind],
    creator: 'SocriaUX',
    creatorUrl: '',
    sourceUrl: '',
    license: 'Made by SocriaUX for this project (no third-party rights)',
    licenseUrl: '',
    attribution: 'Made by SocriaUX for this project',
    downloadPing: '',
    category: 'imagery',
    query: '',
    state: 'kept',
    asContent: true,
    reason: reason.slice(0, 200),
    addedAt: Date.now(),
  };
}

/** The ratio a part's picture is drawn at: what that layout shows. */
export function ratioFor(kind: string, variant: string): ProcRatio {
  if (kind === 'hero') return variant === 'full-bleed' || variant === 'poster' ? '16:9' : variant === 'split' ? '4:3' : '3:2';
  if (kind === 'gallery') return variant === 'strip' ? '3:4' : '1:1';
  if (kind === 'quote') return '1:1';
  if (kind === 'configurator') return '1:1';
  return '4:3';
}

/** The design's colours, as a made picture uses them: ground, ink, accent, second ink, muted. */
export function paletteOf(tokens: { colors: { background: string; text: string; accent: string; muted: string } }, accent2 = ''): string[] {
  const c = tokens.colors;
  return [c.background, c.text, c.accent, HEX.test(accent2) ? accent2 : c.accent, c.muted].filter((x) => HEX.test(x));
}
