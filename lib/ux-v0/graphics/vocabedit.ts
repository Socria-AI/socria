// lib/ux-v0/graphics/vocabedit.ts — edits in words that use the expanded vocabulary, read in code into targeted
// operations on what is already there.
//
//   "Replace the circular motif with an irregular vector ribbon."      → that motif becomes the ribbon primitive
//   "Add a subtle halftone treatment to the image."                     → an effect on the pictures, gentle
//   "Make the headline follow a curved path."                           → the headline set along an arc, refitted
//   "Use a more complex geometric background."                          → a geometric pattern, denser, more inks
//   "Reduce the number of decorative elements."                         → the smallest ornaments removed
//   "Add a grain texture without changing the layout."                  → grain on the ground, nothing moved
//   "Create a more dramatic composition using the same colors."         → scale, crossing shapes, inverted ground
//   "Keep the typography unchanged."                                    → a guard on everything else asked
//   "Create a dense radial line pattern behind the headline."           → a radial generator, behind the words
//   "Generate an irregular geometric motif using the campaign accent color." → a seeded primitive, in the accent
//   "Make the background feel more organic and fluid."                  → a flow field in the background
//   "Create a technical grid with subtle annotations."                  → the technical generator, faint
//   "Generate a repeating wave pattern that becomes denser toward the bottom." → waves with a ramp downward
//
// Every result is a set of document operations (doc.ts): applied as one change, undone in one step, refused whole
// if anything is locked. Constraints said alongside ("keep the typography unchanged", "using the same colours",
// "without changing the layout") remove from the result anything they forbid. Nothing here calls a model.

import { contrastRatio } from '../../ux/audit';
import { capabilityMenu, searchCapabilities, type Capability } from './capabilities';
import { boxOnBoard, isLocked, newId, walk, type Artboard, type GraphicDoc, type Located, type Node, type Op, type ShapeNode, type TextNode } from './doc';
import { effectDefaults, type Effect } from './effects';
import { primDefaults, PRIMITIVE_BY_KIND } from './geometry';
import { patternDefaults, isPxParam } from './patterns';
import { approxMeasure, fitSize, fitToPath, type Measure } from './text';

export interface VocabEdit {
  ops: Op[];
  label: string;
  scope: 'selection' | 'object' | 'artboard' | 'document';
  question?: string;
}
export interface Guards {
  type: boolean;
  colours: boolean;
  /** only colours the design already has (in whatever roles) */
  palette: boolean;
  layout: boolean;
}

/** The constraints said in a request ("keep the typography unchanged", "using the same colours", "without changing
 * the layout"). */
export function guardsOf(words: string): Guards {
  return {
    type: /\b(keep|leave|preserve)\b[^.]*\b(typography|type|typefaces?|fonts?)\b[^.]*\b(unchanged|intact|as (it|they) (is|are)|the same)\b|\bwithout changing the (typography|type|fonts?)\b|\b(typography|type) (unchanged|untouched)\b/.test(words),
    colours: /\b((keep|keeping) the colou?rs|without changing the colou?rs|colou?rs (unchanged|untouched))\b/.test(words),
    palette: /\b(same colou?rs|same palette|only the colou?rs (we|it) (have|has)|existing colou?rs)\b/.test(words),
    layout: /\bwithout changing the (layout|composition|positions?)\b|\b(keep|keeping) the (layout|composition)\b|\blayout (unchanged|untouched)\b/.test(words),
  };
}

const TYPE_KEYS = ['font', 'weight', 'italic', 'size', 'tracking', 'lineHeight', 'case', 'runs', 'axes', 'path', 'warp', 'features', 'kerning'];
const COLOUR_KEYS = ['color', 'fill', 'stroke', 'strokes', 'colors', 'background'];
const LAYOUT_KEYS = ['x', 'y', 'w', 'h', 'rotation', 'skewX', 'skewY'];

