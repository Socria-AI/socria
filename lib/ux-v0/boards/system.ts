// lib/ux-v0/boards/system.ts — a Board's Master Design System: the one visual identity every material shares.
//
// The system is data: palette, faces and their weights, type habits, density, shape language, motifs, imagery,
// logo, composition principles and the rules of use, with the website direction it came from. Every material keeps
// its own layout and format; what it shares with the others is recorded as BINDINGS made when it is composed: this
// text's face is the display face, this ground is the accent, this rule is the ink. A change to the system then
// reaches exactly the properties bound to the token that changed, and only those still holding the token's old
// value: a property the designer changed in one material (a local override) keeps their value, is reported, and can
// be reset to the system on request. Nothing is regenerated for a token change; the changed materials are checked
// and repaired within bounds (a wider face may need a smaller headline), never recomposed.

import type { ConceptRecord } from '../graphics/logo/record';
import { normalizeConceptRecord } from '../graphics/logo/record';
import { conceptOfMark, insideLinkedLogo, relinkLogo } from '../graphics/logo/link';
import { normalizeVocabulary, type VisualVocabulary } from '../graphics/vocabulary';
import { contrastRatio } from '../../ux/audit';
import { describeForm, normalizeForm, type FormSystem } from '../form';
import { FONTS, knownFont, nearestWeight } from '../fonts';
import { normalizeDirectionState, type ArtDirection } from '../direction';
import { applyOps, colour, walk, type Artboard, type GraphicDoc, type Node, type Op, type TextNode, type Tokens } from '../graphics/doc';
import { graphicDirectionOf, type GraphicDirection } from '../graphics/compose';
import { refineDoc } from '../graphics/check';
import type { Measure } from '../graphics/text';
import { normalizeSelection, type StyleSelection } from '../graphics/styles/blend';
import { styleById } from '../graphics/styles/registry';
import { classesOf, type StyleDNA } from '../graphics/styles/schema';

export const COLOUR_TOKENS = ['background', 'surface', 'text', 'muted', 'accent', 'accentText', 'line', 'accent2'] as const;
export type ColourToken = (typeof COLOUR_TOKENS)[number];
/** Every shared decision a material property can be bound to. */
export type TokenKey = ColourToken | 'display' | 'body' | 'displayWeight' | 'case';
export const TOKEN_LABEL: Record<TokenKey, string> = {
  background: 'the ground',
  surface: 'the surface',
  text: 'the ink',
  muted: 'the quiet ink',
  accent: 'the accent',
  accentText: 'the ink on the accent',
  line: 'the rule colour',
  accent2: 'the second accent',
  display: 'the display face',
  body: 'the text face',
  displayWeight: 'the display weight',
  case: 'the headline case',
};

export interface MasterDesignSystem {
  version: 1;
  id: string;
  /** the identity's name: the campaign or the brand */
  name: string;
  direction: { name: string; language: string; concept?: string };
  personality: string[];
  tokens: Tokens;
  weights: { display: number; body: number };
  type: { case: 'sentence' | 'upper' | 'lower'; tracking: 'tight' | 'normal' | 'wide'; role?: 'structural' | 'editorial' | 'quiet' | 'functional'; trackingValue?: number; lineHeight?: number };
  composition: { axis?: 'orthogonal' | 'diagonal' | 'radial' | 'scattered' | 'layered'; intensity: number; density: 'airy' | 'balanced' | 'dense' };
  shape: FormSystem | null;
  motifs: string[];
  /** how pictures are treated, in the direction's words */
  imagery: string;
  /** the wordmark (the identity's name set in the display face) and, when given, a logo picture */
  logo: { text: string; asset?: string; mark?: { concept: ConceptRecord; name: string } } | null;
  /** the rules of use, said plainly: what every material keeps, and what the direction refuses */
  constraints: string[];
  /** why the accent is what it is */
  accentWhy?: string;
  /** the website project whose approved direction it came from */
  source?: { projectId: string; name: string };
  /** the full website direction it came from: a website concept is generated in it, with the system's tokens */
  art?: ArtDirection;
  /** the visual vocabulary every material shares (graphics/vocabulary.ts): the same shapes, pattern, treatments and
   * effects, each material executing them in its own composition */
  vocabulary?: VisualVocabulary;
  /** the design language every material speaks (graphics/styles): one DNA, each material building it its own way */
  style?: StyleSelection;
  /** the registry design system its identity comes from (lib/ux-v0/dsi): the version applied; the expression stays the board's */
  brand?: { id: string; version: number; name: string; palette?: string[]; clearSpace?: number; minLogo?: number };
}

