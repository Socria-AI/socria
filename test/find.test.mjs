// Find inside a conversation, and hints that only ever appear once.
//
// Two things go wrong here and neither throws: a filter that quietly drops
// turns (so the line you are hunting for is simply not in the results), and
// a highlighter that mangles the text around the match.

import { saidIn, countsOf, findIn, splitMatch } from './.tmp/find.mjs';
import { HINT_ORDER, HINT_KEY, pickHint, readSeen, markSeen, resetSeen } from './.tmp/hints.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const THREAD = [
  { role: 'user', text: 'I have two job offers' },
  { role: 'assistant', text: 'What made you open to leaving?' },
  { role: 'user', text: 'The money, mostly' },
  { role: 'insight', insight: { text: 'You are weighing the new thing' } },
  { role: 'assistant', text: 'And the old one?' },
];

console.log('=== flattening a thread ===');
{
  const said = saidIn(THREAD);
  ok('every line with text is kept', said.length === 5, String(said.length));
  // THE ONE MOST EASILY MISSED: an insight carries its sentence on
  // insight.text, and it is the line people most often come back for.
  const ins = said.find((s) => s.text.includes('weighing'));
  ok('an insight card is searchable', !!ins, JSON.stringify(said.map((s) => s.text)));
  ok('...and is attributed to socria', ins && ins.who === 'socria', ins && ins.who);
  ok('indices point back at the thread', said.every((s) => THREAD[s.i] !== undefined));
  ok('the insight keeps its own index', ins && ins.i === 3, String(ins && ins.i));

  const c = countsOf(said);
  ok('two are yours', c.you === 2, String(c.you));
  ok('three are not', c.socria === 3, String(c.socria));
  ok('and all is the sum', c.all === c.you + c.socria);
}

console.log('\n=== it defaults to what YOU said ===');
{
  // The design's reason: in a long thread the line you are hunting for is
  // almost always your own.
  const said = saidIn(THREAD);
  const mine = findIn(said, '');
  ok('an empty query shows your lines, not none', mine.length === 2, String(mine.length));
  ok('...and they are yours', mine.every((s) => s.who === 'you'));
  ok('scope socria gives the rest', findIn(said, '', 'socria').length === 3);
  ok('scope all gives everything', findIn(said, '', 'all').length === 5);

  ok('a query narrows within the scope', findIn(said, 'money').length === 1);
  ok('and does not cross scopes', findIn(said, 'leaving').length === 0, 'that line is Socria’s');
  ok('...until you widen it', findIn(said, 'leaving', 'all').length === 1);
  ok('matching is case-insensitive', findIn(said, 'MONEY').length === 1);
  ok('whitespace is trimmed', findIn(said, '  money  ').length === 1);
  ok('no match is empty, not everything', findIn(said, 'zzzz', 'all').length === 0);
  ok('results stay in thread order',
    findIn(said, '', 'all').every((s, k, a) => k === 0 || a[k - 1].i < s.i));
}

console.log('\n=== highlighting never rewrites the sentence ===');
{
  const p = splitMatch('The money, mostly', 'money');
  ok('three pieces', p.length === 3, JSON.stringify(p));
  ok('the middle is the hit', p[1].hit === true && p[1].text === 'money');
  ok('the others are not', !p[0].hit && !p[2].hit);
  // THE REAL BUG THIS PREVENTS: building the output from the lowercased copy
  // silently rewrites somebody's own capitalisation.
  const cased = splitMatch('Money Matters', 'money');
  ok('the original casing survives', cased.map((x) => x.text).join('') === 'Money Matters',
    JSON.stringify(cased));
  ok('...and the hit is the original, not the query', cased[0].text === 'Money');

  ok('rejoining always reproduces the input',
    ['', 'abc', 'aXbXc', 'x'].every((t) =>
      ['x', 'X', '', 'zz'].every((q) => splitMatch(t, q).map((p2) => p2.text).join('') === t)));

  ok('no query means one plain piece', splitMatch('abc', '').length === 1);
  ok('a miss means one plain piece', splitMatch('abc', 'zz').length === 1);
  ok('a match at the start has no empty lead', splitMatch('abc', 'a')[0].hit === true);
  ok('a match at the end has no empty tail', splitMatch('abc', 'c').length === 2);
  ok('a whole-string match is one hit', splitMatch('abc', 'abc').length === 1 && splitMatch('abc', 'abc')[0].hit);
}

