// lib/ux-v0/dsi/import-css.ts — CSS custom properties as design tokens.
//
// :root (and html, :host, body) gives the default mode; theme selectors ([data-theme="dark"], .dark, .theme-dark,
// [data-mode=…]) and media queries (prefers-color-scheme, prefers-contrast) give the other modes. var(--x) becomes a
// reference to x, var(--x, fallback) keeps its fallback, calc() over variables becomes token maths where it is plain
// arithmetic. @property declarations give a variable its type outright; otherwise the type is read from the name and
// value — an inference, said as one. Variables scoped to other selectors (a component's own) are kept, unread, and
// said. Nothing is fetched (@import and url() are listed only) and nothing is evaluated.

import { inferType, refreshRoles } from './classify';
import { parseCss, varsIn, type CssDecl, type CssRule } from './css-parse';
import { emptyContent, modeName, normalizePath, type SystemContent, type Token, type TokenType, type TokenValue } from './schema';
import { pathFromCssName } from './tokens';
import { fileStem, finish, normalizeValue, type ImportFile, type ImportIssue, type ImportResult } from './import-json';
import { refsIn } from './tokens';

const ROOTS = /^(:root|html|:host|body|\*|:where\(:root\)|:host\(\))$/i;
const THEME = /(?:\[data-(?:theme|mode|color-scheme|color-mode|scheme)\s*=\s*["']?([\w-]+)["']?\]|\.(?:theme-|mode-)?(dark|light|dim|high-contrast)\b)/i;

/** The mode a rule's variables belong to (null: the default), or 'scoped' when the selector is not a root or theme. */
export function modeOfRule(r: CssRule, selector: string): string | null | 'scoped' {
  const media = r.context.join(' ').toLowerCase();
  let mode: string | null = null;
  if (/prefers-color-scheme\s*:\s*dark/.test(media)) mode = 'dark';
  else if (/prefers-color-scheme\s*:\s*light/.test(media)) mode = 'light';
  else if (/prefers-contrast\s*:\s*more/.test(media)) mode = 'high-contrast';
  const s = selector.trim();
  const th = s.match(THEME);
  if (th) {
    const m = modeName(th[1] ?? th[2]);
    const rest = s.replace(THEME, '').trim();
    if (!rest || ROOTS.test(rest) || /^(:root|html|body)$/i.test(rest.replace(/[\s>]+$/, ''))) return m || mode;
    return 'scoped';
  }
  if (ROOTS.test(s)) return mode;
  return 'scoped';
}

/** A CSS value as a token value: var() as references, calc() over variables as token maths, the rest as written. */
export function cssValue(v: string, pathOf: (name: string) => string | null, defined: Set<string>): { value: string; fallback?: string; note?: string } {
  const s = v.trim();
  const whole = s.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (whole) {
    const p = pathOf(whole[1]);
    if (p && defined.has(whole[1])) return { value: `{${p}}`, ...(whole[2] ? { fallback: whole[2].trim() } : {}) };
    if (whole[2]) return { ...cssValue(whole[2].trim(), pathOf, defined), note: `${whole[1]} is not defined; its fallback stands` };
    return { value: p ? `{${p}}` : s };
  }
  const calc = s.match(/^calc\(([\s\S]+)\)$/);
  if (calc && varsIn(calc[1]).length) {
    const expr = calc[1].replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_m, n: string) => `{${pathOf(n) ?? n}}`);
    if (/^[\s{}\w.\-+*/()%]+$/.test(expr)) return { value: expr.trim() };
    return { value: s, note: 'a calc() SocriaUX keeps as written' };
  }
  if (varsIn(s).length) return { value: s.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_m, n: string) => `{${pathOf(n) ?? n}}`) };
  return { value: s };
}

const PROPERTY_TYPES: Record<string, TokenType> = { '<color>': 'color', '<length>': 'dimension', '<length-percentage>': 'dimension', '<percentage>': 'dimension', '<number>': 'number', '<integer>': 'number', '<time>': 'duration', '<custom-ident>': 'string', '<string>': 'string' };

