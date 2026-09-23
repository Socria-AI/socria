// app/api/files/read/route.ts
// POST multipart { file } → { notes, images, skipped }
//
// Reads one attached file into text for Core 4: PDF, Word, PowerPoint, Excel,
// OpenDocument, RTF, or a zip of any of those plus plain text and code. Plain
// text files never come here — the browser reads those itself.
//
// Nothing is kept. The file is read in memory, the text goes back to the
// browser, and the conversation carries it from there; the bytes are dropped
// when this returns. Images found inside a zip come back as data URLs so the
// browser can send them through the same one-time reading as any other image.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';
import { extractFile } from '@/lib/file-extract';
import { MAX_UPLOAD_BYTES } from '@/lib/file-kinds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  // The same door as Core 4 itself: an account, or a verified unlock.
  if (!userId && !mayUse(req, userId)) {
    return NextResponse.json({ error: 'Sign in to attach files.' }, { status: 401 });
  }
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  // Refused on the declared length before the body is buffered, where the
  // header is present; checked again on the actual bytes below.
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'That file is too large — 4 MB is the limit.' }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file was attached.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'That file is too large — 4 MB is the limit.' }, { status: 413 });
  }
  const name = (file.name || 'file').replace(/[\u0000-\u001f]/g, '').slice(0, 120);

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await extractFile(name, buf);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[socria/files] read failed', e);
    return NextResponse.json({ error: `${name} could not be read.` }, { status: 500 });
  }
}
