// Representation intent — what the person is trying to BUILD with their thinking.
//
// The reported failure: designing a sequence (the stages of onboarding) came
// back as a cloud of Constraint and Value nodes. Every reading was defensible
// and the map was still wrong, because nothing asked what shape the person was
// constructing. This suite holds the deterministic half of the fix
// (lib/representation.ts, lib/logos-layout.ts):
//
//   · semantic type and structural role are separate, and both survive;
//   · the reading weighs the extractor, the structure and the person;
//   · the person's correction wins and sticks; a single ambiguous turn does
//     not flip a standing shape;
//   · nine different pieces of thinking select different shapes and lenses
//     from one registry — and most of them are recognised from structure
//     alone;
//   · a flow lays out its spine in order, branches as paths, details under
//     the step they apply to, and loses nothing;
//   · nothing in the registry or the prompt is about any one subject.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeMap, buildMapPrompt } from './.tmp/logos.mjs';
import { availableLenses, leadLens, layoutFlow, layoutTimeline } from './.tmp/logos-layout.mjs';
import {
  attachmentsOf, briefOf, buildingBlock, buildRestructurePrompt, GRAMMARS, GRAMMAR_IDS, keptEverything, orderSpine,
  readBuilding, sanitizeBrief, satisfies, spineOf, statedBuilding, structuralScores,
} from './.tmp/representation.mjs';
import { ONBOARDING_CLOUD, ONBOARDING_REPAIRED, ONBOARDING_TURNS, SCENARIOS } from './fixtures/shapes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** What the route does with an extraction: sanitise, then read what is being built. */
function settle(raw, { prev = null, stated = null } = {}) {
  const map = sanitizeMap(raw);
  const b = readBuilding({ map, proposed: map.building ?? null, stated, prev });
  if (b) map.building = b; else delete map.building;
  return map;
}
const lead = (m) => leadLens(availableLenses(m), !!m.viz || !!m.models?.docs?.length, m.building);

console.log('=== type and role are separate, and both survive ===');
{
  const m = sanitizeMap(ONBOARDING_TURNS[4].map);
  const signup = m.nodes.find((x) => x.id === 'signup');
  ok('a node keeps its semantic type and its structural role', signup.type === 'step' && signup.role === 'step');
  const easy = m.nodes.find((x) => x.id === 'easy');
  ok('"easy access" is a value AND a detail in the shape', easy.type === 'value' && easy.role === 'value');
  ok('"Core or Logos" is a decision by type and a branch by role', m.nodes.find((x) => x.id === 'choose').role === 'branch');
  ok('a transition keeps its condition', m.edges.some((x) => x.from === 'choose' && x.when === 'entered through Logos'));
  ok('a detail keeps the step it applies to', m.edges.some((x) => x.from === 'onesess' && x.to === 'guest' && x.relation === 'applies_to'));
  ok('a loop back is a different edge from the step forward', m.edges.some((x) => x.from === 'product' && x.to === 'discovery') && m.edges.some((x) => x.from === 'discovery' && x.to === 'product'));
  ok('the reading arrives', m.building?.kind === 'process');
  ok('a shaped map may hold more than a flat one, because its details sit under its steps', sanitizeMap({ building: { kind: 'process' }, nodes: Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, type: 'idea', label: `n${i}` })), edges: [] }).nodes.length === 22);
  const odd = sanitizeMap({ nodes: [{ id: 'a', type: 'idea', label: 'a', role: 'Stage' }, { id: 'b', type: 'idea', label: 'b', role: 'wizard' }], edges: [], building: { kind: 'flowchart' } });
  ok('a near-miss role lands on its kin; an unknown one is dropped, never the node', odd.nodes[0].role === 'step' && odd.nodes[1].role === undefined && odd.nodes.length === 2);
  ok('an unknown shape is no shape', odd.building === undefined);
}

