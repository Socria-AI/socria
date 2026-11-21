// lib/ux-v0/graphics/logo/identity.ts — a brand identity built from an approved logo, never before: the primary and
// secondary marks, a palette with roles and the contrast each pairing holds, a type system (the wordmark's face or, for
// drawn lettering, a licensed face of the same character, and a reading face), a motif and a pattern taken from the
// mark's own geometry, an icon style (the mark's stroke and corners on a 24 px grid), an imagery direction, and the
// guidelines (clear space, smallest sizes, what not to do). It comes out as an identity sheet the editor can change,
// and as a Master Design System a Board composes its materials with, each material its own composition.

import { contrastRatio } from '../../../ux/audit';
import { mix } from '../../color';
import type { MasterDesignSystem } from '../../boards/system';
import type { Artboard, GroupNode, Node, PatternNode, ShapeNode, TextNode } from '../doc';
import { patternDefaults } from '../patterns';
import { hash32 } from '../styles/hash';
import type { LogoBrief } from './brief';
import { coloursFor, fitLockup, initialMark, smallMark, symbolNodes } from './build';
import type { LogoConcept } from './concepts';
import { conceptRecord, type ConceptRecord } from './record';
import { circle, join as join2, line } from './geom';
import { mapPath, type BezierPath } from '../geometry';
import { asBezierNode } from '../vectorops';
import { METHODS } from './symbols';

export interface PaletteRole {
  role: 'Primary' | 'Secondary' | 'Accent' | 'Ink' | 'Paper' | 'Muted';
  hex: string;
  use: string;
  /** the colour set on it for words, and the contrast between them */
  on: string;
  contrast: number;
}
export interface BrandIdentity {
  name: string;
  conceptId: string;
  primary: LogoConcept['lockup'];
  secondary: 'symbol' | 'emblem' | 'initial';
  palette: PaletteRole[];
  type: { display: string; displayWeight: number; text: string; textWeight: number; case: 'upper' | 'lower' | 'none'; wordmark: string };
  motif: { name: string; how: string };
  pattern: { gen: string; params: Record<string, number>; how: string };
  icon: { stroke: number; corner: 'round' | 'square'; grid: number; how: string };
  imagery: string[];
  guidelines: { clear: string; min: string; donts: string[] };
  said: string[];
}

/** A licensed face with the character of drawn lettering (its weight, width and terminals). */
function faceLike(c: LogoConcept): { face: string; weight: number } {
  const st = c.wordmark.style;
  if (c.wordmark.kind === 'typeset' || !st) return { face: c.wordmark.font ?? 'Inter', weight: c.wordmark.weight ?? 500 };
  const weight = st.weight > 0.16 ? 800 : st.weight > 0.11 ? 600 : st.weight > 0.08 ? 500 : 300;
  if (st.width > 1.1) return { face: st.terminal === 'round' ? 'Unbounded' : 'Syne', weight: Math.min(weight, 800) };
  if (st.width < 0.92) return { face: st.terminal === 'round' ? 'Barlow Condensed' : 'Oswald', weight: Math.min(weight, 700) };
  return { face: st.terminal === 'round' ? 'Jost' : 'Outfit', weight };
}

const IMAGERY: Record<string, string[]> = {
  warm: ['natural light and warm shadows', 'hands at work, close and unposed', 'textures of the material itself'],
  natural: ['daylight outdoors, muted greens and earth', 'the subject in its place, wide and quiet', 'no studio gloss'],
  calm: ['soft, even light', 'generous empty space around one subject', 'cool, desaturated grading'],
  trust: ['real people and places, never stock poses', 'steady, level framing', 'honest colour'],
  playful: ['bright flat colour behind cut-out subjects', 'candid, mid-laugh moments', 'unexpected crops'],
  refined: ['low, directional light', 'one object, much space', 'deep shadow, restrained colour'],
  bold: ['hard light, strong shadows', 'subjects filling the frame', 'saturated colour against black or white'],
  precise: ['clean daylight, architectural lines', 'neutral grounds, exact alignment', 'detail in focus, nothing staged'],
  expressive: ['grain, blur and motion allowed', 'colour pushed past natural', 'collage of photograph and drawn form'],
  modern: ['bright, clean light', 'real use in real places', 'a single colour accent in each picture'],
  classic: ['window light, rich tones', 'craft and provenance in view', 'centred, considered framing'],
  dynamic: ['movement caught mid-way', 'diagonal framing', 'high contrast'],
};

