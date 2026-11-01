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
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const strong = (p, k) => !!p.strong?.includes(k);

console.log('\n=== 1. mathematics: the relationship shown, the working when asked ===');
{
  const mvt = plan('I need to understand the Mean Value Theorem');
  ok('the Mean Value Theorem: the understanding shape, the chord graph as the form that fits, the ways deeper optional', mvt.shape === 'understand' && mvt.graph === 'rate' && strong(mvt, 'graph') && has(mvt, 'paths') && !strong(mvt, 'paths'), J(mvt));
  const said = R.renderPresentation(mvt);
  // the escape clause is said once, by the shape — the header drops its own when the reply has a shape (review, November 2026)
  ok('  told: the form that fits; the escape said once, by the shape; the paths after it, optional', /THE FORM THAT FITS/.test(said) && !/unless one sentence fully answers them/.test(said) && /If a sentence or two carries it, that is the whole reply/.test(said) && /Optional, after it, if it helps:\n- \{"type":"paths"/.test(said), said.slice(0, 800));
  ok('  the ways deeper are ideas, not work ("Where it breaks down", never "Sketch the first five minutes")', /Where it breaks down/.test(said) && !/Sketch the first five minutes/.test(said) && !/Map who decides/.test(said));
  ok('  what the prose is for is said once: by the shape, not again by each grammar', !/Your prose/.test(said), said.slice(0, 1600));
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
  ok('  told: one sentence on what ties the parts together; the diagram carries them; no "list of properties" rule', /something made of parts/.test(water) && /the diagram below carries the parts/.test(water) && /your words never repeat/.test(water) && !/no list of properties/.test(water) && /"view":"cycle"/.test(water), water.slice(0, 900));
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


// ── THE ADVERSARIAL REVIEW (November 2026) ───────────────────────────────
// Three lenses — precision, recall, coherence — probed 722 phrasings against the planner. What they found,
// held here: every structure stands down for somebody's own life, polite and indirect phrasings get the same
// reading as the direct ones, and the turn says each thing once.

console.log('\n=== 14. precision: somebody\'s own life is answered by a person, in prose ===');
{
  const none = (t, o) => { const p = plan(t, o); return !['compare', 'decide', 'balance', 'diagram', 'sequence', 'claim', 'reasoning', 'equation', 'slider'].some((k) => has(p, k)); };
  for (const t of [
    'why did he end things with me?', 'why did she end our friendship?', 'how did the breakup affect her?', 'how is our team structured?',
    'is he worth it?', 'is my relationship worth it?', 'is it good or bad that I cried at work?',
    'my girlfriend is pregnant. should we keep it?', 'should we stop trying for a baby?', 'should we move in together?', 'my dad has dementia. should we move him into a care home?',
    'should I break up with him or give it another chance?', 'would it be better for us to split up or try counseling?', 'is it better for my kids if we divorce or stay together?', 'do I text him first or wait?',
    'how do I make my wife happy again?', 'how do I fix my marriage?', 'how do I change my life?', 'how do I clean up my act?', 'how should I prepare for my dad\'s death?',
    'My ex said he never cheated. true?', 'my therapist says anxiety is always about control', 'my mom says all guys cheat', 'He told me he loves me. Is it real?', 'My boyfriend says he was at work all night. Is that true?',
    'me vs my anxiety lol', 'monday vs me', 'I feel different from everyone else. is that normal?', 'am I different from other people?', 'how is he different from my ex?',
    'what happened in the meeting?', 'what happened when I restarted the server?', 'My ex is going to Sarah\'s wedding and so am I. What should I do?',
  ]) ok(`no table, scoring block, recipe, diagram or verdict: "${t}"`, none(t), J(plan(t)));
  for (const t of ['why did he end things with me?', 'why did the meeting end so early?', 'how is he different from my ex?'])
    ok(`  and not shaped as an idea to understand: "${t}"`, plan(t).shape !== 'understand', J(plan(t)));
  for (const t of ['can I vent for a sec?', 'was it my fault?', 'will it ever get better?', 'is it normal to cry after a breakup?', 'does he still love me?', 'have I been a bad friend?', 'is life supposed to be this hard?', 'can I tell you something?', 'would it be ok if I just talked for a bit?', 'does anyone else hate mondays?', "isn't it a beautiful day?"])
    ok(`  a question about the person, not a lookup: "${t}"`, read(t).state.exchange.kind !== 'task' || read(t).state.work !== 'information', J(read(t).state.work));
  for (const t of ['I just got dumped. how do I stop thinking about him?', 'how to cope with my mom\'s death', 'how to get over a breakup', 'how to stop feeling so empty', 'how do I keep going after losing my mom?', 'how do I come out to my parents?', 'give me three reasons to live', 'give me some advice, my wife left me'])
    ok(`  grief, a breakup, a hard thing to say: no practical recipe: "${t}"`, plan(t).shape !== 'practical' && !has(plan(t), 'sequence') && !has(plan(t), 'paths'), J(plan(t)));
  ok('  "give me three reasons to live" is read as danger, before anything else', read('give me three reasons to live').state.exchange.reasons.includes('safety'), J(read('give me three reasons to live').state.exchange));
  ok('  "reasons to live in Lisbon" is not', !read('give me three reasons to live in Lisbon').signals.safety);
  for (const t of ['give me a few minutes, I need to think about this', 'give me some time to think about it', 'give me 5 minutes', "give me some encouragement, I'm about to go on stage"])
    ok(`  time and comfort asked for are not a list: "${t}"`, read(t).state.work !== 'information' && !has(plan(t), 'paths'), J(read(t).state.work));
}

console.log('\n=== 15. precision: a bare word is not a structure ===');
{
  for (const t of ['how long is the rinse cycle on a dishwasher?', 'how long does it take to cycle 20 miles?', "what's a good cycle route in London?", 'how do I break the cycle of procrastination?'])
    ok(`"cycle" is not a cycle diagram: "${t}"`, !has(plan(t), 'diagram'), J(plan(t)));
  for (const t of ['what was Brown vs Board of Education about?', 'Godzilla vs Kong release date?', 'is Kramer vs Kramer worth watching?', 'lakers vs celtics tonight', 'pizza or tacos for dinner tonight?', 'which is better, being rich or being happy?'])
    ok(`a title, a fixture, a dinner, a life's values: no comparison table: "${t}"`, !has(plan(t), 'compare') && !has(plan(t), 'decide'), J(plan(t)));
  for (const t of ['how do I grow closer to my dad?', 'how do I grow as a person?', 'how do I grow tomatoes on a balcony?', 'how can I grow my hair faster?', 'how do I price my used car?'])
    ok(`"grow" and "price" are not a business's: "${t}" — no channels, no pricing models`, !plan(t).reasons.some((r) => /compare:(?:channels|pricing-models)/.test(r)), J(plan(t)));
  for (const t of ['how long until christmas?', 'how long until my package arrives?', 'how long is the longest runway in the world?', 'what is a fashion runway?'])
    ok(`a countdown or an airport is no formula: "${t}"`, !has(plan(t), 'slider'), J(plan(t)));
  for (const t of ["what's the conversion rate from USD to EUR?", "what's a good conversion rate for an online store?", "what's the markup on a new car usually?", 'what is the ROI of a college degree?', "what's a healthy BMI for a 40 year old woman?", "what's a good churn rate for SaaS?", "what's the speed of light?"])
    ok(`a value or a benchmark is not a definition: "${t}" — no equation`, !has(plan(t), 'equation'), J(plan(t)));
  for (const t of ['can you help me solve a conflict with my roommate?', 'how do I prove my landlord kept my deposit unfairly?', 'my girlfriend is being so irrational lately, what do I do?', 'my induction ceremony is tomorrow and I am nervous'])
    ok(`"solve", "prove", "irrational", "induction" are everyday words too: "${t}" — not mathematics`, read(t).state.domain !== 'math' && !R.looksMathematical([t]), read(t).state.domain);
  for (const t of ['How do I set up two-factor authentication?', 'How do I integrate Stripe with my Next.js app?', 'How do I work out at home without equipment?', 'how do I solve this problem with my boss?', 'how do I factor in inflation when planning retirement?'])
    ok(`an everyday how-to with a maths verb is not maths practice: "${t}"`, read(t).state.work !== 'practice' && !has(plan(t), 'steps'), J(plan(t)));
  for (const t of ['what should I do with my life?', 'what should I do with my savings?', 'what should I do in this situation?'])
    ok(`a life decision is not a fact question: "${t}"`, read(t).state.work === 'judgment', read(t).state.work);
  for (const t of ['Do I need a visa or a passport for Mexico?', 'do I need to file taxes if I made $5000?', 'can I freeze cooked rice?', 'Do they still sell the iPhone 12?'])
    ok(`…and a question of fact about them stays one: "${t}"`, read(t).state.work === 'information' && !has(plan(t), 'slider') && !has(plan(t), 'decide'), J({ w: read(t).state.work, p: plan(t) }));
}

console.log('\n=== 16. recall: the same reading however it is phrased ===');
{
  for (const [t, k, v] of [
    ['Tell me about the water cycle', 'diagram', 'cycle'], ['Can you tell me what caused World War 1?', 'diagram', 'causes'], ['what caused World War I?', 'diagram', 'causes'],
    ['how is the US government organised?', 'diagram', 'tree'], ['break down the water cycle for me', 'diagram', 'cycle'], ['give me a rundown of the causes of WW1', 'diagram', 'causes'],
    ['Can you tell me how to change a tire?', 'sequence'], ['show me how to tie a tie', 'sequence'], ['I want to know how to file my taxes', 'sequence'], ['do you know how to fix a leaky faucet?', 'sequence'],
    ['How do you make pancakes?', 'sequence'], ['how does one apply for a mortgage?', 'sequence'], ['teach me how to tie a bowline knot', 'sequence'], ['How do I set up two-factor authentication?', 'sequence'],
    ['How do I do CPR?', 'sequence'], ['how do I back up my iPhone?', 'sequence'], ['how do I remove a red wine stain?', 'sequence'], ["what's the best way to clean a cast iron pan?", 'sequence'], ["what do I need to do to get a driver's license?", 'sequence'],
  ]) ok(`"${t}": ${k}${v ? ` (${v})` : ''}, the form that fits`, strong(plan(t), k) && (!v || plan(t).diagram === v), J(plan(t)));
  for (const t of ['Do we only use 10% of our brains?', 'Does sugar cause diabetes?', 'Does cracking your knuckles cause arthritis?', 'Do goldfish really have a 3-second memory?', 'Was Napoleon actually short?', 'Are vaccines linked to autism?', 'Does shaving make hair grow back thicker?', 'Do carrots help you see in the dark?', 'Do you really need 8 glasses of water a day?', 'Can you catch a cold from wet hair?', 'Lightning never strikes the same place twice, right?', 'Einstein failed math, didn\'t he?', 'Humans only have five senses, right?', 'My teacher said Napoleon was really short. Was he?'])
    ok(`a claim in its plainest form, inspected: "${t}"`, has(plan(t), 'claim'), J(plan(t)));
  for (const t of ['Does this make sense?', 'does it really matter?', 'Did you really mean that?', 'You\'re coming tonight, right?', 'The meeting is at 3, right?', 'Does the API cause a memory leak?', 'Can you get a refund from Amazon?', 'My boss says the meeting is cancelled'])
    ok(`…and not a remark, a plan or code: "${t}"`, !has(plan(t), 'claim'), J(plan(t)));
  for (const t of ['how do mitosis and meiosis differ?', 'What sets mitosis apart from meiosis?', 'How does AWS stack up against Azure?', 'what are the similarities between Judaism and Islam?', 'Electric cars compared to hybrids', 'Is it better to rent or buy a house?', "what's better, a Roth or a traditional IRA?", 'Which is healthier, butter or margarine?', 'Which is more secure, Signal or WhatsApp?'])
    ok(`compared, however it is asked: "${t}"`, strong(plan(t), 'compare'), J(plan(t)));
  ok('"Is it better to rent or buy a house?" asks for the comparison, not a debate', read('Is it better to rent or buy a house?').state.exchange.kind === 'task');
  for (const t of ['Do you think I should take the job or stay?', 'what would you do, take the offer or stay?', 'React or Vue, which should I use?', 'do I take the job in Denver or stay in Austin?', 'would it be better to rent or buy in my situation?', 'pros and cons of quitting my job'])
    ok(`their own choice, however it is asked: "${t}" — weighed by them`, has(plan(t), 'decide'), J(plan(t)));
  for (const t of ["what's the debt-to-income ratio?", 'what is the Sharpe ratio?', 'what is ROAS?', 'how is GDP calculated?', 'how do you calculate churn?', 'what is working capital?', 'how do I calculate a weighted average?', 'what is kinetic energy?', 'how do you calculate speed?', 'what is ROI in marketing?'])
    ok(`a ratio or formula asked what it is: "${t}" — its equation`, has(plan(t), 'equation'), J(plan(t)));
  for (const t of ['what does E=mc^2 mean?', "what is Newton's second law?", "what is Ohm's law?", 'what is the ideal gas law?'])
    ok(`a named law asked what it means: "${t}" — its equation, not a curve to reshape`, has(plan(t), 'equation') && !has(plan(t), 'graph'), J(plan(t)));
  for (const [t, k] of [['what are the parts of a cell?', 'concepts'], ['what are the main organelles in a cell?', 'concepts'], ['what are the layers of the atmosphere?', 'concepts'], ['what are the states of matter?', 'concepts'], ['what are the different blood types?', 'concepts'], ["what are Porter's five forces?", 'concepts'], ['what is a marketing funnel?', 'diagram'], ['explain the food chain', 'diagram'], ['how did World War 1 start?', 'diagram'], ['what led up to the fall of the Berlin Wall?', 'diagram'], ['what were the major events of World War 2?', 'sequence']])
    ok(`the parts of something: "${t}" — ${k}`, strong(plan(t), k), J(plan(t)));
  for (const t of ['what are the phases of the moon?', 'what are the stages of the water cycle?', 'what are the phases of the business cycle?', 'stages of the menstrual cycle'])
    ok(`a cycle's stages, shown once: "${t}" — the cycle, not a sequence beside it`, plan(t).diagram === 'cycle' && !has(plan(t), 'sequence'), J(plan(t)));
  for (const t of ['what does the graph of sin x look like?', 'show me a sine wave', 'what does a bell curve look like?', 'what is a normal distribution?', 'explain exponential growth', 'what is the slope of a line?'])
    ok(`a relationship with an obvious graph: "${t}"`, has(plan(t), 'graph'), J(plan(t)));
  ok('…not exponential growth in a business conversation', !has(plan('how do we get exponential growth for our startup?'), 'graph'), J(plan('how do we get exponential growth for our startup?')));
  for (const t of ['what is momentum in physics?', 'what is inflation in economics?'])
    ok(`one idea in a field is not the field: "${t}" — no overview`, !has(plan(t), 'concepts'), J(plan(t)));
  for (const t of ['why do we have seasons?', 'why do we dream?', 'why do people get colds more in winter?'])
    ok(`a science why is an explanation, not an opinion: "${t}"`, read(t).state.exchange.kind === 'task', read(t).state.exchange.kind);
  ok('…and "why do people believe in conspiracy theories?" is still a view to discuss', read('why do people believe in conspiracy theories?').state.exchange.kind === 'discussion', read('why do people believe in conspiracy theories?').state.exchange.kind);
  for (const t of ['why is bitcoin crashing?', 'why is the stock market down?', 'how did the stock market do?', 'how does the weather look for the weekend?', 'how did the Yankees score last night?', 'why did tesla stock drop?', "can you explain what's happening with the stock market?", 'how do the standings look in the premier league?', 'why are gas prices so high?', 'how does the weather look in denver?'])
    ok(`a question about now is still looked up: "${t}"`, R.webIntent(t).want, J(R.webIntent(t)));
  ok('"why is bitcoin crashing?" is a market\'s fall, not their app crashing', read('why is bitcoin crashing?').state.work !== 'diagnosis', read('why is bitcoin crashing?').state.work);
}

console.log('\n=== 17. coherence: each thing said once, by the one that owns it ===');
{
  const said = (t, o) => R.renderPresentation(plan(t, o));
  const mvt = said('I need to understand the Mean Value Theorem');
  ok('with a shape, the shape says what the prose is: no grammar says it again', /THE SHAPE OF THIS REPLY/.test(mvt) && !/Your prose/.test(mvt), mvt.slice(0, 1600));
  ok('…and the escape is said once, by the shape, not again by the header', (mvt.match(/unless one sentence fully answers them|If a sentence or two carries it/g) ?? []).length === 1);
  const vs = said('TCP vs UDP');
  ok('without a shape, the first form\'s grammar says what the prose is, once', (vs.match(/Your prose/g) ?? []).length === 1, vs);
  ok('the header names what the block carries', /THE FORM THAT FITS — the options, side by side in the block below/.test(vs), vs.slice(0, 300));
  const photosynthesis = plan('how does photosynthesis work?');
  ok('an optional element is optional in the shape too', !strong(photosynthesis, 'sequence') && /if it shows it better/.test(R.renderPresentation(photosynthesis)), R.renderPresentation(photosynthesis).slice(0, 900));
  const layer = R.renderPresentation(plan('Go deeper: Why the tangent line matches the chord'));
  ok('one layer down: a graph that fits is shown, not "if it shows it better"; the next ways deeper only if there is more', /shown in the graph below/.test(layer) && /if there is more worth going into, the next ways in as a paths block/.test(layer), layer.slice(0, 900));
  const detail = plan('explain the Mean Value Theorem in detail, with the proof', { length: 'detailed' });
  ok('depth asked for on a first turn: no order to stop after a sentence', detail.depth === true && !/Then stop/.test(R.renderPresentation(detail)) && /They asked for it in detail/.test(R.renderPresentation(detail)) && R.presentationRoom(detail) >= 400, R.renderPresentation(detail).slice(0, 1200));
  const guarded = plan('explain the water cycle', { guard: true });
  ok('under the Answer Guard a parts turn keeps the parts wording, the parts in prose', guarded.parts === 'cycle' && /something made of parts/.test(R.renderPresentation(guarded)) && /the parts themselves, briefly/.test(R.renderPresentation(guarded)), R.renderPresentation(guarded));
  const price = turn('How do I price my SaaS?');
  ok('a practical question says what its element holds: the pricing models, side by side', /the pricing models it comes down to, side by side in the comparison below/.test(price.block), price.block.slice(-1200));
  ok('…and the trip\'s days, in order', /the days in order — Day 1, Day 2/.test(R.renderPresentation(plan("I'm going to Lisbon for 3 days. What should I do?"))));
  const pick = plan('which should I pick, the startup or the bank? just tell me');
  ok('Socria\'s read asked for: the block weighs it, and the read is given once, marked as its own', pick.lean === true && /They asked for your read/.test(R.renderPresentation(pick)) && !/name no winner/.test(R.renderPresentation(pick)), R.renderPresentation(pick));
  ok('…and the move says the same', /give your lean once, marked as yours/.test(R.renderAssist({ mode: 'perspective', forced: false, questions: 1, scaffold: 'none', selfExplain: false, retrieval: false, reasons: [] }, { forms: ['decide'], lean: true })));
  ok('a decision not asked about keeps the gag on a winner', /name no winner in your prose/.test(R.renderPresentation(plan('Should I take the job in Berlin or stay where I am for another year?'))));
  ok('INFORM beside a block that fits, with no shape: the answer first, the block the rest', /the block below carries the rest of it/.test(R.renderAssist({ mode: 'inform', forced: false, questions: 1, scaffold: 'none', selfExplain: false, retrieval: false, reasons: [] }, { strong: ['sequence'], forms: ['sequence'] })));
  ok('EXPLAIN on a layer turn leaves the how to the shape', /the shape of this reply, below, says how/.test(R.renderAssist({ mode: 'explain', forced: false, questions: 1, scaffold: 'none', selfExplain: false, retrieval: false, reasons: [] }, { shape: 'layer' })));
  ok('Socria\'s direct control says the block carries the steps when one is offered', /as the block below, when one is offered/.test(M.renderControls({ strategy: 'direct' }, { withheld: false, hardNoQuestions: false, ceiling: null })));
  ok('no question this turn: nothing in a block asks one', /leave out "predict" and "check"/.test(said('what is a parabola?', { questions: 0 })) && !/leave out "predict"/.test(said('what is a parabola?')));
  ok('"what you checked" keeps the verdict in the prose', /keeps the verdict and its reason/.test(R.renderPresentation(plan('Is it true that we only use 10% of our brains?'), { verifyOutLoud: true })));
  ok('options frame where to start without asking', /Your prose: a line on where you could start, not a question/.test(R.renderPresentation({ forms: ['options'], reasons: ['options:open-request'] })));
  const bizIdea = turn('how is a company organized?');
  ok('an idea in a business conversation gets an idea line, not "the next concrete step"', !/the next concrete step/.test(bizIdea.block), bizIdea.block.slice(0, 600));
  ok('an open piece of work: the ways onward are the form that fits', strong(plan('I need to redesign our onboarding'), 'paths'));
  for (const [t, re] of [['explain Bayes theorem', /"title":"Money left to grow"|"title":"A positive test, read right"/], ['how does compound interest work?', /"title":"Money left to grow"/], ['I got x = 3 for 2x + 3 = 9, is that right?', /It may well be right: check it before you say either/]])
    ok(`the example fits the reason: "${t}"`, re.test(R.renderPresentation(plan(t))), R.renderPresentation(plan(t)).slice(0, 600));
  // no example's topic is a canonical ask, so a copying model cannot pass a sweep by reproducing it
  const all = ['chart', 'slider', 'compare', 'reasoning', 'options', 'draft', 'concepts', 'sequence', 'paths', 'decide', 'graph', 'claim', 'sim', 'check', 'steps', 'diagram', 'balance', 'equation'].map((k) => R.renderPresentation({ forms: [k], reasons: [] })).join('\n') +
    ['cycle', 'tree', 'flow', 'causes'].map((v) => R.renderPresentation({ forms: ['diagram'], reasons: [], diagram: v })).join('\n') + R.renderPresentation({ forms: ['sequence'], reasons: ['sequence:timeline'] }) + R.renderPresentation({ forms: ['paths'], reasons: ['paths:deeper'] }) + R.renderPresentation({ forms: ['paths'], reasons: ['paths:more'] });
  for (const topic of ['French Revolution', 'Microeconomics', 'The startup', '10% of our brains', 'The heater', 'Why continuity matters', 'Pricing for teams', 'The water cycle', '2008 crash', 'Index funds', 'CAC', 'Monthly costs', 'Sketch the first five minutes',
    // the second round's: each the answer to a plausible question, and the Titanic's with a fact a copying model would repeat
    'Titanic', 'Bats are blind', 'Music theory', 'A four-day week', 'Apollo', 'Which flat', 'Paper notes', 'average speed', 'Draft a first version', '(-360)'])
    ok(`no grammar example is a canonical ask: "${topic}"`, !all.includes(topic));
  ok('no placeholder value is left in an example', !/a few words why|two or three sentences, read when opened/.test(all));
}

console.log('\n=== 18. precision, second round: somebody\'s own life, asked any way ===');
{
  const forms = (t, o) => plan(t, o).forms;
  for (const t of ["My dad told me it's my fault they divorced. Is that true?", "My mom says I'm the reason she drinks. Is that true?", 'Did Mom really say I was a mistake?', 'Was the breakup really my fault?', 'Did mom really love me?', 'Is grandma really dying?', 'Is Tom really cheating on me?', "My sister says I'm selfish. Is that true?", "My teacher says I'll never amount to anything. True?", "It always gets better, doesn't it?", 'Grief always gets easier with time, right?', 'is this right? I told my mom I hate her'])
    ok(`their own life is not a claim to inspect or work to check: "${t}"`, !has(plan(t), 'claim') && !has(plan(t), 'reasoning') && !R.claimCheck(t) && read(t).state.work !== 'verification', J({ w: read(t).state.work, p: plan(t) }));
  for (const t of ['my dad died today. what do I do now?', 'my grandpa died this week. what do I do now?', 'Is Grandma going to be okay?', "When is Mom's surgery?", 'Does Jake like me?', 'Did Tom cheat on me?', 'Was Dad proud of me?', "I've been feeling down recently, is that normal?", "is it bad that I'm crying right now?", 'how do I tell my family some bad news?'])
    ok(`grief, a family's health, a relationship never leave the machine: "${t}"`, !R.webIntent(t, R.readSignals(t)).want, J(R.webIntent(t, R.readSignals(t))));
  for (const t of ['should I keep the baby or give it up for adoption?', 'should we put our dog down or try another treatment?', 'should we cremate mom or bury her?', 'should I come out to my parents now or wait until college?', 'should I put my mom in assisted living or have her live with us?', 'should I move my mom into a nursing home or hire a carer?', 'should I go no contact with my mother or try once more?', 'should I forgive my dad or cut him off?', 'should I visit my sick grandma or stay for finals?', 'should we have a second kid or stop at one?', "I'm so sad. should I call my mom or wait?"])
    ok(`a family's, a pregnancy's, a pet's end is never scored 0–3: "${t}"`, !forms(t).some((k) => k === 'decide' || k === 'compare' || k === 'balance'), J(plan(t)));
  for (const t of ["I need to plan my mom's funeral", "I have to organize my dad's memorial", "I'm trying to figure out how to cope with my mom's death", 'help me think through whether to leave my husband', 'I need to figure out what to do about my marriage', "I'm trying to work out whether I still love him", "help me figure out why I'm so sad", "how should I think about my mom's diagnosis?", 'how should I approach my dad about his drinking?', 'what does planning a funeral involve?', 'what does hospice care involve?'])
    ok(`a funeral, a marriage, grief: no project shape, no menu, no overview: "${t}"`, plan(t).shape !== 'open' && !forms(t).some((k) => k === 'paths' || k === 'concepts'), J(plan(t)));
  for (const t of ['how do I fix a broken heart?', 'how do I start healing?', 'how do I go about leaving an abusive relationship?', 'how do I start dating again after being widowed?', 'what are the five stages of loss?', 'what are the stages of losing a parent?', 'steps to getting over someone', 'how do I make my parents trust me again?', 'how do I make amends with my brother?', 'how do I fix the relationship with my dad?', 'how do I make a long distance relationship work?', 'how can I make peace with my dad before he dies?'])
    ok(`heartbreak, loss, a family bond: no recipe: "${t}"`, plan(t).shape !== 'practical' && !forms(t).some((k) => k === 'sequence' || k === 'paths' || k === 'concepts'), J(plan(t)));
  for (const t of ["what if my mom doesn't survive the surgery? she's 78", 'what if he leaves me after 10 years?', "what if I'm still single at 40?", 'my husband drained our savings of 20k, what do I do?', 'how much does a funeral for 100 guests cost?', 'why do my feelings oscillate so much?', 'why does my life orbit around my boyfriend?', 'why does my mood swing like a pendulum?', 'how do I get my life back on a better trajectory?', 'how do I survive on minimum wage?', 'how do you differentiate between love and lust?'])
    ok(`no live element on a worry, a feeling or a hardship: "${t}"`, !forms(t).some((k) => LIVE.has(k) || k === 'equation'), J(plan(t)));
  for (const t of ["what caused grandma's stroke?", "what led to Grandpa's heart attack?", "why did mom and dad's marriage end?", 'what triggered the fight between Mom and Aunt Lisa?', 'what happens if grandma stops eating?', "what happens if dad doesn't get the transplant?", 'what happens when you die?', 'what happened when he left?', 'what happened after she moved out?', 'what caused the outage?', 'why did sales decline last quarter?'])
    ok(`a family's story, a death, their own outage: no diagram or dated timeline: "${t}"`, !forms(t).some((k) => k === 'diagram' || k === 'sequence'), J(plan(t)));
  for (const t of ['Is my son different from other kids?', 'How are my son and daughter so different?', 'How are my parents and my in-laws different?', 'What sets my brother apart from me?', 'is it better to tell my mom or my dad first?', 'cremation or burial for my dad?', 'Is it better to be loved or respected?', 'Is it better to be feared or loved?', "what's the difference between a lawyer and a catfish? lol", "Tell me a joke: what's the difference between a cat and a frog?", 'whats the difference between my mom and a drill sergeant lol'])
    ok(`their children, their parents, a value, a joke: no table: "${t}"`, !forms(t).some((k) => k === 'compare' || k === 'decide'), J(plan(t)));
  for (const t of ['is having kids worth it?', 'is marriage worth it?', 'is a long distance relationship worth it?', 'is IVF worth it?', 'is staying friends with an ex worth it?', 'is crying good or bad?', 'is being alone good or bad?', 'pros and cons of having a baby at 40', 'pros and cons of putting my mom in a nursing home'])
    ok(`a life course or a feeling is not weighed in two columns: "${t}"`, !has(plan(t), 'balance') && !has(plan(t), 'compare'), J(plan(t)));
  for (const t of ['what is peer pressure?', 'what is blood pressure?', 'what is a CPA?', 'what is speed dating?', "what's the speed limit in Texas?", 'what is a zoning variance?', 'what is first principles thinking?', 'what is a derivative work in copyright?', 'how do I differentiate my brand from competitors?', 'how big is a 20 m² bedroom?', 'how much is a 12 pack of beer?', 'how much is the iPhone 16 Pro?'])
    ok(`a bare noun never forces a visual: "${t}"`, !forms(t).some((k) => k === 'equation' || k === 'graph' || k === 'slider' || k === 'sim'), J(plan(t)));
  for (const t of ['is tom hanks still alive?', 'is chatgpt down?', 'who is the prime minister of the uk?', 'did the warriors win?', 'is it going to rain tomorrow?', 'do I need a jacket tonight?', "I'd like to know who won the game last night", 'I need the latest news on the hurricane'])
    ok(`a question about now keeps its lookup however it is typed: "${t}"`, R.webIntent(t, R.readSignals(t)).want, J(R.webIntent(t, R.readSignals(t))));
  for (const t of ['how do I make chicken stock?', 'what is alternating current?', 'how do I forecast revenue?', 'what is a z-score?'])
    ok(`a concept or a recipe with a live word in it is not a lookup: "${t}"`, !R.webIntent(t, R.readSignals(t)).want, J(R.webIntent(t, R.readSignals(t))));
  for (const t of ['should I get pizza or tacos tonight?', 'should I salt the water before or after it boils?', 'should I laugh or cry at this point?', 'which is cuter, puppies or kittens?', 'who directed Kramer vs Kramer?', 'when did Roe vs Wade get overturned?', 'what time is Lakers vs Warriors?', 'what channel is Arsenal vs Chelsea on?', 'Trump vs Harris polls'])
    ok(`small talk, a title, a case, a fixture: answered as one thing: "${t}"`, !forms(t).some((k) => k === 'compare' || k === 'decide'), J(plan(t)));
  for (const t of ['what time is Lakers vs Warriors?', 'what channel is Arsenal vs Chelsea on?', 'Trump vs Harris polls'])
    ok(`  …and the fixture's time, channel or polls are still looked up: "${t}"`, R.webIntent(t, R.readSignals(t)).want, J(R.webIntent(t, R.readSignals(t))));
}

console.log('\n=== 19. recall, second round: the same reading however it is typed or asked ===');
{
  const same = (a, b) => { const x = plan(a), y = plan(b); return x.shape === y.shape && J(x.forms) === J(y.forms) && J(x.strong ?? []) === J(y.strong ?? []); };
  for (const t of ['what should I do if someone is choking?', 'what should I do if my dog ate chocolate?', "what should I do if there's a grease fire in my kitchen?", 'what should I do if I get stung by a bee?', 'what should I do if I spill coffee on my laptop?', 'what should I do if I lose my passport abroad?', 'should I wash chicken before cooking it?', 'should I take ibuprofen or paracetamol for a hangover?', 'Should I stretch before or after running?', 'should I use who or whom in this sentence?', 'Should I use tu or vous with my host family in France?', 'what should you do in an earthquake?'])
    ok(`a question with an answer, not their own decision: "${t}" — no scoring, the call not "theirs"`, !has(plan(t), 'decide') && read(t).state.work !== 'judgment', J({ w: read(t).state.work, p: plan(t) }));
  for (const t of ['what should I do if someone is choking?', "what should I do if there's a grease fire in my kitchen?", 'what should I do if I get stung by a bee?', 'what should I do if I spill coffee on my laptop?', 'what should you do in an earthquake?'])
    ok(`  an emergency's steps, in order: "${t}"`, strong(plan(t), 'sequence'), J(plan(t)));
  for (const [curly, straight] of [['what’s a derivative?', "what's a derivative?"], ['What’s EBITDA?', "What's EBITDA?"], ['What’s the formula for kinetic energy?', "What's the formula for kinetic energy?"], ['What’s the best way to learn Spanish?', "What's the best way to learn Spanish?"], ['I’d like to know what caused World War 1', "I'd like to know what caused World War 1"], ['I don’t understand how the water cycle works', "I don't understand how the water cycle works"], ['I’m confused about the krebs cycle', "I'm confused about the krebs cycle"], ['What’s better, a Roth or a traditional IRA?', "What's better, a Roth or a traditional IRA?"], ['I’m torn between Lisbon and Porto for a weekend', "I'm torn between Lisbon and Porto for a weekend"], ['whats a derivative?', "what's a derivative?"]])
    ok(`a phone's curly apostrophe reads the same: "${curly}"`, same(curly, straight), J([plan(curly), plan(straight)]));
  for (const [curly, straight] of [['What’s Tesla’s market cap?', "What's Tesla's market cap?"], ['What’s the newest Claude model?', "What's the newest Claude model?"]])
    ok(`  …and looks up the same: "${curly}"`, R.webIntent(curly, R.readSignals(curly)).want === R.webIntent(straight, R.readSignals(straight)).want && R.webIntent(straight, R.readSignals(straight)).want);
  ok('  "don’t ask me questions" is read as asking for none', read('Just tell me, don’t ask me questions').signals.stopQuestions === read("Just tell me, don't ask me questions").signals.stopQuestions);
  for (const t of ['how do we price our SaaS?', 'how can we reduce churn in our app?', 'how can we improve our conversion rate?', 'how do we get more signups?', 'how do you negotiate a raise?', 'how do u make pancakes', 'tips to learn japanese faster', 'best way to learn japanese', 'ways to improve my credit score', 'how much should I charge for freelance web design?', "I'm going to Japan for 10 days, any recommendations?", 'give me a recipe for lasagna'])
    ok(`practical however it is asked: "${t}"`, plan(t).shape === 'practical', J(plan(t)));
  for (const t of ['how do u make pancakes', 'give me a recipe for lasagna']) ok(`  a recipe's steps: "${t}"`, has(plan(t), 'sequence'), J(plan(t)));
  ok('  the pricing models, side by side', plan('how do we price our SaaS?').reasons.includes('compare:pricing-models'), J(plan('how do we price our SaaS?')));
  ok('  the trip\'s days', plan("I'm going to Japan for 10 days, any recommendations?").reasons.includes('sequence:itinerary'), J(plan("I'm going to Japan for 10 days, any recommendations?")));
  for (const [t, k] of [['explain the krebs cycle to me', 'diagram'], ['could you explain the causes of WW1 to me?', 'diagram'], ['Walk me through the krebs cycle', 'diagram'], ['explain the krebs cycle for my biology exam', 'diagram'], ["we're learning about the water cycle in class, can you explain it?", 'diagram'], ['Can you help us understand the carbon cycle?', 'diagram'], ['What were the causes of WW1 and why did they matter so much?', 'diagram'], ["How is the UK parliament structured? I'm writing a report", 'diagram'], ['I have a history test tomorrow. What caused World War 1?', 'diagram'], ['explain the mean value theorem to me', 'graph']])
    ok(`the asker's own framing changes nothing: "${t}" — ${k}`, has(plan(t), k) && plan(t).shape === 'understand', J(plan(t)));
  for (const t of ['can you fact check this: the Great Wall of China is visible from space', 'verify this claim: vaccines cause autism', 'true or false: bats are blind', 'bats are blind, true or false?', 'apparently goldfish only have a 3 second memory?', 'is there any truth to the idea that sugar makes kids hyper?', 'they say an apple a day keeps the doctor away. any truth to that?', 'someone told me we only use 10 percent of our brain', 'my friend says 90% of startups fail', 'my friend says 90 percent of startups fail'])
    ok(`a claim put up politely is inspected, never checked as their work: "${t}"`, has(plan(t), 'claim') && !has(plan(t), 'slider') && read(t).state.work !== 'verification', J({ w: read(t).state.work, p: plan(t) }));
  ok('  "2%" and "2 percent" read the same', same('explain what happens to a population growing at 2% a year', 'explain what happens to a population growing at 2 percent a year'), J([plan('explain what happens to a population growing at 2% a year'), plan('explain what happens to a population growing at 2 percent a year')]));
  for (const [t, k, v] of [['Describe the water cycle', 'diagram', 'cycle'], ['Describe the causes of World War 1', 'diagram', 'causes'], ['Describe the structure of the US government', 'diagram', 'tree'], ['Outline the causes of the French Revolution', 'diagram', 'causes'], ['Discuss the effects of deforestation', 'diagram', 'flow'], ['Identify the main causes of climate change', 'diagram', 'causes'], ['Analyse the causes of the 2008 financial crisis', 'diagram', 'causes'], ['Illustrate the nitrogen cycle', 'diagram', 'cycle'], ['Run me through the causes of WW2', 'diagram', 'causes'], ['describe the menstrual cycle', 'diagram', 'cycle'], ['Distinguish between mitosis and meiosis', 'compare'], ['Differentiate between DNA and RNA', 'compare']])
    ok(`an exam's command verb: "${t}" — ${k}${v ? ` (${v})` : ''}`, strong(plan(t), k) && (!v || plan(t).diagram === v), J(plan(t)));
  for (const [hedged, direct] of [['I was wondering how the US government is organized', 'how is the US government organized?'], ['I was wondering how to change a flat tire', 'how do I change a flat tire?'], ['I was wondering what EBITDA means', 'what does EBITDA mean?'], ["I'm curious about how vaccines work", 'how do vaccines work?'], ['wondering how compound interest works', 'how does compound interest work?'], ['Can you tell me how the US government is organized?', 'how is the US government organized?'], ['Please explain what the Sharpe ratio is', 'what is the Sharpe ratio?'], ['ok so what are the layers of the earth', 'what are the layers of the earth?'], ['um what causes inflation?', 'what causes inflation?'], ["in layman's terms, what is a derivative?", 'what is a derivative?']])
    ok(`a hedge or a filler changes nothing: "${hedged}"`, J(plan(hedged).forms) === J(plan(direct).forms), J([plan(hedged), plan(direct)]));
  for (const t of ['Which language is faster, Go or Rust?', 'Which country is bigger, Canada or the US?', 'Is coffee healthier than tea?', 'Is Linux more secure than Windows?', 'whats the diff between a hurricane and a typhoon', 'What are the differences of DNA and RNA?', 'Could you explain how a virus is different from bacteria?', 'Would you mind comparing Spanish and Portuguese?', 'are hurricanes and typhoons the same thing?', 'What do DNA and RNA have in common?'])
    ok(`compared however it is phrased: "${t}"`, strong(plan(t), 'compare'), J(plan(t)));
  for (const t of ['how are supply and demand related?', 'how are voltage and current related?'])
    ok(`a relationship is not a side-by-side table: "${t}"`, !has(plan(t), 'compare'), J(plan(t)));
  for (const [t, shape] of [['could you elaborate on that?', 'layer'], ['please elaborate on that', 'layer'], ['can you expand on the part about mitochondria?', 'layer'], ['could you say more about the treaty of versailles part?', 'layer'], ['can you tell me more about the second cause?', 'layer'], ['can we dig deeper into the causes?', 'layer'], ['dive deeper into the causes', 'layer'], ['would you mind going deeper on that?', 'layer'], ["I'd like to go deeper into the proof", 'layer'], ['could you expand on that in detail please?', 'deeper'], ['could you walk me through it in detail?', 'deeper']])
    ok(`depth asked for politely: "${t}" — ${shape}`, plan(t).shape === shape, J(plan(t)));
  for (const [bare, asked] of [['what causes earthquakes', 'what causes earthquakes?'], ['what caused the 2008 crash', 'what caused the 2008 crash?'], ['what led to the fall of rome', 'what led to the fall of rome?'], ['how is DNA different than RNA', 'how is DNA different than RNA?'], ['is spanish or italian easier', 'is spanish or italian easier?']])
    ok(`with or without its question mark: "${bare}"`, J(plan(bare).forms) === J(plan(asked).forms) && plan(bare).forms.length > 0, J([plan(bare), plan(asked)]));
  for (const [t, k] of [['ww1 causes', 'diagram'], ['climate change effects', 'diagram'], ['butterfly life cycle', 'diagram'], ['ROI formula', 'equation']])
    ok(`search-box word order: "${t}" — ${k}`, has(plan(t), k), J(plan(t)));
  for (const t of ['what is a hyperbola?', 'what does the graph of 1/x look like?', 'what is direct proportion?', 'what does inversely proportional mean?', 'what is a reciprocal function?', 'what is a square root function?', 'what does the area under a curve mean?'])
    ok(`a relationship with an obvious graph: "${t}"`, has(plan(t), 'graph'), J(plan(t)));
}

console.log('\n=== 20. coherence, second round: what the turn is told agrees with itself ===');
{
  const said = (t, o) => R.renderPresentation(plan(t, o));
  // the check of their work follows the engine's verdict
  const check = (u) => R.renderPresentation({ forms: ['reasoning'], reasons: ['reasoning:steps', 'reasoning:check-work', u] });
  ok('an unchecked attempt is shown a check that may go either way', /It may well be right/.test(check('check:open')) && !/The first step is where it slips","steps"/.test(check('check:open')));
  ok('  a confirmed one, that it holds — nothing to correct', /"summary":"It holds/.test(check('check:holds')) && /nothing to correct/.test(check('check:holds')));
  ok('  a refuted one, where it slips', /"summary":"The first step is where it slips"/.test(check('check:slips')));
  ok('  and none of them is a linear equation', !/2x|both sides/.test(check('check:open') + check('check:holds') + check('check:slips')));
  for (const t of ['I got 3x^2 for the derivative of x^3. Is that right?', 'I worked out 12 * 15 = 180. Did I get it right?'])
    ok(`checking their work draws no graph unless they ask to see it: "${t}"`, !has(plan(t), 'graph'), J(plan(t)));
  // under the guard, what the gate takes off is never shown
  const g = said('what is the derivative of x^3?', { guard: true });
  ok('under the guard the idea opens on what it rests on, never the result', /never the result they are working toward/.test(g) && !/Open with the central insight/.test(g), g.slice(0, 900));
  ok('  the graph example has no marks or readings, and says why', !/"features"|"readouts"/.test(g) && /Under the Answer Guard nothing on it is marked or read out/.test(g), g);
  const ke = said('what is kinetic energy?', { guard: true });
  ok('  the equation example has no worked example', has(plan('what is kinetic energy?', { guard: true }), 'equation') && !/"example"/.test(ke) && /no worked example/.test(ke), ke);
  ok('  …and without the guard both are shown', /"features"/.test(R.renderPresentation({ forms: ['graph'], reasons: [] })) && /"example"/.test(R.renderPresentation({ forms: ['equation'], reasons: [] })));
  // Socria's read, asked for indirectly
  for (const t of ['If you were me, would you take the remote job or the office one?', "I'm torn between a Kindle and a Kobo. What would you get?", "Should I do my master's in Edinburgh or Toronto? Your honest opinion please.", "Should I take the 9-5 or keep freelancing? tell me what you'd do"])
    ok(`their read asked for, however indirectly: "${t}" — given once, after the block`, plan(t).lean === true && /They asked for your read/.test(said(t)) && !/name no winner/.test(said(t)), J(plan(t)));
  // the open-work shape defers to the block that is the point of the turn
  const budget = said('We need to rework our budget: rent 3000, salaries 20000, software 1500, ads 4000');
  ok('open work with their numbers: the chart shows them, the prose does not list them', /the chart below shows their numbers/.test(budget), budget.slice(0, 1200));
  ok('  two blocks that fit: the header says what each carries', /THE FORM THAT FITS — their numbers, and the ways it could go next in the blocks below/.test(budget), budget.slice(0, 1600));
  ok('  a launch choice between two named options is a decision, not open work', has(plan('We need to launch our app — should we launch on iOS or Android first?'), 'decide') && plan('We need to launch our app — should we launch on iOS or Android first?').shape !== 'open');
  const noq = said('help me plan a product launch', { questions: 0 });
  ok('  no question this turn: the shape licenses none', /and no question\./.test(noq) && !/no closing question unless/.test(noq), noq.slice(0, 900));
  ok('  with a question allowed, one only if it would change everything', /no closing question unless one answer would change everything/.test(said('help me plan a product launch')));
  // depth fitted to what carries it, and said where it came from
  const cyc = said('explain the nitrogen cycle in detail');
  ok('in detail, a diagram\'s parts: a paragraph each in its order — no proof or worked case', /each part in a short paragraph, in the order the diagram connects them/.test(cyc) && !/the proof, the conditions/.test(cyc), cyc.slice(0, 1200));
  ok('  an idea in detail: the proof, the conditions, a worked case', /the proof, the conditions, a worked case/.test(said('explain the mean value theorem in detail')));
  ok('  depth from the length setting says so', /Their replies are set to Detailed/.test(said('what caused the French Revolution?', { length: 'detailed' })) && !/They asked for it in detail/.test(said('what caused the French Revolution?', { length: 'detailed' })));
  // one layer down follows what the thread was about, and never re-offers the example's paths
  const work = [U('I need to redesign our onboarding flow'), A('The problem is…\n```ui\n{"type":"paths","items":[{"label":"Map who decides","gist":"x"},{"label":"Choose the first test","gist":"y"}]}\n```')];
  const more = [U('how do I grow tomatoes on a balcony?'), A('Sun first…\n```ui\n{"type":"paths","items":[{"label":"Watering in a heatwave","gist":"x"},{"label":"Feeding the soil","gist":"y"}]}\n```')];
  const idea = [U('what does the mean value theorem say?'), A('Somewhere between two points…\n```ui\n{"type":"paths","items":[{"label":"Where it breaks down","gist":"x"},{"label":"Why the condition matters","gist":"y"}]}\n```')];
  const lw = plan('Go deeper: Map who decides', { history: work }), lm = plan('Go deeper: Feeding the soil', { history: more }), li = plan('Go deeper: Why the condition matters', { history: idea });
  ok('one layer down on open work: the work\'s next moves', lw.shape === 'layer' && lw.reasons.includes('layer:work') && /the next ways the work could go/.test(R.renderPresentation(lw)), J(lw));
  ok('  on practical advice: what else matters', lm.reasons.includes('layer:more') && /what else matters from here/.test(R.renderPresentation(lm)), J(lm));
  ok('  on an idea: further in', li.reasons.includes('layer:idea') && /the mechanism under it/.test(R.renderPresentation(li)), J(li));
  for (const [p, opened] of [[lw, ['Map who decides', 'Choose the first test']], [lm, ['Watering in a heatwave', 'Feeding the soil']], [li, ['Where it breaks down', 'Why the condition matters']]])
    ok(`  the next ways' example never shows the first turn's: ${opened.join(', ')}`, !opened.some((x) => R.renderPresentation(p).includes(x)), R.renderPresentation(p));
  // a procedure asked politely, and a trip asked another way
  for (const t of ['walk me through replacing a bike chain', 'could you explain how to change the oil in my car?', 'explain how to brew beer at home', 'can you explain how to file a tax return?'])
    ok(`a procedure asked politely is practical, its steps in order: "${t}"`, plan(t).shape === 'practical' && strong(plan(t), 'sequence'), J(plan(t)));
  for (const t of ['what should I see in Tokyo in 4 days?', 'what should I visit in Lisbon if I only have 2 days?', 'what should we do in Barcelona over a long weekend?'])
    ok(`a trip asked another way keeps its days: "${t}"`, plan(t).shape === 'practical' && plan(t).reasons.includes('sequence:itinerary'), J(plan(t)));
  for (const t of ['whats the difference between standard deviation and variance', 'what is the difference between standard deviation and variance?'])
    ok(`the difference between two formulas: side by side, one block — not an equation as well: "${t}"`, strong(plan(t), 'compare') && !has(plan(t), 'equation'), J(plan(t)));
  ok('  and the practical shape is never "a sentence or two" as the move', /MODE|inform/i.test('inform') && !/in a sentence or two\b.*\bINFORM/.test(turn('what should I see in Tokyo in 4 days?').block));
  // the domain line agrees with a scaffold
  const scaffold = turn('Solve 3x + 2 = 14');
  ok('a scaffolded maths turn: the domain line works it with them', !/the full working/.test(scaffold.block), scaffold.block.slice(0, 1500));
}

console.log('\n=== 21. a third pass: a length of time is not a trip ===');
{
  const itinerary = (t) => plan(t).reasons.includes('sequence:itinerary');
  for (const t of ['what should I see in Tokyo in 4 days?', 'what should I visit in Lisbon if I only have 2 days?', 'what should we do in Barcelona over a long weekend?', 'We have 5 days in Japan, what should we do?', "I'm going to Lisbon for 3 days. What should I do?", "I'm going to Japan for 10 days, any recommendations?", 'a weekend in Paris, what should we see?', 'I have 3 days in the Alps, what should I do?', 'what should I do in New York for 2 days?', '3 days in Rome, what should I see?'])
    ok(`a trip, with a place named: "${t}" — the days in order`, itinerary(t), J(plan(t)));
  for (const t of ['My exam is in 3 days, what should I do?', 'I have a presentation in 2 days. What should I do to prepare?', 'my visa expires in 5 days, what should I do?', 'I start a new job in two days, any recommendations?', 'my rent is due in 3 days and I am short, what should I do?', 'The baby is due in 4 days, what should we do?', 'I have had a headache 3 days in a row, what should I do?', 'my dog has not eaten for 2 days, what should I do?', 'I have been awake for two days, any tips?', 'what should I do for 3 days at home with the flu?', 'I have had a fever for 3 days in Bangkok, what should I do?', 'I am going to Mexico for surgery in 3 days, what should I do?', 'I have an interview at Google in 3 days, any tips?', 'I have my Physics exam in 3 days, what should I do?', 'I have to finish my thesis over the weekend, what should I do?'])
    ok(`a deadline, a symptom, an emergency: no itinerary: "${t}"`, !itinerary(t) && !R.pickAsk(t), J(plan(t)));
}

console.log(`\npresentation selection: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
