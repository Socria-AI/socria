// THE MARKDOWN A MODEL STILL WRITES, DRAWN AS DENSELY AS WHAT IT SAYS ALLOWS.
//
// However well the prompt asks for elements, a reply still arrives with
// numbered steps, bullet lists, "Term — what it means" lines, Pros and Cons,
// and pipe tables. The audit (vx-audit R3–R9, R13) rendered them and found
// each drawn worse than it was written: "1. 1. 1." for a loose numbered list,
// raw backticks in steps and tables, nine one-word bullets a line each, the
// hierarchy of nested points thrown away, Pros and Cons as two stray lines
// over two lists, and a comparison table as an unlabelled grid.
//
// What is held down here — each rule conservative, each decided from a list's
// first few items so a list that settles line by line never changes its mind:
//
//   • a loose numbered list is one list, with its own numbers
//   • `code` reads as code in numbered lists, groups and tables
//   • five or more short items sit in columns (never chips)
//   • "Term — explanation" / "Term: explanation", unbolded, are terms when the
//     first three items all are; a one-off "Note: …" stays a bullet
//   • points nested under an item stay under it, as a muted run
//   • Pros and Cons — and two options with points under them — side by side
//   • a table with an empty corner or a short first column is a comparison:
//     row headers, and on a phone a card per row
//
// And the parser's second line of defence for inline blocks the stream gate
// let through in an unusual shape: a one-line ```ui {…}```, a closing fence
// with text run on after it.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 600))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const draw = (text) => html(h(I.RichText, { text, rich: true, editorial: true }));
const read = (text) => I.editorialBlocks(I.parseBlocks(text, { rich: true }));
const kinds = (bs) => bs.map((b) => b.kind).join(',');

console.log('\n=== numbered lists keep their numbers ===');
{
  const loose = '1. **Define the audience** — who it is for\n\n2. **Pick one channel** — where they already are\n\n3. **Ship a small test** — this week, not next quarter';
  const raw = I.parseBlocks(loose, { rich: true });
  ok('the parser reads a loose list as one list per item…', kinds(raw) === 'ol,ol,ol' && raw[1].start === 2 && raw[2].start === 3, J(raw));
  const b = read(loose);
  ok('…and the editorial reading joins it back into one', b.length === 1 && b[0].items?.length === 3, J(b));
  ok('  which is then read as the ordered terms it is', b[0].kind === 'terms' && b[0].ordered && b[0].items[1].label === 'Pick one channel', J(b[0]));
  const d = draw(loose);
  ok('  drawn: one list, not "1. 1. 1."', (d.match(/<ol/g) ?? []).length === 1, d);
  const plain = draw('1. Open the app\n\n2. Sign in\n\n3. Press start');
  ok('a plain loose numbered list: one <ol> of three', (plain.match(/<ol/g) ?? []).length === 1 && (plain.match(/<li/g) ?? []).length === 3, plain);
  const later = I.parseBlocks('3. Then this\n4. And this');
  ok('a list that picks up at 3 says so, on every surface', later[0].start === 3 && html(h(I.RichText, { text: '3. Then this\n4. And this' })).includes('<ol start="3">'));
  ok('  one that starts at 1 carries no start', !('start' in I.parseBlocks('1. a\n2. b')[0]));
}

console.log('\n=== inline code is code, wherever it falls ===');
{
  const ol = draw('1. Run `npm i`\n2. Then `npm test`');
  ok('in a numbered list', (ol.match(/<code class="socria-code">/g) ?? []).length === 2 && !ol.includes('`'), ol);
  const td = draw('| Command | What it does |\n|---|---|\n| `ls` | lists files |\n| `pwd` | prints where you are |');
  ok('in a table cell', td.includes('<code class="socria-code">ls</code>') && !td.includes('`'), td);
  const g = draw('- **Install:**\n- run `npm i`\n- **Test:**\n- run `npm test`');
  ok('in a group', g.includes('socria-groups') && g.includes('<code class="socria-code">npm i</code>'), g);
  const plain = html(h(I.RichText, { text: '1. Run `npm i`' }));
  ok('  (a surface that does not read code is unchanged)', !plain.includes('socria-code'));
}

console.log('\n=== many short items sit in columns ===');
{
  const nine = 'Good places for a weekend:\n\n- Alfama\n- Belém Tower\n- LX Factory\n- Tram 28\n- Time Out Market\n- Sintra\n- Cascais\n- Miradouro da Graça\n- Feira da Ladra';
  const b = read(nine);
  ok('nine items of a word or three: compact', b[1].kind === 'ul' && b[1].compact === true, J(b[1]));
  const d = draw(nine);
  ok('  drawn as a list in columns — a plain <ul>, no buttons, no chips', d.includes('<ul class="socria-list is-short">') && !d.includes('<button') && !/chip/.test(d), d);
  ok('four short items: an ordinary list', !read('- a\n- b\n- c\n- d')[0].compact);
  ok('a sentence among the first five: an ordinary list', !read('- Alfama\n- Belém\n- It is best seen early, before the crowds.\n- Sintra\n- Cascais')[0].compact);
  ok('a numbered list is never put in columns: its order is read down', read('1. a\n2. b\n3. c\n4. d\n5. e\n6. f')[0].kind === 'ol' && !read('1. a\n2. b\n3. c\n4. d\n5. e\n6. f')[0].compact);
  ok('maths in an item: an ordinary list', !read('- $x^2$\n- b\n- c\n- d\n- e')[0].compact);
}

