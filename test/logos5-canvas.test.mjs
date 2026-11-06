// THE LINE OF THINKING, ZOOMED OUT — the chat and what it made are one thing
// at two distances. Close in, the conversation; pulled back (Zoom out, Esc or
// a pinch), the canvas: the turns down the middle as a spine, beside each
// turn what that turn made — the elements its reply drew, the notes and
// files, the practice — and the Logic Map beside the turn that first drew it.
// The chatbox stays docked; anything can be brought into focus, asked about,
// jumped back to, or opened full. The four-tab row is gone: a full view is
// reached from the canvas and left by "Back to chat".
//
//   lib/logos5/canvas.ts          what goes on the canvas (pure)
//   components/logos5/L5Canvas.tsx the canvas
//   components/LogosApp.tsx       the wiring: Zoom out, Esc, pinch, cards, the view bar

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as C from './.tmp/canvas-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const fence = (o) => '```ui\n' + JSON.stringify(o) + '\n```';
const GRAPH = { type: 'graph', title: 'Average slope, matched', expr: 'x^3 - 3*x', x: [-2.5, 2.5], params: [{ name: 'a', value: -1.5, min: -2.5, max: 2.5, step: 0.1 }, { name: 'b', value: 2, min: -2.5, max: 2.5, step: 0.1 }], chord: ['a', 'b'], features: ['mean-value'] };
const CLAIM = { type: 'claim', claim: 'We only use 10% of our brains', verdict: 'fails', parts: [{ text: 'Imaging shows activity everywhere', holds: 'yes' }, { text: 'The figure comes from research', holds: 'no' }] };

console.log('\n=== what a turn says, read as type ===');
{
  const t = C.plainText("There is a $c$ with $f'(c) = \\frac{f(b) - f(a)}{b - a}$.");
  ok('a fraction reads as a/b, bracketed where it is more than one term', t.includes("f'(c) = (f(b) - f(a))/(b - a)") && !t.includes('\\'), t);
  const u = C.plainText('So \\(x^2 + 2x \\le 3\\) when \\(x \\in [-3, 1]\\).');
  ok('…powers as superscripts, \\le and \\in as their signs', u.includes('x² + 2x ≤ 3') && u.includes('x ∈ [-3, 1]'), u);
  const v = C.plainText('$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$ and that is it.');
  ok('…display maths too, with no TeX left over', v.includes('∫') && v.includes('1/3') && !/[\\{}$]/.test(v), v);
  ok('…a root and a Greek letter', C.plainText('\\(\\sqrt{\\frac{a}{b}}\\) as \\(\\alpha \\to \\infty\\)').includes('√(a/b)') && C.plainText('\\(\\alpha \\to \\infty\\)') === 'α → ∞', C.plainText('\\(\\sqrt{\\frac{a}{b}}\\)'));
  ok('two sums of money are not maths', C.plainText('It costs $5 and $10 at most.') === 'It costs $5 and $10 at most.', C.plainText('It costs $5 and $10 at most.'));
  ok('a quotation mark is dropped, an inequality is kept', C.plainText('> quoted\nthen x > 2 holds') === 'quoted then x > 2 holds', C.plainText('> quoted\nthen x > 2 holds'));
  ok('no fenced block, no bold, no heading', C.plainText('## Head\n**bold** text\n```ui\n{"type":"graph"}\n```\nafter') === 'Head bold text after', C.plainText('## Head\n**bold** text\n```ui\n{}\n```\nafter'));
  const long = 'One sentence that runs on for a while. ' + 'More words here that keep going and going without stopping at all '.repeat(4);
  const e = C.excerpt(long, 120);
  ok('an excerpt is cut at a word, and says it was cut', e.length <= 121 && (e.endsWith('…') || e.endsWith('.')), e);
  ok('…a short text is left whole', C.excerpt('Short.', 120) === 'Short.');
}

