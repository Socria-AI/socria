// TIPS FOR NEW PEOPLE, A FEATURE NOW AND THEN, AND SOCRIA ONE ON RETURN.
//
// lib/logos5/tips.ts decides; components/logos5/L5Tips.tsx keeps the clock; L5Tip draws the card beside
// what it is about; components/logos5/OneHeader.tsx is the Socria One button a free account gets in the
// header, and the small note under it when they come back (the "welcome-back" prompt's own rules decide
// when — lib/one-prompt.ts, held in one-prompt.test).
//
// Held here: a tip is for someone new, one at a time, each once, in order, never on top of anything; a
// feature is at most one a visit, days apart, never the first thing seen and never on a visit that has
// had tips; every card points at something that exists; the welcome-back is said small, never as a sheet.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  TIPS, pickTip, tipBody, parseLedger, searchKeys,
  TIP_GAP_MS, FEATURE_GAP_MS, FEATURE_SETTLE_MS, NEW_FOR_MS, TIP_LEDGER_KEY,
  L5Tip, OneButton, WELCOME_BACK, welcomeNudge,
} from './.tmp/tips-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));

const NOW = 1_800_000_000_000;
const ctx = (o = {}) => ({ where: 'line', replies: 1, lines: 1, mapCard: false, newUser: true, mac: false, toured: false, can: { split: true, capture: true, voice: false }, ...o });
const ledger = (o = {}) => ({ seen: [], lastTipAt: 0, lastFeatureAt: 0, ...o });
const none = { tips: 0, features: 0 };

console.log('\n=== tips: for somebody new, one at a time, each once ===');
ok('after the first answer, Make', pickTip(ctx(), ledger(), NOW, none)?.id === 'l5.make');
ok('  the Logic Map first, when its card is on the canvas', pickTip(ctx({ mapCard: true }), ledger(), NOW, none)?.id === 'l5.map');
ok('  not Make when the first-reply tour already pointed at it', pickTip(ctx({ toured: true }), ledger(), NOW, none)?.id !== 'l5.make');
ok('nothing before the first answer', pickTip(ctx({ replies: 0, lines: 0 }), ledger(), NOW, none) === null);
ok('each once: seen is seen', pickTip(ctx(), ledger({ seen: ['l5.make'] }), NOW, none)?.id !== 'l5.make');
ok('a moment between tips', pickTip(ctx({ replies: 2 }), ledger({ seen: ['l5.make'], lastTipAt: NOW - TIP_GAP_MS + 1000 }), NOW, { tips: 1, features: 0 }) === null && pickTip(ctx({ replies: 2 }), ledger({ seen: ['l5.make'], lastTipAt: NOW - TIP_GAP_MS }), NOW, { tips: 1, features: 0 })?.id === 'l5.home');
ok('the Universal Map once there is more than one answer', pickTip(ctx({ replies: 2 }), ledger({ seen: ['l5.make'] }), NOW, none)?.id === 'l5.home');
ok('search once there is more than one line of thinking — said with this keyboard’s keys', (() => {
  const t = pickTip(ctx({ where: 'home', replies: 0, lines: 2 }), ledger(), NOW, none);
  return t?.id === 'l5.search' && tipBody(t, { mac: true }).endsWith('⌘K works from anywhere.') && tipBody(t, { mac: false }).endsWith('Ctrl K works from anywhere.');
})());
ok('nobody past their first fortnight gets tips', TIPS.filter((t) => t.kind === 'tip').every((t) => pickTip(ctx({ newUser: false, mapCard: true, replies: 3, lines: 3 }), ledger({ seen: TIPS.filter((x) => x.kind === 'feature').map((x) => x.id) }), NOW, none)?.id !== t.id) && NEW_FOR_MS === 14 * 86400000);

