// MEMORY THAT SAYS WHERE IT CAME FROM (Logos 5 rebuild, the memory stage).
//
// "Inferences never silently become facts." Held here:
//   • a claim the extractor calls "stated" must be carried by the person's own
//     words — their half of the turn, not Socria's reply, not a file they
//     attached — or it is stored as Socria's reading (lib/mind/ground.ts);
//   • a file is never the person speaking: knowledge in it is what it is,
//     found in a source; a claim about them is tentative until they confirm;
//   • a person found in a source is held tentatively;
//   • every recalled memory says where it came from, and the line that
//     travels on every turn carries only what they said or confirmed;
//   • the person can confirm a memory, and once they have touched one only
//     they change its words — an edit keeps what it replaced;
//   • a sighting in a private conversation never waits in the ledger;
//   • the Memory page says "Confirmed" only for what they confirmed.

import { groundedIn, groundCandidates, fromFile, ownWords, stemsOf } from './.tmp/ground.mjs';
import { EMPTY_GRAPH, whereFrom } from './.tmp/types.mjs';
import { gate, TURN_BUDGET } from './.tmp/gate.mjs';
import { applyCandidates, confirmNode, touchedByThem } from './.tmp/apply.mjs';
import { evolutionOf } from './.tmp/evolve.mjs';
import { serializeSubgraph, renderMindGraph } from './.tmp/serialize.mjs';
import { standingProfile, renderProfile } from './.tmp/self.mjs';
import * as A from './.tmp/memoryAtlas.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
const T0 = 1_700_000_000_000;
let seq = 0;
const OPTS = (over = {}) => ({ now: T0, nextId: () => `g${++seq}`, budget: TURN_BUDGET, provenance: { surface: 'logos', conversationId: 'c1' }, ...over });
const C = (type, label, content, kind = 'stated', extra = {}) => ({ type, label, content, kind, ...extra });
const turn = (said, reply = 'Noted.') => `User: ${said}\n\nSocria: ${reply}`;

console.log('\n=== their words, and only theirs ===');
{
  ok('the person’s half of the turn, without the reply', ownWords(turn('I love sailing', 'You love sailing and chess.')) === 'I love sailing');
  ok('…and without the text of a file they attached', ownWords('User: here are my notes\n\n[File they attached “cv.pdf” — their own notes]\nExpert in Rust\n\nSocria: ok') === 'here are my notes');
  ok('stems meet a paraphrase halfway: working → work, studies → study', stemsOf('working studies liked').join(' ') === 'work study lik' || stemsOf('working studies').join(' ') === 'work study', stemsOf('working studies liked').join(' '));
  ok('a claim their words carry is grounded', groundedIn({ label: 'Vegetarian', content: 'They are vegetarian' }, 'I’m vegetarian, so no meat please'));
  ok('…by most of its name, or two words of its content', groundedIn({ label: 'Morning runs', content: 'They run every morning before work' }, 'I go for a run every morning'));
  ok('a claim their words do not carry is not', !groundedIn({ label: 'Night owl', content: 'They do their best work late at night' }, 'Can you help me with my essay?'));
  ok('a claim that only Socria’s reply carries is not theirs', !groundedIn({ label: 'Loves chess', content: 'They love chess' }, ownWords(turn('I love sailing', 'You love sailing and chess.'))));
  ok('the same words with a "not" are a different claim', !groundedIn({ label: 'Vegetarian', content: 'They are vegetarian' }, 'I am not vegetarian at all'));
  ok('…and a negated claim needs a negation in their words', !groundedIn({ label: 'Not a morning person', content: 'They are not a morning person' }, 'I am a morning person') && groundedIn({ label: 'Not a morning person', content: 'They are not a morning person' }, 'honestly I am not a morning person'));
  ok('nothing said grounds nothing', !groundedIn({ label: 'Anything', content: 'Something at all' }, ''));
  ok('one word or two: "longterm" grounds "long-term", and the reverse', groundedIn({ label: 'long-term entrepreneurship', content: 'Wants to be an entrepreneur in the long term.' }, 'want to be an entrepreneur longterm') && groundedIn({ label: 'Longterm plan', content: 'A plan for the long term' }, 'my long term plan'));
}