/** The identity of an approved concept (see the head of this file). */
export function identityFor(c: LogoConcept, b: LogoBrief): BrandIdentity {
  const p = c.palette;
  const roles: PaletteRole[] = [
    { role: 'Primary', hex: p.primary, use: 'the mark; large areas; the reversed ground', on: p.paper, contrast: contrastRatio(p.paper, p.primary) },
    {
      role: 'Secondary',
      hex: p.secondary,
      use: 'the mark’s second ink; supporting areas',
      on: contrastRatio(p.paper, p.secondary) >= contrastRatio(p.ink, p.secondary) ? p.paper : p.ink,
      contrast: Math.max(contrastRatio(p.paper, p.secondary), contrastRatio(p.ink, p.secondary)),
    },
    {
      role: 'Accent',
      hex: p.accent,
      use: 'one point per layout: a call to action, a highlight',
      on: contrastRatio(p.ink, p.accent) >= contrastRatio(p.paper, p.accent) ? p.ink : p.paper,
      contrast: Math.max(contrastRatio(p.ink, p.accent), contrastRatio(p.paper, p.accent)),
    },
    { role: 'Ink', hex: p.ink, use: 'text, the wordmark', on: p.paper, contrast: contrastRatio(p.paper, p.ink) },
    { role: 'Paper', hex: p.paper, use: 'grounds', on: p.ink, contrast: contrastRatio(p.ink, p.paper) },
    { role: 'Muted', hex: p.muted, use: 'secondary text, rules, captions', on: p.paper, contrast: contrastRatio(p.muted, p.paper) },
  ];
  const disp = faceLike(c);
  const text =
    disp.face === 'Inter'
      ? 'Source Serif 4'
      : ['Fraunces', 'Lora', 'Cormorant Garamond', 'Libre Baskerville', 'Source Serif 4', 'Playfair Display', 'EB Garamond', 'Libre Caslon Text', 'Bodoni Moda', 'Prata', 'Gloock'].includes(disp.face)
        ? 'Inter'
        : b.personality.some((x) => ['classic', 'refined', 'warm'].includes(x))
          ? 'Source Serif 4'
          : 'Inter';
  const spec = c.method ? METHODS[c.method] : null;
  const motif = spec
    ? { name: `${spec.label} as a device`, how: `The mark’s own construction (${spec.how}) used at large scale, cropped by the edge of a layout, or one of its parts repeated: never the whole logo as decoration.` }
    : { name: 'The lettering’s stroke', how: 'The wordmark’s stroke weight and terminals used as rules and underlines; one letter enlarged and cropped as a supergraphic.' };
  const gen = spec?.geometry === 'organic' ? 'waves' : spec?.geometry === 'modular' ? 'modular' : spec?.geometry === 'typographic' ? 'symbols' : c.method === 'radial' || c.method === 'orbit' ? 'concentric' : 'dots';
  const params = patternDefaults(gen) ?? {};
  const stroke = Math.max(1.5, Math.min(3, (c.sw / 1000) * 24 * 1.4));
  const tem = b.personality.find((t) => IMAGERY[t]) ?? 'modern';
  const kind: BrandIdentity['secondary'] = c.mark ? (c.mark.parts.some((x) => x.ringText) ? 'emblem' : 'symbol') : 'initial';
  return {
    name: b.name,
    conceptId: c.id,
    primary: c.lockup === 'symbol' ? 'stacked' : c.lockup,
    secondary: kind,
    palette: roles,
    type: {
      display: disp.face,
      displayWeight: disp.weight,
      text,
      textWeight: 400,
      case: c.wordmark.case ?? 'none',
      wordmark: c.wordmark.kind === 'constructed' ? 'drawn lettering (outlines kept with the source text)' : `${c.wordmark.font} ${c.wordmark.weight}`,
    },
    motif,
    pattern: { gen, params, how: `A ${gen} pattern in the palette, its scale and rhythm taken from the mark’s ${spec ? spec.geometry : 'lettering'} construction; for grounds, packaging and backs of cards.` },
    icon: {
      stroke: Math.round(stroke * 10) / 10,
      corner: c.soft > 0.45 ? 'round' : 'square',
      grid: 24,
      how: `Icons on a 24 px grid, ${Math.round(stroke * 10) / 10} px strokes (the mark’s weight at that size), ${c.soft > 0.45 ? 'round' : 'square'} ends and joins.`,
    },
    imagery: IMAGERY[tem],
    guidelines: {
      clear: 'Clear space on every side equal to the cap height of the wordmark (for the symbol alone, a quarter of its height).',
      min: `Smallest sizes: the ${c.lockup === 'stacked' ? 'stacked' : 'horizontal'} lockup 20 px tall on screen (14 mm in print); the symbol alone 16 px (the small version below 32 px).`,
      donts: [
        'Do not stretch, skew or rotate the logo.',
        'Do not recolour it outside the palette or add gradients, shadows or outlines.',
        'Do not set the name in another face or respace its letters.',
        'Do not place it on a busy picture: use the reversed version on a calm area.',
      ],
    },
    said: [`Built from the approved concept “${c.title}”.`, `Display ${disp.face} ${disp.weight}, text ${text}: open-licence faces served by Google Fonts.`, `Every colour pairing listed with its contrast; text pairs hold at least 4.5:1.`],
  };
}

