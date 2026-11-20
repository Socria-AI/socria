// lib/ux-v0/graphics/edit.ts — a change asked for in words, read in code, as validated operations on the document.
//
// "Make this headline more editorial." "Increase the contrast without changing the composition." "Replace only the
// background image." "Turn these shapes into an angular geometric pattern." "Move the subtitle beneath the main
// headline." "Make the layout more experimental." "Create a second version with different typography." "Preserve the
// logo and all brand colours." "Adapt this design to Instagram Story dimensions." "Make this infographic easier to
// read." Each is read against the narrowest scope that makes sense: the selection, else the object the words name
// (the headline, the subtitle, the background picture, the shapes, the logo), else the artboard. The result is a set
// of operations (lib/ux-v0/graphics/doc.ts) the canvas previews and applies as one change Undo takes back; locked
// objects and locked decisions are never changed (the edit says what is locked instead). Words it is not sure of
// return null: nothing is guessed.

import { contrastRatio } from '../../ux/audit';
import { FONTS, knownFont } from '../fonts';
import { ensureContrast } from '../spec';
import { reshape } from '../targeted';
import { applyOps, boxOnBoard, isLocked, walk, type Artboard, type GraphicDoc, type Located, type Node, type Op, type Role, type TextNode } from './doc';
import { adaptBoard, type GraphicDirection } from './compose';
import { formatFromWords } from './formats';
import { approxMeasure, fitSize, type Measure } from './text';

export interface GraphicEdit {
  ops: Op[];
  /** what will be done, in a few words */
  label: string;
  /** what it applies to */
  scope: 'selection' | 'object' | 'artboard' | 'document';
  /** a reason it cannot be done as asked (a lock), said as a question with an alternative */
  question?: string;
  /** the edited document, made here: for an edit whose new objects' ids are only known once made (a duplicated
   * artboard changed further). Applied as one change, like the operations. */
  next?: GraphicDoc;
}

export interface EditContext {
  artboard: string;
  /** the selected objects, by id */
  selection: readonly string[];
  /** the direction the design was made in (for adapting to another format) */
  dir?: GraphicDirection | null;
  measure?: Measure;
}

