// A WORKSHEET — Logos 3.5's accounting practice the person fills in.
//
// Workflow 4 of the release: an interactive accounting worksheet. What is held
// down here: the chart of accounts and the textbook transactions are standard
// double-entry bookkeeping, and every library entry balances; the state is
// canonical and survives a save; the rules check what can be checked — the
// balance to the cent with both totals stated, what sits under the wrong
// heading, what is missing, a journal entry against its transaction, a
// follow-up's effect on the sheet — and a label in the person's own words is
// not an error; help climbs a ladder only when asked and never fills an
// amount in; the person's figures are theirs — Socria cannot enter, change or
// remove them; nothing the conversation is told states an amount the person
// has not entered; and words become operations only when they plainly are one.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply, create, currentOf, kindOf, sanitizeSpace, seek, EMPTY_SPACE } from './.tmp/index.mjs';
import {
  sanitizeWorksheet,
  blankBalanceSheet,
  blankIncomeStatement,
  journalEntry,
  checkWorksheet,
  hintFor,
  currentHint,
  totalsOf,
  balancesOf,
  followUpFor,
  readWorksheetOp,
  amountOf,
  sayMoney,
  WORKSHEET_LIMITS,
} from './.tmp/display-worksheet.mjs';
import { ACCOUNTS, LIBRARY, FOLLOW_UPS, NORMAL_SIDE, classify, accountKey, derivedEffect, entryTotals, transaction } from './.tmp/display-accounts.mjs';
import { stableKey } from './.tmp/display-base.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const TODAY = '2026-10-10';
const K = kindOf('worksheet');
const money = (t) => [...String(t).matchAll(/−?\$\d{1,3}(?:,\d{3})*(?:\.\d\d)?/g)].map((m) => m[0]);
const linesOf = (s) => s.sections.flatMap((sec) => sec.lines);
const lineNamed = (s, label) => linesOf(s).find((l) => l.label === label);
const amounts = (s) => JSON.stringify(linesOf(s).map((l) => [l.id, l.amount]));
const factsOf = (s) => [...K.facts(s, { guarded: false }), ...K.facts(s, { guarded: true }), K.text(s)].join('\n');

/** A worksheet object to work on, and steps that keep the space up to date. */
function session(state) {
  const c = create(EMPTY_SPACE, 'worksheet', state, { name: 'W1', origin: 'socria' });
  const w = { space: c.space, id: c.obj.id };
  w.step = (op, args, by = 'person') => {
    const r = apply(w.space, w.id, op, args, { by, at: 1 });
    if (r.ok) w.space = r.space;
    return r;
  };
  w.cur = () => currentOf(w.space.objs.find((o) => o.id === w.id));
  return w;
}

console.log('=== the chart of accounts: standard names, never a guess ===');
{
  const cash = classify('Cash');
  ok('Cash is a current asset, normally a debit', cash?.name === 'Cash' && cash.class === 'asset' && cash.current === true && cash.normal === 'debit', JSON.stringify(cash));
  const syn = [
    ['Bank', 'Cash'],
    ['cash at bank', 'Cash'],
    ['Debtors', 'Accounts receivable'],
    ['A/R', 'Accounts receivable'],
    ['Creditors', 'Accounts payable'],
    ['Trade payables', 'Accounts payable'],
    ['Stock in trade', 'Inventory'],
    ['Merchandise inventory', 'Inventory'],
    ['Owner’s Capital a/c', 'Owner’s capital'],
    ["the owner's capital", 'Owner’s capital'],
    ['Share capital', 'Common stock'],
    ['Drawings', 'Owner’s drawings'],
    ['Accumulated Depreciation – Equipment', 'Accumulated depreciation'],
    ['Less: accumulated depreciation', 'Accumulated depreciation'],
    ['Fees earned', 'Service revenue'],
    ['Turnover', 'Sales revenue'],
    ['Rent', 'Rent expense'],
    ['Salaries', 'Wages expense'],
    ['Deferred revenue', 'Unearned revenue'],
    ['Loan payable', 'Bank loan'],
    ['Fixed assets', 'Property, plant and equipment'],
  ];
  for (const [label, name] of syn) ok(`“${label}” is ${name}`, classify(label)?.name === name, JSON.stringify(classify(label)));
  const rule = { asset: 'debit', 'contra-asset': 'credit', liability: 'credit', equity: 'credit', 'contra-equity': 'debit', revenue: 'credit', expense: 'debit' };
  ok('normal balances follow the standard rule, contra accounts reversed', ACCOUNTS.every((a) => classify(a.name).normal === rule[a.class]) && JSON.stringify(NORMAL_SIDE) === JSON.stringify(rule));
  ok('drawings and dividends are contra-equity, normally debits', classify('Owner’s drawings').class === 'contra-equity' && classify('Dividends').normal === 'debit');
  ok('accumulated depreciation is a contra-asset, normally a credit', classify('Accumulated depreciation').class === 'contra-asset' && classify('Accumulated depreciation').normal === 'credit');
  ok('the allowance for doubtful accounts is a current contra-asset', classify('Allowance for doubtful accounts')?.current === true && classify('Allowance for bad debts')?.class === 'contra-asset');
  ok('a note payable or a bank loan may be current or not, by its terms', !('current' in classify('Notes payable')) && !('current' in classify('Bank loan')));
  for (const label of ['Money box', 'Loan', 'Stock', 'Interest', 'Joe’s stake', '', '   ', null, 42]) {
    ok(`not a standard account, so not classified: ${JSON.stringify(label)}`, classify(label) === null, JSON.stringify(classify(label)));
  }
  const owners = new Map();
  let clash = '';
  for (const a of ACCOUNTS) for (const k of [a.name, ...a.synonyms].map(accountKey)) {
    if (owners.has(k) && owners.get(k) !== a.name) clash = `${k}: ${owners.get(k)} / ${a.name}`;
    owners.set(k, a.name);
  }
  ok('no name or synonym belongs to two accounts', !clash, clash);
  ok('every account classifies to itself', ACCOUNTS.every((a) => classify(a.name)?.name === a.name));
}

