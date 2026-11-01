// ADVERSARIAL REVIEW OF vx-render: inputs that defeated the first cut.
//
// Each case below failed before its fix:
//
//   • A bare ``` fence holding ordinary JSON (a package.json, an API reply)
//     was read as an inline element still arriving, so it was drawn as the
//     element's placeholder, aria-hidden, for as long as it was being written
//     — and for good, in a reply that ended inside it (stopped, or cut off at
//     the token limit). The code was on the page nowhere.
//   • A list, table or set of groups changed its mind mid-stream: terms after
//     two bold items, then bullets again when the third was plain; a
//     comparison table after one short row label, then a plain table when the
//     second was a sentence; Pros and Cons side by side, then stacked when a
//     later point ran long or a fifth group arrived; columns, then a tall list
//     when a later item had a point nested under it.
//   • "Can you go into detail?" was not read as asking for depth.
//   • The points nested under an item ran together for a screen reader
//     ("faster productburns runway"): the only thing between them was hidden.
//   • "```Next" — a word run straight on to a closing fence — was dropped as
//     if it were a language tag.
//   • An opening paragraph's lead was cut at "the U.S." or "John F.", leaving
//     half a sentence as the standfirst.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 600))));
const J = JSON.stringify;
const P = (t) => I.parseBlocks(t, { rich: true });
const stream = (text) => renderToStaticMarkup(h(I.StreamingRichText, { text, rich: true, editorial: true }));
const land = (text) => renderToStaticMarkup(h(I.RichText, { text, math: true, rich: true, editorial: true }));

console.log('\n=== a bare fence of ordinary JSON is code, never an element placeholder ===');
{
  const pkg = 'Here is the config:\n\n```\n{\n  "name": "socria",\n  "version": "2.0.0"';
  const b = P(pkg);
  ok('an open bare fence of JSON with no "type": a code block', b[1]?.kind === 'code' && b[1].open, J(b));
  ok('  drawn as code while it is written, its text on the page', stream(pkg).includes('socria-codeblock') && stream(pkg).includes('socria') && !stream(pkg).includes('ln-pending'), stream(pkg));
  ok('  and in a reply that ended inside it: still the code, not a placeholder forever', land(pkg).includes('&quot;version&quot;') && !land(pkg).includes('ln-pending'), land(pkg));
  const mod = '```\n{\n  "type": "module",\n  "main": "index.js"';
  ok('a "type" that is no element kind ("module"): code', P(mod)[0].kind === 'code', J(P(mod)));
  // what is still held as an element arriving: what can still become one
  for (const t of ['```', '```u', '```\n{', '```\n{"ty', '```\n{"type":', '```\n{"type":"ch', '```\n{\n  "type": "chart"', '```\n{"type":"chart","title":"Rent"']) {
    const x = P(`Before.\n\n${t}`);
    ok(`  still an element arriving: ${J(t)}`, x[1]?.kind === 'ui' && x[1].open, J(x));
  }
  ok('  a new kind named by the plan (diagram) is held too', P('```\n{"type":"diagram"')[0].kind === 'ui');
}

