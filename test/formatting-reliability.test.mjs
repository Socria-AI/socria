// Formatting reliability: the defects a system-wide audit of reply rendering found
// (November 2026), each held here by the input that broke it.
//
// The root cause of the worst of them was ORDER. Markdown's marks were read before
// the mathematics was found, so an asterisk inside a formula ($p^*$) was taken for
// emphasis and both formulas came apart; blocks were read line by line, so a
// displayed formula with a blank line or a "- c &= d" row inside it fell to pieces.
// The fixes are in the parser (lib/rich-text.ts, lib/tex-split.ts) and the streaming
// split (lib/reply-layout.ts), not in CSS.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { splitInline, parseBlocks, splitTableRow, joinDisplayMath, stripMarks } from './.tmp/rich-text.mjs';
import { splitMath, looksMath, scanMath } from './.tmp/tex-split.mjs';
import * as I from './.tmp/inline-under-test.mjs';
import { plainText, readTex } from './.tmp/canvas-under-test.mjs';
import { universePlain } from './.tmp/logos5-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const ink = (segs) => segs.map((s) => (s.kind === 'text' ? s.text : `<${s.kind}>${s.text}</${s.kind}>`)).join('');
const html = (text, extra = {}) => renderToStaticMarkup(createElement(I.RichText, { text, math: true, rich: true, ...extra }));
const katexCount = (h) => (h.match(/class="katex"/g) || []).length;

console.log('=== an asterisk inside mathematics is the mathematics\' own ===');
{
  const src = 'At equilibrium $p^* = 5$ and $q^* = 10$ here.';
  ok('no emphasis across two formulas', ink(splitInline(src)) === src, ink(splitInline(src)));
  ok('both formulas drawn', katexCount(html(src)) === 2, html(src));
  ok('no raw dollar left', !/\$/.test(html(src).replace(/<annotation[\s\S]*?<\/annotation>/g, '')));
  ok('$a*b*c$ stays whole', ink(splitInline('so $a*b*c$ holds')) === 'so $a*b*c$ holds');
  ok('\\(x^*\\) stays whole', ink(splitInline('the point \\(x^*\\) and \\(y^*\\)')) === 'the point \\(x^*\\) and \\(y^*\\)');
  const bold = splitInline('**Equilibrium: $p^*$ and $q^*$**');
  ok('mathematics inside bold stays inside the bold', bold.length === 1 && bold[0].kind === 'strong' && bold[0].text === 'Equilibrium: $p^*$ and $q^*$', JSON.stringify(bold));
  ok('…and is drawn there', /<strong[^>]*>[\s\S]*class="katex"[\s\S]*<\/strong>/.test(html('**Equilibrium: $p^*$ and $q^*$**')));
  ok('emphasis around mathematics still works', ink(splitInline('*so* $x^*$ wins')) === '<em>so</em> $x^*$ wins');
  ok('money is not held as mathematics', ink(splitInline('it costs $5 *each* and $10')) === 'it costs $5 <em>each</em> and $10');
}

console.log('\n=== arithmetic, exponents and escapes are not emphasis ===');
{
  ok('5 * 4 = 20 and 3 * 2 = 6', ink(splitInline('5 * 4 = 20 and 3 * 2 = 6')) === '5 * 4 = 20 and 3 * 2 = 6');
  ok('\\* is an asterisk', ink(splitInline('a \\*literal\\* star')) === 'a *literal* star');
  ok('*one* still italic', ink(splitInline('a *word* here')) === 'a <em>word</em> here');
  ok('***both*** still strong-em', ink(splitInline('***both***')) === '<strong-em>both</strong-em>');
  ok('stripMarks keeps mathematics intact', stripMarks('**$p^*$** is the price') === '$p^*$ is the price');
}

console.log('\n=== links ===');
{
  const segs = splitInline('see [the paper](https://example.com/p) now', { code: true });
  ok('a link is read in rich text', segs.some((s) => s.kind === 'link' && s.href === 'https://example.com/p' && s.text === 'the paper'), JSON.stringify(segs));
  ok('javascript: is never a link', !splitInline('[x](javascript:alert(1))', { code: true }).some((s) => s.kind === 'link'));
  ok('drawn as an anchor that opens safely', /<a class="socria-link" href="https:\/\/example.com\/p" target="_blank" rel="noopener noreferrer">the paper<\/a>/.test(html('see [the paper](https://example.com/p) now')));
}

