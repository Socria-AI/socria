// app/api/captures/route.ts — Logos 4, Quick Capture: the private inbox.
//
// GET                                   → { captures } | { captures: [], unavailable: true }
// POST   { captures: Capture[] }        → { added }      one typed now, or a device's batch
// PATCH  { id, text, attachment|null }  → { capture }
// DELETE { id }                         → { ok }
//
// Signed in only: a signed-out inbox lives in the browser (lib/logos4/
// captures.ts readLocalCaptures). Every capture is shaped by the same
// cleaner the browser uses — the composer's attachment sanitiser, its limits —
// before it is stored. Nothing here turns a capture into anything else.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { cleanCapture, cleanCaptureAttachment, cleanCaptureText, isCaptureId, type Capture } from '@/lib/logos4/captures';
import { CaptureStoreError, addCaptures, deleteCapture, listCaptures, updateCapture } from '@/lib/logos4/captures-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The most a device moves at once; the inbox asks again for the rest. */
const MAX_BATCH = 50;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function userId(): string | null {
  try {
    return auth().userId;
  } catch {
    return null;
  }
}

function failure(e: unknown) {
  if (e instanceof CaptureStoreError) {
    const status = e.kind === 'unavailable' ? 503 : e.kind === 'full' ? 409 : e.kind === 'not-found' ? 404 : 500;
    return json({ error: e.message, code: e.kind }, status);
  }
  console.error('[captures] failed', (e as Error)?.message);
  return json({ error: 'The inbox could not be reached.' }, 500);
}

async function gate(req: NextRequest): Promise<{ uid: string } | NextResponse> {
  const uid = userId();
  if (!uid) return json({ error: 'Sign in to keep captures in your account.' }, 401);
  const limited = await enforceRateLimit(req, uid, 'capture');
  if (limited) return limited;
  return { uid };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  try {
    const list = await listCaptures(g.uid);
    return list === null ? json({ captures: [], unavailable: true }) : json({ captures: list });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  const body = (await req.json().catch(() => null)) as { captures?: unknown } | null;
  const raw = Array.isArray(body?.captures) ? body!.captures : [];
  if (!raw.length) return json({ error: 'Nothing to keep.' }, 400);
  if (raw.length > MAX_BATCH) return json({ error: `At most ${MAX_BATCH} at a time.` }, 413);
  const now = Date.now();
  const list = raw.map((x) => cleanCapture(x, now)).filter((c): c is Capture => !!c);
  if (!list.length) return json({ error: 'A capture needs some words or a photo.' }, 400);
  try {
    const added = await addCaptures(g.uid, list);
    return json({ added: added.map((c) => c.id) });
  } catch (e) {
    return failure(e);
  }
}

export async function PATCH(req: NextRequest) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isCaptureId(body.id)) return json({ error: 'Unknown capture.' }, 400);
  const text = cleanCaptureText(body.text);
  const attachment = body.attachment === null ? null : cleanCaptureAttachment(body.attachment) ?? null;
  if (!text && !attachment) return json({ error: 'A capture needs some words or a photo. Delete it instead?' }, 400);
  try {
    return json({ capture: await updateCapture(g.uid, body.id, { text, attachment }) });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(req: NextRequest) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isCaptureId(body.id)) return json({ error: 'Unknown capture.' }, 400);
  try {
    await deleteCapture(g.uid, body.id);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
