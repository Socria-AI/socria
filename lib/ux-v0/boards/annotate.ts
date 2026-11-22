// lib/ux-v0/boards/annotate.ts — the notes that explain a board's design decisions, written from what is true of it.
//
// Every generated note is made from facts read off the materials themselves (the face its headline is really set in,
// its ground, the composition it was given, the format it adapts to, the design a mockup presents) and records those
// facts as CLAIMS. verifyNotes() reads the facts again: a note whose material has since changed (its headline now in
// another face) is said stale, never left standing as if it were still true. No rationale is invented: where a fact
// is not known (a website not open in this browser) nothing is said about it.

import { walk, type GraphicDoc, type TextNode } from '../graphics/doc';
import { formatOf } from '../graphics/formats';
import { describeForm } from '../form';
import { boardId, nodeOfMaterial, type BoardNode, type BoardOp, type BoardState, type Claim, type GraphicMaterial, type Material, type NoteNode } from './model';
import { noteHeight } from './layout';

const COMPOSITION: Record<string, string> = {
  'type-poster': 'the headline is the image, set across the full width',
  swiss: 'a visible grid: flush-left type in columns and one block of the accent',
  minimal: 'restraint: one quiet mark and wide margins',
  statement: 'a statement: the headline large, one supporting line',
  'image-split': 'the picture and the words share the frame, neither covering the other',
  'image-full': 'the picture fills the frame and the words sit on a ground of their own',
  masthead: 'a masthead across the top, the cover lines down one side',
  banner: 'the words held to the left, the action between them and the picture',
  label: 'an emblem and the name on the axis, the details small and ordered',
  card: 'the name first, then the role and the details',
  infographic: 'the chart drawn from the numbers given, the source said',
  process: 'the steps given, numbered in order',
  album: 'an abstract composition of the system’s shapes, the title small',
  book: 'the title as the image, the author named plainly',
  carousel: 'a cover, one point a slide, an ending',
};

/** The main text of a document: its headline, else its largest text. */
function headlineOf(doc: GraphicDoc): TextNode | null {
  const texts = doc.artboards[0] ? walk(doc.artboards[0]).map((l) => l.node).filter((n): n is TextNode => n.type === 'text' && !n.hidden) : [];
  return texts.find((t) => t.role === 'headline') ?? texts.sort((a, b) => b.size - a.size)[0] ?? null;
}

/** A fact of a material, read now. */
export function factOf(b: BoardState, c: Claim): string | null {
  const m = b.materials.find((x) => x.id === c.material);
  if (c.fact.startsWith('system-')) {
    const s = b.system;
    if (!s) return null;
    return c.fact === 'system-display' ? s.tokens.fonts.display : c.fact === 'system-body' ? s.tokens.fonts.body : s.tokens.colors.accent;
  }
  if (!m) return null;
  if (m.type === 'graphic') {
    if (!m.doc) return null;
    if (c.fact === 'headline-font') return headlineOf(m.doc)?.font ?? null;
    if (c.fact === 'ground') return (m.doc.artboards[0]?.background ?? 'transparent').toLowerCase();
    if (c.fact === 'archetype') return m.plan?.archetype ?? null;
    if (c.fact === 'format') return m.brief.formats[0] ?? null;
  }
  if (m.type === 'mockup' && c.fact === 'source') return m.source?.material ?? 'none';
  if (m.type === 'website' && c.fact === 'view') return m.view;
  return null;
}

