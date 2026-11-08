// THE EXPLANATION ENGINE'S PLAN AUDIT (Logos 5.5, II) — deterministic, no model.
//
// What it gates, every run:
//
//   golden        135 turns written and labelled BEFORE the new engine was run on them,
//                 by five independent authors, each item rated again by a blind second
//                 rater (agreement 132/135, kappa 0.97): the need the ladder picks, the
//                 moves that must and must not appear, the level, the kind of question,
//                 the topic. Every miss must be one of two named, counted allowances —
//                 a turn the router sends to be BUILT (a quiz, a map: what is built
//                 answers it), and a diagnostic question the turn's question budget has
//                 already spent. Anything else fails.
//   paraphrase    three phrasings of one situation get the same need
//   invariants    across the golden set and the 33-scenario battery, read as production
//                 reads them (history through contentForHistory):
//                   - no "their slip" without a slip (a refuted step, a check not right)
//                   - a direct answer adds nothing: no lines, no element
//                   - lost after X: never X again
//                   - a reaction never becomes a topic ("don't", "next one")
//                   - under the guard: no worked example, no working, never "show the first steps"
//                   - at most three moves and one question
//                   - the block is short, and never says what the shape already says
//                   - no two instructions in one prompt that contradict each other
//   continuity    the ledger: junk dropped, a mention never resets the review clock,
//                 credit only for a first-try right answer, a failed way in remembered;
//                 thread notes sanitised to enum codes
//
// What it does NOT show: that any reply helps anyone learn. Labels are one reading of the
// design by model raters; the plans are instructions, not outcomes (docs/LOGOS-5-SYSTEM.md §8.11).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './.tmp/runtime-under-test.mjs';
import * as I from './.tmp/inline-under-test.mjs';
import { planTurn, NOW, DAY } from '../evals/explain/plan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 700))));
const J = JSON.stringify;
const words = (s) => s.split(/\s+/).filter(Boolean).length;

/** History as the route hands it to the engine: inline elements rewritten to their markers. */
const asRoute = (item) => ({ ...item, history: (item.history ?? []).map((m) => ({ role: m.role, content: m.role === 'assistant' ? I.contentForHistory(m.content) : m.content })) });

const G = JSON.parse(read('evals/explain/golden.json'));
const B = JSON.parse(read('evals/explain/battery.json'));
const golden = G.items.map((it) => ({ it, r: planTurn(R, asRoute(it)) }));
const battery = B.map((s) => ({ it: { id: s.id, text: s.message, history: s.history, guard: !!s.guard }, r: planTurn(R, asRoute({ text: s.message, history: s.history, guard: !!s.guard })) }));

console.log('\n=== golden: the need, the moves, the level, the kind, the topic ===');
{
  const misses = [];
  const allowed = { built: [], budget: [] };
  let needRight = 0;
  for (const { it, r } of golden) {
    const e = it.expect;
    const errs = [];
    if (e.accept.includes(r.plan.need)) needRight++;
    else errs.push(`need ${r.plan.need}∉${e.accept}`);
    for (const s of e.include ?? []) if (!r.plan.strategies.includes(s)) errs.push(`missing ${s}`);
    for (const s of e.exclude ?? []) if (r.plan.strategies.includes(s)) errs.push(`has ${s}`);
    if (e.level && r.plan.level !== e.level) errs.push(`level ${r.plan.level}`);
    if (e.ask && r.plan.ask !== e.ask && !r.plan.direct) errs.push(`ask ${r.plan.ask}`);
    if (e.topic === 'null' && r.plan.topicFrom === 'own') errs.push(`topic "${r.plan.topic}" from their words`);
    else if (e.topic && e.topic !== 'null' && !r.plan.direct && !(r.plan.topic ?? '').includes(e.topic.toLowerCase().slice(0, 5))) errs.push(`topic "${r.plan.topic}"`);
    if (e.noLines && r.block) errs.push('lines added');
    if (!errs.length) continue;
    // the router sends it to be built (a practice set, a map): what is built answers it, the engine adds nothing
    if (r.state.intent !== 'conversation' && r.plan.reasons.includes('direct:view')) allowed.built.push(it.id);
    // a diagnostic question, where the turn's question budget is already spent: the budget wins, a reframe instead
    else if (e.accept.includes('diagnose') && r.plan.need === 'reframe' && r.assist.questions === 0) allowed.budget.push(it.id);
    else misses.push(`${it.id}: ${errs.join('; ')} [${r.plan.strategies.join('+')}; ${r.plan.reasons.slice(0, 6).join(',')}]`);
  }
  console.log(`  need right on ${needRight}/${golden.length}; allowances: built ${allowed.built.length} (${allowed.built.join(', ')}), budget ${allowed.budget.length} (${allowed.budget.join(', ')})`);
  ok(`every golden expectation holds, or is a named allowance (${golden.length - misses.length}/${golden.length})`, !misses.length, misses.join('\n         '));
  ok('  the need is right on at least 90% before any allowance', needRight / golden.length >= 0.9, `${needRight}/${golden.length}`);
  ok('  the allowances stay few (at most 12)', allowed.built.length + allowed.budget.length <= 12, J(allowed));
}

