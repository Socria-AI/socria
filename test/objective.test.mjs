// ONE CHAT, ONE OBJECTIVE (Logos 6, November 2026; docs/OBJECTIVES.md).
//
// What is held down, against the acceptance criteria:
//   1. a new chat establishes its objective from its first message — no form, nothing asked first;
//   2. the objective is kept: on the chat's map (saved and restored as the map is), through every map pass, and told
//      to Core with each turn;
//   3. Core gets the earlier turns that bear on the message, beyond the recent ones it reads in full;
//   4. what the chat holds — canvas, sources, artifacts, quizzes — is read from that chat and no other;
//   5. several subjects serve one objective without being called separate;
//   6. the person can change the objective (in place, or in words), and their words win from then on;
//   7. a different objective is offered a separate chat — only offered, never split;
//   8. chats from before objectives read theirs from how they began, without anything being changed or made up;
//   9. no onboarding: an empty chat says how it works and asks nothing;
//  10. it survives a refresh: a saved map comes back with its objective, cleaned.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import * as O from './.tmp/objective-under-test.mjs';

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = '') => (cond ? (pass++, console.log('  ok   ' + name)) : (fail++, console.log('  FAIL ' + name + (extra ? '  ' + String(extra).slice(0, 400) : ''))));
const J = JSON.stringify;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NOW = 1_763_700_000_000;

console.log('\n=== 1. a new chat establishes its objective ===');
{
  const cases = [
    ['I want to master Calculus I before my final in December', 'Master Calculus I', 'learn'],
    ['Help me prepare for the board presentation on Thursday', 'Prepare for the board presentation', 'prepare'],
    ['My goal is to ship the SocriaUX beta this month', 'Ship the SocriaUX beta', 'build'],
    ['Build a landing page for my bakery', 'Build a landing page for my bakery', 'build'],
    ["I'm trying to decide between two job offers", 'Decide between two job offers', 'decide'],
    ['Can you help me research robotics for a school project?', 'Research robotics for a school project', 'research'],
  ];
  for (const [text, goal, kind] of cases) {
    const o = O.inferObjective(text, NOW);
    ok(`“${text}” → ${goal} (${kind})`, o?.goal === goal && o?.kind === kind && o.source === 'inferred' && o.set === NOW, J(o));
  }
  const q = O.inferObjective('Why is the production possibility frontier bowed out?', NOW);
  ok('a question without a stated goal: what it is about, as understanding — never more than the words say', q?.kind === 'understand' && /production possibility frontier/i.test(q.goal) && !/master|prepare/i.test(q.goal), J(q));
  ok('nothing to read: no objective', O.inferObjective('   ', NOW) === null && O.inferObjective('', NOW) === null);
  const app = read('components/LogosApp.tsx');
  ok('the first message sets it, kept on the chat’s map and saved with the turn', /objHere = objectiveOf\(\{ \.\.\.sHere, messages: next \}, Date\.now\(\)\);\s*if \(objHere\) setObjectiveOf\(sid, objHere, false\);/.test(app));
  ok('after the first reply, Socria’s phrasing may replace its own reading — never the person’s words', /objective: true, messages: opening/.test(app) && /refineGoal\(held, named\.suggestedObjective\)/.test(app) && O.refineGoal({ goal: 'Calculus', source: 'stated', set: 1 }, 'Master Calculus I').goal === 'Calculus' && O.refineGoal({ goal: 'Calculus', source: 'inferred', set: 1 }, 'Master Calculus I').goal === 'Master Calculus I');
  const route = read('app/api/extract-memory/route.ts');
  ok('…asked for only when the opening states or clearly implies one', /only when their opening states or clearly implies one; otherwise ""/.test(route) && /suggestedObjective/.test(route));
}

