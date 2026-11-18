// lib/model-params.ts — EVERY REQUEST SHAPED FOR THE MODEL IT GOES TO.
//
// THE FAULT THIS ENDS. Every call in the app was written for the models it
// started on — `max_tokens` and a fixed `temperature` — and every call to the
// models the router names (GPT-6 Luna, GPT-6.1 Terra and Sol, and the GPT-5.6
// models below them) was refused for it: those are reasoning models, which
// take `max_completion_tokens`, count their reasoning against it, and accept a
// temperature only with reasoning switched off. The refusal names "this
// model", so the routes read it as the model being unavailable and stepped
// down — the reply and the map to the last rung of each ladder (GPT-4o mini on
// the free plan, GPT-4o on Socria One), and the easy view, experiences,
// explore, read, write and synthesis, which stepped down one rung to another
// GPT-5.6 model refused the same way, not at all. Nothing named in the routing
// table ever ran.
//
// What is decided here, purely, for lib/openai-usage.ts (every client in the
// app is wrapped there, so every call is shaped the same way):
//
//   traitsOf(model)        the model's family: `classic` (GPT-4o, GPT-4.1 …,
//                          which take everything as it was) or `reasoning`
//                          (o-series, GPT-5.x, GPT-6.x), and whether it can
//                          switch reasoning off ("none").
//   shapeRequest(params)   the call, as that family takes it: for a reasoning
//                          model `max_tokens` becomes `max_completion_tokens`
//                          with room for the reasoning on top, an effort is
//                          set (none where the model has it — the answer
//                          streams at once and a temperature still holds —
//                          low where it does not), and the sampling
//                          parameters a reasoning model refuses are dropped.
//                          A classic model's call is not touched.
//   adaptRefused(params,e) a refusal of one PARAMETER, read: the call again
//                          without it (or with it renamed) on the same model —
//                          never a step down the ladder, which is for a model
//                          that is not there. Null when the refusal is not one
//                          this can answer.
//   failureOf(e)           what kind of failure an error is: the model itself
//                          (not enabled, withdrawn), one parameter, a passing
//                          fault (rate limit, the provider's 5xx), or anything
//                          else (the request, the prompt, a policy) — which
//                          lib/model-router.ts firstAccepted steps down for.
//
// OPENAI_REASONING_EFFORT sets the effort for every reasoning call (e.g. "low"
// if "none" is ever refused, "medium" for more thought at more cost and
// latency), read at call time.
//
// PURE: no network, no clock.

export type Family = 'classic' | 'reasoning';

export interface ModelTraits {
  family: Family;
  /** reasoning can be switched off ("none"), and a temperature is then accepted */
  none: boolean;
}

/** Reasoning models by id: the o-series and every GPT from 5 on. */
const REASONING_ID = /^(?:o\d|gpt-(?:[5-9]|\d{2,}))(?:[.\-:]|$)/i;
/** The reasoning models whose effort can be "none" (OpenAI's GPT-6 model pages). GPT-6.1 Sol cannot. */
const NONE_OK = /^gpt-6(?:\.\d+)?-(?:luna|terra)(?:[-:.]|$)/i;

export function traitsOf(model: string | null | undefined): ModelTraits {
  const id = String(model ?? '').trim();
  if (!REASONING_ID.test(id)) return { family: 'classic', none: false };
  return { family: 'reasoning', none: NONE_OK.test(id) };
}

export const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

/**
 * Room for the reasoning, on top of what the call's own cap allowed for the
 * answer. A reasoning model counts what it thinks against
 * `max_completion_tokens`; a cap written for the answer alone is spent
 * thinking at any effort above none, and the answer comes back empty or cut
 * (finish_reason "length"). The cap is a ceiling, not a charge: room unused
 * costs nothing.
 */
export const REASONING_ROOM: Record<Effort, number> = { none: 0, minimal: 1024, low: 3072, medium: 8192, high: 16384, xhigh: 24576, max: 32768 };

