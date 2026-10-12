// lib/docs/edit.ts — the person's say over a reading.
//
// A reading is what a reader made of the file, and the person can often see
// better than any reader what the file says: a scan misread, a symbol lost, a
// digit slipped. Two things are theirs to do, and to take back:
//
//   CORRECT   a passage says what the person writes instead. It is flagged
//             'corrected' wherever it is shown — to the person, and to the
//             model ("corrected by the person") — so their words are never
//             passed off as the file's, and what the reading said is kept
//             (`was`) so the correction can be undone.
//   DOUBT     a passage is marked as read wrongly ('misread'). Its text stays;
//             it is shown, and given to the model, as doubted.
//
// Nothing else in the document changes, and nothing changes but by the
// person's hand: these are called only from what they do in the document view.
//
// PURE.

import { DOC_LIMITS } from './sanitize';
import type { BlockFlag, DocBlock, SourceDoc } from './types';

/** Passages whose words can be corrected by hand: text, not a table's grid or a figure. */
export const correctable = (b: DocBlock): boolean => b.kind !== 'table' && b.kind !== 'figure';

const withFlag = (flags: BlockFlag[] | undefined, f: BlockFlag, on: boolean): BlockFlag[] | undefined => {
  const out = (flags ?? []).filter((x) => x !== f);
  if (on) out.push(f);
  return out.length ? out : undefined;
};

function patch(doc: SourceDoc, id: string, edit: (b: DocBlock) => DocBlock | null): SourceDoc | null {
  const i = doc.blocks.findIndex((b) => b.id === id);
  if (i < 0) return null;
  const next = edit(doc.blocks[i]);
  if (!next) return null;
  const blocks = doc.blocks.slice();
  const { flags, was, ...rest } = next;
  blocks[i] = { ...rest, ...(flags?.length ? { flags } : {}), ...(was !== undefined ? { was } : {}) };
  return { ...doc, blocks };
}

/**
 * A passage, in the person's words. Null when there is no such passage, it
 * cannot be corrected by hand, or the words are empty or unchanged. A second
 * correction keeps the first reading as `was`, not the first correction.
 */
export function correctBlock(doc: SourceDoc, id: string, text: string): SourceDoc | null {
  // eslint-disable-next-line no-control-regex
  const t = text.replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, DOC_LIMITS.blockText);
  return patch(doc, id, (b) => {
    if (!correctable(b) || !t || t === b.text) return null;
    const was = b.flags?.includes('corrected') && b.was !== undefined ? b.was : b.text;
    if (t === was) return { ...b, text: was, flags: withFlag(b.flags, 'corrected', false), was: undefined };
    // a correction answers a doubt
    return { ...b, text: t, flags: withFlag(withFlag(b.flags, 'misread', false), 'corrected', true), was };
  });
}

/** A correction taken back: the passage says what the reading said. Null when it was never corrected. */
export function restoreBlock(doc: SourceDoc, id: string): SourceDoc | null {
  return patch(doc, id, (b) => (b.flags?.includes('corrected') && b.was !== undefined ? { ...b, text: b.was, flags: withFlag(b.flags, 'corrected', false), was: undefined } : null));
}

/** A passage marked as read wrongly, or no longer. Null when nothing would change. */
export function markMisread(doc: SourceDoc, id: string, on: boolean): SourceDoc | null {
  return patch(doc, id, (b) => (!!b.flags?.includes('misread') === on ? null : { ...b, flags: withFlag(b.flags, 'misread', on) }));
}

/** How many passages the person corrected, and how many they doubt. */
export function editsIn(doc: SourceDoc): { corrected: number; misread: number } {
  let corrected = 0;
  let misread = 0;
  for (const b of doc.blocks) {
    if (b.flags?.includes('corrected')) corrected++;
    if (b.flags?.includes('misread')) misread++;
  }
  return { corrected, misread };
}
