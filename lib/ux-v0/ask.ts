import 'server-only';
// lib/ux-v0/ask.ts — one JSON call to the model, the house way.
//
// The client is the route's own `tracked(new OpenAI(...))` (lib/openai-usage.ts:
// usage logged, parameters shaped for the model, and the call metered against
// the week's tokens in the route's context). The ladder steps down when a
// model is refused — and, for a call that sends an image, when a model cannot
// see (lib/model-params.ts cannotSee). The answer is parsed as JSON, leniently
// (a fenced block is read too); what it means is decided by the caller's own
// validator, never here.
//
// THE RESPONSES API (GPT-6.1 Sol, lib/ux-v0/model.ts). When SocriaUX runs on
// it, the same call goes to `client.responses.create`: the system prompt as
// `instructions`, the user's words (and any image) as `input`, the effort as
// `reasoning.effort`, and the answer's shape as a strict JSON schema where
// the call has one (lib/ux-v0/schemas.ts), plain JSON otherwise. `store` is
// off: a designer's brief, notes and pages are not kept on OpenAI's side for
// later retrieval. The tracked client shapes the call for each model on the
// ladder (lib/model-params.ts shapeResponsesRequest), so a rung without
// reasoning, or without structured outputs, is still asked in a way it takes.

import type OpenAI from 'openai';
import { firstAccepted } from '../model-router';
import { cannotSee, type Effort } from '../model-params';
import { responseText, usageFromResponses } from '../openai-usage';
import { socriauxApi, socriauxEffort, usageOf, type Api } from './model';
import type { JsonFormat } from './schemas';
import type { Usage } from './types';

export interface AskOptions {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  /** images for the model to look at: a crop, a thumbnail */
  images?: { url: string; detail: 'low' | 'high' }[];
  label: string;
  /** the answer's shape, for the Responses API's structured outputs (lib/ux-v0/schemas.ts formatFor) */
  format?: JsonFormat;
}

export interface Asked {
  json: unknown;
  raw: string;
  usage: Usage;
  model: string;
  /** which API answered, and at what effort (for the logs and the evaluation) */
  api: Api;
  effort: Effort | 'default';
  /** the answer stopped early: its cap, or a refusal, or the provider's own reason */
  incomplete: string | null;
}

type Env = Record<string, string | undefined>;

export function readJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export async function askJson(openai: OpenAI, ladder: string[], o: AskOptions, env: Env = process.env): Promise<Asked> {
  const api = socriauxApi(env);
  const effort = socriauxEffort(env);
  const warn = (from: string, to: string, why: string) => console.warn('ux-v0 %s: %s refused (%s); asking %s', o.label, from, why, to);
  const also = o.images?.length ? cannotSee : undefined;
  if (api === 'responses') {
    const make = (model: string): Promise<any> =>
      (openai as any).responses.create({
        model,
        instructions: o.system,
        input: [
          {
            role: 'user',
            // plain JSON mode on the Responses API needs the word in the INPUT, not only in the instructions
            // (a 400 otherwise, found by the first live run): said once, at the end, where a schema is not given
            content: [{ type: 'input_text', text: o.format ? o.user : `${o.user}\n\nAnswer with the one JSON object described.` }, ...(o.images ?? []).map((im) => ({ type: 'input_image', image_url: im.url, detail: im.detail }))],
          },
        ],
        // the cap for the answer: the tracked client gives the reasoning its room on top
        max_output_tokens: o.maxTokens,
        temperature: o.temperature ?? 0.5,
        ...(effort ? { reasoning: { effort } } : {}),
        text: { format: o.format ?? { type: 'json_object' } },
        store: false,
      });
    const { result, model } = await firstAccepted(ladder, make, warn, also);
    const raw = responseText(result);
    const refused = (result?.output ?? []).some((item: any) => item?.type === 'message' && (item.content ?? []).some((c: any) => c?.type === 'refusal'));
    const incomplete = refused ? 'refusal' : result?.status === 'incomplete' ? String(result?.incomplete_details?.reason ?? 'incomplete') : null;
    if (incomplete) console.warn('ux-v0 %s: %s stopped early (%s)', o.label, model, incomplete);
    return { json: readJson(raw), raw, usage: usageOf(model, usageFromResponses(result?.usage) as any), model, api, effort: effort ?? 'default', incomplete };
  }
  const userContent: any = o.images?.length
    ? [{ type: 'text', text: o.user }, ...o.images.map((im) => ({ type: 'image_url', image_url: { url: im.url, detail: im.detail } }))]
    : o.user;
  const make = (model: string) =>
    openai.chat.completions.create({
      model,
      temperature: o.temperature ?? 0.5,
      max_tokens: o.maxTokens,
      ...(effort ? { reasoning_effort: effort } : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: o.system },
        { role: 'user', content: userContent },
      ],
    } as any);
  const { result, model } = await firstAccepted(ladder, make, warn, also);
  const raw = (result as any).choices?.[0]?.message?.content ?? '';
  const finish = (result as any).choices?.[0]?.finish_reason;
  const incomplete = finish === 'length' || finish === 'content_filter' ? String(finish) : null;
  return { json: readJson(raw), raw, usage: usageOf(model, (result as any).usage), model, api, effort: effort ?? 'default', incomplete };
}
