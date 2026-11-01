// PROGRESSIVE DISCLOSURE WITHOUT HEADINGS — and the elements it never hides.
//
// The audit (vx-audit R1, R2) found disclosure backwards. Folding happened
// only under headings a model happened to write, so the commonest text wall —
// six paragraphs of textbook, no headings — reached the page whole. And when a
// reply did have parts, a comparison or a chart under a later heading was the
// thing folded away, behind a row with a blank preview, while the paragraphs it
// was there to replace stayed open.
//
// What is held down here:
//
//   • A REPLY WITH NO PARTS folds what follows once it has drawn two blocks of
//     prose and 140 words — decided only from what came before, so a reply
//     cut mid-stream is laid out, for what it has written, as it lands. The
//     row is titled by the sentence it opens on when that is short, or "More",
//     and says how much it holds. Its closing question and closing line stay
//     out. The same rule works inside an over-long first part.
//   • DEPTH ASKED FOR is shown in full: "in detail", "step by step", "Go
//     deeper: …", "walk me through", a Detailed length — nothing folds.
//   • EVERY ELEMENT that is something to look at or work with is never folded
//     (all kinds but a draft and the reasoning, which are disclosures
//     themselves), the new kinds included by name. One where a fold would be
//     closes the fold; prose after it carries on in a fold of its own.
//   • NO FOLD ROW IS EVER BLANK, and copying a reply copies all of it.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 600))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const fence = (o) => '```ui\n' + JSON.stringify(o) + '\n```';
const reply = (content, props = {}) => html(h(I.L5Message, { m: { id: 'm1', role: 'assistant', content }, side: 'socria', who: 'Socria', group: false, cont: false, showQuote: false, canReply: false, ...props }));
const read = (text, o = {}) => I.editorialBlocks(I.parseBlocks(text, { rich: true }), { more: !!o.streaming });
const layout = (text, o = {}) => I.layoutReply(read(text, o), o);
const kinds = (pieces) => pieces.map((p) => (p.kind === 'block' ? (p.lead ? 'lead' : 'b') : p.kind === 'fold' ? (p.cont ? 'cont' : p.head < 0 ? 'more' : 'fold') : p.kind)).join(' ');
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const folded = (pieces) => new Set(pieces.flatMap((p) => (p.kind === 'fold' ? p.body : [])));

// ── a textbook answer, six paragraphs, no headings ───────────────────
const P1 =
  'Photosynthesis is how a plant turns light into chemical energy it can store and use later. Inside each chloroplast, chlorophyll absorbs light, and that energy is used to split water, which releases oxygen as a by-product and produces two energy carriers, ATP and NADPH. Everything else in the process depends on those two carriers, and nothing downstream can run without a steady supply of them. That is why a leaf in shade still works, only slowly.';
const P2 =
  'The second stage, the Calvin cycle, takes place in the stroma around the membranes and does not need light directly. It spends the ATP and NADPH from the first stage to fix carbon dioxide from the air into a three-carbon sugar, which the plant then builds into glucose, starch and cellulose over the course of the day and night, storing what it does not need at once for later.';
const P3 = 'The rate depends on three things at once. Light intensity matters up to a point, after which the enzymes cannot keep up. Carbon dioxide concentration matters in the same way, and temperature sets how fast the enzymes work at all.';
const P4 = 'Different plants have found different ways around those limits. C4 plants such as maize concentrate carbon dioxide in special cells, which lets them keep working in hot, bright conditions where ordinary plants would close their pores and stall for the afternoon.';
const P5 = 'CAM plants such as cacti go further still and open their pores only at night, storing carbon dioxide as an acid and spending it during the day, which saves a great deal of water in a desert where every drop counts.';
const P6 = 'All of this is why photosynthesis sits under nearly every food chain on Earth, and why the oxygen in the air you breathe was, at some point, split from water inside a leaf somewhere.';
const TEXTBOOK = [P1, P2, P3, P4, P5, P6].join('\n\n');

