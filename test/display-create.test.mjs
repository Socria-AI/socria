// MAKING A DISPLAY — from what the person says to an object they can edit.
//
// Workflows 1, 7 and 9 of the release, at the seam where a language model
// meets the workspace. What is held down here: a display is asked for only
// when a making verb governs a word a kind declares, never by a question
// about one; restructuring the map's own thinking stays the map's; the pass
// is told only the kinds that exist, each with a spec and an example its own
// sanitizer keeps; what comes back is sealed by the kind or refused with a
// reason — a different kind than the one asked for is refused, not
// substituted; authorship is recorded, never claimed; a plan made from the
// map keeps the map's words and order; and a full workspace says so instead
// of evicting anything.

import {
  readDisplayRequest,
  buildDisplayPrompt,
  readDisplayProposal,
  planFromMap,
  makeDisplay,
  madeSays,
  displayKinds,
  kindOf,
  create,
  EMPTY_SPACE,
  MAX_OBJECTS,
} from './.tmp/index.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const req = (t, o) => readDisplayRequest(t, o);

console.log('=== asked for, in words ===');
{
  const r = req('Make me a study plan for my finals next week');
  ok('"make me a study plan" asks for a plan', r?.kind === 'plan' && !r.fromMap, JSON.stringify(r));
  ok('"create a timeline of the French Revolution" opens it as a timeline', req('Create a timeline of the French Revolution')?.view === 'timeline');
  ok('"give me a checklist for moving house" — a checklist', req('give me a checklist for moving house')?.view === 'checklist');
  ok('"set up a kanban board for the group project" — a board', req('Can you set up a kanban board for the group project?')?.view === 'board');
  ok('"I need a revision schedule" — a timeline', req('I need a revision schedule for chemistry')?.view === 'timeline');
  ok('"help me make a to-do list" — a checklist', req('help me make a to-do list for this weekend')?.view === 'checklist');
  ok('"could you draft a storyboard" — a storyboard', req('Could you draft a storyboard for my short film?')?.view === 'storyboard');
  const m = req('Turn this map into a checklist');
  ok('"turn this map into a checklist" is made FROM the map', m?.kind === 'plan' && m.fromMap && m.view === 'checklist', JSON.stringify(m));
  ok('  even when the map also reads it as a restructure', req('Turn this map into a checklist', { stated: 'plan' })?.fromMap === true);
  ok('"make a timeline from my notes" is made from the map', req('make a timeline from my notes')?.fromMap === true);
  ok('"convert my ideas to a kanban" — from the map, as a board', req('convert my ideas to a kanban')?.view === 'board' && req('convert my ideas to a kanban')?.fromMap === true);
}

console.log('\n=== not asked for ===');
{
  ok('a question about one is not a request', req('How do I make a gantt chart in Excel?') === null);
  ok('  nor is "what is a timeline"', req('What is a timeline in project management?') === null);
  ok('"I want to plan my week" asks for help, not a plan', req('I want to plan my week') === null);
  ok('"my plan is to study" is not a request', req('My plan is to study every evening') === null);
  ok('a plan mentioned in passing is not a request', req('The plan fell apart when the lab closed') === null);
  ok('"don’t make a plan" is not a request', req('Please don’t make a plan, just talk it through with me') === null);
  ok('"show this as a timeline" restructures the map, as it always has', req('show this as a timeline', { stated: 'timeline' }) === null);
  ok('"turn this into a checklist" restructures the map too', req('turn this into a checklist', { stated: 'plan' }) === null);
  ok('  but a word only a display can be is the display', req('turn this into a kanban board', { stated: null })?.view === 'board');
  ok('nothing to read is nothing asked', req('') === null && req(null) === null && req(42) === null);
  ok('a model is not a display', req('Make a model of a damped spring') === null);
  ok('a plot is not a display', req('Plot y = x^2 from -3 to 3') === null);
}