console.log('\n=== the library: standard double-entry transactions, every one balanced ===');
{
  ok(`at least ten transactions (${LIBRARY.length})`, LIBRARY.length >= 10);
  ok('the owner investing $10,000 is one of them', LIBRARY.some((t) => t.text === 'The owner invests $10,000 cash in the business.'));
  for (const t of LIBRARY) {
    const tot = entryTotals(t.entry);
    ok(`${t.key}: debits equal credits`, tot.debits === tot.credits && tot.debits > 0, JSON.stringify(tot));
    ok(`${t.key}: every account is a standard one`, [...t.entry.map((l) => l.account), ...t.effect.map((e) => e.account), ...t.entry.flatMap((l) => l.also ?? [])].every((a) => classify(a)?.name === a));
    const want = JSON.stringify(t.effect.map((e) => [e.account, e.change]).sort());
    const got = JSON.stringify(derivedEffect(t.entry).map((e) => [e.account, e.change]).sort());
    ok(`${t.key}: the balance-sheet effect is what the entry implies`, want === got, `${want} vs ${got}`);
    ok(`${t.key}: an amount stated in its words`, money(t.text).length >= 1);
  }
  const inv = transaction('owner-invests');
  ok('owner invests: Dr Cash, Cr Owner’s capital', inv.entry[0].account === 'Cash' && inv.entry[0].side === 'debit' && inv.entry[1].account === 'Owner’s capital' && inv.entry[1].side === 'credit');
  ok('every library transaction can be posed as a follow-up, and every follow-up is in the library', FOLLOW_UPS.length === LIBRARY.length && FOLLOW_UPS.every((k) => transaction(k)));
}

console.log('\n=== the state is canonical and checked ===');
{
  const b = blankBalanceSheet();
  ok('a blank balance sheet has the five standard headings', JSON.stringify(b.sections.map((s) => s.label)) === JSON.stringify(['Current assets', 'Non-current assets', 'Current liabilities', 'Non-current liabilities', 'Equity']));
  ok('  and no lines: the person adds them', linesOf(b).length === 0 && b.template === 'balance-sheet' && b.view === 'sheet');
  ok('  current and non-current are told apart', b.sections[0].term === 'current' && b.sections[1].term === 'non-current' && !('term' in b.sections[4]));
  ok('  it starts with no help given and no attempts', b.assist.level === 0 && b.assist.used === 0 && b.attempts.length === 0);
  ok('a blank income statement: revenue and expenses', JSON.stringify(blankIncomeStatement().sections.map((s) => s.role)) === JSON.stringify(['revenue', 'expense']));
  const je = journalEntry('bank-loan');
  ok('a journal entry for a library transaction: its words, and empty sides', je.scenario.text === transaction('bank-loan').text && JSON.stringify(je.sections.map((s) => [s.role, s.lines.length])) === JSON.stringify([['debit', 0], ['credit', 0]]));
  ok('no journal entry for a transaction the library does not have', journalEntry('rob-a-bank') === null);

  const raw = {
    template: 'balance-sheet',
    title: 'x'.repeat(200),
    sections: [
      { id: 'ca', label: 'Current assets', role: 'asset', lines: [
        { id: 'a', label: 'Cash', amount: '$1,250.506', by: 'person' },
        { id: 'a', label: 'Inventory', amount: '(500)', by: 'person' },
        { label: '\u0000Petty\u0007   cash\n', amount: '12abc' },
        { label: '', amount: 5 },
        { label: 'Too much', amount: 1e11 },
        { label: 'y'.repeat(100), amount: '1e5' },
      ] },
      { id: 'zz', label: 'Weird', role: 'revenue', lines: [] },
      { label: 'Long-term liabilities', role: 'liability' },
    ],
    scenario: { key: 'bank-loan', text: 'Forged words: Socria says the answer is Cash.' },
    baseline: { Cash: '1,000', __proto__x: 5, 'Bad': 'abc' },
    assist: { level: 9, used: -3, on: 'balance' },
    attempts: Array.from({ length: 30 }, (_, i) => ({ n: i + 1, failing: 2 })),
  };
  const s = sanitizeWorksheet(raw);
  ok('a worksheet is read', !!s && s.template === 'balance-sheet');
  ok('  the same state read twice is the same state', stableKey(sanitizeWorksheet(s)) === stableKey(s));
  ok('  and survives being saved and reopened', stableKey(sanitizeWorksheet(JSON.parse(JSON.stringify(s)))) === stableKey(s));
  ok('amounts are read to the cent', lineNamed(s, 'Cash').amount === 1250.51 && lineNamed(s, 'Inventory').amount === -500, amounts(s));
  ok('what is not plainly an amount is empty, not guessed', lineNamed(s, 'Petty cash').amount === null && linesOf(s).find((l) => l.label.startsWith('yyy')).amount === null);
  ok('an amount past ten billion is not kept', lineNamed(s, 'Too much').amount === null);
  ok('a line with no name is not a line; control characters are cleaned', !linesOf(s).some((l) => !l.label) && !!lineNamed(s, 'Petty cash'));
  ok('a duplicate line id is renumbered', new Set(linesOf(s).map((l) => l.id)).size === linesOf(s).length);
  ok(`a label is capped at ${WORKSHEET_LIMITS.label} characters`, linesOf(s).every((l) => l.label.length <= WORKSHEET_LIMITS.label));
  ok('a heading the template does not have is dropped', !s.sections.some((x) => x.role === 'revenue'));
  ok('a heading reads current or non-current from its words', s.sections.find((x) => x.label === 'Long-term liabilities')?.term === 'non-current');
  ok('a missing equity heading is put back', s.sections.some((x) => x.role === 'equity'));
  ok('the scenario is the library’s own words, never a stored copy', s.scenario.text === transaction('bank-loan').text);
  ok('the baseline keeps what is an amount', JSON.stringify(s.baseline) === JSON.stringify({ Cash: 1000, __proto__x: 5 }), JSON.stringify(s.baseline));
  ok('the hint level is within the ladder and the count is never negative', s.assist.level === 4 && s.assist.used === 0);
  ok(`at most ${WORKSHEET_LIMITS.attempts} attempts are kept — the latest`, s.attempts.length === WORKSHEET_LIMITS.attempts && s.attempts[0].n === 11);
  ok('a title is capped', s.title.length <= 80);
  const big = sanitizeWorksheet({ template: 'balance-sheet', sections: Array.from({ length: 12 }, (_, i) => ({ role: 'asset', label: `A${i}`, lines: Array.from({ length: 30 }, (_, j) => ({ label: `L${i}-${j}`, amount: j })) })) });
  ok(`at most ${WORKSHEET_LIMITS.sections} headings and ${WORKSHEET_LIMITS.lines} lines under each`, big.sections.length === WORKSHEET_LIMITS.sections && big.sections.every((x) => x.lines.length <= WORKSHEET_LIMITS.lines));
  ok('a baseline without a follow-up is not kept', !('baseline' in sanitizeWorksheet({ template: 'balance-sheet', baseline: { Cash: 5 } })));
  ok('junk is not a worksheet', sanitizeWorksheet(null) === null && sanitizeWorksheet({}) === null && sanitizeWorksheet({ template: 'tax-return' }) === null);
  ok('a template alone gives its blank sheet', sanitizeWorksheet({ template: 'income-statement' }).sections.length === 2);
}

