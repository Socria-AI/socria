// lib/ux-v0/graphics/creative/improve.ts — "make it more interesting", "make it better", "it feels flat".
//
// Words like these name no decision; the design in front does. Before asking anything, the design is measured for
// what holds it back — a composition that sits centred and symmetrical with nothing pulling the eye, a headline small
// against its frame, a quiet accent, type and ground with nothing else, no depth, a flat ground, the faults the checks
// find — and the moves with the most to gain are planned (at most three, one per decision), each with the reason it was
// chosen, said back. "Interesting" leans to composition, scale and forms; "better" to faults and hierarchy first. Only
// when nothing measures weak is a question asked, its answers ready to say. Deterministic: measured from the objects.

import { checkDoc } from '../check';
import { boardTokens, walk, type GraphicDoc, type TextNode } from '../doc';
import { signatureOfBoard } from '../generative/evaluate';
import { approxMeasure, type Measure } from '../text';
import { mainWords, readDecisions } from './decisions';
import { themeIn } from './lexicon';
import type { Change, CreativePlan, PlanQuestion } from './plan';
import { FIX_WORDS } from './execute';

export type ImproveAim = 'interest' | 'quality';

export interface Weakness {
  key: 'composition' | 'scale' | 'palette' | 'forms' | 'depth' | 'background' | 'faults';
  /** what was measured, said */
  found: string;
  change: Change;
  /** what doing it is worth, 0–100 */
  gain: number;
}

const lower = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