console.log('\n=== nothing here is worth a broken panel ===');
{
  for (const junk of [null, undefined, [], [null], [{}], [{ role: 'user' }], [{ role: 42 }]]) {
    let threw = null, out;
    try { out = saidIn(junk); } catch (e) { threw = e; }
    ok(`${JSON.stringify(junk) ?? typeof junk} does not throw`, threw === null, String(threw));
    ok(`...and yields an array`, Array.isArray(out));
  }
  ok('a turn with no text is dropped', saidIn([{ role: 'user' }]).length === 0);
  ok('an empty insight is dropped', saidIn([{ role: 'insight', insight: {} }]).length === 0);
  for (const junk of [null, undefined, 42, {}]) {
    ok(`splitMatch survives ${typeof junk}`, splitMatch(junk, 'x').length >= 1);
  }
}

console.log('\n=== hints: one at a time, once ===');
{
  ok('the order is the four', HINT_ORDER.length === 4, String(HINT_ORDER.length));
  ok('the key is versioned', /v\d+$/.test(HINT_KEY), HINT_KEY);

  // Only the FIRST eligible unseen one, in HINT_ORDER — not the first
  // eligible, and never two.
  ok('picks by order, not by argument order',
    pickHint(['find', 'insight'], []) === 'insight',
    String(pickHint(['find', 'insight'], [])));
  ok('skips what was dismissed', pickHint(['insight', 'picker'], ['insight']) === 'picker');
  ok('nothing eligible is null', pickHint([], []) === null);
  ok('all seen is null', pickHint(HINT_ORDER.slice(), HINT_ORDER.slice()) === null);
  ok('an unknown id is never shown', pickHint(['nonsense'], []) === null);

  // The store.
  const mk = (v) => { let held = v; return {
    getItem: () => held, setItem: (_k, val) => { held = val; }, peek: () => held }; };
  const s = mk(null);
  ok('a fresh store has seen nothing', readSeen(s).length === 0);
  markSeen(s, 'insight');
  ok('dismissing sticks', readSeen(s).includes('insight'));
  markSeen(s, 'insight');
  ok('...and is idempotent', readSeen(s).filter((x) => x === 'insight').length === 1);
  markSeen(s, 'find');
  ok('a second one joins it', readSeen(s).length === 2);
  resetSeen(s);
  ok('reset brings them all back', readSeen(s).length === 0);

  ok('junk in the store reads as empty', readSeen(mk('{{{')).length === 0);
  ok('a non-array reads as empty', readSeen(mk('"nope"')).length === 0);
  ok('non-strings are filtered out', readSeen(mk('[1,"insight",null]')).length === 1);
  ok('no store at all is survivable', readSeen(null).length === 0);
  // A throwing store errs toward NOT interrupting.
  const boom = { getItem() { throw new Error('denied'); } };
  ok('a throwing store shows no new hints', readSeen(boom).length === HINT_ORDER.length);
  let threw = null;
  try { markSeen(boom, 'x'); resetSeen({ setItem() { throw new Error('no'); } }); } catch (e) { threw = e; }
  ok('writing to a throwing store does not throw', threw === null, String(threw));
}


// ── the shape the chat actually stores ──────────────────────────────
//
// This is the bug that made Find look completely broken: /chat stores a
// message as {role, content} while the Logos thread stores {role, text}.
// saidIn read `text`, found undefined on every chat message, skipped them
// all, and the panel reported "Nothing has been said here yet" over a
// conversation that was visibly on screen. The call site cast the array to
// `never`, which silenced the one type error that would have caught it.
{
  const chat = [
    { role: 'user', content: 'I got an offer with more money.' },
    { role: 'assistant', content: 'What made you open to leaving?' },
  ];
  const said = saidIn(chat);
  ok('a chat message is a line', said.length === 2);
  ok('and it keeps who said it', said[0].who === 'you' && said[1].who === 'socria');
  ok('and the words', said[0].text === 'I got an offer with more money.');
  ok('find works on it', findIn(said, 'offer', 'you').length === 1);

  // Both spellings in one thread, which is what a mixed surface would hand us.
  const mixed = [
    { role: 'user', text: 'spelled text' },
    { role: 'assistant', content: 'spelled content' },
  ];
  ok('both spellings read', saidIn(mixed).length === 2);

  // `text` wins when a turn somehow carries both, because that is the name
  // the richer surface uses.
  ok('text wins over content',
     saidIn([{ role: 'user', text: 'a', content: 'b' }])[0].text === 'a');

  // An insight still comes off insight.text, not content.
  ok('an insight is unaffected',
     saidIn([{ role: 'insight', insight: { text: 'the realisation' }, content: 'ignored' }])[0].text
       === 'the realisation');

  // Neither field is not a line.
  ok('a turn with no words is skipped', saidIn([{ role: 'user' }]).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
