// app/api/files/read/route.ts
// POST multipart { file, docs? } → { notes, images, skipped, docs? }
// POST JSON { path, docs? }       → the same, for a large file already uploaded to
//                                   private storage (Socria One, app/api/files/upload)
//
// `docs` asks for the structured reading too (lib/docs: blocks, tables,
// figures, equations, where each came from, and the checks run against the
// file's own text) — what Logos cites, passage by passage, and shows beside
// the map. Core 4 reads the notes alone.
//
// Reads one attached file into text for Core 4: PDF, Word, PowerPoint, Excel,
// OpenDocument, RTF, or a zip of any of those plus plain text and code. Plain
// text files never come here — the browser reads those itself.
//
// Nothing is kept. The file is read in memory, the text goes back to the
// browser, and the conversation carries it from there; the bytes are dropped
// when this returns. A large file read from storage is deleted from storage
// as this returns, whether or not it could be read. Images found inside a zip
// come back as data URLs so the browser can send them through the same
// one-time reading as any other image.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';
import { extractFile, type ExtractResult } from '@/lib/file-extract';
import { DIRECT_UPLOAD_BYTES, limitsFor, megabytes } from '@/lib/entitlements';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { ownsUploadPath } from '@/lib/upload-paths';
import { readUpload, removeUpload } from '@/lib/upload-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A 30 MB PDF takes longer to read than a 4 MB one; the same ceiling as chat.
export const maxDuration = 60;

/**
 * A response small enough to arrive: Vercel refuses a body over 4.5 MB, so a
 * structured reading that would push past ~3.6 MB of JSON goes back as its
 * note only — said, never silently dropped. Pictures go first, then readings.
 */
function fit(result: ExtractResult): ExtractResult {
  if (!result.docs?.length) return result;
  const LIMIT = 3_600_000;
  let size = JSON.stringify({ ...result, docs: [] }).length;
  const docs: NonNullable<ExtractResult['docs']> = [];
  const left: string[] = [];
  for (const d of result.docs) {
    let read = d;
    let n = JSON.stringify(read).length;
    if (size + n > LIMIT && d.media.some((m) => m.dataUrl)) {
      read = { ...d, media: d.media.map(({ dataUrl: _u, ...m }) => m) };
      n = JSON.stringify(read).length;
    }
    if (size + n > LIMIT) {
      left.push(d.doc.name);
      continue;
    }
    docs.push(read);
    size += n;
  }
  return left.length ? { ...result, docs, skipped: [...result.skipped, ...left.map((n) => `${n} (too large to send back whole — read as text instead)`)] } : { ...result, docs };
}

export async function POST(req: NextRequest) {
  const { userId } = auth();
  // The same door as Core 4 itself: an account, or a verified unlock.
  if (!userId && !mayUse(req, userId)) {
    return NextResponse.json({ error: 'Sign in to attach files.' }, { status: 401 });
  }
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  // A LARGE FILE, ALREADY IN STORAGE: read it from there, and delete it whatever happens.
  if ((req.headers.get('content-type') || '').includes('application/json')) {
    if (!userId) return NextResponse.json({ error: 'Sign in to attach files.' }, { status: 401 });
    const body = (await req.json().catch(() => null)) as { path?: unknown; docs?: unknown } | null;
    const path = body?.path;
    const wantDocs = body?.docs === true;
    if (!ownsUploadPath(userId, path)) return NextResponse.json({ error: 'No such upload.' }, { status: 404 });
    try {
      const plan = await resolvePlanForRequest(req, userId);
      const limit = limitsFor(plan).uploadBytes;
      const buf = await readUpload(path as string);
      if (!buf) return NextResponse.json({ error: 'The upload could not be found — try attaching it again.' }, { status: 404 });
      if (buf.length > limit) return NextResponse.json({ error: `That file is too large — ${megabytes(limit)} is the limit.` }, { status: 413 });
      const name = (path as string).split('/').pop() || 'file';
      const result = await extractFile(name, buf, { docs: wantDocs });
      return NextResponse.json(fit(result));
    } catch (e) {
      console.error('[socria/files] read from storage failed', e);
      return NextResponse.json({ error: 'That file could not be read.' }, { status: 500 });
    } finally {
      await removeUpload(path as string);
    }
  }

  // Refused on the declared length before the body is buffered, where the
  // header is present; checked again on the actual bytes below.
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > DIRECT_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: `That file is too large to send directly — ${megabytes(DIRECT_UPLOAD_BYTES)} is the limit.` }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file was attached.' }, { status: 400 });
  }
  if (file.size > DIRECT_UPLOAD_BYTES) {
    return NextResponse.json({ error: `That file is too large to send directly — ${megabytes(DIRECT_UPLOAD_BYTES)} is the limit.` }, { status: 413 });
  }
  const name = (file.name || 'file').replace(/[\u0000-\u001f]/g, '').slice(0, 120);
  const wantDocs = form?.get('docs') === '1';

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await extractFile(name, buf, { docs: wantDocs });
    return NextResponse.json(fit(result));
  } catch (e) {
    console.error('[socria/files] read failed', e);
    return NextResponse.json({ error: `${name} could not be read.` }, { status: 500 });
  }
}
