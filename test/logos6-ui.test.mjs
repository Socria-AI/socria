// Logos 6, phases 2–5 as the person meets them: the challenge card, Focus, the sources cards, Guess first, what a
// Project rests on — rendered — and the wiring that reaches them: links to one idea, the Universal Map's idea chips
// and doors, Logic Map and Focus in the space, Add as idea, the Project home a press away, words that check and
// compare, Simpler / Deeper, Explain it back, and Explore's challenge folded into the engine.

import {
  ChallengeCard, ChallengePending, Focus, CheckCard, CompareCard, GuessFirst, SourcesPending, foundationsAcross, projectReadingKey, sanitizeMap, applyMapEdits,
} from './.tmp/logos6-ui-under-test.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const html = (el) => renderToStaticMarkup(el);
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const MAP = sanitizeMap({
  nodes: [
    { id: 'g', type: 'goal', label: 'Profitable within a year' },
    { id: 'd', type: 'decision', label: 'Launch a paid pilot with schools' },
    { id: 'a', type: 'assumption', label: 'Schools will pay from week two' },
    { id: 'r', type: 'constraint', label: 'Four months of runway' },
    { id: 'k', type: 'assumption', label: 'Your plan needs schools to pay early', origin: 'socria', finding: { kind: 'assumption', from: 'ch_1' } },
  ],
  edges: [
    { from: 'a', to: 'd', relation: 'supports' },
    { from: 'd', to: 'g', relation: 'leads_to' },
    { from: 'r', to: 'd', relation: 'conflicts' },
    { from: 'd', to: 'k', relation: 'depends' },
  ],
}, { trust: 'stored' });

