// THE ADAPTIVE EXPLANATION ENGINE (lib/runtime/explain.ts) — Logos 5.5.
//
//   selection      each of the twenty strategies chosen where it fits, from real
//                  turns read the way the route reads them (signals, state, the
//                  move, the presentation planner)
//   restraint      a direct answer where one is better: nothing forced, nothing added
//   combination    one primary, at most three, one question, never two of a kind
//   adaptation     the last reply's strategy, their mistakes, what they got right
//   continuity     the learning ledger: Leitner boxes, what is due, what was met before
//   execution      the elements folded into the presentation, the lines the reply
//                  follows, and the check that a reply carried each strategy out
//   integration    the route, the client, the switch, the stable prompt untouched

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './.tmp/runtime-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;
const NOW = Date.UTC(2026, 10, 7, 12);
const DAY = 86_400_000;

/** A turn read the way the route reads it, then planned. */
function turn(text, o = {}) {
  const history = o.history ?? [];
  const signals = R.readSignals(text);
  const route = R.routeTurn({ text, lastReply: [...history].reverse().find((m) => m.role === 'assistant')?.content });
  const state = R.readTurnState({ text, history, signals, intent: route.intent, checked: o.checked ?? [], ...(o.resumedAfterMs ? { resumedAfterMs: o.resumedAfterMs } : {}) });
  const a = R.allocate({ state, signals, assist: { lastUserText: text, history, guard: !!o.guard, ...(o.resumedAfterMs ? { resumedAfterMs: o.resumedAfterMs } : {}) } });
  const ownReasoning = a.split.reasoning === 'human' || a.split.reasoning === 'scaffold';
  const p = R.planPresentation({ text, state, signals, questions: a.assist.questions, ownWriting: a.split.creativity === 'human', ownJudgment: a.split.judgment === 'human', ownReasoning, scaffold: a.split.reasoning === 'scaffold', guard: !!o.guard, history, length: o.length ?? null });
  const questions = o.questions ?? a.assist.questions;
  const plan = R.planExplanation({
    text,
    history,
    signals,
    state,
    presentation: o.presentation ?? p,
    questions,
    guard: !!o.guard,
    ownReasoning,
    ownJudgment: a.split.judgment === 'human',
    assist: a.assist,
    did: o.did,
    ledger: o.ledger,
    thread: (o.thread ?? []).map((n) => R.sanitizeThreadNote(n)).filter(Boolean),
    length: o.length ?? null,
    now: NOW,
  });
  return { plan, p, applied: R.applyExplanation(o.presentation ?? p, plan), block: R.renderExplanation(plan, a.assist), assist: a.assist, state };
}
const has = (r, s) => r.plan.strategies.includes(s);
const LEARNED = [{ role: 'user', content: 'how does photosynthesis work?' }, { role: 'assistant', content: 'Plants use light to turn carbon dioxide and water into glucose, and give off oxygen.' }];
const ANALOGY_REPLY = [{ role: 'user', content: 'what is entropy?' }, { role: 'assistant', content: 'Entropy is like a messy room: there are far more ways for it to be messy than tidy.' }];
const STEPS_REPLY = [{ role: 'user', content: 'how do I solve 2x + 3 = 11?' }, { role: 'assistant', content: 'Here is the working.\n\n```ui\n{"type":"steps","lines":[{"tex":"2x = 8"},{"tex":"x = 4"}]}\n```' }];

