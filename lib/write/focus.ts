// lib/write/focus.ts — words of their own draft, as the conversation should know them.
//
// POINT & ASK on writing: a sentence, a paragraph, or a card of the Draft
// Space, selected and asked about in the conversation. The brief says what
// the words are (verbatim — they are the person's own, as trusted as their
// message), where they sit, and what they are connected to: the passages they
// cite and the map ideas and cards they grew from, by name. Ephemeral, like
// every workspace focus; never stored, never written into the document.
//
// PURE.

import type { FocusBrief } from '@/lib/workspace/focus';
import { CARD_KIND_LABEL, findCell, type WriteDoc } from './doc';

/** What is selected in the writing: a range of a block, or a card. */
export type WriteSel = { kind: 'block'; block: string; s: number; e: number } | { kind: 'card'; card: string };

const MAX_LINE = 220;
const one = (s: string, n = MAX_LINE) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** The selection, described from the document — or null when it is no longer there. */
export function describeWriting(doc: WriteDoc | null | undefined, sel: WriteSel | null): FocusBrief | null {
  if (!doc || !sel) return null;
  const of = doc.title.trim() ? `“${one(doc.title, 60)}”` : '';
  if (sel.kind === 'card') {
    const c = doc.cards.find((x) => x.id === sel.card);
    if (!c || !c.text.trim()) return null;
    const pile = c.group ? doc.groups.find((g) => g.id === c.group) : null;
    const lines = [
      `a card in their Draft Space — ${CARD_KIND_LABEL[c.kind].toLowerCase()}${pile ? `, in the pile “${one(pile.title || 'untitled', 60)}”` : ', not yet in a pile'}`,
      `it reads, in their words: “${one(c.text, 180)}”`,
      ...(c.links ?? []).slice(0, 4).map((l) => `linked to ${l.k === 'doc' ? 'a passage of their documents' : l.k === 'node' ? 'an idea on their Logic Map' : 'another card'}: ${one(l.label, 120)}`),
    ];
    return { kind: 'writing', label: one(c.text, 80), of: of ? `the Draft Space of ${of}` : 'their Draft Space', lines };
  }
  const i = doc.blocks.findIndex((b) => b.id === sel.block);
  const cell = i < 0 ? findCell(doc, sel.block) : null;
  if (cell) {
    // a cell of a table: its words, and where in the table they are
    const t = cell.cell.text;
    const s = Math.max(0, Math.min(t.length, Math.min(sel.s, sel.e)));
    const e = Math.max(0, Math.min(t.length, Math.max(sel.s, sel.e)));
    const words = (e > s ? t.slice(s, e) : t).trim();
    if (!words) return null;
    const head = cell.table.head ? (cell.table.rows?.[0] ?? []).map((c) => c.text.trim()).filter(Boolean) : [];
    const lines = [
      `a cell of a table in their draft — row ${cell.r + 1}, column ${cell.c + 1}${head[cell.c] && cell.r > 0 ? `, under “${one(head[cell.c], 60)}”` : ''}`,
      `their words, verbatim: “${one(words, 190)}”`,
    ];
    return { kind: 'writing', label: one(words, 80), of: of ? `the draft ${of}` : 'their draft', lines };
  }
  const b = doc.blocks[i];
  if (!b) return null;
  const s = Math.max(0, Math.min(b.text.length, Math.min(sel.s, sel.e)));
  const e = Math.max(0, Math.min(b.text.length, Math.max(sel.s, sel.e)));
  const words = (e > s ? b.text.slice(s, e) : b.text).trim();
  if (!words) return null;
  const whole = e - s >= b.text.trim().length || e <= s;
  const where = b.t === 'quote' ? 'a quotation in their draft' : b.t.startsWith('h') ? 'a heading of their draft' : b.t === 'ul' || b.t === 'ol' ? 'an item of an outline in their draft' : `paragraph ${doc.blocks.slice(0, i + 1).filter((x) => x.t === 'p' && x.text.trim()).length} of their draft`;
  const grew = (b.from ?? []).map((id) => doc.cards.find((c) => c.id === id)).filter(Boolean).slice(0, 2);
  const lines = [
    `${whole ? 'all of' : 'words from'} ${where}`,
    `their words, verbatim: “${one(words, 190)}”`,
    ...(!whole ? [`in the paragraph: “${one(b.text, 190)}”`] : []),
    ...(b.cites ?? []).slice(0, 3).map((c) => `it cites a passage they linked: ${one(c.label, 140)}`),
    ...grew.map((c) => `it grew from their Draft Space card: “${one(c!.text, 140)}”${(c!.links ?? []).some((l) => l.k === 'node') ? `, linked to the map idea ${one((c!.links ?? []).find((l) => l.k === 'node')!.label, 80)}` : ''}`),
  ];
  return { kind: 'writing', label: one(words, 80), of: of ? `the draft ${of}` : 'their draft', lines };
}
