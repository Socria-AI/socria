// Logos 6, Phase 3: document-grounded thinking (lib/logos6/evidence.ts, lib/logos6/disagree.ts).
//
// Held here: a card is linked to a passage only when the passage plainly holds its words, in the browser, with no
// model; a check against the sources says supported only with a matched passage, catches a different figure for the
// same thing in code, and holds a model's verdict to a quote that is really in the passage it names; documents that
// disagree are shown as pairs of quoted passages from two documents, the figures compared in code first, a model's
// pairs held to their quotes, and never a winner; the words that ask are recognised; what is kept reads back.

import {
  linkEvidence, passagesFor, bestSentence, asEvidence, checkInCode, checkAll, gateChecks, sanitizeSourceCheck, checkText, checkAsked,
  gateCompare, figurePairs, mergePairs, sanitizeCompare, compareText, compareAsked, DISAGREE_LABEL, BOTH_CAN_HOLD, docConflicts,
} from './.tmp/logos6-under-test.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

// two documents, as the browser holds them
const doc = (id, name, paras) => ({
  id, name, title: name, pages: [{ n: 1 }], tables: [],
  blocks: paras.map((t, i) => ({ id: `p1.${i + 1}`, kind: 'para', text: t, page: 1 })),
});
const A = doc('docA', 'District budgets report', [
  'In most states, districts set budgets once a year, in spring, and new spending is rarely approved mid-year.',
  'Average spend on classroom software was $1,200 per school in 2025, up from $900 in 2023.',
  'Teachers reported that tools are adopted when a department head champions them.',
]);
const B = doc('docB', 'Pilot survey', [
  'Average spend on classroom software was $2,400 per school in 2025 across the surveyed districts.',
  'The survey covered 40 private schools in two cities, all of which bought software monthly.',
]);
const refs = [{ letter: 'A', doc: A }, { letter: 'B', doc: B }];

console.log('=== linking a card to the passage it comes from ===');
{
  const l = linkEvidence('Districts set budgets once a year in spring', refs);
  ok('a card whose words a passage holds is linked to it', l && l.doc === 'docA' && l.block === 'p1.1' && l.key === 'A1.1', JSON.stringify(l));
  ok('…with the passage’s own words', l && /budgets once a year/.test(l.quote));
  ok('a card no passage holds is not linked', linkEvidence('Schools will pay from week two of the pilot', refs) === null);
  ok('a card too slight to mean anything is not linked', linkEvidence('Budgets', refs) === null);
  ok('the passages that bear on a question, across documents, best first', passagesFor('software spend per school', refs, 4).some((p) => p.doc === 'docA') && passagesFor('software spend per school', refs, 4).some((p) => p.doc === 'docB'));
  ok('the sentence that holds the words', /department head/.test(bestSentence('department head champions tools', A.blocks[2].text)));
  const ev = asEvidence(l, 'supported');
  ok('kept as a pointer and the words, never the passage', ev.doc === 'docA' && ev.block === 'p1.1' && ev.verdict === 'supported' && !('text' in ev));
}

console.log('\n=== checking claims against the sources ===');
{
  const pA = passagesFor('software spend 2025', refs, 6);
  const p = (k) => pA.find((x) => x.key === k) ?? passagesFor(k === 'B1.1' ? 'surveyed districts spend' : 'software', refs, 6).find((x) => x.key === k);
  ok('the passage says it: supported', checkInCode('Districts set budgets once a year, in spring.', { key: 'A1.1', doc: 'docA', block: 'p1.1', name: 'x', text: A.blocks[0].text }).verdict === 'supported');
  const contra = checkInCode('Average spend on classroom software was $1,800 per school in 2025.', { key: 'A1.2', doc: 'docA', block: 'p1.2', name: 'x', text: A.blocks[1].text });
  ok('the same thing, a different figure: contradicted', contra.verdict === 'contradicted', JSON.stringify(contra));
  ok('about something else entirely: not found', checkInCode('The pilot converts in six weeks.', { key: 'A1.3', doc: 'docA', block: 'p1.3', name: 'x', text: A.blocks[2].text }).verdict === 'not-found');
  const claims = [
    { id: 'c1', text: 'Districts set budgets once a year, in spring.' },
    { id: 'c2', text: 'The pilot converts in six weeks.' },
  ];
  const by = (id) => passagesFor(claims.find((c) => c.id === id).text, refs, 4);
  const words = checkAll(claims, by);
  ok('every claim gets a verdict', words.length === 2 && words[0].verdict === 'supported' && words[1].verdict === 'not-found', JSON.stringify(words.map((w) => w.verdict)));
  ok('a verdict other than "not found" names its passage', words[0].passage && words[0].passage.key === 'A1.1');
  ok('"not found" names none', !words[1].passage);
  const gated = gateChecks({ checks: [{ id: 'c2', verdict: 'supported', key: 'A1.3', quote: 'tools are adopted when a department head champions them' }] }, words, by);
  ok('a model’s verdict stands only with a quote that is really there', gated[1].verdict === 'not-found' || gated[1].passage?.quote === 'tools are adopted when a department head champions them');
  const invented = gateChecks({ checks: [{ id: 'c2', verdict: 'supported', key: 'A1.1', quote: 'pilots convert in six weeks' }] }, words, by);
  ok('an invented quote leaves the claim not found', invented[1].verdict === 'not-found');
  const flipped = gateChecks({ checks: [{ id: 'c1', verdict: 'partly', key: 'A1.1', quote: 'districts set budgets once a year, in spring' }] }, words, by);
  ok('a model never overturns what the words found', flipped[0].verdict === 'supported' && flipped[0].by === 'words');
  const sc = sanitizeSourceCheck({ id: 'sc_1', at: 5, docs: 2, results: [...words, { id: 'c3', claim: 'x claims', verdict: 'supported' }], taken: { c1: 'linked', c9: 'nope' } });
  ok('a check reads back; a verdict without its passage is not kept as one', sc && sc.results.length === 3 && sc.results[2].verdict === 'not-found' && sc.taken.c1 === 'linked' && !('c9' in sc.taken));
  ok('its words in the conversation', /^Checked against your sources:\n1\. supported: Districts set budgets/.test(checkText(sc)));
  for (const t of ['check this against my sources', 'Check my draft against the sources', 'is this supported by my sources?', 'What do my sources say about this?', 'fact-check my claims against my documents']) ok(`asks to check: ${t}`, checkAsked(t));
  for (const t of ['check my email', 'what are my sources?', 'Write a summary of the sources']) ok(`does not: ${t}`, !checkAsked(t));
}

