// DOCUMENT INTELLIGENCE — questions about a document answered the way they
// were asked, and a document read for the person, every point standing on its
// passages.
//
//   · what a question asks for (lib/docs/intent.ts): a lookup, an overview, a
//     comparison, a critique, the numbers… — and what that changes: what the
//     model is shown (lib/docs/render.ts), how the answer is shaped, the room
//     and the model it gets (the chat route, lib/model-router.ts);
//   · a follow-up carries the passages the last reply cited, so "why?" is
//     about what was just discussed;
//   · Socria's reading of a document (lib/docs/brief.ts): the whole document
//     sampled, every point citing passages that exist, every quotation the
//     passage's own words, any number not in its passage dropped, assumptions
//     marked as readings, the structure and the reading's quality computed;
//   · the route that makes it (app/api/docs/brief): who may ask, what a
//     model's failure looks like, and what is never shown.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as T from './.tmp/docint-under-test.mjs';
import { systemOf, turnsOf } from './helpers/prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 400))));

// ── fixtures: a long paper, a short memo ─────────────────────────────
const filler = (sec, i) => `In the ${sec.toLowerCase()} section, paragraph ${i} discusses ${['cohort follow-up', 'measurement drift', 'protocol adherence', 'baseline variation', 'site staffing', 'data cleaning', 'response coding', 'missing records'][i % 8]} at some length without saying anything decisive about it, so that a reader has to look elsewhere for the point.`;
const section = (name, special = [], n = 14) => [`## ${name}`, ...special, ...Array.from({ length: n }, (_, i) => filler(name, i + 1))].join('\n\n');
const PAPER = [
  '# Ward staffing and patient falls',
  section('Abstract', ['Higher nurse staffing was associated with 18% fewer patient falls across the study wards.'], 2),
  section('Introduction'),
  section('Methods', ['We recruited 240 participants across two sites between 2023 and 2024.']),
  section('Results', ['Falls dropped from 4.1 to 3.4 per 1,000 bed-days after staffing rose.', '| Ward | Falls before | Falls after |\n| --- | --- | --- |\n| A | 4.3 | 3.5 |\n| B | 3.9 | 3.3 |', 'The submission deadline for the follow-up report is 14 March 2027.']),
  section('Limitations', ['The sample was drawn from a single hospital trust, which limits how far the result generalises.']),
  section('Discussion', ['Staffing may matter most on night shifts, where supervision is thinnest.']),
  section('Conclusion', ['Raising staffing levels is a plausible way to reduce falls, though a randomised trial is needed.']),
].join('\n\n');
const { doc: paper } = await T.readDocument('falls.md', Buffer.from(PAPER));
const { doc: memo } = await T.readDocument('memo.md', Buffer.from('# Memo\n\nThe launch moved to March.\n\nThe budget is $40,000.'));
const find = (d, re) => d.blocks.find((b) => re.test(b.text));
const deadline = find(paper, /submission deadline/);
const sample = find(paper, /single hospital trust/);
const recruited = find(paper, /recruited 240/);
const falls = find(paper, /Falls dropped/);
const night = find(paper, /night shifts/);
const discussionFirst = night;
const table = paper.blocks.find((b) => b.kind === 'table');
const shown = (text) => new Set([...text.matchAll(/\[A(\d+\.\d+)\]/g)].map((m) => `p${m[1]}`));

console.log('\n=== the fixtures ===');
ok('the paper reads long, in sections, with a table', paper.blocks.length > 100 && !!deadline && !!sample && !!recruited && !!table, paper.blocks.length);

