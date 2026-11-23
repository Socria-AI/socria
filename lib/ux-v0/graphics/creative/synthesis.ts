// lib/ux-v0/graphics/creative/synthesis.ts — designs combined: decisions taken from different artboards into one.
//
// "Take the typography from the first and the visual composition from the second" names two decisions and where each
// comes from. The combination is made on a new artboard beside them, so nothing they hold changes: it starts as a copy
// of the artboard whose composition is taken (its arrangement, its objects and their places) and each other decision is
// brought onto it from its own source — the typography role by role (face, weight, italic, case, tracking and leading,
// each text refitted to its box so nothing overflows), the colours repainted role for role, the forms, the ground and
// the depth by the creative executor (execute.ts). The new artboard keeps a visual language of its own (doc.ts
// Artboard.tokens), so changing it later changes it alone.
//
// References are to artboards as they stand on the canvas — "the first", "the second", "version 3", "this one", "the
// other one", "the last", a name — and to kept concepts ("concept 2"). One decision taken from one other artboard
// ("use the colours of the first") is brought onto the artboard in front instead, previewed like any change.
// "Combine the best elements" chooses, decision by decision, the artboard that measures best for it (the composition's
// balance and room, the type's hierarchy and fit, the colours' contrast) and says what it measured. Words that could
// mean genuinely different things ("merge these two") ask which should lead.

import { contrastRatio } from '../../../ux/audit';
import { applyOps, boardTokens, idMap, walk, withOwnTokens, type Artboard, type GraphicDoc, type Op, type TextNode, type Tokens } from '../doc';
import type { GraphicDirection, GraphicKind } from '../compose';
import { checkDoc, refineDoc } from '../check';
import { approxMeasure, fitSize, layoutText, type Measure } from '../text';
import { signatureOfBoard } from '../generative/evaluate';
import { conceptRefs } from './concepts';
import { mainWords, readDecisions, type DecisionKey } from './decisions';
import { executePlan, weightFor } from './execute';
import type { Change, CreativePlan, PlanQuestion } from './plan';

export const SYNTH_KEYS = ['composition', 'type', 'palette', 'forms', 'background', 'depth'] as const;
export type SynthKey = (typeof SYNTH_KEYS)[number];

export const SYNTH_LABEL: Record<SynthKey, string> = { composition: 'composition', type: 'typography', palette: 'colours', forms: 'forms', background: 'ground', depth: 'depth' };

export interface SynthSource {
  kind: 'board' | 'concept';
  id: string;
  name: string;
}

export interface SynthesisPlan {
  /** each decision and where it comes from */
  takes: { key: SynthKey; from: SynthSource; why?: string }[];
  /** what the combination is built on: the composition's source (a copy of it, or the artboard in front itself) */
  base: SynthSource;
  /** onto the artboard in front (one decision from one other artboard), or a new artboard beside them */
  onto: 'current' | 'new';
  summary: string;
  /** the choices were made by measuring ("the best elements") */
  measured?: boolean;
}

export type SynthesisRead = { plan: SynthesisPlan } | { question: PlanQuestion } | { note: string };

const lower = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const SHORT: Record<string, number> = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10 };
const NOUN = '(?:one|design|version|artboard|option|board|alternative|layout|variation|draft|take|direction|concept|poster|graphic|frame)s?';

const KEYS: readonly [RegExp, SynthKey[] | 'look' | 'rest'][] = [
  [/\b(visual language|look|aesthetic|style|vibe|feel|mood|atmosphere|treatment|visual identity|identity)\b/, 'look'],
  [/\b(composition|layout|arrangement|structure|grid|placement|framing|positions?)\b/, ['composition']],
  [/\b(typography|type|typefaces?|fonts?|lettering|letterforms|typesetting|type treatment)\b/, ['type']],
  [/\b(colou?rs?|palette|colou?r scheme|colou?rways?|tones)\b/, ['palette']],
  [/\b(forms|shapes|motifs|graphic elements|graphics|illustrations?|decorations?|clouds|ornaments?)\b/, ['forms']],
  [/\b(background|ground|backdrop)\b/, ['background']],
  [/\b(depth|shadows?|dimension)\b/, ['depth']],
  [/\b(everything else|the rest|all else|anything else|everything)\b/, 'rest'],
];
const LOOK: SynthKey[] = ['type', 'palette', 'forms', 'background', 'depth'];

