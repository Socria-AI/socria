// LOGOS 5 — THE SCREEN'S PIECES, RENDERED.
//
// What is held down:
//   • a turn keeps the anchor the resume and jump code look for (#lg-m-<id>);
//   • Socria's words are read richly (headings, code, quotes) and the
//     person's never are — their asterisks and hashes stay theirs;
//   • a turn offers exactly the actions it can have: copy always, reply when
//     allowed, retry on the latest reply only when asked to, edit on your own
//     message only when asked to, with what editing replaces said in place;
//   • a reply says what it did in the workspace, and an empty reply says so;
//   • the selected card's bar says how many messages it came from;
//   • rich reading is opt-in: the default reading — Core's — is unchanged;
//   • a reply still arriving draws finished paragraphs as blocks, and an
//     unclosed code fence as code, not prose;
//   • the stage's per-browser preferences survive garbage and a full store.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as U from './.tmp/logos5-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const msg = (o = {}) => ({ id: 'm_1', at: 1, role: 'assistant', content: 'Hello.', ...o });
const base = { side: 'socria', who: 'Socria', group: false, cont: false, showQuote: false, canReply: true, onReply: () => {} };

console.log('\n=== a turn ===');
{
  const a = html(h(U.L5Message, { ...base, m: msg({ content: '## A plan\n\nFirst, **this**.\n\n```js\nconst x = 1;\n```\n\n> said once' }) }));
  ok('keeps the anchor the resume and jump code read', a.includes('id="lg-m-m_1"'));
  ok('Socria’s words are prose, not a bubble', a.includes('class="l5-prose"') && !a.includes('l5-said'));
  ok('a heading is drawn as one', /<h4[^>]*socria-h2[^>]*>(<span>)?A plan/.test(a), a);
  ok('a fenced block is code, with a copy button', a.includes('socria-codeblock') && a.includes('const x = 1;') && a.includes('Copy this block'));
  ok('a quotation is a blockquote', /<blockquote class="socria-quote">(<span>)?said once/.test(a));
  ok('bold is bold', a.includes('<strong class="socria-strong">this</strong>'));

  const u = html(h(U.L5Message, { ...base, side: 'mine', who: 'You', canReply: false, m: msg({ role: 'user', content: '## not a heading **not bold**' }) }));
  ok('your words are a card, never reinterpreted', u.includes('class="l5-said"') && u.includes('## not a heading **not bold**') && !u.includes('<h4'));
  ok('your message is not offered a reply to itself', !u.includes('Reply to your message'));

  const about = html(h(U.L5Message, { ...base, side: 'mine', who: 'You', m: msg({ role: 'user', content: 'why?', about: { kind: 'node', label: 'Better team', of: 'the map' } }) }));
  ok('what it was about stays with it', about.includes('l5-about') && about.includes('Better team') && about.includes('the map'));
}

console.log('\n=== the actions a turn offers ===');
{
  const plain = html(h(U.L5Message, { ...base, m: msg() }));
  ok('copy and reply on a reply', plain.includes('Copy Socria’s message') && plain.includes('Reply to Socria’s message'));
  ok('no retry unless asked for', !plain.includes('Ask again'));
  const latest = html(h(U.L5Message, { ...base, m: msg(), latest: true, onRetry: () => {} }));
  ok('the latest reply can be asked again, and shows its actions', latest.includes('aria-label="Ask again"') && latest.includes('is-latest'));
  const mine = html(h(U.L5Message, { ...base, side: 'mine', who: 'You', canReply: false, m: msg({ role: 'user', content: 'mine' }), onEdit: () => {}, after: 3 }));
  ok('your own message can be edited', mine.includes('aria-label="Edit your message"'));
  const noEdit = html(h(U.L5Message, { ...base, side: 'other', who: 'Ana', m: msg({ role: 'user', content: 'theirs' }) }));
  ok('someone else’s cannot', !noEdit.includes('Edit your message'));
  const empty = html(h(U.L5Message, { ...base, m: msg({ content: '' }), latest: true, onRetry: () => {} }));
  ok('a reply with no words says so, and can still be asked again', empty.includes('No words came back this time.') && empty.includes('Ask again') && !empty.includes('Copy Socria'));
}

