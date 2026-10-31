// components/write/media-client.ts — the pictures in the writing, in the browser.
//
// BROWSER ONLY (IndexedDB, canvas, fetch). Every picture put into the writing
// is made the size it needs to be (lib/write/media.ts: MAX_EDGE, MAX_MEDIA_BYTES),
// kept in this browser by its id, and — for a signed-in person — sent to their
// account (app/api/write/media), so it is there on their other devices and in
// a shared document. A picture kept only here so far (signed out, or offline
// when it was put in) is sent the next time it can be (`sync`).
//
// The page draws a picture from this browser's copy when there is one; only
// when there is not does it ask the account for it, and then keeps that copy.

import { dataUrlBytes, imageSize, jpegInfo, jpegOrientation, MAX_EDGE, MAX_MEDIA_BYTES, MEDIA_ID, newMediaId, sniffImage, srcOf, type MediaType } from '@/lib/write/media';
import type { PdfPicture } from '@/lib/write/pdf';
import { sniffPhoto } from '@/lib/image-kind';
import { toJpegBlob } from '@/lib/logos-upload';

interface Rec {
  id: string;
  blob: Blob;
  type: string;
  w: number;
  h: number;
  at: number;
  /** 1 once the account has it */
  up: 0 | 1;
  by?: string;
}

export interface Kept {
  id: string;
  src: string;
  w: number;
  h: number;
  by?: string;
}

export type { PdfPicture };

const DB = 'socria-write';
const STORE = 'media';

let dbp: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (!dbp)
    dbp = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  return dbp;
}

// a private window may have no IndexedDB: the pictures put in this visit are kept in memory instead
const memory = new Map<string, Rec>();

async function getRec(id: string): Promise<Rec | null> {
  if (memory.has(id)) return memory.get(id)!;
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      r.onsuccess = () => resolve((r.result as Rec | undefined) ?? null);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putRec(rec: Rec): Promise<void> {
  memory.set(rec.id, rec);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => {
        // kept on disk: the memory copy is no longer needed to hold it
        memory.delete(rec.id);
        resolve();
      };
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

const urls = new Map<string, string>();

function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob).catch(() => viaImg(blob));
  return viaImg(blob);
}

function viaImg(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(u);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(u);
      reject(new Error('That picture could not be read.'));
    };
    img.src = u;
  });
}

const dims = (x: ImageBitmap | HTMLImageElement) => ({ w: 'naturalWidth' in x ? x.naturalWidth : x.width, h: 'naturalHeight' in x ? x.naturalHeight : x.height });

function toBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob((b) => resolve(b), type, q));
}

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  // a sample is enough: a transparent background is never one pixel
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40_000)));
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] < 250) return true;
  return false;
}

/** A picture made the size the writing keeps: as it was when it is already small enough, else drawn smaller. */
async function prepare(input: Blob): Promise<{ blob: Blob; type: MediaType; w: number; h: number }> {
  const bytes = new Uint8Array(await input.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) {
    // a phone's HEIC (or an AVIF, a BMP) is made a JPEG first, then kept like any other (lib/logos-upload.ts)
    if (sniffPhoto(bytes.subarray(0, 64))) return prepare(await toJpegBlob(input, MAX_EDGE));
    throw new Error('That is not a picture that can go in the writing — a JPEG, PNG, HEIC, GIF or WebP can.');
  }
  const size = imageSize(bytes, type);
  const upright = type !== 'image/jpeg' || jpegOrientation(bytes) === 1;
  if (size && upright && size.w <= MAX_EDGE && size.h <= MAX_EDGE && bytes.length <= 1_500_000) return { blob: new Blob([bytes], { type }), type, ...size };
  // an animation stays an animation if it fits at all
  if (type === 'image/gif' && size && bytes.length <= MAX_MEDIA_BYTES && size.w <= 4000 && size.h <= 4000) return { blob: new Blob([bytes], { type }), type, ...size };
  const img = await decode(new Blob([bytes], { type }));
  const d = dims(img);
  if (!d.w || !d.h) throw new Error('That picture could not be read.');
  let scale = Math.min(1, MAX_EDGE / Math.max(d.w, d.h));
  for (let attempt = 0; attempt < 6; attempt++) {
    const cw = Math.max(1, Math.round(d.w * scale));
    const ch = Math.max(1, Math.round(d.h * scale));
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('This browser could not draw that picture.');
    ctx.drawImage(img, 0, 0, cw, ch);
    const alpha = type !== 'image/jpeg' && hasAlpha(ctx, cw, ch);
    let out = alpha ? await toBlob(c, 'image/png') : await toBlob(c, 'image/jpeg', 0.86);
    if (alpha && out && out.size > 1_500_000) {
      const webp = await toBlob(c, 'image/webp', 0.9);
      if (webp && webp.type === 'image/webp' && webp.size < out.size) out = webp;
    }
    if (out && out.size <= MAX_MEDIA_BYTES) {
      const t = (sniffImage(new Uint8Array(await out.slice(0, 16).arrayBuffer())) ?? 'image/png') as MediaType;
      return { blob: out, type: t, w: cw, h: ch };
    }
    scale *= 0.75;
  }
  throw new Error('That picture is too large to keep, even made smaller.');
}