let n = 0;
const id = (k: string) => `id${(hash32(`${k}|${n++}`) >>> 0).toString(36)}`;
const txt = (name: string, text: string, x: number, y: number, w: number, h: number, o: Partial<TextNode>): TextNode => ({
  id: id(name),
  type: 'text',
  name,
  x,
  y,
  w,
  h,
  rotation: 0,
  opacity: 1,
  text,
  font: 'Inter',
  weight: 400,
  size: 16,
  lineHeight: 1.3,
  tracking: 0,
  align: 'left',
  valign: 'top',
  color: '#111111',
  ...o,
});
const box = (name: string, x: number, y: number, w: number, h: number, fill: string, o: Partial<ShapeNode> = {}): ShapeNode => ({ id: id(name), type: 'shape', name, x, y, w, h, rotation: 0, opacity: 1, shape: 'rect', fill, ...o });

/** Four sample icons in the identity's icon style (an arrow, a search, a plus, a letter), as stroked Bézier paths. */
function icons(x: number, y: number, s: number, colour: string, ident: BrandIdentity): Node[] {
  const w = (ident.icon.stroke / 24) * s;
  const cap = ident.icon.corner === 'round' ? 'round' : 'square';
  const join = ident.icon.corner === 'round' ? 'round' : 'miter';
  const k = s / 100;
  const at = (q: BezierPath, i: number) => mapPath(q, (px, py) => [x + i * s * 1.5 + px * k, y + py * k]);
  const shapes: BezierPath[] = [
    join2(
      line([
        [16, 50],
        [82, 50],
      ]),
      line([
        [60, 28],
        [82, 50],
        [60, 72],
      ]),
    ),
    join2(
      circle(44, 44, 26),
      line([
        [63, 63],
        [84, 84],
      ]),
    ),
    join2(
      line([
        [50, 18],
        [50, 82],
      ]),
      line([
        [18, 50],
        [82, 50],
      ]),
    ),
    join2(
      line(
        [
          [14, 28],
          [86, 28],
          [86, 72],
          [14, 72],
        ],
        true,
      ),
      line([
        [14, 28],
        [50, 54],
        [86, 28],
      ]),
    ),
  ];
  return shapes.flatMap((q, i) => {
    const b = asBezierNode(at(q, i));
    return b
      ? [
          {
            id: id(`icon${i}`),
            type: 'shape',
            name: ['Arrow', 'Search', 'Add', 'Mail'][i],
            x: b.x,
            y: b.y,
            w: b.w,
            h: b.h,
            rotation: 0,
            opacity: 1,
            shape: 'bezier',
            bez: b.bez,
            fill: null,
            stroke: { color: colour, width: w, cap, join },
          } as ShapeNode,
        ]
      : [];
  });
}

