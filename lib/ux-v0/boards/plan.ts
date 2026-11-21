// lib/ux-v0/boards/plan.ts — from a request to coordinated materials: what is asked for, what each material is for,
// which words it carries, and how it is composed in the shared system.
//
// "Three posters, two Instagram graphics, a website mockup and a product mockup" is read as counts and kinds
// (readBoardRequest). Each material then gets a purpose and a role (the hero poster carries everything; the next one
// leads with the details; a third with a second line of the campaign; a teaser with the name alone), its exact words
// taken from the brief for that role (never new ones), and a format. All are composed in ONE system: the same
// palette, faces, weights, type habits and shapes; what differs is the composition, chosen per material so siblings do
// not repeat one another (another archetype, another use of the same palette). A website concept is a real website
// specification built from the same words, through the website pipeline, in the system's direction.

import { composeGraphic, DARK_LANGS, GRID_LANGS, LOUD_LANGS, planFor, QUIET_LANGS, readGraphicBrief, type Archetype, type GraphicBrief, type GraphicContent, type GraphicKind, type Plan, type PlanOverride } from '../graphics/compose';
import { formatFromWords, formatOf } from '../graphics/formats';
import { refineDoc, type GFinding } from '../graphics/check';
import type { Asset, GraphicDoc } from '../graphics/doc';
import type { Emphasis } from '../graphics/generative/concept';
import type { Colouring, Org, TypeStrategy } from '../graphics/generative/principles';
import type { ConceptRecord } from '../graphics/generative/record';

const FREE_GRAPHICS = ['poster', 'social', 'ad', 'announcement', 'campaign', 'presentation'];
import type { Measure } from '../graphics/text';
import { bindingsOf, directionOfSystem, type Bindings, type MasterDesignSystem } from './system';
import { boardId, type BoardBrief, type GraphicMaterial, type Material, type MaterialRole, type MaterialSpec, type MockupMaterial, type MockupTemplate, type WebsiteMaterial } from './model';

// ── reading a request ──

const COUNT_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, several: 3, 'a few': 3, few: 3, 'a couple of': 2, 'a pair of': 2, couple: 2, pair: 2 };
const COUNT = '(\\d{1,2}|a couple of|a pair of|a few|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several)';
const ADJ = '(?:(?:more|other|different|coordinated|promotional|campaign|launch|matching|square|vertical|portrait|landscape|digital|printed|print|large|small|a4|a3|us letter|event|product|brand)\\s+)*';

/** The nouns, most specific first; a span read by one is not read again by a later one. */
const NOUNS: readonly [string, MaterialSpec['kind'], { format?: string; template?: MockupTemplate }][] = [
  ['(?:instagram|social(?: media)?) stor(?:y|ies)', 'social', { format: 'story' }],
  ['stor(?:y|ies)', 'social', { format: 'story' }],
  ['carousels?', 'carousel', {}],
  ['(?:product|packaging|box|pack|bottle|jar) (?:mockups?|visuals?|shots?|renders?|mock-ups?)', 'mockup', { template: 'box' }],
  ['(?:phone|device|mobile|app|screen) (?:mockups?|mock-ups?)', 'mockup', { template: 'phone' }],
  ['(?:poster|wall|in[- ]situ|framed) (?:mockups?|mock-ups?)', 'mockup', { template: 'poster-wall' }],
  ['laptop (?:mockups?|mock-ups?)', 'mockup', { template: 'laptop' }],
  ['billboards?(?: mockups?)?', 'mockup', { template: 'billboard' }],
  ['(?:websites?|web ?pages?|landing pages?|sites?)(?: (?:mockups?|mock-ups?|previews?|concepts?|designs?))?', 'website', {}],
  ['(?:instagram|social(?: media)?|linkedin|facebook) (?:graphics?|posts?|images?|tiles?|visuals?|squares?)', 'social', {}],
  ['social graphics?', 'social', {}],
  ['(?:web |digital |display )?banners?', 'banner', {}],
  ['(?:advertisements?|adverts?|ads)', 'ad', {}],
  ['(?:posters?|flyers?|leaflets?)', 'poster', {}],
  ['(?:magazine |editorial )covers?', 'magazine', {}],
  ['book covers?', 'book', {}],
  ['business cards?', 'card', {}],
  ['(?:packaging )?labels?', 'label', {}],
  ['infographics?', 'infographic', {}],
  ['(?:mockups?|mock-ups?)', 'mockup', { template: 'phone' }],
];