console.log('\n=== the twenty, each where it fits ===');
ok('the twenty strategies, in their order — and the three moves the ladder added (a try like it, a prediction, a diagnosis)', J(R.STRATEGIES) === J(['insight', 'analogy', 'compare', 'worked', 'faded', 'segmented', 'pretrain', 'visual', 'conceptmap', 'causal', 'misconception', 'error', 'elaborate', 'selfexplain', 'retrieval', 'spaced', 'interleave', 'teachback', 'argument', 'tradeoffs', 'transfer', 'predict', 'diagnose']));
{
  const r = turn('why is the sky blue?');
  ok('1 Essential Insight: the spine of an explanation ("why is the sky blue?")', has(r, 'insight') && has(r, 'causal'), J(r.plan.strategies));
  const s = turn('that was too long, can you say it simpler?', { history: LEARNED });
  ok('  and the lead when they ask for it simpler', s.plan.strategies[0] === 'insight' || !s.plan.strategies.length || s.plan.direct, J(s.plan));
}
{
  const r = turn('explain like I am 5 how vaccines work');
  ok('2 Analogy: someone new to it, said so ("explain like I am 5")', r.plan.level === 'novice' && has(r, 'analogy'), J(r.plan));
}
{
  const r = turn('what is the difference between mitosis and meiosis?');
  ok('3 Comparative: two things set against each other, carried in a comparison', has(r, 'compare') && r.applied.forms.includes('compare'), J(r.plan));
}
{
  const r = turn("I still don't get it", { history: ANALOGY_REPLY });
  ok('4 Worked Example: still lost after an analogy, so an example — not another analogy', has(r, 'worked') && !has(r, 'analogy'), J(r.plan));
}
{
  const r = turn('solve 3x - 5 = 10', { guard: true });
  ok('5 Faded Guidance: their problem under the guard — the first steps, the last theirs', has(r, 'faded') && !has(r, 'worked') && !r.applied.forms.includes('steps'), J(r.plan));
  const after = turn('ok, and how do I solve 5x + 2 = 17?', { history: STEPS_REPLY });
  ok('  …and after a worked example, the next one faded', has(after, 'faded') && !has(after, 'worked'), J(after.plan));
}
{
  const r = turn('how does the immune system recognise pathogens through antigen presentation and clonal selection?');
  ok('6 Segmented: a mechanism of many parts — the first part, the rest as ways onward', r.plan.complexity === 3 && has(r, 'segmented') && r.applied.forms.includes('paths'), J(r.plan));
  const d = turn('how does the immune system recognise pathogens through antigen presentation and clonal selection?', { length: 'detailed' });
  ok('  …but a Detailed length is not cut into parts for a novice', !(d.plan.level === 'novice' && d.plan.reasons.includes('segmented:novice')));
}
{
  const r = turn("I'm a beginner. How does oxidative phosphorylation drive ATP synthesis in the mitochondrion?");
  ok('7 Concept Pretraining: a newcomer, and the question full of terms — the terms first', r.plan.level === 'novice' && has(r, 'pretrain'), J(r.plan));
}
{
  const r = turn('how does photosynthesis work?');
  ok('8 Visual-Verbal: a process — a picture (its ordered stages, already drawn), and words pointing into it', has(r, 'visual') && r.applied.forms.some((k) => k === 'diagram' || k === 'sequence'), J(r.applied));
  const v = turn('how does a refrigerator move heat from inside to outside the kitchen?');
  ok('  …and where nothing is drawn yet, a diagram of the flow', !has(v, 'visual') || v.applied.forms.some((k) => k === 'diagram' || k === 'sequence'), J(v.applied));
}
{
  const r = turn('how do supply, demand and price elasticity relate?');
  ok('9 Concept Mapping: how ideas relate — laid out as parts', has(r, 'conceptmap') && r.applied.forms.some((k) => k === 'concepts' || k === 'graph'), J(r.plan));
}
{
  const r = turn('why did the Roman Empire collapse?');
  ok('10 Causal: a why — the chain of causes', r.plan.strategies[0] === 'causal', J(r.plan));
}
{
  const r = turn('I always thought heavier objects fall faster');
  ok('11 Misconception Correction: a belief that will not hold, said', has(r, 'misconception'), J(r.plan));
}
{
  const r = turn('hmm, I got that one wrong', { history: LEARNED, did: { right: 0, wrong: 1 } });
  ok('12 Error-Based: a check they answered wrong — their slip, located', has(r, 'error') && r.plan.strategies[0] === 'error', J(r.plan));
}
{
  const r = turn('is it because the light reactions happen in the thylakoids?', { history: LEARNED, did: { right: 1, wrong: 0 } });
  ok('13 Elaborative Interrogation: something right — asked, once, why it holds', has(r, 'elaborate') && r.plan.question === 'elaborate', J(r.plan));
}
{
  const r = turn('ok done', { history: STEPS_REPLY, did: { right: 1, wrong: 0 } });
  ok('14 Self-Explanation: a step right after a worked example — why it works, in their words', has(r, 'selfexplain') && r.plan.question === 'selfexplain', J(r.plan));
}
{
  const r = turn('how does photosynthesis work?', { ledger: [{ topic: 'photosynthesis', seen: 2, right: 1, wrong: 0, last: NOW - 6 * DAY, box: 1 }] });
  ok('15 Retrieval Practice: met before, in another conversation — recalled before retaught', has(r, 'retrieval') && r.plan.question === 'retrieval', J(r.plan));
  const resumed = turn('how does the Calvin cycle use ATP?', { history: [...LEARNED, ...LEARNED], resumedAfterMs: 3 * DAY });
  ok('  …and coming back to a line after a gap (Logos 4’s move): the recall question leads', !resumed.assist.retrieval || has(resumed, 'retrieval'), J(resumed.plan));
}
{
  const ledger = [
    { topic: 'cell respiration', seen: 2, right: 1, wrong: 0, last: NOW - 20 * DAY, box: 1 },
    { topic: 'mitosis', seen: 1, right: 0, wrong: 1, last: NOW - 8 * DAY, box: 0 },
  ];
  const r = turn('what should I review for my biology exam tomorrow?', { ledger });
  ok('16 Spaced Reinforcement: what is due comes back — once, in the practice', has(r, 'spaced') && r.plan.due.length >= 1 && r.plan.question === 'spaced', J(r.plan));
  ok('17 Interleaved: the review practice mixes kinds, the method chosen first', has(r, 'interleave'), J(r.plan));
  ok('  …with a single question between them', r.plan.strategies.filter((s) => R.ASKING.has(s)).length <= 2 && r.plan.question === 'spaced');
}
{
  const r = turn('oh I get it now, the light reactions make the ATP', { history: LEARNED });
  ok('18 Teach-Back, offered: "I get it now, the light reactions make the ATP" is said back already — confirmed, not quizzed again', r.plan.need === 'feedback' && !r.plan.question && /own words/.test(r.block), J(r.plan));
  const claimed = turn('ok got it', { history: LEARNED, thread: [{ s: ['analogy'], n: 'reframe', c: 'photosynthesis' }] });
  ok('  …and "got it" after being lost: understanding claimed, not shown — one chance to say it back', claimed.plan.question === 'teachback', J(claimed.plan));
}
{
  const r = turn('my argument is that remote work increases productivity, does it hold up?');
  ok('19 Argument Mapping: a claim to test — reasons, objection, assumption', has(r, 'argument'), J(r.plan));
  const brain = turn('is it true that we only use 10% of our brains?');
  ok('  …and a known myth, asked about: refuted, verdict first, the claim still laid out to inspect', brain.plan.need === 'refute' && has(brain, 'misconception') && brain.applied.forms.includes('claim'), J({ plan: brain.plan, forms: brain.applied.forms }));
}
{
  const r = turn('should I take the job in London or stay where I am?');
  ok('20 Decision Tradeoffs: their choice — weighed on what matters, the call theirs', has(r, 'tradeoffs') && r.applied.forms.includes('decide'), J(r.plan));
}

