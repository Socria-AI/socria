// lib/logos5/ask-json.ts — one JSON answer from the Logos model, for the
// study routes. The configured model first; the fallback model when the
// configured one is not there. Throws when neither answers; returns null when
// what came back is not JSON. SERVER ONLY.

import OpenAI from 'openai';
import { tracked } from '@/lib/openai-usage';
import { LOGOS_FALLBACK_MODEL, LOGOS_MODEL } from '@/lib/logos';
import type { Asked } from './study-ask';

export async function askJson(asked: Asked, opts: { model?: string; maxTokens: number }): Promise<unknown | null> {
  const openai = tracked(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), 'logos/study');
  const configured = opts.model || process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;
  const call = (model: string) =>
    openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: opts.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: asked.system },
        { role: 'user', content: asked.user },
      ],
    });
  let completion;
  try {
    completion = await call(configured);
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status;
    if ((status === 404 || /model/i.test(e?.message || '')) && configured !== LOGOS_FALLBACK_MODEL) completion = await call(LOGOS_FALLBACK_MODEL);
    else throw e;
  }
  const text = completion.choices?.[0]?.message?.content;
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
