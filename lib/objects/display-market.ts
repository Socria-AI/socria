// A MARKET — supply and demand the person moves, and predicts before seeing.
//
// "What does a $2 tax on sellers do?" is learned by saying what you think
// BEFORE the curves move. So a market holds two straight lines — price as a
// function of quantity, the way lib/logos-econ.ts writes them — what is
// applied to them now (a per-unit tax or subsidy, a shift of either curve, a
// price ceiling or floor), and, for practice, one change POSED and not yet
// applied, the person's prediction of it, and a log of how each prediction
// compared with what the computation showed.
//
// PREDICT, THEN REVEAL. A posed change is computed for nobody until the
// person reveals it: facts, text, step notes and part descriptions never
// state the numbers after it while it waits — guarded or not, the prediction
// is the point. Only the person predicts, and only the person reveals. Every
// scenario is measured from the free market (posing one takes off whatever
// was applied), so the log compares like with like; and the next scenario
// follows the last one taken, in an order that tests transfer: a tax on
// sellers, then the same tax on buyers (the same outcome), a subsidy, demand
// up then down, supply up then down, a binding ceiling, a binding floor.
//
// "PRICE" in a prediction is the price BUYERS PAY, tax included — which is
// what makes a tax on buyers and a tax on sellers the same question. A SHIFT
// is horizontal, in units of quantity: demand shifted by +2 means buyers want
// 2 more at every price (an increase); −2, 2 fewer.
//
// Every number is computed by lib/logos-econ.ts — the equilibrium, the
// incidence, the surplus, the shortage. Nothing here re-derives one, and
// nothing claims the person has mastered anything: a log describes attempts.
//
// PURE.

import { register, type Part, type ViewDecl } from './core';
import {
  cleanBy,
  cleanText,
  displayKind,
  guardBy,
  guardOwn,
  headOps,
  num,
  op,
  readView,
  registerDisplay,
  sameAs,
  todayDay,
  type Args,
  type By,
  type Ctx,
  type DisplayHead,
} from './display-base';
import { binds, equilibrium, marketAt, priceAt, quantityAt, shift, taxedSupply, taxIncidence, welfare, type Equilibrium, type PriceLine, type TaxIncidence } from '@/lib/logos-econ';
import { niceTicks } from '@/lib/model/units';

export type MarketView = 'graph' | 'numbers';
export type Dir = 'up' | 'down' | 'same';
export type Side = 'sellers' | 'buyers';

/** P = intercept + slope·Q, and who set it */
export interface Curve extends PriceLine {
  by: By;
}

export interface Units {
  /** "$", "€", "dollars" */
  price: string;
  /** "units", "tickets", "kg" */
  quantity: string;
}

/** What is applied to the curves now. */
export interface Levers {
  /** per unit, ≥ 0 */
  tax: number;
  /** who the tax is collected from, or the subsidy paid to */
  on: Side;
  /** per unit, ≥ 0 — a tax and a subsidy are never both on */
  subsidy: number;
  /** horizontal, in units of quantity: + is an increase */
  demandShift: number;
  supplyShift: number;
  ceiling: number | null;
  floor: number | null;
}

/** A posed change: only what it sets. */
export interface Change {
  tax?: number;
  subsidy?: number;
  on?: Side;
  demandShift?: number;
  supplyShift?: number;
  ceiling?: number;
  floor?: number;
}

export interface Pending {
  /** its place in SCENARIOS, or −1 for one the person asked for */
  scenario: number;
  /** the change in words — derived from the change itself, never stored freely */
  text: string;
  change: Change;
}

export interface Guess {
  price: Dir | null;
  quantity: Dir | null;
  priceValue: number | null;
  quantityValue: number | null;
  why: string;
}

export interface Prediction extends Guess {
  /** only the person predicts */
  by: 'person';
}

export interface Result {
  price: Dir | null;
  quantity: Dir | null;
  priceBefore: number | null;
  priceAfter: number | null;
  quantityBefore: number | null;
  quantityAfter: number | null;
}

export interface LogEntry {
  scenario: number;
  text: string;
  predicted: Guess | null;
  result: Result;
  /** each dimension: right, wrong, or nothing predicted */
  right: { price: boolean | null; quantity: boolean | null };
}

export interface MarketState extends DisplayHead {
  view: MarketView;
  demand: Curve;
  supply: Curve;
  units?: Units;
  applied: Levers;
  pending?: Pending;
  prediction?: Prediction;
  revealed: boolean;
  log: LogEntry[];
}

export const MARKET_LIMITS = { title: 80, unit: 16, text: 240, why: 400, log: 10, magnitude: 1e6 } as const;
const LIM = MARKET_LIMITS;
export const NO_LEVERS: Levers = { tax: 0, on: 'sellers', subsidy: 0, demandShift: 0, supplyShift: 0, ceiling: null, floor: null };
/** The scenario library, in the order `next` takes it: each follow-up tests whether the last idea transfers. */
export const SCENARIOS = [
  'a tax on sellers',
  'the same tax on buyers',
  'a subsidy to sellers',
  'demand up',
  'demand down',
  'supply up',
  'supply down',
  'a binding price ceiling',
  'a binding price floor',
] as const;
export const QUESTION = 'What happens to the price buyers pay and the quantity traded?';

// ── numbers in words ─────────────────────────────────────────────────

const clean = (v: number): number => {
  const r = Number(v.toPrecision(12));
  return r === 0 ? 0 : r;
};
/** Stored to ten significant figures, so a number survives a save unchanged. */
const keep = (v: number | null | undefined): number | null => (v === null || v === undefined || !Number.isFinite(v) ? null : num(v, -1e12, 1e12));

/** A number as a person reads it, the same on every machine (no locale). */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a < 1e-9) return '0';
  let body: string;
  if (a >= 1) {
    const [int, frac] = a.toFixed(2).split('.');
    const f = frac.replace(/0+$/, '');
    body = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? `.${f}` : '');
  } else body = String(Number(a.toPrecision(4)));
  return `${n < 0 ? '-' : ''}${body}`;
}

const SYMBOL = /^[$£€¥₹]$/;
/** A price with its unit: "$12", "12 dollars", or "12". */
export function money(v: number, u?: Units): string {
  const p = u?.price;
  if (!p) return fmt(v);
  return SYMBOL.test(p) ? `${v < 0 ? '-' : ''}${p}${fmt(Math.abs(v))}` : `${fmt(v)} ${p}`;
}
/** A quantity with its unit: "8 tickets", "8 units", "1 unit". */
export function amount(v: number, u?: Units): string {
  const q = u?.quantity;
  return `${fmt(v)} ${q || (fmt(v) === '1' ? 'unit' : 'units')}`;
}

/** "20 − Q", "2 + 0.5Q": a curve as a person writes it. */
export function lineSaid(l: PriceLine): string {
  const k = fmt(Math.abs(l.slope));
  const q = `${k === '1' ? '' : k}Q`;
  if (l.intercept === 0) return l.slope < 0 ? `−${q}` : q;
  return `${fmt(l.intercept)} ${l.slope < 0 ? '−' : '+'} ${q}`;
}

/** The largest round number (1, 2 or 5 × 10ⁿ) no bigger than x; 0 when x is not positive. */
export function niceFloor(x: number): number {
  if (!(x > 0)) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  const r = x / mag;
  return clean((r >= 5 - 1e-9 ? 5 : r >= 2 - 1e-9 ? 2 : 1) * mag);
}
const roundTo = (x: number, q: number): number => clean(Math.round(x / q) * q);

// ── canonical state ──────────────────────────────────────────────────

const DIRS: readonly Dir[] = ['up', 'down', 'same'];
const dirOrNull = (v: unknown): Dir | null => (DIRS.includes(v as Dir) ? (v as Dir) : null);
const big = (v: unknown, lo: number = -LIM.magnitude, hi: number = LIM.magnitude): number | null => num(v, lo, hi);

function cleanCurve(v: unknown, sign: 1 | -1): Curve | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const intercept = big(o.intercept);
  const slope = big(o.slope);
  if (intercept === null || slope === null || slope === 0 || Math.sign(slope) !== sign) return null;
  return { intercept, slope, by: cleanBy(o.by) };
}

const positive = (v: unknown): number | null => {
  const n = big(v, 0);
  return n !== null && n > 0 ? n : null;
};

/** A tax and a subsidy on at once are their difference: what the market computes either way. */
function net(tax: number, subsidy: number): { tax: number; subsidy: number } {
  const d = clean(tax - subsidy);
  return d > 0 ? { tax: d, subsidy: 0 } : { tax: 0, subsidy: clean(-d) };
}