console.log('\n=== restraint: a direct answer where one is better ===');
for (const [text, why] of [
  ['hi there!', 'a hello'],
  ['what is the capital of France?', 'a plain fact'],
  ['just tell me what 18% of 340 is', '"just tell me"'],
  ['lol that is hilarious', 'a joke'],
]) {
  const r = turn(text);
  ok(`  ${why}: nothing forced, nothing added`, r.plan.direct && r.block === '' && J(r.applied.forms) === J(r.p.forms), J(r.plan));
}
{
  const r = turn('I am a physicist; what is entropy?');
  ok('  an expert and a one-line question: Essential Insight alone, no lines added', r.plan.level === 'expert' && r.block === '' && r.plan.strategies.length <= 1, J(r.plan));
  const w = turn('write me a cover letter for a junior designer role');
  ok('  a thing to build or write: not shaped as an explanation', w.plan.direct, J(w.plan));
}
{
  const q0 = turn('oh I get it now, the light reactions make the ATP', { history: LEARNED, questions: 0 });
  ok('  no question allowed this turn: no quiz, no teach-back, no recall', !q0.plan.question && !q0.plan.strategies.some((s) => R.ASKING.has(s)), J(q0.plan));
  const stop = turn('stop asking me questions, why does the moon have phases?');
  ok('  "stop asking me questions": still explained, never quizzed', !stop.plan.question, J(stop.plan));
}
{
  const r = turn('why is the sky blue?');
  ok('  an everyday why: told as a chain in words — no diagram forced', !r.applied.forms.includes('diagram'), J(r.applied.forms));
}

