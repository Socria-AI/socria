// NEW LOGOS — THE UNIFIED OPERATION ENGINE (docs/NEW-LOGOS.md, "The operation engine").
//
// What is held down:
//   • spatial groups live in the layout: nested, named, collapsed (members hidden behind the outermost collapsed
//     group's tile), moved whole, ungrouped without losing anything; every change is a patch with an exact inverse;
//   • plain English is read into the engine's commands deterministically — every example of the specification —
//     and what is a question stays a question; compound instructions are one change, later steps seeing earlier ones;
//   • "this", "these", names, kinds, "everything related to …" and @mentions resolve to persistent ids, or are said to
//     be unclear (never guessed);
//   • the same operation makes the same change whether typed, chosen from a menu, or asked for by the assistant;
//   • components change representation deterministically and losslessly (a table as a plot, steps as a timeline);
//     what needs reasoning goes to the intelligence layer, the originals kept;
//   • a model copied for another version is independent (new names), and models compute without an assistant;
//   • slash commands are accelerators for the same commands; destructive plans ask first.

import * as X from './.tmp/new-logos-under-test.mjs';

const { Rep: R, RepOps: O, Canvas: C, Groups: G, Cmd, Intent: I, Resolve: Res, Xf } = X;
let pass = 0,
  fail = 0;
const ok = (name, cond, extra = '') => (cond ? (pass++, console.log('  ok   ' + name)) : (fail++, console.log('  FAIL ' + name + (extra ? '  ' + String(extra).slice(0, 400) : ''))));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** equal whatever the order of keys */
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => eq(canon(a), canon(b));
const NOW = Date.UTC(2026, 10, 28, 12, 0, 0);
const DAY = 86_400_000;

