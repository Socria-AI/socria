// lib/ux-v0/dsi/import-json.ts — design tokens from JSON, read through one pipeline whatever the dialect:
//
//   1 read (size-capped)      2 parse (errors with line and column)   3 detect the dialect
//   4 walk the groups          5 normalize values to their types       6 keep references (aliases) as references
//   7 read modes and themes    8 validate (cycles, missing references, types)
//   9 classify and infer roles (inferences marked as such)            10 keep what is not understood, as it was
//
// Dialects: W3C DTCG ($value, $type, $description, $extensions, group types), Tokens Studio (value/type, token sets,
// $themes, $metadata), Style Dictionary (value, CTI categories, {path.value} references), Figma's variables REST
// response (handed to ./figma.ts), a plain map of names to values, and SocriaUX's own export (lossless).

import { colourFromDtcg } from './colour';
import { inferType } from './classify';
import { refreshRoles } from './classify';
import { mapFigmaVariables } from './figma';
import { DEFAULT_MODE_WORDS, emptyContent, modeName, normalizeContent, normalizePath, plainValue, segmentOk, TOKEN_TYPES, UNSAFE_KEY, type GroupMeta, type SourceRef, type SystemContent, type Token, type TokenType, type TokenValue } from './schema';
import { dimensionText, isAlias, refsIn, validate, weightOf, type Issue } from './tokens';

export interface ImportFile {
  name: string;
  text: string;
}

export interface ImportIssue {
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
  column?: number;
  path?: string;
  message: string;
  fix?: string;
}

export interface ImportResult {
  content: SystemContent;
  format: string;
  issues: ImportIssue[];
  /** what was read, assumed or converted, said plainly */
  notes: string[];
}

export const MAX_JSON = 2_000_000;
const MAX_DEPTH = 16;

/** Where a JSON.parse error happened, as a line and column the designer can find. */
export function jsonErrorAt(text: string, e: unknown): { line?: number; column?: number; message: string } {
  const msg = e instanceof Error ? e.message : String(e);
  const lc = msg.match(/line (\d+) column (\d+)/i);
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]), message: msg.replace(/^JSON\.parse: /, '') };
  const pos = msg.match(/position (\d+)/i);
  if (pos) {
    const at = Number(pos[1]);
    const before = text.slice(0, at);
    const line = before.split('\n').length;
    return { line, column: at - before.lastIndexOf('\n'), message: msg.replace(/ in JSON at position \d+.*$/, '') };
  }
  return { message: msg };
}

type Dialect = 'socriaux' | 'figma-variables' | 'tokens-studio' | 'dtcg' | 'style-dictionary' | 'plain';

/** The JSON dialect a parsed file is written in. */
export function detectDialect(root: unknown): Dialect {
  const r = root && typeof root === 'object' && !Array.isArray(root) ? (root as Record<string, any>) : {};
  if (typeof r.$schema === 'string' && /socriaux/i.test(r.$schema) && r.system) return 'socriaux';
  if (r.meta && typeof r.meta === 'object' && r.meta.variables && r.meta.variableCollections) return 'figma-variables';
  if (r.variables && r.variableCollections) return 'figma-variables';
  if (Array.isArray(r.$themes) || (r.$metadata && Array.isArray(r.$metadata.tokenSetOrder))) return 'tokens-studio';
  let dollar = 0;
  let plainValue = 0;
  let typed = 0;
  let leaves = 0;
  const walk = (n: unknown, d: number) => {
    if (d > 10 || !n || typeof n !== 'object' || Array.isArray(n)) return;
    const o = n as Record<string, unknown>;
    if ('$value' in o) return void dollar++;
    if ('value' in o && (typeof o.value !== 'object' || o.value === null || Array.isArray(o.value) || !Object.values(o.value as object).some((x) => x && typeof x === 'object' && ('value' in (x as object) || '$value' in (x as object))))) {
      plainValue++;
      if (typeof o.type === 'string') typed++;
      return;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith('$')) continue;
      if (v === null || typeof v !== 'object') leaves++;
      else walk(v, d + 1);
    }
  };
  walk(r, 0);
  if (dollar && dollar >= plainValue) return 'dtcg';
  if (plainValue) return typed / plainValue > 0.5 ? 'tokens-studio' : 'style-dictionary';
  return leaves ? 'plain' : 'dtcg';
}

