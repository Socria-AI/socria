// The Logos rail with Projects in it, and the mark on a row that has a map.
//
// Three things a person asked for, checked on the rendered markup:
//
//  - Projects are in the Logos rail, as folders that hold lines of thinking
//    AND chats — the two kinds share a table, so they share a folder — and a
//    row filed in a folder is not also in the dated list;
//  - a row with a map carries a small map, not the Logos brain: the mark says
//    "this grew a map", which is a fact about the session, not the model;
//  - the context under "Thinking Map" reads Graphing, which covers econ as
//    well as math, where "Math" did not.
//
// Rendered with react-dom/server, because what is asserted is the markup a
// browser would receive, and a snapshot of a component that owns no state of
// its own needs no browser.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { LogosRail } from './.tmp/LogosRail.mjs';
import { CONTEXT_LABEL } from './.tmp/logos.mjs';
import { inspectModel } from './.tmp/inspect.mjs';
import { sanitizeModel } from './.tmp/schema.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { LIBRARY } from './.tmp/library.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const now = Date.now();
const session = (id, title, nodes, projectId = null) => ({
  id, title, messages: [], updatedAt: now - 1000,
  map: { nodes: Array.from({ length: nodes }, (_, i) => ({ id: `${id}-n${i}` })), edges: [] },
  projectId,
});
const chat = (id, title, projectId = null) => ({ id, title, updatedAt: now - 2000, projectId });
const projects = [
  { id: 'p1', name: 'Thesis', archived: false, updatedAt: now },
  { id: 'p2', name: 'Old', archived: true, updatedAt: now },
];
const noop = () => {};
const base = {
  activeId: 'lg1', open: true, syncing: false, cloud: true,
  onSelect: noop, onOpenChat: noop, onNew: noop, onDelete: noop, onRename: noop, onToggle: noop,
};
const render = (props) => renderToStaticMarkup(h(LogosRail, { ...base, ...props }));

// ── the mark ────────────────────────────────────────────────────────
{
  const html = render({ sessions: [session('lg1', 'A map', 3), session('lg2', 'No map', 0)], chats: [chat('c1', 'A chat')] });
  ok('a session with a map carries a square tile of its map', html.includes('s-tile'));
  ok('  drawn with one dot per node', (html.match(/s-tile-(hub|node)/g) || []).length === 3, String((html.match(/s-tile-(hub|node)/g) || []).length));
  ok('  and not the Logos brain', !html.includes('lg-mark'), html.slice(0, 200));
  ok('  with its node count', /<span class="n">3<\/span>/.test(html));
  ok('a session without a map carries the gap', (html.match(/s-gap/g) || []).length === 2);
  ok('a chat row is there, and opens a chat', html.includes('opens in Socria chat'));
}

// ── projects ────────────────────────────────────────────────────────
{
  const sessions = [session('lg1', 'Filed thinking', 2, 'p1'), session('lg2', 'Loose thinking', 1)];
  const chats = [chat('c1', 'Filed chat', 'p1'), chat('c2', 'Loose chat'), chat('c3', 'Gone project', 'px')];
  const plain = render({ sessions, chats });
  ok('without projects there is no Projects section', !plain.includes('aria-label="Projects"'));
  ok('  and every row is in the dated list', ['Filed thinking', 'Loose thinking', 'Filed chat', 'Loose chat'].every((t) => plain.includes(t)));

  const withP = render({
    sessions, chats, projects,
    onNewInProject: noop, onProjectSettings: noop, onCreateProject: async () => 'p3', onMoveSession: noop, onMoveChat: noop,
  });
  ok('with projects there is a Projects section', withP.includes('aria-label="Projects"'));
  ok('  with the live folder', withP.includes('title="Thesis"'));
  ok('  holding both kinds — the count is two', /title="Thesis"[^]*?<span class="n">2<\/span>/.test(withP), withP.match(/title="Thesis"[^]{0,400}/)?.[0]);
  ok('  the archived one is under Archived', /<summary>Archived · 1<\/summary>[^]*?title="Old"/.test(withP));
  ok('  a filed line of thinking is not in the dated list', !withP.includes('Filed thinking'));
  ok('  a filed chat is not either', !withP.includes('Filed chat'));
  ok('  a loose one is', withP.includes('Loose thinking') && withP.includes('Loose chat'));
  ok('  one whose project is gone is simply unfiled', withP.includes('Gone project'));
  ok('  the folder can start a line of thinking', withP.includes('New line of thinking in Thesis'));
  ok('  and open its settings', withP.includes('Thesis settings'));
  ok('  and a new project can be named', withP.includes('aria-label="New project"'));
  ok('  rows can be moved — a session', withP.includes('Move Loose thinking to a project'));
  ok('  and a chat', withP.includes('Move Loose chat to a project'));

  // A host that can file sessions but not chats offers only that.
  const half = render({ sessions, chats, projects, onMoveSession: noop });
  ok('a chat row is not offered a move it cannot make', !half.includes('Move Loose chat to a project') && half.includes('Move Loose thinking to a project'));
  // No way to make a project: no + and no "New project…".
  ok('  nor a new-project control without a maker', !half.includes('aria-label="New project"'));
  // Syncing hides the folders until the list is real.
  const sync = render({ sessions: [], chats: [], projects, syncing: true });
  ok('while loading there are no folders', !sync.includes('aria-label="Projects"'));
}

// ── the chip ────────────────────────────────────────────────────────
{
  const many = Array.from({ length: 7 }, (_, i) => session(`s${i}`, `Session ${i}`, i % 2));
  const html = render({ sessions: many, chats: [] });
  ok('the Maps only chip carries the map glyph', /chip[^]*?map-glyph[^]*?Maps only/.test(html));
}

// ── the label ───────────────────────────────────────────────────────
ok('the math context is called Graphing', CONTEXT_LABEL.math === 'Graphing', CONTEXT_LABEL.math);

// ── the Understand headline ─────────────────────────────────────────
{
  for (const e of LIBRARY.slice(0, 6)) {
    const m = unpack(sanitizeModel(e.build()));
    const i = inspectModel(m);
    ok(`${e.id}: the headline is the title`, i.what === m.title, i.what);
    ok(`  ${e.id}: the grade is a quiet line of its own`, /^[A-Z][a-z-]+ · [A-Z][a-z-]+( — [a-z].*)?$/.test(i.grade ?? ''), i.grade);
    ok(`  ${e.id}: nothing shouts`, !/[A-Z]{4,}/.test(i.grade ?? ''), i.grade);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
