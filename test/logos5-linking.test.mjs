// LOGOS 5 — LINKING THE CONVERSATION AND THE MAP, BOTH WAYS.
//
// lib/logos5/linking.ts reads which of the person's messages a card came
// from, and which cards a turn made, from what every saved conversation
// already has: the map's change record and the person's own words. Held down
// here: the record wins; a change belongs to the latest message sent before
// it, never a later one; the reply under that message carries the effect;
// words link only above a threshold and to at most two messages; a card the
// map no longer has is never linked; nothing is invented for a card with no
// evidence.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'logos5-linking');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({ entryPoints: { linking: join(root, 'lib/logos5/linking.ts') }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error' });
const L = await import(pathToFileURL(join(OUT, 'linking.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const J = JSON.stringify;

const msgs = [
  { id: 'u1', at: 1000, role: 'user', content: 'I have two job offers and I keep going back and forth. One pays more, the other has a better team.' },
  { id: 'a1', at: 1500, role: 'assistant', content: 'Which one would make you leave if the other were missing?' },
  { id: 'u2', at: 3000, role: 'user', content: 'Honestly the team. I learn fastest around people who are better than me.' },
  { id: 'a2', at: 3500, role: 'assistant', content: 'Then growth is the value under this.' },
  { id: 'u3', at: 6000, role: 'user', content: 'remove the salary card' },
  { id: 'a3', at: 6001, role: 'assistant', content: 'Removed “Salary”.' },
];
const nodes = [
  { id: 'n1', label: 'Two job offers' },
  { id: 'n2', label: 'Better team' },
  { id: 'n3', label: 'Learning fastest from better people' },
  { id: 'n4', label: 'Growth matters more than pay' },
  { id: 'n9', label: 'Retirement' },
];
const history = {
  since: 900,
  base: [],
  changes: [
    { at: 1800, cause: 'turn', added: [{ id: 'n1', label: 'Two job offers' }, { id: 'n2', label: 'Better team' }, { id: 'gone', label: 'Salary' }], removed: [], renamed: [] },
    { at: 3900, cause: 'turn', added: [{ id: 'n3', label: 'Learning fastest from better people' }], removed: [], renamed: [{ id: 'n2', from: 'Team', to: 'Better team' }] },
    { at: 6002, cause: 'edit', added: [], removed: [{ id: 'gone', label: 'Salary' }], renamed: [] },
  ],
};

console.log('\n=== the record links cards to the turn before them ===');
{
  const { fromNode, fromMsg } = L.linksOf(msgs, nodes, history);
  ok('a card added after the first message belongs to it', J(fromNode.get('n1')) === J(['u1']), J(fromNode.get('n1')));
  ok('a card added, then reworded on a later turn, belongs to both, in order', J(fromNode.get('n2')) === J(['u1', 'u2']), J(fromNode.get('n2')));
  ok('a change never belongs to a message sent after it', !fromNode.get('n3')?.includes('u3'));
  ok('the person’s message lists the cards its turn made', J(fromMsg.get('u1')) === J(['n1', 'n2']), J(fromMsg.get('u1')));
  ok('…and so does Socria’s reply under it', J(fromMsg.get('a1')) === J(['n1', 'n2']), J(fromMsg.get('a1')));
  ok('a card the map no longer has is never linked', !fromMsg.get('u1').includes('gone') && !fromNode.has('gone'));
}

console.log('\n=== words stand in where the record does not reach ===');
{
  const { fromNode } = L.linksOf(msgs, nodes, history);
  ok('a card outside the record whose words only Socria said is not linked', !fromNode.has('n4'), J(fromNode.get('n4')));
  const noRecord = L.linksOf(msgs, nodes, null);
  ok('with no record at all, “Two job offers” finds the message that said it', J(noRecord.fromNode.get('n1')) === J(['u1']), J(noRecord.fromNode.get('n1')));
  ok('“Learning fastest from better people” finds u2, not u1', J(noRecord.fromNode.get('n3')) === J(['u2']), J(noRecord.fromNode.get('n3')));
  ok('a card with no evidence is not linked: nothing invented', !noRecord.fromNode.has('n9'));
  ok('words never link Socria’s replies (only the person’s words are evidence)', ![...noRecord.fromNode.values()].flat().some((id) => id.startsWith('a')));
  const many = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, at: i, role: 'user', content: 'the better team matters' }));
  ok('words link at most two messages', L.linksOf(many, [{ id: 'x', label: 'Better team' }], null).fromNode.get('x').length === 2);
  ok('a one-word label links by words only when the word is long enough to mean something', !L.linksOf([{ id: 'q', at: 1, role: 'user', content: 'what about pay' }], [{ id: 'p', label: 'Pay' }], null).fromNode.has('p'));
}

console.log('\n=== the words themselves ===');
{
  ok('case, accents and plurals are folded', J(L.wordsOf('Café Teams')) === J(['cafe', 'team']));
  ok('stopwords carry nothing', L.wordsOf('the and of with').length === 0);
  ok('overlap is the share of the label found', L.overlap('better team culture', 'a better team') > 0.6 && L.overlap('better team culture', 'a better team') < 0.7);
}

console.log('\n=== what a reply says it did ===');
{
  const live = new Set(nodes.map((n) => n.id));
  const e1 = L.turnEffect('a1', msgs, history, live);
  ok('the first reply added two live cards (the removed one is not counted)', J(e1) === J({ added: ['n1', 'n2'], renamed: [] }), J(e1));
  const e2 = L.turnEffect('a2', msgs, history, live);
  ok('the second added one and reworded one', J(e2) === J({ added: ['n3'], renamed: ['n2'] }), J(e2));
  ok('the effect line, in words', L.effectSaid(2, 0) === '+2 on the map' && L.effectSaid(1, 1) === '+1 on the map · 1 reworded' && L.effectSaid(0, 2) === '2 cards reworded' && L.effectSaid(0, 0) === null);
  ok('a reply with no record says nothing', J(L.turnEffect('a1', msgs, null)) === J({ added: [], renamed: [] }));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
