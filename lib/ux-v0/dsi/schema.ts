// lib/ux-v0/dsi/schema.ts — the canonical design system: one shape every source is read into and every product reads
// from (docs/SOCRIAUX-DESIGN-SYSTEM-INTELLIGENCE.md).
//
// A design system here is identity, not layout. It holds:
//
//   identity      its name, description, tagline, audience, website
//   modes         its themes (the first is the default: "light", then "dark", "high-contrast"…)
//   tokens        every decision as a token: colours (primitive, semantic, brand, text, background, border, status,
//                 gradients), typography (families, weights, sizes, line heights, tracking, composite styles), layout
//                 (spacing, sizing, radius, breakpoints, grid), effects (shadows, blur, opacity, motion). A token's value
//                 is a literal or a reference to another token ("{color.brand.primary}"), per mode, with provenance
//   roles         which token plays each part the products need (the ground, the ink, the accent, the display face…),
//                 each confirmed or inferred
//   components    definitions read from the source (names, variants, properties, the tokens they use) — never code
//   assets        logos, icons, pictures and font files, sanitized, hashed, with licence and protection
//   intelligence  what the brand is like: each statement confirmed (stated by the source or the owner), approved (an
//                 interpretation the owner accepted) or inferred (a suggestion), with its evidence
//   governance    what may never change (locked tokens), what may be overridden where, restricted assets, review
//   unknown       whatever the source held that SocriaUX does not read, kept as it was
//
// Nothing here is a layout, a composition or a template: the generative engine decides expression.

export const DSI_SCHEMA = 1;

export const TOKEN_TYPES = ['color', 'dimension', 'fontFamily', 'fontWeight', 'fontStyle', 'number', 'duration', 'cubicBezier', 'shadow', 'gradient', 'typography', 'border', 'strokeStyle', 'transition', 'string', 'boolean'] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