console.log('\n=== a guest: the map at once, one hint about it, the rest as they come to it ===');
const guest = (o = {}) => ctx({ guest: true, where: 'home', replies: 0, lines: 0, ...o });
const nodes = TIPS.find((t) => t.id === 'g.nodes');
ok('a guest on the Universal Map gets one hint first: what the map is made of, and how to move about it', pickTip(guest(), ledger(), NOW, none)?.id === 'g.nodes' && /nodes/.test(nodes.body) && /press one/.test(nodes.body) && /drag/.test(nodes.body));
ok('  a tip, so its only button is "Got it": optional, and nothing in the way', nodes.kind === 'tip' && !nodes.action);
ok('  once: a guest who has seen it (or pressed Got it) never sees it again, coming back or not', pickTip(guest(), ledger({ seen: ['g.nodes'] }), NOW, none) === null);
ok('  never to an account: the registered onboarding is as it was', pickTip(ctx({ where: 'home', replies: 0, lines: 0 }), ledger(), NOW, none) === null && pickTip(ctx({ where: 'home', replies: 0, lines: 0, guest: false }), ledger(), NOW, none) === null);
ok('  only on the map, not in a conversation', pickTip(guest({ where: 'line', replies: 0 }), ledger(), NOW, none) === null);
ok('then guidance as they explore, one thing at a time: the Logic Map once it is drawn, Make, the way home', pickTip(guest({ where: 'line', replies: 1, mapCard: true }), ledger({ seen: ['g.nodes'] }), NOW, none)?.id === 'l5.map' && pickTip(guest({ where: 'line', replies: 1 }), ledger({ seen: ['g.nodes', 'l5.map'] }), NOW, none)?.id === 'l5.make' && pickTip(guest({ where: 'line', replies: 2 }), ledger({ seen: ['g.nodes', 'l5.map', 'l5.make'] }), NOW, none)?.id === 'l5.home');
ok('  never two in a row: a moment between them', pickTip(guest({ where: 'line', replies: 1, mapCard: true }), ledger({ seen: ['g.nodes'], lastTipAt: NOW - 5000 }), NOW, { tips: 1, features: 0 }) === null);
const appSrc = read('components/LogosApp.tsx');
ok('  never over the box to start in: on a phone it sits above its target instead', nodes.clear === '.l5h-find' && /const clear = below && tip\.clear \? visibleOf\(tip\.clear\) : null;/.test(read('components/logos5/L5Tip.tsx')) && /below = false;/.test(read('components/logos5/L5Tip.tsx')));
ok('the app says who is a guest to the tips', /can: \{ split: !narrow, capture: !!LOGOS4\.capture, voice: voiceOffered \},\s*guest,/.test(appSrc));

console.log('\n=== features: now and then, never the first thing, never on a tips visit ===');
const old = (o = {}) => ctx({ newUser: false, ...o });
ok('List, on the Universal Map, once there are conversations to list', pickTip(old({ where: 'home', replies: 0, lines: 2 }), ledger(), NOW, none)?.id === 'f.list');
ok('  not with one conversation', pickTip(old({ where: 'home', replies: 0, lines: 1 }), ledger(), NOW, none)?.id !== 'f.list');
ok('at most one a visit', pickTip(old({ where: 'home', lines: 2 }), ledger(), NOW, { tips: 0, features: 1 }) === null);
ok('never on a visit that has had tips', pickTip(old({ where: 'home', lines: 2 }), ledger({ seen: ['l5.search'] }), NOW, { tips: 1, features: 0 }) === null);
ok('days apart', pickTip(old({ where: 'home', lines: 2 }), ledger({ lastFeatureAt: NOW - FEATURE_GAP_MS + 60_000 }), NOW, none) === null && FEATURE_GAP_MS === 2 * 86400000);
ok('never the first thing a visit sees', FEATURE_SETTLE_MS >= 15_000 && /now - loadedAt\.current < FEATURE_SETTLE_MS/.test(read('components/logos5/L5Tips.tsx')));
ok('Voice only where it can be used; Split View only where there is room for it', pickTip(old({ replies: 2, can: { split: false, capture: false, voice: false } }), ledger({ seen: ['f.guide'] }), NOW, none) === null && pickTip(old({ replies: 2, can: { split: false, capture: false, voice: true } }), ledger({ seen: ['f.guide'] }), NOW, none)?.id === 'f.voice');
ok('every feature has a "Show me"; no tip has one', TIPS.every((t) => (t.kind === 'feature') === !!t.action));

console.log('\n=== every card points at something that is there ===');
const sources = ['components/LogosApp.tsx', 'components/logos5/L5Canvas.tsx', 'components/logos5/L5Views.tsx', 'components/logos5/MakePicker.tsx', 'components/logos5/L5Chrome.tsx', 'components/logos5/SocriaVoice.tsx', 'components/logos5/Universe.tsx', 'components/logos5/UniverseBubbles.tsx'].map(read).join('\n');
const has = (cls) => sources.includes(cls);
const anchorsOk = {
  'g.nodes': has('className="l5h-go"') && has("'l5b-hub'"),
  'l5.map': has('lcv-card is-${c.tone}'),
  'l5.make': has('data-tour="make"'),
  'l5.home': has('className="l5v-home"') && has('className="lcv-home"'),
  'l5.search': has('is-quiet l5v-search"') && has('l5-unibtn l5-searchbtn'),
  'f.list': has('l5-unibtn is-list'),
  'f.split': has('className="l5v-split"'),
  'f.guide': has('l5-menuhost'),
  'f.capture': has('l5-menuhost'),
  'f.voice': has('sv-btn'),
};
ok('each anchor is drawn by the app', TIPS.every((t) => anchorsOk[t.id] === true), JSON.stringify(anchorsOk));
ok('the Make tip sits above the whole box, never over where someone types', TIPS.find((t) => t.id === 'l5.make')?.avoid === '.l5-dock' && /a\.closest\(tip\.avoid\)/.test(read('components/logos5/L5Tip.tsx')));