const TS_TYPES: Record<string, TokenType> = {
  color: 'color',
  sizing: 'dimension',
  spacing: 'dimension',
  borderradius: 'dimension',
  borderwidth: 'dimension',
  fontsizes: 'dimension',
  fontsize: 'dimension',
  dimension: 'dimension',
  paragraphspacing: 'dimension',
  letterspacing: 'dimension',
  fontfamilies: 'fontFamily',
  fontfamily: 'fontFamily',
  fontweights: 'fontWeight',
  fontweight: 'fontWeight',
  lineheights: 'number',
  lineheight: 'number',
  opacity: 'number',
  number: 'number',
  boxshadow: 'shadow',
  shadow: 'shadow',
  typography: 'typography',
  border: 'border',
  duration: 'duration',
  cubicbezier: 'cubicBezier',
  gradient: 'gradient',
  strokestyle: 'strokeStyle',
  transition: 'transition',
  fontstyle: 'fontStyle',
  boolean: 'boolean',
  text: 'string',
  textcase: 'string',
  textdecoration: 'string',
  other: 'string',
  string: 'string',
};

/** A declared type, in any dialect's words, as a canonical type (or null when it says nothing usable). */
export function typeFromDeclared(t: unknown): TokenType | null {
  if (typeof t !== 'string') return null;
  if ((TOKEN_TYPES as readonly string[]).includes(t)) return t as TokenType;
  return TS_TYPES[t.toLowerCase().replace(/[^a-z]/g, '')] ?? null;
}

/** A reference in any dialect's form, as a canonical one: {a.b}, {a.b.value} and $a.b become {a.b}. */
export function canonicalRefs(v: unknown): unknown {
  if (typeof v === 'string') {
    let s = v.replace(/\{([^{}]+?)\.\$?value\}/g, '{$1}');
    if (/^\$[\w.-]+$/.test(s.trim())) s = `{${s.trim().slice(1)}}`;
    return s;
  }
  if (Array.isArray(v)) return v.map(canonicalRefs);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !UNSAFE_KEY.test(k)).map(([k, x]) => [k, canonicalRefs(x)]));
  return v;
}

/** A value normalized to its type: DTCG colour and dimension objects as CSS text, unitless sizes given a unit, weight names as numbers… */
export function normalizeValue(type: TokenType, v: unknown, notes: Set<string>, dialect: Dialect): unknown {
  if (isAlias(v) || (typeof v === 'string' && refsIn(v).length && type !== 'color')) return v;
  switch (type) {
    case 'color':
      if (v && typeof v === 'object' && !Array.isArray(v)) return colourFromDtcg(v as Record<string, unknown>) ?? v;
      return typeof v === 'string' ? v.trim() : v;
    case 'dimension': {
      if (typeof v === 'number' || (typeof v === 'string' && /^-?[\d.]+$/.test(v.trim()))) {
        const n = Number(v);
        if (n === 0) return '0px';
        if (dialect === 'style-dictionary') {
          notes.add('Unitless sizes were read as rem, as Style Dictionary’s default transforms treat them (inferred).');
          return `${n}rem`;
        }
        notes.add('Unitless sizes were read as px, as Tokens Studio and Figma treat them.');
        return `${n}px`;
      }
      return dimensionText(v) ?? v;
    }
    case 'fontWeight': {
      if (typeof v === 'string') {
        const w = weightOf(v.toLowerCase().replace(/\s+/g, '-'));
        if (w) return w;
      }
      return v;
    }
    case 'number':
      if (typeof v === 'string' && /^-?[\d.]+%$/.test(v.trim())) {
        notes.add('Percentages for line heights and opacity were read as fractions (150% → 1.5).');
        return Math.round(parseFloat(v) * 100) / 10000;
      }
      if (typeof v === 'string' && /^-?[\d.]+$/.test(v.trim())) return Number(v);
      return v;
    case 'fontFamily':
      return Array.isArray(v) ? v.map(String) : v;
    case 'typography': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
      const r = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(r)) {
        if (UNSAFE_KEY.test(k)) continue;
        if (k === 'fontSize' || k === 'letterSpacing' || k === 'paragraphSpacing') out[k] = normalizeValue('dimension', x, notes, dialect);
        else if (k === 'fontWeight') out[k] = normalizeValue('fontWeight', x, notes, dialect);
        else if (k === 'lineHeight') out[k] = typeof x === 'string' && /%$/.test(x) ? normalizeValue('number', x, notes, dialect) : typeof x === 'string' && /^[\d.]+$/.test(x) ? Number(x) : (dimensionText(x) ?? x);
        else if (k === 'fontFamily') out[k] = Array.isArray(x) ? x.map(String) : x;
        else out[k] = x;
      }
      return out;
    }
    case 'shadow': {
      const one = (s: unknown): unknown => {
        if (!s || typeof s !== 'object' || Array.isArray(s)) return s;
        const r = s as Record<string, unknown>;
        // Tokens Studio's box shadow: x, y, blur, spread, color, type
        const out: Record<string, unknown> = {
          color: normalizeValue('color', r.color ?? '#000000', notes, dialect),
          offsetX: normalizeValue('dimension', r.offsetX ?? r.x ?? 0, notes, dialect),
          offsetY: normalizeValue('dimension', r.offsetY ?? r.y ?? 0, notes, dialect),
          blur: normalizeValue('dimension', r.blur ?? 0, notes, dialect),
          spread: normalizeValue('dimension', r.spread ?? 0, notes, dialect),
        };
        if (r.inset === true || r.type === 'innerShadow') out.inset = true;
        return out;
      };
      return Array.isArray(v) ? v.map(one) : one(v);
    }
    case 'gradient':
      return Array.isArray(v) ? v.map((s) => (s && typeof s === 'object' ? { ...(s as object), color: normalizeValue('color', (s as Record<string, unknown>).color, notes, dialect) } : s)) : v;
    case 'border': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
      const r = v as Record<string, unknown>;
      return { ...r, ...(r.color !== undefined ? { color: normalizeValue('color', r.color, notes, dialect) } : {}), ...(r.width !== undefined ? { width: normalizeValue('dimension', r.width, notes, dialect) } : {}) };
    }
    case 'duration':
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const r = v as Record<string, unknown>;
        if (typeof r.value === 'number' && (r.unit === 'ms' || r.unit === 's')) return `${r.value}${r.unit}`;
      }
      return v;
    default:
      return v;
  }
}