console.log('\n=== what a question about a document asks for ===');
{
  const cases = [
    ['Where does it give the submission deadline?', 1, 'locate'],
    ['Which page mentions the warranty?', 1, 'locate'],
    ['Does the report mention night shifts?', 1, 'locate'],
    ['Summarise this report', 1, 'summary'],
    ['What are the key findings?', 1, 'summary'],
    ['How strong is the evidence for the main claim?', 1, 'critique'],
    ['What does it assume?', 1, 'critique'],
    ['What are the limitations?', 1, 'critique'],
    ['Compare the two reports', 2, 'compare'],
    ['Compare section 2 with section 4', 1, 'compare'],
    ['Do these documents contradict each other?', 2, 'compare'],
    ['Does it contradict itself anywhere?', 1, 'critique'],
    ['What does table 2 show?', 1, 'data'],
    ['What was the average fall rate?', 1, 'data'],
    ['What does "bed-days" mean here?', 1, 'explain'],
    ['How would I apply this on my ward?', 1, 'apply'],
    ['ok thanks', 1, 'general'],
  ];
  for (const [text, n, want] of cases) {
    const got = T.docAskOf(text, n).kind;
    ok(`“${text}” (${n} doc${n === 1 ? '' : 's'}) → ${want}`, got === want, got);
  }
  ok('without documents, nothing is read into it', T.docAskOf('Summarise this', 0).kind === 'general');
  ok('"compare" with one document and no parts named is not a comparison of documents', T.docAskOf('compare these', 1).kind !== 'compare');
  ok('a lookup can do without the deep model; a critique cannot', T.docAskOf('Where is the deadline?', 1).light === true && T.docAskOf('How strong is the evidence?', 1).light === false);
  ok('a lookup is given less room than a critique or a comparison', T.docAskOf('Where is the deadline?', 1).room < T.docAskOf('What does it assume?', 1).room && T.docAskOf('Where is the deadline?', 1).room < T.docAskOf('Compare them', 2).room);
  ok('each kind but the ordinary one says how to answer', T.DOC_ASKS.filter((k) => k !== 'general').every((k) => T.docAskLine(T.shapeOf(k)).includes(`(${k})`)) && T.docAskLine(T.shapeOf('general')) === '');
  ok('the critique line keeps claim, evidence, assumption and stated limit apart', /claims.*evidence.*assumes.*limits/s.test(T.shapeOf('critique').say));
  ok('the overview line compresses information, not meaning', /Compress the information, not the meaning/.test(T.shapeOf('summary').say));
  ok('a short follow-up leans on the last reply; a full question does not', T.leansOnLast('why?') && T.leansOnLast('and the second one?') && T.leansOnLast('what does that mean') && !T.leansOnLast('Summarise the methodology section of the attached report for my supervisor meeting tomorrow morning please'));
  ok('the rules for documents ask for the answer first and the meaning kept', /Answer the question asked, first and briefly/.test(T.DOC_RULES) && /Shorten wording, never meaning/.test(T.DOC_RULES) && /follow-up/.test(T.DOC_RULES));
}

console.log('\n=== what the model is shown, by what was asked ===');
{
  const ref = { letter: 'A', doc: paper };
  const memoRef = { letter: 'B', doc: memo };
  for (const k of ['locate', 'summary', 'critique', 'data']) {
    const t = T.renderDoc(memoRef, { query: 'when', budget: 36000, shape: T.shapeOf(k) });
    if (!(t.includes('The launch moved to March') && t.includes('budget is $40,000'))) ok(`a short document is shown whole for a ${k}`, false, t);
  }
  ok('a document that fits is shown whole, whatever is asked', true);

  const BUDGET = 9000;
  const q = 'When is the submission deadline?';
  const loc = T.renderDoc(ref, { query: q, budget: BUDGET, shape: T.docAskOf(q, 1) });
  const gen = T.renderDoc(ref, { query: q, budget: BUDGET, shape: T.shapeOf('general') });
  ok('a lookup is shown the passage it asks for', shown(loc).has(deadline.id), [...shown(loc)].slice(0, 20));
  ok('  and fewer passages than an ordinary question in the same room', shown(loc).size < shown(gen).size, `${shown(loc).size} vs ${shown(gen).size}`);
  ok('  and told it is seeing the outline and the passages that match', /its outline and the passages that match the latest message/.test(loc));

  const crit = T.renderDoc(ref, { query: 'How strong is this?', budget: BUDGET, shape: T.docAskOf('How strong is this?', 1) });
  const critGen = T.renderDoc(ref, { query: 'How strong is this?', budget: BUDGET, shape: T.shapeOf('general') });
  ok('a critique is shown the limitations the document states, though the question names none', shown(crit).has(sample.id) && !shown(critGen).has(sample.id), { crit: shown(crit).has(sample.id), gen: shown(critGen).has(sample.id) });
  ok('  and the methods', shown(crit).has(recruited.id));

  const sum = T.renderDoc(ref, { query: 'Summarise it', budget: BUDGET, shape: T.docAskOf('Summarise it', 1) });
  ok('an overview is shown the first passage of every section', [recruited, falls, sample, discussionFirst].every((b) => shown(sum).has(b.id)), [recruited, falls, sample, discussionFirst].map((b) => `${b.id}:${shown(sum).has(b.id)}`).join(' '));

  const data = T.renderDoc(ref, { query: 'What do the numbers show?', budget: BUDGET, shape: T.docAskOf('What do the numbers show?', 1) });
  ok('a question about the numbers is shown the table', shown(data).has(table.id));

  const follow = T.renderDoc(ref, { query: 'why?', budget: BUDGET, shape: T.docAskOf('why?', 1), recent: [night.id] });
  ok('a follow-up is shown the passages the last reply cited', shown(follow).has(night.id) && /and the passages the last reply cited/.test(follow));
  const noFollow = T.renderDoc(ref, { query: 'why?', budget: BUDGET, shape: T.docAskOf('why?', 1) });
  ok('  which it would not otherwise have been', !shown(noFollow).has(night.id));
  const forged = T.renderDoc(ref, { query: 'why?', budget: BUDGET, recent: ['p999.1', '../x'] });
  ok('  a cited passage the document does not have is ignored', !/p999|\.\.\/x/.test(forged));

  // two documents: a comparison shares the room evenly
  const { doc: other } = await T.readDocument('other.md', Buffer.from(PAPER.replace(/staffing/g, 'rostering').replace(/falls/gi, 'errors').replace('# Ward rostering and patient errors', '# Pharmacy rostering')));
  const refs = [ref, { letter: 'B', doc: other }];
  const cmp = T.renderDocs(refs, { query: 'compare the staffing and falls results', budget: 12000, shape: T.docAskOf('compare the staffing and falls results', 2) });
  const plain = T.renderDocs(refs, { query: 'compare the staffing and falls results', budget: 12000, shape: T.shapeOf('general') });
  const count = (t, L) => (t.match(new RegExp(`\\[${L}\\d+\\.\\d+\\]`, 'g')) ?? []).length;
  ok('a comparison shows both documents in like measure, whatever the question matches', count(cmp, 'B') >= count(cmp, 'A') * 0.6, `${count(cmp, 'A')} / ${count(cmp, 'B')}`);
  ok('  where an ordinary question leans to the document it matches', count(plain, 'B') < count(plain, 'A'), `${count(plain, 'A')} / ${count(plain, 'B')}`);
}

