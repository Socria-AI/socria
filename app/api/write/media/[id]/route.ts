// app/api/write/media/[id]/route.ts
// GET ?by=<owner> → a picture of someone's writing, as its bytes
//
// For a signed-in reader who has the picture's id — which only the writing
// that holds it gives them (lib/write/media.ts: 128 random bits). `by` names
// whose storage it is in, for a shared document whose pictures someone else
// put in; without it, the reader's own. The bytes are served as the picture
// they are (never anything a browser would run), and kept by the browser for
// good: a picture's id never points at different bytes.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ownerPrefix } from '@/lib/upload-paths';
import { MEDIA_ID, MEDIA_OWNER, MEDIA_TYPES, sniffImage } from '@/lib/write/media';
import { getMedia } from '@/lib/write/media-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Sign in to see the pictures in this writing.' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'media');
  if (limited) return limited;
  const id = params?.id ?? '';
  if (!MEDIA_ID.test(id)) return NextResponse.json({ error: 'Which picture?' }, { status: 400 });
  const by = req.nextUrl.searchParams.get('by');
  const owner = by && MEDIA_OWNER.test(by) ? by : ownerPrefix(userId);
  try {
    const got = await getMedia(owner, id);
    if (!got) return NextResponse.json({ error: 'That picture is not here.' }, { status: 404 });
    const type = sniffImage(got.bytes);
    if (!type || !(MEDIA_TYPES as readonly string[]).includes(type)) return NextResponse.json({ error: 'That picture is not here.' }, { status: 404 });
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
    console.error('[socria/write-media] read failed', e);
    return NextResponse.json({ error: 'That picture could not be read just now.' }, { status: 503 });
  }
}
