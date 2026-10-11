// THE HUMAN-FIRST EXPERIENCES — Crossroads, Untangle, the Rehearsal Room, Common Ground, the Time Machine.
//
// What is held down here, for each: it starts from the person's own words
// (nothing about anyone is drafted); its state is canonical and survives a
// save; every edit is an operation, computed and undoable; what is the
// person's stays the person's — Socria cannot decide, weigh, rate, commit,
// write their lines, speak for a participant, agree on anyone's behalf or
// write their reasons; and what is computed (scores, standings, counts,
// timelines) comes only from what is recorded.

import { apply, create, currentOf, forgetBefore, readOperation, sanitizeSpace, seek, kindOf, EMPTY_SPACE, readDisplayRequest, makeFromRequest, timelineOf, compareStates } from './.tmp/index.mjs';
import { crossroadsFromWords, sealCrossroads, standings, tradeoffs, missing, readCrossroadsOp, CROSSROADS_META } from './.tmp/display-crossroads.mjs';
import { untangleFromWords, separate, readCategory, unsorted, nextSteps, quadrants } from './.tmp/display-untangle.mjs';
import { rehearsalFromWords, lineOf, feedback, whoseTurn } from './.tmp/display-rehearsal.mjs';
import { groundFromWords, standing, sharedGround, waitingOn } from './.tmp/display-commonground.mjs';
import { timeMachineFromWords } from './.tmp/display-timemachine.mjs';
import { dumpFrom } from './.tmp/display-make.mjs';
import { recordChange, ideasAt, compareMap, forgetMapBefore, sanitizeHistory } from './.tmp/map-history.mjs';
import { cleanBasis } from './.tmp/reasoning.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const J = JSON.stringify;
const roundTrip = (space) => sanitizeSpace(JSON.parse(J(space)));
const P = (space, id, op, args, at) => apply(space, id, op, args, { by: 'person', ...(at ? { at } : {}) });
const S = (space, id, op, args, at) => apply(space, id, op, args, { by: 'socria', ...(at ? { at } : {}) });

// ── provenance ───────────────────────────────────────────────────────
ok('the person’s words are stated', cleanBasis(undefined, 'person') === 'stated');
ok('Socria cannot mark its words as the person’s', cleanBasis('stated', 'socria') === 'suggested');
ok('Socria cannot mark its words as evidence', cleanBasis('evidence', 'socria') === 'suggested');
ok('a simulated line stays simulated', cleanBasis('simulated', 'socria') === 'simulated');