/** The identity sheet: the marks, the palette, the type, the pattern, the icons and the rules, as one artboard. */
export function identitySheet(c: LogoConcept, b: LogoBrief, ident: BrandIdentity): Artboard {
  const W = 1600;
  const H = 1000;
  const m = 56;
  const p = c.palette;
  const full = coloursFor(c, 'full');
  const kids: Node[] = [];
  const colW = W * 0.56;
  kids.push(txt('Title', `${b.name} — identity`, m, m * 0.7, colW, 40, { font: ident.type.display, weight: ident.type.displayWeight, size: 30, color: p.ink }));
  // the primary lockup on paper, large
  kids.push(box('Primary panel', m, m + 60, colW - m, 470, mix(p.paper, '#ffffff', 0.5), { radius: 12 }));
  kids.push(fitLockup(c, ident.primary, { x: m + 70, y: m + 130, w: colW - m - 140, h: 330 }, full));
  // three variants: reversed, the symbol, the app icon
  const tileY = m + 560;
  const tileW = (colW - m - 40) / 3;
  const rev = coloursFor(c, 'reversed');
  kids.push(box('Reversed panel', m, tileY, tileW, 300, p.primary, { radius: 12 }));
  kids.push(fitLockup(c, ident.primary === 'horizontal' ? 'stacked' : ident.primary, { x: m + 30, y: tileY + 40, w: tileW - 60, h: 220 }, rev));
  kids.push(box('Symbol panel', m + tileW + 20, tileY, tileW, 300, mix(p.paper, '#ffffff', 0.5), { radius: 12 }));
  const sym = c.mark ?? initialMark(c);
  const placed = symbolNodes(c, sym, m + tileW + 20 + tileW / 2 - 90, tileY + 60, 180, full, ident.type.display);
  kids.push({ id: id('secondary'), type: 'group', name: 'Secondary mark', role: 'logo', x: 0, y: 0, w: W, h: H, rotation: 0, opacity: 1, children: placed.nodes } as GroupNode);
  const ax = m + (tileW + 20) * 2;
  kids.push(box('App icon ground', ax, tileY, tileW, 300, mix(p.paper, p.ink, 0.06), { radius: 12 }));
  kids.push(box('App icon', ax + tileW / 2 - 80, tileY + 70, 160, 160, p.primary, { radius: 36 }));
  const iconCol = { ...coloursFor(c, 'reversed'), ground: p.primary };
  const ic = symbolNodes(c, smallMark(sym), ax + tileW / 2 - 52, tileY + 98, 104, iconCol, ident.type.display);
  kids.push({ id: id('appicon'), type: 'group', name: 'App icon mark', role: 'logo', x: 0, y: 0, w: W, h: H, rotation: 0, opacity: 1, children: ic.nodes } as GroupNode);
  // the right column: palette, type, pattern, icons, rules
  const rx = colW + 20;
  const rw = W - rx - m;
  kids.push(txt('Palette label', 'Colour', rx, m + 60, rw, 22, { size: 13, weight: 600, color: p.muted, case: 'upper', tracking: 120 }));
  ident.palette.forEach((r, i) => {
    const cx = rx + (i % 3) * (rw / 3);
    const cy = m + 92 + Math.floor(i / 3) * 112;
    kids.push(box(`Swatch ${r.role}`, cx, cy, rw / 3 - 14, 64, r.hex, { radius: 8, ...(r.role === 'Paper' ? { stroke: { color: mix(p.ink, p.paper, 0.8), width: 1 } } : {}) }));
    kids.push(txt(`${r.role} name`, `${r.role}  ${r.hex.toUpperCase()}`, cx, cy + 70, rw / 3 - 14, 18, { size: 12, weight: 600, color: p.ink }));
    kids.push(txt(`${r.role} contrast`, `${r.contrast.toFixed(1)}:1 with ${r.on === p.paper ? 'paper' : 'ink'}`, cx, cy + 87, rw / 3 - 14, 16, { size: 11, color: p.muted }));
  });
  const ty = m + 330;
  kids.push(txt('Type label', 'Type', rx, ty, rw, 22, { size: 13, weight: 600, color: p.muted, case: 'upper', tracking: 120 }));
  kids.push(txt('Display specimen', 'Aa', rx, ty + 28, 110, 90, { font: ident.type.display, weight: ident.type.displayWeight, size: 72, color: p.ink }));
  kids.push(txt('Display name', `${ident.type.display} ${ident.type.displayWeight} — headlines`, rx + 120, ty + 40, rw - 120, 22, { size: 14, weight: 600, color: p.ink }));
  kids.push(
    txt('Text sample', `${ident.type.text} — reading text. ${b.values.length ? `${b.name} stands for ${b.values.slice(0, 3).join(', ')}.` : `${b.name} in running text.`}`, rx + 120, ty + 66, rw - 120, 44, {
      font: ident.type.text,
      size: 14,
      color: p.muted,
    }),
  );
  const py = ty + 140;
  kids.push(txt('Pattern label', 'Pattern and motif', rx, py, rw, 22, { size: 13, weight: 600, color: p.muted, case: 'upper', tracking: 120 }));
  kids.push({ id: id('pattern'), type: 'pattern', name: 'Pattern', x: rx, y: py + 28, w: rw * 0.48, h: 120, rotation: 0, opacity: 1, gen: ident.pattern.gen, params: ident.pattern.params, colors: [p.primary, p.secondary, p.accent] } as PatternNode);
  kids.push(box('Motif ground', rx + rw * 0.52, py + 28, rw * 0.48, 120, p.primary, { radius: 0 }));
  const mot = symbolNodes(c, sym, rx + rw * 0.52 + rw * 0.2, py + 10, 220, { ...coloursFor(c, 'reversed'), tones: [mix(p.primary, p.paper, 0.22), mix(p.primary, p.paper, 0.22), mix(p.primary, p.paper, 0.22)] }, ident.type.display);
  kids.push({
    id: id('motif'),
    type: 'group',
    name: 'Motif (the mark cropped)',
    role: 'motif',
    x: rx + rw * 0.52,
    y: py + 28,
    w: rw * 0.48,
    h: 120,
    rotation: 0,
    opacity: 1,
    clip: true,
    children: mot.nodes.map((nd) => ({ ...nd, x: nd.x - (rx + rw * 0.52), y: nd.y - (py + 28) })),
  } as GroupNode);
  const iy = py + 170;
  kids.push(txt('Icon label', 'Icon style', rx, iy, rw, 22, { size: 13, weight: 600, color: p.muted, case: 'upper', tracking: 120 }));
  kids.push(...icons(rx, iy + 30, 40, p.ink, ident));
  kids.push(txt('Icon rule', ident.icon.how, rx + 260, iy + 30, rw - 260, 44, { size: 12, color: p.muted }));
  const gy = iy + 96;
  kids.push(txt('Rules label', 'Use', rx, gy, rw, 22, { size: 13, weight: 600, color: p.muted, case: 'upper', tracking: 120 }));
  kids.push(txt('Rules', [ident.guidelines.clear, ident.guidelines.min, ...ident.guidelines.donts.slice(0, 2)].join('\n'), rx, gy + 26, rw, H - gy - 26 - m * 0.6, { size: 12, color: p.ink, lineHeight: 1.45 }));
  return { id: `ab_identity_${c.id}`, name: `${b.name} — identity sheet`, width: W, height: H, unit: 'px', dpi: 72, format: 'custom', background: p.paper, bleed: 0, safe: 0, children: kids };
}