console.log('\n=== Socria’s reading: the material, sampled across the whole document ===');
{
  const long = [PAPER, ...Array.from({ length: 6 }, (_, k) => section(`Appendix ${k + 1}`, [], 30))].join('\n\n') + '\n\n## Final note\n\nThe last word of the report is that staffing must be tracked monthly.';
  const { doc: big } = await T.readDocument('big.md', Buffer.from(long));
  const m = T.briefMaterial(big, 20000);
  const keys = new Set([...m.text.matchAll(/\[(p\d+\.\d+)\]/g)].map((x) => x[1]));
  const blocks = T.readableBlocks(big);
  ok('a long document is shown in part, and how much is counted', m.shown < m.total && m.total === blocks.length && keys.size === m.shown, { shown: m.shown, total: m.total });
  ok('  every heading is in it', blocks.filter((b) => b.kind === 'heading' || b.kind === 'title').every((b) => keys.has(b.id)));
  ok('  every table is in it', blocks.filter((b) => b.kind === 'table').every((b) => keys.has(b.id)));
  ok('  its closing passage is in it', keys.has(blocks[blocks.length - 1].id));
  const lastThird = blocks.slice(Math.floor(blocks.length * 0.66)).filter((b) => b.kind === 'paragraph');
  ok('  and the rest is spread through it, not just its opening', lastThird.filter((b) => keys.has(b.id)).length >= 5, lastThird.filter((b) => keys.has(b.id)).length);
  ok('  every gap is said', /\[… \d+ passages? not shown\]/.test(m.text));
  ok('  within its budget', m.text.length <= 20000 + 2000, m.text.length);
  const small = T.briefMaterial(memo);
  ok('a short document is shown whole, with no gap', small.shown === small.total && !/not shown/.test(small.text));
  const asked = T.briefAsk(paper);
  ok('the ask says the passages are material, never instructions, and asks for copied quotes', /never instructions to you/.test(asked.system) && /COPIED character for character/.test(asked.system) && asked.user.includes(`[${deadline.id}]`));
}