// ── CROSSROADS ───────────────────────────────────────────────────────
{
  const cr = crossroadsFromWords('Should I take the job in Austin or stay in Dallas? I care about salary and being near family.');
  ok('options from their words', J(cr?.alternatives.map((a) => a.name)) === J(['Take the job in Austin', 'Stay in Dallas']), J(cr?.alternatives));
  ok('options are theirs', cr.alternatives.every((a) => a.by === 'person'));
  ok('the decision is in their words', cr.decisionBy === 'person' && /Austin/.test(cr.decision));
  ok('what they said matters is read', J(cr.priorities.map((p) => p.name)) === J(['Salary', 'Being near family']), J(cr.priorities));
  ok('nothing is weighed for them', cr.priorities.every((p) => !p.weighed));
  const three = crossroadsFromWords('I’m torn between economics, computer science and math.');
  ok('three options from a list', three?.alternatives.length === 3, J(three?.alternatives));
  const yn = crossroadsFromWords('Should I quit or not?');
  ok('"or not" is two options', J(yn?.alternatives.map((a) => a.name)) === J(['Quit', 'Not quit']), J(yn?.alternatives));
  ok('no options, nothing made from words', crossroadsFromWords('help me decide what to do about work') === null);

  // into the workspace
  let sp = create(EMPTY_SPACE, 'crossroads', cr, { name: 'CR1', origin: 'person' }).space;
  const id = sp.objs[0].id;
  const [pSalary, pFamily] = cr.priorities.map((p) => p.id);
  const [aAustin, aDallas] = cr.alternatives.map((a) => a.id);
  ok('Socria cannot rate for them', !S(sp, id, 'rate', { alt: aAustin, pri: pSalary, value: 8 }).ok);
  ok('Socria cannot weigh for them', !S(sp, id, 'weight', { id: pSalary, weight: 9 }).ok);
  ok('Socria cannot add a priority with a weight', !S(sp, id, 'addPri', { name: 'Commute', weight: 7, by: 'socria' }).ok);
  ok('Socria can add a priority unweighed', S(sp, id, 'addPri', { name: 'Commute', by: 'socria' }).ok);
  ok('Socria cannot decide', /never makes it/.test(S(sp, id, 'decide', { alt: aAustin }).why ?? ''));
  for (const [op, args] of [
    ['weight', { id: pSalary, weight: 8 }],
    ['weight', { id: pFamily, weight: 6 }],
    ['rate', { alt: aAustin, pri: pSalary, value: 9 }],
    ['rate', { alt: aDallas, pri: pSalary, value: 5 }],
    ['rate', { alt: aAustin, pri: pFamily, value: 2 }],
    ['rate', { alt: aDallas, pri: pFamily, value: 9 }],
  ]) {
    const r = P(sp, id, op, args);
    ok(`person ${op}`, r.ok, r.why);
    if (r.ok) sp = r.space;
  }
  let st = currentOf(sp.objs[0]);
  ok('weighing marks it weighed', st.priorities.find((p) => p.id === pSalary).weighed === true);
  const s1 = standings(st);
  // Austin: (8×9 + 6×2) / 14 = 6; Dallas: (8×5 + 6×9) / 14 = 6.71
  const t = Object.fromEntries(s1.rows.map((r) => [r.alt, r.total]));
  ok('weighted score is arithmetic on their inputs', Math.abs(t[aAustin] - 6) < 0.01 && Math.abs(t[aDallas] - 94 / 14) < 0.01, J(t));
  const tr = tradeoffs(st, aAustin, aDallas);
  // family: weight 6 × a 7-point gap = 42; salary: 8 × 4 = 32
  ok('trade-offs come from their ratings, weightiest first', tr.length === 2 && tr[0].pri === pFamily && tr[0].better === aDallas && tr[1].better === aAustin, J(tr));
  const step = P(sp, id, 'weight', { id: pFamily, weight: 1 });
  ok('a re-weighing that turns the order says so, and says it is not a verdict', step.ok && /not a verdict/.test(step.step.note ?? ''), step.step?.note);
  sp = step.space;
  const m = missing(currentOf(sp.objs[0]));
  ok('what is still unknown is counted', m.unrated === 0 && m.open === 0, J(m));
  const dec = P(sp, id, 'decide', { alt: aDallas, why: 'family matters more than I admit' });
  ok('the person decides, with their reason', dec.ok && currentOf(dec.space.objs[0]).decided.why.startsWith('family'));
  ok('a decided option cannot be removed before reopening', !P(dec.space, id, 'removeAlt', { id: aDallas }).ok);
  ok('Socria cannot reopen their decision', !S(dec.space, id, 'undecide', {}).ok);
  const back = roundTrip(dec.space);
  ok('it survives a save with its whole history', back && back.objs[0].steps.length === dec.space.objs[0].steps.length && J(currentOf(back.objs[0])) === J(currentOf(dec.space.objs[0])));
  ok('undo looks back without losing anything', currentOf(seek(dec.space, id, 0).objs[0]).ratings.length === 0 && seek(dec.space, id, 0).objs[0].states.length === dec.space.objs[0].states.length);
  const word = readCrossroadsOp('rate stay in dallas 7 on salary', currentOf(sp.objs[0]));
  ok('a rating in words', word?.op === 'rate' && word.args.alt === aDallas && word.args.value === 7, J(word));
  const via = readOperation(sp, 'I’ve decided on Stay in Dallas because of family');
  ok('a decision in words is the person’s operation', via?.op === 'decide' && via.args.alt === aDallas, J(via));

  // a draft is held to what is theirs
  const sealed = sealCrossroads(
    { ...cr, ratings: [{ alt: aAustin, pri: pSalary, value: 10 }], priorities: cr.priorities.map((p) => ({ ...p, weight: 9, weighed: true })), decided: { alt: aAustin }, alternatives: [...cr.alternatives, { id: 'a9', name: 'Move to Paris', by: 'socria' }] },
    'Should I take the job in Austin or stay in Dallas?'
  );
  ok('a draft carries no ratings, weights or decision', !sealed.state.ratings.length && !sealed.state.decided && sealed.state.priorities.every((p) => p.weight === 5 && !p.weighed));
  ok('an option not in their words is Socria’s', sealed.state.alternatives.find((a) => a.name === 'Move to Paris')?.by === 'socria' && sealed.state.alternatives.find((a) => a.name === 'Stay in Dallas')?.by === 'person');
  ok('the catalogue has a spec and an example the sanitizer keeps', !!CROSSROADS_META.spec && kindOf('crossroads').sanitize(CROSSROADS_META.example) !== null);
}