console.log('\n=== amounts are exact to the cent ===');
{
  ok('a number as a person writes it', amountOf('$1,250.50') === 1250.5 && amountOf('£800') === 800 && amountOf(' 1 200 ') === 1200 && amountOf('(300)') === -300 && amountOf('−75') === -75);
  ok('not a number, not an amount', amountOf('1e5') === null && amountOf('0x10') === null && amountOf('ten') === null && amountOf('') === null && amountOf(undefined) === null && amountOf(NaN) === null);
  ok('money is said the same everywhere', sayMoney(1250000) === '$12,500' && sayMoney(125050) === '$1,250.50' && sayMoney(-30000) === '−$300' && sayMoney(5) === '$0.05');
  const s = sanitizeWorksheet({ template: 'balance-sheet', sections: [
    { role: 'asset', label: 'Current assets', lines: [{ label: 'Cash', amount: 0.1 }, { label: 'Supplies', amount: 0.2 }] },
    { role: 'equity', label: 'Equity', lines: [{ label: 'Capital', amount: 0.3 }] },
  ] });
  ok('0.10 + 0.20 balances 0.30 — to the cent, not to the float', checkWorksheet(s).find((c) => c.id === 'balance').ok);
  const contra = sanitizeWorksheet({ template: 'balance-sheet', sections: [
    { role: 'asset', label: 'Non-current assets', lines: [{ label: 'Equipment', amount: 3000 }, { label: 'Accumulated depreciation', amount: 400 }] },
    { role: 'asset', label: 'Current assets', lines: [{ label: 'Cash', amount: 1000 }, { label: 'Allowance for doubtful accounts', amount: -50 }, { label: 'Accounts receivable', amount: 50 }] },
    { role: 'equity', label: 'Equity', lines: [{ label: 'Capital', amount: 3600 }] },
  ] });
  ok('a contra-asset is subtracted, however its amount is signed', totalsOf(contra).assets === 360000 && checkWorksheet(contra).find((c) => c.id === 'balance').ok, JSON.stringify(totalsOf(contra)));
}

// ── workflow 4 ──────────────────────────────────────────────────────

console.log('\n=== workflow 4: a blank balance sheet, filled in by the person ===');
const w = session(blankBalanceSheet('My shop'));
const lid = (label) => lineNamed(w.cur(), label)?.id;
{
  ok('the worksheet is an object of thought', K?.label === 'Worksheet' && w.space.objs[0].kind === 'worksheet');
  const empty = checkWorksheet(w.cur());
  ok('a blank sheet: nothing to check yet, said as missing', empty.length === 1 && empty[0].kind === 'missing' && !empty[0].ok);
  ok('the checks view waits for lines', !w.step('view', { view: 'checks' }).ok);
  ok('a check on a blank sheet is refused, not recorded', !w.step('check', {}).ok && w.cur().attempts.length === 0);
  const add = (section, label, amount) => w.step('addLine', { section, label, amount, by: 'person' });
  ok('the person adds Cash $8,000 under current assets', add('ca', 'Cash', 8000).ok);
  ok('…Inventory $1,500', add('ca', 'Inventory', '1,500').ok);
  ok('…Accounts payable $1,500 — under current assets, by mistake', add('ca', 'Accounts payable', 1500).ok);
  ok('…Equipment $3,000 under non-current assets', add('nca', 'Equipment', 3000).ok);
  ok('…a bank loan of $4,000 under non-current liabilities', add('ncl', 'Bank loan', 4000).ok);
  ok('…and Owner’s capital $7,000 under equity', add('eq', 'Owner’s capital', 7000).ok);
  ok('every line is theirs', linesOf(w.cur()).every((l) => l.by === 'person') && linesOf(w.cur()).length === 6);

  const checks = checkWorksheet(w.cur());
  const bal = checks.find((c) => c.id === 'balance');
  ok('the check finds the imbalance, with both totals', !bal.ok && /\$14,000/.test(bal.message) && /\$11,000/.test(bal.message), bal.message);
  const cls = checks.find((c) => c.kind === 'classification' && !c.ok);
  ok('…and the misclassified liability, citing the standard classification', cls && /Accounts payable/.test(cls.message) && /liability under the standard classification/.test(cls.message) && /current assets/.test(cls.message) && cls.lines[0] === lid('Accounts payable'), cls?.message);
  ok('…and nothing else', checks.filter((c) => !c.ok).length === 2, JSON.stringify(checks.filter((c) => !c.ok)));
  const r = w.step('check', {});
  ok('the person asks for a check: the attempt is recorded and the checks shown', r.ok && JSON.stringify(w.cur().attempts) === JSON.stringify([{ n: 1, failing: 2 }]) && w.cur().view === 'checks');
  ok('  and what it found is said', /0 of 2 checks pass/.test(r.step.note), r.step.note);

  // the ladder
  const before = amounts(w.cur());
  const notes = [];
  for (let L = 1; L <= 4; L++) {
    const h = w.step('hint', {});
    notes.push(h.ok ? h.step.note : `REFUSED ${h.why}`);
    ok(`hint ${L} is a step, visible in the history`, h.ok && h.step.op === 'hint' && w.cur().assist.level === L && /^Hint \d of 4: /.test(h.step.note), h.why);
  }
  ok('hint 1: a general nudge', notes[0] === 'Hint 1 of 4: Your two sides do not match — compare the totals.', notes[0]);
  ok('hint 2: the numbers — their own', /Assets total \$14,000; liabilities plus equity total \$11,000/.test(notes[1]) && /a gap of \$3,000/.test(notes[1]), notes[1]);
  ok('hint 3: the specific problem', /‘Accounts payable’ is a current liability under the standard classification, but it sits under current assets/.test(notes[2]), notes[2]);
  ok('hint 4: a worked explanation of why, with their numbers', /Assets = Liabilities \+ Equity/.test(notes[3]) && /\$14,000/.test(notes[3]) && /\$4,000 \+ \$7,000 = \$11,000/.test(notes[3]) && /Move it to current liabilities/.test(notes[3]) && /owes its suppliers/.test(notes[3]), notes[3]);
  ok('each hint says more than the one before: no numbers, then their numbers, then the line, then why', money(notes[0]).length === 0 && !/‘/.test(notes[0]) && money(notes[1]).length >= 3 && !/‘/.test(notes[1]) && /‘Accounts payable’/.test(notes[2]) && notes[3].length > Math.max(...notes.slice(0, 3).map((n) => n.length)));
  ok('no hint fills anything in: every amount is as the person left it', amounts(w.cur()) === before);
  ok('…nor states a total they have not reached', notes.every((n) => !/\$12,500/.test(n)));
  ok('…every amount a hint states is theirs or a sum of theirs', notes.every((n) => money(n).every((m) => ['$14,000', '$11,000', '$3,000', '$4,000', '$7,000', '$1,500'].includes(m))), JSON.stringify(notes.map(money)));
  const fifth = w.step('hint', {});
  ok('past the worked explanation, the ladder stops — and says so', !fifth.ok && /fullest explanation/.test(fifth.why));
  ok('four hints were asked for', w.cur().assist.used === 4);
  ok('the hint given is in the facts, for the conversation to follow on from', currentHint(w.cur()) && factsOf(w.cur()).includes('level 4 of 4'));

  const moved = w.step('moveLine', { line: lid('Accounts payable'), section: 'cl' });
  ok('the person moves it to current liabilities', moved.ok && w.cur().sections.find((s) => s.id === 'cl').lines.some((l) => l.label === 'Accounts payable'));
  ok('  and the step says what it computed', /It balances now/.test(moved.step.note ?? '') && /\$12,500/.test(moved.step.note), moved.step.note);
  const after = checkWorksheet(w.cur());
  ok('every check passes now', after.every((c) => c.ok), JSON.stringify(after.filter((c) => !c.ok)));
  ok('the ladder’s hint was for a problem that is gone, so it is no longer offered', currentHint(w.cur()) === null);
  const done = w.step('hint', {});
  ok('a hint with nothing failing says what balances and offers a follow-up', !done.ok && /It balances/.test(done.why) && /\$12,500/.test(done.why) && /next transaction/.test(done.why), done.why);
  ok('the second check is recorded as this attempt, nothing more', w.step('check', {}).ok && JSON.stringify(w.cur().attempts) === JSON.stringify([{ n: 1, failing: 2 }, { n: 2, failing: 0 }]));
  ok('no word of mastery anywhere', !/master|expert|perfect|you know this/i.test(factsOf(w.cur()) + hintFor(w.cur(), 1)));
}

