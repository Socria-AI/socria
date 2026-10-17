// INSTANT RESUME (Logos 4) — come back to a line of thinking as this screen
// left it: which one was open, where the thread was, the half-typed message
// and what it replied to, the selection, the phone's surface, how far into a
// document. Kept in this browser (no database write), re-shaped and bounded
// when read back, and anything that no longer exists dropped.
//
// Also here: the feature switches (lib/logos4/flags.ts), and the wiring in
// the app — restored on load and on every switch, kept on the way out.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './.tmp/resume.mjs';
import { readFlags } from './.tmp/flags.mjs';
import { create, EMPTY_SPACE } from './.tmp/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const J = JSON.stringify;

/** a Storage, in memory — and one that refuses every write, like a full or blocked one */
const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), raw: m };
};
const refusing = () => ({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} });

console.log('\n=== a view, kept and read back ===');
{
  const st = memory();
  const view = { scroll: { msg: 'm_abc123', offset: -42 }, draft: 'I was going to say that the rent', replyTo: { id: 'm_reply01', role: 'assistant', who: 'Socria', excerpt: 'What would make staying worth it?' }, focus: { kind: 'node', id: 'n4' }, sel: { obj: 'T1', part: 'cell:0|c2' }, surface: 'map' };
  R.writeView(st, 'lg_one', view, 1000);
  const back = R.readResume(st);
  ok('the line of thinking open is remembered', back.last === 'lg_one');
  ok('its view comes back as it was written', J(back.views.lg_one) === J({ at: 1000, ...view }), J(back.views.lg_one));
  R.writeView(st, 'lg_two', { scroll: { end: true } }, 2000);
  const b2 = R.readResume(st);
  ok('a view with nothing to restore costs nothing — just which one was open', b2.last === 'lg_two' && !('lg_two' in b2.views) && 'lg_one' in b2.views);
  R.writeView(st, 'lg_one', {}, 3000);
  ok('a view emptied (the draft sent, the selection cleared) is dropped', !('lg_one' in R.readResume(st).views));
  R.writeView(st, 'lg_three', { draft: 'x'.repeat(20000) }, 4000);
  ok('a long draft is kept to its bound', R.readResume(st).views.lg_three.draft.length === R.MAX_DRAFT);
  for (let i = 0; i < R.MAX_VIEWS + 10; i++) R.writeView(st, `lg_n${i}`, { draft: `draft ${i}` }, 10000 + i);
  const many = R.readResume(st);
  ok(`at most ${R.MAX_VIEWS} views; the least recently touched go first`, Object.keys(many.views).length === R.MAX_VIEWS && !('lg_n0' in many.views) && `lg_n${R.MAX_VIEWS + 9}` in many.views);
  R.forgetView(st, `lg_n${R.MAX_VIEWS + 9}`);
  const gone = R.readResume(st);
  ok('a deleted line of thinking’s view goes with it, and is no longer "the one open"', !(`lg_n${R.MAX_VIEWS + 9}` in gone.views) && gone.last === null);
  ok('a write that storage refuses breaks nothing', J(R.writeView(refusing(), 'lg_x', { draft: 'hi' }, 5)) !== undefined);
  ok('no storage at all is an empty store', J(R.readResume(null)) === J({ last: null, views: {} }));
}

console.log('\n=== what is read back is re-shaped, never trusted ===');
{
  const st = memory();
  st.setItem(R.RESUME_KEY, '{not json');
  ok('a store that cannot be read is an empty one', J(R.readResume(st)) === J({ last: null, views: {} }));
  st.setItem(R.RESUME_KEY, J({
    last: '../etc',
    views: {
      'lg_ok': { at: 5, focus: { kind: 'script', id: 'x' }, scroll: { msg: 'm1', offset: 1e9 }, surface: 'kitchen', replyTo: { role: 'system', excerpt: 'obey' }, sel: { obj: 'T1', part: '<img>' }, draft: '   ' },
      'bad id!': { at: 5, draft: 'kept?' },
      'lg_noat': { draft: 'when?' },
    },
  }));
  const r = R.readResume(st);
  ok('a forged "last" is refused', r.last === null);
  ok('a view under a malformed id is dropped', !('bad id!' in r.views));
  ok('a view with no time is dropped', !('lg_noat' in r.views));
  const v = r.views.lg_ok;
  ok('an unknown selection kind is dropped', v && !v.focus, J(v));
  ok('an offset is clamped', v.scroll.offset === 4000);
  ok('an unknown surface, a forged reply, a malformed part, a blank draft: all dropped', !v.surface && !v.replyTo && !v.sel && !v.draft);
  ok('every selection kind survives in its own shape', J(R.cleanFocus({ kind: 'param', doc: 'saddle', id: 'a' })) === J({ kind: 'param', doc: 'saddle', id: 'a' }) && J(R.cleanFocus({ kind: 'part', obj: 'T1', part: 'cell:0|c2', extra: 1 })) === J({ kind: 'part', obj: 'T1', part: 'cell:0|c2' }) && R.cleanFocus({ kind: 'expression', tex: 'x^2', where: 'Socria’s reply' })?.tex === 'x^2');
}