// ── asking for an experience ─────────────────────────────────────────
{
  const r = readDisplayRequest('Should I take the job in Austin or stay in Dallas?');
  ok('"should I … or …" asks for a Crossroads', r?.kind === 'crossroads' && r.intent === true, J(r));
  ok('a question about displays is not a decision', readDisplayRequest('should I use a venn diagram or a table?')?.kind !== 'crossroads');
  ok('a question about making a display is still not a request', readDisplayRequest('how do I make a gantt chart in Excel?') === null);
  ok('rehearse → the Rehearsal Room', readDisplayRequest('Can you help me rehearse asking my manager for a raise?')?.kind === 'rehearsal');
  ok('untangle → Untangle', readDisplayRequest('untangle this: rent, essay, car')?.kind === 'untangle');
  ok('we disagree → Common Ground', readDisplayRequest('My partner and I can’t agree on where to live')?.kind === 'commonground');
  ok('how has my thinking changed → the Time Machine', readDisplayRequest('How has my thinking on this changed?')?.kind === 'timemachine');
  ok('"do not" is respected', readDisplayRequest('please don’t open a crossroads, just talk') === null);

  // the same decision again is opened, not made twice
  const cr = crossroadsFromWords('Should I take the job in Austin or stay in Dallas?');
  const sp = create(EMPTY_SPACE, 'crossroads', cr, { name: 'CR1', origin: 'person' }).space;
  const again = makeFromRequest(readDisplayRequest('Should I take the job in Austin or stay in Dallas'), { said: '', map: null, space: sp, latest: 'Should I take the job in Austin or stay in Dallas' });
  ok('an existing decision is opened', again && 'open' in again && again.open === sp.objs[0].id, J(again));
}

