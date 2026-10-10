// ACCOUNTS — the standard chart of accounts and the textbook transactions a
// worksheet (display-worksheet.ts) is checked against.
//
// This file is data and the few functions that read it. Nothing in it is
// exotic: it is standard double-entry bookkeeping as an introductory course
// teaches it.
//
//   classify(label)  the standard account a label names — Cash, Accounts
//                    payable, Owner's capital — with its class (asset,
//                    liability, equity, revenue, expense, or a contra account),
//                    whether it is current, and its normal balance. A label
//                    that is not a standard account name is NOT classified:
//                    null, never a guess. "Loan" could be money owed or money
//                    lent; "Stock" is inventory in London and shares in New
//                    York; "Interest" is revenue or expense. Those are left to
//                    the person's own words.
//
//   LIBRARY          standard transactions, each with the journal entry the
//                    standard double-entry rules give and its effect on the
//                    balance sheet. Every entry balances, and every effect is
//                    what the entry implies (test/display-worksheet.test.mjs
//                    derives one from the other).
//
// PURE.

export type AccountClass = 'asset' | 'contra-asset' | 'liability' | 'equity' | 'contra-equity' | 'revenue' | 'expense';
export type Side = 'debit' | 'credit';

export interface Account {
  name: string;
  class: AccountClass;
  /** current (within a year) or not; absent where it depends on terms — a note payable may be either */
  current?: boolean;
  /** what the account is, in plain words, for a worked explanation */
  about: string;
  /** other names the same account goes by — US and UK usage, short forms */
  synonyms: readonly string[];
}

/** What classify says about a label. */
export interface Classified {
  name: string;
  class: AccountClass;
  current?: boolean;
  normal: Side;
}

/** Normal balances: assets, expenses and drawings on the debit side; liabilities, equity and revenue on the credit side; a contra account reverses its parent's. */
export const NORMAL_SIDE: Record<AccountClass, Side> = {
  asset: 'debit',
  'contra-asset': 'credit',
  liability: 'credit',
  equity: 'credit',
  'contra-equity': 'debit',
  revenue: 'credit',
  expense: 'debit',
};

// ── the chart of accounts ───────────────────────────────────────────

