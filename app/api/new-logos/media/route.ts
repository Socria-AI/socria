// app/api/new-logos/media/route.ts
// POST → { ok, id, w, h }   one picture for an artifact's media primitive, kept privately under the account
//
// The bytes come as the request's body, with the id the browser chose for them in `x-media-id` (128 random bits), so
// the primitive can point at the picture the moment it is put in. What is kept is decided by the bytes themselves —
// a PNG, JPEG, GIF or WebP whose own header gives a sensible size, no larger than the ceiling — never by a name or a
// claimed type. Kept in the account's own picture storage (lib/new-logos/media-store.ts says why).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { imageSize, MAX_MEDIA_BYTES, MEDIA_ID, sniffImage } from '@/lib/write/media';
import { putMedia } from '@/lib/write/media-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'media');
  if (limited) return limited;
  const id = req.headers.get('x-media-id') ?? '';
  if (!MEDIA_ID.test(id)) return NextResponse.json({ error: 'Which picture?' }, { status: 400 });
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_MEDIA_BYTES) return NextResponse.json({ error: 'That image is too large: 4 MB at most.' }, { status: 413 });
  let bytes: Uint8Array | null;
  try {
    bytes = await readUpTo(req, MAX_MEDIA_BYTES);
  } catch {
    return NextResponse.json({ error: 'The image did not arrive.' }, { status: 400 });
  }
  if (!bytes) return NextResponse.json({ error: 'That image is too large: 4 MB at most.' }, { status: 413 });
  if (!bytes.length) return NextResponse.json({ error: 'The image did not arrive.' }, { status: 400 });
  const type = sniffImage(bytes);
  const size = type ? imageSize(bytes, type) : null;
  if (!type || !size || size.w > 20_000 || size.h > 20_000) return NextResponse.json({ error: 'That is not an image that can be kept here. PNG, JPEG, GIF or WebP can.' }, { status: 415 });
  try {
    const kept = await putMedia(userId, id, bytes, type);
    if (!kept.ok) {
      console.error('[new-logos] media upload failed', kept.error);
      return NextResponse.json({ error: 'The image could not be kept just now. Try again.' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, id, w: size.w, h: size.h });
  } catch (e) {
    console.error('[new-logos] media upload threw', e);
    return NextResponse.json({ error: 'The image could not be kept just now. Try again.' }, { status: 503 });
  }
}

// The body, read no further than `max` bytes: null past it (a body sent without its length is held to the same).
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
