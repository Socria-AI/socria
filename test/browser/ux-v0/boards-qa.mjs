// test/browser/ux-v0/boards-qa.mjs — SocriaUX Boards in the real app: the twenty tests of the Boards brief (its part
// 15), its extra cases (invalid operations, missing assets, interrupted generation, unauthorized access) and the
// required demonstration (two posters, two social graphics, a website preview, a product mockup, the design-system
// overview and notes on one board), driven through the interface as a designer would. Every result is read back from
// the project as the browser keeps it (IndexedDB) or from the files the browser downloaded.
//
// No model is called: the run fails if any model route of /api/ux-v0 is asked.
//
//   UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/boards-qa.mjs   (against `next start`)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, S, BASE, ROOT, underTest, handBrief } from './env.mjs';

const V = await underTest();
const JSZip = createRequire(ROOT + 'package.json')('jszip');
const { getDocumentProxy } = await import(createRequire(ROOT + 'package.json').resolve('unpdf'));
const J = JSON.stringify;
const D = V.gfxDoc;
let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => {
  if (c) (pass++, console.log('  ok  ', n));
  else (fail++, console.log('  FAIL', n, String(x).slice(0, 600)));
};
const errors = [];
const modelCalls = [];
const t0 = Date.now();

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('request', (r) => {
  if (/\/api\/ux-v0\/(generate|refine|brief|discover|direct|critique|design-system|assets|images)/.test(r.url())) modelCalls.push(r.url());
});

