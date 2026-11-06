// LOGOS 5.5 — STUDY, READ LEFT TO RIGHT (Screen 4).
//
//   studyDesk   what a file is and what it holds; which topics are on the
//               Logic Map (only when an idea there carries the name); which
//               artifact belongs to which topic (made for it, or named by it);
//               what the middle shows for a topic chosen and a kind chosen
//   StudyDesk   your files with their topics on the left, what was made as
//               cards in the middle, the lit card, heavy things opened at
//               full size instead of drawn, "Show all" only once narrowed
//   besideSide  the conversation docks on the right beside the desk

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as D from './.tmp/study-desk-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);

const FILES = [
  { doc: 'a'.repeat(16), name: 'Lecture_9_Adjusting_Entries.pdf', pages: 24 },
  { doc: 'b'.repeat(16), name: 'Homework 4.docx', pages: 3 },
  { doc: 'c'.repeat(16), name: 'whiteboard.HEIC', pages: 1 },
];
const TOPICS = [
  { id: 't1', title: 'Accruals', docs: [FILES[0].doc] },
  { id: 't2', title: 'Deferrals', docs: [FILES[0].doc, FILES[1].doc] },
  { id: 't3', title: 'The adjusted trial balance', docs: [FILES[1].doc] },
  { id: 't4', title: 'Depreciation', docs: [] },
];

console.log('\n=== studyDesk: what a file is and what it holds ===');
ok('a file is named by what it is', J(FILES.map((f) => D.fileKind(f.name))) === J(['PDF', 'Doc', 'Photo']) && D.fileKind('notes.md') === 'Notes' && D.fileKind('deck.pptx') === 'Slides' && D.fileKind('grades.csv') === 'Sheet' && D.fileKind('README') === 'File');
ok('  and called what the person would call it', D.fileTitle('Lecture_9_Adjusting_Entries.pdf') === 'Lecture 9 Adjusting Entries' && D.fileTitle('Homework 4.docx') === 'Homework 4' && D.fileTitle('.pdf') === '.pdf');
ok('the topics a file holds, in the study\'s own order', J(D.topicsOf(FILES[0], TOPICS).map((t) => t.id)) === J(['t1', 't2']) && D.topicsOf(FILES[2], TOPICS).length === 0);
ok('a study\'s topics read their files from passages and quotes, once each', J(D.deskTopicsOf([{ id: 'x', title: 'X', blocks: [{ doc: 'a' }, { doc: 'b' }, { doc: 'a' }], quotes: [{ doc: 'c' }, { doc: 'b' }] }])[0].docs) === J(['a', 'b', 'c']));

console.log('\n=== studyDesk: on your map, only when an idea there carries the name ===');
const mapped = D.onMap(TOPICS, ['Accruals are recorded before cash moves', 'Why deferrals wait', 'Cash', 'x']);
ok('an idea naming the topic puts it on the map, in any case', mapped.has('t1') && mapped.has('t2'));
ok('  a topic no idea names is not on it', !mapped.has('t3') && !mapped.has('t4'));
ok('  a short idea ("Cash") is not read inside a longer topic name', !D.onMap([{ id: 'c', title: 'Cash flow statement', docs: [] }], ['Cash']).has('c'));
ok('  a long enough idea inside the topic\'s name counts', D.onMap([{ id: 'c', title: 'The adjusted trial balance', docs: [] }], ['Adjusted trial balance']).has('c'));
ok('  nothing is guessed from nothing', D.onMap(TOPICS, []).size === 0);

console.log('\n=== studyDesk: which artifact belongs to which topic ===');
const ARTS = [
  { key: 'p:1', kind: 'Practice', title: 'Practise: the accrual entries', topic: 't1' },
  { key: 'd:1', kind: 'Table', title: 'Deferrals, side by side' },
  { key: 'd:2', kind: 'Chart', title: 'Where the money went' },
  { key: 'w:doc', kind: 'Writing', title: 'My notes on the adjusted trial balance' },
  { key: 'p:2', kind: 'Practice', title: 'Practise again', topic: 'gone' },
];
ok('made for a topic (practice): that topic', D.topicOfArtifact(ARTS[0], TOPICS) === 't1');
ok('  otherwise the topic its title names', D.topicOfArtifact(ARTS[1], TOPICS) === 't2' && D.topicOfArtifact(ARTS[3], TOPICS) === 't3');
ok('  none named, none', D.topicOfArtifact(ARTS[2], TOPICS) === null);
ok('  made for a topic no longer there falls back to the title', D.topicOfArtifact(ARTS[4], TOPICS) === null);
ok('  the longest name that fits wins', D.topicOfArtifact({ key: 'k', kind: 'Table', title: 'Trial balance vs the adjusted trial balance' }, [{ id: 'a', title: 'Trial balance', docs: [] }, { id: 'b', title: 'The adjusted trial balance', docs: [] }]) === 'b');

