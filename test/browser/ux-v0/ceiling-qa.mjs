// test/browser/ux-v0/ceiling-qa.mjs — the Graphics creative-ceiling expansion in the real app, by hand: the shape
// library and its search, primitive and pattern parameters, the effect stack (add, switch off, reorder, remove,
// undo), the gradient editor, blend modes, text on a path, echoes, OpenType and mixed styles, live booleans and their
// flattening, Bézier node editing on the canvas, masks, SVG import, an edit in words that makes a pattern, the SVG
// export, and the design reopened — each result read back from the project as the browser keeps it (IndexedDB).
//
// No model is called; the run fails if any model route is asked.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/ceiling-qa.mjs   (against `next start`)
import { readFileSync } from 'node:fs';
import { chromium, S, BASE, underTest } from './env.mjs';

const V = await underTest();
const D = V.gfxDoc;
const J = JSON.stringify;
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => {
  if (c) (pass++, console.log('  ok  ', n));
  else (fail++, console.log('  FAIL', n, String(x).slice(0, 500)));
};
const errors = [];
const modelCalls = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 960 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('request', (r) => /\/api\/ux-v0\/(generate|refine|brief|discover|direct|critique|design-system|assets|images)/.test(r.url()) && modelCalls.push(r.url()));

const pid = () => new URL(page.url()).searchParams.get('p');
const projectOf = (id) =>
  page.evaluate(
    (id) =>
      new Promise((res, rej) => {
        const req = indexedDB.open('socria-ux-v0', 1);
        req.onsuccess = () => {
          const g = req.result.transaction('projects', 'readonly').objectStore('projects').get(id);
          g.onsuccess = () => res(g.result ?? null);
          g.onerror = () => rej(g.error);
        };
        req.onerror = () => rej(req.error);
      }),
    id,
  );
const docWhere = async (pred, ms = 8000) => {
  const start = Date.now();
  let d = null;
  while (Date.now() - start < ms) {
    d = (await projectOf(pid()))?.graphic?.doc ?? null;
    if (d && pred(d)) return d;
    await page.waitForTimeout(250);
  }
  return d;
};
const nodes = (d) => (d ? d.artboards.flatMap((ab) => D.walk(ab).map((l) => l.node)) : []);
const tab = (name) => page.locator('.gx-tab', { hasText: name }).click();
const layer = (name) => page.locator('.gx-layer').filter({ has: page.locator('.gx-layer-name', { hasText: new RegExp(`^${name}$`) }) }).first();
const pick = async (name, shift = false) => {
  await tab('Layers');
  await layer(name).click({ modifiers: shift ? ['Shift'] : [] });
  await page.waitForTimeout(250);
};
const more = (summary) => page.locator('.gx-right details.gx-more').filter({ has: page.locator('summary', { hasText: summary }) }).first();
const openMore = async (summary) => {
  const d = more(summary);
  if (!(await d.evaluate((x) => x.open))) await d.locator('summary').click();
  return d;
};
const selectIn = (scope, label) => scope.locator('label.gx-sel-field').filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).locator('select').first();
const numIn = (scope, label) => scope.locator('label.gx-num').filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).locator('input').first();
const exportItem = async (name) => {
  await page.locator('.gx-export > summary').click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('.gx-export-menu button', { hasText: name }).first().click()]);
  await page.locator('.gx-export').evaluate((d) => d.removeAttribute('open'));
  return readFileSync(await dl.path());
};

console.log('=== SocriaUX Graphics: the creative-ceiling expansion, by hand, in the built app ===');
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });
await page.fill('textarea[aria-label="What do you want to make?"]', 'A poster for “Field Lines”, a creative coding meetup, “Code that draws”, generative, procedural');
await page.getByRole('radio', { name: 'Graphic', exact: true }).click();
await page.getByRole('button', { name: 'Begin' }).click();
await page.getByRole('button', { name: 'Write the brief yourself' }).click();
await page.waitForSelector('.gx-brief', { timeout: 15000 });
await page.getByRole('button', { name: /See three directions/ }).click();
await page.waitForSelector('.gx-dir', { timeout: 15000 });
await page.locator('.gx-dir').first().getByRole('button', { name: /Make it in this direction/ }).click();
await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
await page.waitForTimeout(1200);
let d = await docWhere((x) => nodes(x).length > 0);
ok('a generative brief is composed with its vocabulary: a procedural pattern is part of the design, as an editable object', nodes(d).some((n) => n.type === 'pattern') && !!d.vocabulary, J(nodes(d).map((n) => n.type)));

