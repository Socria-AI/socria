// The docs wiki, checked against itself.
//
// WHY THIS EXISTS. The wiki is three lists that have to agree: the registry
// (reading order, titles, groups), the slug → component map, and each page's
// own "on this page" strip. Nothing in the type system connects them. A page
// added to one and not the others is a 404 from the sidebar, a page missing
// from the index, or — the quiet one — a contents strip whose links scroll
// nowhere because a heading was renamed and its id was not.
//
// Core 4 is the page that prompted it: adding one page meant touching four
// files, and the fourth was easy to forget.
//
// SINCE THE ARCHIVE (24 October 2026) the registry also says which pages are
// a record of something no longer offered — `archived`, under Earlier Socria,
// which every such page's banner is drawn from — and that is held to the
// model registry too: a withdrawn model's page is in the archive, and the
// model on offer is documented as current.
//
// AND SINCE THE CORE PAGES WENT ("remove references of socria core on dev,
// we removed core lol"): the archived chat's three model pages were taken
// out, their addresses go to Logos 5 (app/docs/[slug]/page.tsx), and nothing a
// reader meets in the docs — a page, a registry entry, a diagram, a demo —
// says "Core". Code comments may; they are not read there.
//
// Source-read rather than rendered: these are server components full of JSX,
// and what is being checked is the agreement between the lists, which is a
// property of the text.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOC_PAGES, DOC_GROUPS, docPage, neighbors } from './.tmp/registry.mjs';
import { offeredModels } from './.tmp/socria-model-store.mjs';
import { SOCRIA_MODELS } from './.tmp/socria-prompt.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const index = read('app/docs/content/index.ts');
const mapped = [...index.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*\w+,/gm)].map((m) => m[1]);