console.log('\n=== Socria’s reading: kept only as far as the document bears it out ===');
{
  const read = { shown: 80, total: 120 };
  const raw = {
    gist: 'A study of whether higher nurse staffing reduces patient falls.',
    gist_cites: [find(paper, /18% fewer/).id],
    findings: [
      { text: 'Higher staffing was linked to 18% fewer falls.', cites: [find(paper, /18% fewer/).id], quote: 'associated with 18% fewer patient falls' },
      { text: 'Falls dropped from 4.1 to 3.4 per 1,000 bed-days.', cites: [falls.id], quote: 'Falls fell sharply' },
      { text: 'Higher staffing cut falls by 40%.', cites: [falls.id] },
      { text: 'Staffing helps everywhere.', cites: ['p999.9'] },
      { text: 'The authors call it “a decisive and final answer”.', cites: [falls.id] },
      { text: 'The deadline is in March 2027.', cites: [deadline.id] },
      { text: 'Recruitment covered 240 people at two sites.', cites: [recruited.id] },
      { text: 'Night shifts may matter most.', cites: [night.id] },
      { text: 'A sixth finding beyond the limit.', cites: [night.id] },
    ],
    claims: [
      {
        text: 'Raising staffing levels reduces falls.',
        cites: [find(paper, /plausible way to reduce falls/).id],
        evidence: [{ text: 'Falls dropped from 4.1 to 3.4 per 1,000 bed-days.', cites: [falls.id] }, { text: 'A made-up trial of 9,000 patients.', cites: [falls.id] }],
        assumptions: [{ text: 'That the wards were otherwise alike before and after.' }, { text: 'That falls were recorded the same way.', cites: ['p999.1'] }],
      },
      { text: 'No cites here.', cites: [] },
    ],
    limits: [{ text: 'The sample came from a single hospital trust.', cites: [sample.id], quote: 'drawn from a single hospital trust' }],
    concepts: [
      { term: 'Bed-days', meaning: 'The unit the fall rate is counted in.', cites: [falls.id] },
      { term: 'Quantum staffing', meaning: 'A term the document never uses.', cites: [falls.id] },
      { term: 'Staffing', meaning: 'How many nurses work a ward.', cites: [find(paper, /18% fewer/).id] },
    ],
    links: [
      { from: 'Staffing', to: 'Bed-days', how: 'is counted per', cites: [falls.id] },
      { from: 'Staffing', to: 'Quantum staffing', how: 'causes' },
      { from: 'Nowhere', to: 'Staffing', how: 'reduces' },
    ],
    data: [{ block: table.id, says: 'Ward A fell from 4.3 to 3.5.' }, { block: table.id, says: 'second says ignored' }, { block: falls.id, says: 'not a table' }],
    questions: ['How was staffing measured', 'Would this hold for a small rural hospital?', 'x', 'What changed on night shifts?', 'Which wards improved most?', 'A fifth question beyond the limit?'],
  };
  const b = T.sanitizeBrief(raw, paper, read);
  const texts = b.findings.map((f) => f.text);
  ok('a finding whose passage holds it is kept', texts.includes('Higher staffing was linked to 18% fewer falls.'));
  ok('  its quote cut from the passage itself', b.findings[0].quote && find(paper, /18% fewer/).text.includes(b.findings[0].quote), b.findings[0].quote);
  const f2 = b.findings.find((f) => f.text.startsWith('Falls dropped'));
  ok('  a quote the passage does not hold is replaced by the passage’s own words', f2 && f2.quote && falls.text.includes(f2.quote.replace(/…$/, '')) && f2.quote !== 'Falls fell sharply', f2?.quote);
  ok('a finding with a number its passage does not hold is dropped', !texts.some((t) => /40%/.test(t)));
  ok('a finding citing a passage that does not exist is dropped', !texts.some((t) => /everywhere/.test(t)));
  ok('a finding that “quotes” words the passage does not hold is dropped', !texts.some((t) => /decisive and final/.test(t)));
  ok('at most five findings', b.findings.length <= 5 && b.findings.length >= 4, b.findings.length);
  ok('each point says how it stands to its passages', b.findings.every((f) => ['verbatim', 'derived', 'interpretation'].includes(f.ground)));
  ok('the dropped are counted, never shown', b.dropped >= 4, b.dropped);
  ok('a claim keeps the evidence its passages hold, and drops the invented', b.claims.length === 1 && b.claims[0].evidence.length === 1 && !b.claims[0].evidence.some((e) => /9,000/.test(e.text)));
  ok('  its assumptions are kept as readings, needing no passage, never citing one that is not there', b.claims[0].assumptions.length === 2 && b.claims[0].assumptions.every((a) => a.ground === 'interpretation') && b.claims[0].assumptions[1].cites.length === 0);
  ok('  a claim with nothing cited is dropped', !b.claims.some((c) => /No cites/.test(c.text)));
  ok('a stated limit is kept, with its words', b.limits.length === 1 && sample.text.includes(b.limits[0].quote ?? '§'));
  ok('a term the passages never name is dropped', b.concepts.some((c) => c.term === 'Bed-days') && b.concepts.some((c) => c.term === 'Staffing') && !b.concepts.some((c) => /Quantum/.test(c.term)));
  ok('a link joins only terms that were kept', b.links.length === 1 && b.links[0].from === 'Staffing' && b.links[0].to === 'Bed-days', b.links);
  const td = b.data.find((d) => d.block === table.id);
  ok('what a table shows is said in its own numbers, once', td && td.says === 'Ward A fell from 4.3 to 3.5.' && td.kind === 'table');
  ok('a "table" that is not one is not given a description', !b.data.some((d) => d.block === falls.id));
  ok('questions: at most four, each a question, the empty and the trivial left out', b.questions.length === 4 && b.questions.every((q) => q.endsWith('?')) && !b.questions.includes('x?'), b.questions);
  ok('the structure is the document’s own headings', b.structure.length === 8 && b.structure[0].text === 'Ward staffing and patient falls' && b.structure.some((h) => h.text === 'Limitations'));
  ok('how much was read is carried', b.read.shown === 80 && b.read.total === 120);
  ok('the gist stands on its passage', b.gist.startsWith('A study of') && b.gistCites.length === 1);
  const badNum = T.sanitizeBrief({ ...raw, gist: 'Falls fell by 77% across 40 wards.', gist_cites: [falls.id] }, paper, read);
  ok('a gist its passage does not bear out gives way to the document’s own opening', !/77%/.test(badNum.gist) && badNum.gist.length > 0 && badNum.gistCites.length === 1);
  const garbage = T.sanitizeBrief('not an object', paper, read);
  ok('nothing usable: no points, the computed parts still there', T.briefPoints(garbage) === 0 && garbage.structure.length === 8 && garbage.quality.level === 'good');
  const many = T.sanitizeBrief({ findings: Array.from({ length: 20 }, () => ({ text: 'Higher staffing was linked to 18% fewer falls.', cites: [find(paper, /18% fewer/).id] })) }, paper, read);
  ok('the same point twice is one point', many.findings.length === 1);
}