interface Collected {
  path: string;
  raw: unknown;
  declared: TokenType | null;
  description?: string;
  deprecated?: boolean | string;
  extensions?: Record<string, unknown>;
  modes?: Record<string, unknown>;
  property: string;
}

const MODE_SEG = /^(light|dark|dim|night|day|high-?contrast|hc|default)$/i;

/** The tokens of one JSON tree (a dialect's groups and leaves), with groups' metadata and what was not understood. */
function walkTree(root: Record<string, unknown>, dialect: Dialect, notes: Set<string>): { tokens: Collected[]; groups: Record<string, GroupMeta>; unknown: Record<string, unknown>; renamed: Map<string, string> } {
  const tokens: Collected[] = [];
  const groups: Record<string, GroupMeta> = {};
  const unknown: Record<string, unknown> = {};
  const renamed = new Map<string, string>();
  const segment = (k: string) => {
    if (segmentOk(k)) return k;
    const s = k.replace(/\./g, '-').replace(/[{}]/g, '').replace(/^\$+/, '').trim();
    return segmentOk(s) ? s : null;
  };
  const walk = (node: unknown, path: string[], inherited: TokenType | null, depth: number) => {
    if (depth > MAX_DEPTH || tokens.length > 6000 || !node || typeof node !== 'object' || Array.isArray(node)) return;
    const r = node as Record<string, unknown>;
    const isToken = dialect === 'dtcg' ? '$value' in r : '$value' in r || ('value' in r && (typeof r.value !== 'object' || r.value === null || Array.isArray(r.value) || !Object.values(r.value as object).some((x) => x && typeof x === 'object' && ('value' in (x as object) || '$value' in (x as object)))));
    if (isToken && path.length) {
      const raw = '$value' in r ? r.$value : r.value;
      const declared = typeFromDeclared(r.$type ?? r.type) ?? inherited;
      const ext = r.$extensions && typeof r.$extensions === 'object' && !Array.isArray(r.$extensions) ? ({ ...(r.$extensions as Record<string, unknown>) } as Record<string, unknown>) : undefined;
      // modes carried in $extensions (several exporters' conventions, and SocriaUX's own)
      let modes: Record<string, unknown> | undefined;
      for (const key of ['com.socriaux', 'mode', 'modes', 'com.figma.modes']) {
        const m = ext?.[key];
        const mm = key === 'com.socriaux' ? (m as Record<string, unknown> | undefined)?.modes : m;
        if (mm && typeof mm === 'object' && !Array.isArray(mm)) {
          modes = { ...(modes ?? {}), ...(mm as Record<string, unknown>) };
          if (key !== 'com.socriaux') delete ext![key];
        }
      }
      if (ext?.['com.socriaux']) {
        const own = { ...(ext['com.socriaux'] as Record<string, unknown>) };
        delete own.modes;
        if (Object.keys(own).length) ext['com.socriaux'] = own;
        else delete ext['com.socriaux'];
      }
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) if (!['$value', 'value', '$type', 'type', '$description', 'description', 'comment', '$extensions', '$deprecated', 'deprecated'].includes(k) && !UNSAFE_KEY.test(k)) extra[k] = v;
      const extensions = { ...(ext ?? {}), ...(Object.keys(extra).length ? { 'org.socriaux.unread': extra } : {}) };
      tokens.push({
        path: path.join('.'),
        raw,
        declared,
        ...(typeof (r.$description ?? r.description ?? r.comment) === 'string' ? { description: String(r.$description ?? r.description ?? r.comment) } : {}),
        ...(r.$deprecated !== undefined || r.deprecated !== undefined ? { deprecated: (r.$deprecated ?? r.deprecated) as boolean | string } : {}),
        ...(Object.keys(extensions).length ? { extensions } : {}),
        ...(modes ? { modes } : {}),
        property: path.join('.'),
      });
      return;
    }
    const groupType = typeFromDeclared(r.$type ?? (dialect !== 'dtcg' && !('value' in r) ? undefined : undefined)) ?? inherited;
    if (path.length && (r.$type !== undefined || r.$description !== undefined || r.$extensions !== undefined)) {
      groups[path.join('.')] = {
        ...(typeof r.$description === 'string' ? { description: r.$description } : {}),
        ...(typeFromDeclared(r.$type) ? { type: typeFromDeclared(r.$type)! } : {}),
        ...(r.$extensions && typeof r.$extensions === 'object' ? { extensions: r.$extensions as Record<string, unknown> } : {}),
      };
    }
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('$')) {
        if (!path.length && !['$type', '$description', '$extensions', '$schema'].includes(k)) unknown[k] = v;
        continue;
      }
      if (UNSAFE_KEY.test(k)) {
        notes.add(`A key named “${k}” was skipped: it is never read as a token.`);
        continue;
      }
      const seg = segment(k);
      if (!seg) {
        unknown[[...path, k].join('/')] = v;
        notes.add(`“${k}” is not a usable token name; its contents were kept, unread.`);
        continue;
      }
      if (seg !== k) renamed.set([...path, k].join('.'), [...path, seg].join('.'));
      if (v === null || typeof v !== 'object' || Array.isArray(v)) {
        if (dialect === 'plain' || dialect === 'style-dictionary') {
          tokens.push({ path: [...path, seg].join('.'), raw: v, declared: groupType, property: [...path, k].join('.') });
        } else if (dialect === 'dtcg' && (k === 'type' || k === 'description')) continue;
        else unknown[[...path, k].join('.')] = v;
        continue;
      }
      walk(v, [...path, seg], groupType, depth + 1);
    }
  };
  walk(root, [], null, 0);
  return { tokens, groups, unknown, renamed };
}

