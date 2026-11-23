// lib/ux-v0/graphics/generative/edits.ts — creative direction in words. "Keep the style but completely rethink the
// composition", "Make something visually unexpected", "Keep the typography and change everything else", "Move the
// visual focus to the bottom-right", "Use more negative space"… Each is read into constraints for the engine. A small
// change (the focus moved, more room, the headline central) replays the current concept with that one thing changed;
// a large one (rethink, a new direction, the unexpected) conceives a new concept away from the current structure. The
// words, the pictures, the style and every locked object are kept; the change is one step, undone like any other.

import { composeGraphic, contentOf, type GraphicDirection, type GraphicKind } from '../compose';
import { newId, walk, type Artboard, type GraphicDoc, type Node } from '../doc';
import { formatOf } from '../formats';
import type { Measure } from '../text';
import type { ConceptConstraints, Emphasis } from './concept';
import { decodeSignature, signatureOfBoard, similarity, TOO_SIMILAR } from './evaluate';
import type { Colouring, Org, TypeStrategy } from './principles';
import type { ConceptRecord } from './record';

export interface CreativeEdit {
  /** what will be done, said */
  label: string;
  /** small: the current concept replayed with this changed; large: a new concept, away from the current one */
  size: 'small' | 'large';
  constraints: ConceptConstraints;
  emphasis?: Emphasis;
  /** N new compositions added beside the current one, as alternatives (nothing replaced) */
  explore?: number;
}

const FOCI: [RegExp, { x: number; y: number }][] = [
  [/\b(bottom|lower)[ -]right\b/, { x: 0.74, y: 0.76 }],
  [/\b(bottom|lower)[ -]left\b/, { x: 0.26, y: 0.76 }],
  [/\b(top|upper)[ -]right\b/, { x: 0.74, y: 0.24 }],
  [/\b(top|upper)[ -]left\b/, { x: 0.26, y: 0.24 }],
  [/\b(bottom|foot|lower half)\b/, { x: 0.5, y: 0.78 }],
  [/\b(top|upper half)\b/, { x: 0.5, y: 0.22 }],
  [/\bleft\b/, { x: 0.22, y: 0.5 }],
  [/\bright\b/, { x: 0.78, y: 0.5 }],
  [/\b(centre|center|middle)\b/, { x: 0.5, y: 0.5 }],
];