console.log('\n=== a reply with no headings: two paragraphs, then a fold ===');
{
  ok(`the fixture: six paragraphs, ${words(TEXTBOOK)} words, the first two ${words(P1) + words(P2)}`, words(TEXTBOOK) >= 300 && words(P1) + words(P2) >= I.PARAGRAPH_FOLD_WORDS);
  const L = layout(TEXTBOOK);
  // (the opening paragraph's first sentence is set apart as the lead — lib/reply-layout.ts splitLead — and
  // the rest of that paragraph is still one paragraph as far as folding goes)
  ok('two paragraphs in view, the rest folded under one row (its closing line kept out)', kinds(L) === 'lead b b more b', kinds(L));
  const f = L.find((p) => p.kind === 'fold');
  ok('  a fold with no heading of its own (head -1)', f.head === -1 && !f.cont);
  ok('  titled by the sentence it opens on, being short', f.title === 'The rate depends on three things at once', f.title);
  ok('  and saying how much it holds', f.count === '3 paragraphs', f.count);
  ok('  its first words are the ones after the title, not the title again', f.preview.startsWith('Light intensity matters') && !f.preview.includes('three things at once'), f.preview);
  const longFirst = layout([P1, P2, 'This third paragraph opens with a sentence that runs on for far longer than twelve words before it stops. And then more.', P4, P5].join('\n\n'));
  const lf = longFirst.find((p) => p.kind === 'fold');
  ok('  an opening sentence over twelve words: titled "More"', lf?.title === 'More' && lf.preview.length > 10, J(lf));
  const drawn = reply(TEXTBOOK);
  ok('drawn: a details row, "More · …" style, with the count', /<details class="socria-fold is-prose"[ >]/.test(drawn) && /class="socria-fold-n"> · (?:<!-- -->)?3 paragraphs/.test(drawn), drawn.slice(drawn.indexOf('<details'), drawn.indexOf('<details') + 500));
  ok('  every word is still on the page, inside the fold (find-in-page, screen readers)', drawn.includes('CAM plants such as cacti') && drawn.includes('Different plants have found'));
  ok('  and copying the reply copies all of it, folded or not', I.contentAsText(TEXTBOOK).includes('CAM plants such as cacti') && drawn.includes('aria-label="Copy Socria’s message"'));
}

console.log('\n=== a long opening paragraph still leads ===');
{
  const b = read(TEXTBOOK);
  ok('its first sentence, a short statement, is set apart as the lead', b[0].kind === 'p' && b[0].text === 'Photosynthesis is how a plant turns light into chemical energy it can store and use later.' && b[1].split === true && b[1].text.startsWith('Inside each chloroplast'), J(b.slice(0, 2)));
  ok('  the same words, cut at their own full stop — nothing reworded', `${b[0].text} ${b[1].text}` === P1);
  ok('  drawn as the standfirst', reply(TEXTBOOK).startsWith('<article') && /<p class="socria-lead"><span>Photosynthesis is how a plant/.test(reply(TEXTBOOK)));
  ok('a long opening sentence (over thirty words) is not cut', read(`${'word '.repeat(34)}ends here. And then the rest of it goes on for a while longer still.`)[0].split === undefined && read(`${'word '.repeat(34)}ends here. And then the rest goes on.`).length === 1);
  ok('a question first is not a lead', read(`Why does a leaf look green to us? ${P2}`).length === 1);
  ok('a cut that would leave bold open is not made', read(`This is **the point. And the** rest of it, which runs on for a good while longer than any lead ever should, well past forty words, so it is long.`).length === 1);
  ok('"e.g." is not the end of a sentence', read(`Some plants do this well, e.g. Maize and sugar cane both do it in hot weather, which lets them keep working where ordinary plants close up and stall for the afternoon until it cools down again.`).length === 1);
  ok('a short opening is left as it was (the lead rule as before)', read('A short opening statement here.\n\nThen more.')[0].split === undefined && read('A short opening statement here.\n\nThen more.').length === 2);
}

