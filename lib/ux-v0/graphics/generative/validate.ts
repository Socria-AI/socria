// lib/ux-v0/graphics/generative/validate.ts — the quality of a generated design, measured: brief fidelity, required
// content, composition coherence, style fidelity, readability, visual hierarchy, structural diversity, technical
// validity, editability and export fidelity. Deterministic, from the objects themselves (the checks, the style
// evaluator, the renderer); what only an eye can judge is said as a checkpoint, never scored. Diversity is one check
// among ten: an original design that reads badly fails here.

import { checkDoc } from '../check';
import type { GraphicContent } from '../compose';
import { normalizeDoc, walk, wordsOf, type Artboard, type GraphicDoc, type Node, type TextNode } from '../doc';
import { renderArtboard } from '../render';
import { evaluateStyle } from '../styles/evaluate';
import type { Measure } from '../text';
import { decodeSignature, signatureOfBoard, similarity, TOO_SIMILAR, type Signature } from './evaluate';

export const QUALITY_CHECKS = ['brief', 'content', 'coherence', 'style', 'readability', 'hierarchy', 'diversity', 'technical', 'editability', 'export'] as const;
export type QualityKey = (typeof QUALITY_CHECKS)[number];

export interface QualityCheck {
  key: QualityKey;
  label: string;
  /** 0–1 */
  score: number;
  pass: boolean;
  notes: string[];
}

export interface QualityReport {
  checks: QualityCheck[];
  pass: boolean;
  /** the mean of the scores, 0–1 */
  score: number;
  /** what a person should look at (never scored here) */
  checkpoints: string[];
}

const LABEL: Record<QualityKey, string> = {
  brief: 'Brief fidelity',
  content: 'Required content, exactly',
  coherence: 'Composition coherence',
  style: 'Style fidelity',
  readability: 'Readability',
  hierarchy: 'Visual hierarchy',
  diversity: 'Structural diversity',
  technical: 'Technical validity',
  editability: 'Editability',
  export: 'Export fidelity',
};

const ESSENTIAL = new Set(['headline', 'subhead', 'meta', 'cta', 'logo', 'body']);

