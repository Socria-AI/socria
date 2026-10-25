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
// Source-read rather than rendered: these are server components full of JSX,
// and what is being checked is the agreement between the lists, which is a
// property of the text.

import { readFileSync, existsSync } from 'node:fs';
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

console.log('\n=== Core 4 is documented, and documented honestly ===');
{
  const p = docPage('core-4');
  // Archived with the Core chat, and kept as a record of how it worked: so it
  // is in the archive, and every claim below is still checked, because the
  // page still makes them.
  ok('it is in the registry, kept in the archive', !!p && p.group === 'Earlier Socria' && !!p.archived, p?.group);
  const src = read('app/docs/content/core-4.tsx');

  // The four claims a reader most needs, each of which is a real property of
  // lib/core4 rather than a way of describing it.
  ok('  says withholding needs a reason the person gave', /own words|your own quote|explicit/i.test(src));
  ok('  says an inference never withholds', /inference never withholds/i.test(src));
  ok('  says attribution is enforced in code', /enforced in code/i.test(src));
  ok('  says the safety gate suspends contracts', /suspends every contract/i.test(src));
  ok('  and that the ladder bottoms out', /bottoms out/i.test(src));

  // The honest half. A docs page that only lists strengths is marketing, and
  // the evals document exists precisely because this one is not.
  ok('  states what was measured, including the loss', /level — not demonstrably|not demonstrably\s*\n?\s*better/i.test(src));
  ok('  and the cold start', /starts flat|first message there is no record/i.test(src));
  ok('  and that no human has rated it', /no human rater|No human rater/i.test(src));

  // The prompt test. The page may describe it, and may not put a number on
  // it — the run kept no counts, and a rate quoted from a qualitative result
  // is a fabrication with a citation attached.
  ok('  describes the three arms of the prompt test',
    /frozen/i.test(src) && /independent imitation/i.test(src) && /clean context/i.test(src));
  ok('  says the frozen prompt could not be improved afterwards',
    /not.{0,40}allowed to be improved|not<\/em> allowed to be improved/i.test(src));
  ok('  reports the unflattering half: the imitation was good',
    /imitated Core 4/i.test(src) && /surprisingly/i.test(src));
  ok('  and states the claim it actually supports',
    /Prompts break/.test(src) && /a prompt can/i.test(src));
  ok('  names the escalation without repeating the abuse',
    /aggressively and abusively/.test(src) && !/\bf+u+c+k/i.test(src));
  ok('  names the mirror failure as the next benchmark',
    /answer, explain, calculate, research, retrieve, verify or\s*\n?\s*<em>|answer, explain, calculate/i.test(src));
  ok('  and leaves the partner question open', /open question/i.test(src));
  ok('  quotes no rate from a run that kept no counts',
    !/\d+%[^<]{0,40}(pressure|imitation|prompt arm)/i.test(src));

  const experiments = read('docs/CORE-4-EXPERIMENTS.md');
  ok('  the internal record carries it as an experiment', /\| E19 \|/.test(experiments));
  ok('  with the under-help benchmark after it', /\| E20 \|/.test(experiments));
  ok('  and UUCR after that', /\| E21 \|/.test(experiments));
  ok('  and says plainly that no rate may be quoted from it',
    /no rate may be quoted/i.test(experiments) && /no rate may be quoted/i.test(read('docs/CORE-4-EVALS.md')));

  // Numbers on a docs page must match the source of truth for them.
  const evals = read('docs/CORE-4-EVALS.md');
  ok('  the question rate it quotes is the measured one',
    /0–2% of replies against 5–11%/.test(src) && /1–2% of replies vs 5–11%/.test(evals));
  ok('  the overreach run it quotes is the measured one',
    /eighty-two turns/.test(src) && /0\/82/.test(evals));
}

console.log('\n=== the models page names every model, and counts the ones a reader can pick ===');
{
  const models = read('app/docs/content/models.tsx');
  // Every model in the registry, by the name the product gives it: the one on
  // offer, and each one before it. A name counts only as itself — "Logos" in
  // "Logos 5" is not the original Logos.
  const names = (src, name) => new RegExp(`\\b${name.replace(/\./g, '\\.')}\\b(?!\\s?\\d|\\.\\d)`).test(src);
  for (const id of Object.keys(SOCRIA_MODELS))
    ok(`${SOCRIA_MODELS[id].short} is on the models page`, names(models, SOCRIA_MODELS[id].short));
  // The count a page states is the count on offer — read from the registry,
  // so the next retirement or launch fails here until the prose catches up,
  // in either direction. There is no menu now, and one model: "one model".
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  // The docs are production's: a dev-only model is not one a reader can pick.
  // Retired models kept by name under "Other models" are not counted (none
  // are kept there since the archive).
  const n = WORDS[offeredModels().filter((id) => !SOCRIA_MODELS[id].devOnly && !SOCRIA_MODELS[id].withdrawn).length];
  const said = (src) => [...src.matchAll(/\b(one|two|three|four|five|six|seven) models?\b/gi)].map((m) => m[1].toLowerCase());
  ok(`the page says there ${n === 'one' ? 'is one' : `are ${n}`}, as many as are offered`, said(models).length > 0 && said(models).every((w) => w === n), said(models).join(','));
  const overview = read('app/docs/content/overview.tsx');
  ok('the overview counts them the same way', said(overview).length > 0 && said(overview).every((w) => w === n), said(overview).join(','));
  ok('  and links to Core 4', overview.includes('/docs/core-4'));
  ok('  and to Logos 5, and to the history', overview.includes('/docs/logos-5') && overview.includes('/docs/history'));
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
  // the registry dates it where the registry gives a date, and the model on
  // offer is documented as current. A model's page is the one titled with
  // its label.
  const DATE = /\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)\b/;
  for (const id of Object.keys(SOCRIA_MODELS)) {
    const m = SOCRIA_MODELS[id];
    const page = DOC_PAGES.find((p) => p.title === m.label);
    if (m.withdrawn) {
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
