// lib/numeric/dimensional.ts
//
// DIMENSIONS, AND THE GROUPS THAT HAVE NONE — Buckingham's Π theorem, computed.
//
// A unit as written ("W/m²K", "kg/m³", "m·s⁻²", "N", "Pa·s") is read into its
// exponents of the seven base dimensions — mass, length, time, temperature,
// current, amount, luminosity — and a scale to SI. Given k quantities, their
// dimension matrix D (one column each) has a null space of dimension
// k − rank D, and every vector in it is a product of the quantities with no
// dimension at all: Π₁ … Π_{k−r}. A law between the k quantities can only be
// a law between the Π's.
//
// The null space is found in exact rationals (lib/numeric/linalg.ts rref),
// then each basis vector is scaled to the smallest whole exponents, so the
// pendulum's period, length and gravity give T²g/L, not T·g^½·L^−½.
//
// PURE.

import { rref } from './linalg';

export const BASE = ['M', 'L', 'T', 'Θ', 'I', 'N', 'J'] as const;
export type Dims = [number, number, number, number, number, number, number];

const Z: Dims = [0, 0, 0, 0, 0, 0, 0];
const d = (m = 0, l = 0, t = 0, th = 0, i = 0, n = 0, j = 0): Dims => [m, l, t, th, i, n, j];

/** Each unit symbol: its dimensions and its size in SI. */
const UNITS: Record<string, { dims: Dims; si: number }> = {
  // base
  m: { dims: d(0, 1), si: 1 },
  g: { dims: d(1), si: 1e-3 },
  kg: { dims: d(1), si: 1 },
  t: { dims: d(1), si: 1000 },
  s: { dims: d(0, 0, 1), si: 1 },
  K: { dims: d(0, 0, 0, 1), si: 1 },
  '°C': { dims: d(0, 0, 0, 1), si: 1 },
  degC: { dims: d(0, 0, 0, 1), si: 1 },
  A: { dims: d(0, 0, 0, 0, 1), si: 1 },
  mol: { dims: d(0, 0, 0, 0, 0, 1), si: 1 },
  cd: { dims: d(0, 0, 0, 0, 0, 0, 1), si: 1 },
  // time and length beyond SI
  min: { dims: d(0, 0, 1), si: 60 },
  h: { dims: d(0, 0, 1), si: 3600 },
  hr: { dims: d(0, 0, 1), si: 3600 },
  day: { dims: d(0, 0, 1), si: 86400 },
  days: { dims: d(0, 0, 1), si: 86400 },
  yr: { dims: d(0, 0, 1), si: 3.15576e7 },
  year: { dims: d(0, 0, 1), si: 3.15576e7 },
  in: { dims: d(0, 1), si: 0.0254 },
  ft: { dims: d(0, 1), si: 0.3048 },
  km: { dims: d(0, 1), si: 1000 },
  cm: { dims: d(0, 1), si: 0.01 },
  mm: { dims: d(0, 1), si: 0.001 },
  L: { dims: d(0, 3), si: 1e-3 },
  l: { dims: d(0, 3), si: 1e-3 },
  // derived SI
  N: { dims: d(1, 1, -2), si: 1 },
  J: { dims: d(1, 2, -2), si: 1 },
  W: { dims: d(1, 2, -3), si: 1 },
  Pa: { dims: d(1, -1, -2), si: 1 },
  bar: { dims: d(1, -1, -2), si: 1e5 },
  atm: { dims: d(1, -1, -2), si: 101325 },
  Hz: { dims: d(0, 0, -1), si: 1 },
  C: { dims: d(0, 0, 1, 0, 1), si: 1 },
  V: { dims: d(1, 2, -3, 0, -1), si: 1 },
  'Ω': { dims: d(1, 2, -3, 0, -2), si: 1 },
  ohm: { dims: d(1, 2, -3, 0, -2), si: 1 },
  F: { dims: d(-1, -2, 4, 0, 2), si: 1 },
  H: { dims: d(1, 2, -2, 0, -2), si: 1 },
  T: { dims: d(1, 0, -2, 0, -1), si: 1 },
  Wb: { dims: d(1, 2, -2, 0, -1), si: 1 },
  S: { dims: d(-1, -2, 3, 0, 2), si: 1 },
  // dimensionless
  rad: { dims: Z, si: 1 },
  sr: { dims: Z, si: 1 },
  '%': { dims: Z, si: 0.01 },
};