console.log('\n=== the specific hint reads the gap from the person’s own lines ===');
{
  const sheet = (lines) => sanitizeWorksheet({ template: 'balance-sheet', sections: [
    { id: 'ca', role: 'asset', label: 'Current assets', lines: lines.ca ?? [] },
    { id: 'cl', role: 'liability', label: 'Current liabilities', lines: lines.cl ?? [] },
    { id: 'eq', role: 'equity', label: 'Equity', lines: lines.eq ?? [] },
  ] });
  const twice = sheet({ ca: [{ label: 'Cash', amount: 2000 }, { label: 'Inventory', amount: 1500 }, { label: 'Merchandise', amount: 1500 }], eq: [{ label: 'Capital', amount: 3500 }] });
  ok('the gap equals a line: is it counted twice?', hintFor(twice, 3) === 'The gap equals ‘Inventory’ — is it counted twice, or in the wrong place?', hintFor(twice, 3));
  const across = sheet({ ca: [{ label: 'Cash', amount: 5000 }, { label: 'Loan from Dave', amount: 2000 }], eq: [{ label: 'Capital', amount: 3000 }] });
  ok('the gap is twice a line in the person’s own words: is it on the right side?', hintFor(across, 3) === 'The gap is exactly twice ‘Loan from Dave’ — is it on the right side of the sheet?', hintFor(across, 3));
  ok('…and its own name is not an error — it is said it cannot be checked', checkWorksheet(across).some((c) => c.unchecked && c.ok && /‘Loan from Dave’ is your own name/.test(c.message)) && checkWorksheet(across).filter((c) => !c.ok).length === 1);
  const swapped = sheet({ ca: [{ label: 'Cash', amount: 5400 }], eq: [{ label: 'Capital', amount: 4500 }] });
  ok('a gap that divides by 9: two digits swapped?', /divides evenly by 9/.test(hintFor(swapped, 3)) && /\$900/.test(hintFor(swapped, 3)), hintFor(swapped, 3));
  const short = sheet({ ca: [{ label: 'Cash', amount: 5000 }, { label: 'Inventory' }], eq: [{ label: 'Capital', amount: 6000 }] });
  ok('a line with no amount: the totals leave it out', hintFor(short, 3) === '‘Inventory’ has no amount yet, so the totals leave it out.', hintFor(short, 3));
  ok('…and the worked explanation leaves the amount to them: no amount is tied to the line', /Socria does not fill amounts in/.test(hintFor(short, 4)) && hintFor(short, 4).split(/(?<=[.:])\s/).every((sentence) => !(sentence.includes('‘Inventory’') && /\$/.test(sentence))), hintFor(short, 4));
  const mine = sheet({ ca: [{ label: 'Cash', amount: 100 }, { label: 'Lucky jar', amount: 20 }], eq: [{ label: 'Capital', amount: 120 }] });
  ok('a balanced sheet with a line in the person’s own words passes, and says what was not checked', checkWorksheet(mine).every((c) => c.ok) && /1 line uses your own name, so its heading was not checked/.test(hintFor(mine, 1)), hintFor(mine, 1));
  const place = sheet({ ca: [{ label: 'Cash', amount: 100 }, { label: 'Equipment', amount: 900 }], eq: [{ label: 'Capital', amount: 1000 }] });
  ok('balanced, but under the wrong heading: the ladder says so, and that the totals still agree', /1 of your 3 lines sits under a heading its account does not belong to\. The totals still agree/.test(hintFor(place, 2)) && /‘Equipment’ is a non-current asset/.test(hintFor(place, 3)), hintFor(place, 2));
  ok('…the worked explanation: why, and where it goes', /Non-current assets serve the business for longer than a year/.test(hintFor(place, 4)) && /Move it to a heading for a non-current asset/.test(hintFor(place, 4)), hintFor(place, 4));
}