export const ACCOUNTS: readonly Account[] = [
  // assets — current
  { name: 'Cash', class: 'asset', current: true, about: 'money the business holds, on hand or in the bank', synonyms: ['cash at bank', 'cash in bank', 'bank', 'cash on hand', 'cash and cash equivalents', 'cash and bank', 'petty cash', 'checking account'] },
  { name: 'Accounts receivable', class: 'asset', current: true, about: 'money customers owe the business', synonyms: ['account receivable', 'receivables', 'trade receivables', 'debtors', 'trade debtors', 'ar', 'a r'] },
  { name: 'Notes receivable', class: 'asset', about: 'amounts owed to the business under a written promise to pay', synonyms: ['note receivable'] },
  { name: 'Interest receivable', class: 'asset', current: true, about: 'interest the business has earned but not yet received', synonyms: [] },
  { name: 'Inventory', class: 'asset', current: true, about: 'goods the business holds to sell', synonyms: ['inventories', 'merchandise inventory', 'merchandise', 'stock in trade'] },
  { name: 'Supplies', class: 'asset', current: true, about: 'supplies bought and not yet used', synonyms: ['office supplies', 'store supplies', 'supplies on hand'] },
  { name: 'Prepaid expenses', class: 'asset', current: true, about: 'costs paid in advance for benefits still to come', synonyms: ['prepaid expense', 'prepayments', 'prepaids'] },
  { name: 'Prepaid insurance', class: 'asset', current: true, about: 'insurance paid for in advance and not yet used up', synonyms: ['insurance prepaid'] },
  { name: 'Prepaid rent', class: 'asset', current: true, about: 'rent paid in advance and not yet used up', synonyms: ['rent prepaid'] },
  { name: 'Short-term investments', class: 'asset', current: true, about: 'investments the business expects to sell within a year', synonyms: ['short term investments', 'marketable securities', 'trading securities'] },
  // assets — non-current
  { name: 'Land', class: 'asset', current: false, about: 'land the business owns and uses', synonyms: [] },
  { name: 'Buildings', class: 'asset', current: false, about: 'buildings the business owns and uses for years', synonyms: ['building', 'premises'] },
  { name: 'Equipment', class: 'asset', current: false, about: 'equipment the business uses for years', synonyms: ['office equipment', 'store equipment', 'computer equipment', 'machinery', 'machinery and equipment', 'plant and machinery'] },
  { name: 'Furniture and fixtures', class: 'asset', current: false, about: 'furniture and fittings the business uses for years', synonyms: ['furniture', 'office furniture', 'fixtures and fittings', 'furniture and fittings'] },
  { name: 'Vehicles', class: 'asset', current: false, about: 'vehicles the business uses for years', synonyms: ['vehicle', 'motor vehicles', 'motor vehicle', 'delivery van', 'delivery vehicles', 'trucks', 'truck', 'van', 'vans'] },
  { name: 'Property, plant and equipment', class: 'asset', current: false, about: 'the long-lived physical assets the business uses, taken together', synonyms: ['property plant and equipment', 'plant property and equipment', 'plant and equipment', 'ppe', 'fixed assets'] },
  { name: 'Long-term investments', class: 'asset', current: false, about: 'investments the business means to hold for more than a year', synonyms: ['long term investments', 'non current investments'] },
  { name: 'Patents', class: 'asset', current: false, about: 'the exclusive right to an invention, held for years', synonyms: ['patent'] },
  { name: 'Goodwill', class: 'asset', current: false, about: 'what was paid for a business beyond the value of its separate assets', synonyms: [] },
  { name: 'Intangible assets', class: 'asset', current: false, about: 'long-lived rights with no physical form', synonyms: ['intangibles', 'trademarks', 'copyrights'] },
  // contra-assets
  { name: 'Accumulated depreciation', class: 'contra-asset', current: false, about: 'the part of long-lived assets’ cost used up so far, subtracted from them', synonyms: ['provision for depreciation', 'accumulated dep', 'acc depreciation'] },
  { name: 'Accumulated amortization', class: 'contra-asset', current: false, about: 'the part of intangible assets’ cost used up so far, subtracted from them', synonyms: ['accumulated amortisation'] },
  { name: 'Allowance for doubtful accounts', class: 'contra-asset', current: true, about: 'the part of receivables not expected to be collected, subtracted from them', synonyms: ['allowance for bad debts', 'allowance for uncollectible accounts', 'allowance for doubtful debts', 'provision for doubtful debts', 'provision for bad debts', 'bad debt provision'] },
  // liabilities — current
  { name: 'Accounts payable', class: 'liability', current: true, about: 'money the business owes its suppliers', synonyms: ['account payable', 'payables', 'trade payables', 'creditors', 'trade creditors', 'ap', 'a p'] },
  { name: 'Wages payable', class: 'liability', current: true, about: 'wages employees have earned and not yet been paid', synonyms: ['salaries payable', 'wages and salaries payable', 'salaries and wages payable', 'accrued wages', 'accrued salaries'] },
  { name: 'Interest payable', class: 'liability', current: true, about: 'interest the business owes and has not yet paid', synonyms: ['accrued interest', 'accrued interest payable'] },
  { name: 'Utilities payable', class: 'liability', current: true, about: 'utility bills the business owes', synonyms: [] },
  { name: 'Rent payable', class: 'liability', current: true, about: 'rent the business owes', synonyms: [] },
  { name: 'Taxes payable', class: 'liability', current: true, about: 'taxes the business owes', synonyms: ['tax payable', 'income tax payable', 'income taxes payable', 'sales tax payable', 'vat payable'] },
  { name: 'Unearned revenue', class: 'liability', current: true, about: 'cash received for work not yet done — owed to the customer as that work', synonyms: ['unearned revenues', 'deferred revenue', 'unearned service revenue', 'unearned income', 'revenue received in advance', 'income received in advance', 'customer deposits'] },
  { name: 'Accrued expenses', class: 'liability', current: true, about: 'costs incurred and not yet paid', synonyms: ['accrued liabilities', 'accruals'] },
  { name: 'Dividends payable', class: 'liability', current: true, about: 'dividends declared and not yet paid', synonyms: [] },
  { name: 'Bank overdraft', class: 'liability', current: true, about: 'money owed to the bank on an overdrawn account', synonyms: ['overdraft'] },
  // liabilities — current or not, by their terms
  { name: 'Notes payable', class: 'liability', about: 'amounts the business owes under a written promise to pay', synonyms: ['note payable'] },
  { name: 'Bank loan', class: 'liability', about: 'money borrowed from a bank, to be repaid', synonyms: ['bank loans', 'bank loan payable', 'loan payable', 'loans payable', 'term loan', 'borrowings', 'bank borrowings'] },
  // liabilities — non-current
  { name: 'Long-term debt', class: 'liability', current: false, about: 'borrowing due after more than a year', synonyms: ['long term debt', 'long term loan', 'long term loans', 'long term borrowings', 'long term notes payable'] },
  { name: 'Mortgage payable', class: 'liability', current: false, about: 'a long-term loan secured on property', synonyms: ['mortgage', 'mortgage loan'] },
  { name: 'Bonds payable', class: 'liability', current: false, about: 'long-term debt raised by issuing bonds', synonyms: ['debentures'] },
  // equity
  { name: 'Owner’s capital', class: 'equity', about: 'what the owner has put into the business and left in it', synonyms: ['owners capital', 'owner capital', 'capital', 'owners equity', 'owner equity', 'proprietors capital', 'proprietor capital'] },
  { name: 'Common stock', class: 'equity', about: 'what shareholders paid in for their shares', synonyms: ['share capital', 'ordinary shares', 'capital stock', 'common shares', 'issued share capital'] },
  { name: 'Additional paid-in capital', class: 'equity', about: 'what shareholders paid in beyond the par value of their shares', synonyms: ['additional paid in capital', 'share premium', 'paid in capital in excess of par', 'capital surplus', 'apic'] },
  { name: 'Retained earnings', class: 'equity', about: 'profit the business has earned and kept rather than paid out', synonyms: ['retained profits', 'retained profit', 'accumulated profits', 'retained income', 'accumulated earnings'] },
  // contra-equity
  { name: 'Owner’s drawings', class: 'contra-equity', about: 'what the owner has taken out of the business for personal use', synonyms: ['owners drawings', 'owner drawings', 'drawings', 'drawing', 'owners withdrawals', 'owner withdrawals', 'withdrawals', 'personal drawings', 'owners draw', 'owner draw'] },
  { name: 'Dividends', class: 'contra-equity', about: 'profit paid out to shareholders', synonyms: ['dividend', 'dividends declared', 'cash dividends'] },
  { name: 'Treasury stock', class: 'contra-equity', about: 'the company’s own shares bought back', synonyms: ['treasury shares'] },
  // revenue
  { name: 'Service revenue', class: 'revenue', about: 'what the business earns by doing work for customers', synonyms: ['service revenues', 'services revenue', 'service income', 'fees earned', 'fee income', 'fees revenue', 'consulting revenue', 'revenue from services'] },
  { name: 'Sales revenue', class: 'revenue', about: 'what the business earns by selling goods', synonyms: ['sales', 'sales revenues', 'net sales', 'turnover', 'sales income'] },
  { name: 'Revenue', class: 'revenue', about: 'what the business earns in the period', synonyms: ['revenues', 'total revenue'] },
  { name: 'Interest revenue', class: 'revenue', about: 'interest the business earns', synonyms: ['interest income', 'interest earned'] },
  { name: 'Rent revenue', class: 'revenue', about: 'rent the business earns from others', synonyms: ['rental income', 'rent income', 'rental revenue'] },
  // expenses
  { name: 'Cost of goods sold', class: 'expense', about: 'what the goods sold in the period cost the business', synonyms: ['cost of sales', 'cogs', 'cost of merchandise sold'] },
  { name: 'Wages expense', class: 'expense', about: 'what employees’ work cost in the period', synonyms: ['wages', 'wage expense', 'salaries', 'salary expense', 'salaries expense', 'salaries and wages', 'salaries and wages expense', 'wages and salaries', 'payroll expense'] },
  { name: 'Rent expense', class: 'expense', about: 'the rent used up in the period', synonyms: ['rent', 'rent paid', 'rental expense'] },
  { name: 'Utilities expense', class: 'expense', about: 'the utilities used in the period', synonyms: ['utilities', 'utility expense', 'electricity', 'electricity expense'] },
  { name: 'Supplies expense', class: 'expense', about: 'the supplies used up in the period', synonyms: ['supplies used', 'office supplies expense'] },
  { name: 'Depreciation expense', class: 'expense', about: 'the part of long-lived assets’ cost used up in the period', synonyms: ['depreciation'] },
  { name: 'Insurance expense', class: 'expense', about: 'the insurance cover used up in the period', synonyms: ['insurance'] },
  { name: 'Advertising expense', class: 'expense', about: 'what advertising cost in the period', synonyms: ['advertising', 'marketing expense'] },
  { name: 'Interest expense', class: 'expense', about: 'interest the business owes for the period on what it borrowed', synonyms: ['interest paid', 'finance costs'] },
  { name: 'Bad debt expense', class: 'expense', about: 'receivables written off as not collectable', synonyms: ['bad debts', 'bad debts expense', 'doubtful accounts expense', 'uncollectible accounts expense'] },
  { name: 'Repairs expense', class: 'expense', about: 'what repairs cost in the period', synonyms: ['repairs', 'repairs and maintenance', 'maintenance expense'] },
  { name: 'Telephone expense', class: 'expense', about: 'what telephone service cost in the period', synonyms: ['telephone', 'phone expense'] },
  { name: 'Income tax expense', class: 'expense', about: 'the tax on the period’s profit', synonyms: ['tax expense', 'income taxes'] },
  { name: 'Miscellaneous expense', class: 'expense', about: 'small costs of the period that fit no other account', synonyms: ['miscellaneous expenses', 'sundry expenses', 'general expenses'] },
];

