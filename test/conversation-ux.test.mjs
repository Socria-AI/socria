// Conversation UX (November 2026): what an audit of replies on screen found, each held by the input that showed it.
//
// - A formula started mid-stream with a letter ("2. Take $dv") showed its raw dollar until the closing one arrived,
//   then jumped into a formula: the streaming tail held one back only when TeX's marks followed the dollar.
// - A bare address ("see https://…") stayed text that could not be opened; only [words](https://…) was a link.
// - A displayed formula or a code block wider than a phone's column was cut at its edge with nothing to say it
//   went on ("= e − (e"); it scrolled, but looked finished.
// - Code and a formula in the lead were drawn at 1.4 × their size, heavier than the serif around them.
// - The core named maths and tables but not code, so code asked for outside an engineering turn had no rule; and a
//   reply's ceiling (700 tokens, Balanced) had no room for code, so a function could be cut off mid-line.

import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { splitInline, bareUrlEnd } from './.tmp/rich-text.mjs';
import * as I from './.tmp/inline-under-test.mjs';
import * as R from './.tmp/runtime-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const links = (t) => splitInline(t, { code: true }).filter((s) => s.kind === 'link');
const html = (text) => renderToStaticMarkup(createElement(I.RichText, { text, math: true, rich: true, editorial: true }));

console.log('=== a formula on its way is held back while it streams, money is not ===');
{
  ok('"$dv" waits for its closing dollar', I.tidyTail('2. Take $dv') === '2. Take', I.tidyTail('2. Take $dv'));
  ok('"$u = x" too', I.tidyTail('Pick $u = x') === 'Pick');
  ok('"$\\alpha" too', I.tidyTail('where $\\alpha') === 'where');
  ok('money still shows: "$5"', I.tidyTail('it costs $5') === 'it costs $5');
  ok('…and "$12.50 a month"', I.tidyTail('about $12.50 a month') === 'about $12.50 a month');
  ok('a closed formula stays whole', I.tidyTail('so $dv$ and') === 'so $dv$ and');
  ok('a dollar inside inline code is code', I.tidyTail('run `echo $HOME` then') === 'run `echo $HOME` then');
  // what the stream draws is never the raw dollar
  const s = I.streamingSplit('Integration by parts.\n\n1. Take $u = x$.\n2. Take $dv', true);
  ok('the streamed tail shows no raw dollar', !/\$/.test(s.tail), JSON.stringify(s));
}

console.log('\n=== a bare address is a link ===');
{
  const a = links('See https://docs.python.org/3/library/functions.html#sum for the call.');
  ok('linked', a.length === 1 && a[0].href === 'https://docs.python.org/3/library/functions.html#sum', JSON.stringify(a));
  ok('the sentence\'s full stop is not part of it', links('Read https://example.com/a.')[0]?.href === 'https://example.com/a');
  ok('…nor a closing bracket around it', links('(see https://example.com/a)')[0]?.href === 'https://example.com/a');
  ok('…but a bracket that is the address\'s own stays', bareUrlEnd('https://en.wikipedia.org/wiki/Set_(mathematics)') === 'https://en.wikipedia.org/wiki/Set_(mathematics)');
  ok('a markdown link is read once, not twice', links('[the docs](https://example.com/a)').length === 1 && links('[the docs](https://example.com/a)')[0].text === 'the docs');
  ok('an address in inline code stays code', links('run `curl https://example.com/a`').length === 0);
  ok('a scheme with nothing after it is not a link', links('the https:// prefix').length === 0);
  ok('only http(s): never javascript:', links('javascript:alert(1) and https://example.com').every((l) => /^https:/.test(l.href)));
  ok('drawn as a link that opens apart', /<a class="socria-link" href="https:\/\/example\.com\/a" target="_blank" rel="noopener noreferrer">/.test(html('Long enough to be a paragraph of its own, see https://example.com/a for it.')));
  ok('marks around it still read', /<strong[^>]*>bold<\/strong>/.test(html('A **bold** word and https://example.com/a here.')));
}

console.log('\n=== wide maths and code say they go on ===');
{
  const g = readFileSync('app/globals.css', 'utf8');
  ok('a fade at the edge, only where the browser can tell it overflows', /@supports \(animation-timeline: scroll\(self inline\)\)[\s\S]*?\.lg-tex-block, \.socria-codeblock pre\)[\s\S]*?animation-timeline: scroll\(self inline\)/.test(g));
  ok('the fade gives way at each end', /@keyframes lg-edge-fade \{[\s\S]*?0% \{[\s\S]*?3%, 97% \{[\s\S]*?100% \{/.test(g));
  ok('both prefixes, for Safari', /-webkit-mask-image/.test(g) && /[^-]mask-image/.test(g));
  ok('a displayed formula set smaller on a phone', /@media \(max-width: 520px\) \{\s*\.logos-root \.lg-tex-block \.katex-display > \.katex \{ font-size: 1\.06em; \}/.test(g));
  ok('display maths still scrolls in itself', /\.lg-tex-block \{[^}]*overflow-x: auto/.test(g));
  const r = readFileSync('components/logos5/reply.css', 'utf8');
  ok('code in the lead at reading size', /\.socria-lead \.socria-code \{\s*font-size: 0\.66em/.test(r));
  ok('a formula in the lead at the lead\'s size', /\.socria-lead \.katex \{\s*font-size: 1em/.test(r));
}

console.log('\n=== the core says how code is written ===');
{
  const core = R.logos5System({ math: false, picture: false, build: false, guard: false });
  ok('code in a fenced block with its language', /Code in a fenced block, with its language\./.test(core));
  ok('still no headings by default', /Never # headings unless this turn's note asks/.test(core));
  ok('the persona says it changed', R.PERSONA_VERSION === 'logos5-v8');
  // the screen draws what the core asks for: a fenced block with its language and a way to copy it
  const h = html('The fix is one line.\n\n```python\ntotal = sum(r["amount"] for r in rows)\n```');
  ok('a fence is drawn as a code block with its language', /socria-codeblock/.test(h) && /python/.test(h) && /<pre><code>total = sum/.test(h), h.slice(0, 400));
}

console.log('\n=== code gets the room it needs ===');
{
  ok('making or fixing code in an engineering turn: more room', R.codeRoom({ domain: 'engineering', work: 'diagnosis' }) === R.CODE_ROOM && R.CODE_ROOM > 0);
  ok('an idea about code is an idea: no more room', R.codeRoom({ domain: 'engineering', work: 'explanation' }) === 0);
  ok('another subject: none', R.codeRoom({ domain: 'math', work: 'execution' }) === 0);
  const route = readFileSync('app/api/logos/chat/route.ts', 'utf8');
  ok('the route adds it to the reply\'s ceiling', /const baseReply = [^\n]*\+ \(runtime \? codeRoom\(turnState\) : 0\);/.test(route));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
