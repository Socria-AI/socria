// test/seeds.test.mjs — an empty line of thinking as ideas to explore (lib/logos5/seeds.ts), and the big +
// that replaced the box at the Universal Map's foot.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from './.tmp/seeds.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let failed = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? `\n      ${detail}` : ''}`);
  if (!cond) failed += 1;
};
const all = (groups) => groups.flatMap((g) => g.seeds);

console.log('\n=== someone new ===');
const fresh = S.buildSeeds({ day: 20_000 });
ok('two clusters of fresh ideas, so the map has a shape', fresh.length === 2 && fresh.every((g) => g.kind === 'new'), JSON.stringify(fresh.map((g) => g.name)));
ok('five ideas in all', all(fresh).length === 5);
ok('every idea has a short label and a whole question', all(fresh).every((s) => s.label.length <= 44 && s.prompt.length > s.label.length - 1 && /[?.]$/.test(s.prompt)));
ok('a different few each day', S.freshFor(20_000, 5).map((s) => s.label).join() !== S.freshFor(20_001, 5).map((s) => s.label).join());
ok('never the same idea twice in a day', new Set(S.freshFor(20_000, 9).map((s) => s.label)).size === S.freshFor(20_000, 9).length);

console.log('\n=== someone with history ===');
const mine = S.buildSeeds({
  day: 20_000,
  pending: [
    { label: 'Were the alliances to blame', type: 'question', updatedAt: 3 },
    { label: 'Producers respond instantly to price', type: 'assumption', updatedAt: 5 },
    { label: 'A goal is not unfinished business', type: 'goal', updatedAt: 9 },
  ],
  recent: [
    { title: 'Ambition in Macbeth', updatedAt: 8 },
    { title: 'New line of thinking', updatedAt: 9 },
    { title: 'Why does my basil keep dying?', updatedAt: 7 },
  ],
});
const byKind = (k) => mine.find((g) => g.kind === k);
ok('what was left open comes first', mine[0]?.kind === 'open' && mine[0].name === 'Left open');
ok('…with the newest first, and an opener that fits its kind', byKind('open').seeds[0].prompt === 'Test this assumption: Producers respond instantly to price' && byKind('open').seeds[1].prompt === 'Were the alliances to blame');
ok('a goal is not offered as unfinished business', !all(mine).some((s) => /goal is not/.test(s.label)));
ok('where they might go further, from what they named', byKind('further').seeds[0].label === 'Ambition in Macbeth' && /question about it I haven’t asked yet/.test(byKind('further').seeds[0].prompt));
ok('an unnamed line is never offered', !all(mine).some((s) => /New line of thinking/.test(s.label)));
ok('a question is offered as they asked it, and quoted in what it asks', byKind('further').seeds.some((s) => s.label === 'Why does my basil keep dying?' && s.prompt.startsWith('I asked “Why does my basil keep dying?” before.')), JSON.stringify(byKind('further').seeds));
ok('always something new, and never more than eight ideas', !!byKind('new') && all(mine).length <= 8 && mine.length <= 3);
ok('no idea twice', new Set(all(mine).map((s) => s.label.toLowerCase())).size === all(mine).length);

console.log('\n=== the drawing ===');
const L = S.seedLayout(mine, 1200, 640);
const spots = L.groups.flatMap((g) => g.bubbles);
ok('the centre is in the middle', L.center.x === 600 && L.center.y === 320 && L.center.d >= 150);
ok('every bubble stays inside the box', spots.every((b) => b.x - b.d / 2 >= 0 && b.x + b.d / 2 <= 1200 && b.y - b.d / 2 >= 0 && b.y + b.d / 2 <= 640), JSON.stringify(spots));
ok('bubbles grow with what they say, within bounds', S.bubbleSize('Short') === 112 && S.bubbleSize('x'.repeat(80)) === 156);
const overlap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < (a.d + b.d) / 2 - 6;
const clash = [];
for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) if (overlap(spots[i], spots[j])) clash.push([i, j]);
ok('no two bubbles sit on each other', clash.length === 0, JSON.stringify(clash));
ok('no bubble sits on the centre', spots.every((b) => !overlap(b, L.center)));
ok('deterministic', JSON.stringify(S.seedLayout(mine, 1200, 640)) === JSON.stringify(L));

