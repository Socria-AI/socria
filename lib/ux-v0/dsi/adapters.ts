// lib/ux-v0/dsi/adapters.ts — one design system, read by every product through references, never copied by hand.
//
//   websites   the canonical system as the website pipeline's DesignSystem (lib/ux-v0/design-system.ts): its roles,
//              faces (with the faces SocriaUX draws them with), type scale, spacing, radii, components and binding
//              rules — so briefWithSystem, conformance and offSystem work unchanged
//   graphics   the graphic document's tokens (seven colours, two faces, a second accent)
//   boards     the Master Design System's identity (tokens, weights, case, logo, constraints) laid over the board's
//              own expression (composition, shapes, motifs, vocabulary, style), which stays the board's
//   logos      the approved imported logo, placed as a linked, protected instance (never redrawn or recoloured)
//
// Only identity crosses over. Composition, layout and every other expressive decision stay with the generative engine.

import { contrastRatio } from '../../ux/audit';
import { mix } from '../color';
import { standInFor, type DesignSystem, type DSColour, type DSRole } from '../design-system';
import { knownFont, nearestWeight } from '../fonts';
import type { Asset, GraphicDoc, ImageNode, Node, TextNode, Tokens } from '../graphics/doc';
import type { GraphicDirection } from '../graphics/compose';
import type { MasterDesignSystem } from '../boards/system';
import { assetDocId, assetHref } from './assets';
import { preferPaletteInk, respectClearSpace, snapToPalette } from '../graphics/brandguard';
import { refineDoc, type GFinding } from '../graphics/check';
import type { Measure } from '../graphics/text';
import { dimensionKind } from './classify';
import { hexOf } from './colour';
import { bindingRules, visualLanguageOf } from './intelligence';
import { canOverride, px, resolveToken, roleFamily, roleHex, type Layer } from './tokens';
import type { BrandAsset, ProductRole, SystemContent, TokenValue } from './schema';

export interface AdaptOpts {
  mode?: string;
  /** project overrides (only those the system allows are used) */
  overrides?: Record<string, TokenValue>;
  link?: { id: string; version: number; name: string };
}

/** The project layer of overrides, kept to what governance allows. */
export function projectLayers(c: SystemContent, overrides: Record<string, TokenValue> | undefined): Layer[] {
  if (!overrides || !Object.keys(overrides).length) return [];
  const allowed: Record<string, TokenValue> = {};
  for (const [p, v] of Object.entries(overrides)) if (canOverride(c, 'project', p).ok) allowed[p] = v;
  return [{ level: 'project', overrides: allowed }];
}

export interface ProductPalette {
  colors: Record<'background' | 'surface' | 'text' | 'muted' | 'accent' | 'accentText' | 'line', string>;
  accent2?: string;
  /** roles the system does not bind, and how the products derived them */
  derived: string[];
  fonts: { display: string; body: string; mono?: string };
  /** the families as the system names them, and the face SocriaUX draws each with */
  families: { role: 'display' | 'body' | 'mono'; family: string; standIn: string }[];
  weights: { display?: number; body?: number };
}

