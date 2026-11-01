// LISTS AND TABLES SETTLE LINE BY LINE WHILE A REPLY STREAMS.
//
// The audit (vx-audit R4, R12b) streamed replies through the real renderer.
// Everything after the last blank line was drawn as one inline paragraph, and
// a paragraph's line breaks collapse — so a list arrived as "Lisbon: - Alfama
// - Belém Tower - LX Fac", and a table as a line of raw pipes, until the whole
// thing snapped into shape at the end. And a partial "```u" flashed as a code
// block labelled "u" before turning into the element it was.
//
// What is held down here:
//
//   • every complete line of a list or a table is drawn where it will stay;
//     only the line still being written is drawn as it stands — inside its
//     list as an item, or its table as a row — so no frame shows raw marks or
//     a run-on line;
//   • what has settled only ever grows: append-only, so how a list is drawn
//     (columns, terms) is decided once, from its first items, and kept;
//   • a fence still opening, "```" or "```u", is a placeholder, never a code
//     block;
//   • the paragraph being written keeps its line breaks.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 600))));
const J = JSON.stringify;
const stream = (text) => renderToStaticMarkup(h(I.StreamingRichText, { text, rich: true, editorial: true }));
/** what a reader sees, tags stripped */
const seen = (markup) => markup.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
/** the inline paragraph still being written, as drawn */
const tailP = (markup) => [...markup.matchAll(/<p class="is-tail">([\s\S]*?)<\/p>/g)].map((m) => seen(m[1])).join('\n');

const LIST = `Here are some good options for a weekend in Lisbon:
- Alfama, the old quarter, best early in the morning
- Belém Tower and the monastery beside it
- LX Factory for lunch and the bookshop
- Tram 28 if you can get on it
- Time Out Market for dinner

Pick two a day and leave room to wander.`;

const TABLE = `Here is how they compare:

| | Stocks | Bonds |
|---|---|---|
| Risk | High | Low |
| Return | Higher over time | Steadier |
| Liquidity | Daily | Daily |

Most people hold some of each.`;

const SHORT = `A few places worth a look:

- Alfama
- Belém
- Sintra
- Cascais
- LX Factory
- Tram 28
- Graça
- Chiado`;

const TERMS = `Three numbers to watch:

- Latency: the time until the first byte arrives
- Throughput: how much arrives each second
- Jitter: how much the latency moves about
- Loss: how many packets never arrive at all`;

console.log('\n=== a list, cut every ten characters ===');
{
  let bad = '';
  let frames = 0;
  for (let c = 10; c <= LIST.length; c += 10) {
    frames++;
    const m = stream(LIST.slice(0, c));
    const t = tailP(m);
    // never a run-on line of marks: no paragraph being written holds a list item's mark at the start of a line
    if (/(^|\n)\s*- /.test(t)) bad = `cut ${c}: the list arrived as a paragraph: ${J(t)}`;
  }
  ok(`each of ${frames} frames is a list, never a line of dashes`, !bad, bad);
  const mid = stream(LIST.slice(0, LIST.indexOf('LX Factory') + 5));
  ok('mid-item: the items so far settled, the one being written an item of the same list', /<ul><li><span>Alfama, the old quarter, best early in the morning<\/span><\/li><li><span>Belém Tower and the monastery beside it<\/span><\/li><li class="is-tail"><span>LX Fa<\/span><\/li><\/ul>/.test(mid), mid);
  ok('  and the line introducing it is its paragraph, settled', mid.startsWith('<p><span>Here are some good options for a weekend in Lisbon:</span></p>'), mid);
  const justMark = stream(LIST.slice(0, LIST.indexOf('LX Factory') - 1));
  ok('only the mark of the next item so far: an empty item of the list, not a stray dash', justMark.includes('<li class="is-tail"></li>') && !tailP(justMark).includes('-'), justMark.slice(-200));
  const first = stream('Options:\n\n- Alf');
  ok('the first item of a list not yet begun: already a list', first.includes('<ul><li class="is-tail"><span>Alf</span></li></ul>'), first);
  const nested = stream('- Hire an engineer\n  - faster product\n  - burns run');
  ok('a point nested under an item, being written: under that item', /<li><span>Hire an engineer<\/span><span class="socria-sub">.*faster product.*<span class="is-tail"><span>burns run<\/span><\/span><\/span><\/li>/.test(nested), nested);
  const loose = stream('1. Define the audience\n\n2. Pick one channel\n\n3. Ship a sm');
  ok('a loose numbered list: the item being written joins the list it belongs to (one list, its numbers right)', (loose.match(/<ol/g) ?? []).length === 1 && loose.includes('<li class="is-tail"><span>Ship a sm</span></li>'), loose);
}