console.log('\n=== terms, written without bold ===');
{
  const dash = read('- Subscription — a recurring monthly or annual fee\n- Usage-based — pay for what you use each month\n- Freemium — a free tier, with paid upgrades');
  ok('"Term — explanation", every item: terms', dash[0].kind === 'terms' && dash[0].items.map((x) => x.label).join('|') === 'Subscription|Usage-based|Freemium', J(dash[0]));
  const colon = read('- Latency: the time until the first byte arrives\n- Throughput: how much arrives each second\n- Jitter: how much the latency moves about');
  ok('"Term: explanation", every item: terms', colon[0].kind === 'terms' && colon[0].items[2].label === 'Jitter' && colon[0].items[2].body === 'how much the latency moves about', J(colon[0]));
  const d = draw('- Latency: the time until the first byte arrives\n- Throughput: how much arrives each second\n- Jitter: how much the latency moves about');
  ok('  drawn as the terms layout', d.includes('<ul class="socria-terms">') && d.includes('<span class="socria-term"><span>Latency</span></span>'), d);
  const note = read('- Bring a coat\n- Note: the museum shuts at five on Mondays\n- Book the train early');
  ok('a one-off "Note: …" in an ordinary list stays a bullet', note[0].kind === 'ul', J(note[0]));
  ok('two items are not enough to call a list of terms', read('- Latency: the time until the first byte\n- Throughput: how much arrives each second')[0].kind === 'ul');
  ok('a long label is a sentence, not a term', read('- This is the first of several things to say: that it works\n- And this second long thing here: too\n- A third clause: here')[0].kind === 'ul');
  ok('a short body is not an explanation', read('- Red: stop\n- Amber: get ready\n- Green: go now')[0].kind === 'ul');
  const later = read('- Latency: the time until the first byte arrives\n- Throughput: how much arrives each second\n- Jitter: how much the latency moves about\n- and that is most of it');
  ok('decided by the first three: a later plain item is a plain row of the terms, not a reason to undo them', later[0].kind === 'terms' && later[0].items[3].label === '' && later[0].items[3].body === 'and that is most of it', J(later[0]));
  ok('  drawn across both columns', draw('- Latency: the time until the first byte arrives\n- Throughput: how much arrives each second\n- Jitter: how much the latency moves about\n- and that is most of it').includes('<li class="is-plain">'));
}

console.log('\n=== points nested under an item stay under it ===');
{
  const t = '- Hire an engineer first\n  - the product gets better faster\n- Hire a marketer first\n  - more people hear about it, sooner\n- Wait a quarter';
  const b = I.parseBlocks(t, { rich: true });
  ok('the parser keeps what is nested, under its item', b.length === 1 && b[0].kind === 'ul' && b[0].items.length === 3 && J(b[0].subs) === J([['the product gets better faster'], ['more people hear about it, sooner'], []]), J(b));
  const d = draw(t);
  ok('  drawn as a muted run under the item, not a deeper list', d.includes('<span class="socria-sub">') && (d.match(/<ul/g) ?? []).length === 1, d);
  const flat = I.parseBlocks(t);
  ok('  (a surface that reads plainly flattens it, as it always did)', flat[0].items.length === 5 && !flat[0].subs);
  const ol = I.parseBlocks('1. Book the room\n   - check it has a projector\n2. Send the invite', { rich: true });
  ok('a point nested under a numbered step', ol.length === 1 && ol[0].kind === 'ol' && J(ol[0].subs) === J([['check it has a projector'], []]), J(ol));
  const wrapped = I.parseBlocks('- a point that\n  wraps a line\n  - and one under it\n    that wraps too', { rich: true });
  ok('a wrapped item and a wrapped point under it each stay one', wrapped[0].items[0] === 'a point that wraps a line' && wrapped[0].subs[0][0] === 'and one under it that wraps too', J(wrapped));
  const two = read('- Hire an engineer\n  - faster product\n  - burns runway\n- Hire a marketer\n  - more leads\n  - product may stall');
  ok('two options with points under each: groups, side by side', two[0].kind === 'groups' && two[0].side === true && two[0].groups[0].header === 'Hire an engineer' && J(two[0].groups[1].items) === J(['more leads', 'product may stall']), J(two[0]));
  const nestedLabels = I.parseBlocks('- **Pros:**\n  - cheap\n  - fast\n- **Cons:**\n  - slow', { rich: true });
  ok('labels with points nested under them: the groups they always were', nestedLabels[0].kind === 'groups' && nestedLabels[0].groups.length === 2 && J(nestedLabels[0].groups[1].items) === J(['slow']), J(nestedLabels));
}