console.log('\n=== code fences ===');
{
  const b = parseBlocks('1. Install it:\n   ```bash\n   npm install katex\n   ```\n2. Run it', { rich: true });
  ok('a fence under an item is a code block', b.some((x) => x.kind === 'code' && x.text === 'npm install katex' && x.lang === 'bash'), JSON.stringify(b));
  ok('the item keeps its words, without the fence', b[0].kind === 'ol' && b[0].items[0] === 'Install it:', JSON.stringify(b[0]));
  ok('the list carries on at 2', b.some((x) => x.kind === 'ol' && x.start === 2));
  const t = parseBlocks('~~~python\nprint(1)\n~~~\nafter', { rich: true });
  ok('~~~ fences', t[0].kind === 'code' && t[0].text === 'print(1)' && t[0].lang === 'python' && !t[0].open, JSON.stringify(t));
  const four = parseBlocks('````md\n```js\nx\n```\n````', { rich: true });
  ok('a four-backtick fence holds a three-backtick one', four.length === 1 && four[0].kind === 'code' && four[0].text === '```js\nx\n```', JSON.stringify(four));
}

console.log('\n=== tables ===');
{
  ok('a pipe inside mathematics does not divide', JSON.stringify(splitTableRow('| $|x|$ | absolute value |')) === JSON.stringify(['$|x|$', 'absolute value']), JSON.stringify(splitTableRow('| $|x|$ | absolute value |')));
  ok('a pipe inside code does not divide', JSON.stringify(splitTableRow('| `a|b` | or |')) === JSON.stringify(['`a|b`', 'or']));
  ok('\\| is a pipe in the cell', JSON.stringify(splitTableRow('| a \\| b | c |')) === JSON.stringify(['a | b', 'c']));
  ok('\\| inside mathematics is kept for KaTeX', JSON.stringify(splitTableRow('| $\\|v\\|$ | norm |')) === JSON.stringify(['$\\|v\\|$', 'norm']));
  const b = parseBlocks('| a | b |\n|---|---|\n| 1 | 2 |\nSo $|x|$ matters', { rich: true });
  ok('prose after a table is the next paragraph', b[0].kind === 'table' && b[0].rows.length === 1 && b[1]?.kind === 'p' && b[1].text === 'So $|x|$ matters', JSON.stringify(b));
  const h = html('| expr | meaning |\n|---|---|\n| $|x|$ | absolute value |');
  ok('the absolute value drawn in its cell', katexCount(h) === 1 && (h.match(/<td/g) || []).length === 2, h);
}

console.log('\n=== displayed mathematics is one block ===');
{
  const aligned = '$$\n\\begin{aligned}\na &= b \\\\\n- c &= d\n\\end{aligned}\n$$';
  const b = parseBlocks(aligned, { rich: true });
  ok('an aligned row starting "- " is not a bullet', b.length === 1 && b[0].kind === 'p', JSON.stringify(b));
  ok('…and is drawn as one formula', katexCount(html(aligned)) === 1, html(aligned).slice(0, 300));
  const blank = parseBlocks('$$\na = b\n\n c = d\n$$', { rich: true });
  ok('a blank line inside $$ does not split it', blank.length === 1 && blank[0].text.includes('a = b') && blank[0].text.includes('c = d'), JSON.stringify(blank));
  const sq = parseBlocks('Then\n\\[\nx = 1\n\n+ 2\n\\]\ndone', { rich: true });
  ok('\\[ … \\] held together too', sq.length === 1 && sq[0].kind === 'p', JSON.stringify(sq));
  const item = parseBlocks('1. Compute:\n   $$\n   x = 1\n   $$\n2. Next', { rich: true });
  ok('a formula under a list item stays in the item', item[0].kind === 'ol' && item[0].items[0].includes('$$') && item[0].items.length === 2, JSON.stringify(item));
  ok('an unclosed $$ swallows nothing', parseBlocks('It costs $$ to run\n\n- a\n- b', { rich: true }).some((x) => x.kind === 'ul'));
  ok('code fences are never joined', joinDisplayMath('```\n$$\n```\ntext') === '```\n$$\n```\ntext');
}

