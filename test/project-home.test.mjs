// Project Home: what opening a Project shows, decided from what is in it.
//
// The failures that matter are not visual. A theme or a question that the
// person never wrote. Progress claimed for them. A suggestion of Socria's
// counted as their idea. A synthesis citing a conversation that is not in the
// Project. A visual forced on content that does not fit it. A fifty-chat
// Project that cannot be read. Each is held down here.

import {
  buildHome, chooseVisual, overview, continueWith, resources, groupChats, openQuestions,
  synthesizeFromStructure, synthesisDigest, sanitizeSynthesis, cleanIcon, cleanColor, VISUAL_NAME,
} from './.tmp/project-home.mjs';
import { evidenceLayout, roadmapLayout, timelineLayout, webLayout, madeThings } from './.tmp/project-visual.mjs';
import { buildAtlas, projectGraph } from './.tmp/atlas.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 8);
const n = (id, type, label, extra = {}) => ({ id, type, label, ...extra });
const research = {
  id: 'r1', title: 'Does sleep affect recall?', kind: 'logos', updatedAt: NOW - 2 * DAY, createdAt: NOW - 40 * DAY,
  map: {
    context: 'researching', building: { kind: 'research' },
    nodes: [
      n('q', 'question', 'Does sleep consolidate memory?'),
      n('c', 'claim', 'Sleep improves recall'),
      n('e1', 'evidence', 'Walker 2017 found 20% gains'),
      n('e2', 'evidence', 'A replication failed'),
      n('s', 'idea', 'Try a sleep diary', { origin: 'socria' }),
      n('st', 'step', 'x = 3'),
    ],
    edges: [{ from: 'e1', to: 'c', relation: 'supports' }, { from: 'e2', to: 'c', relation: 'conflicts' }],
  },
};
const research2 = {
  id: 'r2', title: 'Sleep and exams', kind: 'logos', updatedAt: NOW - 1 * DAY, createdAt: NOW - 10 * DAY,
  map: { context: 'researching', nodes: [n('c2', 'claim', 'sleep improves recall'), n('q2', 'question', 'What about naps?'), n('e3', 'evidence', 'Nap study, 2019')], edges: [{ from: 'e3', to: 'c2', relation: 'supports' }], viz: { kind: 'function', expr: 'exp(-x)' }, models: { docs: [{ id: 'm', title: 'Forgetting curve' }] } },
};
const core = { id: 'k1', title: 'Planning the study', kind: 'chat', updatedAt: NOW - 30 * DAY, createdAt: NOW - 30 * DAY, map: null };
const CHATS = [research, research2, core];
const GOALS = [{ id: 'g1', label: 'Write the literature review', status: 'active' }, { id: 'g2', label: 'Pick a question', status: 'historical' }];
const FILES = [{ id: 'f1', name: 'notes.txt', bytes: 2048, createdAt: NOW - 5 * DAY }];

console.log('=== the visual follows the content, and the choice stays theirs ===');
{
  const v = chooseVisual(CHATS, GOALS);
  ok('research reads as evidence', v.kind === 'evidence', JSON.stringify(v));
  ok('  with a reason in plain words', /research/i.test(v.why));
  ok('  and every kind the content supports offered', ['evidence', 'ideas', 'roadmap', 'models'].every((k) => v.available.includes(k)), JSON.stringify(v.available));
  const plan = chooseVisual([{ id: 'p', title: 'Launch', kind: 'logos', updatedAt: NOW, map: { building: { kind: 'process' }, context: 'planning', nodes: [n('m', 'milestone', 'Beta')], edges: [] } }]);
  ok('a process reads as a roadmap', plan.kind === 'roadmap', plan.kind);
  const study = chooseVisual([{ id: 's', title: 'Calc', kind: 'logos', updatedAt: NOW, map: { context: 'learning', nodes: [n('a', 'concept', 'Limit'), n('b', 'definition', 'Derivative')], edges: [] } }]);
  ok('studying reads as a concept map', study.kind === 'concepts', study.kind);
  const bare = chooseVisual([core]);
  ok('nothing to read from → the idea map, never a forced shape', bare.kind === 'ideas' && !bare.available.includes('evidence'), JSON.stringify(bare));
  ok('one chat is not a timeline', !bare.available.includes('timeline'));
  ok('every kind has a name', Object.keys(VISUAL_NAME).length === 6);
}

