// test/browser/ux-v0/web-identity.mjs — are websites unchanged? Every page the section bench draws (each section kind
// × variant, across the classic styles and every visual language) rendered by a base commit's bundle and by this one,
// the spec, HTML and CSS compared byte for byte (the spec's createdAt aside); the direction each language builds; the
// font menu, and every face's lookups, weights, advances and stylesheet as a website sees them. Node only, no browser.
//
//   UXV0_BEFORE_BUNDLE=<a base worktree>/test/.tmp/ux-v0-under-test.mjs node test/browser/ux-v0/web-identity.mjs
//
// Build both bundles first (node test/run.mjs builds this one; run it in the base worktree for the other). Exits 1 when
// anything differs, and names what.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const beforePath = process.env.UXV0_BEFORE_BUNDLE;
if (!beforePath) {
  console.error('set UXV0_BEFORE_BUNDLE to the base commit’s test/.tmp/ux-v0-under-test.mjs');
  process.exit(2);
}
const B = await import(pathToFileURL(beforePath).href);
const A = await import(pathToFileURL(join(here, '../../.tmp/ux-v0-under-test.mjs')).href);
const src = readFileSync(join(here, 'sections.mjs'), 'utf8');
const seg = src.slice(src.indexOf('const names = '), src.indexOf('// the classic styles'));
const helpers = (V) => new Function('V', `${seg}; return { refs, contentFor, PALETTES };`)(V);

let compared = 0;
const diffs = [];
const same = (tag, x, y) => {
  compared++;
  if (x !== y) diffs.push(tag);
};

// the font registry as a website sees it
same('FONTS', JSON.stringify(B.FONTS), JSON.stringify(A.FONTS));
same('fontMenu', B.fontMenu(), A.fontMenu());
for (const f of B.FONTS) {
  same(`knownFont ${f.name}`, JSON.stringify(B.knownFont(f.name)), JSON.stringify(A.knownFont(f.name)));
  same(`stylesheet ${f.name}`, B.fontStylesheet([f.name]), A.fontStylesheet([f.name]));
  same(`stack ${f.name}`, B.fontStack(f.name), A.fontStack(f.name));
  for (const w of [100, 300, 450, 700, 840, 950]) same(`weight ${f.name} ${w}`, String(B.nearestWeight(f.name, w)), String(A.nearestWeight(f.name, w)));
  for (const w of [400, 800]) for (const up of [true, false]) same(`advance ${f.name}`, String(B.advanceEm(f.name, w, up)), String(A.advanceEm(f.name, w, up)));
  same(`italic ${f.name}`, String(B.hasItalic(f.name)), String(A.hasItalic(f.name)));
}
same('stylesheet all', B.fontStylesheet(B.FONTS.map((f) => f.name)), A.fontStylesheet(A.FONTS.map((f) => f.name)));
for (const n of ['Anybody', 'Roboto Flex', 'Recursive', 'Nonexistent Face'])
  for (const fn of ['displayFont', 'bodyFont']) same(`${fn} ${n}`, B[fn](n), A[fn](n));

// every page the section bench draws
const hb = helpers(B);
const ha = helpers(A);
same('LANGUAGES', JSON.stringify(B.LANGUAGES), JSON.stringify(A.LANGUAGES));
const PALS = ['roast', 'ochre', 'night'];
const LOOKS = B.LANGUAGES.map((l, i) => `look-${l.id}:${PALS[i % 3]}`);
const RUNS = ['editorial:roast', 'bold:roast', 'warm:roast', 'technical:roast', 'minimal:roast', 'editorial:ochre', 'bold:ochre', 'warm:night', ...LOOKS].map((x) => x.split(':'));
const sample = (V) => V.normalizeBrief({ pageType: 'website', objective: 'A sample', personality: ['warm'], palette: [], typography: { display: 'Fraunces', body: 'Inter' } }, new Set());
const pages = (V, h) => {
  const out = [];
  for (const [style, pal] of RUNS) {
    let tokens;
    let look;
    if (style.startsWith('look-')) {
      const d = V.buildDirection(V.languageOf(style.slice(5)), sample(V), { seed: 7, faithful: false });
      out.push({ tag: `direction ${style}`, text: JSON.stringify(d) });
      tokens = { ...d.tokens, colors: h.PALETTES[pal] };
      look = { ...d.look, accent2: d.look.accent2 ? '#3f7c85' : '' };
    } else {
      tokens = { colors: h.PALETTES[pal], fonts: { display: 'Instrument Serif', body: 'Inter' }, scale: 'comfortable', radius: 'soft', style, imageTreatment: 'natural' };
      look = undefined;
    }
    let vi = 0;
    for (const def of V.LIBRARY) {
      for (const variant of def.variants) {
        const tone = look ? V.TONES[vi++ % V.TONES.length] : undefined;
        const app = !def.pages.includes('website');
        const wantImgs = def.kind === 'gallery' ? 4 : Math.max(def.images[0], def.images[1] > 0 ? 1 : 0);
        const sec = { id: 's', kind: def.kind, variant, content: h.contentFor(def), images: h.refs.slice(0, wantImgs).map((r) => r.id), tone };
        const raw = { title: 'Check', pageType: app ? 'app-screen' : 'website', platform: 'web', tokens, look, sections: app && def.kind !== 'app-nav' ? [{ id: 'nav', kind: 'app-nav', variant: 'topbar', content: { brand: 'Studio', items: ['Today', 'Classes', 'Profile'] }, images: [] }, sec] : [sec] };
        const spec = V.normalizeSpec(raw, { refs: h.refs, seen: h.refs.map((r) => r.id), queries: [], palettes: [], type: [] });
        const tag = `${style}:${pal} ${def.kind}/${variant}`;
        if (!spec) { out.push({ tag, text: 'null' }); continue; }
        const { html, css } = V.renderDesign(spec, h.refs);
        out.push({ tag, text: JSON.stringify({ ...spec, createdAt: 0 }) + '\n' + html + '\n' + css });
      }
    }
  }
  return out;
};
const pb = pages(B, hb);
const pa = pages(A, ha);
same('page count', String(pb.length), String(pa.length));
for (let i = 0; i < Math.min(pb.length, pa.length); i++) same(pb[i].tag, pb[i].text, pa[i].text);
const renders = pb.filter((p) => !p.tag.startsWith('direction')).length;
console.log(`${compared} comparisons (${renders} pages rendered by each bundle, ${LOOKS.length} visual languages, ${RUNS.length} runs): ${diffs.length} differ`);
if (diffs.length) console.log(diffs.slice(0, 30).join('\n'));
process.exit(diffs.length ? 1 : 0);