/** The creative direction words give, or null when they ask for something else (see the head of this file). */
export function readCreativeEdit(words0: string): CreativeEdit | null {
  const w = words0.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  if (!w || w.length > 300) return null;
  const n = Number(
    w
      .match(/\b(two|three|four|five|six|2|3|4|5|6)\b/)?.[1]
      ?.replace(/^two$/, '2')
      .replace(/^three$/, '3')
      .replace(/^four$/, '4')
      .replace(/^five$/, '5')
      .replace(/^six$/, '6'),
  );
  if (/\b(show me|give me|explore|make|generate)\b.*\b(different|more|other|alternative)\b.*\b(compositions?|layouts?|versions?|concepts?|interpretations?|directions?)\b/.test(w) && !/\bkeep the typography\b/.test(w))
    return { label: `${n || 4} different compositions, added beside this one`, size: 'large', constraints: {}, explore: Math.max(2, Math.min(6, n || 4)) };
  if (/nobody would expect|no one would expect|nobody expects/.test(w))
    return { label: 'something nobody would expect: an unconventional, unexpected concept that avoids the usual arrangement', size: 'large', constraints: { unexpected: true, unconventional: true, notAiLook: true } };
  if (/\b(doesn'?t|does not|don'?t|not) look like (a |an )?(typical |generic )?ai[- ]?(generated)?/.test(w) || /\bless ai\b|\bnot ai[- ]looking\b/.test(w))
    return { label: 'away from the generated look: strong asymmetry, a real typographic hierarchy, a crop with intent, no glow or gradient standing in for an idea', size: 'large', constraints: { notAiLook: true, asymmetric: true } };
  if (/\bkeep the typography\b|\bkeep the type\b.*\b(change|rest|everything else)\b/.test(w)) return { label: 'the typography kept; the rest reconceived', size: 'large', constraints: { keepType: true } };
  if (/\b(completely )?(different|new|another) creative direction\b|\ba completely different direction\b/.test(w))
    return { label: 'a different creative direction: another lead, another idea, another structure (the style kept)', size: 'large', constraints: { unconventional: false } };
  if (/\b(rethink|re-think|reimagine|re-imagine|reorgani[sz]e everything|change the layout|keep the style but|keep the text but)\b/.test(w))
    return { label: 'the composition rethought: a new concept, the style, words and pictures kept', size: 'large', constraints: {} };
  if (/\bconventional poster layout|\bconventional layout|\bless template[- ]?like\b|\bnot (a |so )?template|\bunconventional\b/.test(w))
    return { label: 'away from the conventional poster: no centred stack, no headline-top-details-bottom', size: 'large', constraints: { unconventional: true } };
  if (/\b(visually )?unexpected\b|\bless predictable\b|\bunpredictable\b|\btry something (more )?experimental\b|\bsurprise me\b/.test(w))
    return { label: 'something visually unexpected: the language’s rarer moves taken', size: 'large', constraints: { unexpected: true } };
  if (/\b(image|picture|photo)\b.*\b(primary|dominate|dominant|main|lead|focal|hero)\b/.test(w)) return { label: 'the picture made the primary visual element', size: 'large', constraints: { imagePrimary: true }, emphasis: 'image' };
  if (/\boriginal abstract motif\b|\babstract motif\b|\babstract (shape|form|idea)\b/.test(w)) return { label: 'an original abstract motif generated for it', size: 'large', constraints: { abstractMotif: true } };
  if (/\bdiagonal (reading |)flow\b|\bdiagonal reading\b|\bon a diagonal\b|\buse a diagonal\b/.test(w)) return { label: 'a diagonal reading flow', size: 'large', constraints: { diagonal: true } };
  if (/\btry an? asymmetric(al)? (structure|composition|layout)\b|\basymmetric(al)? structure\b/.test(w)) return { label: 'an asymmetrical structure', size: 'large', constraints: { asymmetric: true } };
  if (/\bmore dynamic\b|\bfeel dynamic\b|\bmore energy\b|\bmore movement\b/.test(w)) return { label: 'a more dynamic composition: turned, cut, moving', size: 'large', constraints: { dynamic: true } };
  if (/\bradial (composition|layout|arrangement)\b|\buse a radial\b/.test(w)) return { label: 'a radial composition', size: 'large', constraints: { org: 'orbit' } };
  if (/\b(more )?editorial (arrangement|layout|composition)\b/.test(w)) return { label: 'an editorial arrangement: a division and a column of words', size: 'large', constraints: { org: 'partition', type: 'column' } };
  if (/\btypography (the |)focal|\btype (the |)focal|\btypography lead|\bmake the (typography|type) the (focal point|hero)\b/.test(w))
    return { label: 'the typography as the focal point', size: 'large', constraints: { type: 'monumental' }, emphasis: 'type' };
  if (/\b(headline|title)\b.*\b(central|centre|center|middle)\b.*\belement\b|\bheadline the central\b|\bmake the (headline|title) central\b/.test(w))
    return { label: 'the headline as the central element', size: 'small', constraints: { headlineCentral: true, type: 'monumental' } };
  if (/\bmore (negative|white|empty) space\b|\bmore room\b|\bmore breathing room\b/.test(w)) return { label: 'more negative space', size: 'small', constraints: { negativeSpace: 70 } };
  if (/\b(visual )?focus\b|\bfocal point\b/.test(w) && /\b(move|put|shift|place|to the)\b/.test(w)) {
    const f = FOCI.find(([re]) => re.test(w));
    if (f) return { label: `the visual focus moved to the ${w.match(f[0])?.[0]}`, size: 'small', constraints: { focal: f[1] } };
  }
  return null;
}

