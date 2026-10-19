// app/api/transcribe/route.ts — Logos 4, Voice to Text.
//
// GET  → { available }   may the mic be drawn: the feature is on and a
//                         transcription key is set. Says nothing else.
// POST multipart { audio } → { text }
//
// The audio goes to the provider already in use (OpenAI's transcription
// endpoint) and the words come back to the composer to be read and edited;
// nothing is sent on the person's behalf. The audio is not written anywhere:
// it lives in this request's memory and is gone when the request ends.
//
// Signed in, or holding an access key, like the conversation itself; each
// call is a paid transcription, so it has its own rate limit.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse, unauthorized } from '@/lib/route-guard';
import { audioExtension, audioRefusal, cleanTranscript } from '@/lib/logos4/voice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const off = (v: string | undefined) => /^(off|0|false|no)$/i.test((v ?? '').trim());
const available = () => !off(process.env.NEXT_PUBLIC_LOGOS4_VOICE) && !!process.env.OPENAI_API_KEY;

/** The model asked first, and the one that has always existed if that name is refused. */
const MODEL = () => process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-4o-mini-transcribe';
const FALLBACK = 'whisper-1';

function userId(): string | null {
  try {
    return auth().userId;
  } catch {
    return null;
  }
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET() {
  return json({ available: available() });
}

async function transcribe(audio: Blob, ext: string, model: string, language: string | null): Promise<Response> {
  const form = new FormData();
  form.append('file', audio, `speech.${ext}`);
  form.append('model', model);
  form.append('response_format', 'json');
  if (language) form.append('language', language);
  // OPENAI_BASE_URL, as the SDK reads it everywhere else (a local stand-in in development)
  const base = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
  return fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(55_000),
  });
}

export async function POST(req: NextRequest) {
  if (!available()) return json({ error: 'Voice input isn’t available here.' }, 503);
  const uid = userId();
  if (!mayUse(req, uid)) return unauthorized();
  const limited = await enforceRateLimit(req, uid, 'voice');
  if (limited) return limited;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'No recording arrived.' }, 400);
  }
  const audio = form.get('audio');
  if (!audio || typeof audio === 'string') return json({ error: 'No recording arrived.' }, 400);
  const refused = audioRefusal(audio.size, audio.type);
  if (refused) return json({ error: refused.error }, refused.status);
  const ext = audioExtension(audio.type)!;
  // a two-letter language hint from the browser, when it gave one; never required
  const lang = String(form.get('language') ?? '').toLowerCase().slice(0, 2);
  const language = /^[a-z]{2}$/.test(lang) ? lang : null;

  try {
    let res = await transcribe(audio, ext, MODEL(), language);
    // A deployment pointed at a model name its account does not have: the
    // original model answers rather than the mic failing for everyone.
    if ((res.status === 400 || res.status === 404) && MODEL() !== FALLBACK) {
      const why = await res.clone().text().catch(() => '');
      if (/model/i.test(why)) res = await transcribe(audio, ext, FALLBACK, language);
    }
    if (!res.ok) {
      console.error('[transcribe] provider refused', res.status);
      return json({ error: res.status === 429 ? 'Transcription is busy right now. Try again in a moment.' : 'That recording couldn’t be transcribed. Try again.' }, 502);
    }
    const body = (await res.json().catch(() => ({}))) as { text?: unknown };
    const text = cleanTranscript(body.text);
    if (!text) return json({ error: 'No words were heard. Try again a little closer to the mic.' }, 422);
    return json({ text });
  } catch (e) {
    console.error('[transcribe] failed', (e as Error)?.name);
    return json({ error: 'That recording couldn’t be transcribed. Try again.' }, 502);
  }
}