export const SOURCE_KINDS = ['json', 'css', 'markdown', 'pdf', 'website', 'figma', 'github', 'asset', 'project', 'manual', 'socriaux'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Where a value came from, exactly enough to find it again. */
export interface SourceRef {
  kind: SourceKind;
  /** the file name, URL, Figma file key, repository or project the import was made from */
  ref: string;
  file?: string;
  /** the property, variable or selector it was read from */
  property?: string;
  selector?: string;
  page?: number;
  line?: number;
  /** Figma ids: the node, variable and collection, and the file's version */
  nodeId?: string;
  variableId?: string;
  collectionId?: string;
  mode?: string;
  version?: string;
}

export type TokenValue = string | number | boolean | { [k: string]: unknown } | unknown[];

export const PROVENANCE_STATUSES = ['imported', 'edited', 'inferred', 'confirmed'] as const;
export type ProvenanceStatus = (typeof PROVENANCE_STATUSES)[number];

export interface Provenance {
  source: SourceRef;
  importedAt: number;
  /** the value as the source gave it */
  original: TokenValue;
  /** imported as the source said it; edited since; inferred by SocriaUX; confirmed by the owner */
  status: ProvenanceStatus;
  /** 1: stated by the source; lower: read from names, values or context */
  confidence: number;
  note?: string;
}

export interface Token {
  /** dot-separated, stable: "color.brand.primary" */
  path: string;
  type: TokenType;
  /** the default mode's value: a literal of its type or a reference "{other.token}" (composites may hold references) */
  value: TokenValue;
  /** other modes' values, where they differ */
  modes?: Record<string, TokenValue>;
  description?: string;
  deprecated?: boolean | string;
  provenance: Provenance;
  /** $extensions and other properties the source carried, kept */
  extensions?: Record<string, unknown>;
}

export interface GroupMeta {
  description?: string;
  type?: TokenType;
  extensions?: Record<string, unknown>;
}

export const COLOUR_ROLES = ['background', 'surface', 'text', 'muted', 'accent', 'accentText', 'line', 'accent2'] as const;
export const FONT_ROLES = ['display', 'body', 'mono'] as const;
export const PRODUCT_ROLES = [...COLOUR_ROLES, ...FONT_ROLES] as const;
export type ColourRole = (typeof COLOUR_ROLES)[number];
export type FontRole = (typeof FONT_ROLES)[number];
export type ProductRole = (typeof PRODUCT_ROLES)[number];
export const ROLE_LABEL: Record<ProductRole, string> = {
  background: 'Background',
  surface: 'Surface',
  text: 'Text',
  muted: 'Secondary text',
  accent: 'Accent',
  accentText: 'Text on accent',
  line: 'Lines and borders',
  accent2: 'Second accent',
  display: 'Display face',
  body: 'Text face',
  mono: 'Mono face',
};

export interface RoleBinding {
  path: string;
  status: 'confirmed' | 'inferred';
  confidence: number;
  why: string;
}

export interface ComponentDef {
  id: string;
  name: string;
  description: string;
  /** variants as the source names them, with their property values */
  variants: { name: string; props: Record<string, string> }[];
  properties: { name: string; type: 'variant' | 'boolean' | 'text' | 'instance' | 'other'; options?: string[]; default?: string }[];
  /** the tokens it uses, where the source says */
  tokens: string[];
  source: SourceRef;
  notes: string[];
}

export const ASSET_KINDS = ['logo', 'icon', 'image', 'font', 'pattern', 'other'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ASSET_FORMATS = ['svg', 'png', 'jpeg', 'webp', 'ttf', 'otf', 'woff', 'woff2'] as const;
export type AssetFormat = (typeof ASSET_FORMATS)[number];
export const LOGO_ROLES = ['primary', 'reversed', 'mark', 'wordmark', 'mono', 'favicon', 'secondary'] as const;

export interface FontMeta {
  family: string;
  subfamily: string;
  fullName: string;
  version: string;
  copyright: string;
  licence: string;
  licenceUrl: string;
  weight: number;
  italic: boolean;
}

export interface BrandAsset {
  id: string;
  name: string;
  kind: AssetKind;
  format: AssetFormat;
  mime: string;
  width?: number;
  height?: number;
  bytes: number;
  /** SHA-256 of the bytes as stored (after sanitizing, for SVG) */
  hash: string;
  role?: string;
  licence?: string;
  version: number;
  /** an approved logo: never redesigned, recoloured, cropped or distorted by SocriaUX */
  protected: boolean;
  approved: boolean;
  vector: boolean;
  /** a raster too small to stand for the logo itself: a reference, not a master */
  lowRes?: boolean;
  /** sanitized SVG markup (vector assets) */
  svg?: string;
  /** data: URL (small rasters) or upload:<id> (kept in this browser) */
  src?: string;
  source: SourceRef;
  importedAt: number;
  notes: string[];
  font?: FontMeta;
}

export const INTEL_KINDS = ['personality', 'tone', 'typography', 'colour', 'geometry', 'imagery', 'composition', 'restriction', 'motif', 'logo', 'other'] as const;
export type IntelKind = (typeof INTEL_KINDS)[number];
export const INTEL_STATUSES = ['confirmed', 'approved', 'inferred', 'rejected'] as const;
export type IntelStatus = (typeof INTEL_STATUSES)[number];

/** A rule SocriaUX can check on a design, when a statement says one. */
export type RuleCheck =
  | { kind: 'palette-only' }
  | { kind: 'fonts-only' }
  | { kind: 'min-contrast'; ratio: number }
  | { kind: 'logo-min-size'; px: number }
  | { kind: 'logo-clear-space'; ratio: number }
  | { kind: 'no-gradients' }
  | { kind: 'headline-case'; case: 'upper' | 'sentence' | 'lower' }
  | { kind: 'max-accents'; n: number }
  | { kind: 'logo-unaltered' };
export const CHECK_KINDS = ['palette-only', 'fonts-only', 'min-contrast', 'logo-min-size', 'logo-clear-space', 'no-gradients', 'headline-case', 'max-accents', 'logo-unaltered'] as const;

export interface Evidence {
  source: SourceRef;
  quote?: string;
}

export interface IntelItem {
  id: string;
  kind: IntelKind;
  statement: string;
  /** confirmed: stated by the source or the owner; approved: an interpretation the owner accepted; inferred: a suggestion */
  status: IntelStatus;
  /** how it was found: said in so many words, a value read off the source, or a reading of it */
  basis: 'explicit' | 'extracted' | 'inferred';
  evidence: Evidence[];
  confidence: number;
  /** hard: a constraint every design is held to; soft: a preference; none: information */
  enforce: 'hard' | 'soft' | 'none';
  check?: RuleCheck;
}

export const OVERRIDE_LEVELS = ['project', 'material', 'object'] as const;
export type OverrideLevel = (typeof OVERRIDE_LEVELS)[number];

export interface Governance {
  /** token paths (a trailing * matches a group) no project, material or object may override */
  locked: string[];
  /** where overrides are allowed, by level (paths or groups with *); a path not listed may not be overridden there */
  overridable: Record<OverrideLevel, string[]>;
  /** asset ids that may not be placed in designs */
  restrictedAssets: string[];
  /** publishing shows the changes and the validation and needs the owner's confirmation */
  requireReview: boolean;
}

export interface Identity {
  name: string;
  description: string;
  tagline?: string;
  audience?: string;
  website?: string;
}

export interface SystemContent {
  schema: typeof DSI_SCHEMA;
  identity: Identity;
  /** the first is the default */
  modes: string[];
  tokens: Record<string, Token>;
  groups: Record<string, GroupMeta>;
  roles: Partial<Record<ProductRole, RoleBinding>>;
  components: ComponentDef[];
  assets: BrandAsset[];
  intelligence: IntelItem[];
  governance: Governance;
  /** what the source held that SocriaUX does not read, by where it was */
  unknown: Record<string, unknown>;
}

// ── limits ──

export const LIMITS = {
  tokens: 5000,
  path: 200,
  segments: 12,
  stringValue: 2000,
  composite: 6000,
  components: 300,
  assets: 120,
  svg: 400_000,
  dataUrl: 600_000,
  intelligence: 300,
  unknown: 200_000,
  modes: 8,
} as const;

// ── small readers ──

export const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const str = (v: unknown, max: number, d = ''): string => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v).slice(0, max) : d);
export const clean = (v: unknown, max: number): string => str(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max);
export const num = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
export const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => ((allowed as readonly string[]).includes(v as string) ? (v as T) : d);
export const uid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

