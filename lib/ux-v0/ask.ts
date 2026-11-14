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

import type OpenAI from 'openai';
import { firstAccepted } from '../model-router';
import { cannotSee } from '../model-params';
import { usageOf } from './model';
import type { Usage } from './types';

export interface AskOptions {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  /** images for the model to look at: a crop, a thumbnail */
  images?: { url: string; detail: 'low' | 'high' }[];
  label: string;
}

export interface Asked {
  json: unknown;
  raw: string;
  usage: Usage;
  model: string;
}

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

export async function askJson(openai: OpenAI, ladder: string[], o: AskOptions): Promise<Asked> {
  const userContent: any = o.images?.length
    ? [{ type: 'text', text: o.user }, ...o.images.map((im) => ({ type: 'image_url', image_url: { url: im.url, detail: im.detail } }))]
    : o.user;
  const make = (model: string) =>
    openai.chat.completions.create({
      model,
      temperature: o.temperature ?? 0.5,
      max_tokens: o.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: o.system },
        { role: 'user', content: userContent },
      ],
    });
  const { result, model } = await firstAccepted(
    ladder,
    make,
    (from, to, why) => console.warn('ux-v0 %s: %s refused (%s); asking %s', o.label, from, why, to),
    o.images?.length ? cannotSee : undefined
  );
  const raw = result.choices?.[0]?.message?.content ?? '';
  return { json: readJson(raw), raw, usage: usageOf(model, (result as any).usage), model };
}