console.log('\n=== what is not folded ===');
{
  const short = 'A short answer that says what matters in a sentence.\n\n' + 'Then a second paragraph with a little more to it, but nowhere near enough to fold, at some forty words or so in all, which is a conversation, not a wall.\n\nAnd a third.';
  ok('a short reply: nothing folds', !layout(short).some((p) => p.kind === 'fold'), kinds(layout(short)));
  const one = layout(P1 + ' ' + P2 + ' ' + P3);
  ok('one long paragraph alone: nothing folds (two blocks of prose first)', !one.some((p) => p.kind === 'fold'), kinds(one));
  const asks = layout(`${TEXTBOOK}\n\nShould I draw the Calvin cycle as a loop for you?`);
  ok('the closing question stays in view after the fold', asks[asks.length - 1].kind === 'ask' && asks.some((p) => p.kind === 'fold' && p.head === -1), kinds(asks));
  const longCoda = layout([P1, P2, P3, P4, P5].join('\n\n'));
  ok('a last paragraph short enough to be the closing line stays out of the fold', longCoda[longCoda.length - 1].kind === 'block' && longCoda.some((p) => p.kind === 'fold'), kinds(longCoda));
  ok('a finished fold too short to be worth a press is shown open', !layout([P1, P2, 'Short.'].join('\n\n')).some((p) => p.kind === 'fold'));
}

console.log('\n=== depth asked for is depth shown ===');
{
  for (const t of ['Explain photosynthesis in detail', 'walk me through it step by step', I.pathAsk({ label: 'Why continuity matters' }), 'go deeper on the second stage', 'explain it fully please', 'tell me everything about the Krebs cycle', 'Walk me through the proof', 'can you give me an in-depth explanation?'])
    ok(`asked for depth: "${t}"`, I.depthAsked(t, 'standard'), t);
  for (const t of ['what is photosynthesis?', 'no need to go into detail, just the gist', 'keep it short', 'hi', '', null])
    ok(`not asked for depth: ${J(t)}`, !I.depthAsked(t, 'standard'));
  ok('a Detailed length setting is depth asked for, whatever the message', I.depthAsked('hi', 'detailed') && !I.depthAsked('hi', 'concise'));
  ok('disclose: false folds nothing — no paragraph fold', !I.layoutReply(read(TEXTBOOK), { disclose: false }).some((p) => p.kind === 'fold'));
  const parts = `Lead sentence that says the point plainly here.\n\n### One\n\n${P1}\n\n### Two\n\n${P2}\n\n### Three\n\n${P3}`;
  ok('  and no heading fold either', layout(parts).some((p) => p.kind === 'fold') && !I.layoutReply(read(parts), { disclose: false }).some((p) => p.kind === 'fold'));
  ok('drawn with disclose={false}: every paragraph open', !reply(TEXTBOOK, { disclose: false }).includes('socria-fold') && reply(TEXTBOOK).includes('socria-fold'));
  const pend = html(h(I.L5Pending, { text: TEXTBOOK.slice(0, TEXTBOOK.length - 30), group: false, disclose: false }));
  ok('  and while it streams', !pend.includes('socria-fold') && html(h(I.L5Pending, { text: TEXTBOOK.slice(0, TEXTBOOK.length - 30), group: false })).includes('socria-fold'));
}