// ── groups in the layout ──
console.log('groups');
{
  const raw = {
    items: { 'r:a': { x: 0, y: 0, group: 'g_outer01' }, 'r:b': { x: 300, y: 0, group: 'g_inner01' }, 'r:c': { x: 600, y: 0, group: 'g_gone001' }, 'r:d': { x: 0, y: 300 } },
    groups: { g_outer01: { name: 'Pricing', parent: 'g_inner01' }, g_inner01: { parent: 'g_outer01', collapsed: true }, constructor: { name: 'x' }, g_bad: { name: 'short id' } },
  };
  const l = C.sanitizeLayout(raw);
  ok('groups are kept with their names; prototype and malformed ids are not', !!l.groups.g_outer01 && l.groups.g_outer01.name === 'Pricing' && !Object.prototype.hasOwnProperty.call(l.groups, 'constructor') && !Object.prototype.hasOwnProperty.call(l.groups, 'g_bad'));
  ok('a loop of groups is cut', !(l.groups.g_outer01.parent === 'g_inner01' && l.groups.g_inner01.parent === 'g_outer01'));
  ok('an item in a group that is not there is in no group', !('group' in l.items['r:c']) && l.items['r:a'].group === 'g_outer01');
  const deep = { items: {}, groups: {} };
  for (let k = 0; k < 12; k++) deep.groups[`g_deep${String(k).padStart(4, '0')}`] = k ? { parent: `g_deep${String(k - 1).padStart(4, '0')}` } : {};
  const dl = C.sanitizeLayout(deep);
  const depth = (gid) => G.ancestors(dl, gid).length;
  ok('groups never nest past the limit', Object.keys(dl.groups).every((g) => depth(g) < C.GROUP_LIMITS.depth));
}
const sizeOf = () => ({ w: 200, h: 80 });
let L = C.sanitizeLayout({ items: { 'r:a': { x: 0, y: 0 }, 'r:b': { x: 300, y: 0 }, 'r:c': { x: 600, y: 0 }, 'r:d': { x: 0, y: 300 } } });
{
  const p1 = G.groupPatch(L, ['r:a', 'r:b'], { gid: 'g_aaaaaa', name: 'Pricing' });
  const L1 = G.applyPatch(L, p1);
  ok('grouping puts the objects in a new named group', L1.items['r:a'].group === 'g_aaaaaa' && L1.items['r:b'].group === 'g_aaaaaa' && L1.groups.g_aaaaaa.name === 'Pricing');
  const p2 = G.groupPatch(L1, ['r:a'], { gid: 'g_bbbbbb' });
  const L2 = G.applyPatch(L1, p2);
  ok('grouping inside a group nests the new group in it', L2.groups.g_bbbbbb.parent === 'g_aaaaaa' && L2.items['r:a'].group === 'g_bbbbbb');
  ok('a group’s members include those of the groups inside it', eq(G.membersOf(L2, 'g_aaaaaa').sort(), ['r:a', 'r:b']) && eq(G.membersOf(L2, 'g_aaaaaa', false), ['r:b']));
  const L3 = G.applyPatch(L2, G.collapsePatch(L2, 'g_bbbbbb', true));
  const L4 = G.applyPatch(L3, G.collapsePatch(L3, 'g_aaaaaa', true));
  ok('collapsed: members hidden behind the outermost collapsed group, one tile', G.hiddenBy(L4).get('r:a') === 'g_aaaaaa' && G.hiddenBy(L4).get('r:b') === 'g_aaaaaa' && eq(G.tiles(L4), ['g_aaaaaa']));
  ok('expanded groups are drawn as frames', eq(G.frames(L2).sort(), ['g_aaaaaa', 'g_bbbbbb']));
  const mv = G.movePatch(L2, ['g:g_aaaaaa'], 50, 20);
  const L5 = G.applyPatch(L2, mv);
  ok('a group moves whole: every member, keeping their arrangement', L5.items['r:a'].x === 50 && L5.items['r:b'].x === 350 && L5.items['r:a'].y === 20 && L5.items['r:c'].x === 600);
  const un = G.ungroupPatch(L2, 'g_aaaaaa');
  const L6 = G.applyPatch(L2, un);
  ok('ungrouping keeps every member, in place; the inner group comes up a level', !L6.groups?.g_aaaaaa && L6.groups.g_bbbbbb && !L6.groups.g_bbbbbb.parent && L6.items['r:b'].x === 300 && !L6.items['r:b'].group && L6.items['r:a'].group === 'g_bbbbbb');
  for (const [name, p, base] of [['group', p1, L], ['nest', p2, L1], ['move', mv, L2], ['ungroup', un, L2], ['collapse', G.collapsePatch(L2, 'g_bbbbbb', true), L2]]) {
    const back = G.applyPatch(G.applyPatch(base, p), G.invertPatch(base, p));
    ok(`${name} is reversed exactly by its inverse`, same(C.sanitizeLayout(back), C.sanitizeLayout(base)), JSON.stringify(back));
  }
  const theirs = C.sanitizeLayout({ items: { 'r:z': { x: 9, y: 9 } }, groups: { g_theirs1: { name: 'Theirs' } } });
  const merged = C.mergeLayouts(theirs, L1, new Set(['r:a', 'r:b', 'g:g_aaaaaa']));
  ok('a save that lost the race keeps their groups and puts its own group on top', merged.groups.g_theirs1 && merged.groups.g_aaaaaa?.name === 'Pricing' && merged.items['r:z'] && merged.items['r:a'].group === 'g_aaaaaa');
  ok('a group in words', G.contentsInWords(['hypothesis', 'hypothesis', 'variable'], (k, n) => (n === 1 ? `a ${k}` : `${n} ${k}s`)) === '2 hypothesiss and a variable'.replace('hypothesiss', 'hypothesiss'));
}