console.log('\n=== a turn’s candidates, held to their words ===');
{
  const nodes = [
    C('Preference', 'Short answers', 'They want short answers', 'stated'),
    C('Belief', 'Distrusts experts', 'They distrust expert opinion', 'stated'),
    C('Goal', 'Run a marathon', 'They plan to run a marathon', 'tentative'),
    C('Person', 'Pradeep', 'Their name', 'stated', { restated: true }),
    C('Concept', 'Compound interest', 'Interest earned on interest', 'inferred'),
  ];
  const edges = [{ sourceLabel: 'Distrusts experts', targetLabel: 'Short answers', relationship: 'supports', kind: 'stated' }];
  const g = groundCandidates(nodes, edges, turn('please keep answers short — and my name is Pradeep', 'Sure. You distrust experts, so I will cite sources.'));
  const kindOf = (l) => g.nodes.find((n) => n.label === l)?.kind;
  ok('a stated claim in their words stays stated', kindOf('Short answers') === 'stated');
  ok('a stated claim only Socria said becomes Socria’s reading', kindOf('Distrusts experts') === 'inferred' && g.downgraded.includes('Distrusts experts'), J(g.downgraded));
  ok('a tentative claim not in their words is a reading too (a model that left kind out)', kindOf('Run a marathon') === 'inferred');
  ok('the name read from their own sentence is theirs already', kindOf('Pradeep') === 'stated');
  ok('what was already a reading is left alone', kindOf('Compound interest') === 'inferred');
  ok('an edge is no surer than its ends', g.edges[0].kind === 'inferred');
  // and the gate then holds the reading back, as it holds every inference about the person
  const v = gate({ type: 'Belief', label: 'Distrusts experts', content: 'They distrust expert opinion', kind: 'inferred', graph: EMPTY_GRAPH, conversationId: 'c1' });
  ok('…so the gate holds it for a second conversation instead of believing it', !v.pass && v.reason === 'generalisation-needs-second-sighting', J(v));
}