/** Parameters a reasoning model refuses unless reasoning is off. */
const SAMPLING = ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty', 'logprobs', 'top_logprobs', 'logit_bias'] as const;

type Params = Record<string, unknown>;
type Env = Record<string, string | undefined>;

const effortOf = (v: unknown): Effort | null => (typeof v === 'string' && (EFFORTS as readonly string[]).includes(v.trim().toLowerCase()) ? (v.trim().toLowerCase() as Effort) : null);

/** The effort a reasoning call runs at: the call's own, else the environment's, else none where the model has it, else low. */
export function effortFor(model: string, asked?: unknown, env: Env = {}): Effort {
  const t = traitsOf(model);
  const own = effortOf(asked) ?? effortOf(env.OPENAI_REASONING_EFFORT);
  const chosen = own ?? (t.none ? 'none' : 'low');
  // "none" on a model that has no such setting is refused: the lowest it has is low
  return chosen === 'none' && !t.none ? 'low' : chosen;
}

/**
 * A call, as the model it goes to takes it. Returns the same object when
 * nothing changes (a classic model, or a call already written for its model).
 */
export function shapeRequest<P extends Params>(params: P, env: Env = {}): P {
  const model = String(params?.model ?? '');
  const t = traitsOf(model);
  if (t.family === 'classic') {
    if (params.reasoning_effort === undefined && params.verbosity === undefined) return params;
    // an effort written for a reasoning model, sent to one without reasoning, is refused: dropped
    const { reasoning_effort: _e, verbosity: _v, ...rest } = params;
    void _e;
    void _v;
    return rest as P;
  }
  const effort = effortFor(model, params.reasoning_effort, env);
  const out: Params = { ...params, reasoning_effort: effort };
  // the cap the call wrote was for the answer: the reasoning gets room of its own on top
  if (typeof params.max_tokens === 'number') {
    delete out.max_tokens;
    out.max_completion_tokens = Math.round(params.max_tokens) + REASONING_ROOM[effort];
  }
  // a temperature (or any sampling setting) is accepted only with reasoning off
  if (effort !== 'none') for (const k of SAMPLING) delete out[k];
  return out as P;
}

// ── what went wrong ──────────────────────────────────────────────────

export type Failure = 'model' | 'param' | 'transient' | 'other';

interface ErrLike {
  status?: number;
  code?: string | null;
  param?: string | null;
  type?: string | null;
  message?: string;
  error?: { message?: string; code?: string | null; param?: string | null; type?: string | null } | null;
  response?: { status?: number };
  name?: string;
}

const statusOf = (e: ErrLike | null) => e?.status ?? e?.response?.status;
const messageOf = (e: ErrLike | null) => `${e?.message ?? ''} ${e?.error?.message ?? ''}`;

