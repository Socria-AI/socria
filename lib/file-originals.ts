// lib/file-originals.ts — the original of an attached file: what it is called, and whose.
//
// Three things, kept apart on purpose (docs/FILE-PREVIEW.md):
//
//   1. THE ORIGINAL   the file as it was attached, byte for byte. Kept on the device
//                     that attached it and, for a signed-in account, in private
//                     storage under that account, so it opens on any of their devices.
//   2. THE PREVIEW    the original drawn as itself — pages, slides, a grid — in the
//                     browser, from the original (components/preview).
//   3. THE READING    the text and structure Socria reasons with (lib/docs), made once
//                     when the file was attached. What a reply cites.
//
// An original is named by the first 32 hex characters of the SHA-256 of its bytes,
// under a folder that is a digest of the account (lib/upload-paths.ts ownerPrefix) —
// so a path names no person, the same file attached twice is kept once, and nobody
// can reach anyone else's: the folder is always the caller's own.
//
// PURE (node:crypto only, through ownerPrefix).

import { ownerPrefix } from './upload-paths';

export const FILES_BUCKET = 'socria-files';
/** An original's id: 32 lowercase hex characters. */
export const FILE_ID = /^[a-f0-9]{32}$/;
/** How long a link to read an original lasts. Long enough to open it, never long enough to pass around. */
export const ORIGINAL_LINK_SECONDS = 300;

export function originalPath(userId: string, id: string): string | null {
  return FILE_ID.test(id) ? `${ownerPrefix(userId)}/${id}` : null;
}

/** The originals a conversation's messages point at (attachments carrying `file`). */
export function originalIdsIn(messages: unknown): string[] {
  const out = new Set<string>();
  if (!Array.isArray(messages)) return [];
  for (const m of messages) {
    const atts = m && typeof m === 'object' ? (m as { attachments?: unknown }).attachments : undefined;
    if (!Array.isArray(atts)) continue;
    for (const a of atts) {
      const id = a && typeof a === 'object' ? (a as { file?: unknown }).file : undefined;
      if (typeof id === 'string' && FILE_ID.test(id)) out.add(id);
    }
  }
  return [...out];
}

/** A content type safe to store an original under: what the browser said, if it is an ordinary one. */
export function storedType(mime: unknown): string {
  return typeof mime === 'string' && /^[a-z]+\/[a-z0-9.+-]{1,80}$/i.test(mime) && !/html|javascript|xml\+svg|svg/i.test(mime) ? mime : 'application/octet-stream';
}
