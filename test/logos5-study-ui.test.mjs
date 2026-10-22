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
//   • the Universal Map is the home — "Your map, not a list": Today and This
//     week are drawn as subjects, each a circle named for its field and its
//     course, a real study session a disc with its name inside, a quick
//     question a dot, the person's links and the ideas subjects share as
//     curves with a card that says why, their stars and notes on it, and a ↩
//     to where a subject was before; every Project of theirs is on it, an
//     empty one too; Today folds the subjects worked on lately but not today; This month and All time are a line through time, the
//     oldest on the left, joined where one followed on; the lenses are at the
//     top, what the marks mean and the box that searches or starts at the
//     foot; and there is a way to begin when there is nothing yet.

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
  // a fixed afternoon, so what is "today" does not depend on when the test runs
  const NOW = new Date(2026, 9, 21, 15, 0).getTime();
  const DAY = 86_400_000;
  const say = (role, content, d) => ({ role, content, at: NOW - d * DAY });
  const conv = (id, title, o = {}) => ({
    id,
    title,
    updatedAt: NOW - (o.last ?? 1) * DAY,
    projectId: o.project ?? null,
    messages: Array.from({ length: o.turns ?? 1 }).flatMap((_, i) => [say('user', i ? 'and then?' : title, (o.last ?? 1) + 2 - i * 0.01), say('assistant', `Where it stands: ${title.toLowerCase()} is narrowing.${o.ask && i === (o.turns ?? 1) - 1 ? ' ' + o.ask : ''}`, (o.last ?? 1) - i * 0.001)]),
    map: { nodes: (o.ideas ?? []).map((label, i) => ({ id: `${id}${i}`, label })), edges: [] },
  });
  const head = (center, count) => h('header', { className: 'test-head' }, `COUNT:${count}`, center);
  const base = { activeId: null, onOpen: none, onStart: none, head, now: NOW };

  const empty = html(h(U.UniverseView, { ...base, conversations: [] }));
  ok('with nothing yet, it says what it will be and how to begin', empty.includes('a map of what you have learned, by day, by week and by subject') && empty.includes('What are you working on?') && empty.includes('placeholder="Search or start something new…"'));

  const few = html(h(U.UniverseView, { ...base, conversations: [conv('a', 'Two job offers', { last: 0.1, turns: 3, ask: 'Which would you leave for?' }), conv('b', 'Rent or buy', { last: 2, turns: 3 }), conv('c', 'Exam 2', { last: 3, turns: 3 })] }));
  ok('the page says what it is: everything studied — your map, not a list', few.includes('Everything you’ve studied') && few.includes('Your map, <em>not a list</em>'));
  ok('today: the day’s session a disc with its name inside — one before, of another subject, folded to its name; one about nothing in particular, not drawn', (few.match(/class="l5b-hub[ "]/g) ?? []).length === 1 && /class="l5b-hub[^"]*"[^>]*data-node="a"/.test(few) && few.includes('Two job offers') && !few.includes('data-node="b"') && /class="l5b-fold"[^>]*aria-label="Money: one conversation, folded. Open it."/.test(few) && !few.includes('data-node="c"'));
  ok('the header is told how many there are; the box that finds or starts is at the foot, not in it', few.includes('COUNT:3') && few.includes('<header class="test-head">COUNT:3</header>') && /class="l5h-foot"[^]*placeholder="Search or start something new…"/.test(few));
  ok('what the marks mean, at the foot', few.includes('Hub — a real study session') && few.includes('Quick question') && few.includes('Connects across courses'));
  ok('where to pick up is a press away, and haloed on the map', few.includes('Pick up where you left off') && /l5h-pick-t">Two job offers/.test(few) && few.includes('l5b-halo') && few.includes('where you left off'));
  ok('four ways to see it, Today first — then This week, This month, All time', /role="radio" aria-checked="true" class="is-on"><span class="l5h-long">Today</.test(few) && few.includes('>This week<') && few.includes('>This month<') && few.includes('>All time<'));
  ok('today: by the day', few.includes('Today · Wed Oct 21'));

  const projects = [{ id: 'P1', name: 'ACCT 2301', color: 'clay', createdAt: 1 }, { id: 'P2', name: 'Job hunt', createdAt: 2 }, { id: 'P3', name: 'Someday', createdAt: 3 }];
  const conversations = [
    conv('a1', 'Accruals', { project: 'P1', ideas: ['Accrual basis'], turns: 3 }),
    conv('a2', 'Exam 2', { project: 'P1', last: 0.1, ideas: ['Accrual basis', 'Adjusting entries'], turns: 4 }),
    conv('j1', 'Two job offers', { project: 'P2', ideas: ['Monthly runway', 'Better team'], ask: 'Which would you leave for?', turns: 3 }),
    conv('j2', 'Negotiating', { project: 'P2', ideas: ['Salary band'], turns: 3 }),
    conv('l1', 'Rent or buy a flat', { ideas: ['Monthly runway'], turns: 3 }),
    conv('l2', 'Monthly budget', { ideas: ['The monthly runway'], turns: 3 }),
    conv('l3', 'Secret plans', {}),
    { id: 'k1', title: 'Tax questions', updatedAt: NOW - 5 * DAY, kind: 'core' },
  ];
  const E = U.emptyArrangement();
  const arranged = { ...E, mode: 'week', starred: ['j1'], hidden: ['l3'], notes: [{ id: 'n1', x: 40, y: 900, text: 'decide by Friday' }], links: [{ id: 'k', a: 'j1', b: 'a2', label: 'same deadline' }], seen: { hint: true } };
  const map = html(h(U.UniverseView, { ...base, conversations, projects, initial: arranged }));
  ok('this week, by subject: a circle for each — its field and its course', map.includes('Accounting · ACCT 2301') && map.includes('Careers · Job hunt') && /class="l5b-name-t"[^>]*>Money</.test(map));
  ok('  every Project of the person’s is on it, said to be theirs — an empty one waiting to be dragged into', (map.match(/class="l5b-tag">Project</g) ?? []).length === 2 && /class="l5b-fold is-project is-empty"[^>]*aria-label="Someday: a Project with nothing in it yet. Drag a conversation here to file it."/.test(map) && map.includes('Empty — drag one here'));
  ok('  under the page’s name: the week, how many, and the weeks either side', map.includes('This week · Mon Oct 19 – today · 6 conversations') && map.includes('aria-label="The week before"') && map.includes('aria-label="The week after"'));
  ok('every conversation of the week drawn, hidden ones left out', (map.match(/class="l5b-(hub|dot)[ "]/g) ?? []).length === 6 && !map.includes('Secret plans') && !map.includes('data-node="k1"'));
  ok('  by a subject’s name this week, a ↩ to where it was before — found in time', /class="l5b-back" title="Where this subject was before: “Tax questions” — find it in time">↩ Oct 16</.test(map));
  ok('a real study session is a disc', (map.match(/class="l5b-hub[ "]/g) ?? []).length === 6);
  ok('the header counts every conversation there is', map.includes('COUNT:7'));
  ok('the person’s link across two subjects is a curve, and the card over it says why, in their words', /class="l5b-link is-own is-carded"/.test(map) && /class="l5b-card is-own"[^]*You linked these[^]*same deadline\./.test(map));
  ok('  an idea two other subjects come back to is a curve too, named', /class="l5b-link is-idea"/.test(map) && map.includes('An idea both come back to: Monthly runway'));
  ok('starred is a press away, and marked', map.includes('l5h-starchip') && /l5h-starchip[^>]*title="Two job offers"/.test(map) && /data-node="j1"[^]*?l5h-star/.test(map));
  ok('the person’s notes are on the map', map.includes('decide by Friday'));
  ok('a question waiting is marked; the place to pick up is haloed', map.includes('a question is waiting for you') && map.includes('l5b-ask') && map.includes('l5b-halo'));
  ok('a conversation says what it is to a screen reader', /aria-label="Two job offers, [^"]*Job hunt/.test(map));

  const all = html(h(U.UniverseView, { ...base, conversations, projects, initial: { ...arranged, mode: 'all' } }));
  ok('all time is a line through time: every conversation on it, hidden ones left out', (all.match(/data-bead="/g) ?? []).length === 7 && !all.includes('Secret plans') && all.includes('aria-label="Your conversations in order'));
  ok('  a Project’s that followed on are one thread, named for it', /class="l5t-name"[^>]*>ACCT 2301</.test(all) && /class="l5t-name"[^>]*>Job hunt</.test(all) && (all.match(/class="l5t-line"/g) ?? []).length >= 2);
  ok('  a Core chat is a ring on it, joined to its subject when it followed on', /class="l5t-bead is-dot is-below is-chat"[^>]*data-bead="k1"/.test(all) && /class="l5t-name"[^>]*>Money</.test(all));
  ok('  this week and now are marked; the whole history is at the foot', all.includes('>This week</span>') && all.includes('>Now</span>') && all.includes('The whole history'));
  ok('  nothing to arrange or link on the line: no Select', !all.includes('l5h-tool is-select') && few.includes('l5h-tool is-select'));
  const month = html(h(U.UniverseView, { ...base, conversations, projects, initial: { ...arranged, mode: 'month' } }));
  ok('this month is the same line, from the first', (month.match(/data-bead="/g) ?? []).length === 7 && month.includes('aria-checked="true" class="is-on"><span class="l5h-long">This month'));

  const today = html(h(U.UniverseView, { ...base, conversations, projects, initial: E }));
  ok('today: the day, and why each earlier one is beside it', today.includes('Today · Wed Oct 21') && /title="Accruals — shares “Accrual basis”"/.test(today) && /aria-label="Accruals, [^"]*shares “Accrual basis”"/.test(today));
  ok('  a Project not worked on today, folded to its name, a press from opening', /class="l5b-fold is-project"[^>]*aria-label="Careers, Job hunt, a Project of yours: 2 conversations, folded. Open it."/.test(today));
  ok('  on the line, what the marks mean says what follows on', all.includes('Followed on within a week') && !all.includes('Connects across courses'));

  const noChats = html(h(U.UniverseView, { ...base, conversations, projects, initial: { ...arranged, mode: 'all', display: { ...E.display, chats: false } } }));
  ok('Core chats can be left off it', all.includes('Tax questions') && !noChats.includes('Tax questions'));

  const list = html(h(U.UniverseView, { ...base, conversations, projects, contents: true, initial: arranged }));
  ok('the list: starred first, then each subject, counting what is hidden', list.includes('>Starred<') && list.indexOf('>Starred<') < list.indexOf('l5c-k">ACCT 2301<') && list.includes('7 conversations · 1 hidden'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