/** Light/dark (and other) groups at one level, as modes of the same tokens: color.light.bg + color.dark.bg → color.bg with a dark mode. */
function foldModeGroups(tokens: Collected[], notes: Set<string>): { tokens: Collected[]; modes: string[] } {
  const modesFound = new Set<string>();
  const byStripped = new Map<string, Map<string, Collected>>();
  for (const t of tokens) {
    const segs = t.path.split('.');
    const i = segs.findIndex((s) => MODE_SEG.test(s));
    if (i < 0) continue;
    const m = modeName(segs[i]);
    const key = [...segs.slice(0, i), ...segs.slice(i + 1)].join('.');
    if (!key) continue;
    if (!byStripped.has(key)) byStripped.set(key, new Map());
    byStripped.get(key)!.set(m, t);
    modesFound.add(m);
  }
  // only when at least two modes share most of their tokens is it a mode split rather than names that mention light or dark
  if (modesFound.size < 2) return { tokens, modes: [] };
  const shared = [...byStripped.values()].filter((m) => m.size >= 2).length;
  if (shared < Math.max(2, byStripped.size * 0.5)) return { tokens, modes: [] };
  const order = [...modesFound].sort((a, b) => (DEFAULT_MODE_WORDS.test(a) ? -1 : DEFAULT_MODE_WORDS.test(b) ? 1 : 0));
  const base = order[0];
  const folded: Collected[] = [];
  const consumed = new Set<Collected>();
  for (const [key, m] of byStripped) {
    const def = m.get(base) ?? [...m.values()][0];
    const modes: Record<string, unknown> = {};
    for (const [mode, t] of m) if (t !== def) modes[mode] = t.raw;
    folded.push({ ...def, path: key, ...(Object.keys(modes).length ? { modes: { ...(def.modes ?? {}), ...modes } } : {}) });
    for (const t of m.values()) consumed.add(t);
  }
  notes.add(`Groups named ${order.join(' and ')} were read as modes of the same tokens (inferred from the structure).`);
  // references to the mode-split paths follow the fold
  const rewrite = (v: unknown): unknown => {
    if (typeof v === 'string')
      return v.replace(/\{([^{}]+)\}/g, (all, ref: string) => {
        const segs = ref.split('.');
        const i = segs.findIndex((s) => MODE_SEG.test(s));
        return i >= 0 ? `{${[...segs.slice(0, i), ...segs.slice(i + 1)].join('.')}}` : all;
      });
    if (Array.isArray(v)) return v.map(rewrite);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, rewrite(x)]));
    return v;
  };
  const rest = tokens.filter((t) => !consumed.has(t));
  return { tokens: [...rest, ...folded].map((t) => ({ ...t, raw: rewrite(t.raw), ...(t.modes ? { modes: Object.fromEntries(Object.entries(t.modes).map(([k, v]) => [k, rewrite(v)])) } : {}) })), modes: order };
}

