// app/api/files/original/[id]/route.ts
// GET    → { url, size, type }  a five-minute link to read an original of the caller's own
// DELETE → { ok }               the original removed
//
// Only ever the caller's own: the path is built from their account (lib/file-originals.ts),
// never from anything the request says, so no id reaches another person's file. A file
// larger than the caller's plan allows — uploaded around the size check — is removed
// rather than served. Someone a conversation is shared with sees the reading, not the
// original: the original stays with the person who attached it.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { limitsFor } from '@/lib/entitlements';
import { FILE_ID } from '@/lib/file-originals';
import { originalInfo, originalLink, removeOriginals } from '@/lib/file-originals-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Sign in to open the original.' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'media');
  if (limited) return limited;
  const id = params?.id ?? '';
  if (!FILE_ID.test(id)) return NextResponse.json({ error: 'Which file?' }, { status: 400 });
  try {
    const info = await originalInfo(userId, id);
    if (!info) return NextResponse.json({ error: 'The original of this file is not kept with your account.' }, { status: 404, headers: NO_STORE });
    const plan = await resolvePlanForRequest(req, userId);
    if (info.size > limitsFor(plan).uploadBytes) {
      await removeOriginals(userId, [id]).catch(() => 0);
      return NextResponse.json({ error: 'The original of this file is not kept with your account.' }, { status: 404, headers: NO_STORE });
    }
    const url = await originalLink(userId, id);
    if (!url) return NextResponse.json({ error: 'The original could not be opened just now.' }, { status: 503, headers: NO_STORE });
    return NextResponse.json({ url, size: info.size, type: info.type }, { headers: NO_STORE });
  } catch (e) {
    console.error('[socria/files] original read failed', e);
    return NextResponse.json({ error: 'The original could not be opened just now.' }, { status: 503, headers: NO_STORE });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const id = params?.id ?? '';
  if (!FILE_ID.test(id)) return NextResponse.json({ error: 'Which file?' }, { status: 400 });
  try {
    await removeOriginals(userId, [id]);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    console.error('[socria/files] original removal failed', e);
    return NextResponse.json({ error: 'The original could not be removed just now.' }, { status: 503 });
  }
}