console.log('\n=== the turns: a question and its reply, in order ===');
const messages = [
  { id: 'u1', role: 'user', content: 'Help me understand the mean value theorem' },
  { id: 'a1', role: 'assistant', content: 'Picture the chord between two points.\n\n' + fence(GRAPH) + '\n\nSomewhere the tangent matches it.' },
  { id: 'u2', role: 'user', content: 'Is it true we only use 10% of our brains?' },
  { id: 'a2', role: 'assistant', content: 'No.\n\n' + fence(CLAIM) + '\n\n' + fence({ type: 'paths', options: ['Why the myth spread', 'What imaging shows'] }), ui: { 0: { artifact: 'kept-1' } } },
  { id: 's1', role: 'assistant', content: 'Where things stand', synthesis: { at: 1 } },
  { id: 'u3', role: 'user', content: 'And the proof?' },
];
const turns = C.canvasTurns(messages, { pending: true });
ok('four turns: two exchanges, a synthesis, and the one being answered', turns.length === 4, J(turns.map((t) => t.key)));
ok('…each pairs what was asked with what was said back', turns[0].askedId === 'u1' && turns[0].replyId === 'a1' && turns[0].asked.startsWith('Help me') && turns[0].said.startsWith('Picture the chord'), J(turns[0]));
ok('…a reply’s element is not in its gist', !turns[0].said.includes('```') && !turns[0].said.includes('graph'), turns[0].said);
ok('…a synthesis is a turn of its own, said as where the thinking stands', turns[2].synthesis && turns[2].said === 'Where your thinking stands' && !turns[2].asked);
ok('…the last question, still unanswered, is pending', turns[3].pending === true && !turns[3].replyId);
ok('…and nothing pending when nothing is being written', !C.canvasTurns(messages).some((t) => t.pending));
ok('a reply with no question before it is still a turn', C.canvasTurns([{ id: 'a0', role: 'assistant', content: 'Hello.' }]).length === 1);
ok('indices run in order, keys are unique', turns.every((t, i) => t.index === i) && new Set(turns.map((t) => t.key)).size === turns.length);

console.log('\n=== what the replies drew, beside the turn that drew it ===');
const els = C.canvasElements(messages, turns);
ok('the graph and the claim — not the ways onward', els.length === 2 && els[0].spec.type === 'graph' && els[1].spec.type === 'claim' && !els.some((e) => e.spec.type === 'paths'), J(els.map((e) => e.spec.type)));
ok('…each beside its own turn', els[0].turn === 0 && els[1].turn === 1);
ok('…keyed by its reply and its place in it, the key its state is kept under', els[0].key === 'e:a1:0' && els[0].n === 0 && els[1].key === 'e:a2:0');
ok('…named by its own title or its claim', els[0].title === 'Average slope, matched' && els[1].title === 'We only use 10% of our brains');
ok('…and what was kept says where it went', els[1].kept === 'kept-1' && !els[0].kept);
ok('a practice check goes in the practice lane', C.canvasElements([{ id: 'u', role: 'user', content: 'q' }, { id: 'a', role: 'assistant', content: fence({ type: 'check', prompt: 'What is 2 + 2?', answer: '4' }) }], C.canvasTurns([{ id: 'u', role: 'user', content: 'q' }, { id: 'a', role: 'assistant', content: fence({ type: 'check', prompt: 'What is 2 + 2?', answer: '4' }) }])).every((e) => e.lane === 'practice'));
ok('the kinds are named as a card names them', C.ELEMENT_NOUN.graph === 'Live graph' && C.ELEMENT_NOUN.claim === 'Claim' && C.ELEMENT_NOUN.compare === 'Comparison');
ok('a comparison with no title is its options', C.elementTitle({ type: 'compare', options: ['Rent', 'Buy'], rows: [] }) === 'Rent vs Buy');

console.log('\n=== filters, places, sides ===');
ok('Everything shows every lane; a filter shows its own', C.inFilter('ideas', 'all') && C.inFilter('made', 'made') && !C.inFilter('practice', 'ideas'));
ok('Chats is the conversation alone — no cards beside it; practice counts as made', ['ideas', 'made', 'practice'].every((l) => !C.inFilter(l, 'chats')) && C.inFilter('practice', 'made'));
ok('a note made from a reply sits beside that turn', C.turnOfEntry('note:a2:summary', turns) === 1 && C.turnOfEntry('upload:x', turns) === null);
{
  const s = C.sidesFor([{ key: 'm', lane: 'ideas', tone: 'map' }, { key: 'g', lane: 'made', tone: 'artifact' }]);
  ok('ideas on the left, what was made on the right', s.m === 'l' && s.g === 'r', J(s));
  const t = C.sidesFor([{ key: 'a', lane: 'made', tone: 'artifact' }, { key: 'b', lane: 'made', tone: 'artifact' }, { key: 'c', lane: 'practice', tone: 'practice' }]);
  ok('…and one side is never left bare while the other holds three', Object.values(t).includes('l') && Object.values(t).includes('r'), J(t));
}
ok('zoom is held between half and full size', C.clampZoom(0.1) === C.ZOOM.min && C.clampZoom(3) === C.ZOOM.max && C.clampZoom(0.73) === 0.73 && C.ZOOM.start < 1);

