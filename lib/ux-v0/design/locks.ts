// lib/ux-v0/design/locks.ts — what the person has protected, checked against what an answer would change.
//
// A lock is the person's authority made exact. An element is locked by its data-sx id; an artboard can be locked whole
// (an approval locks it). What a lock protects is the element as it looks, not only its markup: its "print" is its
// outerHTML, every style rule that selects it, the inheritable typography and colour its ancestors give it, and the
// values of the custom properties those rules use (from the artboard's own styles and the shared tokens). An answer
// that would change a print is refused where it is carried out (apply.ts), and said; the designer is told beforehand
// what is protected (prompts.ts), so refusals are rare.
//
// Nothing here renders: selectors are matched on a parsed copy of the fragment (pseudo-classes and pseudo-elements
// are matched by the element they belong to), so the check runs the same in the browser and in tests.

import { parseCss, type CssRule } from '../dsi/css-parse';
import type { DesignArtboard, DesignDoc } from './doc';
import type { Parse } from './elements';
import { scopeCss } from './frame';

/**
 * What an ancestor's styles do to an element inside it: the properties it inherits (the typography and colour of a
 * locked headline) and those that change how everything inside is drawn (opacity, filters, transforms, blending,
 * clipping, whether it is shown at all).
 */
const INHERITED = /^(color|font(-[\w-]+)?|letter-spacing|line-height|text-(align|transform|indent|shadow|decoration[\w-]*|rendering|wrap)|word-spacing|white-space|direction|writing-mode|hyphens|quotes|tab-size|-webkit-text-[\w-]+|opacity|filter|backdrop-filter|transform|translate|scale|rotate|zoom|visibility|display|mix-blend-mode|isolation|clip-path|mask(-[\w-]+)?)$/;

const STRIP_PSEUDO = /::?(before|after|first-line|first-letter|marker|placeholder|selection|backdrop)\b|:(hover|focus|focus-visible|focus-within|active|visited|link|target|checked|disabled|enabled)\b/g;

const cssOf = (html: string) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');

function matches(el: Element, selector: string): boolean {
  const base = selector.replace(STRIP_PSEUDO, '').trim() || '*';
  try {
    return el.matches(base);
  } catch {
    return false;
  }
}

const ruleText = (r: CssRule, decls = r.decls) => `${r.context.join(' ')}{${r.selectors.join(',')}}{${decls.map((d) => `${d.prop}:${d.value}${d.important ? '!' : ''}`).join(';')}}`;

/**
 * The protected face of one element: its markup and every style that reaches it, as one string, or null when the
 * element is not on the artboard.
 */
export function lockPrint(html: string, id: string, tokens: string, parse: Parse): string | null {
  const d = parse(`<!doctype html><html><body><div class="sx-root">${html}</div></body></html>`);
  const root = d.body.firstElementChild;
  if (!root) return null;
  const el = root.querySelector(`[data-sx="${id}"]`);
  if (!el) return null;
  const sheet = parseCss(`${scopeCss(tokens)}\n${scopeCss(cssOf(html))}`);
  const chain: Element[] = [];
  for (let a: Element | null = el.parentElement; a; a = a.parentElement) {
    chain.push(a);
    if (a === root) break;
  }
  const own: string[] = [];
  const inherited: string[] = [];
  const vars = new Map<string, string>();
  for (const r of sheet.rules) {
    const sels = r.selectors;
    if (sels.some((s) => matches(el, s))) {
      own.push(ruleText(r));
      for (const dcl of r.decls) if (dcl.prop.startsWith('--')) vars.set(dcl.prop, dcl.value);
      continue;
    }
    if (chain.some((a) => sels.some((s) => matches(a, s)))) {
      // (an ancestor's custom properties count only where the element uses them: resolved below)
      const keep = r.decls.filter((x) => INHERITED.test(x.prop));
      if (keep.length) inherited.push(ruleText(r, keep));
      for (const dcl of r.decls) if (dcl.prop.startsWith('--')) vars.set(dcl.prop, dcl.value);
    }
  }
  // inheritable inline styles on the ancestors count too
  for (const a of chain) {
    const st = a.getAttribute('style');
    if (!st) continue;
    const parts = st.split(';');
    const keep = parts.filter((x) => INHERITED.test(x.split(':')[0]?.trim() ?? ''));
    if (keep.length) inherited.push(`[inline]{${keep.join(';')}}`);
    for (const x of parts) {
      const i = x.indexOf(':');
      if (i > 0 && x.trim().startsWith('--')) vars.set(x.slice(0, i).trim(), x.slice(i + 1).trim());
    }
  }
  // the custom properties the element's styles use, resolved (a token changed under a locked headline changes it)
  const used = new Set<string>();
  const want = (v: string) => {
    for (const m of v.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (used.has(m[1])) continue;
      used.add(m[1]);
      want(vars.get(m[1]) ?? '');
    }
  };
  want([...own, ...inherited, el.outerHTML].join(' '));
  const resolved = [...used].sort().map((k) => `${k}=${vars.get(k) ?? ''}`);
  return JSON.stringify({ markup: el.outerHTML, own, inherited, vars: resolved });
}

