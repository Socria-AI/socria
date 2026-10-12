// lib/docs/conversation.ts — the documents of a conversation, and their letters.
//
// A citation key ([A3.12]) is only as good as its letter, so the letter is
// decided ONE way, here, by the browser that shows the chips and the server
// that tells the model alike: documents are lettered A, B, C… in the order
// they were first attached in the conversation. A conversation only ever
// grows, so a letter, once given, keeps meaning the same document.
//
// PURE.

import { LETTERS, type DocRef } from './render';
import type { SourceDoc } from './types';

interface WithAttachments {
  attachments?: readonly { kind?: string; doc?: string }[];
}

/** Each document's letter, by first appearance: id → "A", "B"… (at most 26). */
export function docLetters(messages: readonly WithAttachments[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of messages) {
    for (const a of m.attachments ?? []) {
      if (a.kind !== 'doc' || !a.doc || out.has(a.doc)) continue;
      if (out.size >= LETTERS.length) return out;
      out.set(a.doc, LETTERS[out.size]);
    }
  }
  return out;
}

/** The documents at hand, each with its letter, in letter order. */
export function docRefsFor(messages: readonly WithAttachments[], docs: ReadonlyMap<string, SourceDoc> | Record<string, SourceDoc>): DocRef[] {
  const get = (id: string) => (docs instanceof Map ? docs.get(id) : (docs as Record<string, SourceDoc>)[id]);
  const out: DocRef[] = [];
  for (const [id, letter] of docLetters(messages)) {
    const doc = get(id);
    if (doc) out.push({ letter, doc });
  }
  return out;
}

/** What a request may carry of a conversation's documents: the most recently attached first, within a size. */
export const REQUEST_DOC_BYTES = 2_400_000;

/**
 * The documents to send with a turn — as many as fit, newest first, so the
 * document someone just attached is never the one left behind. The rest go
 * as their plain-text rendering, which every attachment carries anyway.
 */
export function docsForRequest(messages: readonly WithAttachments[], docs: ReadonlyMap<string, SourceDoc> | Record<string, SourceDoc>, budget = REQUEST_DOC_BYTES): SourceDoc[] {
  const refs = docRefsFor(messages, docs);
  const out: SourceDoc[] = [];
  let used = 0;
  for (const r of [...refs].reverse()) {
    const n = JSON.stringify(r.doc).length;
    if (used + n > budget) continue;
    out.push(r.doc);
    used += n;
  }
  return out;
}