console.log('=== the overview quotes; it never invents ===');
{
  const o = overview({ chats: CHATS, goals: GOALS, files: FILES }, NOW);
  ok('the line says what is here and where it was left', /3 conversations/.test(o.line) && /Sleep and exams/.test(o.line) && /yesterday/.test(o.line), o.line);
  ok('  and since when, when it has been a while', /since/.test(o.line), o.line);
  ok('themes are their own words, from more than one conversation', o.themes[0] === 'Sleep improves recall' && o.recurring, JSON.stringify(o.themes));
  ok('  and only what did recur is called recurring', !o.themes.includes('A replication failed'), JSON.stringify(o.themes));
  const one = overview({ chats: [research], goals: [], files: [] }, NOW);
  ok('with nothing recurring, the most connected few — and not called recurring', one.themes.length > 0 && one.recurring === false, JSON.stringify(one));
  ok('  never Socria\'s suggestion', !o.themes.includes('Try a sleep diary'));
  ok('  never the mechanics of a worked problem', !o.themes.includes('x = 3'));
  ok('open questions, newest conversation first', o.open[0] === 'What about naps?' && o.open.includes('Does sleep consolidate memory?'), JSON.stringify(o.open));
  ok('goals: only what they marked done is done', o.goals.done === 1 && o.goals.open === 1);
  ok('counts are counts', o.counts.chats === 3 && o.counts.logos === 2 && o.counts.models === 1 && o.counts.plots === 1 && o.counts.files === 1, JSON.stringify(o.counts));
  const empty = overview({ chats: [], goals: [], files: [] }, NOW);
  ok('an empty Project says so, and how it fills', /Nothing here yet/.test(empty.line));
  const resolved = openQuestions([{ id: 'z', title: 'z', kind: 'logos', updatedAt: NOW, map: { nodes: [n('a', 'question', 'Settled?', { status: 'resolved' })], edges: [] } }]);
  ok('a question the map marks resolved is not open', resolved.length === 0);
}

console.log('=== continuing ===');
{
  const c = continueWith(CHATS, NOW);
  ok('the most recent conversation', c.id === 'r2' && /yesterday/.test(c.why), JSON.stringify(c));
  ok('  says how many questions wait there', /1 open question/.test(c.why), c.why);
  const quiet = { ...research2, map: { nodes: [], edges: [] } };
  const c2 = continueWith([quiet, { ...research, updatedAt: NOW - 1.5 * DAY }], NOW);
  ok('unless one just before it still holds open questions', c2.id === 'r1', JSON.stringify(c2));
  ok('nothing to continue → nothing', continueWith([], NOW) === null);
}

console.log('=== resources and long lists ===');
{
  const r = resources(CHATS, FILES);
  ok('Logos workspaces, models, plots and files', ['workspace', 'model', 'plot', 'file'].every((k) => r.some((x) => x.kind === k)), JSON.stringify(r.map((x) => x.kind)));
  ok('  each knows where it lives', r.filter((x) => x.kind !== 'file').every((x) => x.chatId) && r.find((x) => x.kind === 'file').fileId === 'f1');
  ok('  newest first', r[0].at >= r[r.length - 1].at);
  const many = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, title: `Chat ${i}`, kind: 'chat', updatedAt: NOW - i * 3 * DAY }));
  const g = groupChats(many, NOW);
  ok('fifty conversations fall into a few groups, not one wall', g.length >= 3 && g.length <= 8 && g[0].label === 'This week', JSON.stringify(g.map((x) => [x.label, x.chats.length])));
  ok('  and none is lost', g.reduce((s, x) => s + x.chats.length, 0) === 50);
}

