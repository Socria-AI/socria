// lib/ux-v0/design-system.ts — the designer's own design system: read, mapped, built within, checked against.
//
// Without a design system, generated output tends to be "functional but generic"; with one, designs are built
// from the brand's own colours, type, spacing and corners, and checked against them before they are shown.
//
// READ. A system comes as the files a team already has, uploaded or from a public GitHub repository:
//   - design tokens as JSON: the W3C Design Tokens format ($value, $type, groups, {aliases}), Style Dictionary
//     (value), Tokens Studio (value, type), or a plain map ("primary": "#1f4ea3");
//   - CSS custom properties (:root { --color-primary: …; --font-heading: …; --radius-md: 8px }), dark-mode
//     blocks included;
//   - a README or guidelines in Markdown: its do's and don'ts become rules, its component sections become notes.
// Nothing in them is ever run: they are read as text.
//
// MAPPED. Colours go to SocriaUX's roles (background, surface, text, muted, accent, on-accent, line) by name,
// then by what they are (the lightest ground, the darkest ink, the most saturated accent), and text is held to
// what it must read at. Faces go to the fonts SocriaUX can serve: one of the system's own when it is there,
// otherwise the closest, and said so. The type scale gives the ratio; spacing the density; radii the corners.
//
// BUILT WITHIN. Attached to the brief (briefWithSystem), the system's colours, type and layout become decisions
// locked as rules, so every direction keeps them and differs only in composition; its rules join the brief's.
// CHECKED. A design is checked against it before it is shown (conformance, with fixes), and a change that
// leaves it is asked about first (offSystem, in the refine route).

import { contrastRatio } from '../ux/audit';
import { hslOf, mix } from './color';
import { FONTS, knownFont } from './fonts';
import type { DesignSpec, DesignTokens, Patch } from './spec';

export type DSRole = 'background' | 'surface' | 'text' | 'muted' | 'accent' | 'accentText' | 'line';
export const DS_ROLES: readonly DSRole[] = ['background', 'surface', 'text', 'muted', 'accent', 'accentText', 'line'];

export interface DSColour {
  name: string;
  hex: string;
  mode: 'light' | 'dark';
}
export interface DSFont {
  role: 'display' | 'body' | 'mono';
  /** the system's own face */
  family: string;
  /** the face SocriaUX draws it with: the same one, or the closest it can serve */
  standIn: string;
}
export interface DSComponent {
  name: string;
  notes: string;
}
export interface DesignSystem {
  name: string;
  source: { kind: 'file' | 'github'; ref: string; files: string[] };
  colours: DSColour[];
  /** the colour each role takes (light mode) */
  roles: Partial<Record<DSRole, string>>;
  fonts: DSFont[];
  /** type sizes in px, smallest first */
  sizes: number[];
  spacing: number[];
  radii: number[];
  components: DSComponent[];
  rules: string[];
  /** how it was mapped, said plainly (a face drawn with another, a role derived) */
  notes: string[];
  importedAt: number;
  /** the registry design system it was made from (lib/ux-v0/dsi), and the version applied */
  link?: { id: string; version: number; name: string };
}

export interface DSFile {
  path: string;
  text: string;
}

const MAX_FILE = 400_000;

// ── colours and lengths, as written in token files ────────────────────

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** A colour as written in a token file, as #rrggbb; null when it is not one SocriaUX can use. */
export function colourHex(v: string): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3,4})$/);
  if (m) return `#${m[1].slice(0, 3).split('').map((c) => c + c).join('')}`;
  m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) return m[2] && parseInt(m[2], 16) < 128 ? null : `#${m[1]}`;
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    return a < 0.5 ? null : `#${hex2(+m[1])}${hex2(+m[2])}${hex2(+m[3])}`;
  }
  m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    if (a < 0.5) return null;
    const h = (+m[1] % 360) / 360;
    const sat = +m[2] / 100;
    const l = +m[3] / 100;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const f = (t: number) => {
      t = (t + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    };
    return `#${hex2(f(h + 1 / 3) * 255)}${hex2(f(h) * 255)}${hex2(f(h - 1 / 3) * 255)}`;
  }
  return null;
}