// ── UNTANGLE ─────────────────────────────────────────────────────────
{
  const dump = "I need to finish the essay, my car is making a noise, mom's birthday is Friday, not sure if I should drop chem, rent is due";
  const u = untangleFromWords(dump);
  ok('the dump is kept exactly', u.dump === dump);
  ok('a run-on list is separated into thoughts', u.thoughts.length === 5, J(u.thoughts.map((t) => t.text)));
  ok('each thought is in their words, with where it came from', u.thoughts.every((t) => t.by === 'person' && t.span && dump.slice(t.span[0], t.span[1]).toLowerCase().includes(t.text.slice(1, 8).toLowerCase())), J(u.thoughts));
  ok('each kind is Socria’s reading until they set it', u.thoughts.every((t) => t.catBy === 'socria'));
  ok('readings', J(u.thoughts.map((t) => t.cat)) === J(['task', 'problem', 'note', 'uncertainty', 'task']), J(u.thoughts.map((t) => t.cat)));
  ok('nothing is read as a commitment', readCategory('I promised Sam I would send it') !== 'commitment');
  ok('a question reads as one', readCategory('Should I call the landlord?') === 'question');
  ok('a short list stays one thought', separate('buy eggs, milk, bread').length === 1);

  let sp = create(EMPTY_SPACE, 'untangle', u, { name: 'UT1', origin: 'person' }).space;
  const id = sp.objs[0].id;
  const [essay, car, , chem, rent] = u.thoughts.map((t) => t.id);
  ok('Socria cannot make a commitment', !S(sp, id, 'cat', { id: essay, cat: 'commitment', by: 'socria' }).ok);
  ok('Socria cannot mark something done', !S(sp, id, 'status', { id: essay, status: 'done' }).ok);
  ok('Socria cannot call something urgent', !S(sp, id, 'flag', { id: essay, urgent: 'yes' }).ok);
  ok('Socria cannot rewrite the dump', !S(sp, id, 'dump', { text: 'something else' }).ok);
  let r = P(sp, id, 'cat', { id: essay, cat: 'commitment', by: 'person' });
  ok('the person makes a commitment', r.ok);
  sp = r.space;
  ok('…and Socria cannot change their call', !S(sp, id, 'cat', { id: essay, cat: 'task', by: 'socria' }).ok);
  r = P(sp, id, 'tie', { from: rent, to: essay, kind: 'depends', by: 'person' });
  ok('a dependency they draw is confirmed', r.ok && r.space.objs[0].states.at(-1).ties[0].confirmed);
  sp = r.space;
  ok('a circle is refused', !P(sp, id, 'tie', { from: essay, to: rent, kind: 'depends', by: 'person' }).ok);
  r = S(sp, id, 'tie', { from: car, to: chem, kind: 'depends', by: 'socria' });
  ok('a connection Socria notices stays unconfirmed', r.ok && !r.space.objs[0].states.at(-1).ties[1].confirmed);
  sp = r.space;
  for (const t of [essay, rent, chem]) sp = P(sp, id, 'status', { id: t, status: 'next' }).space;
  let ns = nextSteps(currentOf(sp.objs[0]));
  const order = ns.map((n) => n.thought.id);
  ok('next steps go in an order their connections allow', order.indexOf(rent) < order.indexOf(essay) && ns.find((n) => n.thought.id === essay).blockedBy.length === 1, J(order));
  ok('an unconfirmed connection blocks nothing', ns.find((n) => n.thought.id === chem).blockedBy.length === 0);
  sp = P(sp, id, 'status', { id: rent, status: 'done' }).space;
  ns = nextSteps(currentOf(sp.objs[0]));
  ok('done unblocks', ns.find((n) => n.thought.id === essay).blockedBy.length === 0);
  sp = P(sp, id, 'flag', { id: essay, urgent: 'yes', important: 'yes' }).space;
  const q = quadrants(currentOf(sp.objs[0]));
  ok('the matrix places only what they placed', q.do.some((t) => t.id === essay) && q.unplaced.length >= 1);
  sp = P(sp, id, 'dump', { text: `${dump}\nAlso book the dentist` }).space;
  const left = unsorted(currentOf(sp.objs[0]));
  ok('what they add to the dump is shown as not sorted yet', left.length === 1 && /dentist/.test(left[0].text), J(left));
  r = P(sp, id, 'separate', {});
  ok('…and separating it adds only that', r.ok && currentOf(r.space.objs[0]).thoughts.length === 6);
  ok('removing a thought leaves the dump', /dentist/.test(currentOf(P(r.space, id, 'remove', { id: currentOf(r.space.objs[0]).thoughts[5].id }).space.objs[0]).dump));
  const back = roundTrip(r.space);
  ok('it survives a save', back && J(currentOf(back.objs[0])) === J(currentOf(r.space.objs[0])));
  ok('dump after the request', dumpFrom('Untangle this: rent is due, the essay, my car', []) === 'rent is due, the essay, my car');
  ok('dump from the message before', dumpFrom('help me untangle that', ['I have so much going on: the move, the job, my sister’s wedding, money is tight and I can’t sleep', 'help me untangle that']).startsWith('I have so much'));
  ok('no dump: an empty Untangle', dumpFrom('help me untangle my thoughts', ['help me untangle my thoughts']) === '');
  ok('a thought in words', readOperation(sp, 'park the essay')?.op === 'status');
}

