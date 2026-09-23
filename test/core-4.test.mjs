// Core 4 is wired, and wired to itself.
//
// The failure this file mostly exists for is silent: resolveModel used to be
// `input === 'core-3' ? 'core-3' : 'core-2'`, so a Core added later did not
// error — it answered as Core 2, on Core 2's prompt, skipping its own auth
// requirement. Nothing about that looks wrong from the outside. The same
// shape appeared in the chat route's auth gate and in lastCoreModel().

import {
  SOCRIA_MODELS,
  buildSystemPrompt,
  resolveModel,
  resolveOpenAIModel,
  fallbackOpenAIModel,
  CORE_4_MODEL,
  CORE_3_FALLBACK_MODEL,
  CORE_4_PROMPT_VERSION,
} from './.tmp/socria-prompt.mjs';
import { rememberModel, lastCoreModel, readStoredModel } from './.tmp/socria-model-store.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const P = (m, d) => buildSystemPrompt(m, d).prompt;

console.log('=== it exists as its own model ===');
{
  const c = SOCRIA_MODELS['core-4'];
  ok('it is registered', !!c);
  ok('it is no longer a teaser', c.soon === undefined, 'a `soon` model is greyed and unselectable');
  ok('it needs an account', c.requiresAuth === true);
  ok('it has no depth axis', c.supportsDepth === false, 'its prompt chooses its own depth');
  ok('it is not a Logos surface', !c.logosSurface);
  ok('its description says what it does', /think/i.test(c.description) && !/in development/i.test(c.description));
}

console.log('\n=== resolveModel does not fall through to Core 2 ===');
ok('core-4 resolves to core-4', resolveModel('core-4') === 'core-4', 'it was answering as Core 2');
ok('core-3 still resolves', resolveModel('core-3') === 'core-3');
ok('core-2 still resolves', resolveModel('core-2') === 'core-2');
for (const junk of ['core-5', '', null, undefined, {}, 'logos-2', 'CORE-4'])
  ok(`${JSON.stringify(junk)} falls back to core-2`, resolveModel(junk) === 'core-2');