/** A length in px (px, rem and em at 16px); null when it is not one. */
export function lengthPx(v: string): number | null {
  const m = String(v ?? '').trim().match(/^(-?[\d.]+)\s*(px|rem|em)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 400) return null;
  return Math.round((m[2] && m[2].toLowerCase() !== 'px' ? n * 16 : n) * 100) / 100;
}

// ── reading the files ────────────────────────────────────────────────

interface Raw {
  name: string;
  value: string;
  type: string;
  mode: 'light' | 'dark';
}

const isDarkPath = (p: string) => /(^|[-./_\s])(dark|night)([-./_\s]|$)/i.test(p);

/** Design tokens from JSON in any of the common shapes, aliases resolved. */
function readJson(text: string): Raw[] {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return [];
  }
  const out: Raw[] = [];
  const byPath = new Map<string, unknown>();
  const walk = (node: unknown, path: string[], inherited: string, depth: number) => {
    if (depth > 12 || out.length > 2000) return;
    if (node === null || node === undefined) return;
    if (typeof node === 'string' || typeof node === 'number') {
      const name = path.join('-').toLowerCase();
      byPath.set(path.join('.').toLowerCase(), node);
      out.push({ name, value: String(node), type: inherited, mode: isDarkPath(path.join('/')) ? 'dark' : 'light' });
      return;
    }
    if (typeof node !== 'object' || Array.isArray(node)) return;
    const r = node as Record<string, unknown>;
    const type = typeof r.$type === 'string' ? r.$type : typeof r.type === 'string' && ('value' in r || '$value' in r) ? r.type : inherited;
    const value = '$value' in r ? r.$value : 'value' in r && (typeof r.value !== 'object' || r.value === null || !Object.values(r.value as object).some((x) => x && typeof x === 'object' && ('value' in (x as object) || '$value' in (x as object)))) ? r.value : undefined;
    if (value !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // a composite typography token: its family and size
        const t = value as Record<string, unknown>;
        if (t.fontFamily !== undefined) walk(Array.isArray(t.fontFamily) ? t.fontFamily.join(', ') : t.fontFamily, [...path, 'font-family'], 'fontFamily', depth + 1);
        if (t.fontSize !== undefined) walk(typeof t.fontSize === 'object' && t.fontSize ? `${(t.fontSize as any).value}${(t.fontSize as any).unit ?? 'px'}` : t.fontSize, [...path, 'font-size'], 'fontSize', depth + 1);
        return;
      }
      if (Array.isArray(value)) return walk(value.join(', '), path, type, depth + 1);
      return walk(value, path, type, depth + 1);
    }
    for (const [k, v] of Object.entries(r)) if (!k.startsWith('$') && k !== 'type' && k !== 'description' && k !== 'comment' && k !== 'attributes') walk(v, [...path, k], type, depth + 1);
  };
  walk(root, [], '', 0);
  // {group.token} aliases, resolved (a few levels)
  const resolve = (v: string, n = 0): string => {
    const m = v.match(/^\{([^}]+)\}$/);
    if (!m || n > 5) return v;
    const hit = byPath.get(m[1].toLowerCase()) ?? byPath.get(`${m[1].toLowerCase()}.value`) ?? byPath.get(`${m[1].toLowerCase()}.$value`);
    return hit === undefined ? v : resolve(String(hit), n + 1);
  };
  return out.map((x) => ({ ...x, name: x.name.replace(/-(\$?value)$/, ''), value: resolve(x.value) }));
}

/** CSS custom properties, with the mode of the block they sit in; var() references resolved. */
function readCss(text: string): Raw[] {
  const out: Raw[] = [];
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = src.split('}');
  for (const b of blocks) {
    const open = b.lastIndexOf('{');
    const selector = open >= 0 ? b.slice(0, open) : '';
    const body = open >= 0 ? b.slice(open + 1) : b;
    const mode = /dark/i.test(selector) ? 'dark' : 'light';
    for (const m of body.matchAll(/--([\w-]{1,80})\s*:\s*([^;]{1,300});/g)) out.push({ name: m[1].toLowerCase(), value: m[2].trim(), type: '', mode });
    if (out.length > 2000) break;
  }
  const light = new Map(out.filter((x) => x.mode === 'light').map((x) => [x.name, x.value]));
  const resolve = (v: string, n = 0): string => {
    const m = v.match(/^var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)$/);
    if (!m || n > 5) return v;
    const hit = light.get(m[1].toLowerCase()) ?? m[2];
    return hit === undefined ? v : resolve(hit.trim(), n + 1);
  };
  return out.map((x) => ({ ...x, value: resolve(x.value) }));
}

