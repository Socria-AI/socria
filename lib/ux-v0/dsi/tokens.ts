// lib/ux-v0/dsi/tokens.ts — the token engine: references, modes, override layers, validation, dependents and change.
//
//   color.action.primary = {color.brand.primary}
//
// A token's value is a literal or a reference. Resolving a token follows its references through the system — in the
// mode asked for, falling back to the default mode where a token has no value of its own for it — and through the
// override layers above the system, in precedence: an object's override beats its material's, which beats its
// project's, which beats the system. Only these linked references carry a change anywhere: nothing is ever matched by
// its hex value. Every failure is said with what to do about it: a reference to a token that does not exist, a cycle
// (named, token by token), a reference to a token of another type, a value that is not of its type, an expression that
// does not compute. Resolution is deterministic code: no model is asked.

import { hexOf, isColour } from './colour';
import { matchesGlob, normalizePath, OVERRIDE_LEVELS, PRODUCT_ROLES, COLOUR_ROLES, FONT_ROLES, type OverrideLevel, type ProductRole, type SystemContent, type Token, type TokenType, type TokenValue } from './schema';

export const ALIAS = /^\{([^{}]+)\}$/;
const EMBEDDED = /\{([^{}\s]+)\}/g;
/** Whether a value is a whole reference (a boolean, not a type guard: a value that is not one may still be text). */
export const isAlias = (v: unknown): boolean => typeof v === 'string' && ALIAS.test(v.trim());
export const aliasTarget = (v: string) => v.trim().slice(1, -1).trim();
export const aliasOf = (path: string) => `{${path}}`;

/** Every token a value refers to: a whole reference, references inside a string or expression, and inside composites. */
export function refsIn(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') {
    for (const m of v.matchAll(EMBEDDED)) if (!out.includes(m[1])) out.push(m[1]);
  } else if (Array.isArray(v)) v.forEach((x) => refsIn(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => refsIn(x, out));
  return out;
}

export interface Layer {
  level: OverrideLevel;
  overrides: Record<string, TokenValue>;
}

export interface ResolveError {
  kind: 'missing' | 'cycle' | 'type' | 'depth' | 'invalid' | 'expression';
  message: string;
  /** the token whose value failed */
  at: string;
  ref?: string;
  cycle?: string[];
}

export interface Resolved {
  path: string;
  ok: boolean;
  /** the literal it comes to, references substituted */
  value?: TokenValue;
  type?: TokenType;
  /** the tokens followed, from this one to the literal */
  chain: string[];
  /** where the winning value came from */
  from: 'system' | OverrideLevel;
  mode: string;
  /** the mode had no value of its own, so the default mode's was used */
  fellBack?: boolean;
  error?: ResolveError;
}

const LEVEL_ORDER: OverrideLevel[] = ['object', 'material', 'project'];
const defaultMode = (c: SystemContent) => c.modes[0] ?? 'light';

/** The raw value that wins for a path: the highest override layer that has it, else the token in the mode. */
export function rawValue(c: SystemContent, path: string, mode: string, layers: readonly Layer[] = []): { raw: TokenValue; from: Resolved['from']; fellBack: boolean } | null {
  for (const level of LEVEL_ORDER) {
    const l = layers.find((x) => x.level === level);
    if (l && Object.prototype.hasOwnProperty.call(l.overrides, path)) return { raw: l.overrides[path], from: level, fellBack: false };
  }
  const t = c.tokens[path];
  if (!t) return null;
  if (mode !== defaultMode(c) && t.modes && Object.prototype.hasOwnProperty.call(t.modes, mode)) return { raw: t.modes[mode], from: 'system', fellBack: false };
  return { raw: t.value, from: 'system', fellBack: mode !== defaultMode(c) && !!t.modes && Object.keys(t.modes).length > 0 && !Object.prototype.hasOwnProperty.call(t.modes, mode) };
}

// ── literals ──

const DIM = /^-?(\d+\.?\d*|\.\d+)(px|rem|em|%|vh|vw|vmin|vmax|pt|ch|ex|cm|mm|in|pc|svh|lvh|dvh|fr)$/i;
const DUR = /^(\d+\.?\d*|\.\d+)(ms|s)$/i;
const WEIGHT_WORDS: Record<string, number> = { thin: 100, hairline: 100, 'extra-light': 200, 'ultra-light': 200, extralight: 200, light: 300, normal: 400, regular: 400, book: 400, medium: 500, 'semi-bold': 600, semibold: 600, 'demi-bold': 600, demibold: 600, bold: 700, 'extra-bold': 800, extrabold: 800, 'ultra-bold': 800, black: 900, heavy: 900, 'extra-black': 950, 'ultra-black': 950 };
const STROKES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset'];
const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end'];

