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
  CORE_4_MODEL,
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
    '## Human-First', '## Cognitive Work', '## Learning',
    '## Judgment, Analysis, and Creation', '## Direct Answers',
    '## Tools and Epistemic Integrity', '## Semantic Continuity and Memory',
    '## Adaptation', '## Response Discipline', '## Objective',
  ]) ok(`${heading}`, p4.includes(heading));
  ok('the support ladder survived', p4.includes('question → hint → stronger hint'));
  ok('and the closing line', p4.trimEnd().endsWith('Optimize for what remains with the human after the interaction ends.'));
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

console.log('\n=== but the context its prompt expects does arrive ===');
{
  const memory = { goals: ['ship Core 4'], values: [], constraints: [], decisions: [], uncertainties: [] };
  const withMem = buildSystemPrompt('core-4', 'balanced', memory).prompt;
  ok('memory is injected', withMem.length > P('core-4').length && withMem.includes('ship Core 4'),
     'its own Semantic Continuity section says to expect it');
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
  ok('it is versioned separately', CORE_4_PROMPT_VERSION === 'core-4-v1');
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
