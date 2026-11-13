// Plots, redesigned (November 2026): a graph in a reply and a picture in Artifacts drawn as a figure, not a box.
//
// What the redesign holds, so it does not drift back:
// - the graph palette (--ln-g1..3) is declared once, light and dark, and both renderers wear it
// - a graph is a figure between two hairlines, a small label over a serif title, one legend (each equation with its
//   curve's key), no vertical grid, numbers on the axes drawn over the curves on a paper outline
// - text never wears a curve's colour; a number already in an equation has no second slider on a fine pointer
// - MathViz: tones on the palette, the grid horizontal, the ticks after the marks, Riemann bars with paper gaps and
//   a rounded data end, filled points ringed in paper, readings as words, transport and Edit as words round Play

import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const J = JSON.stringify;
const fence = (spec) => 'A graph to try.\n\n```ui\n' + J(spec) + '\n```\n';
const html = (el) => renderToStaticMarkup(el);
const css = (p) => readFileSync(p, 'utf8');

console.log('=== the graph palette, declared once ===');
{
  const g = css('app/globals.css');
  ok('light steps', /--ln-g1: #456b1f;\s*--ln-g2: #2a7bb0;\s*--ln-g3: #c27a2e;/.test(g));
  ok('dark steps for the Dark, One and Celestial grounds', /\[data-theme="night"\]\) :is\(\.logos-root, \.lg-tokens\) \{\s*--ln-g1: #3b7f3a;\s*--ln-g2: #4c8fd6;\s*--ln-g3: #c2843c;/.test(g));
  ok('…readable from any page (the docs draw MathViz too)', /^:root,\n:is\(\.logos-root, \.lg-tokens\) \{\n  --ln-g1/m.test(g));
}

console.log('\n=== a graph in a reply is a figure ===');
{
  const TAX = { type: 'graph', title: 'A tax on sellers', expr: '100 - x', label: 'demand', curves: [{ expr: '20 + x + t', label: 'with the tax' }, { expr: '20 + x', label: 'supply' }], x: [0, 65], params: [{ name: 't', label: 'tax per unit', value: 10, min: 0, max: 30, step: 1 }], features: ['crossings'] };
  const out = html(h(I.RichText, { rich: true, text: fence(TAX) }));
  ok('a small label over a serif title', /<p class="ln-figcap"><span class="ln-kind">Graph<\/span><span class="ln-title">A tax on sellers<\/span><\/p>/.test(out), out.slice(0, 300));
  ok('one legend: each equation is a line of its own kind, its curve named in it', (out.match(/<p class="ln-eq( is-second| is-third)?">/g) ?? []).length === 3 && /<span class="ln-eq-name">supply<\/span>/.test(out));
  const gridLines = [...(out.match(/<g class="ln-axes" aria-hidden="true">([\s\S]*?)<\/g>/)?.[1] ?? '').matchAll(/<line([^>]*)>/g)].map((l) => l[1]);
  ok('no vertical grid: every grid line is horizontal or an axis', gridLines.length >= 3 && gridLines.every((l) => /class="is-axis"/.test(l) || /y1="([\d.]+)" y2="\1"/.test(l)), J(gridLines.slice(0, 4)));
  ok('the numbers are drawn after the curves, so they sit over them', out.indexOf('ln-axes is-labels') > out.lastIndexOf('class="ln-curve'));
  ok('the number in the equation is the slider; its own slider is marked a duplicate', /class="ln-var is-dup"/.test(out) && /role="slider"[^>]*aria-label="tax per unit"/.test(out));
  ok('…where the hint now says where to drag', /<p class="ln-hint">Drag a number in the equation\.<\/p>/.test(out));
  ok('curves named at their ends: the x-axis is not named over them', !/class="is-name"[^>]*>x</.test(out) && /class="is-name"[^>]*>y</.test(out));
  const W = Number(out.match(/<svg viewBox="0 0 ([\d.]+) /)?.[1]);
  const xNums = [...(out.match(/<g class="ln-axes is-labels"[^>]*>([\s\S]*?)<\/g>/)?.[1] ?? '').matchAll(/<text x="([\d.]+)" y="[\d.]+" text-anchor="middle">/g)].map((m) => Number(m[1]));
  ok('…and the numbers along it keep clear of the right end, where the curves are named', W > 0 && xNums.length > 0 && xNums.every((x) => x < W - 48), J({ W, xNums }));
  const names = [...out.matchAll(/class="ln-curve-name[^"]*" x="[\d.]+" y="([\d.]+)"[^>]*>([^<]+)<\/text>/g)].map((m) => ({ y: Number(m[1]), n: m[2] }));
  ok('curve names never sit on one another: the later is left off, the legend names it', names.length >= 2 && names.every((a, i) => names.every((b, j) => i === j || Math.abs(a.y - b.y) >= 16)), J(names));
  const ONE = { type: 'graph', expr: 'x^2 - 4', x: [-3, 3], params: [], features: [] };
  const one = html(h(I.RichText, { rich: true, text: fence(ONE) }));
  ok('a lone unnamed curve: both axes named', /class="is-name"[^>]*>x</.test(one) && /class="is-name"[^>]*>y</.test(one));
  const PT = { type: 'graph', expr: 'x^2', x: [-3, 3], params: [{ name: 'p', label: 'point', value: 1, min: -2.5, max: 2.5, step: 0.1 }], tangent: 'p' };
  const pt = html(h(I.RichText, { rich: true, text: fence(PT) }));
  ok('a point to drag has a halo under it', /<circle class="ln-halo"[^>]*r="14"><\/circle><circle[^>]*r="6"><\/circle>/.test(pt), pt.slice(pt.indexOf('ln-handle'), pt.indexOf('ln-handle') + 200));
  ok('…and a point on the curve is never a duplicate slider (it is not in an equation)', !/ln-var is-dup/.test(pt));
}

console.log('\n=== the figure, styled ===');
{
  const c = css('components/inline/inline.css');
  const block = c.slice(c.indexOf('/* ── a figure, not a box'));
  ok('between two hairlines, no box', /\.ln:is\(\.ln-graph, \.ln-sim, \.ln-chart\) \{[^}]*border: 0;[^}]*border-top: 1px solid var\(--ln-hair\);[^}]*border-bottom: 1px solid var\(--ln-hair\);[^}]*border-radius: 0;[^}]*background: none;/.test(block));
  ok('curves wear the palette, 2px', /\.ln-curve \{\s*stroke: var\(--ln-g1\);\s*stroke-width: 2;/.test(block) && /is-second \{ stroke: var\(--ln-g2\); \}/.test(block) && /is-third \{ stroke: var\(--ln-g3\); \}/.test(block));
  ok('each equation carries its curve\'s key', /\.ln-graph \.ln-eq::before \{[^}]*background: var\(--ln-g1\);/.test(block));
  ok('text never wears a curve\'s colour: names and end labels in ink', /\.ln-eq-name \{[^}]*color: var\(--ln-ink-70\);/.test(block) && /\.ln-curve-name:is\(\.is-second, \.is-third\) \{[^}]*fill: var\(--ln-ink-70\);/.test(block));
  ok('numbers on a paper outline', /\.ln-axes text \{[^}]*paint-order: stroke;[^}]*stroke: var\(--ln-ground\);/.test(block));
  ok('a duplicate slider is hidden only where there is a fine pointer', /@media \(pointer: fine\) \{\s*\.logos-root \.ln-graph \.ln-var\.is-dup \{ display: none; \}/.test(block));
  ok('a hairline slider with a ringed knob', /::-webkit-slider-runnable-track \{\s*height: 2px;/.test(block) && /::-webkit-slider-thumb \{[^}]*border: 2px solid var\(--ln-ground\);/.test(block));
  ok('readings in words, not small capitals', /\.ln-graph-read \.ln-reading \.ln-k,[^{]*\{[^}]*letter-spacing: 0;[^}]*text-transform: none;/.test(block));
}

console.log('\n=== MathViz, as a figure ===');
{
  const v = readFileSync('components/MathViz.tsx', 'utf8');
  ok('the tones are the graph palette', /primary: 'var\(--ln-g1, #456b1f\)'/.test(v) && /accent: 'var\(--ln-g2, #2a7bb0\)'/.test(v) && /tension: 'var\(--ln-g3, #c27a2e\)'/.test(v));
  ok('no vertical grid lines', !/key=\{`gx\$\{x\}`\}/.test(v) && /key=\{`gy\$\{y\}`\}/.test(v));
  ok('the numbers come after the marks', v.indexOf('className="lg-viz-ticks"') > v.indexOf('{frame.objects.map((ob) =>'));
  ok('a frame that names its axes is still drawn by name (economics)', /frame\.axes && \(/.test(v) && /lg-viz-axis-names/.test(v));
  ok('…and a plain x/y picture is named x and y', /!frame\.axes && XY_KINDS\.has\(active\.kind\)/.test(v));
  ok('a small label over the title', /<span className="lg-viz-kind">\{KIND_WORD\(active\.kind\)\}<\/span>/.test(v));
  ok('Riemann bars: a paper gap and a rounded end, no outline', /const gap = x1 - x0 > 6 \? 1 : 0;/.test(v) && /fillOpacity=\{0\.18\} stroke="none" className="lg-viz-bar"/.test(v));
  ok('a point: filled and ringed in paper, a hollow one ringed in its colour', /stroke=\{ob\.hollow \? stroke : 'var\(--lg-paper\)'\}/.test(v));
  const g = css('app/globals.css');
  const block = g.slice(g.indexOf('/* ── MathViz, as a figure'));
  ok('labels in ink, on a paper outline', /\.lg-viz-lab \{\s*fill: var\(--lg-ink-70/.test(block) && /\.lg-viz-lab \{\s*paint-order: stroke;/.test(block));
  ok('the narration a quiet line, nothing pulsing', /\.lg-viz-narr-mark \{ display: none; \}/.test(block) && /\.lg-viz-narr,\s*\.logos-root \.lg-viz-narr\.is-below \{[^}]*background: none;/.test(block));
  ok('the readings a row of words, not boxes', /\.lg-viz-readout \{[^}]*border: 0;[^}]*background: none;/.test(block));
  ok('one filled control: the transport and Edit are words', /\.lg-viz-transport \{[^}]*border: 0;[^}]*background: none;/.test(block) && /\.lg-viz-editbtn \{\s*border: 0;\s*background: none;/.test(block));
}

console.log('\n=== the typing dots keep to their own dots ===');
{
  const l5 = css('components/logos5/l5.css');
  ok('only the indicator\'s own children are dots: an italic letter in a reply on the dot grid stays a letter', /\.logos-root \.l5-dots > i \{\s*width: 6px;/.test(l5) && !/\.l5-dots i[ ,:{]/.test(l5.replace(/\/\*[\s\S]*?\*\//g, '')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
