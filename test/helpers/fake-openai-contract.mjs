// OpenAI's Chat Completions, as strict as the real API about what each model accepts.
//
// The other fakes take any parameters. The real API does not, and that is how
// every artifact a signed-in person asked for came to fail: each call sent
// `max_tokens` and a fixed `temperature`, which the GPT-5.6 and GPT-6 families
// refuse, and the routes read the refusal as "this model is not available".
// This fake holds each model to the contract its family has on the real API
// (OpenAI's model pages and the reports quoted in docs/ARTIFACT-RELIABILITY.md):
//
//   classic   gpt-4o, gpt-4o-mini — max_tokens or max_completion_tokens,
//             any temperature; `reasoning_effort` is refused.
//   reasoning gpt-5.6-*, gpt-6-luna, gpt-6.1-terra, gpt-6.1-sol — `max_tokens`
//             is refused (use max_completion_tokens); a temperature other than
//             1 is refused unless reasoning is off (effort "none", which only
//             some models have; Sol has none of it); an effort the model does
//             not have is refused; and REASONING TOKENS COUNT AGAINST
//             max_completion_tokens — at the default effort (medium) a small
//             cap is spent thinking and the answer comes back empty or cut,
//             finish_reason "length".
//   unknown   any other id, or one listed in globalThis.__contractUnavailable:
//             404 model_not_found, as an id not enabled on the account.
//
// Errors are shaped as the SDK throws them: `status`, `code`, `param`, `type`,
// `error` (the body), and a message beginning with the status.
//
// What a call returns: globalThis.__contractContent(params, meta) when set
// (meta: { model, family, effort, budget }), else the next entry of
// globalThis.__contractScript (an object is returned as its JSON, a string as
// itself, an Error is thrown), else "". A streamed call streams it.
// globalThis.__contractCalls records every call: { model, params, outcome, overlapped } — overlapped when
// another call was still unanswered as it was asked (globalThis.__contractLatency, in ms, keeps each call
// in flight that long, so two passes meant to run together can be seen to).
// globalThis.__contractReasoning sets the reasoning tokens each effort spends.
//
// THE RESPONSES API (`client.responses.create`), held to its own contract:
// Chat's names (`max_tokens`, `max_completion_tokens`, `messages`,
// `response_format`, `reasoning_effort`) are refused; the cap is
// `max_output_tokens` and reasoning counts against it (an answer cut by it
// comes back `status: "incomplete"`); `reasoning.effort` must be one the model
// has, and a model without reasoning refuses `reasoning`; a temperature needs
// effort none; `text.format` json_object needs the word JSON in the
// instructions: the real API checks only the input); a strict json_schema must close every object
// (additionalProperties false, every property required); a model listed in
// globalThis.__contractNoSchema refuses json_schema. An answer is `output`
// items (a message with output_text parts) and `usage` in the Responses shape
// (input_tokens, output_tokens with reasoning_tokens) — no `output_text`, which
// the real SDK adds on the client. A scripted { refusal: "…" } answers with a
// refusal part. Calls are recorded in __contractCalls with api "responses".

export const CONTRACT = {
  'gpt-4o-mini': { family: 'classic' },
  'gpt-4o': { family: 'classic' },
  'gpt-5.6-luna': { family: 'reasoning', efforts: ['minimal', 'low', 'medium', 'high'], effort: 'medium' },
  'gpt-5.6-terra': { family: 'reasoning', efforts: ['minimal', 'low', 'medium', 'high'], effort: 'medium' },
  'gpt-5.6-sol': { family: 'reasoning', efforts: ['minimal', 'low', 'medium', 'high'], effort: 'medium' },
  'gpt-6-luna': { family: 'reasoning', efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], effort: 'medium' },
  'gpt-6.1-terra': { family: 'reasoning', efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], effort: 'medium' },
  'gpt-6.1-sol': { family: 'reasoning', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], effort: 'medium' },
};

/** Reasoning tokens spent before a word of the answer, by effort — enough to swallow the routes' old caps at medium. */
export const REASONING = { none: 0, minimal: 60, low: 500, medium: 2600, high: 7000, xhigh: 12000, max: 20000 };