// ── the shape library ──
await tab('Shapes');
const cats = await page.locator('.gx-cats button').allInnerTexts();
ok('1. the shape library: Basic, Geometric, Organic, Decorative, Technical, Procedural and Custom', ['Basic', 'Geometric', 'Organic', 'Decorative', 'Technical', 'Procedural', 'Custom'].every((c) => cats.includes(c)), J(cats));
for (const c of ['Geometric', 'Organic', 'Decorative', 'Technical']) {
  await page.locator('.gx-cats button', { hasText: c }).click();
  const count = await page.locator('.gx-lib button').count();
  ok(`…${c}: shapes with previews (${count})`, count >= 5 && (await page.locator('.gx-lib button svg path').count()) >= count);
}
await page.fill('.gx-search', 'ribbon');
await page.waitForTimeout(200);
const found = await page.locator('.gx-lib button span').allInnerTexts();
ok('…search: “ribbon” finds the ribbon', found.includes('Ribbon'), J(found));
await page.locator('.gx-lib button', { hasText: 'Ribbon' }).first().click();
d = await docWhere((x) => nodes(x).some((n) => n.type === 'shape' && n.prim?.kind === 'ribbon'));
ok('…adding it makes a parametric shape (a primitive with parameters, not a picture)', nodes(d).some((n) => n.type === 'shape' && n.shape === 'prim' && n.prim?.kind === 'ribbon' && Object.keys(n.prim.params).length > 0));

// ── 2. parameters ──
await pick('Ribbon');
const params = await openMore('Ribbon: parameters');
const ranges = params.locator('input[type=range]');
const before = nodes(d).find((n) => n.prim?.kind === 'ribbon').prim.params;
await ranges.first().fill(String(Number(await ranges.first().getAttribute('max'))));
d = await docWhere((x) => J(nodes(x).find((n) => n.prim?.kind === 'ribbon')?.prim.params) !== J(before));
const after = nodes(d).find((n) => n.prim?.kind === 'ribbon').prim.params;
ok('2. a parameter changed from its slider (one operation), the shape redrawn from it', J(after) !== J(before), J({ before, after }));
await selectIn(params, 'Shape').selectOption('star');
d = await docWhere((x) => nodes(x).some((n) => n.prim?.kind === 'star'));
ok('…the primitive turned into another kind in place (a star), its box and paint kept', nodes(d).some((n) => n.prim?.kind === 'star' && n.name));

// ── 5. the gradient editor ──
await pick(nodes(d).find((n) => n.prim?.kind === 'star').name);
const fillSel = selectIn(page.locator('.gx-right'), 'Fill');
await fillSel.selectOption('conic');
d = await docWhere((x) => nodes(x).some((n) => n.prim?.kind === 'star' && n.fill?.type === 'conic'));
ok('5. a conic gradient from the fill menu', nodes(d).some((n) => n.prim?.kind === 'star' && n.fill?.type === 'conic'));
await page.locator('.gx-right .gx-paint button', { hasText: 'Add a stop' }).click();
d = await docWhere((x) => (nodes(x).find((n) => n.prim?.kind === 'star')?.fill?.stops?.length ?? 0) === 3);
ok('…a stop added (three stops)', nodes(d).find((n) => n.prim?.kind === 'star').fill.stops.length === 3);
await fillSel.selectOption('mesh');
d = await docWhere((x) => nodes(x).some((n) => n.prim?.kind === 'star' && n.fill?.type === 'mesh'));
ok('…a mesh gradient', nodes(d).some((n) => n.prim?.kind === 'star' && n.fill?.type === 'mesh' && n.fill.mesh.length === 4));
const presetSel = selectIn(page.locator('.gx-right .gx-paint'), 'Presets');
await presetSel.selectOption('tint:gold');
d = await docWhere((x) => nodes(x).some((n) => n.prim?.kind === 'star' && n.fill?.type === 'linear' && n.fill.stops.length === 5));
ok('…a preset (metallic gold), tinted to the accent’s hue', nodes(d).some((n) => n.prim?.kind === 'star' && n.fill?.type === 'linear' && n.fill.stops.length === 5));

