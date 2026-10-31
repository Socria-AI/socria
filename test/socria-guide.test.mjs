// WHAT SOCRIA DOES, AND QUICK CAPTURE — "make the 'what logos does' into what socria does and show
// tutorials of socria … improve the quick capture GUI … make it beautiful", by the brand book.
//
//   the guide        "What Socria does" in the ⋯ menu: tutorials of the screen as it is, each shown
//                    in miniature, told in three steps, its limit said with it, and a way to try it
//   the brand book   paper, moss, Instrument Serif for what is said, Inter for what is operated,
//                    hairlines; no gradient, no gold, no emoji, no banned word; the book's curve,
//                    and no motion at all when less is asked for
//   Quick capture    a page of a notebook: the serif for what was kept, its day a micro-label, one
//                    way forward in moss — and the same inbox underneath

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as V from './.tmp/guide-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const text = (node) => html(h('div', null, ...[node].flat())).replace(/<[^>]+>/g, '');
const app = read('components/LogosApp.tsx');
const guideSrc = read('components/SocriaGuide.tsx');

console.log('=== "What Socria does": in the ⋯ menu, where "What Logos does" was ===');
ok('the menu offers What Socria does, with what it is', /label: 'What Socria does', hint: 'Short tutorials, one at a time'/.test(app));
ok('  "What Logos does" is gone, and the old walk with it', !/What Logos does/.test(app) && !/LogosGuide/.test(app) && !existsSync(join(root, 'components/LogosGuide.tsx')));
ok('  its old styles went with it — only the keyframe another sheet borrows is kept', !/\.lgg-/.test(read('app/globals.css')) && /@keyframes lggIn/.test(read('app/globals.css')));
ok(
  'the tutorials can try what they show — by the presses they stand for',
  /onHome: goHome/.test(app) && /onNew: \(\) => void newFromHome\(\)/.test(app) && /onSearch: \(\) => setSearchOpen\(Date\.now\(\)\)/.test(app)
);
ok(
  '  and only what is there: Quick capture where it is on, Write where the plan has it, Memory with an account',
  /\.\.\.\(LOGOS4\.capture \? \{ onCapture: \(\) => setCaptureOpen\(true\) \} : \{\}\)/.test(app) &&
    /\.\.\.\(limits\.draftSpace \? \{ onWrite: openWriting \} : \{\}\)/.test(app) &&
    /\.\.\.\(cloud \? \{ onMemory: \(\) => setL5Mind\(true\) \} : \{\}\)/.test(app)
);

console.log('\n=== the tutorials: the screen as it is, in the order it is met ===');
const T = V.socriaTutorials({ capture: true, memory: true });
ok(
  'eleven, from the Universal Map to Memory',
  J(T.map((t) => t.id)) === J(['home', 'start', 'views', 'split', 'make', 'content', 'write', 'capture', 'search', 'voice', 'memory']),
  J(T.map((t) => t.id))
);
ok(
  '  each with a headline, a standfirst, three steps and its working surface in miniature',
  T.every((t) => t.title && t.stand && t.steps.length === 3 && t.demo)
);
ok(
  '  every headline ends on a full stop',
  T.every((t) => /\.$/.test(text(t.title).trim())),
  J(T.map((t) => text(t.title)))
);
ok(
  '  and one word in it in moss italic',
  T.every((t) => (html(h('h2', null, t.title)).match(/<em>/g) || []).length === 1)
);
const noCap = V.socriaTutorials({ capture: false, memory: true });
ok('Quick capture is taught only where it is on', noCap.length === 10 && !noCap.some((t) => t.id === 'capture'));
const tries = Object.fromEntries(T.filter((t) => t.try).map((t) => [t.id, t.try.run]));
ok(
  'each that can be tried names the press it stands for',
  J(tries) === J({ home: 'onHome', start: 'onNew', write: 'onWrite', capture: 'onCapture', search: 'onSearch', memory: 'onMemory' }),
  J(tries)
);
ok(
  'Write is marked as Socria One’s where the plan does not have it',
  T.find((t) => t.id === 'write').one === true && /t\.one && !writeIncluded && <span className="sg-one">Socria One<\/span>/.test(guideSrc)
);
ok(
  'Memory says plainly when it needs an account',
  /sign in to have one/.test(V.socriaTutorials({ capture: true, memory: false }).find((t) => t.id === 'memory').note) && !/sign in/.test(T.find((t) => t.id === 'memory').note)
);
const split = T.find((t) => t.id === 'split');
ok(
  'Split View teaches the conversation on any side — dragged, pressed, or said',
  /left, right, top or bottom/.test(split.stand) && /any edge/.test(text(split.steps)) && /put the chat on the left/.test(text(split.steps))
);
ok('Voice is honest: experimental, and it asks before what cannot be undone', /experimental/i.test(T.find((t) => t.id === 'voice').note) && /asks first/.test(T.find((t) => t.id === 'voice').note));
const words = T.map((t) => [text(t.title), t.stand, text(t.steps), t.note ?? ''].join(' ')).join(' ');
ok('the voice: no banned word', !/\b(powerful|seamless|revolutionary|effortless|10x|unlock|supercharge|game-changing)\b/i.test(words));
ok('  no emoji, not once', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(words + guideSrc.replace(/'✓ ✓ ·'/g, '')));
ok('  second person, Socria in the third', /\byou\b/i.test(words) && !/\bI\b(?! can’t tell)/.test(words.replace(/“[^”]*”/g, '')));