console.log('\n=== the reported failure ===');
{
  const cloud = settle({ ...ONBOARDING_CLOUD, building: { kind: 'process' } });
  ok('the cloud, read as a process, does not satisfy a process', !satisfies(cloud, 'process'));
  ok('  so the route has something to repair (the reading is claimed and unmet)', cloud.building?.kind === 'process');
  const prompt = buildRestructurePrompt(cloud, 'process');
  ok('the repair prompt asks for roles, order, branches with conditions and attached details', /precedes/.test(prompt) && /"branch"/.test(prompt) && /"when"/.test(prompt) && /applies_to/.test(prompt));
  ok('  and forbids losing anything', /KEEP EVERY NODE/.test(prompt));
  const fixed = sanitizeMap({ ...ONBOARDING_REPAIRED, building: cloud.building });
  ok('the repaired map is a process', satisfies(fixed, 'process'));
  ok('  and kept every idea that was there', keptEverything(cloud, fixed));
  ok('a restructure that drops an idea is refused', !keptEverything(cloud, { nodes: fixed.nodes.filter((x) => x.id !== 'info'), edges: [] }));
  const s = structuralScores(sanitizeMap(ONBOARDING_CLOUD));
  ok('with no reading at all, a cloud is not mistaken for a sequence', s.process < 0.2, JSON.stringify(s));
}

console.log('\n=== the onboarding conversation, turn by turn ===');
{
  let prev = null;
  for (const [i, t] of ONBOARDING_TURNS.entries()) {
    const m = settle(t.map, { prev });
    prev = m.building;
    ok(`turn ${i + 1}: read as a process`, m.building?.kind === 'process', JSON.stringify(m.building));
    ok(`turn ${i + 1}: opens as a flow`, lead(m) === 'flow', `${lead(m)} of ${availableLenses(m)}`);
    const spine = spineOf(m, 'process');
    const held = new Set([...attachmentsOf(m, spine).values()].flat().map((x) => x.id));
    const floating = m.nodes.filter((x) => !spine.has(x.id) && !held.has(x.id));
    ok(`turn ${i + 1}: no detail floats free of the step it bears on`, floating.length === 0, floating.map((x) => x.label).join(', '));
  }
  const [t1, t2] = [settle(ONBOARDING_TURNS[0].map), settle(ONBOARDING_TURNS[1].map)];
  const layerOf = (m, id) => orderSpine(m, spineOf(m, 'process')).findIndex((l) => l.includes(id));
  ok('"no signup before they experience Socria" moved signup after the first thought', layerOf(t1, 'signup') < layerOf(t1, 'first') && layerOf(t2, 'signup') > layerOf(t2, 'first'));
  ok('  and the statement rides on the step it moved', attachmentsOf(t2, spineOf(t2, 'process')).get('signup')?.some((x) => x.id === 'nosign'));
  const t3 = settle(ONBOARDING_TURNS[2].map);
  const onGuest = attachmentsOf(t3, spineOf(t3, 'process')).get('guest')?.map((x) => x.label) ?? [];
  ok('"guests get one temporary session" attaches to the guest path, with its goal and open question', onGuest.includes('One temporary session') && onGuest.includes('Show value before authentication') && onGuest.includes('When should signup trigger?'), onGuest.join(' | '));
  const t4 = settle(ONBOARDING_TURNS[3].map);
  const layers = orderSpine(t4, spineOf(t4, 'process'));
  ok('the branch opens two paths that sit side by side', layers.some((l) => l.includes('coreaha') && l.includes('logosaha')));
  ok('  and the paths rejoin', layerOf(t4, 'signup') > layerOf(t4, 'coreaha'));
  const t5 = settle(ONBOARDING_TURNS[4].map);
  const order = orderSpine(t5, spineOf(t5, 'process')).map((l) => l.join('+')).join(' → ');
  ok('the whole flow reads in order, loop and all', order === 'landing → try → guest → intro → first → choose → coreaha+logosaha → signup → product → discovery → convert', order);
  const brief = briefOf(t5);
  ok('the reply is told the flow in order', brief.kind === 'process' && brief.spine[0] === 'Landing page' && brief.spine.at(-1) === 'Conversion to Socria One');
  ok('  and told to talk in its terms', /WHAT THEY ARE BUILDING: a process/.test(buildingBlock(sanitizeBrief(brief))) && /Landing page → Try Socria/.test(buildingBlock(sanitizeBrief(brief))));
}

