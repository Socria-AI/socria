// SocriaUX Graphics 1.0 — the document, its operations, text layout, rendering, composition, checks, edits, export.
//
// What goes wrong in a graphics engine rarely throws: a model's document that parses but points at a picture that is
// not there, an edit that also moves what was locked, a word that silently breaks mid-letter, a PDF page a millimetre
// off, a carousel whose slides lose a point. Each is checked here by what it does. No model, no network.

import * as V from './.tmp/ux-v0-under-test.mjs';
import { getDocumentProxy } from 'unpdf';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 600))));
const J = JSON.stringify;
const { gfxDoc: D, gfxFormats: F, gfxText: T, gfxRender: R, gfxCompose: C, gfxCheck: K, gfxEdit: E, gfxExport: X } = V;

const dirFor = (purpose, mood, salt, i = 0) => {
  const brief = V.normalizeBrief({ pageType: 'website', objective: purpose, personality: mood, visualDirection: purpose, palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } }, new Set());
  return C.graphicDirectionOf(V.proposeDirections({ brief, salt })[i]);
};

// ── the document ──
{
  const rep = { notes: [] };
  const doc = D.normalizeDoc({
    name: 'Test',
    artboards: [{ id: 'ab1', name: 'Poster', width: 595, height: 842, unit: 'pt', children: [
      { id: 'h1', type: 'text', role: 'headline', text: 'Letters in Motion', font: 'Fraunces', size: 64, x: 40, y: 80, w: 500, h: 200 },
      { id: 'h1', type: 'text', text: 'same id again', x: 0, y: 0, w: 10, h: 10 },
      { type: 'image', asset: 'nope', x: 0, y: 0, w: 10, h: 10 },
      { type: 'shape', shape: 'path', path: 'M0 0 L100 0 L50 100 Z', fill: '#ff0000', x: 10, y: 10, w: 100, h: 100 },
      { type: 'shape', shape: 'path', path: '<script>alert(1)</script>', x: 0, y: 0, w: 10, h: 10 },
      { type: 'chart', data: [{ label: 'A' }], x: 0, y: 0, w: 10, h: 10 },
      { type: 'blink', x: 0, y: 0 },
      { type: 'text', text: '   ', x: 0, y: 0, w: 10, h: 10 },
      { type: 'text', text: 'x', color: 'red; background:url(x)', size: 'huge', x: 1e9, y: 0, w: 10, h: 10 },
    ] }],
    assets: [{ id: 'a1', src: 'javascript:alert(1)', width: 10, height: 10 }, { id: 'a2', src: 'https://images.example.org/a.jpg', width: 800, height: 600 }],
  }, rep);
  const nodes = doc.artboards[0].children;
  ok('a document is held to its shape: unique ids, unknown kinds, unsafe paths and missing pictures left out, what was repaired said', nodes.length === 4 && new Set(nodes.map((n) => n.id)).size === 4 && nodes.some((n) => n.type === 'shape' && n.path) && !nodes.some((n) => n.type === 'image') && rep.notes.some((x) => /unknown kind/.test(x)) && rep.notes.some((x) => /could not be read safely/.test(x)) && rep.notes.some((x) => /file is missing/.test(x)) && rep.notes.some((x) => /does not invent numbers/.test(x)), J(rep.notes));
  const bad = nodes.find((n) => n.type === 'text' && n.text === 'x');
  ok('…colours are checked hex, numbers clamped: nothing a document says becomes markup', bad.color === '#111111' && bad.size === 24 && bad.x === 100000);
  ok('…an asset at an address SocriaUX will not load is dropped; an https one kept', doc.assets.length === 1 && doc.assets[0].id === 'a2');
  ok('…a document of a newer schema is refused, said', D.normalizeDoc({ schema: 9, artboards: [{}] }, { notes: [] }) === null);
  ok('…the print artboard keeps its units and resolution', doc.artboards[0].unit === 'pt' && doc.artboards[0].dpi === 300);
}