/** One artboard of a document judged (see the head of this file). */
export function validateDesign(doc: GraphicDoc, boardId: string, brief: { content: GraphicContent; images: readonly string[] }, opts: { measure?: Measure; siblings?: readonly (Signature | string)[] } = {}): QualityReport {
  const board = doc.artboards.find((b) => b.id === boardId) ?? doc.artboards[0];
  const one: GraphicDoc = { ...doc, artboards: [board] };
  const nodes = walk(board).map((l) => l.node);
  const texts = nodes.filter((n): n is TextNode => n.type === 'text' && !n.hidden);
  const essential = texts.filter((t) => !t.decorative && t.role && ESSENTIAL.has(t.role));
  const words = [...wordsOf(one).values()];
  const all = words.join('\n');
  const u = Math.min(board.width, board.height) / 100;
  const checks: QualityCheck[] = [];
  const add = (key: QualityKey, score: number, notes: string[], threshold = 0.7) => checks.push({ key, label: LABEL[key], score: Math.round(Math.max(0, Math.min(1, score)) * 100) / 100, pass: score >= threshold, notes });

  // brief fidelity: every part the brief gave appears, every picture given is used
  const c = brief.content;
  const parts = [c.headline, c.subhead, ...(c.meta ?? []), c.cta, c.brand].filter((x): x is string => !!x);
  const present = parts.filter((p) => all.includes(p));
  const used = new Set(nodes.filter((n) => n.type === 'image').map((n) => (n as { asset: string }).asset));
  const picturesUsed = brief.images.filter((id) => used.has(id));
  add(
    'brief',
    (present.length / Math.max(1, parts.length)) * 0.75 + (brief.images.length ? (picturesUsed.length / brief.images.length) * 0.25 : 0.25),
    [`${present.length} of ${parts.length} parts of the brief set`, ...(brief.images.length ? [`${picturesUsed.length} of ${brief.images.length} pictures used`] : [])],
    0.99,
  );

  // required content: the headline exactly as written, once, as text
  const heads = texts.filter((t) => t.role === 'headline' && !t.decorative);
  const exact = heads.length === 1 && heads[0].text === c.headline;
  add('content', exact ? 1 : 0, [exact ? 'the headline is set exactly as written, as text' : `the headline is ${heads.length ? `“${heads[0].text}”` : 'missing'}`], 1);

  // coherence: words never over words, every word inside the frame, the parts aligned to something
  const box = (t: Node) => ({ x: t.x, y: t.y, w: t.w, h: t.h });
  let overlaps = 0;
  for (let i = 0; i < essential.length; i++)
    for (let j = i + 1; j < essential.length; j++) {
      const a = box(essential[i]);
      const b = box(essential[j]);
      if (essential[i].rotation || essential[j].rotation || essential[i].path || essential[j].path) continue;
      if (a.x < b.x + b.w - u * 0.3 && b.x < a.x + a.w - u * 0.3 && a.y < b.y + b.h - u * 0.3 && b.y < a.y + a.h - u * 0.3) overlaps++;
    }
  const aligned = essential.filter((t) => essential.some((o) => o !== t && (Math.abs(o.x - t.x) < u * 1.2 || Math.abs(o.x + o.w - (t.x + t.w)) < u * 1.2 || Math.abs(o.x + o.w / 2 - (t.x + t.w / 2)) < u * 1.2))).length;
  add('coherence', 1 - overlaps * 0.4 - (essential.length > 1 ? (1 - aligned / essential.length) * 0.3 : 0), [
    overlaps ? `${overlaps} pair${overlaps === 1 ? '' : 's'} of words overlapping` : 'no words over words',
    `${aligned} of ${essential.length} texts aligned with another`,
  ]);

  // style fidelity: the style evaluator where a style is chosen; else the direction's own faces and colours
  const fid = evaluateStyle(one, { measure: opts.measure });
  if (fid)
    add(
      'style',
      fid.overall / 100,
      [
        `${fid.style}: ${fid.overall}/100`,
        ...Object.entries(fid.dims)
          .slice(0, 3)
          .map(([k, v]) => `${k} ${v.score}`),
      ],
      0.55,
    );
  else {
    const faces = new Set([doc.tokens.fonts.display, doc.tokens.fonts.body]);
    const inFaces = essential.filter((t) => faces.has(t.font)).length;
    add('style', inFaces / Math.max(1, essential.length), [`${inFaces} of ${essential.length} texts in the direction’s faces`], 0.8);
  }

  // readability: the document checks on this artboard (contrast, size, overflow, the safe area)
  const findings = checkDoc(one, opts.measure).filter((f) => f.artboard === board.id);
  const high = findings.filter((f) => f.severity === 'high');
  const medium = findings.filter((f) => f.severity === 'medium');
  add('readability', 1 - high.length * 0.5 - medium.length * 0.08, [high.length || medium.length ? `${high.length} high and ${medium.length} medium findings` : 'no readability findings', ...high.slice(0, 2).map((f) => f.message)], 0.9);

  // hierarchy: the title leads (the largest essential text, clearly), and is read first
  const head = heads[0];
  const others = essential.filter((t) => t !== head);
  const second = Math.max(0, ...others.map((t) => t.size));
  const ratio = head && second ? head.size / second : head ? 3 : 0;
  add('hierarchy', head ? Math.min(1, (ratio - 1) / 1.2) : 0, [head ? `the title is ${ratio.toFixed(1)}× the next text` : 'no title'], 0.5);

  // diversity: structurally apart from the designs it is compared with
  const sig = signatureOfBoard(board);
  const sibs = (opts.siblings ?? []).map((s) => (typeof s === 'string' ? decodeSignature(s) : s)).filter((s): s is Signature => !!s);
  const closest = sibs.length ? Math.max(...sibs.map((s) => similarity(sig, s))) : 0;
  add(
    'diversity',
    sibs.length ? Math.min(1, (1 - closest) / (1 - TOO_SIMILAR + 0.05)) : 1,
    [sibs.length ? `closest structure ${closest.toFixed(2)} similar (${closest < TOO_SIMILAR ? 'a different structure' : 'the same structure'})` : 'nothing to compare with'],
    0.7,
  );

  // technical validity: the document survives its own normaliser unchanged in shape; every number is finite
  const again = normalizeDoc(JSON.parse(JSON.stringify(one)));
  const finite = nodes.every((n) => [n.x, n.y, n.w, n.h, n.rotation, n.opacity].every((v) => typeof v === 'number' && Number.isFinite(v)));
  const same = again && walk(again.artboards[0]).length === nodes.length;
  add('technical', (finite ? 0.5 : 0) + (same ? 0.5 : 0), [finite ? 'every number finite' : 'a number is not finite', same ? 'the document normalises to itself' : 'normalising changes the document'], 1);

  // editability: words are text, shapes are native objects, no picture but the designer's own
  const flattened = nodes.filter((n) => n.type === 'image' && !brief.images.includes((n as { asset: string }).asset)).length;
  const native = nodes.filter((n) => n.type === 'shape' || n.type === 'text' || n.type === 'group' || n.type === 'pattern').length;
  add('editability', flattened ? 0 : 1, [`${native} native objects`, `${essential.length} texts editable as text`, ...(flattened ? [`${flattened} pictures not given by the designer`] : [])], 1);

  // export fidelity: the renderer draws it, with every word as text and no broken number
  let svg = '';
  try {
    svg = renderArtboard(one, board, { measure: opts.measure });
  } catch {
    svg = '';
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const firstWord = c.headline.split(/\s+/).filter(Boolean)[0] ?? '';
  // the words as text in the file (case as set: a language may set them in capitals or small letters)
  const drawn = !!svg && !/NaN|undefined/.test(svg) && svg.toLowerCase().includes(esc(firstWord).toLowerCase().slice(0, 12));
  add('export', drawn ? 1 : 0, [drawn ? 'rendered as SVG with its words as text' : 'the render failed or lost its words'], 1);

  const score = checks.reduce((s, x) => s + x.score, 0) / checks.length;
  return {
    checks,
    pass: checks.every((x) => x.pass),
    score: Math.round(score * 100) / 100,
    checkpoints: ['Does the idea come through at a glance?', 'Would a designer have made this choice of crop and scale?', 'Is it recognisably in its language without copying a period piece?'],
  };
}

export const boardWords = (b: Artboard) =>
  walk(b)
    .filter((l) => l.node.type === 'text')
    .map((l) => (l.node as TextNode).text);