console.log('\n=== the guide, drawn ===');
const g = html(h(V.SocriaGuide, { open: true, onClose: () => {}, actions: { onHome: () => {} } }));
ok('a dialog, named by its headline', /role="dialog" aria-modal="true" aria-labelledby="sg-title"/.test(g) && /id="sg-title"/.test(g));
ok(
  'the contents: every tutorial, numbered, the count said in words',
  (g.match(/class="sg-toc-b/g) || []).length === 11 && /Eleven things, in the order you’ll meet them\./.test(g) && />01</.test(g) && />11</.test(g)
);
ok('  the first is where Socria opens: the Universal Map', /Everything you’ve thought through, on <em>one<\/em> map\./.test(g) && /aria-current="step"/.test(g));
ok('  opened like a spread: a roman numeral in moss italic, the name as a micro-label', /<span class="sg-num">I<\/span><span class="sg-lbl">The Universal Map<\/span>/.test(g));
ok('  how far in, and the way on', /1 of 11/.test(g) && /class="sg-next">Next/.test(g) && !/class="sg-back"/.test(g));
ok('  a way to try it, when there is one', /class="sg-try">Open the Universal Map/.test(g) && !/class="sg-try"/.test(html(h(V.SocriaGuide, { open: true, onClose: () => {} }))));
ok(
  '  its miniature is a figure, named for a screen reader; the moving parts are hidden from one',
  /<figure class="sg-plate" aria-label="The Universal Map, shown in miniature">/.test(g) && /aria-hidden="true"/.test(g)
);
ok('  where it is, said politely when it changes', /class="sg-sr" aria-live="polite">1 of 11: The Universal Map</.test(g));
ok('closed, it is nothing', html(h(V.SocriaGuide, { open: false, onClose: () => {} })) === '');
ok('without Quick capture, ten', /Ten things, in the order/.test(html(h(V.SocriaGuide, { open: true, onClose: () => {}, capture: false }))));
ok('the keys: ← →, Home, End, Escape', /ArrowRight/.test(guideSrc) && /ArrowLeft/.test(guideSrc) && /'Home'/.test(guideSrc) && /'End'/.test(guideSrc) && /Escape/.test(guideSrc));

console.log('\n=== the brand book, in the sheets ===');
for (const [name, f] of [
  ['the guide', 'components/socria-guide.css'],
  ['Quick capture', 'components/capture-inbox.css'],
]) {
  const css = read(f);
  ok(`${name}: no gradient, no gold`, !/gradient\(/.test(css) && !/#b8a26b|--lg-secondary|gold/i.test(css.replace(/no gold/g, '')));
  ok(`  Instrument Serif for what is said, the Logos sans for what is operated`, /--serif, 'Instrument Serif'/.test(css) && /var\(--lg-sans\)/.test(css));
  ok(`  moss and ink from the tokens, so the dark grounds hold`, /var\(--lg-primary/.test(css) && /var\(--lg-ink/.test(css) && /html\[data-theme='night'\]/.test(css));
  ok(`  the book's curve, and no motion when less is asked for`, /cubic-bezier\(0\.16, 1, 0\.3, 1\)/.test(css) && /prefers-reduced-motion: reduce/.test(css));
}
ok('reduced motion leaves each demo on its last frame', /\.sg-pane:not\(\.is-last\) \{\s*display: none;/.test(read('components/socria-guide.css')));

console.log('\n=== Quick capture: a page of a notebook ===');
const q = html(h(V.CaptureInbox, { open: true, onClose: () => {}, signedIn: false, readImage: async () => '', onNewThread: () => {}, onToComposer: () => {} }));
ok('a micro-label over an ink rule, then the headline in the serif', /class="qc-lbl">Quick capture/.test(q) && /class="qc-title">Keep it for <em>later<\/em>\./.test(q));
ok('  where it is kept, said as before', /Kept on this device\. Sign in to keep captures in your account\./.test(q));
ok(
  '  the box — the one white surface — with the photo and the save',
  /aria-label="A thought, a note, anything for later"/.test(q) && /class="qc-photo"/.test(q) && /class="qc-save" disabled=""/.test(q)
);
ok('  nothing kept yet: said, with the other way in', /Nothing kept yet\./.test(q) && /Or start a message with <q>capture:<\/q> anywhere in Socria — it lands here, and nothing is sent\./.test(q));
ok('  none of the old card classes', !/class="lg-cap/.test(q));
const cap = read('components/CaptureInbox.tsx');
ok(
  'each kept thing: its day and time as micro-labels, the words in the serif, one way forward in moss',
  /className="qc-day-h"/.test(cap) &&
    /className="qc-meta"/.test(cap) &&
    /className=\{`qc-text/.test(cap) &&
    /className="qc-go"[\s\S]{0,200}?>\s*Think it through <span aria-hidden="true">→<\/span>/.test(cap)
);
ok(
  '  the rest as quiet words — and every one still there',
  ['Add to map', 'Use in message', 'Edit', 'Delete'].every((w) => new RegExp(`className="qc-quiet[^"]*"[\\s\\S]{0,200}?>\\s*${w}\\s*<`).test(cap))
);
ok('  under its day: Today, Yesterday, or the date', /if \(d\.toDateString\(\) === t\.toDateString\(\)\) return 'Today';/.test(cap) && /return 'Yesterday';/.test(cap));
ok('  kept, it says so in moss italic', /setToast\('Kept for later\.'\)/.test(cap) && /\.qc-toast \{[^}]*font-style: italic;[^}]*color: var\(--qc-moss\)/.test(read('components/capture-inbox.css')));
ok('  its old styles are gone from the Logos 4 sheet', !/lg-cap/.test(read('components/logos4.css')) && /import '\.\/capture-inbox\.css';/.test(cap));

console.log(`\nsocria-guide: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