console.log('\n=== what the pass is told ===');
{
  const all = buildDisplayPrompt({ request: null, today: '2026-10-10', guarded: false });
  ok('it is told every kind the workspace has', displayKinds().every((m) => !m.spec || all.includes(`"${m.kind}"`)));
  ok('  with today, for relative days', all.includes('Today is 2026-10-10'));
  ok('  never to invent facts or dates', /Never invent facts/.test(all) && /never guessed/.test(all));
  ok('  and how to say it cannot', all.includes('{"none": "why not"}'));
  const one = buildDisplayPrompt({ request: req('make me a study plan'), today: '2026-10-10', guarded: false });
  ok('asked for a plan, it is told about plans', one.includes('"plan"') && one.includes('They asked for'));
  const fromMap = buildDisplayPrompt({
    request: req('turn this map into a timeline'),
    today: '2026-10-10',
    guarded: false,
    map: { nodes: [{ id: 'a', label: 'Collect data', type: 'claim' }], edges: [] },
  });
  ok('made from the map, it gets the map’s ideas and is told to keep to them', fromMap.includes('[a] Collect data') && fromMap.includes('Use ONLY these ideas'));
}

console.log('\n=== what came back, sealed ===');
{
  const r = req('make me a study plan for the essay');
  const good = {
    display: {
      kind: 'plan',
      state: {
        title: 'Essay week',
        items: [
          { id: 'i1', text: 'Find sources', date: '2026-10-12', by: 'person' },
          { id: 'i2', text: 'Outline', date: '2026-10-14' },
        ],
        links: [{ from: 'i1', to: 'i2', by: 'person' }],
      },
    },
    gaps: ['the due date was not given'],
  };
  const p = readDisplayProposal(good, { request: r });
  ok('a plan proposal is sealed by the plan’s own sanitizer', p.ok && p.kind === 'plan' && p.state.items.length === 2, JSON.stringify(p));
  ok('  authorship it claimed is dropped: all of it is Socria’s', p.ok && p.state.items.every((i) => i.by === 'socria') && p.state.links.every((l) => l.by === 'socria'));
  ok('  and what it could not fill is kept, to be said', p.ok && p.gaps[0] === 'the due date was not given');
  const viewed = readDisplayProposal(good, { request: req('make a kanban board for the essay') });
  ok('the view the person’s word asked for is the one it opens on', viewed.ok && viewed.state.view === 'board');
  const declined = readDisplayProposal({ none: 'There is nothing scheduled in the conversation yet.' }, { request: r });
  ok('a pass that declines says why, in a sentence', !declined.ok && declined.failure === 'declined' && declined.says.includes('nothing scheduled'));
  const unknown = readDisplayProposal({ display: { kind: 'flashcards', state: { cards: [] } } }, { request: null });
  ok('a kind the workspace does not have is refused, and what it can make is said', !unknown.ok && unknown.failure === 'unsupported' && unknown.says.includes('plan'));
  const other = readDisplayProposal({ display: { kind: 'plan', state: good.display.state } }, { request: { kind: 'compare', kinds: ['compare'], fromMap: false, noun: 'comparison table' } });
  ok('a different kind than the one asked for is refused, not substituted', !other.ok && other.failure === 'malformed' && /asked for/.test(other.says));
  const junk = readDisplayProposal({ display: { kind: 'plan', state: 'a plan, roughly' } }, { request: r });
  ok('a state the kind cannot hold is refused', !junk.ok && junk.failure === 'malformed');
  ok('garbage is refused', !readDisplayProposal(null, { request: r }).ok && !readDisplayProposal('plan', { request: r }).ok && !readDisplayProposal({ display: {} }, { request: r }).ok);
  const empty = readDisplayProposal({ display: { kind: 'plan', state: { title: 'Nothing', items: [] } } }, { request: null });
  ok('an empty display nobody plainly asked for is not made', !empty.ok && empty.failure === 'empty');
  const askedEmpty = readDisplayProposal({ display: { kind: 'plan', state: { title: 'Packing', items: [] } } }, { request: req('make me a checklist') });
  ok('  but one asked for opens empty, on its starting point', askedEmpty.ok && askedEmpty.state.items.length === 0 && askedEmpty.state.view === 'checklist');
}