const countOf = (w: string | undefined, plural: boolean) => (w ? COUNT_WORDS[w] ?? (Number(w) || 1) : plural ? 2 : 1);

/** A board request read (see the head of this file): the materials, the campaign's words, where the system comes from. */
export function readBoardRequest(words: string): BoardBrief & { fromWebsite: boolean } {
  let rest = ` ${words.toLowerCase().replace(/[“”]/g, '"')} `;
  // quoted words are the campaign's own words, never materials
  rest = rest.replace(/"[^"]*"|‘[^’]*’/g, (m) => ' '.repeat(m.length));
  const specs: (MaterialSpec & { at: number })[] = [];
  for (const [noun, kind, extra] of NOUNS) {
    const re = new RegExp(`(?:\\b${COUNT}\\s+)?${ADJ}\\b(${noun})\\b`, 'g');
    rest = rest.replace(re, (m, count: string | undefined, phrase: string, at: number) => {
      const plural = /s$/.test(phrase.split(' ')[0]) || /(?:ies|s)\b/.test(phrase);
      const n = Math.max(1, Math.min(12, countOf(count, plural && !count)));
      const same = specs.find((s) => s.kind === kind && s.format === extra.format && s.template === extra.template);
      if (same) same.count = Math.min(12, same.count + n);
      else specs.push({ kind, count: n, ...extra, at });
      return ' '.repeat(m.length);
    });
  }
  // in the order the request names them
  specs.sort((p, q) => p.at - q.at);
  // "four campaign materials": a count with no kind gets a mix
  const generic = rest.match(new RegExp(`\\b${COUNT}\\s+${ADJ}(?:campaign |coordinated |different )*(?:materials|assets|pieces|deliverables|graphics|designs)\\b`));
  if (generic && !specs.length) {
    const n = Math.max(1, Math.min(12, countOf(generic[1], true)));
    const mix: MaterialSpec[] = [{ kind: 'poster', count: Math.ceil(n / 2) }, { kind: 'social', count: Math.max(0, Math.ceil((n - Math.ceil(n / 2)) / 2)) }, { kind: 'banner', count: Math.max(0, n - Math.ceil(n / 2) - Math.ceil((n - Math.ceil(n / 2)) / 2)) }];
    specs.push(...mix.filter((s) => s.count > 0).map((s, i) => ({ ...s, at: i })));
  }
  if (!specs.length) specs.push({ kind: 'poster', count: 2, at: 0 }, { kind: 'social', count: 2, at: 1 });
  // a printed size named for the posters
  const fmt = formatFromWords(words);
  for (const s of specs) if (s.kind === 'poster' && fmt && fmt.unit === 'pt' && !s.format) s.format = fmt.id;
  const g = readGraphicBrief(words, { kind: 'poster' });
  const fromWebsite = /\b(design system|identity|brand|look|style|direction|palette|typography)\b[^.]{0,40}\b(from|of|on|in|as)\b[^.]{0,20}\b(my|our|the) (existing |current |own )?(website|site)\b/i.test(words);
  return {
    purpose: words.trim().slice(0, 600),
    name: g.content.brand ?? g.content.headline,
    content: g.content,
    mood: g.mood,
    materials: specs.map(({ at, ...s }) => (void at, s)),
    images: [],
    annotate: !/\b(without|no) (notes|annotations)\b/i.test(words),
    fromWebsite,
  };
}

// ── planning the materials ──

const ROLE_ORDER: Partial<Record<GraphicKind, MaterialRole[]>> = {
  poster: ['hero', 'information', 'statement', 'teaser', 'action'],
  social: ['hero', 'action', 'statement', 'teaser'],
  ad: ['action', 'hero', 'statement'],
  banner: ['action', 'hero'],
};
const PURPOSE: Record<MaterialRole, string> = {
  hero: 'The campaign’s key visual: the name at full strength, with everything the brief says.',
  information: 'The facts first: when, where and what to do, the name kept in charge.',
  statement: 'A second line of the campaign carries this one; the name signs it off.',
  teaser: 'The name alone, for recognition before the details.',
  action: 'Built to be acted on: the call to action given the weight.',
  packaging: 'The artwork for the product itself: the name, the line and the details on the label.',
  support: 'Carries the campaign into another format.',
};
const KIND_NAME: Partial<Record<GraphicKind, string>> = { poster: 'Poster', social: 'Instagram post', ad: 'Advertisement', banner: 'Banner', magazine: 'Cover', book: 'Book cover', card: 'Business card', label: 'Product label', infographic: 'Infographic', carousel: 'Carousel', album: 'Album cover', announcement: 'Announcement', presentation: 'Slide' };