const lower = (s: string) => s.toLowerCase().replace(/[’']/g, "'");

const ROLE_WORDS: readonly [RegExp, Role[]][] = [
  [/\b(main )?(headline|heading|title)\b/, ['headline']],
  [/\b(subtitle|subhead|subheading|strapline|tagline)\b/, ['subhead']],
  [/\b(body|paragraph|copy)\b/, ['body']],
  [/\b(logo|wordmark|brand name|masthead)\b/, ['logo']],
  [/\b(button|cta|call to action)\b/, ['cta']],
  [/\b(date|place|details|meta)\b/, ['meta']],
  [/\b(background (image|picture|photo)|backdrop)\b/, ['background', 'image']],
  [/\b(image|picture|photo)\b/, ['image', 'background']],
  [/\b(shapes?|motifs?|forms?|geometry)\b/, ['motif']],
  [/\b(chart|graph|infographic|data)\b/, ['data']],
];

/** The objects the words point at: the selection first, else the role named, else nothing. */
function targets(doc: GraphicDoc, board: Artboard, words: string, sel: readonly string[], kinds?: Node['type'][]): { list: Located[]; scope: GraphicEdit['scope'] } {
  const all = walk(board);
  const pick = (l: Located) => !kinds || kinds.includes(l.node.type);
  if (sel.length && /\b(this|these|it|them|selected|selection)\b/.test(words)) {
    const list = all.filter((l) => sel.includes(l.node.id) && pick(l));
    if (list.length) return { list, scope: 'selection' };
  }
  for (const [re, roles] of ROLE_WORDS) {
    if (!re.test(words)) continue;
    const list = all.filter((l) => l.node.role && roles.includes(l.node.role) && pick(l));
    if (list.length) return { list: roles[0] === 'background' ? list.sort((p, q) => q.node.w * q.node.h - p.node.w * p.node.h).slice(0, 1) : list, scope: 'object' };
    // "the headline" of an artboard that has none (a wordmark board, a card): its main words, the largest text
    if (roles[0] === 'headline') {
      const main = mainText(board);
      if (main && pick(main)) return { list: [main], scope: 'object' };
    }
  }
  if (sel.length) {
    const list = all.filter((l) => sel.includes(l.node.id) && pick(l));
    if (list.length) return { list, scope: 'selection' };
  }
  return { list: [], scope: 'artboard' };
}

/** An artboard's main words: its headline, else its largest text. */
function mainText(board: Artboard): Located | null {
  const texts = walk(board).filter((l) => l.node.type === 'text' && !l.node.hidden);
  return texts.find((l) => l.node.role === 'headline') ?? texts.sort((p, q) => (q.node as TextNode).size - (p.node as TextNode).size)[0] ?? null;
}

/** The colour beneath a text's middle (its artboard's ground, or the shape it sits on). */
function groundOf(board: Artboard, l: Located): string {
  const order = walk(board);
  const at = order.findIndex((x) => x.node.id === l.node.id);
  const b = boxOnBoard(l);
  const px = b.x + b.w / 2;
  const py = b.y + b.h / 2;
  for (let i = at - 1; i >= 0; i--) {
    const n = order[i].node;
    if (n.type !== 'shape' || n.hidden || n.fill === null || typeof n.fill !== 'string') continue;
    const nb = boxOnBoard(order[i]);
    if (px >= nb.x && px <= nb.x + nb.w && py >= nb.y && py <= nb.y + nb.h) return n.fill.slice(0, 7);
  }
  return (board.background ?? '#ffffff').slice(0, 7);
}

/** Another pairing of faces, distinct from the current one: a serif display for a sans one and the reverse. */
export function otherPairing(display: string, body: string): { display: string; body: string } {
  const cur = knownFont(display);
  const serif = cur?.kind === 'serif';
  const displays = FONTS.filter((f) => f.name !== display && (serif ? f.kind === 'sans' : f.kind === 'serif'));
  const bodies = FONTS.filter((f) => f.name !== body && !f.displayOnly && (serif ? f.kind === 'serif' : f.kind === 'sans'));
  const d = displays[(display.length * 7) % Math.max(1, displays.length)] ?? FONTS[0];
  const b = bodies[(body.length * 5) % Math.max(1, bodies.length)] ?? FONTS[1];
  return { display: d.name, body: b.name };
}

/** The edit the words ask for, or null (see the head of this file). */
export function readGraphicEdit(words0: string, doc: GraphicDoc, ctx: EditContext): GraphicEdit | null {
  const words = lower(words0 || '').trim();
  if (!words || words.length > 300) return null;
  const board = doc.artboards.find((b) => b.id === ctx.artboard) ?? doc.artboards[0];
  const measure = ctx.measure ?? approxMeasure;
  const finish = (e: GraphicEdit): GraphicEdit => {
    // a dry run: what is locked is said, and the edit applies to nothing
    const tried = applyOps(doc, e.ops);
    if (!tried.ok) return { ...e, ops: [], question: `${tried.error} ${tried.locked?.length ? 'Unlock it to change it, or say what to change instead.' : ''}`.trim() };
    return e;
  };

  // keep: "preserve the logo and all brand colours", "keep the typography"
  if (/\b(preserve|protect|lock|keep)\b/.test(words) && !/\b(make|change|replace|move|turn|create|adapt)\b/.test(words)) {
    const ops: Op[] = [];
    const said: string[] = [];
    if (/\b(logo|wordmark|brand name)\b/.test(words)) {
      const logos = walk(board).filter((l) => l.node.role === 'logo' && !l.node.locked);
      for (const l of logos) ops.push({ op: 'update', id: l.node.id, set: { locked: true } });
      if (logos.length) said.push('the logo locked');
    }
    if (/\b(colou?rs?|palette)\b/.test(words)) (ops.push({ op: 'locks', colors: true }), said.push('the colours locked'));
    if (/\b(typography|type|fonts?|typefaces?)\b/.test(words)) (ops.push({ op: 'locks', fonts: true }), said.push('the typefaces locked'));
    if (!ops.length) return null;
    return { ops, label: said.join(', '), scope: 'document' };
  }

  // another format: "adapt this design to Instagram Story dimensions"
  if (/\b(adapt|resize|make a version|version for|turn it into|reformat)\b/.test(words)) {
    const f = formatFromWords(words);
    if (f && ctx.dir) {
      const next = adaptBoard(doc, board.id, f.id, ctx.dir, { measure });
      if (next) return { ops: [{ op: 'artboard-add', artboard: next, after: board.id }], label: `a ${f.label.toLowerCase()} version, re-laid out (the words kept exactly)`, scope: 'document' };
    }
  }

  // a second version with other typography: the artboard duplicated, its faces changed
  if (/\b(second|another|new|alternative)\b.*\bversion\b/.test(words) && /\b(typography|type|fonts?|typefaces?)\b/.test(words)) {
    if (doc.locks?.fonts) return { ops: [], label: 'another typography', scope: 'artboard', question: 'The typefaces are locked for this design. Unlock them to try another pairing.' };
    const pair = otherPairing(doc.tokens.fonts.display, doc.tokens.fonts.body);
    const dupe = applyOps(doc, [{ op: 'artboard-duplicate', id: board.id, name: `${board.name} (${pair.display})` }]);
    if (!dupe.ok) return null;
    const copy = dupe.doc.artboards[dupe.doc.artboards.findIndex((b) => b.id === board.id) + 1];
    // the faces set on the copy: its ids exist only in the duplicated document, so the edit carries that document
    const faceOps: Op[] = walk(copy)
      .filter((l) => l.node.type === 'text' && !isLocked(l))
      .map((l) => ({ op: 'update', id: l.node.id, set: { font: ['headline', 'logo'].includes(l.node.role ?? '') ? pair.display : pair.body, weight: ['headline', 'logo'].includes(l.node.role ?? '') ? Math.min(800, Math.max(400, (l.node as TextNode).weight)) : 400 } }) as Op);
    const withFaces = applyOps(dupe.doc, faceOps);
    if (!withFaces.ok) return null;
    return { ops: [], next: withFaces.doc, label: `a second version in ${pair.display} and ${pair.body} (the original kept)`, scope: 'artboard' };
  }

  // bigger / smaller
  const bigger = /\b(bigger|larger|greater|increase the size|scale up)\b/.test(words);
  const smaller = /\b(smaller|reduce the size|scale down|tone down the size)\b/.test(words);
  if (bigger !== smaller && (bigger || smaller)) {
    const t = targets(doc, board, words, ctx.selection, ['text', 'shape', 'image']);
    if (!t.list.length) return null;
    const k = bigger ? 1.2 : 1 / 1.2;
    const ops: Op[] = t.list.map((l) =>
      l.node.type === 'text'
        ? ({ op: 'update', id: l.node.id, set: { size: Math.round(l.node.size * k * 10) / 10, h: Math.round(l.node.h * k * 10) / 10, w: bigger ? Math.min(board.width - board.safe - boxOnBoard(l).x, l.node.w * 1.1) : l.node.w } } as Op)
        : ({ op: 'resize', id: l.node.id, x: l.node.x - (l.node.w * (k - 1)) / 2, y: l.node.y - (l.node.h * (k - 1)) / 2, w: l.node.w * k, h: l.node.h * k } as Op),
    );
    return finish({ ops, label: `${t.list.length === 1 ? (t.list[0].node.name ?? 'it').toLowerCase() : `${t.list.length} objects`} ${bigger ? 'larger' : 'smaller'}`, scope: t.scope });
  }

  // more editorial: a serif display face, a lighter weight, sentence case, tighter tracking
  if (/\beditorial\b/.test(words)) {
    const t = targets(doc, board, words.replace(/\beditorial\b/, ''), ctx.selection, ['text']);
    const list = t.list.length ? t.list : walk(board).filter((l) => l.node.role === 'headline');
    if (!list.length) return null;
    if (doc.locks?.fonts) return { ops: [], label: 'more editorial', scope: t.scope, question: 'The typefaces are locked for this design. Unlock them to set it more editorially.' };
    const serif = FONTS.find((f) => f.kind === 'serif' && f.name !== (list[0].node as TextNode).font && !f.displayOnly) ?? FONTS[1];
    const ops: Op[] = list.map((l) => {
      const n = l.node as TextNode;
      const next = { ...n, font: serif.name, weight: 400, tracking: -10, case: 'none' as const, lineHeight: 1.02 };
      return { op: 'update', id: n.id, set: { font: serif.name, weight: 400, tracking: -10, case: 'none', lineHeight: 1.02, size: Math.min(n.size * 1.05, fitSize({ ...next, size: n.size * 1.05 }, measure)) } } as Op;
    });
    return finish({ ops, label: `${list.length === 1 ? 'the headline' : 'the text'} set editorially, in ${serif.name}`, scope: t.list.length ? t.scope : 'object' });
  }

  // contrast: colours only, the composition untouched
  if (/\b(contrast|legib|readab|easier to read)\b/.test(words) && !/\binfographic|chart\b/.test(words)) {
    if (doc.locks?.colors) return { ops: [], label: 'more contrast', scope: 'artboard', question: 'The colours are locked for this design. Unlock them to raise the contrast.' };
    const t = targets(doc, board, words, ctx.selection, ['text']);
    const list = (t.list.length ? t.list : walk(board).filter((l) => l.node.type === 'text')).filter((l) => !isLocked(l));
    const ops: Op[] = [];
    for (const l of list) {
      const n = l.node as TextNode;
      const g = groundOf(board, l);
      const better = ensureContrast(n.color.slice(0, 7), g, 7);
      if (better !== n.color && contrastRatio(better, g) > contrastRatio(n.color.slice(0, 7), g)) ops.push({ op: 'update', id: n.id, set: { color: better } });
    }
    if (!ops.length) return { ops: [], label: 'the contrast is already as high as it goes', scope: 'artboard' };
    return finish({ ops, label: `stronger contrast on ${ops.length} text${ops.length > 1 ? 's' : ''} (colours only; nothing moved)`, scope: t.list.length ? t.scope : 'artboard' });
  }

  // an infographic easier to read: values on, text a step larger, more room between lines
  if (/\b(infographic|chart|graph|diagram)\b/.test(words) && /\b(easier|clearer|readab|legib|simpler)\b/.test(words)) {
    const ops: Op[] = [];
    for (const l of walk(board)) {
      if (isLocked(l)) continue;
      if (l.node.type === 'chart') ops.push({ op: 'update', id: l.node.id, set: { values: true } });
      if (l.node.type === 'text' && ['body', 'caption', 'meta', 'label', 'subhead'].includes(l.node.role ?? '')) ops.push({ op: 'update', id: l.node.id, set: { size: Math.round(l.node.size * 1.15 * 10) / 10, lineHeight: Math.max(1.45, l.node.lineHeight), autoHeight: true } });
    }
    if (!ops.length) return null;
    return finish({ ops, label: 'the values shown, the text a step larger with more room between lines', scope: 'artboard' });
  }

  // another picture: "replace only the background image"
  if (/\b(replace|swap|change|another|different)\b/.test(words) && /\b(image|picture|photo|background)\b/.test(words)) {
    const t = targets(doc, board, words, ctx.selection, ['image']);
    if (!t.list.length) return null;
    const used = new Set(doc.artboards.flatMap((b) => walk(b).filter((l) => l.node.type === 'image').map((l) => (l.node as { asset: string }).asset)));
    const fresh = doc.assets.find((a) => !used.has(a.id));
    if (!fresh) return { ops: [], label: 'another picture', scope: t.scope, question: 'There is no other picture in this design to use. Upload one (Assets), then ask again.' };
    return finish({ ops: [{ op: 'update', id: t.list[0].node.id, set: { asset: fresh.id } }], label: `the ${t.list[0].node.role === 'background' ? 'background picture' : 'picture'} replaced with “${fresh.name}”`, scope: t.scope });
  }

  // shapes into another language: "turn these shapes into an angular geometric pattern"
  const angular = /\b(angular|geometric|sharp|faceted|polygonal|hard-edged)\b/.test(words);
  const organic = /\b(organic|fluid|soft|curved|rounded|flowing)\b/.test(words);
  if ((angular || organic) && angular !== organic && /\b(shapes?|motifs?|forms?|geometry|pattern)\b/.test(words)) {
    const t = targets(doc, board, words, ctx.selection, ['shape']);
    const list = (t.list.length ? t.list : walk(board).filter((l) => l.node.type === 'shape' && l.node.role === 'motif' && (l.node as { shape?: string }).shape !== 'line')).filter((l) => !isLocked(l));
    const to = angular ? 'angular' : 'organic';
    if (!list.length) {
      // nothing to turn: offered instead (said, previewed, never applied unasked), a pattern of the kind asked for, in
      // the quarter of the artboard the words leave most free, behind everything
      const texts = walk(board).filter((l) => l.node.type === 'text' && !l.node.hidden).map(boxOnBoard);
      const qs = [0, 1, 2, 3].map((i) => ({ x: (i % 2) * board.width * 0.5, y: Math.floor(i / 2) * board.height * 0.5, w: board.width * 0.5, h: board.height * 0.5 }));
      const covered = (q: { x: number; y: number; w: number; h: number }) => texts.reduce((sum, b) => sum + Math.max(0, Math.min(q.x + q.w, b.x + b.w) - Math.max(q.x, b.x)) * Math.max(0, Math.min(q.y + q.h, b.y + b.h) - Math.max(q.y, b.y)), 0);
      const q = qs.reduce((a, b) => (covered(b) < covered(a) ? b : a));
      const cell = Math.min(q.w / 3, q.h / 2) * 0.8;
      const ops: Op[] = [];
      for (let i = 0; i < 6; i++) {
        const cx = q.x + (q.w / 3) * ((i % 3) + 0.5);
        const cy = q.y + (q.h / 2) * (Math.floor(i / 3) + 0.5);
        const size = cell * (0.7 + ((i * 37) % 30) / 100);
        ops.push({ op: 'add', artboard: board.id, index: 0, node: { id: `pt${i}${Date.now().toString(36).slice(-4)}`, type: 'shape', role: 'motif', name: angular ? 'Angular shape' : 'Organic shape', ...(angular ? { shape: 'polygon', sides: 3 + (i % 4) } : { shape: 'ellipse' }), fill: i % 2 ? doc.tokens.colors.accent : doc.tokens.accent2 ?? doc.tokens.colors.line, x: cx - size / 2, y: cy - size / 2, w: size, h: angular ? size : size * (0.75 + (i % 3) * 0.12), rotation: angular ? (i * 23) % 60 : 0, opacity: 1 } });
      }
      return finish({ ops, label: `a pattern of ${to} shapes where the words leave room`, scope: 'artboard', question: `There were no shapes on this artboard to make ${to}, so this adds a pattern of ${to} shapes in the part the words leave most free, behind everything. Apply it, or discard it.` });
    }
    const ops: Op[] = list.map((l) => {
      const n = l.node;
      if (n.type !== 'shape') return { op: 'update', id: n.id, set: {} } as Op;
      if (n.shape === 'recipe' && n.recipe) return { op: 'update', id: n.id, set: { recipe: reshape(n.recipe, to) } } as Op;
      if (n.shape === 'ellipse' || n.shape === 'rect' || n.shape === 'polygon' || n.shape === 'star') return { op: 'update', id: n.id, set: angular ? { shape: 'polygon', sides: 3 + ((n.id.charCodeAt(1) || 3) % 4) } : { shape: 'ellipse' } } as Op;
      return { op: 'update', id: n.id, set: {} } as Op;
    });
    // a pattern: the shapes repeated on a grid across the artboard's free field
    if (/\bpattern\b/.test(words) && angular && list.length === 1) {
      const base = list[0].node;
      for (let i = 1; i < 6; i++) ops.push({ op: 'duplicate', id: base.id, dx: (i % 3) * base.w * 0.9, dy: Math.floor(i / 3) * base.h * 0.9 });
    }
    return finish({ ops, label: `${list.length === 1 ? 'the shape' : `${list.length} shapes`} made ${to === 'angular' ? 'angular' : 'organic'}`, scope: t.list.length ? t.scope : 'object' });
  }

  // one under another: "move the subtitle beneath the main headline"
  const under = words.match(/\bmove (?:the )?(\w+)\s+(?:beneath|below|under(?:neath)?)\s+(?:the )?(?:main )?(\w+)/);
  if (under) {
    // "subtitle" holds "title": the sub- words are read first
    const roleOf = (w: string): Role | null => (/sub(title|head)|strapline|tagline/.test(w) ? 'subhead' : /head(line|ing)|^title$/.test(w) ? 'headline' : /logo|brand/.test(w) ? 'logo' : /date|detail|meta/.test(w) ? 'meta' : /button|cta/.test(w) ? 'cta' : /body|paragraph/.test(w) ? 'body' : null);
    const a = roleOf(under[1]);
    const b = roleOf(under[2]);
    const all = walk(board);
    const A = all.find((l) => l.node.role === a);
    const B = all.find((l) => l.node.role === b);
    if (!A || !B) return null;
    const bb = boxOnBoard(B);
    const ab = boxOnBoard(A);
    const gap = Math.max(board.height * 0.015, (B.node.type === 'text' ? B.node.size : 16) * 0.4);
    return finish({ ops: [{ op: 'move', id: A.node.id, dx: bb.x - ab.x, dy: bb.y + bb.h + gap - ab.y }], label: `the ${under[1]} moved beneath the ${under[2]}`, scope: 'object' });
  }

  // more experimental: the headline turned, the shapes larger and crossing it, the column broken
  if (/\b(experimental|daring|unexpected|less predictable|bolder layout)\b/.test(words)) {
    const ops: Op[] = [];
    const main = mainText(board);
    for (const l of walk(board)) {
      if (isLocked(l)) continue;
      const n = l.node;
      if (main && n.id === main.node.id && n.type === 'text') ops.push({ op: 'update', id: n.id, set: { rotation: n.rotation ? 0 : -8 } });
      if (n.role === 'motif' && n.type === 'shape' && n.w > board.width * 0.15) ops.push({ op: 'resize', id: n.id, x: n.x - n.w * 0.15, y: n.y + board.height * 0.08, w: n.w * 1.3, h: n.h * 1.3 });
      if (n.role === 'subhead') ops.push({ op: 'move', id: n.id, dx: board.width * 0.18, dy: 0 });
    }
    if (!ops.length) return null;
    return finish({ ops, label: 'the layout made more experimental (the headline turned, the shapes crossing it, the column broken); the words untouched', scope: 'artboard' });
  }

  // a colour for the selection or a named object: "make the headline #b4532a" / "… red"; a colour alone, with
  // something selected, is that colour for it (as the ask bar's own example offers)
  const hex = words.match(/#[0-9a-f]{6}\b/);
  if (hex && (/\b(colou?r|make|set|turn)\b/.test(words) || (words.trim() === hex[0] && ctx.selection.length > 0))) {
    if (doc.locks?.colors) return { ops: [], label: 'a colour', scope: 'object', question: 'The colours are locked for this design. Unlock them to change a colour.' };
    const t = targets(doc, board, words, ctx.selection);
    if (!t.list.length) return null;
    return finish({ ops: t.list.map((l) => ({ op: 'update', id: l.node.id, set: l.node.type === 'text' ? { color: hex[0] } : { fill: hex[0] } }) as Op), label: `${t.list.length === 1 ? 'it' : `${t.list.length} objects`} in ${hex[0]}`, scope: t.scope });
  }
  return null;
}
