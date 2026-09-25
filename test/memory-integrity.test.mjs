// The memory blockers found in the release-candidate audit, each measured
// against the real module rather than its docstring.
//
// Six failures, all in the seams between mechanisms that are individually
// correct:
//
//  1. PRIVACY. history.ts was handed the account-wide ledger with no scope,
//     three lines below buildProblem applying exactly that filter, so a
//     conversation the person marked off the record had its own sentence
//     quoted back into an unrelated one — under an instruction never to imply
//     surveillance. problem.ts's header says this leak was caught once before;
//     a second reader of the same array reintroduced it.
//  2. A 'tentative' claim could overwrite a stated one and stay marked active.
//     Which is worse than it sounds: a model response that simply OMITS `kind`
//     lands on 'tentative', so the widest door in the file was the open one.
//  3. After a change of position, resolveNode returned the SUPERSEDED row
//     first, so every later restatement was written into the row rendered to
//     the model as "no longer held" while the live row was never reinforced.
//  4. A tombstone blacklisted words: deleting a one-word "Python" refused a
//     later "Python performance" for ever. And deleting the name node made the
//     name unlearnable however often the person said it again — the exact bug
//     the standing profile exists to fix, made permanent by a button.
//  5. The person's own premise, restated in Socria's opening sentence, was
//     recorded as Socria's claim and read back as "Socria suggested: <their own
//     figure>" — wrong in precisely the case that line exists to answer.
//  6. "Clear Socria's memory" did not clear the Mind Graph and said it had.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMPTY_GRAPH } from './.tmp/types.mjs';
import { gate, TURN_BUDGET } from './.tmp/gate.mjs';
import { applyCandidates, forgetNode } from './.tmp/apply.mjs';
import { matchesForgotten, resolveNode } from './.tmp/resolve.mjs';
import { nameCandidate, standingProfile } from './.tmp/self.mjs';
import { sanitizeExtraction } from './.tmp/extract.mjs';
import { entryInScope } from './.tmp/problem.mjs';
import { discoverFromHistory } from './.tmp/history.mjs';
import { entriesFromSocria } from './.tmp/ledger.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

let seq = 0;
const OPTS = (conversationId, now = 1, projectId = null) => ({
  now, nextId: () => `n${++seq}`, budget: TURN_BUDGET,
  provenance: { surface: 'core', conversationId, projectId },
});
const apply = (g, nodes, conversationId, now) => applyCandidates(g, nodes, [], OPTS(conversationId, now));

// ── 1. the scope rule, and the one reader that skipped it ────────────

console.log('=== a private entry never leaves the conversation it was made in ===');
{
  const here = { conversationId: 'c-now', projectId: 'p1' };
  const e = (over) => ({ id: 'x', kind: 'claim', text: 't', owner: 'user', stance: 'asserts', basis: 'quoted', quote: 't', reason: '', status: 'active', confidence: 1, conversationId: 'c-other', projectId: null, turn: 1, createdAt: 1, updatedAt: 1, revisions: [], ...over });
  ok('its own conversation is in scope', entryInScope(e({ conversationId: 'c-now' }), here));
  ok('a private entry from another conversation is NOT',
    !entryInScope(e({ private: true }), here));
  ok('  not even inside the same Project', !entryInScope(e({ private: true, projectId: 'p1' }), here));
  ok('  and it IS in scope in its own conversation',
    entryInScope(e({ private: true, conversationId: 'c-now' }), here));
  ok('an ordinary entry in the same Project is in scope', entryInScope(e({ projectId: 'p1' }), here));
  ok('another Project is not', !entryInScope(e({ projectId: 'p2' }), here));
  ok('no Project here means no Project reach', !entryInScope(e({ projectId: 'p2' }), { conversationId: 'c-now', projectId: null }));
  ok('with no scope at all, everything passes — the callers own the rule',
    entryInScope(e({ private: true }), undefined));
}

