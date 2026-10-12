// lib/docs/client.ts — documents in the browser: read once, kept, read further.
//
// BROWSER ONLY (it uses fetch, IndexedDB, canvas). Three jobs:
//
//   READ    a file the person attached, into a SourceDoc. Text formats are
//           read here, in the browser, by the same pure readers the server
//           uses (lib/docs/plain.ts) — those files never leave the page.
//           Everything else goes once to the file reader
//           (app/api/files/read), which reads it and keeps nothing.
//
//   KEEP    every document by its id (a hash of the file), in memory and in
//           IndexedDB, so it is still here on the next visit and the same file
//           is never read twice — and, where a page may still need reading
//           from its picture, the original file too. Nothing here is sent
//           anywhere by itself; a conversation sends what it is about.
//
//   PAGES   a scanned page drawn from the original (pdf.js, here in the
//           browser — the server never renders), read by the vision route
//           (app/api/docs/page), and merged into the document as a reading
//           from the image, marked so (lib/docs/vision.ts).

import { checkDoc } from './checks';
import type { MediaRef } from './build';
import { plainFormat, readPlain } from './plain';
import { sanitizeSourceDoc } from './sanitize';
import type { SourceDoc } from './types';
import { mergePageReading, type VisionBlock } from './vision';

/** The first 16 hex characters of the SHA-256 of some bytes — the server's id for the same file. */
export async function docIdOfBytes(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/** Text a browser can read itself: everything but the packaged formats, PDFs and images. */
export function readsInBrowser(name: string): boolean {
  return !/\.(pdf|docx|docm|dotx|xlsx|xlsm|pptx|pptm|ppsx|odt|odp|ods|rtf|zip|png|jpe?g|webp|gif)$/i.test(name);
}

export interface ReadOptions {
  /** headers every Socria request carries (the access key, where there is one) */
  headers: () => Record<string, string>;
  /** the largest file this person may attach */
  uploadLimit: number;
  /** the largest file sent straight to the reader; above it, a private upload first */
  directLimit: number;
}

/**
 * One file into a SourceDoc — or, when its structured reading was too large
 * to send back, its text alone (`note`), said so. Throws with a sentence a
 * person can read.
 */
export async function readFileAsDoc(
  file: File,
  o: ReadOptions
): Promise<{ doc: SourceDoc; media: MediaRef[]; note?: undefined } | { doc?: undefined; note: { text: string; truncated: boolean; why: string } }> {
  if (file.size > o.uploadLimit) throw new Error(`${file.name} is too large — ${Math.round(o.uploadLimit / (1024 * 1024))} MB is the limit.`);
  if (readsInBrowser(file.name)) {
    const buf = await file.arrayBuffer();
    const id = await docIdOfBytes(buf);
    const text = new TextDecoder('utf-8').decode(buf);
    if (!text.trim()) throw new Error(`${file.name} is empty.`);
    const out = readPlain(file.name, text, { id });
    const doc = sanitizeSourceDoc(out.doc);
    if (!doc) throw new Error(`${file.name} could not be read.`);
    doc.checks = checkDoc(doc, out.raw, { notes: out.notes });
    doc.readAt = Date.now();
    return { doc, media: out.media };
  }
  let res: Response;
  if (file.size > o.directLimit) {
    // too large to send through the server: a one-time private upload, read from there and deleted
    const json = { 'Content-Type': 'application/json', ...o.headers() };
    const prep = await fetch('/api/files/upload', { method: 'POST', headers: json, body: JSON.stringify({ name: file.name, size: file.size }) });
    const signed = await prep.json().catch(() => ({}));
    if (!prep.ok || !signed?.url || !signed?.path) throw new Error(signed?.error || 'The upload could not be prepared.');
    const body = new FormData();
    body.append('cacheControl', '60');
    body.append('', file);
    const put = await fetch(signed.url, { method: 'PUT', headers: { 'x-upsert': 'false' }, body });
    if (!put.ok) throw new Error('The upload did not finish — try again.');
    res = await fetch('/api/files/read', { method: 'POST', headers: json, body: JSON.stringify({ path: signed.path, docs: true }) });
  } else {
    const form = new FormData();
    form.append('file', file);
    form.append('docs', '1');
    res = await fetch('/api/files/read', { method: 'POST', headers: o.headers(), body: form });
  }
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    skipped?: string[];
    notes?: { text?: unknown; truncated?: unknown }[];
    docs?: { doc: unknown; media?: MediaRef[] }[];
  };
  if (!res.ok) throw new Error(json?.error || `${file.name} could not be read.`);
  const first = json.docs?.[0];
  const doc = first ? sanitizeSourceDoc(first.doc) : null;
  if (!doc) {
    // read, but too large to send back whole: its text, as Core 4 has it
    const text = typeof json.notes?.[0]?.text === 'string' ? (json.notes[0].text as string) : '';
    if (text.trim()) return { note: { text, truncated: json.notes?.[0]?.truncated === true, why: json.skipped?.[0] ?? `${file.name} was read as text.` } };
    throw new Error(json.skipped?.[0] ?? `${file.name} could not be read.`);
  }
  const media = Array.isArray(first?.media) ? first!.media.filter((m) => m && typeof m.figure === 'string' && typeof m.mime === 'string') : [];
  return { doc, media };
}

// ── keeping documents ───────────────────────────────────────────────

