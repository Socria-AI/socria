// A WORKSHEET — structured practice the person fills in: a balance sheet, a
// journal entry, an income statement.
//
// Release workflow 4: an interactive accounting worksheet. The sheet is the
// person's. They add the lines, name them and enter every amount; the rules
// check what can be checked deterministically —
//
//   balance sheet      total assets (contra-assets subtracted) = liabilities +
//                      equity, to the cent; each line under a heading its
//                      account belongs to; no line without its amount; after a
//                      follow-up transaction, the accounts it changes have
//                      moved by what it says, and nothing else has
//   journal entry      Σ debits = Σ credits; against the transaction, the right
//                      accounts on the right sides with the right amounts
//   income statement   net income = revenue − expenses; each line where it belongs
//
// — and help comes only when asked, one step at a time (hintFor): a nudge, the
// numbers, the specific problem, then a worked explanation of why. Every hint
// is a step in the history, so none is silent. No hint, check or follow-up
// puts an amount on the sheet, and Socria never enters, changes or removes the
// person's lines: it may add blank lines, and change only those. Results
// describe this attempt — nothing here claims the person has mastered anything.
//
// The chart of accounts and the transactions are standard double-entry
// bookkeeping (display-accounts.ts). A label that is not a standard account
// name is the person's own name for it: never an error and never guessed at —
// it is said that it cannot be checked.
//
// PURE.

import { register, type Part, type ViewDecl } from './core';
import {
  cleanBy,
  cleanId,
  cleanText,
  displayKind,
  guardBy,
  guardOwn,
  headOps,
  nextId,
  norm,
  op,
  registerDisplay,
  todayDay,
  type Args,
  type By,
  type DisplayHead,
} from './display-base';
import {
  accountKey,
  accountOf,
  classify,
  classPhrase,
  CLASS_WHY,
  FOLLOW_UPS,
  sideRule,
  TERM_WHY,
  transaction,
  type AccountClass,
  type Classified,
  type Side,
  type Transaction,
} from './display-accounts';

export type WorksheetTemplate = 'balance-sheet' | 'journal-entry' | 'income-statement';
export type WorksheetView = 'sheet' | 'checks';
export type SectionRole = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'debit' | 'credit';
export type Term = 'current' | 'non-current';

export interface WorksheetLine {
  id: string;
  label: string;
  /** what the person entered; null until they do — never filled in for them */
  amount: number | null;
  by: By;
}

export interface WorksheetSection {
  id: string;
  label: string;
  role: SectionRole;
  /** for asset and liability headings: current or non-current, where the heading says */
  term?: Term;
  lines: WorksheetLine[];
}

export interface WorksheetAssist {
  /** how far up the hint ladder the person has asked to go, 0..4 */
  level: number;
  /** hints asked for on this worksheet, in all */
  used: number;
  /** the check the ladder is climbing on — a different first problem starts it again */
  on?: string;
}

export interface WorksheetState extends DisplayHead {
  view: WorksheetView;
  template: WorksheetTemplate;
  sections: WorksheetSection[];
  /** a library transaction: the one to record, or the follow-up posed on a balance sheet */
  scenario?: { key: string; text: string };
  /** account balances when the follow-up was posed — the person's own figures */
  baseline?: Record<string, number>;
  assist: WorksheetAssist;
  /** each time the person asked for a check: which attempt, and how many checks failed */
  attempts: { n: number; failing: number }[];
}

export type CheckKind = 'balance' | 'classification' | 'missing' | 'entry' | 'effect';

export interface WorksheetCheck {
  id: string;
  ok: boolean;
  kind: CheckKind;
  message: string;
  lines: string[];
  /** not a failure, and not a pass either: a line in the person's own words that the rules cannot check */
  unchecked?: true;
}

export const WORKSHEET_LIMITS = { sections: 8, lines: 20, label: 60, section: 40, title: 80, attempts: 20, baseline: 160, amount: 1e10, used: 999 } as const;

const TEMPLATES: WorksheetTemplate[] = ['balance-sheet', 'journal-entry', 'income-statement'];
const VIEWS: WorksheetView[] = ['sheet', 'checks'];
const TERMS: Term[] = ['current', 'non-current'];
const ROLES: Record<WorksheetTemplate, SectionRole[]> = {
  'balance-sheet': ['asset', 'liability', 'equity'],
  'journal-entry': ['debit', 'credit'],
  'income-statement': ['revenue', 'expense'],
};
const ROLE_LABEL: Record<SectionRole, string> = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', revenue: 'Revenue', expense: 'Expenses', debit: 'Debits', credit: 'Credits' };
const NOUN: Record<WorksheetTemplate, string> = { 'balance-sheet': 'balance sheet', 'journal-entry': 'journal entry', 'income-statement': 'income statement' };
const TITLE: Record<WorksheetTemplate, string> = { 'balance-sheet': 'Balance sheet', 'journal-entry': 'Journal entry', 'income-statement': 'Income statement' };

const BLANK: Record<WorksheetTemplate, Omit<WorksheetSection, 'lines'>[]> = {
  'balance-sheet': [
    { id: 'ca', label: 'Current assets', role: 'asset', term: 'current' },
    { id: 'nca', label: 'Non-current assets', role: 'asset', term: 'non-current' },
    { id: 'cl', label: 'Current liabilities', role: 'liability', term: 'current' },
    { id: 'ncl', label: 'Non-current liabilities', role: 'liability', term: 'non-current' },
    { id: 'eq', label: 'Equity', role: 'equity' },
  ],
  'journal-entry': [
    { id: 'dr', label: 'Debits', role: 'debit' },
    { id: 'cr', label: 'Credits', role: 'credit' },
  ],
  'income-statement': [
    { id: 'rev', label: 'Revenue', role: 'revenue' },
    { id: 'exp', label: 'Expenses', role: 'expense' },
  ],
};

// ── amounts: exact to the cent ───────────────────────────────────────

/**
 * An amount a person wrote, to the cent: 1250, "1,250.50", "$800", "(500)"
 * for a negative. Null for anything that is not plainly a number, or past ten
 * billion. Rounded to cents, so it survives a save unchanged.
 */
export function amountOf(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    let t = v.trim();
    let neg = false;
    const paren = /^\((.*)\)$/.exec(t);
    if (paren) {
      neg = true;
      t = paren[1];
    }
    t = t.replace(/[\s,$£€]/g, '').replace(/^[−–]/, '-');
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return null;
    n = Number(t);
    if (neg) n = -Math.abs(n);
  } else return null;
  if (!Number.isFinite(n) || Math.abs(n) > WORKSHEET_LIMITS.amount) return null;
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

const cents = (n: number): number => Math.round(n * 100);

/** "$12,500", "$1,250.50", "−$300" — from cents, the same on every machine (no locale). */
export function sayMoney(c: number): string {
  const v = Math.round(c);
  const a = Math.abs(v);
  const whole = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = a % 100;
  return `${v < 0 ? '−' : ''}$${whole}${frac ? `.${String(frac).padStart(2, '0')}` : ''}`;
}

const sayChange = (c: number): string => (c > 0 ? `+${sayMoney(c)}` : sayMoney(c));

// ── templates ────────────────────────────────────────────────────────

function blank(template: WorksheetTemplate, title?: string, tx?: Transaction | null): WorksheetState {
  return sanitizeWorksheet({
    template,
    title: title ?? TITLE[template],
    sections: BLANK[template].map((s) => ({ ...s, lines: [] })),
    ...(tx ? { scenario: { key: tx.key } } : {}),
  })!;
}

/** A blank balance sheet: current and non-current assets and liabilities, and equity — no lines. The person adds them. */
export const blankBalanceSheet = (title?: string): WorksheetState => blank('balance-sheet', title);

/** A blank income statement: revenue and expenses. */
export const blankIncomeStatement = (title?: string): WorksheetState => blank('income-statement', title);

/** A journal entry to record one library transaction: empty debit and credit sides. Null for a transaction the library does not have. */
export function journalEntry(key: string, title?: string): WorksheetState | null {
  const tx = transaction(key);
  return tx ? blank('journal-entry', title, tx) : null;
}

// ── canonical state ──────────────────────────────────────────────────

function termFromLabel(label: string): Term | undefined {
  const k = norm(label);
  if (/\b(?:non current|noncurrent|long term|fixed)\b/.test(k)) return 'non-current';
  if (/\b(?:current|short term)\b/.test(k)) return 'current';
  return undefined;
}