/**
 * The key a label is looked up by: lower case, apostrophes out, "&" read as
 * "and", punctuation to spaces, a leading article, "less" or a trailing
 * "account" / "a/c" dropped — so "Owner’s Capital a/c", "the owners capital"
 * and "Less: Accumulated Depreciation" find their accounts.
 */
export function accountKey(label: unknown): string {
  if (typeof label !== 'string') return '';
  return label
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(?:the|a|an|our|my)\s+/, '')
    .replace(/^less\s+/, '')
    .replace(/\s+(?:account|acct|a c)$/, '')
    .trim();
}

const BY_KEY = new Map<string, Account>();
for (const a of ACCOUNTS) {
  for (const k of [a.name, ...a.synonyms]) {
    const key = accountKey(k);
    if (key && !BY_KEY.has(key)) BY_KEY.set(key, a);
  }
}

/** The standard account a name or synonym stands for, or null. */
export function accountOf(label: unknown): Account | null {
  const key = accountKey(label);
  if (!key) return null;
  const a = BY_KEY.get(key);
  if (a) return a;
  // "Accumulated depreciation — equipment", "accumulated depreciation on buildings"
  if (/^accumulated depreciation\b/.test(key)) return BY_KEY.get('accumulated depreciation') ?? null;
  return null;
}

