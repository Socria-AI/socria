// test/presentation-selection.test.mjs — TEXT WALLS THE EXCEPTION, NOT THE DEFAULT.
//
// The response-selection overhaul (November 2026), held across the five kinds
// of turn it was asked for — mathematics, comparisons, claims, business, and
// everyday conversation — plus the parts of something (cycles, hierarchies,
// causes, types) and the precision cases that must stay prose:
//
//   lib/runtime/asks.ts          what a turn is asking for, by its shape
//   lib/runtime/state.ts         readWork: comparisons, topics, advice and plain questions get a reading
//   lib/runtime/presentation.ts  the form that fits, the shape of the reply, one live element, precision
//   lib/runtime/allocation.ts    one-line, element-aware contributions; one priority per domain
//   lib/cognition/assist.ts      the move names itself and leaves the how to the shape
//   lib/cognition/claims.ts      everyday claims, and picks asked for
//   lib/core4/web.ts, epistemic  a live word in a comparison is not a lookup
//   lib/runtime/orchestrate.ts   pros and cons and a history's timeline stay in the conversation
//
// Plain node: `node test/presentation-selection.test.mjs` after the bundles are
// built (`node test/run.mjs presentation-selection`).

import * as R from './.tmp/runtime-under-test.mjs';
import * as M from './.tmp/mr-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;

const LIVE = new Set(['graph', 'sim', 'slider', 'decide', 'steps', 'claim']);
const read = (text, o = {}) => {
  const history = o.history ?? [];
  const signals = R.readSignals(text);
  const route = R.routeTurn({ text });
  const state = R.readTurnState({ text, history, signals, intent: route.intent });
  return { route, signals, state };
};
const plan = (text, o = {}) => {
  const { state, signals } = read(text, o);
  return R.planPresentation({
    text,
    state,
    signals,
    questions: o.questions ?? 1,
    ownWriting: !!o.ownWriting,
    ownJudgment: !!o.ownJudgment,
    ownReasoning: !!o.ownReasoning,
    guard: !!o.guard,
    history: o.history ?? [],
    length: o.length ?? null,
  });
};
/** The turn's allocation block and presentation block, as the route assembles them. */
const turn = (text, o = {}) => {
  const { state, signals } = read(text, o);
  const a = R.allocate({ state, signals, assist: { lastUserText: text, history: [], guard: !!o.guard } });
  const p = R.planPresentation({
    text,
    state,
    signals,
    questions: a.assist.questions,
    ownWriting: a.split.creativity === 'human',
    ownJudgment: a.split.judgment === 'human',
    ownReasoning: a.split.reasoning === 'human' || a.split.reasoning === 'scaffold',
    guard: !!o.guard,
    history: [],
  });
  const view = { shape: p.shape, forms: p.forms, question: /\?\s*$/.test(text) || R.LIST_ASK.test(text) };
  return { p, state, block: R.renderAllocation(a, state, view) + R.renderPresentation(p) };
};
const has = (p, k) => p.forms.includes(k);
const strong = (p, k) => !!p.strong?.includes(k);

