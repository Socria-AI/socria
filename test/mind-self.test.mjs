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

import {
  nameFrom, aboutThem, asksName, asksRecall, selfReferential, selfNodes, nameCandidate,
  standingProfile, renderProfile, SELF_ALIAS, PROFILE_LINES,
} from './.tmp/self.mjs';
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

console.log('\n=== the standing profile: what travels on EVERY turn ===');
{
  // THE POINT. Association lights what a message touches, which is right for
  // a memory and wrong for an introduction. "Hey" in a new conversation
  // touches nothing, so nothing lights, and Socria meets somebody it knows as
  // a stranger. You do not mention your own name, so association can never
  // supply it.
  const me = mk({ id: 'p-me', type: 'Person', label: 'Pradeep', content: 'Their name.', aliases: ['me'], importance: 0.95 });
  const goal = mk({ id: 'p-goal', type: 'Goal', label: 'McCombs BHP', content: 'Applying this cycle.', importance: 0.8 });
  const pref = mk({ id: 'p-pref', type: 'Preference', label: 'Short answers', content: 'They asked for less padding.', importance: 0.6 });
  const trivia = mk({ id: 'p-triv', type: 'Event', label: 'A bad Tuesday', content: 'One meeting went badly.', importance: 0.3 });
  const old = mk({ id: 'p-old', type: 'Goal', label: 'Law school', content: 'What they used to be aiming at.', importance: 0.8, status: 'superseded' });
  const secret = mk({ id: 'p-sec', type: 'Goal', label: 'A private plan', content: 'Not for a shared screen.', importance: 0.9, private: true });
  const graph = { nodes: [trivia, goal, pref, me, old, secret] };

  const prof = standingProfile(graph, { now: T0 });
  ok('their name leads it', prof[0]?.id === 'p-me', JSON.stringify(prof.map((n) => n.label)));
  ok('what they are working on is in it', prof.some((n) => n.id === 'p-goal'));
  ok('how they asked to be dealt with is in it', prof.some((n) => n.id === 'p-pref'));
  ok('one bad Tuesday is not who they are', !prof.some((n) => n.id === 'p-triv'));
  ok('what they used to want is not presented as standing', !prof.some((n) => n.id === 'p-old'));
  ok('it is short by construction', prof.length <= PROFILE_LINES);

  // Private material never reaches a surface that can be shown to somebody.
  ok('Logos does not receive private standing facts',
    !standingProfile(graph, { now: T0, excludePrivate: true }).some((n) => n.id === 'p-sec'));
  ok('  and Core does', standingProfile(graph, { now: T0 }).some((n) => n.id === 'p-sec'));

  const block = renderProfile(prof);
  ok('the block names them', /Pradeep/.test(block));
  // The failure mode of a standing profile is a model that opens every reply
  // by reciting somebody's own name back at them.
  ok('it is told to use it, not announce it', /you do not announce it/.test(block));
  ok('  explicitly not as an opening', /Do not open by telling them what you know about them/.test(block));
  ok('  and what they say now still wins', /what they say now wins/.test(block));
  ok('an empty graph produces no header at all', renderProfile([]) === '');
}

console.log('\n=== the profile is not a hole in Project isolation ===');
{
  // CAUGHT BY projects-e2e, which is why it is pinned here too: a header that
  // travels on EVERY turn is exactly the channel by which another Project's
  // material would arrive everywhere. A Calculus tutor introduced a
  // conversation inside Socria.
  const me = mk({ id: 's-me', type: 'Person', label: 'Pradeep', content: 'Their name.', aliases: ['me'], importance: 0.95 });
  const tutor = mk({ id: 's-lin', type: 'Person', label: 'Professor Lin', content: 'Teaches the section.', importance: 0.8 });
  const theirGoal = mk({ id: 's-goal', type: 'Goal', label: 'Ship Core 4', content: 'Launching in October.', importance: 0.85 });
  const calcGoal = mk({ id: 's-calc', type: 'Goal', label: 'Pass Calc II', content: 'The exam is in May.', importance: 0.85 });
  const g = { nodes: [me, tutor, theirGoal, calcGoal] };

  const prof = standingProfile(g, { now: T0 });
  ok('somebody else’s professor is not who you are talking to', !prof.some((n) => n.id === 's-lin'), JSON.stringify(prof.map((n) => n.label)));
  ok('  because Person is reached by the self alias, not by the type', prof.some((n) => n.id === 's-me'));

  const scoped = standingProfile(g, { now: T0, elsewhere: new Set(['s-calc']) });
  ok('another Project’s goal stays in that Project', !scoped.some((n) => n.id === 's-calc'));
  ok('  while this one’s still travels', scoped.some((n) => n.id === 's-goal'));
  ok('  and their name is not Project-scoped', scoped.some((n) => n.id === 's-me'));
}

console.log('\n=== "remind me" is answered from the most recent, not from a topic ===');
{
  for (const t of ['remind me what I said', 'where did we leave off', 'what did we talk about last time', 'catch me up'])
    ok(`"${t}"`, asksRecall(t) === true);
  ok('an ordinary question is not that', asksRecall('what is the filing deadline') === false);

  const nodes = [
    mk({ id: 'r-old', label: 'Old thing', updatedAt: T0 - 90 * 86_400_000 }),
    mk({ id: 'r-new', label: 'Recent thing', updatedAt: T0 - 86_400_000 }),
  ];
  const g = { ...EMPTY_GRAPH, nodes, edges: [] };
  const back = activate(g, 'remind me where we left off', { now: T0, limit: 10 });
  ok('it recalls the most recent', back.nodes.some((n) => n.id === 'r-new'), JSON.stringify(back.nodes.map((n) => n.label)));
  // And it stays a named class, not a general fallback: a message that touches
  // nothing still recalls nothing, which is what keeps memory out of a turn
  // that did not ask for it.
  ok('an ordinary unmatched message still recalls nothing',
    activate(g, 'ok sure thanks', { now: T0, limit: 10 }).nodes.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