/**
 * The standard account a label names: its name, class, whether it is current
 * and its normal balance. Null when the label is not a standard account name —
 * the person's own label is theirs, and it is never guessed at.
 */
export function classify(label: unknown): Classified | null {
  const a = accountOf(label);
  if (!a) return null;
  return { name: a.name, class: a.class, ...(a.current !== undefined ? { current: a.current } : {}), normal: NORMAL_SIDE[a.class] };
}

/** "a current liability", "a contra-asset (subtracted from the assets it belongs to)" — for messages. */
export function classPhrase(c: { class: AccountClass; current?: boolean }): string {
  switch (c.class) {
    case 'asset':
      return c.current === true ? 'a current asset' : c.current === false ? 'a non-current asset' : 'an asset';
    case 'contra-asset':
      return 'a contra-asset (subtracted from the assets it belongs to)';
    case 'liability':
      return c.current === true ? 'a current liability' : c.current === false ? 'a non-current liability' : 'a liability';
    case 'equity':
      return 'equity';
    case 'contra-equity':
      return 'a reduction of equity';
    case 'revenue':
      return 'revenue';
    case 'expense':
      return 'an expense';
  }
}

/** Why each class sits where it does — the sentence a worked explanation starts from. */
export const CLASS_WHY: Record<AccountClass, string> = {
  asset: 'An asset is something the business owns or is owed, that will bring it benefit.',
  'contra-asset': 'A contra-asset reduces the asset it belongs to: it sits with the assets and is subtracted from them.',
  liability: 'A liability is something the business owes to others.',
  equity: 'Equity is the owner’s claim on the business: what they put in, and what it has earned and kept.',
  'contra-equity': 'Drawings and dividends are what the owners take out: they reduce equity, and they are not expenses.',
  revenue: 'Revenue is what the business earns in a period: it raises equity, and it belongs on the income statement.',
  expense: 'An expense is a cost used up in earning revenue in a period: it lowers equity, and it belongs on the income statement.',
};