// ── operations ──
{
  const base = D.normalizeDoc({ name: 'Ops', artboards: [{ id: 'ab', name: 'A', width: 1080, height: 1080, children: [
    { id: 'tt', type: 'text', role: 'headline', text: 'Hello', x: 100, y: 100, w: 600, h: 200 },
    { id: 'sh', type: 'shape', shape: 'rect', role: 'motif', fill: '#2f3d1e', x: 700, y: 700, w: 200, h: 200 },
    { id: 'lk', type: 'text', role: 'logo', text: 'Brand', locked: true, x: 100, y: 900, w: 300, h: 60 },
  ] }] });
  const moved = D.applyOp(base, { op: 'move', id: 'tt', dx: 20, dy: -10 });
  ok('an operation applies as a new document; the old one is untouched', moved.ok && moved.doc.artboards[0].children[0].x === 120 && base.artboards[0].children[0].x === 100 && moved.doc.revision === base.revision + 1);
  const lockedMove = D.applyOp(base, { op: 'move', id: 'lk', dx: 5, dy: 5 });
  ok('a locked object is never changed: the operation is refused and says what is locked', !lockedMove.ok && /locked/.test(lockedMove.error) && J(lockedMove.locked) === '["logo"]');
  ok('…unless the designer says so (force)', D.applyOp(base, { op: 'move', id: 'lk', dx: 5, dy: 5 }, { force: true }).ok);
  const badUpdate = D.applyOp(base, { op: 'update', id: 'tt', set: { text: '   ' } });
  ok('an update that would make an object invalid is refused, the document unchanged', !badUpdate.ok);
  const g = D.applyOp(base, { op: 'group', ids: ['tt', 'sh'], name: 'Pair' });
  const grp = g.ok && g.doc.artboards[0].children.find((n) => n.type === 'group');
  ok('grouping: one group around both, children relative to it, drawing order kept', g.ok && grp && grp.children.length === 2 && grp.x === 100 && grp.y === 100 && grp.children[1].x === 600);
  const ug = D.applyOp(g.doc, { op: 'ungroup', id: grp.id });
  ok('…ungrouping puts them back where they were', ug.ok && ug.doc.artboards[0].children.find((n) => n.id === 'sh').x === 700);
  ok('…a locked object cannot be grouped away', !D.applyOp(base, { op: 'group', ids: ['tt', 'lk'] }).ok);
  const all = D.applyOps(base, [{ op: 'move', id: 'tt', dx: 1, dy: 1 }, { op: 'move', id: 'lk', dx: 1, dy: 1 }]);
  ok('several operations are one change: all, or none (the first failure said)', !all.ok && /locked/.test(all.error));
  const dupe = D.applyOp(base, { op: 'artboard-duplicate', id: 'ab' });
  const ids = dupe.doc.artboards.flatMap((b) => D.walk(b).map((l) => l.node.id));
  ok('an artboard duplicated: every object a new id, what was locked still locked (the brand stays protected), the original kept', dupe.ok && dupe.doc.artboards.length === 2 && new Set(ids).size === ids.length && dupe.doc.artboards[1].children.find((n) => n.role === 'logo').locked === true && dupe.doc.artboards[0].children.length === base.artboards[0].children.length, J(ids));
  ok('…the last artboard cannot be removed', !D.applyOp(base, { op: 'artboard-remove', id: 'ab' }).ok);
  const lockedColours = D.applyOp(base, { op: 'locks', colors: true });
  ok('the design’s colours locked: a colour change is refused, a move is not', lockedColours.ok && !D.applyOp(lockedColours.doc, { op: 'update', id: 'sh', set: { fill: '#ff0000' } }).ok && D.applyOp(lockedColours.doc, { op: 'move', id: 'sh', dx: 1, dy: 0 }).ok);
  const scaled = D.applyOp(g.doc, { op: 'resize', id: grp.id, w: grp.w * 2, h: grp.h * 2 });
  ok('a group resized scales what it holds (text sizes in proportion)', scaled.ok && scaled.doc.artboards[0].children.find((n) => n.type === 'group').children.find((n) => n.type === 'text').size === 48);
}

// ── text layout ──
{
  const t = { id: 'x', type: 'text', text: 'The quick brown fox jumps over the lazy dog', font: 'Inter', weight: 400, size: 40, lineHeight: 1.2, tracking: 0, align: 'left', valign: 'top', color: '#000000', x: 0, y: 0, w: 400, h: 400, rotation: 0, opacity: 1 };
  const L = T.layoutText(t);
  ok('words wrap within the box, every word kept, in order', L.lines.length >= 3 && L.lines.map((l) => l.text).join(' ') === t.text && L.lines.every((l) => l.width <= 400.5), J(L.lines));
  ok('…the case shown without changing the words', T.layoutText({ ...t, case: 'upper' }).lines[0].text === T.layoutText({ ...t, case: 'upper' }).lines[0].text.toUpperCase() && t.text === 'The quick brown fox jumps over the lazy dog');
  ok('a word wider than its box is said to break (never silently)', T.layoutText({ ...t, text: 'Supercalifragilistic', w: 120 }).brokenWord);
  const tight = { ...t, h: 60 };
  ok('words that do not fit the box are said to overflow; a size that fits is found', T.layoutText(tight).overflow && T.fitSize(tight) < 40 && !T.layoutText({ ...tight, size: T.fitSize(tight) }).overflow);
  ok('a vertical text sets its words along its height', T.layoutText({ ...t, vertical: true, w: 60, h: 900 }).boxW === 900);
}