/** A note about one material, from its facts; with the claims it makes. */
function noteFor(b: BoardState, m: Material): { text: string; claims: Claim[] } | null {
  const sys = b.system;
  if (m.type === 'graphic') {
    if (!m.doc || m.status !== 'ready') return null;
    const head = headlineOf(m.doc);
    const ground = (m.doc.artboards[0]?.background ?? '').toLowerCase();
    const f = formatOf(m.brief.formats[0]);
    const claims: Claim[] = [];
    const lines: string[] = [];
    // each sentence states one fact of this material, read off its document (nothing relative to the others)
    if (head && sys) {
      const role = head.font === sys.tokens.fonts.display ? ', the display face' : head.font === sys.tokens.fonts.body ? ', the text face' : '';
      lines.push(`${m.role === 'statement' ? 'Focal line' : 'Headline'} in ${head.font} ${head.weight}${role}.`);
      claims.push({ material: m.id, fact: 'headline-font', value: head.font });
    }
    if (m.plan && COMPOSITION[m.plan.archetype]) {
      const c = COMPOSITION[m.plan.archetype];
      lines.push(`${c.charAt(0).toUpperCase()}${c.slice(1)}.`);
      claims.push({ material: m.id, fact: 'archetype', value: m.plan.archetype });
    }
    if (sys && ground) {
      if (ground === sys.tokens.colors.accent.toLowerCase()) lines.push(`Ground: the accent, ${sys.tokens.colors.accent}.`);
      else if (ground === sys.tokens.colors.text.toLowerCase()) lines.push('Ground: the ink, the type in the paper colour (inverted).');
      else if (ground === sys.tokens.colors.background.toLowerCase()) lines.push(`Ground: the campaign’s paper, ${sys.tokens.colors.background}.`);
      else if (ground === sys.tokens.colors.surface.toLowerCase()) lines.push(`Ground: the surface colour, ${sys.tokens.colors.surface}.`);
      claims.push({ material: m.id, fact: 'ground', value: ground });
    }
    if (f && f.height / f.width > 1.6) {
      lines.push(`${f.label}: the same system stacked vertically.`);
      claims.push({ material: m.id, fact: 'format', value: f.id });
    } else if (f && f.width / f.height > 2.2) {
      lines.push(`${f.label}: the words kept to one side, read in one glance.`);
      claims.push({ material: m.id, fact: 'format', value: f.id });
    }
    return { text: lines.join(' '), claims };
  }
  if (m.type === 'mockup') {
    const src = m.source ? b.materials.find((x) => x.id === m.source!.material) : null;
    if (!src) return null;
    const where = m.template === 'phone' ? 'on a phone, as it is scrolled past' : m.template === 'poster-wall' ? 'framed on a wall, at reading distance' : m.template === 'box' ? 'wrapped onto the product box' : m.template === 'billboard' ? 'on a billboard, read from far away' : 'on a laptop screen';
    return { text: `Shows ${src.name} ${where}. Drawn from ${src.name} itself: it follows every change to it.`, claims: [{ material: m.id, fact: 'source', value: src.id }] };
  }
  if (m.type === 'website' && sys) {
    return {
      text: `${m.view === 'mobile' ? 'The website at phone width' : 'The website'}: a website project made in this system (${sys.tokens.fonts.display}, accent ${sys.tokens.colors.accent}). Open it in the website editor to change it.`,
      claims: [
        { material: m.id, fact: 'view', value: m.view },
        { material: m.id, fact: 'system-display', value: sys.tokens.fonts.display },
        { material: m.id, fact: 'system-accent', value: sys.tokens.colors.accent },
      ],
    };
  }
  return null;
}

/** Notes about the system itself, attached to its overview. */
function systemNotes(b: BoardState): { text: string; claims: Claim[] }[] {
  const s = b.system;
  if (!s) return [];
  const anyM = b.materials[0]?.id ?? 'system';
  const ready = b.materials.filter((m): m is GraphicMaterial => m.type === 'graphic' && m.status === 'ready' && !!m.doc);
  const out: { text: string; claims: Claim[] }[] = [
    { text: `Two faces for every material: ${s.tokens.fonts.display} for headlines, ${s.tokens.fonts.body} for text. ${s.tokens.accent2 ? `The accent ${s.tokens.colors.accent}, and a second accent, ${s.tokens.accent2}, where a field needs one.` : `One accent, ${s.tokens.colors.accent}.`}`, claims: [{ material: anyM, fact: 'system-display', value: s.tokens.fonts.display }, { material: anyM, fact: 'system-body', value: s.tokens.fonts.body }, { material: anyM, fact: 'system-accent', value: s.tokens.colors.accent }] },
  ];
  // how the graphics use the one palette, counted from their grounds (each ground is a claim checked later)
  if (ready.length > 1) {
    const ground = (m: GraphicMaterial) => (m.doc!.artboards[0]?.background ?? '').toLowerCase();
    const c = s.tokens.colors;
    const kinds = [
      { n: ready.filter((m) => ground(m) === c.background.toLowerCase()).length, say: 'on the paper' },
      { n: ready.filter((m) => ground(m) === c.accent.toLowerCase()).length, say: 'on the accent' },
      { n: ready.filter((m) => ground(m) === c.text.toLowerCase()).length, say: 'inverted on the ink' },
    ].filter((k) => k.n > 0);
    if (kinds.length > 1) out.push({ text: `The palette used ${kinds.length} ways across ${ready.length} graphics: ${kinds.map((k) => `${k.n} ${k.say}`).join(', ')}.`, claims: ready.map((m) => ({ material: m.id, fact: 'ground' as const, value: ground(m) })) });
  }
  if (s.shape) out.push({ text: `One shape language: ${describeForm(s.shape).replace(/\.$/, '').toLowerCase()}.`, claims: [] });
  return out;
}