/** Keys that would reach an object's prototype: never a token, mode or metadata key. */
export const UNSAFE_KEY = /^(__proto__|prototype|constructor)$/;

/** A path segment DTCG allows: no braces, no dots, not starting with $; and no prototype keys. */
export const segmentOk = (s: string) => !!s && s.length <= 80 && !/[{}.]/.test(s) && !s.startsWith('$') && !UNSAFE_KEY.test(s);

/** A token path held to its form, or null. */
export function normalizePath(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const parts = v.trim().split('.').map((s) => s.trim());
  if (!parts.length || parts.length > LIMITS.segments || v.length > LIMITS.path || !parts.every(segmentOk)) return null;
  return parts.join('.');
}

const json = (v: unknown, max: number): unknown => {
  try {
    const s = JSON.stringify(v);
    if (s === undefined || s.length > max) return undefined;
    return JSON.parse(s, (k, x) => (UNSAFE_KEY.test(k) ? undefined : x));
  } catch {
    return undefined;
  }
};

/** A value kept as plain data: strings, numbers, booleans, arrays and objects, bounded; anything else dropped. */
export function plainValue(v: unknown, max: number = LIMITS.composite): TokenValue | undefined {
  if (typeof v === 'string') return v.slice(0, LIMITS.stringValue);
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v;
  if (v && typeof v === 'object') return json(v, max) as TokenValue | undefined;
  return undefined;
}

export function normalizeSource(v: unknown): SourceRef {
  const r = o(v);
  const out: SourceRef = { kind: pick(r.kind, SOURCE_KINDS, 'manual'), ref: clean(r.ref, 300) };
  for (const k of ['file', 'property', 'selector', 'nodeId', 'variableId', 'collectionId', 'mode', 'version'] as const) {
    const s = clean(r[k], 200);
    if (s) out[k] = s;
  }
  if (Number.isFinite(r.page)) out.page = num(r.page, 1, 100000, 1);
  if (Number.isFinite(r.line)) out.line = num(r.line, 1, 10_000_000, 1);
  return out;
}

export function normalizeProvenance(v: unknown, fallbackValue: TokenValue): Provenance {
  const r = o(v);
  return {
    source: normalizeSource(r.source),
    importedAt: num(r.importedAt, 0, 9e15, 0),
    original: plainValue(r.original) ?? fallbackValue,
    status: pick(r.status, PROVENANCE_STATUSES, 'imported'),
    confidence: Math.round(num(r.confidence, 0, 1, 1) * 100) / 100,
    ...(clean(r.note, 300) ? { note: clean(r.note, 300) } : {}),
  };
}