console.log('\n=== Pros and Cons, side by side ===');
{
  const t = '- **Pros:**\n- low fees\n- instant diversification\n- **Cons:**\n- no downside protection\n- you own the bad companies too';
  const b = read(t);
  ok('two labelled groups of short points: side by side', b[0].kind === 'groups' && b[0].side === true, J(b[0]));
  const d = draw(t);
  ok('  drawn with the labels styled as labels', d.includes('<div class="socria-groups is-side">') && d.includes('<div class="socria-group-head">Pros</div>'), d);
  const long = read('- **Pros:**\n- low fees, which over thirty years compound into a very large difference in what you end up with\n- **Cons:**\n- no protection');
  ok('a long point near the top: stacked, not squeezed into a column', long[0].kind === 'groups' && !long[0].side, J(long[0]));
  ok('one group alone: not side by side', !read('- **Pros:**\n- cheap\n- fast\n- plain point')[0].side);
}

console.log('\n=== a comparison table reads as one ===');
{
  const t = '| | Stocks | Bonds |\n|---|---|---|\n| Risk | High | Low |\n| Return | Higher | Lower |\n| Liquidity | Daily | Daily |';
  const b = read(t);
  ok('an empty top-left cell: a comparison', b[0].kind === 'table' && b[0].compare === true, J(b[0]));
  const d = draw(t);
  ok('  row headers with scope', (d.match(/<th scope="row">/g) ?? []).length === 3 && d.includes('<th scope="col"><span>Stocks</span></th>'), d);
  ok('  the comparison look, and a card per row on a phone (every value labelled with its column)', d.includes('socria-table-wrap is-compare is-stack') && d.includes('class="socria-table is-compare"') && d.includes('data-label="Bonds"'), d);
  ok('a short first column names the points: a comparison too', read('| Point | Postgres | MySQL |\n|---|---|---|\n| Licence | PostgreSQL | GPL |\n| JSON | jsonb | json |')[0].compare === true);
  ok('two columns is a list of pairs, not a comparison', !read('| Term | Meaning |\n|---|---|\n| CAC | cost to win a customer |')[0].compare);
  ok('a first column of sentences is data, not a set of points', !read('| What happened | Before | After |\n|---|---|---|\n| The team shipped the first version of the app to users | 0 | 10 |')[0].compare);
  const wide = read('| | A | B | C | D |\n|---|---|---|---|---|\n| x | 1 | 2 | 3 | 4 |');
  ok('four options: a comparison, kept as a table on a phone (too many for a card)', wide[0].compare && !draw('| | A | B | C | D |\n|---|---|---|---|---|\n| x | 1 | 2 | 3 | 4 |').includes('is-stack'));
}

console.log('\n=== inline blocks in shapes the stream gate let through ===');
{
  const PATHS = { type: 'paths', items: [{ label: 'One way' }, { label: 'Another way' }] };
  const one = I.parseBlocks('Before.\n\n```ui ' + J(PATHS) + '```', { rich: true });
  ok('a one-line ```ui {…}```: the element', kinds(one) === 'p,ui' && one[1].spec?.type === 'paths' && !one[1].open, J(one));
  const run = I.parseBlocks('```ui ' + J(PATHS) + '``` And after it, the words.', { rich: true });
  ok('  with the next sentence run on after it: the element, then the words', kinds(run) === 'ui,p' && run[1].text === 'And after it, the words.', J(run));
  const trail = I.parseBlocks('```ui\n' + J(PATHS) + '\n```Drag the slider to see it move.', { rich: true });
  ok('a closing fence with text run on after it: the element, then the words', kinds(trail) === 'ui,p' && trail[0].spec?.type === 'paths' && trail[1].text === 'Drag the slider to see it move.', J(trail));
  const end = I.parseBlocks('```ui\n' + J(PATHS) + '```\n\nAfter.', { rich: true });
  ok('a closing fence at the end of the JSON line', kinds(end) === 'ui,p' && end[0].spec?.type === 'paths', J(end));
  const open = I.parseBlocks('```ui ' + J(PATHS).slice(0, -1) + '\n}\n```', { rich: true });
  ok('the JSON starting on the opening line', kinds(open) === 'ui' && open[0].spec?.type === 'paths', J(open));
  const lang = I.parseBlocks('```ui\n' + J(PATHS) + '\n```ui\n\nAfter.', { rich: true });
  ok('a bare word after a closing fence is the fence closing, as before', kinds(lang) === 'ui,p', J(lang));
  const code = I.parseBlocks('```md\n``` this line is inside the code\n```', { rich: true });
  ok('a code block is untouched: a line inside it that starts with backticks is code', kinds(code) === 'code' && code[0].text === '``` this line is inside the code' && !code[0].open, J(code));
  ok('every one of them read as words for copying, the run-on sentence kept', I.contentAsText('```ui\n' + J(PATHS) + '\n```\n\nDrag it.').includes('One way'));
}

console.log(`\nreply density: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