/** Why current and non-current are told apart. */
export const TERM_WHY = {
  asset: { current: 'Current assets turn into cash or are used up within a year.', 'non-current': 'Non-current assets serve the business for longer than a year.' },
  liability: { current: 'Current liabilities fall due within a year.', 'non-current': 'Non-current liabilities fall due after more than a year.' },
} as const;

/** "Assets increase on the debit side" — the rule for a class, in words. */
export function sideRule(c: AccountClass): string {
  const plural: Record<AccountClass, string> = {
    asset: 'assets',
    'contra-asset': 'contra-assets',
    liability: 'liabilities',
    equity: 'equity accounts',
    'contra-equity': 'drawings and dividends',
    revenue: 'revenues',
    expense: 'expenses',
  };
  const up = NORMAL_SIDE[c];
  return `${plural[c].replace(/^./, (x) => x.toUpperCase())} increase on the ${up} side and decrease on the ${up === 'debit' ? 'credit' : 'debit'} side`;
}

// ── the library — standard double-entry rules ───────────────────────
//
// Each transaction is a standard textbook case with the entry the standard
// double-entry rules give: increases in assets, expenses and drawings are
// debits; increases in liabilities, equity and revenue are credits. `also`
// names other standard accounts a correct answer may use in its place (a bank
// loan recorded as a note payable). Revenue and expenses reach the balance
// sheet through equity; the library's transactions are a sole proprietor's,
// so their equity effect is on the owner's capital.

export interface JournalLine {
  account: string;
  side: Side;
  amount: number;
  also?: readonly string[];
}

export interface Effect {
  account: string;
  /** the change in the account's own balance — a contra account's balance rising is positive */
  change: number;
  also?: readonly string[];
}

export interface Transaction {
  key: string;
  text: string;
  entry: readonly JournalLine[];
  effect: readonly Effect[];
  /** why the entry is what it is — the worked explanation */
  explain: string;
  /** the question that leads to it, without answering it */
  ask: string;
  /** a follow-up that uses one of these up needs one of them on the sheet first */
  requires?: readonly string[];
}

const LOAN_ALSO = ['Notes payable', 'Long-term debt'] as const;
const OWNER = 'Owner’s capital';