console.log('\n=== elements are never folded ===');
{
  const fake = (type) => ({ kind: 'ui', spec: { type, title: `A ${type}` }, open: false, n: 0 });
  const P = (text) => ({ kind: 'p', text });
  for (const type of I.VISUAL_KINDS) {
    const L = I.layoutReply([P(P1), P(P2), P(P3), fake(type), P(P4), P(P5)]);
    const at = L.findIndex((p) => p.kind === 'block' && p.i === 3);
    ok(`"${type}" after a long stretch of prose: drawn in the flow, never folded`, at > 0 && !folded(L).has(3), kinds(L));
  }
  for (const type of ['diagram', 'balance', 'equation']) ok(`  the new kind "${type}" is named`, I.VISUAL_KINDS.includes(type));
  for (const type of ['draft', 'reasoning']) {
    const L = I.layoutReply([P(P1), P(P2), P(P3), fake(type), P(P4)]);
    ok(`"${type}" is a disclosure itself, and may sit in a fold like prose`, folded(L).has(3), kinds(L));
  }
  ok('an element still arriving is a placeholder in the flow, not folded', I.isVisualBlock({ kind: 'ui', spec: null, open: true, n: 0 }) && !I.isVisualBlock({ kind: 'ui', spec: null, open: true, n: 0, pending: 'draft' }));
  ok('an element that failed its checks draws nothing, and counts for nothing', !I.isVisualBlock({ kind: 'ui', spec: null, open: false, n: 0 }) && I.blockWords({ kind: 'ui', spec: null, open: false, n: 0 }) === 0);

  const L = I.layoutReply([P(P1), P(P2), P(P3), fake('compare'), P(P4), P(P5)]);
  ok('a visual closes the fold before it; prose after it carries on, untitled (its closing line kept out)', kinds(L) === 'b b more b cont b', kinds(L));
  const c = L.find((p) => p.cont);
  ok('  the continuation says how much it holds, and has its first words', c.count === 'a paragraph' && c.preview.startsWith('Different plants') && !c.title, J(c));

  const COMPARE = { type: 'compare', options: ['Postgres', 'MySQL'], rows: [{ label: 'Licence', values: ['PostgreSQL', 'GPL'] }, { label: 'JSON', values: ['jsonb', 'json'] }] };
  const GRAPH = { type: 'graph', expr: 'a*x^2', params: [{ name: 'a', min: -3, max: 3, value: 1 }], x: [-3, 3] };
  const withParts = `${'Lead words that say what this is about and why. '.repeat(3)}\n\n### First\n\n${P1}\n\n### Second\n\n${P2}\n\n${fence(COMPARE)}\n\n${P3}\n\n${P4}\n\n### Third\n\n${P5}`;
  const blocks = read(withParts);
  const W = I.layoutReply(blocks);
  const ci = blocks.findIndex((b) => b.kind === 'ui');
  ok('a comparison under a later heading is drawn open, while that part is folded', W.some((p) => p.kind === 'block' && p.i === ci) && !folded(W).has(ci) && W.some((p) => p.kind === 'fold' && p.head >= 0), kinds(W));
  const second = blocks.findIndex((b) => b.kind === 'h' && b.text === 'Second');
  const cont = W.find((p) => p.kind === 'fold' && p.cont);
  ok('  prose after it stays in that part: a continuation of the same heading', cont && cont.head === second && cont.body.includes(ci + 1), J(cont));
  const drawn = reply(withParts);
  ok('  drawn: the comparison is in the page flow, not inside a <details>', (() => { const at = drawn.indexOf('ln-compare'); const before = drawn.slice(0, at); return at > 0 && (before.match(/<details/g) ?? []).length === (before.match(/<\/details>/g) ?? []).length; })(), drawn.slice(0, 300));
  ok('  and the continuation is marked as one', drawn.includes('socria-fold is-cont'));
  const g = read(`${P1}\n\n${P2}\n\n${P3}\n\n${fence(GRAPH)}\n\n${P4}`);
  ok('a graph inside what would be folded: drawn open', !folded(I.layoutReply(g)).has(g.findIndex((b) => b.kind === 'ui')) && g.some((b) => b.kind === 'ui' && b.spec?.type === 'graph'));
}

