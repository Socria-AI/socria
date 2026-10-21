// LOGOS 5 — THE STUDY PATH'S SCREENS, RENDERED.
//
// What is held down:
//   • the intake asks what you are working on, takes files, and offers to
//     ask when there is nothing to sort;
//   • the board draws every topic with its kind, its quote, where in the
//     files it is and how many sources back it, and marks where to start;
//   • a topic shows its quotes with their file and page, and the four things
//     to do with it, and says nothing is generated until asked;
//   • practice shows blanks, not answers — no account side, amount or reason
//     from the answer key is in the page before it is checked;
//   • a checked set shows the score, the rules, and each gap with its page;
//   • the three views (Components, Artifacts, Logic Map) are counted, and
//     each says what it holds — or how it comes to hold something;
//   • a card asked about says which card, its last answer and where it came from;
//   • the Universal Map is the home: every conversation counted, searchable,
//     and a way to begin when there is nothing yet.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as U from './.tmp/logos5-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const html = (el) => renderToStaticMarkup(el);
const none = () => {};

const A = 'aaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbb';
const files = [{ doc: A, name: 'Ch5_Adjusting_Entries.pdf', pages: 8 }, { doc: B, name: 'Exam 2 review sheet.pdf', pages: 4 }];
const q = (doc, page, text, block = `p${page}.1`) => ({ doc, block, page, text });
const study = {
  v: 1, title: 'ACCT 2301 · Exam 2', view: 'board', course: 'ACCT 2301 · Exam 2', goal: 'exam', said: 'exam 2', files,
  topics: [
    { id: 't1', title: 'Accruals vs. deferrals', kind: 'foundation', summary: 'When revenue and expense are recorded.', quotes: [q(A, 2, 'Revenues are recorded when earned.'), q(A, 7, 'Expenses when incurred.')], blocks: [{ doc: A, block: 'p2.1' }, { doc: A, block: 'p7.1' }], tables: 1, after: [] },
    { id: 't2', title: 'Accrued wages', kind: 'procedure', summary: '', quotes: [q(A, 4, 'Employees had earned wages of $1,200.')], blocks: [{ doc: A, block: 'p4.1' }], tables: 0, after: ['t1'] },
    { id: 't3', title: 'Review questions', kind: 'review', summary: '', quotes: [q(B, 1, 'Q3. Record the adjusting entry.')], blocks: [{ doc: B, block: 'p1.1' }], tables: 0, after: ['t1'] },
  ],
  start: 't1', why: 'Everything rests on it.', practice: [], at: 1,
};