console.log('\n=== how well the file was read, said plainly ===');
{
  const good = T.qualityOf(paper);
  ok('a file read from its own text says so', good.level === 'good' && /Read from the file’s own text/.test(good.says), good);
  const scan = T.sanitizeSourceDoc({ ...paper, pages: paper.pages.map((p, i) => (i < 1 ? { ...p, ocr: 'needed', method: 'none' } : p)), pageCount: 2 });
  const q = T.qualityOf({ ...scan, pageCount: 2, pages: [{ ...paper.pages[0], n: 1, ocr: 'needed', method: 'none' }, { ...paper.pages[0], n: 2, ocr: 'done', method: 'vision' }] });
  ok('a scan: pages not yet read and pages read from pictures are counted and said', q.unread === 1 && q.vision === 1 && /not read/.test(q.says) && /from its picture/.test(q.says) && q.level === 'poor', q);
  const doubt = T.qualityOf({ ...paper, blocks: paper.blocks.map((b, i) => (i < 3 ? { ...b, flags: ['uncertain'] } : b)) });
  ok('passages marked uncertain are counted', doubt.doubtful === 3 && doubt.level === 'mixed' && /3 passages marked uncertain/.test(doubt.says));
  const plain = T.plainBrief(paper);
  ok('without a model: the structure, the quality, the tables — and said to be plain', plain.plain === true && plain.findings.length === 0 && plain.structure.length === 8 && plain.data.some((d) => d.kind === 'table') && plain.questions.length >= 2);
  ok('  its gist, when any, is the document’s own words', paper.blocks.some((b) => b.text.includes(plain.gist.replace(/…$/, ''))));
  ok('a document of headings alone has nothing to analyse', !T.analysable(T.sanitizeSourceDoc({ ...memo, blocks: memo.blocks.filter((b) => b.kind === 'heading') })) && T.analysable(paper));
}

console.log('\n=== a reading kept on the device, read back ===');
{
  const b = T.sanitizeBrief(
    {
      gist: 'A study of staffing and falls.',
      gist_cites: [find(paper, /18% fewer/).id],
      findings: [{ text: 'Higher staffing was linked to 18% fewer falls.', cites: [find(paper, /18% fewer/).id] }, { text: 'Night shifts may matter most.', cites: [night.id] }],
      concepts: [{ term: 'Staffing', meaning: 'How many nurses work a ward.', cites: [find(paper, /18% fewer/).id] }],
    },
    paper,
    { shown: 10, total: 10 }
  );
  const back = T.restoreBrief(JSON.parse(JSON.stringify({ ...b, at: 5 })), paper);
  ok('read back as it was kept', back && back.findings.length === 2 && back.concepts.length === 1 && back.at === 5 && back.gist === b.gist);
  const corrected = { ...paper, blocks: paper.blocks.filter((x) => x.id !== night.id) };
  const after = T.restoreBrief(JSON.parse(JSON.stringify(b)), corrected);
  ok('a point whose passage is gone is gone with it', after && after.findings.length === 1);
  ok('another document’s reading is not this one’s', T.restoreBrief(JSON.parse(JSON.stringify(b)), memo) === null);
  const tampered = JSON.parse(JSON.stringify(b));
  tampered.findings[0].quote = 'words the passage never held';
  tampered.findings[0].ground = 'gospel';
  const t2 = T.restoreBrief(tampered, paper);
  ok('a quote the passage does not hold is not restored; an unknown standing is a reading', t2 && !t2.findings[0].quote && t2.findings[0].ground === 'interpretation');
  ok('nonsense is nothing', T.restoreBrief('x', paper) === null && T.restoreBrief({ v: 2, doc: paper.id }, paper) === null);
}