console.log('\n=== a plan made from the map ===');
{
  const map = {
    nodes: [
      { id: 'write', label: 'Write the report', type: 'claim' },
      { id: 'collect', label: 'Collect the survey data', type: 'claim', origin: 'socria' },
      { id: 'why', label: 'Why is the response rate low?', type: 'question' },
      { id: 'analyse', label: 'Analyse the responses', type: 'claim', status: 'resolved' },
    ],
    edges: [
      { from: 'collect', to: 'analyse', relation: 'precedes' },
      { from: 'write', to: 'analyse', relation: 'depends' },
      { from: 'why', to: 'collect', relation: 'relates' },
    ],
  };
  const raw = planFromMap(map, { title: 'Survey project', view: 'checklist' });
  const s = kindOf('plan').sanitize(raw);
  ok('every idea that is a thing to do is an item, in the map’s words', s.items.map((i) => i.text).join('|') === 'Collect the survey data|Analyse the responses|Write the report', s.items.map((i) => i.text).join('|'));
  ok('  a question stays on the map', !s.items.some((i) => i.text.includes('Why')));
  ok('  the map’s sequence is kept as what waits on what', s.links.length === 2 && s.links.some((l) => l.from === 'i1' && l.to === 'i2') && s.links.some((l) => l.from === 'i2' && l.to === 'i3'));
  ok('  a resolved idea is done', s.items[1].status === 'done');
  ok('  authorship follows the idea it came from', s.items[0].by === 'socria' && s.items[2].by === 'person');
  const loop = planFromMap({ nodes: [{ id: 'a', label: 'A step' }, { id: 'b', label: 'B step' }], edges: [{ from: 'a', to: 'b', relation: 'precedes' }, { from: 'b', to: 'a', relation: 'precedes' }] });
  const ls = kindOf('plan').sanitize(loop);
  ok('a map that loops still makes a plan, without the loop', ls.items.length === 2 && ls.links.length === 1);
}

console.log('\n=== into the workspace ===');
{
  const p = readDisplayProposal({ display: { kind: 'plan', state: { title: 'Week', items: [{ text: 'Laundry' }] } } }, { request: req('make me a checklist') });
  const made = makeDisplay(EMPTY_SPACE, p.kind, p.state, 'socria');
  ok('a sealed state becomes an object of thought', made.ok && made.obj.kind === 'plan' && made.obj.states.length === 1 && made.obj.origin === 'socria');
  ok('  named with its kind’s handle', made.ok && made.obj.name === 'P1');
  const again = makeDisplay(made.space, p.kind, p.state, 'socria');
  ok('  the next is the next handle', again.ok && again.obj.name === 'P2');
  ok('what the person is told names it and says it is theirs to change', madeSays(made.obj).startsWith('Drafted by Socria: a plan “Week”') && madeSays(made.obj).includes('yours to change'));
  ok('  and says what it could not fill', madeSays(made.obj, ['the due date']).includes('could not fill: the due date'));
  let full = EMPTY_SPACE;
  for (let i = 0; i < MAX_OBJECTS; i++) full = create(full, 'plan', { title: `P${i}`, items: [{ text: 'x' }] }, { origin: 'socria' }).space;
  const over = makeDisplay(full, 'plan', p.state, 'socria');
  ok('a full workspace says so, and evicts nothing', !over.ok && over.failure === 'full' && full.objs.length === MAX_OBJECTS);
}

console.log('\n=== every kind’s example is a state it keeps ===');
{
  for (const m of displayKinds()) {
    if (!m.example) continue;
    const s = kindOf(m.kind)?.sanitize(m.example);
    ok(`${m.kind}: its example is kept by its own sanitizer`, !!s && kindOf(m.kind).parts(s).length > 0);
    ok(`${m.kind}: it has a spec for the pass and words a person uses`, !!m.spec && (m.called?.length ?? 0) > 0);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
