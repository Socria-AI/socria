// The company (lib/ux-v0/company): what it is, with where each statement came from; its products; its library of
// real files; what the designer is told of it — and only that; what it is known not to have.
//
// No model is called. Files are real bytes made here (an SVG logo, a PNG), read by the same ingestion the product uses.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const T = await import(pathToFileURL(join(here, '.tmp', 'design-under-test.mjs')).href);
const { company: C, companyTold: CT, companyRead: CR, dsiAssets: AS, request: RQ, brand: BR, flow: FL, doc: D } = T;

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, typeof x === 'string' ? x.slice(0, 700) : JSON.stringify(x).slice(0, 700))));
const sec = (s) => console.log(`\n=== ${s} ===`);
const NOW = 1_800_000_000_000;

// a real PNG of w × h, one colour
function png(w, h, rgb = [40, 60, 30]) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, () => Buffer.from(rgb)))]);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]));
}
const svgBytes = (inner = '<circle cx="50" cy="50" r="40" fill="#354620"/>') => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${inner}</svg>`);
const imp = async (name, bytes, opts = {}) => (await AS.importAsset({ name, bytes }, { now: NOW, ...opts })).asset;

sec('what a company is: stated, found, confirmed');
let co = C.emptyCompany('Northlight', NOW);
{
  ok('a company begins with a name and nothing invented', C.COMPANY_ID.test(co.id) && co.facts.length === 0 && co.products.length === 0 && co.library.length === 0 && co.systemId === null);
  co = C.addFact(co, { kind: 'mission', text: 'Help people understand the buildings they live in.' }, NOW + 1);
  ok('what the person says is confirmed at once, and says where it came from', co.facts[0].confirmed && co.facts[0].source === 'stated');
  co = C.addFact(co, { kind: 'philosophy', text: 'A building is a decision someone made.', source: 'imported', from: 'charter.md' }, NOW + 2);
  ok('what is found in something imported waits to be confirmed', !co.facts[1].confirmed && co.facts[1].from === 'charter.md');
  ok('the same statement twice is one statement', C.addFact(co, { kind: 'mission', text: 'help people understand the buildings they live in.' }).facts.length === 2);
  let told = CT.companyTold(co);
  ok('the designer is told only what is confirmed', told.about.length === 1 && /Mission: Help people/.test(told.about[0]) && !JSON.stringify(told).includes('decision someone made'), told);
  co = C.editFact(co, co.facts[1].id, { confirmed: true });
  told = CT.companyTold(co);
  ok('…and a found statement once the person confirms it', told.about.some((x) => /It believes: A building is a decision/.test(x)));
  co = C.addFact(co, { kind: 'avoid', text: 'Stock photographs of handshakes.' });
  co = C.addFact(co, { kind: 'principle', text: 'Plain words; no jargon.' });
  co = C.addFact(co, { kind: 'audience', text: 'People choosing where to live.' });
  co = C.addFact(co, { kind: 'preference', text: 'Drawings over photographs.' });
  told = CT.companyTold(co);
  ok('a preference is said as a leaning, a rejection as final', told.about.some((x) => /a leaning, not a rule\): Drawings/.test(x)) && told.avoid[0] === 'Stock photographs of handshakes.' && told.principles[0] === 'Plain words; no jargon.' && told.audiences.length === 1);
}

sec('products: named as they are, never described from nothing');
{
  co = C.putProduct(co, { name: 'Atlas', what: 'A map of every permitted building change in a city.', audience: 'residents' });
  co = C.putProduct(co, { name: 'Stratus' });
  co = C.putProduct(co, { name: 'Ledger', what: 'Planned.', status: 'planned' });
  const told = CT.companyTold(co);
  ok('a product is told as the company describes it', told.products.some((x) => /^Atlas — A map of every permitted/.test(x) && /\(for residents\)/.test(x)));
  ok('a product with nothing supplied is named only, and the designer is told to describe nothing', told.products.includes('Stratus') && told.missing.some((x) => /what Stratus is \(nothing supplied: name it only, describe nothing\)/.test(x)), told);
  ok('a planned product is said to be planned', told.products.some((x) => /Ledger.*\[planned, not released\]/.test(x)));
  const stratus = co.products.find((p) => p.name === 'Stratus');
  ok('a product removed is gone from what is told', !CT.companyTold(C.removeProduct(co, stratus.id)).products.includes('Stratus'));
}

sec('the library: real files, approved by the person, found in plain words');
let logo, shot;
{
  const told0 = CT.companyTold(co);
  ok('with no logo and no photographs, the designer is told so (and not to draw or imply them)', told0.missing.some((x) => /a logo \(none supplied: set the name as text/.test(x)) && told0.missing.some((x) => /photographs \(none supplied/.test(x)), told0.missing);
  logo = await imp('northlight-logo.svg', svgBytes());
  let r = C.addItem(co, logo, {}, NOW + 10);
  co = r.company;
  ok('a logo file is read as a logo, and is not approved by being added', r.added && r.item.what === 'logo' && !r.item.asset.approved && !r.item.asset.protected);
  ok('the same bytes twice are one item', !C.addItem(co, await imp('copy-of-logo.svg', svgBytes())).added);
  ok('an unapproved logo is not offered to a design, and the designer is told a logo exists but is not approved', CT.libraryFor(co, 'a poster').length === 0 && CT.companyTold(co).missing.some((x) => /an approved logo \(the library holds one, not yet approved/.test(x)));
  ok('asking for the logo says it is not approved', CT.missingFor(co, 'Put our logo top left').some((x) => /in the library but not approved/.test(x)));
  co = C.setItem(co, logo.id, { asset: AS.approveAsset(logo, true) });
  const lib = CT.libraryFor(co, 'a poster for the autumn talks');
  ok('once approved it is offered, as itself, with the rule that protects it', lib.length === 1 && /^lib-[0-9a-f]{12}$/.test(lib[0].id) && /^data:image\/svg\+xml;base64,/.test(lib[0].src) && /APPROVED AND PROTECTED/.test(lib[0].note) && /never redraw, trace, recolour, crop, stretch/.test(lib[0].note), lib);
  ok('…and nothing is said to be missing about the logo', !CT.companyTold(co).missing.some((x) => /logo/.test(x)) && CT.missingFor(co, 'Put our logo top left').length === 0);
  const atlas = co.products.find((p) => p.name === 'Atlas');
  shot = await imp('atlas-map-screenshot.png', png(1200, 800));
  co = C.addItem(co, shot, { product: atlas.id, description: 'The city map with permitted changes highlighted', tags: ['Map', 'city'] }, NOW + 11).company;
  co = C.setItem(co, shot.id, { asset: AS.approveAsset(shot, true) });
  const item = co.library.find((i) => i.asset.id === shot.id);
  ok('a screenshot is kept as a screenshot of its product, with tags tidied', item.what === 'screenshot' && item.product === atlas.id && item.tags.join() === 'map,city');
  ok('…and is told with the rule that it is shown as it is', /a real screenshot: show it as it is/.test(CT.itemNote(co, item)) && /of Atlas/.test(CT.itemNote(co, item)));
  ok('found in plain words: by what it is', CT.findItems(co, 'the approved logo')[0]?.item.asset.id === logo.id && CT.findItems(co, 'screenshots')[0]?.item.asset.id === shot.id);
  ok('…by its product', CT.findItems(co, 'screens of Atlas')[0]?.item.asset.id === shot.id);
  {
    // a product whose name is also a word for a kind of file
    let c2 = C.putProduct(C.emptyCompany('Socria', NOW), { name: 'Logos', what: 'A conversation that asks.' });
    c2 = C.addItem(c2, logo).company;
    c2 = C.addItem(c2, shot, { what: 'screenshot', product: c2.products[0].id }).company;
    const hits = CT.findItems(c2, 'screenshots of Logos');
    ok('a product’s name is read as the product, not as a kind of file (“screenshots of Logos” is not the logo)', hits.length === 1 && hits[0].item.asset.id === shot.id, hits.map((h) => h.item.asset.name));
    ok('…while “the logo” is still the logo', CT.findItems(c2, 'the logo')[0]?.item.asset.id === logo.id);
  }
  ok('…by what it shows', CT.findItems(co, 'the city map')[0]?.item.asset.id === shot.id);
  ok('what is not there is not found (nothing is offered in its place)', CT.findItems(co, 'photographs of the team').length === 0);
  ok('…and asking for it says so', CT.missingFor(co, 'Use a photo of our team in the office').some((x) => /no photographs are in the library/.test(x)) && CT.missingFor(co, 'Show screenshots of Stratus').some((x) => /no screenshots of Stratus/.test(x)) && CT.missingFor(co, 'Show screenshots of Stratus').some((x) => /nothing has been supplied about what Stratus is/.test(x)));
  ok('…while asking for what is there reports nothing missing', CT.missingFor(co, 'Use the Atlas screenshot beside our logo').length === 0);
  const forWork = CT.libraryFor(co, 'A launch poster for Atlas with a real screenshot');
  ok('a request is given the approved items, the protected logo first', forWork.length === 2 && /logo/.test(forWork[0].name) && /screenshot/.test(forWork[1].name), forWork.map((x) => x.name));
  co = C.setItem(co, shot.id, { retired: true });
  ok('a retired item is no longer offered, but a design that used it can still draw it', CT.libraryFor(co, 'screenshots of Atlas').every((x) => !/screenshot/.test(x.name)) && CT.libraryPictures(co).some((x) => /screenshot/.test(x.name)));
  co = C.setItem(co, shot.id, { retired: false });
  const small = await imp('tiny-logo.png', png(120, 60));
  ok('a low-resolution raster cannot be approved as the logo', !AS.approveAsset(small, true).approved);
  co = C.setItem(co, shot.id, { people: true });
  ok('a picture of real people carries that rule', /shows real people: never alter them/.test(CT.itemNote(co, co.library.find((i) => i.asset.id === shot.id))));
  co = C.setItem(co, shot.id, { people: false });
}

sec('kept, read back, and held to shape');
{
  const back = C.normalizeCompany(JSON.parse(JSON.stringify(co)));
  ok('a company reads back as it was kept', back && back.facts.length === co.facts.length && back.products.length === co.products.length && back.library.length === 2 && back.library[0].asset.protected === true && back.name === 'Northlight');
  ok('what is not a company is not read as one', C.normalizeCompany({ id: 'dsys_abcd', name: 'x' }) === null && C.normalizeCompany(null) === null);
  const hostile = C.normalizeCompany({ ...JSON.parse(JSON.stringify(co)), facts: [{ kind: 'nonsense', text: 'x'.repeat(5000), confirmed: 'yes' }], library: [{ asset: { ...co.library[0].asset, svg: '<svg><script>alert(1)</script></svg>' } }], missing: ['a', 'a', 7] });
  ok('a statement of an unknown kind is held to a known one and its length; "confirmed" must be true to count', hostile.facts[0].kind === 'philosophy' && hostile.facts[0].text.length === 600 && hostile.facts[0].confirmed === false);
  ok('a library file that is not safe is not kept', hostile.library.length === 0 && hostile.missing.join() === 'a');
}

sec('something the company has written, read for what it says about itself');
{
  const text = `# About Northlight\n\nOur mission is to help people understand the buildings they live in.\n\nWe believe a building is a decision someone made, and that decisions can be read.\n\nNorthlight is built for people who are choosing where to live. We never use stock photographs. Our voice is plain: we write the way we would say it across a table.\n\nUnlike most property sites, Northlight shows what is permitted, not what is promised.\n\nContact us at hello@example.com.`;
  const c = CR.candidatesFrom(text);
  const kinds = Object.fromEntries(c.map((x) => [x.kind, x.text]));
  ok('sentences that say what the company is are offered by kind, quoted as written', /^Our mission is to help people understand/.test(kinds.mission ?? '') && /^We believe a building is a decision/.test(kinds.philosophy ?? '') && /built for people who are choosing/.test(kinds.audience ?? '') && /^We never use stock photographs\.$/.test(kinds.avoid ?? '') && /Unlike most property sites/.test(kinds.positioning ?? ''), c);
  ok('nothing is offered from text that says nothing of the kind', CR.candidatesFrom('Lorem ipsum dolor sit amet. The quick brown fox jumps over the dog.').length === 0);
  ok('every candidate is a sentence from the text itself', c.every((x) => text.replace(/\s+/g, ' ').includes(x.text)));
}