const memory = new Map<string, SourceDoc>();
const listeners = new Set<(doc: SourceDoc) => void>();
const DB = 'socria-docs';
/** Originals kept for a later page reading; the oldest go first. */
const MAX_ORIGINALS = 12;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('originals')) db.createObjectStore('originals', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(store: 'docs' | 'originals', mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(store, mode);
      const r = run(t.objectStore(store));
      t.oncomplete = () => resolve(r ? (r.result as T) : null);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** A document, kept — and everyone showing it told. */
export async function putDoc(doc: SourceDoc): Promise<void> {
  memory.set(doc.id, doc);
  for (const l of listeners) l(doc);
  await tx('docs', 'readwrite', (s) => s.put(doc));
}

/** A document already in hand. */
export const docNow = (id: string): SourceDoc | null => memory.get(id) ?? null;

/** Documents by id, from memory or from what this browser kept. */
export async function loadDocs(ids: string[]): Promise<SourceDoc[]> {
  const out: SourceDoc[] = [];
  for (const id of [...new Set(ids)]) {
    const hit = memory.get(id);
    if (hit) {
      out.push(hit);
      continue;
    }
    const raw = await tx<unknown>('docs', 'readonly', (s) => s.get(id));
    const doc = raw ? sanitizeSourceDoc(raw) : null;
    if (doc) {
      memory.set(doc.id, doc);
      out.push(doc);
    }
  }
  return out;
}

/** Be told when a document changes (a page read from its image, a correction). */
export function onDoc(fn: (doc: SourceDoc) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The original file, kept where a page may still need reading from its picture. */
export async function putOriginal(id: string, file: Blob): Promise<void> {
  await tx('originals', 'readwrite', (s) => s.put({ id, file, at: Date.now() }));
  const all = (await tx<{ id: string; at: number }[]>('originals', 'readonly', (s) => s.getAll())) ?? [];
  const old = all.sort((a, b) => b.at - a.at).slice(MAX_ORIGINALS);
  for (const o of old) await tx('originals', 'readwrite', (s) => s.delete(o.id));
}

export async function getOriginal(id: string): Promise<Blob | null> {
  const r = await tx<{ file?: Blob }>('originals', 'readonly', (s) => s.get(id));
  return r?.file ?? null;
}

// ── reading pages from their pictures ───────────────────────────────

/** Pages read automatically from their pictures, per document; more on request. */
export const AUTO_PAGES = 12;
const PAGE_EDGE = 1600;

function canvasToJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.85);
}

interface PdfLike {
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number };
    render(o: unknown): { promise: Promise<void> };
  }>;
  loadingTask: { destroy(): Promise<void> };
}

/** A PDF opened once, in the browser, for drawing its pages. */
async function openPdf(file: Blob): Promise<PdfLike> {
  const { getDocumentProxy } = await import('unpdf');
  return (await getDocumentProxy(new Uint8Array(await file.arrayBuffer()))) as unknown as PdfLike;
}

/** One page of an open PDF drawn to a JPEG. */
async function pdfPageImage(pdf: PdfLike, n: number): Promise<string> {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, PAGE_EDGE / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the page.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvasToJpeg(canvas);
}

/** An image file, drawn no larger than a page reading needs. */
async function imageAsJpeg(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That image could not be opened.'));
      i.src = url;
    });
    const scale = Math.min(1, PAGE_EDGE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the image.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvasToJpeg(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The pages of a document that wait to be read from their pictures, in order. */
export const pagesToRead = (doc: SourceDoc) => doc.pages.filter((p) => p.ocr === 'needed').map((p) => p.n);

/**
 * Pages read from their pictures — a few at a time, each merged and kept as
 * it lands, so the document fills in while it is being read and a failure
 * part-way keeps everything read before it. Stops at the allowance (402)
 * and says so.
 */
export async function readPages(
  doc: SourceDoc,
  pages: number[],
  o: { headers: () => Record<string, string>; sessionId?: string | null; onPage?: (doc: SourceDoc, page: number) => void; signal?: AbortSignal; parallel?: number }
): Promise<{ doc: SourceDoc; read: number; stopped?: string }> {
  const original = await getOriginal(doc.id);
  if (!original) return { doc, read: 0, stopped: 'The original file is not kept on this device — attach it again to read its scanned pages.' };
  let pdf: PdfLike | null = null;
  if (doc.format !== 'image') {
    try {
      pdf = await openPdf(original);
    } catch {
      return { doc, read: 0, stopped: 'The file could not be opened to draw its pages.' };
    }
  }
  let cur = doc;
  let read = 0;
  let stopped: string | undefined;
  const queue = [...pages];
  const one = async (n: number) => {
    let image: string;
    try {
      image = pdf ? await pdfPageImage(pdf, n) : await imageAsJpeg(original);
    } catch (e) {
      stopped ??= e instanceof Error ? e.message : 'The page could not be drawn.';
      return;
    }
    const res = await fetch('/api/docs/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...o.headers() },
      body: JSON.stringify({ image, kind: 'page', ...(o.sessionId ? { sessionId: o.sessionId } : {}) }),
      ...(o.signal ? { signal: o.signal } : {}),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { blocks?: VisionBlock[]; error?: string; partial?: boolean }) : {};
    if (res?.status === 402) {
      stopped ??= json.error ?? 'No more images can be read in this conversation.';
      return;
    }
    // merged into whatever is newest — the pages land in any order
    cur = !res || !res.ok ? mergePageReading(cur, n, null) : mergePageReading(cur, n, Array.isArray(json.blocks) ? json.blocks : [], '', json.partial === true);
    read++;
    void putDoc(cur);
    o.onPage?.(cur, n);
  };
  try {
    const lanes = Math.max(1, Math.min(o.parallel ?? 3, queue.length));
    await Promise.all(
      Array.from({ length: lanes }, async () => {
        while (queue.length && !stopped && !o.signal?.aborted) await one(queue.shift()!);
      })
    );
  } finally {
    await pdf?.loadingTask.destroy().catch(() => {});
  }
  // the last word kept is the newest reading, whatever order the writes finished in
  if (read) await putDoc(cur);
  return { doc: cur, read, ...(stopped ? { stopped } : {}) };
}