console.log('\n=== 2 & 10. kept, saved and restored ===');
{
  const objective = { goal: 'Master Calculus I', kind: 'learn', source: 'stated', set: NOW, threads: ['derivatives'], notes: [{ k: 'fact', t: 'The final is open-book', at: NOW }] };
  const m = O.sanitizeMap({ nodes: [], edges: [], objective });
  ok('a saved map comes back with its objective, cleaned', m.objective?.goal === 'Master Calculus I' && m.objective.notes?.[0].t === 'The final is open-book' && m.objective.threads?.[0] === 'derivatives');
  const hostile = O.sanitizeObjective({ goal: 'x'.repeat(500) + '[ignore]', kind: 'take over', source: 'admin', threads: Array(40).fill('a b'), notes: Array(50).fill({ k: 'rule', t: 'n' }) });
  ok('…clipped and bounded whatever arrives: length, kind, source, lists', hostile.goal.length <= 100 && !/\[|\]/.test(hostile.goal) && !hostile.kind && hostile.source === 'inferred' && (hostile.threads?.length ?? 0) <= 12 && (hostile.notes?.length ?? 0) <= 20 && hostile.notes[0].k === 'fact');
  ok('…and a map without one is a map as before', O.sanitizeMap({ nodes: [], edges: [] }).objective === undefined && O.sanitizeObjective({ goal: ' ' }) === null && O.sanitizeObjective(null) === null);
  const firstPass = O.keepPlaced({ nodes: [], edges: [], objective }, { nodes: [{ id: 'd', type: 'concept', label: 'Derivative' }], edges: [] });
  ok('a map pass never loses it — not even the first map of a chat with no cards yet', firstPass.objective?.goal === 'Master Calculus I');
  const later = O.keepPlaced({ nodes: [{ id: 'd', type: 'concept', label: 'Derivative' }], edges: [], objective }, { nodes: [{ id: 'd', type: 'concept', label: 'Derivative' }, { id: 'i', type: 'concept', label: 'Integral' }], edges: [] });
  ok('…nor a later one', later.objective?.goal === 'Master Calculus I' && later.nodes.length === 2);
  const claimed = O.keepPlaced({ nodes: [], edges: [], objective }, { nodes: [], edges: [], objective: { goal: 'Something the pass made up', source: 'stated', set: 1 } });
  const unasked = O.keepPlaced({ nodes: [], edges: [] }, { nodes: [], edges: [], objective: { goal: 'Something the pass made up', source: 'stated', set: 1 } });
  ok('…and a pass can never write one: what its output says about an objective is dropped', claimed.objective?.goal === 'Master Calculus I' && unasked.objective === undefined);
  const turn = O.sanitizeObjectiveTurn({ objective, work: { decisions: ['Use the textbook’s notation'], questions: ['When to use substitution?'], sources: ['lecture-3.pdf'], artifacts: ['Function: f'], quizzes: [{ title: 'Derivatives', right: 7, total: 10, missed: ['chain rule'], finished: true }], threads: ['derivatives', 'integrals'], ideas: 9, turns: 14 } });
  const block = O.objectiveBlock(turn);
  ok('Core is told it with each turn: the goal, what the chat holds, what to keep in mind', /THIS CONVERSATION'S OBJECTIVE[^\n]*“Master Calculus I”/.test(block) && /quiz “Derivatives”: 7\/10, missed on chain rule/.test(block) && /their sources — lecture-3\.pdf/.test(block) && /keep in mind: “The final is open-book”/.test(block));
  ok('…to connect earlier work, never ask again for what is stated, and never police the topic', /never ask again for anything stated here/.test(block) && /Several subjects can serve one objective/.test(block) && /Do not steer them back to it, police the topic, or refuse/.test(block));
  const r = read('app/api/logos/chat/route.ts');
  ok('…re-sanitised on the server and read as context, beside the memory', /const objectiveTurn = sanitizeObjectiveTurn\(body\?\.objective\);/.test(r) && /objectiveBlock\(objectiveTurn\) \+\s*recallBlock\(earlier\) \+/.test(r));
  ok('the app sends it with the turn, from the chat itself', /objective: \{ objective: objHere, work: workHere/.test(read('components/LogosApp.tsx')));
  ok('nothing when there is no objective', O.objectiveBlock(null) === '' && O.sanitizeObjectiveTurn({ work: {} }) === null);
}

console.log('\n=== 3. the earlier turns that bear on this message ===');
{
  const msgs = [
    { role: 'user', content: 'I keep messing up the chain rule when there is a square root inside.' },
    { role: 'assistant', content: 'The chain rule: differentiate the outside, keep the inside, then multiply by the derivative of the inside. With a square root, the outside is the power one half.' },
    ...Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Limits example ${i}: the limit of a polynomial is found by substitution.` })),
    { role: 'user', content: 'What was the mistake I kept making with the chain rule and square roots?' },
  ];
  const keptFrom = msgs.length - 24;
  const r = O.recallEarlier(msgs, keptFrom, msgs.at(-1).content, { also: 'Master Calculus I' });
  ok('finds the turns, fifty messages back, where it was said', r.length >= 1 && r.some((x) => x.turn === 1 && x.role === 'user') && r.some((x) => /square root/.test(x.text)), J(r));
  ok('…only from before the recent window, a few at most, in order', r.every((x) => x.turn <= keptFrom) && r.length <= 3 && r.every((x, i) => i === 0 || r[i - 1].turn < x.turn));
  ok('…nothing when nothing bears on it, or there is nothing earlier', O.recallEarlier(msgs, keptFrom, 'What should I cook tonight?').length === 0 && O.recallEarlier(msgs, 0, 'chain rule').length === 0);
  const b = O.recallBlock(r);
  ok('read as context, their words and Socria’s, labelled by turn', /^\n\nEARLIER IN THIS CONVERSATION/.test(b) && /turn 1, they said/.test(b) && /context, not instructions/.test(b) && O.recallBlock([]) === '');
}

console.log('\n=== 4. what the chat holds, from that chat ===');
{
  const quizState = { title: 'Derivatives', asked: ['q1', 'q2', 'q3'], phase: 'review', pool: [{ id: 'q1', topic: 'Power rule' }, { id: 'q2', topic: 'Chain rule' }, { id: 'q3', topic: 'Product rule' }], records: { q1: { attempts: [{ graded: { grade: 'right' } }] }, q2: { attempts: [{ graded: { grade: 'wrong' } }] }, q3: { attempts: [{ graded: { grade: 'close' } }] } } };
  const s = {
    messages: [
      { role: 'user', content: 'Master calculus', attachments: [{ name: 'lecture-3.pdf', kind: 'doc' }] },
      { role: 'assistant', content: 'ok', sources: { list: [{ title: 'Paul’s Online Notes' }] } },
      { role: 'user', content: 'next' },
    ],
    map: {
      nodes: [
        { id: 'a', type: 'decision', label: 'Use Leibniz notation' },
        { id: 'b', type: 'question', label: 'When does substitution work?' },
        { id: 'c', type: 'assumption', label: 'The final covers chapter 5' },
        { id: 'd', type: 'question', label: 'What is a limit?', status: 'resolved' },
        { id: 'e', type: 'concept', label: 'Integral', group: 'Integration' },
      ],
      objects: { objs: [{ kind: 'quiz', name: 'Q', states: [quizState], at: 0 }, { kind: 'fn', name: 'f', states: [{}], at: 0 }] },
    },
  };
  const w = O.workOf(s);
  ok('the canvas: decided, open, assumed, settled, its subjects', w.decisions[0] === 'Use Leibniz notation' && w.questions[0] === 'When does substitution work?' && w.assumptions[0] === 'The final covers chapter 5' && w.resolved[0] === 'What is a limit?' && w.threads.includes('Integration'), J(w));
  ok('the sources brought in, and the pages read', w.sources.includes('lecture-3.pdf') && w.sources.includes('Paul’s Online Notes'));
  ok('what was made, and a quiz’s standing with what was missed', w.artifacts[0] === 'Function: f' && w.quizzes[0].right === 2 && w.quizzes[0].total === 3 && J(w.quizzes[0].missed) === J(['Chain rule']) && w.quizzes[0].finished);
  ok('in counts, for the line over the chatbox', O.workCounts(w) === '5 ideas · 1 decision · 1 open question · 2 sources · 1 artifact · 1 quiz', O.workCounts(w));
  ok('another chat holds its own', O.workOf({ messages: [], map: { nodes: [] } }).ideas === 0 && O.workCounts(O.workOf({ messages: [] })) === '');
}

console.log('\n=== 5 & 7. one objective, many subjects; a different objective offered a chat ===');
{
  const o = { goal: 'Master Calculus I', kind: 'learn', source: 'stated', set: NOW };
  const work = { ...O.workOf({ messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'user', content: 'c' }], map: { nodes: [{ id: 'd', type: 'concept', label: 'Derivative' }] } }) };
  const recent = 'We worked through derivatives and the chain rule.';
  for (const t of ['Can you explain integrals now?', 'I want to learn integrals next', 'Quiz me on the product rule', 'Here are my lecture slides on limits', 'Why did I get question 4 wrong?'])
    ok(`part of the objective: “${t}”`, O.driftOf(t, o, work, NOW, recent) === null, O.driftOf(t, o, work, NOW, recent));
  const away = O.driftOf('Unrelated, but help me plan a weekend trip to Lisbon', o, work, NOW, recent);
  ok('a different objective, said so: offered, named for what it reads as', !!away && /trip to Lisbon/i.test(away), away);
  const own = O.driftOf('I want to write a cover letter for a marketing job', o, work, NOW, recent);
  ok('…or a goal of its own sharing nothing with this one', !!own && /cover letter/i.test(own), own);
  ok('never before the chat has its objective and a little history', O.driftOf('Unrelated, but help me plan a trip to Lisbon', o, { ...work, turns: 1 }, NOW) === null && O.driftOf('Unrelated, plan a trip', null, work, NOW) === null);
  const kept = O.keepThread(o, 'Plan a weekend trip to Lisbon');
  ok('“Keep it here”: kept as a subject of this objective, and not offered again', O.keptHere('More about the weekend trip to Lisbon', kept) && kept.threads[0] === 'plan a weekend trip to lisbon');
  const app = read('components/LogosApp.tsx');
  ok('the offer is the existing one, beside the answer: keep it here, or start a new chat — the person decides', /That sounds like a separate objective — “\{drift\.goal\}”/.test(app) && /onClick=\{drift\.goal \? keepDriftHere : dismissDrift\}/.test(app) && /\{drift\.goal \? 'Start a new chat for it' : 'Move to a new chat'\}/.test(app));
  ok('…the message answered here either way, and Core told not to tie it to the objective', /answered here either way/.test(app) && /Answer it fully on its own terms — do not tie it to the objective above/.test(O.objectiveBlock({ objective: o, work, drift: 'Plan a trip' })));
  ok('…and the misfiled-message reader still works beside it', O.readDrift({ message: 'my manager keeps hinting at a promotion and I might quit anyway', title: 'Solve for slope of tangent line — Master Calculus I', recent: ['I need the slope of the tangent line to x^2 at x=3', 'Start with the secant through two nearby points and take the limit.', 'so the derivative is the limit of the difference quotient', 'Right — that is the definition. What does it give you at x=3?', 'six', 'Good. Now what does that number mean geometrically?'] }).flag === true);
}

console.log('\n=== 6. the person changes it ===');
{
  ok('in words: “change the objective to …”, “our goal is now to …”', O.readRestate('Change the objective to passing the final') === 'passing the final' && O.readRestate('Our goal is now to ship v2') === 'ship v2' && O.readRestate('New objective: Learn Rust') === 'Learn Rust' && O.readRestate('What is the objective of a derivative?') === null);
  const o = O.restate({ goal: 'Calculus', source: 'inferred', set: 5, threads: ['limits'] }, 'pass the final', NOW, 'an A in December');
  ok('…theirs from then on, keeping what the chat already holds', o.goal === 'Pass the final' && o.source === 'stated' && o.edited === NOW && o.set === 5 && o.outcome === 'an A in December' && o.threads[0] === 'limits');
  ok('“keep in mind that …”: kept with the objective — one sentence only, and never “remember” (that is Socria’s memory of them)', O.readKeepInMind('Keep in mind that the exam is open-book') === 'the exam is open-book' && O.readKeepInMind('Keep in mind the exam is open-book. Now explain limits') === null && O.readKeepInMind('Remember that I prefer short answers') === null);
  const noted = O.addNote({ goal: 'G', source: 'stated', set: 1 }, 'fact', 'the exam is open-book', NOW);
  ok('…as a note, once', noted.notes.length === 1 && O.addNote(noted, 'fact', 'The exam is open-book', NOW).notes.length === 1);
  const app = read('components/LogosApp.tsx');
  ok('done here, said back, nothing sent to a model', /const restated = readRestate\(text\);/.test(app) && /This chat’s objective is now “\$\{next\.goal\}”/.test(app) && /Kept with this chat’s objective/.test(app));
  ok('the title is still theirs to rename, as before', /function renameSession\(id: string, title: string\)/.test(app) && /onRename=\{renameSession\}/.test(app));
}

console.log('\n=== 8. chats from before objectives ===');
{
  const legacy = { title: 'Biology – Exam Review', messages: [{ role: 'user', content: 'Help me study for this big bio test tomorrow night please' }, { role: 'assistant', content: 'Sure.' }], map: { nodes: [], edges: [] } };
  const o = O.objectiveOf(legacy, NOW);
  ok('read from how it began — nothing stored, nothing changed', o?.goal === 'Study for this big bio test' && o.source === 'inferred' && legacy.map.objective === undefined, J(o));
  ok('…or, with no words to read, its own name', O.objectiveOf({ title: 'Robotics notes', messages: [], map: null }, NOW)?.source === 'title');
  ok('…and nothing at all for an empty, untitled chat: nothing made up', O.objectiveOf({ title: 'New line of thinking', messages: [] }, NOW) === null && O.objectiveOf(O.emptySession(), NOW) === null);
  ok('a held objective is always the one used', O.objectiveOf({ ...legacy, map: { objective: { goal: 'Pass Bio 101', source: 'stated', set: 1 } } }, NOW).goal === 'Pass Bio 101');
  ok('titles are named as before', O.titleFor([{ role: 'user', content: 'Help me study for this big bio test tomorrow night please' }]) === 'Biology – Exam Review');
}

console.log('\n=== 9. no onboarding; the line over the chatbox ===');
{
  const quiet = (f) => {
    const e = console.error;
    console.error = () => {};
    try {
      return f();
    } finally {
      console.error = e;
    }
  };
  const empty = quiet(() => renderToStaticMarkup(h(O.ObjectiveLine, { objective: null, work: null, empty: true, onSet: () => {} })));
  ok('an empty chat says how it works and asks nothing — no field, no form', /One chat, one objective/.test(empty) && !/<input|<form/.test(empty) && /role="note"/.test(empty));
  ok('nothing at all once there is a conversation but no objective to show', quiet(() => renderToStaticMarkup(h(O.ObjectiveLine, { objective: null, work: null, empty: false, onSet: () => {} }))) === '');
  const w = O.workOf({ messages: [{ role: 'user', content: 'x', attachments: [{ name: 'a.pdf' }] }], map: { nodes: [{ id: 'q', type: 'question', label: 'Why?' }] } });
  const line = quiet(() => renderToStaticMarkup(h(O.ObjectiveLine, { objective: { goal: 'Master Calculus I', source: 'inferred', kind: 'learn', set: 1 }, work: w, empty: false, onSet: () => {} })));
  ok('the objective, where it came from, and what the chat holds, in one line', /Objective/.test(line) && /Master Calculus I/.test(line) && /read from how this chat began/.test(line) && /What this chat holds/.test(line) && /1 idea · 1 open question · 1 source/.test(line));
  ok('…the goal a button to change it', /aria-label="Objective: Master Calculus I\. Press to change it\."/.test(line));
  const ro = quiet(() => renderToStaticMarkup(h(O.ObjectiveLine, { objective: { goal: 'G', source: 'stated', set: 1 }, work: w, empty: false, readOnly: true, onSet: () => {} })));
  ok('…read-only in a chat they can only read', !/Press to change it/.test(ro));
  ok('over the chatbox, in every view; its panel opens the Mind Map, Files and Artifacts', /<ObjectiveLine/.test(read('components/LogosApp.tsx')) && /onOpen=\{\(v\) => openFull\(v\)\}/.test(read('components/LogosApp.tsx')) && /go\('logic_map'\)/.test(read('components/logos6/ObjectiveLine.tsx')) && /go\('content'\)/.test(read('components/logos6/ObjectiveLine.tsx')) && /go\('artifacts'\)/.test(read('components/logos6/ObjectiveLine.tsx')));
  ok('the conversation list says what each chat is for', /objective: \$\{aim\}/.test(read('components/LogosRail.tsx')));
}

console.log(`\nobjective: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
