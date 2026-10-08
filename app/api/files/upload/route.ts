// app/api/files/upload/route.ts
// POST { name, size } → { path, url }
//
// A one-time signed upload into private storage, for a document too large to
// travel through this server in a request (about 4.5 MB is the most a
// function may receive). Socria One only: its documents may be up to 30 MB
// (lib/entitlements.ts). The browser PUTs the file to `url`, then asks
// /api/files/read to read `path` — which reads it, and deletes it.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { DIRECT_UPLOAD_BYTES, limitsFor, megabytes } from '@/lib/entitlements';
import { kindOfFile } from '@/lib/file-kinds';
import { uploadPath } from '@/lib/upload-paths';
import { signedUploadFor } from '@/lib/upload-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Sign in to attach files.' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const plan = await resolvePlanForRequest(req, userId);
  const limit = limitsFor(plan).uploadBytes;
  const body = (await req.json().catch(() => null)) as { name?: unknown; size?: unknown } | null;
  const name = typeof body?.name === 'string' ? body.name : '';
  const size = typeof body?.size === 'number' && Number.isFinite(body.size) ? body.size : NaN;
  if (!name || !(size > 0)) return NextResponse.json({ error: 'Which file?' }, { status: 400 });
  if (size <= DIRECT_UPLOAD_BYTES) return NextResponse.json({ error: 'Small files are read directly.' }, { status: 400 });
  if (size > limit) {
    return NextResponse.json(
      { error: plan === 'one' ? `That file is too large — ${megabytes(limit)} is the limit.` : `Files over ${megabytes(DIRECT_UPLOAD_BYTES)} need Socria One, which reads documents up to ${megabytes(limitsFor('one').uploadBytes)}.` },
      { status: 413 }
    );
  }
  const kind = kindOfFile(name, '');
  if (kind === 'image') return NextResponse.json({ error: 'Images are read in the browser, not uploaded.' }, { status: 400 });
  const path = uploadPath(userId, name);
  try {
    const signed = await signedUploadFor(path);
    if ('error' in signed) {
      console.error('[socria/files] signed upload failed', signed.error);
      return NextResponse.json({ error: 'The upload could not be prepared just now.' }, { status: 503 });
    }
    return NextResponse.json({ path, url: signed.url });
  } catch (e) {
    console.error('[socria/files] signed upload failed', e);
    return NextResponse.json({ error: 'The upload could not be prepared just now.' }, { status: 503 });
  }
}