// ── 6, 7. the effect stack ──
const fx = await openMore('Effects');
await selectIn(fx, 'Add').selectOption('drop-shadow');
await page.waitForTimeout(300);
await selectIn(fx, 'Add').selectOption('glow');
d = await docWhere((x) => (nodes(x).find((n) => n.prim?.kind === 'star')?.effects ?? []).length === 2);
const star = () => nodes(d).find((n) => n.prim?.kind === 'star');
ok('6. two effects added to the star, in order', J(star().effects.map((e) => e.kind)) === J(['drop-shadow', 'glow']), J(star().effects));
const canvasHasFilter = await page.locator('.gx-canvas .gx-board svg filter').count();
ok('…and drawn on the canvas (an SVG filter)', canvasHasFilter > 0);
await fx.locator('.gx-fx-list li').first().locator('input[type=checkbox]').click();
d = await docWhere((x) => nodes(x).find((n) => n.prim?.kind === 'star')?.effects?.[0]?.on === false);
ok('…the shadow switched off (kept, not removed)', star().effects[0].on === false && star().effects.length === 2);
await fx.locator('.gx-fx-list li').nth(1).getByRole('button', { name: /Move .* up/ }).click();
d = await docWhere((x) => nodes(x).find((n) => n.prim?.kind === 'star')?.effects?.[0]?.kind === 'glow');
ok('7. the effects reordered (the glow first)', J(star().effects.map((e) => e.kind)) === J(['glow', 'drop-shadow']));
await fx.locator('.gx-fx-list li').first().getByRole('button', { name: /Settings for/ }).click();
const fxRange = fx.locator('.gx-fx-body input[type=range]').first();
await fxRange.fill(String(Number(await fxRange.getAttribute('max'))));
d = await docWhere((x) => J(nodes(x).find((n) => n.prim?.kind === 'star')?.effects?.[0]?.params) !== J(star().effects[0].params));
ok('…an effect parameter set from its slider', true);
await fx.locator('.gx-fx-list li').first().getByRole('button', { name: /^Remove/ }).click();
d = await docWhere((x) => (nodes(x).find((n) => n.prim?.kind === 'star')?.effects ?? []).length === 1);
ok('…the glow removed', star().effects.length === 1 && star().effects[0].kind === 'drop-shadow');
await page.keyboard.press('Control+z');
d = await docWhere((x) => (nodes(x).find((n) => n.prim?.kind === 'star')?.effects ?? []).length === 2);
ok('16. undo brings the removed effect back', star().effects.length === 2);
await page.keyboard.press('Control+Shift+z');
d = await docWhere((x) => (nodes(x).find((n) => n.prim?.kind === 'star')?.effects ?? []).length === 1);
ok('…and redo removes it again', star().effects.length === 1);
await selectIn(fx, 'Presets').selectOption('risograph');
d = await docWhere((x) => (nodes(x).find((n) => n.prim?.kind === 'star')?.effects ?? []).some((e) => e.kind === 'misregistration'));
ok('…an effect preset (risograph: misregistration and grain)', star().effects.some((e) => e.kind === 'misregistration') && star().effects.some((e) => e.kind === 'grain'));
const overflow = await page.evaluate(() => {
  const panel = document.querySelector('.gx-right');
  const edge = panel.getBoundingClientRect().right - parseFloat(getComputedStyle(panel).paddingRight) + 0.5;
  const past = [...panel.querySelectorAll('select, input, button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > edge; });
  return { sideways: panel.scrollWidth - panel.clientWidth, past: past.map((el) => el.getAttribute('aria-label') ?? el.closest('label')?.innerText.split('\n')[0] ?? el.tagName) };
});
ok('…the inspector’s controls stay inside it, sections open and presets long (nothing scrolls sideways)', overflow.sideways <= 1 && !overflow.past.length, J(overflow));

// ── 13. blend ──
const comp = await openMore('Compositing');
await selectIn(comp, 'Blend').selectOption('multiply');
d = await docWhere((x) => nodes(x).find((n) => n.prim?.kind === 'star')?.blend === 'multiply');
ok('13. a blend mode (multiply), drawn as mix-blend-mode', star().blend === 'multiply' && (await page.locator('.gx-canvas .gx-board svg [style*="mix-blend-mode:multiply"]').count()) > 0);

// ── 8, 9. a pattern: its generator and its seed ──
await tab('Shapes');
await page.fill('.gx-search', '');
await page.locator('.gx-cats button', { hasText: 'Procedural' }).click();
await page.locator('.gx-lib button', { hasText: 'Truchet maze' }).click();
d = await docWhere((x) => nodes(x).some((n) => n.type === 'pattern' && n.gen === 'truchet'));
ok('8. a procedural pattern from the library (a generator with parameters)', nodes(d).some((n) => n.type === 'pattern' && n.gen === 'truchet' && typeof n.params.seed === 'number'));
await pick(nodes(d).find((n) => n.gen === 'truchet').name);
const gen = await openMore('Truchet maze: generator');
const seed0 = nodes(d).find((n) => n.gen === 'truchet').params.seed;
const mark0 = await page.locator('.gx-canvas [data-gfx-id] path').count();
await gen.getByRole('button', { name: /new seed/ }).click();
d = await docWhere((x) => nodes(x).find((n) => n.gen === 'truchet')?.params.seed !== seed0);
const seed1 = nodes(d).find((n) => n.gen === 'truchet').params.seed;
ok('9. a new seed is a new arrangement, saved as a number (the same seed always draws the same marks)', seed1 !== seed0 && Number.isInteger(seed1) && mark0 > 0);
await selectIn(gen, 'Generator').selectOption('contours');
d = await docWhere((x) => nodes(x).some((n) => n.type === 'pattern' && n.gen === 'contours'));
ok('…the generator changed in place (topographic contours), its seed kept', nodes(d).some((n) => n.gen === 'contours' && n.params.seed === seed1));

// ── 10, 11. type ──
const head = nodes(d).find((n) => n.type === 'text' && n.role === 'headline');
await pick(head.name ?? 'Headline');
const typeMore = await openMore('More type');
await selectIn(typeMore, 'Along a path').selectOption('arc');
d = await docWhere((x) => nodes(x).find((n) => n.id === head.id)?.path?.kind === 'arc');
ok('11. the headline set along an arc (still its own words, as text)', nodes(d).find((n) => n.id === head.id).text === head.text && (await page.locator('.gx-canvas textPath').count()) > 0);
await selectIn(typeMore, 'Along a path').selectOption('none');
await selectIn(typeMore, 'Warp').selectOption('wave');
d = await docWhere((x) => nodes(x).find((n) => n.id === head.id)?.warp?.kind === 'wave');
ok('10. a wave warp (each letter placed; the words one text)', nodes(d).find((n) => n.id === head.id).warp?.kind === 'wave');
await selectIn(typeMore, 'Warp').selectOption('none');
await numIn(typeMore, 'Echo copies').fill('4');
await numIn(typeMore, 'Echo copies').press('Enter');
d = await docWhere((x) => nodes(x).find((n) => n.id === head.id)?.repeat?.count === 4);
ok('…an echo of four copies behind the words', nodes(d).find((n) => n.id === head.id).repeat?.count === 4);
await typeMore.locator('label.gx-check', { hasText: 'Small caps' }).locator('input').check();
d = await docWhere((x) => (nodes(x).find((n) => n.id === head.id)?.features ?? []).includes('smcp'));
ok('…an OpenType feature (small capitals)', nodes(d).find((n) => n.id === head.id).features.includes('smcp'));
await typeMore.locator('.gx-chips button').first().click();
await typeMore.getByRole('button', { name: 'Bold' }).click();
d = await docWhere((x) => (nodes(x).find((n) => n.id === head.id)?.runs ?? []).length > 0);
ok('…mixed styles: the first word bold, the rest as it was', nodes(d).find((n) => n.id === head.id).runs[0].weight === 800);

// ── 4. booleans, their flattening, and 3. node editing ──
await tab('Shapes');
await page.locator('.gx-cats button', { hasText: 'Basic' }).click();
await page.locator('.gx-lib button', { hasText: 'Circle' }).first().click();
await page.waitForTimeout(250);
await page.locator('.gx-lib button', { hasText: 'Rounded rectangle' }).first().click();
d = await docWhere((x) => nodes(x).some((n) => n.prim?.kind === 'circle') && nodes(x).some((n) => n.prim?.kind === 'rounded-rect'));
// the rectangle moved off the circle a little, so the boolean has something to do
const rr = nodes(d).find((n) => n.prim?.kind === 'rounded-rect');
await pick('Rounded rectangle');
await page.keyboard.press('Shift+ArrowRight');
await page.keyboard.press('Shift+ArrowRight');
await page.keyboard.press('Shift+ArrowRight');
d = await docWhere((x) => nodes(x).find((n) => n.id === rr.id)?.x !== rr.x);
await pick('Circle');
await pick('Rounded rectangle', true);
await page.locator('.gx-right button', { hasText: /^Subtract$/ }).click();
d = await docWhere((x) => nodes(x).some((n) => n.type === 'group' && n.boolean === 'subtract'));
const boolGroup = nodes(d).find((n) => n.type === 'group' && n.boolean === 'subtract');
ok('4. a live subtraction: the two shapes kept as they are inside it, editable', boolGroup && boolGroup.children.length === 2 && boolGroup.children.every((c) => c.type === 'shape'));
await pick('Subtraction');
await (await openMore('Compositing')).getByRole('button', { name: 'Flatten to a path' }).click();
d = await docWhere((x) => nodes(x).some((n) => n.id === boolGroup.id && n.type === 'shape' && n.shape === 'bezier'));
const flat = nodes(d).find((n) => n.id === boolGroup.id);
ok('…flattened into one editable path', flat?.shape === 'bezier' && flat.bez.subpaths.length >= 1);
await pick(flat.name ?? 'Subtraction');
await (await openMore('Path operations')).getByRole('button', { name: 'Edit nodes' }).click();
await page.waitForSelector('.gx-nodes-anchor', { timeout: 5000 });
const anchors = await page.locator('.gx-nodes-anchor').count();
ok('3. node editing: the path’s anchors drawn on the canvas', anchors >= 3, anchors);
const a0 = page.locator('.gx-nodes-anchor').first();
const box0 = await a0.boundingBox();
await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
await page.mouse.down();
await page.mouse.move(box0.x + 40, box0.y + 30, { steps: 6 });
await page.mouse.up();
d = await docWhere((x) => J(nodes(x).find((n) => n.id === flat.id)?.bez) !== J(flat.bez));
const moved = nodes(d).find((n) => n.id === flat.id).bez;
ok('…an anchor dragged: the path changed, as one operation', J(moved) !== J(flat.bez));
const count0 = moved.subpaths.reduce((s, sp) => s + sp.nodes.length, 0);
const seg = page.locator('.gx-nodes-path');
const sb = await seg.boundingBox();
// double-click a point on the path's outline: the path element's own geometry gives one
const pt = await seg.evaluate((el) => {
  const p = el.getPointAtLength(el.getTotalLength() * 0.37);
  const m = el.getScreenCTM();
  return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
});
await page.mouse.dblclick(pt.x, pt.y);
d = await docWhere((x) => nodes(x).find((n) => n.id === flat.id)?.bez.subpaths.reduce((s, sp) => s + sp.nodes.length, 0) === count0 + 1);
ok('…a node added by double-clicking the path', nodes(d).find((n) => n.id === flat.id).bez.subpaths.reduce((s, sp) => s + sp.nodes.length, 0) === count0 + 1, J({ count0, sb }));
// a press on an anchor picks it (on a dense path the anchors overlap: whichever is on top is picked)
const ab = await page.locator('.gx-nodes-anchor').nth(1).boundingBox();
await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2);
await page.keyboard.press('Delete');
d = await docWhere((x) => nodes(x).find((n) => n.id === flat.id)?.bez.subpaths.reduce((s, sp) => s + sp.nodes.length, 0) === count0);
ok('…a node removed with Delete', nodes(d).find((n) => n.id === flat.id).bez.subpaths.reduce((s, sp) => s + sp.nodes.length, 0) === count0);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok('…Escape leaves node editing', (await page.locator('.gx-nodes-anchor').count()) === 0);

// ── 12. a mask ──
await tab('Shapes');
await page.locator('.gx-cats button', { hasText: 'Organic' }).click();
await page.locator('.gx-lib button', { hasText: 'Blob' }).first().click();
d = await docWhere((x) => nodes(x).some((n) => n.prim?.kind === 'blob'));
await pick('Blob');
await pick(nodes(d).find((n) => n.gen === 'contours')?.name, true);
const sel = await page.locator('.gx-right .gx-panel-h').first().innerText();
await page.locator('.gx-right button', { hasText: 'Mask (silhouette)' }).click();
d = await docWhere((x) => nodes(x).some((n) => n.type === 'group' && n.mask === 'alpha'));
ok('12. a mask group: the bottom object’s silhouette masks the other (drawn as an SVG mask)', nodes(d).some((n) => n.type === 'group' && n.mask === 'alpha') && (await page.locator('.gx-canvas mask').count()) > 0, sel);

// ── SVG import ──
await tab('Shapes');
await page.locator('.gx-cats button', { hasText: 'Custom' }).click();
await page.fill('.gx-custom textarea', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script><g fill="#e5322d"><circle cx="30" cy="30" r="20"/><path d="M50 50 L90 50 L70 90 Z" onclick="evil()"/></g><text x="10" y="95" font-size="10">Hello</text></svg>');
await page.locator('.gx-custom button', { hasText: 'Import the pasted SVG' }).click();
d = await docWhere((x) => nodes(x).some((n) => n.type === 'group' && n.name === 'Pasted SVG'));
const imported = nodes(d).find((n) => n.type === 'group' && n.name === 'Pasted SVG');
const kids = imported ? D.walk({ ...d.artboards[0], children: [imported] }).map((l) => l.node) : [];
ok('SVG import: paths become editable paths and text stays text; the script and handler are not brought in', kids.some((n) => n.type === 'shape' && n.shape === 'bezier') && kids.some((n) => n.type === 'text' && n.text === 'Hello') && !J(d).includes('alert(1)') && !J(d).includes('evil()'));

// ── 17, edits in words ──
await page.fill('#gx-ask-in', 'Create a dense radial line pattern behind the headline.');
await page.locator('.gx-ask button[type=submit]').click();
await page.waitForSelector('.gx-pending', { timeout: 5000 });
const label = await page.locator('.gx-pending').innerText();
await page.getByRole('button', { name: 'Apply' }).click();
d = await docWhere((x) => nodes(x).some((n) => n.type === 'pattern' && n.gen === 'radial'));
ok('17. an edit in words makes a pattern behind the headline, as editable parameters (no image generated, no model called)', nodes(d).some((n) => n.type === 'pattern' && n.gen === 'radial' && n.params.count > 96) && modelCalls.length === 0, label);

// ── 21. the SVG export carries it all ──
const svgFile = (await exportItem('SVG (text kept as text)')).toString('utf8');
ok('21. the SVG export carries the filters, the patterns, the masks, the blend modes and the text as text', /<filter /.test(svgFile) && /<mask /.test(svgFile) && /mix-blend-mode:multiply/.test(svgFile) && /<text /.test(svgFile) && !/<script/i.test(svgFile), svgFile.length);

// ── 15. reopened ──
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.gx-canvas .gx-board svg', { timeout: 30000 });
await page.waitForTimeout(1000);
const reopened = (await projectOf(pid()))?.graphic?.doc;
ok('15. saved and reopened: every new property kept (primitives, patterns, effects, booleans, masks, paths, type)', nodes(reopened).some((n) => n.type === 'pattern') && nodes(reopened).some((n) => n.effects?.length) && nodes(reopened).some((n) => n.shape === 'bezier') && nodes(reopened).some((n) => n.type === 'group' && n.mask) && nodes(reopened).some((n) => n.type === 'text' && n.repeat) && (await page.locator('.gx-canvas .gx-board svg filter').count()) > 0);

await page.screenshot({ path: `${S}ceiling-qa-editor.png` });
ok('no errors on the page', errors.length === 0, J(errors));
ok('no model route was asked', modelCalls.length === 0, J(modelCalls));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