/** What a clause names, in the order it says it. */
function keysIn(c: string): (SynthKey | 'rest')[] {
  const out: (SynthKey | 'rest')[] = [];
  const hits = KEYS.map(([re, k]) => ({ at: c.search(re), k })).filter((h) => h.at >= 0).sort((a, b) => a.at - b.at);
  for (const h of hits) {
    const ks = h.k === 'look' ? LOOK : h.k === 'rest' ? (['rest'] as const) : h.k;
    for (const k of ks) if (!out.includes(k)) out.push(k);
  }
  return out;
}

const boardSource = (b: Artboard): SynthSource => ({ kind: 'board', id: b.id, name: b.name });

/** The artboards and kept concepts a clause points at ("the first", "version 3", "this one", "concept 2", a name). */
export function refsIn(c: string, doc: GraphicDoc, current: string): { refs: SynthSource[]; ambiguous?: string } {
  const out: SynthSource[] = [];
  const push = (s: SynthSource | null | undefined) => s && !out.some((x) => x.id === s.id) && out.push(s);
  const boards = doc.artboards;
  const kept = doc.concepts ?? [];
  const atPos = (n: number) => (n >= 1 && n <= boards.length ? boardSource(boards[n - 1]) : null);
  const byName = (n: number, noun: string) => {
    // "alternative 2", "version 3": an artboard of that name first, else the one in that place
    const named = boards.find((b) => new RegExp(`^${noun}\\s*${n}\\b`, 'i').test(b.name));
    return named ? boardSource(named) : null;
  };
  let ambiguous: string | undefined;
  // kept concepts, by number or name
  for (const m of c.matchAll(/\bconcept\s*(?:"([^"]+)"|(\d+)|(first|second|third|fourth|fifth|last))\b/g)) {
    const i = m[2] ? Number(m[2]) - 1 : m[3] ? (m[3] === 'last' ? kept.length - 1 : ORDINALS.indexOf(m[3])) : -1;
    const k = m[1] ? kept.find((x) => x.name.toLowerCase() === m[1].toLowerCase()) : kept[i];
    if (k) push({ kind: 'concept', id: k.id, name: k.name });
    else if (m[2] || m[3]) push(atPos(m[2] ? Number(m[2]) : m[3] === 'last' ? boards.length : ORDINALS.indexOf(m[3]!) + 1));
  }
  for (const k of kept) if (k.name.length > 3 && c.includes(k.name.toLowerCase()) && !/^concept \d+$/i.test(k.name)) push({ kind: 'concept', id: k.id, name: k.name });
  // "version 3", "alternative 2", "design #4", "number 2"
  for (const m of c.matchAll(/\b(version|design|artboard|option|board|alternative|variation|draft|number|no\.?|#)\s*#?(\d{1,2})\b/g)) {
    const n = Number(m[2]);
    push(byName(n, m[1]) ?? atPos(n));
  }
  // ordinals: "the first", "the second one", "the 3rd design", "the first's type", "first design" (an article or a
  // noun with it, so "first, use…" and "a second look" are not references)
  const ORD = `(${ORDINALS.join('|')}|1st|2nd|3rd|[4-9]th|10th)`;
  for (const m of c.matchAll(new RegExp(`\\bthe\\s+${ORD}\\b(?:\\s+${NOUN})?|\\b${ORD}\\s+${NOUN}\\b`, 'g'))) {
    // "the first concept" is a kept concept when there are kept concepts (read above)
    if (/concept/.test(m[0]) && kept.length) continue;
    const word = m[1] ?? m[2];
    const n = SHORT[word] ?? ORDINALS.indexOf(word) + 1;
    push(atPos(n));
  }
  const here = boards.find((b) => b.id === current);
  if (here && (/\b(this (one|design|version|artboard|board|concept|option|poster|graphic)|the current (one|design|version|artboard)|the one (on screen|in front|i'?m looking at|open))\b|\b(of|from|in|like|on) this\s*$/.test(c) || /\bthis\s+(layout|composition|arrangement|typography|type|fonts?|colou?rs?|palette|look|style|forms|shapes|background|ground)\b/.test(c))) push(boardSource(here));
  if (/\bthe other( one| design| version| artboard)?\b/.test(c)) {
    const others = boards.filter((b) => b.id !== current);
    if (others.length === 1) push(boardSource(others[0]));
    else ambiguous = 'the other one';
  }
  if (new RegExp(`\\bthe (last|latest|newest|most recent)(\\s+${NOUN})?\\b(?!\\s+(change|time|step|edit|thing|word))`).test(c) && !/\bconcept\b/.test(c)) push(atPos(boards.length));
  if (new RegExp(`\\bthe original(\\s+${NOUN})?\\b`).test(c)) push(atPos(1));
  if (new RegExp(`\\b(previous|earlier)\\s+${NOUN}\\b`).test(c)) {
    const i = boards.findIndex((b) => b.id === current);
    push(atPos(i > 0 ? i : 1));
  }
  // names said in quotes, or names long enough not to be ordinary words
  for (const b of boards) {
    const n = b.name.toLowerCase();
    if (c.includes(`"${n}"`) || (n.length > 5 && /\s|\d/.test(n) && c.includes(n))) push(boardSource(b));
  }
  return { refs: out, ...(ambiguous ? { ambiguous } : {}) };
}

const COMBINE = /\b(take|taking|use|using|borrow|combine|combining|merge|merging|mix|mixing|blend|blending|bring|apply|steal|grab|pull|marry|fuse|cross|join|unite|pair|pairing|put)\b/;
const CHANGE_WORDS = /\b(make|warmer|cooler|darker|lighter|bigger|smaller|bolder|larger|more|less|brighter|softer|change|remove|delete|add)\b/;

/**
 * The synthesis the words ask for, a question when they could mean genuinely different things, a note when what they
 * point at is not there, or null when they are not about combining designs.
 */
export function readSynthesis(words0: string, doc: GraphicDoc, current: string, measure: Measure = approxMeasure): SynthesisRead | null {
  const w = lower(words0)
    .replace(/\blook and feel\b/g, 'look')
    .replace(/\bblack and white\b/g, 'monochrome')
    // idioms that only sound like references
    .replace(/\b(a second (look|thought|opinion|glance)|at first( glance| sight)?|first of all|first off|the first time|at last|last time)\b/g, ' ')
    .replace(/^\s*(first|firstly)\b[,:]?\s*/, '')
    .trim();
  if (!w || w.length > 400) return null;
  const boards = doc.artboards;
  const many = boards.length + (doc.concepts?.length ?? 0) >= 2;

  // "combine the best elements (of these)": decided by measure across what is there (or the ones named)
  if (/\b(best|strongest) (elements|parts|bits|of (each|both|them|these|all)|qualities|ideas|features)\b|\bbest of (each|both|them|these|all)\b/.test(w) && COMBINE.test(w)) {
    if (boards.length < 2) return { note: 'There is one design here. Ask for a few versions first (“give me four different versions”), then combine the best of them.' };
    const named = refsIn(w, doc, current).refs.filter((r) => r.kind === 'board');
    const pool = (named.length >= 2 ? named.map((r) => boards.find((b) => b.id === r.id)!) : boards).filter(Boolean);
    return { plan: bestOf(doc, pool, measure) };
  }

  if (!many) return null;
  // "merge these two", "combine both of them": which should lead is a real choice
  if (COMBINE.test(w) && /\b(these two|those two|the two( of them| designs| versions)?|both( of them| designs| versions)?|them together|these together)\b/.test(w) && !keysIn(w).length && !refsIn(w, doc, current).refs.length) {
    if (boards.length !== 2) return { question: { text: 'Which two should combine?', options: boards.slice(0, 4).map((b, i) => ({ label: `“${b.name}” with this one`, words: `combine ${refWords(doc, boardSource(b))} and this one` })) } };
    const [a, b] = boards.map(boardSource);
    return { question: combineQuestion(doc, a, b) };
  }
  const clauses = w
    .split(/\s*(?:[,;]|\.\s+|\.$|\band\b|\bwith\b|\bbut\b|\bwhile\b|\bplus\b|\bthen\b|\bwhereas\b)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const takes = new Map<SynthKey, SynthSource>();
  let rest: SynthSource | null = null;
  let waiting: (SynthKey | 'rest')[] = [];
  const named: SynthSource[] = [];
  let ambiguous = '';
  for (const c of clauses) {
    const ks = keysIn(c);
    const { refs, ambiguous: amb } = refsIn(c, doc, current);
    if (amb) ambiguous = amb;
    refs.forEach((r) => !named.some((x) => x.id === r.id) && named.push(r));
    if (!refs.length) {
      // "the typography and the colours from the first": keys waiting for the source said next
      waiting.push(...ks);
      continue;
    }
    const src = refs[0];
    for (const k of [...waiting, ...ks]) {
      if (k === 'rest') rest = src;
      else if (!takes.has(k)) takes.set(k, src);
    }
    waiting = [];
  }
  if (!named.length) return null;
  if (ambiguous && named.length < 2) return { question: { text: `Which one do you mean by “${ambiguous}”?`, options: boards.slice(0, 4).map((b, i) => ({ label: b.name, words: words0.replace(/the other( one| design| version| artboard)?/i, `the ${ORDINALS[i]}`) })) } };
  const sources = new Set([...takes.values(), ...(rest ? [rest] : [])].map((s) => s.id));
  const combining = COMBINE.test(w);
  // a decision taken from somewhere: only when the words combine, or take from two places at once ("the type from the
  // first and the composition from the second") — "make the colours of the first warmer" changes the first instead
  if (!takes.size && !rest) {
    // "merge these two", "combine the first and the third": which should lead is a real choice
    if (combining && named.length >= 2) return { question: combineQuestion(doc, named[0], named[1]) };
    return null;
  }
  if (!combining && sources.size < 2) return null;
  if (!combining && CHANGE_WORDS.test(w)) return null;

  // the base: the composition's source; else what everything else comes from; else the artboard in front
  const here = boards.find((b) => b.id === current) ?? boards[0];
  const comp = takes.get('composition') ?? rest ?? null;
  const fromElsewhere = [...takes.entries()].filter(([, s]) => s.id !== here.id);
  // one place, the artboard in front not one of them, no composition named: onto the artboard in front
  const onto: SynthesisPlan['onto'] = !comp && sources.size === 1 && !sources.has(here.id) ? 'current' : 'new';
  const base = onto === 'current' ? boardSource(here) : comp ?? (sources.has(here.id) ? boardSource(here) : [...takes.values()][0]);
  const all: { key: SynthKey; from: SynthSource }[] = [];
  for (const k of SYNTH_KEYS) {
    const s = takes.get(k) ?? (rest && k !== 'composition' ? rest : null);
    if (s) all.push({ key: k, from: s });
  }
  if (!all.some((t) => t.key === 'composition') && onto === 'new') all.unshift({ key: 'composition', from: base });
  // nothing actually comes from anywhere else
  if (onto === 'current' && !fromElsewhere.length) return null;
  if (all.every((t) => t.from.id === base.id)) return { note: `Those are already “${base.name}”'s own. Say which design should take them — “put the colours of the first on the second”.` };
  const summary = all
    .filter((t) => onto === 'new' || t.from.id !== base.id)
    .map((t) => `the ${SYNTH_LABEL[t.key]} of “${t.from.name}”`)
    .join(', ');
  return { plan: { takes: all, base, onto, summary: summary.replace(/^./, (x) => x.toUpperCase()) } };
}

/** The choice of which leads when two designs are combined. */
function combineQuestion(doc: GraphicDoc, a: SynthSource, b: SynthSource): PlanQuestion {
  return {
    text: `How should “${a.name}” and “${b.name}” combine?`,
    options: [
      { label: `The composition of “${a.name}”, the look of “${b.name}”`, words: `take the composition from ${refWords(doc, a)} and the look from ${refWords(doc, b)}` },
      { label: `The composition of “${b.name}”, the look of “${a.name}”`, words: `take the composition from ${refWords(doc, b)} and the look from ${refWords(doc, a)}` },
      { label: 'The best of each, by measure', words: `combine the best elements of ${refWords(doc, a)} and ${refWords(doc, b)}` },
    ],
  };
}

/** How to say an artboard so readSynthesis reads it back ("the second", "concept 2"). */
function refWords(doc: GraphicDoc, s: SynthSource): string {
  if (s.kind === 'concept') return `concept "${s.name}"`;
  const i = doc.artboards.findIndex((b) => b.id === s.id);
  return i >= 0 && i < ORDINALS.length ? `the ${ORDINALS[i]}` : `"${s.name}"`;
}

// ── measured: the best of each ──

export interface BoardMeasure {
  composition: { score: number; why: string };
  type: { score: number; why: string };
  palette: { score: number; why: string };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Each decision of an artboard measured: what the "best elements" are chosen by. Deterministic. */
export function measureBoard(doc: GraphicDoc, board: Artboard, measure: Measure = approxMeasure): BoardMeasure {
  const t = boardTokens(doc, board);
  const findings = checkDoc({ ...doc, artboards: [board], tokens: t }, measure).filter((f) => f.severity !== 'low');
  const count = (kinds: string[]) => findings.filter((f) => kinds.includes(f.kind)).length;
  // composition: room left open near a working share, the weight settled, nothing colliding or outside
  const sig = signatureOfBoard(board);
  const off = Math.hypot(sig.balance[0] - 0.5, sig.balance[1] - 0.5);
  const layoutFaults = count(['collision', 'outside', 'safe']);
  const composition = clamp(100 - Math.abs(sig.empty - 0.45) * 110 - Math.max(0, off - 0.22) * 120 - layoutFaults * 14, 0, 100);
  // type: the headline's lead over the rest, how many faces, nothing overflowing or too small
  const head = mainWords(board);
  const texts = walk(board)
    .map((l) => l.node)
    .filter((n): n is TextNode => n.type === 'text' && !n.hidden && n.id !== head?.id);
  const sizes = texts.map((n) => n.size).sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  const lead = head && median ? head.size / median : head ? 3 : 1;
  const faces = new Set(walk(board).flatMap((l) => (l.node.type === 'text' ? [l.node.font] : []))).size;
  const typeFaults = count(['overflow', 'broken-word', 'tiny']);
  const type = clamp(clamp(lead, 1, 4.5) * 15 + (faces <= 2 ? 22 : faces === 3 ? 12 : 4) + 10 - typeFaults * 16, 0, 100);
  // colours: the words' contrast with the ground, the accent standing out from it
  const ground = (board.background || t.colors.background).slice(0, 7);
  const ink = (head?.color ?? t.colors.text).slice(0, 7);
  const ratio = /^#[0-9a-f]{6}$/i.test(ink) && /^#[0-9a-f]{6}$/i.test(ground) ? contrastRatio(ink, ground) : 1;
  const accent = /^#[0-9a-f]{6}$/i.test(t.colors.accent) ? contrastRatio(t.colors.accent.slice(0, 7), ground) : 1;
  const palette = clamp((Math.min(ratio, 12) / 12) * 68 + (Math.min(accent, 4) / 4) * 32 - count(['contrast']) * 12, 0, 100);
  return {
    composition: { score: Math.round(composition), why: `${Math.round(sig.empty * 100)}% left open, ${off < 0.22 ? 'its weight settled' : 'its weight to one side'}${layoutFaults ? `, ${layoutFaults} placement fault${layoutFaults === 1 ? '' : 's'}` : ''}` },
    type: { score: Math.round(type), why: `the headline ${lead.toFixed(1)}× the other text, ${faces} face${faces === 1 ? '' : 's'}${typeFaults ? `, ${typeFaults} fitting fault${typeFaults === 1 ? '' : 's'}` : ''}` },
    palette: { score: Math.round(palette), why: `words at ${ratio.toFixed(1)}:1 on the ground, the accent at ${accent.toFixed(1)}:1` },
  };
}

/** The best of each: the composition, the typography and the colours each from the artboard that measures best for it. */
export function bestOf(doc: GraphicDoc, pool: readonly Artboard[], measure: Measure = approxMeasure): SynthesisPlan {
  const scored = pool.map((b) => ({ b, m: measureBoard(doc, b, measure) }));
  const best = (k: keyof BoardMeasure) => scored.reduce((a, x) => (x.m[k].score > a.m[k].score ? x : a), scored[0]);
  const comp = best('composition');
  const type = best('type');
  const pal = best('palette');
  const takes: SynthesisPlan['takes'] = [
    { key: 'composition', from: boardSource(comp.b), why: comp.m.composition.why },
    { key: 'type', from: boardSource(type.b), why: type.m.type.why },
    { key: 'palette', from: boardSource(pal.b), why: pal.m.palette.why },
  ];
  // the forms, the ground and the depth belong with the colours they were drawn in
  if (pal.b.id !== comp.b.id) takes.push({ key: 'forms', from: boardSource(pal.b) }, { key: 'background', from: boardSource(pal.b) });
  const summary = takes
    .filter((t) => t.why)
    .map((t) => `the ${SYNTH_LABEL[t.key]} of “${t.from.name}” (${t.why})`)
    .join('; ');
  return { takes, base: boardSource(comp.b), onto: 'new', summary: summary.replace(/^./, (x) => x.toUpperCase()), measured: true };
}

// ── carrying it out ──

export interface Synthesized {
  doc: GraphicDoc;
  /** the artboard the combination is on */
  board: string;
  done: string[];
  notes: string[];
  label: string;
  /** a new artboard was made (nothing that was there changed) */
  created: boolean;
}

export interface SynthContext {
  current: string;
  measure?: Measure;
  dir?: GraphicDirection | null;
  kind?: GraphicKind;
  said: string;
  now?: number;
}

/** A source's artboard and the tokens it is drawn in. */
function sourceOf(doc: GraphicDoc, s: SynthSource): { board: Artboard; tokens: Tokens } | null {
  if (s.kind === 'concept') {
    const c = (doc.concepts ?? []).find((x) => x.id === s.id);
    return c ? { board: c.board, tokens: c.tokens } : null;
  }
  const b = doc.artboards.find((x) => x.id === s.id);
  return b ? { board: b, tokens: boardTokens(doc, b) } : null;
}

const BODY_ROLES = ['body', 'subhead', 'caption', 'meta', 'cta', 'label', 'quote'];

/**
 * The typography of one artboard set on another, role for role: the face, weight, italic, case, tracking and leading
 * of the source's text in the same role (its headline for the headline), each text refitted to its own box so nothing
 * overflows; the logo's own lettering untouched. The board's faces follow.
 */
export function transferType(doc: GraphicDoc, boardId: string, src: { board: Artboard; tokens: Tokens }, measure: Measure = approxMeasure): Op[] {
  const target = doc.artboards.find((b) => b.id === boardId);
  if (!target) return [];
  const head = mainWords(target);
  const srcHead = mainWords(src.board);
  const byRole = new Map<string, TextNode>();
  for (const l of walk(src.board)) if (l.node.type === 'text' && !l.node.hidden && l.node.role && !byRole.has(l.node.role)) byRole.set(l.node.role, l.node);
  const bodyLike = BODY_ROLES.map((r) => byRole.get(r)).find(Boolean) ?? null;
  const ops: Op[] = [];
  for (const l of walk(target)) {
    const nd = l.node;
    if (nd.type !== 'text' || nd.locked || nd.hidden || nd.role === 'logo' || l.parents.some((p) => p.role === 'logo')) continue;
    const isHead = nd.id === head?.id || nd.role === 'headline';
    const s = isHead ? srcHead : (nd.role ? byRole.get(nd.role) : undefined) ?? bodyLike;
    const face = s?.font ?? (isHead ? src.tokens.fonts.display : src.tokens.fonts.body);
    const next: Partial<TextNode> = {
      font: face,
      weight: weightFor(face, s?.weight ?? (isHead ? 600 : nd.weight)),
      italic: !!s?.italic,
      case: s?.case ?? 'none',
      tracking: s?.tracking ?? 0,
      lineHeight: s?.lineHeight ?? nd.lineHeight,
    };
    if (nd.runs?.some((r) => r.font)) next.runs = nd.runs.map(({ font: _f, ...rest }) => rest);
    const trial = { ...nd, ...next } as TextNode;
    // the words never overflow their box in the new face; a box that grows with its words keeps the height it had
    // (a wider face would otherwise add lines and push into what is below it)
    const held = nd.autoHeight ? ({ ...trial, autoHeight: false, h: Math.max(nd.h, layoutText(nd, measure).height) } as TextNode) : trial;
    const size = Math.min(nd.size, fitSize(held, measure));
    if (size !== nd.size) next.size = Math.round(size * 10) / 10;
    ops.push({ op: 'update', id: nd.id, set: next as Record<string, unknown> });
  }
  return ops;
}

/** A kept concept's artboard placed as a new artboard (its objects given ids of their own, its record following). */
function addConceptBoard(doc: GraphicDoc, s: SynthSource, name: string): { doc: GraphicDoc; id: string } | null {
  const c = (doc.concepts ?? []).find((x) => x.id === s.id);
  if (!c) return null;
  const r = applyOps(doc, [{ op: 'artboard-add', artboard: { ...JSON.parse(JSON.stringify(c.board)), name, tokens: c.tokens } }]);
  if (!r.ok) return null;
  const id = r.touched[0];
  const made = r.doc.artboards.find((b) => b.id === id);
  if (made?.creative) {
    const map = idMap(c.board, made);
    if (made.creative.forms) made.creative.forms.ids = made.creative.forms.ids.map((x) => map.get(x) ?? x);
    if (made.creative.background?.id) made.creative.background.id = map.get(made.creative.background.id) ?? made.creative.background.id;
  }
  return { doc: r.doc, id };
}

const shortName = (s: SynthSource) => (s.name.length > 22 ? `${s.name.slice(0, 21).trim()}…` : s.name);

/** The synthesis carried out: a new artboard combining the decisions (or the artboard in front given one), checked. */
export function synthesize(doc0: GraphicDoc, plan: SynthesisPlan, ctx: SynthContext): Synthesized | null {
  const measure = ctx.measure ?? approxMeasure;
  const now = ctx.now ?? Date.now();
  const done: string[] = [];
  const notes: string[] = [];
  let doc = doc0;
  let boardId = ctx.current;
  const created = plan.onto === 'new';
  const typeFrom = plan.takes.find((t) => t.key === 'type' && t.from.id !== plan.base.id)?.from;
  const compName = plan.takes.find((t) => t.key === 'composition')?.from ?? plan.base;
  if (created) {
    const name = `Combined: ${typeFrom ? `type of ${shortName(typeFrom)}, ` : ''}composition of ${shortName(compName)}`.slice(0, 60);
    if (plan.base.kind === 'concept') {
      const r = addConceptBoard(doc, plan.base, name);
      if (!r) return null;
      doc = r.doc;
      boardId = r.id;
    } else {
      const r = applyOps(doc, [{ op: 'artboard-duplicate', id: plan.base.id, name }]);
      if (!r.ok) return null;
      boardId = r.touched[0];
      // the combination is placed after everything there (the first stays the first, the second the second)
      const moved = applyOps(r.doc, [{ op: 'artboard-reorder', id: boardId, to: r.doc.artboards.length - 1 }]);
      doc = moved.ok ? moved.doc : r.doc;
      const src = sourceOf(doc0, plan.base);
      doc = withOwnTokens(doc, boardId, src?.tokens);
    }
    done.push(`a new artboard built on the composition of “${compName.name}”`);
  } else doc = withOwnTokens(doc, boardId);

  // the typography, role by role
  if (typeFrom) {
    const src = sourceOf(doc0, typeFrom);
    if (!src) notes.push(`“${typeFrom.name}” is no longer there, so its typography could not be taken.`);
    else if (doc.locks?.fonts) notes.push('The typefaces are locked, so the typography was kept (unlock them to take another).');
    else {
      const ops = transferType(doc, boardId, src, measure);
      const head = mainWords(src.board);
      const r = applyOps(doc, ops);
      if (r.ok) {
        // the artboard's own faces follow (its visual language is its own)
        const fonts = { display: head?.font ?? src.tokens.fonts.display, body: src.tokens.fonts.body };
        doc = { ...r.doc, artboards: r.doc.artboards.map((b) => (b.id === boardId ? { ...b, tokens: { ...(b.tokens ?? r.doc.tokens), fonts }, creative: { ...(b.creative ?? {}), sources: { ...(b.creative?.sources ?? {}), type: { by: 'concept' as const, said: ctx.said.slice(0, 240), at: now, from: typeFrom.name } } } } : b)) };
        done.push(`the typography of “${typeFrom.name}”: ${fonts.display}${fonts.body !== fonts.display ? ` with ${fonts.body}` : ''}`);
      } else notes.push(`The typography could not be taken: ${r.error}`);
    }
  }

  // the colours, the forms, the ground and the depth, by the executor (each from its own source)
  const changes: Change[] = [];
  for (const t of plan.takes) {
    if (t.from.id === plan.base.id && created) continue;
    if (t.from.id === boardId) continue;
    if (t.key === 'palette') changes.push({ decision: 'palette', from: t.from.id });
    if (t.key === 'forms') changes.push({ decision: 'forms', from: t.from.id });
    if (t.key === 'background') changes.push({ decision: 'background', from: t.from.id });
    if (t.key === 'depth') {
      const s = sourceOf(doc0, t.from);
      if (s) changes.push({ decision: 'depth', level: readDecisions({ ...doc0, tokens: s.tokens, artboards: [s.board] }).depth });
    }
  }
  if (changes.length) {
    const keep = (['composition', 'type'] as const).filter((k) => !changes.some((c) => c.decision === k));
    const cp: CreativePlan = { intent: 'concept', summary: plan.summary, keep: [...keep], changes, by: 'reader' };
    const exec = executePlan(doc, cp, { board: boardId, dir: ctx.dir, kind: ctx.kind, measure, concepts: conceptRefs(doc, boardId), said: ctx.said, now });
    if (exec && exec.doc !== doc) {
      doc = exec.doc;
      done.push(...exec.done);
      notes.push(...exec.notes);
    } else if (exec?.notes.length) notes.push(...exec.notes);
  }

  // checked and repaired as anything composed is (contrast, overflow), on this artboard alone
  const only = { ...doc, artboards: doc.artboards.filter((b) => b.id === boardId), tokens: boardTokens(doc, doc.artboards.find((b) => b.id === boardId)!) };
  const refined = refineDoc(only, measure);
  const fixedBoard = refined.doc.artboards[0];
  if (fixedBoard) doc = { ...doc, artboards: doc.artboards.map((b) => (b.id === boardId ? { ...fixedBoard, tokens: b.tokens ?? fixedBoard.tokens } : b)) };
  if (refined.fixed.length) notes.push(`Fixed before showing: ${refined.fixed.slice(0, 2).map((f) => f.replace(/\.$/, '')).join('; ')}.`);
  doc = { ...doc, revision: (doc.revision ?? 0) + 1, updatedAt: now };
  const label = created ? `combined: ${plan.takes.map((t) => `${SYNTH_LABEL[t.key]} of ${shortName(t.from)}`).join(', ')}`.slice(0, 90) : plan.summary.slice(0, 90);
  return { doc, board: boardId, done, notes, label, created };
}

/** The decisions a plan takes, by key (for tests and the reply). */
export const takenKeys = (p: SynthesisPlan): DecisionKey[] => p.takes.map((t) => t.key);