/** Every product role as a value: bound roles through their tokens (with overrides and the mode), the rest derived and said. */
export function productPalette(c: SystemContent, opts: AdaptOpts = {}): ProductPalette {
  const ctx = { mode: opts.mode, layers: projectLayers(c, opts.overrides) };
  const derived: string[] = [];
  const get = (r: ProductRole) => roleHex(c, r, ctx);
  const background = get('background') ?? '#ffffff';
  if (!c.roles.background) derived.push('Background: not in the system, white used');
  let text = get('text');
  if (!text) {
    text = contrastRatio('#111111', background) >= contrastRatio('#ffffff', background) ? '#111111' : '#ffffff';
    derived.push('Text: not in the system, the most readable neutral on the background used');
  }
  let accent = get('accent');
  if (!accent) {
    accent = text;
    derived.push('Accent: not in the system, the text colour used');
  }
  const surface = get('surface') ?? background;
  if (!c.roles.surface) derived.push('Surface: the background');
  let muted = get('muted');
  if (!muted || contrastRatio(muted, background) < 4.5) {
    if (muted) derived.push('Secondary text: the system’s did not read at 4.5:1 on the background, so a mix of text and background was used');
    else derived.push('Secondary text: mixed from text and background');
    muted = mix(text, background, 0.35);
  }
  const line = get('line') ?? mix(background, text, 0.16);
  if (!c.roles.line) derived.push('Lines: mixed from background and text');
  let accentText = get('accentText');
  if (!accentText || contrastRatio(accentText, accent) < 4.5) {
    if (accentText) derived.push('Text on the accent: the system’s did not read at 4.5:1, so the more readable of white and near-black was used');
    accentText = contrastRatio('#ffffff', accent) >= contrastRatio('#111111', accent) ? '#ffffff' : '#111111';
  }
  // a second accent the composer can use without mixing one: the system's own next brand colour when none is bound
  let accent2 = get('accent2') ?? undefined;
  if (!accent2) {
    const sat = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const mx = Math.max(r, g, b);
      return mx ? (mx - Math.min(r, g, b)) / mx : 0;
    };
    const seen = new Set([background, text, accent].map((h) => h.toLowerCase()));
    const cands = Object.values(c.tokens)
      .filter((t) => t.type === 'color' && !t.deprecated)
      .map((t) => {
        const r = resolveToken(c, t.path, ctx);
        return r.ok ? hexOf(r.value) : null;
      })
      .filter((h): h is string => !!h && !seen.has(h) && sat(h) > 0.2 && contrastRatio(h, background) >= 1.5);
    if (cands.length) {
      accent2 = cands.sort((a, b) => sat(b) - sat(a))[0];
      derived.push(`Second accent: not bound, so the system’s next brand colour (${accent2}) is used`);
    }
  }
  const families: ProductPalette['families'] = [];
  for (const role of ['display', 'body', 'mono'] as const) {
    const fam = roleFamily(c, role, ctx);
    if (fam) families.push({ role, family: fam, standIn: standInFor(fam, role) });
  }
  const display = families.find((f) => f.role === 'display')?.standIn ?? families.find((f) => f.role === 'body')?.standIn ?? 'Inter';
  const body = families.find((f) => f.role === 'body')?.standIn ?? (knownFont(display)?.displayOnly ? 'Inter' : display);
  const w = (path: string) => {
    const r = c.tokens[path] ? resolveToken(c, path, ctx) : null;
    return r?.ok && typeof r.value === 'number' ? r.value : r?.ok && typeof r.value === 'string' && /^\d+$/.test(r.value) ? Number(r.value) : undefined;
  };
  return {
    colors: { background, surface, text, muted, accent, accentText, line },
    ...(accent2 ? { accent2 } : {}),
    derived,
    fonts: { display, body, ...(families.find((f) => f.role === 'mono') ? { mono: families.find((f) => f.role === 'mono')!.standIn } : {}) },
    families,
    weights: { display: w('font.weight.display') ?? w('font.weight.heading'), body: w('font.weight.body') ?? w('font.weight.text') },
  };
}

const dims = (c: SystemContent, kind: string, opts: AdaptOpts) =>
  [
    ...new Set(
      Object.values(c.tokens)
        .filter((t) => t.type === 'dimension' && dimensionKind(t.path) === kind)
        .map((t) => {
          const r = resolveToken(c, t.path, { mode: opts.mode });
          return r.ok ? px(r.value) : null;
        })
        .filter((x): x is number => x !== null && x >= 0 && x < 999),
    ),
  ].sort((a, b) => a - b);

/** The system as the website pipeline's DesignSystem (see the head of this file). */
export function toWebsiteSystem(c: SystemContent, opts: AdaptOpts = {}): DesignSystem {
  const pal = productPalette(c, opts);
  const colours: DSColour[] = [];
  for (const t of Object.values(c.tokens)) {
    if (t.type !== 'color' || colours.length >= 60) continue;
    const r = resolveToken(c, t.path);
    const hex = r.ok ? hexOf(r.value) : null;
    if (hex) colours.push({ name: t.path.slice(0, 60), hex, mode: 'light' });
    for (const m of c.modes.slice(1)) {
      if (!t.modes?.[m]) continue;
      const rm = resolveToken(c, t.path, { mode: m });
      const hm = rm.ok ? hexOf(rm.value) : null;
      if (hm && m === 'dark' && colours.length < 64) colours.push({ name: t.path.slice(0, 60), hex: hm, mode: 'dark' });
    }
  }
  const roles: Partial<Record<DSRole, string>> = { ...pal.colors };
  const rules = [...bindingRules(c).hard, ...bindingRules(c).soft].map((i) => i.statement).slice(0, 20);
  return {
    name: c.identity.name.slice(0, 60),
    source: { kind: 'file', ref: `${c.identity.name}${opts.link ? ` (design system v${opts.link.version})` : ''}`.slice(0, 160), files: [] },
    colours,
    roles,
    fonts: pal.families.map((f) => ({ role: f.role, family: f.family.slice(0, 60), standIn: f.standIn })),
    sizes: dims(c, 'fontSize', opts).filter((x) => x >= 8 && x <= 160).slice(0, 12),
    spacing: dims(c, 'spacing', opts).filter((x) => x > 0 && x <= 200).slice(0, 16),
    radii: dims(c, 'radius', opts).slice(0, 8),
    components: c.components.slice(0, 24).map((x) => ({ name: x.name.slice(0, 40), notes: (x.description || (x.variants.length ? `${x.variants.length} variants: ${x.properties.map((p) => p.name).join(', ')}` : '')).slice(0, 200) })),
    rules,
    notes: [...pal.families.filter((f) => f.standIn !== f.family).map((f) => `Your system's “${f.family}” is drawn with ${f.standIn}, the closest face SocriaUX can serve.`), ...pal.derived].slice(0, 8),
    importedAt: Date.now(),
    ...(opts.link ? { link: opts.link } : {}),
  };
}

