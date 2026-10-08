// lib/upload-paths.ts
//
// WHERE A LARGE UPLOAD MAY LIVE, AND WHOSE IT IS — the rules both upload
// routes share, kept pure so they can be tested without storage.
//
// A file too large to travel through our server (Socria One, up to 30 MB)
// goes from the browser straight into a private bucket, at a path that
// belongs to one person: a digest of their account id (so the id itself is
// never in a path), then a folder named by the time it was made and a random
// tag, then the file's own name. The read route accepts a path only if it is
// under the caller's own digest; the sweep removes anything older than an
// hour, because nothing is meant to stay — a file is deleted the moment it
// has been read.
//
// PURE (node:crypto only).

import { createHash, randomBytes } from 'node:crypto';

export const UPLOAD_BUCKET = 'socria-uploads';
/** An upload never read is removed after this long. */
export const UPLOAD_TTL_MS = 60 * 60 * 1000;

export function ownerPrefix(userId: string): string {
  return createHash('sha256').update(`socria-upload:${userId}`).digest('hex').slice(0, 24);
}

/** A file name safe to put in a path: no slashes, no control characters, at most 120 characters. */
export function safeFileName(name: string): string {
  const base = String(name || 'file').replace(/[\u0000-\u001f\\/]/g, '').replace(/^\.+/, '').trim().slice(0, 120);
  return base || 'file';
}

export function uploadPath(userId: string, name: string, now = Date.now(), tag = randomBytes(6).toString('hex')): string {
  return `${ownerPrefix(userId)}/${now}-${tag}/${safeFileName(name)}`;
}

const PATH_RE = /^([a-f0-9]{24})\/(\d{12,14})-([a-f0-9]{12})\/([^/]{1,120})$/;

/** Is this a path this person's upload could have, and nothing else? */
export function ownsUploadPath(userId: string, path: unknown): boolean {
  if (typeof path !== 'string') return false;
  const m = PATH_RE.exec(path);
  return !!m && m[1] === ownerPrefix(userId) && !m[4].includes('..');
}

/** When the folder of an upload was made, from its name; null if the name is not one of ours. */
export function uploadMadeAt(folder: string): number | null {
  const m = /^(\d{12,14})-[a-f0-9]{12}$/.exec(folder);
  return m ? Number(m[1]) : null;
}