/** Tokens Studio's sets and themes: the default theme's enabled sets give the values, every other theme a mode. */
function tokensStudioTrees(root: Record<string, any>, notes: Set<string>): { trees: { tree: Record<string, unknown>; mode: string | null; set: string }[]; modes: string[] } {
  const order: string[] = Array.isArray(root.$metadata?.tokenSetOrder) ? root.$metadata.tokenSetOrder.filter((x: unknown) => typeof x === 'string') : Object.keys(root).filter((k) => !k.startsWith('$'));
  const themes: { name: string; sets: Record<string, string> }[] = Array.isArray(root.$themes) ? root.$themes.filter((t: any) => t && typeof t.name === 'string').map((t: any) => ({ name: t.name, sets: t.selectedTokenSets && typeof t.selectedTokenSets === 'object' ? t.selectedTokenSets : {} })) : [];
  // top-level keys are token sets only when the file says so ($metadata.tokenSetOrder or $themes); otherwise groups
  const declared = Array.isArray(root.$metadata?.tokenSetOrder) || Array.isArray(root.$themes);
  const setsAreGroups = declared && order.length && order.every((s) => root[s] && typeof root[s] === 'object');
  if (!setsAreGroups) return { trees: [{ tree: root, mode: null, set: '' }], modes: [] };
  if (!themes.length) {
    notes.add(`Tokens Studio sets merged in their order: ${order.join(', ')}.`);
    return { trees: order.map((s) => ({ tree: root[s], mode: null, set: s })), modes: [] };
  }
  const base = themes.find((t) => DEFAULT_MODE_WORDS.test(modeName(t.name))) ?? themes[0];
  const enabled = (t: { sets: Record<string, string> }) => order.filter((s) => t.sets[s] === 'enabled' || t.sets[s] === 'source');
  const trees: { tree: Record<string, unknown>; mode: string | null; set: string }[] = enabled(base).map((s) => ({ tree: root[s], mode: null, set: s }));
  const modes = [modeName(base.name) || 'light'];
  for (const t of themes) {
    if (t === base) continue;
    const m = modeName(t.name);
    if (!m || modes.includes(m)) continue;
    modes.push(m);
    for (const s of order.filter((x) => t.sets[x] === 'enabled' && base.sets[x] !== 'enabled' && base.sets[x] !== 'source')) trees.push({ tree: root[s], mode: m, set: s });
  }
  notes.add(`Tokens Studio themes read as modes: ${modes.join(', ')} (the ${modes[0]} theme’s sets give the default values).`);
  return { trees, modes };
}