const PREFIX: Record<string, number> = { k: 1e3, M: 1e6, G: 1e9, m: 1e-3, 'µ': 1e-6, u: 1e-6, n: 1e-9, c: 1e-2 };
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };

/**
 * The prefixed units people actually write. Anything else run together is read
 * as a product first: "W/mK" is W/(m·K), not watts per millikelvin, and "J/kgK"
 * is J/(kg·K).
 */
const PREFIXED = new Set(['km', 'cm', 'mm', 'µm', 'um', 'nm', 'mg', 'kN', 'MN', 'kPa', 'MPa', 'GPa', 'kW', 'MW', 'GW', 'mW', 'kJ', 'MJ', 'ms', 'µs', 'us', 'ns', 'kHz', 'MHz', 'GHz', 'mA', 'kV', 'mV', 'mL', 'kmol', 'mmol', 'kWh']);

/** One symbol, with an SI prefix if it needs one ("kN", "MPa", "µm"). */
function symbol(sym: string, prefixed = true): { dims: Dims; si: number } | null {
  if (UNITS[sym]) return UNITS[sym];
  if (sym === 'kWh') return { dims: d(1, 2, -2), si: 3.6e6 };
  if (prefixed && PREFIXED.has(sym) && PREFIX[sym[0]] !== undefined && UNITS[sym.slice(1)]) {
    const u = UNITS[sym.slice(1)];
    return { dims: u.dims, si: u.si * PREFIX[sym[0]] };
  }
  return null;
}

/**
 * A unit as written, into dimensions and a scale to SI — or null for anything
 * it cannot read, which is never guessed. "W/m²K" is W/(m²·K): everything after
 * a slash is below it, as the unit is meant.
 */
export function parseUnit(raw: string): { dims: Dims; si: number } | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s || /^(1|none|dimensionless|unitless|-|—)$/i.test(s)) return { dims: [...Z] as Dims, si: 1 };
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^' + [...m].map((c) => SUP[c]).join(''));
  s = s.replace(/\*\*/g, '^').replace(/[()]/g, ' ');
  const dims = [...Z] as Dims;
  let si = 1;
  let below = false;
  // tokens: a symbol with an optional exponent, separated by ·, *, spaces or /
  const re = /(\/)|([A-Za-zµΩ°%]+)(?:\^?(-?\d+(?:\.\d+)?))?|([·*\s]+)|(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  let pos = 0;
  while ((m = re.exec(s))) {
    if (m.index !== pos) return null;
    pos = re.lastIndex;
    if (m[1]) {
      if (below) return null;
      below = true;
      continue;
    }
    if (m[4]) continue;
    if (m[5]) {
      // a bare number is only allowed as "1/s"
      if (m[5] !== '1') return null;
      continue;
    }
    let sym = m[2];
    let p = m[3] !== undefined ? Number(m[3]) : 1;
    // "m2", "s2" written without the caret: a trailing digit is an exponent
    const tail = /^([A-Za-zµΩ°%]+?)(\d)$/.exec(sym);
    if (!symbol(sym) && tail && symbol(tail[1])) {
      sym = tail[1];
      p = Number(tail[2]);
    }
    // "°C" arrives as "°" and "C" joined; "degC" likewise
    const u = symbol(sym);
    if (!u) {
      // a run of symbols run together, like "kgK" or "mK": split greedily from the left
      const parts: string[] = [];
      let rest = sym;
      while (rest) {
        let found = '';
        for (let k = rest.length; k > 0; k--) if (symbol(rest.slice(0, k), false) || PREFIXED.has(rest.slice(0, k))) { found = rest.slice(0, k); break; }
        if (!found) return null;
        parts.push(found);
        rest = rest.slice(found.length);
      }
      parts.forEach((part, k) => {
        const v = symbol(part)!;
        const e = (k === parts.length - 1 ? p : 1) * (below ? -1 : 1);
        for (let i = 0; i < 7; i++) dims[i] += v.dims[i] * e;
        si *= v.si ** e;
      });
      continue;
    }
    const e = p * (below ? -1 : 1);
    for (let i = 0; i < 7; i++) dims[i] += u.dims[i] * e;
    si *= u.si ** e;
  }
  if (pos !== s.length) return null;
  return { dims: dims.map((v) => (Math.abs(v) < 1e-12 ? 0 : v)) as Dims, si };
}

