// app/api/new-logos/media/[id]/route.ts
// GET → one of the signed-in person's own artifact pictures, as its bytes
//
// Only the account that kept a picture reads it (its own folder; an id is 128 random bits). The bytes are served as the
// picture they are, checked again from the bytes, never as anything a browser would run, and kept by the browser for
// good: an id never points at different bytes.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ownerPrefix } from '@/lib/upload-paths';
import { MEDIA_ID, MEDIA_TYPES, sniffImage } from '@/lib/write/media';
import { getMedia } from '@/lib/write/media-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'media');
  if (limited) return limited;
  const id = params?.id ?? '';
  if (!MEDIA_ID.test(id)) return NextResponse.json({ error: 'Which picture?' }, { status: 400 });
  try {
    const got = await getMedia(ownerPrefix(userId), id);
    if (!got) return NextResponse.json({ error: 'That image is not here.' }, { status: 404 });
    const type = sniffImage(got.bytes);
    if (!type || !(MEDIA_TYPES as readonly string[]).includes(type)) return NextResponse.json({ error: 'That image is not here.' }, { status: 404 });
    return new NextResponse(got.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        'Content-Disposition': 'inline',
      },
    });
  } catch (e) {
    console.error('[new-logos] media read failed', e);
    return NextResponse.json({ error: 'That image could not be read just now.' }, { status: 503 });
  }
}