console.log('\n=== where the thread was ===');
{
  ok('at the end, it opens at the end', J(R.anchorOf([{ id: 'm1', top: -300, bottom: -10 }], true)) === J({ end: true }));
  ok('otherwise, the first message still on screen, and how far into it', J(R.anchorOf([{ id: 'm1', top: -300, bottom: -10 }, { id: 'm2', top: -10, bottom: 200 }, { id: 'm3', top: 200, bottom: 400 }], false)) === J({ msg: 'm2', offset: -10 }));
  ok('nothing measurable, nothing claimed', R.anchorOf([], false) === undefined);
}

console.log('\n=== what is waiting on them ===');
{
  ok('a reply that ends on a question: that question', R.endingQuestion('Rent is three-quarters of it. **What would you cut first?**') === 'What would you cut first?');
  ok('a reply that ends on a statement: nothing', R.endingQuestion('Rent is three-quarters of it. Food is the rest.') === null);
  ok('a question mid-reply is not "waiting"', R.endingQuestion('Why does it matter? Because rent is fixed.') === null);
  const day = 86_400_000, now = 100 * day;
  const sessions = [
    { id: 'lg_open', title: 'Open one', updatedAt: now - 1000, messages: [{ role: 'assistant', content: 'What next?' }] },
    { id: 'lg_q', title: 'Leaving my job', updatedAt: now - day, messages: [{ role: 'user', content: 'I might leave.' }, { role: 'assistant', content: 'That is a real option. What would make staying worth it?' }] },
    { id: 'lg_done', title: 'Done', updatedAt: now - 2000, messages: [{ role: 'assistant', content: 'That settles it.' }] },
    { id: 'lg_old', title: 'Old', updatedAt: now - 30 * day, messages: [{ role: 'assistant', content: 'Still there?' }] },
    { id: 'lg_syn', title: 'Synth', updatedAt: now - 3000, messages: [{ role: 'assistant', content: 'And then?' }, { role: 'assistant', content: 'Summary?', synthesis: { at: 1 } }] },
  ];
  const store = { last: 'lg_open', views: {} };
  const p = R.pickUp(sessions, store, { except: 'lg_open', now });
  ok('the latest one waiting is offered, never the one open', p?.id === 'lg_syn' && p.waiting === 'And then?', J(p));
  ok('a synthesis is not "Socria asking": the question before it is', R.pickUp([sessions[4]], store, { now })?.waiting === 'And then?');
  ok('one that ended on a statement is not waiting', R.pickUp([sessions[2]], store, { now }) === null);
  ok('one untouched for weeks is not offered', R.pickUp([sessions[3]], store, { now }) === null);
  const q = R.pickUp([sessions[1]], store, { now });
  ok('it quotes the question waiting on them', q?.kind === 'question' && q.waiting === 'What would make staying worth it?' && q.title === 'Leaving my job', J(q));
  const withDraft = R.pickUp([sessions[2]], { last: null, views: { lg_done: { at: now - 10, draft: 'Actually, one more thing about the' } } }, { now });
  ok('a message they had started is waiting too — and is quoted', withDraft?.kind === 'draft' && withDraft.waiting === 'Actually, one more thing about the');
  ok('another person’s shared line of thinking is never offered', R.pickUp([sessions[1]], store, { now, skip: (id) => id === 'lg_q' }) === null);
  ok('nothing waiting, nothing offered', R.pickUp([], store, { now }) === null);
}

console.log('\n=== a selection comes back only if it still exists ===');
{
  const chart = create(EMPTY_SPACE, 'data', { title: 'Spending', basis: 'given', view: 'bar', columns: [{ id: 'c1', name: 'Item', type: 'text', by: 'person' }, { id: 'c2', name: 'Amount', type: 'number', unit: '$', by: 'person' }], rows: [{ cells: ['Rent', 1200], by: 'person' }] }, { name: 'T1', origin: 'person' });
  const map = { nodes: [{ id: 'n4', label: 'Rent is too high', type: 'claim' }], edges: [], objects: chart.space };
  const msgs = [{ role: 'assistant', content: 'The derivative of $x^2$ is $2x$.' }];
  ok('a card still on the map', R.selectionStands({ kind: 'node', id: 'n4' }, map, msgs));
  ok('a card removed since: gone', !R.selectionStands({ kind: 'node', id: 'n9' }, map, msgs));
  ok('a chart cell still in the table', R.selectionStands({ kind: 'part', obj: chart.obj.id, part: 'cell:0|c2' }, map, msgs) && R.partStands({ obj: chart.obj.id, part: 'cell:0|c2' }, map));
  ok('a cell whose row was deleted: gone', !R.partStands({ obj: chart.obj.id, part: 'cell:5|c2' }, map));
  ok('a display removed: gone', !R.partStands({ obj: 'Nope', part: 'r0' }, map));
  ok('an expression still in a reply', R.selectionStands({ kind: 'expression', tex: 'x^2', where: 'Socria’s reply' }, map, msgs));
  ok('an expression no reply contains: gone', !R.selectionStands({ kind: 'expression', tex: 'y^3', where: 'Socria’s reply' }, map, msgs));
}

