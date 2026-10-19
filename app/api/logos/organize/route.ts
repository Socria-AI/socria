// app/api/logos/organize/route.ts
// POST /api/logos/organize { docs, said, goal } → { sorted, plain?, note? }
//
// LOGOS 5, "ORGANIZE IT": the person's files sorted into topics
// (lib/logos5/study.ts). The model only points at passages; what is kept is
// what the files bear out — passages that exist, quotes cut from them. When
// no model answers, or nothing it says holds up, the files are sorted by
// their own sections instead, and the reply says so (`plain`). Nothing is
// stored here: the browser keeps the study in the line of thinking's map.
//
// The readings arrive from the browser that read them (documents stay on the
// device, lib/docs/client.ts) and are re-sanitised like everything else.
//
// Who may ask: a signed-in account, or the typed access key, like every Logos
// route. It counts against the rate limit.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sanitizeSourceDoc } from '@/lib/docs/sanitize';
import type { SourceDoc } from '@/lib/docs/types';
import { askJson } from '@/lib/logos5/ask-json';
import { INTENT_KEYS, intentOf, plainSort, sanitizeSorted, type Intent } from '@/lib/logos5/study';
import { sortAsk } from '@/lib/logos5/study-ask';
import { cleanText } from '@/lib/objects/display-base';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_DOCS = 6;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Logos requires an access key.', requiresKey: true }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const docs: SourceDoc[] = [];
  for (const raw of (Array.isArray(body?.docs) ? body.docs : []).slice(0, MAX_DOCS)) {
    const d = sanitizeSourceDoc(raw);
    if (d && !docs.some((x) => x.id === d.id)) docs.push(d);
  }
  if (!docs.length) return NextResponse.json({ error: 'There are no files to sort.' }, { status: 400 });
  const said = cleanText(body?.said, 300);
  const goal: Intent = INTENT_KEYS.includes(body?.goal) ? body.goal : intentOf(said, docs.length);

  const plain = () => {
    const sorted = plainSort(docs);
    return sorted
      ? NextResponse.json({ sorted, plain: true, note: 'Sorted by the files’ own sections — Socria could not sort them just now.' })
      : NextResponse.json({ error: 'There is not enough readable text in these files to sort.' }, { status: 422 });
  };
  if (!process.env.OPENAI_API_KEY) return plain();
  try {
    const raw = await askJson(sortAsk(docs, said, goal), { model: process.env.OPENAI_MODEL_LOGOS_STUDY, maxTokens: 3200 });
    const sorted = sanitizeSorted(raw, docs);
    if (!sorted) return plain();
    return NextResponse.json({ sorted });
  } catch (e) {
    console.warn('logos organize: the model did not answer', e instanceof Error ? e.message : e);
    return plain();
  }
}