console.log('\n=== headings, rules, bullets, numbering ===');
{
  const h4 = parseBlocks('#### Detail', { rich: true });
  ok('#### is a heading', h4[0].kind === 'h' && h4[0].text === 'Detail', JSON.stringify(h4));
  const r = parseBlocks('One\n\n---\n\nTwo', { rich: true });
  ok('--- is a divider, not a paragraph of dashes', r.length === 2 && r.every((x) => x.kind === 'p' && !/---/.test(x.text)), JSON.stringify(r));
  ok('+ bullets', parseBlocks('+ a\n+ b', { rich: true })[0].kind === 'ul');
  ok('"2024. That was the year." is a sentence', parseBlocks('2024. That was the year.', { rich: true })[0].kind === 'p');
  ok('a list from 0 is numbered from 0', /<ol start="0">/.test(html('0. zero\n1. one')), html('0. zero\n1. one'));
}

console.log('\n=== money and mathematics ===');
{
  ok('$50k-$80k is a range of money', !looksMath('50k-'));
  ok('$5M to $10M is money', !looksMath('5M to'));
  ok('…and stays as written', splitMath('The band is $50k-$80k per year.').every((g) => g.kind === 'text'));
  ok('$2x$ is still mathematics', looksMath('2x'));
  ok('$0$ is still mathematics', looksMath('0'));
  const spans = scanMath('a $x$ b');
  ok('scanMath knows where each span is', spans[1].kind === 'inline' && spans[1].start === 2 && spans[1].end === 5);
}

console.log('\n=== a reply still streaming ===');
{
  ok('a half-written formula is held back', I.tidyTail('So the area is $\\frac{1}{2') === 'So the area is');
  ok('…a $p^* on its way too', I.tidyTail('the price $p^*') === 'the price');
  ok('money is not held back', I.tidyTail('it costs $5') === 'it costs $5');
  ok('an open $$ is held back', I.tidyTail('Then\n$$\n\\int_0^1 x\\,dx') === 'Then');
  ok('an open \\( is held back', I.tidyTail('where \\(x^2 + ') === 'where');
  ok('an unpaired ** is left out', I.tidyTail('The key is **conservation of') === 'The key is conservation of');
  ok('a paired ** stays', I.tidyTail('The **key** is') === 'The **key** is');
  ok('a closed formula stays', I.tidyTail('so $x^2$ and') === 'so $x^2$ and');
  const s = I.streamingSplit('Intro.\n\n$$\na = b\n\nc = d', false);
  ok('a blank line inside an open formula does not settle half of it', s.settled === 'Intro.' && s.tail === '', JSON.stringify(s));
  ok('openDisplayAt finds it', I.openDisplayAt('x $$ y') === 2 && I.openDisplayAt('$$a$$') === -1);
  const live = renderToStaticMarkup(createElement(I.StreamingRichText, { text: 'Area: $\\frac{1}{2', math: true, rich: true }));
  ok('no raw TeX on screen mid-formula', !/frac/.test(live), live);
}

console.log('\n=== plain text: previews, cards, AR labels ===');
{
  ok('a folded part\'s preview reads its mathematics as type', I.previewOf({ kind: 'p', text: 'The area is $\\frac{1}{2}bh$ here' }) === 'The area is 1/2bh here', I.previewOf({ kind: 'p', text: 'The area is $\\frac{1}{2}bh$ here' }));
  ok('plainText: $p^*$ is p*', plainText('so $p^*$ is') === 'so p* is', plainText('so $p^*$ is'));
  ok('plainText: subscripts survive', plainText('$x_1+x_2$') === 'x_1+x_2', plainText('$x_1+x_2$'));
  ok('plainText: escaped dollars', plainText('$MR = \\$6$') === 'MR = $6', plainText('$MR = \\$6$'));
  ok('plainText: marks still go', plainText('**bold** and `code`') === 'bold and code');
  ok('readTex: \\$ is a dollar', readTex('\\$72') === '$72');
  ok('universe card text keeps ">"', universePlain('growth > 3% this year') === 'growth > 3% this year', universePlain('growth > 3% this year'));
  ok('…and loses a table row\'s pipes', !/\|/.test(universePlain('| a | b |')));
}

console.log('\n=== group labels and phone table labels ===');
{
  const g = html('- **When $x>0$:**\n  - grows\n- **When $x<0$:**\n  - shrinks');
  ok('a group label draws its mathematics', katexCount(g) >= 2 && !/\$x&gt;0\$/.test(g), g.slice(0, 400));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
