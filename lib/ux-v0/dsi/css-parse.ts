// lib/ux-v0/dsi/css-parse.ts — CSS read as data: rules (with their selectors, declarations and the @media / @supports
// / @layer context around them), @property declarations, @font-face descriptors and @import addresses (listed, never
// fetched). A small tokenizer of SocriaUX's own: comments and strings are respected, url(…) and other parentheses may
// hold semicolons, nested rules (CSS nesting) are flattened with their parent. Nothing is evaluated or loaded.

export interface CssDecl {
  prop: string;
  value: string;
  important: boolean;
  line: number;
}

export interface CssRule {
  selectors: string[];
  decls: CssDecl[];
  /** the at-rule preludes around it, outermost first: "@media (prefers-color-scheme: dark)" */
  context: string[];
  line: number;
}

export interface CssSheet {
  rules: CssRule[];
  properties: { name: string; syntax: string; initial: string; inherits: boolean; line: number }[];
  fontFaces: { family: string; src: string[]; weight?: string; style?: string; line: number }[];
  imports: string[];
  /** what was refused or cut short */
  notes: string[];
}

export const MAX_CSS = 1_500_000;
const MAX_RULES = 20_000;

/** Declarations from a block body, split on semicolons outside strings and parentheses. */
export function splitDecls(body: string, firstLine: number): CssDecl[] {
  const out: CssDecl[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  let line = firstLine;
  let declLine = firstLine;
  let started = false;
  const push = (end: number) => {
    const raw = body.slice(start, end).trim();
    start = end + 1;
    if (!raw) return;
    const i = raw.indexOf(':');
    if (i <= 0) return;
    const prop = raw.slice(0, i).trim();
    let value = raw.slice(i + 1).trim();
    let important = false;
    if (/!\s*important\s*$/i.test(value)) {
      important = true;
      value = value.replace(/!\s*important\s*$/i, '').trim();
    }
    if (/^(--[\w-]{1,120}|-?[a-z][a-z-]{0,60})$/i.test(prop) && value.length <= 4000) out.push({ prop: prop.startsWith('--') ? prop : prop.toLowerCase(), value, important, line: declLine });
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\n') line++;
    else if (!started && !/\s/.test(ch)) {
      started = true;
      declLine = line;
    }
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) {
      push(i);
      started = false;
    }
  }
  push(body.length);
  return out;
}

/** The selectors of a rule, nested ones joined to their parent's (& replaced, or as descendants). */
function joinSelectors(parent: string[], own: string): string[] {
  const mine = own
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
  if (!parent.length) return mine;
  const out: string[] = [];
  for (const p of parent.slice(0, 20)) for (const m of mine) out.push(m.includes('&') ? m.replace(/&/g, p) : `${p} ${m}`);
  return out.slice(0, 80);
}