export interface MediaClient {
  readonly cloud: boolean;
  /** an address the page can draw it from — this browser's copy, else the account's */
  url(id: string, by?: string): Promise<string | null>;
  /** a picture from a file or the clipboard, kept here and (signed in) under the account */
  addFile(file: Blob): Promise<Kept>;
  /** a picture from a data address, or from the web when its server lets a page read it */
  addSrc(src: string): Promise<Kept | null>;
  /** a picture's own bytes, for an export */
  bytes(id: string, by?: string): Promise<{ bytes: Uint8Array; type: MediaType; w: number; h: number } | null>;
  /** a picture as a PDF can take it */
  forPdf(id: string, by?: string): Promise<PdfPicture | null>;
  /** a picture as Word can take it: PNG, JPEG or GIF as they are, anything else as a PNG */
  forWord(id: string, by?: string): Promise<{ bytes: Uint8Array; type: MediaType; w: number; h: number } | null>;
  /** pictures kept only in this browser so far, sent to the account */
  sync(ids: string[]): Promise<void>;
  /** whose folder this person's pictures go in, when signed in */
  owner(): Promise<string | null>;
}

const clients = new Map<string, MediaClient>();

export function mediaClient(cloud: boolean): MediaClient {
  const key = cloud ? 'cloud' : 'local';
  const had = clients.get(key);
  if (had) return had;
  let ownerP: Promise<string | null> | null = null;
  const uploading = new Map<string, Promise<boolean>>();

  const owner = () => {
    if (!cloud) return Promise.resolve(null);
    if (!ownerP)
      ownerP = fetch('/api/write/media', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j && typeof j.by === 'string' ? (j.by as string) : null))
        .catch(() => null)
        .then((by) => {
          if (!by) ownerP = null;
          return by;
        });
    return ownerP;
  };

  const upload = (rec: Rec): Promise<boolean> => {
    if (!cloud || rec.up) return Promise.resolve(true);
    const running = uploading.get(rec.id);
    if (running) return running;
    const p = (async () => {
      try {
        const res = await fetch('/api/write/media', { method: 'POST', headers: { 'Content-Type': rec.type, 'x-media-id': rec.id }, body: rec.blob });
        if (!res.ok) return false;
        const j = await res.json().catch(() => null);
        await putRec({ ...rec, up: 1, ...(j?.by ? { by: j.by } : {}) });
        return true;
      } catch {
        return false;
      } finally {
        uploading.delete(rec.id);
      }
    })();
    uploading.set(rec.id, p);
    return p;
  };

  const keep = async (prepared: { blob: Blob; type: MediaType; w: number; h: number }): Promise<Kept> => {
    const id = newMediaId();
    const by = (await owner()) ?? undefined;
    const rec: Rec = { id, blob: prepared.blob, type: prepared.type, w: prepared.w, h: prepared.h, at: Date.now(), up: 0, ...(by ? { by } : {}) };
    await putRec(rec);
    void upload(rec);
    return { id, src: srcOf(id), w: prepared.w, h: prepared.h, ...(by ? { by } : {}) };
  };

  const fetchRemote = async (id: string, by?: string): Promise<Rec | null> => {
    if (!cloud) return null;
    try {
      const res = await fetch(`/api/write/media/${id}${by ? `?by=${by}` : ''}`);
      if (!res.ok) return null;
      const blob = await res.blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const type = sniffImage(bytes);
      const size = type ? imageSize(bytes, type) : null;
      if (!type || !size) return null;
      const rec: Rec = { id, blob: new Blob([bytes], { type }), type, w: size.w, h: size.h, at: Date.now(), up: 1, ...(by ? { by } : {}) };
      await putRec(rec);
      return rec;
    } catch {
      return null;
    }
  };

  const recOf = async (id: string, by?: string) => (MEDIA_ID.test(id) ? (await getRec(id)) ?? (await fetchRemote(id, by)) : null);

  const client: MediaClient = {
    cloud,
    owner,
    async url(id, by) {
      const had = urls.get(id);
      if (had) return had;
      const rec = await recOf(id, by);
      if (!rec) return null;
      const u = URL.createObjectURL(rec.blob);
      urls.set(id, u);
      return u;
    },
    async addFile(file) {
      return keep(await prepare(file));
    },
    async addSrc(src) {
      const data = dataUrlBytes(src);
      if (data) return keep(await prepare(new Blob([data.bytes as BlobPart], { type: data.type })));
      if (!/^https?:\/\//i.test(src)) return null;
      try {
        // only a server that lets a page read its pictures will answer; most do not, and the picture is left out, said so
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(src, { mode: 'cors', credentials: 'omit', signal: ctrl.signal, referrerPolicy: 'no-referrer' });
        clearTimeout(t);
        if (!res.ok) return null;
        const blob = await res.blob();
        if (blob.size > 25 * 1024 * 1024) return null;
        return await keep(await prepare(blob));
      } catch {
        return null;
      }
    },
    async bytes(id, by) {
      const rec = await recOf(id, by);
      if (!rec) return null;
      const bytes = new Uint8Array(await rec.blob.arrayBuffer());
      const type = sniffImage(bytes);
      return type ? { bytes, type, w: rec.w, h: rec.h } : null;
    },
    async forPdf(id, by) {
      const got = await client.bytes(id, by);
      if (!got) return null;
      if (got.type === 'image/jpeg') {
        const j = jpegInfo(got.bytes);
        if (j && (j.comps === 1 || j.comps === 3) && jpegOrientation(got.bytes) === 1) return { kind: 'jpeg', bytes: got.bytes, w: j.w, h: j.h, comps: j.comps };
      }
      try {
        const img = await decode(new Blob([got.bytes as BlobPart], { type: got.type }));
        const d = dims(img);
        const c = document.createElement('canvas');
        c.width = d.w;
        c.height = d.h;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, d.w, d.h).data;
        const n = d.w * d.h;
        const rgb = new Uint8Array(n * 3);
        const alpha = new Uint8Array(n);
        let transparent = false;
        for (let k = 0; k < n; k++) {
          rgb[k * 3] = px[k * 4];
          rgb[k * 3 + 1] = px[k * 4 + 1];
          rgb[k * 3 + 2] = px[k * 4 + 2];
          alpha[k] = px[k * 4 + 3];
          if (px[k * 4 + 3] < 255) transparent = true;
        }
        return { kind: 'raw', rgb, ...(transparent ? { alpha } : {}), w: d.w, h: d.h };
      } catch {
        return null;
      }
    },
    async forWord(id, by) {
      const got = await client.bytes(id, by);
      if (!got || got.type !== 'image/webp') return got;
      try {
        const img = await decode(new Blob([got.bytes as BlobPart], { type: got.type }));
        const d = dims(img);
        const c = document.createElement('canvas');
        c.width = d.w;
        c.height = d.h;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        const png = await toBlob(c, 'image/png');
        if (!png) return null;
        return { bytes: new Uint8Array(await png.arrayBuffer()), type: 'image/png', w: d.w, h: d.h };
      } catch {
        return null;
      }
    },
    async sync(ids) {
      if (!cloud) return;
      for (const id of ids) {
        const rec = await getRec(id);
        if (rec && !rec.up) await upload(rec);
      }
    },
  };
  clients.set(key, client);
  return client;
}
