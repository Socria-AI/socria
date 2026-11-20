// lib/ux-v0/graphics/styles/edit.ts — a design's language changed in words: read, planned, shown, reversible.
//
// "Make this more Art Deco", "reduce the brutalist influence", "introduce risograph texture", "make the typography
// more experimental", "preserve the composition but change the style", "keep the colours but use Bauhaus geometry",
// "make this feel less like a tech startup", "give it a vintage print aesthetic", "remove the modern gradient
// treatment", "make the layout more asymmetrical": each is read into a new style selection (styles/blend.ts) — an
// influence raised or lowered, a dimension borrowed, a slider moved, flat colour — or into targeted operations where
// nothing needs rebuilding (gradients made flat, a selected text set in the style's type).
//
// A change of language that rebuilds (restyleArtboard) keeps what is the designer's: the words as they now stand,
// the approved pictures, every locked object where it is, the colours or faces when they are locked, and the artboard
// itself (its id, name, size). It comes back as a new document for the editor to preview before it is applied, so the
// original is never lost (undo restores it, and the version history keeps it). Nothing here calls a model.

import { refineDoc } from '../check';
import { composeGraphic, contentOf, type GraphicBrief, type GraphicDirection, type GraphicKind } from '../compose';
import { applyOps, isLocked, walk, type Artboard, type GraphicDoc, type Node, type Op, type TextNode } from '../doc';
import { FORMATS, formatOf } from '../formats';
import { colorAt, mixColor, type Paint } from '../paint';
import type { Measure } from '../text';
import { styledDirection } from './apply';
import { effectiveDNA, type StyleSelection } from './blend';
import { interpretStyle, selectStyles } from './interpret';
import { allStyles, searchStyles, styleById } from './registry';
import type { Dimension, StyleDNA } from './schema';

export interface StyleEditPlan {
  /** the language the design will speak afterwards (unchanged when the edit only operates) */
  selection: StyleSelection | null;
  keepColours: boolean;
  keepFonts: boolean;
  /** rebuild the artboard in the selection (a structural change, previewed) */
  rebuild: boolean;
  /** targeted operations instead of (or before) a rebuild */
  ops: Op[];
  label: string;
  scope: 'selection' | 'artboard' | 'document';
}