// ── THE REHEARSAL ROOM ───────────────────────────────────────────────
{
  const rr = rehearsalFromWords('Rehearse asking my manager for a raise');
  ok('the goal is in their words', rr.goal === 'asking my manager for a raise' && rr.goalBy === 'person', J(rr.goal));
  ok('who it is with, as they named them', rr.counterpart.role === 'my manager' && rr.counterpartBy === 'person', J(rr.counterpart));
  ok('nothing is invented about them', rr.counterpart.about === '' && rr.counterpart.name === '');
  let sp = create(EMPTY_SPACE, 'rehearsal', rr, { name: 'RR1', origin: 'person' }).space;
  const id = sp.objs[0].id;
  ok('Socria cannot write the person’s lines', /yours to write/.test(S(sp, id, 'say', { who: 'you', text: 'Hi, can we talk?', by: 'socria' }).why ?? ''));
  ok('Socria cannot choose how hard they push back', !S(sp, id, 'setup', { difficulty: 'tough', by: 'socria' }).ok);
  ok('Socria cannot rewrite their goal', !S(sp, id, 'setup', { goal: 'something else', by: 'socria' }).ok);
  sp = P(sp, id, 'addObjective', { text: 'I took on the Henderson account', by: 'person' }).space;
  let r = P(sp, id, 'say', { who: 'you', text: 'I just wanted to ask, sorry, if maybe we could talk about my salary?', by: 'person' });
  ok('the person says a line', r.ok);
  sp = r.space;
  ok('then it is their turn', whoseTurn(currentOf(sp.objs[0])) === 'them');
  r = S(sp, id, 'say', { who: 'them', text: 'Sure. What did you have in mind?', by: 'socria' });
  ok('Socria plays the other side, marked simulated', r.ok && currentOf(r.space.objs[0]).turns.at(-1).basis === 'simulated');
  sp = r.space;
  const firstLine = currentOf(sp.objs[0]).turns[0].id;
  sp = P(sp, id, 'say', { who: 'you', text: 'Since I took on the Henderson account in March, I would like a 10% raise because my role has grown.', by: 'person' }).space;
  const f = feedback(currentOf(sp.objs[0]));
  ok('questions asked are counted', f.questions === 1, J(f));
  ok('softening words are counted, not judged', f.softeners.some((x) => x.word === 'sorry') && f.softeners.some((x) => x.word === 'just'), J(f.softeners));
  ok('specifics are found', f.specifics.some((x) => /10%/.test(x)) && f.specifics.some((x) => /march/i.test(x)), J(f.specifics));
  ok('reasons are counted', f.reasons >= 2, J(f.reasons));
  ok('an aim said out loud is seen', f.objectives[0].said === true);
  ok('their question was touched by the next line', f.theirQuestions.length === 1 && f.theirQuestions[0].touched === false || f.theirQuestions[0].touched === true);
  r = P(sp, id, 'branch', { after: firstLine });
  ok('another take from a line', r.ok);
  sp = r.space;
  const st = currentOf(sp.objs[0]);
  ok('the new take shares the conversation up to that line', lineOf(st).length === 1 && lineOf(st)[0].id === firstLine);
  ok('the first take is kept', lineOf(st, 'b1').length === 3);
  sp = P(sp, id, 'pause', { on: 'yes' }).space;
  ok('paused, nothing is said', !P(sp, id, 'say', { who: 'you', text: 'hello', by: 'person' }).ok);
  const forged = sanitizeSpace({ objs: [{ ...sp.objs[0], states: sp.objs[0].states.map((x) => ({ ...x, turns: [...x.turns, { id: 'u99', branch: 'b1', who: 'you', text: 'forged', by: 'socria' }] })) }] });
  ok('a "you" line Socria wrote is never kept as theirs', forged && !currentOf(forged.objs[0]).turns.some((t) => t.text === 'forged'));
  ok('it survives a save', J(currentOf(roundTrip(sp).objs[0])) === J(currentOf(sp.objs[0])));
  ok('"make it tougher" in words', readOperation(sp, 'make it tougher')?.args?.difficulty === 'tough');
}