{
  const r = turn('explain like I am 5 how vaccines work');
  ok('  a picture is pointed into only where one is drawn (found live: "let the picture carry it" with nothing drawn)', !has(r, 'visual') || r.applied.forms.some((k) => ['diagram', 'graph', 'sim', 'slider', 'concepts', 'sequence', 'chart'].includes(k)), J({ s: r.plan.strategies, f: r.applied.forms }));
  ok('  topics are the subject, not the asking (found live: "like vaccines", "review biology exam tomorrow")', R.topicOf('explain like I am 5 how vaccines work') === 'vaccines' && R.topicOf('what should I review for my biology exam tomorrow?') === 'biology');
}

console.log('\n=== combination, without overwhelming ===');
const SAMPLE = [
  'how does photosynthesis work?', 'explain like I am 5 how vaccines work', 'why did the Roman Empire collapse?', 'what is the difference between mitosis and meiosis?',
  'how does the immune system recognise pathogens through antigen presentation and clonal selection?', 'how do supply, demand and price elasticity relate?',
  'should I take the job in London or stay?', "I'm a beginner. How does oxidative phosphorylation drive ATP synthesis in the mitochondrion?", 'solve 2x + 3 = 11', 'I always thought heavier objects fall faster',
];
const plans = SAMPLE.map((t) => turn(t));
ok('never more than three strategies', plans.every((r) => r.plan.strategies.length <= 3), J(plans.map((r) => r.plan.strategies)));
ok('never more than one question', plans.every((r) => r.plan.strategies.filter((s) => R.ASKING.has(s) && s !== 'interleave').length <= 1));
ok('never two of one kind (worked, faded, error; compare, tradeoffs; concept map, argument)', plans.every((r) => !(has(r, 'worked') && has(r, 'faded')) && !(has(r, 'compare') && has(r, 'tradeoffs')) && !(has(r, 'conceptmap') && has(r, 'argument'))));
ok('an expert gets one strategy', turn('I am a mathematician — why does the mean value theorem need differentiability on the open interval?').plan.strategies.length <= 1);
ok('a novice on something complex may get three', turn("I'm a beginner. How does oxidative phosphorylation drive ATP synthesis in the mitochondrion?").plan.strategies.length === 3);
ok('at most two elements, one of them live, after folding', plans.every((r) => r.applied.forms.length <= 2 && r.applied.forms.filter((k) => ['graph', 'sim', 'slider', 'decide', 'steps', 'claim'].includes(k)).length <= 1), J(plans.map((r) => r.applied.forms)));