export const weightOf = (v: unknown): number | null => {
  if (typeof v === 'number') return v >= 1 && v <= 1000 ? v : null;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (/^\d+$/.test(s)) return weightOf(Number(s));
    return WEIGHT_WORDS[s] ?? null;
  }
  return null;
};

/** A dimension as CSS text ("16px"), from a string or the DTCG 2025 object ({ value, unit }). */
export function dimensionText(v: unknown): string | null {
  if (typeof v === 'number') return v === 0 ? '0px' : null;
  if (typeof v === 'string') {
    const s = v.trim();
    return DIM.test(s) ? s : s === '0' ? '0px' : null;
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const r = v as Record<string, unknown>;
    if (typeof r.value === 'number' && Number.isFinite(r.value) && typeof r.unit === 'string' && /^(px|rem|em|%)$/.test(r.unit)) return `${r.value}${r.unit}`;
  }
  return null;
}

/** A dimension in px (rem and em at 16px), or null. */
export function px(v: unknown): number | null {
  const d = dimensionText(v);
  if (!d) return null;
  const m = d.match(/^(-?[\d.]+)(px|rem|em)$/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * (m[2].toLowerCase() === 'px' ? 1 : 16) * 100) / 100;
}

export function durationText(v: unknown): string | null {
  if (typeof v === 'string') return DUR.test(v.trim()) ? v.trim() : null;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const r = v as Record<string, unknown>;
    if (typeof r.value === 'number' && (r.unit === 'ms' || r.unit === 's')) return `${r.value}${r.unit}`;
  }
  return null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** What is wrong with a literal of a type, or null when it is one. */
export function literalError(type: TokenType, v: TokenValue): string | null {
  switch (type) {
    case 'color':
      return isColour(v) ? null : 'is not a colour';
    case 'dimension':
      return dimensionText(v) ? null : 'is not a dimension (a number with px, rem, em or %)';
    case 'fontFamily':
      return (typeof v === 'string' && v.trim()) || (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string')) ? null : 'is not a font family';
    case 'fontWeight':
      return weightOf(v) !== null ? null : 'is not a font weight (1–1000 or a weight name)';
    case 'fontStyle':
      return typeof v === 'string' && /^(normal|italic|oblique)/i.test(v.trim()) ? null : 'is not a font style';
    case 'number':
      return (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) ? null : 'is not a number';
    case 'duration':
      return durationText(v) ? null : 'is not a duration (ms or s)';
    case 'cubicBezier':
      if (Array.isArray(v)) return v.length === 4 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) && (v[0] as number) >= 0 && (v[0] as number) <= 1 && (v[2] as number) >= 0 && (v[2] as number) <= 1 ? null : 'is not a cubic Bézier (four numbers, x between 0 and 1)';
      return typeof v === 'string' && (EASINGS.includes(v.trim()) || /^cubic-bezier\(\s*[\d.]+\s*,\s*-?[\d.]+\s*,\s*[\d.]+\s*,\s*-?[\d.]+\s*\)$/.test(v.trim())) ? null : 'is not an easing';
    case 'strokeStyle':
      return (typeof v === 'string' && STROKES.includes(v.trim())) || isObj(v) ? null : 'is not a stroke style';
    case 'shadow':
      return isObj(v) || Array.isArray(v) || (typeof v === 'string' && /\d/.test(v)) ? null : 'is not a shadow';
    case 'gradient':
      return Array.isArray(v) || (typeof v === 'string' && /gradient\(/.test(v)) || isObj(v) ? null : 'is not a gradient';
    case 'typography':
      return isObj(v) && ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].some((k) => k in v) ? null : 'is not a typography style';
    case 'border':
      return isObj(v) || (typeof v === 'string' && v.trim() !== '') ? null : 'is not a border';
    case 'transition':
      return isObj(v) || (typeof v === 'string' && v.trim() !== '') ? null : 'is not a transition';
    case 'boolean':
      return typeof v === 'boolean' ? null : 'is not true or false';
    case 'string':
      return typeof v === 'string' ? null : 'is not text';
  }
}