console.log('=== synthesis: a reading, held to the Project ===');
{
  const s = synthesizeFromStructure(CHATS, GOALS, NOW);
  ok('established: what holds across conversations or what their evidence supports', s.established.some((x) => /sleep improves recall/i.test(x.text) && x.chats.length >= 2), JSON.stringify(s.established));
  ok('unresolved: their open questions', s.unresolved.some((x) => x.text === 'What about naps?'));
  ok('contradictions: what their maps mark as conflicting', s.contradictions.some((x) => /replication failed/.test(x.text)), JSON.stringify(s.contradictions));
  ok('improvements: a goal nothing has touched', s.improvements.some((x) => /literature review/.test(x.text)));
  ok('  never a goal they marked done', !s.improvements.some((x) => /Pick a question/.test(x.text)));
  ok('  says whose reading it is', s.source === 'structure');
  const d = synthesisDigest({ name: 'Sleep', description: 'A study' }, CHATS, GOALS, FILES);
  ok('the model is given the Project, its goals (with what they marked) and each conversation by id', /PROJECT: Sleep/.test(d) && /\[done\]/.test(d) && /\[r1\]/.test(d) && /\[k1\]/.test(d));
  ok('  without Socria\'s suggestions dressed as theirs', !/sleep diary/.test(d));
  const clean = sanitizeSynthesis({ summary: 'You are studying sleep.', established: [{ text: 'Sleep helps', chats: ['r1', 'nope', 7] }, 'Bare string item'], unresolved: [{ text: '' }], contradictions: 'x' }, new Set(['r1', 'r2']));
  ok('a model reading cites only conversations that exist here', JSON.stringify(clean.established[0].chats) === '["r1"]', JSON.stringify(clean));
  ok('  keeps a claim without pretending to a source', clean.established[1].text === 'Bare string item' && clean.established[1].chats.length === 0);
  ok('  drops empties and junk', clean.unresolved.length === 0 && clean.contradictions.length === 0 && clean.source === 'model');
  ok('  and no summary is no reading', sanitizeSynthesis({ established: [] }, new Set()) === null && sanitizeSynthesis(null, new Set()) === null);
}

console.log('=== the marks a Project can wear ===');
{
  ok('a known glyph and colour pass', cleanIcon('evidence') === 'evidence' && cleanColor('plum') === 'plum');
  ok('anything else is refused, not drawn', cleanIcon('<svg onload=x>') === null && cleanColor('#ff0000') === null && cleanIcon(3) === null);
}

console.log('=== the visuals draw only what is there ===');
{
  const graph = { nodes: [
    { id: 'P', type: 'Project', label: 'Sleep', content: '', aliases: [], status: 'active', private: false, provenance: [], importance: .5 },
    { id: 'G', type: 'Goal', label: 'Write the literature review', content: '', aliases: [], status: 'active', private: false, provenance: [], importance: .5 },
    { id: 'M', type: 'Belief', label: 'I sleep badly before exams', content: '', aliases: [], status: 'active', private: false, provenance: [{ conversationId: 'r1' }], importance: .5 },
    { id: 'X', type: 'Decision', label: 'Started medication', content: '', aliases: [], status: 'active', private: true, provenance: [{ conversationId: 'r1' }], importance: .5 },
    { id: 'Z', type: 'Concept', label: 'Unrelated', content: '', aliases: [], status: 'active', private: false, provenance: [], importance: .5 },
  ], edges: [
    { id: 'e1', sourceId: 'G', targetId: 'P', relationship: 'belongs_to' },
    { id: 'e2', sourceId: 'M', targetId: 'P', relationship: 'relevant_to' },
    { id: 'e3', sourceId: 'X', targetId: 'P', relationship: 'relevant_to' },
  ] };
  const mine = projectGraph(graph, 'P', true);
  ok('the owner\'s home: the Project, what is tied to it — never a private memory', mine.nodes.map((x) => x.id).sort().join() === 'G,M,P', JSON.stringify(mine.nodes.map((x) => x.id)));
  ok('  and nothing that is not tied to it', !mine.nodes.some((x) => x.id === 'Z'));
  const theirs = projectGraph(graph, 'P', false);
  ok('a collaborator\'s: the Project and its goals only — nothing Socria learned about the owner', theirs.nodes.map((x) => x.id).sort().join() === 'G,P', JSON.stringify(theirs.nodes.map((x) => x.id)));
  ok('an unknown anchor draws nothing', projectGraph(graph, 'nope', true).nodes.length === 0);

  const atlas = buildAtlas({ graph: mine, chats: CHATS.map((c) => ({ ...c, projectId: 'proj' })), projects: [{ id: 'proj', nodeId: 'P', name: 'Sleep' }], scope: 'all' });
  const web = webLayout(atlas, 'm:P', false, 820, 440);
  ok('the idea map is drawn around the Project', web.place['m:P']?.ring === 0 && web.place['c:r1']?.ring === 1, JSON.stringify(Object.keys(web.place).slice(0, 6)));
  const concepts = webLayout(atlas, 'm:P', true, 820, 440);
  ok('the concept map keeps concepts and questions, not evidence', !concepts.nb.nodes.some((x) => x.type === 'Evidence') && concepts.nb.nodes.some((x) => x.type === 'Question'));
  const ev = evidenceLayout(atlas, 820, 440);
  ok('evidence on the right, what it bears on at the left', ev.evidence.length >= 2 && ev.claims.length >= 1 && ev.evidence.every((p) => p.x > ev.claims[0].x), JSON.stringify(ev));
  ok('  conflicts are told apart from support', ev.links.some((l) => l.rel === 'conflicts') && ev.links.some((l) => l.rel === 'supports'));
  const road = roadmapLayout(atlas, ['k1', 'r1', 'r2'], 820);
  ok('the roadmap is every conversation, in the order it began', road.stops.map((s) => s.chatId).join() === 'k1,r1,r2' && road.stops[0].x < road.stops[2].x);
  const tl = timelineLayout(CHATS.map((c) => ({ id: c.id, at: c.createdAt })), atlas, 820, 360);
  ok('the timeline is in time order, spaced so labels never collide', tl.points.map((p) => p.id).join() === 'r1,k1,r2' && tl.points.every((p, i, a) => i === 0 || p.x - a[i - 1].x >= 43));
  ok('  with an arc for what one carried into a later one', tl.arcs.some((a) => a.from === 'r1' && a.to === 'r2'), JSON.stringify(tl.arcs));
  ok('  named the way it was first said', overview({ chats: CHATS, goals: [], files: [] }, NOW).themes[0] === 'Sleep improves recall');
  ok('models: every model and plot, models first', madeThings(atlas)[0].kind === 'model' && madeThings(atlas).some((x) => x.kind === 'plot'));
}