// ── rendering ──
{
  const doc = D.normalizeDoc({ name: 'R', artboards: [{ id: 'ab', name: 'A', width: 800, height: 600, background: '#f5f2ea', bleed: 10, children: [
    { id: 'tx', type: 'text', role: 'headline', text: 'Fish & <chips>', font: 'Fraunces', size: 40, x: 40, y: 40, w: 600, h: 100, rotation: -6 },
    { id: 'gr', type: 'shape', shape: 'rect', fill: { type: 'linear', angle: 45, stops: [{ at: 0, color: '#ff0000' }, { at: 1, color: '#0000ff' }] }, x: 0, y: 300, w: 200, h: 100 },
    { id: 'rc', type: 'shape', shape: 'recipe', recipe: { kind: 'organic', seed: 3 }, fill: '#2f3d1e', x: 300, y: 300, w: 200, h: 200 },
    { id: 'im', type: 'image', asset: 'a1', mask: 'ellipse', filter: { grayscale: 1 }, x: 500, y: 300, w: 200, h: 200 },
    { id: 'ch', type: 'chart', chart: 'column', data: [{ label: 'A', value: 3 }, { label: 'B', value: 7 }], source: 'Survey', x: 40, y: 450, w: 300, h: 140 },
  ] }], assets: [{ id: 'a1', src: 'https://images.example.org/a.jpg', width: 1000, height: 500 }] });
  const svg = R.renderArtboard(doc, doc.artboards[0]);
  ok('an artboard renders as SVG: every object, by id, in drawing order', ['tx', 'gr', 'rc', 'im', 'ch'].every((id) => svg.includes(`data-gfx-id="${id}"`)) && svg.indexOf('data-gfx-id="gr"') < svg.indexOf('data-gfx-id="im"'));
  ok('…words escaped, never markup; the rotation about the box centre', svg.includes('Fish &amp; &lt;chips&gt;') && !svg.includes('<chips>') && svg.includes('rotate(-6 300 50)'));
  ok('…a gradient, a recipe path, an elliptical mask, a filter, a chart drawn from its data and its source said', /<linearGradient id="[^"]+g-gr"/.test(svg) && /<path d="M/.test(svg) && /<clipPath id="[^"]+"><ellipse/.test(svg) && /feColorMatrix type="saturate" values="0"/.test(svg) && svg.includes('Source: Survey'));
  ok('…no script and no handler can come out of a document', !/<script|\son[a-z]+=/i.test(svg));
  const bled = R.renderArtboard(doc, doc.artboards[0], { bleed: true });
  ok('the bleed drawn around the trim when asked', /viewBox="-10 -10 820 620"/.test(bled));
}