/** The type a composite's field expects, for checking references inside it. */
const FIELD_TYPE: Record<string, Record<string, TokenType[]>> = {
  typography: { fontFamily: ['fontFamily'], fontSize: ['dimension'], fontWeight: ['fontWeight', 'number'], lineHeight: ['number', 'dimension'], letterSpacing: ['dimension'], fontStyle: ['fontStyle', 'string'] },
  shadow: { color: ['color'], offsetX: ['dimension'], offsetY: ['dimension'], blur: ['dimension'], spread: ['dimension'] },
  border: { color: ['color'], width: ['dimension'], style: ['strokeStyle', 'string'] },
  transition: { duration: ['duration'], delay: ['duration'], timingFunction: ['cubicBezier'] },
  gradient: { color: ['color'], position: ['number'] },
};

const compatible = (want: TokenType, got: TokenType) => want === got || (want === 'fontWeight' && got === 'number') || (want === 'number' && got === 'fontWeight');

// ── expressions ──

/** A small arithmetic evaluator for token maths ("{space.base} * 2", "(16px + 8px) / 2"): no eval, units checked. */
export function evaluate(expr: string): string | number | null {
  const toks = expr.match(/\d*\.?\d+(?:px|rem|em|%|ms|s)?|[-+*/()]|\S/g);
  if (!toks || toks.length > 60) return null;
  let i = 0;
  type V = { n: number; u: string };
  const primary = (): V | null => {
    const t = toks[i++];
    if (t === '(') {
      const v = sum();
      if (toks[i++] !== ')') return null;
      return v;
    }
    if (t === '-') {
      const v = primary();
      return v ? { n: -v.n, u: v.u } : null;
    }
    const m = t?.match(/^(\d*\.?\d+)(px|rem|em|%|ms|s)?$/);
    return m ? { n: parseFloat(m[1]), u: m[2] ?? '' } : null;
  };
  const product = (): V | null => {
    let a = primary();
    while (a && (toks[i] === '*' || toks[i] === '/')) {
      const op = toks[i++];
      const b = primary();
      if (!b) return null;
      if (op === '*') {
        if (a.u && b.u) return null;
        a = { n: a.n * b.n, u: a.u || b.u };
      } else {
        if (b.n === 0) return null;
        if (b.u && b.u !== a.u) return null;
        a = { n: a.n / b.n, u: b.u ? '' : a.u };
      }
    }
    return a;
  };
  const sum = (): V | null => {
    let a = product();
    while (a && (toks[i] === '+' || toks[i] === '-')) {
      const op = toks[i++];
      const b = product();
      if (!b || (a.u && b.u && a.u !== b.u)) return null;
      a = { n: op === '+' ? a.n + b.n : a.n - b.n, u: a.u || b.u };
    }
    return a;
  };
  const v = sum();
  if (!v || i !== toks.length || !Number.isFinite(v.n)) return null;
  const n = Math.round(v.n * 10000) / 10000;
  return v.u ? `${n}${v.u}` : n;
}

const looksArithmetic = (s: string) => /^[\s\d.()+\-*/a-z%]+$/i.test(s) && /[+\-*/]/.test(s.replace(/^-/, '')) && !/[a-z]{3,}/i.test(s.replace(/px|rem|em|ms/gi, ''));

const literalText = (v: TokenValue): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : dimensionText(v) ?? durationText(v) ?? JSON.stringify(v));

// ── resolution ──

export interface ResolveOpts {
  mode?: string;
  layers?: readonly Layer[];
  /** memo for many resolutions in one context (same mode and layers) */
  cache?: Map<string, Resolved>;
}

