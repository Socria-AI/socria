// app/api/docs/brief/route.ts
// POST /api/docs/brief { doc } → { brief, note? }
//
// SOCRIA'S READING OF ONE DOCUMENT (lib/docs/brief.ts): what it is, what it
// finds, how it argues, its terms, what its tables show, the limits it
// admits — every point pointing at the passages it rests on, kept only as far
// as the document bears it out. Made when the person asks for it, never on
// its own; kept on their device, not here.
//
// The reading arrives from the browser that read the file (documents stay on
// the device, lib/docs/client.ts) and is re-sanitised like everything else.
// When no model answers, or what it says does not hold up, the analysis is
// made without one — the structure, how well the file was read, its tables
// and charts — and says so (`plain`).
//
// Who may ask: a signed-in account, or the typed access key, like every Logos
// route. It counts against the rate limit and, for a free account, against
// the week's tokens (Sleep Mode). The document counts once against the
// month's documents, under the same key as anywhere else it goes
// (lib/quota.ts claimUnit) — a document already in a conversation costs
// nothing more.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { tierOf } from '@/lib/model-router';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { sanitizeSourceDoc } from '@/lib/docs/sanitize';
import { analysable, briefAsk, briefPoints, plainBrief, sanitizeBrief } from '@/lib/docs/brief';
import { askJson } from '@/lib/logos5/ask-json';
import { claimUnit, refusal } from '@/lib/quota';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withMeter(async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Logos requires an access key.', requiresKey: true }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const doc = sanitizeSourceDoc(body?.doc);
  if (!doc) return NextResponse.json({ error: 'There is no document to read.' }, { status: 400 });
  if (!analysable(doc)) return NextResponse.json({ error: 'There is not enough readable text in this document to analyse. If it is a scan, read its pages from their pictures first.' }, { status: 422 });

  const plan = await resolvePlanForRequest(req, userId);
  // one document is one document wherever it goes: claimed by its id, so one already in a
  // conversation costs nothing more, and the month's documents spent is said, not worked around
  if (userId) {
    const claim = await claimUnit(userId, plan, 'documents', doc.id);
    if (!claim.ok) {
      const r = refusal('documents', claim);
      return NextResponse.json(r.body, { status: r.status });
    }
  }

  const plain = (note: string) => NextResponse.json({ brief: plainBrief(doc), note });
  if (!process.env.OPENAI_API_KEY) return plain('Socria could not analyse this document just now. Here is its structure and how well it was read.');
  try {
    // THE WEEK'S TOKENS (lib/sleep-server.ts): a free account whose week is spent rests until Monday
    // 00:00 UTC — no model is asked; one that is awake is metered from here.
    const sleep = await sleepGate(req, userId, plan);
    if (sleep.refuse) return sleep.refuse;
    if (sleep.meter) meterFor(sleep.meter);
    const asked = briefAsk(doc);
    const raw = await askJson(asked, { model: process.env.OPENAI_MODEL_LOGOS_BRIEF || process.env.OPENAI_MODEL_LOGOS_STUDY, tier: tierOf(userId, plan), maxTokens: 2600 });
    if (!raw) return plain('Socria’s analysis did not come back in a form it could check. Here is the document’s structure and how well it was read.');
    const brief = sanitizeBrief(raw, doc, { shown: asked.shown, total: asked.total });
    if (!briefPoints(brief)) return NextResponse.json({ brief: { ...plainBrief(doc), dropped: brief.dropped }, note: 'Nothing in Socria’s analysis held up against the document’s own passages, so none of it is shown. Here is its structure and how well it was read.' });
    console.log('[docs] brief doc=%s points=%d dropped=%d read=%d/%d', doc.id.slice(0, 8), briefPoints(brief), brief.dropped, brief.read.shown, brief.read.total);
    return NextResponse.json({ brief });
  } catch (e) {
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.warn('[docs] brief: the model did not answer', e instanceof Error ? e.message : e);
    return plain('Socria could not analyse this document just now. Here is its structure and how well it was read.');
  }
});