console.log('=== wiring: the home is the door, the rail stays ===');
{
  const page = read('app/chat/page.tsx');
  ok('pressing a Project opens its home', /onClick=\{\(\) => openProjectHome\(pr\.id\)\}/.test(page));
  ok('  the chevron still only folds', /e\.stopPropagation\(\);\s*toggleFolder\(pr\.id\);/.test(page));
  ok('  and its chats stay in the rail', /kids\.map\(renderRow\)/.test(page));
  ok('opening any chat, or starting one, closes the home', /setActiveId\(item\.id\);\s*setProjectEntry\(null\);\s*setHomeProject\(null\);/.test(page) && /function newChatIn\(p: RailProject\) \{\s*setHomeProject\(null\);/.test(page));
  ok('?p= opens it and follows it', /params\.get\('p'\)/.test(page) && /u\.searchParams\.set\('p', homeProject\)/.test(page));
  ok('a new Logos line of thinking is filed in the Project from Home', /\/chat\?model=\$\{m\}&in=\$\{encodeURIComponent\(pid\)\}/.test(page) && /startIn = pin &&/.test(read('components/LogosApp.tsx')));
  ok('the Logos rail opens it too, without breaking its folders', /onOpenProject \? onOpenProject\(pr\.id\) : toggleFolder\(pr\.id\)/.test(read('components/LogosRail.tsx')));
  const route = read('app/api/projects/[id]/home/route.ts');
  ok('the home route goes through the one gate', /projectAccess\(userId, params\.id\)/.test(route) && /No such Project/.test(route));
  ok('  a collaborator gets the Project, not the owner\'s memory', /projectGraph\(graph, project\.nodeId, personal\)/.test(route) && /personal = role === 'owner'/.test(route));
  ok('  nor the owner\'s instructions to Socria', /\.\.\.\(personal \? \{ instructions: project\.instructions \} : \{\}\)/.test(route));
  const syn = read('app/api/projects/[id]/synthesize/route.ts');
  ok('synthesis is read-only, gated, and falls back to the structure', /projectAccess/.test(syn) && !/persistGraph|remember\(|\.insert\(|\.update\(/.test(syn) && /synthesis: floor/.test(syn));
  ok('  its model reading is held to the Project', /sanitizeSynthesis\(raw, new Set\(chats\.map\(\(c\) => c\.id\)\)\)/.test(syn));
  const patch = read('app/api/projects/[id]/route.ts');
  ok('a mark is only ever a known glyph and colour', /cleanIcon\(body\.icon\)/.test(patch) && /cleanColor\(body\.color\)/.test(patch));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