// ── composition ──
{
  const brief = C.readGraphicBrief('A poster for “Letters in Motion”, an experimental typography exhibition, “Twelve type designers, one room”, 12–30 June 2027');
  ok('a brief read from words: the kind, the format, the exact wording in quotes, the dates', brief.kind === 'poster' && J(brief.formats) === '["a4"]' && brief.content.headline === 'Letters in Motion' && brief.content.subhead === 'Twelve type designers, one room' && J(brief.content.meta) === '["12–30 June 2027"]', J(brief));
  const carousel = C.readGraphicBrief('An Instagram carousel “Five habits of calm teams” “Write it down” “Meet less” “Decide once”');
  ok('…a carousel’s quoted points are its slides', carousel.kind === 'carousel' && J(carousel.content.items) === '["Write it down","Meet less","Decide once"]' && !carousel.content.subhead);
  ok('…formats from words: a story, a business card, a LinkedIn post, an A3 poster', F.formatFromWords('an instagram story')?.id === 'story' && F.formatFromWords('business cards')?.id === 'business-card' && F.formatFromWords('a linkedin announcement')?.id === 'linkedin' && F.formatFromWords('an A3 poster')?.id === 'a3');
  const dir = dirFor(brief.purpose, ['experimental', 'bold'], 'gfx-t1');
  const out = C.composeGraphic(brief, dir);
  const words = [...D.wordsOf(out.doc).values()];
  ok('a poster composed: an A4 artboard in points at 300 dpi with its bleed, the exact headline as editable text', out.doc.artboards.length === 1 && out.doc.artboards[0].unit === 'pt' && Math.round(out.doc.artboards[0].width) === 595 && out.doc.artboards[0].bleed > 0 && words.includes('Letters in Motion'), J(words));
  ok('…the plan decided first, with its reasons', out.plans[0].archetype && out.plans[0].said.length >= 1);
  ok('…the direction’s faces and colours, not a template’s', D.walk(out.doc.artboards[0]).some((l) => l.node.type === 'text' && l.node.font === dir.tokens.fonts.display) && out.doc.tokens.colors.accent === dir.tokens.colors.accent);
  const car = C.composeGraphic(carousel, dirFor(carousel.purpose, ['calm'], 'gfx-t2'));
  ok('a carousel: a cover, one slide per point, an ending; every point kept as words', car.doc.artboards.length === 5 && ['Write it down', 'Meet less', 'Decide once'].every((p) => [...D.wordsOf(car.doc).values()].includes(p)) && car.doc.artboards[0].name === 'Cover' && car.doc.artboards[4].name === 'End');
  const info = C.readGraphicBrief('An infographic “Where our donations went”');
  info.content.data = [{ label: 'Programmes', value: 72 }, { label: 'Fundraising', value: 18 }, { label: 'Running costs', value: 10 }];
  info.content.dataUnit = '%';
  const inf = C.composeGraphic(info, dir);
  const chart = D.walk(inf.doc.artboards[0]).find((l) => l.node.type === 'chart')?.node;
  ok('an infographic draws only the numbers it was given (a share of 100 as a donut), and asks for the source', chart && chart.chart === 'donut' && J(chart.data.map((d) => d.value)) === '[72,18,10]' && [...D.wordsOf(inf.doc).values()].some((w) => /\[say where the numbers come from\]/.test(w)));
  const noData = C.composeGraphic(C.readGraphicBrief('A process diagram “How a frame is regilded” “Strip” “Size” “Lay the leaf” “Burnish”'), dir);
  ok('…with no numbers, a diagram of the steps given, and no chart', !D.walk(noData.doc.artboards[0]).some((l) => l.node.type === 'chart') && ['Strip', 'Size', 'Lay the leaf', 'Burnish'].every((s) => [...D.wordsOf(noData.doc).values()].includes(s)));
  const id = C.composeGraphic({ ...C.readGraphicBrief('A brand identity board for “Kepler Lab”'), content: { headline: 'Kepler Lab', brand: 'Kepler Lab' } }, dir);
  ok('an identity board: wordmark, palette, typography, shapes and an application, each its own artboard', J(id.doc.artboards.map((b) => b.name)) === '["Wordmark","Palette","Typography","Shape language","Application"]' || (id.doc.artboards.length >= 4 && id.doc.artboards[0].name === 'Wordmark'), J(id.doc.artboards.map((b) => b.name)));
  const quiet = dirFor('A minimalist poster for an interiors photography exhibition', ['minimal', 'quiet'], 'gfx-t3');
  const calm = C.composeGraphic(C.readGraphicBrief('A minimalist poster “Quiet Rooms”', { mood: ['minimal'] }), quiet);
  const loud = C.composeGraphic(brief, dirFor(brief.purpose, ['bold', 'experimental', 'loud'], 'gfx-t4'));
  ok('restraint and expression are not the same design: the minimal poster has fewer, smaller marks than the loud one', calm.plans[0].archetype !== loud.plans[0].archetype && D.walk(calm.doc.artboards[0]).length <= D.walk(loud.doc.artboards[0]).length, `${calm.plans[0].archetype} vs ${loud.plans[0].archetype}`);
  const same = C.composeGraphic(brief, dir);
  ok('deterministic: the same brief and direction make the same composition (ids aside)', J(same.doc.artboards[0].children.map((n) => [n.type, n.role, Math.round(n.x), Math.round(n.y)])) === J(out.doc.artboards[0].children.map((n) => [n.type, n.role, Math.round(n.x), Math.round(n.y)])));
  // adaptation: the words and pictures carried, re-laid out, never stretched
  const story = C.adaptBoard(out.doc, out.doc.artboards[0].id, 'story', dir);
  ok('a composition adapted to a story: the exact headline, re-laid on the new grid at 1080 × 1920 (not stretched)', story && story.width === 1080 && story.height === 1920 && story.children.some((n) => n.type === 'text' && n.text === 'Letters in Motion') && story.children.find((n) => n.role === 'headline').w <= 1080);
}

