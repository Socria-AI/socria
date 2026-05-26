// lib/openai.ts
// Server-only OpenAI client. Never import this in a client component.

import OpenAI from 'openai';

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  _client = new OpenAI({ apiKey: key });
  return _client;
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Rough token estimator — 4 chars ≈ 1 token. Good enough for usage tracking.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