export function normalizeToken(v: unknown, pathHint?: string): Token | null {
  const r = o(v);
  const path = normalizePath(r.path ?? pathHint);
  if (!path) return null;
  const value = plainValue(r.value);
  if (value === undefined) return null;
  const type = pick(r.type, TOKEN_TYPES, 'string');
  const modes: Record<string, TokenValue> = {};
  for (const [m, mv] of Object.entries(o(r.modes)).slice(0, LIMITS.modes)) {
    const name = modeName(m);
    const pv = plainValue(mv);
    if (name && pv !== undefined) modes[name] = pv;
  }
  const ext = json(r.extensions, 20_000);
  return {
    path,
    type,
    value,
    ...(Object.keys(modes).length ? { modes } : {}),
    ...(clean(r.description, 600) ? { description: clean(r.description, 600) } : {}),
    ...(r.deprecated === true ? { deprecated: true } : typeof r.deprecated === 'string' && r.deprecated.trim() ? { deprecated: clean(r.deprecated, 200) } : {}),
    provenance: normalizeProvenance(r.provenance, value),
    ...(ext && typeof ext === 'object' && !Array.isArray(ext) && Object.keys(ext).length ? { extensions: ext as Record<string, unknown> } : {}),
  };
}

/** A mode's name, as a stable key: "Light" and "light mode" are "light"; Figma's "Mode 1", "Value" and "Default" are the default. */
export function modeName(v: unknown): string {
  const s = clean(v, 40).toLowerCase().replace(/\s*(mode|theme)$/i, '').replace(/[^a-z0-9 _-]/g, '').trim().replace(/\s+/g, '-');
  if (!s || UNSAFE_KEY.test(s)) return '';
  return s;
}
export const DEFAULT_MODE_WORDS = /^(default|value|base|mode-?1|light|primary|main)$/;

export function emptyGovernance(): Governance {
  return { locked: [], overridable: { project: ['*'], material: ['color.*', 'typography.*'], object: ['*'] }, restrictedAssets: [], requireReview: true };
}

export function normalizeGovernance(v: unknown): Governance {
  const r = o(v);
  const globs = (x: unknown, d: string[]) => (Array.isArray(x) ? x.map((g) => clean(g, LIMITS.path)).filter((g) => g === '*' || /^[^{}$\s]+(\.\*)?$/.test(g)).slice(0, 200) : d);
  const e = emptyGovernance();
  const ov = o(r.overridable);
  return {
    locked: globs(r.locked, []),
    overridable: { project: globs(ov.project, e.overridable.project), material: globs(ov.material, e.overridable.material), object: globs(ov.object, e.overridable.object) },
    restrictedAssets: (Array.isArray(r.restrictedAssets) ? r.restrictedAssets : []).map((x) => clean(x, 60)).filter(Boolean).slice(0, LIMITS.assets),
    requireReview: r.requireReview !== false,
  };
}

/** Whether a path matches a glob of the governance lists ("*" everything, "color.*" a group, else exact). */
export function matchesGlob(path: string, glob: string): boolean {
  if (glob === '*') return true;
  if (glob.endsWith('.*')) return path.startsWith(glob.slice(0, -1));
  return path === glob;
}

export function normalizeRule(v: unknown): RuleCheck | undefined {
  const r = o(v);
  switch (r.kind) {
    case 'palette-only':
    case 'fonts-only':
    case 'no-gradients':
    case 'logo-unaltered':
      return { kind: r.kind };
    case 'min-contrast':
      return { kind: 'min-contrast', ratio: num(r.ratio, 1, 21, 4.5) };
    case 'logo-min-size':
      return { kind: 'logo-min-size', px: num(r.px, 4, 2000, 24) };
    case 'logo-clear-space':
      return { kind: 'logo-clear-space', ratio: num(r.ratio, 0, 4, 0.25) };
    case 'headline-case':
      return { kind: 'headline-case', case: pick(r.case, ['upper', 'sentence', 'lower'] as const, 'sentence') };
    case 'max-accents':
      return { kind: 'max-accents', n: num(r.n, 1, 12, 1) };
    default:
      return undefined;
  }
}