/** The words a material of a role carries: a subset of the brief's own words, never new ones. */
export function contentFor(role: MaterialRole, c: GraphicContent): GraphicContent {
  const brand = c.brand ? { brand: c.brand } : {};
  const pick = (keys: (keyof GraphicContent)[]) => Object.fromEntries(keys.filter((k) => c[k] !== undefined && (!Array.isArray(c[k]) || (c[k] as unknown[]).length)).map((k) => [k, c[k]])) as Partial<GraphicContent>;
  switch (role) {
    case 'hero':
      return { headline: c.headline, ...pick(['subhead', 'meta', 'cta', 'brand']) };
    case 'information':
      return { headline: c.headline, ...pick(['meta', 'cta', 'body', 'brand']) };
    case 'statement':
      // a second line of the campaign as the focal words; the campaign's name signs it off
      return c.items?.[0] ? { headline: c.items[0], brand: c.brand ?? c.headline, ...pick(['meta']) } : c.subhead ? { headline: c.subhead, brand: c.brand ?? c.headline } : { headline: c.headline, ...brand };
    case 'teaser':
      return { headline: c.headline, ...brand };
    case 'action':
      return { headline: c.headline, ...pick(['subhead', 'cta', 'brand']) };
    case 'packaging':
      return { headline: c.headline, ...pick(['subhead', 'brand', 'meta']) };
    default:
      return { headline: c.headline, ...pick(['subhead', 'cta', 'brand']) };
  }
}

const formatFor = (kind: GraphicKind, i: number, asked?: string): string => {
  if (asked && formatOf(asked)) return asked;
  switch (kind) {
    case 'poster':
      return 'a4';
    case 'social':
      return ['instagram-square', 'instagram-portrait', 'story'][i % 3];
    case 'ad':
      return ['instagram-portrait', 'rectangle-ad'][i % 2];
    case 'banner':
      return ['banner-wide', 'leaderboard'][i % 2];
    case 'magazine':
      return 'magazine';
    case 'book':
      return 'book';
    case 'card':
      return 'business-card';
    case 'label':
      return 'label';
    case 'album':
      return 'album';
    case 'presentation':
      return 'presentation';
    case 'announcement':
      return 'linkedin';
    default:
      return 'instagram-portrait';
  }
};

/**
 * The materials a brief asks for, planned and not yet composed: each with its purpose, role, exact words and format.
 * A product mockup presents a label, so a label is planned for it when the request names none; a phone mockup
 * presents the first social graphic, a wall the first poster, a billboard the first banner (or poster).
 */