/** The custom properties a locked element (or a locked artboard) depends on — said to the designer. */
export function lockedVars(html: string, ids: readonly string[], tokens: string, parse: Parse): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const p = lockPrint(html, id, tokens, parse);
    if (!p) continue;
    for (const v of (JSON.parse(p) as { vars: string[] }).vars) out.add(v.split('=')[0]);
  }
  return [...out];
}

export interface LockCheck {
  ok: boolean;
  /** the locks the change would break, in words */
  broken: string[];
}

/** Whether an artboard's new HTML (and the shared tokens) keep its locked elements exactly as they were. */
export function checkLocks(before: Pick<DesignArtboard, 'html' | 'locks'>, afterHtml: string, tokensBefore: string, tokensAfter: string, parse: Parse): LockCheck {
  const broken: string[] = [];
  for (const l of before.locks ?? []) {
    const was = lockPrint(before.html, l.id, tokensBefore, parse);
    if (was === null) continue; // a lock on something already gone protects nothing
    const now = lockPrint(afterHtml, l.id, tokensAfter, parse);
    if (now !== was) broken.push(l.what || l.id);
  }
  return { ok: !broken.length, broken };
}

/**
 * Everything the shared styles give one artboard, as one string: each shared rule that selects something on it, and
 * the values of the custom properties it uses. A locked artboard is unchanged under new shared styles exactly when
 * this is unchanged.
 */
export function sharedPrint(html: string, tokens: string, parse: Parse): string {
  const d = parse(`<!doctype html><html><body><div class="sx-root">${html}</div></body></html>`);
  const root = d.body.firstElementChild;
  if (!root) return '';
  const any = (selector: string) => {
    const base = selector.replace(STRIP_PSEUDO, '').trim() || '*';
    try {
      return root.matches(base) || !!root.querySelector(base);
    } catch {
      return false;
    }
  };
  const shared = parseCss(scopeCss(tokens));
  const hit = shared.rules.filter((r) => r.selectors.some(any));
  const defs = new Map<string, string>();
  for (const r of [...hit, ...parseCss(scopeCss(cssOf(html))).rules]) for (const dcl of r.decls) if (dcl.prop.startsWith('--')) defs.set(dcl.prop, dcl.value);
  const used = new Set<string>();
  const want = (v: string) => {
    for (const m of v.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (used.has(m[1])) continue;
      used.add(m[1]);
      want(defs.get(m[1]) ?? '');
    }
  };
  const rules = hit.map((r) => ruleText(r, r.decls.filter((x) => !x.prop.startsWith('--'))));
  want(`${html} ${rules.join(' ')}`);
  return JSON.stringify({ rules, vars: [...used].sort().map((k) => `${k}=${defs.get(k) ?? ''}`) });
}

/** The custom properties whose values differ between two token sheets (and an artboard's own :root rules). */
export function changedVars(tokensBefore: string, tokensAfter: string): Set<string> {
  const read = (css: string) => {
    const m = new Map<string, string>();
    for (const r of parseCss(scopeCss(css)).rules) for (const d of r.decls) if (d.prop.startsWith('--')) m.set(d.prop, d.value);
    return m;
  };
  const a = read(tokensBefore);
  const b = read(tokensAfter);
  const out = new Set<string>();
  for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) out.add(k);
  return out;
}

/**
 * Whether a whole artboard depends on any of these custom properties, directly or through another property's value
 * (--ink: var(--brand-dark)) — a locked artboard must not change under them.
 */
export function usesVars(html: string, vars: ReadonlySet<string>, tokens = ''): boolean {
  const defs = new Map<string, string>();
  for (const r of parseCss(`${scopeCss(tokens)}\n${scopeCss(cssOf(html))}`).rules) for (const d of r.decls) if (d.prop.startsWith('--')) defs.set(d.prop, d.value);
  const seen = new Set<string>();
  const walk = (text: string): boolean => {
    for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (vars.has(m[1])) return true;
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      if (walk(defs.get(m[1]) ?? '')) return true;
    }
    return false;
  };
  return walk(html);
}

/**
 * The protected artboards (locked whole, or holding locked elements) that new shared styles would change — for a
 * design system's update, which must never reach approved work unasked (lib/ux-v0/dsi/link.ts). Exact with a parser;
 * without one (on the server) it is held to be changed whenever it uses a custom property whose value differs, or
 * the shared styles hold anything but custom properties.
 */
export function protectedUnder(doc: DesignDoc, tokensAfter: string, parse?: Parse): DesignArtboard[] {
  if (doc.tokens === tokensAfter) return [];
  const guarded = doc.artboards.filter((a) => a.locked || a.locks?.length);
  if (!guarded.length) return [];
  if (parse) {
    return guarded.filter((a) => (a.locked ? sharedPrint(a.html, doc.tokens, parse) !== sharedPrint(a.html, tokensAfter, parse) : !checkLocks(a, a.html, doc.tokens, tokensAfter, parse).ok));
  }
  const changed = changedVars(doc.tokens, tokensAfter);
  const plain = (css: string) =>
    parseCss(scopeCss(css))
      .rules.map((r) => ruleText(r, r.decls.filter((d) => !d.prop.startsWith('--'))))
      .filter((t) => !/\{\}$/.test(t))
      .join('|');
  const rulesDiffer = plain(doc.tokens) !== plain(tokensAfter);
  return guarded.filter((a) => rulesDiffer || usesVars(a.html, changed, doc.tokens) || usesVars(a.html, changed, tokensAfter));
}