const tokensOf = (s) => Math.ceil(String(s ?? '').length / 4);

function apiError(status, message, extra = {}) {
  const body = { message, type: status === 404 ? 'invalid_request_error' : 'invalid_request_error', param: null, code: null, ...extra };
  return Object.assign(new Error(`${status} ${message}`), { status, code: body.code, param: body.param, type: body.type, error: body });
}

/** The call as the real API would judge it: an error to throw, or what it may write. */
export function judge(p) {
  const model = String(p?.model ?? '');
  const c = CONTRACT[model];
  if (!c || (globalThis.__contractUnavailable ?? []).includes(model)) {
    return { error: apiError(404, `The model \`${model}\` does not exist or you do not have access to it.`, { code: 'model_not_found' }) };
  }
  if (c.family === 'classic') {
    if (p.reasoning_effort !== undefined) return { error: apiError(400, "Unsupported parameter: 'reasoning_effort' is not supported with this model.", { param: 'reasoning_effort', code: 'unsupported_parameter' }) };
    if (p.verbosity !== undefined) return { error: apiError(400, "Unsupported parameter: 'verbosity' is not supported with this model.", { param: 'verbosity', code: 'unsupported_parameter' }) };
    const budget = p.max_completion_tokens ?? p.max_tokens ?? 16384;
    return { model, family: 'classic', effort: null, budget, reasoning: 0 };
  }
  if (p.max_tokens !== undefined) {
    return { error: apiError(400, "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", { param: 'max_tokens', code: 'unsupported_parameter' }) };
  }
  const effort = p.reasoning_effort ?? c.effort;
  if (!c.efforts.includes(effort)) {
    return { error: apiError(400, `Unsupported value: 'reasoning_effort' does not support '${effort}' with this model. Supported values are: ${c.efforts.map((e) => `'${e}'`).join(', ')}.`, { param: 'reasoning_effort', code: 'unsupported_value' }) };
  }
  for (const k of ['temperature', 'top_p']) {
    if (p[k] !== undefined && p[k] !== 1 && effort !== 'none') {
      return { error: apiError(400, `Unsupported value: '${k}' does not support ${p[k]} with this model. Only the default (1) value is supported.`, { param: k, code: 'unsupported_value' }) };
    }
  }
  for (const k of ['presence_penalty', 'frequency_penalty']) {
    if (p[k] !== undefined && p[k] !== 0 && effort !== 'none') return { error: apiError(400, `Unsupported parameter: '${k}' is not supported with this model.`, { param: k, code: 'unsupported_parameter' }) };
  }
  const budget = p.max_completion_tokens ?? 100000;
  const reasoning = Math.min(budget, (globalThis.__contractReasoning ?? REASONING)[effort] ?? 0);
  return { model, family: 'reasoning', effort, budget, reasoning };
}

/** What was written, within what was left of the budget once the model had thought. */
function within(text, j) {
  const room = Math.max(0, j.budget - j.reasoning);
  const need = tokensOf(text);
  if (need <= room) return { content: text, finish: 'stop', out: need };
  return { content: String(text).slice(0, room * 4), finish: 'length', out: room };
}

function contentFor(p, j) {
  const g = globalThis;
  if (typeof g.__contractContent === 'function') return g.__contractContent(p, j);
  const next = (g.__contractScript ??= []).shift();
  if (next instanceof Error) throw next;
  if (next === undefined) return '';
  return typeof next === 'string' ? next : JSON.stringify(next);
}

/** Every object in a strict schema closed: additionalProperties false and every property required. */
function strictProblem(schema, path = 'schema') {
  if (!schema || typeof schema !== 'object') return null;
  if (Array.isArray(schema.anyOf)) {
    for (const [i, s] of schema.anyOf.entries()) {
      const p = strictProblem(s, `${path}.anyOf[${i}]`);
      if (p) return p;
    }
  }
  const types = [].concat(schema.type ?? []);
  if (types.includes('object')) {
    if (schema.additionalProperties !== false) return `${path}: additionalProperties must be false`;
    const props = Object.keys(schema.properties ?? {});
    const req = new Set(schema.required ?? []);
    const missing = props.find((k) => !req.has(k));
    if (missing) return `${path}: '${missing}' must be in required`;
    for (const k of props) {
      const p = strictProblem(schema.properties[k], `${path}.${k}`);
      if (p) return p;
    }
  }
  if (types.includes('array')) return strictProblem(schema.items, `${path}[]`);
  return null;
}