const fileMode = (name: string): string | null => {
  const m = name.toLowerCase().match(/(^|[._/\-\s])(dark|light|dim|night|high-?contrast)([._/\-\s]|$)/);
  return m ? modeName(m[2]) : null;
};

/**
 * Design tokens from one or more JSON files (see the head of this file). Several files merge; a file named for a
 * mode (tokens.dark.json) gives that mode's values. Problems come back as issues with where they are and what to do.
 */
/** A system's name from a file's name: "acme.tokens.json" → "Acme". */
export function fileStem(name: string | undefined): string {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? '';
  const stem = base.replace(/(\.(tokens|dtcg|variables|design-tokens|theme|light|dark|socriaux|style-dictionary))*\.(json|css|scss|less|md|mdx|txt|pdf)$/i, '').replace(/\.(tokens|dtcg|variables)$/i, '').replace(/[-_.]+/g, ' ').trim();
  if (!stem || /^(tokens?|design tokens|variables|theme|styles?|globals|index)$/i.test(stem)) return '';
  return stem.charAt(0).toUpperCase() + stem.slice(1, 60);
}

export function importJson(files: readonly ImportFile[], opts: { now?: number; ref?: string; name?: string } = {}): ImportResult {
  const now = opts.now ?? Date.now();
  const notes = new Set<string>();
  const issues: ImportIssue[] = [];
  const content = emptyContent(opts.name || fileStem(files[0]?.name));
  let format = '';
  const collected: (Collected & { file: string; mode: string | null; dialect: Dialect })[] = [];
  const modes: string[] = [];
  const addMode = (m: string) => m && !modes.includes(m) && modes.push(m);
  for (const f of files.slice(0, 24)) {
    if (f.text.length > MAX_JSON) {
      issues.push({ severity: 'error', file: f.name, message: `${f.name} is larger than ${MAX_JSON / 1_000_000} MB.`, fix: 'Split it into smaller token files.' });
      continue;
    }
    let root: unknown;
    try {
      root = JSON.parse(f.text);
    } catch (e) {
      const at = jsonErrorAt(f.text, e);
      issues.push({ severity: 'error', file: f.name, ...(at.line ? { line: at.line, column: at.column } : {}), message: `${f.name} is not valid JSON${at.line ? ` (line ${at.line}, column ${at.column})` : ''}: ${at.message}.`, fix: 'Fix the JSON there (a missing comma, quote or brace is the usual cause) and import it again.' });
      continue;
    }
    if (!root || typeof root !== 'object' || Array.isArray(root)) {
      issues.push({ severity: 'error', file: f.name, message: `${f.name} does not hold an object of tokens.` });
      continue;
    }
    const dialect = detectDialect(root);
    format = format && format !== dialect ? 'mixed' : dialect;
    if (dialect === 'socriaux') {
      const own = normalizeContent((root as Record<string, unknown>).system);
      notes.add('A SocriaUX export: read exactly as it was written, provenance included.');
      return finish(own, 'socriaux', issues, notes, now, { exact: true });
    }
    if (dialect === 'figma-variables') {
      const r = root as Record<string, any>;
      const mapped = mapFigmaVariables(r.meta ?? r, { fileKey: opts.ref ?? f.name, now });
      for (const n of mapped.notes) notes.add(n);
      for (const m of mapped.content.modes) addMode(m);
      Object.assign(content.tokens, mapped.content.tokens);
      Object.assign(content.groups, mapped.content.groups);
      issues.push(...mapped.issues.map((i) => ({ ...i, file: f.name })));
      continue;
    }
    const fm = fileMode(f.name);
    const trees = dialect === 'tokens-studio' ? tokensStudioTrees(root as Record<string, any>, notes) : { trees: [{ tree: root as Record<string, unknown>, mode: null, set: '' }], modes: [] };
    trees.modes.forEach(addMode);
    for (const tr of trees.trees) {
      const w = walkTree(tr.tree, dialect === 'tokens-studio' ? 'tokens-studio' : dialect, notes);
      Object.assign(content.groups, w.groups);
      if (Object.keys(w.unknown).length) content.unknown[`${f.name}${tr.set ? `#${tr.set}` : ''}`] = w.unknown;
      for (const [from, to] of w.renamed) notes.add(`“${from}” was renamed ${to}: dots are not allowed inside a token name.`);
      for (const t of w.tokens) collected.push({ ...t, file: f.name, mode: tr.mode ?? fm, dialect });
    }
  }
  // modes from file names: the default first
  const fileModes = [...new Set(collected.map((c) => c.mode).filter((m): m is string => !!m))];
  if (fileModes.length) {
    const hasPlain = collected.some((c) => !c.mode);
    if (!modes.length) addMode(hasPlain ? 'light' : (fileModes.find((m) => DEFAULT_MODE_WORDS.test(m)) ?? fileModes[0]));
    fileModes.forEach(addMode);
    notes.add(`Files named for a mode gave that mode’s values: ${fileModes.join(', ')}.`);
  }
  const base = modes[0] ?? 'light';
  // fold: default-mode values first, then each mode's values onto the same path
  const byPath = new Map<string, Collected & { file: string; dialect: Dialect; modes?: Record<string, unknown> }>();
  for (const c of collected.filter((x) => !x.mode || x.mode === base)) {
    if (byPath.has(c.path)) {
      const prev = byPath.get(c.path)!;
      if (JSON.stringify(prev.raw) !== JSON.stringify(c.raw)) issues.push({ severity: 'warning', file: c.file, path: c.path, message: `${c.path} is defined twice (${prev.file} and ${c.file}); the later one is kept.`, fix: 'Resolve the duplicate in the review step if it matters.' });
    }
    byPath.set(c.path, { ...c });
  }
  for (const c of collected.filter((x) => x.mode && x.mode !== base)) {
    const t = byPath.get(c.path);
    if (t) t.modes = { ...(t.modes ?? {}), [c.mode!]: c.raw };
    else {
      byPath.set(c.path, { ...c, modes: { [c.mode!]: c.raw } });
      notes.add(`Some tokens exist only in the ${c.mode} mode; their ${c.mode} value stands as the default too.`);
    }
  }
  let all = [...byPath.values()];
  if (!modes.length || modes.length === 1) {
    const f = foldModeGroups(all, notes);
    if (f.modes.length) {
      all = f.tokens as typeof all;
      modes.splice(0, modes.length, ...f.modes);
    }
  }
  // modes named only on tokens ($extensions.mode): the values themselves are the default mode, named light unless
  // light is one of the named ones
  const tokenModes = [...new Set(all.flatMap((c) => Object.keys(c.modes ?? {}).map(modeName)).filter(Boolean))];
  if (!modes.length && tokenModes.length) addMode(tokenModes.includes('light') ? 'default' : 'light');
  tokenModes.forEach(addMode);
  content.modes = modes.length ? modes : ['light'];
  const src = (c: (typeof all)[number]): SourceRef => ({ kind: 'json', ref: opts.ref ?? c.file, file: c.file, property: c.property });
  for (const c of all) {
    const path = normalizePath(c.path);
    if (!path) continue;
    const raw = canonicalRefs(c.raw);
    // Style Dictionary's CTI: everything under "size" is a size, written unitless
    const sdSize = c.dialect === 'style-dictionary' && !c.declared && /^size(\.|$)/.test(path) && (typeof raw === 'number' || (typeof raw === 'string' && /^-?[\d.]+$/.test(raw)));
    const type: TokenType = c.declared ?? (sdSize ? 'dimension' : inferType(path, raw as TokenValue));
    const value = plainValue(normalizeValue(type, raw, notes, c.dialect));
    if (value === undefined) {
      issues.push({ severity: 'warning', file: c.file, path, message: `${path} has a value SocriaUX cannot keep (${typeof c.raw}); it was skipped.` });
      continue;
    }
    const tokModes: Record<string, TokenValue> = {};
    for (const [m, v] of Object.entries(c.modes ?? {})) {
      const mv = plainValue(normalizeValue(type, canonicalRefs(v), notes, c.dialect));
      const mn = modeName(m);
      if (mv !== undefined && mn && mn !== content.modes[0]) tokModes[mn] = mv;
    }
    const token: Token = {
      path,
      type,
      value,
      ...(Object.keys(tokModes).length ? { modes: tokModes } : {}),
      ...(c.description ? { description: c.description.slice(0, 600) } : {}),
      ...(c.deprecated !== undefined && c.deprecated !== false ? { deprecated: c.deprecated } : {}),
      provenance: { source: src(c), importedAt: now, original: (plainValue(c.raw) ?? value) as TokenValue, status: c.declared ? 'imported' : 'inferred', confidence: c.declared ? 1 : 0.7, ...(c.declared ? {} : { note: `type ${type} inferred from its name and value` }) },
      ...(c.extensions ? { extensions: c.extensions } : {}),
    };
    content.tokens[path] = token;
  }
  repairDottedRefs(content, notes);
  if (!format) format = 'json';
  return finish(content, format, issues, notes, now);
}

/** References to names that held dots ({space.1.5}) pointed at the renamed token (space.1-5). */
function repairDottedRefs(c: SystemContent, notes: Set<string>) {
  const paths = new Set(Object.keys(c.tokens));
  const fix = (v: unknown): unknown => {
    if (typeof v === 'string')
      return v.replace(/\{([^{}]+)\}/g, (all, ref: string) => {
        if (paths.has(ref)) return all;
        const segs = ref.split('.');
        for (let k = segs.length - 1; k > 0; k--) {
          const cand = [...segs.slice(0, k), segs.slice(k).join('-')].join('.');
          if (paths.has(cand)) {
            notes.add(`References to ${ref} now point at ${cand}.`);
            return `{${cand}}`;
          }
        }
        return all;
      });
    if (Array.isArray(v)) return v.map(fix);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, fix(x)]));
    return v;
  };
  for (const t of Object.values(c.tokens)) {
    t.value = fix(t.value) as TokenValue;
    if (t.modes) t.modes = Object.fromEntries(Object.entries(t.modes).map(([m, v]) => [m, fix(v) as TokenValue]));
  }
}

