// Synthesis — structure → understanding (lib/logos-synthesis.ts).
//
// Held here: a synthesis is read from CANONICAL STATE, not the chat; types and
// roles mean different things; ideas never become decisions; the structure's
// own problems are found in code; a model's draft is held to the structure
// (nothing open is "established", an ungrounded "problem" is only a risk, a
// possibility the map already holds is dropped); it compresses; its next
// moves follow from the structure; and it never touches the map.

import { sanitizeMap } from './.tmp/logos.mjs';
import { applyMapEdits } from './.tmp/map-edit.mjs';
import { open, EMPTY_WORKSPACE } from './.tmp/docs.mjs';
import { modelById } from './.tmp/library.mjs';
import {
  canSynthesize, changeBetween, digest, enforce, fromStructure, isSynthesisText, lastSynthesis, sanitizeSynthesis,
  snapshotOf, synthesisPrompt, synthesisText, SYNTH_MARK,
} from './.tmp/logos-synthesis.mjs';
import { ALL, ONBOARDING, DECISION, CONTRADICTORY, UNRESOLVED, LARGE, SPARSE, MODEL, RESEARCH, ARGUMENT, LAUNCH } from './fixtures/synthesis-maps.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const base = (map) => ({ id: 'syn_t', at: 1, scope: { kind: 'workspace' }, snapshot: snapshotOf(map, 1) });
const read = (raw, opts = {}) => {
  // A stored map is capped at the extractor's size; the large workspace is
  // read raw, as a map grown by hand past that cap would be.
  const map = raw === LARGE ? raw : sanitizeMap(raw, { trust: 'stored' });
  const d = digest(map, opts);
  return { map, d, s: fromStructure(d, { ...base(map), scope: { kind: opts.scope ?? 'workspace', ...(opts.ids ? { ids: opts.ids } : {}) } }) };
};
const section = (s, id) => s.sections.find((x) => x.id === id)?.items ?? [];

// The model workspace carries a built model, not just a picture.
const withModel = { ...MODEL, models: open(EMPTY_WORKSPACE, modelById('saddle')).workspace };

console.log('=== ten workspaces, ten different readings ===');
const R = Object.fromEntries(Object.entries({ ...ALL, MODEL: withModel }).map(([k, v]) => [k, read(v)]));
{
  const titles = new Set(['ONBOARDING', 'LAUNCH', 'DECISION', 'ARGUMENT', 'RESEARCH', 'MODEL'].map((k) => R[k].s.title));
  ok('each structured workspace gets its own heading', titles.size === 6, [...titles].join(' | '));
  ok('the onboarding synthesis names its subject and shape', /Socria onboarding/.test(R.ONBOARDING.s.title) && /process/.test(R.ONBOARDING.s.title), R.ONBOARDING.s.title);
  ok('  and draws the process in order', R.ONBOARDING.s.shape?.layers.map((l) => l.join('/')).join(' → ') === 'Select what you are → Tailor experience to user type', JSON.stringify(R.ONBOARDING.s.shape));
  ok('the decision has no process shape', !R.DECISION.s.shape);
  ok('the model synthesis speaks of the model it built', /model, “A saddle”/.test(R.MODEL.s.lede) && /parameter/.test(R.MODEL.s.lede), R.MODEL.s.lede);
  ok('the onboarding synthesis does not read like the model one', R.ONBOARDING.s.lede !== R.MODEL.s.lede && !/parameter/.test(R.ONBOARDING.s.lede));
  ok('the decision does not read like the research', R.DECISION.s.title !== R.RESEARCH.s.title && JSON.stringify(R.DECISION.s.next) !== JSON.stringify(R.RESEARCH.s.next));
  const nexts = new Set(Object.values(R).map((r) => r.s.next.map((n) => n.id).join(',')));
  ok('the next moves change with the structure', nexts.size >= 4, [...nexts].join(' | '));
  for (const [k, r] of Object.entries(R)) {
    ok(`${k}: two or three next moves, ending in “keep thinking”`, r.s.next.length >= 1 && r.s.next.length <= 3 && r.s.next.at(-1).id === 'continue', JSON.stringify(r.s.next.map((n) => n.id)));
  }
}

