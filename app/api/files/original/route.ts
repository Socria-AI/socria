// app/api/files/original/route.ts
// POST { id, name, size } → { url } | { exists: true }
//
// Keeping the ORIGINAL of a file someone attached, so it opens as itself — its pages,
// slides or grid — on any of their devices (docs/FILE-PREVIEW.md). Signed-in only: a
// guest's originals stay on the device that attached them. The file goes from the
// browser straight into private storage under the caller's own folder; this route only
// checks it may, and signs the one upload. The reading Socria reasons with is made
// separately (app/api/files/read) and is unchanged by this.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { limitsFor, megabytes } from '@/lib/entitlements';
import { kindOfFile } from '@/lib/file-kinds';
import { FILE_ID } from '@/lib/file-originals';
import { signOriginalUpload } from '@/lib/file-originals-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Sign in to keep files with your account.' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { id?: unknown; name?: unknown; size?: unknown; type?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const name = typeof body?.name === 'string' ? body.name.slice(0, 200) : '';
  const size = typeof body?.size === 'number' && Number.isFinite(body.size) ? body.size : NaN;
  if (!FILE_ID.test(id) || !name || !(size > 0)) return NextResponse.json({ error: 'Which file?' }, { status: 400 });
  // the same kinds the composer takes, and never a secrets file
  const kind = kindOfFile(name, typeof body?.type === 'string' ? body.type : '');
  if (kind === 'secret' || kind === 'unsupported') return NextResponse.json({ error: 'That kind of file is not kept.' }, { status: 415 });
  const plan = await resolvePlanForRequest(req, userId);
  const limit = limitsFor(plan).uploadBytes;
  if (size > limit) return NextResponse.json({ error: `That file is too large to keep — ${megabytes(limit)} is the limit.` }, { status: 413 });
  try {
    const signed = await signOriginalUpload(userId, id);
    if ('error' in signed) {
      console.error('[socria/files] original upload could not be signed', signed.error);
      return NextResponse.json({ error: 'The file could not be kept just now.' }, { status: 503 });
    }
    return NextResponse.json(signed, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[socria/files] original upload could not be signed', e);
    return NextResponse.json({ error: 'The file could not be kept just now.' }, { status: 503 });
  }
}
