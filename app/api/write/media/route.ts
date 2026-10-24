// app/api/write/media/route.ts
// GET  → { by }            whose folder this person's pictures go in (a digest, never the account id)
// POST → { ok, id, by, w, h }  one picture of their writing kept, under their account
//
// The bytes come as the request's body, with the id the browser chose for
// them in `x-media-id` — so the writing can point at a picture the moment it
// is put in, before the upload has landed (lib/write/media.ts). What is kept
// is decided by the bytes: a PNG, JPEG, GIF or WebP whose own header gives a
// sensible size, and no more than MAX_MEDIA_BYTES; anything else is refused
// with a sentence. Signed out, pictures stay in the browser and never come here.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ownerPrefix } from '@/lib/upload-paths';
import { imageSize, MAX_MEDIA_BYTES, MEDIA_ID, sniffImage } from '@/lib/write/media';
import { putMedia } from '@/lib/write/media-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Sign in to keep pictures with your writing.' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'media');
  if (limited) return limited;
  return NextResponse.json({ by: ownerPrefix(userId) });
}

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Sign in to keep pictures with your writing.' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'media');
  if (limited) return limited;

  const id = req.headers.get('x-media-id') ?? '';
  if (!MEDIA_ID.test(id)) return NextResponse.json({ error: 'Which picture?' }, { status: 400 });
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_MEDIA_BYTES) return NextResponse.json({ error: 'That picture is too large — 4 MB is the most.' }, { status: 413 });

  let bytes: Uint8Array | null;
  try {
    bytes = await readUpTo(req, MAX_MEDIA_BYTES);
  } catch {
    return NextResponse.json({ error: 'The picture did not arrive.' }, { status: 400 });
  }
  if (!bytes) return NextResponse.json({ error: 'That picture is too large — 4 MB is the most.' }, { status: 413 });
  if (!bytes.length) return NextResponse.json({ error: 'The picture did not arrive.' }, { status: 400 });
  const type = sniffImage(bytes);
  const size = type ? imageSize(bytes, type) : null;
  if (!type || !size || size.w > 20_000 || size.h > 20_000) {
    return NextResponse.json({ error: 'That is not a picture that can be kept here — PNG, JPEG, GIF or WebP can.' }, { status: 415 });
  }

  try {
    const kept = await putMedia(userId, id, bytes, type);
    if (!kept.ok) {
      console.error('[socria/write-media] upload failed', kept.error);
      return NextResponse.json({ error: 'The picture could not be kept just now — it is still on this device.' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, id, by: kept.by, w: size.w, h: size.h });
  } catch (e) {
    console.error('[socria/write-media] upload threw', e);
    return NextResponse.json({ error: 'The picture could not be kept just now — it is still on this device.' }, { status: 503 });
  }
}

// The body, read no further than `max` bytes: null past it. A body sent
// without its length (chunked) is held to the same ceiling as one with it.
async function readUpTo(req: NextRequest, max: number): Promise<Uint8Array | null> {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) (out.set(c, at), (at += c.length));
  return out;
}