const lower = (s: string) => s.toLowerCase().replace(/[’']/g, "'");
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
/** The looks a brief means by "a tech startup": clean, glossy, gradient and sans-serif defaults. */
export const TECH_LOOK = new Set(['contemporary-minimalism', 'corporate-modernism', 'contemporary-swiss', 'futuristic-technical', 'holographic-digital', 'frutiger-aero', 'premium-product-advertising', 'geometric-abstraction']);

/** Words that say the phrase is about a look, so the library may be searched for one it does not name. */
const LOOK_WORDS = /\b(aesthetic|style|styled|look|feel|vibe|inspired|era|movement|vintage|retro|period)\b/;
/** The style a phrase names (the interpreter); the library's best match only when the phrase is about a look. */
function styleIn(phrase: string, customs: readonly StyleDNA[]): StyleDNA | null {
  const r = interpretStyle(phrase, { customs });
  if (r.named && r.primary) return styleById(r.primary, customs);
  if (!LOOK_WORDS.test(phrase)) return null;
  const hit = searchStyles(phrase, { customs, limit: 1 })[0];
  return hit && hit.score >= 6 ? hit.style : null;
}
const nameOf = (id: string | undefined, customs: readonly StyleDNA[]) => (id ? (styleById(id, customs)?.name ?? id) : 'its language');

/** Which of the design's own styles the words point at, by the stems of their names ("brutalist" → Neo-Brutalism
 * when that is the influence in the design): "less X" is read against what is there. */
function inSelection(words: string, cur: StyleSelection, customs: readonly StyleDNA[]): StyleDNA | null {
  const ids = [cur.secondary, cur.tertiary, ...Object.values(cur.dims ?? {}), cur.primary].filter((v): v is string => !!v);
  for (const id of ids) {
    const s = styleById(id, customs);
    if (!s) continue;
    const stems = s.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !['style', 'design', 'graphic', 'graphics', 'inspired', 'poster', 'typography', 'traditions'].includes(w))
      .map((w) => w.slice(0, Math.max(4, Math.min(6, w.length - 2))));
    if (stems.some((st) => new RegExp(`\\b${st}`).test(words))) return s;
  }
  return null;
}

/** How like each other two styles are (shared facets, tone, category, era words), for choosing a relative. */
function kinship(a: StyleDNA, b: StyleDNA): number {
  const share = (x: readonly string[], y: readonly string[]) => x.filter((v) => y.includes(v)).length;
  return share(a.facets, b.facets) * 2 + share(a.tone, b.tone) * 1.5 + (a.category === b.category ? 2 : 0) + share(a.related, [b.id]) * 3;
}

/**
 * A change of language read from words (see the head of this file); null when the words are not about style.
 * `current` is the design's selection (null when it speaks none yet); `selected` the objects the words point at.
 */
export function readStyleEdit(
  words0: string,
  doc: GraphicDoc,
  ctx: {
    current: StyleSelection | null;
    selected?: readonly Node[];
    customs?: readonly StyleDNA[];
    words?: string;
  },
): StyleEditPlan | null {
  const words = lower(words0 || '').trim();
  if (!words || words.length > 300) return null;
  const customs = [...(ctx.current?.customs ?? []), ...(ctx.customs ?? [])];
  const cur = ctx.current;
  const keepColours = /\b(keep|preserve|same|retain)\b[^.]*\bcolou?rs?\b|\bcolou?rs?\b[^.]*\b(kept|unchanged|the same)\b/.test(words) || !!doc.locks?.colors;
  const keepFonts = /\b(keep|preserve|same|retain)\b[^.]*\b(typography|type|fonts?|typefaces?)\b/.test(words) || !!doc.locks?.fonts;
  const plan = (sel: StyleSelection | null, label: string, extra: Partial<StyleEditPlan> = {}): StyleEditPlan => ({
    selection: sel,
    keepColours,
    keepFonts,
    rebuild: true,
    ops: [],
    label,
    scope: 'artboard',
    ...extra,
  });
  const base = (): StyleSelection => (cur ? { ...cur, dims: { ...(cur.dims ?? {}) } } : { primary: 'swiss-international', strength: 0 });

  // the style locked or unlocked
  if (/\b(lock|unlock|freeze|unfreeze)\b[^.]*\b(style|language|look)\b/.test(words) && cur) {
    const locked = /\b(lock|freeze)\b/.test(words) && !/\b(unlock|unfreeze)\b/.test(words);
    return plan({ ...cur, locked }, locked ? `the style locked: ${nameOf(cur.primary, customs)} holds through regeneration` : 'the style unlocked', { rebuild: false });
  }

  // flat colour: "remove the (modern) gradient treatment", "no gradients", "flat colours"
  if (/\b(remove|lose|drop|no|without|get rid of|kill)\b[^.]*\bgradients?\b|\bflat colou?rs?\b|\bflatten the colou?rs?\b/.test(words)) {
    const ops = flatOps(doc);
    return plan(cur ? { ...cur, flat: true } : null, ops.length ? `the gradients made flat (${ops.length} object${ops.length === 1 ? '' : 's'}), the composition kept` : 'flat colour from now on (there were no gradients)', {
      rebuild: false,
      ops,
      scope: 'document',
    });
  }

  // "preserve the composition but change the style" / "same layout, another style" / "keep the layout but …"
  if (/\b(keep|preserve|same|retain)\b[^.]*\b(composition|layout|structure|arrangement)\b/.test(words) && /\b(change|another|different|new|but|in)\b/.test(words)) {
    const rest = words.replace(/\b(keep|preserve|same|retain)\b[^,.;]*\b(composition|layout|structure|arrangement)\b/, ' ');
    const named = styleIn(rest, customs);
    const was = cur?.primary;
    const target =
      named && named.id !== was
        ? named
        : (selectStyles(
            { words: ctx.words ?? '' },
            {
              count: 1,
              seen: was ? [was] : [],
              salt: `${doc.id}|${doc.revision}`,
              customs,
            },
          )[0]?.style ?? null);
    if (!target) return null;
    const sel: StyleSelection = {
      primary: target.id,
      strength: 0,
      ...(was ? { dims: { composition: was } } : {}),
      ...(cur?.seedKey ? { seedKey: cur.seedKey } : {}),
      ...(cur?.customs ? { customs: cur.customs } : {}),
    };
    return plan(sel, `${target.name}, the composition kept${was ? ` (${nameOf(was, customs)}’s structure)` : ''}`);
  }

  // "keep the colours but use Bauhaus geometry": the named geometry builds it, the colours and type stay
  if (/\b(geometry|shapes?|forms)\b/.test(words) && /\b(use|with|in|give it|apply)\b/.test(words)) {
    const s = styleIn(words.replace(/\b(keep|preserve)\b[^,.;]*\b(colou?rs?|palette)\b/, ' '), customs);
    if (s) {
      const sel: StyleSelection = {
        ...base(),
        primary: s.id,
        strength: cur && cur.primary !== s.id ? 0 : base().strength,
        dims: {
          ...(cur && cur.primary !== s.id ? { typography: cur.primary } : {}),
        },
        ...(cur?.seedKey ? { seedKey: cur.seedKey } : {}),
      };
      return plan(sel, `${s.name} geometry${keepColours ? ', the colours kept' : ''}${cur && cur.primary !== s.id ? `, the typography kept (${nameOf(cur.primary, customs)})` : ''}`);
    }
  }

  // "make the layout more asymmetrical / symmetrical"
  if (/\b(layout|composition|arrangement)\b/.test(words) && /\b(more )?(a-?symmetric(al)?|symmetric(al)?|centred|centered|balanced|off-?centre|off-?center|dynamic)\b/.test(words)) {
    const asym = /\b(a-?symmetric(al)?|off-?centre|off-?center|dynamic)\b/.test(words);
    const now = cur ? effectiveDNA(cur, customs).dna : null;
    if (now && (asym ? now.composition.symmetry <= 30 : now.composition.symmetry >= 70)) return plan(cur, `the layout is already ${asym ? 'asymmetric' : 'symmetric'} in ${now.name}`, { rebuild: false });
    const pool = allStyles(customs).filter((s) => (asym ? s.composition.symmetry <= 30 : s.composition.symmetry >= 70) && s.id !== cur?.primary);
    const pick = now ? pool.sort((a, b) => kinship(now, b) - kinship(now, a))[0] : pool[0];
    if (!pick) return null;
    const sel = {
      ...base(),
      dims: { ...(base().dims ?? {}), composition: pick.id },
    };
    return plan(sel, `the layout made ${asym ? 'asymmetric' : 'symmetric'}: ${pick.name}’s composition, everything else as it was`);
  }

  // "make the typography more experimental (elegant, classical…)"
  {
    const m = words.match(/\b(typography|type|lettering|fonts?|headline)\b[^.]*\bmore ([a-z-]+)|\bmore ([a-z-]+) (typography|type|lettering|fonts?)\b/);
    if (m) {
      const adj = m[2] ?? m[3];
      const named = styleIn(words, customs);
      // only a change of language: "more experimental", or a style named; "more editorial", "bolder" and the like are
      // the editor's own typographic changes, read elsewhere
      const s = adj === 'experimental' ? styleById('experimental-typography', customs) : named;
      if (s) {
        const sel = {
          ...base(),
          dims: { ...(base().dims ?? {}), typography: s.id },
          ...(adj === 'experimental' ? { experimentation: clamp((cur?.experimentation ?? 40) + 25) } : {}),
        };
        return plan(sel, `the typography made more ${adj}: ${s.name}’s type, the rest as it was`, { keepFonts: false });
      }
    }
  }

  // "make this feel less like a tech startup"
  if (/\b(less|not|away from|un)\b[^.]*\b(tech|startup|start-up|saas|corporate|generic|template)\b/.test(words)) {
    const seen = [...TECH_LOOK, ...(cur ? [cur.primary] : [])];
    const pick = selectStyles({ words: ctx.words ?? '' }, { count: 1, seen, salt: `${doc.id}|untech`, customs }).find((c) => !TECH_LOOK.has(c.style.id))?.style ?? styleById('risograph', customs);
    if (!pick) return null;
    const sel: StyleSelection = {
      primary: pick.id,
      strength: 0,
      flat: true,
      ...(cur?.seedKey ? { seedKey: cur.seedKey } : {}),
      ...(cur?.customs ? { customs: cur.customs } : {}),
    };
    return plan(sel, `away from the tech-startup look: ${pick.name}, with its own type, surface and colour, and no glossy gradients`);
  }

  // texture, colour, ornament, imagery … from a named style: "introduce risograph texture", "Swiss colours"
  {
    const r = interpretStyle(words, { customs });
    const dims = Object.entries(r.dims) as [Dimension, string][];
    const asking = /\b(introduce|add|use|give|apply|bring|borrow|with|in)\b/.test(words);
    if (dims.length && asking && !/\b(less|reduce|remove|without)\b/.test(words)) {
      const sel = { ...base(), dims: { ...(base().dims ?? {}), ...r.dims } };
      if (!cur && r.primary && !dims.some(([d]) => d === 'composition')) sel.primary = r.primary;
      return plan(sel, dims.map(([d, id]) => `${nameOf(id, customs)} ${d}`).join(', '), {
        keepColours: keepColours && !r.dims.colour,
        keepFonts: keepFonts && !r.dims.typography,
      });
    }
  }

  // intensities: "more ornament", "less dense", "more experimental"
  {
    const up = /\bmore\b/.test(words);
    const down = /\b(less|fewer|reduce|tone down|calmer|quieter|simpler)\b/.test(words);
    const slider = /\bornament(ation|s)?|decorat(ed|ion|ive)\b/.test(words)
      ? 'ornament'
      : /\b(dense|density|busy|packed|sparse|airy)\b/.test(words)
        ? 'density'
        : /\b(experimental|wild|daring|unexpected|radical)\b/.test(words) && !styleIn(words, customs)
          ? 'experimentation'
          : null;
    if (slider && (up || down) && cur) {
      const now = effectiveDNA(cur, customs);
      const was = slider === 'ornament' ? now.ornament : slider === 'density' ? now.density : now.experimentation;
      const sparse = slider === 'density' && /\b(sparse|airy)\b/.test(words);
      const next = clamp(was + ((up && !sparse) || (down && sparse) ? 25 : -25));
      return plan({ ...cur, [slider]: next }, `${slider} ${next > was ? 'raised' : 'lowered'} from ${was} to ${next}`);
    }
  }

  // "reduce the brutalist influence", "less Art Deco", "tone down the Y2K"
  if (/\b(less|reduce|tone down|lower|weaken|fewer|remove|drop|lose|without)\b/.test(words)) {
    const s = (cur && inSelection(words, cur, customs)) || styleIn(words, customs);
    if (s && cur) {
      if (cur.tertiary === s.id) {
        const { tertiary: _t, ...rest } = cur;
        return plan(rest, `${s.name} removed as an influence`);
      }
      if (cur.secondary === s.id) {
        const strength = clamp(cur.strength - 25);
        if (strength <= 10 || /\b(remove|drop|lose|without)\b/.test(words)) {
          const { secondary: _s, ...rest } = cur;
          return plan(
            {
              ...rest,
              strength: 0,
              ...(cur.tertiary
                ? {
                    secondary: cur.tertiary,
                    strength: Math.round(cur.strength / 2),
                  }
                : {}),
            },
            `${s.name} removed as an influence`,
          );
        }
        return plan({ ...cur, strength }, `${s.name}’s influence lowered from ${cur.strength}% to ${strength}%`);
      }
      const dimsFrom = Object.entries(cur.dims ?? {})
        .filter(([, id]) => id === s.id)
        .map(([d]) => d);
      if (dimsFrom.length) {
        const dims = Object.fromEntries(Object.entries(cur.dims ?? {}).filter(([, id]) => id !== s.id));
        return plan({ ...cur, dims }, `${s.name}’s ${dimsFrom.join(' and ')} given back to ${nameOf(cur.primary, customs)}`);
      }
      if (cur.primary === s.id) {
        if (cur.secondary) return plan({ ...cur, primary: cur.secondary, secondary: s.id, strength: 35 }, `${nameOf(cur.secondary, customs)} now leads; ${s.name} kept as a 35% influence`);
        const now = effectiveDNA(cur, customs);
        return plan(
          {
            ...cur,
            ornament: clamp(now.ornament - 25),
            experimentation: clamp(now.experimentation - 25),
          },
          `${s.name} is the design’s own language: its ornament and experimentation lowered`,
        );
      }
    }
  }

  // "make this more Art Deco", "give it a vintage print aesthetic", "in the style of …", "more like Bauhaus"
  if (/\b(more|like|style of|aesthetic|feel|look|vibe|make (it|this)|give (it|this)|turn (it|this) into|restyle|in the style|inspired by)\b/.test(words)) {
    const s = styleIn(words, customs);
    if (!s) return null;
    const aesthetic = /\b(aesthetic|feel|vibe|touch|flavou?r)\b/.test(words) && !/\b(style of|turn (it|this) into|restyle)\b/.test(words);
    if (!cur) return plan({ primary: s.id, strength: 0 }, `in ${s.name}`);
    if (cur.primary === s.id) {
      const now = effectiveDNA(cur, customs);
      return plan(
        {
          ...cur,
          ornament: clamp(now.ornament + 15),
          experimentation: clamp(now.experimentation + 15),
          ...(cur.secondary ? { strength: clamp(cur.strength - 15) } : {}),
        },
        `more ${s.name}: its ornament and character raised${cur.secondary ? `, ${nameOf(cur.secondary, customs)} lowered` : ''}`,
      );
    }
    if (/\b(turn (it|this) into|restyle|style of|in the style)\b/.test(words))
      return plan(
        {
          primary: s.id,
          strength: 0,
          ...(cur.seedKey ? { seedKey: cur.seedKey } : {}),
          ...(cur.customs ? { customs: cur.customs } : {}),
        },
        `in ${s.name}`,
      );
    const strength = clamp((cur.secondary === s.id ? cur.strength : 0) + (aesthetic ? 60 : 30));
    if (strength >= 80 && !aesthetic) return plan({ ...cur, primary: s.id, secondary: cur.primary, strength: 40 }, `${s.name} now leads, ${nameOf(cur.primary, customs)} kept at 40%`);
    const sel: StyleSelection = {
      ...cur,
      secondary: s.id,
      strength,
      ...(cur.secondary && cur.secondary !== s.id ? { tertiary: cur.secondary } : {}),
      ...(aesthetic ? { dims: { ...(cur.dims ?? {}), texture: s.id } } : {}),
    };
    return plan(sel, aesthetic ? `a ${s.name} aesthetic: its surface, ornament and colour at ${strength}%` : `more ${s.name}: its influence at ${strength}%`);
  }
  return null;
}

/** Gradients made flat: each gradient fill (of shapes and of words) set to the colour it shows on the whole. */
export function flatOps(doc: GraphicDoc): Op[] {
  const ops: Op[] = [];
  const solid = (p: Paint): string => {
    if (typeof p === 'string') return p;
    if (p.type === 'mesh') return (p.mesh ?? ['#888888'])[Math.floor((p.mesh?.length ?? 1) / 2)].slice(0, 7);
    const xs = [0, 0.25, 0.5, 0.75, 1].map((t) => colorAt(p.stops, t));
    return xs.reduce((acc, c, i) => (i ? mixColor(acc, c, 1 / (i + 1)) : c)).slice(0, 7);
  };
  for (const ab of doc.artboards)
    for (const l of walk(ab)) {
      const n = l.node;
      if (isLocked(l)) continue;
      if (n.type === 'shape' && n.fill && typeof n.fill === 'object') ops.push({ op: 'update', id: n.id, set: { fill: solid(n.fill) } });
      else if (n.type === 'text' && n.fill && typeof n.fill === 'object')
        ops.push({
          op: 'update',
          id: n.id,
          set: { fill: undefined, color: solid(n.fill) },
        });
      const fx = (n.effects ?? []).filter((e) => e.kind !== 'gradient-overlay');
      if (n.effects && fx.length !== n.effects.length) ops.push({ op: 'update', id: n.id, set: { effects: fx } });
    }
  return ops;
}

/** The format an artboard was made in (its preset, else the preset of its size). */
export function formatOfBoard(b: Artboard) {
  return formatOf(b.format) ?? FORMATS.find((f) => f.width === b.width && f.height === b.height && f.unit === b.unit) ?? null;
}

/**
 * An artboard rebuilt in a language (see the head of this file): returns the new document and the direction it was
 * made in, or null when the artboard cannot be rebuilt (no words on it, no format to rebuild it in).
 */
export function restyleArtboard(
  doc: GraphicDoc,
  boardId: string,
  sel: StyleSelection,
  opts: {
    dir: GraphicDirection;
    kind?: GraphicKind;
    measure?: Measure;
    keepColours?: boolean;
    keepFonts?: boolean;
    customs?: readonly StyleDNA[];
    seed?: number;
  },
): { doc: GraphicDoc; direction: GraphicDirection; kept: number } | null {
  const board = doc.artboards.find((b) => b.id === boardId);
  if (!board) return null;
  const f = formatOfBoard(board);
  const read = contentOf(board);
  if (!f || !read.content.headline) return null;
  const keepColours = opts.keepColours || !!doc.locks?.colors;
  const keepFonts = opts.keepFonts || !!doc.locks?.fonts;
  const dir = styledDirection({ ...opts.dir, tokens: doc.tokens }, sel, {
    keepColours,
    keepFonts,
    customs: opts.customs,
  });
  const brief: GraphicBrief = {
    purpose: 'restyled',
    kind: opts.kind ?? (f.width / f.height > 2.2 ? 'banner' : 'poster'),
    formats: [f.id],
    content: read.content,
    mood: [],
    images: read.images,
  };
  const made = composeGraphic(brief, dir, {
    measure: opts.measure,
    seed: opts.seed ?? 7,
    assets: doc.assets,
    name: doc.name,
  });
  const fresh = made.doc.artboards[0];
  if (!fresh) return null;
  // what is locked stays exactly as it was, where it was in the order
  const locked = board.children.map((n, i) => ({ n, i })).filter(({ n }) => n.locked);
  const children: Node[] = [...fresh.children];
  for (const { n, i } of locked) children.splice(Math.min(i, children.length), 0, n);
  const nextBoard: Artboard = {
    ...board,
    background: fresh.background,
    children,
  };
  const next: GraphicDoc = {
    ...doc,
    tokens: dir.tokens,
    artboards: doc.artboards.map((b) => (b.id === boardId ? nextBoard : b)),
    style: dir.style,
    direction: { name: dir.name, language: dir.language },
    revision: doc.revision + 1,
    updatedAt: Date.now(),
  };
  // checked and repaired within bounds, as every composition is
  const refined = refineDoc(next, opts.measure);
  return { doc: refined.doc, direction: dir, kept: locked.length };
}

/** A selected text set in a language's type (object scope): its faces, case and tracking, its words untouched. */
export function typeOps(doc: GraphicDoc, nodes: readonly Node[], sel: StyleSelection, customs: readonly StyleDNA[] = []): Op[] {
  const dna = effectiveDNA(sel, customs).dna;
  const td = dna.typography.display;
  const ops: Op[] = [];
  for (const n of nodes) {
    if (n.type !== 'text' || n.locked) continue;
    const display = ['headline', 'logo'].includes(n.role ?? '') || (n as TextNode).size >= 40;
    const face = display ? td.faces[0] : dna.typography.body.faces[0];
    if (!face) continue;
    ops.push({
      op: 'update',
      id: n.id,
      set: {
        font: face,
        ...(display
          ? {
              case: td.case === 'upper' ? 'upper' : td.case === 'lower' ? 'lower' : 'none',
              tracking: td.tracking,
              lineHeight: td.lineHeight,
            }
          : { tracking: dna.typography.body.tracking }),
      },
    });
  }
  const tried = applyOps(doc, ops);
  return tried.ok ? ops : [];
}

/**
 * A quick sketch of an artboard in a language, for a preview card or a comparison: the same words and pictures,
 * composed in it, not checked or merged (the real change is restyleArtboard). Null when it cannot be composed.
 */
export function sketchInStyle(
  doc: GraphicDoc,
  boardId: string,
  sel: StyleSelection,
  opts: {
    dir: GraphicDirection;
    kind?: GraphicKind;
    measure?: Measure;
    customs?: readonly StyleDNA[];
    keepColours?: boolean;
    keepFonts?: boolean;
    seed?: number;
  },
): GraphicDoc | null {
  const board = doc.artboards.find((b) => b.id === boardId);
  if (!board) return null;
  const f = formatOfBoard(board);
  const read = contentOf(board);
  if (!f || !read.content.headline) return null;
  const dir = styledDirection({ ...opts.dir, tokens: doc.tokens }, sel, {
    keepColours: opts.keepColours || !!doc.locks?.colors,
    keepFonts: opts.keepFonts || !!doc.locks?.fonts,
    customs: opts.customs,
  });
  const brief: GraphicBrief = {
    purpose: 'a preview',
    kind: opts.kind ?? (f.width / f.height > 2.2 ? 'banner' : 'poster'),
    formats: [f.id],
    content: read.content,
    mood: [],
    images: read.images,
  };
  return composeGraphic(brief, dir, {
    measure: opts.measure,
    seed: opts.seed ?? 7,
    assets: doc.assets,
    name: doc.name,
  }).doc;
}