/** CSS files' custom properties as design tokens (see the head of this file). */
export function importCss(files: readonly ImportFile[], opts: { now?: number; ref?: string; name?: string } = {}): ImportResult {
  const now = opts.now ?? Date.now();
  const notes = new Set<string>();
  const issues: ImportIssue[] = [];
  const content: SystemContent = emptyContent(opts.name || fileStem(files[0]?.name));
  type Def = { decl: CssDecl; file: string; selector: string };
  const vars = new Map<string, { base?: Def; modes: Map<string, Def> }>();
  const typed = new Map<string, { type: TokenType; initial: string }>();
  const scoped: Record<string, Record<string, string>> = {};
  const fontFaces: { family: string; src: string[] }[] = [];
  const pathMap = new Map<string, string>();
  const explicitModes = new Set<string>();
  let read = 0;
  for (const f of files.slice(0, 24)) {
    // SocriaUX's own export names each variable's exact token path
    const header = f.text.match(/socriaux:paths\s+(\{[\s\S]*?\})\s*\*\//);
    if (header) {
      try {
        for (const [n, p] of Object.entries(JSON.parse(header[1]) as Record<string, string>)) {
          const np = normalizePath(p);
          if (/^--[\w-]+$/.test(n) && np) pathMap.set(n, np);
        }
      } catch {
        issues.push({ severity: 'warning', file: f.name, message: 'The SocriaUX path list at the top of the file could not be read; names were turned into paths instead.' });
      }
    }
    const sheet = parseCss(f.text);
    sheet.notes.forEach((n) => notes.add(n));
    if (sheet.imports.length) notes.add(`@import addresses were listed, not fetched: ${sheet.imports.slice(0, 4).join(', ')}${sheet.imports.length > 4 ? '…' : ''}.`);
    for (const p of sheet.properties) {
      const t = PROPERTY_TYPES[p.syntax.trim()] ?? null;
      if (t) typed.set(p.name, { type: t, initial: p.initial });
    }
    fontFaces.push(...sheet.fontFaces.map((x) => ({ family: x.family, src: x.src })));
    for (const r of sheet.rules) {
      for (const sel of r.selectors) {
        const mode = modeOfRule(r, sel);
        for (const d of r.decls) {
          if (!d.prop.startsWith('--')) continue;
          read++;
          if (mode === 'scoped') {
            (scoped[sel.slice(0, 120)] ??= {})[d.prop] = d.value.slice(0, 300);
            continue;
          }
          if (!vars.has(d.prop)) vars.set(d.prop, { modes: new Map() });
          const entry = vars.get(d.prop)!;
          const def = { decl: d, file: f.name, selector: sel };
          if (mode === null) {
            if (entry.base && entry.base.decl.value !== d.value) issues.push({ severity: 'warning', file: f.name, line: d.line, path: d.prop, message: `${d.prop} is set twice at the root (${entry.base.file}:${entry.base.decl.line} and ${f.name}:${d.line}); the later one is kept, as the browser would.` });
            entry.base = def;
          } else {
            explicitModes.add(mode);
            entry.modes.set(mode, def);
          }
        }
      }
    }
  }
  // @property initial values stand for variables never set
  for (const [name, t] of typed) if (!vars.has(name) && t.initial) vars.set(name, { base: { decl: { prop: name, value: t.initial, important: false, line: 0 }, file: '@property', selector: '@property' }, modes: new Map() });
  if (!vars.size) {
    issues.push({ severity: 'error', message: read ? 'The custom properties found are all scoped to components; none is set at the root or for a theme.' : 'No CSS custom properties (--name: value) were found.', fix: 'Import the stylesheet that sets the variables on :root (often tokens.css, variables.css or globals.css).' });
    return finish(content, 'css', issues, notes, now);
  }
  // the default mode: light, unless the themes given are only "light" (then the root is dark)
  const others = [...explicitModes];
  const base = others.length && others.every((m) => m === 'light') ? 'dark' : 'light';
  if (base === 'dark') notes.add('Only a light theme is declared beside the root, so the root values were read as the dark mode.');
  content.modes = [base, ...others.filter((m) => m !== base)];
  const defined = new Set(vars.keys());
  const pathOf = (n: string) => pathMap.get(n) ?? pathFromCssName(n);
  for (const [name, entry] of vars) {
    const path = pathOf(name);
    if (!path) {
      issues.push({ severity: 'warning', path: name, message: `${name} cannot be turned into a token path; it was kept unread.` });
      content.unknown[`css.unread.${name}`] = entry.base?.decl.value ?? '';
      continue;
    }
    const def = entry.base ?? [...entry.modes.values()][0];
    const conv = cssValue(def.decl.value, pathOf, defined);
    if (conv.note) notes.add(`${name}: ${conv.note}.`);
    const declared = typed.get(name)?.type;
    const type: TokenType = declared ?? inferType(path, def.decl.value.replace(/var\([^)]*\)/g, 'x') === 'x' ? conv.value : def.decl.value);
    const modes: Record<string, TokenValue> = {};
    for (const [m, md] of entry.modes) {
      if (m === content.modes[0] && !entry.base) continue;
      if (m === content.modes[0]) continue;
      const mv = cssValue(md.decl.value, pathOf, defined).value;
      modes[m] = refsIn(mv).length ? mv : (normalizeValue(type, mv, notes, 'plain') as TokenValue);
    }
    if (!entry.base) notes.add(`${name} is set only for the ${[...entry.modes.keys()].join(', ')} mode; that value stands as the default too.`);
    // numbers stay numbers (a weight of 600, a line height of 1.4), as the type says
    const value = refsIn(conv.value).length ? conv.value : (normalizeValue(type, conv.value, notes, 'plain') as TokenValue);
    const token: Token = {
      path,
      type,
      value,
      ...(Object.keys(modes).length ? { modes } : {}),
      provenance: {
        source: { kind: 'css', ref: opts.ref ?? def.file, file: def.file, property: name, selector: def.selector, ...(def.decl.line ? { line: def.decl.line } : {}) },
        importedAt: now,
        original: def.decl.value,
        status: declared ? 'imported' : 'inferred',
        confidence: declared ? 1 : type === 'color' || type === 'dimension' ? 0.85 : 0.6,
        ...(declared ? {} : { note: `the value is the stylesheet’s; its type (${type}) is inferred — CSS variables carry no type` }),
      },
      ...(conv.fallback ? { extensions: { 'org.socriaux.css': { fallback: conv.fallback } } } : {}),
    };
    content.tokens[path] = token;
  }
  if (Object.keys(scoped).length) {
    content.unknown['css.scoped'] = scoped;
    notes.add(`${Object.keys(scoped).length} selector${Object.keys(scoped).length === 1 ? '' : 's'} set their own variables (component-scoped); they were kept, unread.`);
  }
  if (fontFaces.length) {
    content.unknown['css.fontFaces'] = fontFaces.slice(0, 40);
    notes.add(`@font-face rules name ${[...new Set(fontFaces.map((x) => x.family))].slice(0, 6).join(', ')}; the font files were not fetched.`);
  }
  notes.add('Semantics read from variable names (which colour is the brand, which the text) are inferences for you to review.');
  return finish(refreshRoles(content), 'css', issues, notes, now);
}