/** The identity as a Master Design System for a Board: its tokens, type, motifs, imagery, rules and its logo. */
export function identitySystem(c: LogoConcept, b: LogoBrief, ident: BrandIdentity): MasterDesignSystem & { logo: { text: string; mark: { concept: ConceptRecord; name: string } } } {
  const p = c.palette;
  return {
    version: 1,
    id: `sys_${c.id}`,
    name: b.name,
    direction: { name: `${b.name} identity`, language: c.method ? METHODS[c.method].label : 'Wordmark', concept: c.coreIdea.slice(0, 400) },
    personality: b.personality.slice(0, 8),
    tokens: {
      colors: { background: p.paper, surface: mix(p.paper, '#ffffff', 0.5), text: p.ink, muted: p.muted, accent: p.primary, accentText: p.paper, line: mix(p.ink, p.paper, 0.8) },
      fonts: { display: ident.type.display, body: ident.type.text },
      accent2: p.accent,
    },
    weights: { display: ident.type.displayWeight, body: 400 },
    type: { case: ident.type.case === 'upper' ? 'upper' : ident.type.case === 'lower' ? 'lower' : 'sentence', tracking: ident.type.case === 'upper' ? 'wide' : 'normal' },
    composition: { intensity: 55, density: 'balanced' },
    shape: null,
    motifs: c.method ? [c.method] : [],
    imagery: ident.imagery.join('; '),
    logo: { text: b.name, mark: { concept: conceptRecord(c), name: b.name } },
    constraints: [`The logo is ${b.name}’s approved mark: placed, never redrawn.`, ident.guidelines.clear, ...ident.guidelines.donts.slice(0, 2)],
    accentWhy: 'the primary of the approved logo',
  };
}