console.log('\n=== no fold row is blank ===');
{
  const COMPARE = { type: 'compare', options: ['Postgres', 'MySQL'], rows: [{ label: 'Licence', values: ['PostgreSQL', 'GPL'] }, { label: 'JSON', values: ['jsonb', 'json'] }] };
  const spec = I.parseInlineSpec(J(COMPARE));
  ok('an element named in a row: its kind and what it compares', I.previewOf({ kind: 'ui', spec, open: false, n: 0 }) === 'Comparison · Postgres vs MySQL', I.previewOf({ kind: 'ui', spec, open: false, n: 0 }));
  ok('  its title, when it has one', I.previewOf({ kind: 'ui', spec: { ...spec, title: 'Which database' }, open: false, n: 0 }) === 'Comparison · Which database');
  ok('  a kind still being written: its kind; an unknown one: "Element" — never empty', I.previewOf({ kind: 'ui', spec: null, open: true, n: 0, pending: 'chart' }) === 'Chart' && I.previewOf({ kind: 'ui', spec: null, open: true, n: 0 }) === 'Element');
  ok('  the new kinds are named too', I.elementLabel({ type: 'diagram', title: 'The water cycle' }) === 'Diagram · The water cycle' && I.elementLabel({ type: 'balance', subject: 'Index funds' }) === 'For and against · Index funds' && I.elementLabel({ type: 'equation' }) === 'Equation');
  const DRAFT = { type: 'draft', title: 'To the landlord', text: 'Dear Sam, the heater has been out since Monday.' };
  const fixtures = [TEXTBOOK, `${TEXTBOOK}\n\nWant the Calvin cycle as a loop?`, `${P1}\n\n${P2}\n\n${fence(DRAFT)}\n\n${P3}\n\n${P4}`, `Lead sentence here that sets it up.\n\n### A\n\n${P1}\n\n### B\n\n${fence(DRAFT)}\n\n${P2}\n\n### C\n\n${P3}`];
  let blank = '';
  for (const t of fixtures) for (const p of layout(t)) if (p.kind === 'fold' && !p.preview && !p.writing) blank = `${t.slice(0, 40)}: ${J(p)}`;
  ok('across the fixtures, every fold row has its first words', !blank, blank);
  const drawn = reply(fixtures[3]);
  ok('  a draft that opens a folded part shows what it is in the row', /<span class="socria-fold-p" aria-hidden="true">Draft · To the landlord<\/span>/.test(drawn), drawn.slice(drawn.indexOf('<details'), drawn.indexOf('<details') + 400));
}

console.log('\n=== an over-long first part folds inside itself ===');
{
  const t = `### What happens\n\n${P1}\n\n${P2}\n\n${P3}\n\n${P4}\n\n### Why it matters\n\n${P5}\n\n${P6}`;
  const L = layout(t);
  ok('the first part stays open for its first two paragraphs, then folds the rest of itself', kinds(L).startsWith('b b b more'), kinds(L));
  ok('  the next part folds under its own heading as before', L.some((p) => p.kind === 'fold' && p.head >= 0 && !p.cont), kinds(L));
}

