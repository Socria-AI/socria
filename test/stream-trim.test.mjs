// THE STREAM GATE, AS A REPLY ACTUALLY ARRIVES (lib/core4/stream-gate.ts).
//
// The model's reply reaches the gate in deltas of any size: one character, a
// few tokens, or the whole reply at once. Every promise the gate makes has to
// hold whatever the size, and the audit found three that did not. What is held
// down here:
//   • EVERY ```ui BLOCK IS CHECKED, whatever the delta size. A block that
//     spanned two deltas went out unchecked as sentences (the close was found
//     at the opening fence); now a pretty-printed spec comes out canonical, a
//     chart whose figures are not theirs comes out as the notice, a third block
//     and a second live element are dropped, and steps under the guard are
//     dropped — byte-identical at 1, 3, 6, 7 and 50 characters and whole;
//   • SOMEBODY ELSE'S WORDS ARE NEVER TOUCHED by the closing-offer rule: a
//     quoted draft's last line, an unquoted email body after "Subject:" or a
//     salutation, a table cell, and the third of three requested sign-offs all
//     arrive verbatim — while a genuine trailing offer after them still goes;
//   • A DROPPED ELEMENT TAKES ITS INSTRUCTION WITH IT: "Drag a and watch the
//     vertex." directly after a graph that was dropped never reaches them;
//     advice ("Try restarting the router.") and anything later stays;
//   • FILLER IS TRIMMED BY CLASS, SHADOW FIRST (LOGOS_TRIM): the default
//     applies only announcement lines and counts the rest; "on" applies every
//     class; "shadow" applies none and counts them; the keep-lists (quotes,
//     "Sure is the word", "Absolutely." answering a yes/no question, "Here's a
//     draft:", a table's caption, Spanish and French, "Good luck") are kept in
//     every mode;
//   • THE SAME REPLY GIVES THE SAME BYTES at 1/2/3/5/8/13 characters, whole and
//     at random split points, over a corpus of about forty replies, in every
//     mode — and the same counts.

import * as G from './.tmp/stream-gate.mjs';
import * as Q from './.tmp/questions.mjs';
import * as S from './.tmp/signals.mjs';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;
const fence = (o) => '```ui\n' + (typeof o === 'string' ? o : JSON.stringify(o)) + '\n```';
const ctx = (o = {}) => ({ theirs: '', sources: '', questions: 1, shown: { n: 0 }, ...o });

/** Cut a reply into deltas: `size` characters at a time (0: whole), or at the given points. */
const deltas = (text, size) => {
  if (Array.isArray(size)) {
    const out = [];
    let at = 0;
    for (const p of size) (out.push(text.slice(at, p)), (at = p));
    out.push(text.slice(at));
    return out.filter((x) => x !== '');
  }
  if (!size) return [text];
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
};
/** Seeded random split points (mulberry32), so a failure can be replayed. */
const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randomCuts = (len, seed) => {
  const r = rng(seed);
  const cuts = new Set();
  const n = Math.max(1, Math.floor(len / 6));
  for (let i = 0; i < n; i++) cuts.add(1 + Math.floor(r() * Math.max(1, len - 1)));
  return [...cuts].sort((a, b) => a - b);
};

/**
 * The reply through a gate set up as the Logos route sets it up (neverEmpty,
 * the inline block hook over a fresh context), plus any options.
 */