function cleanLevers(v: unknown): Levers {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  let { tax, subsidy } = net(positive(o.tax) ?? 0, positive(o.subsidy) ?? 0);
  const ceiling = positive(o.ceiling);
  let floor = positive(o.floor);
  // a floor above the ceiling leaves no legal price: the ceiling stands
  if (ceiling !== null && floor !== null && floor > ceiling) floor = null;
  // a tax and a control together: the control wins, as in lib/logos-viz.ts
  if (ceiling !== null || floor !== null) tax = subsidy = 0;
  return {
    tax,
    on: (tax > 0 || subsidy > 0) && o.on === 'buyers' ? 'buyers' : 'sellers',
    subsidy,
    demandShift: big(o.demandShift) ?? 0,
    supplyShift: big(o.supplyShift) ?? 0,
    ceiling,
    floor,
  };
}

/** A change from raw words or arguments; null when it sets nothing, or sets a tax and a control together. */
export function cleanChange(v: unknown): Change | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const c: Change = {};
  const n = net(positive(o.tax) ?? 0, positive(o.subsidy) ?? 0);
  if (n.tax) c.tax = n.tax;
  if (n.subsidy) c.subsidy = n.subsidy;
  if (c.tax || c.subsidy) c.on = o.on === 'buyers' ? 'buyers' : 'sellers';
  const ds = big(o.demandShift);
  if (ds) c.demandShift = ds;
  const ss = big(o.supplyShift);
  if (ss) c.supplyShift = ss;
  const ce = positive(o.ceiling);
  if (ce !== null) c.ceiling = ce;
  const fl = positive(o.floor);
  if (fl !== null && !(ce !== null && fl > ce)) c.floor = fl;
  if ((c.ceiling !== undefined || c.floor !== undefined) && (c.tax || c.subsidy)) return null;
  return Object.keys(c).length ? c : null;
}

function cleanGuess(v: unknown): Guess | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const g: Guess = {
    price: dirOrNull(o.price),
    quantity: dirOrNull(o.quantity),
    priceValue: big(o.priceValue, -1e12, 1e12),
    quantityValue: big(o.quantityValue, -1e12, 1e12),
    why: cleanText(o.why, LIM.why),
  };
  return g.price || g.quantity || g.priceValue !== null || g.quantityValue !== null ? g : null;
}

const dirOf = (a: number | null, b: number | null): Dir | null => {
  if (a === null || b === null) return null;
  const tol = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  return b > a + tol ? 'up' : b < a - tol ? 'down' : 'same';
};

function cleanEntry(v: unknown): LogEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const scenario = typeof o.scenario === 'number' && Number.isInteger(o.scenario) && o.scenario >= -1 && o.scenario < SCENARIOS.length ? o.scenario : null;
  const text = cleanText(o.text, LIM.text);
  const r = (o.result && typeof o.result === 'object' ? o.result : null) as Record<string, unknown> | null;
  if (scenario === null || !text || !r) return null;
  const n = (x: unknown) => big(x, -1e12, 1e12);
  const pb = n(r.priceBefore);
  const pa = n(r.priceAfter);
  const qb = n(r.quantityBefore);
  const qa = n(r.quantityAfter);
  // the directions are read from the numbers, and the grade from both: a log cannot claim what it does not show
  const result: Result = { price: dirOf(pb, pa), quantity: dirOf(qb, qa), priceBefore: pb, priceAfter: pa, quantityBefore: qb, quantityAfter: qa };
  const predicted = cleanGuess(o.predicted);
  const g = gradePrediction(predicted, result);
  return { scenario, text, predicted, result, right: { price: g.price.right, quantity: g.quantity.right } };
}

export function sanitizeMarket(raw: unknown): MarketState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const demand = cleanCurve(r.demand, -1);
  const supply = cleanCurve(r.supply, 1);
  if (!demand || !supply) return null;
  // two lines that never cross where a market could exist are not a market
  const eq = equilibrium(demand, supply);
  if (!eq || !(eq.q > 0) || !(eq.p > 0)) return null;
  const u = (r.units && typeof r.units === 'object' ? r.units : {}) as Record<string, unknown>;
  const up = cleanText(u.price, LIM.unit);
  const uq = cleanText(u.quantity, LIM.unit);
  const units: Units | undefined = up || uq ? { price: up, quantity: uq } : undefined;
  const p = (r.pending && typeof r.pending === 'object' ? r.pending : null) as Record<string, unknown> | null;
  let pending: Pending | undefined;
  if (p) {
    const scenario = typeof p.scenario === 'number' && Number.isInteger(p.scenario) && p.scenario >= -1 && p.scenario < SCENARIOS.length ? p.scenario : null;
    const change = cleanChange(p.change);
    if (scenario !== null && change) pending = { scenario, text: describeChange(change, units), change };
  }
  const log = (Array.isArray(r.log) ? r.log : [])
    .map(cleanEntry)
    .filter((e): e is LogEntry => !!e)
    .slice(-LIM.log);
  const guess = pending ? cleanGuess(r.prediction) : null;
  // a prediction is the person's or it is not one
  const prediction: Prediction | undefined = guess && (r.prediction as Record<string, unknown>).by === 'person' ? { ...guess, by: 'person' } : undefined;
  return {
    title: cleanText(r.title, LIM.title) || 'Market',
    view: r.view === 'numbers' ? 'numbers' : 'graph',
    demand,
    supply,
    ...(units ? { units } : {}),
    applied: cleanLevers(r.applied),
    ...(pending ? { pending } : {}),
    ...(prediction ? { prediction } : {}),
    revealed: r.revealed === true && !!pending && log.length > 0,
    log,
  };
}

// ── what is computed (all through lib/logos-econ.ts) ─────────────────

const line = (c: PriceLine): PriceLine => ({ intercept: c.intercept, slope: c.slope });

/** The curves once shifted: a horizontal shift of dq is a vertical one of −slope·dq. */
export function shifted(s: Pick<MarketState, 'demand' | 'supply'>, lv: Pick<Levers, 'demandShift' | 'supplyShift'>): { demand: PriceLine; supply: PriceLine } {
  return {
    demand: shift(line(s.demand), -s.demand.slope * lv.demandShift),
    supply: shift(line(s.supply), -s.supply.slope * lv.supplyShift),
  };
}

export interface Outcome {
  /** the curves once shifted */
  demand: PriceLine;
  supply: PriceLine;
  /** where those curves cross with nothing else applied */
  free: Equilibrium | null;
  /** what buyers pay — tax included — or null when nothing trades */
  price: number | null;
  /** what sellers keep — subsidy included */
  received: number | null;
  /** what changes hands; 0 when nothing does */
  quantity: number;
  /** tax − subsidy, per unit */
  wedge: number;
  incidence: TaxIncidence | null;
  control: { kind: 'ceiling' | 'floor'; at: number; binds: boolean; qd: number; qs: number; imbalance: number } | null;
  /** government: tax revenue (+) or what a subsidy costs (−) */
  welfare: { consumer: number; producer: number; government: number; deadweight: number } | null;
}

/** The market under some levers. */
export function outcome(s: Pick<MarketState, 'demand' | 'supply'>, lv: Levers): Outcome {
  const { demand, supply } = shifted(s, lv);
  const free = equilibrium(demand, supply);
  const wedge = clean(lv.tax - lv.subsidy);
  const none: Outcome = { demand, supply, free, price: null, received: null, quantity: 0, wedge, incidence: null, control: null, welfare: null };
  if (!free) return none;
  if (wedge !== 0) {
    // a negative tax is a subsidy, which taxIncidence reads correctly — its cost passed to welfare as a negative transfer
    const inc = taxIncidence(demand, supply, wedge);
    if (!inc) return none;
    const government = wedge * inc.quantity;
    const w = welfare(demand, supply, inc.quantity, inc.pricePaid, inc.priceReceived, government);
    return { ...none, price: inc.pricePaid, received: inc.priceReceived, quantity: inc.quantity, incidence: inc, welfare: { consumer: w.consumer, producer: w.producer, government, deadweight: w.deadweight } };
  }
  const ceiling = lv.ceiling !== null ? { kind: 'ceiling' as const, at: lv.ceiling, binds: binds('ceiling', lv.ceiling, free.p) } : null;
  const floor = lv.floor !== null ? { kind: 'floor' as const, at: lv.floor, binds: binds('floor', lv.floor, free.p) } : null;
  const ctl = ceiling?.binds ? ceiling : floor?.binds ? floor : (ceiling ?? floor);
  if (ctl?.binds) {
    const m = marketAt(demand, supply, ctl.at);
    const w = welfare(demand, supply, m.traded, ctl.at);
    return { ...none, price: ctl.at, received: ctl.at, quantity: m.traded, control: { ...ctl, qd: m.qd, qs: m.qs, imbalance: m.imbalance }, welfare: { consumer: w.consumer, producer: w.producer, government: 0, deadweight: w.deadweight } };
  }
  const w = welfare(demand, supply, free.q, free.p);
  const m = ctl ? marketAt(demand, supply, ctl.at) : null;
  return {
    ...none,
    price: free.p,
    received: free.p,
    quantity: free.q,
    control: ctl && m ? { ...ctl, qd: m.qd, qs: m.qs, imbalance: m.imbalance } : null,
    welfare: { consumer: w.consumer, producer: w.producer, government: 0, deadweight: w.deadweight },
  };
}