console.log('\n=== a table, cut every ten characters ===');
{
  let bad = '';
  let frames = 0;
  for (let c = 10; c <= TABLE.length; c += 10) {
    frames++;
    const m = stream(TABLE.slice(0, c));
    if (seen(m).includes('|')) bad = `cut ${c}: raw pipes on the page: ${J(seen(m).slice(-120))}`;
  }
  ok(`each of ${frames} frames is a table, never raw pipes`, !bad, bad);
  const rows = stream(TABLE.slice(0, TABLE.indexOf('Steadier') + 4));
  ok('mid-row: the rows so far settled, as a comparison; the row being written a pending row', rows.includes('<th scope="row"><span>Risk</span></th>') && /<tr class="is-tail"><th scope="row"><span>Return<\/span><\/th><td[^>]*><span class="socria-cell"><span>Higher over time<\/span><\/span><\/td><td[^>]*><span class="socria-cell"><span>Stea<\/span><\/span><\/td><\/tr>/.test(rows), rows);
  const head = stream(TABLE.slice(0, TABLE.indexOf('|---') + 4));
  ok('the header written, its rule still arriving: a table with that header, nothing else', head.includes('<th scope="col"><span>Stocks</span></th>') && !seen(head).includes('|') && !seen(head).includes('---'), head);
}

console.log('\n=== append-only: what has settled only grows, and keeps its shape ===');
{
  for (const [name, text] of [['list', LIST], ['table', TABLE], ['short list', SHORT], ['terms', TERMS]]) {
    // every block settled so far is the block it will be when the reply lands — the last one may only grow
    const landed = I.parseBlocks(text, { rich: true });
    let bad = '';
    for (let c = 5; c <= text.length; c += 3) {
      const { settled } = I.streamingSplit(text.slice(0, c), true);
      const now = I.parseBlocks(settled, { rich: true });
      now.forEach((b, i) => {
        const end = landed[i];
        if (!end || end.kind !== b.kind) return void (bad = `cut ${c}: block ${i} is ${b.kind} now, ${end?.kind} landed`);
        if (i < now.length - 1 && J(b) !== J(end)) bad = `cut ${c}: block ${i} changed: ${J(b)} → ${J(end)}`;
        const items = (x) => x.items ?? x.rows ?? [];
        if (i === now.length - 1 && items(b).some((it, k) => k < items(b).length - 1 && J(it) !== J(items(end)[k]))) bad = `cut ${c}: the last block's items went back on themselves: ${J(b)}`;
      });
    }
    ok(`${name}: what has settled is what lands — append-only`, !bad, bad);
  }
  const shapeAt = (text, c) => {
    const { settled } = I.streamingSplit(text.slice(0, c), true);
    const b = I.editorialBlocks(I.parseBlocks(settled, { rich: true }), { more: true });
    const l = b[b.length - 1];
    return l ? (l.kind === 'ul' && l.compact ? 'compact' : l.kind) : '';
  };
  const seq = (text) => {
    const out = [];
    for (let c = 5; c <= text.length; c += 2) {
      const s = shapeAt(text, c);
      if (s && out[out.length - 1] !== s) out.push(s);
    }
    return out.join(' → ');
  };
  const short = seq(SHORT);
  ok('many short items: a plain list until the fifth, then columns, and columns it stays', short.endsWith('ul → compact') && !/compact → ul/.test(short), short);
  const terms = seq(TERMS);
  ok('terms: a plain list until the third, then terms, and terms they stay', terms.endsWith('ul → terms') && !/terms → ul/.test(terms), terms);
  const later = I.editorialBlocks(I.parseBlocks(`${SHORT}\n- and one much longer item that is a whole sentence about the place.`, { rich: true }));
  ok('  a long item after the decision does not undo it', later[1].compact === true, J(later[1]));
}

console.log('\n=== a fence still opening is a placeholder, never a code block ===');
{
  for (const t of ['Before.\n\n```', 'Before.\n\n```u', 'Before.\n\n```ui', 'Before.\n\n```ui\n{"ty', 'Before.\n\n```\n{"type":"chart"']) {
    const m = stream(t);
    ok(`${J(t.slice(9))}: the element's placeholder`, m.includes('ln-pending') && !m.includes('socria-codeblock'), m);
  }
  const code = stream('Before.\n\n```python\nprint(1)');
  ok('a fence that is plainly code: the code block it is, still open', code.includes('socria-codeblock is-open') && !code.includes('ln-pending'), code);
  const bare = stream('Before.\n\n```\nconst x = 1');
  ok('a bare fence whose first line is code: a code block', bare.includes('socria-codeblock') && !bare.includes('ln-pending'), bare);
  const u = I.parseBlocks('```u\n{"type":"chart"}\n```', { rich: true });
  ok('  (a closed "```u" is not an element: only "ui" is, once closed)', u[0].kind === 'code', J(u));
  const kind = I.parseBlocks('```ui\n{"type":"draft","text":"Dear', { rich: true });
  ok('an element still arriving says which kind it is, once its type is written', kind[0].kind === 'ui' && kind[0].open && kind[0].pending === 'draft', J(kind));
}

console.log('\n=== the paragraph being written keeps its line breaks ===');
{
  const t = stream('A line\nand the next line, still arri');
  ok('drawn as one paragraph being written…', t.includes('<p class="is-tail">'));
  // the break is in the text; l5.css draws p.is-tail with white-space: pre-line so it shows
  ok('…its line break kept in the text, for the style that shows it', tailP(t).includes('\n'), J(tailP(t)));
}

console.log(`\nreply streaming: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