/** A dimension vector as it is written: M L² T⁻², or 1. */
export function dimsText(x: Dims): string {
  const sup = (n: number) => (n === 1 ? '' : String(n).replace(/-/g, '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]));
  const parts = BASE.map((b, i) => (x[i] ? `${b}${sup(x[i])}` : '')).filter(Boolean);
  return parts.length ? parts.join(' ') : '1 (dimensionless)';
}

export interface PiGroup {
  /** whole-number exponents, by quantity name; zeros left out */
  exponents: Record<string, number>;
  /** written: T²·g / L */
  text: string;
}

export interface PiAnalysis {
  /** quantities read, with their dimensions */
  read: { name: string; dims: Dims }[];
  /** what could not be read, and why */
  unread: { name: string; unit: string }[];
  /** rank of the dimension matrix: how many dimensions the quantities really span */
  rank: number;
  /** k − r groups with no dimension */
  groups: PiGroup[];
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** Buckingham Π: the dimensionless groups the quantities make, from the null space of their dimension matrix. */
export function buckinghamPi(quantities: readonly { name: string; unit: string }[]): PiAnalysis {
  const read: PiAnalysis['read'] = [];
  const unread: PiAnalysis['unread'] = [];
  for (const q of quantities) {
    const u = parseUnit(q.unit);
    if (u) read.push({ name: q.name, dims: u.dims });
    else unread.push(q);
  }
  const k = read.length;
  if (!k) return { read, unread, rank: 0, groups: [] };
  // the dimension matrix, rows the base dimensions that appear, one column per quantity
  const rows = BASE.map((_, i) => i).filter((i) => read.some((q) => q.dims[i] !== 0));
  if (!rows.length) {
    return { read, unread, rank: 0, groups: read.map((q) => ({ exponents: { [q.name]: 1 }, text: q.name })) };
  }
  const D = rows.map((i) => read.map((q) => q.dims[i]));
  const R = rref(D, { exact: true });
  const free = read.map((_, j) => j).filter((j) => !R.pivots.includes(j));
  const groups: PiGroup[] = free.map((f) => {
    // the special solution for free column f: x_f = 1, the pivots from −R
    const x = new Array(k).fill(0);
    x[f] = 1;
    R.pivots.forEach((p, i) => (x[p] = -R.R[i][f]));
    // to whole numbers: clear the denominators, then the common factor
    let scale = 1;
    for (const v of x) {
      for (let den = 1; den <= 1000; den++) {
        if (Math.abs(v * den - Math.round(v * den)) < 1e-9) {
          scale = (scale * den) / gcd(scale, den);
          break;
        }
      }
    }
    let ints = x.map((v) => Math.round(v * scale));
    const g = ints.reduce((a, b) => gcd(a, b), 0) || 1;
    ints = ints.map((v) => v / g);
    // BUCKINGHAM'S OWN FORM: the one non-repeating quantity to a positive power, made dimensionless by the
    // repeating ones — F/(ρv²d²), μ/(ρvd), T²g/L — which is what the special solution already is
    if (ints[f] < 0) ints = ints.map((v) => -v);
    const exponents: Record<string, number> = {};
    ints.forEach((v, j) => {
      if (v !== 0) exponents[read[j].name] = v;
    });
    const pow = (name: string, e: number) => (Math.abs(e) === 1 ? name : `${name}${String(Math.abs(e)).replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)])}`);
    const top = Object.entries(exponents).filter(([, e]) => e > 0).map(([n, e]) => pow(n, e)).join('·');
    const bot = Object.entries(exponents).filter(([, e]) => e < 0).map(([n, e]) => pow(n, e)).join('·');
    return { exponents, text: bot ? `${top || '1'} / ${bot.includes('·') ? `(${bot})` : bot}` : top };
  });
  return { read, unread, rank: R.rank, groups };
}