/** Which tokens a material's properties are bound to: by node id and property, and by artboard for the ground. */
export interface Bindings {
  nodes: Record<string, Partial<Record<'color' | 'fill' | 'stroke' | 'font' | 'weight' | 'case', TokenKey>>>;
  boards: Record<string, { background?: ColourToken }>;
}
export const EMPTY_BINDINGS: Bindings = { nodes: {}, boards: {} };

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max: number, d = ''): string => (typeof v === 'string' ? v.slice(0, max) : d);
const hex7 = (v: string | undefined | null) => (typeof v === 'string' ? v.slice(0, 7).toLowerCase() : '');
const TOKEN_KEYS: readonly TokenKey[] = [...COLOUR_TOKENS, 'display', 'body', 'displayWeight', 'case'];

/** A token's value in a system. */
export function tokenValue(sys: MasterDesignSystem, key: TokenKey): string | number | undefined {
  if (key === 'display' || key === 'body') return sys.tokens.fonts[key];
  if (key === 'displayWeight') return sys.weights.display;
  if (key === 'case') return sys.type.case === 'upper' || sys.type.case === 'lower' ? sys.type.case : 'none';
  if (key === 'accent2') return sys.tokens.accent2;
  return sys.tokens.colors[key];
}

// ── where a system comes from ──

