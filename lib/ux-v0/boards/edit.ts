// lib/ux-v0/boards/edit.ts — a change to a board asked in words, read into validated operations or a named action.
//
// "Arrange these materials into two rows", "make all the posters slightly larger on the board", "move the mockups
// to the right side", "keep the first three materials exactly as they are" become board operations (arranging,
// sizing on the board, moving, locking), applied whole or not at all and undone in one step. What needs more than an
// operation is returned as an action the workspace carries out with the same pipeline that made the board: a new
// material in the system, one material regenerated (the others untouched), a change to the design system (shown as
// a proposal: what changes, which materials, which local overrides are kept), notes written again, the board
// polished, the system's faces carried into a linked website as a new version of it. Words it cannot read are not
// guessed at.

import { contrastRatio } from '../../ux/audit';
import { FONTS, knownFont, nearestWeight } from '../fonts';
import { COLOUR_WORDS, SPREAD, type GraphicKind } from '../graphics/compose';
import { otherPairing } from '../graphics/edit';
import { arrange, presentSize } from './layout';
import { bounds, nodeOfMaterial, type Arrangement, type BoardOp, type BoardState, type Material } from './model';
import { changedTokens, rulesOf, type MasterDesignSystem, type TokenKey } from './system';

export type BoardAction =
  | { kind: 'add-material'; spec: { kind: GraphicKind; format?: string } }
  | { kind: 'regenerate'; materials: string[] }
  | { kind: 'system'; system: MasterDesignSystem; changed: TokenKey[] }
  | { kind: 'annotate' }
  | { kind: 'polish' }
  | { kind: 'website-sync'; materials: string[]; fonts: boolean; colours: boolean };

export interface BoardEdit {
  label: string;
  scope: 'selection' | 'materials' | 'board' | 'system';
  ops?: BoardOp[];
  action?: BoardAction;
  /** why it cannot be done as asked, with what would work */
  question?: string;
}

const NUMBER: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const ORDINAL: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const n = (w: string | undefined) => (w ? NUMBER[w] ?? (Number(w) || 0) : 0);

const KINDS: readonly [RegExp, (m: Material) => boolean, string][] = [
  [/\b(posters?|flyers?)\b/, (m) => m.type === 'graphic' && m.brief.kind === 'poster', 'posters'],
  [/\b((instagram|social)( media)?( graphics?| posts?| stories?)?|stor(y|ies)|posts?)\b/, (m) => m.type === 'graphic' && ['social', 'carousel', 'ad', 'announcement'].includes(m.brief.kind), 'social graphics'],
  [/\bbanners?\b/, (m) => m.type === 'graphic' && m.brief.kind === 'banner', 'banners'],
  [/\b(mock-?ups?)\b/, (m) => m.type === 'mockup', 'mockups'],
  [/\b(website|site|web page)s?\b/, (m) => m.type === 'website', 'website'],
  [/\blabels?\b/, (m) => m.type === 'graphic' && m.brief.kind === 'label', 'labels'],
  [/\b(graphics)\b/, (m) => m.type === 'graphic', 'graphics'],
  [/\b(materials?|everything|all of (it|them)|designs?)\b/, () => true, 'materials'],
];

/** The materials the words point at: the selection ("these"), else a kind and an ordinal ("the second poster"). */
function pointAt(words: string, b: BoardState, selection: readonly string[]): { list: Material[]; scope: BoardEdit['scope']; what: string } {
  const selected = b.materials.filter((m) => selection.some((id) => b.nodes.find((x) => x.id === id && x.type === 'material' && x.material === m.id)));
  if (selected.length && /\b(this|these|those|selected|selection|them|it)\b/.test(words)) return { list: selected, scope: 'selection', what: selected.length === 1 ? selected[0].name : `the ${selected.length} selected` };
  const k = KINDS.find(([re]) => re.test(words));
  const pool = k ? b.materials.filter(k[1]) : [];
  const what = k?.[2] ?? 'materials';
  // "the first three", "the last two"
  const range = words.match(/\b(first|last)\s+(\d+|two|three|four|five|six|seven|eight|nine|ten)\b/);
  if (range) {
    const count = n(range[2]);
    return { list: range[1] === 'first' ? pool.slice(0, count) : pool.slice(-count), scope: 'materials', what: `the ${range[1]} ${range[2]} ${what}` };
  }
  // "the second poster", "poster 2", "the 2nd poster", "the last poster"
  const ord = words.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|(\d+)(?:st|nd|rd|th))\b/) ?? words.match(/\b(?:poster|post|graphic|banner|mockup|material)\s+(\d+)\b/);
  if (ord && pool.length) {
    const word = ord[1];
    const i = word === 'last' ? pool.length : ORDINAL[word] ?? Number(ord[2] ?? word);
    const m = pool[i - 1];
    return { list: m ? [m] : [], scope: 'materials', what: m ? m.name : `${word} ${what}` };
  }
  if (selected.length && !k) return { list: selected, scope: 'selection', what: `the ${selected.length} selected` };
  return { list: pool, scope: 'materials', what };
}