console.log('\n=== where the documents disagree ===');
{
  const passages = [
    { key: 'A1.2', doc: 'docA', block: 'p1.2', name: 'District budgets report', text: A.blocks[1].text },
    { key: 'B1.1', doc: 'docB', block: 'p1.1', name: 'Pilot survey', text: B.blocks[0].text },
    { key: 'A1.1', doc: 'docA', block: 'p1.1', name: 'District budgets report', text: A.blocks[0].text },
    { key: 'B1.2', doc: 'docB', block: 'p1.2', name: 'Pilot survey', text: B.blocks[1].text },
  ];
  const figures = figurePairs(docConflicts(passages.map((p) => ({ id: p.key, kind: 'doc', text: p.text }))), passages);
  ok('the same figure, different values, in two documents: found in code', figures.length === 1 && figures[0].by === 'figures' && figures[0].kind === 'data', JSON.stringify(figures));
  ok('…both passages quoted, with their keys', figures[0] && /\$1,200/.test(figures[0].a.quote + figures[0].b.quote) && /\$2,400/.test(figures[0].a.quote + figures[0].b.quote));
  const model = gateCompare({ pairs: [
    { kind: 'populations', about: 'How often schools buy', because: 'One is about public districts, the other private schools.', a: { key: 'A1.1', quote: 'districts set budgets once a year' }, b: { key: 'B1.2', quote: 'all of which bought software monthly' } },
    { kind: 'direct', about: 'Invented', a: { key: 'A1.1', quote: 'schools never buy software' }, b: { key: 'B1.2', quote: 'all of which bought software monthly' } },
    { kind: 'direct', about: 'Same document', a: { key: 'A1.1', quote: 'districts set budgets once a year' }, b: { key: 'A1.2', quote: 'up from $900 in 2023' } },
  ] }, passages);
  ok('a pair stands when both quotes are really there, from two documents', model.length === 1 && model[0].kind === 'populations');
  ok('an invented quote does not stand, nor a pair from one document', !model.some((m) => m.about === 'Invented' || m.about === 'Same document'));
  ok('different populations: both can hold', BOTH_CAN_HOLD.has('populations') && !BOTH_CAN_HOLD.has('direct'));
  const merged = mergePairs(figures, model);
  ok('the figures first, then the model’s, one per pair of passages', merged.length === 2 && merged[0].by === 'figures' && merged.map((m) => m.id).join() === 'd1,d2');
  const dc = sanitizeCompare({ id: 'dc_1', at: 9, docs: [{ doc: 'docA', name: 'District budgets report' }, { doc: 'docB', name: 'Pilot survey' }], pairs: merged, taken: { d1: 'kept', d7: 'x' } });
  ok('a comparison reads back', dc && dc.pairs.length === 2 && dc.taken.d1 === 'kept' && !('d7' in dc.taken));
  ok('its words in the conversation, never a winner', /^Where your sources disagree:\n1\./.test(compareText(dc)) && !/is right|is wrong|more reliable/.test(compareText(dc)));
  ok('nothing found, said plainly', /do not cut against each other/.test(compareText({ ...dc, pairs: [] })));
  ok('every kind has words', Object.keys(DISAGREE_LABEL).length === 7);
  for (const t of ['Where do these disagree?', 'where do my sources disagree', 'Do these papers agree?', 'compare my sources', 'any contradictions between these documents?']) ok(`asks to compare: ${t}`, compareAsked(t));
  for (const t of ['where do you disagree with me?', 'compare apples and oranges', 'do you agree?']) ok(`does not: ${t}`, !compareAsked(t));
}

console.log('\n=== wiring ===');
{
  const route = read('app/api/logos/evidence/route.ts');
  ok('the route checks in code first, and holds a model to its quotes', /checkAll\(/.test(route) && /gateChecks\(/.test(route) && /gateCompare\(/.test(route) && /figurePairs\(/.test(route));
  ok('the route says resting as Sleep Mode, and is metered', /if \(sleep\.refuse\) return sleep\.refuse;/.test(route) && /withMeter/.test(route));
  ok('the route writes nothing to the map', !/editMap|applyMapEdits/.test(route));
  ok('a check and a comparison are saved with the conversation', /sanitizeSourceCheck\(m\.check\)/.test(read('app/api/conversations/route.ts')) && /sanitizeCompare\(m\.compare\)/.test(read('app/api/conversations/route.ts')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