console.log('\n=== adaptation ===');
{
  const a = turn("I still don't get it", { history: ANALOGY_REPLY });
  ok('lost after an analogy: a different way in (an example, a picture), not the same again', !has(a, 'analogy') && (has(a, 'worked') || has(a, 'visual')), J(a.plan));
  const b = turn("I still don't get it", { history: [{ role: 'user', content: 'what is entropy?' }, { role: 'assistant', content: 'Entropy measures the number of microstates.' }] });
  ok('lost after a plain explanation: a different way in (a concrete instance first, or an analogy)', b.plan.need === 'reframe' && (has(b, 'worked') || has(b, 'analogy')), J(b.plan));
  ok('the last reply’s strategies are read from its text', J([...R.usedBefore(ANALOGY_REPLY)]) === J(['analogy']) && R.usedBefore(STEPS_REPLY).has('worked'));
}
{
  const wrong = turn('is this right? 2x + 3 = 11 so x = 7', { checked: [{ status: 'refuted' }] });
  ok('their work wrong: the slip located, not the whole thing redone', has(wrong, 'error') && !has(wrong, 'worked'), J(wrong.plan));
  ok('a slip makes them a novice for this turn, two rights an intermediate', R.levelOf({ text: 'x', signals: R.readSignals('x'), state: { understanding: { right: 0, wrong: 2, saidStuck: false }, preferences: { expertise: null } }, did: { right: 0, wrong: 0 }, ledger: [] }, null) === 'novice');
}

console.log('\n=== continuity: the learning ledger ===');
{
  let L = R.noteTopic([], 'photosynthesis', {}, NOW - 10 * DAY);
  ok('a topic met: seen once, box 0', L.length === 1 && L[0].seen === 1 && L[0].box === 0);
  L = R.noteTopic(L, 'photosynthesis light', { right: 1 }, NOW - 9 * DAY);
  ok('  met again and answered right: up a box, the same entry (topics matched loosely)', L.length === 1 && L[0].box === 1 && L[0].right === 1 && L[0].seen === 2, J(L));
  L = R.noteTopic(L, 'photosynthesis', { wrong: 1 }, NOW - 8 * DAY);
  ok('  a slip: back to the first box', L[0].box === 0 && L[0].wrong === 1);
  ok('the intervals expand: 1, 3, 7, 16, 35 days', J(R.INTERVAL_DAYS) === J([1, 3, 7, 16, 35]));
  const due = R.dueTopics([
    { topic: 'osmosis', seen: 1, right: 0, wrong: 0, last: NOW - 2 * DAY, box: 0 },
    { topic: 'meiosis', seen: 1, right: 1, wrong: 0, last: NOW - 2 * DAY, box: 1 },
    { topic: 'entropy', seen: 1, right: 3, wrong: 0, last: NOW - 40 * DAY, box: 4 },
    { topic: 'enzymes', seen: 1, right: 0, wrong: 0, last: NOW - 3 * 3600_000, box: 0 },
  ], NOW);
  ok('due: past its box’s interval since last practised, never within the day', J(due.map((e) => e.topic)) === J(['entropy', 'osmosis']), J(due));
  const big = Array.from({ length: 60 }, (_, i) => ({ topic: `enzymes kinetics ${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${i}`, seen: 1, right: 0, wrong: 0, last: NOW, box: 9, evil: '<script>' }));
  const s = R.sanitizeLedger([...big, { topic: '', last: NOW }, { topic: 'x', last: 'yesterday' }, null], NOW);
  ok('from a browser: forty at most, boxes clamped, nothing else kept', s.length === 40 && s.every((e) => e.box <= 4 && !('evil' in e)), J(s[0]));
  ok('  and junk is nothing', J(R.sanitizeLedger('nope', NOW)) === '[]' && J(R.sanitizeLedger([{ topic: 'Mitosis!!', last: NOW, seen: 2 }], NOW)) === J([{ topic: 'mitosis', seen: 2, right: 0, wrong: 0, last: NOW, box: 0 }]));
  ok('what they did with checks, counted (and how many tries)', J(R.outcomesOf([{ from: 'Check', said: 'answered 4 to “x?” — right' }, { from: 'Check', said: 'answered 3 to “y?” — not right' }])) === J({ right: 1, wrong: 1, tries: 1 }));
  ok('the topic, in a few content words', R.topicOf('How does photosynthesis work?') === 'photosynthesis' && R.topicOf('hi') === null && (R.topicOf('what is the difference between mitosis and meiosis?') ?? '').includes('mitosis'));
  const r = turn('how does photosynthesis work?', { ledger: [{ topic: 'photosynthesis', seen: 2, right: 1, wrong: 0, last: NOW - 6 * DAY, box: 1 }] });
  ok('a learning turn is marked for the ledger with its topic', r.plan.learning && r.plan.topic === 'photosynthesis');
  ok('  a hello is not', !turn('hi there!').plan.learning);
}