export function planMaterials(brief: BoardBrief, opts: { websiteProject?: string } = {}): Material[] {
  const out: Material[] = [];
  const graphicSpecs = brief.materials.filter((s) => s.kind !== 'website' && s.kind !== 'mockup');
  const mockups = brief.materials.filter((s) => s.kind === 'mockup');
  const needsLabel = mockups.some((s) => s.template === 'box') && !graphicSpecs.some((s) => s.kind === 'label');
  const specs = needsLabel ? [...graphicSpecs, { kind: 'label' as GraphicKind, count: 1 }] : graphicSpecs;
  for (const s of specs) {
    const kind = s.kind as GraphicKind;
    for (let i = 0; i < s.count; i++) {
      const role: MaterialRole = kind === 'label' ? 'packaging' : ROLE_ORDER[kind]?.[i % (ROLE_ORDER[kind]?.length ?? 1)] ?? 'support';
      const format = formatFor(kind, i, s.format);
      const content = contentFor(role, brief.content);
      const gb: GraphicBrief = { purpose: brief.purpose, kind, formats: [format], content, mood: brief.mood, images: role === 'hero' || role === 'action' ? brief.images.slice(0, 1) : [] };
      // a story is named as one (“Instagram story 2”), counted apart from the posts
      const base = kind === 'social' && format === 'story' ? 'Instagram story' : KIND_NAME[kind] ?? 'Graphic';
      const sameKind = out.filter((m) => m.name.replace(/\s+\d+$/, '') === base).length;
      out.push({
        id: boardId('m'),
        type: 'graphic',
        name: `${base}${s.count > 1 || sameKind ? ` ${sameKind + 1}` : ''}`,
        purpose: PURPOSE[role],
        role,
        brief: gb,
        variant: 0,
        doc: null,
        bindings: { nodes: {}, boards: {} },
        status: 'planned',
        revision: 0,
      } satisfies GraphicMaterial);
    }
  }
  for (const s of brief.materials.filter((x) => x.kind === 'website').slice(0, 2)) {
    for (let i = 0; i < Math.min(2, s.count); i++)
      out.push({ id: boardId('m'), type: 'website', name: i ? 'Website, phone' : 'Website', purpose: 'The campaign’s website: a real website project in the same system, opened in the website editor.', projectId: opts.websiteProject ?? 'pending', view: i ? 'mobile' : 'desktop', created: !opts.websiteProject, status: 'planned', revision: 0 } satisfies WebsiteMaterial);
  }
  const graphics = out.filter((m): m is GraphicMaterial => m.type === 'graphic');
  const sourceFor = (t: MockupTemplate): GraphicMaterial | undefined =>
    t === 'box' ? graphics.find((m) => m.brief.kind === 'label') : t === 'phone' ? graphics.find((m) => m.brief.kind === 'social') ?? graphics[0] : t === 'billboard' ? graphics.find((m) => m.brief.kind === 'banner') ?? graphics.find((m) => m.brief.kind === 'poster') ?? graphics[0] : t === 'laptop' ? graphics.find((m) => m.brief.kind === 'banner' || m.brief.kind === 'presentation') ?? graphics[0] : graphics.find((m) => m.brief.kind === 'poster') ?? graphics[0];
  for (const s of mockups) {
    for (let i = 0; i < s.count; i++) {
      const t = s.template ?? 'phone';
      const src = sourceFor(t);
      out.push({ id: boardId('m'), type: 'mockup', name: `${t === 'box' ? 'Packaging' : t === 'poster-wall' ? 'Poster' : t === 'billboard' ? 'Billboard' : t === 'laptop' ? 'Laptop' : 'Phone'} mockup${s.count > 1 ? ` ${i + 1}` : ''}`, purpose: src ? `Shows ${src.name} in use; it follows ${src.name} whenever it changes.` : 'A mockup waiting for a design to present.', template: t, source: src ? { material: src.id, artboard: 0 } : null, status: 'planned', revision: 0 } satisfies MockupMaterial);
    }
  }
  return out;
}

// ── composing a graphic material in the system ──

/** The compositions siblings take in turn, by how the system's language composes (see compose.ts planFor). */
function sequenceFor(sys: MasterDesignSystem, hasImage: boolean): Archetype[] {
  const lang = sys.direction.language;
  const base: Archetype[] = LOUD_LANGS.includes(lang)
    ? ['type-poster', 'statement', 'swiss', 'minimal']
    : GRID_LANGS.includes(lang)
      ? ['swiss', 'type-poster', 'statement', 'minimal']
      : QUIET_LANGS.includes(lang)
        ? ['minimal', 'swiss', 'statement', 'type-poster']
        : DARK_LANGS.includes(lang)
          ? ['statement', 'type-poster', 'minimal', 'swiss']
          : ['statement', 'type-poster', 'swiss', 'minimal'];
  return hasImage ? [base[0], 'image-split', ...base.slice(1)] : base;
}

/**
 * The composition a material is asked to take (see the head of this file). The archetype turns among siblings of one
 * kind, starting from the planner's own choice; the use of the palette (the campaign's ground, the accent as the
 * ground, ink as the ground) turns across all the free-composing graphics of the board, starting from the planner's
 * own, so the hero keeps what the system would give it and the rest differ from it and from one another.
 */
