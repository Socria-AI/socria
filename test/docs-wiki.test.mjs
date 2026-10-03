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
// Source-read rather than rendered: these are server components full of JSX,
// and what is being checked is the agreement between the lists, which is a
// property of the text.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOC_PAGES, DOC_GROUPS, docPage, neighbors } from './.tmp/registry.mjs';
import { offeredModels } from './.tmp/socria-model-store.mjs';

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
  ok('it is in the registry', !!p && p.group === 'The models');
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

console.log('\n=== the models page names every model a reader can pick ===');
{
  const models = read('app/docs/content/models.tsx');
  for (const name of ['Core 2', 'Core 3.1', 'Core 4', 'Logos'])
    ok(`${name} is on the comparison page`, models.includes(name));
  // The count a page states is the count the menu offers — read from the
  // registry, so the next retirement or launch fails here until the prose
  // catches up, in either direction.
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  const n = WORDS[offeredModels().length];
  const said = (src) => [...src.matchAll(/\b(two|three|four|five|six|seven) models\b/gi)].map((m) => m[1].toLowerCase());
  ok(`the page says there are ${n}, as the menu offers`, said(models).length > 0 && said(models).every((w) => w === n), said(models).join(','));
  const overview = read('app/docs/content/overview.tsx');
  ok('the overview counts them the same way', said(overview).length > 0 && said(overview).every((w) => w === n), said(overview).join(','));
  ok('  and links to Core 4', overview.includes('/docs/core-4'));
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
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