const placeOf = (b: BoardState, list: readonly Material[]) => list.map((m) => nodeOfMaterial(b, m.id)).filter((x): x is NonNullable<typeof x> => !!x);
export const onAccent = (accent: string) => (contrastRatio('#ffffff', accent) >= contrastRatio('#111111', accent) ? '#ffffff' : '#111111');

/** A system with one decision changed, its rules said again. */
/** A system with a change made to a copy of it, its rules written again (the original is never touched). */
export function reviseSystem(sys: MasterDesignSystem, change: (s: MasterDesignSystem) => void): MasterDesignSystem {
  return revise(sys, change);
}

function revise(sys: MasterDesignSystem, change: (s: MasterDesignSystem) => void): MasterDesignSystem {
  const next: MasterDesignSystem = JSON.parse(JSON.stringify(sys));
  change(next);
  next.constraints = rulesOf(next, sys.art?.avoid ?? []);
  return next;
}

/** A change to a board asked in words (see the head of this file); null when it is not one SocriaUX can read. */
export function readBoardEdit(words0: string, b: BoardState, ctx: { selection: readonly string[] }): BoardEdit | null {
  const words = words0.toLowerCase().replace(/[’']/g, "'").trim();
  if (!words) return null;
  const sys = b.system;

  // keep / lock: "keep the first three materials exactly as they are"
  if (/\b(keep|lock|freeze|protect)\b/.test(words) && /\b(as (they|it) (are|is)|unchanged|exactly|locked?|the same|frozen)\b/.test(words)) {
    const t = pointAt(words, b, ctx.selection);
    const places = placeOf(b, t.list);
    if (!places.length) return { label: 'nothing to keep', scope: t.scope, question: `There are no ${t.what} on the board to keep.` };
    return { label: `${t.what} kept exactly as they are (locked)`, scope: t.scope, ops: places.map((p) => ({ op: 'node-update', id: p.id, set: { locked: true } }) as BoardOp) };
  }
  if (/\b(unlock|release)\b/.test(words)) {
    const t = pointAt(words, b, ctx.selection);
    const places = placeOf(b, t.list).filter((p) => p.locked);
    if (!places.length) return { label: 'nothing to unlock', scope: t.scope, question: 'Nothing there is locked.' };
    return { label: `${t.what} unlocked`, scope: t.scope, ops: places.map((p) => ({ op: 'node-update', id: p.id, set: { locked: false } }) as BoardOp) };
  }

  // annotations
  if (/\b(hide|remove|turn off)\b.*\b(notes|annotations)\b/.test(words)) return { label: 'annotations hidden', scope: 'board', ops: [{ op: 'annotations', visible: false }] };
  if (/\b(show|turn on)\b.*\b(notes|annotations)\b/.test(words)) return { label: 'annotations shown', scope: 'board', ops: [{ op: 'annotations', visible: true }] };
  if (/\b(annotat\w*|explain\w*|notes?)\b/.test(words) && /\b(add|write|explain|annotate|regenerate|update|refresh|again)\b/.test(words)) return { label: 'the notes written again from the board’s facts', scope: 'board', action: { kind: 'annotate' } };

  // the website follows the system: "apply the same typography system to the website mockup"
  if (/\b(website|site)\b/.test(words) && /\b(apply|use|carry|bring|sync|match)\b/.test(words) && /\b(typograph\w*|fonts?|faces?|type|colou?rs?|palette|system|identity)\b/.test(words)) {
    const sites = b.materials.filter((m) => m.type === 'website');
    if (!sites.length) return { label: 'no website', scope: 'materials', question: 'There is no website on this board to carry the system into.' };
    // "the typography system" is the faces; "the system" or "the identity" alone is the faces and the colours
    const typeWords = /\b(typograph\w*|fonts?|faces?|type)\b/.test(words);
    const colourWords = /\b(colou?rs?|palette)\b/.test(words);
    const whole = /\b(system|identity)\b/.test(words);
    const fonts = typeWords || (whole && !colourWords);
    const colours = colourWords || (whole && !typeWords);
    return { label: `the system’s ${fonts && colours ? 'faces and colours' : fonts ? 'typefaces' : 'colours'} carried into the website (a new version of it; the earlier one kept)`, scope: 'materials', action: { kind: 'website-sync', materials: sites.map((m) => m.id), fonts, colours } };
  }

  // the design system: accent, faces, a character
  if (sys && /\b(accent|highlight|key) colou?r\b/.test(words) && /\b(change|make|swap|switch|set|use|try)\b/.test(words)) {
    const named = COLOUR_WORDS.find(([re]) => re.test(words.replace(/\baccent colou?r\b/, '')));
    const hexed = words.match(/#[0-9a-f]{6}\b/)?.[0];
    const cur = sys.tokens.colors.accent.toLowerCase();
    const pick = hexed ?? named?.[1] ?? SPREAD[(SPREAD.indexOf(cur) + 1 + SPREAD.length) % SPREAD.length];
    const hex = pick.toLowerCase() === cur ? SPREAD[(SPREAD.indexOf(pick) + 2) % SPREAD.length] : pick;
    const next = revise(sys, (s) => {
      s.tokens.colors.accent = hex;
      s.tokens.colors.accentText = onAccent(hex);
      s.accentWhy = hexed || named ? `the accent changed to ${hexed ?? named![2]} on request` : 'the accent changed on request';
    });
    return { label: `the campaign’s accent changed to ${hex}`, scope: 'system', action: { kind: 'system', system: next, changed: changedTokens(sys, next) } };
  }
  if (sys && /\b(font|typeface|face|typography)\b/.test(words) && /\b(change|swap|switch|set|use|try|replace)\b/.test(words) && !/\b(more|less)\b/.test(words)) {
    const body = /\b(body|text|running|paragraph)\b/.test(words) && !/\b(primary|display|headline|campaign)\b/.test(words);
    const named = FONTS.find((f) => new RegExp(`\\b${f.name.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`).test(words));
    const cur = body ? sys.tokens.fonts.body : sys.tokens.fonts.display;
    const pairing = otherPairing(sys.tokens.fonts.display, sys.tokens.fonts.body);
    const face = named?.name ?? (body ? pairing.body : pairing.display);
    if (face === cur) return { label: 'the same face', scope: 'system', question: `The ${body ? 'text' : 'display'} face is already ${face}.` };
    if (body && named?.displayOnly) return { label: 'a headline face', scope: 'system', question: `${named.name} is drawn for headlines only; choose a face that reads as text.` };
    const next = revise(sys, (s) => {
      if (body) {
        s.tokens.fonts.body = face;
        s.weights.body = nearestWeight(face, s.weights.body);
      } else {
        s.tokens.fonts.display = face;
        s.weights.display = nearestWeight(face, s.weights.display);
      }
    });
    return { label: `the campaign’s ${body ? 'text' : 'display'} face changed to ${face}`, scope: 'system', action: { kind: 'system', system: next, changed: changedTokens(sys, next) } };
  }
  const character = words.match(/\b(?:make|turn)\b.*\b(?:campaign|system|identity|board|everything|it)\b.*\bmore (editorial|minimal|restrained|bold|bolder|loud|quiet)\b/) ?? words.match(/\bmore (editorial|minimal|restrained|bold|bolder|loud|quiet)\b/);
  if (sys && character && !/\b(presentation|layout|arrangement)\b/.test(words)) {
    const want = character[1];
    const serifs = FONTS.filter((f) => f.kind === 'serif' && !f.displayOnly && (f.variable || f.weights.length > 1)).map((f) => f.name);
    const next = revise(sys, (s) => {
      if (want === 'editorial') {
        const serif = knownFont(s.tokens.fonts.display)?.kind === 'serif' ? s.tokens.fonts.display : serifs.find((f) => ['Newsreader', 'Fraunces', 'Source Serif 4', 'EB Garamond'].includes(f)) ?? serifs[0];
        s.tokens.fonts.display = serif;
        s.weights.display = nearestWeight(serif, 500);
        s.type = { ...s.type, case: 'sentence', tracking: 'normal', role: 'editorial' };
      } else if (want === 'minimal' || want === 'restrained' || want === 'quiet') {
        s.weights.display = nearestWeight(s.tokens.fonts.display, 300);
        s.type = { ...s.type, case: 'sentence', tracking: 'normal', role: 'quiet' };
        s.composition = { ...s.composition, intensity: Math.max(0, s.composition.intensity - 30), density: 'airy' };
      } else {
        s.weights.display = nearestWeight(s.tokens.fonts.display, 800);
        s.type = { ...s.type, case: 'upper', tracking: 'tight', role: 'structural' };
        s.composition = { ...s.composition, intensity: Math.min(100, s.composition.intensity + 30) };
      }
    });
    const changed = changedTokens(sys, next);
    if (!changed.length) return { label: 'no change', scope: 'system', question: `The system is already as ${want} as these controls make it.` };
    return { label: `the system made more ${want === 'bolder' ? 'bold' : want} (${changed.join(', ')})`, scope: 'system', action: { kind: 'system', system: next, changed } };
  }

  // a new material in the campaign: "create another Instagram graphic using this campaign"
  const make = words.match(/\b(create|make|add|generate|design)\b.*\b(another|a new|one more|an extra|a|an)\b\s+(?:\w+\s+)?(instagram graphic|instagram post|social graphic|social post|story|poster|flyer|banner|label|advertisement|ad|business card|cover|infographic)\b/);
  if (make) {
    const w = make[3];
    const kind: GraphicKind = /story|instagram|social/.test(w) ? 'social' : /poster|flyer/.test(w) ? 'poster' : /banner/.test(w) ? 'banner' : /label/.test(w) ? 'label' : /ad/.test(w) ? 'ad' : /card/.test(w) ? 'card' : /cover/.test(w) ? 'magazine' : 'infographic';
    return { label: `another ${w} in the campaign’s system`, scope: 'materials', action: { kind: 'add-material', spec: { kind, ...(/story/.test(w) ? { format: 'story' } : {}) } } };
  }

  // one material made again: "regenerate only the second poster"
  if (/\b(regenerate|redo|recompose|try again|another version of|re-?make)\b/.test(words)) {
    const t = pointAt(words, b, ctx.selection);
    const list = t.list.filter((m) => m.type === 'graphic');
    if (!list.length) return { label: 'nothing to regenerate', scope: t.scope, question: `There is no ${t.what} to regenerate (mockups and websites follow their sources).` };
    const locked = list.filter((m) => nodeOfMaterial(b, m.id)?.locked);
    if (locked.length === list.length) return { label: 'locked', scope: t.scope, question: `${locked.map((m) => m.name).join(', ')} ${locked.length === 1 ? 'is' : 'are'} locked. Unlock to regenerate.` };
    return { label: `${list.filter((m) => !locked.includes(m)).map((m) => m.name).join(', ')} regenerated in the same system (everything else untouched)`, scope: t.scope, action: { kind: 'regenerate', materials: list.filter((m) => !locked.includes(m)).map((m) => m.id) } };
  }

  // remove / duplicate one material
  if (/\b(remove|delete)\b/.test(words) && !/\b(notes|annotations)\b/.test(words)) {
    const t = pointAt(words, b, ctx.selection);
    const places = placeOf(b, t.list);
    if (!places.length || t.list.length === b.materials.length) return { label: 'nothing removed', scope: t.scope, question: t.list.length === b.materials.length && b.materials.length ? 'Name which material to remove ("remove the second poster").' : `There is no ${t.what} to remove.` };
    return { label: `${t.what} removed from the board`, scope: t.scope, ops: [{ op: 'node-remove', ids: places.map((p) => p.id) }] };
  }
  if (/\b(duplicate|copy)\b/.test(words)) {
    const t = pointAt(words, b, ctx.selection);
    if (!t.list.length) return { label: 'nothing duplicated', scope: t.scope, question: `There is no ${t.what} to duplicate.` };
    return { label: `${t.what} duplicated`, scope: t.scope, ops: t.list.slice(0, 6).map((m) => ({ op: 'material-duplicate', id: m.id }) as BoardOp) };
  }

  // arranging the board
  const rows = words.match(/\b(\d+|one|two|three|four|five|six)\s+rows?\b/);
  const how: Arrangement | null = rows ? 'rows' : /\bgrid\b/.test(words) ? 'grid' : /\b(in a row|single row|one line|sequence|side by side|horizontal)\b/.test(words) ? 'sequence' : /\b(sections?|group(ed)? by|by (kind|type|medium))\b/.test(words) ? 'sections' : /\b(campaign overview|editorial|overview)\b/.test(words) ? 'editorial' : null;
  if (how && /\b(arrange|lay ?out|organi[sz]e|put|place|order|sort|show)\b/.test(words)) {
    const t = pointAt(words, b, ctx.selection);
    const only = t.scope === 'selection' ? placeOf(b, t.list).map((p) => p.id) : undefined;
    return { label: `arranged ${how === 'rows' ? `in ${rows![1]} rows` : how === 'grid' ? 'in a grid' : how === 'sequence' ? 'in one row' : how === 'sections' ? 'by sections' : 'as a campaign overview'}`, scope: t.scope === 'selection' ? 'selection' : 'board', ops: arrange(b, how, { rows: n(rows?.[1]) || 2, ...(only ? { only } : {}) }) };
  }
  if (/\b(polish\w*|tid(y|ier)|clean ?up|neaten|more professional|presentation)\b/.test(words)) return { label: 'the board polished: one arrangement, aligned sections, notes under what they explain, the system beside it', scope: 'board', action: { kind: 'polish' } };

  // sizes on the board: "make all the posters slightly larger on the board"
  const size = words.match(/\b(slightly |a little |a bit |much )?(larger|bigger|smaller)\b/);
  if (size && /\b(make|set|scale)\b/.test(words)) {
    const t = pointAt(words, b, ctx.selection);
    const places = placeOf(b, t.list).filter((p) => !p.locked);
    if (!places.length) return { label: 'nothing to resize', scope: t.scope, question: `There are no ${t.what} to resize on the board${placeOf(b, t.list).length ? ' (they are locked)' : ''}.` };
    const k = (size[1]?.startsWith('much') ? 1.4 : size[1] ? 1.15 : 1.25) ** (size[2] === 'smaller' ? -1 : 1);
    const sizes = Object.fromEntries(places.map((p) => [p.id, { w: Math.round(p.w * k), h: Math.round(p.h * k) }]));
    return { label: `${t.what} ${k > 1 ? 'larger' : 'smaller'} on the board (their own designs unchanged)`, scope: t.scope, ops: arrange(b, b.arrangement, { keepSizes: true, sizes }) };
  }
  if (/\b(reset|original|default) sizes?\b/.test(words)) return { label: 'every material at its presentation size', scope: 'board', ops: arrange(b, b.arrangement) };

  // moving a set: "move the mockups to the right side"
  const move = words.match(/\bmove\b.*\bto the (right|left|top|bottom)\b/);
  if (move) {
    const t = pointAt(words, b, ctx.selection);
    const places = placeOf(b, t.list);
    if (!places.length) return { label: 'nothing to move', scope: t.scope, question: `There are no ${t.what} on the board to move.` };
    if (places.some((p) => p.locked)) return { label: 'locked', scope: t.scope, question: 'Some of them are locked. Unlock them first.' };
    const ids = new Set(places.map((p) => p.id));
    const attached = b.nodes.filter((x) => x.type === 'note' && x.about && ids.has(x.about)).map((x) => x.id);
    const moving = b.nodes.filter((x) => ids.has(x.id) || attached.includes(x.id));
    const rest = b.nodes.filter((x) => !moving.includes(x));
    const mb = bounds(moving);
    const rb = bounds(rest.length ? rest : moving);
    const gap = 200;
    const dx = move[1] === 'right' ? rb.x + rb.w + gap - mb.x : move[1] === 'left' ? rb.x - gap - mb.w - mb.x : 0;
    const dy = move[1] === 'bottom' ? rb.y + rb.h + gap - mb.y : move[1] === 'top' ? rb.y - gap - mb.h - mb.y : move[1] === 'right' || move[1] === 'left' ? rb.y - mb.y : 0;
    const dxx = move[1] === 'top' || move[1] === 'bottom' ? rb.x - mb.x : dx;
    return { label: `${t.what} moved to the ${move[1]}`, scope: t.scope, ops: [{ op: 'node-move', ids: moving.map((x) => x.id), dx: dxx, dy }] };
  }

  // a material's size back to its format's: unused here, kept by presentSize
  void presentSize;
  return null;
}