console.log('=== the challenge card: the house system, not a widget ===');
{
  const c = {
    id: 'ch_1', at: 1, scope: { kind: 'line' }, holds: false,
    checked: { turns: 3, ideas: 5, files: 1, earlier: 0 },
    findings: [
      { id: 'f1', kind: 'assumption', text: 'Your plan needs schools to pay from week two.', anchors: [{ from: 'said', ref: 'u1', quote: "We'll charge from week two" }], matters: 'The hiring date moves.', settle: 'Ask three schools.', confidence: 'high', target: 'a', by: 'structure' },
      { id: 'f2', kind: 'risk', text: 'Runway runs out before the pilot pays.', anchors: [{ from: 'idea', ref: 'r', quote: 'Four months of runway' }], confidence: 'medium', by: 'model' },
      { id: 'f3', kind: 'alternative', text: 'Teachers may love demos and still not buy.', anchors: [{ from: 'said', ref: 'u2', quote: 'teachers love the tool' }], confidence: 'low', question: true, by: 'model' },
      { id: 'f4', kind: 'evidence', text: 'Nothing shows districts budget for it.', anchors: [{ from: 'source', ref: 'A1.1', quote: 'districts set budgets once a year', doc: 'docA', block: 'p1.1' }], confidence: 'medium', by: 'model' },
    ],
    taken: { f2: 'dismissed' },
  };
  const m = html(h(ChallengeCard, { challenge: c, onAct() {}, onAnchor() {} }));
  const t = text(m);
  ok('the house label, and what was checked', /class="l5-label">Worth checking/.test(m) && /this conversation · 5 ideas · 1 file/.test(t));
  ok('the finding, then its kind and the words it rests on, in one quiet line', /Your plan needs schools to pay from week two\./.test(t) && /Hidden assumption · “We'll charge from week two”/.test(t), t.slice(0, 300));
  ok('actions are words, not pills: Keep on map, Dismiss, Discuss', /Keep on map/.test(t) && /Dismiss/.test(t) && /Discuss/.test(t) && (m.match(/class="l5-link is-meta/g) ?? []).length >= 6);
  ok('no filled control in the card (Send is the surface’s one)', !/is-primary|l5-btn/.test(m));
  ok('why it matters and how to settle it, a press away', !/If it’s wrong/.test(t) && /More/.test(t) && /aria-expanded="false"/.test(m));
  ok('a dismissed one, quiet and said so', /class="l6-row is-out"/.test(m) && /Dismissed/.test(t));
  ok('three at first, the rest a press away', /1 more/.test(t) && !/districts budget/.test(t));
  ok('numbers are plain type, never badges', /class="l6-n"/.test(m) && !/badge/.test(m));
  const held = text(html(h(ChallengeCard, { challenge: { ...c, findings: [], holds: true, why: 'Each step follows from what you said.', weakest: 'The timeline is tight.' }, onAct() {} })));
  ok('"This holds up" is an answer, in a sentence', /This holds up on what’s here\./.test(held) && /Weakest point, and it’s minor: The timeline is tight\./.test(held));
  ok('read-only: nothing to press but the quotes', !/Keep on map/.test(text(html(h(ChallengeCard, { challenge: c, onAct() {}, readOnly: true })))));
  ok('structure only, said so', /No model answered/.test(text(html(h(ChallengeCard, { challenge: { ...c, structural: true }, onAct() {} })))));
  ok('while it is on its way, one quiet line', /Checking this card…/.test(text(html(h(ChallengePending, { scope: 'card' })))));
  ok('no scores, no alarms', !/\/\s*100|score|warning|error/i.test(t));
}

console.log('\n=== Focus: the app’s sheet ===');
{
  const props = { map: MAP, id: 'd', line: 'Launch decision', project: 'Socria pilot', onIdea() {}, onClose() {}, onProject() {}, onLine() {}, onChallenge() {}, onSimpler() {}, onDeeper() {}, onShowOnMap() {}, onCopyLink() {}, came: { said: 'We will launch a paid pilot', id: 'u1' }, onCame() {}, findings: [{ kind: 'risk', text: 'Runway runs out first.', state: 'kept' }], evidence: [{ key: 'A1.1', name: 'District budgets report', quote: 'districts set budgets once a year', doc: 'docA', block: 'p1.1', verdict: 'contradicted' }] };
  const m = html(h(Focus, props));
  const f = text(m);
  ok('the One sheet’s parts: dimmed page, sheet, bare ×, serif title', /class="os-scrim l6-focus"/.test(m) && /class="os-back"/.test(m) && /class="os-sheet is-wide l6f-sheet"/.test(m) && /os-x/.test(m) && /class="os-title l6f-title"/.test(m));
  ok('where it sits: Project / Line, as words', /Socria pilot \/ Launch decision/.test(f), f.slice(0, 120));
  ok('the kind as the house label over the idea', /class="l5-label">Decision</.test(m) && /Launch a paid pilot with schools/.test(f));
  ok('rows: rests on, builds on it, pulls against it', /Rests on Schools will pay from week two/.test(f) && /Builds on it Profitable within a year/.test(f) && /Pulls against it Four months of runway/.test(f));
  ok('its sources, with what checking found', /In your sources “districts set budgets once a year” District budgets report, A1\.1 · says otherwise/.test(f));
  ok('findings about it, and what became of them', /Worth checking Runway runs out first\. Decision risk · on your map/.test(f));
  ok('the turn it came from', /Came from “We will launch a paid pilot”/.test(f));
  ok('one filled control, Challenge it; the rest are words', (m.match(/l5-btn is-primary/g) ?? []).length === 1 && /Challenge it/.test(f) && /Simpler/.test(f) && /Deeper/.test(f) && /Show on the Logic Map/.test(f) && /Copy link/.test(f));
  ok('a dialog, closed by Escape', /role="dialog"/.test(m) && /Escape/.test(read('components/logos6/Focus.tsx')));
  ok('a card no longer there: nothing', html(h(Focus, { ...props, id: 'gone' })) === '');
  ok('no seventh renderer: lists, read through support.ts', /from '@\/lib\/logos6\/support'/.test(read('components/logos6/Focus.tsx')) && !/<svg|canvas/i.test(read('components/logos6/Focus.tsx')));
}

console.log('\n=== the sources cards, and Guess first ===');
{
  const ck = { id: 'sc_1', at: 1, docs: 2, results: [
    { id: 'c1', claim: 'Districts budget once a year.', verdict: 'supported', passage: { key: 'A1.1', doc: 'docA', block: 'p1.1', name: 'District budgets report', quote: 'districts set budgets once a year' }, why: 'The passage says this.', by: 'words', node: 'a' },
    { id: 'c2', claim: 'The pilot converts in six weeks.', verdict: 'not-found', why: 'None of the passages says this.', by: 'words' },
  ] };
  const cm = html(h(CheckCard, { check: ck, onOpen() {}, onLink() {} }));
  const t = text(cm);
  ok('each claim, and what the sources say of it', /Supported/.test(t) && /Not in your sources/.test(t) && /2 claims · 2 documents/.test(t));
  ok('the passage quoted, its document and key after it', /“districts set budgets once a year” District budgets report, A1\.1/.test(t));
  ok('a claim that is a card can be linked to it, as a word', /Link to the card/.test(t) && !/l5-btn/.test(cm));
  ok('wording only, said so', /Matched by wording only/.test(text(html(h(CheckCard, { check: { ...ck, wordsOnly: true } })))));
  const cp = { id: 'dc_1', at: 1, docs: [{ doc: 'docA', name: 'District budgets report' }, { doc: 'docB', name: 'Pilot survey' }], pairs: [
    { id: 'd1', kind: 'populations', about: 'How often schools buy', because: 'Public districts against private schools.', a: { key: 'A1.1', doc: 'docA', block: 'p1.1', name: 'District budgets report', quote: 'districts set budgets once a year' }, b: { key: 'B1.2', doc: 'docB', block: 'p1.2', name: 'Pilot survey', quote: 'all of which bought software monthly' }, by: 'model' },
  ] };
  const c2 = text(html(h(CompareCard, { compare: cp, onOpen() {}, onAct() {} })));
  ok('where they disagree, both passages quoted', /Where your sources disagree/.test(c2) && /districts set budgets once a year/.test(c2) && /all of which bought software monthly/.test(c2));
  ok('the kind, and that both can hold', /Different people or places · both can hold/.test(c2));
  ok('never a winner', !/is right|is wrong|more reliable|trust/.test(c2));
  ok('nothing found, said plainly', /don’t contradict each other/.test(text(html(h(CompareCard, { compare: { ...cp, pairs: [] } })))));
  ok('while reading, one quiet line', /Reading your documents side by side/.test(text(html(h(SourcesPending, { what: 'compare' })))));
  const g = text(html(h(GuessFirst, { options: [{ id: 'a', label: 'Schools will pay from week two' }, { id: 'd', label: 'Launch a paid pilot' }], onGuess() {}, onSkip() {} })));
  ok('Guess first: their guess as words, or skip', /Which part do you think is weakest\?/.test(g) && /Skip and show me/.test(g) && /Schools will pay from week two/.test(g));
}

console.log('\n=== what a Project rests on ===');
{
  const chat = (id, updatedAt, nodes, edges) => ({ id, updatedAt, map: sanitizeMap({ nodes, edges }, { trust: 'stored' }) });
  const f = foundationsAcross([
    chat('c1', 2, [{ id: 'a', type: 'assumption', label: 'Schools pay from week two' }, { id: 'd', type: 'decision', label: 'Pilot' }], [{ from: 'a', to: 'd', relation: 'supports' }]),
    chat('c2', 3, [{ id: 'x', type: 'assumption', label: 'Schools pay from week two' }, { id: 'h', type: 'claim', label: 'Hire in March' }, { id: 'e', type: 'evidence', label: 'Survey' }], [{ from: 'x', to: 'h', relation: 'supports' }, { from: 'e', to: 'h', relation: 'supports' }]),
    chat('c3', 1, [{ id: 'q', type: 'claim', label: 'Price at $12' }, { id: 'z', type: 'idea', label: 'Launch' }, { id: 'v', type: 'evidence', label: 'Interviews' }], [{ from: 'q', to: 'z', relation: 'supports' }, { from: 'v', to: 'q', relation: 'supports' }]),
  ]);
  ok('the foundation two conversations lean on, first', f[0].label === 'Schools pay from week two' && f[0].where.length === 2, JSON.stringify(f));
  ok('…with nothing under it in either', f[0].unsupported === true);
  ok('a supported foundation, said so', f.find((x) => x.label === 'Price at $12')?.unsupported === false);
  ok('each points at its card in its conversation', f[0].where.some((w) => w.chat === 'c2' && w.node === 'x'));
  ok('nothing that rests on nothing', !f.some((x) => x.label === 'Hire in March'));
  ok('its reading kept on the device under a Socria key', projectReadingKey('p1') === 'socria.l6.project.v1:p1');
  const home = read('components/projects/ProjectHome.tsx');
  ok('the Project home shows it, and opens the idea', /What this Project rests on/.test(home) && /onOpenIdea\(f\.where\[0\]\.chat, f\.where\[0\]\.node\)/.test(home));
  ok('…and keeps its last reading', /localStorage\.setItem\(projectReadingKey\(id\)/.test(home));
  ok('the chat page opens that idea in Focus', /onOpenIdea=\{\(chatId, nodeId\) => window\.location\.assign\(`\/chat\?s=\$\{encodeURIComponent\(chatId\)\}&n=\$\{encodeURIComponent\(nodeId\)\}`\)\}/.test(read('app/chat/page.tsx')));
}

console.log('\n=== a passage kept on a card ===');
{
  const out = applyMapEdits(MAP, [{ op: 'evidence', id: 'a', evidence: [{ doc: 'docA', block: 'p1.1', quote: 'districts set budgets once a year', verdict: 'contradicted' }] }]);
  const a = out.map.nodes.find((n) => n.id === 'a');
  ok('linked: the pointer, the words, the verdict', a.evidence?.[0]?.doc === 'docA' && a.evidence[0].verdict === 'contradicted', JSON.stringify(a));
  const again = applyMapEdits(out.map, [{ op: 'evidence', id: 'a', evidence: [{ doc: 'docA', block: 'p1.1', quote: 'districts set budgets once a year', verdict: 'supported' }] }]);
  ok('the same passage again replaces, never doubles', again.map.nodes.find((n) => n.id === 'a').evidence.length === 1 && again.map.nodes.find((n) => n.id === 'a').evidence[0].verdict === 'supported');
  ok('a card not there is refused', applyMapEdits(MAP, [{ op: 'evidence', id: 'nope', evidence: [{ doc: 'd', block: 'b', quote: 'q q q' }] }]).refused.length === 1);
}

console.log('\n=== the wiring ===');
{
  const app = read('components/LogosApp.tsx');
  const uni = read('components/logos5/Universe.tsx');
  const parts = read('components/logos5/UniverseParts.tsx');
  const bubbles = read('components/logos5/UniverseBubbles.tsx');
  const space = read('components/logos5/L5Space.tsx');
  const comp = read('components/LogosComposer.tsx');
  ok('a link to one idea: /chat?s=…&n=…, opened in Focus', /const nq = q\.get\('n'\)/.test(app) && /pendingIdeaRef\.current = \{ sid: target, node: wantedNode, door: 'link' \}/.test(app) && /openFocus\(p\.node, p\.door\)/.test(app));
  ok('an idea chip on the Universal Map opens its idea', /onOpenIdea=\{L6\.links \? \(id, node\) => openIdeaFrom\(id, node, 'chip'\)/.test(app) && /onIdea: onOpenIdea && previewTile\.kind === 'logos'/.test(uni) && /className="l5h-chip is-link"/.test(parts));
  ok('the map’s doors are told apart', /acts\.onOpen\(id, 'pinch'\)/.test(bubbles) && /acts\.onOpen\(id, 'double'\)/.test(bubbles) && /acts\.onOpen\(cur, 'enter'\)/.test(bubbles) && /l6track\('conversation_opened', \{ door \}\)/.test(app));
  ok('a touch pinch dives in too', /ONE SPACE, BY TOUCH TOO/.test(bubbles));
  ok('the map’s search comes back on "/"', /setFindOpen\(true\)/.test(uni) && /\(!startable \|\| findOpen \|\| !!query\)/.test(uni));
  ok('the space: the Logic Map and Focus a press away', /onLogicMap\?: \(\) => void/.test(space) && /onFocusIdea\(picked\)/.test(space) && /onLogicMap=\{\(\) => \{/.test(app));
  ok('Add as idea: Alt+Enter or the word under the box, no reply', /e\.key === 'Enter' && e\.altKey && onAddIdea/.test(comp) && /Add as idea/.test(comp) && /onAddIdea: addIdea/.test(app) && /hand: true \} \}\]\);\s*if \(!done\) return;\s*setInput\(''\);\s*l6track\('idea_added'/.test(app));
  ok('the Project home, a press away from a filed line', /label: 'Project home'/.test(app));
  ok('Focus from the card’s popover', /label: 'Focus', text: '', run: \(\) => \{ close\(\); openFocus\(node\.id, 'card'\); \}/.test(app));
  ok('words that check and compare, read before anything is sent', /compareAsked\(content\)/.test(app) && /checkAsked\(content\)/.test(app));
  ok('Simpler / Deeper on the latest reply and on an idea', /simplerDeeper\('simpler', null, 'reply'\)/.test(app) && /simplerDeeper\('deeper', ref, 'idea'\)/.test(app));
  ok('Explain it back: "so basically", the explain planner’s teach-back', /setInput\(`So basically, /.test(app));
  ok('Guess first: on a line of study, before the challenge', /if \(L6\.guessFirst && learningLine\(\) && guessOptions\(\)\.length >= 2\)/.test(app));
  ok('Explore’s Challenge is the engine’s (Phase 5)', /if \(mode === 'challenge' && L6\.challenge\)/.test(app));
  ok('Focus opens over the conversation as the app’s sheet, never a new panel', /\{focusEl\}/.test(app) && /className="os-scrim l6-focus"/.test(read('components/logos6/Focus.tsx')));
  ok('the offers over the box are words, not chips', /className="l6-offer"/.test(app) && !/className="l6-chip/.test(app));
  ok('Simpler and Deeper sit in the reply’s own row', /extra: \(/.test(app) && /\{p\.extra\}/.test(read('components/logos5/L5Message.tsx')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