export const LIBRARY: readonly Transaction[] = [
  {
    key: 'owner-invests',
    text: 'The owner invests $10,000 cash in the business.',
    entry: [
      { account: 'Cash', side: 'debit', amount: 10000 },
      { account: OWNER, side: 'credit', amount: 10000 },
    ],
    effect: [
      { account: 'Cash', change: 10000 },
      { account: OWNER, change: 10000 },
    ],
    explain: 'The business receives $10,000 in cash, an asset, and the owner now has a claim on the business of the same amount — equity, recorded in the owner’s capital account.',
    ask: 'What does the business receive, and who now has a claim on it?',
  },
  {
    key: 'bank-loan',
    text: 'The business takes out a five-year bank loan of $5,000.',
    entry: [
      { account: 'Cash', side: 'debit', amount: 5000 },
      { account: 'Bank loan', side: 'credit', amount: 5000, also: LOAN_ALSO },
    ],
    effect: [
      { account: 'Cash', change: 5000 },
      { account: 'Bank loan', change: 5000, also: LOAN_ALSO },
    ],
    explain: 'Borrowing brings $5,000 of cash in, an asset, and creates a debt to the bank of the same amount, a liability — so both sides of the equation rise together.',
    ask: 'What comes into the business, and what does it now owe?',
  },
  {
    key: 'buy-equipment-cash',
    text: 'The business buys equipment for $3,000 cash.',
    entry: [
      { account: 'Equipment', side: 'debit', amount: 3000, also: ['Property, plant and equipment'] },
      { account: 'Cash', side: 'credit', amount: 3000 },
    ],
    effect: [
      { account: 'Equipment', change: 3000, also: ['Property, plant and equipment'] },
      { account: 'Cash', change: -3000 },
    ],
    explain: 'One asset is exchanged for another: $3,000 of equipment comes in and $3,000 of cash goes out, so total assets do not change.',
    ask: 'What does the business gain, and what does it give up for it?',
  },
  {
    key: 'buy-supplies-credit',
    text: 'The business buys $800 of supplies on credit.',
    entry: [
      { account: 'Supplies', side: 'debit', amount: 800 },
      { account: 'Accounts payable', side: 'credit', amount: 800 },
    ],
    effect: [
      { account: 'Supplies', change: 800 },
      { account: 'Accounts payable', change: 800 },
    ],
    explain: 'Supplies worth $800 come in, an asset, and the business now owes the supplier $800, a liability — nothing is paid yet.',
    ask: 'What comes in, and what does buying on credit leave the business owing?',
  },
  {
    key: 'services-cash',
    text: 'The business performs services for a customer and is paid $2,000 in cash.',
    entry: [
      { account: 'Cash', side: 'debit', amount: 2000 },
      { account: 'Service revenue', side: 'credit', amount: 2000, also: ['Revenue'] },
    ],
    effect: [
      { account: 'Cash', change: 2000 },
      { account: OWNER, change: 2000 },
    ],
    explain: 'The business earns $2,000 — revenue, which raises equity — and the cash it receives raises assets by the same amount.',
    ask: 'What does the business receive, and what did it do to earn it?',
  },
  {
    key: 'services-on-account',
    text: 'The business performs $1,500 of services on account.',
    entry: [
      { account: 'Accounts receivable', side: 'debit', amount: 1500 },
      { account: 'Service revenue', side: 'credit', amount: 1500, also: ['Revenue'] },
    ],
    effect: [
      { account: 'Accounts receivable', change: 1500 },
      { account: OWNER, change: 1500 },
    ],
    explain: 'The revenue is earned now, raising equity by $1,500, even though no cash has arrived: the customer owes the business $1,500, an asset.',
    ask: 'The work is done but not yet paid for — what does the business now have, and what has it earned?',
  },
  {
    key: 'collect-receivable',
    text: 'The business collects $1,000 from customers who owed it.',
    entry: [
      { account: 'Cash', side: 'debit', amount: 1000 },
      { account: 'Accounts receivable', side: 'credit', amount: 1000 },
    ],
    effect: [
      { account: 'Cash', change: 1000 },
      { account: 'Accounts receivable', change: -1000 },
    ],
    explain: 'One asset turns into another: cash rises by $1,000 and what customers owe falls by $1,000. There is no new revenue — it was earned when the work was done.',
    ask: 'What comes in, and what does the business no longer have a claim to?',
  },
  {
    key: 'pay-supplier',
    text: 'The business pays $600 it owed to a supplier.',
    entry: [
      { account: 'Accounts payable', side: 'debit', amount: 600 },
      { account: 'Cash', side: 'credit', amount: 600 },
    ],
    effect: [
      { account: 'Accounts payable', change: -600 },
      { account: 'Cash', change: -600 },
    ],
    explain: 'Paying a debt lowers both sides: cash, an asset, falls by $600 and what is owed to the supplier, a liability, falls by $600. It is not an expense — the cost was recorded when the goods came in.',
    ask: 'What goes out, and what does the business no longer owe?',
  },
  {
    key: 'pay-rent',
    text: 'The business pays $1,200 rent for this month.',
    entry: [
      { account: 'Rent expense', side: 'debit', amount: 1200 },
      { account: 'Cash', side: 'credit', amount: 1200 },
    ],
    effect: [
      { account: 'Cash', change: -1200 },
      { account: OWNER, change: -1200 },
    ],
    explain: 'This month’s rent is used up now: an expense, which lowers equity by $1,200, paid with $1,200 of cash, an asset.',
    ask: 'What goes out, and what did the business use up in return?',
  },
  {
    key: 'pay-wages',
    text: 'The business pays its employees $900 in wages.',
    entry: [
      { account: 'Wages expense', side: 'debit', amount: 900 },
      { account: 'Cash', side: 'credit', amount: 900 },
    ],
    effect: [
      { account: 'Cash', change: -900 },
      { account: OWNER, change: -900 },
    ],
    explain: 'Wages are a cost of running the business: an expense of $900, which lowers equity, paid with $900 of cash.',
    ask: 'What goes out, and what did the business get for it?',
  },
  {
    key: 'owner-withdraws',
    text: 'The owner withdraws $500 in cash for personal use.',
    entry: [
      { account: 'Owner’s drawings', side: 'debit', amount: 500 },
      { account: 'Cash', side: 'credit', amount: 500 },
    ],
    effect: [
      { account: 'Cash', change: -500 },
      { account: 'Owner’s drawings', change: 500 },
    ],
    explain: 'Cash, an asset, falls by $500, and the owner’s claim on the business falls by the same amount. It is not an expense — the business did not use it to earn anything — so it is recorded as drawings, which reduce equity.',
    ask: 'What leaves the business, and whose claim on it shrinks?',
  },
  {
    key: 'prepay-insurance',
    text: 'The business pays $1,200 in advance for a year of insurance.',
    entry: [
      { account: 'Prepaid insurance', side: 'debit', amount: 1200, also: ['Prepaid expenses'] },
      { account: 'Cash', side: 'credit', amount: 1200 },
    ],
    effect: [
      { account: 'Prepaid insurance', change: 1200, also: ['Prepaid expenses'] },
      { account: 'Cash', change: -1200 },
    ],
    explain: 'Paying in advance buys a year of cover the business has not used yet — an asset, prepaid insurance — in exchange for $1,200 of cash. It becomes an expense month by month as the cover is used.',
    ask: 'Has the cover been used yet? If not, what does the business hold in place of the cash?',
  },
  {
    key: 'depreciation',
    text: 'The business records $400 of depreciation on its equipment.',
    entry: [
      { account: 'Depreciation expense', side: 'debit', amount: 400 },
      { account: 'Accumulated depreciation', side: 'credit', amount: 400 },
    ],
    effect: [
      { account: 'Accumulated depreciation', change: 400 },
      { account: OWNER, change: -400 },
    ],
    explain: 'Part of the equipment’s cost is used up: an expense of $400, which lowers equity. The equipment account keeps its cost; accumulated depreciation, a contra-asset, rises by $400 and is subtracted from it, so net assets fall by $400.',
    ask: 'What has been used up, and where does the fall in the equipment’s value go?',
    requires: ['Equipment', 'Property, plant and equipment', 'Buildings', 'Vehicles', 'Furniture and fixtures'],
  },
  {
    key: 'buy-inventory-credit',
    text: 'The business buys $2,000 of merchandise on credit, to sell.',
    entry: [
      { account: 'Inventory', side: 'debit', amount: 2000 },
      { account: 'Accounts payable', side: 'credit', amount: 2000 },
    ],
    effect: [
      { account: 'Inventory', change: 2000 },
      { account: 'Accounts payable', change: 2000 },
    ],
    explain: 'Goods to sell come in — inventory, an asset, rises by $2,000 — and the business owes the supplier $2,000, a liability.',
    ask: 'What comes in, and what does the business now owe?',
  },
  {
    key: 'repay-loan',
    text: 'The business repays $1,000 of its bank loan.',
    entry: [
      { account: 'Bank loan', side: 'debit', amount: 1000, also: LOAN_ALSO },
      { account: 'Cash', side: 'credit', amount: 1000 },
    ],
    effect: [
      { account: 'Bank loan', change: -1000, also: LOAN_ALSO },
      { account: 'Cash', change: -1000 },
    ],
    explain: 'Repaying the loan lowers both sides: cash falls by $1,000 and the debt to the bank falls by $1,000. Repaying a loan is not an expense.',
    ask: 'What goes out, and what does the business owe less of?',
  },
  {
    key: 'customer-prepays',
    text: 'A customer pays $700 in advance for work the business will do next month.',
    entry: [
      { account: 'Cash', side: 'debit', amount: 700 },
      { account: 'Unearned revenue', side: 'credit', amount: 700 },
    ],
    effect: [
      { account: 'Cash', change: 700 },
      { account: 'Unearned revenue', change: 700 },
    ],
    explain: 'Cash comes in, but the work is not done, so nothing is earned yet: the business owes the customer the work — a liability called unearned revenue — until it does it.',
    ask: 'The cash is in — but has the business earned it yet? What does it owe the customer?',
  },
];