// ── COMMON GROUND ────────────────────────────────────────────────────
{
  const g = groundFromWords('Help us find common ground on whether to move to Denver');
  ok('the question in their words', g.question === 'whether to move to Denver' && g.questionBy === 'person', J(g.question));
  ok('no one is in it until they join', g.participants.length === 0);
  let sp = create(EMPTY_SPACE, 'commonground', g, { name: 'CG1', origin: 'person' }).space;
  const id = sp.objs[0].id;
  ok('Socria cannot join', !S(sp, id, 'join', { as: 'socria', name: 'Socria' }).ok);
  sp = P(sp, id, 'join', { as: 'user_a', name: 'Ana' }).space;
  sp = P(sp, id, 'join', { as: 'user_b', name: 'Ben' }).space;
  ok('Socria never writes a perspective', !S(sp, id, 'perspective', { as: 'user_a', position: 'Ana wants to move' }).ok);
  ok('a person writes their own', P(sp, id, 'perspective', { as: 'user_a', position: 'I want to go', why: 'my career' }).ok);
  ok('someone not in the session cannot', !P(sp, id, 'perspective', { as: 'user_z', position: 'x' }).ok);
  let r = P(sp, id, 'add', { kind: 'goal', text: 'We both want to be near good schools', as: 'user_a', by: 'person' });
  sp = r.space;
  let it = currentOf(sp.objs[0]).items[0];
  ok('writing it is not agreement for anyone else', standing(currentOf(sp.objs[0]), it) === 'open' && waitingOn(currentOf(sp.objs[0]), it).map((p) => p.id).join() === 'user_b');
  sp = P(sp, id, 'mark', { id: it.id, as: 'user_b', ok: 'agree' }).space;
  it = currentOf(sp.objs[0]).items[0];
  ok('shared only when everyone agreed', standing(currentOf(sp.objs[0]), it) === 'shared' && sharedGround(currentOf(sp.objs[0])).length === 1);
  r = S(sp, id, 'add', { kind: 'experiment', text: 'Spend a week in Denver before deciding', by: 'socria' });
  ok('Socria suggests, agreed by no one', r.ok && currentOf(r.space.objs[0]).items[1].agreed.length === 0 && currentOf(r.space.objs[0]).items[1].by === 'socria');
  sp = r.space;
  ok('Socria cannot agree for anyone', !S(sp, id, 'mark', { id: it.id, as: 'user_a', ok: 'agree' }).ok);
  ok('one person cannot reword another’s', !P(sp, id, 'edit', { id: it.id, text: 'changed', as: 'user_b' }).ok);
  ok('words others agreed to are not reworded', !P(sp, id, 'edit', { id: it.id, text: 'changed', as: 'user_a' }).ok);
  ok('what others agreed to is not removed', !P(sp, id, 'remove', { id: it.id, as: 'user_a' }).ok);
  sp = P(sp, id, 'add', { kind: 'disagreement', text: 'How soon to move', as: 'user_b', by: 'person' }).space;
  const dis = currentOf(sp.objs[0]).items[2];
  sp = P(sp, id, 'resolve', { id: dis.id, as: 'user_b', ok: 'yes' }).space;
  ok('a disagreement one person calls resolved is not resolved', standing(currentOf(sp.objs[0]), currentOf(sp.objs[0]).items[2]) !== 'resolved');
  sp = P(sp, id, 'resolve', { id: dis.id, as: 'user_a', ok: 'yes' }).space;
  ok('…it is when everyone does', standing(currentOf(sp.objs[0]), currentOf(sp.objs[0]).items[2]) === 'resolved');
  r = P(sp, id, 'join', { as: 'user_c', name: 'Cal' });
  ok('a new person joining means nothing is agreed for them', r.ok && sharedGround(currentOf(r.space.objs[0])).length === 0);
  sp = P(sp, id, 'mark', { id: it.id, as: 'user_b', ok: 'dispute' }).space;
  ok('disputed is contested', standing(currentOf(sp.objs[0]), currentOf(sp.objs[0]).items[0]) === 'contested');
  ok('it survives a save', J(currentOf(roundTrip(sp).objs[0])) === J(currentOf(sp.objs[0])));
}