export function sanitizeWorksheet(raw: unknown): WorksheetState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const template = TEMPLATES.includes(r.template as WorksheetTemplate) ? (r.template as WorksheetTemplate) : null;
  if (!template) return null;
  const roles = ROLES[template];
  const sections: WorksheetSection[] = [];
  const sectionIds = new Set<string>();
  const lineIds = new Set<string>();
  for (const x of Array.isArray(r.sections) ? r.sections : []) {
    if (sections.length >= WORKSHEET_LIMITS.sections) break;
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (!roles.includes(o.role as SectionRole)) continue;
    const role = o.role as SectionRole;
    const label = cleanText(o.label, WORKSHEET_LIMITS.section) || ROLE_LABEL[role];
    let id = cleanId(o.id);
    if (!id || sectionIds.has(id)) id = nextId('s', sectionIds);
    sectionIds.add(id);
    const term = role === 'asset' || role === 'liability' ? (TERMS.includes(o.term as Term) ? (o.term as Term) : termFromLabel(label)) : undefined;
    const lines: WorksheetLine[] = [];
    for (const y of Array.isArray(o.lines) ? o.lines : []) {
      if (lines.length >= WORKSHEET_LIMITS.lines) break;
      if (!y || typeof y !== 'object') continue;
      const l = y as Record<string, unknown>;
      const text = cleanText(l.label, WORKSHEET_LIMITS.label);
      if (!text) continue;
      let lid = cleanId(l.id);
      if (!lid || lineIds.has(lid)) lid = nextId('l', lineIds);
      lineIds.add(lid);
      lines.push({ id: lid, label: text, amount: amountOf(l.amount), by: cleanBy(l.by) });
    }
    sections.push({ id, label, role, ...(term ? { term } : {}), lines });
  }
  // every heading the template needs is there
  for (const role of roles) {
    if (sections.some((sec) => sec.role === role)) continue;
    for (const d of BLANK[template].filter((b) => b.role === role)) {
      if (sections.length >= WORKSHEET_LIMITS.sections) break;
      const id = sectionIds.has(d.id) ? nextId('s', sectionIds) : d.id;
      sectionIds.add(id);
      sections.push({ ...d, id, lines: [] });
    }
  }
  // the scenario is always the library's own words, never a stored copy of them
  const tx = r.scenario && typeof r.scenario === 'object' ? transaction((r.scenario as Record<string, unknown>).key) : null;
  const scenario = tx && template !== 'income-statement' ? { key: tx.key, text: tx.text } : undefined;
  let baseline: Record<string, number> | undefined;
  if (scenario && template === 'balance-sheet' && r.baseline && typeof r.baseline === 'object' && !Array.isArray(r.baseline)) {
    const seen = new Set<string>();
    const pairs: [string, number][] = [];
    for (const [k0, v0] of Object.entries(r.baseline as Record<string, unknown>)) {
      if (pairs.length >= WORKSHEET_LIMITS.baseline) break;
      const k = cleanText(k0, WORKSHEET_LIMITS.label);
      const v = amountOf(v0);
      if (!k || v === null || seen.has(k)) continue;
      seen.add(k);
      pairs.push([k, v]);
    }
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    // fromEntries defines each key as its own property, so no label can reach a prototype
    baseline = Object.fromEntries(pairs);
  }
  const a = (r.assist && typeof r.assist === 'object' ? r.assist : {}) as Record<string, unknown>;
  const level = typeof a.level === 'number' && Number.isInteger(a.level) ? Math.min(4, Math.max(0, a.level)) : 0;
  const used = typeof a.used === 'number' && Number.isInteger(a.used) ? Math.min(WORKSHEET_LIMITS.used, Math.max(0, a.used)) : 0;
  const on = level > 0 && typeof a.on === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(a.on) ? a.on : undefined;
  const attempts: { n: number; failing: number }[] = [];
  for (const x of Array.isArray(r.attempts) ? r.attempts.slice(-200) : []) {
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
    const n = o?.n;
    const f = o?.failing;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 1e6 && typeof f === 'number' && Number.isInteger(f) && f >= 0 && f <= 999) {
      attempts.push({ n, failing: f });
    }
  }
  return {
    title: cleanText(r.title, WORKSHEET_LIMITS.title) || TITLE[template],
    view: VIEWS.includes(r.view as WorksheetView) ? (r.view as WorksheetView) : 'sheet',
    template,
    sections,
    ...(scenario ? { scenario } : {}),
    ...(baseline ? { baseline } : {}),
    assist: { level, used, ...(on ? { on } : {}) },
    attempts: attempts.slice(-WORKSHEET_LIMITS.attempts),
  };
}

// ── what is computed ─────────────────────────────────────────────────

const allLines = (s: WorksheetState): WorksheetLine[] => s.sections.flatMap((sec) => sec.lines);
const lineOf = (s: WorksheetState, id: unknown): WorksheetLine | null => allLines(s).find((l) => l.id === id) ?? null;
const sectionOf = (s: WorksheetState, id: unknown): WorksheetSection | null => s.sections.find((sec) => sec.id === id) ?? null;
const sectionOfLine = (s: WorksheetState, id: unknown): WorksheetSection | null => s.sections.find((sec) => sec.lines.some((l) => l.id === id)) ?? null;
const linesOfRole = (s: WorksheetState, role: SectionRole): WorksheetLine[] => s.sections.filter((sec) => sec.role === role).flatMap((sec) => sec.lines);
const isEquity = (c: AccountClass): boolean => c === 'equity' || c === 'contra-equity';
const lower1 = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A contra account under its parent's heading counts against it, however its amount was signed. */
function contraHere(c: Classified | null, role: SectionRole): boolean {
  return !!c && ((c.class === 'contra-asset' && role === 'asset') || (c.class === 'contra-equity' && role === 'equity'));
}

/** What a line adds to its heading's total, in cents. */
function lineValue(l: WorksheetLine, sec: WorksheetSection): number {
  if (l.amount === null) return 0;
  const v = cents(l.amount);
  return contraHere(classify(l.label), sec.role) ? -Math.abs(v) : v;
}

export interface WorksheetTotals {
  assets: number;
  liabilities: number;
  equity: number;
  debits: number;
  credits: number;
  revenue: number;
  expenses: number;
}

/** The sheet's totals in cents, so equality is exact: lines without amounts count as nothing, contra lines are subtracted. */
export function totalsOf(s: WorksheetState): WorksheetTotals {
  const t: WorksheetTotals = { assets: 0, liabilities: 0, equity: 0, debits: 0, credits: 0, revenue: 0, expenses: 0 };
  const into: Record<SectionRole, keyof WorksheetTotals> = { asset: 'assets', liability: 'liabilities', equity: 'equity', debit: 'debits', credit: 'credits', revenue: 'revenue', expense: 'expenses' };
  for (const sec of s.sections) for (const l of sec.lines) t[into[sec.role]] += lineValue(l, sec);
  return t;
}

/**
 * Each account's balance on a balance sheet, in cents: a standard account by
 * its standard name (so "Bank" and "Cash" are one account), any other line by
 * its own label. A contra account's balance is its size, however it was signed.
 */
export function balancesOf(s: WorksheetState): Map<string, number> {
  const out = new Map<string, number>();
  for (const sec of s.sections) {
    if (sec.role !== 'asset' && sec.role !== 'liability' && sec.role !== 'equity') continue;
    for (const l of sec.lines) {
      if (l.amount === null) continue;
      const c = classify(l.label);
      const key = c?.name ?? l.label;
      const v = c && (c.class === 'contra-asset' || c.class === 'contra-equity') ? Math.abs(cents(l.amount)) : cents(l.amount);
      out.set(key, (out.get(key) ?? 0) + v);
    }
  }
  return out;
}

/** The balances as a baseline is kept: dollars, keys in order. */
export function baselineOf(s: WorksheetState): Record<string, number> {
  const pairs = [...balancesOf(s)].map(([k, v]): [string, number] => [k, v / 100]);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return Object.fromEntries(pairs);
}

/** Which side of the balance sheet a heading or an account counts on. */
const sideOfRole = (role: SectionRole): string => (role === 'asset' ? 'assets' : 'liabilities and equity');
const sideOfClass = (c: AccountClass): string => (c === 'asset' || c === 'contra-asset' ? 'assets' : 'liabilities and equity');

function fits(c: Classified, sec: WorksheetSection): boolean {
  switch (sec.role) {
    case 'asset':
      if (c.class !== 'asset' && c.class !== 'contra-asset') return false;
      break;
    case 'liability':
      if (c.class !== 'liability') return false;
      break;
    case 'equity':
      return isEquity(c.class);
    case 'revenue':
      return c.class === 'revenue';
    case 'expense':
      return c.class === 'expense';
    default:
      // a journal entry's sides are sides, not classes: any account can be debited or credited
      return true;
  }
  return !(sec.term && c.current !== undefined && (sec.term === 'current') !== c.current);
}

function misplacement(s: WorksheetState, c: Classified, l: WorksheetLine, sec: WorksheetSection): string | null {
  if (fits(c, sec)) return null;
  let msg = `‘${l.label}’ is ${classPhrase(c)} under the standard classification, but it sits under ${sec.label.toLowerCase()}.`;
  if (s.template === 'balance-sheet' && (c.class === 'revenue' || c.class === 'expense')) msg += ' It belongs on the income statement; on a balance sheet it shows only through equity.';
  if (s.template === 'income-statement' && c.class !== 'revenue' && c.class !== 'expense') msg += ' It belongs on the balance sheet, not the income statement.';
  return msg;
}

function classificationChecks(s: WorksheetState): WorksheetCheck[] {
  const out: WorksheetCheck[] = [];
  for (const sec of s.sections) {
    for (const l of sec.lines) {
      const c = classify(l.label);
      if (!c) {
        out.push({
          id: `class-${l.id}`,
          ok: true,
          unchecked: true,
          kind: 'classification',
          message: `‘${l.label}’ is your own name, not a standard account name, so ${s.template === 'journal-entry' ? 'it cannot be checked against the transaction' : 'where it sits cannot be checked'}.`,
          lines: [l.id],
        });
        continue;
      }
      const wrong = misplacement(s, c, l, sec);
      if (wrong) out.push({ id: `class-${l.id}`, ok: false, kind: 'classification', message: wrong, lines: [l.id] });
    }
  }
  return out;
}

function missingChecks(s: WorksheetState): WorksheetCheck[] {
  return allLines(s)
    .filter((l) => l.amount === null)
    .map((l) => ({ id: `missing-${l.id}`, ok: false, kind: 'missing' as const, message: `‘${l.label}’ has no amount yet.`, lines: [l.id] }));
}

const slug = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'x';

interface EffectItem {
  /** the standard account, or null for equity taken as a whole */
  account: string | null;
  c: Classified | null;
  want: number;
  got: number;
  /** the person's label for it on the sheet, if it has a line */
  label: string | null;
}