export const transaction = (key: unknown): Transaction | null => LIBRARY.find((t) => t.key === key) ?? null;

/** The order follow-ups are posed in on a balance sheet: a loan first, then exchanges, then income and costs. */
export const FOLLOW_UPS: readonly string[] = [
  'bank-loan',
  'buy-equipment-cash',
  'buy-supplies-credit',
  'collect-receivable',
  'pay-supplier',
  'services-cash',
  'customer-prepays',
  'prepay-insurance',
  'pay-rent',
  'owner-withdraws',
  'depreciation',
  'repay-loan',
  'buy-inventory-credit',
  'services-on-account',
  'pay-wages',
  'owner-invests',
];

/**
 * The balance-sheet effect a journal entry implies, by the standard rules: a
 * balance-sheet account moves up on its normal side and down on the other;
 * revenue and expenses reach equity through the owner's capital.
 */
export function derivedEffect(entry: readonly JournalLine[]): Effect[] {
  const out = new Map<string, number>();
  const add = (account: string, change: number) => out.set(account, (out.get(account) ?? 0) + change);
  for (const l of entry) {
    const c = classify(l.account);
    if (!c) continue;
    const up = l.side === c.normal ? l.amount : -l.amount;
    if (c.class === 'revenue') add(OWNER, up);
    else if (c.class === 'expense') add(OWNER, -up);
    else add(c.name, up);
  }
  return [...out].filter(([, v]) => v !== 0).map(([account, change]) => ({ account, change }));
}

/** Σ debits and Σ credits of an entry, in cents. */
export function entryTotals(entry: readonly JournalLine[]): { debits: number; credits: number } {
  let debits = 0;
  let credits = 0;
  for (const l of entry) {
    if (l.side === 'debit') debits += Math.round(l.amount * 100);
    else credits += Math.round(l.amount * 100);
  }
  return { debits, credits };
}