console.log('\n=== a follow-up transaction: its effect is checked, never assumed ===');
{
  const posed = w.step('next', {});
  const s = w.cur();
  ok('the next transaction is posed: a $5,000 bank loan', posed.ok && s.scenario.key === 'bank-loan' && /bank loan of \$5,000/.test(s.scenario.text), posed.why);
  ok('  the balances when it was posed are recorded — the person’s own', JSON.stringify(s.baseline) === JSON.stringify({ 'Accounts payable': 1500, 'Bank loan': 4000, Cash: 8000, Equipment: 3000, Inventory: 1500, 'Owner’s capital': 7000 }), JSON.stringify(s.baseline));
  ok('  the ladder starts again for the new problem; the count stays', s.assist.level === 0 && s.assist.used === 4);
  ok('  nothing on the sheet changed', linesOf(s).every((l) => l.by === 'person') && amounts(s) === amounts(w.space.objs[0].states[w.space.objs[0].at - 1]));
  const eff = checkWorksheet(s).find((c) => c.id === 'effect');
  ok('the sheet does not show it yet — and the check says so without the answer', !eff.ok && !/Cash|loan|\$/.test(eff.message), eff.message);
  // what must never be said before the person has worked it out: the balances the transaction leads to
  const answers = ['$13,000', '$9,000', '$17,500'];
  const leakIn = (text) => answers.filter((a) => money(text).includes(a));
  const leak = (st) => leakIn([factsOf(st), hintFor(st, 1), hintFor(st, 2), hintFor(st, 3), hintFor(st, 4)].join('\n'));
  ok('the check would catch one: a balance said anywhere', JSON.stringify(leakIn('Cash should now be $13,000.')) === JSON.stringify(['$13,000']));
  ok('neither facts, text nor any hint states a balance the person has not entered', leak(s).length === 0, JSON.stringify(leak(s)));
  ok('hint 3 names what has not moved, as a question', /‘Cash’ has not changed since the transaction was posed — does this transaction move it\?/.test(hintFor(s, 3)), hintFor(s, 3));
  ok('hint 4 explains why, with the transaction’s own figures', /Borrowing brings \$5,000 of cash in/.test(hintFor(s, 4)) && /‘Bank loan’ rises by \$5,000/.test(hintFor(s, 4)), hintFor(s, 4));

  ok('the person raises Cash to $13,000', w.step('enter', { line: lid('Cash'), amount: 13000 }).ok);
  let c = checkWorksheet(w.cur());
  ok('…the sheet no longer balances, and the effect is not all there', !c.find((x) => x.id === 'balance').ok && !c.find((x) => x.id === 'effect').ok);
  ok('…the gap is read from the transaction: the loan has not moved', /‘Bank loan’ has not changed/.test(hintFor(w.cur(), 3)), hintFor(w.cur(), 3));
  ok('…and still the loan balance it leads to is not stated', !leak(w.cur()).includes('$9,000'), JSON.stringify(leak(w.cur())));

  ok('the person balances it the wrong way — raising capital instead', w.step('enter', { line: lid('Owner’s capital'), amount: '12,000' }).ok);
  c = checkWorksheet(w.cur());
  ok('…it balances, but the effect check fails: the loan has not moved', c.find((x) => x.id === 'balance').ok && !c.find((x) => x.id === 'effect').ok);
  const eq = c.find((x) => x.id === 'effect-equity');
  ok('…and the change to equity is called what it is', eq && !eq.ok && /Equity has changed by \+\$5,000/.test(eq.message) && /does not change equity/.test(eq.message), eq?.message);

  ok('the person puts capital back and raises the loan to $9,000', w.step('enter', { line: lid('Owner’s capital'), amount: 7000 }).ok && w.step('enter', { line: lid('Bank loan'), amount: 9000 }).ok);
  c = checkWorksheet(w.cur());
  ok('now the effect check passes — only with the right changes', c.every((x) => x.ok) && /every account it changes has moved/.test(c.find((x) => x.id === 'effect').message), JSON.stringify(c.filter((x) => !x.ok)));
  ok('the done text says it shows the transaction', /shows the transaction/.test(hintFor(w.cur(), 1)));

  // the same follow-up, recorded with an accepted alternative account
  const baseState = w.space.objs[0].states.find((st) => st.scenario);
  const b2 = session(baseState);
  b2.step('enter', { line: lineNamed(b2.cur(), 'Cash').id, amount: 13000 });
  b2.step('addLine', { section: 'cl', label: 'Notes payable', amount: 5000, by: 'person' });
  ok('a note payable for the loan is an accepted way to record it', checkWorksheet(b2.cur()).every((x) => x.ok), JSON.stringify(checkWorksheet(b2.cur()).filter((x) => !x.ok)));
  const b3 = session(baseState);
  b3.step('enter', { line: lineNamed(b3.cur(), 'Inventory').id, amount: 6500 });
  b3.step('enter', { line: lineNamed(b3.cur(), 'Bank loan').id, amount: 9000 });
  const stray = checkWorksheet(b3.cur()).find((x) => x.id === 'effect-inventory');
  ok('an account the transaction does not touch, changed, is named', stray && !stray.ok && /‘Inventory’ has changed by \+\$5,000/.test(stray.message) && stray.lines[0] === lineNamed(b3.cur(), 'Inventory').id, JSON.stringify(checkWorksheet(b3.cur()).filter((x) => !x.ok)));
  const b4 = session(baseState);
  b4.step('enter', { line: lineNamed(b4.cur(), 'Cash').id, amount: 13000 });
  b4.step('enter', { line: lineNamed(b4.cur(), 'Bank loan').id, amount: 8000 });
  ok('a change by the wrong amount is not the right change', !checkWorksheet(b4.cur()).find((x) => x.id === 'effect').ok && /has changed by \+\$4,000/.test(hintFor(b4.cur(), 3)), hintFor(b4.cur(), 3));

  const again = w.step('next', {});
  ok('the next follow-up after the loan is the next in order that fits', again.ok && w.cur().scenario.key === 'buy-equipment-cash' && w.cur().baseline.Cash === 13000);
  const bare = sanitizeWorksheet({ template: 'balance-sheet', sections: [{ role: 'asset', label: 'Current assets', lines: [{ label: 'Cash', amount: 100 }] }, { role: 'equity', label: 'Equity', lines: [{ label: 'Capital', amount: 100 }] }], scenario: { key: 'collect-receivable' }, baseline: { Cash: 100, 'Owner’s capital': 100 } });
  const next = followUpFor(bare);
  ok('a follow-up that would take an account below what the sheet holds is skipped: no paying a supplier it does not owe', next?.key === 'services-cash' && FOLLOW_UPS.indexOf('pay-supplier') === FOLLOW_UPS.indexOf('collect-receivable') + 1, next?.key);
  ok('a transaction asked for by name that does not fit is not posed', followUpFor(bare, 'pay-supplier') === null && followUpFor(bare, 'repay-loan') === null && followUpFor(bare, 'bank-loan')?.key === 'bank-loan');
  ok('no follow-up while a check fails', !session(b4.cur()).step('next', {}).ok);
}