/** The parameter a refusal names, if it names one. */
export function refusedParam(e: unknown): string | null {
  const x = e as ErrLike | null;
  const named = x?.param ?? x?.error?.param;
  if (typeof named === 'string' && named) return named.replace(/^.*\./, '');
  const m = /Unsupported (?:parameter|value): '([A-Za-z_]+)'|Unrecognized request argument supplied: ([A-Za-z_]+)|'([A-Za-z_]+)' is not supported/.exec(messageOf(x));
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

/**
 * What kind of failure an error is. A 400 that names a parameter is the
 * parameter, however its message reads ("…is not supported with this
 * model"): the model is there, and answers once asked the way it takes.
 */
export function failureOf(e: unknown): Failure {
  const x = e as ErrLike | null;
  if (!x) return 'other';
  const status = statusOf(x);
  const code = `${x.code ?? ''} ${x.error?.code ?? ''}`;
  const msg = messageOf(x);
  if (status === 400 && (/unsupported_(?:parameter|value)/.test(code) || /Unsupported (?:parameter|value)|Unrecognized request argument/i.test(msg))) return 'param';
  if (status === 404 || /model_not_found/.test(code) || /does not exist or you do not have access|model .{0,60}(?:not found|deprecated|decommissioned|no longer available)|no such model/i.test(msg)) return 'model';
  // the account's credit is spent: every model on it is, so a step down would fail the same way
  if (/insufficient_quota/.test(code)) return 'other';
  if (status === 429 || (typeof status === 'number' && status >= 500) || /APIConnection(?:Timeout)?Error/.test(x.name ?? '') || /ETIMEDOUT|ECONNRESET|socket hang up|fetch failed/i.test(msg)) return 'transient';
  return 'other';
}

/** Never changed by an adaptation: what the call is. */
const ESSENTIAL = new Set(['model', 'messages', 'stream', 'input', 'tools', 'tool_choice', 'functions']);

/**
 * The call again, without (or with renamed) the one parameter the provider
 * refused — on the same model. Null when the refusal is not of a parameter
 * this call has, or the call is already as plain as it can be made.
 */
export function adaptRefused<P extends Params>(params: P, e: unknown): P | null {
  if (failureOf(e) !== 'param') return null;
  const param = refusedParam(e);
  if (!param) return null;
  const out: Params = { ...params };
  const t = traitsOf(String(params.model ?? ''));
  switch (param) {
    case 'max_tokens': {
      if (typeof params.max_tokens !== 'number') return null;
      // a call that names no effort runs at the model's default (medium), and the room is for that
      const effort = t.family === 'reasoning' && params.reasoning_effort === undefined ? 'medium' : effortFor(String(params.model ?? ''), params.reasoning_effort);
      delete out.max_tokens;
      out.max_completion_tokens = Math.round(params.max_tokens) + (t.family === 'reasoning' ? REASONING_ROOM[effort] : 0);
      return out as P;
    }
    case 'max_completion_tokens': {
      // a provider (or an older model) that knows only max_tokens
      if (typeof params.max_completion_tokens !== 'number' || t.family === 'reasoning') return null;
      delete out.max_completion_tokens;
      out.max_tokens = params.max_completion_tokens;
      return out as P;
    }
    case 'reasoning_effort': {
      if (params.reasoning_effort === undefined) return null;
      const now = effortOf(params.reasoning_effort);
      // no reasoning at all on this model: the effort goes, and the rest of the call is as it was
      if (t.family === 'classic' || /Unsupported parameter|Unrecognized request argument/i.test(messageOf(e as ErrLike))) {
        delete out.reasoning_effort;
        delete out.verbosity;
        return out as P;
      }
      // the setting it has not got: none → low, anything else → the model's own default, with room for it
      if (now === 'none') {
        out.reasoning_effort = 'low';
        for (const k of SAMPLING) delete out[k];
        if (typeof out.max_completion_tokens === 'number') out.max_completion_tokens = (out.max_completion_tokens as number) + REASONING_ROOM.low;
        return out as P;
      }
      delete out.reasoning_effort;
      if (typeof out.max_completion_tokens === 'number') out.max_completion_tokens = Math.max(out.max_completion_tokens as number, REASONING_ROOM.medium + 2048);
      return out as P;
    }
    default: {
      if (ESSENTIAL.has(param) || !(param in params)) return null;
      // a sampling setting, the cache hint, the usage report, a format the model has not got: the call is still the call without it
      delete out[param];
      return out as P;
    }
  }
}

/** A model refusing the image a call sends (a model without vision): a route that sends one may step down for it. */
export function cannotSee(e: unknown): boolean {
  const x = e as ErrLike | null;
  return statusOf(x) === 400 && /image|vision/i.test(messageOf(x)) && failureOf(e) !== 'param';
}

// ── the Responses API ────────────────────────────────────────────────
//
// The same rules for a call made through OpenAI's Responses API
// (`client.responses.create`), which names things differently: the cap is
// `max_output_tokens` (reasoning counts against it, as with
// `max_completion_tokens`), the effort is `reasoning.effort`, and the
// answer's format is `text.format`. A call is written with the cap meant for
// the ANSWER, as a Chat Completions call is; the reasoning gets its room on
// top here, so a cap written for the words is not spent thinking.

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** A Responses API call, as the model it goes to takes it. */
export function shapeResponsesRequest<P extends Params>(params: P, env: Env = {}): P {
  const model = String(params?.model ?? '');
  const t = traitsOf(model);
  const out: Params = { ...params };
  const reasoning = obj(params.reasoning);
  if (t.family === 'classic') {
    // a model without reasoning refuses the setting: the rest of the call is as it was
    delete out.reasoning;
    return out as P;
  }
  const effort = effortFor(model, reasoning.effort, env);
  out.reasoning = { ...reasoning, effort };
  if (typeof params.max_output_tokens === 'number') out.max_output_tokens = Math.round(params.max_output_tokens) + REASONING_ROOM[effort];
  if (effort !== 'none') for (const k of SAMPLING) delete out[k];
  return out as P;
}

/** The input, saying "JSON" if it did not already: the Responses API's JSON mode refuses an input that never says it. */
function withJsonWord(input: unknown): unknown {
  const said = /json/i.test(typeof input === 'string' ? input : JSON.stringify(input ?? ''));
  if (said) return input;
  if (typeof input === 'string') return `${input}\n\nAnswer in JSON.`;
  if (Array.isArray(input)) return [...input, { role: 'user', content: [{ type: 'input_text', text: 'Answer in JSON.' }] }];
  return input;
}

/** Never changed by an adaptation of a Responses call: what the call is. */
const RESPONSES_ESSENTIAL = new Set(['model', 'input', 'instructions', 'stream', 'tools', 'tool_choice', 'max_output_tokens', 'previous_response_id']);

/**
 * The parameter a refused Responses call names: a refusal the Chat rules
 * already read as one parameter, or a 400 that names a setting of the answer's
 * format or of reasoning (`text.format`, `reasoning.effort`), however its code
 * reads, since the model is there either way.
 */
function responsesParamOf(e: unknown): string | null {
  if (failureOf(e) === 'param') return refusedParam(e);
  const x = e as ErrLike | null;
  const named = x?.param ?? x?.error?.param;
  if (statusOf(x) === 400 && typeof named === 'string' && /^(?:text|reasoning)(?:\.|$)/.test(named)) return named.replace(/^.*\./, '');
  return null;
}

/**
 * A Responses call again, without (or with eased) the one setting the model
 * refused, on the same model: a structured format it does not take becomes
 * plain JSON, then no format; an effort it has not got becomes low (for none)
 * or its own default. Null when the refusal is not of a setting this call has.
 */
export function adaptRefusedResponses<P extends Params>(params: P, e: unknown): P | null {
  const param = responsesParamOf(e);
  if (!param) return null;
  const out: Params = { ...params };
  const reasoning = obj(params.reasoning);
  const text = obj(params.text);
  switch (param) {
    case 'effort':
    case 'reasoning':
    case 'summary': {
      if (params.reasoning === undefined) return null;
      if (reasoning.effort === 'none') {
        out.reasoning = { ...reasoning, effort: 'low' };
        for (const k of SAMPLING) delete out[k];
        if (typeof out.max_output_tokens === 'number') out.max_output_tokens = (out.max_output_tokens as number) + REASONING_ROOM.low;
        return out as P;
      }
      delete out.reasoning;
      if (typeof out.max_output_tokens === 'number') out.max_output_tokens = Math.max(out.max_output_tokens as number, REASONING_ROOM.medium + 2048);
      return out as P;
    }
    case 'format':
    case 'text':
    case 'schema':
    case 'strict':
    case 'json_schema': {
      const format = obj(text.format);
      if (format.type === 'json_schema') {
        out.text = { ...text, format: { type: 'json_object' } };
        // plain JSON mode needs the word in the input itself (the instructions do not count)
        out.input = withJsonWord(params.input);
        return out as P;
      }
      if (params.text === undefined) return null;
      delete out.text;
      return out as P;
    }
    default: {
      if (RESPONSES_ESSENTIAL.has(param) || !(param in params)) return null;
      delete out[param];
      return out as P;
    }
  }
}
