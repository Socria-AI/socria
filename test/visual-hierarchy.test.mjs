// test/visual-hierarchy.test.mjs — MAXIMUM CLARITY, MINIMUM READING.
//
// What Logos 5 is told to write (lib/runtime/behavior.ts, every tier and every
// subject: the same core prompt) and how a reply is drawn (lib/reply-layout.ts,
// components/RichText.tsx, components/logos5/reply.css): the answer first as a
// lead; one idea to a short paragraph; a few key concepts in bold, set off by a
// faint highlighter stroke; at most one insight line; no clutter.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as I from './.tmp/inline-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0;
let fail = 0;
const ok = (name, cond, info) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && info !== undefined ? `  — ${typeof info === 'string' ? info : JSON.stringify(info)}` : ''}`);
};
const draw = (text) => renderToStaticMarkup(h(I.RichText, { text, math: true, editorial: true }));
const strongs = (html) => (html.match(/<strong class="socria-strong">([^<]*)<\/strong>/g) ?? []).map((s) => s.replace(/<[^>]+>/g, ''));

console.log('\n=== what Socria is told to write ===');
const core = I.LOGOS5_CORE;
ok('the answer first', /Lead with what matters: the answer, the insight/.test(core));
ok('short: two to five short lines, one idea a paragraph, a blank line between ideas', /Two to five short lines, one idea per paragraph/.test(core) && /a blank line between ideas/.test(core));
ok('cut what does not change understanding', /cut what adds no understanding/.test(core));
ok('bold for one to three key concepts — never a sentence, never decoration', /\*\*Bold\*\* one to three key concepts/.test(core) && /never a whole sentence/.test(core));
ok('one key insight may take its own line', /One key insight may take a line starting "> "/.test(core));
ok('no headings, no nested lists, nothing like a card', /Never # headings unless this turn's note asks/.test(core) && /no nested lists/.test(core) && /nothing like a card/.test(core));
ok('prose stays the default: no glossary of bolded terms', /Prose by default/.test(core) && /never bolded terms with definitions/.test(core));
ok('one prompt for every tier and every subject (the router changes the model, not the voice)', !/\b(tier|Luna|Terra|Sol)\b/.test(core));

console.log('\n=== bold is a key concept, so there are few ===');
{
  const blocks = [
    { kind: 'p', text: 'A **derivative** is a rate; **integration** undoes it; the **chain rule** composes; **limits** underlie all.' },
    { kind: 'p', text: 'The **derivative** again, and **this whole long sentence is shouted in bold for no reason at all**.' },
    { kind: 'ul', items: ['**Cost:** low', '**Speed:** high', '**Risk:** none'] },
  ];
  const out = I.capEmphasis(blocks);
  ok('the first three key concepts keep their bold', /\*\*derivative\*\*/.test(out[0].text) && /\*\*integration\*\*/.test(out[0].text) && /\*\*chain rule\*\*/.test(out[0].text));
  ok('  a fourth is set in plain type', !/\*\*limits\*\*/.test(out[0].text) && /limits underlie/.test(out[0].text));
  ok('a term bolded again is plain the second time', !/\*\*derivative\*\*/.test(out[1].text));
  ok('a bold whole sentence is plain', !/\*\*this whole/.test(out[1].text));
  ok('list labels keep theirs — there, bold labels', JSON.stringify(out[2]) === JSON.stringify(blocks[2]));
  ok('a reply with no bold is untouched', JSON.stringify(I.capEmphasis([{ kind: 'p', text: 'Plain.' }])) === JSON.stringify([{ kind: 'p', text: 'Plain.' }]));
  const growing = 'Inflation is **rising prices**. Its cause is **too much money** chasing goods; a **central bank** raises **interest rates** to cool it.';
  const early = I.capEmphasis([{ kind: 'p', text: growing.slice(0, 60) }])[0].text;
  const late = I.capEmphasis([{ kind: 'p', text: growing }])[0].text;
  ok('left to right: a reply still arriving never loses a bold it has shown', late.startsWith(early.replace(/\*\*[^*]*$/, '').slice(0, 30)) && /\*\*rising prices\*\*/.test(early) && /\*\*rising prices\*\*/.test(late));
}

console.log('\n=== drawn ===');
{
  const reply = [
    'Inflation is a rise in prices across the whole economy.',
    '',
    'It happens when **demand** outruns what can be made, or when **costs** push prices up.',
    '',
    'A central bank answers with **interest rates**: dearer borrowing cools spending.',
    '',
    '> What matters is expectations: if people expect prices to rise, they act in ways that make them rise.',
  ].join('\n');
  const html = draw(reply);
  ok('the first line is the lead', /^<p class="socria-lead">(<span>)?Inflation is a rise in prices across the whole economy\.(<\/span>)?<\/p>/.test(html), html.slice(0, 120));
  ok('each idea its own paragraph', (html.match(/<p>/g) ?? []).length === 2, html);
  ok('three key concepts, drawn as key concepts', JSON.stringify(strongs(html)) === JSON.stringify(['demand', 'costs', 'interest rates']), strongs(html));
  ok('the insight is a line of its own', /<blockquote class="socria-quote">[\s\S]*What matters is expectations/.test(html));
  const shouty = draw('Short answer here, said plainly.\n\nThe **one**, the **two**, the **three**, the **four** and the **five**.');
  ok('a model that over-bolds is drawn with three', strongs(shouty).length === 3, strongs(shouty));
}

console.log('\n=== the stylesheet ===');
{
  const css = read('components/logos5/reply.css');
  ok('a key concept: a faint highlighter stroke in the conversation’s own tint, not a colour of its own', /:is\(p:not\(\.socria-lead\), blockquote, \.socria-fold-body > p\) > \.socria-strong \{[\s\S]{0,120}color: var\(--lg-ink\);[\s\S]{0,40}background: linear-gradient\(transparent 58%, rgba\(var\(--l5-tint-rgb\), 0\.16\)/.test(css));
  ok('  and still marked where the system draws its own colours', /@media \(forced-colors: active\)[\s\S]{0,140}text-decoration: underline/.test(css));
  ok('the insight: the serif, a rule in the primary colour, full ink — no grey italic', /\.l5-prose\.is-reply \.socria-quote \{[\s\S]{0,200}border-left: 2px solid var\(--lg-primary\);[\s\S]{0,80}font-family: var\(--l5-serif\);[\s\S]{0,40}font-style: normal;[\s\S]{0,80}color: var\(--lg-ink\);/.test(css));
  ok('air between ideas', /\.l5-prose\.is-reply > p:not\(\.socria-lead\),[\s\S]{0,80}margin-bottom: 1em;/.test(css));
  ok('no card: no box, no shadow on any of it', !/socria-(quote|strong)[^{]*\{[^}]*(box-shadow|border-radius: [1-9]\dpx|border: 1px solid)/.test(css));
  ok('the renderer caps the bold before drawing', /capEmphasis\(editorialBlocks\(/.test(read('components/RichText.tsx')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