/** Every .ts/.tsx file of the docs site. */
const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) return walk(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
/** A source as a reader meets it: comments (block, JSX, line) and imports gone. A URL's "//" is not a comment. */
const readable = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
    .replace(/^\s*import [^\n]*$/gm, '');
/** The removed pages and where their addresses go: the MOVED map in the page that serves every slug. */
const slugPage = read('app/docs/[slug]/page.tsx');
const moved = new Map(
  [...(slugPage.match(/const MOVED = new Map<string, string>\(\[([\s\S]*?)\]\);/)?.[1] ?? '').matchAll(/\[\s*'([a-z0-9-]+)'\s*,\s*'([^']+)'\s*\]/g)]
    .map((m) => [m[1], m[2]])
);

console.log('=== every page exists in all three places ===');
{
  for (const p of DOC_PAGES) {
    ok(`${p.slug}: has a file`, existsSync(join(root, `app/docs/content/${p.slug}.tsx`)));
    ok(`  and is mapped to a component`, mapped.includes(p.slug), mapped.join(','));
    ok(`  and its group is a real one`, DOC_GROUPS.includes(p.group), p.group);
    ok(`  with a blurb worth reading`, p.blurb.length > 20 && p.title.length > 2);
  }
  const listed = new Set(DOC_PAGES.map((p) => p.slug));
  for (const slug of mapped) ok(`${slug} is in the reading order`, listed.has(slug));
  ok('slugs are unique', listed.size === DOC_PAGES.length);
}

console.log('\n=== each page agrees with its own contents strip ===');
{
  for (const p of DOC_PAGES) {
    const src = read(`app/docs/content/${p.slug}.tsx`);
    ok(`${p.slug}: takes its metadata from the registry`, src.includes(`docPage('${p.slug}')`));
    // The strip and the headings, in order. A renamed heading whose id was
    // left behind is a link that scrolls nowhere, and nothing else catches it.
    const strip = [...src.matchAll(/\{\s*id:\s*'([\w-]+)',\s*heading:/g)].map((m) => m[1]);
    const heads = [...src.matchAll(/<H2 id="([\w-]+)"/g)].map((m) => m[1]);
    ok(`  every strip entry has a heading`, strip.every((id) => heads.includes(id)),
      strip.filter((id) => !heads.includes(id)).join(','));
    ok(`  every heading is in the strip`, heads.every((id) => strip.includes(id)),
      heads.filter((id) => !strip.includes(id)).join(','));
    ok(`  and they are in the same order`, strip.join(',') === heads.join(','),
      `${strip.join(',')} vs ${heads.join(',')}`);
  }
}

// The Core 4 page's own checks (its claims, its measured numbers, the prompt test) went with the page.

console.log('\n=== Logos 5 says which part of the work is yours, and says it honestly ===');
{
  // The decision the removed page described is Logos 5's now, and the Logos 5
  // page is where a reader learns its rules — so the claims a reader most
  // needs are held there, each a real property of the code, honest half too.
  const src = read('app/docs/content/logos-5.tsx');
  ok('withholding needs your own words, never a guess', /held back only on your own words/i.test(src) && /Never on a guess about you/.test(src));
  ok('  practising has a floor', /Practising has a floor/.test(src) && /after repeated attempts/i.test(src));
  ok('  harm comes first', /Harm comes first/.test(src));
  ok('  and it says it has not been studied with the people who use it', /has not been studied with the people who use it/.test(src));
}

console.log('\n=== the models page names every model on offer, and counts them ===');
{
  const models = read('app/docs/content/models.tsx');
  // Every model on offer, by the name the product gives it. A name counts
  // only as itself — "Logos" in "Logos 5" is not the original Logos. The docs
  // are production's: a dev-only model is not one a reader can pick.
  const names = (src, name) => new RegExp(`\\b${name.replace(/\./g, '\\.')}\\b(?!\\s?\\d|\\.\\d)`).test(src);
  const onOffer = offeredModels().filter((id) => !SOCRIA_MODELS[id].devOnly && !SOCRIA_MODELS[id].withdrawn);
  // Withdrawn models are no longer each held to this page by name: the archived chat's are gone from the docs, and the earlier Logos are held below as linked rows.
  ok('a model is on offer', onOffer.length > 0, onOffer.join(','));
  for (const id of onOffer)
    ok(`${SOCRIA_MODELS[id].short} is on the models page`, names(models, SOCRIA_MODELS[id].short));
  // The count a page states is the count on offer — read from the registry,
  // so the next retirement or launch fails here until the prose catches up,
  // in either direction. There is no menu now, and one model: "one model".
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  // Retired models kept by name under "Other models" are not counted (none
  // are kept there since the archive).
  const n = WORDS[onOffer.length];
  const said = (src) => [...src.matchAll(/\b(one|two|three|four|five|six|seven) models?\b/gi)].map((m) => m[1].toLowerCase());
  ok(`the page says there ${n === 'one' ? 'is one' : `are ${n}`}, as many as are offered`, said(models).length > 0 && said(models).every((w) => w === n), said(models).join(','));
  const overview = read('app/docs/content/overview.tsx');
  ok('the overview counts them the same way', said(overview).length > 0 && said(overview).every((w) => w === n), said(overview).join(','));
  // "and links to Core 4" went with the Core 4 page; the overview is held below to linking no removed page.
  ok('  and links to Logos 5, and to the history', overview.includes('/docs/logos-5') && overview.includes('/docs/history'));
  // "The models before it": every page kept in the archive is a row, linked.
  const kept = DOC_PAGES.filter((p) => p.archived);
  const unlinked = kept.filter((p) => !models.includes(`href="/docs/${p.slug}"`)).map((p) => p.slug);
  ok('the models page links every archived page', kept.length > 0 && unlinked.length === 0, unlinked.join(','));
  ok('  and the history', models.includes('href="/docs/history"'));
}

console.log('\n=== the archive is marked as the archive, and agrees with the models ===');
{
  const kept = DOC_PAGES.filter((p) => p.archived);
  // Every archived page opens with a banner drawn from its registry entry, so
  // the entry is what has to be right.
  ok('the banner is drawn from the registry', /\{page\.archived && <ArchivedNote page=\{page\} \/>\}/.test(read('app/docs/Article.tsx')));
  ok('every archived page is under Earlier Socria', kept.every((p) => p.group === 'Earlier Socria'),
    kept.filter((p) => p.group !== 'Earlier Socria').map((p) => p.slug).join(','));
  for (const p of kept)
    ok(`${p.slug}: says what, when, and what replaced it`,
      [p.archived.what, p.archived.on, p.archived.replacedBy].every((s) => typeof s === 'string' && s.trim().length > 2));

  // Held to the models: a withdrawn model's page is in the archive, dated as
  // the registry dates it where the registry gives a date — or, for the
  // archived chat's models, whose pages were taken out, there is no page and
  // its address goes to Logos 5. Either way a withdrawn model is accounted
  // for. The model on offer is documented as current. A model's page is the
  // one titled with its label.
  const DATE = /\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)\b/;
  for (const id of Object.keys(SOCRIA_MODELS)) {
    const m = SOCRIA_MODELS[id];
    const page = DOC_PAGES.find((p) => p.title === m.label);
    if (m.withdrawn && moved.has(id)) {
      ok(`${m.short} is withdrawn, its page is gone, and /docs/${id} goes to Logos 5`,
        !page && !docPage(id) && moved.get(id) === '/docs/logos-5',
        page ? `${page.slug} is still a page` : String(moved.get(id)));
    } else if (m.withdrawn) {
      const date = m.withdrawn.match(DATE)?.[0];
      ok(`${m.short} is withdrawn, and its page is in the archive${date ? `, dated ${date}` : ''}`,
        !!page?.archived && (!date || new RegExp(`\\b${date}\\b`).test(page.archived.on)),
        page ? (page.archived ? JSON.stringify(page.archived) : `${page.slug} is not archived`) : `no page titled ${m.label}`);
    } else if (!m.devOnly && offeredModels().includes(id)) {
      ok(`${m.short} is offered, and its page is current`, !!page && !page.archived && page.group !== 'Earlier Socria',
        page ? page.slug : `no page titled ${m.label}`);
    }
  }

  const history = read('app/docs/content/history.tsx');
  const untold = kept.filter((p) => !history.includes(`href="/docs/${p.slug}"`)).map((p) => p.slug);
  ok('the history links every archived page', untold.length === 0, untold.join(','));
}

console.log('\n=== nothing in the docs is about Core any more ===');
{
  const CORE = /\bCore\b/;
  // The registry is what the sidebar, the index cards, the sitemap and
  // llms.txt read, so an entry naming Core would put it on every one of them.
  const named = DOC_PAGES.filter((p) => /^core-/.test(p.slug) || CORE.test(JSON.stringify(p))).map((p) => p.slug);
  ok('no registry entry is a Core page or names Core', named.length === 0, named.join(','));
  const files = readdirSync(join(root, 'app/docs/content'));
  ok('no Core page is left in the content folder', !files.some((f) => /^core-/.test(f)), files.join(','));
  ok('  and none is imported or mapped to a component', !mapped.some((s) => /^core-/.test(s)) && !/from '\.\/core-/.test(index));

  // Every file of the docs site as a reader meets it: the pages, the diagrams'
  // labels and descriptions, the demos, the archived banner, the metadata.
  const site = walk('app/docs');
  const said = site.flatMap((f) =>
    readable(read(f)).split('\n').flatMap((l, i) => (CORE.test(l) ? [`${f}:${i + 1}: ${l.trim().slice(0, 120)}`] : []))
  );
  ok(`no page, diagram, demo or banner says "Core" (${site.length} files read)`, site.length > 20 && said.length === 0, said.join(' | '));
  const linked = site.filter((f) => /\/docs\/core-/.test(read(f)));
  ok('nothing links to a removed Core page', linked.length === 0, linked.join(','));
  // The archived chat's daily counters are still in lib/entitlements (its
  // routes read them); a docs page printing them would be selling an allowance
  // for a screen that is gone.
  const counted = site.filter((f) => /core-chats|core-messages/.test(readable(read(f))));
  ok('no page prints the archived chat’s allowance', counted.length === 0, counted.join(','));
  ok('the docs no longer import the archived model picker', site.every((f) => !/components\/ModelPicker/.test(read(f))));
}

console.log('\n=== the old Core addresses still land, on Logos 5 ===');
{
  for (const slug of ['core-2', 'core-3', 'core-4'])
    ok(`/docs/${slug} goes to /docs/logos-5`, moved.get(slug) === '/docs/logos-5', String(moved.get(slug)));
  const to = [...moved.values()].map((p) => p.replace(/^\/docs\//, ''));
  ok('  every address moved lands on a page that exists', to.length > 0 && to.every((s) => !!docPage(s) && s !== 'overview'), to.join(','));
  ok('  and none of them is still a page', [...moved.keys()].every((s) => !docPage(s)));
  ok('  permanently (308)',
    /import \{[^}]*\bpermanentRedirect\b[^}]*\} from 'next\/navigation';/.test(slugPage) &&
      /const moved = MOVED\.get\(params\.slug\);\s*if \(moved\) permanentRedirect\(moved\);/.test(slugPage));
  const at = slugPage.indexOf('permanentRedirect(moved)');
  ok('  before the page can be a 404', at > 0 && at < slugPage.indexOf('notFound()'));
  // generateStaticParams lists only the registry, so a moved slug (and
  // /docs/overview) reaches the page only while dynamic params are allowed.
  ok('  and a slug the static list leaves out still reaches the page', /^export const dynamicParams = true;$/m.test(slugPage) && !/dynamicParams\s*=\s*false/.test(slugPage));
  ok('  while /docs/overview still goes to /docs', /if \(params\.slug === 'overview'\) redirect\('\/docs'\);/.test(slugPage));
}

console.log('\n=== the history has no Core entries, and keeps the Logos line ===');
{
  const history = read('app/docs/content/history.tsx');
  const strip = [...history.matchAll(/\{\s*id:\s*'([\w-]+)',\s*heading:\s*'([^']*)'/g)].map((m) => ({ id: m[1], heading: m[2] }));
  const core = strip.filter((s) => /^core/.test(s.id) || /\bCore\b/.test(s.heading)).map((s) => s.id);
  ok('no Core entry in its contents', strip.length > 0 && core.length === 0, core.join(','));
  ok('  nor a Core heading or link in the page', !/<H2 id="core/.test(history) && !/\/docs\/core-/.test(history) && !/\bCore\b/.test(readable(history)));
  const line = ['logos', 'logos-2', 'logos-3', 'logos-3-5', 'logos-4', 'logos-5'];
  const ids = strip.map((s) => s.id);
  ok('  every Logos is there, in order', line.every((id, i) => ids.includes(id) && (i === 0 || ids.indexOf(id) > ids.indexOf(line[i - 1]))), ids.join(','));
  const diagrams = readable(read('app/docs/Diagrams.tsx'));
  const timeline = diagrams.slice(diagrams.indexOf('export function HistoryTimeline'), diagrams.indexOf('export function CarriedIntoLogos5'));
  ok('  and its timeline draws the Logos line alone', /'Logos 5'/.test(timeline) && /'Logos 2'/.test(timeline) && !/\bCore\b/.test(timeline));
}

console.log('\n=== prev/next walks the whole wiki ===');
{
  ok('the first page has no previous', !neighbors(DOC_PAGES[0].slug).prev);
  ok('the last has no next', !neighbors(DOC_PAGES[DOC_PAGES.length - 1].slug).next);
  let at = DOC_PAGES[0].slug;
  let steps = 1;
  for (;;) {
    const n = neighbors(at).next;
    if (!n) break;
    at = n.slug;
    steps++;
    if (steps > DOC_PAGES.length) break;
  }
  ok('following next reaches every page exactly once', steps === DOC_PAGES.length, String(steps));
  // The sidebar lists DOC_GROUPS in order; next has to walk it the same way,
  // a group at a time — which puts the current product before the archive.
  const groupAt = DOC_PAGES.map((p) => DOC_GROUPS.indexOf(p.group));
  ok('and walks the sidebar a group at a time, the archive last',
    groupAt.every((g, i) => i === 0 || g >= groupAt[i - 1]) && DOC_GROUPS[DOC_GROUPS.length - 1] === 'Earlier Socria',
    DOC_PAGES.map((p) => p.group).join(' > '));
}

console.log('\n=== Logos 3.5 is documented, and documented honestly ===');
{
  const p = docPage('logos-3-5');
  ok('it is in the registry, right after Logos 3', !!p && DOC_PAGES[DOC_PAGES.findIndex((x) => x.slug === 'logos-3') + 1]?.slug === 'logos-3-5');
  ok('  and the picker calls the model what the page says it now is (Logos 5)', SOCRIA_MODELS['logos-3'].short === 'Logos 5' && SOCRIA_MODELS['logos-3'].label === 'Socria Logos 5');
  const src = read('app/docs/content/logos-3-5.tsx');
  ok('  shows the displays live, made by the product’s own code', /<DisplaysShowcase items=\{EXAMPLES\} \/>/.test(src));
  ok('  says numbers are never made up', /does not make up revenue/.test(src) && /Make up your numbers/.test(src));
  ok('  says nothing is decided for you', /Decide for you/.test(src));
  ok('  and says what is not there yet', /<H2 id="yet">Not there yet<\/H2>/.test(src) && /stacked bar/i.test(src));
  ok('  the Logos 3 page points to it', /href="\/docs\/logos-3-5"/.test(read('app/docs/content/logos-3.tsx')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
