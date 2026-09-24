// Does it remember you in the NEXT chat? The whole feature, end to end.
//
// THE REPORT: "name is pradeep" → "Got it, Pradeep." A new conversation later:
// "u know my name?" → "I don't know your name." And "what do you know abt me"
// → "Not much."
//
// WHAT THIS SUITE IS. Every other mind test checks one stage. This one runs
// the stages in the order a person does: conversation one writes, the graph
// persists, conversation two reads — and then asserts what actually reaches
// the prompt, which is the only thing a person ever experiences. It uses the
// pure pipeline (applyCandidates → activate → render), so it needs no database
// and no key, and it fails for exactly the reasons the live product would.
//
// THE TWO FAILURES IT PINS, both of which shipped:
//
//   1. ASSOCIATION CANNOT INTRODUCE. Retrieval lights what a message touches.
//      You do not mention your own name, so nothing ever lit it. The standing
//      profile travels on every turn instead.
//   2. THE EXTRACTOR IS A MODEL, AND MODELS SKIP SHORT TURNS. A name is
//      written by a regex now, so it does not depend on a model deciding a
//      five-word message was worth remembering.

import { applyCandidates } from './.tmp/apply.mjs';
import { activate } from './.tmp/activate.mjs';
import { renderMindGraph } from './.tmp/serialize.mjs';
import { standingProfile, renderProfile, nameFrom, nameCandidate } from './.tmp/self.mjs';
import { EMPTY_GRAPH } from './.tmp/types.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const DAY = 86_400_000;
const T1 = 1_750_000_000_000;      // conversation one
const T2 = T1 + 3 * DAY;           // conversation two, three days later

let seq = 0;
const apply = (graph, nodes, conversationId, now) =>
  applyCandidates(graph, nodes, [], {
    now,
    nextId: () => `n${seq++}`,
    budget: { nodes: 12, edges: 12 },
    provenance: { surface: 'core', conversationId },
  });

/** What a turn in conversation one would write, including the regex-written name. */
function turnOne() {
  const said = 'name is pradeep, I am a freshman at UT Austin and I am applying to McCombs BHP';
  const fromRegex = nameFrom(said);
  const candidates = [
    // What the extractor would return for the rest of that message.
    { type: 'Organization', label: 'UT Austin', content: 'Where they study — first year.', kind: 'stated', importance: 0.7, confidence: 0.9, certainty: 0.9 },
    { type: 'Goal', label: 'McCombs BHP', content: 'They are applying to the Business Honors Program this cycle.', kind: 'stated', importance: 0.85, confidence: 0.9, certainty: 0.9 },
  ];
  if (fromRegex) candidates.unshift(nameCandidate(fromRegex));
  return apply({ ...EMPTY_GRAPH }, candidates, 'conv-1', T1).graph;
}

console.log('=== conversation one: it is written down ===');
const after1 = turnOne();
{
  ok('the name became a node', after1.nodes.some((n) => n.label === 'Pradeep'), JSON.stringify(after1.nodes.map((n) => n.label)));
  ok('  as stated, so no corroboration is owed', after1.nodes.find((n) => n.label === 'Pradeep')?.status === 'active');
  ok('  and it is not sitting in pending', !after1.pending.some((p) => /pradeep/i.test(JSON.stringify(p))));
  ok('what they are doing is there too', after1.nodes.some((n) => n.label === 'McCombs BHP'));
  ok('and where', after1.nodes.some((n) => n.label === 'UT Austin'));
}

console.log('\n=== conversation two, three days later: the questions that failed ===');
{
  // A NEW conversation id: nothing about conv-1 is in scope except the graph.
  const blockFor = (message) => {
    const sub = activate(after1, message, { now: T2, limit: 15, conversationId: 'conv-2' });
    const profile = renderProfile(standingProfile(after1, { now: T2 }));
    return profile + renderMindGraph(sub, { now: T2, maxTokens: 500 });
  };

  const name = blockFor('u know my name?');
  ok('"u know my name?" now carries the name', /Pradeep/.test(name), name.slice(0, 160));

  const aboutMe = blockFor('what do you know abt me');
  ok('"what do you know abt me" carries something', aboutMe.trim().length > 0);
  ok('  including the name', /Pradeep/.test(aboutMe));
  ok('  and what they are working on', /McCombs/.test(aboutMe));

  // THE ONE THAT MATTERS MOST, because it is how most conversations start.
  const hey = blockFor('hey');
  ok('even "hey" arrives knowing who they are', /Pradeep/.test(hey), hey.slice(0, 200));
  ok('  and what they are in the middle of', /McCombs/.test(hey));

  const unrelated = blockFor('what is the default isolation level in Postgres?');
  ok('an unrelated question still knows who is asking', /Pradeep/.test(unrelated));
  // But it does not drag the whole graph in behind it.
  ok('  without the graph piling in', unrelated.split('\n').filter((l) => l.startsWith('- ')).length <= 8, String(unrelated.split('\n').filter((l) => l.startsWith('- ')).length));
}