export function normalizeIntel(v: unknown): IntelItem | null {
  const r = o(v);
  const statement = clean(r.statement, 400);
  if (!statement) return null;
  const status = pick(r.status, INTEL_STATUSES, 'inferred');
  const basis = pick(r.basis, ['explicit', 'extracted', 'inferred'] as const, 'inferred');
  let enforce = pick(r.enforce, ['hard', 'soft', 'none'] as const, 'none');
  // an inference the owner has not approved is never enforced (it is a suggestion until they say otherwise)
  if (status === 'inferred' || status === 'rejected') enforce = 'none';
  const check = normalizeRule(r.check);
  return {
    id: /^[\w-]{1,48}$/.test(String(r.id ?? '')) ? String(r.id) : uid('in'),
    kind: pick(r.kind, INTEL_KINDS, 'other'),
    statement,
    status,
    basis,
    evidence: arr(r.evidence)
      .slice(0, 6)
      .map((e) => ({ source: normalizeSource(o(e).source), ...(clean(o(e).quote, 400) ? { quote: clean(o(e).quote, 400) } : {}) })),
    confidence: Math.round(num(r.confidence, 0, 1, basis === 'explicit' ? 1 : 0.5) * 100) / 100,
    enforce,
    ...(check ? { check } : {}),
  };
}

export function normalizeComponent(v: unknown): ComponentDef | null {
  const r = o(v);
  const name = clean(r.name, 80);
  if (!name) return null;
  return {
    id: /^[\w:;-]{1,64}$/.test(String(r.id ?? '')) ? String(r.id) : uid('cp'),
    name,
    description: clean(r.description, 600),
    variants: arr(r.variants)
      .slice(0, 80)
      .map((x) => {
        const props: Record<string, string> = {};
        for (const [k, pv] of Object.entries(o(o(x).props)).slice(0, 12)) if (!UNSAFE_KEY.test(k)) props[clean(k, 40)] = clean(pv, 80);
        return { name: clean(o(x).name, 120), props };
      })
      .filter((x) => x.name),
    properties: arr(r.properties)
      .slice(0, 30)
      .map((x) => {
        const p = o(x);
        const options = arr(p.options).map((y) => clean(y, 60)).filter(Boolean).slice(0, 30);
        return { name: clean(p.name, 60), type: pick(p.type, ['variant', 'boolean', 'text', 'instance', 'other'] as const, 'other'), ...(options.length ? { options } : {}), ...(clean(p.default, 60) ? { default: clean(p.default, 60) } : {}) };
      })
      .filter((x) => x.name),
    tokens: arr(r.tokens).map((x) => normalizePath(x)).filter((x): x is string => !!x).slice(0, 60),
    source: normalizeSource(r.source),
    notes: arr(r.notes).map((x) => clean(x, 300)).filter(Boolean).slice(0, 8),
  };
}

const SVG_START = /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i;

export function normalizeAsset(v: unknown): BrandAsset | null {
  const r = o(v);
  const format = pick(r.format, ASSET_FORMATS, 'png');
  const hash = /^[0-9a-f]{64}$/.test(String(r.hash ?? '')) ? String(r.hash) : '';
  const svg = format === 'svg' && typeof r.svg === 'string' && r.svg.length <= LIMITS.svg && SVG_START.test(r.svg) && !/<script|\son\w+\s*=|javascript:/i.test(r.svg) ? r.svg : undefined;
  const src = typeof r.src === 'string' && ((/^data:(image\/(png|jpeg|webp)|font\/(ttf|otf|woff2?)|application\/(font-woff2?|x-font-(ttf|otf)));base64,[A-Za-z0-9+/=]+$/.test(r.src) && r.src.length <= LIMITS.dataUrl) || /^upload:[\w-]{1,96}$/.test(r.src)) ? r.src : undefined;
  if (!hash || (format === 'svg' ? !svg : !src)) return null;
  const fm = o(r.font);
  const font: FontMeta | undefined = r.font
    ? {
        family: clean(fm.family, 80),
        subfamily: clean(fm.subfamily, 60),
        fullName: clean(fm.fullName, 120),
        version: clean(fm.version, 60),
        copyright: clean(fm.copyright, 400),
        licence: clean(fm.licence, 600),
        licenceUrl: clean(fm.licenceUrl, 300),
        weight: num(fm.weight, 1, 1000, 400),
        italic: fm.italic === true,
      }
    : undefined;
  const kind = pick(r.kind, ASSET_KINDS, 'other');
  const approved = r.approved === true;
  return {
    id: /^[\w-]{1,60}$/.test(String(r.id ?? '')) ? String(r.id) : uid('as'),
    name: clean(r.name, 120) || 'Asset',
    kind,
    format,
    mime: clean(r.mime, 60) || 'application/octet-stream',
    ...(Number.isFinite(r.width) ? { width: num(r.width, 0, 100000, 0) } : {}),
    ...(Number.isFinite(r.height) ? { height: num(r.height, 0, 100000, 0) } : {}),
    bytes: num(r.bytes, 0, 50_000_000, 0),
    hash,
    ...(clean(r.role, 40) ? { role: clean(r.role, 40) } : {}),
    ...(clean(r.licence, 600) ? { licence: clean(r.licence, 600) } : {}),
    version: num(r.version, 1, 100000, 1),
    // an approved logo is protected; protection is never dropped by a round trip
    protected: r.protected === true || (kind === 'logo' && approved),
    approved,
    vector: format === 'svg',
    ...(r.lowRes === true ? { lowRes: true } : {}),
    ...(svg ? { svg } : {}),
    ...(src ? { src } : {}),
    source: normalizeSource(r.source),
    importedAt: num(r.importedAt, 0, 9e15, 0),
    notes: arr(r.notes).map((x) => clean(x, 300)).filter(Boolean).slice(0, 8),
    ...(font ? { font } : {}),
  };
}