console.log('\n=== the flow, drawn ===');
{
  const m = settle(ONBOARDING_TURNS[4].map);
  const L = layoutFlow(m, 1400, 700);
  const placed = new Map(L.placed.map((p) => [p.id, p]));
  const attachedIds = new Set(L.placed.flatMap((p) => (p.attached ?? []).map((d) => d.id)));
  ok('every node is on the canvas or under the step it applies to — nothing is lost', m.nodes.every((x) => placed.has(x.id) || attachedIds.has(x.id)));
  ok('details are under their step, not cards on the canvas', !placed.has('onesess') && placed.get('guest').attached.length === 2);
  // Reading order: left to right along a row, then row after row.
  const before = (a, b) => b.y - a.y > 60 || (Math.abs(b.y - a.y) <= 60 && b.x > a.x);
  const spineIds = ['landing', 'try', 'guest', 'intro', 'first', 'choose', 'coreaha', 'signup', 'product', 'discovery', 'convert'];
  ok('the spine reads in order, left to right and row after row', spineIds.every((id, i) => i === 0 || before(placed.get(spineIds[i - 1]), placed.get(id))));
  ok('a long flow wraps instead of running off the panel', Math.max(...L.placed.map((p) => p.x + p.w / 2)) <= 1400);
  ok('the branch is marked as one', placed.get('choose').branch === true);
  ok('its two paths share a column', placed.get('coreaha').x === placed.get('logosaha').x && placed.get('coreaha').y !== placed.get('logosaha').y);
  ok('conditions are written on the transitions', L.connectors.some((c) => c.label === 'entered through Logos'));
  ok('the loop back is drawn, not dropped', L.connectors.some((c) => c.key.startsWith('discovery~product')));
  const narrow = layoutFlow(m, 420, 900);
  ok('a narrow panel runs it top to bottom', narrow.placed.find((p) => p.id === 'landing').y < narrow.placed.find((p) => p.id === 'convert').y);
  const half = settle({ ...ONBOARDING_TURNS[2].map, nodes: [...ONBOARDING_TURNS[2].map.nodes, { id: 'stray', type: 'idea', label: 'Maybe a video?' }] });
  const H = layoutFlow(half, 1200, 700);
  ok('an idea not yet placed in the shape stays visible beneath it', H.placed.find((p) => p.id === 'stray')?.loose === true);
}

console.log('\n=== nine pieces of thinking, one architecture, different shapes ===');
{
  const chosen = new Set();
  for (const s of SCENARIOS) {
    const m = settle(s.map);
    chosen.add(`${m.building?.kind}:${lead(m)}`);
    ok(`${s.name}: read as ${s.expect.kind}`, m.building?.kind === s.expect.kind, JSON.stringify(m.building));
    ok(`${s.name}: opens on ${s.expect.lens}`, lead(m) === s.expect.lens, `${lead(m)} of ${availableLenses(m)}`);
    ok(`${s.name}: the structure holds the shape`, satisfies(m, s.expect.kind));
  }
  ok('the nine selected different shapes', new Set(SCENARIOS.map((s) => s.expect.kind)).size === 8 && chosen.size >= 7, [...chosen].join(' '));
  // STRUCTURE, NOT KEYWORDS: with the extractor's reading removed, the
  // structure alone still recognises most of them.
  let fromStructure = 0;
  const misses = [];
  for (const s of [...SCENARIOS, { name: 'onboarding', expect: { kind: 'process' }, map: ONBOARDING_TURNS[4].map }]) {
    const { building: _gone, ...bare } = s.map;
    const m = settle(bare);
    if (m.building?.kind === s.expect.kind) fromStructure++;
    else misses.push(`${s.name}→${m.building?.kind}`);
  }
  ok('from structure alone, at least 8 of 9 are recognised', fromStructure >= 8, misses.join(', '));
}