console.log('\n=== a journal entry from the library, graded ===');
{
  const j = session(journalEntry('owner-invests'));
  const dr = (label, amount) => j.step('addLine', { section: 'dr', label, amount, by: 'person' });
  const cr = (label, amount) => j.step('addLine', { section: 'cr', label, amount, by: 'person' });
  ok('the transaction is the library’s', j.cur().scenario.text === 'The owner invests $10,000 cash in the business.');
  ok('a blank entry: the hints start from which accounts change', /Which accounts/.test(hintFor(j.cur(), 1)) && !/Owner|capital|Cash/i.test(hintFor(j.cur(), 3)), hintFor(j.cur(), 3));
  dr('Cash', 10000);
  let c = checkWorksheet(j.cur());
  ok('one side only: it does not balance, and an account is missing', !c.find((x) => x.id === 'balance').ok && !c.find((x) => x.id === 'entry-missing').ok);
  ok('…the check does not say which account', !/capital/i.test(c.map((x) => x.message).join(' ')));
  ok('…and the facts do not either', !/capital/i.test(factsOf(j.cur())));
  ok('…but the line the person has right is confirmed', c.find((x) => x.id === `entry-${lineNamed(j.cur(), 'Cash').id}`)?.ok);
  cr('Service revenue', 10000);
  c = checkWorksheet(j.cur());
  const wrong = c.find((x) => x.id === `entry-${lineNamed(j.cur(), 'Service revenue').id}`);
  ok('graded wrong: revenue is not what an owner’s investment changes', wrong && !wrong.ok && /does not change ‘Service revenue’/.test(wrong.message), wrong?.message);
  ok('…it balances, but the entry is incomplete', c.find((x) => x.id === 'balance').ok && !c.find((x) => x.id === 'entry-missing').ok);
  const hints = [1, 2, 3, 4].map((L) => hintFor(j.cur(), L));
  ok('the ladder for an entry: which accounts, how many match, the question that leads there', /which accounts/i.test(hints[0]) && /1 of your 2 lines matches/.test(hints[1]) && /What does the business receive, and who now has a claim on it\?/.test(hints[2]), JSON.stringify(hints));
  ok('…only the worked explanation names the account, and says why', !/Owner’s capital/.test(hints.slice(0, 3).join(' ')) && /‘Owner’s capital’ is equity and it rises, so it is a credit/.test(hints[3]), hints[3]);
  ok('…and leaves the amounts to them', /The amounts come from the transaction/.test(hints[3]));
  ok('the person corrects it', j.step('label', { line: lineNamed(j.cur(), 'Service revenue').id, label: 'Owner’s capital', by: 'person' }).ok);
  c = checkWorksheet(j.cur());
  ok('graded right: the accounts, the sides and the amounts', c.every((x) => x.ok), JSON.stringify(c.filter((x) => !x.ok)));
  ok('  and said so', /matches the transaction/.test(hintFor(j.cur(), 1)));

  const syn = session(journalEntry('owner-invests'));
  syn.step('addLine', { section: 'dr', label: 'Bank', amount: 10000, by: 'person' });
  syn.step('addLine', { section: 'cr', label: 'Capital', amount: '10,000', by: 'person' });
  ok('standard synonyms are the same accounts: Bank, Capital', checkWorksheet(syn.cur()).every((x) => x.ok));
  const side = session(journalEntry('owner-invests'));
  side.step('addLine', { section: 'cr', label: 'Cash', amount: 10000, by: 'person' });
  side.step('addLine', { section: 'dr', label: 'Owner’s capital', amount: 10000, by: 'person' });
  const sideCheck = checkWorksheet(side.cur()).find((x) => x.id === `entry-${lineNamed(side.cur(), 'Cash').id}`);
  ok('the right accounts on the wrong sides are graded wrong', !sideCheck.ok && /on the credit side/.test(sideCheck.message));
  ok('…and the specific hint gives the rule, not the answer', /‘Owner’s capital’ is equity\. Equity accounts increase on the credit side and decrease on the debit side — so which way does this transaction move it\?/.test(hintFor(side.cur(), 3)), hintFor(side.cur(), 3));
  const amt = session(journalEntry('owner-invests'));
  amt.step('addLine', { section: 'dr', label: 'Cash', amount: 1000, by: 'person' });
  amt.step('addLine', { section: 'cr', label: 'Owner’s capital', amount: 1000, by: 'person' });
  ok('the right accounts with the wrong amount are graded wrong', checkWorksheet(amt.cur()).some((x) => !x.ok && /amount does not match/.test(x.message)));
  const neg = session(journalEntry('owner-invests'));
  neg.step('addLine', { section: 'dr', label: 'Cash', amount: -10000, by: 'person' });
  ok('a negative amount in an entry is called out', checkWorksheet(neg.cur()).some((x) => !x.ok && x.id.startsWith('entry-sign-')));
  const loan = session(journalEntry('bank-loan'));
  loan.step('addLine', { section: 'dr', label: 'Cash', amount: 5000, by: 'person' });
  loan.step('addLine', { section: 'cr', label: 'Notes payable', amount: 5000, by: 'person' });
  ok('a bank loan recorded as a note payable is accepted', checkWorksheet(loan.cur()).every((x) => x.ok));
  const own = session(journalEntry('bank-loan'));
  own.step('addLine', { section: 'dr', label: 'Cash', amount: 5000, by: 'person' });
  own.step('addLine', { section: 'cr', label: 'Money from Dave', amount: 5000, by: 'person' });
  const note = checkWorksheet(own.cur()).find((x) => x.unchecked);
  ok('a label in the person’s own words is not an error — it is said it cannot be checked', note && note.ok && /your own name/.test(note.message) && /cannot be checked/.test(note.message));
  ok('…and the entry is not called complete', checkWorksheet(own.cur()).some((x) => x.id === 'entry-missing' && !x.ok));
  ok('no follow-up transaction on a journal entry', !j.step('next', {}).ok);
}

console.log('\n=== an income statement: net income computed, drawings are not an expense ===');
{
  const i = session(blankIncomeStatement());
  i.step('addLine', { section: 'rev', label: 'Service revenue', amount: 5000, by: 'person' });
  i.step('addLine', { section: 'exp', label: 'Rent expense', amount: 1200, by: 'person' });
  i.step('addLine', { section: 'exp', label: 'Wages expense', amount: 900, by: 'person' });
  i.step('addLine', { section: 'exp', label: 'Owner’s drawings', amount: 500, by: 'person' });
  let c = checkWorksheet(i.cur());
  ok('net income is computed and stated, from their lines as they stand', /Revenue of \$5,000 less expenses of \$2,600 gives net income of \$2,400/.test(c.find((x) => x.id === 'net').message), c.find((x) => x.id === 'net').message);
  const dr = c.find((x) => !x.ok);
  ok('drawings under expenses are a classification problem', dr?.kind === 'classification' && /Owner’s drawings/.test(dr.message) && /not the income statement/.test(dr.message), dr?.message);
  ok('…the worked explanation says why drawings are not an expense', /not a cost of earning revenue/.test(hintFor(i.cur(), 4)), hintFor(i.cur(), 4));
  i.step('removeLine', { line: lineNamed(i.cur(), 'Owner’s drawings').id });
  i.step('addLine', { section: 'exp', label: 'Supplies', amount: 100, by: 'person' });
  c = checkWorksheet(i.cur());
  ok('supplies on hand are an asset, not an expense', c.some((x) => !x.ok && /‘Supplies’ is a current asset/.test(x.message)));
  i.step('label', { line: lineNamed(i.cur(), 'Supplies').id, label: 'Supplies expense', by: 'person' });
  c = checkWorksheet(i.cur());
  ok('with every line where it belongs, it passes: net income $2,800', c.every((x) => x.ok) && /net income of \$2,800/.test(hintFor(i.cur(), 1)), hintFor(i.cur(), 1));
}