/** Operations with what the guards forbid taken out; what was held back is said. */
export function guarded(doc: GraphicDoc, ops: Op[], g: Guards): { ops: Op[]; held: string[] } {
  const held = new Set<string>();
  const texts = new Set(doc.artboards.flatMap((b) => walk(b).filter((l) => l.node.type === 'text').map((l) => l.node.id)));
  // the design's own colours: its tokens, its swatches, and every colour already on it
  const own = new Set<string>([...Object.values(doc.tokens.colors), doc.tokens.accent2 ?? '', ...(doc.swatches ?? []), ...doc.artboards.flatMap((b) => [b.background ?? '', ...walk(b).flatMap((l) => [(l.node as { color?: string }).color ?? '', typeof (l.node as { fill?: unknown }).fill === 'string' ? ((l.node as { fill: string }).fill) : ''])])].filter(Boolean).map((c) => c.slice(0, 7).toLowerCase()));
  const newColour = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}/i.test(v) && !own.has(v.slice(0, 7).toLowerCase());
  const out: Op[] = [];
  for (const op of ops) {
    if (op.op === 'update') {
      const set = { ...op.set };
      for (const k of Object.keys(set)) {
        if (g.type && texts.has(op.id) && TYPE_KEYS.includes(k)) (delete set[k], held.add('the typography'));
        if (g.colours && COLOUR_KEYS.includes(k)) (delete set[k], held.add('the colours'));
        else if (g.palette && COLOUR_KEYS.includes(k) && newColour(set[k])) (delete set[k], held.add('the palette'));
        if (g.layout && LAYOUT_KEYS.includes(k)) (delete set[k], held.add('the layout'));
      }
      if (Object.keys(set).length) out.push({ ...op, set });
      continue;
    }
    if (g.layout && (op.op === 'move' || op.op === 'resize')) {
      held.add('the layout');
      continue;
    }
    if ((g.colours || (g.palette && newColour(op.op === 'artboard-update' ? op.set.background : undefined))) && op.op === 'artboard-update' && 'background' in op.set) {
      held.add('the colours');
      continue;
    }
    out.push(op);
  }
  return { ops: out, held: [...held] };
}

// ── finding what the words point at ──

const motifsOf = (board: Artboard) => walk(board).filter((l) => !isLocked(l) && (l.node.role === 'motif' || l.node.type === 'pattern') && !(l.node.type === 'shape' && l.node.shape === 'line'));
const headlineOf = (board: Artboard) => walk(board).find((l) => l.node.type === 'text' && l.node.role === 'headline') ?? walk(board).filter((l) => l.node.type === 'text').sort((p, q) => (q.node as TextNode).size - (p.node as TextNode).size)[0];

/** Whether a shape answers a description ("circular", "square", "triangular", "star", "organic"…). */
function answers(n: Node, desc: string): boolean {
  if (n.type !== 'shape') return n.type === 'pattern' && /\bpattern\b/.test(desc);
  const kind = n.shape === 'prim' ? n.prim?.kind ?? '' : n.shape === 'recipe' ? n.recipe?.kind ?? '' : n.shape;
  if (/\b(circular|circle|round|ring|disc|dot)\b/.test(desc)) return ['ellipse', 'circle', 'ring', 'wavy-circle', 'distorted-ring', 'concentric', 'rings'].includes(kind) || (n.shape === 'recipe' && n.recipe?.kind === 'super' && (n.recipe.curve ?? 0) > 60);
  if (/\b(square|rectangular|rectangle|box|block)\b/.test(desc)) return ['rect', 'rounded-rect'].includes(kind);
  if (/\b(triangular|triangle)\b/.test(desc)) return kind === 'triangle' || (kind === 'polygon' && n.sides === 3);
  if (/\bstar\b/.test(desc)) return ['star', 'burst', 'sunburst'].includes(kind);
  if (/\b(organic|blob|soft|fluid)\b/.test(desc)) return ['blob', 'organic', 'wavy-circle', 'drop', 'leaf', 'fluid-curve'].includes(kind);
  if (/\b(angular|geometric|polygon(al)?)\b/.test(desc)) return ['polygon', 'hexagon', 'octagon', 'triangle', 'diamond', 'rhombus', 'chevron', 'parallelogram', 'trapezoid', 'stepped', 'shards', 'poly'].includes(kind);
  return /\b(the|that|this)\b/.test(desc) || desc.trim() === '';
}

