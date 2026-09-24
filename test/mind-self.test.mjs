// The person themselves — the one thing the graph could not remember.
//
// THE REPORT, in three screenshots:
//   "what do you know abt me"  → "Not much unless we've talked before."
//   "name is pradeep"          → "Got it, Pradeep."
//   "u know my name?"          → "I don't know your name."
//
// TRACED. Seeding is lexical on node LABELS (activate.ts), so a node labelled
// "Pradeep" lights up only for a message containing the word "pradeep". "Do
// you know my name?" contains know, my, name. The name was IN the graph and
// unreachable by the one question that asks for it — and "what do you know
// about me" names no topic at all, so nothing seeded and `activate` returned
// an empty subgraph, which is how a graph full of somebody's material answers
// "not much".
//
// So the bug was never a missing fact. It was a missing KIND of retrieval:
// every path assumed the message names its subject, and a question about the
// person names nothing.
//
// WHY A REGEX AND NOT THE EXTRACTOR. The extractor is a model call that is
// told most turns add nothing and is given pleasantries as the example of what
// to skip — so the turn where somebody says their name is exactly the turn it
// answers {} for. A regex costs nothing, cannot be talked out of it, and
// cannot decide the turn was not worth remembering.

import { nameFrom, aboutThem, asksName, selfReferential, selfNodes, nameCandidate, SELF_ALIAS } from './.tmp/self.mjs';
import { activate } from './.tmp/activate.mjs';
import { EMPTY_GRAPH } from './.tmp/types.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const T0 = 1_750_000_000_000;
const mk = (over) => ({
  id: 'n', type: 'Concept', label: 'x', content: 'y', aliases: [], status: 'active',
  confidence: 0.8, certainty: 0.8, importance: 0.5, activation: 0.2, seen: 1, private: false,
  provenance: [{ kind: 'stated', surface: 'core', at: T0, conversationId: 'c1' }],
  createdAt: T0, updatedAt: T0, lastAccessed: T0, ...over,
});

console.log('=== a name, as people actually type one ===');
{
  // The exact message from the report, lower case and without "my".
  ok('"name is pradeep"', nameFrom('name is pradeep') === 'Pradeep', String(nameFrom('name is pradeep')));
  ok('"my name is pradeep"', nameFrom('my name is pradeep') === 'Pradeep');
  ok('two words', nameFrom('my name is Sarah Chen') === 'Sarah Chen', String(nameFrom('my name is Sarah Chen')));
  ok('"call me Dee"', nameFrom('you can call me Dee') === 'Dee');
  ok('"I go by"', nameFrom('I go by Raj at work') === 'Raj');
  ok('mid-message', nameFrom('anyway my name is Ana and I have a question') === 'Ana');
}

console.log('\n=== and everything that is NOT a name ===');
{
  // "I'm X" is deliberately not a naming form. A memory system that decides
  // somebody is called Tired is worse than one that waits to be told plainly.
  for (const t of [
    "I'm tired", "I'm a second-year", "I'm stuck on this", "I'm working on the essay",
    'my name is not important', 'I go through this every week',
    'what is the name of that library', 'the file name is wrong',
  ]) ok(`"${t}" is not a name`, nameFrom(t) === null, String(nameFrom(t)));
  ok('nothing at all', nameFrom('') === null && nameFrom('   ') === null);
}

console.log('\n=== questions whose subject is the person asking ===');
{
  // Two classes, deliberately apart. "Do you know my name?" has one honest
  // answer when no name is known; reciting the graph's most important nodes
  // at it would be a stranger failure than the one being fixed.
  for (const t of ['u know my name?', 'do you know my name', 'whats my name', 'who am i'])
    ok(`"${t}" asks what they are called`, asksName(t) === true);
  for (const t of ['what do you know abt me', 'what do you know about me', 'what do you remember about me', 'who am i'])
    ok(`"${t}" asks about them`, aboutThem(t) === true);
  for (const t of ['what do you know about postgres', 'do you know when the deadline is', 'who is the CEO of that company']) {
    ok(`"${t}" is about something else`, aboutThem(t) === false && asksName(t) === false);
  }
  ok('first person is detected separately', selfReferential('u know my name?') && !selfReferential('what is the isolation level'));
}

console.log('\n=== the node it writes ===');
{
  const c = nameCandidate('Pradeep');
  ok('it is stated, so no corroboration is owed', c.kind === 'stated');
  ok('  which is the point: they said it, nobody inferred it', /said it themselves/.test(c.content));
  ok('it carries the self alias', c.aliases.includes(SELF_ALIAS));
  ok('  and the phrasings a question uses', c.aliases.includes('my name'));
  ok('it is a Person, labelled with the name', c.type === 'Person' && c.label === 'Pradeep');
  ok('and it matters enough to survive a crowded graph', c.importance >= 0.9);
}

console.log('\n=== THE BUG: the question that could not reach the answer ===');
{
  const me = mk({ id: 'n-me', type: 'Person', label: 'Pradeep', content: 'Their name.', aliases: ['me', 'my name'], importance: 0.95 });
  const topic = mk({ id: 'n-mccombs', label: 'McCombs', content: 'The school they are applying to' });
  const g = { ...EMPTY_GRAPH, nodes: [me, topic], edges: [] };

  const asked = activate(g, 'u know my name?', { now: T0, limit: 10 });
  ok('"u know my name?" now reaches the name', asked.nodes.some((n) => n.id === 'n-me'), JSON.stringify(asked.nodes.map((n) => n.label)));

  const aboutMe = activate(g, 'what do you know abt me', { now: T0, limit: 10 });
  ok('"what do you know abt me" is no longer empty', aboutMe.nodes.length > 0, String(aboutMe.nodes.length));
  ok('  and it leads with who they are', aboutMe.nodes.some((n) => n.id === 'n-me'));

  // The other half: identity must not flood an ordinary question.
  const topical = activate(g, 'what should I say about McCombs in the essay', { now: T0, limit: 10 });
  ok('a topical question still leads with its topic', topical.nodes[0]?.id === 'n-mccombs', JSON.stringify(topical.nodes.map((n) => n.label)));

  // And a graph with no self node is unchanged — no crash, no invention.
  const bare = { ...EMPTY_GRAPH, nodes: [topic], edges: [] };
  ok('no identity known means nothing is claimed', activate(bare, 'u know my name?', { now: T0, limit: 10 }).nodes.length === 0);
  ok('  and selfNodes finds none', selfNodes([topic]).length === 0);
  ok('  while it finds the one that is there', selfNodes([me, topic]).length === 1);
}

console.log('\n=== a question about a topic is not a question about them ===');
{
  // The digest fires only for the "about me" class. Otherwise every vague
  // message would drag the six most important nodes into the prompt.
  const nodes = Array.from({ length: 8 }, (_, i) => mk({ id: `n${i}`, label: `Thing ${i}`, importance: 0.9 }));
  const g = { ...EMPTY_GRAPH, nodes, edges: [] };
  ok('a message naming nothing still recalls nothing', activate(g, 'ok sure', { now: T0, limit: 10 }).nodes.length === 0);
  ok('  but a question about them recalls the digest', activate(g, 'what do you know about me', { now: T0, limit: 10 }).nodes.length > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