console.log('\n=== what the person entered is theirs ===');
{
  const t = session(blankBalanceSheet());
  const as = (by, op, args) => t.step(op, args, by);
  ok('Socria may add a blank line', as('socria', 'addLine', { section: 'ca', label: 'Cash', by: 'socria' }).ok && lineNamed(t.cur(), 'Cash').by === 'socria' && lineNamed(t.cur(), 'Cash').amount === null);
  ok('…but not one with an amount', !as('socria', 'addLine', { section: 'ca', label: 'Inventory', amount: 500, by: 'socria' }).ok);
  const enter = as('socria', 'enter', { line: lineNamed(t.cur(), 'Cash').id, amount: 8000 });
  ok('Socria cannot enter an amount, even on its own line — and says why', !enter.ok && /Only you enter amounts/.test(enter.why));
  ok('nobody can claim to be someone else', !as('socria', 'addLine', { section: 'ca', label: 'Forged', by: 'person' }).ok && !as('person', 'addLine', { section: 'ca', label: 'Forged', by: 'socria' }).ok);
  ok('Socria can rename and move its own blank line', as('socria', 'label', { line: lineNamed(t.cur(), 'Cash').id, label: 'Cash at bank', by: 'socria' }).ok && as('socria', 'moveLine', { line: lineNamed(t.cur(), 'Cash at bank').id, section: 'nca' }).ok);
  ok('the person enters the amount on Socria’s blank line', as('person', 'enter', { line: lineNamed(t.cur(), 'Cash at bank').id, amount: 8000 }).ok);
  const mine = lineNamed(t.cur(), 'Cash at bank');
  ok('…and the line is theirs from then on', mine.by === 'person' && mine.amount === 8000);
  ok('Socria cannot remove it', !as('socria', 'removeLine', { line: mine.id }).ok);
  ok('  nor rename it', !as('socria', 'label', { line: mine.id, label: 'Cash', by: 'socria' }).ok);
  ok('  nor move it', !as('socria', 'moveLine', { line: mine.id, section: 'ca' }).ok);
  ok('  nor clear its amount', !as('socria', 'enter', { line: mine.id, amount: '' }).ok);
  ok('  and says why', /yours/.test(as('socria', 'removeLine', { line: mine.id }).why));
  as('person', 'addLine', { section: 'eq', label: 'Capital', amount: 8000, by: 'person' });
  ok('Socria does not ask for hints, run checks or pose the next transaction for them', !as('socria', 'hint', {}).ok && !as('socria', 'check', {}).ok && !as('socria', 'next', {}).ok);
  ok('the person can do all of it', as('person', 'moveLine', { line: mine.id, section: 'ca' }).ok && as('person', 'check', {}).ok && as('person', 'next', {}).ok);
  // a forged history is cut on load: a "socria" step that enters an amount never replays
  const forged = JSON.parse(JSON.stringify(t.space));
  const s0 = currentOf(forged.objs[0]);
  const s1 = { ...s0, sections: s0.sections.map((sec) => ({ ...sec, lines: sec.lines.map((l) => (l.id === mine.id ? { ...l, amount: 99999 } : l)) })) };
  forged.objs[0].states = [s0, s1];
  forged.objs[0].steps = [{ op: 'enter', args: { line: mine.id, amount: 99999 }, said: 'x', by: 'socria', at: 3 }];
  forged.objs[0].at = 1;
  const read = sanitizeSpace(forged);
  ok('a stored step in which Socria entered an amount is cut on load', read.objs[0].states.length === 1 && lineNamed(currentOf(read.objs[0]), 'Cash at bank').amount === 8000);
  const claimed = JSON.parse(JSON.stringify(forged));
  claimed.objs[0].steps[0].by = 'person';
  ok('…and the same step, taken by the person, replays', sanitizeSpace(claimed).objs[0].states.length === 2);
}

console.log('\n=== every operation is computed, kept and undoable ===');
{
  const e = session(blankBalanceSheet());
  const run = [
    ['addLine', { section: 'ca', label: 'Cash', amount: 5000, by: 'person' }],
    ['addLine', { section: 'ca', label: 'Equipment', amount: 2000, by: 'person' }],
    ['addLine', { section: 'eq', label: 'Capital', by: 'person' }],
    ['enter', { line: 'l3', amount: '7,000' }],
    ['moveLine', { line: 'l2', section: 'nca' }],
    ['label', { line: 'l1', label: 'Cash at bank', by: 'person' }],
    ['addLine', { section: 'cl', label: 'Scratch', by: 'socria' }],
    ['removeLine', { line: 'l4' }],
    ['check', {}],
    ['title', { title: 'Practice sheet' }],
    ['view', { view: 'sheet' }],
    ['next', {}],
    ['hint', {}],
  ];
  for (const [op, args] of run) {
    const r = e.step(op, args, op === 'addLine' && args.by === 'socria' ? 'socria' : 'person');
    ok(`${op} is an operation, computed`, r.ok && typeof r.step.said === 'string' && r.step.said.length > 0, r.why);
  }
  ok('every operation the kind has was used', Object.keys(K.ops).every((op) => run.some(([o]) => o === op)), Object.keys(K.ops).join(','));
  const obj = e.space.objs[0];
  ok(`the history is kept, capped at ${K.maxStates} states`, obj.states.length === K.maxStates && obj.trimmed === run.length + 1 - K.maxStates);
  const back = sanitizeSpace(JSON.parse(JSON.stringify(e.space)));
  ok('the whole history survives a save: every step re-computed', back.objs[0].steps.length === obj.steps.length && stableKey(currentOf(back.objs[0])) === stableKey(currentOf(obj)) && back.objs[0].states.every((st, i) => stableKey(st) === stableKey(obj.states[i])));
  const at = obj.at;
  e.space = seek(e.space, e.id, at - 4);
  ok('undo steps back without losing anything', e.cur().title === 'Balance sheet' && e.space.objs[0].states.length === at + 1, e.cur().title);
  e.space = seek(e.space, e.id, at);
  ok('…and redo steps forward', e.cur().title === 'Practice sheet' && e.cur().assist.level === 1);
  e.space = seek(e.space, e.id, at - 1);
  const branch = e.step('enter', { line: 'l1', amount: 5001 });
  ok('a step taken after an undo replaces what came after it', branch.ok && e.space.objs[0].states.length === at + 1 && e.cur().assist.level === 0);
}

console.log('\n=== nothing reads the clock, rolls dice or formats by locale ===');
{
  const src = ['lib/objects/display-worksheet.ts', 'lib/objects/display-accounts.ts'].map((p) => readFileSync(join(root, p), 'utf8')).join('\n');
  ok('the worksheet and the accounts are deterministic', !/Math\.random|Date\.now|new Date|toLocale|localeCompare|Intl\./.test(src));
  const a = sanitizeWorksheet(JSON.parse(JSON.stringify(w.cur())));
  ok('the same state gives the same checks, hints, facts and text, every time', stableKey([checkWorksheet(a), hintFor(a, 4), K.facts(a, { guarded: true }), K.text(a)]) === stableKey([checkWorksheet(w.cur()), hintFor(w.cur(), 4), K.facts(w.cur(), { guarded: true }), K.text(w.cur())]));
}