console.log('\n=== what a turn did in the workspace ===');
{
  const fx = html(h(U.L5Message, { ...base, m: msg(), effect: { map: { said: '+3 on the map', nodes: ['a', 'b', 'c'] }, objects: [{ id: 'obj_1', label: 'Spending', kind: 'chart' }] } }));
  ok('the map’s change is said under the reply', fx.includes('+3 on the map') && fx.includes('Show these on the map'));
  ok('…and the display it opened, by name', fx.includes('Spending') && fx.includes('Open Spending') && fx.includes('l5-fx-kind'));
  const none = html(h(U.L5Message, { ...base, m: msg(), effect: null }));
  ok('a turn that did nothing says nothing', !none.includes('l5-fx'));
  const userFx = html(h(U.L5Message, { ...base, side: 'mine', who: 'You', m: msg({ role: 'user', content: 'x' }), effect: { map: { said: '+1 on the map', nodes: ['a'] } } }));
  ok('effects are said on the reply, never on the person’s own turn', !userFx.includes('+1 on the map'));
  const linked = html(h(U.L5Message, { ...base, m: msg(), linked: true }));
  ok('a turn the selected card came from is marked', linked.includes('is-linked'));
}

console.log('\n=== in a group ===');
{
  const g = html(h(U.L5Message, { ...base, group: true, m: msg({ replyTo: { id: 'q1', role: 'user', who: 'Ana', excerpt: 'what about pay?' } }), showQuote: true, toLabel: 'You' }));
  ok('Socria’s turn says whom it answers', g.includes('l5-who') && g.includes('→ You'));
  ok('…and carries the quote, which jumps', g.includes('l5-quote') && g.includes('what about pay?'));
}

console.log('\n=== still arriving ===');
{
  const p = html(h(U.L5Pending, { text: 'First paragraph.\n\n- one\n- two\n\nStill writ', group: false }));
  ok('finished paragraphs are drawn as blocks', p.includes('<ul>') && p.includes('<li>'));
  ok('the paragraph being written stays inline, with the caret', p.includes('is-tail') && p.includes('Still writ') && p.includes('l5-caret'));
  const fence = html(h(U.L5Pending, { text: 'Here:\n\n```py\nprint(1)', group: false }));
  ok('an unclosed fence is code, not prose', fence.includes('socria-codeblock is-open') && fence.includes('print(1)'));
  const thinking = html(h(U.L5Pending, { text: '', group: false, mapping: true, onStop: () => {} }));
  ok('before any words: thinking, what it is doing, and a way to stop', thinking.includes('Thinking, and reading the map') && thinking.includes('Stop'));
}

console.log('\n=== rich reading is opt-in ===');
{
  ok('the default reading leaves a # as text (Core is unchanged)', J(U.parseBlocks('# not a heading')) === J([{ kind: 'p', text: '# not a heading' }]));
  ok('…and a fence as text', U.parseBlocks('```\ncode\n```').every((b) => b.kind === 'p'));
  ok('rich: a heading, its level', J(U.parseBlocks('### Three', { rich: true })) === J([{ kind: 'h', level: 3, text: 'Three' }]));
  ok('rich: a closed fence with its language', J(U.parseBlocks('```ts\nlet a = 1\n```', { rich: true })) === J([{ kind: 'code', lang: 'ts', text: 'let a = 1', open: false }]));
  ok('rich: an unclosed fence runs to the end, marked open', J(U.parseBlocks('```\na\nb', { rich: true })) === J([{ kind: 'code', lang: null, text: 'a\nb', open: true }]));
  ok('rich: a paragraph stops at a heading with no blank line', J(U.parseBlocks('para\n## Head', { rich: true }).map((b) => b.kind)) === J(['p', 'h']));
  ok('rich: a quotation joins its lines', J(U.parseBlocks('> one\n> two', { rich: true })) === J([{ kind: 'quote', text: 'one\ntwo' }]));
  ok('inline code is opt-in, and marks inside it are not read', J(U.splitInline('use `**x**` here', { code: true })) === J([{ kind: 'text', text: 'use ' }, { kind: 'code', text: '**x**' }, { kind: 'text', text: ' here' }]));
  ok('without it, backticks are text', U.splitInline('use `x`').every((s) => s.kind === 'text'));
}