console.log('\n=== studyDesk: what the middle shows ===');
ok('no topic, no kind: everything, in the order made', J(D.deskArtifacts(ARTS, TOPICS, null, null).map((a) => a.key)) === J(ARTS.map((a) => a.key)));
ok('a topic: what was made for it', J(D.deskArtifacts(ARTS, TOPICS, 't2', null).map((a) => a.key)) === J(['d:1']));
ok('a kind: that kind, for the topic chosen or all', J(D.deskArtifacts(ARTS, TOPICS, null, 'Practice').map((a) => a.key)) === J(['p:1', 'p:2']) && J(D.deskArtifacts(ARTS, TOPICS, 't1', 'Practice').map((a) => a.key)) === J(['p:1']));
ok('the kinds there, in the order first made', J(D.kindsOf(ARTS)) === J(['Practice', 'Table', 'Chart', 'Writing']));
ok('a file\'s line: kind, topics, how many on the map', D.fileMeta(FILES[0], TOPICS, mapped) === 'PDF · 2 topics · 2 on your map' && D.fileMeta(FILES[1], TOPICS, new Set()) === 'Doc · 2 topics · not on your map yet' && D.fileMeta(FILES[2], TOPICS, mapped) === 'Photo · 1 page');

console.log('\n=== StudyDesk: your files, then what was made from them ===');
const items = ARTS.slice(0, 4).map((a) => ({ ...a, source: a.key === 'p:1' ? 'from Lecture 9 Adjusting Entries' : undefined, render: () => h('p', { className: 'DRAWN' }, a.title) }));
const desk = (o = {}) => html(h(D.StudyDesk, { course: 'ACCT 2301 · Exam 2', files: FILES, topics: TOPICS, mapped, start: 't2', topic: null, onTopic: () => {}, items, lit: 'd:1', onOpen: () => {}, onAddFiles: () => {}, ...o }));
const all = desk();
ok('the files on the left, with a count and the way to add more', /<aside class="l5sd-files" aria-label="Your files">/.test(all) && /Your files<\/span><span class="l5-count">3<\/span>/.test(all) && /aria-label="Add files"/.test(all));
ok('  each file by what the person would call it, with its line', all.includes('Lecture 9 Adjusting Entries') && all.includes('PDF · 2 topics · 2 on your map'));
ok('  the file that holds where to start opens by itself, its topics listed', /aria-expanded="true"/.test(all) && all.includes('>Accruals<') && all.includes('>Deferrals<'));
ok('  on your map is the filled dot; not yet, the ring — said, not only drawn', /l5sd-dot is-on" aria-label="on your map"/.test(all) && all.includes('aria-label="not on your map yet"') && /l5sd-key/.test(all));
ok('  where to start is said on its row', /Deferrals<\/span><span class="l5sd-hint">start here<\/span>/.test(all));
ok('  a topic from no file is listed under the conversation', all.includes('From the conversation') && all.includes('>Depreciation<'));
ok('  a file with no topics has nothing to open', (all.match(/class="l5sd-file-b"/g) || []).length === 3 && (all.match(/class="l5sd-file-b" aria-expanded=/g) || []).length === 2, all.match(/<button[^>]*l5sd-file-b[^>]*>/g));
ok('the middle, with nothing chosen: everything made, named for the course', all.includes('Everything made') && all.includes('ACCT 2301 · Exam 2.') && all.includes('4 artifacts'));
ok('  as cards in a grid, each holding its kind, title and source', (all.match(/class="l5-holder l5sd-card/g) || []).length === 4 && all.includes('from Lecture 9 Adjusting Entries'));
ok('  the card the conversation points at is lit', /data-art="d:1" class="l5-holder l5sd-card is-lit"/.test(all) && !/data-art="d:2" class="[^"]*is-lit/.test(all));
ok('  what is light is drawn in its card; your writing offers to open instead', (all.match(/class="DRAWN"/g) || []).length === 3 && /l5sd-card-b is-closed/.test(all));
ok('  every card opens at full size', (all.match(/aria-label="Open [^"]+ at full size"/g) || []).length === 4);
ok('  several kinds: "All kinds" to choose from; nothing narrowed: no "Show all"', all.includes('All kinds') && !all.includes('Show all'));
ok('heavy things are not drawn in a card', !D.drawsInCard('Writing') && !D.drawsInCard('CAD') && !D.drawsInCard('Model') && !D.drawsInCard('Simulation') && D.drawsInCard('Practice') && D.drawsInCard('Table'));

console.log('\n=== StudyDesk: a topic chosen decides the middle ===');
const one = desk({ topic: 't2' });
ok('the topic is pressed, its count beside it', /aria-pressed="true"/.test(one) && /Deferrals<\/span><span class="l5-count">1<\/span>/.test(one));
ok('  the middle says which topic, from which file', one.includes('Topic · Lecture 9 Adjusting Entries') && one.includes('Deferrals.') && one.includes('1 of 4 artifacts · on your map'));
ok('  only what was made for it', (one.match(/class="l5-holder l5sd-card/g) || []).length === 1 && one.includes('data-art="d:1"'));
ok('  and "Show all" takes the choice back', one.includes('Show all 4'));
const none = desk({ topic: 't3', items: items.filter((i) => i.key !== 'w:doc') });
ok('nothing made for it yet: said, with what can be asked for', none.includes('Nothing made from “The adjusted trial balance” yet.') && !none.includes('l5sd-grid'));
ok('nothing made at all: said', desk({ items: [] }).includes('Nothing made yet.'));

console.log('\n=== the conversation docks on the right beside the desk ===');
const S = (view, beside = null) => ({ view, beside });
ok('never put: right beside the desk, left beside the map', D.besideSide(S('artifacts', 'chat'), null, 'right') === 'right' && D.besideSide(S('logic_map', 'chat'), null) === 'left');
ok('  put somewhere, it stays there', D.besideSide(S('artifacts', 'chat'), 'left', 'right') === 'left');
ok('  something else beside, on the right as before', D.besideSide(S('artifacts', 'logic_map'), null, 'right') === 'right');

console.log('\n=== wired: the Artifacts view of a study with files, on a wide screen ===');
const app = read('components/LogosApp.tsx');
ok('the desk draws the Artifacts view for a study with files, wide, as the view', /const deskOn = !!study && study\.state\.files\.length > 0 && !narrow && studyTab === 'artifacts';/.test(app) && /<StudyDesk/.test(app));
ok('  the lit card is the one the conversation last pointed at', /lit=\{artKey\}/.test(app));
ok('  on your map is read from the Logic Map\'s own ideas', /mapped=\{onMap\(deskTopics, map\.nodes\.map\(\(n\) => n\.label\)\)\}/.test(app));
ok('  a topic chosen is the same choice as in Files', /onTopic=\{pickTopic\}/.test(app) && /topic=\{studyTopic\}/.test(app));
ok('  heavy things chosen open at full size, with the way back', /!drawsInCard\(it\.kind\)/.test(app) && app.includes('All artifacts'));
ok('  the conversation never put docks right beside it', /const chatSideFresh: ChatSide = deskOn && studyTab === 'artifacts' \? 'right' : 'left';/.test(app) && /besideSide\(screen, chatSide, chatSideFresh\)/.test(app));
const css = read('components/logos5/study-desk.css');
const sizes = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
const radii = [...css.matchAll(/border-radius:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
ok('the desk\'s sheet keeps the six steps and four radii', sizes.every((n) => [32, 18, 15.5, 13.5, 12.5, 10.5].includes(n)) && radii.every((n) => [999, 16, 10, 6].includes(n)), J({ sizes, radii }));
ok('  files 300 wide, cards two columns at gap 16', /grid-template-columns: 300px minmax\(0, 1fr\)/.test(css) && /repeat\(2, minmax\(0, 1fr\)\)/.test(css) && /gap: 16px/.test(css));
ok('  one column when the middle is narrow — the conversation beside — measured by the middle, not the window', /container-type: inline-size/.test(css) && /@container \(max-width: 760px\)[\s\S]{0,120}grid-template-columns: minmax\(0, 1fr\)/.test(css));
ok('  practice in its card does not repeat the card\'s kind and title', /\.l5sd-card-b \.l5s-pr-k,\s*\.logos-root \.l5 \.l5sd-card-b \.l5s-pr-t \{\s*display: none;/.test(css));

console.log(`\nstudy desk: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