const COMPONENT_WORDS = /\b(button|buttons|card|cards|input|inputs|field|fields|form|forms|nav|navigation|navbar|header|footer|badge|badges|tag|tags|chip|chips|modal|dialog|table|tables|tab|tabs|alert|alerts|toast|avatar|hero|link|links|menu|tooltip|select|checkbox|radio|toggle|switch|banner|list|lists|pagination|breadcrumb)\b/i;

/** Rules and components from guidelines written in Markdown. */
function readMarkdown(text: string): { rules: string[]; components: DSComponent[]; title: string } {
  const rules: string[] = [];
  const components: DSComponent[] = [];
  const lines = text.split(/\r?\n/);
  let heading = '';
  let title = '';
  let current: DSComponent | null = null;
  const tidy = (s: string) => s.replace(/[*_`#>]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      heading = tidy(h[2]);
      if (h[1] === '#' && !title) title = heading.slice(0, 60);
      current = COMPONENT_WORDS.test(heading) && heading.length < 40 && h[1].length >= 2 ? { name: heading, notes: '' } : null;
      if (current && components.length < 24 && !components.some((c) => c.name.toLowerCase() === current!.name.toLowerCase())) components.push(current);
      continue;
    }
    const bullet = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/);
    const t = tidy(bullet ? bullet[1] : line);
    if (!t) continue;
    const ruleWord = /^(do not|don'?t|never|always|must|avoid|only|use|prefer|keep)\b/i.test(t);
    const underRules = /\b(do'?s|don'?ts|do and don'?t|rules|principles|guidelines|usage)\b/i.test(heading);
    if (bullet && (ruleWord || underRules) && t.length >= 8 && t.length <= 200 && rules.length < 20) {
      const prefixed = /^don'?t$/i.test(heading.trim()) && !/^(don'?t|do not|never|avoid)/i.test(t) ? `Don't ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t;
      if (!rules.includes(prefixed)) rules.push(prefixed);
    } else if (current && !current.notes && t.length > 12) current.notes = t.slice(0, 200);
  }
  return { rules, components, title };
}

// ── what each value is ───────────────────────────────────────────────

const FONT_NAME = /(font|family|typeface|face)s?([-_]|$)|^(sans|serif|mono|display|heading|body)$/;
const SIZE_NAME = /(font-?size|text-(2xs|xs|sm|base|md|lg|xl|\dxl)|^(size|type)-(xs|sm|md|lg|xl|\d)|heading-\d|display|caption|body-(sm|md|lg))/;
const SPACE_NAME = /(space|spacing|gap|gutter|inset|padding|margin)/;
const RADIUS_NAME = /(radius|radii|rounded|corner)/;