export function emptyContent(name = 'Untitled system'): SystemContent {
  return { schema: DSI_SCHEMA, identity: { name, description: '' }, modes: ['light'], tokens: {}, groups: {}, roles: {}, components: [], assets: [], intelligence: [], governance: emptyGovernance(), unknown: {} };
}

/** A system's content held to its shape (it comes back from storage, the account copy and imports). */
export function normalizeContent(v: unknown): SystemContent {
  const r = o(v);
  const id = o(r.identity);
  const tokens: Record<string, Token> = {};
  let n = 0;
  for (const [k, t] of Object.entries(o(r.tokens))) {
    if (n >= LIMITS.tokens) break;
    const tok = normalizeToken(t, k);
    if (tok && !tokens[tok.path]) {
      tokens[tok.path] = tok;
      n++;
    }
  }
  const groups: Record<string, GroupMeta> = {};
  for (const [k, g] of Object.entries(o(r.groups)).slice(0, 2000)) {
    const p = normalizePath(k);
    if (!p) continue;
    const gm = o(g);
    const ext = json(gm.extensions, 20_000);
    groups[p] = {
      ...(clean(gm.description, 600) ? { description: clean(gm.description, 600) } : {}),
      ...((TOKEN_TYPES as readonly string[]).includes(gm.type) ? { type: gm.type as TokenType } : {}),
      ...(ext && typeof ext === 'object' && !Array.isArray(ext) && Object.keys(ext).length ? { extensions: ext as Record<string, unknown> } : {}),
    };
  }
  const modes = [...new Set(arr(r.modes).map(modeName).filter(Boolean))].slice(0, LIMITS.modes);
  const roles: Partial<Record<ProductRole, RoleBinding>> = {};
  for (const k of PRODUCT_ROLES) {
    const b = o(o(r.roles)[k]);
    const path = normalizePath(b.path);
    if (path) roles[k] = { path, status: b.status === 'confirmed' ? 'confirmed' : 'inferred', confidence: Math.round(num(b.confidence, 0, 1, 0.5) * 100) / 100, why: clean(b.why, 300) };
  }
  const unknown = json(r.unknown, LIMITS.unknown);
  const seenAssets = new Set<string>();
  return {
    schema: DSI_SCHEMA,
    identity: {
      name: clean(id.name, 80) || 'Untitled system',
      description: clean(id.description, 1000),
      ...(clean(id.tagline, 200) ? { tagline: clean(id.tagline, 200) } : {}),
      ...(clean(id.audience, 300) ? { audience: clean(id.audience, 300) } : {}),
      ...(clean(id.website, 300) ? { website: clean(id.website, 300) } : {}),
    },
    modes: modes.length ? modes : ['light'],
    tokens,
    groups,
    roles,
    components: arr(r.components).map(normalizeComponent).filter((c): c is ComponentDef => !!c).slice(0, LIMITS.components),
    assets: arr(r.assets)
      .map(normalizeAsset)
      .filter((a): a is BrandAsset => !!a && !seenAssets.has(a.id) && !!seenAssets.add(a.id))
      .slice(0, LIMITS.assets),
    intelligence: arr(r.intelligence).map(normalizeIntel).filter((x): x is IntelItem => !!x).slice(0, LIMITS.intelligence),
    governance: normalizeGovernance(r.governance),
    unknown: unknown && typeof unknown === 'object' && !Array.isArray(unknown) ? (unknown as Record<string, unknown>) : {},
  };
}