export function resolveToken(c: SystemContent, path: string, opts: ResolveOpts = {}): Resolved {
  const mode = opts.mode && c.modes.includes(opts.mode) ? opts.mode : defaultMode(c);
  const layers = opts.layers ?? [];
  const cache = opts.cache;
  const key = `${mode}|${path}`;
  if (cache?.has(key)) return cache.get(key)!;

  const fail = (stack: string[], e: ResolveError, from: Resolved['from'] = 'system'): Resolved => ({ path, ok: false, chain: stack, from, mode, error: e });

  const run = (p: string, stack: string[]): Resolved => {
    const at = stack.length ? stack[stack.length - 1] : p;
    const idx = stack.indexOf(p);
    if (idx >= 0) {
      const cycle = [...stack.slice(idx), p];
      return fail(stack, { kind: 'cycle', at: p, cycle, message: `A cycle of references: ${cycle.join(' → ')}. Point one of them at a value instead.` });
    }
    if (stack.length > 32) return fail(stack, { kind: 'depth', at, message: `${at} goes through more than 32 references.` });
    const hit = rawValue(c, p, mode, layers);
    if (!hit) return fail(stack, stack.length ? { kind: 'missing', at, ref: p, message: `${at} refers to {${p}}, which does not exist. Add a token at ${p}, or point ${at} at one that does.` } : { kind: 'missing', at: p, ref: p, message: `${p} does not exist.` });
    const token = c.tokens[p];
    const type: TokenType = token?.type ?? (stack.length ? (c.tokens[stack[stack.length - 1]]?.type ?? 'string') : 'string');
    const chain = [...stack, p];
    let fellBack = hit.fellBack;
    let via: string[] | null = null;
    const sub = (v: unknown, field?: { composite: TokenType; key: string }): { v?: TokenValue; e?: ResolveError } => {
      if (isAlias(v)) {
        const target = aliasTarget(v as string);
        const r = run(target, chain);
        if (!r.ok) return { e: r.error };
        if (r.fellBack) fellBack = true;
        if (v === hit.raw) via = r.chain;
        const tt = c.tokens[target]?.type ?? r.type;
        if (field) {
          const want = FIELD_TYPE[field.composite]?.[field.key];
          if (want && tt && !want.some((w) => compatible(w, tt))) return { e: { kind: 'type', at: p, ref: target, message: `${p}'s ${field.key} refers to {${target}}, a ${tt}; it needs a ${want.join(' or ')}.` } };
        } else if (tt && !compatible(type, tt) && !(type === 'string')) return { e: { kind: 'type', at: p, ref: target, message: `${p} is a ${type} but refers to {${target}}, a ${tt}. Point it at a ${type}, or change its type.` } };
        return { v: r.value };
      }
      if (typeof v === 'string' && EMBEDDED.test(v)) {
        EMBEDDED.lastIndex = 0;
        let err: ResolveError | undefined;
        const replaced = v.replace(EMBEDDED, (_m, ref: string) => {
          const r = run(ref, chain);
          if (!r.ok) {
            err = err ?? r.error;
            return '0';
          }
          if (r.fellBack) fellBack = true;
          return literalText(r.value!);
        });
        if (err) return { e: err };
        if (looksArithmetic(replaced)) {
          const n = evaluate(replaced);
          if (n === null) return { e: { kind: 'expression', at: p, message: `${p}'s expression "${v}" does not compute (${replaced}): check the units.` } };
          return { v: n };
        }
        return { v: replaced };
      }
      if (Array.isArray(v)) {
        const out: unknown[] = [];
        for (const x of v) {
          const r = sub(x, field ?? (type === 'gradient' || type === 'shadow' ? { composite: type, key: '' } : undefined));
          if (r.e) return r;
          out.push(r.v);
        }
        return { v: out };
      }
      if (isObj(v)) {
        const out: Record<string, unknown> = {};
        const comp = field?.composite ?? type;
        for (const [k, x] of Object.entries(v)) {
          const r = sub(x, FIELD_TYPE[comp] ? { composite: comp, key: k } : undefined);
          if (r.e) return r;
          out[k] = r.v;
        }
        return { v: out };
      }
      return { v: v as TokenValue };
    };
    const r = sub(hit.raw);
    if (r.e) return { path, ok: false, chain, from: hit.from, mode, error: r.e };
    // a token's own literal is checked against its type (a reference's target was checked as itself)
    if (token && !isAlias(hit.raw)) {
      const bad = literalError(token.type, r.v!);
      if (bad) return { path, ok: false, chain, from: hit.from, mode, error: { kind: 'invalid', at: p, message: `${p} ${bad}: ${JSON.stringify(hit.raw).slice(0, 80)}.` } };
    }
    return { path, ok: true, value: r.v, type, chain: via ?? chain, from: hit.from, mode, ...(fellBack ? { fellBack: true } : {}) };
  };

  const out = run(path, []);
  const final: Resolved = { ...out, path, from: rawValue(c, path, mode, layers)?.from ?? out.from };
  cache?.set(key, final);
  return final;
}

/** Every token resolved in a mode (and layers): one memo for the lot. */
export function resolveAll(c: SystemContent, opts: Omit<ResolveOpts, 'cache'> = {}): Map<string, Resolved> {
  const cache = new Map<string, Resolved>();
  const out = new Map<string, Resolved>();
  for (const p of Object.keys(c.tokens)) out.set(p, resolveToken(c, p, { ...opts, cache }));
  return out;
}

/** A role's colour as hex in a mode, through its token; null when the role is unbound or does not resolve to a colour. */
export function roleHex(c: SystemContent, role: ProductRole, opts: ResolveOpts = {}): string | null {
  const b = c.roles[role];
  if (!b) return null;
  const r = resolveToken(c, b.path, opts);
  return r.ok ? hexOf(r.value) : null;
}