function classify(raws: Raw[]): { colours: DSColour[]; families: { name: string; family: string }[]; sizes: number[]; spacing: number[]; radii: number[] } {
  const colours: DSColour[] = [];
  const families: { name: string; family: string }[] = [];
  const sizes: number[] = [];
  const spacing: number[] = [];
  const radii: number[] = [];
  for (const r of raws) {
    const t = r.type.toLowerCase();
    const hex = t === 'color' || !t ? colourHex(r.value) : null;
    if (hex) {
      if (colours.length < 64 && !colours.some((c) => c.name === r.name && c.mode === r.mode)) colours.push({ name: r.name.slice(0, 60), hex, mode: r.mode });
      continue;
    }
    if (t === 'fontfamily' || t === 'fontfamilies' || (FONT_NAME.test(r.name) && !/size|weight|height|spacing/.test(r.name))) {
      const family = r.value.split(',')[0].replace(/["']/g, '').trim();
      if (family && family.length < 60 && !/^(var|inherit|initial|system-ui|sans-serif|serif|monospace|-apple-system)$/i.test(family) && !lengthPx(family)) families.push({ name: r.name, family });
      continue;
    }
    const px = lengthPx(r.value);
    if (px === null) continue;
    if (RADIUS_NAME.test(r.name) || t === 'borderradius') radii.push(px);
    else if (t === 'fontsize' || SIZE_NAME.test(r.name)) px >= 8 && px <= 160 && sizes.push(px);
    else if (t === 'spacing' || SPACE_NAME.test(r.name)) px > 0 && px <= 200 && spacing.push(px);
  }
  const uniq = (xs: number[], n: number) => [...new Set(xs)].sort((a, b) => a - b).slice(0, n);
  return { colours, families, sizes: uniq(sizes, 12), spacing: uniq(spacing, 16), radii: uniq(radii.filter((x) => x < 999), 8) };
}

// ── roles ─────────────────────────────────────────────────────────────

const ROLE_NAMES: [DSRole, RegExp][] = [
  ['accentText', /(on-(primary|brand|accent))|((primary|brand|accent)-(foreground|fg|text|contrast|on))$/],
  ['muted', /(muted|secondary|subtle|subdued|tertiary|weak)[-.]?(text|foreground|fg|content)?$|(text|foreground|fg|content)-(muted|secondary|subtle|weak)$/],
  ['line', /(border|line|divider|outline|stroke|separator|rule)(-default|-subtle|-primary)?$/],
  ['surface', /(surface|card|panel|elevated|raised|container|paper)(-default|-primary|-1)?$/],
  ['background', /(^|-)(background|bg|canvas|page|base|body-bg|surface-0|backdrop)(-default|-primary|-base)?$/],
  ['text', /(^|-)(text|foreground|fg|ink|content|on-background|on-surface|body)(-default|-primary|-base)?$/],
  ['accent', /(primary|brand|accent|action|interactive|cta|link)(-default|-base|-main|-500|-600|-700)?$/],
];

const lum = (hex: string) => hslOf(hex)[2];
const sat = (hex: string) => hslOf(hex)[1];

/** Which colour plays which part, by its name first and by what it is otherwise; text held to what it must read at. */
export function inferRoles(colours: readonly DSColour[]): { roles: Record<DSRole, string>; notes: string[] } {
  const notes: string[] = [];
  const light = colours.filter((c) => c.mode === 'light');
  const pool = light.length ? light : colours;
  // each token plays one role (its name decides which), but one colour may play several (on-primary = background)
  const named: Partial<Record<DSRole, string>> = {};
  const taken = new Set<string>();
  for (const [role, re] of ROLE_NAMES) {
    const hit = pool.find((c) => re.test(c.name) && !taken.has(c.name));
    if (hit) (named[role] = hit.hex), taken.add(hit.name);
  }
  const byLum = [...pool].sort((a, b) => lum(b.hex) - lum(a.hex));
  const background = named.background ?? (byLum.find((c) => sat(c.hex) < 0.35) ?? byLum[0])?.hex ?? '#ffffff';
  let text = named.text ?? byLum.at(-1)?.hex ?? '#111111';
  if (contrastRatio(text, background) < 4.5) {
    const best = [...pool].sort((a, b) => contrastRatio(b.hex, background) - contrastRatio(a.hex, background))[0];
    if (best && contrastRatio(best.hex, background) > contrastRatio(text, background)) {
      notes.push(`Text set in ${best.name}, the system's colour that reads best on its background.`);
      text = best.hex;
    }
  }
  const accent =
    named.accent ??
    [...pool].filter((c) => c.hex !== background && c.hex !== text && contrastRatio(c.hex, background) >= 3).sort((a, b) => sat(b.hex) - sat(a.hex))[0]?.hex ??
    text;
  if (!named.accent) notes.push('The accent is the system’s most saturated colour that reads on its background.');
  const accentText = named.accentText && contrastRatio(named.accentText, accent) >= 4.5 ? named.accentText : contrastRatio('#ffffff', accent) >= contrastRatio('#111111', accent) ? '#ffffff' : '#111111';
  const surface = named.surface ?? background;
  const muted = named.muted && contrastRatio(named.muted, background) >= 4.5 ? named.muted : mix(text, background, 0.35);
  if (!named.muted) notes.push('Secondary text is mixed from the system’s text and background.');
  const line = named.line ?? mix(background, text, 0.16);
  return { roles: { background, surface, text, muted, accent, accentText, line }, notes };
}

// ── faces ─────────────────────────────────────────────────────────────

/** Known faces outside SocriaUX's list, and the one it draws each with. */
const NEAREST: [RegExp, string][] = [
  [/helvetica|arial|neue haas|sf pro|system|roboto|graphik|s(ö|o)hne|suisse|aktiv|untitled sans|segoe/i, 'Inter'],
  [/circular|avenir|futura|gotham|montserrat|poppins|proxima|museo sans|gilroy/i, 'Outfit'],
  [/gt america|franklin|akzidenz|univers|din|barlow|oswald/i, 'Archivo'],
  [/open sans|source sans|noto sans|lato|fira sans|nunito sans/i, 'Public Sans'],
  [/nunito|quicksand|rubik|varela/i, 'Manrope'],
  [/apercu|maison|calibre|aeonik|satoshi|general sans/i, 'DM Sans'],
  [/garamond|caslon|sabon|minion/i, 'EB Garamond'],
  [/georgia|charter|merriweather|tiempos|publico|lyon/i, 'Source Serif 4'],
  [/times|baskerville|bembo/i, 'Libre Baskerville'],
  [/didot|bodoni|canela|ogg|freight big/i, 'Bodoni Moda'],
  [/playfair|domaine|gt super|recoleta|cooper/i, 'DM Serif Display'],
  [/mono|code|courier|consolas|menlo|monaco|sf mono|ibm plex mono/i, 'JetBrains Mono'],
];

/** The face SocriaUX draws a system's face with: the same one when it can serve it, else the closest, by kind. */
export function standInFor(family: string, role: DSFont['role']): string {
  const own = knownFont(family);
  if (own && !(role === 'body' && own.displayOnly)) return own.name;
  const hit = NEAREST.find(([re]) => re.test(family))?.[1];
  if (hit && !(role === 'body' && knownFont(hit)?.displayOnly)) return hit;
  if (role === 'mono') return 'JetBrains Mono';
  return /serif/i.test(family) && !/sans/i.test(family) ? 'Source Serif 4' : 'Inter';
}

function facesOf(families: { name: string; family: string }[]): { fonts: DSFont[]; notes: string[] } {
  const notes: string[] = [];
  const pick = (re: RegExp) => families.find((f) => re.test(f.name))?.family;
  const display = pick(/display|heading|headline|title|brand/) ?? pick(/serif(?!.*sans)/) ?? families[0]?.family;
  const body = pick(/body|text|base|copy|paragraph|sans|primary/) ?? families.find((f) => f.family !== display)?.family ?? display;
  const mono = pick(/mono|code/);
  const fonts: DSFont[] = [];
  for (const [role, family] of [['display', display], ['body', body], ['mono', mono]] as const) {
    if (!family) continue;
    const standIn = standInFor(family, role);
    fonts.push({ role, family, standIn });
    if (standIn.toLowerCase() !== family.toLowerCase() && !notes.some((n) => n.includes(`“${family}”`))) notes.push(`Your system's “${family}” is drawn with ${standIn}, the closest face SocriaUX can serve.`);
  }
  return { fonts, notes };
}

// ── the system, whole ────────────────────────────────────────────────

/** A design system from the team's own files: null (with why) when nothing in them is a design token. */
export function parseDesignSystem(files: readonly DSFile[], source: DesignSystem['source'], now = Date.now()): { system: DesignSystem | null; error?: string } {
  const raws: Raw[] = [];
  let rules: string[] = [];
  let components: DSComponent[] = [];
  let title = '';
  const read: string[] = [];
  for (const f of files.slice(0, 12)) {
    const text = String(f.text ?? '').slice(0, MAX_FILE);
    const p = f.path.toLowerCase();
    if (p.endsWith('.json')) raws.push(...readJson(text));
    else if (p.endsWith('.css') || p.endsWith('.scss') || p.endsWith('.less')) raws.push(...readCss(text));
    else if (p.endsWith('.md') || p.endsWith('.mdx') || p.endsWith('.txt')) {
      const md = readMarkdown(text);
      rules = [...rules, ...md.rules].slice(0, 20);
      components = [...components, ...md.components].slice(0, 24);
      title = title || md.title;
    } else continue;
    read.push(f.path.slice(0, 160));
  }
  const c = classify(raws);
  if (c.colours.length < 2 && !c.families.length) return { system: null, error: 'No design tokens were found: no colours or typefaces in those files. Add a tokens file (JSON or CSS custom properties).' };
  const { roles, notes: roleNotes } = inferRoles(c.colours);
  const { fonts, notes: fontNotes } = facesOf(c.families);
  const name = (title || source.ref.split(/[\\/]/).filter(Boolean).pop() || 'Design system').replace(/\.(json|css|md)$/i, '').slice(0, 60);
  return {
    system: {
      name,
      source: { ...source, files: read.slice(0, 12) },
      colours: c.colours,
      roles,
      fonts,
      sizes: c.sizes,
      spacing: c.spacing,
      radii: c.radii,
      components,
      rules,
      notes: [...fontNotes, ...roleNotes].slice(0, 8),
      importedAt: now,
    },
  };
}

/** A stored system, held to its shape (it comes back from storage and from the browser). */
export function normalizeDesignSystem(v: unknown): DesignSystem | undefined {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : null;
  if (!r) return undefined;
  const str = (x: unknown, n: number) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const hex = (x: unknown) => (typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x) ? x.toLowerCase() : '');
  const nums = (x: unknown, n: number) => (Array.isArray(x) ? x.map(Number).filter((y) => Number.isFinite(y) && y >= 0 && y <= 400).slice(0, n) : []);
  const colours = (Array.isArray(r.colours) ? r.colours : []).map((c: any) => ({ name: str(c?.name, 60), hex: hex(c?.hex), mode: c?.mode === 'dark' ? 'dark' : 'light' }) as DSColour).filter((c: DSColour) => c.name && c.hex).slice(0, 64);
  const roles: Partial<Record<DSRole, string>> = {};
  for (const k of DS_ROLES) if (hex(r.roles?.[k])) roles[k] = hex(r.roles[k]);
  if (!roles.background || !roles.text || !roles.accent) return undefined;
  const fonts = (Array.isArray(r.fonts) ? r.fonts : [])
    .map((f: any) => ({ role: ['display', 'body', 'mono'].includes(f?.role) ? f.role : 'body', family: str(f?.family, 60), standIn: knownFont(f?.standIn)?.name ?? '' }) as DSFont)
    .filter((f: DSFont) => f.family && f.standIn)
    .slice(0, 3);
  const src = r.source && typeof r.source === 'object' ? r.source : {};
  return {
    name: str(r.name, 60) || 'Design system',
    source: { kind: src.kind === 'github' ? 'github' : 'file', ref: str(src.ref, 160), files: (Array.isArray(src.files) ? src.files : []).map((x: unknown) => str(x, 160)).filter(Boolean).slice(0, 12) },
    colours,
    roles,
    fonts,
    sizes: nums(r.sizes, 12),
    spacing: nums(r.spacing, 16),
    radii: nums(r.radii, 8),
    components: (Array.isArray(r.components) ? r.components : []).map((c: any) => ({ name: str(c?.name, 40), notes: str(c?.notes, 200) })).filter((c: DSComponent) => c.name).slice(0, 24),
    rules: (Array.isArray(r.rules) ? r.rules : []).map((x: unknown) => str(x, 200)).filter(Boolean).slice(0, 20),
    notes: (Array.isArray(r.notes) ? r.notes : []).map((x: unknown) => str(x, 200)).filter(Boolean).slice(0, 8),
    importedAt: Number.isFinite(r.importedAt) ? r.importedAt : 0,
    ...(r.link && typeof r.link === 'object' && typeof r.link.id === 'string' && /^dsys_[\w-]{4,64}$/.test(r.link.id) ? { link: { id: r.link.id, version: Math.max(0, Math.round(Number(r.link.version) || 0)), name: str(r.link.name, 80) } } : {}),
  };
}

// ── what the system decides ──────────────────────────────────────────

const RATIOS = [1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618];

/** The type scale's ratio: the middle step between its sizes from body size up, to the nearest named ratio. */
export function systemRatio(ds: Pick<DesignSystem, 'sizes'>): number | undefined {
  const s = ds.sizes.filter((x) => x >= 14);
  if (s.length < 3) return undefined;
  const steps = s.slice(1).map((x, i) => x / s[i]).filter((x) => x > 1.04 && x < 2).sort((a, b) => a - b);
  if (!steps.length) return undefined;
  const mid = steps[Math.floor(steps.length / 2)];
  return RATIOS.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
}
export function systemCorners(ds: Pick<DesignSystem, 'radii'>): DesignTokens['radius'] | undefined {
  if (!ds.radii.length) return undefined;
  const mid = ds.radii[Math.floor((ds.radii.length - 1) / 2)];
  return mid < 2 ? 'none' : mid <= 10 ? 'soft' : 'round';
}
export function systemDensity(ds: Pick<DesignSystem, 'spacing'>): 'compact' | 'comfortable' | 'spacious' | undefined {
  const s = ds.spacing.filter((x) => x >= 2);
  if (s.length < 3) return undefined;
  const base = s[Math.floor(s.length / 2)];
  return base <= 12 ? 'compact' : base >= 28 ? 'spacious' : 'comfortable';
}
export const faceOf = (ds: Pick<DesignSystem, 'fonts'>, role: DSFont['role']) => ds.fonts.find((f) => f.role === role) ?? (role === 'display' ? ds.fonts.find((f) => f.role === 'body') : ds.fonts.find((f) => f.role === 'display'));

type BriefLike = {
  palette: { name: string; hex: string; role: string }[];
  typography: { display: string; body: string; rationale: string };
  decisions?: Partial<Record<string, string>>;
  rules?: string[];
  spec?: object;
  system?: DesignSystem;
};

const PALETTE_ROLE: Record<DSRole, string> = { background: 'background', surface: 'surface', text: 'text', muted: 'muted', accent: 'accent', accentText: 'accent-text', line: 'line' };

/**
 * The brief built within the system: its colours, type and layout from the system, each locked as a rule so
 * every direction keeps them (lib/ux-v0/direction.ts applyBrief) and differs only in composition; the system's
 * rules join the brief's own.
 */
export function briefWithSystem<B extends BriefLike>(brief: B, ds: DesignSystem): B {
  const display = faceOf(ds, 'display')?.standIn ?? brief.typography.display;
  const body = faceOf(ds, 'body')?.standIn ?? brief.typography.body;
  const spec = { ...((brief.spec ?? {}) as Record<string, unknown>) };
  const ratio = systemRatio(ds);
  const corners = systemCorners(ds);
  const density = systemDensity(ds);
  if (ratio) spec.ratio = ratio;
  if (corners) spec.corners = corners;
  if (density) spec.density = density;
  const own = (brief.rules ?? []).filter((r) => !(brief.system?.rules ?? []).includes(r));
  return {
    ...brief,
    palette: DS_ROLES.filter((k) => ds.roles[k]).map((k) => ({ name: `${ds.name}: ${k}`.slice(0, 60), hex: ds.roles[k]!, role: PALETTE_ROLE[k] })),
    typography: { display, body, rationale: `From your design system, ${ds.name}.${ds.fonts.some((f) => f.standIn !== f.family) ? ` ${ds.fonts.filter((f) => f.standIn !== f.family).map((f) => `${f.family} is drawn with ${f.standIn}`).join('; ')}.` : ''}` },
    decisions: { ...(brief.decisions ?? {}), colour: 'locked', typography: 'locked', ...(ratio || corners || density ? { layout: 'locked' } : {}) },
    rules: [...own, ...ds.rules].slice(0, 20),
    spec,
    system: ds,
  };
}

/** The brief without the system: its colours and type stay as they were, now the designer's to change. */
export function briefWithoutSystem<B extends BriefLike>(brief: B): B {
  if (!brief.system) return brief;
  const { system, ...rest } = brief;
  const decisions = { ...(brief.decisions ?? {}) };
  for (const k of ['colour', 'typography', 'layout']) if (decisions[k] === 'locked') decisions[k] = 'approved';
  return { ...(rest as B), decisions, rules: (brief.rules ?? []).filter((r) => !system.rules.includes(r)) };
}

/** The system, as the generator is told it: what to build with and what to keep to. */
export function systemBrief(ds: DesignSystem | undefined): string {
  if (!ds) return '';
  return [
    `THE DESIGNER'S DESIGN SYSTEM — ${ds.name}: build within it. Its colours, type and corners are already applied; do not suggest others.`,
    ds.components.length ? `Its components, as it describes them: ${ds.components.slice(0, 12).map((c) => `${c.name}${c.notes ? ` (${c.notes.slice(0, 120)})` : ''}`).join('; ')}.` : '',
    ds.rules.length ? `Its rules: ${ds.rules.slice(0, 12).join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ── checked against it ───────────────────────────────────────────────

const distance = (a: string, b: string) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const inSystem = (hex: string, ds: DesignSystem) => [...ds.colours.map((c) => c.hex), ...Object.values(ds.roles)].some((c) => c && distance(c, hex) <= 8);

export interface Conformance {
  what: 'colour' | 'type' | 'corners' | 'scale';
  message: string;
  fix: Patch;
}

/** Where a design leaves its design system, each with the change that puts it back. */
export function conformance(spec: DesignSpec, ds: DesignSystem): Conformance[] {
  const out: Conformance[] = [];
  const c = spec.tokens.colors;
  const off = (Object.keys(c) as (keyof DesignTokens['colors'])[]).filter((k) => !inSystem(c[k], ds) && !(k === 'muted' || k === 'line' || k === 'surface' || k === 'accentText'));
  if (off.length) {
    const colors = { ...c } as Record<string, string>;
    for (const k of DS_ROLES) if (ds.roles[k]) colors[k] = ds.roles[k]!;
    out.push({ what: 'colour', message: `Uses colours that are not in ${ds.name}: ${off.map((k) => `${c[k]} (${k})`).join(', ')}.`, fix: { op: 'tokens', tokens: { colors: colors as DesignTokens['colors'] }, summary: `Colours put back to ${ds.name}` } as Patch });
  }
  const d = faceOf(ds, 'display')?.standIn;
  const b = faceOf(ds, 'body')?.standIn;
  if ((d && spec.tokens.fonts.display !== d) || (b && spec.tokens.fonts.body !== b)) out.push({ what: 'type', message: `Set in ${spec.tokens.fonts.display} and ${spec.tokens.fonts.body}, not ${ds.name}’s faces.`, fix: { op: 'tokens', tokens: { fonts: { display: d ?? spec.tokens.fonts.display, body: b ?? spec.tokens.fonts.body } }, summary: `Type put back to ${ds.name}` } as Patch });
  const corners = systemCorners(ds);
  if (corners && spec.tokens.radius !== corners) out.push({ what: 'corners', message: `Its corners are ${spec.tokens.radius}; ${ds.name}’s are ${corners}.`, fix: { op: 'tokens', tokens: { radius: corners }, summary: `Corners put back to ${ds.name}` } as Patch });
  const ratio = systemRatio(ds);
  if (ratio && spec.look && Math.abs(spec.look.ratio - ratio) > 0.05) out.push({ what: 'scale', message: `Its type scale steps by ${spec.look.ratio}; ${ds.name}’s by ${ratio}.`, fix: { op: 'look', look: { ratio }, summary: `Type scale put back to ${ds.name}` } as Patch });
  return out;
}

/** What a change would take outside the system, for the designer to be asked first. */
export function offSystem(patch: Patch, ds: DesignSystem): string[] {
  const out: string[] = [];
  const t = (patch as any).tokens as Partial<DesignTokens> | undefined;
  if (patch.op !== 'tokens' || !t) return out;
  for (const [k, v] of Object.entries(t.colors ?? {})) if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) && !inSystem(v, ds)) out.push(`the ${k} colour ${v}`);
  const faces = ds.fonts.map((f) => f.standIn);
  for (const v of [t.fonts?.display, t.fonts?.body]) if (v && faces.length && !faces.includes(v)) out.push(`the face ${v}`);
  const corners = systemCorners(ds);
  if (t.radius && corners && t.radius !== corners) out.push(`${t.radius} corners`);
  return out;
}

/** For the tests and the UI: every face SocriaUX can draw a system with. */
export const SERVABLE_FACES = FONTS.map((f) => f.name);