/** The system as a graphic document's tokens. */
export function toGraphicTokens(c: SystemContent, opts: AdaptOpts = {}): Tokens {
  const pal = productPalette(c, opts);
  return { colors: { ...pal.colors }, fonts: { display: pal.fonts.display, body: pal.fonts.body }, ...(pal.accent2 ? { accent2: pal.accent2 } : {}) };
}

/** The approved logo for a ground (the reversed artwork on a dark one, when the system has it); never a low-resolution raster. */
export function brandLogo(c: SystemContent, ground?: string): BrandAsset | null {
  const ok = c.assets.filter((a) => a.kind === 'logo' && a.approved && !a.lowRes && !c.governance.restrictedAssets.includes(a.id));
  if (!ok.length) return null;
  const dark = ground ? contrastRatio('#ffffff', ground) > contrastRatio('#111111', ground) : false;
  if (dark) {
    const rev = ok.find((a) => a.role === 'reversed');
    if (rev) return rev;
  }
  return ok.find((a) => a.role === 'primary') ?? ok.find((a) => a.role !== 'reversed' && a.role !== 'favicon') ?? ok[0];
}

/** The system's identity laid over a board's Master Design System (its expression kept), or a new one when there is none. */
export function toMasterSystem(c: SystemContent, base: MasterDesignSystem | null, opts: AdaptOpts & { assetId?: string } = {}): MasterDesignSystem {
  const pal = productPalette(c, opts);
  const vl = visualLanguageOf(c);
  const rules = [...bindingRules(c).hard, ...bindingRules(c).soft].map((i) => i.statement);
  const logo = brandLogo(c, pal.colors.background);
  const tokens: Tokens = { colors: { ...pal.colors }, fonts: { display: pal.fonts.display, body: pal.fonts.body }, ...(pal.accent2 ? { accent2: pal.accent2 } : {}) };
  const weights = { display: nearestWeight(pal.fonts.display, pal.weights.display ?? base?.weights.display ?? 600), body: nearestWeight(pal.fonts.body, pal.weights.body ?? base?.weights.body ?? 400) };
  const guard = brandGuardOf(c, opts);
  const brand = opts.link ? { brand: { ...opts.link, ...(guard.palette ? { palette: guard.palette } : {}), ...(guard.clearSpace ? { clearSpace: guard.clearSpace } : {}), ...(guard.minLogo ? { minLogo: guard.minLogo } : {}) } } : {};
  const logoField = logo ? { text: c.identity.name.slice(0, 80), asset: opts.assetId ?? assetDocId(logo) } : base?.logo ? { ...base.logo, text: c.identity.name.slice(0, 80) || base.logo.text } : { text: c.identity.name.slice(0, 80) };
  if (base) {
    const own = base.constraints.filter((x) => !rules.includes(x));
    return {
      ...base,
      name: c.identity.name.slice(0, 80) || base.name,
      tokens,
      weights,
      type: { ...base.type, ...(vl.case ? { case: vl.case } : {}) },
      logo: logoField,
      constraints: [...rules, ...own].slice(0, 12),
      ...(vl.personality.length ? { personality: vl.personality.flatMap((p) => p.split(/,\s*/)).slice(0, 8).map((p) => p.slice(0, 30)) } : {}),
      ...(vl.imagery.length ? { imagery: vl.imagery[0].slice(0, 200) } : {}),
      ...brand,
    };
  }
  return {
    version: 1,
    id: `sys${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: c.identity.name.slice(0, 80) || 'Brand system',
    direction: { name: `${c.identity.name} identity`.slice(0, 80), language: 'editorial', ...(c.identity.description ? { concept: c.identity.description.slice(0, 400) } : {}) },
    personality: vl.personality.flatMap((p) => p.split(/,\s*/)).slice(0, 8).map((p) => p.slice(0, 30)),
    tokens,
    weights,
    type: { case: vl.case ?? 'sentence', tracking: 'normal' },
    composition: { intensity: 45, density: vl.density === 'compact' ? 'dense' : vl.density === 'spacious' ? 'airy' : 'balanced' },
    shape: null,
    motifs: vl.motifs.slice(0, 8).map((m) => m.slice(0, 30)),
    imagery: (vl.imagery[0] ?? 'the brief’s own pictures, as they are').slice(0, 200),
    logo: logoField,
    constraints: rules.slice(0, 12),
    ...brand,
  };
}

/** A board asset for the system's approved logo (the file itself, under a stable id), for boards and graphics. */
export function logoBoardAsset(c: SystemContent, ground?: string): Asset | null {
  const logo = brandLogo(c, ground);
  if (!logo) return null;
  const src = assetHref(logo);
  if (!src || !/^data:image\/(svg\+xml|png|jpeg|webp);base64,/.test(src)) return null;
  return { id: assetDocId(logo), kind: 'image', src, width: Math.round(logo.width ?? 600), height: Math.round(logo.height ?? 200), name: `${logo.name} (approved logo)`, source: 'upload' };
}

/** A graphic direction speaking the system's identity, its expression (composition, shapes, style, engine) its own. */
export function directionInBrand(c: SystemContent, d: GraphicDirection, opts: AdaptOpts = {}): GraphicDirection {
  const pal = productPalette(c, opts);
  const vl = visualLanguageOf(c);
  return {
    ...d,
    name: `${d.name} · ${c.identity.name}`.slice(0, 80),
    tokens: { colors: { ...pal.colors }, fonts: { display: pal.fonts.display, body: pal.fonts.body }, ...(pal.accent2 ? { accent2: pal.accent2 } : {}) },
    look: { ...d.look, ...(vl.case ? { case: vl.case } : {}), ...(pal.weights.display ? { weight: nearestWeight(pal.fonts.display, pal.weights.display) } : {}) },
  };
}

/**
 * The approved logo placed where a graphic sets the brand's name as a logo: a linked image of the approved file,
 * fitted inside the same box at its own proportions (never stretched, cropped or recoloured), its asset added once.
 */
export function placeBrandLogo(doc: GraphicDoc, c: SystemContent): { doc: GraphicDoc; placed: number } {
  const name = c.identity.name.trim().toLowerCase();
  let placed = 0;
  const used = new Map<string, Asset>();
  const artboards = doc.artboards.map((b) => {
    const ground = typeof b.background === 'string' ? b.background : '#ffffff';
    const children = b.children.map((n): Node => {
      if (n.type !== 'text' || n.role !== 'logo' || n.decorative) return n;
      const t = n as TextNode;
      if (name && t.text.trim().toLowerCase() !== name) return n;
      const a = logoBoardAsset(c, ground);
      if (!a) return n;
      used.set(a.id, a);
      placed++;
      const box = { x: t.x, y: t.y, w: t.w, h: Math.max(t.h, t.size * 1.2) };
      const k = Math.min(box.w / a.width, box.h / a.height);
      const w = Math.round(a.width * k * 100) / 100;
      const h = Math.round(a.height * k * 100) / 100;
      const x = t.align === 'center' ? box.x + (box.w - w) / 2 : t.align === 'right' ? box.x + box.w - w : box.x;
      const img: ImageNode = { id: `${t.id}B`, type: 'image', name: `${c.identity.name} logo (approved, linked)`, role: 'logo', x, y: box.y + (box.h - h) / 2, w, h, rotation: 0, opacity: 1, asset: a.id, fit: 'contain', link: `brand:${a.id}` };
      return img;
    });
    return { ...b, children };
  });
  if (!placed) return { doc, placed };
  const assets = [...doc.assets.filter((x) => !used.has(x.id)), ...used.values()];
  return { doc: { ...doc, artboards, assets, revision: doc.revision + 1 }, placed };
}

/** Every product slot's value for the system (what applying it writes), keyed "colors.accent", "fonts.display", "radius"… */
export function productSlots(c: SystemContent, opts: AdaptOpts = {}): Record<string, string | number> {
  const pal = productPalette(c, opts);
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(pal.colors)) out[`colors.${k}`] = v;
  if (pal.accent2) out['colors.accent2'] = pal.accent2;
  out['fonts.display'] = pal.fonts.display;
  out['fonts.body'] = pal.fonts.body;
  if (pal.weights.display) out['weights.display'] = pal.weights.display;
  const radii = dims(c, 'radius', opts);
  if (radii.length) {
    const m = radii[Math.floor((radii.length - 1) / 2)];
    out.radius = m < 2 ? 'none' : m <= 10 ? 'soft' : 'round';
  }
  const vl = visualLanguageOf(c);
  if (vl.case) out.case = vl.case;
  const logo = brandLogo(c);
  if (logo) out.logo = assetDocId(logo);
  return out;
}

/** What a composed design must be held to by the system's rules: its palette (when the system allows its palette only),
 * the logo's clear space and minimum size. */
export function brandGuardOf(c: SystemContent, opts: AdaptOpts = {}): { palette?: string[]; clearSpace?: number; minLogo?: number } {
  const { hard, soft } = bindingRules(c);
  const find = <K extends string>(k: K) => [...hard, ...soft].map((i) => i.check).find((x) => x?.kind === k);
  // the palette is identity: a composition made in the system keeps to it (colours the composer would mix or take from
  // a style's own palette go to the nearest system colour), whether or not the system says so in a rule
  const cs = find('logo-clear-space') as { kind: 'logo-clear-space'; ratio: number } | undefined;
  const ms = find('logo-min-size') as { kind: 'logo-min-size'; px: number } | undefined;
  const pal = paletteOf(c, opts);
  const palette = pal.length >= 2 ? pal : undefined;
  return { ...(palette ? { palette } : {}), ...(cs ? { clearSpace: cs.ratio } : {}), ...(ms ? { minLogo: ms.px } : {}) };
}

function paletteOf(c: SystemContent, opts: AdaptOpts): string[] {
  const out = new Set<string>();
  for (const mode of c.modes) for (const t of Object.values(c.tokens)) {
    if (t.type !== 'color') continue;
    const r = resolveToken(c, t.path, { mode });
    const h = r.ok ? hexOf(r.value) : null;
    if (h) out.add(h);
  }
  const pal = productPalette(c, opts);
  Object.values(pal.colors).forEach((h) => out.add(h.toLowerCase()));
  if (pal.accent2) out.add(pal.accent2.toLowerCase());
  return [...out].slice(0, 64);
}

/** A composed design held to the system's hard rules (palette only, the logo's clear space), said in notes. */
export function enforceBrand(doc: GraphicDoc, c: SystemContent, opts: AdaptOpts = {}): { doc: GraphicDoc; notes: string[] } {
  const g = brandGuardOf(c, opts);
  const notes: string[] = [];
  let d = doc;
  if (g.palette) {
    const r = snapToPalette(d, g.palette);
    d = r.doc;
    if (r.changed) notes.push(`${r.changed} colour${r.changed === 1 ? '' : 's'} the composition made moved to ${c.identity.name}’s palette`);
  }
  if (g.clearSpace) {
    const r = respectClearSpace(d, g.clearSpace, g.minLogo ?? 0);
    d = r.doc;
    if (r.scaled) notes.push(`The logo scaled down to keep its clear space`);
    if (r.panels) notes.push(`A panel set behind the logo to keep its clear space`);
  }
  return { doc: d, notes };
}

/**
 * A composition made in the system, made right before it is shown, in one order for every product: its approved logo
 * placed; the system's hard rules resolved (its palette, the logo's clear space); then the document's own checks and
 * repairs, judging the colours the design will really have (readability is sampled where the lines are, so a word on a
 * card that just took a system colour is caught); and a word a repair moved off the palette brought back to a system
 * colour that reads as well. What cannot be had in the system's colours is left readable and said by the fidelity check.
 */
export function guardedForBrand(doc: GraphicDoc, c: SystemContent, opts: AdaptOpts = {}, measure?: Measure): { doc: GraphicDoc; placed: number; notes: string[]; fixed: string[]; remaining: GFinding[] } {
  const placed = placeBrandLogo(doc, c);
  const guarded = enforceBrand(placed.doc, c, opts);
  const pal = brandGuardOf(c, opts).palette;
  // readability repairs take the system's colours only (an ink or a ground of its palette, never pure white or black)
  const refined = refineDoc(guarded.doc, measure, 2, pal ? { palette: pal } : {});
  const inked = pal ? preferPaletteInk(refined.doc, pal, measure) : { doc: refined.doc, moved: 0 };
  return { doc: inked.doc, placed: placed.placed, notes: guarded.notes, fixed: refined.fixed, remaining: refined.remaining };
}