console.log('\n=== types and roles mean different things ===');
{
  const { d, s } = R.ONBOARDING;
  ok('steps are the shape, not items to list', !section(s, 'emerging').some((i) => /Select what you are|Tailor experience/.test(i.text)));
  ok('the supported idea and the supported value are established', section(s, 'established').map((i) => i.text).sort().join('|') === 'Easy access onboarding|Personalized welcome', JSON.stringify(section(s, 'established')));
  ok('open ideas are taking shape — never established', ['Interactive tutorials', 'Guided tours', 'Example use cases'].every((t) => section(s, 'emerging').some((i) => i.text.startsWith(t)) && !section(s, 'established').some((i) => i.text.startsWith(t))));
  ok('the question stays a question', section(s, 'unresolved').some((i) => /need to know/.test(i.text) && /\?$/.test(i.text)));
  ok('values and constraints are what shape it, said as such', /one value \(“Easy access onboarding”\)/.test(s.lede) && /one constraint \(“Avoid being annoying”\)/.test(s.lede), s.lede);
  ok('the counts are by what things do', /9 objects/.test(s.counts) && /4 ideas/.test(s.counts) && /2 steps/.test(s.counts), s.counts);
  ok('the digest knows a constraint applies to a step', d.nodes.find((n) => n.id === 'annoy').place === 'detail');
}

console.log('\n=== the structure’s own problems, found in code ===');
{
  const c = R.CONTRADICTORY.s;
  ok('two settled claims that conflict are a known problem', c.critique.some((x) => x.level === 'problem' && /both treated as settled/.test(x.text)));
  ok('  and the tension is surfaced', section(c, 'tensions').length >= 1);
  ok('an assumption with nothing under it is named', c.critique.some((x) => /assumption with nothing under it/.test(x.text)));
  ok('the contradiction offers to work through the tension', c.next.some((n) => n.id === 'tension'));
  const u = R.UNRESOLVED.s;
  ok('a mostly-open workspace says nothing is settled', /Nothing in it is settled yet/.test(u.lede) && !section(u, 'established').length, u.lede);
  ok('  keeps its questions as questions', section(u, 'unresolved').length >= 4);
  ok('  and offers to resolve them', u.next[0].id === 'resolve');
  ok('a decision with options and criteria is not falsely called incomplete', !R.DECISION.s.critique.some((x) => /nothing says what they should be judged on/.test(x.text)));
  ok('the decision offers to compare the alternatives', R.DECISION.s.next.some((n) => n.id === 'compare'));
  const noCrit = read({ ...DECISION, nodes: DECISION.nodes.filter((x) => x.role !== 'criterion'), edges: DECISION.edges.filter((x) => !['cost', 'friends', 'career'].includes(x.from)) }).s;
  ok('a decision with no criteria is told so', noCrit.critique.some((x) => /judged on/.test(x.text)), JSON.stringify(noCrit.critique));
  const branchy = read({ ...ONBOARDING, nodes: [...ONBOARDING.nodes, { id: 'core', type: 'step', label: 'Core path', role: 'step' }], edges: [...ONBOARDING.edges, { from: 'select', to: 'core', relation: 'precedes' }] }).s;
  ok('a branch with no conditions is worth questioning, not a known problem', branchy.critique.some((x) => x.level === 'risk' && /not every way out says when/.test(x.text)));
  ok('a sparse workspace invents no criticism', R.SPARSE.s.critique.length === 0, JSON.stringify(R.SPARSE.s.critique));
}