/** Levers with a change applied: what it sets is set; a shift adds to the shift already there. */
export function mergeChange(lv: Levers, c: Change): Levers {
  const next: Levers = { ...lv };
  if (c.tax !== undefined || c.subsidy !== undefined) {
    next.tax = c.tax ?? 0;
    next.subsidy = c.subsidy ?? 0;
    next.on = c.on ?? 'sellers';
  }
  if (c.demandShift) next.demandShift = clean(lv.demandShift + c.demandShift);
  if (c.supplyShift) next.supplyShift = clean(lv.supplyShift + c.supplyShift);
  if (c.ceiling !== undefined) next.ceiling = c.ceiling;
  if (c.floor !== undefined) next.floor = c.floor;
  return cleanLevers(next);
}

/** Which way the price buyers pay and the quantity traded moved, from one outcome to another. */
export function resultOf(before: Outcome, after: Outcome): Result {
  const pb = keep(before.price);
  const pa = keep(after.price);
  const qb = keep(before.quantity);
  const qa = keep(after.quantity);
  return { price: dirOf(pb, pa), quantity: dirOf(qb, qa), priceBefore: pb, priceAfter: pa, quantityBefore: qb, quantityAfter: qa };
}

export interface Grade {
  price: { direction: boolean | null; value: boolean | null; right: boolean | null };
  quantity: { direction: boolean | null; value: boolean | null; right: boolean | null };
}

/** A predicted number within 2% of the computed one, or within half a unit, counts as right. */
export const closeEnough = (guess: number, actual: number): boolean => Math.abs(guess - actual) <= Math.max(0.5, 0.02 * Math.abs(actual)) + 1e-9;

/**
 * A prediction against the computed result, dimension by dimension: was the
 * direction right, was the number close enough, and — where both were
 * given — both. Null where nothing was predicted.
 */
export function gradePrediction(p: Guess | null, r: Result): Grade {
  const one = (d: Dir | null | undefined, v: number | null | undefined, rd: Dir | null, rv: number | null) => {
    const direction = d && rd ? d === rd : null;
    const value = v !== null && v !== undefined && rv !== null ? closeEnough(v, rv) : null;
    return { direction, value, right: direction !== null && value !== null ? direction && value : (direction ?? value) };
  };
  return { price: one(p?.price, p?.priceValue, r.price, r.priceAfter), quantity: one(p?.quantity, p?.quantityValue, r.quantity, r.quantityAfter) };
}

// ── the scenario library ─────────────────────────────────────────────

/**
 * How big a scenario's change is, read from the curves so it fits any
 * market: a tax about a sixth of the gap between the curves' intercepts, a
 * shift about a quarter of the equilibrium quantity, a control about a
 * quarter of the way from the equilibrium price to where trade stops — each
 * a round number. In P = 20 − Q, P = 2 + Q: a tax of 2, a shift of 2, a
 * ceiling at 9 and a floor at 13.
 */
export function scenarioSizes(s: Pick<MarketState, 'demand' | 'supply'>): { tax: number; shift: number; step: number; eq: Equilibrium } | null {
  const eq = equilibrium(s.demand, s.supply);
  if (!eq) return null;
  return {
    tax: niceFloor(0.15 * (s.demand.intercept - s.supply.intercept)),
    shift: niceFloor(0.25 * eq.q),
    step: niceFloor(0.25 * Math.min(eq.p - Math.max(0, s.supply.intercept), s.demand.intercept - eq.p)),
    eq,
  };
}

/** The change scenario `index` makes in this market, or null where it cannot be made. */
export function scenarioChange(s: Pick<MarketState, 'demand' | 'supply'>, index: number): Change | null {
  const z = scenarioSizes(s);
  if (!z) return null;
  switch (index) {
    case 0:
      return z.tax > 0 ? { tax: z.tax, on: 'sellers' } : null;
    case 1:
      return z.tax > 0 ? { tax: z.tax, on: 'buyers' } : null;
    case 2:
      return z.tax > 0 ? { subsidy: z.tax, on: 'sellers' } : null;
    case 3:
      return z.shift > 0 ? { demandShift: z.shift } : null;
    case 4:
      return z.shift > 0 ? { demandShift: -z.shift } : null;
    case 5:
      return z.shift > 0 ? { supplyShift: z.shift } : null;
    case 6:
      return z.shift > 0 ? { supplyShift: -z.shift } : null;
    case 7:
      return z.step > 0 ? { ceiling: roundTo(z.eq.p - z.step, z.step / 2) } : null;
    case 8:
      return z.step > 0 ? { floor: roundTo(z.eq.p + z.step, z.step / 2) } : null;
  }
  return null;
}

/** A change in words — the question, never its answer. */
export function describeChange(c: Change, u?: Units): string {
  const out: string[] = [];
  if (c.tax) out.push(c.on === 'buyers' ? `A tax of ${money(c.tax, u)} per unit is collected from buyers.` : `A tax of ${money(c.tax, u)} per unit is put on sellers.`);
  if (c.subsidy) out.push(`${c.on === 'buyers' ? 'Buyers' : 'Sellers'} are paid a subsidy of ${money(c.subsidy, u)} per unit.`);
  if (c.demandShift) out.push(c.demandShift > 0 ? `Demand increases: buyers want ${amount(c.demandShift, u)} more at every price.` : `Demand decreases: buyers want ${amount(-c.demandShift, u)} fewer at every price.`);
  if (c.supplyShift) out.push(c.supplyShift > 0 ? `Supply increases: sellers offer ${amount(c.supplyShift, u)} more at every price.` : `Supply decreases: sellers offer ${amount(-c.supplyShift, u)} fewer at every price.`);
  if (c.ceiling !== undefined) out.push(`A price ceiling is set at ${money(c.ceiling, u)}.`);
  if (c.floor !== undefined) out.push(`A price floor is set at ${money(c.floor, u)}.`);
  return cleanText(out.join(' '), LIM.text);
}

export function scenarioAt(s: MarketState, index: number): Pending | null {
  const change = scenarioChange(s, index);
  return change ? { scenario: index, text: describeChange(change, s.units), change } : null;
}

/** The scenario after the last one taken (the one posed, else the last in the log) — never stuck when the log is full. */
export function nextScenario(s: MarketState): number {
  const last = s.pending && s.pending.scenario >= 0 ? s.pending.scenario : [...s.log].reverse().find((e) => e.scenario >= 0)?.scenario;
  const start = last === undefined ? 0 : last + 1;
  for (let k = 0; k < SCENARIOS.length; k++) {
    const i = (start + k) % SCENARIOS.length;
    if (scenarioChange(s, i)) return i;
  }
  return -1;
}

/**
 * The posed scenario's two markets, for a renderer: before always, after
 * ONLY once revealed — before that, the after is the answer.
 */
export function posedOutcomes(s: MarketState): { before: Outcome; after: Outcome | null } | null {
  if (!s.pending) return null;
  return { before: outcome(s, NO_LEVERS), after: s.revealed ? outcome(s, mergeChange(NO_LEVERS, s.pending.change)) : null };
}

// ── the mechanism, in words (said only once revealed) ────────────────

const moved = (d: Dir | null, up: string, down: string, same: string) => (d === 'up' ? up : d === 'down' ? down : same);
const pct = (f: number) => `${fmt(clean(100 * f))}%`;

/**
 * Why the change does what it does: the mechanism for each part of it, then
 * the computed result — every direction and number read from the
 * computation, none asserted. It states the answer, so it is said only
 * after the reveal.
 */
