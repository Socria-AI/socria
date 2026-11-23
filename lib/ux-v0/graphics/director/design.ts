// lib/ux-v0/graphics/director/design.ts — a directed design made into a document.
//
// The director decides the idea, the palette, the two faces and the program (schema.ts DirectedDesign). Here that
// becomes a direction (tokens the whole editor understands: every later change by role, by hand or by the brand
// system works on it like on any design) and an artboard: the program scaled from the frame to the format's own
// units, passed through the gate, compiled, held to the hard rules for words, completed with any word of the brief
// it left out, checked and repaired (compose.ts composeProgram). What the conversation already decided (a palette, a
// pairing of faces) is held over the director's own. The idea and its reasons are kept with the artboard
// (record.ts), so every later turn knows what the design is for.

import { contrastRatio } from '../../../ux/audit';
import { graphicFont, nearestWeight } from '../../fonts';
import { ensureContrast } from '../../spec';
import { newId, normalizeDoc, type Artboard, type GraphicDoc, type Tokens } from '../doc';
import { formatOf } from '../formats';
import { mixColor } from '../paint';
import { approxMeasure, type Measure } from '../text';
import { adaptBoard, composeProgram, type GraphicBrief, type GraphicDirection } from '../compose';
import { scaleProgram } from './frame';
import type { DirectedDesign } from './schema';

export interface Decided {
  palette?: { ground?: string; ink?: string; accent?: string; accent2?: string };
  fonts?: { display: string; body: string };
}

/** The palette roles as the tokens every part of the editor reads. */
export function tokensOf(p: DirectedDesign['direction']['palette'], fonts: { display: string; body: string }): Tokens {
  const ground = p.ground;
  const ink = ensureContrast(p.ink, ground, 4.5);
  const accent = p.accent;
  return {
    colors: {
      background: ground,
      surface: mixColor(ground, ink, 0.06).slice(0, 7),
      text: ink,
      muted: ensureContrast(p.muted ?? mixColor(ink, ground, 0.42).slice(0, 7), ground, 4.5),
      accent,
      accentText: contrastRatio('#ffffff', accent) >= contrastRatio('#111111', accent) ? '#ffffff' : '#111111',
      line: mixColor(ground, ink, 0.18).slice(0, 7),
    },
    fonts,
    ...(p.accent2 ? { accent2: p.accent2 } : {}),
  };
}

/** The direction a directed design is drawn in: the director's, held to what the conversation decided. */
export function directionOf(design: DirectedDesign, base: GraphicDirection, decided: Decided = {}): GraphicDirection {
  const d = design.direction;
  const fonts = decided.fonts && graphicFont(decided.fonts.display) && graphicFont(decided.fonts.body) ? decided.fonts : { display: d.display ?? base.tokens.fonts.display, body: d.body ?? base.tokens.fonts.body };
  const palette = { ...d.palette, ...Object.fromEntries(Object.entries(decided.palette ?? {}).filter(([, v]) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v))) } as DirectedDesign['direction']['palette'];
  return { name: d.name, language: 'directed', concept: design.concept.idea, origin: 'generated', tokens: tokensOf(palette, fonts), look: { case: 'sentence', tracking: 'normal', weight: nearestWeight(fonts.display, 700) }, form: null, intensity: 50 };
}

/**
 * The director sets each piece of content by its own instruction. A "details" block (the engine's own stack of
 * subtitle, details, action and brand) would set words a second time, so one written by the director is read as what
 * it means there: the details, as lines.
 */
function ownWords(elements: unknown[]): unknown[] {
  return elements.map((e) => {
    const r = e && typeof e === 'object' && !Array.isArray(e) ? (e as Record<string, unknown>) : null;
    if (!r) return e;
    if (r.op === 'group' && Array.isArray(r.children)) return { ...r, children: ownWords(r.children) };
    if (r.op !== 'details') return e;
    const { op: _op, fromFoot: _f, sub: _s, scale, ...rest } = r;
    return { ...rest, op: 'text', content: 'meta', size: 24 * (typeof scale === 'number' && Number.isFinite(scale) ? Math.max(0.5, Math.min(3, scale)) : 1), lineHeight: 1.4 };
  });
}

export interface DirectedResult {
  doc: GraphicDoc;
  dir: GraphicDirection;
  /** what the gate dropped, what the hard rules could not settle, what the engine had to place */
  problems: string[];
  unresolved: string[];
  placed: string[];
}

/** A document composed from a directed design; null when its program is not one. */
export function composeDirected(brief: GraphicBrief, design: DirectedDesign, base: GraphicDirection, opts: { measure?: Measure; seed?: number; assets?: GraphicDoc['assets']; name?: string; decided?: Decided; now?: number } = {}): DirectedResult | null {
  const measure = opts.measure ?? approxMeasure;
  const dir = directionOf(design, base, opts.decided);
  const f = formatOf(brief.formats[0]) ?? formatOf('instagram-square')!;
  const made = composeProgram(brief, dir, f, scaleProgram({ ...design.program, elements: ownWords(design.program.elements) }, f), { measure, seed: opts.seed });
  if (!made) return null;
  const directed = { idea: design.concept.idea, rationale: design.concept.decisions };
  const first: Artboard = { ...made.board, directed };
  const raw = { schema: 1, id: newId('gd'), name: opts.name ?? brief.content.headline.slice(0, 60), direction: { name: dir.name, language: dir.language }, tokens: dir.tokens, artboards: [first], assets: opts.assets ?? [], revision: 1, updatedAt: opts.now ?? Date.now() };
  let doc = normalizeDoc(raw);
  if (!doc) return null;
  const problems = [...design.dropped, ...made.problems];
  // other formats of the same brief follow from the first (its words and type styles laid out again for each size)
  for (const id of brief.formats.slice(1, 6)) {
    const next = adaptBoard(doc, doc.artboards[0].id, id, dir, { measure, kind: brief.kind });
    if (next) doc = normalizeDoc({ ...doc, artboards: [...doc.artboards, next] }) ?? doc;
    else problems.push(`the ${id} format could not be made from this design`);
  }
  return { doc, dir, problems, unresolved: made.unresolved, placed: made.placed };
}