const textOfInput = (p) => `${p.instructions ?? ''} ${typeof p.input === 'string' ? p.input : JSON.stringify(p.input ?? '')}`;

/** A Responses call as the real API would judge it. */
export function judgeResponses(p) {
  const model = String(p?.model ?? '');
  const c = CONTRACT[model];
  if (!c || (globalThis.__contractUnavailable ?? []).includes(model)) {
    return { error: apiError(404, `The model \`${model}\` does not exist or you do not have access to it.`, { code: 'model_not_found' }) };
  }
  for (const k of ['max_tokens', 'max_completion_tokens', 'messages', 'response_format', 'reasoning_effort']) {
    if (p[k] !== undefined) return { error: apiError(400, `Unsupported parameter: '${k}'.`, { param: k, code: 'unsupported_parameter' }) };
  }
  const format = p.text?.format;
  // the real API looks for the word in the INPUT messages only, never in the instructions (found by the live smoke run)
  if (format?.type === 'json_object' && !/json/i.test(typeof p.input === 'string' ? p.input : JSON.stringify(p.input ?? ''))) {
    return { error: apiError(400, "Response input messages must contain the word 'json' in some form to use 'text.format' of type 'json_object'.", { param: 'input' }) };
  }
  if (format?.type === 'json_schema') {
    if ((globalThis.__contractNoSchema ?? []).includes(model)) return { error: apiError(400, "Invalid parameter: 'text.format' of type 'json_schema' is not supported with this model.", { param: 'text.format' }) };
    const problem = format.strict ? strictProblem(format.schema) : null;
    if (problem) return { error: apiError(400, `Invalid schema for response_format '${format.name}': ${problem}.`, { param: 'text.format.schema' }) };
  }
  if (c.family === 'classic') {
    if (p.reasoning !== undefined) return { error: apiError(400, "Unsupported parameter: 'reasoning.effort' is not supported with this model.", { param: 'reasoning.effort', code: 'unsupported_parameter' }) };
    return { model, family: 'classic', effort: null, budget: p.max_output_tokens ?? 16384, reasoning: 0 };
  }
  const effort = p.reasoning?.effort ?? c.effort;
  if (!c.efforts.includes(effort)) {
    return { error: apiError(400, `Unsupported value: 'reasoning.effort' does not support '${effort}' with this model. Supported values are: ${c.efforts.map((e) => `'${e}'`).join(', ')}.`, { param: 'reasoning.effort', code: 'unsupported_value' }) };
  }
  for (const k of ['temperature', 'top_p']) {
    if (p[k] !== undefined && p[k] !== 1 && effort !== 'none') {
      return { error: apiError(400, `Unsupported parameter: '${k}' is not supported with this model.`, { param: k, code: 'unsupported_parameter' }) };
    }
  }
  const budget = p.max_output_tokens ?? 100000;
  const reasoning = Math.min(budget, (globalThis.__contractReasoning ?? REASONING)[effort] ?? 0);
  return { model, family: 'reasoning', effort, budget, reasoning };
}