/** A stylesheet as rules and declarations (see the head of this file). */
export function parseCss(input: string): CssSheet {
  const notes: string[] = [];
  let text = input;
  if (text.length > MAX_CSS) {
    notes.push(`The stylesheet is larger than ${MAX_CSS / 1_000_000} MB; only its first part was read.`);
    text = text.slice(0, MAX_CSS);
  }
  const sheet: CssSheet = { rules: [], properties: [], fontFaces: [], imports: [], notes };
  // comments out, line numbers kept
  text = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  type Frame = { kind: 'rule' | 'at' | 'skip' | 'fontface' | 'property'; selectors: string[]; prelude: string; bodyStart: number; line: number; name?: string };
  const stack: Frame[] = [];
  let quote = '';
  let paren = 0;
  let segStart = 0;
  let line = 1;
  let segLine = 1;
  const context = () => stack.filter((f) => f.kind === 'at').map((f) => f.prelude);
  const parentSelectors = () => {
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k].kind === 'rule') return stack[k].selectors;
    return [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') line++;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') paren++;
    else if (ch === ')') paren = Math.max(0, paren - 1);
    if (paren) continue;
    if (ch === ';' && (!stack.length || stack[stack.length - 1].kind === 'at')) {
      const stmt = text.slice(segStart, i).trim();
      const imp = stmt.match(/^@import\s+(?:url\()?\s*["']?([^"')\s]+)["']?\s*\)?/i);
      if (imp) sheet.imports.push(imp[1].slice(0, 400));
      segStart = i + 1;
      segLine = line;
      continue;
    }
    if (ch === '{') {
      const top = stack[stack.length - 1];
      // inside a style rule, the text before a nested block holds the rule's own declarations up to the last semicolon
      let prelude = text.slice(segStart, i).trim();
      if (top && (top.kind === 'rule' || top.kind === 'fontface' || top.kind === 'property')) {
        const lastSemi = prelude.lastIndexOf(';');
        if (lastSemi >= 0) prelude = prelude.slice(lastSemi + 1).trim();
      }
      if (top?.kind === 'skip') stack.push({ kind: 'skip', selectors: [], prelude, bodyStart: i + 1, line: segLine });
      else if (prelude.startsWith('@')) {
        const name = (prelude.match(/^@([\w-]+)/)?.[1] ?? '').toLowerCase();
        if (name === 'font-face') stack.push({ kind: 'fontface', selectors: [], prelude, bodyStart: i + 1, line: segLine });
        else if (name === 'property') stack.push({ kind: 'property', selectors: [], prelude, bodyStart: i + 1, line: segLine, name: prelude.replace(/^@property\s+/i, '').trim() });
        else if (['media', 'supports', 'layer', 'container', 'scope', 'document', 'starting-style'].includes(name)) stack.push({ kind: 'at', selectors: [], prelude: prelude.replace(/\s+/g, ' ').slice(0, 300), bodyStart: i + 1, line: segLine });
        else stack.push({ kind: 'skip', selectors: [], prelude, bodyStart: i + 1, line: segLine }); // keyframes, page, counter-style…
      } else if (prelude) {
        if (sheet.rules.length >= MAX_RULES) {
          if (!notes.some((n) => n.startsWith('More than'))) notes.push(`More than ${MAX_RULES} rules; the rest were not read.`);
          stack.push({ kind: 'skip', selectors: [], prelude, bodyStart: i + 1, line: segLine });
        } else stack.push({ kind: 'rule', selectors: joinSelectors(parentSelectors(), prelude.replace(/\s+/g, ' ')), prelude, bodyStart: i + 1, line });
      } else stack.push({ kind: 'skip', selectors: [], prelude, bodyStart: i + 1, line: segLine });
      segStart = i + 1;
      segLine = line;
      continue;
    }
    if (ch === '}') {
      const f = stack.pop();
      if (f) {
        const body = text.slice(segStart, i);
        if (f.kind === 'rule') {
          // the rule's own declarations: its body with nested rules (their selectors and blocks) blanked, lines kept
          let flat = text.slice(f.bodyStart, i);
          for (let k = 0; k < 8 && flat.includes('{'); k++) flat = flat.replace(/[^;{}]*\{[^{}]*\}/g, (m) => m.replace(/[^\n]/g, ' '));
          const decls = splitDecls(flat, f.line);
          if (decls.length) sheet.rules.push({ selectors: f.selectors, decls, context: context(), line: f.line });
        } else if (f.kind === 'fontface') {
          const d = splitDecls(body, f.line);
          const get = (p: string) => d.find((x) => x.prop === p)?.value;
          const family = (get('font-family') ?? '').replace(/["']/g, '').trim();
          if (family) sheet.fontFaces.push({ family: family.slice(0, 80), src: [...(get('src') ?? '').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1].slice(0, 400)).slice(0, 6), ...(get('font-weight') ? { weight: get('font-weight') } : {}), ...(get('font-style') ? { style: get('font-style') } : {}), line: f.line });
        } else if (f.kind === 'property' && f.name && /^--[\w-]+$/.test(f.name)) {
          const d = splitDecls(body, f.line);
          const get = (p: string) => d.find((x) => x.prop === p)?.value ?? '';
          sheet.properties.push({ name: f.name, syntax: get('syntax').replace(/["']/g, ''), initial: get('initial-value'), inherits: /true/i.test(get('inherits')), line: f.line });
        }
      }
      segStart = i + 1;
      segLine = line;
    }
  }
  return sheet;
}

/** Every var(--name) a value uses. */
export const varsIn = (v: string) => [...v.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