console.log('\n=== a decision, once drawn mid-stream, is never undone ===');
{
  const sig = (b) => (b ? b.kind + (b.compact ? ':compact' : '') + (b.side ? ':side' : '') + (b.compare ? ':compare' : '') : '-');
  /** every shape block k takes as the reply streams in, in order, repeats folded */
  const shapes = (text, k = 1) => {
    const out = [];
    for (let c = 1; c <= text.length; c++) {
      const s = I.streamingSplit(text.slice(0, c), true);
      const b = I.editorialBlocks(P(s.settled), { more: true })[k];
      if (b && out[out.length - 1] !== sig(b)) out.push(sig(b));
    }
    const landed = sig(I.editorialBlocks(P(text))[k]);
    return { seq: out, landed };
  };
  /** never back: no shape comes again once another has followed it, and the last is the landed one */
  const monotone = ({ seq, landed }) => new Set(seq).size === seq.length && seq[seq.length - 1] === landed;
  const cases = {
    'two bold terms, then a plain item': `Glossary:\n- **Latency:** the time until the first byte\n- **Throughput:** how much gets through per second\n- and a third plain point that is not a term\n- fourth\n\nEnd.`,
    'a comparison table whose second row label is a sentence': `Compare:\n| Point | Postgres | MySQL |\n|---|---|---|\n| Speed | fast | fast |\n| How well it handles very large JSON documents | great | ok |\n| Cost | free | free |\n\nEnd.`,
    'Pros and Cons, a long second Con': `Weigh:\n- **Pros:**\n- low fees\n- instant diversification\n- **Cons:**\n- no downside protection\n- you own the bad companies along with the good ones, every one of them\n\nEnd.`,
    'five labelled groups': `Weigh:\n- **Pros:**\n- fast\n- **Cons:**\n- slow\n- **Risks:**\n- outage\n- **Costs:**\n- money\n- **Unknowns:**\n- future\n\nEnd.`,
    'five options with points under them': `Choices:\n- Hire an engineer\n  - faster product\n  - burns runway\n- Wait a quarter\n  - keeps cash\n  - slower\n- Outsource\n  - cheap\n  - risky\n- Do nothing\n  - nothing\n  - nothing\n- Fifth way\n  - a\n  - b\n\nEnd.`,
    'short items in columns, a point nested under the sixth': `Pack:\n- passport\n- charger\n- toothbrush\n- sunscreen\n- hat\n- adapter\n  - the UK kind\n\nEnd.`,
  };
  for (const [name, text] of Object.entries(cases)) {
    const r = shapes(text);
    ok(`${name}: ${r.seq.join(' → ')} (landed ${r.landed})`, monotone(r), J(r));
  }
  // and what has landed is read as it was before: the hold is for a block still arriving
  const two = I.editorialBlocks(P('Two numbers:\n\n- **Activation:** the share who make a first map\n- **Return:** who comes back within a week'));
  ok('landed: two bold items are still terms', two[1].kind === 'terms', J(two[1]));
  const pc = I.editorialBlocks(P('- **Pros:**\n- low fees\n- instant diversification\n- **Cons:**\n- no downside protection\n- you own the bad ones too'));
  ok('landed: Pros and Cons still side by side', pc[0].side === true, J(pc[0]));
  const tb = I.editorialBlocks(P('| Point | Postgres | MySQL |\n|---|---|---|\n| Licence | PostgreSQL | GPL |\n| JSON | jsonb | json |'));
  ok('landed: a two-row comparison is still one', tb[0].compare === true, J(tb[0]));
  const corner = I.editorialBlocks(P('| | A | B |\n|---|---|---|\n| x | 1 | 2 |'), { more: true });
  ok('streaming: an empty corner says comparison at once', corner[0].compare === true, J(corner[0]));
}

console.log('\n=== depth asked for, in the words people use ===');
{
  for (const t of ['Can you go into detail?', 'go into more detail about the second point', 'Give me more details on the tax part', 'I want the full details', 'Please be thorough']) ok(`depth: ${J(t)}`, I.depthAsked(t, 'standard'));
  for (const t of ["I don't need a detailed answer", 'no need to go into detail', 'Not in detail please', 'just the short version', 'what is the detail on page 3 called?'])
    ok(`not depth: ${J(t)}`, !I.depthAsked(t, 'standard'));
}

console.log('\n=== nested points are separate words to a screen reader ===');
{
  const m = land('Two ways:\n\n- Hire an engineer\n  - faster product\n  - burns runway\n- Wait a quarter, and see how the numbers move by then.');
  // what assistive technology reads: the text with aria-hidden parts removed
  const read = m.replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '');
  ok('the points under an item do not run together', !/productburns/.test(read) && /faster product\W+burns runway/.test(read), read);
}

console.log('\n=== words run on after a fence, and a lead cut at an abbreviation ===');
{
  const b = P('```ui\n{"type":"chart","series":[{"name":"a","points":[[1,2]]}]}\n```Next\n\nAfter.');
  ok('a capitalised word run on to the closing fence is a word, kept', b.some((x) => x.kind === 'p' && x.text === 'Next'), J(b));
  const lang = P('```ui\n{"type":"chart"}\n```json\n\nAfter.');
  ok('  a language tag on a closing fence is still the fence closing', !lang.some((x) => x.kind === 'p' && x.text === 'json'), J(lang));
  const long = 'The largest single employer in the U.S. Government is the Department of Defense, which counts its uniformed members and its civilian staff together, and which has been the largest for most of the last eighty years by a wide margin, with more than two million people.';
  const e = I.editorialBlocks(P(long));
  ok('  (long enough to be cut: over the lead\'s length)', long.split(/\s+/).length > I.LEAD_MAX_WORDS);
  ok('a lead is not cut at "U.S."', e.length === 1 && e[0].text === long, J(e));
  const jfk = 'The speech was given by John F. Kennedy at Rice University in September of that year, and it is still quoted whenever anyone wants to make the case that a hard goal is worth choosing precisely because it is hard, which is the line most people remember.';
  ok('  nor at an initial ("John F.")', I.editorialBlocks(P(jfk)).length === 1, J(I.editorialBlocks(P(jfk))));
}

console.log(`\nreply review: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