// ── reading plain English ──
console.log('\nreading instructions');
const read = (t) => I.readIntent(t);
const step = (t) => {
  const r = read(t);
  return r.kind === 'steps' ? r.steps : r.kind;
};
const SPEC = [
  ['Turn this into a graph.', 'transform', (a) => a.target === 'this' && a.to === 'graph'],
  ['Group everything related to pricing.', 'group', (a) => a.targets === 'everything related to pricing'],
  ['Move this next to the revenue model.', 'move', (a) => a.targets === 'this' && a.beside === 'the revenue model'],
  ['Connect subscription pricing to projected revenue.', 'connect', (a) => a.from === 'subscription pricing' && a.to === 'projected revenue'],
  ['Show me where else this assumption is being used.', 'backlinks', (a) => a.target === 'this assumption'],
  ['Create another version assuming slower growth.', 'version', (a) => a.assuming === 'slower growth'],
  ['Hide everything unrelated to acquisition.', 'filter', (a) => a.keep === 'everything related to acquisition'],
  ['Find the document I uploaded yesterday.', 'find-source', (a) => a.when === 'yesterday'],
  ['Collapse this group.', 'collapse', (a) => a.target === 'this group'],
  ['Organize this workspace.', 'organise', () => true],
  ['Undo everything I just did.', 'undo', (a) => a.burst === true],
  ['Compare these two artifacts.', 'compare', (a) => a.a === 'these two artifacts'],
  ['Create a new workspace for market research.', 'new-workspace', (a) => a.title === 'market research'],
];
for (const [t, cmd, check] of SPEC) {
  const s = step(t);
  ok(`“${t}” → ${cmd}`, Array.isArray(s) && s.length === 1 && s[0].command === cmd && check(s[0].args), JSON.stringify(s));
}
ok('a compound instruction is several steps', eq(step('Group these and then collapse them').map((s) => s.command), ['group', 'collapse']));
ok('“connect A and B” is one step, not two', step('Connect pricing and revenue').length === 1);
ok('questions stay questions', ['Why did she cheat on her boyfriend to get with me?', 'How do I group things?', 'What is the capital of Australia', 'Show me why prices rose', 'I think churn is rising because of the price change'].every((t) => read(t).kind === 'question'), JSON.stringify(['Show me why prices rose'].map(read)));
ok('an instruction this cannot read goes to the assistant as an instruction', read('Summarise the risks into one finding').kind === 'instruction' && read('Align these vertically').kind === 'instruction');
ok('making things: “add a thought: …”, “create a table of x, y”', (() => {
  const a = step('Add a thought: prices will rise')[0];
  const b = step('Create a table with Price, Cost, Margin')[0];
  return a.command === 'create' && a.args.kind === 'thought' && a.args.text === 'prices will rise' && b.args.kind === 'table' && /Price, Cost, Margin/.test(b.args.text);
})());
ok('setting a value: “set price to 30”, “make growth 2%”', (() => {
  const a = step('Set price to 30')[0];
  const b = step('make growth 2%')[0];
  return a.command === 'set' && a.args.value === 30 && b.command === 'set' && b.args.value === 2;
})());
ok('other words for the same things: “link”, “put … beside”, “chart”, “tidy up”, “take that back”', ['link pricing with revenue', 'put this beside the plot', 'chart this', 'tidy up', 'take that back'].map((t) => step(t)[0]?.command).join() === 'connect,move,transform,organise,undo');

// ── a workspace to act on ──
let rec = O.EMPTY_RECORD;
const built = O.commit(rec, [
  { op: 'add', item: { id: 'q_main', kind: 'question', text: 'Should we raise the subscription price?' } },
  { op: 'add', item: { id: 'v_price', kind: 'variable', name: 'price', value: 20, min: 0, max: 50, text: 'Subscription pricing' } },
  { op: 'add', item: { id: 'v_customers', kind: 'variable', name: 'customers', value: 300, min: 0, max: 2000, text: 'Customers' } },
  { op: 'add', item: { id: 'v_growth', kind: 'variable', name: 'growth', value: 5, min: 0, max: 20, text: 'Monthly growth %' } },
  { op: 'add', item: { id: 'e_revenue', kind: 'equation', expr: 'revenue = price * customers * (1 + growth / 100)', text: 'Projected revenue' } },
  { op: 'add', item: { id: 'h_churn', kind: 'hypothesis', text: 'Pricing increase raises churn' } },
  { op: 'add', item: { id: 'o_acq', kind: 'observation', text: 'Acquisition costs rose 20% this quarter' } },
  { op: 'add', item: { id: 't_channels', kind: 'matrix', text: 'Channels', columns: ['Channel', 'Customers', 'Cost'], rows: [['Ads', 120, 900], ['Referral', 80, 100]] } },
  { op: 'add', item: { id: 's_plan', kind: 'sequence', text: 'Rollout', steps: ['Announce', 'Grandfather existing', 'Raise'] } },
  { op: 'relate', from: 'h_churn', to: 'q_main', kind: 'about' },
], { by: 'person', at: NOW - DAY });
rec = built.record;
const pid = (name) => rec.rep.items.find((i) => i.kind === 'variable' && i.prim.data.variable === name).id;
const eid = rec.rep.items.find((i) => i.kind === 'equation').id;
const tid = rec.rep.items.find((i) => i.kind === 'matrix').id;
const layout0 = C.sanitizeLayout({ items: Object.fromEntries(rec.rep.items.map((it, k) => [`r:${it.id}`, { x: (k % 4) * 320, y: Math.floor(k / 4) * 200 }])), view: { x: 0, y: 0, k: 1 } });
const ctx = (over = {}) => ({
  key: 'c:lg_test',
  rep: rec.rep,
  layout: layout0,
  selection: [],
  recent: [],
  nodes: [{ id: 'n_obj1', type: 'objective', title: 'Market research' }],
  sources: [
    { id: 's_aaaaaaaa', name: 'Board pack.pdf', created_at: NOW - DAY + 3600_000 },
    { id: 's_bbbbbbbb', name: 'Old notes.txt', created_at: NOW - 10 * DAY },
  ],
  sizeOf: () => ({ w: 260, h: 100 }),
  now: NOW,
  ...over,
});
const plan = (t, over) => Cmd.interpret(t, ctx(over));