/** For a posed follow-up: what each change the transaction makes should be, against what the sheet shows since it was posed. */
function effectItems(s: WorksheetState, tx: Transaction): { items: EffectItem[]; covered: Set<string>; delta: (k: string) => number; keys: string[]; equityGot: number } {
  const now = balancesOf(s);
  const base = new Map(Object.entries(s.baseline ?? {}).map(([k, v]): [string, number] => [k, cents(v)]));
  const delta = (k: string) => (now.get(k) ?? 0) - (base.get(k) ?? 0);
  const keys = [...new Set([...base.keys(), ...now.keys()])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const labelFor = (names: string[]) => {
    for (const l of allLines(s)) {
      const c = classify(l.label);
      if (c && names.includes(c.name)) return l.label;
    }
    return null;
  };
  const covered = new Set<string>();
  const items: EffectItem[] = [];
  let equityWant = 0;
  for (const e of tx.effect) {
    const c = classify(e.account);
    if (!c) continue;
    if (isEquity(c.class)) {
      equityWant += (c.class === 'equity' ? 1 : -1) * cents(e.change);
      continue;
    }
    const names = [e.account, ...(e.also ?? [])];
    for (const n of names) covered.add(n);
    items.push({ account: e.account, c, want: cents(e.change), got: names.reduce((t, n) => t + delta(n), 0), label: labelFor(names) });
  }
  // equity is taken as a whole: where in it a change shows depends on the business form
  let equityGot = 0;
  for (const k of keys) {
    const c = classify(k);
    if (c && isEquity(c.class)) equityGot += (c.class === 'equity' ? 1 : -1) * delta(k);
  }
  if (equityWant !== 0) items.push({ account: null, c: null, want: equityWant, got: equityGot, label: null });
  return { items, covered, delta, keys, equityGot };
}

function effectChecks(s: WorksheetState): WorksheetCheck[] {
  if (s.template !== 'balance-sheet' || !s.scenario || !s.baseline) return [];
  const tx = transaction(s.scenario.key);
  if (!tx) return [];
  const { items, covered, delta, keys, equityGot } = effectItems(s, tx);
  const wrong = items.filter((i) => i.got !== i.want).length;
  const out: WorksheetCheck[] = [
    {
      id: 'effect',
      ok: wrong === 0,
      kind: 'effect',
      message: !wrong
        ? 'The sheet shows this transaction: every account it changes has moved by what it says.'
        : wrong === items.length
          ? 'The sheet does not show this transaction yet: none of the changes it makes is there.'
          : `The sheet does not fully show this transaction: ${wrong} of the ${items.length} changes it makes ${wrong === 1 ? 'is' : 'are'} not right yet.`,
      lines: [],
    },
  ];
  const linesFor = (names: (k: string) => boolean) => allLines(s).filter((l) => names(classify(l.label)?.name ?? l.label));
  if (!items.some((i) => i.account === null) && equityGot !== 0) {
    out.push({
      id: 'effect-equity',
      ok: false,
      kind: 'effect',
      message: `Equity has changed by ${sayChange(equityGot)} since the transaction was posed, but this transaction does not change equity.`,
      lines: linesFor((k) => !!classify(k) && isEquity(classify(k)!.class)).map((l) => l.id),
    });
  }
  const ids = new Set(out.map((c) => c.id));
  for (const k of keys) {
    if (covered.has(k)) continue;
    const c = classify(k);
    if (c && isEquity(c.class)) continue;
    const d = delta(k);
    if (d === 0) continue;
    const lines = linesFor((x) => x === k);
    const label = lines[0]?.label ?? k;
    let id = `effect-${slug(k)}`;
    for (let i = 2; ids.has(id); i++) id = `effect-${slug(k).slice(0, 28)}-${i}`;
    ids.add(id);
    out.push({
      id,
      ok: false,
      kind: 'effect',
      message: c
        ? `‘${label}’ has changed by ${sayChange(d)} since the transaction was posed, but this transaction does not change it.`
        : `‘${label}’ has changed by ${sayChange(d)} since the transaction was posed. It is your own name, not a standard account, so the change cannot be checked against the transaction.`,
      lines: lines.map((l) => l.id),
    });
  }
  return out;
}

function entryChecks(s: WorksheetState): WorksheetCheck[] {
  const out: WorksheetCheck[] = [];
  for (const l of allLines(s)) {
    if (l.amount !== null && l.amount < 0) {
      out.push({ id: `entry-sign-${l.id}`, ok: false, kind: 'entry', message: `‘${l.label}’ has a negative amount: amounts in a journal entry are positive, and the side shows which way the account moves.`, lines: [l.id] });
    }
  }
  const tx = s.scenario ? transaction(s.scenario.key) : null;
  if (!tx) return out;
  // the expected line each of the person's accounts answers to, through standard names and accepted alternatives
  const slotOf = (name: string): string | null => tx.entry.find((e) => e.account === name || e.also?.includes(name))?.account ?? null;
  const want = new Map<string, number>();
  for (const e of tx.entry) want.set(`${e.account}|${e.side}`, (want.get(`${e.account}|${e.side}`) ?? 0) + cents(e.amount));
  const have = new Map<string, number>();
  const rows: { l: WorksheetLine; side: Side; slot: string | null }[] = [];
  for (const sec of s.sections) {
    const side: Side | null = sec.role === 'debit' ? 'debit' : sec.role === 'credit' ? 'credit' : null;
    if (!side) continue;
    for (const l of sec.lines) {
      const c = classify(l.label);
      if (!c) continue;
      const slot = slotOf(c.name);
      rows.push({ l, side, slot });
      if (slot && l.amount !== null) have.set(`${slot}|${side}`, (have.get(`${slot}|${side}`) ?? 0) + cents(l.amount));
    }
  }
  for (const { l, side, slot } of rows) {
    if (!slot) {
      out.push({ id: `entry-${l.id}`, ok: false, kind: 'entry', message: `This transaction does not change ‘${l.label}’.`, lines: [l.id] });
      continue;
    }
    const key = `${slot}|${side}`;
    if (!want.has(key)) {
      out.push({ id: `entry-${l.id}`, ok: false, kind: 'entry', message: `‘${l.label}’ is on the ${side} side — which way does this transaction move it?`, lines: [l.id] });
      continue;
    }
    if (l.amount === null) continue; // the missing check says so
    const ok = have.get(key) === want.get(key);
    out.push({
      id: `entry-${l.id}`,
      ok,
      kind: 'entry',
      message: ok ? `‘${l.label}’ matches the transaction: the account, the side and the amount.` : `‘${l.label}’ is the right account on the right side, but the amount does not match the transaction.`,
      lines: [l.id],
    });
  }
  const present = new Set(rows.map((r) => r.slot).filter(Boolean) as string[]);
  const absent = [...new Set(tx.entry.map((e) => e.account))].filter((a) => !present.has(a));
  if (absent.length) {
    out.push({
      id: 'entry-missing',
      ok: false,
      kind: 'entry',
      message: `${absent.length === 1 ? 'An account' : `${absent.length} accounts`} this transaction changes ${absent.length === 1 ? 'is' : 'are'} not in the entry yet.`,
      lines: [],
    });
  }
  return out;
}

/**
 * Everything the rules can check on the sheet as it stands, in the order a
 * person would put them right: the totals first, then what sits under the
 * wrong heading, then what is missing, then the transaction. A line in the
 * person's own words is reported as unchecked — not an error.
 */
export function checkWorksheet(s: WorksheetState): WorksheetCheck[] {
  if (!allLines(s).length) return [{ id: 'empty', ok: false, kind: 'missing', message: `Nothing is on the ${NOUN[s.template]} yet.`, lines: [] }];
  const t = totalsOf(s);
  if (s.template === 'balance-sheet') {
    const le = t.liabilities + t.equity;
    return [
      {
        id: 'balance',
        ok: t.assets === le,
        kind: 'balance',
        message:
          t.assets === le
            ? `Total assets of ${sayMoney(t.assets)} equal total liabilities and equity of ${sayMoney(le)}.`
            : `Total assets are ${sayMoney(t.assets)}; total liabilities and equity are ${sayMoney(le)}. The two should be equal.`,
        lines: [],
      },
      ...classificationChecks(s),
      ...missingChecks(s),
      ...effectChecks(s),
    ];
  }
  if (s.template === 'journal-entry') {
    const dr = linesOfRole(s, 'debit').length;
    const cr = linesOfRole(s, 'credit').length;
    const ok = dr > 0 && cr > 0 && t.debits === t.credits && t.debits > 0;
    const message = !dr || !cr
      ? `The ${dr ? 'credit' : 'debit'} side has no lines yet: every entry has at least one debit and one credit.`
      : ok
        ? `Debits and credits both total ${sayMoney(t.debits)}.`
        : `Debits total ${sayMoney(t.debits)}; credits total ${sayMoney(t.credits)}. The two should be equal.`;
    return [{ id: 'balance', ok, kind: 'balance', message, lines: [] }, ...classificationChecks(s), ...missingChecks(s), ...entryChecks(s)];
  }
  const net = t.revenue - t.expenses;
  return [
    {
      id: 'net',
      ok: true,
      kind: 'balance',
      message: `Revenue of ${sayMoney(t.revenue)} less expenses of ${sayMoney(t.expenses)} gives ${net >= 0 ? 'net income' : 'a net loss'} of ${sayMoney(Math.abs(net))}.`,
      lines: [],
    },
    ...classificationChecks(s),
    ...missingChecks(s),
  ];
}

const firstFailing = (s: WorksheetState): WorksheetCheck | null => checkWorksheet(s).find((c) => !c.ok) ?? null;

/**
 * The follow-up `next` would pose: the named library transaction, or the one
 * after the current in the follow-up order — skipping any that would take an
 * account below what the sheet holds (no paying a supplier the sheet does not
 * owe). Depends on the state alone.
 */
export function followUpFor(s: WorksheetState, key?: unknown): Transaction | null {
  if (s.template !== 'balance-sheet') return null;
  const bal = balancesOf(s);
  const ok = (tx: Transaction): boolean => {
    for (const e of tx.effect) {
      if (e.change >= 0) continue;
      const c = classify(e.account);
      if (!c || isEquity(c.class)) continue;
      const held = [e.account, ...(e.also ?? [])].reduce((t, n) => t + (bal.get(n) ?? 0), 0);
      if (held < cents(-e.change)) return false;
    }
    return !tx.requires || tx.requires.some((n) => (bal.get(n) ?? 0) > 0);
  };
  if (key !== undefined && key !== '') {
    const tx = transaction(key);
    return tx && FOLLOW_UPS.includes(tx.key) && tx.key !== s.scenario?.key && ok(tx) ? tx : null;
  }
  const start = s.scenario ? FOLLOW_UPS.indexOf(s.scenario.key) + 1 : 0;
  for (let i = 0; i < FOLLOW_UPS.length; i++) {
    const k = FOLLOW_UPS[(start + i) % FOLLOW_UPS.length];
    if (k === s.scenario?.key) continue;
    const tx = transaction(k);
    if (tx && ok(tx)) return tx;
  }
  return null;
}

// ── the hint ladder ──────────────────────────────────────────────────
//
// Built from the FIRST failing check. 1: a general nudge. 2: the numbers —
// the person's own. 3: the specific problem. 4: a worked explanation of why,
// with their numbers: what to move or correct, and why. None of them puts an
// amount on the sheet, and none states a figure the person has not entered —
// a total they have not reached, a balance a transaction leads to. Those are
// theirs to work out.

/** Where an account would go on this sheet: the heading(s) that fit it. */
function targetFor(s: WorksheetState, c: Classified): string {
  const fit = s.sections.filter((sec) => fits(c, sec)).map((sec) => sec.label.toLowerCase());
  if (fit.length === 1) return fit[0];
  if (fit.length > 1) return `${fit.slice(0, -1).join(', ')} or ${fit[fit.length - 1]}${c.current === undefined ? ', depending on when it is due' : ''}`;
  return `a heading for ${classPhrase(c).replace(/ \(.*\)$/, '')}`;
}

/** Why a misplaced line belongs elsewhere, and where — the worked explanation for a classification problem. */
function misplacedWhy(s: WorksheetState, l: WorksheetLine, c: Classified, sec: WorksheetSection): string {
  const acct = accountOf(l.label);
  const out = [CLASS_WHY[c.class]];
  if ((c.class === 'asset' || c.class === 'liability') && c.current !== undefined) out.push(TERM_WHY[c.class][c.current ? 'current' : 'non-current']);
  out.push(`‘${l.label}’ is ${acct?.about ?? 'a standard account'} — ${classPhrase(c).replace(/ \(.*\)$/, '')}.`);
  if (s.template === 'balance-sheet' && (c.class === 'revenue' || c.class === 'expense')) {
    out.push('It belongs on the income statement: take it off the balance sheet, and let its effect show in equity.');
  } else if (s.template === 'income-statement' && c.class !== 'revenue' && c.class !== 'expense') {
    out.push(
      c.class === 'contra-equity'
        ? 'Take it off the income statement: what the owner takes out is not a cost of earning revenue, so it reduces equity directly.'
        : 'Take it off the income statement: it is a balance on the balance sheet, not part of the period’s earnings.'
    );
  } else {
    const across = s.template === 'balance-sheet' && sideOfRole(sec.role) !== sideOfClass(c.class) && l.amount !== null;
    out.push(
      `Move it to ${targetFor(s, c)}.${across ? ` Under ${sec.label.toLowerCase()} its ${sayMoney(Math.abs(cents(l.amount!)))} counts on the ${sideOfRole(sec.role)} side; where it belongs, it counts on the ${sideOfClass(c.class)} side.` : ''} Then check again.`
    );
  }
  return out.join(' ');
}

const NINE = (g: number) => `The gap, ${sayMoney(g)}, divides evenly by 9 — that often means two digits were swapped in one amount (54 written as 45, say).`;

/** What most likely opened the gap on a balance sheet, from the person's own lines. */
function gapClue(s: WorksheetState, checks: WorksheetCheck[], gap: number): { text: string; why: string } {
  const g = Math.abs(gap);
  // a follow-up is posed only on a sheet that balanced, so a gap now came from recording it
  const tx = s.scenario && s.baseline ? transaction(s.scenario.key) : null;
  const clue = tx && effectClue(s, tx);
  if (tx && clue) return { text: clue, why: effectWhy(tx) };
  // a line on the wrong side of the sheet counts twice in the gap
  for (const chk of checks) {
    if (chk.ok || chk.kind !== 'classification') continue;
    const l = lineOf(s, chk.lines[0]);
    const sec = l && sectionOfLine(s, l.id);
    const c = l && classify(l.label);
    if (!l || !sec || !c || sideOfRole(sec.role) === sideOfClass(c.class)) continue;
    return { text: chk.message, why: misplacedWhy(s, l, c, sec) };
  }
  const miss = checks.find((c) => !c.ok && c.kind === 'missing');
  if (miss) {
    const l = lineOf(s, miss.lines[0]);
    return {
      text: `‘${l?.label}’ has no amount yet, so the totals leave it out.`,
      why: `Every line needs its amount before the two totals can be compared: ‘${l?.label}’ has none, so it counts as nothing. Enter its balance from your figures — Socria does not fill amounts in — then check again.`,
    };
  }
  const bigger = s.sections.filter((sec) => (gap > 0 ? sec.role === 'asset' : sec.role !== 'asset'));
  const lines = bigger.flatMap((sec) => sec.lines.map((l) => ({ l, v: Math.abs(lineValue(l, sec)) }))).filter((x) => x.v > 0);
  const side = gap > 0 ? 'assets' : 'liabilities and equity';
  const twin = lines.find((x) => x.v === g);
  if (twin) {
    return {
      text: `The gap equals ‘${twin.l.label}’ — is it counted twice, or in the wrong place?`,
      why: `The gap is exactly the amount of ‘${twin.l.label}’: look for it entered twice, or on a side where it does not belong, and check it against your figures.`,
    };
  }
  const half = lines.find((x) => 2 * x.v === g);
  if (half) {
    return {
      text: `The gap is exactly twice ‘${half.l.label}’ — is it on the right side of the sheet?`,
      why: `A line on the wrong side counts twice in the gap — once missing from its own side, once extra on the other — and the gap is exactly twice ‘${half.l.label}’. Decide which side it belongs on, move it there, and check again.`,
    };
  }
  if (g % 900 === 0) {
    return { text: NINE(g), why: `Swapping two digits in one amount changes it by a multiple of 9. Go through your amounts against your figures, digit by digit, starting on the ${side} side.` };
  }
  return {
    text: `The ${side} side is larger by ${sayMoney(g)}. Look there for an amount that is too large — or on the other side for one that is too small or left out.`,
    why: 'Go through each amount against your figures until the two totals agree; then the equation holds.',
  };
}

function emptyHint(s: WorksheetState, L: number): string {
  const tx = s.scenario ? transaction(s.scenario.key) : null;
  if (s.template === 'journal-entry') {
    return [
      'Which accounts does this transaction change? Start with what the business receives or gives up.',
      'A journal entry needs at least one debit and one credit, and the two sides must total the same.',
      `Ask of each account whether it goes up or down, and whether it is an asset, a liability, equity, revenue or an expense — that decides its side.${tx ? ` ${tx.ask}` : ''}`,
      'Debits record increases in assets, expenses and drawings, and decreases in liabilities, equity and revenue; credits record the opposite. Find the accounts this transaction changes, decide for each whether it rises or falls, and that gives its side. The amounts come from the transaction: add each account as a line under its side and enter them.',
    ][L - 1];
  }
  if (s.template === 'income-statement') {
    return [
      'List what the business earned in the period (revenue) and what it cost to earn it (expenses).',
      'The statement has two sections and no lines yet; each line is one account and its total for the period.',
      'Revenue accounts (service revenue, sales) go under revenue; costs used up in the period (rent, wages, utilities) go under expenses.',
      'An income statement covers a period: net income is revenue minus expenses. Balances on a day — cash, equipment, loans, the owner’s capital — belong on the balance sheet, and what the owner takes out is not an expense. Add each of your accounts under its heading with its amount; Socria does not fill amounts in.',
    ][L - 1];
  }
  return [
    'Start with what the business owns — its assets — and list each one with its amount.',
    'The sheet has five headings and no lines yet. Each line is one account and its balance on the day of the sheet.',
    'A balance sheet lists assets (what the business owns), liabilities (what it owes) and equity (the owner’s claim). Put each of your accounts under the heading it belongs to.',
    'A balance sheet is the accounting equation laid out: Assets = Liabilities + Equity. Everything the business has was paid for by borrowing (liabilities) or by its owner (equity), so the two sides come to the same total. Add each account as a line under its heading, with its amount from your figures — Socria does not fill amounts in.',
  ][L - 1];
}

function classificationHint(s: WorksheetState, f: WorksheetCheck, checks: WorksheetCheck[], L: number): string {
  const fails = checks.filter((c) => !c.ok && c.kind === 'classification').length;
  const total = allLines(s).length;
  const l = lineOf(s, f.lines[0]);
  const sec = l && sectionOfLine(s, l.id);
  const c = l && classify(l.label);
  if (L === 1) {
    return s.template === 'income-statement'
      ? 'One of your lines may not belong where it is — or on an income statement at all.'
      : 'One of your lines may be under the wrong heading — read each line against the heading it sits under.';
  }
  if (L === 2) {
    const balanced = s.template === 'balance-sheet' && checks.some((x) => x.id === 'balance' && x.ok);
    return `${fails} of your ${plural(total, 'line')} ${fails === 1 ? 'sits under a heading its account does' : 'sit under headings their accounts do'} not belong to.${balanced ? ' The totals still agree, so the problem is where it sits, not the amounts.' : ''}`;
  }
  if (L === 3 || !l || !sec || !c) return f.message;
  return misplacedWhy(s, l, c, sec);
}

const MISSING_WHY: Record<WorksheetTemplate, string> = {
  'balance-sheet': 'A balance sheet shows every account’s balance on one day, and the two sides can only be compared when each line has its amount.',
  'journal-entry': 'A journal entry records the amount each account moves; a line without one records nothing, and the two sides cannot be compared.',
  'income-statement': 'An income statement totals the period’s revenue and expenses; a line without an amount is left out of net income.',
};

function missingHint(s: WorksheetState, f: WorksheetCheck, checks: WorksheetCheck[], L: number): string {
  const miss = checks.filter((c) => !c.ok && c.kind === 'missing').length;
  const label = lineOf(s, f.lines[0])?.label ?? 'A line';
  const from = s.template === 'journal-entry' ? 'the transaction' : 'your figures';
  if (L === 1) return 'Some lines have no amount yet.';
  if (L === 2) return `${miss} of your ${plural(allLines(s).length, 'line')} ${miss === 1 ? 'has' : 'have'} no amount, so the totals leave ${miss === 1 ? 'it' : 'them'} out.`;
  if (L === 3) return `‘${label}’ has no amount yet — enter its amount from ${from}, or remove the line if it does not apply.`;
  return `${MISSING_WHY[s.template]} ‘${label}’ has none, so it counts as nothing. The amounts come from ${from}: Socria does not fill them in.`;
}

function sheetBalanceHint(s: WorksheetState, checks: WorksheetCheck[], L: number): string {
  const t = totalsOf(s);
  const le = t.liabilities + t.equity;
  const gap = t.assets - le;
  if (L === 1) return 'Your two sides do not match — compare the totals.';
  if (L === 2) return `Assets total ${sayMoney(t.assets)}; liabilities plus equity total ${sayMoney(le)} (liabilities ${sayMoney(t.liabilities)}, equity ${sayMoney(t.equity)}) — a gap of ${sayMoney(Math.abs(gap))}.`;
  const clue = gapClue(s, checks, gap);
  if (L === 3) return clue.text;
  return `The balance sheet rests on the accounting equation: Assets = Liabilities + Equity. Everything the business owns (your assets: ${sayMoney(t.assets)}) was paid for either by what it owes (liabilities: ${sayMoney(t.liabilities)}) or by what its owner put in and kept (equity: ${sayMoney(t.equity)}). On your sheet ${sayMoney(t.assets)} and ${sayMoney(t.liabilities)} + ${sayMoney(t.equity)} = ${sayMoney(le)} are ${sayMoney(Math.abs(gap))} apart, so an amount is on the wrong side, missing or mis-entered. ${clue.why}`;
}

/** "‘Cash’ rises by $5,000 and ‘Bank loan’ rises by $5,000" — the transaction's own figures. */
function effectList(tx: Transaction): string {
  const parts = tx.effect.map((e) => `‘${e.account}’ ${e.change > 0 ? 'rises' : 'falls'} by ${sayMoney(Math.abs(cents(e.change)))}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts.join('');
}

function effectHint(s: WorksheetState, f: WorksheetCheck, L: number): string {
  const tx = s.scenario ? transaction(s.scenario.key) : null;
  if (!tx) return f.message;
  const { delta, keys } = effectItems(s, tx);
  if (L === 1) {
    return f.id === 'effect'
      ? 'Think through what this transaction gives the business, and what it costs or leaves it owing — each of those shows up on the sheet.'
      : 'Something on the sheet has changed that this transaction does not touch.';
  }
  if (L === 2) {
    let dA = 0;
    let dLE = 0;
    for (const k of keys) {
      const c = classify(k);
      if (!c) continue;
      if (c.class === 'asset') dA += delta(k);
      else if (c.class === 'contra-asset') dA -= delta(k);
      else if (c.class === 'liability' || c.class === 'equity') dLE += delta(k);
      else if (c.class === 'contra-equity') dLE -= delta(k);
    }
    return `Since the transaction was posed, your assets have changed by ${sayChange(dA)} and your liabilities plus equity by ${sayChange(dLE)}.`;
  }
  if (L === 3) return (f.id === 'effect' && effectClue(s, tx)) || f.message;
  return effectWhy(tx);
}

/** The first change a posed transaction makes that the sheet does not show yet — named, as a question. Null when every change is there. */
function effectClue(s: WorksheetState, tx: Transaction): string | null {
  const w = effectItems(s, tx).items.find((i) => i.got !== i.want);
  if (!w) return null;
  if (w.account === null) {
    return w.got === 0
      ? 'Equity has not changed since the transaction was posed — does this transaction change what the owner has in the business?'
      : `Equity has changed by ${sayChange(w.got)} since the transaction was posed — check that against the transaction.`;
  }
  if (!w.label) return `This transaction changes ${classPhrase(w.c!).replace(/ \(.*\)$/, '')} that has no line on your sheet yet.`;
  return w.got === 0
    ? `‘${w.label}’ has not changed since the transaction was posed — does this transaction move it?`
    : `‘${w.label}’ has changed by ${sayChange(w.got)} since the transaction was posed — check that against the transaction.`;
}

/** Why a transaction moves the sheet as it does — with its own figures, never the balances it leads to. */
function effectWhy(tx: Transaction): string {
  return `Every transaction keeps Assets = Liabilities + Equity true by changing at least two things. ${tx.explain} So ${effectList(tx)}. Compare each with its line on your sheet, and change only what the transaction changes.`;
}

function journalBalanceHint(s: WorksheetState, checks: WorksheetCheck[], L: number): string {
  const t = totalsOf(s);
  const diff = t.debits - t.credits;
  const tx = s.scenario ? transaction(s.scenario.key) : null;
  const dr = linesOfRole(s, 'debit');
  const cr = linesOfRole(s, 'credit');
  const empty = !dr.length ? 'debit' : !cr.length ? 'credit' : null;
  if (L === 1) return 'Debits and credits must be equal — compare the two sides.';
  if (L === 2) {
    return empty
      ? `Your ${empty === 'debit' ? 'credits' : 'debits'} total ${sayMoney(empty === 'debit' ? t.credits : t.debits)}, and the ${empty} side has nothing on it yet.`
      : `Your debits total ${sayMoney(t.debits)} and your credits ${sayMoney(t.credits)} — a difference of ${sayMoney(Math.abs(diff))}.`;
  }
  if (L === 3) {
    if (empty) return `Every entry has at least one debit and one credit, and the ${empty} side is still empty.${tx ? ` ${tx.ask}` : ''}`;
    const miss = checks.find((c) => !c.ok && c.kind === 'missing');
    if (miss) return `‘${lineOf(s, miss.lines[0])?.label}’ has no amount yet, so its side comes up short.`;
    const twin = (diff > 0 ? dr : cr).find((l) => l.amount !== null && Math.abs(cents(l.amount)) === Math.abs(diff));
    if (twin) return `The difference equals ‘${twin.label}’ — is it entered twice?`;
    if (diff !== 0 && Math.abs(diff) % 900 === 0) return NINE(Math.abs(diff)).replace('The gap', 'The difference');
    return `Check each amount against ${tx ? 'the transaction' : 'your figures'}: one side is short or over.`;
  }
  return `Double entry records every transaction twice, once on each side, for the same total: what the business receives or uses (debits) came from somewhere (credits).${tx ? ` ${tx.explain}` : ''} Both sides should total the amount the transaction moves: find the side that is short or over, and correct it from ${tx ? 'the transaction' : 'your figures'}.`;
}

function entryHint(s: WorksheetState, f: WorksheetCheck, checks: WorksheetCheck[], L: number): string {
  const tx = s.scenario ? transaction(s.scenario.key) : null;
  const sign = f.id.startsWith('entry-sign-');
  if (sign || !tx) {
    return L === 1 ? 'Look at the signs of your amounts.' : 'Amounts in a journal entry are written as positive numbers: the side shows which way the account moves.';
  }
  const lineChecks = checks.filter((c) => c.kind === 'entry' && c.id !== 'entry-missing' && !c.id.startsWith('entry-sign-'));
  const right = lineChecks.filter((c) => c.ok).length;
  const total = allLines(s).length;
  const absent = checks.find((c) => c.id === 'entry-missing');
  if (L === 1) return 'Look again at which accounts this transaction changes, and which way each one moves.';
  if (L === 2) return `${right} of your ${plural(total, 'line')} ${right === 1 ? 'matches' : 'match'} the transaction${absent ? `; ${lower1(absent.message)}` : '.'}`;
  const l = lineOf(s, f.lines[0]);
  const c = l ? classify(l.label) : null;
  if (L === 3) {
    if (f.id === 'entry-missing' || /^This transaction does not change/.test(f.message)) return `${f.message} ${tx.ask}`;
    if (l && c && /which way does this transaction move it/.test(f.message)) {
      return `‘${l.label}’ is ${classPhrase(c).replace(/ \(.*\)$/, '')}. ${sideRule(c.class)} — so which way does this transaction move it?`;
    }
    return `${f.message} Check it against the transaction.`;
  }
  // a worked explanation of what is not yet right — why each account moves the way it does; the amounts stay theirs to enter
  const matched = new Set(
    lineChecks
      .filter((x) => x.ok)
      .map((x) => {
        const ln = lineOf(s, x.lines[0]);
        const sec = ln && sectionOfLine(s, ln.id);
        const cl = ln && classify(ln.label);
        const e = cl && tx.entry.find((y) => y.account === cl.name || y.also?.includes(cl.name));
        return e && sec ? `${e.account}|${sec.role}` : '';
      })
  );
  const todo = tx.entry.filter((e) => !matched.has(`${e.account}|${e.side}`));
  const why = todo.map((e) => {
    const ec = classify(e.account)!;
    const up = e.side === ec.normal;
    return `‘${e.account}’ is ${classPhrase(ec).replace(/ \(.*\)$/, '')} and it ${up ? 'rises' : 'falls'}, so it is ${e.side === 'debit' ? 'a debit' : 'a credit'}`;
  });
  const extra = l && c && /^This transaction does not change/.test(f.message) ? ` ‘${l.label}’ is not part of it.` : '';
  return `${tx.explain}${extra} ${why.length ? `In the journal: ${why.join('; ')}.` : ''} The amounts come from the transaction.`.replace(/\s+/g, ' ').trim();
}

function doneText(s: WorksheetState, checks: WorksheetCheck[]): string {
  const t = totalsOf(s);
  const unchecked = checks.filter((c) => c.unchecked).length;
  const note = unchecked ? ` (${plural(unchecked, 'line uses', 'lines use')} your own name, so ${unchecked === 1 ? 'its heading was' : 'their headings were'} not checked.)` : '';
  if (s.template === 'journal-entry') {
    return `The entry balances — debits and credits both ${sayMoney(t.debits)}${s.scenario ? ' — and matches the transaction' : ''}.`;
  }
  if (s.template === 'income-statement') {
    const net = t.revenue - t.expenses;
    return `Revenue of ${sayMoney(t.revenue)} less expenses of ${sayMoney(t.expenses)} gives ${net >= 0 ? 'net income' : 'a net loss'} of ${sayMoney(Math.abs(net))}, and every line sits under a heading it belongs to.${note}`;
  }
  return s.scenario && s.baseline
    ? `It balances — total assets of ${sayMoney(t.assets)} equal liabilities plus equity — and the sheet shows the transaction.${note} Ask for the next transaction when you want another.`
    : `It balances: total assets of ${sayMoney(t.assets)} equal liabilities plus equity, and every line sits under a heading it belongs to.${note} Want a follow-up? Ask for the next transaction and see how it moves the sheet.`;
}

/**
 * The hint at a level of the ladder (1–4), from the first check that fails.
 * When nothing fails, what is balanced — and the offer of a follow-up.
 */
export function hintFor(s: WorksheetState, level: number): string {
  const checks = checkWorksheet(s);
  const f = checks.find((c) => !c.ok);
  if (!f) return doneText(s, checks);
  const L = Math.min(4, Math.max(1, Math.floor(Number(level)) || 1));
  if (f.id === 'empty') return emptyHint(s, L);
  if (f.kind === 'classification') return classificationHint(s, f, checks, L);
  if (f.kind === 'missing') return missingHint(s, f, checks, L);
  if (f.kind === 'effect') return effectHint(s, f, L);
  if (f.kind === 'entry') return entryHint(s, f, checks, L);
  if (s.template === 'journal-entry') return journalBalanceHint(s, checks, L);
  return sheetBalanceHint(s, checks, L);
}

/** The hint the person has been given for the problem in front of them, if any — none once that problem is gone. */
export function currentHint(s: WorksheetState): string | null {
  if (!s.assist.level || !s.assist.on) return null;
  const f = firstFailing(s);
  return f && f.id === s.assist.on ? hintFor(s, s.assist.level) : null;
}

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<WorksheetState>[] = [
  {
    id: 'sheet',
    label: 'Sheet',
    shows: 'the worksheet itself: its headings, your lines and amounts, and the totals',
    primary: true,
    interactions: ['enter an amount', 'add, rename, move or remove a line'],
  },
  {
    id: 'checks',
    label: 'Checks',
    shows: 'what the rules find: whether it balances, what sits under the wrong heading, what is missing',
    interactions: ['ask for a hint', 'check again'],
    unavailable: (s) => (allLines(s).length ? null : 'Nothing to check yet — add lines first.'),
  },
];

const NO_LINE = 'There is no such line on this worksheet.';
const SECTION_WORD: Record<string, string> = { ca: 'current assets', nca: 'non-current assets', cl: 'current liabilities', ncl: 'non-current liabilities', eq: 'equity', dr: 'the debits', cr: 'the credits', rev: 'revenue', exp: 'expenses' };
const hasAmount = (a: Args): boolean => a.amount !== undefined && a.amount !== '';

function withSections(s: WorksheetState, sections: WorksheetSection[]): WorksheetState {
  return sanitizeWorksheet({ ...s, sections }) ?? s;
}
function mapLines(s: WorksheetState, f: (l: WorksheetLine) => WorksheetLine): WorksheetState {
  return withSections(s, s.sections.map((sec) => ({ ...sec, lines: sec.lines.map(f) })));
}

export const WORKSHEET_OPS = {
  ...headOps<WorksheetState>(views, sanitizeWorksheet),
  enter: op<WorksheetState>(
    'Enter an amount',
    (s, a, ctx) => {
      if (!lineOf(s, a.line)) return NO_LINE;
      if (ctx?.by === 'socria') return 'Only you enter amounts — Socria never fills in your figures.';
      if (a.amount !== '' && amountOf(a.amount) === null) return 'That is not an amount: write a number, like 1,250 or 1250.50.';
      return null;
    },
    // an amount is the person's own, so the line it is on is theirs from now on
    (s, a) => mapLines(s, (l) => (l.id === a.line ? { ...l, amount: a.amount === '' ? null : amountOf(a.amount), by: 'person' } : l)),
    (a) => (a.amount === '' ? 'cleared an amount' : `entered ${sayMoney(cents(amountOf(a.amount) ?? 0))}`)
  ),
  label: op<WorksheetState>(
    'Rename a line',
    (s, a, ctx) => {
      const l = lineOf(s, a.line);
      if (!l) return NO_LINE;
      if (!cleanText(a.label, WORKSHEET_LIMITS.label)) return 'Say what the line should be called.';
      if (a.by !== 'person' && a.by !== 'socria') return 'Say who is renaming it.';
      return guardBy(a, ctx) ?? guardOwn(l, ctx, 'That line');
    },
    // a line the person renames is theirs: Socria cannot rename it back
    (s, a) => mapLines(s, (l) => (l.id === a.line ? { ...l, label: cleanText(a.label, WORKSHEET_LIMITS.label), by: a.by === 'person' ? 'person' : l.by } : l)),
    (a) => `renamed a line “${cleanText(a.label, WORKSHEET_LIMITS.label)}”`
  ),
  addLine: op<WorksheetState>(
    'Add a line',
    (s, a, ctx) => {
      const sec = sectionOf(s, a.section);
      if (!sec) return 'There is no such heading on this worksheet.';
      if (!cleanText(a.label, WORKSHEET_LIMITS.label)) return 'Say what the line is.';
      if (sec.lines.length >= WORKSHEET_LIMITS.lines) return `A heading holds ${WORKSHEET_LIMITS.lines} lines at most.`;
      if (a.by !== 'person' && a.by !== 'socria') return 'Say who is adding it.';
      const forged = guardBy(a, ctx);
      if (forged) return forged;
      if (hasAmount(a) && amountOf(a.amount) === null) return 'That is not an amount: write a number, like 1,250 or 1250.50.';
      if (hasAmount(a) && (a.by === 'socria' || ctx?.by === 'socria')) return 'Socria adds blank lines only — the amounts are yours to enter.';
      return null;
    },
    (s, a) => {
      const line: WorksheetLine = {
        id: nextId('l', allLines(s).map((l) => l.id)),
        label: cleanText(a.label, WORKSHEET_LIMITS.label),
        amount: hasAmount(a) ? amountOf(a.amount) : null,
        by: a.by === 'person' ? 'person' : 'socria',
      };
      return withSections(s, s.sections.map((sec) => (sec.id === a.section ? { ...sec, lines: [...sec.lines, line] } : sec)));
    },
    (a) => `added “${cleanText(a.label, WORKSHEET_LIMITS.label)}”${hasAmount(a) ? ` at ${sayMoney(cents(amountOf(a.amount) ?? 0))}` : ''} under ${SECTION_WORD[String(a.section)] ?? 'a heading'}`
  ),
  removeLine: op<WorksheetState>(
    'Remove a line',
    (s, a, ctx) => {
      const l = lineOf(s, a.line);
      return l ? guardOwn(l, ctx, 'That line') : NO_LINE;
    },
    (s, a) => withSections(s, s.sections.map((sec) => ({ ...sec, lines: sec.lines.filter((l) => l.id !== a.line) }))),
    () => 'removed a line'
  ),
  moveLine: op<WorksheetState>(
    'Move a line',
    (s, a, ctx) => {
      const l = lineOf(s, a.line);
      if (!l) return NO_LINE;
      const to = sectionOf(s, a.section);
      if (!to) return 'There is no such heading on this worksheet.';
      if (to.lines.some((x) => x.id === l.id)) return 'It is already under that heading.';
      if (to.lines.length >= WORKSHEET_LIMITS.lines) return `A heading holds ${WORKSHEET_LIMITS.lines} lines at most.`;
      return guardOwn(l, ctx, 'That line');
    },
    (s, a) => {
      const l = lineOf(s, a.line);
      if (!l) return s;
      return withSections(
        s,
        s.sections.map((sec) => ({ ...sec, lines: sec.id === a.section ? [...sec.lines.filter((x) => x.id !== l.id), l] : sec.lines.filter((x) => x.id !== l.id) }))
      );
    },
    (a) => `moved a line to ${SECTION_WORD[String(a.section)] ?? 'another heading'}`
  ),
  hint: op<WorksheetState>(
    'Hint',
    (s, _a, ctx) => {
      if (ctx?.by === 'socria') return 'A hint comes when you ask for one.';
      const f = firstFailing(s);
      if (!f) return hintFor(s, 0);
      if ((s.assist.on === f.id ? s.assist.level : 0) >= 4) return 'That was the fullest explanation there is — the rest is yours to work out, or ask about it in the chat.';
      return null;
    },
    (s) => {
      const f = firstFailing(s);
      if (!f) return s;
      const level = Math.min(4, (s.assist.on === f.id ? s.assist.level : 0) + 1);
      return sanitizeWorksheet({ ...s, assist: { level, used: s.assist.used + 1, on: f.id } }) ?? s;
    },
    () => 'asked for a hint'
  ),
  check: op<WorksheetState>(
    'Check',
    (s, _a, ctx) => {
      if (ctx?.by === 'socria') return 'A check records your attempt, so it is yours to ask for.';
      return allLines(s).length ? null : 'There is nothing to check yet — add some lines first.';
    },
    (s) => {
      const failing = checkWorksheet(s).filter((c) => !c.ok).length;
      const n = (s.attempts[s.attempts.length - 1]?.n ?? 0) + 1;
      return sanitizeWorksheet({ ...s, view: 'checks', attempts: [...s.attempts, { n, failing }] }) ?? s;
    },
    () => 'checked the work'
  ),
  next: op<WorksheetState>(
    'Next transaction',
    (s, a, ctx) => {
      if (ctx?.by === 'socria') return 'The next transaction comes when you ask for it.';
      if (s.template !== 'balance-sheet') return 'A follow-up transaction is posed on a balance sheet.';
      const failing = checkWorksheet(s).filter((c) => !c.ok).length;
      if (failing) return `Finish this one first: ${failing === 1 ? 'a check still fails' : `${failing} checks still fail`}.`;
      if (!followUpFor(s, a.key)) return a.key !== undefined && a.key !== '' ? 'That transaction does not fit this sheet yet.' : 'No follow-up fits this sheet yet.';
      return null;
    },
    (s, a) => {
      const tx = followUpFor(s, a.key);
      if (!tx) return s;
      return sanitizeWorksheet({ ...s, view: 'sheet', scenario: { key: tx.key }, baseline: baselineOf(s), assist: { level: 0, used: s.assist.used } }) ?? s;
    },
    () => 'posed the next transaction'
  ),
};

// ── words → an operation ─────────────────────────────────────────────

const AMOUNT = String.raw`\(?\s*[-−–]?\s*[$£€]?\s*\d[\d,]*(?:\.\d{1,2})?\s*\)?`;
const CHECK_RE =
  /^(?:please )?(?:check|grade|mark)(?: (?:it|this|that|again|my (?:work|answers?|sheet|worksheet|entry|balance sheet|journal entry|income statement)|the (?:sheet|worksheet|entry|balance sheet|journal entry|income statement)))?(?: please)?$|^(?:does|do) (?:it|this|my sheet|the sheet|my balance sheet|the balance sheet|my entry|the entry) balance$|^is (?:it|this|my sheet|the sheet|my entry|the entry) balanced$/;
const HINT_RE =
  /^(?:please )?(?:(?:can|could|may) (?:i|you) (?:have|get|give me) )?(?:(?:give me|i need|i want|id like|i would like|show me) )?(?:a |another |one more |the next |a further |any )?(?:hint|hints|clue|nudge)(?: please)?$/;
const NEXT_RE =
  /^(?:next(?: (?:one|transaction|follow up|followup|question|problem))?|(?:give me |pose |try |do |lets do |let s do |i want |id like )?(?:another|the next|a new|a) (?:transaction|follow up|followup|problem))(?: please)?$/;
const VIEW_RE = /^(?:please )?(?:show|view|see|display|switch to|go to|open)(?: me)?(?: the| my)? (checks|check results|results|sheet|worksheet|balance sheet|journal entry|income statement)$/;
const LABEL_AMOUNT_RE = new RegExp(String.raw`^(.+?)(?:\s*[=:]\s*|\s+(?:of|at|for|with)\s+|\s+)(${AMOUNT})$`, 'i');
const ENTER_RES: [RegExp, number, number][] = [
  [new RegExp(String.raw`^(?:please\s+)?(?:set|change|make|update|correct)\s+(.+?)\s+to\s+(${AMOUNT})$`, 'i'), 1, 2],
  [new RegExp(String.raw`^(?:please\s+)?(?:enter|put|write|record)\s+(${AMOUNT})\s+(?:for|in|as|on|against)\s+(.+)$`, 'i'), 2, 1],
  [new RegExp(String.raw`^(.+?)\s*(?:\bis\b|=|:)\s*(${AMOUNT})$`, 'i'), 1, 2],
  [new RegExp(String.raw`^(.+?)\s+(${AMOUNT})$`, 'i'), 1, 2],
];

const unquote = (t: string): string => t.trim().replace(/^[“"'‘]+|[”"'’]+$/g, '').trim();

function sectionAliases(sec: WorksheetSection): string[] {
  switch (sec.role) {
    case 'asset':
      return sec.term === 'current'
        ? ['current assets', 'current asset']
        : sec.term === 'non-current'
          ? ['non current assets', 'noncurrent assets', 'non current asset', 'long term assets', 'fixed assets']
          : ['assets', 'asset'];
    case 'liability':
      return sec.term === 'current'
        ? ['current liabilities', 'current liability']
        : sec.term === 'non-current'
          ? ['non current liabilities', 'noncurrent liabilities', 'non current liability', 'long term liabilities']
          : ['liabilities', 'liability'];
    case 'equity':
      return ['equity', 'owners equity', 'shareholders equity', 'stockholders equity'];
    case 'debit':
      return ['debit', 'debits', 'dr'];
    case 'credit':
      return ['credit', 'credits', 'cr'];
    case 'revenue':
      return ['revenue', 'revenues', 'income'];
    case 'expense':
      return ['expense', 'expenses'];
  }
}

/** The heading the words name exactly — "current liabilities", "the debit side" — or null. */
function sectionNamed(s: WorksheetState, words: string): WorksheetSection | null {
  const w = norm(words).replace(/\s+(?:section|side|heading|column)$/, '').trim();
  if (!w) return null;
  const hits = s.sections.filter((sec) => norm(sec.label) === w || sectionAliases(sec).includes(w));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * The line the words name: its own label exactly, or — failing that — the one
 * line whose standard account the words also name ("bank" for a line called
 * "Cash"). Null when nothing, or more than one line, is named.
 */
function lineNamed(s: WorksheetState, words: string): WorksheetLine | null {
  const w = unquote(words)
    .replace(/^(?:the|my|our)\s+/i, '')
    .replace(/\s+(?:line|amount|balance|figure|entry)$/i, '')
    .trim();
  const key = accountKey(w);
  if (!key || key.split(' ').length > 8) return null;
  const lines = allLines(s);
  const exact = lines.filter((l) => accountKey(l.label) === key);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const c = classify(w);
  if (!c) return null;
  const same = lines.filter((l) => classify(l.label)?.name === c.name);
  return same.length === 1 ? same[0] : null;
}

/** "cash in hand to current assets" → the last place the words after a preposition name a heading. */
function splitAtSection(s: WorksheetState, body: string): { left: string; sec: WorksheetSection } | null {
  const re = /\s(?:to|under|in|into|on|onto)\s/gi;
  let found: { left: string; sec: WorksheetSection } | null = null;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const sec = sectionNamed(s, body.slice(m.index + m[0].length));
    if (sec) found = { left: body.slice(0, m.index), sec };
  }
  return found;
}

/**
 * An operation the words plainly ask for on THIS worksheet. Conservative: it
 * runs on every message while a worksheet is open, so it answers only when the
 * whole message is a request — "check", "a hint", "next transaction" — or
 * names a line or a heading of this sheet exactly. It never chooses a heading
 * for a line: where a line goes is the person's thinking.
 */
export function readWorksheetOp(text: string, s: WorksheetState, _today: string): { op: string; args: Args } | null {
  const t = text.trim();
  if (!t || t.length > 160) return null;
  const n = norm(t);
  const raw = t.replace(/[.!]+$/, '').trim();

  if (CHECK_RE.test(n)) return { op: 'check', args: {} };
  if (HINT_RE.test(n)) return { op: 'hint', args: {} };
  if (NEXT_RE.test(n)) return { op: 'next', args: {} };
  const v = VIEW_RE.exec(n);
  if (v) return { op: 'view', args: { view: /check|result/.test(v[1]) ? 'checks' : 'sheet' } };

  // "add cash 8,000 to current assets", "add a line for bank loan under non-current liabilities"
  let m = /^(?:please\s+)?add\s+(?:a\s+(?:new\s+)?line\s+(?:for\s+|called\s+|named\s+)?)?(.+)$/i.exec(raw);
  if (m) {
    const at = splitAtSection(s, m[1]);
    if (!at) return null;
    let label = at.left;
    let amount: number | null = null;
    const am = LABEL_AMOUNT_RE.exec(label);
    if (am && amountOf(am[2]) !== null) {
      label = am[1];
      amount = amountOf(am[2]);
    }
    label = cleanText(unquote(label).replace(/^(?:an?|the)\s+/i, ''), WORKSHEET_LIMITS.label);
    if (!label || /^(?:new|line|another)$/i.test(label)) return null;
    return { op: 'addLine', args: { section: at.sec.id, label, ...(amount !== null ? { amount } : {}), by: 'person' } };
  }
  // "move accounts payable to current liabilities"
  m = /^(?:please\s+)?move\s+(.+)$/i.exec(raw);
  if (m) {
    const at = splitAtSection(s, m[1]);
    const l = at && lineNamed(s, at.left);
    return at && l ? { op: 'moveLine', args: { line: l.id, section: at.sec.id } } : null;
  }
  // "remove inventory", "delete the cash line"
  m = /^(?:please\s+)?(?:remove|delete|drop|take\s+out|get\s+rid\s+of)\s+(.+)$/i.exec(raw);
  if (m) {
    const l = lineNamed(s, m[1]);
    return l ? { op: 'removeLine', args: { line: l.id } } : null;
  }
  // "rename cash to cash at bank", "rename it to My first balance sheet"
  m = /^(?:please\s+)?(?:rename|relabel)\s+(.+?)\s+(?:to|as)\s+(.+)$/i.exec(raw);
  if (m) {
    const label = cleanText(unquote(m[2]), WORKSHEET_LIMITS.label);
    if (!label) return null;
    if (/^(?:it|this|the\s+(?:sheet|worksheet|title)|this\s+(?:sheet|worksheet))$/i.test(m[1].trim())) return { op: 'title', args: { title: label } };
    const l = lineNamed(s, m[1]);
    return l ? { op: 'label', args: { line: l.id, label, by: 'person' } } : null;
  }
  // "clear the cash amount"
  m = /^(?:please\s+)?(?:clear|blank|erase|empty)\s+(.+)$/i.exec(raw);
  if (m) {
    const l = lineNamed(s, m[1]);
    return l ? { op: 'enter', args: { line: l.id, amount: '' } } : null;
  }
  // amounts: "cash 8,000", "cash is $8,000", "set cash to 8000", "enter 1,500 for inventory"
  for (const [re, li, ai] of ENTER_RES) {
    const mm = re.exec(raw);
    if (!mm || mm[li].length > WORKSHEET_LIMITS.label) continue;
    const amount = amountOf(mm[ai]);
    const l = amount !== null ? lineNamed(s, mm[li]) : null;
    if (l && amount !== null) return { op: 'enter', args: { line: l.id, amount } };
  }
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

function totalsLine(s: WorksheetState): string {
  const t = totalsOf(s);
  if (s.template === 'balance-sheet') return `Total assets ${sayMoney(t.assets)}; total liabilities ${sayMoney(t.liabilities)} and equity ${sayMoney(t.equity)}, together ${sayMoney(t.liabilities + t.equity)}.`;
  if (s.template === 'journal-entry') return `Debits ${sayMoney(t.debits)}; credits ${sayMoney(t.credits)}.`;
  const net = t.revenue - t.expenses;
  return `Revenue ${sayMoney(t.revenue)}; expenses ${sayMoney(t.expenses)}; ${net >= 0 ? 'net income' : 'net loss'} ${sayMoney(Math.abs(net))}.`;
}

/**
 * What the conversation is told. Never an amount the person has not entered —
 * no balance a transaction leads to, no total they have not reached — and
 * never the entry a transaction calls for. Guarded (they are learning), it
 * holds back the specifics the hint ladder has not reached either.
 */
function worksheetFacts(s: WorksheetState, guarded: boolean): string[] {
  const lines = allLines(s);
  const empty = lines.filter((l) => l.amount === null).length;
  const out = [`${s.title}: a ${NOUN[s.template]} worksheet with ${plural(lines.length, 'line')} under ${plural(s.sections.length, 'heading')}${empty ? `; ${empty} without an amount yet` : ''}.`];
  if (s.scenario) out.push(s.template === 'journal-entry' ? `The transaction to record: ${s.scenario.text}` : `Follow-up posed: ${s.scenario.text}`);
  const checks = checkWorksheet(s);
  const real = checks.filter((c) => !c.unchecked);
  const failing = real.filter((c) => !c.ok);
  if (!guarded) {
    if (lines.length) out.push(totalsLine(s));
    out.push(failing.length ? `Checks: ${failing.length} of ${real.length} fail. ${failing.slice(0, 4).map((c) => c.message).join(' ')}` : `Every check passes (${real.length}).`);
  } else {
    const kinds = [...new Set(failing.map((c) => c.kind))].join(', ');
    out.push(failing.length ? `Checks: ${failing.length} of ${real.length} fail (${kinds}).` : 'Every check passes.');
  }
  const hint = currentHint(s);
  if (hint) out.push(`The hint they asked for (level ${s.assist.level} of 4): ${hint}`);
  if (s.assist.used) out.push(`${plural(s.assist.used, 'hint')} asked for on this worksheet.`);
  const last = s.attempts[s.attempts.length - 1];
  if (last) out.push(`On attempt ${last.n} — the latest check they asked for — ${last.failing ? `${plural(last.failing, 'check')} failed` : 'every check passed'}.`);
  const unchecked = checks.filter((c) => c.unchecked).length;
  if (unchecked) out.push(`${plural(unchecked, 'line uses', 'lines use')} the person’s own name, not a standard account, so ${unchecked === 1 ? 'it' : 'they'} cannot be checked.`);
  if (lines.some((l) => l.amount !== null)) out.push('Every amount on it was entered by the person; Socria does not enter or change them.');
  if (guarded) {
    out.push(
      `They are working this through themselves: do not give amounts, accounts or where a line goes beyond the hint they have asked for${s.assist.level ? ` (level ${s.assist.level} of 4)` : ''}, and do not work out a balance or total for them.`
    );
  }
  return out;
}

function worksheetText(s: WorksheetState): string {
  const out = [`WORKSHEET “${s.title}” (${NOUN[s.template]})`];
  if (s.scenario) out.push(`${s.template === 'journal-entry' ? 'Transaction' : 'Follow-up'}: ${s.scenario.text}`);
  for (const sec of s.sections) {
    out.push(`${sec.label}:${sec.lines.length ? '' : ' (no lines)'}`);
    for (const l of sec.lines) out.push(`  ${l.label}: ${l.amount === null ? '— (no amount yet)' : sayMoney(cents(l.amount))}${l.by === 'person' ? ' · theirs' : ' · blank line from Socria'}`);
  }
  if (s.assist.level) out.push(`Hint ladder: level ${s.assist.level} of 4.`);
  return out.join('\n').slice(0, 2400);
}

export const WORKSHEET = displayKind<WorksheetState>({
  kind: 'worksheet',
  label: 'Worksheet',
  sanitize: sanitizeWorksheet,
  ops: WORKSHEET_OPS,
  readOp: (text, s) => readWorksheetOp(text, s, todayDay()),
  consequence: (before, after, step) => {
    if (step.op === 'hint') return after.assist.level ? `Hint ${after.assist.level} of 4: ${hintFor(after, after.assist.level)}` : null;
    if (step.op === 'check') {
      const real = checkWorksheet(after).filter((c) => !c.unchecked);
      const failing = real.filter((c) => !c.ok).length;
      return failing ? `${real.length - failing} of ${real.length} checks pass.` : `Every check passes (${real.length}).`;
    }
    if (step.op === 'next') return after.scenario ? `Follow-up: ${after.scenario.text}` : null;
    const agree = (x: WorksheetState): boolean | null => {
      if (!allLines(x).length) return null;
      const t = totalsOf(x);
      if (x.template === 'balance-sheet') return t.assets === t.liabilities + t.equity;
      if (x.template === 'journal-entry') return t.debits === t.credits && t.debits > 0;
      return null;
    };
    const was = agree(before);
    const now = agree(after);
    if (now === null || now === was) return null;
    const t = totalsOf(after);
    if (!now) return 'The two sides no longer agree.';
    return after.template === 'balance-sheet'
      ? `It balances now: total assets equal liabilities plus equity, at ${sayMoney(t.assets)}.`
      : `Debits and credits agree now, at ${sayMoney(t.debits)}.`;
  },
  facts: (s, opts) => worksheetFacts(s, opts.guarded),
  text: worksheetText,
  parts: (s): Part[] => allLines(s).map((l) => ({ id: l.id, label: l.label })),
  partFacts: (s, part) => {
    const l = lineOf(s, part);
    const sec = l && sectionOfLine(s, l.id);
    if (!l || !sec) return null;
    const c = classify(l.label);
    return [
      l.label,
      `under ${sec.label.toLowerCase()}`,
      l.amount === null ? 'no amount yet' : sayMoney(cents(l.amount)),
      c ? `${c.name}: ${classPhrase(c)}, normally a ${c.normal} balance` : 'their own name — not a standard account, so not checked',
      l.by === 'person' ? 'theirs' : 'a blank line from Socria',
    ];
  },
  views,
  size: (s, mode) =>
    mode === 'card'
      ? { w: 260, h: 150 }
      : mode === 'trail'
        ? { w: 200, h: 110 }
        : { w: 640, h: Math.min(640, 160 + 28 * (allLines(s).length + s.sections.length)) },
  shape: (s) => `${NOUN[s.template]} · ${plural(allLines(s).length, 'line')}${s.scenario && s.template === 'balance-sheet' ? ' · follow-up' : ''}`,
});

register(WORKSHEET);
registerDisplay({
  kind: 'worksheet',
  noun: 'worksheet',
  handle: 'W',
  about: 'Structured practice the person fills in — a balance sheet, a journal entry, an income statement — checked by standard rules, with hints only when asked.',
});