console.log('\n=== a passage in the original: marking it, picking it, finding it ===');
{
  const boxed = T.sanitizeSourceDoc({
    ...memo,
    pageCount: 2,
    pages: [{ n: 1, w: 612, h: 792, method: 'text', chars: 100, images: 0, ocr: 'none' }, { n: 2, w: 612, h: 792, method: 'text', chars: 100, images: 0, ocr: 'none' }],
    blocks: [
      { id: 'p1.1', page: 1, kind: 'header', text: 'Running head', method: 'text', box: [0, 0, 1, 0.05] },
      { id: 'p1.2', page: 1, kind: 'heading', text: 'Results', method: 'text', box: [0.1, 0.1, 0.5, 0.14] },
      { id: 'p1.3', page: 1, kind: 'paragraph', text: 'Falls dropped from 4.1 to 3.4 per 1,000 bed-days.', method: 'text', box: [0.1, 0.16, 0.9, 0.3] },
      { id: 'p1.4', page: 1, kind: 'paragraph', text: 'Inside the paragraph, a footnote marker.', method: 'text', box: [0.4, 0.2, 0.6, 0.22] },
      { id: 'p2.1', page: 2, kind: 'paragraph', text: 'No box was read for this one.', method: 'text' },
    ],
  });
  ok('a passage with a box marks its page and box', JSON.stringify(T.markOf(boxed, 'p1.3', 4)) === JSON.stringify({ doc: boxed.id, block: 'p1.3', page: 1, box: [0.1, 0.16, 0.9, 0.3], text: 'Falls dropped from 4.1 to 3.4 per 1,000 bed-days.', kind: 'paragraph', seq: 4 }));
  ok('  one without marks its page alone', T.markOf(boxed, 'p2.1').page === 2 && !('box' in T.markOf(boxed, 'p2.1')));
  ok('  a passage the document does not have marks nothing', T.markOf(boxed, 'p9.9') === null);
  ok('a press on a paragraph picks it', T.blockAt(boxed, 1, 0.2, 0.25)?.id === 'p1.3');
  ok('  the smallest box holding the press wins', T.blockAt(boxed, 1, 0.5, 0.21)?.id === 'p1.4');
  ok('  a running head is never picked; empty space picks nothing; another page is another page', T.blockAt(boxed, 1, 0.5, 0.02) === null && T.blockAt(boxed, 1, 0.95, 0.9) === null && T.blockAt(boxed, 2, 0.5, 0.5) === null);
  ok('  a page whose passages have boxes can be picked from; one without cannot', T.pickable(boxed, 1) && !T.pickable(boxed, 2));
  ok('the mark is drawn in the page’s pixels, with room, kept on the page', JSON.stringify(T.markRect([0.1, 0.16, 0.9, 0.3], 600, 800, 4)) === JSON.stringify({ left: 56, top: 124, width: 488, height: 120 }) && T.markRect([0, 0, 1, 1], 100, 100).left === 0 && T.markRect([0, 0, 1, 1], 100, 100).width === 100);
  ok('a box that is not one is not drawn', !T.validBox([0.5, 0.5, 0.4, 0.6]) && !T.validBox([0, 0, 2, 1]) && !T.validBox('x') && T.validBox([0, 0, 1, 1]));
  ok('found by its words through the original’s quotes, dashes, soft hyphens and breaks', T.fold('The “staff­ing” ratio —\n  rose') === 'the "staffing" ratio - rose');
  ok('  by its opening, cut at a word', T.needleOf('Falls dropped from 4.1 to 3.4 per 1,000 bed-days after staffing rose on every ward in the trust.') === 'falls dropped from 4.1 to 3.4 per 1,000 bed-days after staffing');
  ok('  a passage of a word or two is not looked for', T.needleOf('Q3') === '' && T.needleOf('Ward A') === '');
  const texts = ['Contents', 'Falls dropped from 4.1 to 3.4 per 1,000\nbed-days after staffing rose.', 'Falls dropped again.'];
  ok('  the first element that holds it', T.firstHolding(texts, T.needleOf('Falls dropped from 4.1 to 3.4 per 1,000 bed-days after staffing rose.')) === 1);
  ok('  a passage split across two elements is found by its first words', T.firstHolding(['Falls dropped from 4.1 to', '3.4 per 1,000 bed-days.'], T.needleOf('Falls dropped from 4.1 to 3.4 per 1,000 bed-days.')) === 0);
  ok('  and nothing when nothing holds it', T.firstHolding(texts, T.needleOf('An entirely different sentence that is not there.')) === -1);
  ok('a deck’s pages are slides; a workbook’s, sheets', T.unitOf('pptx') === 'Slide' && T.unitOf('xlsx') === 'Sheet' && T.unitOf('pdf') === 'Page');
}