export function overrideFor(m: GraphicMaterial, sibling: number, sys: MasterDesignSystem, natural: Plan, turn: number): PlanOverride | undefined {
  const free = ['poster', 'social', 'ad', 'announcement'].includes(m.brief.kind);
  const lang = sys.direction.language;
  const cycle: Plan['colour'][] = QUIET_LANGS.includes(lang) ? ['ground', 'accent-field'] : ['ground', 'accent-field', 'inverse'];
  const start = Math.max(0, cycle.indexOf(natural.colour));
  const colour = cycle[(start + turn + m.variant) % cycle.length];
  let archetype: Archetype | undefined;
  if (free) {
    const seq = sequenceFor(sys, m.brief.images.length > 0);
    const rotated = [natural.archetype, ...seq.filter((a) => a !== natural.archetype)];
    archetype = rotated[(sibling + m.variant) % rotated.length];
  }
  const out: PlanOverride = { ...(archetype && archetype !== natural.archetype ? { archetype } : {}), ...(free && colour !== natural.colour ? { colour } : {}) };
  return Object.keys(out).length ? out : undefined;
}

/** A material's turn in the board's use of the palette: its place among the free-composing graphics. */
export const paletteTurn = (materials: readonly Material[], m: GraphicMaterial) => materials.filter((x): x is GraphicMaterial => x.type === 'graphic' && ['poster', 'social', 'ad', 'announcement'].includes(x.brief.kind)).findIndex((x) => x.id === m.id);

export interface ComposedMaterial {
  doc: GraphicDoc;
  bindings: Bindings;
  plan: { archetype: string; colour: string; said: string[] };
  /** high findings the bounded repair could not fix: the material is not ready while there are any */
  left: GFinding[];
  placeholders: string[];
  fixed: string[];
}

/** One graphic material composed in the board's system, checked and repaired within bounds, its bindings recorded. */
/** A Board's free graphics each lead with something different (type, a picture, an abstract idea…), in turn. */
export function materialLead(m: GraphicMaterial, order: number): Emphasis {
  const leads: Emphasis[] = m.brief.images.length ? ['type', 'image', 'abstract', 'collage', 'geometric', 'organic'] : ['type', 'abstract', 'geometric', 'organic'];
  return leads[(order + m.variant) % leads.length];
}
const COLOURING_TURN: Colouring[] = ['figure-ground', 'field', 'inverse'];

export function composeMaterial(m: GraphicMaterial, sys: MasterDesignSystem, ctx: { measure?: Measure; assets?: readonly Asset[]; sibling?: number; order?: number; turn?: number; seed?: number; avoid?: readonly string[]; replay?: ConceptRecord['request'] & { keys?: Pick<ConceptRecord, 'org' | 'type' | 'colouring' | 'focal'> } } = {}): ComposedMaterial {
  const assets = (ctx.assets ?? []).filter((a) => m.brief.images.includes(a.id));
  const brief: GraphicBrief = { ...m.brief, images: m.brief.images.filter((id) => assets.some((a) => a.id === id)) };
  const f = formatOf(brief.formats[0]);
  // the board's one vocabulary: every material speaks it, each in its own composition
  const shared = sys.vocabulary ? { vocabulary: sys.vocabulary } : {};
  // a system in a design language: each material of the board (and each regeneration) takes the next of the style's
  // constructions, counted across the board's graphics (not per kind), so a poster, a post and a banner interpret one
  // DNA, not one layout resized; a style with fewer constructions than materials turns its palette as it comes round
  const styled = !!sys.style;
  const dirOf = directionOfSystem(sys);
  // the default engine: each material its own concept (its own lead, seed and use of the palette, away from its
  // siblings' structures), the system's identity shared; a replay keeps a material's composition through a change of
  // tokens or language
  const generative = dirOf.engine !== 'templates' && FREE_GRAPHICS.includes(m.brief.kind);
  let over: PlanOverride | undefined;
  if (generative) {
    const order = ctx.order ?? ctx.sibling ?? 0;
    const turn = ctx.turn ?? order;
    const replay = ctx.replay;
    over = {
      ...shared,
      generative: replay
        ? { seed: replay.seed, ...(replay.emphasis ? { emphasis: replay.emphasis as Emphasis } : {}), constraints: { ...(replay.keys ? { org: replay.keys.org as Org, type: replay.keys.type as TypeStrategy, colouring: replay.keys.colouring as Colouring, focal: replay.keys.focal } : {}) } }
        : { seed: `${m.id}|${m.variant}|${turn}`, emphasis: materialLead(m, order), avoidSignatures: [...(ctx.avoid ?? [])], constraints: { colouring: COLOURING_TURN[(turn + m.variant) % COLOURING_TURN.length] } },
    };
  } else {
    const natural = f && !styled ? planFor(brief, dirOf, f, { over: shared }) : null;
    const turned = natural ? overrideFor(m, ctx.sibling ?? 0, sys, natural, ctx.turn ?? Math.max(0, ctx.sibling ?? 0)) : undefined;
    over = styled ? { styleIndex: (ctx.order ?? ctx.sibling ?? 0) + m.variant } : turned || sys.vocabulary ? { ...(turned ?? {}), ...shared } : undefined;
  }
  const made = composeGraphic(brief, directionOfSystem(sys), { measure: ctx.measure, seed: (ctx.seed ?? 7) + m.variant * 13 + (ctx.sibling ?? 0) * 5, assets: [...assets], name: m.name, over });
  const refined = refineDoc(made.doc, ctx.measure);
  const plan = made.plans[0];
  return {
    doc: refined.doc,
    bindings: bindingsOf(refined.doc, sys),
    plan: { archetype: plan?.archetype ?? m.brief.kind, colour: plan?.colour ?? 'ground', said: plan?.said ?? [] },
    left: refined.remaining.filter((f) => f.severity === 'high'),
    placeholders: made.placeholders,
    fixed: refined.fixed,
  };
}