console.log('\n=== the canvas ===');
{
  const cards = [
    { key: 'map', lane: 'ideas', tone: 'map', kicker: 'Logic Map · 3 ideas', title: '', turn: 0, preview: h(C.MapPreview, { nodes: [{ id: 'q', type: 'question', label: 'Why does the chord matter?' }, { id: 'c', type: 'claim', label: 'A tangent matches it' }, { id: 'e', type: 'evidence', label: 'Rolle’s theorem' }], edges: [{ from: 'q', to: 'c' }] }) },
    { key: 'e:a1:0', lane: 'made', tone: 'artifact', kicker: 'Artifact · Live graph', title: 'Average slope, matched', turn: 0, preview: h('i', null, 'graph') },
    { key: 'a:p:1', lane: 'practice', tone: 'practice', kicker: 'Practice', title: 'Three questions', turn: null, preview: h('i', null, 'practice') },
  ];
  const html = renderToStaticMarkup(h(C.L5Canvas, { turns, cards, composer: h('div', { id: 'the-dock' }, 'composer'), narrow: false, onBack() {}, onJump() {} }));
  ok('the turns are a spine of buttons back into the conversation', (html.match(/class="lcv-turn/g) || []).length === 4 && html.includes('data-turn="0"') && html.includes('Back to the conversation here'), html.slice(0, 300));
  ok('…what was asked in its own bubble, the reply as its gist', html.includes('class="lcv-ask">Help me understand the mean value theorem') && html.includes('class="lcv-said">Picture the chord'));
  ok('…the turn being answered says so', html.includes('class="lcv-said is-wait">Replying…'));
  ok('who said what: “You” over your bubble, Socria by its mark over the reply', (html.match(/class="lcv-who is-you">You</g) || []).length === 3 && (html.match(/class="lcv-who is-socria">/g) || []).length === 4 && html.includes('src="/socria-mark.png"'));
  ok('what a turn made is beside it, wired to it', (html.match(/data-card-turn="0"/g) || []).length === 2);
  ok('…the map on the left, the graph on the right', /data-side="l"[^>]*data-card-turn="0"[\s\S]*?Logic Map/.test(html) && /data-side="r"[^>]*data-card-turn="0"[\s\S]*?Live graph/.test(html));
  ok('…what belongs to no turn is gathered at the end', html.includes('Also in this line of thinking') && html.includes('Three questions'));
  ok('a preview is to look at, not to use', html.includes('class="lcv-inert" aria-hidden="true"'));
  ok('every card opens with a key as well as a click', (html.match(/class="lcv-card[^"]*"[^>]*role="button" tabindex="0"/g) || []).length === 3, html.match(/<div class="lcv-card[^>]*>/g)?.join('\n'));
  ok('the bar: Everything / Ideas / Made / Chats, the zoom, the way back', ['Everything', 'Ideas', 'Made', 'Chats'].every((l) => html.includes(`>${l}</button>`)) && html.includes('aria-label="Zoom in"') && html.includes('80%') && html.includes('Back to chat'));
  ok('the chatbox stays docked', html.includes('class="lcv-dock"><div id="the-dock">composer</div>'));
  ok('the map card: the question on top, what hangs from it beneath', html.includes('lcv-node is-question') && html.indexOf('Why does the chord matter?') < html.indexOf('A tangent matches it'));
  const phone = renderToStaticMarkup(h(C.L5Canvas, { turns, cards, composer: null, narrow: true, onBack() {}, onJump() {} }));
  ok('on a phone: one column, no zoom buttons (a pinch is the page’s own)', phone.includes('class="lcv is-narrow"') && !phone.includes('aria-label="Zoom in"'));
  ok('…and the way back is short enough never to be cut off', /class="lcv-back"[^>]*aria-label="Back to chat"[^>]*><span aria-hidden="true">‹<\/span> Chat<\/button>/.test(phone), phone.match(/<button[^>]*lcv-back[\s\S]*?<\/button>/)?.[0]);
  const empty = renderToStaticMarkup(h(C.L5Canvas, { turns: [], cards: [], composer: null, narrow: false, onBack() {}, onJump() {} }));
  ok('nothing said yet: says what will be here', empty.includes('Nothing here yet'));
}

console.log('\n=== asking about something on the canvas ===');
{
  const b = C.describeFocus({ kind: 'element', label: 'Average slope, matched', of: 'the live graph Socria drew in turn 1', lines: ['Live graph: Average slope, matched', 'as they left it: a = -1.5, b = 2'] }, null);
  ok('Socria is told what it is and where it came from', b && b.label === 'Average slope, matched' && b.of.includes('turn 1') && b.lines.some((l) => l.includes('a = -1.5')), J(b));
}

console.log('\n=== the wiring ===');
{
  const app = read('components/LogosApp.tsx');
  const css = read('components/logos5/canvas.css');
  ok('the four-tab row is gone', !/<L5Tabs\b/.test(app) && !/\btabsEl\b/.test(app));
  ok('5.5: the switch in the header is the way between the views — zoomed out, none is chosen; a press brings that view close', /const switchEl = activeId \?/.test(app) && /value=\{zoomed \? '' : studyTab\}/.test(app) && /onChange=\{\(v\) => openFull\(v as Viewport\)\}/.test(app) && !/const viewBarEl =/.test(app));
  ok('Zoom out is one of the open view\'s own actions; the switch marks a view where something new was made', /const viewActsEl =/.test(app) && /l5v-zoomout" onClick=\{zoomOut\}/.test(app) && /fresh: artFresh/.test(app) && /fresh: stageFresh/.test(app));
  ok('Esc and a pinch zoom out — not while typing, nor over a dialog or a menu', /e\.key !== 'Escape'[^\n]*editable\(e\.target\)[^\n]*blocked\(\)/.test(app) && /e\.ctrlKey/.test(app) && /zoomOkRef\.current = !!l5 && !!activeId && !homeShown && !mindShown && studyTab === 'chat' && !zoomed && messages\.length > 0/.test(app));
  ok('the canvas is the default: a line of thinking opens zoomed out, and so does the next one', /const \[zoomed, setZoomed\] = useState\(true\)/.test(app) && /useEffect\(\(\) => setZoomed\(true\), \[activeId\]\)/.test(app));
  ok('  …and a full view opened by anything else (a reply, Make, a command) is shown, not hidden under the canvas', /if \(prevTabRef\.current !== studyTab && studyTab !== 'chat'\) setZoomed\(false\)/.test(app));
  ok('the chatbox moves to the canvas, never shown twice', /\{zoomed \? null : l5Dock\}/.test(app) && /omni=\{convoOpen \|\| zoomed \? null : l5Dock\}/.test(app) && /composer=\{l5Dock\}/.test(app));
  ok('elements are drawn by the conversation’s own component, live in focus, as they were left', /<InlineBlock[\s\S]{0,400}live,/.test(app) && /sanitizeInlineState\(msg\.ui\)/.test(app));
  ok('Ask about this aims the chatbox at it', /setFocus\(\{ kind: 'element', label, of, lines/.test(app) && /focusComposer\(\)/.test(app));
  ok('while zoomed, the conversation underneath is neither seen nor reachable', /\.l5-body\.is-zoomed > :not\(\.lcv\)\s*\{[^}]*visibility: hidden[^}]*pointer-events: none/.test(css));
  ok('cards on the theme’s raised surface (white on Paper), not the chat card’s beige', /--lcv-card: var\(--l5-raise/.test(css) && !/--lcv-card: var\(--l5-card/.test(css));
  ok('  your question in a filled neutral bubble (the chat’s shape), not a tan one', /\.lcv-ask \{[^}]*background: rgba\(var\(--lcv-ink-rgb\), 0\.075\)/.test(css));
  ok('the canvas sits under the header, so ‹ Universal Map stays on screen while zoomed', /\.l5-body\.is-zoomed \{\s*position: relative;/.test(css) && /\{!chromeHidden && !mindShown && !homeShown && l5Head\}/.test(app));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