export function explainChange(s: MarketState, c: Change): string[] {
  const u = s.units;
  const before = outcome(s, NO_LEVERS);
  const after = outcome(s, mergeChange(NO_LEVERS, c));
  const r = resultOf(before, after);
  const out: string[] = [];
  const single = Object.keys(c).filter((k) => k !== 'on').length === 1;
  if (c.tax) {
    out.push(
      c.on === 'buyers'
        ? `A per-unit tax on buyers lowers what they will pay sellers by ${money(c.tax, u)} at every quantity, so demand shifts down by ${money(c.tax, u)}.`
        : `A per-unit tax on sellers raises their cost of supplying every unit by ${money(c.tax, u)}, so supply shifts up by ${money(c.tax, u)}.`
    );
  }
  if (c.subsidy) {
    out.push(
      c.on === 'buyers'
        ? `A per-unit subsidy to buyers raises what they will pay sellers by ${money(c.subsidy, u)} at every quantity, so demand shifts up by ${money(c.subsidy, u)}.`
        : `A per-unit subsidy to sellers lowers their cost of supplying every unit by ${money(c.subsidy, u)}, so supply shifts down by ${money(c.subsidy, u)}.`
    );
  }
  if (c.demandShift) out.push(`Buyers want ${amount(Math.abs(c.demandShift), u)} ${c.demandShift > 0 ? 'more' : 'fewer'} at every price, so demand shifts ${c.demandShift > 0 ? 'right' : 'left'} by ${fmt(Math.abs(c.demandShift))}.`);
  if (c.supplyShift) out.push(`Sellers offer ${amount(Math.abs(c.supplyShift), u)} ${c.supplyShift > 0 ? 'more' : 'fewer'} at every price, so supply shifts ${c.supplyShift > 0 ? 'right' : 'left'} by ${fmt(Math.abs(c.supplyShift))}.`);
  const free = before.free;
  for (const kind of ['ceiling', 'floor'] as const) {
    const at = c[kind];
    if (at === undefined || !free) continue;
    const b = binds(kind, at, free.p);
    const side = kind === 'ceiling' ? (b ? 'below' : 'above') : b ? 'above' : 'below';
    out.push(
      b
        ? `The ${kind} of ${money(at, u)} is ${side} the equilibrium price of ${money(free.p, u)}, so it binds: the price cannot ${kind === 'ceiling' ? 'rise' : 'fall'} to where the market clears.`
        : `The ${kind} of ${money(at, u)} is ${side} the equilibrium price of ${money(free.p, u)}, so it does not bind: the market clears where it would anyway.`
    );
  }
  if (after.price === null || before.price === null) {
    out.push('Nothing trades once the change is made.');
    return out;
  }
  const qMoved = `the quantity traded ${moved(r.quantity, 'rises', 'falls', 'stays')} ${r.quantity === 'same' ? `at ${amount(after.quantity, u)}` : `from ${amount(before.quantity, u)} to ${amount(after.quantity, u)}`}`;
  const inc = after.incidence;
  if (inc && after.wedge > 0) {
    const t = after.wedge;
    out.push(`Buyers now pay ${money(inc.pricePaid, u)} (it was ${money(before.price, u)}) and sellers keep ${money(inc.priceReceived, u)}: the ${money(t, u)} between those two prices is the tax. And ${qMoved}.`);
    const fb = inc.buyerShare / t;
    out.push(
      Math.abs(fb - 0.5) < 1e-9
        ? `The burden splits by the slopes of the two curves: they are equally steep here, so buyers and sellers carry half each.`
        : fb > 0.5
          ? `The burden splits by the slopes of the two curves: demand is the steeper one — buyers are less able to walk away — so they carry ${pct(fb)} and sellers ${pct(1 - fb)}.`
          : `The burden splits by the slopes of the two curves: supply is the steeper one — sellers are less able to walk away — so they carry ${pct(1 - fb)} and buyers ${pct(fb)}.`
    );
    if (c.on === 'buyers') out.push('That is exactly what the same tax on sellers does: who hands the tax over does not decide who bears it — the slopes do.');
    out.push(`It raises ${money(after.welfare!.government, u)}; the trades it prevents lose ${money(after.welfare!.deadweight, u)} of surplus (deadweight loss).`);
  } else if (inc && after.wedge < 0) {
    const sub = -after.wedge;
    out.push(`Buyers now pay ${money(inc.pricePaid, u)} (it was ${money(before.price, u)}) and sellers receive ${money(inc.priceReceived, u)} with the subsidy. And ${qMoved}.`);
    const fb = -inc.buyerShare / sub;
    out.push(`Buyers get ${pct(fb)} of the subsidy as a lower price and sellers ${pct(1 - fb)} as a higher one — split, again, by the slopes.`);
    out.push(`It costs ${money(-after.welfare!.government, u)} — more than buyers and sellers gain together — so ${money(after.welfare!.deadweight, u)} of surplus is lost on trades worth less than they cost (deadweight loss).`);
  } else if (after.control?.binds) {
    const m = after.control;
    out.push(
      m.kind === 'ceiling'
        ? `At ${money(m.at, u)} buyers want ${amount(m.qd, u)} but sellers offer only ${amount(m.qs, u)}: a shortage of ${amount(m.qd - m.qs, u)}. Only the smaller amount trades — the short side decides — so ${qMoved}.`
        : `At ${money(m.at, u)} sellers offer ${amount(m.qs, u)} but buyers want only ${amount(m.qd, u)}: a surplus of ${amount(m.qs - m.qd, u)}. Only what buyers take is traded, so ${qMoved}.`
    );
  } else {
    out.push(`The price buyers pay ${moved(r.price, 'rises', 'falls', 'stays')} ${r.price === 'same' ? `at ${money(after.price, u)}` : `from ${money(before.price, u)} to ${money(after.price, u)}`}, and ${qMoved}.`);
    if (single && (c.demandShift || c.supplyShift)) out.push(`The ${c.demandShift ? 'supply' : 'demand'} curve did not move: the market slid along it to the new crossing.`);
  }
  return out;
}

// ── for a renderer ───────────────────────────────────────────────────

/** The curves to draw: as shifted, as they started (for ghosts), and the one a tax or subsidy moves. */
export function marketCurves(s: MarketState): { demand: PriceLine; supply: PriceLine; demand0: PriceLine; supply0: PriceLine; wedged: { curve: 'demand' | 'supply'; line: PriceLine } | null } {
  const { demand, supply } = shifted(s, s.applied);
  const w = clean(s.applied.tax - s.applied.subsidy);
  const wedged = w === 0 ? null : s.applied.on === 'buyers' ? { curve: 'demand' as const, line: shift(demand, -w) } : { curve: 'supply' as const, line: taxedSupply(supply, w) };
  return { demand, supply, demand0: line(s.demand), supply0: line(s.supply), wedged };
}