/** The index of a material among all the board's graphics: its turn through a design language's constructions. */
export const graphicIndex = (materials: readonly Material[], m: GraphicMaterial) => materials.filter((x): x is GraphicMaterial => x.type === 'graphic').findIndex((x) => x.id === m.id);

/** The index of a material among its siblings of the same kind (its turn in the sequence of compositions). */
export const siblingIndex = (materials: readonly Material[], m: GraphicMaterial) => materials.filter((x): x is GraphicMaterial => x.type === 'graphic' && x.brief.kind === m.brief.kind).findIndex((x) => x.id === m.id);

// ── a website concept from the same words ──

/**
 * The website concept as the website pipeline reads a generated answer (lib/ux-v0/design.ts parseGenerate): a nav,
 * an opening, the campaign's points, its text, a call to action, a footer — from the brief's words only. The
 * pipeline then holds it to the system's direction exactly as it holds a generated website.
 */
export function websiteAnswer(brief: BoardBrief, sys: MasterDesignSystem): { title: string; sections: Record<string, unknown>[] } {
  const c = brief.content;
  const brand = (c.brand ?? brief.name ?? c.headline).slice(0, 40);
  const lang = sys.direction.language;
  const hero = LOUD_LANGS.includes(lang) ? 'poster' : QUIET_LANGS.includes(lang) ? 'editorial' : 'statement';
  const sections: Record<string, unknown>[] = [
    { id: 'nav', kind: 'nav', variant: 'inline', content: { brand, links: [], ...(c.cta ? { cta: c.cta.slice(0, 30) } : {}) }, images: [] },
    { id: 'hero', kind: 'hero', variant: hero, content: { title: c.headline.slice(0, 120), ...(c.subhead ? { subtitle: c.subhead.slice(0, 320) } : {}), ...(c.cta ? { primary: c.cta.slice(0, 30) } : {}), ...(c.meta?.length ? { note: c.meta.join(' · ').slice(0, 140) } : {}) }, images: [] },
  ];
  if (c.items && c.items.length >= 2) sections.push({ id: 'points', kind: 'features', variant: 'numbered', content: { items: c.items.slice(0, 6).map((t) => ({ title: t.slice(0, 60) })) }, images: [] });
  if (c.body) sections.push({ id: 'about', kind: 'text', variant: 'lead', content: { paragraphs: [c.body.slice(0, 900)] }, images: [] });
  if (c.cta) sections.push({ id: 'act', kind: 'cta', variant: 'statement', content: { title: c.headline.slice(0, 120), primary: c.cta.slice(0, 30) }, images: [] });
  sections.push({ id: 'foot', kind: 'footer', variant: 'simple', content: { brand, ...(c.meta?.length ? { tagline: c.meta.join(' · ').slice(0, 160) } : {}) }, images: [] });
  return { title: brand, sections };
}