/** Tokens whose type was only guessed and whose value refers to others take the type of what they refer to. */
export function typeFromTargets(c: SystemContent, notes: Set<string>): SystemContent {
  let n = 0;
  const tokens = { ...c.tokens };
  for (let pass = 0; pass < 4; pass++) {
    for (const t of Object.values(tokens)) {
      if (t.provenance.status !== 'inferred' || (t.type !== 'string' && !isAlias(t.value))) continue;
      const ref = refsIn(t.value)[0];
      const target = ref ? tokens[ref] : undefined;
      if (!target || target.type === t.type || target.type === 'string') continue;
      // an expression over a dimension is a dimension; a plain reference takes its target's type
      if (!isAlias(t.value) && !['dimension', 'number', 'duration'].includes(target.type) && typeof t.value === 'string' && /[*/+]/.test(t.value)) continue;
      tokens[t.path] = { ...t, type: target.type, provenance: { ...t.provenance, note: `type ${target.type} taken from ${ref}, which it refers to` } };
      n++;
    }
  }
  if (n) notes.add(`${n} token${n === 1 ? '' : 's'} without a declared type took the type of the token they refer to.`);
  return { ...c, tokens };
}

/** The import's last steps: validation into issues, roles inferred, the name settled. */
export function finish(content: SystemContent, format: string, issues: ImportIssue[], notes: Set<string>, now: number, opts: { exact?: boolean } = {}): ImportResult {
  void now;
  // SocriaUX's own export is read exactly: no type or role is inferred over what it says
  const typed = opts.exact ? normalizeContent(content) : typeFromTargets(normalizeContent(content), notes);
  const withRoles = opts.exact ? typed : refreshRoles(typed);
  const v = validate(withRoles).filter((i) => i.code !== 'empty');
  const toIssue = (i: Issue): ImportIssue => ({ severity: i.severity, ...(i.path ? { path: i.path } : {}), message: i.message, ...(i.fix ? { fix: i.fix } : {}) });
  if (!Object.keys(withRoles.tokens).length && !issues.some((i) => i.severity === 'error')) issues.push({ severity: 'error', message: 'No design tokens were found in that file.', fix: 'Check it is a tokens file (W3C DTCG, Tokens Studio, Style Dictionary or a map of names to values).' });
  return { content: withRoles, format, issues: [...issues, ...v.map(toIssue)], notes: [...notes] };
}