console.log('\n=== the ledger, and what is kept ===');
ok('a broken ledger reads as fresh', JSON.stringify(parseLedger('{nope')) === '{"lastTipAt":0,"lastFeatureAt":0}' && JSON.stringify(parseLedger(JSON.stringify({ lastTipAt: -4, lastFeatureAt: 'x' }))) === '{"lastTipAt":0,"lastFeatureAt":0}');
ok('seen is kept with the other hints, so "Show hints again" brings them back', /readSeen\(store\)/.test(read('components/logos5/L5Tips.tsx')) && /markSeen\(s, tip\.id\)/.test(read('components/logos5/L5Tips.tsx')));
ok('a browser that keeps nothing gets no cards — never the same one every visit', /a browser that keeps nothing would show every card every visit: none, then/.test(read('components/logos5/L5Tips.tsx')));
ok('the ledger key is its own', TIP_LEDGER_KEY === 'socria.tips.v1');

console.log('\n=== the card ===');
const card = renderToStaticMarkup(h(L5Tip, { tip: TIPS.find((t) => t.id === 'f.list'), body: 'List lays out all your conversations.', onClose() {}, onAction() {}, onGone() {} }));
ok('says what it is, a title, a sentence, Show me and Got it', /Something to try/.test(card) && /Every conversation, as a list/.test(card) && /Show me/.test(card) && /Got it/.test(card) && /role="note"/.test(card));
const tipCard = renderToStaticMarkup(h(L5Tip, { tip: TIPS.find((t) => t.id === 'l5.make'), body: 'Make turns it into something.', onClose() {}, onGone() {} }));
ok('a tip has only "Got it"', /A tip/.test(tipCard) && !/Show me/.test(tipCard));

console.log('\n=== Socria One: a press away, and a word on return ===');
const btn = renderToStaticMarkup(h(OneButton, { onOpen() {}, note: null }));
ok('a button beside the account, named plainly', /class="l5-onebtn"/.test(btn) && />Socria One</.test(btn) && !/l5-onenote/.test(btn));
const withNote = renderToStaticMarkup(h(OneButton, { onOpen() {}, note: { first: 'Pradeep', title: WELCOME_BACK[0].title, line: welcomeNudge(WELCOME_BACK[0].title), onSee() {}, onLater() {} } }));
ok('the note on return: welcome back, by name, one true line, See and Not now', /Welcome back, Pradeep\./.test(withNote) && withNote.includes(WELCOME_BACK[0].title) && /See Socria One/.test(withNote) && /Not now/.test(withNote));
ok('every welcome-back has its short line, and none promises what is not so', WELCOME_BACK.every((v) => v.nudge.length > 30 && v.nudge.length < 120 && !/limited time|discount|hurry|only today/i.test(v.nudge)));
const app = read('components/LogosApp.tsx');
ok('only a free, signed-in account gets the button', /\{planKnown && !one && \(\s*<OneButton/.test(app));
ok('the welcome-back is said small — never as a sheet over the work', /view=\{onePrompt\?\.reason === 'welcome-back' \? null : onePrompt\}/.test(app) && /onePrompt\?\.open && onePrompt\.reason === 'welcome-back'/.test(app));
ok('  "See Socria One" opens the plan, as the ⋯ menu does; "Not now" counts as a dismissal', /onSee: \(\) => \{\s*acceptPrompt\(\);\s*askOne\(\);/.test(app) && /onLater: dismissPrompt/.test(app));
ok('it is asked for once a visit, on the Universal Map with nothing else on screen — its rules decide', /<WelcomeBack\s+ready=\{!!isSignedIn && planKnown && !one && homeShown && !hydrating && firstRun\.synced && !introWanted && !whatsNewShown && !busy && !oneOpen && !acctOpen && !guideOpen\}/.test(app));
ok('cards never over the welcome, a sheet, the tour, AR Mode, search, Voice’s sheets, big-screen mode or a guest\'s card', /hidden=\{\s*introWanted \|\| whatsNewShown \|\| guideOpen \|\| oneOpen \|\| !!onePrompt\?\.open \|\| acctOpen \|\| captureOpen \|\| tourOpen \|\| arOpen \|\| !!searchOpen \|\| !!voiceSheet \|\| togetherReadOnly \|\| cabin \|\| guestWall/.test(app));
ok('  and none begins while an answer is arriving', /quiet=\{busy \|\| !!streaming \|\| hydrating \|\| organizing \|\| sortPending\}/.test(app));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