/**
 * The operations that write a board's notes again from the facts. A generated note that is still about the same thing
 * is rewritten where it stands (its id, place and connector kept, so a designer's arrangement survives); a new one is
 * placed under what it explains and tied to it; one with nothing left to say goes. The designer's own notes, and
 * locked ones, stay exactly as they are.
 */
export function annotate(b: BoardState): BoardOp[] {
  const ops: BoardOp[] = [];
  const old = b.nodes.filter((n): n is NoteNode => n.type === 'note' && n.generated && !n.locked);
  const kept = new Set<string>();
  const write = (about: BoardNode, notes: readonly { text: string; claims: Claim[] }[]) => {
    const mine = old.filter((n) => n.about === about.id);
    const w = Math.max(300, about.w);
    let y = Math.max(about.y + about.h + 56, ...mine.map((n) => n.y + n.h + 20));
    notes.forEach((note, i) => {
      const cur = mine[i];
      if (cur) {
        kept.add(cur.id);
        if (cur.text !== note.text || JSON.stringify(cur.claims ?? []) !== JSON.stringify(note.claims)) {
          ops.push({ op: 'note-write', id: cur.id, text: note.text, claims: note.claims });
          const h = noteHeight(note.text, cur.w);
          if (h > cur.h) ops.push({ op: 'node-set', id: cur.id, h });
        }
        if (!b.connectors.some((c) => c.from === cur.id && c.to === about.id)) ops.push({ op: 'connect', from: cur.id, to: about.id });
        return;
      }
      const id = boardId('nt');
      const h = noteHeight(note.text, w);
      ops.push({ op: 'node-add', node: { id, type: 'note', text: note.text, generated: true, about: about.id, claims: note.claims, x: about.x, y, w, h } });
      ops.push({ op: 'connect', from: id, to: about.id });
      y += h + 20;
    });
  };
  for (const m of b.materials) {
    const place = nodeOfMaterial(b, m.id);
    if (!place) continue;
    const note = noteFor(b, m);
    write(place, note ? [note] : []);
  }
  const sysNode = b.nodes.find((n) => n.type === 'system');
  if (sysNode) write(sysNode, systemNotes(b));
  const gone = old.filter((n) => !kept.has(n.id)).map((n) => n.id);
  if (gone.length) ops.unshift({ op: 'node-remove', ids: gone });
  return ops;
}

/** Generated notes whose claims no longer hold, with what changed. */
export function verifyNotes(b: BoardState): { note: string; reasons: string[] }[] {
  const out: { note: string; reasons: string[] }[] = [];
  for (const n of b.nodes) {
    if (n.type !== 'note' || !n.generated || !n.claims?.length) continue;
    const reasons: string[] = [];
    for (const c of n.claims) {
      const now = factOf(b, c);
      if (now === null) reasons.push(c.fact === 'source' || c.fact === 'view' ? 'what it describes is gone' : `its ${c.fact.replace('-', ' ')} can no longer be read`);
      else if (now.toLowerCase() !== c.value.toLowerCase()) reasons.push(`it says ${c.fact.replace('system-', 'the system ').replace('-', ' ')} is ${c.value}, now ${now}`);
    }
    if (reasons.length) out.push({ note: n.id, reasons });
  }
  return out;
}

export type { GraphicMaterial };