console.log('\nreferences');
{
  ok('“this” is the one selected', eq(Res.resolve('this', ctx({ selection: ['r:h_churn'] })).refs, ['r:h_churn']));
  ok('…or, with nothing selected, the one last touched', eq(Res.resolve('it', ctx({ recent: ['r:o_acq'] })).refs, ['r:o_acq']));
  ok('…and is unclear when several are selected', Res.resolve('this', ctx({ selection: ['r:h_churn', 'r:o_acq'] })).how === 'none');
  ok('“these” is the selection', eq(Res.resolve('these', ctx({ selection: ['r:h_churn', 'r:o_acq'] })).refs, ['r:h_churn', 'r:o_acq']));
  ok('names resolve to ids (a variable by its label or its name)', eq(Res.resolve('subscription pricing', ctx()).refs, [`r:${pid('price')}`]) && eq(Res.resolve('customers', ctx()).refs, [`r:${pid('customers')}`]));
  ok('“the revenue model” finds the model’s revenue', Res.resolve('the revenue model', ctx(), { many: true }).refs.includes(`r:${eid}`));
  ok('kinds: “the possibilities”, “the table”', eq(Res.resolve('the possibilities', ctx()).refs, ['r:h_churn']) && eq(Res.resolve('the table', ctx()).refs, [`r:${tid}`]));
  const rel = Res.resolve('everything related to pricing', ctx()).refs;
  ok('“everything related to pricing”: what mentions it, and what that connects to', rel.includes(`r:${pid('price')}`) && rel.includes('r:h_churn') && rel.includes('r:q_main') && !rel.includes('r:o_acq'), JSON.stringify(rel));
  ok('@mentions are exact ids, whatever the words', eq(Res.resolve('@Customers', ctx({ mentions: [{ label: 'Customers', ref: 'r:h_churn' }] })).refs, ['r:h_churn']));
  ok('what cannot be resolved is said, not guessed', Res.resolve('the spaceship', ctx()).how === 'none' && Res.resolve('constructor', ctx()).how === 'none');
}