console.log('\n=== the reading, drawn: terms and argument as diagrams in Artifacts ===');
{
  const b = T.sanitizeBrief(
    {
      gist: 'A study of whether higher nurse staffing reduces patient falls.',
      gist_cites: [find(paper, /18% fewer/).id],
      claims: [{ text: 'Raising staffing levels reduces falls.', cites: [find(paper, /plausible way to reduce falls/).id], evidence: [{ text: 'Falls dropped from 4.1 to 3.4 per 1,000 bed-days.', cites: [falls.id] }], assumptions: [{ text: 'That the wards were otherwise alike.' }] }],
      limits: [{ text: 'The sample came from a single hospital trust.', cites: [sample.id] }],
      concepts: [
        { term: 'Staffing', meaning: 'How many nurses work a ward.', cites: [find(paper, /18% fewer/).id] },
        { term: 'Bed-days', meaning: 'The unit the fall rate is counted in.', cites: [falls.id] },
        { term: 'Falls', meaning: 'Patients falling on the ward.', cites: [falls.id] },
      ],
      links: [{ from: 'Staffing', to: 'Falls', how: 'reduces', cites: [falls.id] }, { from: 'Falls', to: 'Bed-days', how: 'counted per' }],
    },
    paper,
    { shown: 10, total: 10 }
  );
  const terms = T.termsDiagram(b);
  ok('the terms as a concept map: every term, its meaning and page in its note, the links labelled', terms && terms.view === 'concept' && terms.nodes.length === 3 && terms.edges.length === 2 && terms.edges[0].label === 'reduces' && /p\. 1/.test(terms.nodes[0].note), terms);
  const arg = T.argumentDiagram(b);
  ok('the argument as a tree: the claim under the gist, its evidence and assumption under it, the stated limit from the root', arg && arg.view === 'hierarchy' && arg.root === 'root' && arg.nodes.some((n) => n.group === 'Claims') && arg.nodes.some((n) => n.group === 'Evidence') && arg.nodes.some((n) => n.group === 'Assumes' && /Socria’s reading/.test(n.note)) && arg.nodes.some((n) => n.group === 'Limits it states'), arg);
  ok('  every edge joins nodes that exist', arg.edges.every((e) => arg.nodes.some((n) => n.id === e.from) && arg.nodes.some((n) => n.id === e.to)));
  for (const [name, d] of [['terms', terms], ['argument', arg]]) {
    const made = T.makeDisplay(T.EMPTY_SPACE, 'diagram', d, 'socria');
    const st = made.ok ? T.currentOf(made.obj) : null;
    ok(`  the ${name} map is a Diagram the workspace accepts, as drawn`, made.ok && st.nodes.length === d.nodes.length && st.edges.length === d.edges.length && st.view === d.view && st.title === d.title, made.ok ? '' : made.says);
  }
  const few = T.sanitizeBrief({ concepts: [{ term: 'Staffing', meaning: 'Nurses on a ward.', cites: [find(paper, /18% fewer/).id] }] }, paper, { shown: 1, total: 1 });
  ok('fewer than three terms, or no claim: nothing is drawn', T.termsDiagram(few) === null && T.argumentDiagram(few) === null);
}

