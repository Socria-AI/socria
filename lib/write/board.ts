// lib/write/board.ts — the Draft Space, read for its shape, and turned into an outline.
//
// The board is where an argument is put together before it is written: ideas
// dumped as they come, then sorted into piles that will each be a paragraph —
// a claim, what backs it, an example, the objection and the answer to it.
// What a rule can see about that shape it says here, quietly, on the cards
// concerned: a claim with nothing behind it, evidence that supports nothing,
// an objection left unanswered, two cards saying the same thing. It never
// moves, merges or rewords a card; it points, and the person decides.
//
// Turning the board into an outline ADDS to the writing: each pile becomes a
// heading (when it has a title) and an outline of its cards, in the person's
// own words, at the end of the document. What is already written is never
// touched, and a card already in the writing is not added twice.
//
// PURE.

import { cardsIn, uid, type Block, type Card, type Cite, type WriteDoc } from './doc';

export type HintKind = 'unsupported' | 'floating' | 'unanswered' | 'repeat' | 'leap';

export interface Hint {
  card: string;
  kind: HintKind;
  /** one sentence, said to the writer */
  says: string;
  /** the other card, for a repeat */
  other?: string;
}

const STOP = new Set(
  'the a an and or but if then than that this these those of to in on for with as at by from is are was were be been being it its i you he she they we my your our their his her not no do does did have has had will would can could should may might must about into over under just very really more most some any all what which who when where how why so because there here them us me him also'.split(' ')
);

function terms(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

/** How much two cards say the same: shared distinctive words over all of them. */
export function overlap(a: string, b: string): { score: number; shared: number } {
  const x = terms(a);
  const y = terms(b);
  if (!x.size || !y.size) return { score: 0, shared: 0 };
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return { score: shared / (x.size + y.size - shared), shared };
}

const clipQuote = (s: string, n = 60) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

const backs = (c: Card) => c.kind === 'evidence' || c.kind === 'example';
const linkedOut = (c: Card) => !!c.links?.some((l) => l.k === 'doc' || l.k === 'node');

/** What the shape of the board shows, card by card. At most one hint a card, the most useful. */
export function boardHints(doc: Pick<WriteDoc, 'cards' | 'groups'>): Hint[] {
  const out = new Map<string, Hint>();
  const add = (h: Hint) => {
    if (!out.has(h.card)) out.set(h.card, h);
  };
  const piles: (string | null)[] = [null, ...doc.groups.map((g) => g.id)];
  const linkedTo = new Set(doc.cards.flatMap((c) => (c.links ?? []).filter((l) => l.k === 'card').map((l) => l.id)));
  for (const pile of piles) {
    const cards = cardsIn(doc, pile);
    cards.forEach((c, k) => {
      const linksCard = (c.links ?? []).some((l) => l.k === 'card');
      if (c.kind === 'claim' && pile !== null) {
        const behind = cards.some((o) => o !== c && backs(o)) || linkedOut(c) || linksCard || linkedTo.has(c.id);
        if (!behind) add({ card: c.id, kind: 'unsupported', says: 'Nothing backs this claim yet — add evidence or an example to its pile, or link the passage it rests on.' });
      }
      if (backs(c) && pile !== null && !cards.some((o) => o.kind === 'claim' || o.kind === 'conclusion' || o.kind === 'idea') && !linksCard) {
        add({ card: c.id, kind: 'floating', says: `What does this ${c.kind === 'example' ? 'example show' : 'evidence support'}? Its pile has no claim for it to back.` });
      }
      if (c.kind === 'counter' && pile !== null && k === cards.length - 1 && !linkedTo.has(c.id)) {
        add({ card: c.id, kind: 'unanswered', says: 'An objection with nothing after it reads as conceded. Answer it, or say why it does not change your point.' });
      }
      if (c.kind === 'conclusion' && pile !== null && !cards.some((o) => o !== c && o.kind !== 'question' && o.kind !== 'conclusion')) {
        add({ card: c.id, kind: 'leap', says: 'A conclusion with nothing before it in its pile — what leads here?' });
      }
    });
  }
  // two cards saying much the same thing, anywhere on the board
  const all = doc.cards.filter((c) => c.text.trim());
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const o = overlap(all[i].text, all[j].text);
      if (o.score >= 0.6 && o.shared >= 3) {
        add({ card: all[j].id, kind: 'repeat', says: `This says much the same as “${clipQuote(all[i].text)}”. Merge them, or make the difference between them clear.`, other: all[i].id });
      }
    }
  }
  return Array.from(out.values());
}

/** The cards of a pile in the order an outline reads them: as the person arranged them. */
const LEVEL: Record<Card['kind'], 1 | 2> = { idea: 1, claim: 1, conclusion: 1, question: 1, evidence: 2, example: 2, counter: 2 };

/** The passages a card is linked to, as citations — so evidence keeps its source when it is written up. */
function citesOf(card: Card): Cite[] {
  return (card.links ?? [])
    .filter((l) => l.k === 'doc' && l.doc)
    .map((l) => ({ id: uid('c'), doc: l.doc!, block: l.id, label: l.label, ...(l.quote ? { quote: l.quote } : {}) }));
}

/**
 * The board — or one pile of it — as blocks to add at the end of the writing.
 * Cards already in the writing (a block grew from them) are left out, so
 * running it again adds only what is new.
 */
export function outlineFrom(doc: WriteDoc, only?: string | null): { blocks: Block[]; added: number; skipped: number } {
  const written = new Set(doc.blocks.flatMap((b) => b.from ?? []));
  const piles: { id: string | null; title: string }[] = [
    ...doc.groups.map((g) => ({ id: g.id as string | null, title: g.title })),
    { id: null, title: '' },
  ].filter((p) => only === undefined || p.id === only);
  const blocks: Block[] = [];
  let added = 0;
  let skipped = 0;
  for (const pile of piles) {
    const cards = cardsIn(doc, pile.id).filter((c) => c.text.trim());
    const fresh = cards.filter((c) => !written.has(c.id));
    skipped += cards.length - fresh.length;
    if (!fresh.length) continue;
    const title = pile.title.trim();
    if (title && !doc.blocks.some((b) => (b.t === 'h2' || b.t === 'h1' || b.t === 'h3') && b.text.trim() === title)) blocks.push({ id: uid('b'), t: 'h2', text: title });
    let sawTop = false;
    for (const c of fresh) {
      const lvl = LEVEL[c.kind] === 2 && sawTop ? 2 : 1;
      if (lvl === 1) sawTop = true;
      const cites = citesOf(c);
      blocks.push({ id: uid('b'), t: 'ul', lvl, text: c.text.trim().replace(/\s*\n\s*/g, ' '), from: [c.id], ...(cites.length ? { cites } : {}) });
      added++;
    }
  }
  return { blocks, added, skipped };
}

/** The board as the assist route is shown it: each card's kind, pile and words, and what it links to by name. */
export function boardBrief(doc: Pick<WriteDoc, 'cards' | 'groups'>, max = 120): { id: string; kind: string; pile: string; text: string; links: string[] }[] {
  const pileName = new Map(doc.groups.map((g, k) => [g.id, g.title.trim() || `Pile ${k + 1}`]));
  return doc.cards.slice(0, max).map((c) => ({
    id: c.id,
    kind: c.kind,
    pile: c.group ? pileName.get(c.group) ?? 'Loose' : 'Loose',
    text: c.text.slice(0, 600),
    links: (c.links ?? []).map((l) => `${l.k === 'doc' ? 'passage' : l.k === 'node' ? 'map idea' : 'card'}: ${l.label}`).slice(0, 6),
  }));
}