// ── MAP HISTORY ──────────────────────────────────────────────────────
{
  const a = [{ id: 'n1', label: 'Move to Denver' }];
  let h = recordChange(undefined, a, [...a, { id: 'n2', label: 'Schools' }], 1000, 'turn', 'what about schools?');
  ok('the record begins with what was there', h.base.length === 1 && h.since === 1000 && h.changes.length === 1 && h.changes[0].said === 'what about schools?');
  h = recordChange(h, [...a, { id: 'n2', label: 'Schools' }], [{ id: 'n1', label: 'Move to Denver next year' }, { id: 'n2', label: 'Schools' }], 2000, 'edit');
  ok('a rewording is recorded', h.changes[1].renamed[0].to === 'Move to Denver next year');
  ok('no change, no record', recordChange(h, ideasAt(h, 1), ideasAt(h, 1), 3000, 'turn') === h);
  ok('the map at a moment is rebuilt from the record', ideasAt(h, 0).find((n) => n.id === 'n1').label === 'Move to Denver' && ideasAt(h, 1).find((n) => n.id === 'n1').label === 'Move to Denver next year');
  const d = compareMap(h, -1, 1);
  ok('two moments compared', d.added.length === 1 && d.renamed.length === 1, J(d));
  const f = forgetMapBefore(h, 1);
  ok('forgetting folds into the base and is counted', f.trimmed === 1 && f.changes.length === 1 && f.base.some((n) => n.id === 'n2'));
  ok('the record runs forward in time only', sanitizeHistory({ since: 5, base: [], changes: [{ at: 10, added: [{ id: 'x', label: 'x' }] }, { at: 8, added: [{ id: 'y', label: 'y' }] }] }).changes.length === 1);
}

// ── THE TIME MACHINE ─────────────────────────────────────────────────
{
  const cr = crossroadsFromWords('Should I take the job in Austin or stay in Dallas?');
  let sp = create(EMPTY_SPACE, 'crossroads', cr, { name: 'CR1', origin: 'person' }).space;
  const id = sp.objs[0].id;
  sp = P(sp, id, 'addPri', { name: 'Salary', by: 'person' }, 1_700_000_001_000).space;
  sp = P(sp, id, 'addAlt', { name: 'Go back to school', by: 'person' }, 1_700_000_002_000).space;
  const tm = timeMachineFromWords('How has my thinking on this changed?');
  ok('the time machine is about what they asked', tm.subject === 'How has my thinking on this changed?' && tm.subjectBy === 'person');
  sp = create(sp, 'timemachine', tm, { name: 'TM1', origin: 'person' }).space;
  const tmId = sp.objs[1].id;
  const h = recordChange(undefined, [], [{ id: 'n1', label: 'Austin offer' }], 1_700_000_001_500, 'turn', 'I got an offer in Austin');
  const tl = timelineOf(sp, h, { tracked: [], map: true, exclude: tmId });
  ok('every recorded change, in time order', tl.events.map((e) => e.source.kind).join() === 'step,map,step', J(tl.events.map((e) => e.key)));
  ok('the person’s words on that turn come with the map change', tl.events[1].words === 'I got an offer in Austin');
  ok('it says where the record begins', tl.gaps.some((g) => /record begins/.test(g)));
  ok('the time machine does not follow itself', !tl.events.some((e) => e.source.kind === 'step' && e.source.obj === tmId));
  const diff = compareStates(sp.objs[0], 0, 2);
  ok('then and now, from its parts', diff.added.includes('Salary') && diff.added.includes('Go back to school'), J(diff));
  ok('Socria cannot write their reasons', !S(sp, tmId, 'reason', { key: tl.events[0].key, text: 'because' }).ok);
  const r = P(sp, tmId, 'reason', { key: tl.events[0].key, text: 'My manager said salary was fixed' });
  ok('the person writes why', r.ok);
  sp = r.space;
  const f = forgetBefore(sp, id, 2);
  ok('forgetting history keeps the present and counts what went', J(currentOf(f.objs[0])) === J(currentOf(sp.objs[0])) && f.objs[0].trimmed === 2 && f.objs[0].states.length === 1);
  const back = roundTrip(f);
  ok('…and it reloads intact', back && back.objs[0].trimmed === 2 && J(currentOf(back.objs[0])) === J(currentOf(f.objs[0])));
  const tl2 = timelineOf(f, undefined, { tracked: [id], map: true });
  ok('a trimmed history says so', tl2.gaps.some((g) => /no longer kept/.test(g)) && tl2.gaps.some((g) => /not recorded yet/.test(g)), J(tl2.gaps));
}

console.log(`experiences: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
