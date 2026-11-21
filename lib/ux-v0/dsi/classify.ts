// lib/ux-v0/dsi/classify.ts — what each token is: its type when the source does not say, its category (a primitive,
// a brand colour, a text colour, a status colour; a font size, a spacing step, a radius…), and which tokens play the
// parts the products need (the roles). Everything read from names or values here is an inference, with a confidence
// and a reason, shown for review; nothing inferred is ever treated as confirmed.

import { contrastRatio } from '../../ux/audit';
import { hexOf, isColour, parseColour } from './colour';
import { COLOUR_ROLES, type ColourRole, type FontRole, type ProductRole, type RoleBinding, type SystemContent, type Token, type TokenType, type TokenValue } from './schema';
import { dimensionText, durationText, isAlias, resolveToken, weightOf } from './tokens';

const dashed = (path: string) => path.toLowerCase().replace(/[._\s/]+/g, '-');

/** A token's type from its name and value, when the source does not give one. */
export function inferType(name: string, value: TokenValue): TokenType {
  const n = dashed(name);
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) {
    if (value.length === 4 && value.every((x) => typeof x === 'number')) return 'cubicBezier';
    if (value.every((x) => typeof x === 'string')) return 'fontFamily';
    if (value.every((x) => x && typeof x === 'object' && 'color' in (x as object) && 'position' in (x as object))) return 'gradient';
    if (value.every((x) => x && typeof x === 'object' && ('offsetX' in (x as object) || 'blur' in (x as object)))) return 'shadow';
    return 'string';
  }
  if (value && typeof value === 'object') {
    const r = value as Record<string, unknown>;
    if ('colorSpace' in r || 'components' in r) return 'color';
    if ('fontFamily' in r || 'fontSize' in r || 'lineHeight' in r) return 'typography';
    if ('offsetX' in r || 'blur' in r || 'spread' in r) return 'shadow';
    if ('width' in r && 'style' in r) return 'border';
    if ('duration' in r || 'timingFunction' in r) return 'transition';
    if ('value' in r && 'unit' in r) return r.unit === 'ms' || r.unit === 's' ? 'duration' : 'dimension';
    return 'string';
  }
  if (typeof value === 'number') {
    if (/weight/.test(n) && weightOf(value)) return 'fontWeight';
    return 'number';
  }
  const s = String(value).trim();
  if (isAlias(s)) return /colou?r|bg|background|fg|foreground|border|fill|stroke|ink|brand|accent|primary|surface/.test(n) ? 'color' : /font-?family|typeface|face/.test(n) ? 'fontFamily' : /space|spacing|size|radius|gap|width|height/.test(n) ? 'dimension' : 'string';
  if (/gradient\(/i.test(s)) return 'gradient';
  if (isColour(s) && !/^\d+$/.test(s)) return 'color';
  if (/^cubic-bezier\(/i.test(s) || /^(ease|ease-in|ease-out|ease-in-out|linear)$/i.test(s) && /eas|motion|timing|curve/.test(n)) return 'cubicBezier';
  if (durationText(s) && !/^0$/.test(s)) return 'duration';
  if (/weight/.test(n) && weightOf(s)) return 'fontWeight';
  if (/line-?height|leading|opacity|z-?index|ratio|scale|columns?$/.test(n) && /^-?[\d.]+$/.test(s)) return 'number';
  if (dimensionText(s)) return 'dimension';
  if (/^-?[\d.]+$/.test(s)) return /weight/.test(n) ? 'fontWeight' : 'number';
  if (/shadow/.test(n) && /\d/.test(s)) return 'shadow';
  if (/^(solid|dashed|dotted|double)$/i.test(s)) return 'strokeStyle';
  if (/^(normal|italic|oblique)$/i.test(s) && /style/.test(n)) return 'fontStyle';
  if (/font|family|typeface|face/.test(n) || /^["']?[A-Z][\w ]+["']?\s*,\s*(sans-serif|serif|monospace|system-ui)/.test(s)) return 'fontFamily';
  return 'string';
}

export const COLOUR_CATEGORIES = ['primitive', 'semantic', 'brand', 'text', 'background', 'border', 'status', 'gradient', 'other'] as const;
export type ColourCategory = (typeof COLOUR_CATEGORIES)[number];
export const TOP_CATEGORIES = ['colour', 'typography', 'layout', 'effects', 'other'] as const;
export type TopCategory = (typeof TOP_CATEGORIES)[number];

const HUES = /(^|-)(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|grey|neutral|slate|zinc|stone|sand|warm|cool|black|white|mono|ochre|navy|olive|coral|mint|gold|silver|sage|clay|plum|ink)(-|$)/;

/** A colour token's category, with how sure and why. */
export function colourCategory(t: Token): { category: ColourCategory; confidence: number; why: string } {
  const n = dashed(t.path);
  if (t.type === 'gradient') return { category: 'gradient', confidence: 1, why: 'its type is gradient' };
  if (/(^|-)(success|warning|warn|error|danger|info|positive|negative|critical|caution|notice|attention)(-|$)/.test(n)) return { category: 'status', confidence: 0.9, why: 'named for a status' };
  if (/(^|-)brand(-|$)/.test(n)) return { category: 'brand', confidence: 0.95, why: 'in a group named brand' };
  if (/(^|-)(text|fg|foreground|ink|content|on-[a-z]+|copy|heading)(-|$)/.test(n)) return { category: 'text', confidence: 0.85, why: 'named for text' };
  if (/(^|-)(background|bg|surface|canvas|page|backdrop|layer|elevation|card|panel)(-|$)/.test(n)) return { category: 'background', confidence: 0.85, why: 'named for a background or surface' };
  if (/(^|-)(border|line|divider|outline|stroke|separator|rule|ring)(-|$)/.test(n)) return { category: 'border', confidence: 0.85, why: 'named for borders and lines' };
  if (/(^|-)(palette|primitive|primitives|core|base|ref|global|scale)(-|$)/.test(n) || (HUES.test(n) && /(-|^)\d{2,3}(-|$)|-\d{1,3}$/.test(n))) return { category: 'primitive', confidence: 0.8, why: 'a step of a named scale' };
  if (isAlias(t.value) || /(^|-)(semantic|sys|alias|action|interactive|primary|secondary|tertiary|accent|link|focus|selected|hover|active|disabled|cta)(-|$)/.test(n)) return { category: 'semantic', confidence: isAlias(t.value) ? 0.8 : 0.6, why: isAlias(t.value) ? 'refers to another colour' : 'named for a use' };
  if (HUES.test(n)) return { category: 'primitive', confidence: 0.55, why: 'named for a hue' };
  return { category: 'other', confidence: 0.3, why: 'nothing in its name says' };
}

export const DIMENSION_KINDS = ['fontSize', 'lineHeight', 'letterSpacing', 'spacing', 'sizing', 'radius', 'borderWidth', 'breakpoint', 'grid', 'blur', 'other'] as const;
export type DimensionKind = (typeof DIMENSION_KINDS)[number];

export function dimensionKind(path: string): DimensionKind {
  const n = dashed(path);
  if (/radius|radii|rounded|corner/.test(n)) return 'radius';
  if (/font-?size|text-(2xs|xs|sm|base|md|lg|xl|\dxl)|(^|-)(type|font)-(scale|size)|heading-\d|(^|-)size-(display|heading|body|caption)|display-size/.test(n)) return 'fontSize';
  if (/line-?height|leading/.test(n)) return 'lineHeight';
  if (/letter-?spacing|tracking|kerning/.test(n)) return 'letterSpacing';
  if (/breakpoint|screen|media|viewport/.test(n)) return 'breakpoint';
  if (/border-?width|stroke-?width|outline-?width|hairline/.test(n)) return 'borderWidth';
  if (/grid|gutter|columns?|container|max-?width/.test(n)) return 'grid';
  if (/blur/.test(n)) return 'blur';
  if (/space|spacing|gap|inset|padding|margin|stack|inline/.test(n)) return 'spacing';
  if (/size|sizing|width|height|icon|avatar|control/.test(n)) return 'sizing';
  return 'other';
}

/** A token's top category, for grouping it in the manager and the preview. */
export function topCategory(t: Token): TopCategory {
  switch (t.type) {
    case 'color':
    case 'gradient':
      return 'colour';
    case 'fontFamily':
    case 'fontWeight':
    case 'fontStyle':
    case 'typography':
      return 'typography';
    case 'shadow':
    case 'duration':
    case 'cubicBezier':
    case 'transition':
      return 'effects';
    case 'border':
    case 'strokeStyle':
      return 'layout';
    case 'dimension': {
      const k = dimensionKind(t.path);
      return k === 'fontSize' || k === 'lineHeight' || k === 'letterSpacing' ? 'typography' : k === 'blur' ? 'effects' : 'layout';
    }
    case 'number': {
      const n = dashed(t.path);
      return /line-?height|leading|weight/.test(n) ? 'typography' : /opacity|duration|delay/.test(n) ? 'effects' : /z-?index|columns?|ratio|scale/.test(n) ? 'layout' : 'other';
    }
    default:
      return 'other';
  }
}

// ── roles ──

const ROLE_NAMES: [ColourRole, RegExp][] = [
  ['accentText', /(^|-)on-(primary|brand|accent|action)(-|$)|(^|-)(primary|brand|accent|action)-(foreground|fg|text|contrast|on)(-|$)/],
  ['muted', /(text|foreground|fg|content)-(muted|secondary|subtle|weak|subdued|tertiary)(-|$)|(muted|subtle|subdued|weak)-(text|foreground|fg|content)(-|$)|(^|-)muted$/],
  ['line', /(^|-)(border|line|divider|outline|separator|rule)(-default|-subtle|-primary|-base)?$/],
  ['surface', /(^|-)(surface|card|panel|elevated|raised|container|paper)(-default|-primary|-1|-base)?$/],
  ['background', /(^|-)(background|bg|canvas|page|backdrop|surface-0)(-default|-primary|-base|-canvas)?$/],
  ['text', /(^|-)(text|foreground|fg|ink|content|on-background|on-surface|body)(-default|-primary|-base|-strong)?$/],
  ['accent', /(^|-)(primary|brand|accent|action|interactive|cta)(-default|-base|-main|-500|-600|-700|-primary)?$/],
  ['accent2', /(^|-)(secondary|accent-2|accent2|highlight|tertiary)(-default|-base|-main|-500)?$/],
];

const lumOf = (hex: string) => {
  const c = parseColour(hex);
  return c ? 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b : 0.5;
};
const satOf = (hex: string) => {
  const c = parseColour(hex);
  if (!c) return 0;
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

/**
 * Which token plays each role, read from names first (semantic tokens over primitives), and from what the colours are
 * otherwise (the lightest unsaturated colour for a light ground, the darkest for text, the most saturated readable one
 * for the accent). Every binding is inferred, with its reason; a role nothing fits is left unbound for the products to
 * derive, never filled with a colour the system does not have.
 */
export function inferRoles(c: SystemContent): Partial<Record<ProductRole, RoleBinding>> {
  const out: Partial<Record<ProductRole, RoleBinding>> = {};
  const cache = new Map();
  const colours = Object.values(c.tokens)
    .filter((t) => t.type === 'color' && !t.deprecated)
    .map((t) => {
      const r = resolveToken(c, t.path, { cache });
      return { t, hex: r.ok ? hexOf(r.value) : null, cat: colourCategory(t).category };
    })
    .filter((x): x is { t: Token; hex: string; cat: ColourCategory } => !!x.hex);
  // semantic tokens first, then brand, then the rest; shorter paths first within a rank
  const rank = (x: { cat: ColourCategory; t: Token }) => (x.cat === 'semantic' || x.cat === 'text' || x.cat === 'background' || x.cat === 'border' ? 0 : x.cat === 'brand' ? 1 : x.cat === 'primitive' ? 3 : 2);
  const ordered = [...colours].sort((a, b) => rank(a) - rank(b) || a.t.path.split('.').length - b.t.path.split('.').length || a.t.path.length - b.t.path.length);
  const taken = new Set<string>();
  for (const [role, re] of ROLE_NAMES) {
    const hit = ordered.find((x) => re.test(dashed(x.t.path)) && !taken.has(x.t.path) && x.cat !== 'status');
    if (hit) {
      out[role] = { path: hit.t.path, status: 'inferred', confidence: hit.cat === 'primitive' ? 0.6 : 0.85, why: `named ${hit.t.path}` };
      taken.add(hit.t.path);
    }
  }
  const pool = colours.filter((x) => x.cat !== 'status');
  if (!out.background && pool.length) {
    const bg = [...pool].sort((a, b) => lumOf(b.hex) - lumOf(a.hex)).find((x) => satOf(x.hex) < 0.35) ?? pool[0];
    out.background = { path: bg.t.path, status: 'inferred', confidence: 0.5, why: 'the lightest quiet colour' };
  }
  const bgHex = out.background ? colours.find((x) => x.t.path === out.background!.path)?.hex ?? '#ffffff' : '#ffffff';
  if (!out.text && pool.length) {
    const tx = [...pool].sort((a, b) => contrastRatio(b.hex, bgHex) - contrastRatio(a.hex, bgHex))[0];
    if (tx && contrastRatio(tx.hex, bgHex) >= 4.5) out.text = { path: tx.t.path, status: 'inferred', confidence: 0.5, why: 'the colour that reads best on the background' };
  }
  if (!out.accent) {
    const textHex = out.text ? colours.find((x) => x.t.path === out.text!.path)?.hex : null;
    const ac = pool.filter((x) => x.hex !== bgHex && x.hex !== textHex && contrastRatio(x.hex, bgHex) >= 3).sort((a, b) => satOf(b.hex) - satOf(a.hex))[0];
    if (ac && satOf(ac.hex) > 0.15) out.accent = { path: ac.t.path, status: 'inferred', confidence: 0.45, why: 'the most saturated colour that reads on the background' };
  }
  // fonts: display and body by name; one family plays both when there is one
  const fams = Object.values(c.tokens).filter((t) => t.type === 'fontFamily' && !t.deprecated);
  const byName = (re: RegExp) => fams.find((t) => re.test(dashed(t.path)));
  const display = byName(/display|heading|headline|title|brand|serif(?!.*sans)/);
  const body = byName(/body|text|base|copy|paragraph|sans|primary|default|ui/);
  const mono = byName(/mono|code/);
  const set = (role: FontRole, t: Token | undefined, conf: number, why: string) => t && (out[role] = { path: t.path, status: 'inferred', confidence: conf, why });
  set('display', display ?? body ?? fams.find((t) => t !== mono), display ? 0.8 : 0.5, display ? `named ${display.path}` : 'the only family for headlines');
  set('body', body ?? fams.find((t) => t !== display && t !== mono) ?? display, body ? 0.8 : 0.5, body ? `named ${body.path}` : 'the family for text');
  set('mono', mono, 0.85, mono ? `named ${mono.path}` : '');
  return out;
}

/** Roles inferred again where the owner has not confirmed them (confirmed bindings are never replaced). */
export function refreshRoles(c: SystemContent): SystemContent {
  const inferred = inferRoles(c);
  const roles = { ...c.roles };
  for (const [k, b] of Object.entries(inferred) as [ProductRole, RoleBinding][]) if (!roles[k] || (roles[k]!.status === 'inferred' && !c.tokens[roles[k]!.path])) roles[k] = b;
  for (const k of Object.keys(roles) as ProductRole[]) if (roles[k] && !c.tokens[roles[k]!.path]) delete roles[k];
  return { ...c, roles };
}

/** What the system holds, counted by category, for the preview and the manager. */
export function census(c: SystemContent): { total: number; byTop: Record<TopCategory, number>; colours: Record<ColourCategory, number>; dimensions: Record<DimensionKind, number>; aliases: number; modes: number; components: number; assets: number; logos: number } {
  const byTop = Object.fromEntries(['colour', 'typography', 'layout', 'effects', 'other'].map((k) => [k, 0])) as Record<TopCategory, number>;
  const colours = Object.fromEntries(COLOUR_CATEGORIES.map((k) => [k, 0])) as Record<ColourCategory, number>;
  const dimensions = Object.fromEntries(['fontSize', 'lineHeight', 'letterSpacing', 'spacing', 'sizing', 'radius', 'borderWidth', 'breakpoint', 'grid', 'blur', 'other'].map((k) => [k, 0])) as Record<DimensionKind, number>;
  let aliases = 0;
  for (const t of Object.values(c.tokens)) {
    byTop[topCategory(t)]++;
    if (t.type === 'color' || t.type === 'gradient') colours[colourCategory(t).category]++;
    if (t.type === 'dimension') dimensions[dimensionKind(t.path)]++;
    if (isAlias(t.value)) aliases++;
  }
  return { total: Object.keys(c.tokens).length, byTop, colours, dimensions, aliases, modes: c.modes.length, components: c.components.length, assets: c.assets.length, logos: c.assets.filter((a) => a.kind === 'logo').length };
}

export const COLOUR_ROLE_SET: ReadonlySet<string> = new Set(COLOUR_ROLES);
