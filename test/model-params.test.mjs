// EVERY REQUEST SHAPED FOR THE MODEL IT GOES TO (lib/model-params.ts, lib/openai-usage.ts).
//
// The root cause of every artifact that failed since routing launched, held
// down: each call was written as `max_tokens` + a fixed `temperature`, which
// the GPT-5.6 and GPT-6 reasoning models refuse — and the refusal names "this
// model", so the routes read it as the model being unavailable and stepped
// down (or, one rung down onto another refused model, failed outright). Here,
// against an OpenAI that holds each model to its real contract
// (helpers/fake-openai-contract.mjs):
//   - the old shape of every route's call is refused by every reasoning model;
//   - the shaped call is accepted by every model, with room for the reasoning;
//   - a parameter refused anyway is answered on the SAME model, never by a step
//     down; and what kind of failure an error is, is read correctly.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const P = await import(pathToFileURL(join(here, '.tmp', 'model-params.mjs')).href);
const U = await import(pathToFileURL(join(here, '.tmp', 'openai-usage.mjs')).href);
const R = await import(pathToFileURL(join(here, '.tmp', 'model-router.mjs')).href);
const F = await import(pathToFileURL(join(here, 'helpers', 'fake-openai-contract.mjs')).href);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const J = (v) => JSON.stringify(v);

const MODELS = Object.keys(F.CONTRACT);
const REASONING = MODELS.filter((m) => F.CONTRACT[m].family === 'reasoning');
const CLASSIC = MODELS.filter((m) => F.CONTRACT[m].family === 'classic');
const messages = [{ role: 'system', content: 'Return JSON.' }, { role: 'user', content: 'Make a checklist.' }];
// every route's call, as it is written (the routes did not change how they write them)
const SHAPES = {
  'map pass': { temperature: 0, max_tokens: 3200, response_format: { type: 'json_object' } },
  'display draft': { temperature: 0, max_tokens: 2400, response_format: { type: 'json_object' } },
  'the reply': { temperature: 0.7, max_tokens: 900, stream: true },
  experience: { temperature: 0.4, max_tokens: 900, response_format: { type: 'json_object' } },
  'easy view': { temperature: 0, max_tokens: 2600, response_format: { type: 'json_object' } },
  synthesis: { temperature: 0.3, max_tokens: 1600, response_format: { type: 'json_object' } },
};