console.log('=== and the history detectors are handed the scoped list ===');
{
  // discoverFromHistory is deliberately unscoped: it is pure arithmetic over
  // whatever it is given. The scope belongs to the caller, so that is what is
  // asserted — the predicate is imported there, not copied.
  const turn = read('lib/core4/turn.ts').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok('turn.ts imports the one rule from problem.ts', /import \{[^}]*entryInScope[^}]*\} from '\.\/problem'/.test(turn));
  ok('  and filters with it before discoverFromHistory sees anything',
    /discoverFromHistory\(\s*\[\.\.\.ledger, \.\.\.provisional\]\.filter\(\(e\) => entryInScope\(e, historyScope\)\)/.test(turn));
  // Measured end to end: the same two entries, in scope and out.
  const base = { kind: 'claim', owner: 'user', stance: 'asserts', basis: 'quoted', reason: '', confidence: 1, projectId: null, turn: 1, createdAt: 1, revisions: [] };
  const rejected = { ...base, id: 'a', text: 'keep the house if the custody split stays fifty fifty', quote: 'x', status: 'rejected', conversationId: 'c-sensitive', private: true, turn: 1, updatedAt: 1, reason: 'the mediator said it will not hold' };
  const echo = { ...base, id: 'b', text: 'keep the house if the custody split stays fifty fifty', quote: 'y', status: 'active', conversationId: 'c-work', turn: 4, updatedAt: 5 };
  const scope = { conversationId: 'c-work', projectId: null };
  const leaked = discoverFromHistory([rejected, echo], [], 10);
  const scoped = discoverFromHistory([rejected, echo].filter((e) => entryInScope(e, scope)), [], 10);
  ok('unscoped, the private entry is discoverable', leaked.length > 0, JSON.stringify(leaked));
  ok('scoped, it is not', scoped.length === 0, JSON.stringify(scoped));
}

// ── 2. register: what they did not say may not overwrite what they did ──

console.log('=== a claim they did not state cannot rewrite one they did ===');
{
  ok('a response with no `kind` is read as tentative, not inferred',
    sanitizeExtraction({ nodes: [{ type: 'Belief', label: 'Short answers', content: 'They want short answers to start.' }] }).nodes[0].kind === 'tentative');
  const stated = apply(EMPTY_GRAPH, [{ type: 'Belief', label: 'Deadlines', content: 'They said deadlines help them focus and they set their own.', kind: 'stated' }], 'c1', 1);
  const g = stated.graph;
  const v = gate({ graph: g, type: 'Belief', label: 'Deadlines', content: 'They resent deadlines; it is a fixed part of how they work.', kind: 'tentative', conversationId: 'c2', matched: true });
  ok('it may persist, marked', v.pass === true && v.status === 'tentative');
  ok('  and it may NOT rewrite', v.mayRewrite === false, JSON.stringify(v));
  const after = apply(g, [{ type: 'Belief', label: 'Deadlines', content: 'They resent deadlines; it is a fixed part of how they work and always has been.', kind: 'tentative' }], 'c2', 2);
  const node = after.graph.nodes.find((n) => n.label === 'Deadlines');
  ok('their own words survive the turn', /deadlines help them focus/.test(node.content), node.content);
  ok('  and it is not silently marked active with the opposite claim in it', node.status === 'active' && !/resent/.test(node.content));
  ok('a stated claim of their own still rewrites', (() => {
    const c = apply(g, [{ type: 'Belief', label: 'Deadlines', content: 'They said again today that deadlines help them focus, and that they set every one of them themselves rather than taking one from anybody else.', kind: 'stated' }], 'c2', 3);
    return /every one of them themselves/.test(c.graph.nodes.find((n) => n.label === 'Deadlines').content);
  })());
}

// ── 3. a change of position leaves two rows; the live one wins ──────

console.log('=== a restatement lands on the live row, not the superseded one ===');
{
  let g = apply(EMPTY_GRAPH, [{ type: 'Belief', label: 'Avoids conflict', content: 'They step back from an argument rather than have it.', kind: 'stated' }], 'c1', 1).graph;
  g = apply(g, [{ type: 'Belief', label: 'Avoids conflict', content: 'They enjoy a direct argument and said so.', kind: 'stated', replaces: 'Avoids conflict' }], 'c2', 2).graph;
  const old = g.nodes.find((n) => n.status === 'superseded');
  const live = g.nodes.find((n) => n.status === 'active');
  ok('the correction leaves the old position marked superseded', !!old && !!live, JSON.stringify(g.nodes.map((n) => n.status)));
  ok('the matcher prefers the live row', resolveNode(g, { type: 'Belief', label: 'Avoids conflict', content: 'x' })?.node.id === live.id);
  const r = apply(g, [{ type: 'Belief', label: 'Avoids conflict', content: 'They enjoy a direct argument, and said so again today.', kind: 'stated' }], 'c3', 3);
  ok('  so the restatement reinforces it', r.report.nodes[0]?.id === live.id, JSON.stringify(r.report.nodes));
  const stillOld = r.graph.nodes.find((n) => n.id === old.id);
  ok('and the historical wording is left in the historical row', /step back from an argument/.test(stillOld.content), stillOld.content);
}

// ── 4. forgetting one thing is not blacklisting a word ─────────────