console.log('\n=== it compresses ===');
{
  const L = R.LARGE;
  ok('72 objects, and every section is at most four lines', L.s.sections.every((x) => x.items.length <= 4));
  ok('  the paragraph stays short', L.s.lede.length <= 460);
  ok('  the conversation text stays short', synthesisText(L.s).length <= 2400);
  ok('  the counts still tell the whole', /72 objects/.test(L.s.counts));
  const prompt = synthesisPrompt(L.d, '');
  ok('  the model is shown the most load-bearing 60, and told so', (prompt.match(/^ {2}x\d+ \[/gm) || []).length === 72 ? false : /most load-bearing shown/.test(prompt), (prompt.match(/^ {2}x\d+ \[/gm) || []).length);
  ok('a sparse workspace is synthesised without padding', R.SPARSE.s.sections.reduce((n, x) => n + x.items.length, 0) <= 2);
  ok('nothing to synthesise below two objects', !canSynthesize(sanitizeMap({ nodes: [{ id: 'a', type: 'idea', label: 'one' }], edges: [] })) && canSynthesize(sanitizeMap(SPARSE)));
}

console.log('\n=== the prompt is the structure, not the chat ===');
{
  const p = synthesisPrompt(R.ONBOARDING.d, 'Person: hi');
  ok('it says what is being synthesised, and what is only evidence', /structure they have built/.test(p) && /never the subject/.test(p));
  ok('every object, with type, role and standing', /tailor \[step, role step\] Tailor experience to user type/.test(p) || /tailor \[step\] Tailor experience/.test(p));
  ok('  the settled ones marked', /welcome \[idea, supported, 1 supporting[^\]]*\] Personalized welcome/.test(p), p.split('\n').find((l) => /welcome \[/.test(l)));
  ok('the shape in order', /THE SHAPE, IN ORDER: Select what you are → Tailor experience to user type/.test(p));
  ok('how types and roles differ', /ideas, options and hypotheses are CANDIDATES/.test(p) && /constraints limit/.test(p));
  ok('epistemic honesty and the critique levels', /Never turn an idea into a decision/.test(p) && /"problem": the structure itself/.test(p) && /Do not flatter/.test(p));
  const sel = synthesisPrompt(digest(sanitizeMap(ONBOARDING), { scope: 'selection', ids: ['welcome', 'tutorials', 'tours'] }), '');
  ok('a selection is synthesised as itself', /only the 3 objects they selected/.test(sel) && !/Select what you are/.test(sel));
}

console.log('\n=== a model’s draft is held to the structure ===');
{
  const { d, map } = R.ONBOARDING;
  const draft = {
    title: 'Your onboarding direction',
    lede: 'You are designing onboarding around a tension: make Socria understandable without making it intrusive.',
    established: [
      { text: 'Personalization happens early', refs: ['welcome'] },
      { text: 'Tutorials are the way in', refs: ['tutorials'] },
      { text: 'Something with no basis', refs: ['ghost'] },
    ],
    emerging: [{ text: 'Guided tours', refs: ['tours'] }],
    unresolved: [{ text: 'How much guidance is annoying?', refs: [] }],
    reading: [{ text: 'Easy access and avoiding annoyance suggest low-friction onboarding', refs: ['easy', 'annoy'] }],
    critique: [
      { level: 'problem', text: 'Your onboarding over-explains', refs: ['tutorials'] },
      { level: 'suggestion', text: 'Define an activation moment', refs: [] },
    ],
    possibilities: [
      { label: 'Activation moment', type: 'question', text: 'What must a new user experience before onboarding has succeeded?' },
      { label: 'Personalized welcome', type: 'idea', text: 'Already there' },
      { label: 'Skip behaviour', type: 'idea', text: 'What happens when someone skips?' },
      { label: 'Returning users', type: 'idea', text: 'What changes the second time?' },
      { label: 'A fourth', type: 'idea', text: 'Too many' },
    ],
    next: ['flow', 'compare', 'challenge'],
  };
  const before = JSON.stringify(map);
  const s = enforce(draft, d, base(map));
  ok('an established claim on an open idea is moved to “taking shape”', !section(s, 'established').some((i) => /Tutorials/.test(i.text)) && section(s, 'emerging').some((i) => /Tutorials/.test(i.text)));
  ok('an established claim on nothing real is dropped', !JSON.stringify(s).includes('Something with no basis'));
  ok('the grounded, settled one stays', section(s, 'established').some((i) => /Personalization happens early/.test(i.text)));
  ok('Socria’s reading is marked as Socria’s', section(s, 'reading').every((i) => i.by === 'socria'));
  ok('a “problem” the structure does not show becomes a risk', s.critique.find((c) => /over-explains/.test(c.text))?.level === 'risk');
  ok('a suggestion stays a suggestion', s.critique.find((c) => /activation/.test(c.text))?.level === 'suggestion');
  ok('a possibility the map already holds is dropped, and there are at most three', !s.possibilities.some((p) => p.label === 'Personalized welcome') && s.possibilities.length === 3);
  ok('a next move that does not apply is not offered', !s.next.some((n) => n.id === 'flow') && s.next.length <= 3);
  ok('the heading and paragraph are the model’s', s.title === 'Your onboarding direction' && s.source === 'model');
  ok('nothing was written to the map', JSON.stringify(map) === before);
  const junk = enforce('not json', d, base(map));
  ok('a draft that is not one falls back to the structure', junk.source === 'structure' && junk.sections.length > 0);
  const long = enforce({ ...draft, lede: 'x'.repeat(5000), title: 'y'.repeat(500) }, d, base(map));
  ok('lengths are capped whatever the model wrote', long.lede.length <= 460 && long.title.length <= 70);
}

console.log('\n=== selection ===');
{
  const { s } = read(ONBOARDING, { scope: 'selection', ids: ['welcome', 'tutorials', 'tours'] });
  ok('only what was picked', s.counts.startsWith('3 objects') && /3 objects, together/.test(s.title), s.title);
  ok('  read as what they are together', /3 ideas side by side/.test(s.lede), s.lede);
}

console.log('\n=== what changed in my thinking ===');
{
  const before = snapshotOf(sanitizeMap(ONBOARDING, { trust: 'stored' }), 1);
  const after = sanitizeMap({
    ...ONBOARDING,
    nodes: [...ONBOARDING.nodes.map((x) => (x.id === 'need' ? { ...x, status: 'resolved' } : x.id === 'tours' ? null : x)).filter(Boolean),
      { id: 'activation', type: 'idea', label: 'Define an activation moment' }],
    edges: [...ONBOARDING.edges.filter((x) => x.from !== 'tours'), { from: 'annoy', to: 'tutorials', relation: 'conflicts' }],
  }, { trust: 'stored' });
  const c = changeBetween(before, after);
  ok('what was added, resolved, set aside and newly in tension', c.added.includes('Define an activation moment') && c.resolved.length === 1 && c.removed.includes('Guided tours') && c.newTensions.length === 1, JSON.stringify(c));
  const s = fromStructure(digest(after, { since: before }), base(after));
  ok('  said as a change in thinking, not a count', /Since the last synthesis you have/.test(s.change.said) && !/\d+ nodes/.test(s.change.said), s.change.said);
  ok('no change, nothing claimed', changeBetween(before, sanitizeMap(ONBOARDING, { trust: 'stored' })) === null);
}

console.log('\n=== the human owns the model ===');
{
  const map = sanitizeMap(ONBOARDING, { trust: 'stored' });
  const out = applyMapEdits(map, [{ op: 'add', node: { label: 'Activation moment', type: 'question', origin: 'socria' } }]);
  const added = out.map.nodes.find((x) => x.label === 'Activation moment');
  ok('a taken suggestion enters the map marked as Socria’s', added?.origin === 'socria' && added.status === 'open');
  ok('  and stays marked through a round trip', sanitizeMap(out.map, { trust: 'stored' }).nodes.find((x) => x.label === 'Activation moment')?.origin === 'socria');
  ok('the same idea twice is refused', applyMapEdits(out.map, [{ op: 'add', node: { label: 'activation moment', type: 'idea' } }]).refused.length === 1);
  ok('an unknown origin is no origin', sanitizeMap({ nodes: [{ id: 'a', type: 'idea', label: 'x', origin: 'robot' }], edges: [] }).nodes[0].origin === undefined);
}

console.log('\n=== kept in the conversation ===');
{
  const s = R.ONBOARDING.s;
  const text = synthesisText(s);
  ok('its text is marked, so the map never reads it as the person', text.startsWith(SYNTH_MARK) && isSynthesisText(text) && !isSynthesisText('hello'));
  ok('  and says whose the possibilities are', !s.possibilities.length || /Socria's, not yours/.test(text));
  const back = sanitizeSynthesis(JSON.parse(JSON.stringify(s)));
  ok('a synthesis round-trips through storage', back && back.title === s.title && back.sections.length === s.sections.length && back.snapshot.nodes.length === 9);
  ok('junk is not a synthesis', sanitizeSynthesis({ title: 'x' }) === undefined && sanitizeSynthesis(null) === undefined);
  ok('the last synthesis is found for “what changed”', lastSynthesis([{}, { synthesis: s }, {}])?.id === s.id && lastSynthesis([{}]) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