console.log('\nwhat each instruction does here');
{
  const p = (t, over) => {
    const r = plan(t, over);
    return r.kind === 'plan' ? r.plan : r;
  };
  const g = p('Turn this into a graph.', { selection: [`r:${tid}`] });
  ok('“turn this into a graph”: a table with two number columns becomes a plot — its view, not its data', g.rep?.[0]?.op === 'view' && g.rep[0].as === 'plot' && !g.ask, JSON.stringify(g));
  const tl = p('Show this as a timeline', { selection: ['r:s_plan'] });
  ok('steps shown as a timeline, deterministically', tl.rep?.[0]?.as === 'timeline');
  const words = p('Turn this into a model', { selection: ['r:o_acq'] });
  ok('a change that needs reasoning goes to the intelligence layer, originals kept', !!words.ask && /Keep the originals/.test(words.ask.text) && !words.rep, JSON.stringify(words));
  const grp = p('Group everything related to pricing.');
  const members = Object.keys(grp.layout?.items ?? {});
  ok('“group everything related to pricing”: one group of what relates', Object.keys(grp.layout?.groups ?? {}).length === 1 && members.includes(`r:${pid('price')}`) && members.includes('r:h_churn'), JSON.stringify(grp.layout));
  const both = p('Group these and then collapse them', { selection: ['r:h_churn', 'r:o_acq'] });
  const gid = Object.keys(both.layout?.groups ?? {})[0];
  ok('“group these and then collapse them”: one change, the new group collapsed', !!gid && both.layout.groups[gid].collapsed === true && both.layout.items['r:h_churn'].group === gid, JSON.stringify(both.layout));
  const mv = p('Move this next to the revenue model.', { selection: ['r:o_acq'] });
  const target = layout0.items[`r:${eid}`];
  ok('“move this next to the revenue model”: placed to its right', mv.layout?.items?.['r:o_acq']?.x > target.x && mv.layout.items['r:o_acq'].y === target.y, JSON.stringify(mv));
  const cn = p('Connect subscription pricing to projected revenue.');
  ok('“connect subscription pricing to projected revenue”: a relation between those two components', cn.rep?.[0]?.op === 'relate' && cn.rep[0].from === pid('price') && cn.rep[0].to === eid && cn.rep[0].status === 'established', JSON.stringify(cn));
  const bl = p('Show me where else this assumption is being used.', { selection: [`r:${pid('growth')}`] });
  ok('“show me where else this assumption is being used”: its backlinks inspected', bl.ui?.some((u) => u.do === 'inspect' && u.section === 'backlinks' && u.ref === `r:${pid('growth')}`));
  const fl = p('Hide everything unrelated to acquisition.');
  ok('“hide everything unrelated to acquisition”: only what relates is shown (nothing removed)', fl.ui?.[0]?.do === 'filter' && eq(fl.ui[0].refs, ['r:o_acq']) && !fl.rep && !fl.layout);
  const fs = p('Find the document I uploaded yesterday.');
  ok('“find the document I uploaded yesterday”: the one uploaded then, opened', fs.ui?.[0]?.do === 'viewer' && fs.ui[0].sourceId === 's_aaaaaaaa', JSON.stringify(fs));
  const grouped = G.applyPatch(layout0, G.groupPatch(layout0, ['r:h_churn', 'r:o_acq'], { gid: 'g_cccccc', name: 'Risks' }));
  const col = p('Collapse this group.', { layout: grouped, selection: ['r:h_churn'] });
  ok('“collapse this group”, with a member selected: its group collapses', col.layout?.groups?.g_cccccc?.collapsed === true);
  const org = p('Organize this workspace.');
  ok('“organise this workspace”: what is loose arranged, by kind', Object.keys(org.layout?.items ?? {}).length >= 5);
  ok('“undo everything I just did”: the engine’s burst undo', p('Undo everything I just did.').history?.undo === 'burst');
  const cmp = p('Compare these two artifacts.', { selection: [`r:${tid}`, 'r:s_plan'] });
  ok('“compare these two artifacts”: a question about exactly those two', !!cmp.ask && eq(cmp.ask.refs, [`r:${tid}`, 'r:s_plan']));
  const nw = p('Create a new workspace for market research.');
  ok('“create a new workspace for market research”: a new objective, opened', nw.nodes?.[0]?.do === 'create' && nw.nodes[0].title === 'Market research' && nw.nodes[0].then === 'navigate');
  const ver = p('Create another version assuming slower growth.', { selection: [`r:${pid('price')}`, `r:${pid('growth')}`, `r:${eid}`] });
  const copied = O.applyRepOps(rec.rep, ver.rep, { by: 'person', at: NOW }).rep;
  const vals = (rep) => O.valuesOf(rep).values;
  ok('“another version”: an independent copy with new names, then reasoning on the copy only', ver.rep.length === 3 && !!ver.ask && /Change only the copy/.test(ver.ask.text) && Object.keys(vals(copied)).some((k) => /^revenue_\d/.test(k)), JSON.stringify(Object.keys(vals(copied))));
  const growth2 = copied.items.find((i) => i.kind === 'variable' && /^growth_/.test(i.prim.data.variable)).prim.data.variable;
  const moved = O.applyRepOps(copied, [{ op: 'model', ops: [{ op: 'var.set', name: growth2, value: 1 }] }], { by: 'person', at: NOW }).rep;
  ok('…the copy does not move with the original', vals(moved).revenue === vals(copied).revenue && vals(moved)[Object.keys(vals(moved)).find((k) => /^revenue_\d/.test(k))] < vals(copied).revenue, JSON.stringify(vals(moved)));
  const set = p('Set price to 30');
  const after = O.applyRepOps(rec.rep, set.rep, { by: 'person', at: NOW }).rep;
  ok('“set price to 30”: the variable moves and the model follows, with no assistant', vals(after).revenue === 30 * 300 * 1.05, vals(after).revenue);
  const del = p('Delete these', { selection: ['r:h_churn', 'r:o_acq', 'r:s_plan', `r:${tid}`, 'r:q_main'] });
  ok('removing many asks first; removing one does not', !!del.confirm && !p('Delete this', { selection: ['r:h_churn'] }).confirm);
  const unclear = plan('Move the spaceship next to the plot');
  ok('an object that is not here is said to be unclear', unclear.kind === 'unclear', JSON.stringify(unclear));
}