export interface Recomposed {
  doc: GraphicDoc;
  label: string;
  kept: number;
  /** the new concept (or the first alternative's), as recorded */
  concept: ConceptRecord | null;
  /** how alike the new structure is to the old (0–1) */
  similarity: number | null;
}

/** The artboard recomposed by a creative edit (see the head of this file), or its alternatives added beside it. */
export function recomposeArtboard(doc: GraphicDoc, boardId: string, edit: CreativeEdit, opts: { dir: GraphicDirection; kind?: GraphicKind; measure?: Measure; turn?: number }): Recomposed | null {
  const board = doc.artboards.find((b) => b.id === boardId);
  if (!board) return null;
  const f = formatOf(board.format ?? '') ?? null;
  if (!f) return null;
  const read = contentOf(board);
  if (!read.content.headline) return null;
  const cur = board.concept ?? null;
  const dir: GraphicDirection = { ...opts.dir, tokens: doc.tokens, ...(doc.style ? { style: doc.style } : {}), engine: 'generative' };
  const brief = { purpose: 'recomposed', kind: opts.kind ?? ((f.width / f.height > 2.2 ? 'banner' : 'poster') as GraphicKind), formats: [f.id], content: read.content, mood: [] as string[], images: read.images };
  const turn = opts.turn ?? (doc.compositionMemory?.length ?? 0) + 1;
  const baseSeed = cur?.request.seed ?? `${doc.id ?? doc.name}|${board.id}`;
  const keys = cur ? { emphasis: cur.emphasis as Emphasis, org: cur.org as Org, org2: (cur.org2 as Org | null) ?? null, type: cur.type as TypeStrategy, motif: null, source: cur.source as never } : null;
  const avoidSigs = [cur?.signature, ...(doc.compositionMemory ?? []).filter((m) => m.verdict === 'rejected').map((m) => m.sig)].filter((s): s is string => !!s);
  const one = (i: number): { board: Artboard; concept: ConceptRecord | null } | null => {
    const large = edit.size === 'large';
    // a small change keeps the concept's own seed and structure; a large one starts a new concept away from it
    const constraints: ConceptConstraints = large
      ? { ...edit.constraints, ...(edit.constraints.keepType && cur ? { type: cur.type as TypeStrategy } : {}) }
      : { ...(cur ? { org: cur.org as Org, type: cur.type as TypeStrategy, colouring: cur.colouring as Colouring, focal: cur.focal } : {}), ...edit.constraints };
    const emphasis = edit.emphasis ?? (large && cur && !edit.constraints.keepType ? undefined : (cur?.emphasis as Emphasis | undefined));
    const req = {
      seed: large ? `${baseSeed}|${edit.label.slice(0, 24)}|${turn}|${i}` : i ? `${baseSeed}|${i}` : baseSeed,
      ...(emphasis ? { emphasis } : {}),
      ...(large && keys ? { avoid: [keys] } : {}),
      ...(large ? { avoidSignatures: avoidSigs } : {}),
      constraints,
    };
    const made = composeGraphic(brief, { ...dir, generative: req }, { measure: opts.measure, assets: doc.assets, name: doc.name });
    const fresh = made.doc.artboards[0];
    if (!fresh) return null;
    return { board: fresh, concept: fresh.concept ?? null };
  };

  if (edit.explore) {
    // alternatives beside it: nothing replaced; each a new concept, kept apart from the others
    const out: Artboard[] = [];
    const sigs = [...avoidSigs];
    // each kept apart as it is drawn: measured against the original and the ones before it, tried again (a bounded few
    // times) when it comes out the same structure, the least alike kept
    const drawn = [signatureOfBoard(board)];
    for (let i = 0; i < edit.explore; i++) {
      let r: ReturnType<typeof one> = null;
      let worst = Infinity;
      for (let k = 0; k < 4; k++) {
        const c = one(i + k * 17);
        if (!c) continue;
        const sg = signatureOfBoard(c.board);
        const near = Math.max(...drawn.map((d) => similarity(d, sg)));
        if (near < worst) {
          worst = near;
          r = c;
        }
        if (near < TOO_SIMILAR - 0.04) break;
      }
      if (!r) continue;
      drawn.push(signatureOfBoard(r.board));
      sigs.push(r.concept?.signature ?? '');
      out.push({ ...r.board, id: newId('ab'), name: `Alternative ${i + 1}${r.concept ? ` — ${r.concept.org}, ${r.concept.type}` : ''}` });
    }
    const at = doc.artboards.findIndex((b) => b.id === boardId);
    const artboards = [...doc.artboards.slice(0, at + 1), ...out, ...doc.artboards.slice(at + 1)];
    return { doc: { ...doc, artboards }, label: `${out.length} new compositions beside “${board.name}”, each its own concept (the original untouched)`, kept: 0, concept: out[0]?.concept ?? null, similarity: null };
  }

  // a small change is held to its own goal (emptier, the focus nearer where it was asked, the headline central),
  // tried a bounded few times; a large one to being a new structure
  const before0 = cur?.signature ? decodeSignature(cur.signature) : signatureOfBoard(board);
  const goal = (b: Artboard): number => {
    const sg = signatureOfBoard(b);
    if (edit.constraints.negativeSpace !== undefined && before0) return sg.empty - before0.empty;
    if (edit.constraints.focal) return -Math.hypot(sg.balance[0] - edit.constraints.focal.x, sg.balance[1] - edit.constraints.focal.y);
    if (edit.constraints.headlineCentral) return -Math.hypot(sg.head[0] - 0.5, sg.head[1] - 0.5);
    return before0 ? 1 - similarity(before0, sg) : 0;
  };
  const enough = (v: number) => (edit.constraints.negativeSpace !== undefined ? v >= 0.06 : edit.constraints.headlineCentral ? v >= -0.14 : edit.size === 'large' ? v >= 1 - TOO_SIMILAR : true);
  let r: { board: Artboard; concept: ConceptRecord | null } | null = null;
  let best = -Infinity;
  for (let i = 0; i < 4; i++) {
    const cand = i === 0 ? one(0) : one(i + 10);
    if (!cand) continue;
    const v = goal(cand.board);
    if (v > best) ((best = v), (r = cand));
    if (enough(v)) break;
  }
  if (!r) return null;
  // what is locked stays exactly as it was, where it was in the order
  const locked = board.children.map((n, i) => ({ n, i })).filter(({ n }) => n.locked);
  const children: Node[] = [...r.board.children];
  for (const { n, i } of locked) children.splice(Math.min(i, children.length), 0, n);
  const next: Artboard = { ...board, background: r.board.background, children, ...(r.concept ? { concept: r.concept } : {}) };
  const before = cur?.signature ? decodeSignature(cur.signature) : signatureOfBoard(board);
  const after = signatureOfBoard(next);
  const sim = before ? similarity(before, after) : null;
  const idea = r.concept?.idea ? ` — ${r.concept.idea}` : '';
  return {
    doc: { ...doc, artboards: doc.artboards.map((b) => (b.id === boardId ? next : b)) },
    label: `${edit.label}${idea}${locked.length ? ` (${locked.length} locked object${locked.length === 1 ? '' : 's'} kept)` : ''}`,
    kept: locked.length,
    concept: r.concept,
    similarity: sim,
  };
}

/** Whether a structure is new enough against another (the threshold diversity uses). */
export const isNew = (sim: number | null) => sim === null || sim < TOO_SIMILAR;
export { walk };