console.log('\n=== the person decides, and it sticks ===');
{
  for (const [text, want] of [
    ['Actually, show this as a process.', 'process'],
    ['can you lay it out as a timeline', 'timeline'],
    ['This is really a decision', 'decision'],
    ['turn it into a flowchart', 'process'],
    ['show me this as a comparison table', 'comparison'],
    ['draw it as a system', 'system'],
  ]) ok(`"${text}" → ${want}`, statedBuilding(text) === want, statedBuilding(text));
  for (const text of [
    "I am planning Socria's onboarding and the steps a new user goes through.",
    'What is the process for getting a visa?',
    'Our hiring process feels unfair.',
    'I need to make a decision about my job.',
    'Is this a process?',
  ]) ok(`"${text}" is a subject, not a correction`, statedBuilding(text) === null, statedBuilding(text));

  const decision = settle(SCENARIOS[2].map);
  const told = readBuilding({ map: decision, proposed: decision.building, stated: 'process', prev: decision.building });
  ok('the person’s word wins over the extractor and the structure', told.kind === 'process' && told.by === 'person');
  const later = readBuilding({ map: decision, proposed: { kind: 'decision', by: 'inferred', confidence: 0.9 }, prev: told });
  ok('  and stays until they say otherwise', later.kind === 'process' && later.by === 'person');
  ok('the extractor is told to restructure, keeping everything', /THE PERSON ASKED TO SEE THIS AS A PROCESS/.test(buildMapPrompt({ ...decision, building: told })) && /never discard/.test(buildMapPrompt({ ...decision, building: told })));
}

console.log('\n=== a shape evolves, but does not flap ===');
{
  const flow = settle(ONBOARDING_TURNS[4].map);
  const wobble = readBuilding({ map: flow, proposed: { kind: 'plan', by: 'inferred', confidence: 0.5 }, prev: flow.building });
  ok('one turn read as a plan does not throw a clear flow away', wobble.kind === 'process', JSON.stringify(wobble));
  const decision = sanitizeMap(SCENARIOS[2].map);
  const moved = readBuilding({ map: decision, proposed: { kind: 'decision', by: 'inferred', confidence: 0.8 }, prev: { kind: 'brainstorm', by: 'inferred', confidence: 0.4 } });
  ok('a brainstorm that has become a decision is read as one', moved.kind === 'decision');
  const mixed = settle({ ...SCENARIOS[1].map });
  ok('mixed shapes keep the secondary one', mixed.building.also?.includes('process'), JSON.stringify(mixed.building));
}

console.log('\n=== the timeline, drawn ===');
{
  const m = settle(SCENARIOS[6].map);
  const L = layoutTimeline(m, 1200, 600);
  const xs = ['hu', 'lp', 'sch', 'fall', 're'].map((id) => L.placed.find((p) => p.id === id).x);
  ok('events sit along the axis in order', xs.every((x, i) => i === 0 || x > xs[i - 1]));
  ok('the open question rides on the event it is about', L.placed.find((p) => p.id === 'sch').attached?.[0]?.id === 'why');
  ok('the axis is drawn', L.connectors.some((c) => c.key === 'timeline-axis'));
}

console.log('\n=== nothing here is about one subject ===');
{
  const reg = read('lib/representation.ts');
  const prompt = buildMapPrompt({ nodes: [], edges: [] });
  ok('the registry names no subject', !/onboard|signup|sign-up|hiring|Socria/i.test(reg.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('the prompt’s shapes are generated from the registry', GRAMMAR_IDS.every((g) => prompt.includes(GRAMMARS[g].builds)));
  ok('the prompt asks what they are building before typing a node', prompt.indexOf('WHAT ARE THEY BUILDING?') > 0 && prompt.indexOf('WHAT ARE THEY BUILDING?') < prompt.indexOf('READ THE CONTEXT SECOND'));
  ok('the prompt separates type from role', /SEMANTIC TYPE AND STRUCTURAL ROLE ARE DIFFERENT/.test(prompt));
  ok('a statement about the order changes the order', /A STATEMENT ABOUT THE ORDER CHANGES THE ORDER/.test(prompt));
  ok('the route reads, repairs and keeps everything', /readBuilding\(/.test(read('app/api/logos/map/route.ts')) && /keptEverything\(next, fixed\)/.test(read('app/api/logos/map/route.ts')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