console.log('\n=== 1. mathematics: the relationship shown, the working when asked ===');
{
  const mvt = plan('I need to understand the Mean Value Theorem');
  ok('the Mean Value Theorem: the understanding shape, the chord graph as the form that fits, the ways deeper optional', mvt.shape === 'understand' && mvt.graph === 'rate' && strong(mvt, 'graph') && has(mvt, 'paths') && !strong(mvt, 'paths'), J(mvt));
  const said = R.renderPresentation(mvt);
  ok('  told: the form that fits, unless one sentence answers; the paths after it, optional', /THE FORM THAT FITS/.test(said) && /unless one sentence fully answers them/.test(said) && /Optional, after it, if it helps:\n- \{"type":"paths"/.test(said), said.slice(0, 800));
  ok('  the ways deeper are ideas, not work ("Why continuity matters", never "Sketch the first five minutes")', /Why continuity matters/.test(said) && !/Sketch the first five minutes/.test(said));
  ok('a derivative: the tangent at a point', plan('What does a derivative actually mean?').graph === 'tangent');
  ok('"what\'s the slope of x^2 at 3": the tangent there, not a parabola to reshape', plan("what's the slope of x^2 at 3").graph === 'tangent', J(plan("what's the slope of x^2 at 3")));
  ok('"what is a parabola?": a curve to change', plan('what is a parabola?').graph === 'curve');
  const sq = plan('how do I solve x^2 + 4x - 1 = 0 by completing the square?');
  ok('the working asked for beats a graph inferred: steps, and no second live element', J(sq.forms) === J(['steps']), J(sq));
  ok('"Solve 2x^2 - 8x + 6 = 0" is read as mathematics (the exponent after a coefficient)', read('Solve 2x^2 - 8x + 6 = 0').state.domain === 'math', read('Solve 2x^2 - 8x + 6 = 0').state.domain);
  ok('compound interest and Bayes: a slider with defaults, the form that fits an idea to understand', strong(plan('how does compound interest work?'), 'slider') && strong(plan('explain Bayes theorem'), 'slider') && !has(plan('how does compound interest work?'), 'sequence'));
  ok('  its grammar: sensible defaults, said to be defaults', /sensible defaults said to be defaults/.test(R.renderPresentation(plan('how does compound interest work?'))));
  for (const t of ['how do I change the graph colors in excel?', 'why does my javascript function return undefined?', 'what is the meaning of the curve in this poem?', 'sorry for the tangent, but why do cats purr?', 'what is a derivative in finance?'])
    ok(`a bare mathematical word is not mathematics: "${t}" — no graph`, !has(plan(t), 'graph'), J(plan(t)));
}

console.log('\n=== 2. comparisons: side by side, the one difference in prose ===');
{
  for (const t of ['TCP vs UDP', 'mitosis vs meiosis', 'Postgres or MongoDB for a chat app?', 'Roth IRA or traditional IRA if I am 25?', 'How is a virus different from bacteria?', 'How are viruses and bacteria similar and how are they different?', 'Which is better for a small startup, React or Vue?', 'compare Python and JavaScript for a beginner', 'What is the difference between weather and climate?', 'index funds vs individual stocks', 'pros and cons of renting vs buying'])
    ok(`compared, as the form that fits: "${t}"`, strong(plan(t), 'compare'), J(plan(t)));
  ok('"TCP vs UDP" is a question with an answer, not idle talk', read('TCP vs UDP').state.work === 'information' && read('TCP vs UDP').state.exchange.kind === 'task');
  ok('"which is better for a small startup, React or Vue?" asks for the comparison, not an opinion', read('Which is better for a small startup, React or Vue?').state.exchange.kind === 'task');
  const said = R.renderPresentation(plan('TCP vs UDP'));
  ok('  told: the difference that decides most cases is the prose; the rows carry the rest; nothing repeated', /Your prose: the difference that decides most cases/.test(said) && /your words never repeat/.test(said), said);
  for (const t of ['should I bring an umbrella or not?', 'tea or coffee?', "I'm feeling better and calmer today", 'which is better for a beginner, and why?', 'good or bad, it happened'])
    ok(`no second option, or no question: "${t}" — nothing compared`, !has(plan(t), 'compare') && !has(plan(t), 'decide'), J(plan(t)));
  const ae = plan("What's the difference between affect and effect?");
  ok('a usage question is compared, never an idea to build ("affect" and "effect")', has(ae, 'compare') && ae.shape !== 'understand', J(ae));
}

console.log('\n=== 3. claims: the verdict first, the parts to inspect ===');
{
  for (const t of ['Is it true that we only use 10% of our brains?', 'coffee stunts your growth. True?', 'Is the 10,000 hour rule real?', 'Does sugar make kids hyperactive?', 'My friend says the Great Wall is visible from space', 'My manager says remote work kills productivity. Is that right?', 'Did Einstein actually say that?'])
    ok(`a claim to check: "${t}"`, R.claimCheck(t) && (has(plan(t), 'claim') || t.startsWith('Did Einstein')) && !plan(t).shape, J(plan(t)));
  for (const t of ['is it true that free will is an illusion?', 'does this make sense?', 'Does the API cause a memory leak?', 'My boss says the meeting is cancelled', 'my mum says I should call more often'])
    ok(`not a claim: "${t}"`, !R.claimCheck(t));
  ok('  under the Answer Guard nothing is laid out', !has(plan('Is it true that we only use 10% of our brains?', { guard: true }), 'claim'));
  ok('  the move is the verdict, given plainly', /INFORM/.test(turn('Does sugar make kids hyperactive?').block));
}

console.log('\n=== 4. business: the number or the trade-off, the choice theirs ===');
{
  const hire = turn('Should we hire a second engineer or our first marketer? We have 8 months of runway.');
  ok('a choice that is theirs: a decision to weigh; the call stays theirs', has(hire.p, 'decide') && /Theirs: the decision/.test(hire.block), hire.block.slice(0, 900));
  ok('  one rule about winners, not two that argue', (hire.block.match(/winner/g) ?? []).length === 1, (hire.block.match(/[^.]*winner[^.]*/g) ?? []).join(' | '));
  ok('  no six-part checklist owed beside the block', !/the frame the choice actually turns on/.test(hire.block) && !/what would settle it/.test(hire.block), hire.block);
  ok('  the domain asks one thing of it', /the number or trade-off that decides it, then the next concrete step/.test(hire.block) && !/numbers, trade-offs, customers, risks/.test(hire.block));
  const price = turn('How do I price my SaaS?');
  ok('"How do I price my SaaS?": a practical question — the one thing it hinges on, the models side by side, the rest behind paths', price.p.shape === 'practical' && has(price.p, 'compare') && has(price.p, 'paths'), J(price.p));
  ok('  told: one thing it hinges on, a concrete default; and the move does not cap it at a sentence or two', /the one thing it hinges on for them and a concrete default/.test(price.block) && !/in a sentence or two\. Do not turn it into a question/.test(price.block), price.block);
  ok('"How should we grow our newsletter?": the channels side by side', plan('How should we grow our newsletter?').shape === 'practical' && has(plan('How should we grow our newsletter?'), 'compare'));
  ok('…and when the question follows what it is about ("Our signups have plateaued at 200 a week. How do we grow?")', plan('Our signups have plateaued at 200 a week. How do we grow?').shape === 'practical');
  ok('"How do I hire my first engineer?": the steps, in order', plan('How do I hire my first engineer?').shape === 'practical' && has(plan('How do I hire my first engineer?'), 'sequence'));
  ok('"What are the steps to set up an LLC in Delaware?": steps, the form that fits', strong(plan('What are the steps to set up an LLC in Delaware?'), 'sequence'));
  ok('"What metrics should a SaaS startup track?": the few that matter, the rest behind paths', plan('What metrics should a SaaS startup track?').shape === 'practical' && has(plan('What metrics should a SaaS startup track?'), 'paths'));
  for (const t of ['what does EBITDA mean?', 'what is CAC and how do I calculate it?'])
    ok(`a ratio defined: its equation and terms — "${t}"`, strong(plan(t), 'equation'), J(plan(t)));
  const raise = plan('Should we raise prices from $29 to $49?');
  ok('a team\'s change against the status quo is their decision, weighed — one live element only', has(raise, 'decide') && !has(raise, 'slider'), J(raise));
  const research = turn('What does the research say about intermittent fasting?');
  ok('research: what the evidence shows, a sentence each — never an analogous worked case', /what the evidence shows and how strong it is, a sentence each/.test(research.block) && !/ANALOGOUS case/.test(research.block), research.block);
}

console.log('\n=== 5. the parts of something: a diagram, an overview ===');
{
  const cases = [
    ['explain the water cycle', 'diagram', 'cycle'],
    ['what is the Krebs cycle?', 'diagram', 'cycle'],
    ['how is the US government organised?', 'diagram', 'tree'],
    ['how is a company organized?', 'diagram', 'tree'],
    ['what caused World War I?', 'diagram', 'causes'],
    ['what causes inflation?', 'diagram', 'causes'],
    ['Why did the Roman Republic fall?', 'diagram', 'causes'],
    ['effects of social media on teenagers', 'diagram', 'flow'],
    ['what kinds of clouds are there?', 'concepts'],
    ['types of machine learning', 'concepts'],
    ['what are the types of renewable energy?', 'concepts'],
  ];
  for (const [t, k, view] of cases) {
    const p = plan(t);
    ok(`"${t}": ${k}${view ? ` (${view})` : ''}, the form that fits`, strong(p, k) && (!view || p.diagram === view) && p.shape === 'understand', J(p));
  }
  const water = R.renderPresentation(plan('explain the water cycle'));
  ok('  told: one sentence on what ties the parts together; the diagram carries them; no "list of properties" rule', /something made of parts/.test(water) && /do not also write them out/.test(water) && !/no list of properties/.test(water) && /"view":"cycle"/.test(water), water.slice(0, 900));
  ok('  a causes diagram keeps to causes that can be defended, and says where historians disagree', /only causes you could defend/.test(R.renderPresentation(plan('what caused World War I?'))));
  for (const t of ['my sleep cycle is a mess lately', 'how is your day structured?', 'what happens if I quit my job?', 'why did I fail my exam?'])
    ok(`their own life, not a diagram: "${t}"`, !has(plan(t), 'diagram'), J(plan(t)));
  ok('  under the Answer Guard: no diagram to read instead of working it', !has(plan('explain the water cycle', { guard: true }), 'diagram'));
  ok('  a list asked for is a list: "List the main causes of World War 1" — no diagram, no understanding shape, the rest behind paths', !has(plan('List the main causes of World War 1'), 'diagram') && plan('List the main causes of World War 1').shape !== 'understand' && has(plan('List the main causes of World War 1'), 'paths'));
}

console.log('\n=== 6. one subject\'s two sides, a history\'s events: in the conversation ===');
{
  ok('"pros and cons of remote work": in the conversation, the two sides weighed', R.routeTurn({ text: 'pros and cons of remote work' }).intent === 'conversation' && strong(plan('pros and cons of remote work'), 'balance'));
  ok('"is nuclear power good or bad?": the two sides weighed', strong(plan('is nuclear power good or bad?'), 'balance'));
  ok('  its grammar: what it turns on is the prose', /"turns_on"/.test(R.renderPresentation(plan('pros and cons of remote work'))) && /Your prose: that one thing, in a sentence/.test(R.renderPresentation(plan('pros and cons of remote work'))));
  ok('"make me a pros and cons table for buying a house" is still made in Artifacts', R.routeTurn({ text: 'make me a pros and cons table for buying a house' }).intent === 'visual');
  ok('"timeline of the French Revolution": a timeline, the turning point in prose', strong(plan('timeline of the French Revolution'), 'sequence') && /the turning point, in a sentence/.test(R.renderPresentation(plan('timeline of the French Revolution'))));
  ok('"history of the internet": its events offered in order, optional', has(plan('history of the internet'), 'sequence') && !strong(plan('history of the internet'), 'sequence'));
  ok('"timeline for our product launch" is their plan, made in Artifacts', R.routeTurn({ text: 'timeline for our product launch' }).intent === 'visual');
}

console.log('\n=== 7. everyday: natural conversation stays prose ===');
{
  for (const t of ['hi there!', 'thanks, that helps', 'I had the worst day at work', 'how do I feel less anxious', 'how do I tell my mom I am moving out?', 'how does that work for you on Tuesday?', 'rate my 3 startup ideas', 'I slept 5 hours, ran 3 miles, ate 2 meals and drank 4 coffees', "What's the capital of Peru?", 'How long should I boil an egg for a runny yolk?', 'What should I cook tonight with chicken and rice?', 'do you like jazz?', 'lol nice'])
    ok(`prose: "${t}"`, !plan(t).forms.length, J(plan(t)));
  ok('…and a personal how-question is not turned into a task', read('how do I tell my mom I am moving out?').state.exchange.kind !== 'task' && read('do you like jazz?').state.work !== 'information');
  ok('an everyday why: the insight, nothing drawn', plan('Why do onions make you cry?').shape === 'understand' && !plan('Why do onions make you cry?').forms.length);
  ok('"Tips for sleeping better?": the few that matter, the rest behind paths', plan('Tips for sleeping better?').shape === 'practical' && J(plan('Tips for sleeping better?').forms) === J(['paths']));
  const lisbon = turn("I'm going to Lisbon for 3 days. What should I do?");
  ok('three days in Lisbon: a pick, laid out by day — not a decision to weigh', lisbon.p.shape === 'practical' && has(lisbon.p, 'sequence') && !/PERSPECTIVE/.test(lisbon.block) && !/Theirs: the decision/.test(lisbon.block), lisbon.block.slice(0, 600));
  const book = turn('Recommend me a sci-fi book');
  ok('"Recommend me a sci-fi book": a pick, given — never "what the choice rests on"', book.state.work === 'information' && !/PERSPECTIVE/.test(book.block) && /INFORM/.test(book.block), book.block);
  ok('"how do I make pancakes?": the steps, in order', has(plan('how do I make pancakes?'), 'sequence'));
  ok('"how do I make friends as an adult?" has no recipe', !has(plan('how do I make friends as an adult?'), 'sequence'));
}

console.log('\n=== 8. one live element in a reply ===');
{
  const corpus = [
    'I need to understand the Mean Value Theorem', 'how do I solve x^2 + 4x - 1 = 0 by completing the square?', 'Should we raise prices from $29 to $49?',
    'Should I refinance my mortgage at 5.5% if I plan to move in 3 years?', 'Why does throwing at 45 degrees go the farthest?', 'what happens to the curve if I change a in y = a*x^2?',
    'compare these two loans: what if I borrow 200k at 5% or 250k at 4.5% over 25 years, which is better?', 'Is it true that we only use 10% of our brains?',
    'Should we hire a second engineer or our first marketer? We have 8 months of runway.', 'how does compound interest work?', 'What does a derivative actually mean?',
  ];
  for (const t of corpus) {
    const live = plan(t).forms.filter((k) => LIVE.has(k));
    ok(`at most one live element: "${t}"`, live.length <= 1 && plan(t).forms.length <= 2, J(plan(t)));
  }
}

console.log('\n=== 9. the contract: decisive where the structure is the element, optional elsewhere, never restated ===');
{
  for (const t of ['TCP vs UDP', 'explain the water cycle', 'pros and cons of remote work', 'what does EBITDA mean?', 'Is it true that we only use 10% of our brains?', 'My monthly costs are rent 1200, food 400, transport 150 and phone 60. Where is it all going?']) {
    const said = R.renderPresentation(plan(t));
    ok(`the form that fits, and nothing restated: "${t}"`, /THE FORM THAT FITS/.test(said) && /your words never repeat/.test(said), said.slice(0, 300));
  }
  for (const t of ['help me with my essay', 'Tips for sleeping better?']) {
    const said = R.renderPresentation(plan(t));
    ok(`a speculative offer stays optional: "${t}"`, /INLINE, IF IT HELPS — optional/.test(said) && !/THE FORM THAT FITS/.test(said), said.slice(0, 300));
  }
  const kinds = ['chart', 'slider', 'compare', 'reasoning', 'options', 'draft', 'concepts', 'sequence', 'paths', 'decide', 'graph', 'claim', 'sim', 'check', 'steps', 'diagram', 'balance', 'equation'];
  for (const k of kinds) ok(`every grammar says what the prose around it is for: ${k}`, /Your prose/.test(R.renderPresentation({ forms: [k], reasons: [] })));
  for (const [r, v] of [['paths:deeper'], ['paths:more'], ['paths:open-work']]) ok(`  …and every paths variant: ${r}`, /Your prose/.test(R.renderPresentation({ forms: ['paths'], reasons: [r] })));
  for (const v of ['cycle', 'tree', 'flow', 'causes']) ok(`  …and every diagram view: ${v}`, /Your prose/.test(R.renderPresentation({ forms: ['diagram'], reasons: [], diagram: v })) && R.renderPresentation({ forms: ['diagram'], reasons: [], diagram: v }).includes(`"view":"${v}"`));
  ok('two optional offers: "one of these", never "one or both"', /one of these/.test(R.renderPresentation({ forms: ['paths', 'options'], reasons: [] })) && !/one or both/.test(R.renderPresentation({ forms: ['paths', 'options'], reasons: [] })));
  ok('a claim under "verify out loud": what was checked goes in each part\'s basis', /each part's basis/.test(R.renderPresentation(plan('Is it true that we only use 10% of our brains?'), { verifyOutLoud: true })));
  ok('Socria\'s own regulation asks for the steps in order, never numbered beside a sequence block', !/numbered/.test(M.renderControls({ strategy: 'direct' }, { withheld: false, hardNoQuestions: false, ceiling: null })) && /the steps in order/.test(M.renderControls({ strategy: 'direct' }, { withheld: false, hardNoQuestions: false, ceiling: null })));
}

console.log('\n=== 10. said once: the move leaves the how to the shape ===');
{
  const mvt = turn('I need to understand the Mean Value Theorem');
  ok('the move names EXPLAIN and leaves the how to the shape', /EXPLAIN — the shape of this reply, below, says how/.test(mvt.block) && !/The central idea first, in one plain sentence/.test(mvt.block), mvt.block.slice(0, 800));
  ok('  the central idea is asked for once', (mvt.block.match(/central insight in one plain sentence|central idea first/g) ?? []).length === 1, (mvt.block.match(/central insight in one plain sentence|central idea first/g) ?? []).join(' | '));
  const why = turn('Why is the derivative of x^2 equal to 2x?');
  ok('…and the maths idea line keeps only what the shape does not say', /Exact results come from the engine/.test(why.block) && !/The idea before any working/.test(why.block), why.block.slice(0, 600));
  ok('without a shape, the move says it in full (renderAssist alone)', /The central idea first/.test(R.renderAssist(R.chooseAssist({ lastUserText: 'I need to understand the Mean Value Theorem', history: [], signals: R.readSignals('I need to understand the Mean Value Theorem') }))));
}

console.log('\n=== 11. a live word in a comparison is not a lookup ===');
{
  for (const t of ['What is the difference between weather and climate?', 'index funds vs individual stocks', 'how do interest rates affect inflation?'])
    ok(`no search, no "where to look": "${t}"`, !R.webIntent(t).want, J(R.webIntent(t)));
  for (const t of ["What's the weather in Paris today?", 'how is the weather in Paris?', 'bitcoin price', 'who won the game last night?'])
    ok(`still a lookup: "${t}"`, R.webIntent(t).want, J(R.webIntent(t)));
  const need = (t) => R.assessNeed({ text: t, signals: R.readSignals(t), docs: 0, math: false, policy: 'full' });
  ok('"What should I cook tonight with chicken and rice?" is about their evening, not about what is current', !need('What should I cook tonight with chicken and rice?').kinds.includes('current'), J(need('What should I cook tonight with chicken and rice?')));
  ok('"What\'s the weather in Paris today?" is', need("What's the weather in Paris today?").kinds.includes('current'));
  ok('"the difference between weather and climate" is not', !need('What is the difference between weather and climate?').kinds.includes('current'));
}

console.log('\n=== 12. depth: one layer at a time, the whole thread when asked ===');
{
  const g = plan(`Go deeper: Why continuity matters`);
  ok('a way deeper opened: one layer down, the next layers offered', g.shape === 'layer' && has(g, 'paths') && R.presentationRoom(g) >= 200, J(g));
  ok('depth asked for in words: the whole thread, in parts', plan('walk me through it in detail').shape === 'deeper');
  ok('a Detailed length: a way deeper is the whole thread', plan('Go deeper: Why continuity matters', { length: 'detailed' }).shape === 'deeper');
}

console.log('\n=== 13. the core: a list is the few that matter ===');
{
  const core = R.logos5System({ math: false, picture: false, build: false, guard: false });
  ok('a list only when the content is one, and then the few that matter most, a line each', /A list only when the content is one or they ask, and then the few that matter most, a line each/.test(core));
  ok('the persona says it changed', R.PERSONA_VERSION === 'logos5-v6');
}

console.log(`\npresentation selection: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