/** The vague improvement the words ask for, and which way it leans; null when they name something definite. */
export function improveAimOf(words0: string): ImproveAim | null {
  const w = lower(words0).replace(/[.!?]+$/, '');
  if (!w || w.length > 120) return null;
  if (/^(please )?(make (it|this)|can you make (it|this)|could you make (it|this)|let'?s make (it|this))\s+(a (bit|little|lot) )?(more interesting|less boring|more exciting|more engaging|more compelling|more striking|more dynamic|more captivating|more eye-?catching|stand out( more)?|less flat|less dull)$/.test(w)) return 'interest';
  if (/^(it'?s|it is|this is|this feels|it feels|feels|looks|it looks|this looks)\s+(a (bit|little) )?(boring|dull|bland|flat|lifeless|uninspiring|plain|static|meh|underwhelming)$/.test(w)) return 'interest';
  if (/^(something'?s|something is) missing$|^(it|this) needs (something|more|a spark|energy|life)$|^(push|take) (it|this) further$|^(give it|add) (some )?(energy|life|interest|a spark)$/.test(w)) return 'interest';
  if (/^(please )?(make (it|this)|can you make (it|this)|could you make (it|this))\s+(better|nicer|stronger|work|look better|look good|more polished|more professional)$|^(improve|elevate|polish|refine|fix|tidy) (it|this|the design|this design)( up)?$|^(it'?s|it is|this is|this) (not working|off|not quite right|not right)$/.test(w)) return 'quality';
  return null;
}

/** What holds the artboard back, measured, each with the move that answers it. */
export function weaknesses(doc: GraphicDoc, boardId: string | undefined, aim: ImproveAim, measure: Measure = approxMeasure): Weakness[] {
  const board = doc.artboards.find((b) => b.id === boardId) ?? doc.artboards[0];
  if (!board) return [];
  const out: Weakness[] = [];
  const d = readDecisions(doc, board.id);
  const sig = signatureOfBoard(board);
  const head = mainWords(board);
  const t = boardTokens(doc, board);
  const interest = aim === 'interest';

  // faults first when it should be better (contrast, overflow, collisions): the checks' own repairs
  const faults = checkDoc({ ...doc, tokens: t, artboards: [board] }, measure).filter((f) => f.severity === 'high' && f.fix?.length);
  if (faults.length) out.push({ key: 'faults', found: `${faults.length} thing${faults.length === 1 ? '' : 's'} the checks flag (${faults[0].message.replace(/\.$/, '').toLowerCase()})`, change: { decision: 'object', words: FIX_WORDS }, gain: interest ? 20 : 60 });

  // a composition with nothing pulling the eye (centred and symmetrical, nothing running off the edge), or crowded, or
  // empty without the space doing work
  const centred = Math.abs(sig.head[0] - 0.5) < 0.09;
  if (sig.symmetry > 0.74 && centred) out.push({ key: 'composition', found: 'it sits centred and symmetrical, so nothing pulls the eye across it', change: { decision: 'composition', action: 'asymmetric' }, gain: interest ? 34 : 18 });
  else if (interest && sig.symmetry > 0.62 && sig.bleed < 0.02) out.push({ key: 'composition', found: 'everything sits politely inside the frame, nothing breaking out of it', change: { decision: 'composition', action: 'asymmetric' }, gain: 21 });
  else if (sig.empty < (interest ? 0.1 : 0.22)) out.push({ key: 'composition', found: `it is crowded (${Math.round(sig.empty * 100)}% left open)`, change: { decision: 'composition', action: 'airy' }, gain: interest ? 12 : 30 });
  else if (sig.empty > 0.74) out.push({ key: 'composition', found: `it is mostly empty (${Math.round(sig.empty * 100)}% left open) without the space doing work`, change: { decision: 'composition', action: 'denser' }, gain: interest ? 14 : 12 });

  // scale: a headline small against its frame, or barely ahead of the rest
  const texts = walk(board)
    .map((l) => l.node)
    .filter((n): n is TextNode => n.type === 'text' && !n.hidden && n.id !== head?.id);
  const sizes = texts.map((n) => n.size).sort((a, b) => a - b);
  const lead = head && sizes.length ? head.size / sizes[Math.floor(sizes.length / 2)] : 3;
  // interest wants a real contrast of scale; better only wants a clear lead
  if (head && (sig.head[2] < 0.1 || lead < (interest ? 3.5 : 2.2))) out.push({ key: 'scale', found: sig.head[2] < 0.1 ? 'the headline is small against the frame' : `the headline is only ${lead.toFixed(1)}× the other text, too little contrast of scale`, change: { decision: 'object', words: 'make the headline much bigger' }, gain: interest ? 16 + Math.round(Math.max(0, 3.5 - lead) * 8) : 26 });

  // colour: a quiet accent, or one that barely stands off the ground
  const sat = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
  };
  const accent = /^#[0-9a-f]{6}/i.test(t.colors.accent) ? t.colors.accent.slice(0, 7) : '#808080';
  if (sat(accent) < 0.32) out.push({ key: 'palette', found: 'the accent is quiet, close to grey', change: { decision: 'palette', shifts: ['vivid'] }, gain: interest ? 22 : 10 });

  // nothing but type and ground: forms from its own subject (a theme its words or concept name), drawn abstractly
  if (d.forms.kind === 'none') {
    const words = [board.concept?.idea, doc.name, head?.text].filter(Boolean).join(' ');
    const theme = themeIn(words);
    out.push({ key: 'forms', found: theme ? `nothing but type and ground, though it is about ${theme.label}` : 'nothing but type and ground', change: { decision: 'forms', kind: theme?.forms ?? 'organic', abstraction: theme ? 72 : 80 }, gain: interest ? 24 : 8 });
  }
  // atmosphere: everything on one plane, a flat ground
  if (d.depth === 0) out.push({ key: 'depth', found: 'everything sits on one plane', change: { decision: 'depth', delta: 1 }, gain: interest ? 14 : 5 });
  if (d.background.kind === 'flat') out.push({ key: 'background', found: 'the ground is a flat colour', change: { decision: 'background', kind: 'gradient' }, gain: interest ? 12 : 3 });
  return out.sort((a, b) => b.gain - a.gain);
}

/** Moves that add tension to a design that measures well (at most two, in the order a designer would try them). */
function pushes(doc: GraphicDoc, boardId: string | undefined): Weakness[] {
  const board = doc.artboards.find((b) => b.id === boardId) ?? doc.artboards[0];
  if (!board) return [];
  const sig = signatureOfBoard(board);
  const head = mainWords(board);
  const d = readDecisions(doc, board.id);
  const t = boardTokens(doc, board);
  const texts = walk(board)
    .map((l) => l.node)
    .filter((n): n is TextNode => n.type === 'text' && !n.hidden && n.id !== head?.id);
  const sizes = texts.map((n) => n.size).sort((a, b) => a - b);
  const lead = head && sizes.length ? head.size / sizes[Math.floor(sizes.length / 2)] : 3;
  const out: Weakness[] = [];
  if (head && !head.locked && lead < 6 && sig.head[2] < 0.24) out.push({ key: 'scale', found: 'the headline much larger, for a real contrast of scale', change: { decision: 'object', words: 'make the headline much bigger' }, gain: 20 });
  if (sig.symmetry > 0.45) out.push({ key: 'composition', found: 'the composition moved off-centre, so it pulls across the frame', change: { decision: 'composition', action: 'asymmetric' }, gain: 18 });
  const [r, g, bl] = [1, 3, 5].map((i) => parseInt(t.colors.accent.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, bl);
  const mn = Math.min(r, g, bl);
  const l = (mx + mn) / 2;
  const sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
  if (sat < 0.75) out.push({ key: 'palette', found: 'a more saturated accent, as a point of energy', change: { decision: 'palette', shifts: ['vivid'] }, gain: 14 });
  if (d.depth < 3) out.push({ key: 'depth', found: 'more atmosphere and depth', change: { decision: 'depth', delta: 1 }, gain: 10 });
  return out.slice(0, 2);
}

/**
 * The plan for a vague improvement: the strongest moves the measures call for (at most three, one per decision), with
 * the reasons; or one question when nothing measures weak.
 */
export function improvementPlan(doc: GraphicDoc, boardId: string | undefined, words: string, aim: ImproveAim, measure: Measure = approxMeasure): { plan: CreativePlan; found: Weakness[] } {
  const all = weaknesses(doc, boardId, aim, measure);
  const picked: Weakness[] = [];
  for (const x of all) {
    if (x.gain < 10 || picked.length >= 3) continue;
    // one move per decision; scale and composition both re-place the words, so only the larger of them
    if (picked.some((p) => p.key === x.key || (p.key === 'composition' && x.key === 'scale') || (p.key === 'scale' && x.key === 'composition' && x.change.decision === 'composition' && x.change.action !== 'asymmetric'))) continue;
    picked.push(x);
  }
  // nothing measures weak, and it should be more interesting: a designer adds tension rather than asking — a real
  // contrast of scale, a composition that moves, a point of colour, more atmosphere — said as such
  if (!picked.length && aim === 'interest') {
    const push = pushes(doc, boardId);
    if (push.length) {
      const reason = `It already measures well — balanced, readable, with a clear lead — so to make it more interesting: ${push.map((p) => p.found).join('; ')}.`;
      return { plan: { intent: 'redesign', summary: `More interesting: ${push.map((p) => p.found).join('; ')}`, keep: ['words', 'logo', 'pictures'], changes: push.map((p) => p.change), reason, by: 'reader' }, found: push };
    }
  }
  if (!picked.length) {
    const question: PlanQuestion = {
      text: aim === 'interest' ? 'It measures well as it is — balanced, readable, with a clear lead. Which way would make it more interesting to you?' : 'Nothing measures wrong: the checks pass and the hierarchy is clear. What would you like to be better?',
      options: [
        { label: 'Bolder and more alive', words: 'make it more expressive and alive' },
        { label: 'A theme (clouds, the ocean, the city…)', words: 'give it a theme' },
        { label: 'An unexpected composition', words: 'rethink the composition, make it unexpected' },
        { label: 'Something completely different', words: 'try something completely different' },
      ],
    };
    return { plan: { intent: 'style', summary: 'a way to take it', keep: [], changes: [], question, by: 'reader' }, found: [] };
  }
  const reason = `${picked.map((p) => p.found).join('; ').replace(/^./, (c) => c.toUpperCase())}.`;
  return {
    plan: { intent: aim === 'interest' ? 'redesign' : 'global', summary: `${aim === 'interest' ? 'More interesting' : 'Better'}: ${picked.map((p) => p.found).join('; ')}`, keep: ['words', 'logo', 'pictures'], changes: picked.map((p) => p.change), reason, by: 'reader' },
    found: picked,
  };
}