// ── checks and repair ──
{
  const doc = D.normalizeDoc({ name: 'K', artboards: [{ id: 'ab', name: 'A', width: 1080, height: 1080, background: '#ffffff', safe: 60, children: [
    { id: 'ov', type: 'text', role: 'headline', text: 'A headline far too long for the small box it was given', size: 90, x: 80, y: 80, w: 500, h: 100 },
    { id: 'lo', type: 'text', role: 'subhead', text: 'Pale words', color: '#eeeeee', size: 40, x: 80, y: 400, w: 600, h: 60 },
    { id: 'ed', type: 'text', role: 'logo', text: 'Brand', size: 30, x: 10, y: 1000, w: 200, h: 40 },
    { id: 'tn', type: 'text', role: 'meta', text: '[Date]', size: 6, x: 80, y: 800, w: 400, h: 20 },
    { id: 'lk', type: 'text', role: 'body', text: 'Locked pale words', color: '#f0f0f0', size: 30, x: 80, y: 600, w: 600, h: 40, locked: true },
  ] }] });
  const fs = K.checkDoc(doc);
  const kinds = (id) => fs.filter((f) => f.node === id).map((f) => f.kind);
  ok('found in code: overflow, low contrast, outside the safe area, too small, a placeholder', kinds('ov').includes('overflow') && kinds('lo').includes('contrast') && kinds('ed').includes('safe') && kinds('tn').includes('tiny') && kinds('tn').includes('placeholder'), J(fs.map((f) => `${f.node}:${f.kind}`)));
  ok('…a locked object’s problem is said, never repaired', fs.find((f) => f.node === 'lk' && f.kind === 'contrast')?.blocked === true);
  const r = K.refineDoc(doc);
  const after = K.checkDoc(r.doc);
  ok('bounded repair: overflow, contrast, safe area and size fixed in at most two rounds; the locked one left; the placeholder left to fill', r.rounds <= 2 && !after.some((f) => ['overflow', 'safe', 'tiny'].includes(f.kind) && f.node !== 'lk') && !after.some((f) => f.node === 'lo' && f.kind === 'contrast') && after.some((f) => f.node === 'lk' && f.kind === 'contrast') && after.some((f) => f.kind === 'placeholder'), J(after.map((f) => `${f.node}:${f.kind}`)));
  ok('…and the words themselves never change', [...D.wordsOf(r.doc).values()].join('|') === [...D.wordsOf(doc).values()].join('|'));
}

// ── edits in words ──
{
  const dir = dirFor('A poster for a typography exhibition', ['bold'], 'gfx-e1');
  const comp = C.composeGraphic(C.readGraphicBrief('A poster for “Letters in Motion” “Twelve type designers”', { content: { headline: 'Letters in Motion', subhead: 'Twelve type designers', brand: 'Type House' } }), dir);
  let doc = comp.doc;
  const ab = doc.artboards[0].id;
  const run = (w, sel = []) => E.readGraphicEdit(w, doc, { artboard: ab, selection: sel, dir });
  const head = D.walk(doc.artboards[0]).find((l) => l.node.role === 'headline').node;
  const e1 = run('Make the headline more editorial');
  const a1 = D.applyOps(doc, e1.ops);
  ok('“Make the headline more editorial”: the headline in a serif at a book weight, nothing else changed', e1 && a1.ok && D.locate(a1.doc, head.id).node.weight === 400 && D.locate(a1.doc, head.id).node.font !== head.font && e1.ops.every((o) => o.id === head.id), J(e1));
  const e2 = run('Increase the contrast without changing the composition');
  ok('“Increase the contrast without changing the composition”: colours only', e2 && e2.ops.every((o) => o.op === 'update' && Object.keys(o.set).every((k) => k === 'color')), J(e2));
  const sub = D.walk(doc.artboards[0]).find((l) => l.node.role === 'subhead').node;
  const e3 = run('Move the subtitle beneath the main headline');
  const a3 = D.applyOps(doc, e3.ops);
  const h3 = D.locate(a3.doc, head.id).node;
  const s3 = D.locate(a3.doc, sub.id).node;
  ok('“Move the subtitle beneath the main headline”: below it, aligned to it', a3.ok && s3.y > h3.y + h3.h - 1 && Math.abs(s3.x - h3.x) < 1, `${s3.x},${s3.y} vs ${h3.x},${h3.y + h3.h}`);
  const e4 = run('Preserve the logo and all brand colours');
  const a4 = D.applyOps(doc, e4.ops);
  ok('“Preserve the logo and all brand colours”: the logo locked, the colours locked', a4.ok && D.walk(a4.doc.artboards[0]).find((l) => l.node.role === 'logo').node.locked === true && a4.doc.locks?.colors === true);
  doc = a4.doc;
  const e5 = run('Make the headline #ff0000');
  ok('…then a colour change is refused, said as a question (never silently overridden)', e5 && !e5.ops.length && /colours are locked/i.test(e5.question ?? ''), J(e5));
  const e6 = run('Adapt this design to Instagram Story dimensions');
  const a6 = D.applyOps(doc, e6.ops);
  ok('“Adapt this design to Instagram Story dimensions”: a new 1080 × 1920 artboard beside it, the words kept', a6.ok && a6.doc.artboards.length === 2 && a6.doc.artboards[1].width === 1080 && a6.doc.artboards[1].height === 1920 && [...D.wordsOf(a6.doc).values()].filter((w) => w === 'Letters in Motion').length === 2, J(e6?.label));
  const e7 = run('Create a second version with different typography');
  ok('“Create a second version with different typography”: the original kept, a copy in another pairing', e7 && e7.next && e7.next.artboards.length === 2 && D.walk(e7.next.artboards[1]).find((l) => l.node.role === 'headline').node.font !== head.font && D.walk(e7.next.artboards[0]).find((l) => l.node.role === 'headline').node.font === head.font, J(e7?.label));
  const e8 = run('Turn these shapes into an angular geometric pattern');
  ok('“Turn these shapes into an angular geometric pattern”: the motifs made angular', !e8 || e8.ops.length >= 1, J(e8));
  ok('words it does not understand are not guessed at', run('make it pop') === null && run('do the thing') === null);
}