console.log('\n=== streaming: laid out as it will land ===');
{
  const COMPARE = { type: 'compare', options: ['C3', 'C4'], rows: [{ label: 'Hot days', values: ['stalls', 'keeps going'] }, { label: 'Water', values: ['more', 'less'] }] };
  const replies = [TEXTBOOK, `${P1}\n\n${P2}\n\n${P3}\n\n${fence(COMPARE)}\n\n${P4}\n\n${P5}\n\n- one point here\n- another point\n\nShould I draw it?`, `### What happens\n\n${P1}\n\n${P2}\n\n${P3}\n\n### Why\n\n${P4}\n\n${P5}`];
  let agree = true,
    why = '',
    cuts = 0;
  for (const R of replies) {
    const final = layout(R);
    const finalBlocks = read(R);
    const finalFolded = folded(final);
    for (let c = 15; c < R.length; c += 23) {
      cuts++;
      const { settled, tail, joins } = I.streamingSplit(R.slice(0, c), true);
      const mid = read(settled, { streaming: true });
      const shape = tail ? I.tailShape(mid, tail, joins) : null;
      const pieces = I.layoutReply(mid, { streaming: true, tail, tailIn: shape === 'li' || shape === 'sub' || shape === 'row' });
      const midFolded = folded(pieces);
      const writing = new Set(pieces.flatMap((p) => (p.kind === 'fold' && p.writing ? p.body : [])));
      // every settled block but the last (which may still grow) is laid out as it will land
      for (let i = 0; i < mid.length - 1; i++) {
        if (mid[i].kind !== finalBlocks[i]?.kind) continue;
        const landedIn = finalFolded.has(i);
        const isAsk = final.some((p) => p.kind === 'ask' && p.i === i);
        const isCoda = !landedIn && midFolded.has(i) && i === finalBlocks.length - 1;
        if (midFolded.has(i) && !landedIn && !writing.has(i) && !isAsk && !isCoda) (agree = false), (why = `${R.slice(0, 20)} cut ${c}: block ${i} folded mid-stream, open when landed`);
        if (!midFolded.has(i) && landedIn) (agree = false), (why = `${R.slice(0, 20)} cut ${c}: block ${i} open mid-stream, folded when landed`);
      }
      for (const p of pieces) if (p.kind === 'fold' && !p.writing && p.head < 0 && !p.cont) {
        const same = final.find((q) => q.kind === 'fold' && q.head < 0 && !q.cont && q.body[0] === p.body[0]);
        if (!same || same.title !== p.title) (agree = false), (why = `${R.slice(0, 20)} cut ${c}: fold at ${p.body[0]} titled ${J(p.title)} mid-stream, ${J(same?.title)} landed`);
      }
    }
  }
  ok(`a fold the paragraphs earned is the same mid-stream as landed, at ${cuts} places the stream could stop`, agree, why);
  const at = TEXTBOOK.indexOf(P3) + 20;
  const s = I.streamingSplit(TEXTBOOK.slice(0, at), true);
  const mid = I.layoutReply(read(s.settled, { streaming: true }), { streaming: true, tail: s.tail });
  const last = mid[mid.length - 1];
  ok('the paragraph that opens the fold, still being written: inside it, "Writing…", titled "More" until its sentence ends', last.kind === 'fold' && last.writing && last.head === -1 && last.title === 'More', J(last));
  const drawn = html(h(I.StreamingRichText, { text: TEXTBOOK.slice(0, at), rich: true, editorial: true }));
  ok('  drawn: the writing row, the text inside it', /Writing…<\/span><\/summary><div class="socria-fold-body"><p class="is-tail">/.test(drawn), drawn.slice(-300));
}

console.log('\n=== a fold opened while the reply was arriving stays open when it lands ===');
{
  const partial = TEXTBOOK.slice(0, TEXTBOOK.indexOf(P5) + 30);
  const pending = html(h(I.L5Pending, { text: partial, group: false }));
  const fk = pending.match(/<details[^>]*data-fold="([^"]+)"/)?.[1];
  ok('every fold carries its place in the reply', !!fk && !/<details[^>]* open=""/.test(pending), pending.slice(pending.indexOf('<details'), pending.indexOf('<details') + 160));
  I.keepFoldOpen(partial, fk, true);
  ok('  opened mid-stream: still open in the reply being written', /<details[^>]* open=""/.test(html(h(I.L5Pending, { text: partial + ' more', group: false }))));
  const landed = reply(TEXTBOOK);
  ok('  and open in the reply once it has landed — a different component, the same fold', new RegExp(`<details[^>]*data-fold="${fk}"[^>]* open=""`).test(landed), landed.slice(landed.indexOf('<details'), landed.indexOf('<details') + 200));
  I.keepFoldOpen(TEXTBOOK, fk, false);
  ok('  closed again, it stays closed', !/<details[^>]* open=""/.test(reply(TEXTBOOK)));
  ok('another reply is not affected', !/ open=""/.test(reply(TEXTBOOK.replace('Photosynthesis is how', 'Respiration is how'))));
}

console.log(`\nreply disclosure: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