console.log('\nthe same operation however it is asked for');
{
  const sel = ['r:h_churn', 'r:o_acq'];
  const typed = Cmd.interpret('group these', ctx({ selection: sel }));
  const menu = Cmd.commandById('group').plan(ctx({ selection: sel }), { refs: sel });
  const strip = (pl) => JSON.parse(JSON.stringify(pl.layout).replace(/g_[a-z0-9]{10}/g, 'G'));
  ok('grouping typed and grouping from the toolbar make the same change', typed.kind === 'plan' && eq(strip(typed.plan), strip(menu)));
  const viaModel = Cmd.planFromModel({ command: 'group', refs: sel }, ctx());
  ok('…and so does the assistant asking for it', eq(strip(viaModel), strip(menu)));
  const t1 = Cmd.interpret('connect subscription pricing to projected revenue', ctx());
  const t2 = Cmd.commandById('connect').plan(ctx(), { from: `r:${pid('price')}`, to: `r:${eid}`, direct: true });
  ok('connecting typed and connecting by dragging make the same change', t1.kind === 'plan' && eq(t1.plan.rep, t2.rep));
  ok('the assistant cannot name what is not here, nor run what is not its to run', 'error' in Cmd.planFromModel({ command: 'group', refs: ['r:nothere'] }, ctx()) && 'error' in Cmd.planFromModel({ command: 'new-workspace', title: 'x' }, ctx()) && 'error' in Cmd.planFromModel({ command: 'rm -rf' }, ctx()));
  const offered = Cmd.offered(ctx({ selection: ['r:h_churn', 'r:o_acq'] })).map((c) => c.id);
  ok('two selected: connecting and grouping are offered first', offered[0] === 'group' || offered[0] === 'connect', offered.join());
  ok('one table selected: showing it another way is offered', Cmd.offered(ctx({ selection: [`r:${tid}`] })).some((c) => c.id === 'transform'));
}

console.log('\nslash commands');
{
  const s = (t, over) => {
    const r = Cmd.interpret(t, ctx(over));
    return r.kind === 'plan' ? r.plan : r;
  };
  const th = s('/thought prices may rise');
  ok('/thought: a thought of the person’s, as an interpretation', th.rep?.[0]?.item?.kind === 'statement' && th.rep[0].item.basis === 'interpretation' && th.rep[0].item.text === 'prices may rise');
  const tb = s('/table Price, Cost, Margin');
  ok('/table names its columns', eq(tb.rep?.[0]?.item?.columns, ['Price', 'Cost', 'Margin']));
  const md = s('/model mrr = subscription * subscribers');
  const made = O.applyRepOps(rec.rep, md.rep, { by: 'person', at: NOW }).rep;
  ok('/model: a variable for each name, the equation, its result as a measure — live', md.rep.filter((o) => o.item?.kind === 'variable').length === 2 && O.valuesOf(made).values.mrr === 100, JSON.stringify(O.valuesOf(made).values.mrr));
  ok('/plot with a table selected shows the table as a plot', s('/plot', { selection: [`r:${tid}`] }).rep?.[0]?.as === 'plot');
  ok('/plot with words makes a plot of them', s('/plot sin(x)').rep?.[0]?.item?.kind === 'plot');
  ok('/timeline 1914: war; 1918: peace makes a timeline in order', s('/timeline 1914: war; 1918: peace').rep?.[0]?.item?.events?.length === 2);
  ok('/diagram A -> B -> C joins them in order', s('/diagram Idea -> Test -> Launch').rep?.[0]?.item?.connectors?.length === 2);
  ok('/undo is undo', s('/undo').history?.undo === 1);
  ok('/group groups the selection', !!s('/group Risks', { selection: ['r:h_churn', 'r:o_acq'] }).layout?.groups);
  ok('/connect with two selected asks what the connection means', s('/connect', { selection: ['r:h_churn', 'r:o_acq'] }).ui?.[0]?.do === 'connect');
  ok('an unknown /word is not a command', Cmd.readSlash('/frobnicate') === null);
  ok('every slash command is one of the engine’s commands', Cmd.SLASH.every((x) => !!Cmd.commandById(x.to('', ctx({ selection: ['r:h_churn', 'r:o_acq'] })).command)));
}