/** The system an approved direction gives: its tokens, type habits, shapes and refusals become the board's rules. */
export function systemFromDirection(art: ArtDirection, opts: { name: string; personality?: readonly string[]; accentWhy?: string; source?: { projectId: string; name: string }; logo?: { text: string; asset?: string } | null }): MasterDesignSystem {
  const g = graphicDirectionOf(art as unknown as Parameters<typeof graphicDirectionOf>[0]);
  const look = o(art.look);
  const density = look.density === 'dense' || art.tokens.scale === 'compact' ? 'dense' : art.tokens.scale === 'spacious' ? 'airy' : 'balanced';
  const sys: MasterDesignSystem = {
    version: 1,
    id: `sys${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: opts.name.slice(0, 80) || art.name,
    direction: { name: art.name, language: art.language, ...(art.concept ? { concept: art.concept.slice(0, 400) } : {}) },
    personality: (opts.personality ?? []).slice(0, 8).map((p) => p.slice(0, 30)),
    tokens: g.tokens,
    weights: { display: nearestWeight(g.tokens.fonts.display, g.look.weight), body: nearestWeight(g.tokens.fonts.body, 400) },
    type: { case: g.look.case, tracking: g.look.tracking, ...(g.typeRole ? { role: g.typeRole } : {}) },
    composition: { ...(g.axis ? { axis: g.axis } : {}), intensity: g.intensity, density },
    shape: g.form ?? null,
    motifs: (g.look.motifs ?? []).slice(0, 8),
    imagery: str(art.imagery, 200) || 'the brief’s own pictures, as they are',
    logo: opts.logo ?? (opts.name ? { text: opts.name.slice(0, 80) } : null),
    constraints: [],
    ...(opts.accentWhy ? { accentWhy: opts.accentWhy } : {}),
    ...(opts.source ? { source: opts.source } : {}),
    art,
  };
  sys.constraints = rulesOf(sys, art.avoid ?? []);
  return sys;
}

/** The rules of use: what every material keeps (said from the system's own values), then what the direction refuses. */
export function rulesOf(sys: MasterDesignSystem, refuses: readonly string[] = []): string[] {
  const c = sys.tokens.colors;
  const out = [
    `Headlines in ${sys.tokens.fonts.display} ${sys.weights.display}; text in ${sys.tokens.fonts.body}.`,
    `${sys.type.case === 'upper' ? 'Headlines in capitals' : sys.type.case === 'lower' ? 'Headlines in lower case' : 'Headlines in sentence case'}, ${sys.type.tracking === 'tight' ? 'tightly tracked' : sys.type.tracking === 'wide' ? 'widely tracked' : 'at normal tracking'}.`,
    `The accent (${c.accent}) marks one thing per material: a field, a block or a shape, never running text.`,
    `Ink ${c.text} on ${c.background}${contrastRatio(c.text, c.background) >= 7 ? ' (AAA contrast)' : contrastRatio(c.text, c.background) >= 4.5 ? ' (AA contrast)' : ''}.`,
    ...(sys.shape ? [`Shapes only from the system’s own language: ${describeForm(sys.shape).toLowerCase()}`] : []),
  ];
  return [...out, ...refuses.slice(0, 4).map((r) => (r.endsWith('.') ? r : `${r}.`))].slice(0, 9);
}

/** The direction a material is composed in: the system as the Graphics composer reads it. */
export function directionOfSystem(sys: MasterDesignSystem): GraphicDirection {
  return {
    name: sys.direction.name,
    language: sys.direction.language,
    ...(sys.direction.concept ? { concept: sys.direction.concept } : {}),
    tokens: sys.tokens,
    look: { case: sys.type.case, tracking: sys.type.tracking, weight: sys.weights.display, motifs: sys.motifs, ...(sys.type.trackingValue !== undefined ? { trackingValue: sys.type.trackingValue } : {}), ...(sys.type.lineHeight !== undefined ? { lineHeight: sys.type.lineHeight } : {}) },
    form: sys.shape,
    ...(sys.composition.axis ? { axis: sys.composition.axis } : {}),
    ...(sys.type.role ? { typeRole: sys.type.role } : {}),
    intensity: sys.composition.intensity,
    ...(sys.style ? { style: sys.style } : {}),
  };
}

/**
 * A system given the design language of a styled direction (styles/apply.ts styledDirection): its palette and faces
 * become the system's tokens, its type habits the system's, and the style itself is kept so every material composes
 * in it. Without a style (null), the system keeps its tokens and simply stops speaking one.
 */
export function systemInStyle(sys: MasterDesignSystem, dir: GraphicDirection | null, customs: readonly StyleDNA[] = []): MasterDesignSystem {
  if (!dir?.style) {
    const { style: _drop, ...rest } = sys;
    return { ...rest, constraints: rulesOf(rest, []) };
  }
  const dna = styleById(dir.style.primary, [...(dir.style.customs ?? []), ...customs]);
  const next: MasterDesignSystem = {
    ...sys,
    direction: { name: dir.name, language: sys.direction.language, ...(dir.concept ? { concept: dir.concept.slice(0, 400) } : {}) },
    tokens: dir.tokens,
    weights: { display: nearestWeight(dir.tokens.fonts.display, dir.look.weight), body: nearestWeight(dir.tokens.fonts.body, 400) },
    type: { case: dir.look.case, tracking: dir.look.tracking, ...(sys.type.role ? { role: sys.type.role } : {}), ...(dir.look.trackingValue !== undefined ? { trackingValue: dir.look.trackingValue } : {}), ...(dir.look.lineHeight !== undefined ? { lineHeight: dir.look.lineHeight } : {}) },
    composition: { ...(dir.axis ? { axis: dir.axis } : {}), intensity: dir.intensity, density: sys.composition.density },
    style: dir.style,
  };
  // the style's own rules join the system's: what it must keep, and the mistakes that break it
  next.constraints = [...rulesOf(next, []), ...(dna ? [...dna.constraints.essential.slice(0, 2), ...dna.constraints.mistakes.slice(0, 1).map((m) => `Never: ${m.replace(/^./, (c) => c.toLowerCase())}`)] : [])].map((r) => (r.endsWith('.') ? r : `${r}.`)).slice(0, 12);
  return next;
}

/**
 * The faces a website can load for a system's faces: the same face where websites have it; else (a face drawn for
 * Graphics only, as a design language may choose) the nearest website face of its class, so the website is set in
 * what the browser of a visitor will really show.
 */
export function webFacesOf(f: { display: string; body: string }): { display: string; body: string } {
  const pick = (face: string, body: boolean): string => {
    const k = knownFont(face);
    if (k && (!body || !k.displayOnly)) return k.name;
    const cls = classesOf(face);
    const near = FONTS.find((w) => (!body || !w.displayOnly) && classesOf(w.name).some((c) => cls.includes(c)));
    return near?.name ?? (body ? 'Inter' : 'Fraunces');
  };
  return { display: pick(f.display, false), body: pick(f.body, true) };
}

/** The website direction a website concept is generated in: the one the system came from, with the system's tokens. */
export function artOfSystem(sys: MasterDesignSystem): ArtDirection | null {
  if (!sys.art) return null;
  return { ...sys.art, tokens: { ...sys.art.tokens, colors: { ...sys.art.tokens.colors, ...sys.tokens.colors }, fonts: webFacesOf(sys.tokens.fonts) } } as ArtDirection;
}

/** A system held to its shape; null when it is not one. */
export function normalizeSystem(v: unknown): MasterDesignSystem | null {
  const r = o(v);
  const t = o(r.tokens);
  const tc = o(t.colors);
  const name = str(r.name, 80).trim();
  const fonts = o(t.fonts);
  if (!name || !str(fonts.display, 60) || !str(fonts.body, 60)) return null;
  const d = o(r.direction);
  const ty = o(r.type);
  const co = o(r.composition);
  const art = r.art ? normalizeDirectionState({ options: [r.art], chosen: r.art, approved: true }).chosen : null;
  const sys: MasterDesignSystem = {
    version: 1,
    id: typeof r.id === 'string' && /^[\w-]{1,48}$/.test(r.id) ? r.id : `sys${Date.now().toString(36)}`,
    name,
    direction: { name: str(d.name, 80) || 'The campaign', language: str(d.language, 40) || 'editorial', ...(str(d.concept, 400) ? { concept: str(d.concept, 400) } : {}) },
    personality: a(r.personality).map((p) => str(p, 30)).filter(Boolean).slice(0, 8),
    tokens: {
      colors: {
        background: colour(tc.background, '#f5f2ea'),
        surface: colour(tc.surface, '#ffffff'),
        text: colour(tc.text, '#161512'),
        muted: colour(tc.muted, '#5d5a52'),
        accent: colour(tc.accent, '#2f3d1e'),
        accentText: colour(tc.accentText, '#ffffff'),
        line: colour(tc.line, '#d8d3c6'),
      },
      fonts: { display: knownFont(fonts.display)?.name ?? str(fonts.display, 60), body: knownFont(fonts.body)?.name ?? str(fonts.body, 60) },
      ...(colour(t.accent2, '') ? { accent2: colour(t.accent2, '') } : {}),
    },
    weights: { display: Math.max(100, Math.min(900, Math.round(Number(o(r.weights).display) / 50) * 50 || 600)), body: Math.max(100, Math.min(900, Math.round(Number(o(r.weights).body) / 50) * 50 || 400)) },
    type: {
      case: ty.case === 'upper' || ty.case === 'lower' ? ty.case : 'sentence',
      tracking: ['tight', 'normal', 'wide'].includes(ty.tracking) ? ty.tracking : 'normal',
      ...(['structural', 'editorial', 'quiet', 'functional'].includes(ty.role) ? { role: ty.role } : {}),
      ...(typeof ty.trackingValue === 'number' && Number.isFinite(ty.trackingValue) ? { trackingValue: Math.max(-100, Math.min(400, Math.round(ty.trackingValue))) } : {}),
      ...(typeof ty.lineHeight === 'number' && Number.isFinite(ty.lineHeight) ? { lineHeight: Math.max(0.7, Math.min(2, Math.round(ty.lineHeight * 100) / 100)) } : {}),
    },
    composition: { ...(['orthogonal', 'diagonal', 'radial', 'scattered', 'layered'].includes(co.axis) ? { axis: co.axis } : {}), intensity: Math.max(0, Math.min(100, Math.round(Number(co.intensity) || 0))), density: co.density === 'airy' || co.density === 'dense' ? co.density : 'balanced' },
    shape: r.shape ? normalizeForm(r.shape) ?? null : null,
    motifs: a(r.motifs).map((m) => str(m, 30)).filter(Boolean).slice(0, 8),
    imagery: str(r.imagery, 200),
    logo:
      r.logo && typeof r.logo === 'object' && str(o(r.logo).text, 80).trim()
        ? {
            text: str(o(r.logo).text, 80).trim(),
            ...(typeof o(r.logo).asset === 'string' && /^[A-Za-z][\w-]{0,47}$/.test(o(r.logo).asset) ? { asset: o(r.logo).asset } : {}),
            // a generated mark: its concept's parameters (it is rebuilt, never stored as a picture)
            ...((cr) => (cr ? { mark: { concept: cr, name: str(o(r.logo).text, 80).trim() } } : {}))(o(r.logo).mark && typeof o(o(r.logo).mark).concept === 'object' ? normalizeConceptRecord(o(o(r.logo).mark).concept, str(o(r.logo).text, 80).trim()) : null),
          }
        : null,
    constraints: a(r.constraints).map((c) => str(c, 240)).filter(Boolean).slice(0, 12),
    ...(str(r.accentWhy, 200) ? { accentWhy: str(r.accentWhy, 200) } : {}),
    ...(r.source && typeof o(r.source).projectId === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(o(r.source).projectId) ? { source: { projectId: o(r.source).projectId, name: str(o(r.source).name, 100) } } : {}),
    ...(art ? { art } : {}),
    ...((voc) => (voc ? { vocabulary: voc } : {}))(r.vocabulary ? normalizeVocabulary(r.vocabulary) : null),
    ...((sel) => (sel ? { style: sel } : {}))(r.style ? normalizeSelection(r.style) : null),
    ...(r.brand && typeof o(r.brand).id === 'string' && /^dsys_[\w-]{4,64}$/.test(o(r.brand).id) ? { brand: { id: o(r.brand).id, version: Math.max(0, Math.round(Number(o(r.brand).version) || 0)), name: str(o(r.brand).name, 80), ...((pal) => (pal.length ? { palette: pal } : {}))(a(o(r.brand).palette).filter((x): x is string => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x)).map((x) => x.toLowerCase()).slice(0, 64)), ...(Number(o(r.brand).clearSpace) > 0 ? { clearSpace: Math.min(4, Number(o(r.brand).clearSpace)) } : {}), ...(Number(o(r.brand).minLogo) > 0 ? { minLogo: Math.min(2000, Number(o(r.brand).minLogo)) } : {}) } } : {}),
  };
  return sys;
}

// ── bindings: what a material shares, recorded when it is composed ──

/** The colour token a value is, in priority order (ink before accent before quieter roles); null when none. */
function colourTokenOf(sys: MasterDesignSystem, c: string | undefined | null): ColourToken | null {
  const v = hex7(c);
  if (!/^#[0-9a-f]{6}$/.test(v)) return null;
  const order: ColourToken[] = ['text', 'accent', 'background', 'muted', 'accentText', 'surface', 'line', 'accent2'];
  for (const k of order) if (hex7(tokenValue(sys, k) as string) === v) return k;
  return null;
}

/** Bindings for a document composed in a system: every property whose value is one of the system's tokens. */
export function bindingsOf(doc: GraphicDoc, sys: MasterDesignSystem): Bindings {
  const out: Bindings = { nodes: {}, boards: {} };
  for (const b of doc.artboards) {
    const bg = colourTokenOf(sys, b.background);
    if (bg) out.boards[b.id] = { background: bg };
    for (const l of walk(b)) {
      const n = l.node;
      // a linked logo's colours are the logo's own: a token change never recolours it
      if (n.link || insideLinkedLogo(b, n.id)) continue;
      const rec: Bindings['nodes'][string] = {};
      if (n.type === 'text' || n.type === 'chart') {
        const c = colourTokenOf(sys, n.color);
        if (c) rec.color = c;
        if (n.font === sys.tokens.fonts.display) rec.font = 'display';
        else if (n.font === sys.tokens.fonts.body) rec.font = 'body';
      }
      if (n.type === 'text' && rec.font === 'display') {
        if (n.weight === nearestWeight(n.font, sys.weights.display)) rec.weight = 'displayWeight';
        if ((n.case === 'upper' || n.case === 'lower' ? n.case : 'none') === tokenValue(sys, 'case')) rec.case = 'case';
      }
      if (n.type === 'shape') {
        if (typeof n.fill === 'string') {
          const f = colourTokenOf(sys, n.fill);
          if (f) rec.fill = f;
        }
        const s = colourTokenOf(sys, n.stroke?.color);
        if (s) rec.stroke = s;
      }
      if (Object.keys(rec).length) out.nodes[n.id] = rec;
    }
  }
  return out;
}

/** Bindings held to their shape: only known props and tokens, only ids the document has. */
export function normalizeBindings(v: unknown, doc: GraphicDoc | null): Bindings {
  const r = o(v);
  const ids = new Set(doc ? doc.artboards.flatMap((b) => walk(b).map((l) => l.node.id)) : []);
  const boards = new Set(doc ? doc.artboards.map((b) => b.id) : []);
  const out: Bindings = { nodes: {}, boards: {} };
  for (const [id, props] of Object.entries(o(r.nodes))) {
    if (!ids.has(id)) continue;
    const rec: Bindings['nodes'][string] = {};
    for (const [p, k] of Object.entries(o(props))) if (['color', 'fill', 'stroke', 'font', 'weight', 'case'].includes(p) && (TOKEN_KEYS as readonly string[]).includes(k as string)) (rec as Record<string, TokenKey>)[p] = k as TokenKey;
    if (Object.keys(rec).length) out.nodes[id] = rec;
  }
  for (const [id, props] of Object.entries(o(r.boards))) {
    if (!boards.has(id)) continue;
    const bg = o(props).background;
    if ((COLOUR_TOKENS as readonly string[]).includes(bg)) out.boards[id] = { background: bg };
  }
  return out;
}

// ── local overrides ──

export interface Override {
  /** the node (or artboard) and the property */
  node: string;
  name: string;
  prop: 'color' | 'fill' | 'stroke' | 'font' | 'weight' | 'case' | 'background';
  token: TokenKey;
  /** what the material has, and what the system says */
  value: string;
  expected: string;
}

const nodeValue = (n: Node, prop: Override['prop']): string => {
  if (prop === 'color') return n.type === 'text' || n.type === 'chart' ? hex7(n.color) : '';
  if (prop === 'fill') return n.type === 'shape' && typeof n.fill === 'string' ? hex7(n.fill) : '';
  if (prop === 'stroke') return n.type === 'shape' ? hex7(n.stroke?.color) : '';
  if (prop === 'font') return n.type === 'text' || n.type === 'chart' ? n.font : '';
  if (prop === 'weight') return n.type === 'text' ? String(n.weight) : '';
  if (prop === 'case') return n.type === 'text' ? (n.case === 'upper' || n.case === 'lower' ? n.case : 'none') : '';
  return '';
};
const expectedFor = (sys: MasterDesignSystem, token: TokenKey, n?: Node): string => {
  const v = tokenValue(sys, token);
  if (token === 'displayWeight' && n && (n.type === 'text' || n.type === 'chart')) return String(nearestWeight(n.font, Number(v)));
  return typeof v === 'number' ? String(v) : token === 'display' || token === 'body' || token === 'case' ? String(v ?? '') : hex7(v as string);
};

/** The bound properties a material no longer holds at the system's value: its local overrides. */
export function overridesOf(doc: GraphicDoc | null, bindings: Bindings, sys: MasterDesignSystem): Override[] {
  if (!doc) return [];
  const out: Override[] = [];
  for (const b of doc.artboards) {
    const bt = bindings.boards[b.id]?.background;
    if (bt && hex7(b.background) !== expectedFor(sys, bt)) out.push({ node: b.id, name: b.name, prop: 'background', token: bt, value: hex7(b.background) || 'transparent', expected: expectedFor(sys, bt) });
    for (const l of walk(b)) {
      const rec = bindings.nodes[l.node.id];
      if (!rec) continue;
      for (const [prop, token] of Object.entries(rec) as [Override['prop'], TokenKey][]) {
        const value = nodeValue(l.node, prop);
        const expected = expectedFor(sys, token, l.node);
        if (value && expected && value !== expected) out.push({ node: l.node.id, name: l.node.name ?? l.node.role ?? l.node.type, prop, token, value, expected });
      }
    }
  }
  return out;
}

/** The operations that set bound properties to a system's values (all of them, or only the nodes given). */
function opsToSystem(doc: GraphicDoc, bindings: Bindings, sys: MasterDesignSystem, only?: (node: Node | Artboard, prop: Override['prop'], token: TokenKey) => boolean): { ops: Op[]; skipped: { node: string; name: string; prop: string; why: string }[] } {
  const ops: Op[] = [];
  const skipped: { node: string; name: string; prop: string; why: string }[] = [];
  for (const b of doc.artboards) {
    const bt = bindings.boards[b.id]?.background;
    if (bt && (!only || only(b, 'background', bt))) {
      if (b.locked) skipped.push({ node: b.id, name: b.name, prop: 'background', why: 'the artboard is locked' });
      else if (doc.locks?.colors) skipped.push({ node: b.id, name: b.name, prop: 'background', why: 'the colours are locked in this material' });
      else if (hex7(b.background) !== expectedFor(sys, bt)) ops.push({ op: 'artboard-update', id: b.id, set: { background: tokenValue(sys, bt) as string } });
    }
    for (const l of walk(b)) {
      const n = l.node;
      const rec = bindings.nodes[n.id];
      if (!rec) continue;
      const set: Record<string, unknown> = {};
      for (const [prop, token] of Object.entries(rec) as [Override['prop'], TokenKey][]) {
        if (only && !only(n, prop, token)) continue;
        const colourProp = prop === 'color' || prop === 'fill' || prop === 'stroke';
        const fontProp = prop === 'font' || prop === 'weight';
        const name = n.name ?? n.role ?? n.type;
        if (n.locked || l.parents.some((g) => g.locked) || b.locked) {
          skipped.push({ node: n.id, name, prop, why: 'it is locked' });
          continue;
        }
        if (colourProp && doc.locks?.colors) {
          skipped.push({ node: n.id, name, prop, why: 'the colours are locked in this material' });
          continue;
        }
        if (fontProp && doc.locks?.fonts) {
          skipped.push({ node: n.id, name, prop, why: 'the typefaces are locked in this material' });
          continue;
        }
        const v = tokenValue(sys, token);
        if (v === undefined) continue;
        if (prop === 'color') set.color = v;
        else if (prop === 'fill') set.fill = v;
        else if (prop === 'stroke' && n.type === 'shape' && n.stroke) set.stroke = { ...n.stroke, color: v };
        else if (prop === 'font') {
          set.font = v;
          if (n.type === 'text' || n.type === 'chart') {
            // the weight the new face really has, nearest to the one set
            if (n.type === 'text') set.weight = nearestWeight(String(v), Number(set.weight ?? n.weight));
          }
        } else if (prop === 'weight' && n.type === 'text') set.weight = nearestWeight(String(set.font ?? n.font), Number(v));
        else if (prop === 'case' && n.type === 'text') set.case = v === 'upper' || v === 'lower' ? v : null;
      }
      if (Object.keys(set).length) ops.push({ op: 'update', id: n.id, set });
    }
  }
  return { ops, skipped };
}

// ── propagation ──

/** The token keys whose values differ between two systems. */
export function changedTokens(from: MasterDesignSystem, to: MasterDesignSystem): TokenKey[] {
  return TOKEN_KEYS.filter((k) => String(tokenValue(from, k) ?? '').toLowerCase() !== String(tokenValue(to, k) ?? '').toLowerCase());
}

export interface Propagated {
  doc: GraphicDoc;
  /** properties set to the new values */
  updated: number;
  /** local overrides kept (the material had changed them), and what was locked */
  kept: { node: string; name: string; prop: string; why: string }[];
  /** what the bounded repair fixed afterwards (a wider face may need a smaller headline) */
  fixed: string[];
  /** the colours the repair changed, each now bound to the token it equals (or to none): never said to be overrides */
  repaired: Repair[];
  /** the bindings after the change (a repaired colour re-bound) */
  bindings: Bindings;
}

/** A colour the bounded repair changed to keep something readable. */
export interface Repair {
  node: string;
  name: string;
  prop: 'color' | 'fill' | 'stroke' | 'background';
  from: string;
  to: string;
  /** the token it now equals, when it equals one */
  token?: ColourToken;
}

/** The colours that differ between two versions of a document (the repair's work), re-bound to what they now equal. */
function rebindRepaired(before: GraphicDoc, after: GraphicDoc, bindings: Bindings, sys: MasterDesignSystem): { bindings: Bindings; repaired: Repair[] } {
  const out: Bindings = { nodes: { ...bindings.nodes }, boards: { ...bindings.boards } };
  const repaired: Repair[] = [];
  const prev = new Map<string, Node>();
  for (const b of before.artboards) for (const l of walk(b)) prev.set(l.node.id, l.node);
  for (const b of after.artboards) {
    const pb = before.artboards.find((x) => x.id === b.id);
    if (pb && hex7(pb.background) !== hex7(b.background)) {
      const token = colourTokenOf(sys, b.background) ?? undefined;
      repaired.push({ node: b.id, name: b.name, prop: 'background', from: hex7(pb.background), to: hex7(b.background), ...(token ? { token } : {}) });
      const rec = { ...(out.boards[b.id] ?? {}) };
      if (token) rec.background = token;
      else delete rec.background;
      out.boards[b.id] = rec;
    }
    for (const l of walk(b)) {
      const n = l.node;
      const p = prev.get(n.id);
      if (!p) continue;
      for (const prop of ['color', 'fill', 'stroke'] as const) {
        const was = nodeValue(p, prop);
        const now = nodeValue(n, prop);
        if (!now || was === now) continue;
        const token = colourTokenOf(sys, now) ?? undefined;
        repaired.push({ node: n.id, name: n.name ?? n.role ?? n.type, prop, from: was ?? '', to: now, ...(token ? { token } : {}) });
        const rec = { ...(out.nodes[n.id] ?? {}) };
        if (token) rec[prop] = token;
        else delete rec[prop];
        if (Object.keys(rec).length) out.nodes[n.id] = rec;
        else delete out.nodes[n.id];
      }
    }
  }
  return { bindings: out, repaired };
}

/**
 * A system change carried into one material: each property bound to a changed token is set to the new value when it
 * still holds the old one; a property that holds something else is the designer's local override and is kept (said);
 * locked properties are kept (said). The document's own palette follows. Then the bounded repair, never a recompose.
 */
export function propagate(doc0: GraphicDoc, bindings: Bindings, from: MasterDesignSystem, to: MasterDesignSystem, measure?: Measure): Propagated {
  // a new approved logo: every linked instance rebuilt, an edited one kept as a local override
  let doc = doc0;
  const logoKept: Propagated['kept'] = [];
  let logoUpdated = 0;
  if (to.logo?.mark && to.logo.mark.concept.id !== from.logo?.mark?.concept.id) {
    const c = conceptOfMark(to.logo.mark);
    if (c) {
      const r = relinkLogo(doc, c);
      doc = r.doc;
      logoUpdated = r.updated;
      for (const k of r.kept) logoKept.push({ node: '', name: 'the logo', prop: 'logo', why: k });
    }
  }
  const changed = new Set(changedTokens(from, to));
  if (!changed.size) return { doc, updated: logoUpdated, kept: logoKept, fixed: [], repaired: [], bindings };
  const kept: Propagated['kept'] = [...logoKept];
  const { ops, skipped } = opsToSystem(doc, bindings, to, (node, prop, token) => {
    if (!changed.has(token)) return false;
    const current = 'children' in node && 'width' in node && prop === 'background' ? hex7((node as Artboard).background) : nodeValue(node as Node, prop);
    const old = expectedFor(from, token, node as Node);
    if (current !== old) {
      kept.push({ node: node.id, name: ('name' in node && node.name) || ('role' in node && (node as Node).role) || 'object', prop, why: `it was changed in this material (${current}), a local override` });
      return false;
    }
    return true;
  });
  kept.push(...skipped);
  const tokenOp: Op = { op: 'tokens', set: { colors: to.tokens.colors, fonts: to.tokens.fonts, ...(to.tokens.accent2 ? { accent2: to.tokens.accent2 } : {}) } };
  const r = applyOps(doc, doc.locks?.colors || doc.locks?.fonts ? ops : [...ops, tokenOp]);
  if (!r.ok) return { doc, updated: 0, kept: [...kept, { node: '', name: 'the material', prop: 'all', why: r.error }], fixed: [], repaired: [], bindings };
  // the bounded repair, which never touches a local override: what an override no longer does well is said instead
  const own = new Set(overridesOf(r.doc, bindings, to).map((x) => x.node));
  const repaired = repairAround(r.doc, own, measure);
  for (const f of repaired.left) kept.push({ node: f.node ?? '', name: f.name, prop: 'colour', why: `your local change ${f.message.replace(/^“[^”]+” /, '')} Reset it to the system, or change it again` });
  const re = rebindRepaired(r.doc, repaired.doc, bindings, to);
  return { doc: repaired.doc, updated: ops.reduce((s, op) => s + (op.op === 'update' ? Object.keys(op.set).length : 1), 0), kept, fixed: repaired.fixed, repaired: re.repaired, bindings: re.bindings };
}

/**
 * The bounded repair of a material that never changes its local overrides (they are checked, not touched): what it
 * fixes is re-bound to the token it now equals; what is wrong with an override is returned to be said.
 */
export function refineKeepingOverrides(doc: GraphicDoc, bindings: Bindings, sys: MasterDesignSystem, measure?: Measure): { doc: GraphicDoc; bindings: Bindings; fixed: string[]; repaired: Repair[]; left: { node?: string; name: string; message: string }[] } {
  const own = new Set(overridesOf(doc, bindings, sys).map((o) => o.node));
  const r = repairAround(doc, own, measure);
  const re = rebindRepaired(doc, r.doc, bindings, sys);
  return { doc: r.doc, bindings: re.bindings, fixed: r.fixed, repaired: re.repaired, left: r.left };
}

/** The bounded repair run with some objects held as they are (a designer's local overrides): they are checked, never
 * changed; what is wrong with them is returned to be said. */
function repairAround(doc: GraphicDoc, held: ReadonlySet<string>, measure?: Measure): { doc: GraphicDoc; fixed: string[]; left: { node?: string; name: string; message: string }[] } {
  if (!held.size) {
    const r = refineDoc(doc, measure);
    return { doc: r.doc, fixed: r.fixed, left: [] };
  }
  const temp: GraphicDoc = JSON.parse(JSON.stringify(doc));
  const added = new Set<string>();
  for (const b of temp.artboards)
    for (const l of walk(b))
      if (held.has(l.node.id) && !l.node.locked) {
        l.node.locked = true;
        added.add(l.node.id);
      }
  const r = refineDoc(temp, measure);
  for (const b of r.doc.artboards) for (const l of walk(b)) if (added.has(l.node.id)) delete l.node.locked;
  const left = r.remaining.filter((f) => f.node && added.has(f.node) && f.severity === 'high').map((f) => ({ node: f.node, name: f.message.match(/^“([^”]+)”/)?.[1] ?? 'an object', message: f.message }));
  return { doc: r.doc, fixed: r.fixed, left };
}

/** A material's local overrides set back to the system (all of them, or those of the nodes given). */
export function resetOverrides(doc: GraphicDoc, bindings: Bindings, sys: MasterDesignSystem, nodes?: readonly string[], measure?: Measure): { doc: GraphicDoc; reset: number; skipped: { node: string; name: string; prop: string; why: string }[] } {
  const { ops, skipped } = opsToSystem(doc, bindings, sys, (node) => !nodes || nodes.includes(node.id));
  if (!ops.length) return { doc, reset: 0, skipped };
  const r = applyOps(doc, ops);
  if (!r.ok) return { doc, reset: 0, skipped: [...skipped, { node: '', name: 'the material', prop: 'all', why: r.error }] };
  return { doc: refineDoc(r.doc, measure).doc, reset: ops.length, skipped };
}

/** Faces a system names (for loading them before anything is measured). */
export const systemFaces = (sys: MasterDesignSystem): { face: string; weight: number; italic: boolean }[] => [
  { face: sys.tokens.fonts.display, weight: sys.weights.display, italic: false },
  { face: sys.tokens.fonts.display, weight: 400, italic: false },
  { face: sys.tokens.fonts.body, weight: sys.weights.body, italic: false },
  { face: sys.tokens.fonts.body, weight: 600, italic: false },
];

export type { TextNode };
