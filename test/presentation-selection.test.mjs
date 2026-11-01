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
  for (const t of ["what's the debt-to-income ratio?", 'what is the Sharpe ratio?', 'what is ROAS?', 'how is GDP calculated?', 'how do you calculate churn?', 'what is working capital?', 'how do I calculate a weighted average?', 'what is kinetic energy?', 'how do you calculate speed?'])
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
  ok('one layer down: a graph that fits is shown, not "if it shows it better"; the next ways deeper only if there is more', /shown in the graph below/.test(layer) && /if there is more worth going into, the next ways deeper as a paths block/.test(layer), layer.slice(0, 900));
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
  for (const [t, re] of [['explain Bayes theorem', /"title":"Money left to grow"|"title":"A positive test, read right"/], ['how does compound interest work?', /"title":"Money left to grow"/], ['I got x = 3 for 2x + 3 = 9, is that right?', /"summary":"The second step is where it slips"/]])
    ok(`the example fits the reason: "${t}"`, re.test(R.renderPresentation(plan(t))), R.renderPresentation(plan(t)).slice(0, 600));
  // no example's topic is a canonical ask, so a copying model cannot pass a sweep by reproducing it
  const all = ['chart', 'slider', 'compare', 'reasoning', 'options', 'draft', 'concepts', 'sequence', 'paths', 'decide', 'graph', 'claim', 'sim', 'check', 'steps', 'diagram', 'balance', 'equation'].map((k) => R.renderPresentation({ forms: [k], reasons: [] })).join('\n') +
    ['cycle', 'tree', 'flow', 'causes'].map((v) => R.renderPresentation({ forms: ['diagram'], reasons: [], diagram: v })).join('\n') + R.renderPresentation({ forms: ['sequence'], reasons: ['sequence:timeline'] }) + R.renderPresentation({ forms: ['paths'], reasons: ['paths:deeper'] }) + R.renderPresentation({ forms: ['paths'], reasons: ['paths:more'] });
  for (const topic of ['French Revolution', 'Microeconomics', 'The startup', '10% of our brains', 'The heater', 'Why continuity matters', 'Pricing for teams', 'The water cycle', '2008 crash', 'Index funds', 'CAC', 'Monthly costs', 'Sketch the first five minutes'])
    ok(`no grammar example is a canonical ask: "${topic}"`, !all.includes(topic));
  ok('no placeholder value is left in an example', !/a few words why|two or three sentences, read when opened/.test(all));
}

console.log(`\npresentation selection: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