console.log('\n=== the chrome ===');
{
  const bar = html(h(U.L5LinkBar, { label: 'Better team', count: 2, at: 0, onStep: () => {}, onClear: () => {} }));
  ok('the selected card’s bar says how many messages it came from, and steps through them', bar.includes('2 messages') && bar.includes('1/2') && bar.includes('aria-label="Next"'));
  const none = html(h(U.L5LinkBar, { label: 'Pay', count: 0, at: 0, onStep: () => {}, onClear: () => {} }));
  ok('a card tied to no message says so plainly', none.includes('isn’t tied to a message here'));
  const head = html(h(U.L5Header, { railOpen: true, onToggleRail: () => {}, title: 'Two offers', stage: { label: 'Map', count: 4, open: false, fresh: true, onToggle: () => {} }, menu: [{ label: 'Synthesize', onSelect: () => {} }] }));
  ok('the header says where you are, and what the workspace holds', head.includes('Two offers') && head.includes('Map') && head.includes('l5-count">4') && head.includes('is-fresh'));
  ok('…with one menu for the rest', head.includes('aria-label="More"') && head.includes('aria-haspopup="menu"'));
  const quiet = html(h(U.L5Header, { railOpen: false, onToggleRail: () => {}, title: 'New', stage: null, menu: [] }));
  ok('nothing in the workspace yet: no workspace button at all', !quiet.includes('l5-stagebtn'));
  const sh = html(h(U.L5StageHead, { title: 'Thinking Map', sub: 'Deciding', onClose: () => {} }));
  ok('the stage’s head has a way back to the conversation', sh.includes('Back to the conversation') && sh.includes('Thinking Map'));
  const short = html(h(U.L5Outline, { items: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], onJump: () => {} }));
  ok('the outline is offered only once there are three questions to jump between', short === '');
}

console.log('\n=== the stage, remembered per browser ===');
{
  const store = new Map();
  const ls = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  ok('nothing kept: closed everywhere, the default width', J(U.readStagePrefs(ls)) === J({ open: {}, share: U.DEFAULT_STAGE_SHARE }));
  U.writeStagePrefs(ls, { open: { lg_a: true, lg_b: false }, share: 0.6 });
  ok('kept and read back', J(U.readStagePrefs(ls)) === J({ open: { lg_a: true, lg_b: false }, share: 0.6 }));
  store.set(U.STAGE_KEY, JSON.stringify({ open: { 'bad key!': true, lg_c: 'yes', lg_d: true }, share: 3 }));
  ok('garbage in the store is dropped, not trusted', J(U.readStagePrefs(ls)) === J({ open: { lg_d: true }, share: U.DEFAULT_STAGE_SHARE }));
  store.set(U.STAGE_KEY, '{nope');
  ok('a corrupt store reads as nothing kept', J(U.readStagePrefs(ls)) === J({ open: {}, share: U.DEFAULT_STAGE_SHARE }));
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  ok('a full store does not throw — the stage still opens, it is just not remembered', (() => { try { U.writeStagePrefs(full, { open: { x: true }, share: 0.5 }); return true; } catch { return false; } })());
  const many = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`lg_${i}`, true]));
  U.writeStagePrefs(ls, { open: many, share: 0.5 });
  ok('only the newest sixty are kept', Object.keys(U.readStagePrefs(ls).open).length === 60);
  ok('the switch: unset is on, "off" is off', U.logos5On(undefined) && U.logos5On('') && !U.logos5On('off') && !U.logos5On('0') && !U.logos5On('false'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