console.log('\n=== a file is not the person speaking ===');
{
  const f = fromFile(
    [
      C('Concept', 'Accrual accounting', 'Revenue is recorded when earned, not when paid', 'stated'),
      C('Concept', 'Perfectionism', 'They struggle with perfectionism', 'stated'),
      C('Goal', 'Graduate early', 'They want to graduate a semester early', 'stated'),
      C('Event', 'Exam 2', 'Exam 2 is on October 30', 'stated'),
      C('Person', 'Dr. Lee', 'Teaches the course', 'stated'),
    ],
    [
      { sourceLabel: 'Graduate early', targetLabel: 'Exam 2', relationship: 'depends_on', kind: 'stated' },
      { sourceLabel: 'Accrual accounting', targetLabel: 'notes.txt', relationship: 'derived_from', kind: 'stated' },
    ]
  );
  const k = (l) => f.nodes.find((n) => n.label === l)?.kind;
  ok('knowledge in it is what it is: found in a source', k('Accrual accounting') === 'researched');
  ok('a "concept" that is about them is a claim about them — tentative', k('Perfectionism') === 'tentative');
  ok('a claim about the person is kept, tentative — never stated', k('Graduate early') === 'tentative');
  ok('something that happened, as the file says it, is unchanged', k('Exam 2') === 'stated');
  ok('a person named in it, too', k('Dr. Lee') === 'stated');
  ok('an edge to a claim about them is tentative with it', f.edges[0].kind === 'tentative');
  ok('that a claim came from this file stays stated', f.edges[1].kind === 'stated');
  const g = applyCandidates(EMPTY_GRAPH, f.nodes, [], OPTS({ provenance: { surface: 'file', sourceNodeId: 'src-node' } })).graph;
  const st = (l) => g.nodes.find((n) => n.label === l)?.status;
  ok('…so a file’s claim about them lands tentative, never active', st('Graduate early') === 'tentative', J(g.nodes.map((n) => [n.label, n.status])));
  ok('…and the knowledge lands active, marked as from a source', st('Accrual accounting') === 'active' && whereFrom(g.nodes.find((n) => n.label === 'Accrual accounting')) === 'file');
  const ingest = read('lib/mind/ingest-text.ts');
  ok('file ingestion holds its candidates to this before any register decides them', /const read = fromFile\(nodes, edges\);/.test(ingest) && /applyCandidates\(withSource, read\.nodes, read\.edges/.test(ingest));
  ok('…and names the Source NODE the claim came from, so the inspector can list the file', /provenance: \{ surface: 'file', sourceNodeId: sourceNode\.id \}/.test(ingest) && !/sourceNodeId: sourceId/.test(ingest));
  const pipe = read('lib/mind/pipeline.ts');
  ok('every turn’s candidates are grounded before they are applied', /groundCandidates\(extracted\.nodes, extracted\.edges, text\)/.test(pipe) && /opts\.surface === 'file'\s*\? fromFile/.test(pipe));
}

console.log('\n=== a person found in a source is held lightly ===');
{
  const v = gate({ type: 'Person', label: 'Jane Doe', content: 'A researcher at a lab who wrote the paper', kind: 'researched', graph: EMPTY_GRAPH, conversationId: 'c1' });
  ok('a person a search turned up is tentative', v.pass && v.status === 'tentative', J(v));
  const e = gate({ type: 'Evidence', label: 'Vacancy rate', content: 'City vacancy fell to two percent last year', kind: 'researched', graph: EMPTY_GRAPH, conversationId: 'c1' });
  ok('evidence from a source is not', e.pass && e.status === 'active', J(e));
}

console.log('\n=== where it came from, said in the prompt ===');
{
  const node = (id, label, provenance, extra = {}) => ({ id, type: 'Preference', label, content: `${label}, in a sentence`, aliases: [], status: 'active', confidence: 0.8, certainty: 0.8, importance: 0.7, activation: 0.3, seen: 1, private: false, provenance, createdAt: T0, updatedAt: T0, lastAccessed: T0, ...extra });
  const said = node('a', 'Short answers', [{ kind: 'stated', surface: 'logos', at: T0, conversationId: 'c1' }]);
  const reading = node('b', 'Visual learner', [{ kind: 'inferred', surface: 'core', at: T0, conversationId: 'c1' }], { status: 'tentative' });
  const file = node('c', 'Graduate early', [{ kind: 'tentative', surface: 'file', at: T0 }], { type: 'Goal', status: 'tentative' });
  const confirmed = node('d', 'Tea not coffee', [{ kind: 'inferred', surface: 'core', at: T0 }, { kind: 'stated', surface: 'user', at: T0 + 1, note: 'confirmed by you', review: 'confirmed' }]);
  const found = node('e', 'Jane Doe', [{ kind: 'researched', surface: 'tool', at: T0 }], { type: 'Person' });
  ok('whereFrom reads the record: said, reading, file, confirmed, source', J([said, reading, file, confirmed, found].map(whereFrom)) === J(['said', 'reading', 'file', 'confirmed', 'source']));
  const sub = { nodes: [said, reading, file, confirmed, found], edges: [], scores: { a: 5, b: 4, c: 3, d: 2, e: 1 } };
  const text = serializeSubgraph(sub, { now: T0, maxTokens: 2000 });
  ok('every recalled line says where it came from', /\[said\]: Short answers/.test(text) && /\[reading\]: Visual learner/.test(text) && /\[file\]: Graduate early/.test(text) && /\[confirmed\]: Tea not coffee/.test(text) && /\[source\]: Jane Doe/.test(text), text);
  const block = renderMindGraph(sub, { now: T0, maxTokens: 2000 });
  ok('the block says what each mark means, and never to call a reading something they said', /\[reading\]: Socria's own reading of\s+them, never said by them — never tell them they said it/.test(block));
  const prof = standingProfile({ nodes: [said, reading, file, confirmed] }, { now: T0 });
  ok('what travels on every turn is only what they said or confirmed', J(prof.map((n) => n.id).sort()) === J(['a', 'd']), J(prof.map((n) => n.id)));
  const pblock = renderProfile(prof);
  ok('…marked so, and no longer called "true between them"', /\[said\]/.test(pblock) && /\[confirmed\]/.test(pblock) && !/because it is true between them/.test(pblock), pblock);
}

console.log('\n=== they confirm it; once they touch it, only they change its words ===');
{
  let { graph: g } = applyCandidates(EMPTY_GRAPH, [C('Preference', 'Works late', 'They do their best work late at night', 'tentative')], [], OPTS());
  const id = g.nodes[0].id;
  ok('a reading lands tentative', g.nodes[0].status === 'tentative' && whereFrom(g.nodes[0]) === 'reading');
  g = confirmNode(g, id, T0 + 10);
  const n = g.nodes.find((x) => x.id === id);
  ok('confirmed: held as current, marked theirs', n.status === 'active' && whereFrom(n) === 'confirmed' && touchedByThem(n));
  ok('…and its history says who settled it', evolutionOf(g, id).some((s) => s.text === 'Confirmed by you' && s.review === 'confirmed'), J(evolutionOf(g, id)));
  ({ graph: g } = applyCandidates(g, [C('Preference', 'Works late', 'They do their best work late at night, usually after midnight when it is quiet and nobody interrupts', 'stated')], [], OPTS({ now: T0 + 20 })));
  const after = g.nodes.find((x) => x.id === id);
  ok('a later extraction reinforces it, and does not reword it', after.content === 'They do their best work late at night' && after.seen === 2, after.content);
  // a hand edit keeps what it replaced (app/api/mind/node PATCH writes `prior`)
  const edited = {
    ...g,
    nodes: g.nodes.map((x) => (x.id === id ? { ...x, content: 'Late, but never after 1am', provenance: [...x.provenance, { kind: 'stated', surface: 'user', at: T0 + 30, note: 'edited by hand', prior: { label: x.label, content: x.content } }] } : x)),
  };
  const steps = evolutionOf(edited, id);
  ok('their edit is in its history, with the words it replaced', steps.some((s) => s.kind === 'reworded' && /edited by you — was: They do their best work late at night/.test(s.text)), J(steps.map((s) => s.text)));
  const route = read('app/api/mind/node/route.ts');
  ok('the edit route records the prior words, and the confirm route exists', /prior: \{ label: n\.label, content: n\.content \}/.test(route) && /body\?\.confirm === true/.test(route) && /confirmNode\(before, id, now\)/.test(route));
  ok('…bounded the way every record is, so the first ground is never the one dropped', /provenance: boundProvenance\(\[/.test(route) && !/\]\.slice\(-20\)/.test(route));
}

console.log('\n=== a private conversation’s sighting stays in it ===');
{
  const claim = C('Belief', 'Fears failure', 'They are afraid of failing publicly', 'inferred');
  const open = applyCandidates(EMPTY_GRAPH, [claim], [], OPTS()).graph;
  ok('an ordinary sighting waits in the ledger for a second conversation', open.pending.length === 1);
  const priv = applyCandidates(EMPTY_GRAPH, [{ ...claim, private: true }], [], OPTS()).graph;
  ok('a private one does not — it can neither corroborate nor outlive its conversation', priv.pending.length === 0, J(priv.pending));
}

console.log('\n=== the Memory page says what is true of each memory ===');
{
  const NOW = T0 + 40 * 86_400_000;
  const base = (id, provenance, extra = {}) => ({ id, type: 'Preference', label: id, content: 'x', status: 'active', importance: 0.5, createdAt: T0, updatedAt: T0, provenance, ...extra });
  const ms = A.memoriesOf(
    [
      base('said', [{ kind: 'stated', surface: 'logos', at: T0 }]),
      base('confirmed', [{ kind: 'inferred', surface: 'core', at: T0 }, { kind: 'stated', surface: 'user', at: T0 + 1, note: 'confirmed by you', review: 'confirmed' }]),
      base('reading', [{ kind: 'inferred', surface: 'core', at: T0 }]),
      base('file', [{ kind: 'researched', surface: 'file', at: T0 }]),
    ],
    [],
    [],
    NOW
  );
  const by = Object.fromEntries(ms.map((m) => [m.id, m]));
  ok('"Confirmed" only for what they confirmed', A.stateWords(by.confirmed, NOW)[0] === 'Confirmed' && A.stateWords(by.said, NOW)[0] !== 'Confirmed', J([A.stateWords(by.confirmed, NOW), A.stateWords(by.said, NOW)]));
  ok('what they said is in their words; a reading is Socria’s; a file’s is the file’s', A.stateWords(by.said, NOW)[0] === 'In your words' && A.stateWords(by.reading, NOW)[0] === 'Socria’s reading' && A.stateWords(by.file, NOW)[0] === 'From your file');
  ok('"You said it" only when they did', A.knownBy(by.said) === 'You said it' && A.knownBy(by.reading) === 'Socria noticed it' && A.knownBy(by.file) === 'From your file');
  ok('a ground of an unfamiliar kind is never presented as theirs', A.knownBy({ ...by.said, provenance: [{ kind: 'joke', surface: 'core' }] }) === 'Socria noticed it');
  const parts = read('components/logos5/MemoryParts.tsx');
  ok('the inspector offers "That’s right" until they have confirmed it', /onConfirm && whereFrom\(m\) !== 'confirmed'/.test(parts) && /That’s right/.test(parts));
  ok('a change they turned down is not called confirmed', /if \(c\.review === 'rejected'\) return 'Turned down by you';/.test(parts));
  ok('the solid mark is "Current", not "Confirmed"', /\['confirmed', 'Current'\]/.test(parts));
}

console.log('\n=== one memory of a person; nothing from off the record ===');
{
  const app = read('components/LogosApp.tsx');
  ok('with the Mind Graph on, Logos 5 no longer writes the older profile as well', /!\(workspaceOn && cloud\) &&\s*userTurns >= JOURNEY_EVERY_TURNS/.test(app));
  const und = read('app/api/update-understanding/route.ts');
  ok('the older profile learns nothing from a conversation taken off the record, or a sensitive one', /const policy = logosPersistPolicy\(/.test(und) && /if \(policy !== 'full'\)/.test(und));
  const pipe = read('lib/mind/pipeline.ts');
  ok('an incognito conversation is never remembered — checked where every write passes', /if \(opts\.conversationId && \(await isIncognito\(userId, opts\.conversationId\)\)\) \{\s*return \{ report: null, persisted: false \};/.test(pipe));
}

console.log(`\nmind ground: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