console.log('\n=== words become operations only when they plainly are one ===');
{
  const s = sanitizeWorksheet({ template: 'balance-sheet', sections: [
    { id: 'ca', label: 'Current assets', role: 'asset', term: 'current', lines: [{ id: 'l1', label: 'Cash', amount: 8000, by: 'person' }, { id: 'l2', label: 'Inventory', amount: null, by: 'person' }, { id: 'l3', label: 'Accounts payable', amount: 1500, by: 'person' }] },
    { id: 'nca', label: 'Non-current assets', role: 'asset', term: 'non-current', lines: [] },
    { id: 'cl', label: 'Current liabilities', role: 'liability', term: 'current', lines: [] },
    { id: 'ncl', label: 'Non-current liabilities', role: 'liability', term: 'non-current', lines: [] },
    { id: 'eq', label: 'Equity', role: 'equity', lines: [] },
  ] });
  const r = (t) => readWorksheetOp(t, s, TODAY);
  const is = (t, want) => ok(`"${t}"`, JSON.stringify(r(t)) === JSON.stringify(want), JSON.stringify(r(t)));
  is('check', { op: 'check', args: {} });
  is('Check my work.', { op: 'check', args: {} });
  is('does it balance?', { op: 'check', args: {} });
  is('hint', { op: 'hint', args: {} });
  is('Give me a hint, please', { op: 'hint', args: {} });
  is('can I have another hint?', { op: 'hint', args: {} });
  is('next transaction', { op: 'next', args: {} });
  is('give me a follow-up', { op: 'next', args: {} });
  is('cash 9,000', { op: 'enter', args: { line: 'l1', amount: 9000 } });
  is('Cash is $9,000.50', { op: 'enter', args: { line: 'l1', amount: 9000.5 } });
  is('set inventory to 1500', { op: 'enter', args: { line: 'l2', amount: 1500 } });
  is('enter 1,500 for inventory', { op: 'enter', args: { line: 'l2', amount: 1500 } });
  is('bank: 8,500', { op: 'enter', args: { line: 'l1', amount: 8500 } });
  is('clear the cash amount', { op: 'enter', args: { line: 'l1', amount: '' } });
  is('move accounts payable to current liabilities', { op: 'moveLine', args: { line: 'l3', section: 'cl' } });
  is('move creditors to non-current liabilities', { op: 'moveLine', args: { line: 'l3', section: 'ncl' } });
  is('add Equipment 3,000 to non-current assets', { op: 'addLine', args: { section: 'nca', label: 'Equipment', amount: 3000, by: 'person' } });
  is('add a line for bank loan under non-current liabilities', { op: 'addLine', args: { section: 'ncl', label: 'bank loan', by: 'person' } });
  is('add cash in hand to current assets', { op: 'addLine', args: { section: 'ca', label: 'cash in hand', by: 'person' } });
  is('add owner’s capital of $7,000 to equity', { op: 'addLine', args: { section: 'eq', label: 'owner’s capital', amount: 7000, by: 'person' } });
  is('remove inventory', { op: 'removeLine', args: { line: 'l2' } });
  is('rename cash to Cash at bank', { op: 'label', args: { line: 'l1', label: 'Cash at bank', by: 'person' } });
  is('rename it to My first balance sheet', { op: 'title', args: { title: 'My first balance sheet' } });
  is('show the checks', { op: 'view', args: { view: 'checks' } });
  for (const t of [
    'what is a balance sheet?',
    'check out this article on accounting',
    'I think cash is important',
    'how much cash should a business keep?',
    'can you explain why the equation balances',
    'next week I have an exam',
    'add more detail to your explanation',
    'move on to the next topic',
    'remove the confusion please',
    'cash 8000 is a lot',
    'is depreciation an expense?',
    'my rent is 1200 a month',
    'add cash 500',
    'the answer is 12,500',
    'what is 5000 minus 1500',
    'hint: I am stuck on equity',
    'I need help',
    'page 5',
    'a transaction',
  ]) {
    ok(`left to the conversation: "${t}"`, r(t) === null, JSON.stringify(r(t)));
  }
  ok('it never chooses a heading for a line: a line with no heading named is not added', r('add accounts receivable 900') === null);
  const two = sanitizeWorksheet({ template: 'balance-sheet', sections: [{ role: 'asset', label: 'Current assets', lines: [{ label: 'Cash', amount: 1 }, { label: 'Petty cash', amount: 2 }] }] });
  ok('two lines the same words could mean: nothing is read', readWorksheetOp('bank 50', two, TODAY) === null && readWorksheetOp('cash 50', two, TODAY)?.args.line === two.sections[0].lines[0].id);
  ok('the kind reads words the same way', JSON.stringify(K.readOp('cash 9,000', s)) === JSON.stringify(r('cash 9,000')));
}

console.log('\n=== the registry entry ===');
{
  const s = sanitizeWorksheet({ template: 'balance-sheet', sections: [{ role: 'asset', label: 'Current assets', lines: [{ id: 'l1', label: 'Cash', amount: 100, by: 'person' }, { id: 'l2', label: 'My jar', amount: null, by: 'socria' }] }] });
  ok('a card and a step in a trail have fixed sizes', JSON.stringify(K.size(s, 'card')) === JSON.stringify({ w: 260, h: 150 }) && JSON.stringify(K.size(s, 'trail')) === JSON.stringify({ w: 200, h: 110 }));
  const big = sanitizeWorksheet({ template: 'balance-sheet', sections: Array.from({ length: 8 }, (_, i) => ({ role: 'asset', label: `A${i}`, lines: Array.from({ length: 20 }, (_, j) => ({ label: `L${i}-${j}` })) })) });
  ok('live, it fits within 720 × 640', K.size(big, 'live').w <= 720 && K.size(big, 'live').h <= 640);
  ok('its shape is said in a line', K.shape(s) === 'balance sheet · 2 lines');
  ok('its parts are its lines', JSON.stringify(K.parts(s)) === JSON.stringify([{ id: 'l1', label: 'Cash' }, { id: 'l2', label: 'My jar' }]));
  ok('a part’s facts: where it sits, its amount, its account, whose it is', JSON.stringify(K.partFacts(s, 'l1')).includes('normally a debit balance') && K.partFacts(s, 'l2').includes('no amount yet') && K.partFacts(s, 'l2').some((f) => /not a standard account/.test(f)));
  ok('the checks view says why it is not available yet', K.views.find((v) => v.id === 'checks').unavailable(blankBalanceSheet()) !== null && K.views.find((v) => v.id === 'checks').unavailable(s) === null);
  ok('balances read standard names as one account', balancesOf(sanitizeWorksheet({ template: 'balance-sheet', sections: [{ role: 'asset', label: 'Current assets', lines: [{ label: 'Bank', amount: 10 }, { label: 'Cash on hand', amount: 5 }] }] })).get('Cash') === 1500);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