console.log('=== a tombstone forgets a claim, not a vocabulary ===');
{
  const tomb = ['n:concept|python'];
  ok('the same one-word label is still refused', matchesForgotten(tomb, { type: 'Concept', label: 'Python', content: 'The language.' }));
  ok('  case and spacing do not get round it', matchesForgotten(tomb, { type: 'Concept', label: ' python ', content: 'The language.' }));
  ok('a different claim that merely contains the word is not', !matchesForgotten(tomb, { type: 'Goal', label: 'Python performance', content: 'They want the parser faster.' }));
  ok('  nor another', !matchesForgotten(tomb, { type: 'Preference', label: 'Python typing', content: 'They annotate everything.' }));
  const phrase = ['n:belief|stalls when scope is open'];
  ok('a multi-word tombstone still catches the phrase', matchesForgotten(phrase, { type: 'Belief', label: 'it stalls when scope is open', content: 'a b c' }));
  ok('  and does not blacklist "scope"', !matchesForgotten(phrase, { type: 'Concept', label: 'scope', content: 'a b c' }));
}

console.log('=== a name they say again is learned again ===');
{
  let g = apply(EMPTY_GRAPH, [nameCandidate('Pradeep')], 'c1', 1).graph;
  ok('the name is learned', g.nodes.some((n) => n.label === 'Pradeep' && n.type === 'Person'));
  const gone = forgetNode(g, g.nodes[0].id, 2);
  g = gone.graph ?? gone;
  ok('the Memory page can delete it', g.nodes.length === 0 && g.tombstones.length === 1);
  const again = apply(g, [nameCandidate('Pradeep')], 'c2', 3);
  ok('THE INVARIANT: saying it again works', again.graph.nodes.some((n) => n.label === 'Pradeep'), JSON.stringify(again.report.refused));
  ok('  and it reaches the standing profile', standingProfile(again.graph, { now: 4 }).some((n) => n.label === 'Pradeep'));
  const guessed = apply(g, [{ type: 'Person', label: 'Pradeep', content: 'Their name, worked out from how a colleague addressed them.', kind: 'inferred' }], 'c2', 3);
  ok('but a GUESS at the same thing is still refused',
    !guessed.graph.nodes.some((n) => n.label === 'Pradeep'), JSON.stringify(guessed.report));
}

// ── 5. whose idea it was ───────────────────────────────────────────

console.log('=== the opening restatement is theirs, not Socria\'s ===');
{
  const ctx = { conversationId: 'c1', projectId: null, turn: 2, now: 1 };
  const user = 'My budget caps the bus programme at 40 million dollars. What else can I do?';
  const reply = 'Your budget caps the bus programme at 40 million dollars, so light rail is out of reach this cycle. The lever you have not used is the federal match, which pays 80 percent of capital cost for a corridor already in the regional plan.';
  const got = entriesFromSocria(reply, 'CONTRIBUTE', ctx, user);
  ok('exactly one claim is recorded as Socria\'s', got.filter((e) => e.kind === 'claim').length === 1, JSON.stringify(got.map((e) => e.text)));
  ok('  and it is the contribution, not their premise',
    /federal match/.test(got[0].text) && !/Your budget caps/.test(got[0].text), got[0].text);
  ok('every recorded item is owned by Socria', got.every((e) => e.owner === 'socria'));
  const echoOnly = entriesFromSocria('Your budget caps the bus programme at 40 million dollars, so light rail is out of reach this cycle.', 'CONTRIBUTE', ctx, user);
  ok('a reply that only restates them records nothing as Socria\'s', echoOnly.length === 0, JSON.stringify(echoOnly));
}

// ── 6. the button that said it had forgotten ───────────────────────

console.log('=== "clear memory" clears the memory it describes ===');
{
  const route = read('app/api/account/memory/route.ts');
  const store = read('lib/mind/store.ts');
  ok('the Mind Graph tables are named in one place',
    /export const MIND_DERIVED_TABLES = \['mind_edges', 'mind_pending', 'mind_sources', 'mind_tombstones'\]/.test(store));
  ok('the route clears them', /for \(const table of MIND_DERIVED_TABLES\)/.test(route));
  ok('  and the nodes', /from\('mind_nodes'\)\.delete\(\)/.test(route));
  ok('  keeping the Project anchors, so a Project survives', /anchors\.has\(id\)/.test(route));
  ok('  and the Projects themselves, which are their own words', !/from\('mind_projects'\)\.delete/.test(route));
  ok('a failure is still reported rather than swallowed', /failed\.push\('mind_nodes'\)/.test(route) && /status: 500/.test(route));
  ok('a table a migration has not created yet is forgiven once, in one place',
    (route.match(/function missingTable/g) ?? []).length === 1 && (route.match(/42p01/g) ?? []).length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