sec('what reaches the designer: the company apart from the project, and its pictures with their rules');
{
  const told = CT.companyTold(co);
  const req = RQ.readDesignRequest({ words: 'A poster for the autumn talks', doc: { artboards: [], tokens: '' }, kind: 'poster', format: 'a3', memory: { brief: '', decisions: [], rejected: [] }, turns: [], comments: [], company: { ...told, missing: [...CT.missingFor(co, 'A poster with a photo of our team'), ...told.missing] }, assets: CT.libraryFor(co, 'A poster for the autumn talks').map(({ src, ...a }) => a) }, () => null);
  ok('the request says the company is permanent and the project works within it', req.ok && /## The company: Northlight \(permanent — the project works within it, and never changes it\)/.test(req.user), req.ok ? req.user.slice(0, 600) : req);
  ok('…with what it is, its products, who it is for, what it holds to and what it has turned down', req.ok && /Mission: Help people understand/.test(req.user) && /Products: Atlas — /.test(req.user) && /Who it is for: People choosing/.test(req.user) && /It holds to: Plain words/.test(req.user) && /turned down, for good: Stock photographs of handshakes/.test(req.user));
  ok('…and what is not available, to be said rather than invented', req.ok && /Not available \(say so rather than invent\):[^\n]*no photographs are in the library/.test(req.user) && /what Stratus is \(nothing supplied/.test(req.user));
  ok('the approved logo is given as a picture with its rule', req.ok && /asset:lib-[0-9a-f]{12} — northlight-logo[^\n]*APPROVED AND PROTECTED: place it exactly as it is/.test(req.user), req.ok ? req.user.match(/## Their pictures[\s\S]{0,500}/)?.[0] : '');
  ok('a hostile company is held to shape', RQ.readCompany({ name: 'x'.repeat(500), about: Array(100).fill('y'.repeat(2000)) }).about.length === 14 && RQ.readCompany({ about: ['no name'] }) === null);
  // a project's own picture and a library picture with the same id are one
  const s0 = D.emptyState('poster', 'a3', '');
  let seen = null;
  const transport = { send: async (body) => ((seen = body), { ok: true, text: '<say>ok</say><ok/>', model: null, usage: null }) };
  await FL.runRequest({ ...s0, assets: [{ id: 'mine', name: 'Mine', src: 'upload:x', width: 10, height: 10, note: 'my own' }] }, { words: 'hello', library: [{ id: 'mine', name: 'dup', width: 1, height: 1 }, { id: 'lib-abc', name: 'Logo', width: 100, height: 100, note: 'protected' }] }, transport, { picture: async () => null, measure: async () => ({}) }, { parse: () => ({}) });
  ok('a request carries the project’s pictures and the library’s, each once, with their notes', seen.assets.length === 2 && seen.assets[0].note === 'my own' && seen.assets[1].id === 'lib-abc' && seen.assets[1].note === 'protected', seen.assets);
}

console.log(`\ncompany: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