console.log('=== the families ===');
ok('classic: GPT-4o and GPT-4o mini, GPT-4.1, a fine-tune of one, an id nobody knows', ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'ft:gpt-4o-mini:org::abc', 'my-model'].every((m) => P.traitsOf(m).family === 'classic'));
ok('reasoning: the o-series, GPT-5, every GPT-5.6 and GPT-6 model', ['o3', 'o4-mini', 'gpt-5', 'gpt-5-mini', ...REASONING].every((m) => P.traitsOf(m).family === 'reasoning'));
ok('reasoning can be switched off on GPT-6 Luna and GPT-6.1 Terra only — not Sol, not the GPT-5.6 models', P.traitsOf('gpt-6-luna').none && P.traitsOf('gpt-6.1-terra').none && !P.traitsOf('gpt-6.1-sol').none && ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'].every((m) => !P.traitsOf(m).none));

console.log('\n=== THE ROOT CAUSE: the old call, refused by every reasoning model ===');
// the predicate every route used to decide "this model is not available"
const OLD_REFUSED = (e) => e?.status === 404 || /model|not found|does not exist|unknown/i.test(e?.message || '');
for (const [what, shape] of Object.entries(SHAPES)) {
  const refused = REASONING.filter((m) => F.judge({ model: m, messages, ...shape }).error?.status === 400);
  ok(`${what}: the call as written is refused by all ${REASONING.length} reasoning models`, refused.length === REASONING.length, J(refused));
}
{
  const e = F.judge({ model: 'gpt-6-luna', messages, ...SHAPES['display draft'] }).error;
  ok('  the refusal names the parameter, and says "this model"', e.param === 'max_tokens' && /with this model/.test(e.message));
  ok('  which the old predicate read as the model being unavailable — so the routes stepped down', OLD_REFUSED(e));
  ok('  and the new one does not: it is the request, not the model', !R.refusedModel(e) && P.failureOf(e) === 'param');
  ok('the classic models take the old call as it is', CLASSIC.every((m) => !F.judge({ model: m, messages, ...SHAPES['the reply'] }).error));
}

console.log('\n=== shaped, accepted by every model, with room to think ===');
for (const [what, shape] of Object.entries(SHAPES)) {
  const res = MODELS.map((m) => {
    const asked = P.shapeRequest({ model: m, messages, ...shape });
    const j = F.judge(asked);
    const room = j.error ? -1 : j.budget - j.reasoning;
    return { m, err: j.error?.message, effort: asked.reasoning_effort, answer: room };
  });
  const refused = res.filter((r) => r.err);
  ok(`${what}: accepted by all ${MODELS.length} models`, !refused.length, J(refused));
  ok(`  every reasoning model keeps the whole of the answer's old cap, its reasoning on top`, res.filter((r) => F.CONTRACT[r.m].family === 'reasoning').every((r) => r.answer >= shape.max_tokens), J(res));
}
{
  const reply = (m) => P.shapeRequest({ model: m, messages, ...SHAPES['the reply'] });
  ok('Luna and Terra: reasoning off, so the reply streams at once and its temperature holds', ['gpt-6-luna', 'gpt-6.1-terra'].every((m) => reply(m).reasoning_effort === 'none' && reply(m).temperature === 0.7 && reply(m).max_completion_tokens === 900 && reply(m).max_tokens === undefined));
  ok('Sol and the GPT-5.6 models: the lowest effort they have, the temperature they refuse dropped, room for the reasoning', ['gpt-6.1-sol', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'].every((m) => reply(m).reasoning_effort === 'low' && reply(m).temperature === undefined && reply(m).max_completion_tokens === 900 + P.REASONING_ROOM.low));
  const classic = { model: 'gpt-4o-mini', messages, ...SHAPES['the reply'] };
  ok('a classic model’s call is not touched at all', P.shapeRequest(classic) === classic);
  const stray = P.shapeRequest({ model: 'gpt-4o', messages, reasoning_effort: 'low', verbosity: 'low', max_tokens: 10 });
  ok('  an effort written for a reasoning model is dropped for a classic one', stray.reasoning_effort === undefined && stray.verbosity === undefined && stray.max_tokens === 10);
  const medium = P.shapeRequest({ model: 'gpt-6-luna', messages, ...SHAPES['display draft'] }, { OPENAI_REASONING_EFFORT: 'medium' });
  ok('OPENAI_REASONING_EFFORT moves the effort, and the room grows with it', medium.reasoning_effort === 'medium' && medium.max_completion_tokens === 2400 + P.REASONING_ROOM.medium && medium.temperature === undefined);
  const j = F.judge(medium);
  ok('  at medium the answer still has all of its old room', !j.error && j.budget - j.reasoning >= 2400, J(j));
  const unshaped = F.judge({ model: 'gpt-6-luna', messages, max_completion_tokens: 2400, reasoning_effort: 'medium', response_format: { type: 'json_object' } });
  ok('  where the old cap alone would have been spent thinking (the answer cut or empty)', unshaped.budget - unshaped.reasoning < 2400);
  ok('"none" asked of Sol becomes the lowest it has', P.effortFor('gpt-6.1-sol', 'none') === 'low' && P.effortFor('gpt-6-luna', 'none') === 'none');
}

console.log('\n=== a parameter refused anyway: answered on the same model ===');
const err = (status, message, extra = {}) => Object.assign(new Error(`${status} ${message}`), { status, ...extra, error: { message, ...extra } });
{
  const call = { model: 'gpt-6-luna', messages, temperature: 0, max_tokens: 2400, reasoning_effort: 'none', response_format: { type: 'json_object' }, prompt_cache_key: 'k', stream_options: { include_usage: true } };
  const noNone = err(400, "Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium'.", { param: 'reasoning_effort', code: 'unsupported_value' });
  const a = P.adaptRefused(call, noNone);
  ok('"none" refused: asked at low, the sampling settings dropped, room added', a?.model === 'gpt-6-luna' && a.reasoning_effort === 'low' && a.temperature === undefined && a.max_completion_tokens === undefined && a.max_tokens === 2400, J(a));
  const b = P.adaptRefused({ ...call, max_tokens: undefined, max_completion_tokens: 2400 }, noNone);
  ok('  with the cap already renamed, the room is added to it', b.max_completion_tokens === 2400 + P.REASONING_ROOM.low);
  const mt = P.adaptRefused({ model: 'gpt-6-luna', messages, max_tokens: 900, reasoning_effort: 'low' }, err(400, "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", { param: 'max_tokens', code: 'unsupported_parameter' }));
  ok('max_tokens refused: renamed, with room for the reasoning', mt.max_tokens === undefined && mt.max_completion_tokens === 900 + P.REASONING_ROOM.low);
  const temp = P.adaptRefused({ model: 'gpt-6-luna', messages, temperature: 0, reasoning_effort: 'none' }, err(400, "Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported.", { param: 'temperature', code: 'unsupported_value' }));
  ok('a temperature refused: dropped', temp && temp.temperature === undefined && temp.reasoning_effort === 'none');
  const classicEffort = P.adaptRefused({ model: 'gpt-4o', messages, reasoning_effort: 'low' }, err(400, "Unsupported parameter: 'reasoning_effort' is not supported with this model.", { param: 'reasoning_effort', code: 'unsupported_parameter' }));
  ok('an effort refused by a model with no reasoning: dropped', classicEffort && classicEffort.reasoning_effort === undefined);
  const plain = { model: 'x', messages, prompt_cache_key: 'k', stream_options: { include_usage: true }, response_format: { type: 'json_object' } };
  for (const k of ['prompt_cache_key', 'stream_options', 'response_format']) {
    const out = P.adaptRefused(plain, err(400, `Unrecognized request argument supplied: ${k}`, { param: k }));
    ok(`${k} refused: dropped, the rest of the call as it was`, out && !(k in out) && Object.keys(out).length === Object.keys(plain).length - 1);
  }
  ok('nothing to adapt for a missing model, a prompt too long, or a parameter the call has not got', [
    err(404, 'The model `gpt-9` does not exist or you do not have access to it.', { code: 'model_not_found' }),
    err(400, "This model's maximum context length is 128000 tokens.", { code: 'context_length_exceeded' }),
    err(400, "Unsupported parameter: 'logprobs' is not supported with this model.", { param: 'logprobs', code: 'unsupported_parameter' }),
    err(400, "Unsupported parameter: 'messages' is not supported.", { param: 'messages', code: 'unsupported_parameter' }),
  ].every((e) => P.adaptRefused(call, e) === null));
}

console.log('\n=== what kind of failure it is ===');
{
  const cases = [
    ['a missing id (404)', err(404, 'The model `gpt-6-luna` does not exist or you do not have access to it.', { code: 'model_not_found' }), 'model'],
    ['a refused parameter', err(400, "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", { param: 'max_tokens', code: 'unsupported_parameter' }), 'param'],
    ['a rate limit', err(429, 'Rate limit reached for gpt-6-luna', { code: 'rate_limit_exceeded' }), 'transient'],
    ['the provider failing', err(503, 'The server is overloaded'), 'transient'],
    ['a dropped connection', Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' }), 'transient'],
    ['the credit spent', err(429, 'You exceeded your current quota', { code: 'insufficient_quota' }), 'other'],
    ['a prompt too long', err(400, "This model's maximum context length is 128000 tokens.", { code: 'context_length_exceeded' }), 'other'],
    ['a policy refusal', err(400, 'Your request was rejected as a result of our safety system.', { code: 'content_policy_violation' }), 'other'],
  ];
  for (const [what, e, want] of cases) ok(`${what}: ${want}`, P.failureOf(e) === want, P.failureOf(e));
  ok('a step down the ladder: for the model, or a passing fault — never for the request', cases.every(([, e, want]) => R.refusedModel(e) === (want === 'model' || want === 'transient')));
  ok('an image a model cannot read: a reason to step down for a route that sends one', P.cannotSee(err(400, 'Invalid content type. image_url is only supported by certain models.')) && !P.cannotSee(err(400, "Unsupported parameter: 'max_tokens' is not supported with this model.", { param: 'max_tokens', code: 'unsupported_parameter' })));
}

console.log('\n=== through the wrapper every client goes through (lib/openai-usage.ts) ===');
{
  const quiet = console.warn;
  const warned = [];
  console.warn = (...a) => warned.push(format(...a));
  console.info = () => {};
  const client = U.tracked(new F.default(), 'test/params');
  globalThis.__contractContent = () => '{"display":{"kind":"plan","state":{}}}';
  const once = [];
  for (const m of MODELS) {
    globalThis.__contractCalls = [];
    const res = await client.chat.completions.create({ model: m, messages, ...SHAPES['display draft'] });
    once.push({ m, calls: globalThis.__contractCalls.map((c) => c.outcome), finish: res.choices?.[0]?.finish_reason });
  }
  ok(`every model answers the display draft in one call, nothing refused, nothing cut`, once.every((r) => r.calls.length === 1 && r.calls[0] === 'ok' && r.finish === 'stop'), J(once));
  // a model whose contract differs from what is known of it: "none" refused — answered on the same model
  const saved = F.CONTRACT['gpt-6-luna'].efforts;
  F.CONTRACT['gpt-6-luna'].efforts = ['low', 'medium', 'high'];
  globalThis.__contractCalls = [];
  const adapted = await client.chat.completions.create({ model: 'gpt-6-luna', messages, ...SHAPES['map pass'] });
  const calls = globalThis.__contractCalls;
  ok('a model that refuses "none" anyway: asked again at low, on the same model, and answered', calls.length === 2 && calls.every((c) => c.model === 'gpt-6-luna') && calls[0].outcome === '400 reasoning_effort' && calls[1].outcome === 'ok' && adapted.choices[0].finish_reason === 'stop', J(calls.map((c) => c.outcome)));
  ok('  and the log says so', warned.some((w) => /refused reasoning_effort on test\/params/.test(w)));
  F.CONTRACT['gpt-6-luna'].efforts = saved;
  // streamed: the usage report is asked for, and the reply comes through
  globalThis.__contractCalls = [];
  globalThis.__contractContent = () => 'Here it is.';
  const stream = await client.chat.completions.create({ model: 'gpt-6.1-sol', messages, ...SHAPES['the reply'] });
  let text = '';
  for await (const ch of stream) text += ch.choices?.[0]?.delta?.content ?? '';
  const sent = globalThis.__contractCalls[0].params;
  ok('a streamed reply on Sol: one call, low effort, no temperature, the usage asked for, every word through', globalThis.__contractCalls.length === 1 && sent.reasoning_effort === 'low' && sent.temperature === undefined && sent.stream_options?.include_usage && text === 'Here it is.', J({ n: globalThis.__contractCalls.length, sent }));
  console.warn = quiet;
}

console.log(`\nmodel-params: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