async function answerResponses(p, entry) {
  const j = judgeResponses(p);
  if (j.error) {
    entry.outcome = `${j.error.status} ${j.error.param ?? j.error.code ?? ''}`.trim();
    throw j.error;
  }
  const g = globalThis;
  const next = typeof g.__contractContent === 'function' ? g.__contractContent(p, j) : (g.__contractScript ??= []).shift();
  if (next instanceof Error) throw next;
  const refusal = next && typeof next === 'object' && typeof next.refusal === 'string' ? next.refusal : null;
  const text = refusal != null ? '' : next === undefined ? '' : typeof next === 'string' ? next : JSON.stringify(next);
  const w = within(text, j);
  entry.outcome = refusal != null ? 'refusal' : w.finish === 'stop' ? 'ok' : w.content ? 'cut' : 'empty';
  entry.effort = j.effort;
  entry.budget = j.budget;
  const usage = {
    input_tokens: tokensOf(textOfInput(p)),
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: w.out + j.reasoning,
    output_tokens_details: { reasoning_tokens: j.reasoning },
  };
  usage.total_tokens = usage.input_tokens + usage.output_tokens;
  const content = refusal != null ? [{ type: 'refusal', refusal }] : [{ type: 'output_text', text: w.content, annotations: [] }];
  const res = {
    id: `resp_${(g.__contractCalls ?? []).length}`,
    object: 'response',
    model: j.model,
    status: w.finish === 'stop' ? 'completed' : 'incomplete',
    incomplete_details: w.finish === 'stop' ? null : { reason: 'max_output_tokens' },
    output: [...(j.reasoning ? [{ type: 'reasoning', id: 'rs_1', summary: [] }] : []), { type: 'message', role: 'assistant', status: 'completed', content }],
    usage,
  };
  if (p.stream) {
    return (async function* () {
      yield { type: 'response.created', response: { ...res, status: 'in_progress', output: [], usage: null } };
      if (w.content) yield { type: 'response.output_text.delta', delta: w.content };
      yield { type: res.status === 'completed' ? 'response.completed' : 'response.incomplete', response: res };
    })();
  }
  return res;
}

export default class OpenAI {
  constructor() {
    this.responses = {
      create: async (p) => {
        const g = globalThis;
        const entry = { api: 'responses', model: p?.model, params: p, outcome: null, overlapped: (g.__contractInFlight ?? 0) > 0 };
        (g.__contractCalls ??= []).push(entry);
        g.__contractInFlight = (g.__contractInFlight ?? 0) + 1;
        try {
          if (Number(g.__contractLatency) > 0) await new Promise((r) => setTimeout(r, Number(g.__contractLatency)));
          return await answerResponses(p, entry);
        } finally {
          g.__contractInFlight--;
        }
      },
    };
    this.chat = {
      completions: {
        create: async (p) => {
          const g = globalThis;
          // whether another call was still unanswered when this one was asked (two passes running together)
          const entry = { model: p?.model, params: p, outcome: null, overlapped: (g.__contractInFlight ?? 0) > 0 };
          (g.__contractCalls ??= []).push(entry);
          g.__contractInFlight = (g.__contractInFlight ?? 0) + 1;
          try {
            if (Number(g.__contractLatency) > 0) await new Promise((r) => setTimeout(r, Number(g.__contractLatency)));
            return await answer(p, entry, g);
          } finally {
            g.__contractInFlight--;
          }
        },
      },
    };
  }
}

async function answer(p, entry, g) {
  const j = judge(p);
  if (j.error) {
    entry.outcome = `${j.error.status} ${j.error.param ?? j.error.code ?? ''}`.trim();
    throw j.error;
  }
  const text = contentFor(p, j);
  if (text instanceof Error) throw text;
  const w = within(text, j);
  entry.outcome = w.finish === 'stop' ? 'ok' : w.content ? 'cut' : 'empty';
  entry.effort = j.effort;
  entry.budget = j.budget;
  const usage = {
    prompt_tokens: tokensOf(JSON.stringify(p.messages ?? [])),
    completion_tokens: w.out + j.reasoning,
    completion_tokens_details: { reasoning_tokens: j.reasoning },
  };
  if (p.stream) {
    const step = Number(g.__contractChunk) > 0 ? Number(g.__contractChunk) : Math.max(1, w.content.length);
    return (async function* () {
      for (let i = 0; i < Math.max(1, w.content.length); i += step) yield { model: j.model, choices: [{ delta: { content: w.content.slice(i, i + step) } }] };
      yield { model: j.model, choices: [{ delta: {}, finish_reason: w.finish }] };
      if (p.stream_options?.include_usage) yield { model: j.model, choices: [], usage };
    })();
  }
  return { model: j.model, choices: [{ message: { content: w.content }, finish_reason: w.finish }], usage };
}