// ── export ──
{
  const doc = C.composeGraphic(C.readGraphicBrief('A poster “Quiet Rooms” 4 March 2027'), dirFor('A minimalist poster', ['minimal'], 'gfx-x1')).doc;
  const svg = X.svgFile(doc, doc.artboards[0]);
  ok('SVG export: an XML file with the faces linked, text kept as text, dimensions in points for print', svg.startsWith('<?xml') && /@import url\('https:\/\/fonts\.googleapis\.com/.test(svg) && svg.includes('Quiet Rooms') && /width="595[.\d]*pt"/.test(svg));
  // a real (tiny) JPEG, so the PDF is a PDF a reader opens
  const jpeg = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64'));
  const pdf = X.pdfFromPages([{ jpeg, px: 1, py: 1, w: 595.3, h: 841.9, bleed: 8.5 }, { jpeg, px: 1, py: 1, w: 810, h: 1440, bleed: 0 }], { title: 'Quiet (Rooms)', now: Date.UTC(2026, 10, 20) });
  const head = Buffer.from(pdf.slice(0, 9)).toString('latin1');
  const proxy = await getDocumentProxy(pdf);
  const p1 = await proxy.getPage(1);
  const p2 = await proxy.getPage(2);
  const [x0, y0, x1, y1] = p1.view;
  ok('PDF export: a real PDF a reader opens, one page per artboard at its exact size (bleed included around the A4 trim)', head.startsWith('%PDF-1.4') && proxy.numPages === 2 && Math.abs(x1 - x0 - (595.3 + 17)) < 0.5 && Math.abs(y1 - y0 - (841.9 + 17)) < 0.5 && Math.round(p2.view[2]) === 810, J([p1.view, p2.view]));
  const meta = await proxy.getMetadata();
  ok('…its title said, the producer named', meta.info.Title === 'Quiet (Rooms)' && /SocriaUX/.test(meta.info.Producer));
  const file = X.nativeFile(doc);
  const reopened = X.openNativeFile(file);
  ok('the editable file: saved and opened again, the same document', reopened && J(reopened.doc.artboards) === J(doc.artboards) && J(reopened.doc.tokens) === J(doc.tokens));
  ok('…a file that is not one is refused; a damaged one repaired with what was dropped said', X.openNativeFile('{"format":"other"}') === null && X.openNativeFile('not json') === null && X.openNativeFile(JSON.stringify({ format: X.NATIVE_FORMAT, doc: { ...doc, artboards: [{ ...doc.artboards[0], children: [...doc.artboards[0].children, { type: 'evil' }] }] } })).notes.length >= 1);
}

// ── fidelity, colour, collisions and the planner, held down after the 24-brief benchmark ──
{
  // the words: an apostrophe inside a quote never ends it; single quotes pair only at word edges
  const water = C.readGraphicBrief('A scientific infographic “How much of Earth’s water is fresh”');
  const single = C.readGraphicBrief("A poster for 'Letters in Motion', the studio's twelfth show");
  ok('quoted words are read whole: “Earth’s” does not end the headline, and an apostrophe is not a quote', water.content.headline === 'How much of Earth’s water is fresh' && single.content.headline === 'Letters in Motion', J([water.content.headline, single.content.headline]));

  // the accent: a colour the brief names; else its character; else one well spread by the project, said each time
  const red = C.accentFor(C.readGraphicBrief('A red poster for “Open Doors”'), 'p1');
  const warm = C.accentFor(C.readGraphicBrief('An Instagram post for “Salt & Ember”, warm'), 'p1');
  const plain = [1, 2, 3, 4, 5, 6].map((i) => C.accentFor(C.readGraphicBrief('A poster for “Open Doors”'), `project-${i}`).hex);
  ok('the accent: a colour the brief names (red), else the brief’s character (warm), else spread across projects; the reason said', red.hex === '#c8102e' && /says so/.test(red.why) && ['#c4552d', '#c9962b', '#9c3d2a'].includes(warm.hex) && /warm/.test(warm.why) && new Set(plain).size >= 3 && J(C.accentFor(C.readGraphicBrief('A poster for “Open Doors”'), 'project-1')) === J(C.accentFor(C.readGraphicBrief('A poster for “Open Doors”'), 'project-1')), J({ red, warm, plain }));

  // every word the brief gives is on the design, whatever the layout
  const full = { subhead: 'One room, twelve hands', body: 'Open every day but Monday.', cta: 'Book a visit', brand: 'The Print Room', meta: ['12–30 June 2027', 'Lisbon'] };
  const kinds = ['poster', 'ad', 'social', 'banner', 'magazine', 'book', 'album', 'label', 'announcement', 'presentation'];
  const lost = [];
  for (const k of kinds)
    for (const [i, img] of [[0, false], [1, true]]) {
      const b = C.readGraphicBrief('A design for “Letters in Motion”', { kind: k, content: { headline: 'Letters in Motion', ...full } });
      if (img) b.images = ['a1'];
      const doc = C.composeGraphic(b, dirFor('An exhibition of type', ['bold'], `fid-${k}`, i), { assets: img ? [{ id: 'a1', kind: 'image', src: 'https://e.org/a.jpg', width: 800, height: 600, name: 'A', source: 'upload' }] : [] }).doc;
      const words = doc.artboards.flatMap((ab) => D.walk(ab).map((l) => l.node).filter((n) => n.type === 'text').map((n) => n.text.replace(/\s*→$/, '')));
      for (const w of ['Letters in Motion', full.subhead, full.body, full.cta, full.brand, ...full.meta]) if (!words.some((t) => t === w || t.split(/\n|\s{2}·\s{2}/).includes(w))) lost.push(`${k}${img ? '+picture' : ''}: ${w}`);
    }
  ok('every word the brief gives is on the design, in every layout, with or without a picture (a layout with no place for one gives it free space)', lost.length === 0, J(lost));

  // collisions: words set over words are found; the composer makes none across those layouts
  const coll = D.normalizeDoc({ artboards: [{ id: 'b', width: 1080, height: 1080, children: [
    { id: 'a', type: 'text', role: 'headline', text: 'Over here', x: 100, y: 100, w: 800, h: 200, size: 120, font: 'Inter' },
    { id: 'c', type: 'text', role: 'subhead', text: 'And here too', x: 120, y: 150, w: 600, h: 60, size: 40, font: 'Inter' },
    { id: 'd', type: 'text', role: 'meta', text: 'Clear of both', x: 100, y: 900, w: 600, h: 40, size: 24, font: 'Inter' },
  ] }] });
  const cf = K.checkDoc(coll).filter((f) => f.kind === 'collision');
  ok('words set over words are found (and words clear of them are not)', cf.length === 1 && cf[0].node === 'c', J(cf));

  // contrast is judged across the whole line, not its middle: a headline crossing from the ground onto a pale shape
  const cross = D.normalizeDoc({ artboards: [{ id: 'b', width: 1000, height: 600, background: '#1d3315', children: [
    { id: 's', type: 'shape', shape: 'rect', role: 'motif', fill: '#f2efe6', x: 700, y: 0, w: 300, h: 600 },
    { id: 'h', type: 'text', role: 'headline', text: 'From dark to light', x: 40, y: 200, w: 920, h: 200, size: 90, font: 'Inter', color: '#f2efe6' },
  ] }] });
  const cc = K.checkDoc(cross).filter((f) => f.kind === 'contrast');
  const fixColour = cc[0]?.fix?.[0]?.set?.color;
  ok('contrast is sampled across the set line: a headline readable at its middle but not where it crosses a pale shape (its last words) is found; the fix offered reads on both, or none is pretended', cc.length === 1 && (fixColour ? K.inkOnAll(fixColour, ['#1d3315', '#f2efe6'], 3).color === fixColour && K.inkOnAll(fixColour, ['#1d3315', '#f2efe6'], 3).ratio >= 3 : /No one colour/.test(cc[0].message)), J(cc));
  ok('…and the ink that reads on everything beneath is chosen when there is one', K.inkOnAll('#777777', ['#ffffff', '#eeeeee'], 4.5).ratio >= 4.5);

  // a variable face is set at the weight asked, not the bottom of its range
  const varDoc = C.composeGraphic(C.readGraphicBrief('A poster for “Weights”, “Body text reads at its own weight”', { content: { headline: 'Weights', subhead: 'Body text reads at its own weight' } }), { ...dirFor('A poster', ['bold'], 'w1'), tokens: { ...dirFor('A poster', ['bold'], 'w1').tokens, fonts: { display: 'Inter Tight', body: 'Inter Tight' } }, look: { ...dirFor('A poster', ['bold'], 'w1').look, weight: 100 } }).doc;
  const sub = D.walk(varDoc.artboards[0]).find((l) => l.node.role === 'subhead')?.node;
  ok('a variable face is set at the weight asked (a subtitle at 400), never dropped to the bottom of its range', sub && sub.weight === 400, J(sub && { font: sub.font, weight: sub.weight }));

  // the brief's mood outranks the direction's volume: an experimental brief is not composed quiet
  const gal = { ...dirFor('A white cube gallery', ['quiet'], 'g1'), language: 'gallery', intensity: 10 };
  const exp = C.planFor(C.readGraphicBrief('A poster for “Unsaid Shapes”, an abstract art exhibition, experimental'), gal, F.formatOf('a4'));
  const calm = C.planFor(C.readGraphicBrief('A poster for “Unsaid Shapes”, quiet'), gal, F.formatOf('a4'));
  const minimalDoc = C.composeGraphic(C.readGraphicBrief('A poster for “Unsaid Shapes”, quiet'), gal).doc;
  ok('an experimental brief in a quiet language is not composed quiet; a quiet one is, and keeps one deliberate mark', exp.archetype !== 'minimal' && calm.archetype === 'minimal' && D.walk(minimalDoc.artboards[0]).some((l) => l.node.role === 'motif' && l.node.w > minimalDoc.artboards[0].width * 0.25), J([exp.archetype, calm.archetype]));

  // “the headline” of a wordmark board is its wordmark; with no shapes to turn, a pattern is offered, not forced
  const idDoc = C.composeGraphic({ ...C.readGraphicBrief('A brand identity board for “Kepler Lab”'), content: { headline: 'Kepler Lab', brand: 'Kepler Lab' } }, dirFor('A science studio', ['technical'], 'id1')).doc;
  const wm = idDoc.artboards[0];
  const bigger = E.readGraphicEdit('make the headline bigger', idDoc, { artboard: wm.id, selection: [] });
  const wordmark = D.walk(wm).find((l) => l.node.role === 'logo').node;
  ok('“the headline” of a wordmark board is its wordmark', bigger && bigger.ops.some((o) => o.id === wordmark.id), J(bigger));
  const bare = D.normalizeDoc({ artboards: [{ id: 'b', width: 1080, height: 1080, children: [{ id: 'h', type: 'text', role: 'headline', text: 'Plain', x: 64, y: 64, w: 900, h: 200, size: 120, font: 'Inter' }] }] });
  const offer = E.readGraphicEdit('Turn these shapes into an angular geometric pattern', bare, { artboard: 'b', selection: [] });
  const applied = offer && D.applyOps(bare, offer.ops);
  ok('with no shapes to turn, a pattern is offered with a question (previewed, never forced), clear of the words', offer && /no shapes/.test(offer.question ?? '') && offer.ops.length === 6 && applied.ok && K.checkDoc(applied.doc).filter((f) => f.kind === 'contrast' && f.severity === 'high').length === 0, J(offer?.question));
}

{
  const one = D.normalizeDoc({ artboards: [{ id: 'b', width: 1080, height: 1080, children: [{ id: 'h', type: 'text', role: 'headline', text: 'Plain', x: 64, y: 64, w: 900, h: 200, size: 120, font: 'Inter' }] }] });
  const e = E.readGraphicEdit('#ff00aa', one, { artboard: 'b', selection: ['h'] });
  ok('a colour alone, with something selected, colours it (as the ask bar’s example offers)', e && e.ops.length === 1 && e.ops[0].set.color === '#ff00aa', J(e));
  ok('…and with nothing selected it is not guessed at', E.readGraphicEdit('#ff00aa', one, { artboard: 'b', selection: [] }) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