const run = (reply, size = 0, { opts = {}, inline = {}, maxQ = 1, block = true } = {}) => {
  const c = ctx(inline);
  let sent = '';
  const g = new G.SentenceGate((s) => (sent += s), { neverEmpty: true, ...(block ? { block: (chunk, open) => I.gateInlineBlock(chunk, c, open) } : {}), ...opts });
  for (const d of deltas(reply, size)) g.push(d);
  const dropped = g.finish(maxQ);
  return { sent, out: g.out, dropped, stats: g.stats() };
};
const SIZES = [1, 3, 6, 7, 50, 0];
const same = (reply, sizes, o) => {
  const outs = sizes.map((s) => run(reply, s, o));
  return { outs, identical: outs.every((x) => x.sent === outs[0].sent), first: outs[0] };
};

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== every ```ui block is checked, whatever the delta size ===');
{
  const CHART = { type: 'chart', kind: 'bar', title: 'Monthly costs', x: ['Rent', 'Food', 'Transport'], series: [{ values: [1200, 400, 150] }], unit: '$', basis: 'given' };
  const theirs = 'rent 1200, food 400, transport 150';
  const canonical = I.fenceOf(I.parseInlineSpec(J(CHART)));
  // pretty-printed, with a key the vocabulary does not know: not canonical as written
  const pretty = '```ui\n' + JSON.stringify({ ...CHART, extra: 'ignored' }, null, 2) + '\n```';
  const r1 = same(`Most of it is rent.\n\n${pretty}\n\nThat leaves food.`, SIZES, { inline: { theirs } });
  ok('a pretty-printed spec comes out as fenceOf(canonical) at 1/3/6/7/50 and whole', r1.outs.every((o) => o.sent.includes(canonical) && !o.sent.includes('"extra"')), J(r1.outs.map((o) => o.sent)));
  ok('  byte-identical across those sizes', r1.identical, J(r1.outs.map((o) => o.sent)));
  ok('  and the JSON never goes out as sentences', r1.outs.every((o) => !/"values"/.test(o.sent.replace(canonical, ''))));
  ok('  with exactly one blank line before and after the block', r1.first.sent === `Most of it is rent.\n\n${canonical}\n\nThat leaves food.`, J(r1.first.sent));

  const made = { ...CHART, series: [{ values: [111, 222, 333] }] };
  const r2 = same(`Here is where it goes.\n\n${fence(made)}\n\nRent dominates.`, SIZES, { inline: { theirs } });
  ok('a chart whose figures are not theirs comes out as UNSUPPORTED_CHART, every size', r2.outs.every((o) => o.sent.includes(I.UNSUPPORTED_CHART) && !/111|222|333/.test(o.sent)), J(r2.outs.map((o) => o.sent)));
  ok('  byte-identical, and counted as a dropped chart', r2.identical && r2.outs.every((o) => o.stats.blocks.chart === 1), J(r2.outs.map((o) => o.stats.blocks)));

  const OPTS = { type: 'options', options: ['A', 'B'] };
  const three = `One.\n\n${fence(CHART)}\n\nTwo.\n\n${fence(CHART)}\n\nThree.\n\n${fence(OPTS)}\n\nDone.`;
  const r3 = same(three, SIZES, { inline: { theirs } });
  ok('a third block is dropped, every size', r3.outs.every((o) => o.sent.split('```ui').length - 1 === 2 && !o.sent.includes('"options"') && /Done\.$/.test(o.sent)), J(r3.outs.map((o) => o.sent)));
  ok('  byte-identical, and counted by kind', r3.identical && r3.outs.every((o) => o.stats.blocks.options === 1), J(r3.outs.map((o) => o.stats.blocks)));

  const GRAPH = { type: 'graph', title: 'Where the vertex sits', expr: 'a*x^2 + b*x + c', x: [-6, 4], params: [{ name: 'a', value: 1, min: -3, max: 3, step: 0.5 }, { name: 'b', value: 2, min: -6, max: 6, step: 1 }, { name: 'c', value: -1, min: -5, max: 5, step: 1 }], features: ['turning'] };
  const LOAN = { type: 'slider', title: 'Your mortgage', formula: 'p*r/12/(1-(1+r/12)^(-n))', result: { label: 'Monthly payment', unit: '$', digits: 0 }, vars: [{ name: 'p', label: 'Loan', min: 50000, max: 1000000, step: 5000, value: 300000, unit: '$' }, { name: 'r', label: 'Rate', min: 0.01, max: 0.12, step: 0.0025, value: 0.06 }, { name: 'n', label: 'Months', min: 60, max: 480, step: 12, value: 360 }] };
  const live = `Change the curve.\n\n${fence(GRAPH)}\n\nAnd the loan.\n\n${fence(LOAN)}\n\nThat is all.`;
  const r4 = same(live, SIZES);
  ok('a second live kind is dropped, every size', r4.outs.every((o) => o.sent.includes('"type":"graph"') && !o.sent.includes('"type":"slider"')), J(r4.outs.map((o) => o.sent)));
  ok('  byte-identical, counted as a dropped slider', r4.identical && r4.outs.every((o) => o.stats.blocks.slider === 1));

  const STEPS = { type: 'steps', title: 'Complete the square', lines: [{ tex: 'y = x^2 + 4x - 1' }, { tex: '= (x+2)^2 - 5' }] };
  const r5 = same(`Here is the working.\n\n${fence(STEPS)}\n\nThat is the vertex form.`, SIZES, { inline: { guard: true } });
  ok('steps under the guard are dropped, every size', r5.outs.every((o) => !o.sent.includes('```') && /That is the vertex form\.$/.test(o.sent)), J(r5.outs.map((o) => o.sent)));
  ok('  byte-identical', r5.identical, J(r5.outs.map((o) => o.sent)));
  // the same steps without the guard: drawn, so the drop above is the guard's
  ok('  (without the guard they are drawn)', run(`Working.\n\n${fence(STEPS)}\n\nDone.`, 6).sent.includes('"type":"steps"'));

  // the whitespace before a fence used to change with the delta boundary
  const tcp = `TCP vs UDP.\n\n${fence({ type: 'compare', options: ['TCP', 'UDP'], rows: [{ label: 'Order', values: ['yes', 'no'] }] })}\n\nPick by need.`;
  const r6 = same(tcp, [1, 2, 3, 4, 5, 0]);
  ok('a blank line before a fence survives every delta boundary (it was lost at 3 and 4)', r6.identical && r6.outs.every((o) => /TCP vs UDP\.\n\n```ui\n/.test(o.sent)), J(r6.outs.map((o) => o.sent)));
  // a fence that follows a single line break, and one glued to a sentence
  ok('a fence after one line break is left on its line', run('Here:\n```js\nlet x = 1;\n```\nDone.', 3).sent === 'Here:\n```js\nlet x = 1;\n```\nDone.', J(run('Here:\n```js\nlet x = 1;\n```\nDone.', 3).sent));
  ok('a block straight after a block keeps one blank line between them', (() => {
    const a = same(`A.\n\n${fence(CHART)}\n\n\n\n${fence(CHART)}\n\nB.`, SIZES, { inline: { theirs } });
    return a.identical && !/\n\n\n/.test(a.first.sent);
  })());
  const open = run('Rent is most of it.\n\n```ui\n{"type":"chart","x":["Rent"', 3);
  ok('a block the stream ended inside is dropped, its words kept, and counted', open.sent.trim() === 'Rent is most of it.' && open.stats.blocks.chart === 1, J(open));
  ok('ordinary code passes through untouched, every size', same('Run:\n\n```python\nprint("why? Let me know.")\n```\n\nThat prints it.', SIZES).outs.every((o) => o.sent.includes('print("why? Let me know.")')));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== the closing-offer rule never deletes quoted, draft, table or requested-list content ===');
{
  const CASES = [
    ['a quoted draft ending "Let me know if you have any questions."', "Here's a draft:\n\n> Hi Sam, the heater in unit 4 stopped working on Monday. Could you send someone this week? Let me know if you have any questions."],
    ['an unquoted email body after "Subject:" and a salutation', 'Subject: Heater in unit 4\n\nHi Sam,\n\nThe heater in unit 4 stopped working on Monday. Could someone come this week? Let me know if you have any questions.'],
    ['an unquoted email body after "Here\'s a draft:"', "Here's a draft:\n\nThe heater in unit 4 stopped working on Monday. Could someone come this week? Let me know if you have any questions."],
    ['"three polite ways to end a work email", the third a closer', 'Three that work:\n\n- Thanks in advance.\n- Best regards.\n- Let me know if you have any questions.'],
    ['a table row whose cell is a question and an offer', '| Phrase | Use |\n|---|---|\n| Could you send it by Friday? | a request |\n| Let me know if you have any questions. | a closer |'],
    ['a signed-off draft keeps its sign-off and name', 'Hi Sam,\n\nThe heater broke on Monday. Let me know when someone can come.\n\nBest,\nAlex'],
  ];
  for (const [name, reply] of CASES) {
    for (const mr of [false, true]) {
      // "MR on" through the gate's own seams, as the route wires them: keep, see and rewriteAll that return what they are given
      const opts = mr ? { rewriteAll: (x) => [x], keep: () => false, see: (x) => x } : {};
      const outs = [1, 3, 6, 0].map((n) => run(reply, n, { opts, maxQ: 0 }).sent);
      ok(`${name} — received verbatim at 1/3/6/whole${mr ? ' (MR seams set)' : ''}`, outs.every((o) => o === reply), J(outs));
    }
  }
  const hope = "Here's a draft:\n\n> Hi Sam, the heater in unit 4 stopped working on Monday. Let me know if you have any questions.\n\nHope this helps!";
  const h = [1, 3, 6, 0].map((n) => run(hope, n, { maxQ: 0 }).sent);
  ok('the same draft followed by "Hope this helps!": the quote is verbatim, only the trailing unquoted line goes', h.every((o) => o.trimEnd() === hope.slice(0, hope.indexOf('\n\nHope')).trimEnd()), J(h));
  // the rule still does its job outside somebody else's words
  ok('a genuine trailing offer after ordinary prose still goes', run('It works now. Let me know if you want tests.', 3).sent.trim() === 'It works now.');
  ok('  and after a signed-off draft, an offer of Socria\'s own goes too', run('Hi Sam,\n\nThe heater broke.\n\nBest,\nAlex\n\nWant me to make it shorter?', 3, { maxQ: 0 }).sent.trim() === 'Hi Sam,\n\nThe heater broke.\n\nBest,\nAlex');
  ok('  and a paragraph about the draft ends it: "Feel free to tweak…" then an offer', !/Want me to/.test(run("Here's a draft:\n\nHi Sam, the heater broke.\n\nFeel free to tweak the tone. Want me to make it shorter?", 3, { maxQ: 0 }).sent));
  ok('a lone list closer after prose is held like any offer when nothing asked for phrasings', run('That is the list.\n\n- Let me know if you want more.', 3).sent.trim() === 'That is the list.', J(run('That is the list.\n\n- Let me know if you want more.', 3).sent));
  ok('…and kept when they asked for wordings (phrasing)', run('That is the list.\n\n- Let me know if you want more.', 3, { opts: { phrasing: true } }).sent.trim() === 'That is the list.\n\n- Let me know if you want more.');
  ok('a question on a quoted line is not held for the budget', run('> Could you send someone this week? Thanks.', 1, { maxQ: 0 }).sent === '> Could you send someone this week? Thanks.');
  ok('a question of Socria\'s own is still held at budget 0', run('The heater is the landlord\'s job. Have you told them?', 3, { maxQ: 0 }).sent.trim() === "The heater is the landlord's job.");

  // the shared exemption itself
  ok('quotedOrDraft: a piece that continues a ">" line is quoted', Q.quotedOrDraft('> Hi Sam, the heater broke. ', 'Let me know if you have any questions.') && !Q.quotedOrDraft('The heater broke. ', 'Let me know.'));
  ok('quotedOrDraft: a table row, and anything inside a draft', Q.quotedOrDraft('| a | ', 'Let me know. |') && Q.quotedOrDraft('', 'Let me know.', true));
  ok('interrogatives() reads the line it is given: nothing on a quoted line counts', Q.interrogatives('Let me know if you have any questions.', '> Hi Sam. ').offers.length === 0 && Q.interrogatives('Let me know if you have any questions.').offers.length === 1);
  ok('draftStep: a label arms, the next line starts the draft, the blank after a sign-off ends it', (() => {
    let s = 'none';
    const seq = ["Here's a draft:", '', 'Hi Sam,', 'The heater broke.', 'Best,', 'Alex', '', 'Want me to shorten it?'].map((l) => (s = Q.draftStep(s, l)));
    return J(seq) === J(['armed', 'armed', 'body', 'body', 'signoff', 'signoff', 'none', 'none']);
  })());
  ok('  "Note:" and "A note on units:" do not start a draft; "Here is a version you could send:" does', Q.draftStep('none', 'Note:') === 'none' && Q.draftStep('none', 'A note on units:') === 'none' && Q.draftStep('none', 'Here is a version you could send:') === 'armed');
  ok('  a label followed by a quote leaves the draft to the quote', Q.draftStep('armed', '> Hi Sam,') === 'none');
  ok('  "Here\'s what the error message means:" explains, it hands them no words: no draft', Q.draftStep('none', "Here's what the error message means:") === 'none');
  ok('  …so Socria\'s own offer after it still goes', run("Here's what the error message means:\n\nThe server refused the key. Let me know if you want me to check the logs.", 3).sent.trim() === "Here's what the error message means:\n\nThe server refused the key.");

  // the signal
  ok('requestsPhrasing: "three polite ways to end a work email", "give me 5 lines", "how else could I sign off"', S.requestsPhrasing('Give me three polite ways to end a work email.') && S.requestsPhrasing('give me 5 lines for a toast') && S.requestsPhrasing('how else could I sign off?') && S.readSignals('Give me three polite ways to end a work email.').requestsPhrasing === true);
  ok('  not "How do I solve this?", not "write me an email", not a quoted request', !S.requestsPhrasing('How do I solve this?') && !S.requestsPhrasing('Write me a short email to my landlord.') && !S.requestsPhrasing('My boss said "give me 5 lines" and left.') && S.NO_SIGNALS.requestsPhrasing === false);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== a dropped element takes its instruction with it, and nothing else ===');
{
  const BAD = { type: 'graph', title: 'x', fn: 'a*x^2' }; // `fn`, not `expr`: dropped
  const r = same(`A parabola turns once.\n\n${fence(BAD)}\n\nDrag a and watch the vertex. The vertex is at -b/2a.`, SIZES);
  ok('an invalid graph followed by "Drag a and watch the vertex." leaves no such sentence', r.outs.every((o) => !/Drag a/.test(o.sent) && /The vertex is at -b\/2a\.$/.test(o.sent)), J(r.outs.map((o) => o.sent)));
  ok('  byte-identical, counted as an imperative and a dropped graph', r.identical && r.outs.every((o) => o.stats.removed.imperative === 1 && o.stats.blocks.graph === 1), J(r.outs.map((o) => o.stats)));
  ok('"Pick one to open." after dropped choices goes too', !/Pick one/.test(run(`Two ways.\n\n${fence({ type: 'options', options: ['A', 'B'] })}\n\nPick one to open.`, 3, { inline: { questions: 0 } }).sent));
  ok('advice is not an instruction to an element: "Try restarting the router." stays', /Try restarting the router\./.test(run(`Two ways.\n\n${fence(BAD)}\n\nTry restarting the router.`, 3).sent));
  ok('only the sentence directly after: a later "Drag…" stays', /Drag the point/.test(run(`One.\n\n${fence(BAD)}\n\nThe curve is a parabola. Drag the point to see it.`, 3).sent));
  ok('after an element that was drawn, the instruction stays', /Drag a and watch/.test(run(`One.\n\n${fence({ type: 'graph', title: 'v', expr: 'a*x^2', x: [-3, 3], params: [{ name: 'a', value: 1, min: -2, max: 2, step: 0.5 }] })}\n\nDrag a and watch the vertex.`, 3).sent));
  ok('no block hook, nothing dropped, nothing taken', /Drag a/.test(run(`One.\n\n${fence(BAD)}\n\nDrag a and watch.`, 3, { block: false }).sent));
  ok('elementImperative: Drag/Slide always; other verbs need a word for an element', Q.elementImperative('Slide it right.') && Q.elementImperative('Set b to 0 and see what happens.') && !Q.elementImperative('Try restarting the router.') && !Q.elementImperative('Open the window for air.') && !Q.elementImperative('The point is clear.'));
  ok('stats() and gateTrace(): per-kind drop counts, content-free', /;ui-drop=graph:1$/.test(G.gateTrace(r.first.stats)) && /^trim=safe;o:0,b:0,r:0,p:0,d:0,c:0,q:0,s:0,i:1;would=/.test(G.gateTrace(r.first.stats)), G.gateTrace(r.first.stats));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== filler, by class, shadow first ===');
{
  ok('the mode: LOGOS_TRIM on / shadow / off, anything else "safe"', G.trimModeOf('on') === 'on' && G.trimModeOf('SHADOW') === 'shadow' && G.trimModeOf('off') === 'off' && G.trimModeOf('') === 'safe' && G.trimModeOf('yes') === 'safe');
  const T = (reply, mode, opts = {}, size = 3, maxQ = 1) => run(reply, size, { opts: { trim: mode, ...opts }, maxQ, block: false });
  const NOT_POLAR = { asked: 'How long should I boil an egg for a runny yolk?', exchange: 'task', shape: 'understand' };

  // drop-list, LOGOS_TRIM=on
  const dive = T("Certainly! Let's dive in. With 8 months of runway, the hire that matters moves revenue before month 6.", 'on', NOT_POLAR);
  ok('on: "Certainly! Let\'s dive in." opener goes, the answer starts with a capital', dive.sent === 'With 8 months of runway, the hire that matters moves revenue before month 6.' && dive.stats.removed.opener === 1 && dive.stats.removed.announce === 1, J(dive));
  ok('on: a trailing "I hope this helps!" goes', T('The derivative of x^2 is 2x. I hope this helps!', 'on', NOT_POLAR).sent.trim() === 'The derivative of x^2 is 2x.');
  ok('  …but released in order when more exposition follows', T('The derivative is 2x. I hope this helps! The chain rule comes next.', 'on', NOT_POLAR).sent === 'The derivative is 2x. I hope this helps! The chain rule comes next.');
  const recap = 'TCP numbers every packet and resends lost ones, so data arrives in order. UDP sends packets without numbering or resending them, so it is faster. In summary, TCP resends lost packets so data arrives in order, and UDP is faster.';
  ok('on: a redundant "In summary" tail goes', T(recap, 'on', NOT_POLAR).sent.trim() === recap.slice(0, recap.indexOf(' In summary')), J(T(recap, 'on', NOT_POLAR)));
  ok('  a recap that adds a decision stays', /In short, pick TCP unless latency under 50 ms matters\./.test(T('TCP orders packets. UDP does not. Games use UDP. In short, pick TCP unless latency under 50 ms matters.', 'on', NOT_POLAR).sent));
  ok('  a recap followed by more prose is released', /In summary, .* Next/.test(T(recap + ' Next, the handshake.', 'on', NOT_POLAR).sent));
  ok('  a recap in a two-sentence reply stays', /In summary/.test(T('TCP orders packets. In summary, TCP orders packets.', 'on', NOT_POLAR).sent));
  ok('on: "Happy studying!" goes on a task turn, stays on a social one, and stays when the exchange is unknown', T('The answer is 2x. Happy studying!', 'on', NOT_POLAR).sent.trim() === 'The answer is 2x.' && /Happy studying/.test(T('The answer is 2x. Happy studying!', 'on', { ...NOT_POLAR, exchange: 'social' }).sent) && /Happy studying/.test(T('The answer is 2x. Happy studying!', 'on', { asked: NOT_POLAR.asked }).sent));
  const def = 'Opportunity cost is a fundamental concept in economics. It is the value of the next-best option you give up.';
  ok('on: the textbook opener goes on an understand turn, followed by its definition', T(def, 'on', NOT_POLAR).sent === 'It is the value of the next-best option you give up.', J(T(def, 'on', NOT_POLAR)));
  ok('  stays on any other shape, and when the shape is unknown', T(def, 'on', { ...NOT_POLAR, shape: 'decide' }).sent === def && T(def, 'on', { asked: NOT_POLAR.asked }).sent === def);
  ok('  "Entropy is a key concept because…" says something and stays', T('Entropy is a key concept because it sets the direction of heat flow. More below.', 'on', NOT_POLAR).sent.startsWith('Entropy is a key concept because'));
  ok('  a one-sentence reply is never emptied', T('Opportunity cost is a fundamental concept in economics.', 'on', NOT_POLAR).sent === 'Opportunity cost is a fundamental concept in economics.');
  ok('on: "Sure, here are the steps:" keeps the steps', T('Sure, here are the steps:\n1. Boil water.\n2. Add the egg.', 'on', NOT_POLAR).sent === 'Here are the steps:\n1. Boil water.\n2. Add the egg.', J(T('Sure, here are the steps:\n1. Boil water.\n2. Add the egg.', 'on', NOT_POLAR).sent));
  ok('on: "Sure! 12 × 13 = 156." keeps the sum', T('Sure! 12 × 13 = 156.', 'on', { asked: 'What is 12 * 13?' }).sent === '12 × 13 = 156.');
  ok('on: an interjection with too little after it stays ("Sure! Done.")', T('Sure! Done.', 'on', NOT_POLAR).sent === 'Sure! Done.');
  ok('on: a heading first, then the opener on the first prose line', T('## Answer\n\nCertainly! The derivative of x^2 is 2x.', 'on', NOT_POLAR).sent === '## Answer\n\nThe derivative of x^2 is 2x.', J(T('## Answer\n\nCertainly! The derivative of x^2 is 2x.', 'on', NOT_POLAR).sent));
  ok('a line break after a kept interjection stays where it was ("Sure!\\n…"), in every mode', ['on', 'safe', 'shadow'].every((m) => T('Sure!\nThe answer is 2x, as the power rule gives.', m, { asked: 'Can I use the power rule?' }).sent === 'Sure!\nThe answer is 2x, as the power rule gives.'));
  ok('on: a removed interjection takes its line break with it', T('Certainly!\nThe derivative of x^2 is 2x.', 'on', NOT_POLAR).sent === 'The derivative of x^2 is 2x.', J(T('Certainly!\nThe derivative of x^2 is 2x.', 'on', NOT_POLAR).sent));
  ok('on: never from the middle — a second-line "Sure!" stays', /Sure! It is 2x\./.test(T('The answer first.\nSure! It is 2x.', 'on', NOT_POLAR).sent));

  // keep-list, in every mode
  for (const mode of ['on', 'safe', 'shadow', 'off']) {
    const keep = [
      ['"Sure is the word to use there"', 'Sure is the word to use there; certain is more formal.', NOT_POLAR],
      ['"\\"Great question\\" is a phrase…"', '"Great question" is a phrase interviewers use to buy time.', NOT_POLAR],
      ['"Absolutely." answering "Can I freeze rice?"', 'Absolutely. Cool it within an hour, then freeze it flat.', { asked: 'Can I freeze rice?', exchange: 'task' }],
      ['"Here\'s a draft:"', "Here's a draft:\n\nHi Sam, the heater broke on Monday.", NOT_POLAR],
      ['a table after an announcing line', "Here's a breakdown of the key differences:\n\n| | TCP | UDP |\n|---|---|---|\n| ordered | yes | no |", NOT_POLAR],
      ['Spanish', '¡Claro! La derivada de x^2 es 2x. Espero que esto te ayude.', NOT_POLAR],
      ['French', "La dérivée de x^2 est 2x. J'espère que cela vous aide !", NOT_POLAR],
      ['"Good luck"', 'The answer is 2x. Good luck!', NOT_POLAR],
      ['"Hope this helps, and good luck!"', 'The answer is 2x. Hope this helps, and good luck with the exam!', NOT_POLAR],
      ['a quoted "Sure!"', '"Sure!" she said, and left the room before anyone answered.', NOT_POLAR],
      ['a list item', '- Certainly! Ask for the receipt first.\n- Then ask for a refund.', NOT_POLAR],
      ['a requested phrasing', 'Three closers:\n\nHappy coding!\n\nEnjoy the weekend!\n\nI hope this helps!', { ...NOT_POLAR, phrasing: true }],
      ['a code comment', 'Run this:\n\n```js\n// Let me know if it fails. Hope this helps!\nrun();\n```', NOT_POLAR],
    ];
    for (const [name, reply, o] of keep) {
      const r = T(reply, mode, o, 3, 1);
      ok(`${mode}: keeps ${name}`, r.sent === reply, J(r.sent));
    }
  }

  // the default (safe): only the announcement lines go; everything else is counted
  const safe = T("Certainly! Let's dive in. With 8 months of runway, hire the engineer. Happy hiring! I hope this helps!", 'safe', NOT_POLAR);
  ok('safe (the default): the announcement goes, the interjection stays', safe.sent.startsWith('Certainly! With 8 months of runway'), J(safe.sent));
  ok('  and the opener and the tail are counted, not applied', safe.stats.removed.announce === 1 && safe.stats.would.opener === 1 && safe.stats.would.pleasantry === 1 && safe.stats.removed.opener === 0 && /I hope this helps!$/.test(safe.sent), J(safe.stats));
  ok('  "Here\'s a breakdown of the key differences between TCP and UDP." goes before prose', T("Here's a breakdown of the key differences between TCP and UDP.\n\nTCP guarantees order; UDP does not.", 'safe', {}).sent === 'TCP guarantees order; UDP does not.');
  ok('  "Let\'s break this down step by step." goes before a list, the list stays whole', T("Let's break this down step by step.\n\n1. Differentiate.\n2. Set to zero.", 'safe', {}).sent === '1. Differentiate.\n2. Set to zero.');
  ok('  an announcement that is the whole reply stays', T("Let's dive in.", 'safe', {}).sent === "Let's dive in.");
  ok('  the existing offer rule still applies', T('It is 2x. Let me know if you have any other questions.', 'safe', {}).sent.trim() === 'It is 2x.');

  // shadow: nothing new applied, everything counted; off: nothing counted
  const sh = T("Certainly! Let's dive in. With 8 months of runway, hire the engineer. I hope this helps!", 'shadow', NOT_POLAR);
  ok('shadow: nothing new is applied', sh.sent === "Certainly! Let's dive in. With 8 months of runway, hire the engineer. I hope this helps!", J(sh.sent));
  ok('  and every class that would have fired is counted', sh.stats.would.opener === 1 && sh.stats.would.announce === 1 && sh.stats.would.pleasantry === 1 && Object.values(sh.stats.removed).every((n) => n === 0), J(sh.stats));
  const offm = T("Certainly! Let's dive in. With 8 months of runway, hire the engineer. I hope this helps!", 'off', NOT_POLAR);
  ok('off: nothing applied and nothing counted', offm.sent === sh.sent && Object.values(offm.stats.would).every((n) => n === 0));
  ok('without `asked`, Class A never runs (and is not counted): a yes/no answer cannot be told apart', T('Absolutely. Cool it within an hour.', 'on', {}).sent === 'Absolutely. Cool it within an hour.' && T('Absolutely. Cool it within an hour.', 'shadow', {}).stats.would.opener === 0);
  ok('the trace carries the counts and nothing else', G.gateTrace(safe.stats) === 'trim=safe;o:0,b:1,r:0,p:0,d:0,c:0,q:0,s:0,i:0;would=o:1,b:0,r:0,p:1,d:0', G.gateTrace(safe.stats));
  ok('a dropped closing offer is counted as c', T('It is 2x. Let me know if you have any other questions.', 'safe', {}).stats.removed.offer === 1);

  // the detectors on their own
  ok('isPolarQuestion: "Can I freeze rice?" yes; "How long…?" no', Q.isPolarQuestion('Can I freeze rice?') && Q.isPolarQuestion('Quick one. Is it safe?') && !Q.isPolarQuestion('How long to boil an egg?'));
  ok('englishDominant: English yes; Spanish and French no', Q.englishDominant('The answer is 2x.') && Q.englishDominant('Sure! 12 × 13 = 156.') && !Q.englishDominant('¡Claro! La derivada de x^2 es 2x.') && !Q.englishDominant("La dérivée de x^2 est 2x. J'espère que cela vous aide !"));
  ok('pleasantryOf: never "good luck"; "I hope the interview goes well." and "We hope this helps the team ship." are not filler', Q.pleasantryOf('Hope it helps, and good luck!') === null && Q.pleasantryOf('I hope the interview goes well.') === null && Q.pleasantryOf('We hope this helps the team ship faster.') === null && Q.pleasantryOf('I really hope that helps.') === 'hope');
  ok('isAnnouncement: never a line that labels content', !Q.isAnnouncement("Here's a draft:") && !Q.isAnnouncement("Let's take a look at your budget.") && Q.isAnnouncement("Let's break it down."));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== the same reply, the same bytes, however it arrives ===');
{
  const GRAPH = { type: 'graph', title: 'v', expr: 'a*x^2', x: [-3, 3], params: [{ name: 'a', value: 1, min: -2, max: 2, step: 0.5 }] };
  const CORPUS = [
    'Great question! The derivative of x^2 is 2x.',
    'Sure! The derivative of x^2 is 2x.',
    'Certainly! Here is the derivative: 2x.',
    'Absolutely. Supply rises when price rises.',
    "Here's a breakdown of the key differences between TCP and UDP:\n\n| | TCP | UDP |\n|---|---|---|\n| ordered | yes | no |",
    "Let's dive in! TCP guarantees order; UDP does not.",
    "Let's break this down step by step.\n\n1. Differentiate.\n2. Set to zero.",
    'Opportunity cost is a fundamental concept in economics. It is the value of the next-best option you give up.',
    '## Answer\n\nGreat question! It is 2x.',
    'Of course! It is 2x.',
    'The answer is 2x. I hope this helps!',
    'The answer is 2x.\n\nHope this helps, and good luck with the exam!',
    'The answer is 2x. Let me know if you have any other questions.',
    'The answer is 2x. Feel free to ask if anything is unclear.',
    'TCP orders packets. UDP does not. In summary, TCP orders packets and UDP does not.',
    'TCP orders packets. UDP does not.\n\nIn conclusion, pick TCP for files and UDP for games.',
    'The answer is 2x. Happy studying!',
    'The answer is 2x. Good luck!',
    'The answer is 2x. Let me know if you want more examples',
    'TCP vs UDP.\n\n```ui\n{"type":"compare","options":["TCP","UDP"],"rows":[{"label":"Order","values":["yes","no"]}]}\n```\n\nI hope this helps!',
    'The answer is 2x. Let me know which step is unclear. Then we can do the chain rule.',
    'End the email with: "Let me know if you have any questions." That reads as polite.',
    'Here is a sign-off for your email:\n\n> Thanks again. Let me know if you have any questions.',
    'Sure is the word to use there; certain is more formal.',
    '"Great question" is a phrase interviewers use to buy time.',
    '¡Claro! La derivada de x^2 es 2x. Espero que esto te ayude.',
    "La dérivée de x^2 est 2x. J'espère que cela vous aide !",
    "You're right. The sign is negative.",
    'Dr. Smith says the dose is 5 mg. That is standard, e.g. for adults.',
    'The integral is $\\int_0^1 x\\,dx = 1/2$. Check it by differentiating.',
    "Here's a draft:\n\n> Hi Sam, the heater in unit 4 stopped working on Monday. Could you send someone this week? Let me know if you have any questions.\n\nHope this helps!",
    'Subject: Heater in unit 4\n\nHi Sam,\n\nThe heater stopped working on Monday. Could someone come this week? Let me know if you have any questions.\n\nBest,\nAlex',
    'Three that work:\n\n- Thanks in advance.\n- Best regards.\n- Let me know if you have any questions.',
    'Run this:\n\n```js\nconst ok = x?.y ?? z;\nconsole.log("why?");\n```\n\nThat fixes it. Want me to add a test?',
    `A parabola turns once.\n\n${fence({ type: 'graph', fn: 'x' })}\n\nDrag a and watch the vertex. It sits at -b/2a.`,
    `Change it.\n\n${fence(GRAPH)}\n\nDrag a and watch the curve open.`,
    "Certainly! Let's dive in. With 8 months of runway, the hire that matters is the one that moves revenue before month 6. Hope this helps, and good luck!",
    'Absolutely! About 6 minutes from boiling water, then into cold water. Enjoy your eggs!',
    'Why does this matter? Because investors cluster where exits happened. That is the mechanism.',
    'No. Cool it first, then freeze it.\n\n\n\nThat keeps it safe.',
    'Step 1: subtract 3, 2x = 8. Step 2: divide by 2, x = 4. Does that make sense?',
    'What do you think about Austin?',
  ];
  ok(`the corpus is about forty replies (${CORPUS.length})`, CORPUS.length >= 40);
  const SETUPS = [
    ['safe', { trim: 'safe' }],
    ['on', { trim: 'on', asked: 'How does this work?', exchange: 'task', shape: 'understand' }],
    ['shadow', { trim: 'shadow', asked: 'How does this work?', exchange: 'task', shape: 'understand' }],
  ];
  const STEPS = [1, 2, 3, 5, 8, 13, 0];
  for (const [mode, opts] of SETUPS) {
    let bad = [];
    for (const reply of CORPUS) {
      const runs = STEPS.map((n) => run(reply, n, { opts, maxQ: 1 }));
      for (let seed = 1; seed <= 3; seed++) runs.push(run(reply, randomCuts(reply.length, seed * 7919 + reply.length), { opts, maxQ: 1 }));
      const base = runs[runs.length - 4 /* whole */];
      const diff = runs.find((r) => r.sent !== base.sent || J(r.stats) !== J(base.stats));
      if (diff) bad.push({ reply, whole: base.sent, other: diff.sent, a: base.stats, b: diff.stats });
    }
    ok(`${mode}: every reply is byte-identical at 1/2/3/5/8/13, whole and three random splits — with the same counts`, bad.length === 0, J(bad.slice(0, 2)));
  }
  // and the gate's own whitespace no longer depends on where a delta ended
  ok('a sentence and the blank line after it travel together ("Let me know!" + "\\n\\n" is still a trailing offer)', run('It works.\n\nLet me know!\n\n', [16, 25]).sent.trim() === 'It works.' && run('It works.\n\nLet me know!\n\n', 0).sent.trim() === 'It works.');
  ok('"Dr. Smith" is one piece: the abbreviation never ends a sentence', (() => {
    const pieces = [];
    const g = new G.SentenceGate((s) => pieces.push(s), { trim: 'off' });
    g.push('Dr. Smith says the dose is 5 mg. That is standard.');
    g.finish(1);
    return pieces[0] === 'Dr. Smith says the dose is 5 mg. ';
  })());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