// a name's pill and a bubble: the nearest point of the pill to the bubble's middle, against its radius
const onName = (b, n) => {
  const box = S.nameBox(n.label);
  const nx = Math.max(n.x - box.w / 2, Math.min(n.x + box.w / 2, b.x));
  const ny = Math.max(n.y - box.h / 2, Math.min(n.y + box.h / 2, b.y));
  return Math.hypot(b.x - nx, b.y - ny) < b.d / 2 - 2;
};
const someoneElse = S.buildSeeds({ day: 3, pending: [{ label: 'Approximate the area under x squared from 0 to 2 with rectangles', type: 'question' }, { label: 'Not enough sun', type: 'assumption' }, { label: 'Why does my basil keep dying?', type: 'question' }], recent: [{ title: 'Area under a curve with rectangles' }, { title: 'Can I afford to move out?' }] });
const bad = [];
for (const [w, h] of [[1200, 640], [1392, 622], [1600, 800], [1024, 560], [800, 520], [700, 460]]) {
  for (const [who, groups] of [['new', fresh], ['mine', mine], ['other', someoneElse]]) {
    const Lx = S.seedLayout(groups, w, h);
    const sp = Lx.groups.flatMap((g) => g.bubbles);
    const names = Lx.groups.map((g) => g.name);
    const why = [];
    if (!sp.every((b) => b.x - b.d / 2 >= 0 && b.x + b.d / 2 <= w && b.y - b.d / 2 >= 0 && b.y + b.d / 2 <= h)) why.push('outside');
    for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) if (overlap(sp[i], sp[j])) why.push(`bubbles ${i}/${j}`);
    if (sp.some((b) => overlap(b, Lx.center))) why.push('centre');
    sp.forEach((b, i) => names.forEach((n) => onName(b, n) && why.push(`bubble ${i} on ${n.label}`)));
    names.forEach((n) => {
      const box = S.nameBox(n.label);
      const nx = Math.max(n.x - box.w / 2, Math.min(n.x + box.w / 2, Lx.center.x));
      const ny = Math.max(n.y - box.h / 2, Math.min(n.y + box.h / 2, Lx.center.y));
      if (Math.hypot(Lx.center.x - nx, Lx.center.y - ny) < Lx.center.d / 2) why.push(`${n.label} on the centre`);
    });
    if (why.length) bad.push(`${w}×${h} ${who}: ${why.join(', ')}`);
  }
}
ok('at every size, nothing sits on anything: bubbles, the centre, the names', bad.length === 0, bad.join(' | '));
const two = S.seedLayout(fresh, 1200, 640).groups;
ok('two groups face each other across the centre', two.length === 2 && two[0].name.x < 600 && two[1].name.x > 600, JSON.stringify(two.map((g) => g.name)));

console.log('\n=== wired where it belongs ===');
const uni = read('components/logos5/Universe.tsx');
// Logos 6: the box also comes back when "/" asks to search the map (or a search is under way) — it was unreachable
ok('the + is drawn in the map itself, in every lens — no pill under it — and the box comes back only to carry an opening, or when "/" asks to search', /const startable = !!onNew && !startWith;/.test(uni) && (uni.match(/onStart: startable \? onNew : undefined/g) ?? []).length === 2 && /\{\(!startable \|\| findOpen \|\| !!query\) && \(\s*<div\s+className="l5h-omni"/.test(uni) && /const \[findOpen, setFindOpen\] = useState\(false\)/.test(uni) && !/className="l5h-new"/.test(uni) && /<StartDisc /.test(read('components/logos5/UniverseBubbles.tsx')) && /<StartDisc /.test(read('components/logos5/UniverseTime.tsx')) && (uni.match(/<EmptyStart /g) ?? []).length === 3);
ok('N starts something new, never while typing', /e\.key !== 'n' && e\.key !== 'N'/.test(uni) && /closest\('input, textarea, select/.test(uni));
const app = read('components/LogosApp.tsx');
ok('the + opens a new line of thinking', /onNew=\{\(\) => void newFromHome\(\)\}/.test(app));
ok('an empty line opens on ideas, which fill the chatbox and are never sent by themselves', /<IdeaSeeds/.test(app) && /setInput\(seed\.prompt\);\s*focusComposer\(\);/.test(app));
const space = read('components/logos5/L5Space.tsx');
ok('the space shows them only while it is empty, and pressing them never moves the space', /const seeding = !!empty && !ideas\.length && !brought\.length && !made\.length && !turns\.length/.test(space) && /\.ls-seeds-box'\)\) return null/.test(space));
ok('a phone shows them too, in the feed, in place of the waiting card', space.indexOf('const seeding') < space.indexOf('if (narrow) {') && /\{kind === 'all' && seeding && <div className="ls-seeds-box is-narrow">\{empty\}<\/div>\}/.test(space) && /\{kind === 'all' && !seeding && \(/.test(space));
const seedsCss = read('components/logos5/seeds.css');
ok('the bubbles use only the system’s type sizes and radii', [...seedsCss.matchAll(/font-size:\s*([0-9.]+)px/g)].every((m) => ['10.5', '12.5', '13.5', '15.5', '18', '32'].includes(m[1])) && [...seedsCss.matchAll(/border-radius:\s*([^;]+);/g)].every((m) => m[1].trim().split(/\s+/).every((v) => ['6px', '10px', '16px', '999px', '0'].includes(v))));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