console.log('\n=== paraphrase: one situation, one need ===');
{
  const groups = new Map();
  // a phrasing the router sends to be built is answered by what is built: the engine's own consistency is over the rest
  for (const { it, r } of golden) if (!(r.state.intent !== 'conversation' && r.plan.reasons.includes('direct:view'))) groups.set(it.group, [...(groups.get(it.group) ?? []), r.plan.need]);
  const split = [...groups].filter(([, needs]) => {
    const top = Math.max(...[...new Set(needs)].map((n) => needs.filter((x) => x === n).length));
    return top / needs.length < 0.8;
  });
  ok(`three phrasings of a situation get the same need (${groups.size - split.length}/${groups.size} groups, turns sent to be built aside)`, split.length === 0, J(split));
}

console.log('\n=== invariants, over the golden set and the battery ===');
const all = [...golden, ...battery];
{
  const bad = all.filter(({ it, r }) => r.plan.strategies.includes('error') && !(r.state.understanding.wrong > 0 || (it.did?.wrong ?? 0) > 0));
  ok('no "point to their slip" without a slip — a request to learn is never a mistake', !bad.length, bad.map((x) => x.it.id).join(', '));
}
{
  const bad = all.filter(({ r }) => r.plan.direct && (r.block !== '' || J(r.applied.forms) !== J(r.p.forms)));
  ok('a direct answer adds nothing: no lines, no element', !bad.length, bad.map((x) => x.it.id).join(', '));
}
{
  const bad = golden.filter(({ it, r }) => {
    if (r.plan.need !== 'reframe') return false;
    const last = it.thread?.[it.thread.length - 1]?.s ?? [];
    const prev = (it.history ?? []).filter((m) => m.role === 'assistant').pop()?.content ?? '';
    const triedAnalogy = last.includes('analogy') || /\b(?:think of it (?:as|like)|imagine|it'?s like|is like a)\b/i.test(prev);
    const triedWorked = last.includes('worked') || /\[shown inline — steps:/.test(prev);
    return (triedAnalogy && r.plan.strategies.includes('analogy')) || (triedWorked && r.plan.strategies.includes('worked'));
  });
  ok('lost after an analogy, no analogy; lost after a worked example, no worked example', !bad.length, bad.map((x) => `${x.it.id}:${x.r.plan.strategies}`).join(', '));
}
{
  const reactions = ["I still don't get it", 'huh?', 'what?', 'next one please', 'ok cool', 'thanks!', 'got it', "i don't follow", 'lost me', 'nope, still not getting it'];
  const hist = [{ role: 'user', content: 'how does photosynthesis work?' }, { role: 'assistant', content: 'Plants use light to split water and make ATP, then spend it fixing carbon dioxide into sugar in the Calvin cycle.' }];
  const bad = reactions.map((text) => ({ text, r: planTurn(R, { text, history: hist }) })).filter(({ r }) => r.plan.topicFrom === 'own');
  ok('a reaction never becomes a topic of its own ("don\'t", "next one")', !bad.length, bad.map((b) => `${b.text}→${b.r.plan.topic}`).join(', '));
  const carried = planTurn(R, { text: "I still don't get it", history: hist });
  ok('  …being lost carries the thread\'s concept forward instead', carried.plan.topic === 'photosynthesis' && carried.plan.topicFrom === 'carried', J(carried.plan.topic));
}
{
  const guarded = all.filter(({ it }) => it.guard);
  const extra = ['How do I solve 2x^2 + 3x - 2 = 0?', 'solve 3x - 5 = 10', 'how do i find x in 4x + 7 = 31', 'what are the steps to factor x^2 - 5x + 6'].map((text) => ({ it: { id: text, guard: true }, r: planTurn(R, { text, guard: true }) }));
  const bad = [...guarded, ...extra].filter(({ r }) => r.plan.strategies.includes('worked') || r.applied.forms.includes('steps') || /show the first steps/i.test(r.block));
  ok('under the guard: no worked example, no working drawn, never "show the first steps"', !bad.length, bad.map((x) => x.it.id).join(', '));
  ok('  …and a guarded procedure is the method and the next step only', extra.every(({ r }) => r.plan.direct || /only the next single step/.test(r.block) || !r.plan.strategies.includes('faded')), J(extra.map((x) => x.r.block)));
}
{
  // mixed practice may carry the recall of what is due inside it: still one question
  const asks = (st) => st.filter((s) => R.ASKING.has(s) && !(s === 'interleave' && st.includes('spaced'))).length;
  const bad = all.filter(({ r }) => r.plan.strategies.length > 3 || asks(r.plan.strategies) > 1);
  ok('at most three moves, and at most one question', !bad.length, bad.map((x) => `${x.it.id}:${x.r.plan.strategies}`).join(', '));
}
{
  const lens = all.map(({ r }) => words(r.block));
  const present = lens.filter((n) => n > 0);
  const avg = present.reduce((a, b) => a + b, 0) / Math.max(1, present.length);
  console.log(`  block words: ${present.length}/${all.length} turns add a block; mean ${avg.toFixed(1)} words where present, max ${Math.max(...lens)}`);
  ok('the block is short: at most 110 words a turn', Math.max(...lens) <= 110, Math.max(...lens));
  ok('  …and the central idea is never said again here (the shape and the core say it)', all.every(({ r }) => !/\bOpen with\b|central insight|the one idea that makes/i.test(r.block)), all.filter(({ r }) => /Open with/.test(r.block)).map((x) => x.it.id).join(', '));
}
{
  // contradictions between the shape, the element grammar and the guidance, in the one prompt
  const clash = (r) => {
    const prompt = r.shape + r.block;
    const out = [];
    if (r.applied.guard && /show the first steps/i.test(prompt)) out.push('guard+first-steps');
    if (/\band stop\b/i.test(r.block) && r.applied.forms.some((k) => k !== 'paths')) out.push('stop+element');
    if (/each link with why/i.test(r.block) && r.applied.strong?.includes('diagram')) out.push('chain-in-words+diagram');
    if (/Let the (?:picture|element) carry/i.test(r.block) && !r.applied.forms.some((k) => r.applied.strong?.includes(k))) out.push('picture-pointed-into-nothing');
    if (/QUESTIONS: none this turn/.test(prompt) && r.plan.question) out.push('no-questions+question');
    if (/never the answer/i.test(prompt) && /Work one complete example/.test(r.block)) out.push('guard+worked');
    return out;
  };
  const bad = all.map(({ it, r }) => ({ id: it.id, c: clash(r) })).filter((x) => x.c.length);
  ok('no two instructions in one prompt that contradict each other', !bad.length, J(bad));
}

console.log('\n=== what the engine reads is what production sends ===');
{
  const steps = 'Here is the working.\n\n```ui\n{"type":"steps","lines":[{"tex":"2x = 8"},{"tex":"x = 4"}]}\n```';
  const hist = [{ role: 'user', content: 'how do I solve 2x + 3 = 11?' }, { role: 'assistant', content: I.contentForHistory(steps) }];
  ok('the history the route sends carries the marker, not the JSON', hist[1].content.includes(R.SHOWN_INLINE ?? '[shown inline — ') && !hist[1].content.includes('{"type"'), hist[1].content);
  ok('  …and the engine reads the worked example from it', R.usedBefore(hist).has('worked'), J([...R.usedBefore(hist)]));
  const diagram = I.contentForHistory('A cycle.\n\n```ui\n{"type":"diagram","view":"cycle","title":"Water","nodes":[{"id":"a","label":"Evaporation"},{"id":"b","label":"Rain"},{"id":"c","label":"Runoff"}],"edges":[["a","b"],["b","c"],["c","a"]]}\n```');
  ok('  …a picture too', R.usedBefore([{ role: 'assistant', content: diagram }]).has('visual'), diagram);
  ok('  the marker is one constant, shared by the writer and the reader', /SHOWN_INLINE/.test(read('lib/inline-ui.ts')) && /import \{ SHOWN_INLINE/.test(read('lib/runtime/explain.ts')));
}

console.log('\n=== continuity: the ledger, the thread ===');
{
  let L = R.noteTopic([], "don't", {}, NOW);
  ok('a junk topic is never noted', L.length === 0, J(L));
  L = R.noteTopic([], 'photosynthesis', {}, NOW - 10 * DAY);
  L = R.noteTopic(L, 'photosynthesis', {}, NOW - 2 * DAY);
  ok('a mention counts, but never resets the review clock', L[0].seen === 2 && L[0].last === NOW - 10 * DAY && L[0].met === NOW - 2 * DAY, J(L[0]));
  const right3 = R.noteTopic(L, 'photosynthesis', { right: 1, tries: 3 }, NOW);
  ok('a right answer after three tries is practice, not a step up a box', right3[0].box === 0 && right3[0].last === NOW, J(right3[0]));
  const first = R.noteTopic(L, 'photosynthesis', { right: 1, tries: 1 }, NOW);
  ok('  a first-try right answer moves it up a box and its fade on', first[0].box === 1 && first[0].fade === 1, J(first[0]));
  const lost = R.noteTopic(L, 'photosynthesis', { failed: 'analogy' }, NOW);
  ok('a way in that left them lost is remembered with the concept', J(lost[0].failed) === J(['analogy']), J(lost[0]));
  const reviewed = R.noteTopic(L, 'photosynthesis', { reviewed: true }, NOW);
  ok('  brought back for review, it is marked practised — not asked again tomorrow', reviewed[0].last === NOW, J(reviewed[0]));
  const dirty = R.sanitizeLedger([{ topic: "don't", last: NOW, seen: 3 }, { topic: 'next one', last: NOW }, { topic: 'quadratic equations', last: NOW, failed: ['analogy', 'bogus'], fade: 9 }], NOW);
  ok('old ledgers lose their junk entries when read; new fields are clamped', dirty.length === 1 && dirty[0].topic === 'quadratic equations' && J(dirty[0].failed) === J(['analogy']) && dirty[0].fade === 3, J(dirty));
  ok('outcomes count tries ("not right (after 3 tries)")', R.outcomesOf([{ from: 'Check', said: 'answered 4 to “x?” — right (after 3 tries)' }]).tries === 3);
}
{
  ok('a thread note from a browser keeps only enum codes and a clean concept', J(R.sanitizeThreadNote({ s: ['analogy', 'hack'], n: 'reframe', q: 'recall', c: 'Photosynthesis!!', x: 1 })) === J({ s: ['analogy'], n: 'reframe', q: 'recall', c: 'photosynthesis' }));
  ok('  a note with no valid need is no note', R.sanitizeThreadNote({ s: ['analogy'], n: 'evil' }) === null);
  ok('the question a reply left is kept only if the reply asked it', R.replyAsks('Here it is. What do you get for x = 3?') && !R.replyAsks('Here it is.') && R.replyAsks('Try it.\n\n```ui\n{"type":"check","prompt":"x?","answer":"3"}\n```'));
  const hist = [{ role: 'user', content: 'what is a p-value?' }, { role: 'assistant', content: 'Picture a coin you think is fair. Flip it ten times and get nine heads: the p-value asks how often a fair coin would do something that lopsided.' }];
  const one = planTurn(R, { text: 'huh? still dont get it', history: hist, thread: [{ s: ['analogy'], n: 'explain', c: 'p-value' }] });
  ok('lost once: a different way in, never the analogy again', one.plan.need === 'reframe' && !one.plan.strategies.includes('analogy'), J(one.plan.strategies));
  const two = planTurn(R, { text: 'nope, still lost', history: [...hist, { role: 'user', content: 'huh?' }, { role: 'assistant', content: 'Take real numbers: 1,000 fair coins flipped ten times each; about 11 of them land nine or more heads.' }], thread: [{ s: ['analogy'], n: 'explain', c: 'p-value' }, { s: ['worked'], n: 'reframe', c: 'p-value' }] });
  ok('lost twice running: one question that finds where it breaks', two.plan.need === 'diagnose' && two.plan.question === 'diagnose' && /two named places/.test(two.block), J({ n: two.plan.need, b: two.block }));
  const answered = planTurn(R, { text: 'because the light reactions make the ATP that the cycle spends', history: [{ role: 'user', content: 'how does photosynthesis work?' }, { role: 'assistant', content: 'Light charges ATP; the Calvin cycle spends it to fix carbon. Why do you think the cycle stops in the dark?' }], thread: [{ s: ['causal', 'elaborate'], n: 'explain', q: 'why', c: 'photosynthesis' }] });
  ok('an answer to Socria\'s own question gets feedback on the answer first', answered.plan.need === 'feedback' && /They answered your question/.test(answered.block), J({ n: answered.plan.need, b: answered.block }));
  const waiting = planTurn(R, { text: 'how does the calvin cycle use ATP?', history: [{ role: 'user', content: 'how does photosynthesis work?' }, { role: 'assistant', content: 'Light charges ATP. What do you think happens to it next?' }], thread: [{ s: ['causal', 'elaborate'], n: 'explain', q: 'why', c: 'photosynthesis' }] });
  ok('never a second closing question while the last one waits unanswered', !waiting.plan.question || waiting.plan.question === 'diagnose', J(waiting.plan));
}

console.log('\n=== the route, the client ===');
{
  const route = read('app/api/logos/chat/route.ts');
  ok('one gate for what is kept about how they learn: read, sent back, noted', /const comprehensionAllowed =/.test(route) && /comprehensionAllowed \? sanitizeLedger\(body\?\.learning/.test(route) && /comprehensionAllowed && explain\?\.learning/.test(route));
  ok('  closed on shared, guest, collaborative, two-person, sensitive, off-the-record and incognito turns', ['sharedCtx.shared', 'sharedCtx.guest', 'body?.collab', 'twoPeople', 'turnState.sensitive', 'signals.offRecord', 'incognito'].every((k) => route.slice(route.indexOf('const comprehensionAllowed'), route.indexOf('const comprehensionAllowed') + 600).includes(k)));
  ok('the thread notes are read back sanitised, and only when the last reply has one', /sanitizeThreadNote\(m\.explain\)/.test(route) && /notes\[notes\.length - 1\] \?/.test(route));
  ok('the guidance is rendered against the presentation, in this turn\'s context only', /renderTurnGuidance\(explain, presentation/.test(route) && !/const stable =[\s\S]{0,2500}renderTurnGuidance/.test(route));
  ok('a content-free trace line per explained turn (codes and cue counts, never words)', /console\.info\('\[explain\] %s cues=%s\/%d'/.test(route));
  ok('the held retry keeps the conversation\'s prompt cache', /messages: turnMessages\(note\),[\s\S]{0,300}prompt_cache_key: promptCacheKey/.test(route));
}

console.log(`\nexplain-audit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