console.log('\n=== THE IDENTITY BLOCKER: the extractor naming them must not cost the alias ===');
{
  // The name candidate used to be SKIPPED when the extractor had already
  // produced a node with the same label — so on exactly the turns where the
  // model did its job, the self alias never existed, and the one hinge of
  // cross-chat identity was silently missing. And even when both arrived, a
  // reinforcement merged only the label, dropping the candidate's aliases.
  const extractorFirst = apply({ ...EMPTY_GRAPH }, [
    { type: 'Person', label: 'Pradeep', content: 'The person in this conversation.', kind: 'stated', importance: 0.7, confidence: 0.9, certainty: 0.9 },
  ], 'conv-a', T1).graph;
  const bothArrive = apply(extractorFirst, [nameCandidate('Pradeep')], 'conv-a', T1 + 1000).graph;
  const node = bothArrive.nodes.find((n) => n.label === 'Pradeep');
  ok('one node, not two', bothArrive.nodes.filter((n) => /pradeep/i.test(n.label)).length === 1, JSON.stringify(bothArrive.nodes.map((n) => n.label)));
  ok('and it carries the self alias', node?.aliases.some((a) => a.toLowerCase() === 'me'), JSON.stringify(node?.aliases));

  const prof = standingProfile(bothArrive, { now: T2 });
  ok('so the profile still leads with them', prof[0]?.label === 'Pradeep', JSON.stringify(prof.map((n) => n.label)));

  // And the floor: apply.ts defaults importance to exactly 0.4 when the
  // extractor does not rate a candidate, so a floor above it hid every
  // unrated fact.
  const unrated = apply({ ...EMPTY_GRAPH }, [
    { type: 'Goal', label: 'Ship in October', content: 'What they are working towards.', kind: 'stated' },
  ], 'conv-b', T1).graph;
  ok('an unrated fact still reaches the standing header',
    standingProfile(unrated, { now: T1 }).some((n) => n.label === 'Ship in October'),
    String(unrated.nodes[0]?.importance));
}

console.log('\n=== a topic mentioned once still works the old way ===');
{
  const g = apply(after1, [
    { type: 'Concept', label: 'Partial indexes', content: 'They hit a planner problem with one.', kind: 'stated', importance: 0.5, confidence: 0.8, certainty: 0.8 },
  ], 'conv-2', T2).graph;
  const sub = activate(g, 'back to partial indexes — did we settle that?', { now: T2 + DAY, limit: 15, conversationId: 'conv-3' });
  ok('naming it recalls it', sub.nodes.some((n) => n.label === 'Partial indexes'), JSON.stringify(sub.nodes.map((n) => n.label)));
}

console.log('\n=== they change their mind, and the profile follows ===');
{
  // The standing profile must not freeze somebody in an old plan.
  const moved = apply(after1, [
    { type: 'Goal', label: 'Computer Science transfer', content: 'They have decided to move from business to CS.', kind: 'stated', importance: 0.9, confidence: 0.9, certainty: 0.9, replaces: 'McCombs BHP' },
  ], 'conv-2', T2).graph;
  const prof = standingProfile(moved, { now: T2 });
  ok('the new plan is standing', prof.some((n) => n.label === 'Computer Science transfer'), JSON.stringify(prof.map((n) => n.label)));
  const old = moved.nodes.find((n) => n.label === 'McCombs BHP');
  ok('  and the old one is marked, not deleted', old && old.status !== 'active', String(old?.status));
  ok('  so it is not presented as current', !prof.some((n) => n.label === 'McCombs BHP' && n.status === 'active'));
  ok('their name is still theirs', prof.some((n) => n.label === 'Pradeep'));
}

console.log('\n=== nothing known yet means nothing claimed ===');
{
  const fresh = { ...EMPTY_GRAPH };
  ok('an empty graph produces no header', renderProfile(standingProfile(fresh, { now: T1 })) === '');
  ok('  and no subgraph', activate(fresh, 'hey', { now: T1, limit: 10 }).nodes.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