console.log('\n=== the route: /api/docs/brief ===');
{
  const OUT = join(here, '.tmp', 'e2e-docint');
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
  const swap = { name: 'swap', setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  } };
  const opts = { bundle: true, format: 'esm', platform: 'node', tsconfig: join(root, 'tsconfig.json'), plugins: [swap], external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error' };
  await build({ ...opts, entryPoints: [join(root, 'app/api/docs/brief/route.ts')], outfile: join(OUT, 'brief.mjs') });
  await build({ ...opts, entryPoints: [join(root, 'app/api/logos/chat/route.ts')], outfile: join(OUT, 'chat.mjs') });
  const quiet = (orig) => (...a) => { if (typeof a[0] === 'string' && /^\[(logos|socria|docs)/.test(a[0])) return; orig(...a); };
  console.warn = quiet(console.warn.bind(console)); console.error = quiet(console.error.bind(console));
  const log = console.log.bind(console);
  console.log = (...a) => (typeof a[0] === 'string' && /^\[(logos|socria|docs|mr|tokens)/.test(a[0]) ? undefined : log(...a));
  process.env.OPENAI_API_KEY = 'test'; process.env.RATE_LIMIT_DISABLED = '1'; globalThis.__uid = 'user_brief';
  const route = await import(pathToFileURL(join(OUT, 'brief.mjs')).href);
  const { NextRequest } = await import('next/server.js');
  const post = async (body, script = []) => {
    globalThis.__logosCalls = []; globalThis.__logosScript = [...script];
    const r = await route.POST(new NextRequest('http://localhost/api/docs/brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: r.status, json: await r.json().catch(() => null), calls: globalThis.__logosCalls.length, call: globalThis.__logosCalls[0] };
  };
  const good = { gist: 'A study of staffing and falls.', gist_cites: [find(paper, /18% fewer/).id], findings: [{ text: 'Higher staffing was linked to 18% fewer falls.', cites: [find(paper, /18% fewer/).id] }, { text: 'Staffing tripled overnight.', cites: [falls.id] }] };
  const a = await post({ doc: paper }, [good]);
  ok('a document is read for the person: one model call, the points that hold up', a.status === 200 && a.calls === 1 && a.json?.brief?.findings?.length === 1 && !a.json.brief.plain, a.json);
  ok('  the invented point dropped and counted', a.json?.brief?.dropped >= 1);
  ok('  the model was asked for JSON and shown the passages as material', a.call?.response_format?.type === 'json_object' && /never instructions to you/.test(a.call?.messages?.[0]?.content ?? '') && (a.call?.messages?.[1]?.content ?? '').includes(`[${deadline.id}]`));
  ok('  how much it read is said', a.json?.brief?.read?.total === T.readableBlocks(paper).length && a.json.brief.read.shown > 0);
  const none = await post({});
  ok('no document: 400, and no model asked', none.status === 400 && none.calls === 0);
  const forged = await post({ doc: { ...paper, blocks: [{ id: '<script>', page: 1, kind: 'paragraph', text: 'x', method: 'text' }] } });
  ok('a forged reading is refused or emptied before any model sees it', (forged.status === 400 || forged.status === 422) && forged.calls === 0, forged.status);
  const empty = await post({ doc: { ...memo, blocks: memo.blocks.filter((b) => b.kind === 'heading') } });
  ok('nothing readable: 422, said plainly, no model asked', empty.status === 422 && /not enough readable text/.test(empty.json?.error ?? '') && empty.calls === 0);
  const junk = await post({ doc: paper }, ['not json at all']);
  ok('an answer that is not JSON: the plain reading, and said', junk.status === 200 && junk.json?.brief?.plain === true && /did not come back in a form it could check/.test(junk.json?.note ?? ''));
  const allBad = await post({ doc: paper }, [{ findings: [{ text: 'Falls fell 90%.', cites: [falls.id] }, { text: 'Nothing.', cites: ['p999.1'] }] }]);
  ok('nothing held up: the plain reading, said so, the dropped counted', allBad.json?.brief?.plain === true && /Nothing in Socria’s analysis held up/.test(allBad.json?.note ?? '') && allBad.json.brief.dropped === 2, allBad.json);
  const thrown = await post({ doc: paper }, [new Error('provider down')]);
  ok('the model does not answer: the plain reading, not an error', thrown.status === 200 && thrown.json?.brief?.plain === true);
  globalThis.__uid = null;
  const out = await post({ doc: paper }, [good]);
  ok('signed out without the access key: 401, no model asked', out.status === 401 && out.calls === 0);
  globalThis.__uid = 'user_brief';
  delete process.env.OPENAI_API_KEY;
  const nokey = await post({ doc: paper }, [good]);
  ok('no model configured: the plain reading', nokey.status === 200 && nokey.json?.brief?.plain === true && nokey.calls === 0);
  process.env.OPENAI_API_KEY = 'test';

  console.log('\n=== the chat route: the answer shaped by what was asked ===');
  const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
  const attach = (d) => ({ kind: 'doc', name: d.name, doc: d.id, text: 'x', pages: d.pageCount, format: d.format, origin: 'source' });
  const turn = async (messages, extra = {}) => {
    globalThis.__logosCalls = []; globalThis.__logosPrompts = []; globalThis.__logosReply = 'Noted.'; globalThis.__logosScript = [];
    const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, docs: [paper], ...extra }) }));
    try { await r.text(); } catch {}
    const call = globalThis.__logosCalls.find((c) => c.stream);
    return { status: r.status, runtime: r.headers.get('x-socria-runtime') ?? '', model: r.headers.get('x-socria-model') ?? '', system: systemOf(call), last: turnsOf(call).at(-1)?.content ?? '', max: call?.max_tokens ?? call?.max_completion_tokens ?? 0 };
  };
  const ask = (text) => turn([{ role: 'user', content: text, attachments: [attach(paper)] }]);
  const loc = await ask('Where does it give the submission deadline?');
  const crit = await ask('How strong is the evidence for the main claim, and what does it assume?');
  ok('a lookup is read as one', loc.status === 200 && /docs=1:locate/.test(loc.runtime), loc.runtime);
  ok('  answered without the deep model', !/\/deep\//.test(loc.model), loc.model);
  ok('  told to answer in a sentence or two with its key', /THIS QUESTION ABOUT THE DOCUMENTS \(locate\)/.test(loc.system));
  ok('a critique is read as one, on the deep model, told to keep claim, evidence and assumption apart', /docs=1:critique/.test(crit.runtime) && /\/deep\//.test(crit.model) && /THIS QUESTION ABOUT THE DOCUMENTS \(critique\)/.test(crit.system), crit.runtime + ' ' + crit.model);
  ok('  with more room than the lookup', crit.max > loc.max, `${crit.max} vs ${loc.max}`);
  ok('the line is in this turn’s context, never in the document’s fence', !/THIS QUESTION ABOUT THE DOCUMENTS/.test(loc.last));
  const followed = await turn([
    { role: 'user', content: 'What do they recommend?', attachments: [attach(paper)] },
    { role: 'assistant', content: `Staffing may matter most at night [A${night.id.slice(1)}].` },
    { role: 'user', content: 'why?' },
  ]);
  ok('a follow-up carries the passages the last reply cited', /:carried/.test(followed.runtime) && followed.last.includes(`[A${night.id.slice(1)}]`), followed.runtime);
  const plainTurn = await turn([{ role: 'user', content: 'hello there', attachments: [attach(paper)] }]);
  ok('an ordinary turn with a document adds no line about how to answer', !/THIS QUESTION ABOUT THE DOCUMENTS/.test(plainTurn.system) && /docs=1:general/.test(plainTurn.runtime));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