console.log('\n=== it runs on its own prompt ===');
{
  const p4 = P('core-4');
  const p3 = P('core-3');
  const p2 = P('core-2');
  ok('it is Core 4 that answers', p4.startsWith('You are Socria Core 4'), p4.slice(0, 60));
  ok('not Core 3.1', !p4.includes('You are Socria Core 3.1'));
  ok('not Core 2', p4 !== p2);
  ok('and Core 3.1 is untouched', p3.startsWith('You are Socria Core 3.1'));

  console.log('\n  -- the prompt arrives whole --');
  for (const heading of [
    '## Precedence', '## Human-First', '## Cognitive Work', '## Learning',
    '## Judgment, Analysis, and Creation', '## Direct Answers',
    '## Epistemic Integrity', '## Semantic Continuity and Memory',
    '## Adaptation', '## Response Discipline', '## Objective',
  ]) ok(`${heading}`, p4.includes(heading));
  ok('the support ladder survived', p4.includes('question → hint → stronger hint'));
  ok('and the closing line', p4.trimEnd().endsWith('Optimize for what remains with the human after the interaction ends.'));

  console.log('\n  -- v2: what the code now decides, the prompt no longer contradicts --');
  // Phase 0, failure 1: v1 told the model to preserve work by default, so a
  // wrong attempt or a bug report became a reason to withhold.
  ok('no default preservation', !p4.includes('When it would, preserve that work'));
  ok('holding back needs a stated reason', p4.includes('Hold something back only when the decision for this turn names what to hold back and why'));
  ok('a wrong answer is not a reason to hide the right one', p4.includes('A wrong answer is not a reason to hide the right one'));
  ok('the decision wins over the general guidance, their words over both', /the decision wins; where the person's own words in their latest message disagree with both, their words win/.test(p4));
  ok('no tools are promised', !/Research facts, retrieve evidence/.test(p4) && p4.includes('You have no tools in this conversation'));
  ok('Socria’s ideas are not presented as theirs', p4.includes('Never present Socria\'s idea as theirs'));
}

console.log('\n=== no depth contract is appended ===');
{
  // Core 3.1 gets one per depth; Core 4 must get none, or the person's dial
  // and the prompt's own Adaptation section would instruct it twice about
  // the same decision.
  const depths = ['quick', 'balanced', 'deep', 'abstract'];
  const prompts = depths.map((d) => P('core-4', d));
  ok('every depth produces the same prompt', new Set(prompts).size === 1, `${new Set(prompts).size} distinct`);
  ok('no Active Thinking Depth block', !prompts[0].includes('Active Thinking Depth'));
  ok('Core 3.1 still gets one', P('core-3', 'deep').includes('Active Thinking Depth'));
  ok('and Core 3.1 still varies by depth', P('core-3', 'quick') !== P('core-3', 'abstract'));
}

console.log('\n=== the context it takes, and the memories it no longer does ===');
{
  // Core 4's continuity is the Cognitive State, the Reasoning Ledger and the
  // Mind Graph. The per-thread memory and the Thinking Journey are two older
  // summaries of the same conversation by different extractors; handing
  // them over too made four memories that could disagree (council D14).
  const memory = { goals: ['ship Core 4'], values: [], constraints: [], decisions: [], uncertainties: [] };
  const withMem = buildSystemPrompt('core-4', 'balanced', memory).prompt;
  ok('the thread memory is NOT injected', withMem === P('core-4') && !withMem.includes('ship Core 4'));
  const withCognition = buildSystemPrompt('core-4', 'balanced', null, null, null, null, null, { state: '\n=== STATE ===', move: '\n=== MOVE ===' }).prompt;
  ok('the cognition block is, state then move, last', withCognition.endsWith('\n=== STATE ===\n=== MOVE ==='));
  const withProfile = buildSystemPrompt('core-4', 'balanced', null, 'Works on a reasoning product.').prompt;
  ok('an imported profile is injected', withProfile.includes('reasoning product'));
  ok('memory still reaches Core 3.1', buildSystemPrompt('core-3', 'balanced', memory).prompt.includes('ship Core 4'));
  ok('and Core 2 still gets none', buildSystemPrompt('core-2', 'balanced', memory).prompt === P('core-2'));
}

console.log('\n=== the model underneath, and its override ===');
{
  ok('it has its own default', SOCRIA_MODELS['core-4'].defaultOpenAIModel === CORE_4_MODEL);
  delete process.env.OPENAI_MODEL_CORE_4;
  ok('unset means the default', resolveOpenAIModel('core-4') === CORE_4_MODEL);
  process.env.OPENAI_MODEL_CORE_4 = 'some-other-model';
  ok('the override is honoured', resolveOpenAIModel('core-4') === 'some-other-model');
  ok('and does not move Core 3.1', resolveOpenAIModel('core-3') !== 'some-other-model');
  delete process.env.OPENAI_MODEL_CORE_4;
  ok('it is versioned separately', CORE_4_PROMPT_VERSION === 'core-4-v2');
}

console.log('\n=== it has the same safety net Core 3.1 has ===');
{
  // Core 4 was given Core 3.1's model id and none of its protection: the
  // retry was gated on `model === 'core-3'`, so on a deployment where the id
  // is rejected Core 3.1 quietly fell back and worked while Core 4 failed.
  // The difference looked like Core 4 being broken.
  ok('Core 4 has a fallback model', fallbackOpenAIModel('core-4') === CORE_3_FALLBACK_MODEL,
     String(fallbackOpenAIModel('core-4')));
  ok('so does Core 3.1', fallbackOpenAIModel('core-3') === CORE_3_FALLBACK_MODEL);
  ok('Core 2 needs none', fallbackOpenAIModel('core-2') === null);
  ok('and the fallback is not the primary', CORE_4_MODEL !== CORE_3_FALLBACK_MODEL,
     'a fallback equal to the primary would retry the same rejected id forever');
}

console.log('\n=== its memory is the Mind Graph, and nothing else ===');
{
  // The flat person-memory store must not reach Core 4: its memory IS the
  // graph, and a graph beside a top-k list of the same material is two
  // memories free to disagree.
  const entries = [
    { id: 'e1', kind: 'value', text: 'They reason from first principles', firstSeen: 1, lastSeen: 1, seen: 3, confidence: 'stated' },
  ];
  const withFlat = buildSystemPrompt('core-4', 'balanced', null, null, null, entries).prompt;
  const bare = buildSystemPrompt('core-4', 'balanced').prompt;
  ok('flat entries never reach Core 4', withFlat === bare,
     'Core 4 received the store the graph replaces');
  ok('but they still reach Core 3.1',
     buildSystemPrompt('core-3', 'balanced', null, null, null, entries).prompt !==
       buildSystemPrompt('core-3', 'balanced').prompt);

  // The graph block does reach it, last.
  const withGraph = buildSystemPrompt('core-4', 'balanced', null, null, null, null, '\n=== MIND ===\nProject: Atlas').prompt;
  ok('the Mind Graph block reaches Core 4', withGraph.includes('Project: Atlas'));
  ok('and sits last, closest to the conversation', withGraph.trimEnd().endsWith('Project: Atlas'));
  ok('Core 2 gets no graph', buildSystemPrompt('core-2', 'balanced', null, null, null, null, 'XX').prompt.includes('XX') === false);
}

console.log('\n=== it survives a round trip through storage ===');
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  rememberModel('core-4');
  ok('it is a storable model', readStoredModel() === 'core-4', 'a `soon` model is refused here');
  ok('and it is the last Core', lastCoreModel() === 'core-4', 'it used to be discarded, dropping you on Core 2');
  rememberModel('logos');
  ok('Logos does not become the last Core', lastCoreModel() === 'core-4');
  rememberModel('core-3');
  ok('switching Cores updates it', lastCoreModel() === 'core-3');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