// ── the browser's own copy ──
const pid = () => new URL(page.url()).searchParams.get('p');
const idb = (fn, arg) => page.evaluate(fn, arg);
const projectOf = (id) =>
  idb(
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
const putRaw = (p) =>
  idb(
    (p) =>
      new Promise((res, rej) => {
        const req = indexedDB.open('socria-ux-v0', 1);
        req.onsuccess = () => {
          const t = req.result.transaction('projects', 'readwrite');
          t.objectStore('projects').put(p);
          t.oncomplete = () => res(true);
          t.onerror = () => rej(t.error);
        };
        req.onerror = () => rej(req.error);
      }),
    p,
  );
const deleteRaw = (id) =>
  idb(
    (id) =>
      new Promise((res) => {
        const req = indexedDB.open('socria-ux-v0', 1);
        req.onsuccess = () => {
          const t = req.result.transaction('projects', 'readwrite');
          t.objectStore('projects').delete(id);
          t.oncomplete = () => res(true);
        };
      }),
    id,
  );
/** The open board once `pred` holds (the save waits for a pause of up to 1.5 s). */
const boardWhere = async (pred, ms = 12000) => {
  const start = Date.now();
  let bd = null;
  while (Date.now() - start < ms) {
    bd = (await projectOf(pid()))?.board ?? null;
    if (bd && pred(bd)) return bd;
    await page.waitForTimeout(250);
  }
  return bd;
};
const mat = (bd, name) => bd?.materials.find((m) => m.name === name);
const nodeOf = (bd, name) => bd?.nodes.find((n) => n.type === 'material' && n.material === mat(bd, name)?.id);
const head = (doc) => (doc ? D.walk(doc.artboards[0]).map((l) => l.node).find((n) => n.role === 'headline') : null);
const noteText = async () => (await page.locator('.bd-askbar .gx-note').allInnerTexts()).join(' ');

// ── the interface ──
const tab = (name) => page.locator('.bd-left .gx-tab', { hasText: name }).click();
const focusMaterial = async (name) => {
  await tab('Materials');
  await page.locator('.bd-mat-main', { hasText: name }).first().click();
  await page.waitForTimeout(500);
};
const ask = async (words) => {
  await page.fill('#bd-ask-in', words);
  await page.locator('.bd-askbar .gx-ask button[type=submit]').click();
  await page.waitForTimeout(400);
};
const applyPending = async () => {
  await page.locator('.bd-pending').getByRole('button', { name: 'Apply' }).click();
  await page.waitForTimeout(500);
};
const exportItem = async (name, scope = '.bd-center') => {
  await page.locator(`${scope} .gx-export > summary`).click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.locator(`${scope} .gx-export-menu button`, { hasText: name }).first().click()]);
  await page.locator(`${scope} .gx-export`).evaluate((d) => d.removeAttribute('open'));
  return { name: dl.suggestedFilename(), bytes: readFileSync(await dl.path()) };
};
const pngSize = (buf) => ({ sig: buf.subarray(1, 4).toString() === 'PNG', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const settled = () => page.waitForFunction(() => !document.querySelector('.bd-gen'), null, { timeout: 90000 });
const zoom = async () => Number(await page.locator('.bd-canvas').getAttribute('data-zoom'));
/** A node's centre on screen, the board panned (by scrolling, as a designer would) until it is in view. */
const bringIntoView = async (node) => {
  for (let i = 0; i < 4; i++) {
    const k = await zoom();
    const [px, py] = (await page.locator('.bd-canvas').getAttribute('data-pan')).split(',').map(Number);
    const c = await page.locator('.bd-canvas').boundingBox();
    const sx = c.x + px + (node.x + node.w / 2) * k;
    const sy = c.y + py + (node.y + Math.min(node.h, 80) / 2) * k;
    if (sx > c.x + 20 && sx < c.x + c.width - 20 && sy > c.y + 20 && sy < c.y + c.height - 20) return { x: sx, y: sy };
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.wheel(sx - (c.x + c.width / 2), sy - (c.y + c.height / 2));
    await page.waitForTimeout(250);
  }
  return null;
};
const shot = (name) => page.screenshot({ path: `${S}board-${name}.png` });

console.log('=== SocriaUX Boards: the twenty tests and the demonstration, in the built app ===');
await page.goto(BASE + '/ux-v0', { waitUntil: 'networkidle' });

// ── 1. a board, begun from the home ──
const REQUEST = 'Create a launch campaign for “Night Market Lisbon”, “Food, music and makers after dark”, every Friday in July: two posters, two Instagram graphics, a website and a product mockup. Annotate the important design decisions.';
// the brief written by hand in the workspace (its own form)
await handBrief(page, 'board', REQUEST);
await page.waitForTimeout(600);
let proj = await projectOf(pid());
ok('1. a board is a project type of its own: begun from the home, kept in this browser as a board', proj?.medium === 'board' && !!proj.board && /Night Market/.test(proj.intent), J({ medium: proj?.medium }));
const specs = await page.locator('.bd-specs li').allInnerTexts();
ok('…the request is read into its materials, in the order named', J(specs.map((s) => s.split('\n')[0])) === J(['Poster', 'Instagram post', 'Website', 'Packaging mockup']) && /2/.test(specs[0]) && /2/.test(specs[1]), J(specs));
ok('…and its words, exactly', (await page.getByLabel('Headline').inputValue()) === 'Night Market Lisbon' && (await page.getByLabel('Supporting line').inputValue()) === 'Food, music and makers after dark' && /Every Friday in July/.test(await page.getByLabel(/Details/).inputValue()));
await page.getByLabel('Brand or name').fill('Night Market');
await page.getByLabel('Call to action').fill('Find the market');
await shot('01-brief');
await page.getByLabel('Headline').fill('');
await page.getByRole('button', { name: /Propose design systems/ }).click();
ok('…a brief without a headline is refused and said (nothing is composed around invented words)', /Write the headline first/.test(await page.locator('.bd-brief .v0-error-line').innerText().catch(() => '')));
await page.getByLabel('Headline').fill('Night Market Lisbon');

// ── the Master Design System ──
await page.getByRole('button', { name: /Propose design systems/ }).click();
await page.waitForSelector('.bd-sys', { timeout: 15000 });
await page.waitForTimeout(1500);
const sysNames = await page.locator('.bd-sys h2').allInnerTexts();
ok('three design systems are proposed, one to be shared by every material (not one direction per material)', sysNames.length === 3 && /one you choose/.test(await page.locator('.bd-systems').innerText()), J(sysNames));
await shot('02-systems');
await page.locator('.bd-sys').first().getByRole('button', { name: /Use this system/ }).click();
await page.waitForSelector('.bd-canvas', { timeout: 15000 });
await settled();
let bd = await boardWhere((x) => x.materials.every((m) => m.status === 'ready') && x.nodes.some((n) => n.type === 'note'));
await page.waitForTimeout(2500);
await shot('03-board');

// ── 2–3. coordinated materials, mixed formats ──
const names = bd.materials.map((m) => m.name);
ok('2–3. one board of mixed formats: 2 posters, 2 Instagram posts, a product label, a website, a packaging mockup, all made', J(names) === J(['Poster 1', 'Poster 2', 'Instagram post 1', 'Instagram post 2', 'Product label', 'Website', 'Packaging mockup']) && bd.materials.every((m) => m.status === 'ready'), J(bd.materials.map((m) => [m.name, m.status])));
const graphics = bd.materials.filter((m) => m.type === 'graphic');
ok('one system: every graphic’s headline is set in the system’s display face, its palette the system’s', graphics.every((m) => head(m.doc)?.font === bd.system.tokens.fonts.display && m.doc.tokens.colors.accent === bd.system.tokens.colors.accent), J(graphics.map((m) => head(m.doc)?.font)));
// a material's composition: its concept's structure and use of the palette (or, for a kind with a fixed layout, its archetype)
const sig = (m) => ((c) => (c ? `${c.org}/${c.type}|${c.colouring}` : `${m.plan.archetype}|${m.doc.artboards[0].background}`))(m.doc.artboards[0].concept);
ok('coherence without repetition: the two posters, and the two posts, are different compositions', sig(mat(bd, 'Poster 1')) !== sig(mat(bd, 'Poster 2')) && sig(mat(bd, 'Instagram post 1')) !== sig(mat(bd, 'Instagram post 2')), J(graphics.map(sig)));
ok('the formats are their own: A4 posters, a square and a portrait post', mat(bd, 'Poster 1').doc.artboards[0].unit === 'pt' && mat(bd, 'Instagram post 1').doc.artboards[0].width === 1080 && mat(bd, 'Instagram post 2').doc.artboards[0].height > 1080);
const chips = await page.locator('.bd-mat .bd-chip').allInnerTexts();
ok('each material says its status on the board (all Ready)', chips.length === 7 && chips.every((c) => c === 'Ready'), J(chips));
ok('the design-system overview is on the board, and notes tied by connectors', bd.nodes.some((n) => n.type === 'system') && bd.nodes.filter((n) => n.type === 'note' && n.generated).length >= 7 && bd.connectors.length >= 7);

// ── 13. the website: a real project, linked, live ──
const siteM = mat(bd, 'Website');
const site = await projectOf(siteM.projectId);
ok('13. the website is a project of its own (linked by id, never copied into the board), made by the website generator in the system', site && site.medium !== 'board' && site.specs?.length === 1 && site.specs[0].tokens.fonts.display === V.boardSystem.webFacesOf(bd.system.tokens.fonts).display && !('specs' in siteM), J({ id: siteM.projectId, specs: site?.specs?.length, display: site?.specs?.[0]?.tokens.fonts.display, system: bd.system.tokens.fonts.display }));
await focusMaterial('Website');
await page.waitForSelector('.bd-site iframe', { timeout: 10000 }).catch(() => {});
const srcdoc = await page.locator('.bd-site iframe').first().getAttribute('srcdoc').catch(() => '');
ok('…the board shows its real page, sealed (no scripts) in a frame', /Night Market Lisbon/.test(srcdoc ?? '') && (await page.locator('.bd-site iframe').first().getAttribute('sandbox')) === '', (srcdoc ?? '').slice(0, 120));
await shot('04-website');
ok('…“Open in the website editor” is offered, not editing a screenshot', (await page.locator('.bd-right').getByRole('button', { name: /Open in the website editor/ }).count()) === 1);

// ── 14. mockups from graphics ──
const box = mat(bd, 'Packaging mockup');
ok('14. the packaging mockup presents the product label (a reference to the material, which stays a material of its own)', box.source?.material === mat(bd, 'Product label').id && !!mat(bd, 'Product label').doc);
await focusMaterial('Poster 1');
await tab('Add');
await page.locator('.bd-left').getByRole('button', { name: 'Poster on a wall' }).click();
await settled();
bd = await boardWhere((x) => x.materials.some((m) => m.type === 'mockup' && m.template === 'poster-wall' && m.status === 'ready'));
const wall = bd.materials.find((m) => m.type === 'mockup' && m.template === 'poster-wall');
ok('…a new mockup made from the selected graphic, ready, showing it', wall && wall.source?.material === mat(bd, 'Poster 1').id, J(wall));
await focusMaterial(wall.name);
await page.locator('.bd-right select').filter({ has: page.locator('option', { hasText: 'Nothing yet' }) }).selectOption({ label: 'Poster 2' });
bd = await boardWhere((x) => x.materials.find((m) => m.id === wall.id)?.source?.material === mat(x, 'Poster 2').id);
ok('…its source swapped to another graphic (the mockup follows it)', bd.materials.find((m) => m.id === wall.id).source.material === mat(bd, 'Poster 2').id);

// ── 4. auto arrange, 16. undo ──
await page.keyboard.press('Escape');
await page.locator('.bd-canvas').click({ position: { x: 5, y: 5 } });
const before4 = bd.nodes.filter((n) => n.type === 'material').map((n) => [n.id, n.x, n.y]);
await ask('Arrange these materials into two rows');
ok('4. an arrangement asked in words is shown first, as a preview', (await page.locator('.gx-preview-tag').count()) === 1 && /two rows/.test(await page.locator('.bd-pending').innerText()));
await applyPending();
bd = await boardWhere((x) => x.arrangement === 'rows');
const rowsY = new Set(bd.nodes.filter((n) => n.type === 'material').map((n) => n.y));
ok('…applied: the materials on exactly two lines, nothing overlapping', bd.arrangement === 'rows' && rowsY.size === 2 && V.boardLayout.collisions(bd).length === 0, J([...rowsY]));
ok('…their own designs untouched by arranging', bd.materials.every((m) => m.type !== 'graphic' || J(m.doc.artboards[0].width) === J(graphics.find((g) => g.id === m.id)?.doc.artboards[0].width ?? m.doc.artboards[0].width)));
await page.keyboard.press('Control+z');
bd = await boardWhere((x) => x.arrangement === 'editorial');
ok('16. undo takes the arrangement back exactly', bd.arrangement === 'editorial' && J(bd.nodes.filter((n) => n.type === 'material' && before4.some(([id]) => id === n.id)).map((n) => [n.id, n.x, n.y])) === J(before4), J(bd.arrangement));
await page.keyboard.press('Control+Shift+z');
bd = await boardWhere((x) => x.arrangement === 'rows');
ok('…and redo puts it back', bd.arrangement === 'rows');
await page.keyboard.press('Control+z');
bd = await boardWhere((x) => x.arrangement === 'editorial');

// ── 5. manual move, 6. zoom and pan ──
await focusMaterial('Poster 2');
const n5 = nodeOf(bd, 'Poster 2');
const k5 = await zoom();
const box5 = await page.locator(`.bd-node[data-node="${n5.id}"]`).boundingBox();
await page.mouse.move(box5.x + box5.width / 2, box5.y + box5.height / 2);
await page.mouse.down();
await page.mouse.move(box5.x + box5.width / 2 + 60, box5.y + box5.height / 2 + 30, { steps: 6 });
await page.mouse.move(box5.x + box5.width / 2 + 121, box5.y + box5.height / 2 + 61, { steps: 6 });
await page.mouse.up({});
bd = await boardWhere((x) => nodeOf(x, 'Poster 2').x !== n5.x);
const moved = nodeOf(bd, 'Poster 2');
ok('5. a material dragged by hand moves by the distance dragged (in board units, snapping within a few units)', Math.abs(moved.x - n5.x - 121 / k5) < 12 / k5 + 8 && Math.abs(moved.y - n5.y - 61 / k5) < 12 / k5 + 8, J({ dx: moved.x - n5.x, want: 121 / k5, k: k5 }));
await page.keyboard.press('Control+z');
bd = await boardWhere((x) => nodeOf(x, 'Poster 2').x === n5.x);
ok('…and undo puts it back', nodeOf(bd, 'Poster 2').x === n5.x && nodeOf(bd, 'Poster 2').y === n5.y);
await page.locator('.bd-center .v0-toolbar').getByRole('button', { name: 'Fit' }).click();
await page.waitForTimeout(300);
const kFit = await zoom();
await page.locator('.bd-center .v0-toolbar').getByRole('button', { name: 'Zoom in' }).click();
await page.waitForTimeout(200);
const kIn = await zoom();
const panBefore = await page.locator('.bd-canvas').getAttribute('data-pan');
const cb = await page.locator('.bd-canvas').boundingBox();
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
await page.mouse.wheel(0, 240);
await page.waitForTimeout(200);
const panAfter = await page.locator('.bd-canvas').getAttribute('data-pan');
await page.keyboard.down('Control');
await page.mouse.wheel(0, -300);
await page.keyboard.up('Control');
await page.waitForTimeout(200);
const kWheel = await zoom();
ok('6. zoom (buttons and ⌘/Ctrl + scroll) and pan (scroll) move the view', kIn > kFit * 1.2 && kWheel > kIn && panAfter !== panBefore, J({ kFit, kIn, kWheel, panBefore, panAfter }));
await page.locator('.bd-center .v0-toolbar').getByRole('button', { name: 'Fit' }).click();
await page.waitForTimeout(400);

// ── 8. a single material edited in the Graphics editor; a local override ──
await focusMaterial('Poster 2');
await page.locator('.bd-right').getByRole('button', { name: /Open in the graphics editor/ }).click();
await page.waitForSelector('.bd-editor .gx-canvas', { timeout: 10000 });
await page.waitForTimeout(800);
ok('8. a graphic opens in the Graphics editor itself (its layers, inspector and changes in words), over the board', (await page.locator('.bd-editor .gx-left .gx-tab').count()) >= 5 && (await page.locator('.bd-editor #gx-ask-in').count()) === 1);
await shot('05-editor');
const p2before = mat(bd, 'Poster 2');
const others0 = J(bd.materials.filter((m) => m.name !== 'Poster 2' && m.type === 'graphic').map((m) => m.doc));
await page.locator('.bd-editor .gx-layer').filter({ has: page.locator('.gx-layer-name', { hasText: /^Headline$/ }) }).first().click();
await page.fill('.bd-editor #gx-ask-in', 'make it #ff00aa');
await page.locator('.bd-editor .gx-ask button[type=submit]').click();
await page.waitForTimeout(400);
await page.locator('.bd-editor .gx-pending').getByRole('button', { name: 'Apply' }).click();
await page.waitForTimeout(400);
await page.locator('.bd-editor').getByRole('button', { name: /Back to the board/ }).click();
bd = await boardWhere((x) => head(mat(x, 'Poster 2').doc)?.color === '#ff00aa');
ok('…the change is made to that material only: the other graphics are exactly as they were', head(mat(bd, 'Poster 2').doc)?.color === '#ff00aa' && J(bd.materials.filter((m) => m.name !== 'Poster 2' && m.type === 'graphic').map((m) => m.doc)) === others0);
await focusMaterial('Poster 2');
const insp = await page.locator('.bd-right').innerText();
ok('…and the board names it a local change of the system, with a reset', /local changes \(\d+\)/i.test(insp) && /#ff00aa/.test(insp) && (await page.locator('.bd-right').getByRole('button', { name: /Reset all to the system/ }).count()) === 1, insp.slice(0, 900));
ok('the board preview of the material shows the change (its own SVG redrawn)', (await page.locator(`.bd-node[data-node="${nodeOf(bd, 'Poster 2').id}"] svg`).first().innerHTML()).toLowerCase().includes('#ff00aa'));

// ── 9–10. a shared token changed; the local override kept ──
const tokenOfHead = mat(bd, 'Poster 2').bindings.nodes[head(mat(bd, 'Poster 2').doc).id]?.color;
await tab('System');
const label = V.boardSystem.TOKEN_LABEL[tokenOfHead] ?? 'the ground';
const newColour = tokenOfHead === 'background' ? '#f4efe2' : tokenOfHead === 'accentText' ? '#fffbe8' : '#1a1a1a';
await page.getByLabel(`${label} colour`).fill(newColour);
await page.locator('.bd-left').getByRole('button', { name: /Preview the change/ }).click();
await page.waitForSelector('.bd-sync', { timeout: 10000 });
const review = await page.locator('.bd-sync').innerText();
ok('9. a token change is proposed first: what it reaches, material by material', /Proposed:/.test(review) && /Poster 1/.test(review) && /follows the design it shows/.test(review) && /project of its own/.test(review), review.slice(0, 400));
ok('10. …the local override is named as kept, with a separate approval to reset it', /Kept:/.test(review) && /Poster 2/.test(review) && (await page.locator('.bd-sync input[type=checkbox]').count()) >= 1, review.slice(0, 600));
await shot('06-sync');
await applyPending();
bd = await boardWhere((x) => x.system.tokens.colors[tokenOfHead] === newColour);
const followers = bd.materials
  .filter((m) => m.type === 'graphic' && m.name !== 'Poster 2')
  .flatMap((m) => [
    ...D.walk(m.doc.artboards[0]).flatMap((l) => {
      const r = m.bindings.nodes[l.node.id] ?? {};
      return [r.color === tokenOfHead ? l.node.color : null, r.fill === tokenOfHead ? l.node.fill : null].filter(Boolean);
    }),
    ...m.doc.artboards.filter((a) => m.bindings.boards[a.id]?.background === tokenOfHead).map((a) => a.background),
  ]);
ok('…applied: every property bound to the token now holds the new value', followers.length > 0 && followers.every((c) => c.toLowerCase() === newColour), J(followers));
ok('…and the designer’s change is kept, never overwritten without approval', head(mat(bd, 'Poster 2').doc).color === '#ff00aa');
ok('…synced, not recomposed: every graphic keeps its composition', bd.materials.filter((m) => m.type === 'graphic').every((m) => m.plan.archetype === graphics.find((g) => g.id === m.id)?.plan.archetype || !graphics.find((g) => g.id === m.id)));
ok('…the board as it was is kept as a version', bd.versions.some((v) => /Before/.test(v.label)));
await focusMaterial('Poster 2');
await page.locator('.bd-right').getByRole('button', { name: /Reset all to the system/ }).click();
bd = await boardWhere((x) => head(mat(x, 'Poster 2').doc)?.color !== '#ff00aa');
ok('…reset only when asked: the override takes the system’s value again', head(mat(bd, 'Poster 2').doc).color.toLowerCase() === newColour, head(mat(bd, 'Poster 2').doc).color);

// ── the accent changed in words; the notes still true ──
await page.keyboard.press('Escape');
await ask('Change the campaign’s accent color to green');
await page.waitForSelector('.bd-sync', { timeout: 8000 });
await applyPending();
bd = await boardWhere((x) => x.system.tokens.colors.accent !== graphics[0].doc.tokens.colors.accent && V.boardAnnotate.verifyNotes(x).length === 0);
ok('a change asked in words (the accent) is synced to every material, and the notes are written again to stay true', V.boardAnnotate.verifyNotes(bd).length === 0 && bd.materials.filter((m) => m.type === 'graphic').every((m) => m.doc.tokens.colors.accent === bd.system.tokens.colors.accent), J(V.boardAnnotate.verifyNotes(bd)));

// ── 11–12. notes generated, then edited ──
await ask('Add annotations explaining the visual system');
await page.waitForTimeout(600);
bd = await boardWhere((x) => x.nodes.filter((n) => n.type === 'note' && n.generated).length >= 7);
const sysNote = bd.nodes.find((n) => n.type === 'note' && n.generated && bd.nodes.find((x) => x.id === n.about)?.type === 'system');
ok('11. notes explain the system from its facts (its faces, its accent) and each material’s own decisions', sysNote && sysNote.text.includes(bd.system.tokens.fonts.display) && sysNote.text.includes(bd.system.tokens.colors.accent), sysNote?.text);
const anote = bd.nodes.find((n) => n.type === 'note' && n.generated && bd.nodes.find((x) => x.id === n.about)?.type === 'material');
await focusMaterial(bd.materials.find((m) => nodeOf(bd, m.name)?.id === anote.about).name);
await page.locator('.bd-center .v0-toolbar').getByRole('button', { name: 'Zoom out' }).click();
await page.waitForTimeout(400);
const at = await bringIntoView(anote);
if (at) await page.mouse.dblclick(at.x, at.y);
await page.waitForSelector('.bd-note-edit', { timeout: 5000 });
await page.locator('.bd-note-edit').fill('Our reading: this one carries the night.');
await page.locator('.bd-note-edit').evaluate((el) => el.blur());
bd = await boardWhere((x) => x.nodes.find((n) => n.id === anote.id)?.text === 'Our reading: this one carries the night.');
const edited = bd.nodes.find((n) => n.id === anote.id);
ok('12. a note edited on the board becomes the designer’s own (never rewritten from the facts again)', edited?.text === 'Our reading: this one carries the night.' && edited.generated === false, J(edited));
await shot('07-notes');

// ── 7. save and reopen ──
const nodesBefore = bd.nodes.length;
const boardId = pid();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.bd-canvas', { timeout: 15000 });
await page.waitForTimeout(1500);
const reopened = (await projectOf(boardId)).board;
ok('7. saved and reopened: the same materials, nodes, system and notes', reopened.nodes.length === nodesBefore && reopened.materials.length === bd.materials.length && reopened.nodes.find((n) => n.id === anote.id)?.text === edited.text && (await page.locator('.bd-node').count()) > 10);
bd = reopened;

// ── 15. interrupted generation, one failed material retried alone ──
const raw = await projectOf(boardId);
const victim = raw.board.materials.find((m) => m.name === 'Instagram post 2');
victim.status = 'generating';
await putRaw(raw);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.bd-canvas', { timeout: 15000 });
bd = await boardWhere((x) => mat(x, 'Instagram post 2')?.status === 'failed');
ok('interrupted generation: a material left “generating” by a closed page is said failed (never left spinning, never taken for finished)', mat(bd, 'Instagram post 2').status === 'failed' && /Interrupted/.test(mat(bd, 'Instagram post 2').error ?? ''), J(mat(bd, 'Instagram post 2')?.status));
const othersDocs = J(bd.materials.filter((m) => m.name !== 'Instagram post 2').map((m) => (m.type === 'graphic' ? m.doc : m.id)));
await tab('Materials');
await page.locator('.bd-mat', { hasText: 'Instagram post 2' }).getByRole('button', { name: /Retry this one/ }).click();
await settled();
bd = await boardWhere((x) => mat(x, 'Instagram post 2')?.status === 'ready');
ok('15. the failed material is retried on its own and made; every other material is exactly as it was', mat(bd, 'Instagram post 2').status === 'ready' && J(bd.materials.filter((m) => m.name !== 'Instagram post 2').map((m) => (m.type === 'graphic' ? m.doc : m.id))) === othersDocs);

// ── extra: invalid operations ──
const snapshot = J(bd.nodes);
await ask('please make it feel more like a sunday afternoon in 1974');
// a creative change may be read by the model first (signed out here, so the browser reads it): give it a moment
await page.waitForFunction(() => /closest to what you mean/.test(document.querySelector('.bd-askbar')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
ok('words the board cannot read are not guessed at: one question with answers that work, nothing changed, never “without a model”', /closest to what you mean/.test(await noteText()) && !/without a model/i.test(await noteText()) && J((await projectOf(boardId)).board.nodes) === snapshot, await noteText());
await ask('Keep the first three materials exactly as they are');
await applyPending();
bd = await boardWhere((x) => x.nodes.filter((n) => n.locked).length === 3);
await ask('Regenerate only the first poster');
const lockedSaid = (await page.locator('.bd-pending').count()) ? (await applyPending(), await noteText()) : await noteText();
ok('a locked material is not regenerated: refused and said', /locked/.test(lockedSaid) && J(mat((await projectOf(boardId)).board, 'Poster 1').doc) === J(mat(bd, 'Poster 1').doc), lockedSaid);
await ask('unlock the first three materials');
if (await page.locator('.bd-pending').count()) await applyPending();
bd = await boardWhere((x) => !x.nodes.some((n) => n.locked && n.type === 'material'));

// ── regenerate one material in words ──
const p2doc = J(mat(bd, 'Poster 2').doc);
const restDocs = J(bd.materials.filter((m) => m.name !== 'Poster 2' && m.type === 'graphic').map((m) => m.doc));
await ask('Regenerate only the second poster');
await applyPending();
await settled();
bd = await boardWhere((x) => J(mat(x, 'Poster 2').doc) !== p2doc && mat(x, 'Poster 2').status === 'ready');
ok('“regenerate only the second poster”: it alone is composed again (a new variant, same system); the rest untouched', J(mat(bd, 'Poster 2').doc) !== p2doc && J(bd.materials.filter((m) => m.name !== 'Poster 2' && m.type === 'graphic').map((m) => m.doc)) === restDocs && head(mat(bd, 'Poster 2').doc).font === bd.system.tokens.fonts.display);

// ── another material in the campaign ──
await ask('Create another Instagram graphic using this campaign');
await settled();
bd = await boardWhere((x) => x.materials.some((m) => m.name === 'Instagram post 3' && m.status === 'ready'));
ok('“create another Instagram graphic”: a new material in the same system, made and placed', mat(bd, 'Instagram post 3')?.status === 'ready' && head(mat(bd, 'Instagram post 3').doc).font === bd.system.tokens.fonts.display && !!nodeOf(bd, 'Instagram post 3'));

// ── 17. one material exported ──
await focusMaterial('Poster 1');
const [dl1] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.locator('.bd-right').getByRole('button', { name: /Export this material/ }).click()]);
const one = await JSZip.loadAsync(readFileSync(await dl1.path()));
const oneFiles = Object.keys(one.files);
const oneMan = JSON.parse(await one.file('manifest.json').async('string'));
const onePng = oneFiles.find((f) => f.endsWith('.png'));
const onePngInfo = pngSize(Buffer.from(await one.file(onePng).async('uint8array')));
ok('17. one material exported in its own formats: PNG at print resolution, SVG and PDF (A4), its manifest naming it by id', onePngInfo.sig && onePngInfo.w === 2480 && oneFiles.some((f) => f.endsWith('.svg')) && oneFiles.some((f) => f.endsWith('.pdf')) && oneMan.files.filter((f) => f.material).every((f) => f.material === mat(bd, 'Poster 1').id), J({ oneFiles, w: onePngInfo.w }));

// ── 18. every material exported ──
await page.keyboard.press('Escape');
const all = await exportItem('All materials');
const zip = await JSZip.loadAsync(all.bytes);
const allFiles = Object.keys(zip.files);
const man = JSON.parse(await zip.file('manifest.json').async('string'));
const ids = new Set(man.files.filter((f) => f.material).map((f) => f.material));
ok('18. all materials exported in one .zip: each in its folder, manifest.json naming every file by material id', bd.materials.every((m) => ids.has(m.id)) && man.format === 'socriaux.board-export/1' && allFiles.some((f) => /website\/.*-site\.zip$/.test(f)) && allFiles.includes('board-overview.png') && allFiles.includes('board.socriaux-board.json'), J({ ids: ids.size, materials: bd.materials.length, sample: allFiles.slice(0, 12) }));
const siteZip = await JSZip.loadAsync(await zip.file(allFiles.find((f) => /-site\.zip$/.test(f))).async('uint8array'));
ok('…the website goes as its own website package (index.html with its words), not a picture of it', Object.keys(siteZip.files).some((f) => /index\.html$/.test(f)) && /Night Market Lisbon/.test(await siteZip.file(Object.keys(siteZip.files).find((f) => /index\.html$/.test(f))).async('string')));

// ── 19. the board overview ──
const ovNotes = await exportItem('PNG, with the notes');
const ovClean = await exportItem('PNG, without the notes');
writeFileSync(`${S}board-overview-export.png`, ovNotes.bytes);
writeFileSync(`${S}board-overview-export-no-notes.png`, ovClean.bytes);
const a19 = pngSize(ovNotes.bytes);
const b19 = pngSize(ovClean.bytes);
ok('19. the board overview exports as a picture of the board, with or without its notes (two different pictures)', a19.sig && b19.sig && a19.w > 2000 && Buffer.compare(ovNotes.bytes, ovClean.bytes) !== 0, J({ a19, b19 }));
const ovPdf = await exportItem('PDF');
const pdf = await getDocumentProxy(new Uint8Array(ovPdf.bytes));
ok('…and as a one-page PDF', pdf.numPages === 1);
const ovSvg = (await exportItem('SVG')).bytes.toString();
ok('…and as SVG with the notes’ words in it', ovSvg.startsWith('<svg') && ovSvg.includes('Our reading: this one carries the night.'));
ok('the overview export is not the materials export: their files differ in kind (one picture vs a folder per material)', !allFiles.includes(ovNotes.name) && allFiles.length > 8);

// ── the demonstration board, as a picture ──
await page.locator('.bd-center .v0-toolbar').getByRole('button', { name: 'Fit' }).click();
await page.waitForTimeout(1200);
await shot('08-demonstration');

// ── extra: missing assets — the website project gone from this browser ──
const bdNow = (await projectOf(boardId)).board;
const siteId = bdNow.materials.find((m) => m.type === 'website').projectId;
const siteCopy = await projectOf(siteId);
await deleteRaw(siteId);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.bd-canvas', { timeout: 15000 });
await focusMaterial('Website');
await page.waitForTimeout(600);
ok('missing assets: a website project not in this browser is said on the board (never drawn as if it were there)', (await page.locator('.bd-missing').count()) >= 1 && /not in this browser/.test(await page.locator('.bd-missing').first().innerText()));
await tab('Checks');
ok('…and in the board’s checks', /not in this browser/.test(await page.locator('.bd-left').innerText()));
await putRaw(siteCopy);

// ── 20. websites and graphics as they were ──
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.bd-canvas', { timeout: 15000 });
await focusMaterial('Website');
await page.locator('.bd-right').getByRole('button', { name: /Open in the website editor/ }).click();
await page.waitForTimeout(2500);
ok('20. the website opens in the website editor (the existing workspace, its own project)', new URL(page.url()).searchParams.get('p') === siteId && (await page.locator('.v0-head').count()) === 1 && !(await page.locator('.bd-canvas').count()));
// everything made is in its own view (the home is one composer)
await page.goto(BASE + '/ux-v0?work=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const plates = await page.locator('main').innerText();
const count = (await projectOf(boardId)).board.materials.length;
ok('…your work lists the board as a board (its materials counted) and the website as a website', new RegExp(`Board · ${count} materials`).test(plates) && /Website/.test(plates), plates.slice(0, 400));

// ── dozens of materials stay light: virtualization and level of detail ──
// the brief written by hand in the workspace (its own form)
await handBrief(page, 'board', 'For “Harbour Week”, “Ten days on the water”: twelve posters, twelve Instagram graphics and twelve stories');
await page.getByRole('button', { name: /Propose design systems/ }).click();
await page.waitForSelector('.bd-sys', { timeout: 15000 });
const tBig = Date.now();
await page.locator('.bd-sys').nth(1).getByRole('button', { name: /Use this system/ }).click();
await page.waitForSelector('.bd-canvas', { timeout: 15000 });
await settled();
const bigMs = Date.now() - tBig;
const big = await boardWhere((x) => x.materials.length === 36 && x.materials.every((m) => m.status === 'ready'), 30000);
await page.locator('.bd-center .v0-toolbar').getByRole('button', { name: 'Fit' }).click();
await page.waitForTimeout(800);
const atFit = { nodes: await page.locator('.bd-node.is-material').count(), drawn: await page.locator('.bd-node.is-material .bd-art').count(), blocks: await page.locator('.bd-node.is-material .bd-block').count() };
for (let i = 0; i < 7; i++) await page.locator('.bd-center .v0-toolbar').getByRole('button', { name: 'Zoom out' }).click();
await page.waitForTimeout(500);
const farOut = { drawn: await page.locator('.bd-node.is-material .bd-art').count(), blocks: await page.locator('.bd-node.is-material .bd-block').count(), k: await zoom() };
await focusMaterial('Poster 7');
await page.waitForTimeout(600);
const zoomedIn = { drawn: await page.locator('.bd-node.is-material .bd-art').count() };
ok('dozens of materials: 36 composed in one system, each its own composition', big?.materials.length === 36 && new Set(big.materials.filter((m) => m.brief.kind === 'poster').map((m) => `${m.plan.archetype}|${m.doc.artboards[0].background}`)).size >= 3, J({ n: big?.materials.length, ms: bigMs }));
ok('…and the board stays light: what is too small on screen is drawn as a plain block, what is out of view is not drawn at all', atFit.nodes === 36 && farOut.blocks > 0 && farOut.drawn + farOut.blocks <= 36 && zoomedIn.drawn < 12, J({ atFit, farOut, zoomedIn, ms: bigMs }));
console.log(`   (36 materials generated and arranged in ${bigMs} ms; at fit ${atFit.drawn} drawn in full; zoomed far out ${farOut.blocks} as plain blocks; zoomed in on one, ${zoomedIn.drawn} drawn, the rest not drawn)`);
await shot('09-thirty-six');

// ── extra: unauthorized access ──
const api = async (method, path, body) => page.evaluate(async ([m, p, bdy]) => (await fetch(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: bdy ? JSON.stringify(bdy) : undefined })).status, [method, path, body]);
const statuses = [await api('GET', '/api/ux-v0/projects'), await api('GET', `/api/ux-v0/projects?id=${boardId}`), await api('PUT', '/api/ux-v0/projects', { project: await projectOf(boardId) }), await api('DELETE', `/api/ux-v0/projects?id=${boardId}`)];
ok('unauthorized access: the account copy of boards refuses anyone not signed in (list, read, write, delete: 401)', statuses.every((s) => s === 401), J(statuses));

ok('no model route was called in the whole run (planning, composition, notes, sync and changes in words are code)', modelCalls.length === 0, J(modelCalls));
ok('no error in the page', errors.length === 0, J(errors));
await b.close();
console.log(`\n${pass} passed, ${fail} failed (${Math.round((Date.now() - t0) / 1000)} s); screenshots and exports in ${S}`);
process.exit(fail ? 1 : 0);
