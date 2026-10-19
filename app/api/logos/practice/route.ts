// app/api/logos/practice/route.ts
// POST /api/logos/practice { topic, review, docs, avoid } → { events, balance, accounts, dropped }
//
// LOGOS 5, "PRACTICE THIS" on bookkeeping: journal-entry practice made from
// the person's own passages (lib/logos5/study.ts sanitizeJournal). An event
// is kept only when every number in it is in the passage it cites; an entry
// only when its debits equal its credits and its amounts are the passage's.
// When nothing holds up, it says so (422) and the browser makes
// fill-in-the-blank practice from the same passages instead — which needs no
// model at all.
//
// Who may ask: a signed-in account, or the typed access key. It counts
// against the rate limit.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sanitizeSourceDoc } from '@/lib/docs/sanitize';
import type { SourceDoc } from '@/lib/docs/types';
import { askJson } from '@/lib/logos5/ask-json';
import { sanitizeJournal, sanitizeStudy, type StudyTopic } from '@/lib/logos5/study';
import { entriesAsk } from '@/lib/logos5/study-ask';
import { cleanText } from '@/lib/objects/display-base';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The topics as the study holds them, read through the study's own sanitizer. */
function topicsOf(raw: unknown): StudyTopic[] {
  const s = sanitizeStudy({ v: 1, topics: Array.isArray(raw) ? raw : [], goal: 'exam' });
  return s?.topics ?? [];
}

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Logos requires an access key.', requiresKey: true }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const [topic] = topicsOf([body?.topic]);
  if (!topic) return NextResponse.json({ error: 'That topic could not be read.' }, { status: 400 });
  const review = topicsOf(body?.review).slice(0, 4);
  const docs: SourceDoc[] = [];
  for (const raw of (Array.isArray(body?.docs) ? body.docs : []).slice(0, 6)) {
    const d = sanitizeSourceDoc(raw);
    if (d && !docs.some((x) => x.id === d.id)) docs.push(d);
  }
  if (!docs.some((d) => topic.blocks.some((b) => b.doc === d.id))) return NextResponse.json({ error: 'The files this topic comes from are not on this device.' }, { status: 409 });
  const avoid = (Array.isArray(body?.avoid) ? body.avoid : []).map((a: unknown) => cleanText(a, 160)).filter(Boolean).slice(0, 12);

  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'Socria cannot make these just now.' }, { status: 503 });
  try {
    const raw = await askJson(entriesAsk(topic, docs, review, avoid), { model: process.env.OPENAI_MODEL_LOGOS_STUDY, maxTokens: 1800 });
    const made = sanitizeJournal(raw, docs);
    if (!made.events.length) return NextResponse.json({ error: 'Nothing came back that these pages bear out.', dropped: made.dropped }, { status: 422 });
    return NextResponse.json(made);
  } catch (e) {
    console.warn('logos practice: the model did not answer', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Socria could not make these just now — try again in a moment.' }, { status: 502 });
  }
}