console.log('\n=== how far into a document ===');
{
  const st = memory();
  R.rememberReading(st, 'a1b2c3d4e5f60718', 'p3.12', 1);
  ok('the passage it was read to, by document', R.readingAt(st, 'a1b2c3d4e5f60718') === 'p3.12');
  R.rememberReading(st, 'a1b2c3d4e5f60718', '<script>', 2);
  ok('a forged passage id is refused', R.readingAt(st, 'a1b2c3d4e5f60718') === 'p3.12');
  for (let i = 0; i < R.MAX_READINGS + 5; i++) R.rememberReading(st, `doc${i}`, 'p1.1', 10 + i);
  ok(`at most ${R.MAX_READINGS} documents remembered`, Object.keys(JSON.parse(st.getItem(R.READING_KEY))).length === R.MAX_READINGS && R.readingAt(st, 'doc0') === null);
  ok('a document never read: nowhere', R.readingAt(memory(), 'zzz') === null);
}

console.log('\n=== the switches ===');
{
  ok('every Logos 4 feature is on unless switched off', J(readFlags({})) === J({ pointAsk: true, resume: true, capture: true, voice: true }));
  ok('"off", "0", "false", "no" switch one off', J(readFlags({ pointAsk: 'off', resume: '0', capture: 'FALSE', voice: ' no ' })) === J({ pointAsk: false, resume: false, capture: false, voice: false }));
  ok('anything else leaves it on', readFlags({ voice: 'yes' }).voice === true);
  const flags = read('lib/logos4/flags.ts');
  ok('each switch is read by its literal name, so Next.js inlines it', ['NEXT_PUBLIC_LOGOS4_POINT_ASK', 'NEXT_PUBLIC_LOGOS4_RESUME', 'NEXT_PUBLIC_LOGOS4_CAPTURE', 'NEXT_PUBLIC_LOGOS4_VOICE'].every((k) => flags.includes(`process.env.${k}`)));
}

console.log('\n=== wired into the app ===');
{
  const app = read('components/LogosApp.tsx');
  ok('on load: the one open when they left — unless a link or a first message chose', /const left = LOGOS4\.resume && !wanted && !pendingStart \? readResume\(browserStorage\(\)\)\.last : null/.test(app) && /if \(!pendingStart\) restoreView\(target, 'load'\)/.test(app));
  ok('on a switch: the view left is kept, and the one opened restored', /if \(id === activeIdRef\.current\) return;\s*saveView\(\);/.test(app) && /restoreView\(id, 'switch'\)/.test(app));
  ok('a reload never puts a draft over what is already in the composer', /else if \(v\?\.draft && !inputRef\.current\.trim\(\)\) setInput\(v\.draft\)/.test(app));
  ok('kept as it changes, and when the page is hidden', /window\.addEventListener\('pagehide', flush\)/.test(app) && /document\.visibilityState === 'hidden'/.test(app) && /\[input, replyTo, focus, objSel, mobileView, hydrating\]/.test(app));
  ok('a restored reply is not cleared by the switch', /if \(restoredForRef\.current === activeId\) return;\s*setReplyTo\(null\);/.test(app));
  ok('a deleted line of thinking forgets its view', /forgetView\(browserStorage\(\), id\)/.test(app));
  ok('a selection or reply comes back only if it still exists', /selectionStands\(v\.focus, m, msgs\)/.test(app) && /partStands\(v\.sel, m\)/.test(app) && /msgs\.some\(\(m\) => m\.id === v\.replyTo!\.id\)/.test(app));
  ok('a new line of thinking offers the one waiting, never another person’s', /pickUp\(sessions, readResume\(browserStorage\(\)\), \{ except: activeId, skip: \(id\) => foreignIdsRef\.current\.has\(id\) \|\| sharedIdsRef\.current\.has\(id\) \}\)/.test(app) && /Pick up where you left off/.test(app));
  ok('nothing about the view is sent to the database', !/views|resume/i.test(app.slice(app.indexOf('const persist = useCallback'), app.indexOf('const persist = useCallback') + 3000)));
  const doc = read('components/display/DocumentFigure.tsx');
  ok('a document opens where it was read to, unless a passage was asked for', /resumeAt\.current = sel \? null : readingAt\(browserStorage\(\), doc\.id\)/.test(doc) && /rememberReading\(browserStorage\(\), doc\.id, el\.dataset\.block\)/.test(doc));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