/** The part of a line inside the box 0 ≤ Q ≤ qMax, 0 ≤ P ≤ pMax — a curve's endpoints as drawn — or null if it misses the box. */
export function segmentIn(l: PriceLine, qMax: number, pMax: number): { q0: number; p0: number; q1: number; p1: number } | null {
  let lo = 0;
  let hi = qMax;
  if (l.slope === 0) {
    if (l.intercept < 0 || l.intercept > pMax) return null;
  } else {
    const a = quantityAt(l, 0);
    const b = quantityAt(l, pMax);
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  if (lo > hi + 1e-12) return null;
  return { q0: clean(lo), p0: clean(priceAt(l, lo)), q1: clean(hi), p1: clean(priceAt(l, hi)) };
}

/** The window the graph needs: both curves' reach, every price that matters, round ends and round ticks. */
export function marketWindow(s: MarketState): { qMax: number; pMax: number; qTicks: number[]; pTicks: number[] } {
  const c = marketCurves(s);
  const now = outcome(s, s.applied);
  const qs = [c.demand, c.demand0, ...(c.wedged?.curve === 'demand' ? [c.wedged.line] : [])].map((d) => quantityAt(d, 0)).filter((q) => Number.isFinite(q) && q > 0);
  const qMaxRaw = Math.max(1, ...qs, (now.free?.q ?? 0) * 1.6, now.control ? Math.max(now.control.qd, now.control.qs) * 1.1 : 0);
  const ps = [c.demand.intercept, c.demand0.intercept, c.supply.intercept, c.supply0.intercept, ...(c.wedged ? [c.wedged.line.intercept] : []), s.applied.ceiling ?? 0, s.applied.floor ?? 0, now.price ?? 0];
  const pMaxRaw = Math.max(1, ...ps.map((p) => p * 1.1));
  const ticks = (hi: number) => {
    const t = niceTicks(0, hi, 5);
    const step = t.length >= 2 ? t[1] - t[0] : hi;
    const top = clean(Math.ceil(hi / step - 1e-9) * step);
    const out: number[] = [];
    for (let i = 0; i * step <= top + step * 1e-9 && out.length < 40; i++) out.push(clean(i * step));
    return { top, out };
  };
  const q = ticks(qMaxRaw);
  const p = ticks(pMaxRaw);
  return { qMax: q.top, pMax: p.top, qTicks: q.out, pTicks: p.out };
}

// ── words for facts and text ─────────────────────────────────────────

function leversSaid(lv: Levers, u?: Units): string {
  const parts: string[] = [];
  if (lv.tax) parts.push(`a tax of ${money(lv.tax, u)} per unit ${lv.on === 'buyers' ? 'collected from buyers' : 'on sellers'}`);
  if (lv.subsidy) parts.push(`a subsidy of ${money(lv.subsidy, u)} per unit to ${lv.on}`);
  if (lv.demandShift) parts.push(`demand shifted ${lv.demandShift > 0 ? 'right' : 'left'} by ${amount(Math.abs(lv.demandShift), u)}`);
  if (lv.supplyShift) parts.push(`supply shifted ${lv.supplyShift > 0 ? 'right' : 'left'} by ${amount(Math.abs(lv.supplyShift), u)}`);
  if (lv.ceiling !== null) parts.push(`a price ceiling at ${money(lv.ceiling, u)}`);
  if (lv.floor !== null) parts.push(`a price floor at ${money(lv.floor, u)}`);
  return parts.length ? parts.join('; ') : 'no tax, subsidy, shift or control';
}

/** A prediction in words; with no units given (a step's own words, which cannot see the market), plain numbers. */
function guessSaid(g: Guess, u?: Units): string {
  const p = [g.price ? `price ${g.price}` : '', g.quantity ? `quantity ${g.quantity}` : ''].filter(Boolean).join(', ');
  const v = [g.priceValue !== null ? `price ${money(g.priceValue, u)}` : '', g.quantityValue !== null ? `quantity ${u ? amount(g.quantityValue, u) : fmt(g.quantityValue)}` : ''].filter(Boolean).join(', ');
  return `${p || v}${p && v ? ` (${v})` : ''}${g.why ? `, because “${g.why}”` : ''}`;
}

function resultSaid(r: Result, u?: Units): string {
  const price = r.priceAfter === null ? 'no price, since nothing trades' : `the price buyers pay ${r.priceBefore === null ? `is ${money(r.priceAfter, u)}` : `went from ${money(r.priceBefore, u)} to ${money(r.priceAfter, u)}`}${r.price ? ` (${r.price})` : ''}`;
  const qty = `the quantity traded ${r.quantityBefore === null || r.quantityAfter === null ? 'is unknown' : `went from ${amount(r.quantityBefore, u)} to ${amount(r.quantityAfter, u)}`}${r.quantity ? ` (${r.quantity})` : ''}`;
  return `${price}; ${qty}.`;
}

function gradeSaid(e: LogEntry, u?: Units): string {
  if (!e.predicted) return 'They revealed it without predicting.';
  const g = gradePrediction(e.predicted, e.result);
  const one = (name: 'price' | 'quantity', d: Dir | null, v: number | null) => {
    const x = g[name];
    const bits: string[] = [];
    if (d) bits.push(`${name} ${d} — ${x.direction ? 'right' : 'wrong'}`);
    if (v !== null) bits.push(`${name} ${name === 'price' ? money(v, u) : amount(v, u)} — ${x.value ? 'close enough to count' : 'not within 2% or half a unit'}`);
    return bits.join('; ');
  };
  const said = [one('price', e.predicted.price, e.predicted.priceValue), one('quantity', e.predicted.quantity, e.predicted.quantityValue)].filter(Boolean).join('; ');
  return `They predicted ${said}.`;
}

/** What the market under the current levers comes to, in sentences. */
function outcomeSaid(s: MarketState, o: Outcome): string[] {
  const u = s.units;
  if (!o.free) return ['Once shifted, the curves do not cross at a positive price and quantity, so nothing trades.'];
  if (o.price === null) return [`A ${o.wedge > 0 ? 'tax' : 'subsidy'} this large closes the market: there is no price at which anyone still trades.`];
  const w = o.welfare!;
  const surplus = `Consumer surplus ${money(w.consumer, u)}, producer surplus ${money(w.producer, u)}${w.deadweight > 1e-9 ? `, deadweight loss ${money(w.deadweight, u)}` : ''}.`;
  if (o.incidence && o.wedge > 0) {
    const fb = o.incidence.buyerShare / o.wedge;
    return [`Buyers pay ${money(o.price, u)} and sellers keep ${money(o.received!, u)}; ${amount(o.quantity, u)} trade. The tax raises ${money(w.government, u)}; buyers carry ${pct(fb)} of it and sellers ${pct(1 - fb)}.`, surplus];
  }
  if (o.incidence && o.wedge < 0) return [`Buyers pay ${money(o.price, u)} and sellers receive ${money(o.received!, u)} with the subsidy; ${amount(o.quantity, u)} trade. The subsidy costs ${money(-w.government, u)}.`, surplus];
  const out: string[] = [];
  const c = o.control;
  if (c?.binds) {
    out.push(
      c.kind === 'ceiling'
        ? `At the ceiling of ${money(c.at, u)}, buyers want ${amount(c.qd, u)} but sellers offer only ${amount(c.qs, u)}: a shortage of ${amount(c.imbalance, u)}; ${amount(o.quantity, u)} trade.`
        : `At the floor of ${money(c.at, u)}, sellers offer ${amount(c.qs, u)} but buyers want only ${amount(c.qd, u)}: a surplus of ${amount(-c.imbalance, u)}; ${amount(o.quantity, u)} trade.`
    );
  } else {
    out.push(`The market clears at a price of ${money(o.price, u)}, with ${amount(o.quantity, u)} traded.`);
    for (const kind of ['ceiling', 'floor'] as const) {
      const at = s.applied[kind];
      if (at !== null) out.push(`The ${kind} of ${money(at, u)} is ${kind === 'ceiling' ? 'above' : 'below'} the market price, so it does not bind.`);
    }
  }
  out.push(surplus);
  return out;
}

function factsOf(s: MarketState, guarded: boolean): string[] {
  const u = s.units;
  const out = [
    `${s.title}: a market — demand P = ${lineSaid(s.demand)}, supply P = ${lineSaid(s.supply)}${u ? ` (price in ${u.price || '—'}, quantity in ${u.quantity || 'units'})` : ''}; shown as ${s.view === 'graph' ? 'a graph' : 'numbers'}.`,
    `Applied now: ${leversSaid(s.applied, u)}.`,
  ];
  const waiting = !!s.pending && !s.revealed;
  // While a change waits, the levers are the market BEFORE it (posing takes everything off), so
  // these numbers are never its answer. Guarded, they are the person's to work out.
  if (guarded && !s.revealed) out.push('The equilibrium, prices and surplus are for them to work out, so the figures are withheld.');
  else out.push(...outcomeSaid(s, outcome(s, s.applied)));
  if (s.pending && waiting) {
    out.push(`Posed: “${s.pending.text}” ${QUESTION}`);
    out.push(s.prediction ? `Their prediction: ${guessSaid(s.prediction, u)}.` : 'They have not predicted yet.');
    out.push('What the change does is withheld until they reveal it: the prediction is theirs to make, so do not hint at the answer.');
  } else if (s.pending && s.revealed) {
    const e = s.log[s.log.length - 1];
    out.push(`Revealed: “${s.pending.text}” — ${resultSaid(e.result, u)}`);
    out.push(gradeSaid(e, u));
    out.push(...explainChange(s, s.pending.change));
  }
  const graded = s.log.flatMap((e) => [e.predicted?.price ? gradePrediction(e.predicted, e.result).price.direction : null, e.predicted?.quantity ? gradePrediction(e.predicted, e.result).quantity.direction : null]).filter((x): x is boolean => x !== null);
  if (graded.length) out.push(`Across the ${s.log.length} scenario${s.log.length === 1 ? '' : 's'} in the log, ${graded.filter(Boolean).length} of ${graded.length} predicted direction${graded.length === 1 ? ' was' : 's were'} right — a record of these attempts, not a measure of mastery.`);
  if (s.demand.by === 'person' || s.supply.by === 'person') out.push('The curves they set are theirs; Socria does not change them.');
  return out;
}

function textOf(s: MarketState): string {
  const u = s.units;
  const who = (c: Curve) => (c.by === 'person' ? 'theirs' : 'from Socria');
  const lines = [
    `MARKET “${s.title}”`,
    `Demand: P = ${lineSaid(s.demand)} (${who(s.demand)}); supply: P = ${lineSaid(s.supply)} (${who(s.supply)}).`,
    ...(u ? [`Units: price in ${u.price || '—'}, quantity in ${u.quantity || 'units'}.`] : []),
    `Applied: ${leversSaid(s.applied, u)}.`,
  ];
  if (s.pending) {
    lines.push(`Posed${s.pending.scenario >= 0 ? ` (scenario ${s.pending.scenario + 1} of ${SCENARIOS.length})` : ' (their own)'}: “${s.pending.text}” — ${s.revealed ? 'revealed' : 'waiting for their prediction; what it does is not shown until they reveal it'}.`);
    if (s.prediction) lines.push(`Their prediction: ${guessSaid(s.prediction, u)}.`);
  }
  if (s.log.length) {
    // the latest entries first in line for the room there is: an entry is dropped whole, never cut part-way
    const entries = s.log.map((e, i) => `${i + 1}. “${e.text}” — ${e.predicted ? `predicted ${guessSaid({ ...e.predicted, why: '' }, u)}` : 'no prediction'}; ${resultSaid(e.result, u)}`);
    let room = 2400 - lines.join('\n').length - 120;
    let first = entries.length;
    while (first > 0 && room - entries[first - 1].length - 1 >= 0) room -= entries[--first].length + 1;
    lines.push(`Log (each result computed at its reveal)${first ? `; the earliest ${first} not shown` : ''}:`, ...entries.slice(first));
  }
  return lines.join('\n').slice(0, 2400);
}

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<MarketState>[] = [
  {
    id: 'graph',
    label: 'Graph',
    shows: 'the two curves, where they cross, and what a tax, shift or control does to them',
    primary: true,
    interactions: ['shift a curve', 'set a tax, a subsidy, a ceiling or a floor', 'predict, then reveal'],
  },
  { id: 'numbers', label: 'Numbers', shows: 'the prices, quantities and surplus, and the log of predictions', interactions: ['predict, then reveal'] },
];

const awaiting = (s: MarketState) => !!s.pending && !s.revealed;
const waitRefused = (s: MarketState): string | null => (awaiting(s) ? 'A scenario is waiting for a prediction — reveal it (or reset) before changing the market.' : null);
const keepsPrediction = (s: MarketState, ctx: Ctx): string | null =>
  ctx?.by === 'socria' && awaiting(s) && s.prediction ? 'Your prediction is waiting to be revealed — Socria does not set it aside.' : null;
const side = (v: unknown): Side | null => (v === undefined || v === '' ? null : v === 'sellers' || v === 'buyers' ? v : null);
const withState = (s: MarketState, patch: Partial<MarketState>): MarketState => sanitizeMarket({ ...s, ...patch }) ?? s;
const posed = (s: MarketState, p: Pending): MarketState => withState(s, { applied: NO_LEVERS, pending: p, prediction: undefined, revealed: false });

/** Why a change cannot be posed here, or null. */
function poseRefused(s: MarketState, c: Change | null): string | null {
  if (!c) return 'Say what changes: a tax or subsidy, a shift of demand or supply, a ceiling or a floor — a tax and a control are not posed together.';
  const after = outcome(s, mergeChange(NO_LEVERS, c));
  if (after.price === null || !(after.quantity > 0)) return 'That change would leave nothing traded, so there is nothing to predict — try a smaller one.';
  return null;
}

/** A change from an operation's own arguments (a scenario the person asked for). */
const changeOf = (a: Args): Change | null => cleanChange({ tax: a.tax, subsidy: a.subsidy, on: a.on, demandShift: a.demandShift, supplyShift: a.supplyShift, ceiling: a.ceiling, floor: a.floor });

export const MARKET_OPS = {
  ...headOps<MarketState>(views, sanitizeMarket),
  param: op<MarketState>(
    'Set a curve',
    (s, a, ctx) => {
      if (a.curve !== 'demand' && a.curve !== 'supply') return 'Say which curve: demand or supply.';
      if (a.intercept === undefined && a.slope === undefined) return 'Give an intercept or a slope.';
      const cur = s[a.curve];
      const intercept = a.intercept === undefined ? cur.intercept : big(a.intercept);
      const slope = a.slope === undefined ? cur.slope : big(a.slope);
      if (intercept === null || slope === null) return 'That is not a number.';
      if (a.curve === 'demand' ? !(slope < 0) : !(slope > 0)) return a.curve === 'demand' ? 'Demand slopes down: its slope is negative.' : 'Supply slopes up: its slope is positive.';
      const eq = a.curve === 'demand' ? equilibrium({ intercept, slope }, s.supply) : equilibrium(s.demand, { intercept, slope });
      if (!eq || !(eq.q > 0) || !(eq.p > 0)) return 'Then the curves would not cross at a positive price and quantity, and there would be no market to show.';
      return waitRefused(s) ?? guardOwn(cur, ctx, 'That curve') ?? guardBy(a, ctx);
    },
    (s, a) => {
      const k = a.curve as 'demand' | 'supply';
      const cur = s[k];
      const curve: Curve = {
        intercept: a.intercept === undefined ? cur.intercept : big(a.intercept)!,
        slope: a.slope === undefined ? cur.slope : big(a.slope)!,
        // a curve the person sets is theirs from then on
        by: a.by === 'person' ? 'person' : cur.by,
      };
      return withState(s, k === 'demand' ? { demand: curve } : { supply: curve });
    },
    (a) => `${String(a.curve)}${a.intercept !== undefined ? ` intercept ${fmt(Number(a.intercept))}` : ''}${a.slope !== undefined ? ` slope ${fmt(Number(a.slope))}` : ''}`
  ),
  tax: op<MarketState>(
    'Tax',
    (s, a) => {
      const t = big(a.t, 0);
      if (t === null) return 'A tax is a number of at least 0 per unit.';
      if (a.on !== undefined && !side(a.on)) return 'A tax is put on sellers or on buyers.';
      if (t > 0 && (s.applied.ceiling !== null || s.applied.floor !== null)) return 'Take the price control off first: this market computes a tax or a control, not both at once.';
      if (t > 0 && s.applied.subsidy > 0) return 'Take the subsidy off first: a market here has a tax or a subsidy, not both.';
      if (t === 0 && s.applied.tax === 0) return 'There is no tax to take off.';
      return waitRefused(s);
    },
    (s, a) => {
      const t = big(a.t, 0)!;
      return withState(s, { applied: { ...s.applied, tax: t, on: side(a.on) ?? s.applied.on } });
    },
    (a) => (Number(a.t) > 0 ? `a tax of ${fmt(Number(a.t))} per unit on ${side(a.on) ?? 'sellers'}` : 'tax taken off')
  ),
  subsidy: op<MarketState>(
    'Subsidy',
    (s, a) => {
      const v = big(a.s, 0);
      if (v === null) return 'A subsidy is a number of at least 0 per unit.';
      if (a.on !== undefined && !side(a.on)) return 'A subsidy is paid to sellers or to buyers.';
      if (v > 0 && (s.applied.ceiling !== null || s.applied.floor !== null)) return 'Take the price control off first: this market computes a subsidy or a control, not both at once.';
      if (v > 0 && s.applied.tax > 0) return 'Take the tax off first: a market here has a tax or a subsidy, not both.';
      if (v === 0 && s.applied.subsidy === 0) return 'There is no subsidy to take off.';
      return waitRefused(s);
    },
    (s, a) => withState(s, { applied: { ...s.applied, subsidy: big(a.s, 0)!, on: side(a.on) ?? s.applied.on } }),
    (a) => (Number(a.s) > 0 ? `a subsidy of ${fmt(Number(a.s))} per unit to ${side(a.on) ?? 'sellers'}` : 'subsidy taken off')
  ),
  shift: op<MarketState>(
    'Shift a curve',
    (s, a) => {
      if (a.curve !== 'demand' && a.curve !== 'supply') return 'Say which curve: demand or supply.';
      const by = big(a.by);
      if (by === null || by === 0) return 'Say how far to shift it, in units of quantity: positive is an increase (right), negative a decrease (left).';
      const total = (a.curve === 'demand' ? s.applied.demandShift : s.applied.supplyShift) + by;
      if (Math.abs(total) > LIM.magnitude) return 'That is further than a curve can be shifted here.';
      return waitRefused(s);
    },
    (s, a) => {
      const by = big(a.by)!;
      const applied: Levers =
        a.curve === 'demand' ? { ...s.applied, demandShift: clean(s.applied.demandShift + by) } : { ...s.applied, supplyShift: clean(s.applied.supplyShift + by) };
      return withState(s, { applied });
    },
    (a) => `${String(a.curve)} shifted ${Number(a.by) > 0 ? 'right' : 'left'} by ${fmt(Math.abs(Number(a.by)))}`
  ),
  ceiling: op<MarketState>(
    'Price ceiling',
    (s, a) => {
      if (a.p === '') return s.applied.ceiling === null ? 'There is no ceiling to take off.' : waitRefused(s);
      const p = big(a.p, 0);
      if (p === null || p <= 0) return 'A ceiling is a price above 0.';
      if (s.applied.floor !== null && p < s.applied.floor) return 'A ceiling below the floor would leave no legal price.';
      if (s.applied.tax > 0 || s.applied.subsidy > 0) return 'Take the tax or subsidy off first: this market computes a control or a tax, not both at once.';
      return waitRefused(s);
    },
    (s, a) => withState(s, { applied: { ...s.applied, ceiling: a.p === '' ? null : big(a.p, 0) } }),
    (a) => (a.p === '' ? 'ceiling taken off' : `a price ceiling at ${fmt(Number(a.p))}`)
  ),
  floor: op<MarketState>(
    'Price floor',
    (s, a) => {
      if (a.p === '') return s.applied.floor === null ? 'There is no floor to take off.' : waitRefused(s);
      const p = big(a.p, 0);
      if (p === null || p <= 0) return 'A floor is a price above 0.';
      if (s.applied.ceiling !== null && p > s.applied.ceiling) return 'A floor above the ceiling would leave no legal price.';
      if (s.applied.tax > 0 || s.applied.subsidy > 0) return 'Take the tax or subsidy off first: this market computes a control or a tax, not both at once.';
      return waitRefused(s);
    },
    (s, a) => withState(s, { applied: { ...s.applied, floor: a.p === '' ? null : big(a.p, 0) } }),
    (a) => (a.p === '' ? 'floor taken off' : `a price floor at ${fmt(Number(a.p))}`)
  ),
  pose: op<MarketState>(
    'Pose a scenario',
    (s, a, ctx) => {
      const i = Number(a.scenario);
      if (!Number.isInteger(i) || i < -1 || i >= SCENARIOS.length) return 'There is no such scenario.';
      return keepsPrediction(s, ctx) ?? (i === -1 ? poseRefused(s, changeOf(a)) : scenarioChange(s, i) ? poseRefused(s, scenarioChange(s, i)) : 'That scenario does not fit this market.');
    },
    (s, a) => {
      const i = Number(a.scenario);
      const change = (i === -1 ? changeOf(a) : scenarioChange(s, i))!;
      return posed(s, { scenario: i, text: describeChange(change, s.units), change });
    },
    (a) => (Number(a.scenario) >= 0 ? `posed scenario ${Number(a.scenario) + 1}: ${SCENARIOS[Number(a.scenario)]}` : `posed: ${describeChange(changeOf(a) ?? {}) || 'a change'}`)
  ),
  predict: op<MarketState>(
    'Predict',
    (s, a, ctx) => {
      if (!s.pending) return 'There is no scenario to predict yet — pose one first.';
      if (s.revealed) return 'This one is already revealed: a prediction comes before the reveal. Ask for the next one.';
      if (ctx?.by === 'socria' || a.by === 'socria') return 'Only you can predict — the prediction is yours to make, not Socria’s.';
      const by = guardBy(a, ctx);
      if (by) return by;
      for (const k of ['price', 'quantity'] as const) if (a[k] !== undefined && a[k] !== '' && !dirOrNull(a[k])) return `Say whether the ${k} goes up, down or stays the same.`;
      for (const k of ['priceValue', 'quantityValue'] as const) if (a[k] !== undefined && a[k] !== '' && big(a[k], -1e12, 1e12) === null) return 'A predicted value is a number.';
      if (!cleanGuess(a)) return 'Say which way the price or the quantity goes — up, down or the same — or what it comes to.';
      return null;
    },
    (s, a) => withState(s, { prediction: { ...cleanGuess(a)!, by: 'person' } }),
    (a) => `predicted ${guessSaid(cleanGuess(a) ?? { price: null, quantity: null, priceValue: null, quantityValue: null, why: '' })}`
  ),
  reveal: op<MarketState>(
    'Reveal',
    (s, _a, ctx) => {
      if (!s.pending) return 'There is nothing to reveal — pose a scenario first.';
      if (s.revealed) return 'It is already revealed.';
      if (ctx?.by === 'socria') return 'Revealing is the person’s call: they reveal when they are ready.';
      return null;
    },
    (s) => {
      const p = s.pending!;
      const levers = mergeChange(s.applied, p.change);
      const result = resultOf(outcome(s, s.applied), outcome(s, levers));
      const predicted: Guess | null = s.prediction ? { price: s.prediction.price, quantity: s.prediction.quantity, priceValue: s.prediction.priceValue, quantityValue: s.prediction.quantityValue, why: s.prediction.why } : null;
      const g = gradePrediction(predicted, result);
      const entry: LogEntry = { scenario: p.scenario, text: p.text, predicted, result, right: { price: g.price.right, quantity: g.quantity.right } };
      return withState(s, { applied: levers, revealed: true, log: [...s.log, entry].slice(-LIM.log) });
    },
    () => 'revealed'
  ),
  next: op<MarketState>(
    'Next scenario',
    (s, _a, ctx) => keepsPrediction(s, ctx) ?? (nextScenario(s) < 0 ? 'No scenario fits this market.' : null),
    (s) => posed(s, scenarioAt(s, nextScenario(s))!),
    () => 'the next scenario'
  ),
  reset: op<MarketState>(
    'Reset',
    (s, _a, ctx) => {
      const own = keepsPrediction(s, ctx);
      if (own) return own;
      return sameAs(s.applied, NO_LEVERS) && !s.pending ? 'There is nothing to reset: no tax, shift or control is on and nothing is posed.' : null;
    },
    (s) => withState(s, { applied: NO_LEVERS, pending: undefined, prediction: undefined, revealed: false }),
    () => 'reset to the market with no tax, shift or control'
  ),
};

// ── words → an operation ─────────────────────────────────────────────

const LEAD = /^(?:(?:ok(?:ay)?|so|now|alright|all right|right|well|fine|great|good|nice|cool|thanks|thank you|got it|go on|then)[,.!\s]+)*(?:please\s+)?/.source;
const REVEAL = new RegExp(`${LEAD}(?:reveal(?: it| the answer| the result| what happens)?|show me(?: the answer| the result| what happens)?|show (?:the )?(?:answer|result)|what happens(?: now| then| next)?|go ahead and reveal(?: it)?)(?:\\s+please)?[.!?\\s]*$`);
const NEXT = new RegExp(`${LEAD}(?:(?:give me|let'?s do|let'?s try|try|do|show me|on to|onto|go to)\\s+)?(?:the\\s+)?(?:next(?: one| scenario| case)?|another(?: one| scenario| case)?|one more)(?:\\s+please)?[.!?\\s]*$`);

const UP = /\b(up|rises?|rising|rose|increases?|increasing|increased|higher|climbs?|climbing|grows?|growing|jumps?|more)\b/;
const DOWN = /\b(down|falls?|falling|fell|drops?|dropping|dropped|decreases?|decreasing|decreased|lower|declines?|declining|shrinks?|shrinking|less|fewer)\b/;
const SAME = /\b(same|unchanged|no change|not change|stays? put|constant|unaffected|stays? where it is|remains? where it is)\b|n't change\b/;
const NEGATED = /\b(not|never|no)\b|n't\b/;
const PRICE_WORD = /\b(prices?|p|pay|pays|paying|paid)\b/;
const QTY_WORD = /\b(quantity|quantities|q|amount|output|sales|trades?|traded|trading|sold|bought|units?|consumption|production|purchases?)\b/;
// a sentence break is a period followed by a space, so 12.5 stays one number
const CLAUSE = /\s*(?:[,;]|\.\s+|\band\b|\bbut\b|\bwhile\b|\bwhereas\b|\bso\b|\bthen\b|\balthough\b)\s*/;
const VALUE = /(?:\bto|\bat|\bbe|\bof|\bis|=|\baround|\babout|\broughly)\s*[$£€¥₹]?\s*(-?\d+(?:\.\d+)?)/;

/** The direction a clause gives: the first direction word in it, unless it is negated ("doesn't go up" is left alone). */
function dirIn(clause: string): Dir | null {
  if (SAME.test(clause)) return 'same';
  const u = UP.exec(clause);
  const d = DOWN.exec(clause);
  const hit = u && d ? (u.index < d.index ? u : d) : (u ?? d);
  if (!hit) return null;
  if (NEGATED.test(clause.slice(0, hit.index))) return null;
  return hit === u ? 'up' : 'down';
}

/** A prediction in words: "I think the price goes up and the quantity falls", "price up, quantity down because …". */
function readPrediction(text: string): Args | null {
  const low = text.toLowerCase().replace(/[’]/g, "'");
  const cut = /\b(because|since|due to|as a result of|given that)\b/.exec(low);
  const claim = cut ? low.slice(0, cut.index) : low;
  const why = cut ? cleanText(text.slice(cut.index + cut[0].length).replace(/^[\s,:—-]+/, ''), LIM.why) : '';
  let price: Dir | null = null;
  let quantity: Dir | null = null;
  let pv: number | null = null;
  let qv: number | null = null;
  for (const c of claim.split(CLAUSE).map((x) => x.trim()).filter(Boolean)) {
    const isP = PRICE_WORD.test(c);
    const isQ = QTY_WORD.test(c);
    if (isP === isQ) continue;
    const d = dirIn(c);
    const v = VALUE.exec(c);
    if (isP) {
      price ??= d;
      pv ??= v ? Number(v[1]) : null;
    } else {
      quantity ??= d;
      qv ??= v ? Number(v[1]) : null;
    }
  }
  // "price and quantity both rise"
  if (/\bboth\b/.test(claim) && PRICE_WORD.test(claim) && QTY_WORD.test(claim)) {
    const d = dirIn(claim.replace(/^.*?\bboth\b/, ''));
    if (d) {
      price ??= d;
      quantity ??= d;
    }
  }
  if (!price && !quantity && pv === null && qv === null) return null;
  return {
    ...(price ? { price } : {}),
    ...(quantity ? { quantity } : {}),
    ...(pv !== null ? { priceValue: pv } : {}),
    ...(qv !== null ? { quantityValue: qv } : {}),
    ...(why ? { why } : {}),
  };
}

const SIDE_WORD = '(sellers?|producers?|suppliers?|firms?|buyers?|consumers?|customers?|purchasers?)';
const AMOUNT = '[$£€¥₹]?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:dollars?|pounds?|euros?)?';
const POSE_VERB = /\b(put|place|impose|levy|add|introduce|charge|apply|what if|suppose|imagine|try|how about|let'?s (?:try|do|put|add|see))\b/;
const TAX_A = new RegExp(`(?:\\ban?\\s+)?${AMOUNT}\\s*(?:-|\\s)?(?:per[- ]unit\\s+|per[- ]item\\s+|unit\\s+|excise\\s+|specific\\s+)?(tax|subsidy)\\b`);
const TAX_B = new RegExp(`\\b(tax|subsidy)\\s+of\\s+${AMOUNT}`);
const TAX_SIDE = new RegExp(`\\b(?:on|to|for|from|paid by|collected from|levied on|given to)\\s+(?:the\\s+)?${SIDE_WORD}\\b`);
const GIVE = new RegExp(`\\b(?:give|pay|grant|offer)\\s+(?:the\\s+)?${SIDE_WORD}\\s+(?:an?\\s+)?${AMOUNT}\\s*(?:-|\\s)?(?:per[- ]unit\\s+)?subsidy\\b`);
const sideOf = (w: string): Side => (/^(buyer|consumer|customer|purchaser)/.test(w) ? 'buyers' : 'sellers');

/** "put a $2 tax on sellers", "a subsidy of 3 to buyers", "give sellers a $1 subsidy". */
function readPose(low: string): Args | null {
  if (/%|percent/.test(low)) return null; // an ad valorem tax is not what this market computes
  const g = GIVE.exec(low);
  if (g) return Number(g[2]) > 0 ? { subsidy: Number(g[2]), on: sideOf(g[1]) } : null;
  if (!POSE_VERB.test(low)) return null;
  const a = TAX_A.exec(low);
  const b = a ? null : TAX_B.exec(low);
  const kind = a ? a[2] : b?.[1];
  const value = Number(a ? a[1] : b?.[2]);
  if (!kind || !(value > 0)) return null;
  const sd = TAX_SIDE.exec(low);
  const on: Side = sd ? sideOf(sd[1]) : 'sellers';
  return kind === 'tax' ? { tax: value, on } : { subsidy: value, on };
}

const SHIFT_A = /\b(?:shift|move)\s+(?:the\s+)?(demand|supply)(?:\s+curve)?\s+(?:to\s+the\s+)?(right|rightwards?|out|outwards?|left|leftwards?|in|inwards?)\s+by\s+(\d+(?:\.\d+)?)/;
const SHIFT_B = /\b(increase|raise|boost|decrease|reduce|cut|lower)\s+(?:the\s+)?(demand|supply)\s+by\s+(\d+(?:\.\d+)?)/;
const SHIFT_C = /\b(demand|supply)\s+(increases|rises|grows|goes up|decreases|falls|drops|goes down|shifts (?:to the )?right|shifts (?:to the )?left|shifts out|shifts in)\s+by\s+(\d+(?:\.\d+)?)/;

/** "shift demand right by 10", "increase supply by 4", "demand falls by 3". Up and down are left alone: "supply shifts up" is a decrease. */
function readShift(low: string): Args | null {
  let curve: string | undefined;
  let more = true;
  let v = NaN;
  const a = SHIFT_A.exec(low);
  const b = a ? null : SHIFT_B.exec(low);
  const c = a || b ? null : SHIFT_C.exec(low);
  if (a) [curve, more, v] = [a[1], /^(right|out)/.test(a[2]), Number(a[3])];
  else if (b) [curve, more, v] = [b[2], /^(increase|raise|boost)/.test(b[1]), Number(b[3])];
  else if (c) [curve, more, v] = [c[1], /^(increases|rises|grows|goes up|shifts (?:to the )?right|shifts out)/.test(c[2]), Number(c[3])];
  return curve && v > 0 ? { curve, by: more ? v : -v } : null;
}

const CONTROL_SET = /\b(?:set|put|impose|place|add|introduce|establish|apply|what if|try|how about|let'?s (?:try|set|put|add))\b.*?\b(price ceiling|price cap|maximum price|price floor|minimum price|ceiling|cap|floor)\b.*?\b(?:at|of|to)\s+([$£€¥₹])?\s*(\d+(?:\.\d+)?)(?!\d|\.\d)(?!\s*(?:am|pm|:\d))/;
const CONTROL_OFF = /\b(?:remove|drop|lift|scrap|end|abolish|take (?:off|away|down)|get rid of)\b.*?\b(price ceiling|price cap|maximum price|price floor|minimum price|ceiling|cap|floor)\b|\b(?:take|get)\b.*?\b(ceiling|cap|floor)\s+off\b/;
const kindOfControl = (w: string): 'ceiling' | 'floor' => (/floor|minimum/.test(w) ? 'floor' : 'ceiling');

/** "set a price ceiling at 8", "remove the floor". A bare "ceiling" or "floor" counts only beside a price. */
function readControl(low: string, s: MarketState): { op: string; args: Args } | null {
  const m = CONTROL_SET.exec(low);
  if (m) {
    if (!/\bprice|minimum|maximum/.test(m[1]) && !m[2] && !/\bprice\b/.test(low)) return null;
    return { op: kindOfControl(m[1]), args: { p: Number(m[3]) } };
  }
  const off = CONTROL_OFF.exec(low);
  if (off) {
    const kind = kindOfControl(off[1] ?? off[2]);
    // only a control that is there can be taken off
    return s.applied[kind] === null ? null : { op: kind, args: { p: '' } };
  }
  return null;
}

// not "table": that is a chart's word (display-data.ts), and both can be open at once
const VIEW_WORDS: Record<string, string[]> = { graph: ['graph', 'diagram', 'curves', 'picture'], numbers: ['numbers', 'figures', 'readout'] };

/**
 * An operation the words plainly ask for. Conservative by design: this runs
 * on every message while a market is in the workspace. While a scenario
 * waits it reads only a prediction, a reveal, a skip or a view; otherwise a
 * tax or subsidy to predict, a shift, a control, a view — and a question is
 * always the conversation's.
 */
export function readMarketOp(text: string, s: MarketState, _today?: string): { op: string; args: Args } | null {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 300) return null;
  const low = t.toLowerCase().replace(/[’]/g, "'");
  const waiting = awaiting(s);
  if (waiting && REVEAL.test(low)) return { op: 'reveal', args: {} };
  if (NEXT.test(low)) return { op: 'next', args: {} };
  if (/^(what(?! if)|why|how(?! about)|when|where|who|which|whose|is|are|was|were|does|do|did|should|shall|has|have|had)\b/.test(low) || /^(can|could|would|will)\b(?! you\b)/.test(low)) return null;
  const view = readView(t, views, VIEW_WORDS);
  const asView = view && view !== s.view && t.length <= 60 ? { op: 'view', args: { view } } : null;
  if (waiting) {
    const p = readPrediction(t);
    if (p) return { op: 'predict', args: { ...p, by: 'person' } };
    // a tax, a shift or a control while a change waits is the conversation's: the market cannot move now
    return asView;
  }
  const pose = readPose(low);
  if (pose) return { op: 'pose', args: { scenario: -1, ...pose } };
  const sh = readShift(low);
  if (sh) return { op: 'shift', args: sh };
  return readControl(low, s) ?? asView;
}

// ── the kind ─────────────────────────────────────────────────────────

export const MARKET = displayKind<MarketState>({
  kind: 'market',
  label: 'Market',
  sanitize: sanitizeMarket,
  ops: MARKET_OPS,
  readOp: (text, s) => readMarketOp(text, s, todayDay()),
  consequence: (_before, after, step) => {
    // posing says the question; only a reveal says what happened
    if ((step.op === 'pose' || step.op === 'next') && after.pending) return `Posed: “${after.pending.text}” ${QUESTION}`;
    if (step.op === 'reveal' && after.log.length) {
      const e = after.log[after.log.length - 1];
      return `Revealed: ${resultSaid(e.result, after.units)} ${gradeSaid(e, after.units)}`;
    }
    return null;
  },
  facts: (s, { guarded }) => factsOf(s, guarded),
  text: textOf,
  parts: (s): Part[] => [
    { id: 'demand', label: 'Demand' },
    { id: 'supply', label: 'Supply' },
    ...(s.pending ? [{ id: 'scenario', label: 'The posed scenario' }] : []),
  ],
  partFacts: (s, part) => {
    if (part === 'demand' || part === 'supply') {
      const c = s[part];
      return [`${part === 'demand' ? 'Demand' : 'Supply'}: P = ${lineSaid(c)}`, `slope ${fmt(c.slope)}: ${part === 'demand' ? 'buyers want less as the price rises' : 'sellers offer more as the price rises'}`, c.by === 'person' ? 'theirs' : 'from Socria'];
    }
    if (part === 'scenario' && s.pending) {
      return [s.pending.text, s.revealed ? 'revealed' : s.prediction ? 'predicted, not yet revealed — what it does is withheld until then' : 'waiting for their prediction — what it does is withheld until they reveal it'];
    }
    return null;
  },
  views,
  size: (_s, mode) => (mode === 'card' ? { w: 260, h: 150 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 640, h: 480 }),
  shape: (s) =>
    s.pending
      ? `market · ${s.revealed ? 'revealed' : 'waiting for a prediction'}`
      : `market${s.applied.tax ? ' · tax' : s.applied.subsidy ? ' · subsidy' : s.applied.ceiling !== null ? ' · ceiling' : s.applied.floor !== null ? ' · floor' : s.applied.demandShift || s.applied.supplyShift ? ' · shifted' : ''}`,
});

register(MARKET);
registerDisplay({
  kind: 'market',
  noun: 'market',
  handle: 'M',
  about: 'Supply and demand the person can move — taxes, subsidies, shifts, ceilings and floors — predicting what happens before revealing it.',
});
