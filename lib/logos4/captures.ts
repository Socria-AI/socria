// lib/logos4/captures.ts — QUICK CAPTURE: A PRIVATE INBOX FOR LATER.
//
// A thought on the way out of a lecture, a note, a photo of a whiteboard:
// kept in two taps, without starting a conversation about it. A capture is
// its words and, optionally, one attachment in the composer's own shape
// (lib/logos-attachments.ts) — cleaned by the same sanitiser, held to the
// same limits. An image is what was read in it plus a small thumbnail; the
// original file is never kept.
//
// NOTHING HERE TURNS A CAPTURE INTO ANYTHING BY ITSELF. The person opens it,
// edits it, deletes it, or turns it into a new line of thinking, a card on
// the map, or something in the composer to send (where it can become a
// chart, a model or anything a message can). It is never filed as a project
// or a task.
//
// Signed in, captures live in the `captures` table through /api/captures.
// Signed out — or before that table exists on a deployment — they live in
// this browser, and the inbox says so.
//
// PURE but for the Storage handed in.

import { sanitizeAttachments, NOTE_THRESHOLD, type Attachment } from '@/lib/logos-attachments';

export const MAX_CAPTURE_TEXT = 4000;
export const MAX_CAPTURES = 200;
export const LOCAL_CAPTURES_KEY = 'socria.logos4.captures.v1';

export interface Capture {
  id: string;
  text: string;
  attachment?: Attachment;
  createdAt: number;
  updatedAt: number;
}

const ID = /^cp_[A-Za-z0-9]{6,40}$/;

export function newCaptureId(): string {
  let r = '';
  try {
    const b = new Uint8Array(9);
    globalThis.crypto.getRandomValues(b);
    r = Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 14);
  } catch {
    r = Math.random().toString(36).slice(2, 16);
  }
  return `cp_${Date.now().toString(36)}${r}`.replace(/[^A-Za-z0-9_]/g, '');
}

export const isCaptureId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);

/** Their words, kept as written: line breaks stay, control characters and the excess go. */
export function cleanCaptureText(v: unknown): string {
  // eslint-disable-next-line no-control-regex
  const t = typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, '') : '';
  return t.replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_CAPTURE_TEXT);
}

/** One attachment — a note or a picture — through the composer's own sanitiser, or nothing. */
export function cleanCaptureAttachment(v: unknown): Attachment | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const kind = (v as { kind?: unknown }).kind;
  if (kind !== 'note' && kind !== 'image') return undefined;
  const [a] = sanitizeAttachments([v]);
  if (!a) return undefined;
  // a picture with neither a thumbnail nor a reading is nothing to keep
  if (a.kind === 'image' && !a.thumb && !a.reading) return undefined;
  // a capture keeps the thumbnail, never the larger preview
  const { preview: _p, ...kept } = a;
  return kept;
}

/** A capture from the wire or from storage, shaped — or nothing. */
export function cleanCapture(raw: unknown, now = Date.now()): Capture | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isCaptureId(r.id)) return null;
  const text = cleanCaptureText(r.text);
  const attachment = cleanCaptureAttachment(r.attachment);
  if (!text && !attachment) return null;
  const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= now + 86_400_000 ? Math.floor(v) : 0);
  const createdAt = time(r.createdAt) || time(r.created_at) || now;
  const updatedAt = Math.max(createdAt, time(r.updatedAt) || time(r.updated_at) || createdAt);
  return { id: r.id, text, ...(attachment ? { attachment } : {}), createdAt, updatedAt };
}

/** What the inbox calls it: its first line, or what its picture showed. */
export function captureTitle(c: Capture): string {
  const first = c.text.split('\n').find((l) => l.trim())?.trim() ?? '';
  if (first) return first.length > 90 ? `${first.slice(0, 89).trimEnd()}…` : first;
  const a = c.attachment;
  if (a?.kind === 'image') return a.reading ? oneLineOf(a.reading, 90) : a.name || 'Photo';
  if (a?.kind === 'note') return a.name || oneLineOf(a.text ?? '', 90) || 'Note';
  return 'Capture';
}

export const captureKind = (c: Capture): 'photo' | 'note' => (c.attachment?.kind === 'image' ? 'photo' : 'note');

const oneLineOf = (t: string, n: number) => {
  const f = t.replace(/\s+/g, ' ').trim();
  return f.length > n ? `${f.slice(0, n - 1).trimEnd()}…` : f;
};

/**
 * A capture, ready for the composer: short words go into the box, long ones
 * become a note chip (as a paste that long would), and a picture comes as the
 * picture chip it was. Nothing is sent.
 */
export function forComposer(c: Capture): { text: string; attachments: Attachment[] } {
  const long = c.text.length > NOTE_THRESHOLD;
  const attachments: Attachment[] = [];
  if (long) attachments.push(...sanitizeAttachments([{ kind: 'note', text: c.text, origin: 'mine', name: 'Captured note' }]));
  if (c.attachment) attachments.push(c.attachment);
  return { text: long ? '' : c.text, attachments };
}

/** A capture as a card on the map: its words, short — or what its picture showed. */
export function forNode(c: Capture): string {
  return captureTitle(c);
}

/** Newest first, at most MAX_CAPTURES, one per id. */
export function orderCaptures(list: readonly Capture[]): Capture[] {
  const seen = new Set<string>();
  return [...list]
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .slice(0, MAX_CAPTURES);
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** The captures kept in this browser (signed out, or before the table exists). */
export function readLocalCaptures(storage: StorageLike | null | undefined): Capture[] {
  try {
    const raw = JSON.parse(storage?.getItem(LOCAL_CAPTURES_KEY) || '[]');
    return Array.isArray(raw) ? orderCaptures(raw.map((x) => cleanCapture(x)).filter((x): x is Capture => !!x)) : [];
  } catch {
    return [];
  }
}

/** Keep them; true when the browser took them. A full storage is said, not hidden. */
export function writeLocalCaptures(storage: StorageLike | null | undefined, list: readonly Capture[]): boolean {
  try {
    if (!storage) return false;
    storage.setItem(LOCAL_CAPTURES_KEY, JSON.stringify(orderCaptures(list)));
    return true;
  } catch {
    return false;
  }
}