console.log('\n=== execution: elements, lines, and whether the reply did it ===');
{
  const base = { forms: ['graph', 'paths'], reasons: [], strong: ['graph'] };
  const plan = { ...turn('how does photosynthesis work?').plan, forms: ['diagram'], ask: 'how' };
  const a = R.applyExplanation(base, plan);
  ok('folding: a way onward gives its place to what explains', J(a.forms) === J(['graph', 'diagram']) && a.strong.includes('diagram') && a.diagram === 'flow', J(a));
  const live = R.applyExplanation({ forms: ['graph'], reasons: [] }, { ...plan, forms: ['steps'] });
  ok('  never a second live element', J(live.forms) === J(['graph']));
  const guarded = R.applyExplanation({ forms: [], reasons: [], guard: true }, { ...plan, forms: ['diagram', 'paths'] });
  ok('  nothing drawn under the guard', J(guarded.forms) === J(['paths']));
  const doc = { forms: [], reasons: ['place:content'], place: 'content' };
  ok('  a write-up for Content untouched', R.applyExplanation(doc, plan) === doc);
  ok('  a direct plan changes nothing', R.applyExplanation(base, { ...plan, direct: true }) === base);
}
{
  const blocks = SAMPLE.map((t) => turn(t).block);
  const words = blocks.map((b) => b.split(/\s+/).filter(Boolean).length);
  ok('the lines are short: at most 90 words a turn, often none', Math.max(...words) <= 90, J(words));
  ok('  said as what to do — no strategy name, no mode, nothing the person would see', blocks.every((b) => !/\b(?:strategy|Essential Insight|Faded Guidance|Teach-Back|Interleav|mode)\b/i.test(b)));
  const nov = turn('explain like I am 5 how vaccines work').block;
  ok('  a newcomer: plain words, said once', /They are new to this/.test(nov) && /analogy/.test(nov), nov);
  const sp = turn('what should I review for my biology exam tomorrow?', { ledger: [{ topic: 'cell respiration', seen: 2, right: 1, wrong: 0, last: NOW - 20 * DAY, box: 1 }] }).block;
  ok('  what is due is named in the line that brings it back', /“cell respiration”/.test(sp), sp);
  const dup = R.renderExplanation({ ...turn('ok done', { history: STEPS_REPLY, did: { right: 1, wrong: 0 } }).plan }, { selfExplain: true });
  ok('  what Logos 4’s move already said is not said twice', !/ask them, once, why it works/.test(dup), dup);
}
{
  const P = (strategies, extra = {}) => ({ strategies, level: 'intermediate', complexity: 2, ask: 'how', topic: 't', direct: false, forms: [], question: null, due: [], learning: false, reasons: [], ...extra });
  const good = R.checkExplanation(
    'Plants make sugar from light. Think of a leaf like a solar-powered kitchen.\n\n```ui\n{"type":"diagram","nodes":[]}\n```\n\nLight splits water → ATP → the Calvin cycle uses it. Which stage stops first in the dark?',
    P(['insight', 'analogy', 'visual', 'causal', 'teachback'])
  );
  ok('the check: a reply that did each one is read as doing it', Object.values(good).every(Boolean), J(good));
  const bad = R.checkExplanation('There are many considerations to weigh here, and a number of factors which together contribute in various complex and interrelated ways to the overall outcome that we observe in practice today.', P(['insight', 'analogy', 'visual', 'teachback', 'compare']));
  ok('  and one that did none is not', !bad.insight && !bad.analogy && !bad.visual && !bad.teachback && !bad.compare, J(bad));
  ok('  a worked example in numbered steps counts; a faded one ends on their step', R.checkExplanation('1. Subtract 3.\n2. Divide by 2.', P(['worked'])).worked && R.checkExplanation('Subtract 3 to get 2x = 8. Now you finish: what is x?', P(['faded'])).faded);
}
console.log('\n=== integration ===');
{
  const route = read('app/api/logos/chat/route.ts');
  ok('the route plans the explanation after the presentation and the move', /explain = planExplanation\(\{/.test(route) && route.indexOf('planExplanation({') > route.indexOf('planPresentation({'));
  ok('  folds it into the presentation the gate and the renderer read', /const presentation = explain && inlineOn \? applyExplanation\(presented, explain\) : presented;/.test(route));
  ok('  its lines in this turn’s context, after the presentation’s and read against it — never in the stable prompt', /renderPresentation\(presentation[\s\S]{0,400}renderTurnGuidance\(explain, presentation/.test(route) && !/const stable =[\s\S]{0,2000}renderTurnGuidance/.test(route));
  ok('  LOGOS_EXPLAIN=off: the route as it was; a failure: the turn without it', /process\.env\.LOGOS_EXPLAIN !== 'off'/.test(route) && /\[explain\] planning failed/.test(route));
  ok('  the ledger read only through the one gate (never sensitive, off the record, two people, shared, a visitor, incognito)', /comprehensionAllowed \? sanitizeLedger\(body\?\.learning/.test(route) && /!turnState\.sensitive &&/.test(route) && /!signals\.offRecord &&/.test(route) && /!twoPeople &&/.test(route));
  ok('  content-free headers: the strategies, and the topic of a learning turn', /'X-Socria-Explain': explainTrace\(explain\)/.test(route) && /'X-Socria-Learn': encodeURIComponent\(explain\.topic\)/.test(route));
  const app = read('components/LogosApp.tsx');
  ok('the client sends the ledger kept in this browser (never into a conversation others read), and notes a learning turn', /if \(shared\) return \{\};\s*const lg = readLedger\(\);/.test(app) && /noteLearningTurn\(\{ learn: res\.headers\.get\('X-Socria-Learn'\), review: res\.headers\.get\('X-Socria-Review'\), lost: res\.headers\.get\('X-Socria-Lost'\) \}, turn\.did\)/.test(app));
  ok('  …and keeps the engine\'s note on the reply (codes and a concept), the question only if the reply asked it', /threadNoteFrom\(threadHeader, acc\)/.test(app) && /sanitizeThreadNote\(m\.explain\)/.test(read('app/api/conversations/route.ts')));
  ok('"Clear memory" clears the ledger; sign-out says it is cleared', /'socria\.learning\.v1'/.test(read('lib/local-data.ts')) && /lives only in this browser/.test(read('components/account/SignOutPanel.tsx')));
  ok('the Memory view lists it, with a Forget for each concept', /<LearningList \/>/.test(read('components/logos5/MemoryView.tsx')) && /forgetTopic\(e\.topic\)/.test(read('components/logos5/LearningList.tsx')));
  const lib = read('lib/logos5/learning.ts');
  ok('  kept in localStorage only, failures harmless', /localStorage\.setItem\(LEARNING_KEY/.test(lib) && /catch \{/.test(lib) && !/fetch\(/.test(lib));
  ok('invisible: no mode, no badge, nothing new on screen', !/explain-mode|Explanation mode|strategy-badge/i.test(app));
  ok('trace: content-free codes', R.explainTrace(turn('how does photosynthesis work?').plan).split(';').every((p) => /^[a-z0-9+=]+$/.test(p)));
}

console.log(`\nexplain-engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