/** A role's font family (the first family named), through its token. */
export function roleFamily(c: SystemContent, role: ProductRole, opts: ResolveOpts = {}): string | null {
  const b = c.roles[role];
  if (!b) return null;
  const r = resolveToken(c, b.path, opts);
  if (!r.ok) return null;
  const v = r.value;
  const first = Array.isArray(v) ? v[0] : typeof v === 'string' ? v.split(',')[0] : isObj(v) ? (Array.isArray(v.fontFamily) ? v.fontFamily[0] : String(v.fontFamily ?? '').split(',')[0]) : '';
  const fam = String(first ?? '').replace(/["']/g, '').trim();
  return fam || null;
}

// ── validation ──

export interface Issue {
  severity: 'error' | 'warning' | 'info';
  code: 'missing-ref' | 'cycle' | 'type-mismatch' | 'invalid-value' | 'expression' | 'depth' | 'unknown-mode' | 'role-missing' | 'role-type' | 'lock-unmatched' | 'css-collision' | 'deprecated-use' | 'empty';
  path?: string;
  message: string;
  fix?: string;
}

const ROLE_TYPE: Record<ProductRole, TokenType[]> = Object.fromEntries([...COLOUR_ROLES.map((r) => [r, ['color']]), ...FONT_ROLES.map((r) => [r, ['fontFamily', 'typography']])]) as Record<ProductRole, TokenType[]>;

/** Everything wrong with a system, each with what to do: errors block publishing, warnings are said. */
export function validate(c: SystemContent): Issue[] {
  const out: Issue[] = [];
  if (!Object.keys(c.tokens).length) out.push({ severity: 'warning', code: 'empty', message: 'The system has no tokens yet.', fix: 'Import a source or add tokens.' });
  const cycles = new Set<string>();
  for (const mode of c.modes) {
    const cache = new Map<string, Resolved>();
    for (const [p, t] of Object.entries(c.tokens)) {
      if (mode !== c.modes[0] && !(t.modes && mode in t.modes)) continue;
      const r = resolveToken(c, p, { mode, cache });
      if (r.ok || !r.error) continue;
      const e = r.error;
      if (e.kind === 'cycle') {
        const k = [...new Set(e.cycle ?? [])].sort().join('|');
        if (cycles.has(k)) continue;
        cycles.add(k);
        out.push({ severity: 'error', code: 'cycle', path: p, message: e.message, fix: 'Point one token in the cycle at a literal value.' });
        continue;
      }
      if (e.at !== p && e.kind !== 'missing') continue; // reported where it happens
      const code = e.kind === 'missing' ? 'missing-ref' : e.kind === 'type' ? 'type-mismatch' : e.kind === 'invalid' ? 'invalid-value' : e.kind === 'expression' ? 'expression' : 'depth';
      if (out.some((x) => x.code === code && x.path === e.at && x.message === e.message)) continue;
      out.push({ severity: 'error', code, path: e.at, message: mode === c.modes[0] ? e.message : `${e.message} (in ${mode})`, ...(e.kind === 'missing' ? { fix: `Add ${e.ref} or change the reference.` } : {}) });
    }
  }
  for (const t of Object.values(c.tokens)) for (const m of Object.keys(t.modes ?? {})) if (!c.modes.includes(m)) out.push({ severity: 'warning', code: 'unknown-mode', path: t.path, message: `${t.path} has a value for “${m}”, a mode the system does not declare.`, fix: `Add the mode ${m}, or remove that value.` });
  for (const role of PRODUCT_ROLES) {
    const b = c.roles[role];
    if (!b) continue;
    const t = c.tokens[b.path];
    if (!t) out.push({ severity: 'error', code: 'role-missing', path: b.path, message: `The ${role} role points at ${b.path}, which does not exist.`, fix: 'Choose another token for it.' });
    else if (!ROLE_TYPE[role].includes(t.type)) out.push({ severity: 'error', code: 'role-type', path: b.path, message: `The ${role} role needs a ${ROLE_TYPE[role].join(' or ')}; ${b.path} is a ${t.type}.`, fix: 'Choose a token of the right type.' });
    else if (t.deprecated) out.push({ severity: 'warning', code: 'deprecated-use', path: b.path, message: `The ${role} role uses ${b.path}, which is deprecated.` });
  }
  for (const g of c.governance.locked) if (!Object.keys(c.tokens).some((p) => matchesGlob(p, g))) out.push({ severity: 'warning', code: 'lock-unmatched', path: g, message: `The lock “${g}” matches no token.` });
  const names = new Map<string, string>();
  for (const p of Object.keys(c.tokens)) {
    const n = cssVarName(p);
    const prev = names.get(n);
    if (prev) out.push({ severity: 'warning', code: 'css-collision', path: p, message: `${p} and ${prev} would both be the CSS variable ${n}.`, fix: 'Rename one of them.' });
    else names.set(n, p);
  }
  return out;
}

export const blocking = (issues: readonly Issue[]) => issues.filter((i) => i.severity === 'error');

// ── dependents ──

/** Every token that refers to one of these, directly or through others (in any mode). */
export function dependents(c: SystemContent, paths: readonly string[]): Set<string> {
  const refs = new Map<string, string[]>();
  for (const t of Object.values(c.tokens)) refs.set(t.path, refsIn([t.value, ...Object.values(t.modes ?? {})]));
  const out = new Set<string>();
  const queue = [...paths];
  while (queue.length) {
    const p = queue.shift()!;
    for (const [q, rs] of refs) if (!out.has(q) && rs.includes(p)) out.add(q), queue.push(q);
  }
  return out;
}

/** The product roles a set of changed tokens reaches (through references). */
export function rolesReached(c: SystemContent, changed: readonly string[]): ProductRole[] {
  const all = new Set([...changed, ...dependents(c, changed)]);
  return PRODUCT_ROLES.filter((r) => c.roles[r] && all.has(c.roles[r]!.path));
}

// ── overrides ──

/** Whether a level may override a path: never a locked one; elsewhere only where governance allows it. */
export function canOverride(c: SystemContent, level: OverrideLevel, path: string): { ok: boolean; why?: string } {
  if (!c.tokens[path]) return { ok: false, why: `${path} is not a token of ${c.identity.name}.` };
  if (c.governance.locked.some((g) => matchesGlob(path, g))) return { ok: false, why: `${path} is locked in ${c.identity.name}: no ${level} may change it.` };
  if (!c.governance.overridable[level].some((g) => matchesGlob(path, g))) return { ok: false, why: `${c.identity.name} does not allow a ${level} to override ${path}.` };
  return { ok: true };
}

/** An override set kept to what the system allows at that level; what was refused is said. */
export function allowedOverrides(c: SystemContent, level: OverrideLevel, overrides: Record<string, TokenValue>): { overrides: Record<string, TokenValue>; refused: string[] } {
  const out: Record<string, TokenValue> = {};
  const refused: string[] = [];
  for (const [p, v] of Object.entries(overrides)) {
    const ok = canOverride(c, level, p);
    if (ok.ok) out[p] = v;
    else refused.push(ok.why!);
  }
  return { overrides: out, refused };
}

export const LEVELS = OVERRIDE_LEVELS;

// ── names ──

/** The CSS custom property a token is written as: --color-brand-primary. */
export function cssVarName(path: string): string {
  return `--${path.replace(/\./g, '-').replace(/[^\w-]/g, '-').replace(/-+/g, '-')}`;
}

/** A token path read from a CSS custom property's name: --color-brand-primary → color.brand.primary. */
export function pathFromCssName(name: string): string | null {
  const s = name.replace(/^--/, '').replace(/[^\w-]/g, '').replace(/^-+|-+$/g, '');
  return normalizePath(s.split(/-+/).filter(Boolean).join('.'));
}

// ── change ──

export interface Change {
  kind: 'token' | 'role' | 'asset' | 'rule' | 'governance' | 'identity' | 'component' | 'mode';
  op: 'added' | 'removed' | 'changed';
  key: string;
  before?: unknown;
  after?: unknown;
  summary: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What changed from one system content to another, said item by item. */
export function diffContent(a: SystemContent, b: SystemContent): Change[] {
  const out: Change[] = [];
  const short = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 60);
  for (const [p, t] of Object.entries(b.tokens)) {
    const was = a.tokens[p];
    if (!was) out.push({ kind: 'token', op: 'added', key: p, after: t.value, summary: `Added ${p} = ${short(t.value)}` });
    else if (!same(was.value, t.value) || !same(was.modes ?? {}, t.modes ?? {}) || was.type !== t.type) {
      const parts: string[] = [];
      if (!same(was.value, t.value)) parts.push(`${short(was.value)} → ${short(t.value)}`);
      for (const m of new Set([...Object.keys(was.modes ?? {}), ...Object.keys(t.modes ?? {})])) if (!same(was.modes?.[m], t.modes?.[m])) parts.push(`${m}: ${short(was.modes?.[m] ?? '—')} → ${short(t.modes?.[m] ?? '—')}`);
      if (was.type !== t.type) parts.push(`type ${was.type} → ${t.type}`);
      out.push({ kind: 'token', op: 'changed', key: p, before: { value: was.value, modes: was.modes }, after: { value: t.value, modes: t.modes }, summary: `${p}: ${parts.join('; ')}` });
    } else if ((was.description ?? '') !== (t.description ?? '')) out.push({ kind: 'token', op: 'changed', key: p, before: was.description, after: t.description, summary: `${p}: description changed` });
  }
  for (const p of Object.keys(a.tokens)) if (!b.tokens[p]) out.push({ kind: 'token', op: 'removed', key: p, before: a.tokens[p].value, summary: `Removed ${p}` });
  for (const r of PRODUCT_ROLES) {
    const x = a.roles[r]?.path;
    const y = b.roles[r]?.path;
    if (x !== y) out.push({ kind: 'role', op: !x ? 'added' : !y ? 'removed' : 'changed', key: r, before: x, after: y, summary: `${r}: ${x ?? '—'} → ${y ?? '—'}` });
  }
  const assetsA = new Map(a.assets.map((x) => [x.id, x]));
  for (const x of b.assets) {
    const w = assetsA.get(x.id);
    if (!w) out.push({ kind: 'asset', op: 'added', key: x.id, summary: `Added ${x.kind} “${x.name}”` });
    else if (w.hash !== x.hash || w.approved !== x.approved || w.role !== x.role) out.push({ kind: 'asset', op: 'changed', key: x.id, summary: `${x.kind} “${x.name}” ${w.hash !== x.hash ? 'replaced (new file)' : w.approved !== x.approved ? (x.approved ? 'approved' : 'no longer approved') : `role ${w.role ?? '—'} → ${x.role ?? '—'}`}` });
  }
  for (const w of a.assets) if (!b.assets.some((x) => x.id === w.id)) out.push({ kind: 'asset', op: 'removed', key: w.id, summary: `Removed ${w.kind} “${w.name}”` });
  const intA = new Map(a.intelligence.map((x) => [x.id, x]));
  for (const x of b.intelligence) {
    const w = intA.get(x.id);
    if (!w) out.push({ kind: 'rule', op: 'added', key: x.id, summary: `Added (${x.status}, ${x.enforce}): ${x.statement.slice(0, 80)}` });
    else if (w.status !== x.status || w.enforce !== x.enforce || w.statement !== x.statement) out.push({ kind: 'rule', op: 'changed', key: x.id, summary: `${x.statement.slice(0, 60)}: ${w.status}/${w.enforce} → ${x.status}/${x.enforce}` });
  }
  for (const w of a.intelligence) if (!b.intelligence.some((x) => x.id === w.id)) out.push({ kind: 'rule', op: 'removed', key: w.id, summary: `Removed: ${w.statement.slice(0, 80)}` });
  if (!same(a.governance, b.governance)) out.push({ kind: 'governance', op: 'changed', key: 'governance', before: a.governance, after: b.governance, summary: 'Governance changed (locks, overrides, restricted assets or review)' });
  if (!same(a.identity, b.identity)) out.push({ kind: 'identity', op: 'changed', key: 'identity', before: a.identity, after: b.identity, summary: `Identity changed${a.identity.name !== b.identity.name ? `: ${a.identity.name} → ${b.identity.name}` : ''}` });
  if (!same(a.modes, b.modes)) out.push({ kind: 'mode', op: 'changed', key: 'modes', before: a.modes, after: b.modes, summary: `Modes: ${a.modes.join(', ')} → ${b.modes.join(', ')}` });
  const compA = new Map(a.components.map((x) => [x.id, x]));
  for (const x of b.components) if (!compA.has(x.id)) out.push({ kind: 'component', op: 'added', key: x.id, summary: `Added component ${x.name}` });
  for (const w of a.components) if (!b.components.some((x) => x.id === w.id)) out.push({ kind: 'component', op: 'removed', key: w.id, summary: `Removed component ${w.name}` });
  return out;
}

/** The token paths a change list touches. */
export const changedPaths = (changes: readonly Change[]) => changes.filter((x) => x.kind === 'token').map((x) => x.key);

// ── edits ──

export interface EditResult {
  content: SystemContent;
  error?: string;
  /** tokens that refer to what changed (they follow it) */
  follows?: string[];
}

const now = () => Date.now();

/** A token's value (and modes, type, description) set by the owner: provenance says it was edited, the original kept. */
export function setToken(c: SystemContent, path: string, patch: { value?: TokenValue; modes?: Record<string, TokenValue | null>; type?: TokenType; description?: string }): EditResult {
  const t = c.tokens[path];
  if (!t) return { content: c, error: `${path} does not exist.` };
  const next: Token = { ...t, provenance: { ...t.provenance, status: 'edited' } };
  if (patch.type) next.type = patch.type;
  if (patch.value !== undefined) next.value = patch.value;
  if (patch.modes) {
    const modes = { ...(t.modes ?? {}) };
    for (const [m, v] of Object.entries(patch.modes)) {
      if (v === null) delete modes[m];
      else modes[m] = v;
    }
    if (Object.keys(modes).length) next.modes = modes;
    else delete next.modes;
  }
  if (patch.description !== undefined) next.description = patch.description.slice(0, 600) || undefined;
  if (!isAlias(next.value)) {
    const bad = literalError(next.type, next.value);
    if (bad && !refsIn(next.value).length) return { content: c, error: `${path} ${bad}.` };
  } else if (aliasTarget(next.value as string) === path) return { content: c, error: `${path} cannot refer to itself.` };
  const content = { ...c, tokens: { ...c.tokens, [path]: next } };
  const cyc = resolveToken(content, path);
  if (!cyc.ok && cyc.error?.kind === 'cycle') return { content: c, error: cyc.error.message };
  return { content, follows: [...dependents(content, [path])] };
}

/** A new token added by the owner. */
export function addToken(c: SystemContent, path: string, type: TokenType, value: TokenValue, description?: string): EditResult {
  const p = normalizePath(path);
  if (!p) return { content: c, error: 'A token path is dot-separated names without braces, like color.brand.primary.' };
  if (c.tokens[p]) return { content: c, error: `${p} already exists.` };
  if (!isAlias(value) && !refsIn(value).length) {
    const bad = literalError(type, value);
    if (bad) return { content: c, error: `That value ${bad}.` };
  }
  const t: Token = { path: p, type, value, ...(description ? { description } : {}), provenance: { source: { kind: 'manual', ref: 'owner' }, importedAt: now(), original: value, status: 'confirmed', confidence: 1 } };
  return { content: { ...c, tokens: { ...c.tokens, [p]: t } } };
}

/** A token removed, unless something still refers to it (then the references are named). */
export function removeToken(c: SystemContent, path: string): EditResult {
  if (!c.tokens[path]) return { content: c, error: `${path} does not exist.` };
  const deps = [...dependents(c, [path])];
  const roles = PRODUCT_ROLES.filter((r) => c.roles[r]?.path === path);
  if (deps.length || roles.length) return { content: c, error: `${path} is still used${deps.length ? ` by ${deps.slice(0, 5).join(', ')}${deps.length > 5 ? '…' : ''}` : ''}${roles.length ? `${deps.length ? ' and' : ''} as the ${roles.join(', ')} role` : ''}. Change those first.` };
  const tokens = { ...c.tokens };
  delete tokens[path];
  return { content: { ...c, tokens } };
}

/** A token renamed, every reference to it (tokens, roles, locks, components) rewritten so nothing breaks. */
export function renameToken(c: SystemContent, from: string, to: string): EditResult {
  const p = normalizePath(to);
  if (!c.tokens[from]) return { content: c, error: `${from} does not exist.` };
  if (!p) return { content: c, error: 'That is not a token path.' };
  if (c.tokens[p]) return { content: c, error: `${p} already exists.` };
  const swap = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(EMBEDDED, (m, ref: string) => (ref === from ? `{${p}}` : m));
    if (Array.isArray(v)) return v.map(swap);
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
    return v;
  };
  const tokens: Record<string, Token> = {};
  for (const [k, t] of Object.entries(c.tokens)) {
    const nt: Token = { ...t, value: swap(t.value) as TokenValue, ...(t.modes ? { modes: Object.fromEntries(Object.entries(t.modes).map(([m, v]) => [m, swap(v) as TokenValue])) } : {}) };
    if (k === from) tokens[p] = { ...nt, path: p };
    else tokens[k] = nt;
  }
  const roles = Object.fromEntries(Object.entries(c.roles).map(([r, b]) => [r, b && b.path === from ? { ...b, path: p } : b]));
  return {
    content: {
      ...c,
      tokens,
      roles,
      governance: { ...c.governance, locked: c.governance.locked.map((g) => (g === from ? p : g)) },
      components: c.components.map((x) => ({ ...x, tokens: x.tokens.map((t) => (t === from ? p : t)) })),
    },
  };
}