/** The capability the phrase names: generic words set aside ("texture", "treatment", "motif"), then the one most of
 * whose words the phrase uses, its head word (the last) weighing most: "an irregular vector ribbon" is a ribbon,
 * "an irregular geometric motif" an irregular polygon, "a grain texture" grain. */
function named(phrase: string, kinds: Capability['kind'][]): Capability | null {
  const clean = phrase.toLowerCase().replace(/[^a-z0-9 -]+/g, ' ').replace(/\b(texture|treatment|effect|pattern|motif|shape|mark|style|look|layer|vector|an?|the|some)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const found = searchCapabilities(clean || phrase, kinds, 10);
  if (!found.length) return null;
  const ws = clean.split(' ').filter((w) => w.length > 2);
  const head = ws[ws.length - 1] ?? '';
  const parts = (c: Capability) => new Set([c.id, ...c.id.split('-'), ...c.keywords.flatMap((k) => k.split(/[\s-]+/))]);
  const score = (c: Capability) => {
    const p = parts(c);
    const own = new Set(c.id.split('-'));
    return ws.filter((w) => p.has(w)).length + ws.filter((w) => own.has(w)).length * 3 + (p.has(head) ? 2 : 0);
  };
  return found.map((c, i) => ({ c, s: score(c) * 100 - i })).sort((a, b) => b.s - a.s)[0].c;
}

/** The quarter of an artboard the words leave most free. */
function freest(board: Artboard): { x: number; y: number; w: number; h: number } {
  const texts = walk(board).filter((l) => l.node.type === 'text' && !l.node.hidden).map(boxOnBoard);
  const qs = [0, 1, 2, 3].map((i) => ({ x: (i % 2) * board.width * 0.5, y: Math.floor(i / 2) * board.height * 0.5, w: board.width * 0.5, h: board.height * 0.5 }));
  const covered = (q: { x: number; y: number; w: number; h: number }) => texts.reduce((sum, b) => sum + Math.max(0, Math.min(q.x + q.w, b.x + b.w) - Math.max(q.x, b.x)) * Math.max(0, Math.min(q.y + q.h, b.y + b.h) - Math.max(q.y, b.y)), 0);
  return qs.reduce((a, b) => (covered(b) < covered(a) ? b : a));
}

/** An effect from the registry, scaled to the artboard and the words ("subtle", "strong"), coloured from the doc. */
function effectFor(kind: string, doc: GraphicDoc, board: Artboard, words: string): Effect | null {
  const e = effectDefaults(kind);
  if (!e) return null;
  const k = Math.min(board.width, board.height) / 1080;
  const gentle = /\b(subtle|slight|gentle|light|soft|faint)\b/.test(words) ? 0.55 : /\b(strong|heavy|bold|intense|dramatic)\b/.test(words) ? 1.4 : 1;
  const PX = new Set(['dx', 'dy', 'blur', 'spread', 'size', 'width', 'radius', 'distance', 'depth', 'offset', 'amplitude']);
  const params = Object.fromEntries(Object.entries(e.params).map(([key, v]) => [key, Math.round((PX.has(key) && !(kind === 'grain' && key === 'size') ? v * k : v) * (['amount', 'opacity', 'strength'].includes(key) ? gentle : 1) * 100) / 100]));
  const t = doc.tokens.colors;
  const colours: Partial<Effect> =
    kind === 'halftone' || kind === 'dither' || kind === 'threshold' ? { color: t.text, color2: board.background?.slice(0, 7) ?? t.background } : kind === 'glow' || kind === 'inner-glow' ? { color: t.accent } : kind === 'misregistration' ? { color: t.accent, color2: doc.tokens.accent2 ?? t.muted } : kind === 'duotone' ? { color: t.text, color2: t.accent } : {};
  // a subtle halftone: smaller dots
  if (kind === 'halftone' && gentle < 1) params.size = Math.max(2, Math.round(params.size * 0.7));
  return { ...e, params, ...colours };
}

const PATTERN_FOR: readonly [RegExp, string][] = [
  [/\btechnical\b|\bblueprint\b|\bannotat/, 'technical'],
  [/\bradial\b|\brays\b|\bsunburst\b|\bburst\b/, 'radial'],
  [/\bwaves?\b|\bwavy\b/, 'waves'],
  [/\b(organic|fluid|flowing|liquid|flow)\b/, 'flow'],
  [/\btopograph|\bcontours?\b/, 'contours'],
  [/\bhalftone\b/, 'halftone'],
  [/\bisometric\b/, 'isometric'],
  [/\bgeometric\b|\btessellat|\bhexagon/, 'tessellation'],
  [/\bmodular\b|\bbauhaus\b/, 'modular'],
  [/\bdots?\b|\bdotted\b|\bpolka\b/, 'dots'],
  [/\bgrid\b/, 'grid'],
  [/\bstripes?\b|\bstriped\b/, 'stripes'],
  [/\bnetwork\b|\bconstellation\b/, 'network'],
  [/\bnoise\b|\bhatch/, 'noise-dashes'],
  [/\bconfetti\b|\bsymbols?\b/, 'symbols'],
];

/** A vocabulary edit the words ask for, or null (see the head of this file). */
export function readVocabEdit(words: string, doc: GraphicDoc, board: Artboard, sel: readonly string[], measure: Measure = approxMeasure): VocabEdit | null {
  const u = Math.min(board.width, board.height) / 100;
  const t = doc.tokens.colors;
  const all = walk(board);
  const selected = all.filter((l) => sel.includes(l.node.id));

  // replace a motif with another shape: "replace the circular motif with an irregular vector ribbon"
  const rep = words.match(/\b(?:replace|swap)\b\s+(?:the |all (?:the )?|these |this |that )?(.*?)\b(motifs?|shapes?|marks?|forms?|ornaments?)\b.*?\b(?:with|into|for)\b\s+(?:an? |the )?(.+)$/);
  if (rep) {
    const cap = named(rep[3], ['primitive']);
    if (!cap) return null;
    const pool = selected.length ? selected : motifsOf(board);
    const matching = pool.filter((l) => l.node.type === 'shape' && answers(l.node, rep[1]));
    // "the circular motif": the one most seen (the largest); "the motifs", "all": every one that answers
    const plural = /s$/.test(rep[2]) || /\ball\b/.test(words) || selected.length > 0;
    const targets = plural ? matching : matching.sort((p, q) => q.node.w * q.node.h - p.node.w * p.node.h).slice(0, 1);
    if (!targets.length) return { ops: [], label: `a ${cap.label.toLowerCase()}`, scope: 'artboard', question: `There is no ${rep[1].trim() || 'such'} ${rep[2].replace(/s$/, '')} on this artboard to replace. Select the shape you mean and ask again.` };
    const prim = primDefaults(cap.id)!;
    const spec = PRIMITIVE_BY_KIND.get(cap.id);
    const ops: Op[] = targets.map((l, i) => {
      const n = l.node as ShapeNode;
      const params = { ...prim.params, ...(spec?.params.some((q) => q.key === 'seed') ? { seed: 17 + i * 31 } : {}) };
      const paint = typeof n.fill === 'string' ? n.fill : n.stroke?.color ?? t.accent;
      return { op: 'update', id: n.id, set: { shape: 'prim', prim: { kind: cap.id, params }, recipe: null, path: null, bez: null, sides: null, radius: null, inner: null, name: spec?.label ?? 'Shape', ...(spec?.stroked ? { fill: null, stroke: { color: paint, width: Math.max(1.2, u * 0.4), cap: 'round', join: 'round' } } : { fill: n.fill ?? paint }) } } as Op;
    });
    return { ops, label: `${targets.length === 1 ? 'the motif' : `${targets.length} motifs`} replaced with ${cap.label.toLowerCase()}${spec?.params.some((q) => q.key === 'seed') ? ' (seeded: editable in the inspector)' : ''}`, scope: selected.length ? 'selection' : 'object' };
  }

  // fewer ornaments: "reduce the number of decorative elements"
  if (/\b(reduce|fewer|less|remove some|cut down|simplify)\b/.test(words) && /\b(decorati\w*|ornaments?|motifs?|shapes|elements|clutter|busy)\b/.test(words)) {
    const deco = motifsOf(board).filter((l) => l.node.type === 'shape' || l.node.type === 'pattern');
    if (deco.length <= 1) return { ops: [], label: 'fewer decorative elements', scope: 'artboard', question: 'There is at most one decorative element here already; nothing was removed.' };
    const byArea = [...deco].sort((p, q) => q.node.w * q.node.h - p.node.w * p.node.h);
    const keep = Math.max(1, Math.ceil(deco.length / 2));
    const drop = byArea.slice(keep);
    return { ops: drop.map((l) => ({ op: 'remove', id: l.node.id }) as Op), label: `${drop.length} of ${deco.length} decorative elements removed (the ${keep} largest kept; undo brings them back)`, scope: 'artboard' };
  }

  // text along a path: "make the headline follow a curved path"
  const pathWord = words.match(/\b(follow|along|on|onto|set on|curve|bend|arch)\b.*?\b(curved?|arc|arched|circle|circular|round|wave|wavy|path)\b|\bcurve the (headline|title|text)\b/);
  if (pathWord && /\b(headline|title|text|words|it|this)\b/.test(words)) {
    const l = selected.find((x) => x.node.type === 'text') ?? headlineOf(board);
    if (!l || l.node.type !== 'text') return null;
    const n = l.node;
    const kind = /\b(circle|circular|round)\b/.test(words) ? 'circle' : /\b(wave|wavy)\b/.test(words) ? 'wave' : 'arc';
    const next: TextNode = { ...n, path: { kind, bend: /\bdown|smile\b/.test(words) ? -55 : 55, start: kind === 'circle' ? 0 : 50, ...(kind === 'wave' ? { cycles: 1.2, amplitude: 45 } : {}) }, warp: undefined };
    const size = fitToPath(next, measure);
    return { ops: [{ op: 'update', id: n.id, set: { path: next.path, warp: null, size } }], label: `the ${n.role ?? 'text'} set along ${kind === 'arc' ? 'a curved path' : kind === 'circle' ? 'a circle' : 'a wave'} (its words unchanged, its size fitted to the path)`, scope: 'object' };
  }

  // a dramatic composition: scale, crossing shapes, the ground inverted within the palette
  if (/\b(more )?(dramatic|drama|bolder composition|more impact|striking)\b/.test(words)) {
    const ops: Op[] = [];
    const head = headlineOf(board);
    if (head && head.node.type === 'text' && !isLocked(head)) {
      const n = head.node;
      const bigger = { ...n, w: Math.min(board.width - board.safe * 2, n.w * 1.15), h: n.h * 1.35, weight: Math.max(n.weight, 700) };
      ops.push({ op: 'update', id: n.id, set: { size: Math.round(fitSize({ ...bigger, size: n.size * 1.6 }, measure) * 10) / 10, w: bigger.w, h: bigger.h, weight: bigger.weight, rotation: n.rotation ? n.rotation : -4 } });
    }
    for (const l of motifsOf(board).filter((x) => x.node.type === 'shape').sort((p, q) => q.node.w * q.node.h - p.node.w * p.node.h).slice(0, 2)) {
      const n = l.node;
      ops.push({ op: 'resize', id: n.id, x: n.x + n.w * 0.1, y: n.y - n.h * 0.15, w: n.w * 1.55, h: n.h * 1.55 });
      if (!n.effects?.length) ops.push({ op: 'update', id: n.id, set: { effects: [{ ...effectDefaults('drop-shadow')!, params: { dx: u * 1.4, dy: u * 1.4, blur: 0, spread: 0, opacity: 100 } }] } });
    }
    // the ground and the ink swapped: the same colours, in the opposite roles
    const ground = (board.background ?? t.background).slice(0, 7);
    const ink = t.text.slice(0, 7);
    if (contrastRatio(ground, ink) >= 4.5) {
      ops.push({ op: 'artboard-update', id: board.id, set: { background: ink } });
      for (const l of all) if (l.node.type === 'text' && !isLocked(l) && l.node.color.slice(0, 7) === ink) ops.push({ op: 'update', id: l.node.id, set: { color: ground } });
    }
    if (!ops.length) return null;
    return { ops, label: 'a more dramatic composition: the headline larger and heavier, the main shapes crossing the frame with hard shadows, the ground inverted (the same colours, swapped)', scope: 'artboard' };
  }

  // remove an effect: "remove the glow", "take off the drop shadow"
  if (/\b(remove|take off|drop|no more|without the)\b/.test(words)) {
    const cap = named(words, ['effect']);
    if (cap) {
      const having = all.filter((l) => !isLocked(l) && l.node.effects?.some((e) => e.kind === cap.id));
      if (!having.length) return { ops: [], label: `no ${cap.label.toLowerCase()}`, scope: 'artboard', question: `Nothing on this artboard has a ${cap.label.toLowerCase()}.` };
      return { ops: having.map((l) => ({ op: 'update', id: l.node.id, set: { effects: l.node.effects!.filter((e) => e.kind !== cap.id) } }) as Op), label: `the ${cap.label.toLowerCase()} removed from ${having.length} object${having.length > 1 ? 's' : ''}`, scope: 'artboard' };
    }
  }

  // a new motif: "generate an irregular geometric motif using the campaign accent color"
  if (/\b(generate|create|add|make|draw)\b/.test(words) && /\b(motif|mark|shape|emblem|ornament|symbol)\b/.test(words) && !/\b(pattern|background|texture|grid)\b/.test(words)) {
    const phrase = words.replace(/\b(using|in|with)\b.*$/, '').replace(/\b(generate|create|add|make|draw|an?|the|new)\b/g, ' ');
    const cap = named(phrase.replace(/\b(motif|mark|shape|emblem|ornament|symbol)\b/g, ' ').trim() || 'blob', ['primitive']) ?? named('irregular polygon', ['primitive']);
    if (!cap) return null;
    const prim = primDefaults(cap.id)!;
    const spec = PRIMITIVE_BY_KIND.get(cap.id);
    const colour = /\baccent\b/.test(words) ? t.accent : /\b(ink|black|text colou?r)\b/.test(words) ? t.text : doc.tokens.accent2 ?? t.accent;
    const q = freest(board);
    const s = Math.min(q.w, q.h) * 0.7;
    const node = { id: newId('s'), type: 'shape', shape: 'prim', prim: { ...prim, params: { ...prim.params, ...(spec?.params.some((p) => p.key === 'seed') ? { seed: (words.length * 37) % 9000 + 11 } : {}) } }, role: 'motif', name: spec?.label ?? 'Motif', x: q.x + (q.w - s) / 2, y: q.y + (q.h - s) / 2, w: s, h: s, rotation: 0, opacity: 1, ...(spec?.stroked ? { fill: null, stroke: { color: colour, width: Math.max(1.2, u * 0.4), cap: 'round', join: 'round' } } : { fill: colour }) };
    return { ops: [{ op: 'add', artboard: board.id, node, index: 1 }], label: `${/^[aeiou]/.test(cap.label.toLowerCase()) ? 'an' : 'a'} ${cap.label.toLowerCase()} motif in ${colour === t.accent ? 'the accent' : 'the palette'}, where the words leave room (its seed and parameters editable)`, scope: 'artboard' };
  }

  // a pattern: "create a dense radial line pattern behind the headline", "use a more complex geometric background",
  // "make the background feel more organic and fluid", "create a technical grid with subtle annotations",
  // "generate a repeating wave pattern that becomes denser toward the bottom"
  if (/\b(pattern|background|texture|grid|field|lines|waves?|rays|dots)\b/.test(words) && /\b(create|add|generate|use|make|give|put|fill|draw)\b/.test(words) && !/\b(grain|noise|halftone treatment|shadow|glow)\b/.test(words)) {
    const gen = PATTERN_FOR.find(([re]) => re.test(words))?.[1] ?? named(words, ['pattern'])?.id;
    if (!gen) return null;
    const p: Record<string, number> = { ...patternDefaults(gen)! };
    const k = Math.min(board.width, board.height) / 1080;
    for (const key of Object.keys(p)) if (isPxParam(gen, key)) p[key] = Math.round(p[key] * k * 100) / 100;
    const dense = /\b(dense|denser|tight|packed|busy|intricate)\b/.test(words);
    const complex = /\b(complex|richer|more detailed|elaborate)\b/.test(words);
    if (dense) {
      if (gen === 'radial') p.count = Math.min(720, Math.round((p.count ?? 96) * 2.6));
      else if (p.scale) p.scale = Math.max(2, Math.round(p.scale * 0.55 * 10) / 10);
    }
    if (complex) {
      p.colorVar = 55;
      p.variation = 35;
      if (p.scale) p.scale = Math.max(2, Math.round(p.scale * 0.7 * 10) / 10);
      if (gen === 'tessellation') p.tile = 2;
    }
    const toward = words.match(/\b(denser|thicker|fuller|heavier|more) (toward|towards|at|to) the (bottom|top|right|left|cent(re|er)|edges?)\b/);
    if (toward) {
      p.ramp = 85;
      p.rampDir = { bottom: 0, top: 1, right: 2, left: 3, centre: 4, center: 4, edge: 5, edges: 5 }[toward[3] as 'bottom'] ?? 0;
    }
    if (gen === 'technical') {
      p.labels = /\bannotat|\blabels?|\bcoordinates\b/.test(words) ? 1 : p.labels;
      p.marks = 1;
    }
    const subtle = /\b(subtle|faint|quiet|light|soft)\b/.test(words);
    const accentOnly = /\baccent\b/.test(words);
    const colors = accentOnly ? [t.accent] : gen === 'tessellation' || gen === 'modular' || gen === 'isometric' ? [t.accent, t.text, doc.tokens.accent2 ?? t.muted] : gen === 'technical' ? [t.line, t.accent] : [subtle ? t.muted : t.accent];
    // where: behind the headline, else the background (an existing background pattern is changed, not doubled)
    const head = headlineOf(board);
    const behind = /\bbehind (the )?(headline|title|words|text)\b/.test(words) && head;
    const existing = all.find((l) => l.node.type === 'pattern' && l.node.w >= board.width * 0.9 && l.node.h >= board.height * 0.9 && !isLocked(l));
    const opacity = subtle ? 0.35 : 1;
    if (!behind && existing && /\bbackground\b/.test(words)) {
      return { ops: [{ op: 'update', id: existing.node.id, set: { gen, params: p, colors, opacity } }], label: `the background pattern changed to ${gen}${dense ? ', denser' : ''}${complex ? ', more complex' : ''}${subtle ? ', subtle' : ''} (every parameter editable)`, scope: 'object' };
    }
    let box = { x: 0, y: 0, w: board.width, h: board.height };
    let index = all.filter((l) => l.parents.length === 0 && l.node.role === 'background').length;
    if (behind && head) {
      const b = boxOnBoard(head);
      const pad = Math.max(b.w, b.h) * 0.35;
      box = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), w: Math.min(board.width, b.w + pad * 2), h: Math.min(board.height, b.h + pad * 2) };
      index = board.children.findIndex((n) => n.id === head.node.id);
      if (gen === 'radial') {
        p.cx = 50;
        p.cy = 50;
        p.inner = 18;
      }
    }
    const node = { id: newId('p'), type: 'pattern', role: 'motif', name: `${gen.charAt(0).toUpperCase()}${gen.slice(1)} pattern`, gen, params: p, colors, ...box, rotation: 0, opacity };
    return { ops: [{ op: 'add', artboard: board.id, node, index: Math.max(0, index) }], label: `a ${dense ? 'dense ' : ''}${complex ? 'complex ' : ''}${subtle ? 'subtle ' : ''}${gen} pattern ${behind ? 'behind the headline' : 'in the background'}${toward ? `, denser toward the ${toward[3]}` : ''} (seeded; every parameter editable)`, scope: 'artboard' };
  }

  // an effect: "add a subtle halftone treatment to the image", "add a grain texture without changing the layout"
  if (/\b(add|apply|give|put|use)\b/.test(words)) {
    const cap = named(words.replace(/\b(without|but)\b.*$/, ''), ['effect']);
    if (!cap) return null;
    const effect = effectFor(cap.id, doc, board, words);
    if (!effect) return null;
    const toPictures = /\b(image|images|picture|pictures|photo|photos|photograph)\b/.test(words);
    const toHeadline = /\b(headline|title|heading)\b/.test(words);
    const toGround = /\b(texture|background|ground|paper|whole|everything|design|poster|artboard)\b/.test(words) || cap.id === 'grain' || cap.id === 'noise';
    let list: Located[] = selected.length && /\b(this|these|it|them|selected)\b/.test(words) ? selected : [];
    if (!list.length && toPictures) list = all.filter((l) => l.node.type === 'image');
    if (!list.length && toHeadline) list = [headlineOf(board)].filter((l): l is Located => !!l);
    if (!list.length && /\b(shapes?|motifs?)\b/.test(words)) list = motifsOf(board).filter((l) => l.node.type === 'shape');
    const lockedOnes = list.filter((l) => isLocked(l));
    list = list.filter((l) => !isLocked(l));
    if (!list.length && lockedOnes.length) return { ops: [], label: cap.label.toLowerCase(), scope: 'object', question: `“${lockedOnes[0].node.name ?? lockedOnes[0].node.role ?? lockedOnes[0].node.type}” is locked. Unlock it to change it, or say what to change instead.` };
    if (list.length) return { ops: list.map((l) => ({ op: 'update', id: l.node.id, set: { effects: [...(l.node.effects ?? []).filter((e) => e.kind !== cap.id), effect] } }) as Op), label: `${/\b(subtle|slight|gentle)\b/.test(words) ? 'a subtle ' : ''}${cap.label.toLowerCase()} on ${list.length === 1 ? (list[0].node.type === 'image' ? 'the picture' : `the ${list[0].node.role ?? list[0].node.type}`) : `${list.length} objects`} (non-destructive: switch it off or remove it in Effects)`, scope: 'object' };
    if (toGround) {
      // the ground: its paper field carries the texture (made if there is none); nothing moves
      const field = all.find((l) => l.parents.length === 0 && l.node.type === 'shape' && l.node.role === 'background' && l.node.w >= board.width * 0.95 && l.node.h >= board.height * 0.95 && !isLocked(l));
      if (field) return { ops: [{ op: 'update', id: field.node.id, set: { effects: [...(field.node.effects ?? []).filter((e) => e.kind !== cap.id), effect] } }], label: `${cap.label.toLowerCase()} over the whole ground (nothing moved)`, scope: 'artboard' };
      const paper = { id: newId('s'), type: 'shape', shape: 'rect', role: 'background', name: 'Paper', x: 0, y: 0, w: board.width, h: board.height, rotation: 0, opacity: 1, fill: (board.background ?? t.background).slice(0, 7), effects: [effect] };
      return { ops: [{ op: 'add', artboard: board.id, node: paper, index: 0 }], label: `${cap.label.toLowerCase()} over the whole ground, on a paper layer of its own (nothing moved)`, scope: 'artboard' };
    }
    return null;
  }
  return null;
}

/** The registry as the model sees it when a request needs one (the menu, never code). */
export const vocabularyMenu = () => capabilityMenu();