console.log('\n=== the three views ===');
{
  const items = [{ id: 'components', label: 'Components', count: 3 }, { id: 'artifacts', label: 'Artifacts', count: 0, fresh: true }, { id: 'logic', label: 'Logic Map', count: 7 }];
  const s = html(h(U.L5Switch, { items, value: 'components', onChange: none, label: 'Views' }));
  ok('three views, the open one selected', (s.match(/role="tab"/g) ?? []).length === 3 && /aria-selected="true"[^>]*>Components/.test(s), s);
  ok('each counted, and nothing said when there is nothing', s.includes('l5-switch-n">3<') && s.includes('l5-switch-n">7<') && !s.includes('l5-switch-n">0<'));
  ok('something new in a view not open is marked', s.includes('l5-switch-dot') && !html(h(U.L5Switch, { items, value: 'artifacts', onChange: none, label: 'Views' })).includes('l5-switch-dot'));

  const c = html(h(U.ComponentsEmpty, { said: [{ id: 'm1', text: 'I have an exam on adjusting entries' }], onFiles: none, reading: null, onShow: none, narrow: false }));
  ok('components, empty: nothing to sort, and where to drop files', c.includes('Nothing to sort yet.') && c.includes('Drop files here') && c.includes('type="file"'));
  ok('components, empty: what was said here, a press from each', c.includes('Said in this conversation · 1') && c.includes('I have an exam on adjusting entries'));
  ok('components, reading: the drop zone says so and waits', html(h(U.ComponentsEmpty, { said: [], onFiles: none, reading: 'Reading 2 files…', onShow: none, narrow: false })).includes('Reading 2 files…'));

  const none0 = html(h(U.ArtifactsView, { items: [], selected: null, onSelect: none, narrow: false }));
  ok('artifacts, empty: nothing made yet, and how something is', none0.includes('Nothing made yet.') && none0.includes('practise a topic'));
  const arts = [{ key: 'd:1', kind: 'Chart', title: 'Runway by month', render: () => h('div', null, 'CHART-BODY') }, { key: 'p:2', kind: 'Practice', title: 'Adjusting entries', render: () => h('div', null, 'PRACTICE-BODY') }];
  const a = html(h(U.ArtifactsView, { items: arts, selected: null, onSelect: none, narrow: false }));
  ok('artifacts: the newest is shown at full size, said to be made from the conversation', a.includes('PRACTICE-BODY') && !a.includes('CHART-BODY') && a.includes('Artifact · Practice · made from the conversation'));
  ok('artifacts: the others a press away', (a.match(/class="l5s-art-pill/g) ?? []).length === 2 && a.includes('Runway by month'));
  ok('artifacts: the one chosen is the one shown', html(h(U.ArtifactsView, { items: arts, selected: 'd:1', onSelect: none, narrow: false })).includes('CHART-BODY'));
}

console.log('\n=== asking about a card ===');
{
  const quick = [{ label: 'Challenge it', text: 'Challenge this' }, { label: 'What rests on this?', text: 'What rests on it?' }];
  const s = html(h(U.L5Ask, { label: 'Runway', exchange: { q: 'Why does this matter?', a: 'It sets how long you can wait.', streaming: false }, came: { said: 'Came from 2 messages', onShow: none }, quick, onAsk: none, onClose: none, busy: false }));
  ok('it says which card is asked about', s.includes('Asking about') && s.includes('Runway'));
  ok('the last question and its answer, and where the card came from', s.includes('Why does this matter?') && s.includes('It sets how long you can wait.') && s.includes('Came from 2 messages ›'));
  ok('the quick questions, and a place to ask the next', s.includes('Challenge it') && s.includes('What rests on this?') && s.includes('Ask about this card…'));
  const streaming = html(h(U.L5Ask, { label: 'Runway', exchange: { q: 'Why?', a: '', streaming: true }, came: { said: 'Came from 2 messages' }, quick, onAsk: none, onClose: none, busy: true }));
  ok('while the answer is on its way: thinking, and nothing else to press', streaming.includes('Thinking…') && !streaming.includes('Came from') && /class="l5-ask-chip"[^>]*disabled/.test(streaming));
}

console.log('\n=== the question a reply ends on ===');
{
  const q = U.closingQuestion('Runway is the months you can wait. What would you do with six more?');
  ok('the closing question is cut from the rest', q && q.body === 'Runway is the months you can wait.' && q.question === 'What would you do with six more?', JSON.stringify(q));
  ok('a reply that does not end on a question has none', U.closingQuestion('Runway is the months you can wait.') === null);
  ok('a cut that would split bold or code is not made', U.closingQuestion('It is **six. Or** is it `x. y`?') === null);
}

console.log('\n=== the intake ===');
{
  const s = html(h(U.StudyIntake, { readDocument: async () => ({}), onOrganize: none, onAsk: none, busy: false, narrow: false }));
  ok('it asks what you are working on', s.includes('What are you <em>working on</em>?'));
  ok('it takes files', s.includes('Drop files here') && s.includes('type="file"'));
  ok('with nothing written and no files, there is nothing to send', /<button[^>]*class="l5s-go"[^>]*disabled/.test(s) && s.includes('Ask'));
  ok('it says how it goes, in four steps', ['Drop or ask', 'Socria sorts it', 'Pick a starting point', 'Study or dig in'].every((t) => s.includes(t)));
}

console.log('\n=== the board ===');
{
  const s = html(h(U.StudyBoard, { study, selected: null, onSelect: none, narrow: false }));
  ok('every topic is a card', (s.match(/class="l5s-card /g) ?? []).length === 3);
  ok('a card says its kind, its title and its quote', s.includes('Foundation') && s.includes('Accruals vs. deferrals') && s.includes('“Revenues are recorded when earned.”'));
  ok('a card says where it is in the files, short', s.includes('Ch5 · p.2') && s.includes('Review · p.1'));
  const asked = html(h(U.StudyBoard, { study: { ...study, topics: study.topics.map((t) => (t.id === 't3' ? { ...t, questions: [{ doc: B, ns: [3, 4, 5, 6] }] } : t)) }, selected: null, onSelect: none, narrow: false }));
  ok('a set of questions is counted, and named by its numbers', asked.includes('4 review questions') && asked.includes('Review Q3–Q6'));
  ok('tables, quotes and sources are counted', s.includes('1 table') && s.includes('2 quotes') && s.includes('2 sources'));
  ok('where to start is marked, once', (s.match(/>Recommended start</g) ?? []).length === 1);
  const sel = html(h(U.StudyBoard, { study, selected: 't2', onSelect: none, narrow: false }));
  ok('a topic selected dims the others', (sel.match(/is-dim/g) ?? []).length === 2 && sel.includes('aria-pressed="true"'));
  const start = html(h(U.StartPanel, { study, onStudy: none, onDeep: none, onRecommend: none, onClose: none }));
  ok('the start panel says what was done and offers the two ways in', start.includes('sorted 2 files into 3 topics') && start.includes('Study &amp; review') && start.includes('Deep analysis') && start.includes('Recommend for me'));
}

console.log('\n=== a topic ===');
{
  const s = html(h(U.TopicInspector, { topic: study.topics[0], study, onClose: none, onPractice: none, onExplain: none, onChallenge: none, onWhy: none, onOpen: none, making: false, why: 'Everything rests on it.' }));
  ok('it counts its sources', s.includes('Topic · 2 sources'));
  ok('every quote with its file and page, which opens it', s.includes('Ch5_Adjusting_Entries.pdf · p.2') && s.includes('Ch5_Adjusting_Entries.pdf · p.7') && s.includes('title="Open Ch5_Adjusting_Entries.pdf · p.2"'));
  ok('the four things to do with it', ['Practice this', 'Explain it simply', 'Challenge me', 'Ask why'].every((t) => s.includes(t)));
  ok('it says the quotes are the files’ own words and nothing is made until asked', s.includes('Every quote is the file’s own words, with its page. Nothing here is generated until you ask.'));
  ok('why it is the place to start, when it was recommended', s.includes('Recommended start — Everything rests on it.'));
}

console.log('\n=== practice ===');
{
  const ev = (id, text, page, lines) => ({ id, text, cite: q(A, page, text), hint: 'What has happened that the books do not show yet?', lines });
  const practice = {
    id: 'p1', topic: 't2', kind: 'journal', title: 'Record the adjustments for March 31', made: [q(A, 4, 'x')], answers: {}, checked: null, round: 0,
    journal: {
      events: [
        ev('e1', 'Mar 31 — wages earned, $1,200', 4, [{ id: 'l1', account: 'Wages Expense', also: [], side: 'dr', amount: 1200, why: 'SECRET-REASON-1' }, { id: 'l2', account: 'Wages Payable', also: [], side: 'cr', amount: 1200, why: 'SECRET-REASON-2' }]),
        ev('e2', 'Mar 31 — a month of rent used', 7, [{ id: 'l1', account: 'Rent Expense', also: [], side: 'dr', amount: 1000, why: 'SECRET-REASON-3' }, { id: 'l2', account: 'Prepaid Rent', also: [], side: 'cr', amount: 1000, why: 'SECRET-REASON-4' }]),
      ],
      balance: { assets: 23350, liabilities: 10300, equity: 13050 },
      accounts: ['Wages Expense', 'Wages Payable', 'Rent Expense', 'Prepaid Rent'],
    },
  };
  const props = { study: { ...study, practice: [practice] }, practice, onAnswers: none, onCheck: none, onAgain: none, onMore: none, onWhy: none, onOpen: none, onPick: none, making: false };
  const s = html(h(U.StudyPractice, props));
  ok('it is the files’ numbers with blanks to fill', s.includes('Record the adjustments for March 31') && s.includes('your numbers, blanks for you to fill') && s.includes('Mar 31 — wages earned, $1,200'));
  ok('ten blanks, none filled, nothing graded until submitted', s.includes('0 of 10 blanks filled · nothing is graded until you submit'));
  ok('the equation to complete, from the files’ total', s.includes('$23,350') && s.includes('aria-label="Liabilities"') && s.includes('aria-label="Equity"'));
  ok('no reason from the answer is in the page before it is checked', !s.includes('SECRET-REASON'));
  ok('no answer amount sits in a box', !/value="1,?200"|value="1,?000"/.test(s) && !s.includes('10,300') && !s.includes('13,050'));
  ok('a hint is offered, not shown', s.includes('? Hint') && !s.includes('What has happened that the books do not show yet?'));

  const answers = { 'e1.l1.account': 'Wages Expense', 'e1.l1.dr': '1200', 'e1.l2.account': 'Wages Payable', 'e1.l2.cr': '1200', 'e2.l1.account': 'Rent Expense', 'e2.l1.dr': '1000', 'e2.l2.account': 'Cash', 'e2.l2.cr': '1000', 'balance.liabilities': '10300', 'balance.equity': '13050' };
  const checked = { ...practice, answers, checked: U.checkPractice({ ...practice, answers }) };
  const c = html(h(U.StudyPractice, { ...props, study: { ...study, practice: [checked] }, practice: checked }));
  ok('checked: the score', c.includes('Your result') && /<b>9<\/b> of 10/.test(c), c.match(/l5s-score[^<]*<[^]*?<\/p>/)?.[0]);
  ok('checked: the rules, with their marks', c.includes('Debits equal credits') && c.includes('The equation holds'));
  ok('checked: one gap, the whole entry, its reason and its page', c.includes('One gap to close') && c.includes('Debit Rent Expense $1,000 · Credit Prepaid Rent $1,000') && c.includes('SECRET-REASON-4') && c.includes('Ch5_Adjusting_Entries.pdf · p.7'));
  ok('checked: what to do next', c.includes('Try 3 more like these') && c.includes('Logic Map') && c.includes('Try these again'));
  ok('checked: the wrong line is marked, the boxes are read-only', c.includes('class="is-no"') && c.includes('readOnly') === false && /readonly=""/.test(c));
}

console.log('\n=== the Universal Map ===');
{
  const conversations = [
    { id: 'a', title: 'Two job offers', updatedAt: 2, messages: [{ role: 'user' }], map: { nodes: [{ id: 'n1', label: 'Better team' }, { id: 'n2', label: 'Higher pay' }], edges: [{ from: 'n1', to: 'n2' }] } },
    { id: 'b', title: 'A plain chat', updatedAt: 1, messages: [{ role: 'user' }], map: { nodes: [], edges: [] } },
    { id: 'c', title: 'Tax questions', updatedAt: 3, kind: 'core' },
  ];
  const s = html(h(U.UniverseView, { conversations, activeId: 'a', onOpen: none, onNew: none }));
  ok('it is the home: every conversation, counted', s.includes('Your Universal Map') && s.includes('2 lines of thinking · 1 chat'));
  ok('it can be searched', s.includes('Find an idea or a chat'));
  const empty = html(h(U.UniverseView, { conversations: [], activeId: null, onOpen: none, onNew: none }));
  ok('with nothing yet, it says what it will be and how to begin', empty.includes('appears here as its own mind graph') && empty.includes('What are you working on?'));
  const atlas = html(h(U.UniverseView, { conversations, activeId: 'a', onOpen: none, onNew: none, atlas: h('div', null, 'ATLAS') }));
  ok('signed in, everything remembered is one press away', atlas.includes('Everything remembered'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
