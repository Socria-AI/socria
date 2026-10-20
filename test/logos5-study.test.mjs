// LOGOS 5 — FILES SORTED INTO TOPICS, AND PRACTICE MADE FROM THEM.
//
// lib/logos5/study.ts keeps what a model says about a person's files only as
// far as the files bear it out. Held down here: a quote shown is cut from its
// passage (or is the passage's own nearest sentence), never the model's
// words; a passage key that does not exist is dropped, and a topic nothing
// backs; links only point back; journal-entry events keep only the files'
// numbers and only entries that balance; a hint that names the answer is
// replaced; checking is exact and matches lines by account in either order;
// a study survives being saved through the map and read back — and a check
// is never trusted from storage.

import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'logos5-study');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const entry = join(OUT, 'entry.ts');
writeFileSync(
  entry,
  [
    `export * from ${JSON.stringify(join(root, 'lib/logos5/study.ts'))};`,
    `export { sortAsk, entriesAsk, practiceMaterial } from ${JSON.stringify(join(root, 'lib/logos5/study-ask.ts'))};`,
    `export { sanitizeMap } from ${JSON.stringify(join(root, 'lib/logos.ts'))};`,
    `export { create, sanitizeSpace } from ${JSON.stringify(join(root, 'lib/objects/index.ts'))};`,
    `export { restudy, studyIn, STUDY } from ${JSON.stringify(join(root, 'lib/objects/display-study.ts'))};`,
    `export { objectsBlock } from ${JSON.stringify(join(root, 'lib/objects/index.ts'))};`,
    `export { universeOf, clusterMatches } from ${JSON.stringify(join(root, 'lib/logos5/universe.ts'))};`,
  ].join('\n')
);
await build({ entryPoints: { study: entry }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error', alias: { '@': root } });
const S = await import(pathToFileURL(join(OUT, 'study.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const J = JSON.stringify;

const block = (id, kind, text, extra = {}) => ({ id, page: Number(id.slice(1).split('.')[0]), kind, text, method: 'text', ...extra });
const doc = (id, name, blocks, pageCount = 8) => ({ v: 1, id, name, format: 'pdf', pageCount, pages: [], blocks, tables: [], figures: [], checks: [] });

const ch5 = doc('aaaaaaaaaaaaaaaa', 'Ch5_Adjusting_Entries.pdf', [
  block('p1.1', 'header', 'ACCT 2301 — Chapter 5'),
  block('p2.1', 'heading', 'Accruals and deferrals', { level: 1 }),
  block('p2.2', 'paragraph', 'Adjusting entries make sure revenues are recorded when earned and expenses when incurred. They are made at the end of each period, before the financial statements.'),
  block('p4.1', 'heading', 'Accrued expenses', { level: 2 }),
  block('p4.2', 'paragraph', 'On March 31, employees had earned wages of $1,200 that will not be paid until April 3.'),
  block('p7.1', 'heading', 'Prepaid expenses', { level: 2 }),
  block('p7.2', 'paragraph', 'On March 1 the company paid $6,000 for six months of rent in advance. Each month, one month of rent is used up and becomes rent expense.'),
]);
const review = doc('bbbbbbbbbbbbbbbb', 'Exam 2 review sheet.pdf', [
  block('p1.1', 'heading', 'Exam 2 review', { level: 1 }),
  block('p1.2', 'paragraph', 'Q3. The company provided $2,500 of services on account that it has not billed. Record the adjusting entry.'),
  block('p1.3', 'paragraph', 'Before adjustments, total assets were $24,350, liabilities $9,100 and equity $15,250.'),
], 4);
const docs = [ch5, review];

// ── intent ───────────────────────────────────────────────────────────
ok('exam words read as studying for an exam', S.intentOf('help me get ready for exam 2 on thursday', 2) === 'exam');
ok('homework reads as an assignment', S.intentOf('homework due friday', 0) === 'assignment');
ok('files and no words read as making sense of files', S.intentOf('', 3) === 'files');
ok('a plain question is thinking something through', S.intentOf('should I take the job?', 0) === 'think');

// ── the material ─────────────────────────────────────────────────────
const mat = S.materialFor(docs);
ok('passages carry their keys', mat.text.includes('[1:p4.2]') && mat.text.includes('[2:p1.2]'), mat.text.slice(0, 200));
ok('running heads are not shown', !mat.text.includes('Chapter 5'));
ok('keys parse back', J(S.parseKey('2:p1.3')) === J({ file: 1, block: 'p1.3' }) && S.parseKey('x:p1') === null);
const tight = S.materialFor(docs, 260);
ok('a small budget is shared across files and what was left is counted', tight.text.includes('[1:') && tight.text.includes('[2:') && tight.left > 0, J(tight));

// ── verbatim ─────────────────────────────────────────────────────────
const p72 = ch5.blocks.find((b) => b.id === 'p7.2').text;
ok('a quote the passage holds is cut from the passage', S.verbatimFrom(p72, 'paid $6,000 for six months of rent in advance') === 'paid $6,000 for six months of rent in advance');
ok('typographic quotes and case do not stop a match, and the file’s spelling is kept', S.verbatimFrom('The “matching” principle applies.', 'the "matching" PRINCIPLE applies') === 'The “matching” principle applies');
const para = S.verbatimFrom(p72, 'Every month a portion of prepaid rent turns into an expense on the income statement');
ok('a paraphrase is replaced by the passage’s nearest own sentence', para === 'Each month, one month of rent is used up and becomes rent expense.', para);
ok('no quote at all gives the first sentence', S.verbatimFrom(p72, '').startsWith('On March 1 the company paid'));

// ── the sort, as kept ────────────────────────────────────────────────
const raw = {
  course: 'ACCT 2301 · Exam 2',
  topics: [
    { title: 'Accruals vs. deferrals', kind: 'foundation', summary: 'When revenue and expense are recorded.', blocks: ['1:p2.1', '1:p2.2', '9:p1.1', '1:p99.1'], quotes: [{ block: '1:p2.2', text: 'revenues are recorded when earned and expenses when incurred' }], after: [] },
    { title: 'Accrued wages', kind: 'procedure', summary: 'Wages earned, not paid.', blocks: ['1:p4.2'], quotes: [{ block: '1:p4.2', text: 'Workers are owed money at month end' }], after: [0, 1, 5] },
    { title: 'Invented topic', kind: 'concept', summary: 'Nothing backs this.', blocks: ['3:p1.1'], quotes: [{ block: '3:p1.1', text: 'made up' }] },
    { title: 'Review questions', kind: 'review', blocks: ['2:p1.2', '2:p1.3'], quotes: [], after: ['t1'] },
    { title: 'Bad kind', kind: 'weird', blocks: ['1:p7.2'], quotes: [{ block: '1:p7.2', text: 'rent is used up' }] },
  ],
  start: 0,
  why: 'Everything else rests on when things are recorded.',
};
const sorted = S.sanitizeSorted(raw, docs);
ok('a topic nothing in the files backs is dropped', sorted.topics.length === 4 && !sorted.topics.some((t) => t.title === 'Invented topic'), J(sorted.topics.map((t) => t.title)));
ok('keys that do not exist are dropped', J(sorted.topics[0].blocks.map((b) => b.block)) === J(['p2.1', 'p2.2']));
ok('quotes carry their page and document', sorted.topics[0].quotes[0].page === 2 && sorted.topics[0].quotes[0].doc === ch5.id);
ok('a paraphrased quote shows the passage’s own sentence', sorted.topics[1].quotes[0].text === 'On March 31, employees had earned wages of $1,200 that will not be paid until April 3.', sorted.topics[1].quotes[0].text);
ok('a topic with no quotes shows its first passage’s own sentence', sorted.topics[2].quotes[0].text.startsWith('Q3. The company provided $2,500'));
ok('links point only to earlier topics, never itself or past the list', J(sorted.topics[1].after) === J(['t1']) && J(sorted.topics[2].after) === J(['t1']));
ok('an unknown kind becomes a concept', sorted.topics[3].kind === 'concept');
ok('the course and the start are kept', sorted.course === 'ACCT 2301 · Exam 2' && sorted.start === 't1');
ok('sources count distinct passages', S.sourcesOf(sorted.topics[2]) === 2);
ok('nothing usable is null', S.sanitizeSorted({ topics: [{ title: 'x', blocks: ['7:p1.1'] }] }, docs) === null && S.sanitizeSorted('nonsense', docs) === null);
ok('at most nine topics', S.sanitizeSorted({ topics: Array.from({ length: 14 }, (_, i) => ({ title: `T${i}`, blocks: ['1:p2.2'] })) }, docs).topics.length === 9);

const plain = S.plainSort(docs);
ok('with no model, the files’ own headings make the topics', plain && plain.topics.map((t) => t.title).includes('Accruals and deferrals') && plain.topics.map((t) => t.title).includes('Exam 2 review'), J(plain?.topics.map((t) => t.title)));
ok('plain topics still quote only the files', plain.topics.every((t) => t.quotes.every((q) => docs.find((d) => d.id === q.doc).blocks.find((b) => b.id === q.block).text.includes(q.text.replace(/…$/, '')))));
ok('the plain sort calls a review heading review questions', plain.topics.find((t) => t.title === 'Exam 2 review').kind === 'review');

ok('recommend prefers a foundation others build on', S.recommend(sorted.topics) === 't1');
const rows = S.boardRows(sorted.topics, 't1');
ok('a board of four: three lead, the start in the middle, the rest beneath', rows.lead.length === 3 && rows.lead[1] === 't1' && rows.rest.length === 1, J(rows));
const few = S.boardRows(sorted.topics.slice(0, 3), 't1');
ok('three topics or fewer are all lead', few.lead.length === 3 && few.rest.length === 0);
const src = (id, n) => ({ id, quotes: [], blocks: Array.from({ length: n }, (_, k) => ({ doc: 'aaaaaaaaaaaaaaaa', block: `p${k + 1}.1` })), after: [] });
const big = S.boardRows([src('t1', 1), src('t2', 6), src('t3', 2), src('t4', 8), src('t5', 1)], 't3');
ok('the lead beside the start are the topics the files say most about', J(big.lead) === J(['t2', 't3', 't4']) && J(big.rest) === J(['t1', 't5']), J(big));
ok('review questions are counted on their card', S.kindSaid({ kind: 'review', questions: [{ doc: 'x', ns: [3, 4, 5, 6] }] }) === '4 review questions' && S.kindSaid({ kind: 'foundation' }) === 'Foundation');
ok('questions are said as ranges', S.questionsSaid([3, 4, 5, 6]) === 'Q3–Q6' && S.questionsSaid([2, 5]) === 'Q2, Q5' && S.questionsSaid([1, 3, 5, 7]) === 'Q1, Q3…');
ok('files are named shortly on a chip', S.shortName('Ch5_Adjusting_Entries.pdf') === 'Ch5' && S.shortName('Lecture 9 notes.docx') === 'Lecture 9' && S.shortName('Exam 2 review sheet.pdf') === 'Review');
ok('a review topic knows its question numbers, by file', (sorted.topics.find((t) => t.kind === 'review' || t.title === 'Review questions')?.questions ?? []).some((q) => q.doc === review.id && q.ns.includes(3)), J(sorted.topics.map((t) => t.questions)));

// ── fill in the blank ────────────────────────────────────────────────
const t2 = sorted.topics[1];
const cloze = S.clozeFrom(sorted.topics[0], docs);
ok('fill-in-the-blank is cut from the files’ sentences', cloze.length >= 1 && cloze.every((c) => (c.before + c.answer + c.after).length > 20), J(cloze));
ok('the blank and its sentence are the file’s words', cloze.every((c) => docs.some((d) => d.blocks.some((b) => b.text.replace(/\s+/g, ' ').includes((c.before + c.answer + c.after).trim())))));
const more = S.clozeFrom(sorted.topics[0], docs, { round: 1, n: 1 });
ok('another round gives new items ids', more.every((c) => c.id.startsWith('c2.')));
ok('a hint is not the answer', !S.clozeHint(cloze[0]).toLowerCase().includes(cloze[0].answer.toLowerCase()));

// ── journal entries, kept only where the files bear them out ─────────
const journalRaw = {
  events: [
    { block: '1:p4.2', text: 'Mar 31 — wages earned but not yet paid, $1,200', lines: [{ account: 'Wages Expense', also: ['Salaries Expense'], side: 'dr', amount: 1200, why: 'The expense was incurred in March.' }, { account: 'Wages Payable', side: 'cr', amount: 1200, why: 'It is owed.' }], hint: 'What does the company owe at month end that is not on the books?' },
    { block: '1:p7.2', text: 'Mar 31 — one month of the prepaid rent is used up', lines: [{ account: 'Rent Expense', side: 'dr', amount: 1000 }, { account: 'Prepaid Rent', side: 'cr', amount: 1000 }], hint: 'Debit Rent Expense here.' },
    { block: '2:p1.2', text: 'Services on account, $2,750', lines: [{ account: 'Accounts Receivable', side: 'dr', amount: 2750 }, { account: 'Service Revenue', side: 'cr', amount: 2750 }] },
    { block: '2:p1.2', text: 'Services on account, unbilled, $2,500', lines: [{ account: 'Accounts Receivable', side: 'dr', amount: 2500 }, { account: 'Service Revenue', side: 'cr', amount: 2400 }] },
    { block: '9:p1.1', text: 'Nowhere', lines: [{ account: 'Cash', side: 'dr', amount: 1 }, { account: 'Cash', side: 'cr', amount: 1 }] },
  ],
  balance: { assets: 27850, liabilities: 10300, equity: 17550 },
};
const jr = S.sanitizeJournal(journalRaw, docs);
ok('an event whose number is not in its passage is dropped', !jr.events.some((e) => e.text.includes('2,750')));
ok('an entry that does not balance is dropped', !jr.events.some((e) => e.text.includes('unbilled')));
ok('an event citing no real passage is dropped', jr.events.length === 2 && jr.dropped === 3, J({ n: jr.events.length, d: jr.dropped }));
ok('one step of arithmetic on the passage’s numbers is borne out ($6,000 ÷ 6)', jr.events.some((e) => e.lines[0].amount === 1000));
ok('a hint naming the answer is replaced', !jr.events[1].hint.includes('Rent Expense'), jr.events[1].hint);
ok('a balance that holds is kept', J(jr.balance) === J({ assets: 27850, liabilities: 10300, equity: 17550 }));
ok('a balance that does not hold is not', S.sanitizeJournal({ ...journalRaw, balance: { assets: 100, liabilities: 10, equity: 10 } }, docs).balance === null);
ok('events cite their passage verbatim, with its page', jr.events[0].cite.page === 4 && ch5.blocks.find((b) => b.id === 'p4.2').text.includes(jr.events[0].cite.text));

// ── checking ─────────────────────────────────────────────────────────
const practice = { id: 'p1', topic: 't2', kind: 'journal', title: 'Journal entries', made: [jr.events[0].cite], journal: { events: jr.events, balance: jr.balance, accounts: jr.accounts }, answers: {}, checked: null, round: 0 };
ok('ten blanks: an account and an amount per line, and the equation’s two', S.blanksOf(practice).length === 10, J(S.blanksOf(practice)));
const answers = {
  'e1.l1.account': 'salaries exp', 'e1.l1.dr': '$1,200',
  'e1.l2.account': 'Wages Payable', 'e1.l2.cr': '1200',
  // the credit line written first: matched by account, so still right
  'e2.l1.account': 'Prepaid Rent', 'e2.l1.cr': '1,000',
  'e2.l2.account': 'Rent Expense', 'e2.l2.dr': '1000',
  'balance.liabilities': '10,300', 'balance.equity': '17,000',
};
ok('filled counts an amount in either column once', S.filledOf(practice, answers) === 10 && S.filledOf(practice, { 'e1.l1.account': 'x', 'e1.l1.dr': '5', 'e1.l1.cr': '5' }) === 1);
const checked = S.checkPractice(practice, answers);
ok('another name for the same account is right (salaries ≈ wages, exp ≈ expense)', checked.marks['e1.l1.account'] === true);
ok('lines in either order are matched by account', checked.marks['e2.l1.account'] && checked.marks['e2.l1.amount'] && checked.marks['e2.l2.amount'], J(checked.marks));
ok('a wrong equity is marked, and the score counts it', checked.marks['balance.equity'] === false && checked.right === 9 && checked.of === 10, J(checked));
ok('debits equal credits as written; the equation does not hold', checked.balanced === true && checked.equation === false);
ok('the gap says the answer and why, with its page', checked.gaps.length === 1 && checked.gaps[0].answer.includes('$27,850 = $10,300 + $17,550'), J(checked.gaps));
const wrongSide = S.checkPractice(practice, { ...answers, 'e1.l1.dr': '', 'e1.l1.cr': '1200' });
ok('the right amount on the wrong side is wrong', wrongSide.marks['e1.l1.amount'] === false && wrongSide.balanced === false);
ok('one gap for the entry, with the whole entry and the reason for the line missed', wrongSide.gaps.filter((g) => g.id.startsWith('e')).length === 1 && wrongSide.gaps[0].answer === 'Debit Wages Expense $1,200 · Credit Wages Payable $1,200' && wrongSide.gaps[0].why === 'The expense was incurred in March.', J(wrongSide.gaps));
const blankEntry = S.checkPractice(practice, { 'e1.l1.account': 'Wages Expense', 'e1.l1.dr': '1200', 'e1.l2.account': 'Wages Payable', 'e1.l2.cr': '1200' });
ok('an entry left blank is unanswered, not unbalanced', blankEntry.balanced === true && blankEntry.right === 4);
ok('nothing written balances nothing', S.checkPractice(practice, {}).balanced === null);

const clozeSet = { id: 'p2', topic: 't1', kind: 'cloze', title: 'Fill in the blank', made: [], cloze, answers: {}, checked: null, round: 0 };
const clozeAns = Object.fromEntries(cloze.map((c, i) => [c.id, i === 0 ? c.answer.toUpperCase() + 's' : 'nope']));
const cc = S.checkPractice(clozeSet, clozeAns);
ok('a blank is checked without case or a plural’s s', cc.marks[cloze[0].id] === true);
ok('a wrong blank gives the file’s sentence back', cloze.length < 2 || cc.gaps[0].why.includes(cloze[1].answer));

ok('accounts fold their common names', S.accountKey('A/R') === S.accountKey('Accounts Receivable') && S.accountKey('Accum. Depr.') === S.accountKey('accumulated depreciation'));
ok('amounts read as people type them', S.amountOf('$1,200.50') === 1200.5 && Number.isNaN(S.amountOf('twelve')) && S.amountOf('(350)') === 350);
ok('bookkeeping topics are recognised', S.looksLikeEntries(t2, docs) && !S.looksLikeEntries({ ...sorted.topics[0], title: 'Photosynthesis', summary: '', quotes: [{ text: 'Light reactions' }], blocks: [] }, docs));

// ── kept in the map, and read back ───────────────────────────────────
const state = { v: 1, title: 'ACCT 2301 · Exam 2', view: 'board', course: sorted.course, goal: 'exam', said: 'get ready for exam 2', files: [{ doc: ch5.id, name: ch5.name, pages: 8 }, { doc: review.id, name: review.name, pages: 4 }], topics: sorted.topics, start: sorted.start, why: sorted.why, practice: [], at: 1 };
const made = S.create({ objs: [] }, 'study', state, { name: 'St1', origin: 'source' });
ok('a study is a kind the workspace keeps', !!made, 'create returned null');
const withPractice = S.restudy(made.space, made.obj.id, { ...state, practice: [{ ...practice, answers, checked: checked }] });
ok('a study changes as a whole and keeps its id', withPractice && withPractice.objs[0].id === made.obj.id && withPractice.objs[0].states.length === 1);
const map = S.sanitizeMap({ nodes: [], edges: [], objects: JSON.parse(JSON.stringify(withPractice)) }, { trust: 'stored' });
const back = S.studyIn(map.objects);
ok('the server’s map sanitizer keeps a study', !!back, J(map.objects));
ok('topics and quotes come back as they were', back && J(back.state.topics) === J(state.topics));
ok('what was typed comes back, and the check is worked out again', back && back.state.practice[0].answers['e1.l1.dr'] === '$1,200' && back.state.practice[0].checked.right === 9);
const forged = S.restudy(made.space, made.obj.id, { ...state, practice: [{ ...practice, answers, checked: { marks: {}, right: 10, of: 10, gaps: [] } }] });
ok('a check is never trusted from storage', S.studyIn(forged).state.practice[0].checked.right === 9);
ok('a study that is not one is refused', S.restudy(made.space, made.obj.id, { v: 1, topics: [] }) === null);
const told = S.objectsBlock(withPractice, { guarded: false });
ok('the reply model is told the topics', told.includes('Accruals vs. deferrals'));
const open = S.restudy(made.space, made.obj.id, { ...state, practice: [{ ...practice, answers }] });
const toldOpen = S.objectsBlock(open, { guarded: false });
ok('practice not yet submitted is not answered for them', toldOpen.includes('do not give its answers') && !toldOpen.includes('Wages Payable'), toldOpen);

// ── the asks ─────────────────────────────────────────────────────────
const ask = S.sortAsk(docs, 'help me get ready for exam 2', 'exam');
ok('the sorting ask shows keyed passages and says quotes are copied', ask.user.includes('[1:p4.2]') && /copied character for character/i.test(ask.system));
const ea = S.entriesAsk(t2, docs, [sorted.topics[2]], ['Mar 31 — wages']);
ok('the entries ask holds the topic’s passages and the review’s numbers', ea.user.includes('[1:p4.2]') && ea.user.includes('[2:p1.2]') && ea.user.includes('already practised'));

// ── the Universal Map ────────────────────────────────────────────────
const sessions = [
  { id: 'a', title: 'Two job offers', updatedAt: 300, messages: [{ role: 'user' }, { role: 'assistant' }, { role: 'user' }], map: { nodes: [{ id: 'n1', label: 'Two job offers' }, { id: 'n2', label: 'Learning from a better team' }, { id: 'n3', label: 'Higher salary' }], edges: [{ from: 'n1', to: 'n2' }, { from: 'n1', to: 'n3' }, { from: 'n9', to: 'n1' }] } },
  { id: 'b', title: 'Exam 2', updatedAt: 200, messages: [{ role: 'user' }], map: { nodes: [{ id: 'n1', label: 'Exam stress' }], edges: [], objects: JSON.parse(JSON.stringify(withPractice)) } },
  { id: 'c', title: 'Plain chat', updatedAt: 100, messages: [{ role: 'user' }], map: { nodes: [], edges: [] } },
  { id: 'd', title: 'Team culture', updatedAt: 50, messages: [{ role: 'user' }], map: { nodes: [{ id: 'x', label: 'Better team culture' }], edges: [] } },
  { id: 'e', title: 'New line of thinking', updatedAt: 400, messages: [], map: { nodes: [], edges: [] } },
  { id: 'k', title: 'Salary negotiation tips', updatedAt: 10, kind: 'core' },
  { id: 'k2', title: 'Higher salary research', updatedAt: 9, kind: 'core' },
];
const u = S.universeOf(sessions);
const C = new Map(u.clusters.map((c) => [c.id, c]));
ok('every conversation is on one map, newest first; an empty line of thinking is not', J(u.clusters.map((c) => c.id)) === J(['a', 'b', 'c', 'd', 'k', 'k2']));
ok('Core chats are on it too, as points of their own', C.get('k').kind === 'core' && C.get('k').nodes.length === 0);
ok('a map’s ideas are its graph, and an edge to a card not there is dropped', C.get('a').nodes.length === 3 && C.get('a').edges.length === 2);
ok('a study’s topics and its map’s ideas are both its graph, topics first', C.get('b').nodes[0].from === 'topic' && C.get('b').nodes.some((n) => n.from === 'idea') && C.get('b').edges.some((e) => e.from.startsWith('topic:')));
ok('a conversation with no map is drawn as itself, with nothing made up', C.get('c').nodes.length === 0 && C.get('c').r < C.get('a').r);
ok('the most connected idea sits at the middle of its cluster', (() => { const hub = C.get('a').nodes.find((n) => n.id === 'n1'); return hub.x === 0 && hub.y === 0; })());
ok('an idea two conversations share is a bridge between them', u.bridges.some((b) => b.a.cluster === 'a' && b.b.cluster === 'd'), J(u.bridges));
ok('a chat’s name can bridge it to an idea', u.bridges.some((b) => b.b.cluster === 'k2' && b.b.node === null && b.a.cluster === 'a'), J(u.bridges));
ok('two chats are not bridged by their names alone', !u.bridges.some((b) => [b.a.cluster, b.b.cluster].every((x) => x.startsWith('k'))));
ok('one common short word is not a bridge', !u.bridges.some((b) => b.a.cluster === 'b' || b.b.cluster === 'b'));
const overlap = u.clusters.some((p, i) => u.clusters.some((q, j) => j > i && Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r + 30));
ok('no two clusters sit on each other, or on each other’s names', !overlap, J(u.clusters.map((c) => [c.id, c.x, c.y, c.r])));
const many = S.universeOf(Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, title: `Line ${i}`, updatedAt: i, messages: [{ role: 'user' }], map: { nodes: Array.from({ length: i % 9 }, (_, k) => ({ id: `n${k}`, label: `Idea ${i}-${k}` })), edges: [] } })));
const crowd = many.clusters.some((p, i) => many.clusters.some((q, j) => j > i && Math.abs(p.x - q.x) < 180 && Math.abs(p.y - q.y) < p.r + q.r + 40));
ok('forty conversations: still nothing on top of anything else', !crowd);
const dist = (x, y) => Math.hypot(C.get(x).x - C.get(y).x, C.get(x).y - C.get(y).y);
const unbridged = ['b', 'c'].map((x) => dist(x, 'd'));
ok('what a bridge joins is drawn nearer than what nothing joins', unbridged.every((x) => dist('a', 'd') < x), J({ ad: dist('a', 'd'), unbridged }));
ok('everything is on the page', u.clusters.every((c) => c.x - c.r >= 0 && c.y - c.r >= 0 && c.x + c.r <= u.width && c.y + c.r <= u.height));
ok('the same conversations draw the same map', J(S.universeOf(sessions)) === J(u));
ok('nothing at all is an empty map', S.universeOf([]).clusters.length === 0 && S.universeOf([sessions[4]]).clusters.length === 0);
ok('search finds a conversation by its name or any idea in it', S.clusterMatches(C.get('a'), 'better team') && S.clusterMatches(C.get('k'), 'negotiation') && !S.clusterMatches(C.get('c'), 'team'));

console.log(`\nlogos5-study: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