console.log('\nrepresentations of the same information');
{
  const table = rec.rep.items.find((i) => i.kind === 'matrix');
  ok('a table with two number columns: table, plot, bars, measures', eq(Xf.viewsFor(table).map((v) => v.as), ['table', 'plot', 'bars', 'metrics']));
  const one = O.applyRepOps(R.EMPTY_REPRESENTATION, [{ op: 'add', item: { id: 'tt', kind: 'matrix', columns: ['Option', 'Score'], rows: [['A', 3], ['B', 5]] } }], { by: 'person', at: 1 }).rep.items[0];
  ok('with one number column: no plot, but bars', eq(Xf.viewsFor(one).map((v) => v.as), ['table', 'bars', 'metrics']) && Xf.viewNamed(one, 'graph').as === 'bars');
  const eqn = O.applyRepOps(R.EMPTY_REPRESENTATION, [{ op: 'add', item: { id: 'f', kind: 'equation', expr: 'f(x) = x^2' } }, { op: 'add', item: { id: 'g', kind: 'equation', expr: 'k = 3' } }], { by: 'person', at: 1 }).rep.items;
  ok('a function of x can be drawn; a constant cannot', Xf.viewsFor(eqn[0]).some((v) => v.as === 'plot') && Xf.viewsFor(eqn[1]).length === 0);
  const shown = O.applyRepOps(rec.rep, [{ op: 'view', id: tid, as: 'plot' }], { by: 'person', at: NOW }).rep;
  const back = O.applyRepOps(shown, [{ op: 'view', id: tid, as: 'table' }], { by: 'person', at: NOW }).rep;
  ok('changing the view loses nothing: back to a table, the data is as it was', eq(back.items.find((i) => i.id === tid).prim, table.prim) && !back.items.find((i) => i.id === tid).view);
  ok('a view a kind does not have is refused', O.applyRepOps(rec.rep, [{ op: 'view', id: 'h_churn', as: 'plot' }], { by: 'person', at: NOW }).skipped.length === 1);
  ok('analytical transformations are offered for words, comparisons for two', Xf.analyticalFor([rec.rep.items.find((i) => i.id === 'o_acq')]).some((a) => /model/.test(a.label)) && Xf.analyticalFor([table, rec.rep.items.find((i) => i.id === 's_plan')]).some((a) => a.label === 'Compare them'));
}

console.log('\nplacing what is new');
{
  const rep = rec.rep;
  const l = X.RepLayout.placeRep({ items: {} }, rep, rep.items.map((i) => i.id), [], (r) => X.RepLayout.estimateSize(rep.items.find((i) => `r:${i.id}` === r) ?? rep.items[0]));
  const at = (id) => l.items[`r:${id}`];
  ok('every item is placed once, nothing on top of anything', rep.items.every((i) => at(i.id)) && rep.items.every((a, k) => rep.items.slice(k + 1).every((b) => { const A = at(a.id), B = at(b.id); const sa = X.RepLayout.estimateSize(a), sb = X.RepLayout.estimateSize(b); return A.x + sa.w <= B.x || B.x + sb.w <= A.x || A.y + sa.h <= B.y || B.y + sb.h <= A.y; })));
  ok('a possibility goes to the right of its question; what is known to the left', at('h_churn').x > at('q_main').x && at('o_acq').x < at('q_main').x, JSON.stringify([at('q_main'), at('h_churn'), at('o_acq')]));
  const again = X.RepLayout.placeRep(l, rep, rep.items.map((i) => i.id), [], () => ({ w: 200, h: 80 }));
  ok('what is placed stays where it is', eq(again.items, l.items));
}

console.log(`\nnew-logos-engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
