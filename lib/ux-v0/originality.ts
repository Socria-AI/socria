// lib/ux-v0/originality.ts — the Originality Audit: is this design its own, and does it hold together?
//
// A design is read for the patterns generated pages fall into by habit — a centred hero, a bento grid of rounded
// cards, the SaaS template's order of sections, a purple gradient, frosted glass, the navigation every site has,
// a typeface nobody chose, decoration that means nothing — and for repetition of the designer's own earlier
// designs. None of these is wrong in itself: each is allowed when the brief, the designer's words, their
// decisions or the Creative DNA justify it, and the audit says what justified it. What nothing justifies is a
// finding, with one targeted change that answers it (a patch: a variant, a token, a look setting, a list of
// links drawn from the page's own sections) — applied as one version Undo takes back, never a regeneration.
//
// It is one pass of arithmetic over the spec (and the rendered page's audit, when there is one): no model is
// asked, nothing loops. It scores four things, each 0–100:
//
//   distinctiveness   how far the design stays out of the generic patterns and away from earlier projects
//   composition       hierarchy, rhythm, a section count that suits the density, consistent alignment
//   relevance         the task's components present and placed where the work needs them, a way onward
//   dna               how faithfully it keeps its Creative DNA (lib/ux-v0/dna.ts dnaConsistency)

import { hslOf } from './color';
import { dnaConsistency, dnaValues, type CreativeDNA } from './dna';
import type { PageAudit } from './evaluate';
import { knownFont } from './fonts';
import { intentOf, requiredComponents } from './intent';
import { kindDef, type DesignSpec, type Patch, type Section } from './spec';
import { tellsOf, type LookProfile } from './tells';
import { sequenceLike, signatureLike, signatureOf, type DesignSignature } from './signature';
export { sequenceLike, signatureLike, signatureOf, type DesignSignature } from './signature';
import type { DesignBrief } from './types';

export const PATTERNS = ['centred-hero', 'bento-grid', 'rounded-cards', 'saas-template', 'purple-gradient', 'glass', 'recycled-nav', 'generic-type', 'decoration', 'repetition'] as const;
export type Pattern = (typeof PATTERNS)[number];

export const PATTERN_LABEL: Record<Pattern, string> = {
  'centred-hero': 'A centred hero',
  'bento-grid': 'A bento grid',
  'rounded-cards': 'Rounded cards',
  'saas-template': 'The SaaS template',
  'purple-gradient': 'Purple and gradients',
  glass: 'Frosted glass',
  'recycled-nav': 'Recycled navigation',
  'generic-type': 'Generic typography',
  decoration: 'Decoration without meaning',
  repetition: 'Repeats an earlier design',
};

/** How much each pattern, unjustified, costs distinctiveness. */
const WEIGHT: Record<Pattern, number> = {
  'centred-hero': 10,
  'bento-grid': 14,
  'rounded-cards': 9,
  'saas-template': 14,
  'purple-gradient': 14,
  glass: 10,
  'recycled-nav': 8,
  'generic-type': 12,
  decoration: 8,
  repetition: 16,
};

export interface OriginalityFinding {
  pattern: Pattern;
  label: string;
  /** what was found, specifically */
  detail: string;
  /** allowed here, and why */
  justified: boolean;
  because?: string;
  /** the targeted change that answers it (none when there is nothing to change in code) */
  fix?: Patch[];
  fixLabel?: string;
  weight: number;
}

export interface OriginalityScores {
  distinctiveness: number;
  composition: number;
  relevance: number;
  dna: number;
}

export interface Originality {
  scores: OriginalityScores;
  overall: number;
  findings: OriginalityFinding[];
  /** the earlier designs this one resembles most */
  repeats: { project: string; name?: string; similarity: number; shared: string[] }[];
  signature: DesignSignature;
  /** what each score lost points for, plainly */
  notes: Record<keyof OriginalityScores, string[]>;
}

export interface OriginalityInput {
  spec: DesignSpec;
  brief: DesignBrief | null;
  dna?: CreativeDNA | null;
  /** the rendered page's audit at desktop width, when there is one */
  audit?: PageAudit | null;
  /** what the designer said: their notes, their words to the direction */
  words?: string;
  /** earlier designs' signatures (this browser's other projects) */
  past?: readonly DesignSignature[];
  /** groups locked in the art direction: never changed by a fix */
  locks?: readonly string[];
  project?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** The faces generated pages reach for when nobody chose: fine when chosen, generic by default. */
export const DEFAULT_FACES = ['Inter', 'Roboto', 'Open Sans', 'Poppins', 'Montserrat', 'Lato', 'Nunito', 'Raleway', 'Source Sans 3', 'Noto Sans', 'Helvetica', 'Arial', 'DM Sans', 'Plus Jakarta Sans', 'Manrope', 'Outfit'];

/** Navigation labels that could belong to any site. */
const STOCK_NAV = /^(home|features?|pricing|about( us)?|contact( us)?|blog|solutions?|resources?|products?|company|services?|team|careers|faq|docs|login|log in|sign in|get started)$/i;

/** The order a SaaS template lays a page out in. */
const SAAS = ['nav', 'hero', 'logos', 'features', 'stats', 'quote', 'pricing', 'faq', 'cta', 'footer'];

const wordsOf = (b: DesignBrief | null, extra = '') => ` ${[b?.objective, b?.visualDirection, b?.layoutDirection, (b?.personality ?? []).join(' '), (b?.rules ?? []).join(' '), (b?.functionalRequirements ?? []).join(' '), extra].filter(Boolean).join(' ').toLowerCase()} `;
const says = (w: string, re: RegExp) => re.test(w);

function profileOf(spec: DesignSpec): LookProfile {
  return { colors: { background: spec.tokens.colors.background, accent: spec.tokens.colors.accent }, fonts: { display: spec.tokens.fonts.display }, radius: spec.tokens.radius, look: { align: spec.look.align, grid: spec.look.grid, containers: spec.look.containers, rules: spec.look.rules, motifs: spec.look.motifs, accent2: spec.look.accent2 } };
}

/** The title a section goes by in a navigation: its own heading, short, else what kind of section it is. */
function navLabelOf(s: Section): string {
  const c = s.content as Record<string, unknown>;
  const raw = [c.eyebrow, c.title].find((x) => typeof x === 'string' && x.trim()) as string | undefined;
  const label = raw ? raw.replace(/[*_[\]]/g, '').split(/[.:—–!?]/)[0].trim() : kindDef(s.kind)?.label ?? s.kind;
  const words = label.split(/\s+/);
  return (words.length > 3 ? words.slice(0, 3).join(' ') : label).slice(0, 28);
}

/** The audit. One pass; nothing is asked of a model. */
export function auditOriginality(input: OriginalityInput): Originality {
  const { spec, brief, audit } = input;
  const dna = input.dna ?? null;
  const v = dnaValues(dna);
  const dnaOwn = (k: keyof typeof v) => !!dna?.dims[k] && (dna.dims[k]!.locked || dna.dims[k]!.source === 'designer');
  const w = wordsOf(brief, input.words ?? '');
  const locks = new Set(input.locks ?? []);
  const intent = brief ? intentOf(brief) : null;
  const kind = intent?.kind ?? 'site';
  const screen = !!intent?.screen;
  const saasBrief = says(w, /\b(saas|software|platform|startup|app for|subscription|api|developer tool|dashboard product|b2b)\b/);
  const findings: OriginalityFinding[] = [];
  const add = (f: Omit<OriginalityFinding, 'label' | 'weight'>) => findings.push({ ...f, label: PATTERN_LABEL[f.pattern], weight: WEIGHT[f.pattern] });
  const hero = spec.sections.find((s) => s.kind === 'hero');
  const hasImage = spec.sections.some((s) => s.images.length > 0);

  // 1 · a centred hero
  if (hero && (hero.variant === 'centered' || (spec.look.align === 'center' && hero.variant !== 'poster'))) {
    const decided = brief?.layout?.align === 'center';
    const asked = says(w, /\b(centred|centered|symmetr(y|ical)|monumental)\b/);
    const fix: Patch[] = [];
    if (!locks.has('layout')) {
      const to = v.composition >= 60 ? (hero.images.length ? 'poster' : 'statement') : hero.images.length ? 'split' : 'editorial';
      if (hero.variant === 'centered' && !hero.locked) fix.push({ op: 'variant', sectionId: hero.id, variant: to, summary: `Originality: the hero set ${to === 'split' ? 'beside its picture' : to}` });
      if (spec.look.align === 'center') fix.push({ op: 'look', look: { align: 'left' }, summary: 'Originality: set to one side' });
    }
    add({ pattern: 'centred-hero', detail: hero.variant === 'centered' ? (decided || asked ? 'The opening is centred.' : 'The opening is centred, the way most generated pages open.') : 'Everything is centred, the opening included.', justified: decided || asked, because: decided ? 'you decided a centred layout in the brief' : asked ? 'your words ask for it' : undefined, ...(fix.length ? { fix, fixLabel: 'Set the opening to one side' } : {}) });
  }

  // 2 · a bento grid: boxed cells in uneven sizes, rounded (a mosaic of pictures, a composed grid of spans)
  const rounded = spec.tokens.radius !== 'none';
  const cellGrid = spec.sections.find((s) => (s.kind === 'gallery' && s.variant === 'mosaic') || (s.kind === 'compose' && /"span"\s*:\s*[2-9]/.test(JSON.stringify(s.content))));
  if (cellGrid && spec.look.containers === 'cards' && rounded) {
    const asked = says(w, /\b(bento|tiles?|mosaic|cards?)\b/);
    const fix: Patch[] = [];
    if (!locks.has('surface')) fix.push({ op: 'look', look: { containers: v.density >= 60 ? 'ruled' : 'open' }, summary: 'Originality: the boxes taken off' });
    if (cellGrid.kind === 'features' && !cellGrid.locked && !locks.has('layout')) fix.push({ op: 'variant', sectionId: cellGrid.id, variant: v.typography >= 60 ? 'index' : v.composition <= 35 ? 'numbered' : 'columns', summary: 'Originality: the points set as a list of their own' });
    add({ pattern: 'bento-grid', detail: `${kindDef(cellGrid.kind)?.label ?? 'A section'} is a grid of rounded boxes in mixed sizes.`, justified: asked, because: asked ? 'your words ask for tiles' : undefined, ...(fix.length ? { fix, fixLabel: 'Take the boxes off' } : {}) });
  }

  // 3 · rounded cards everywhere
  const roundedBoxes = audit?.style.roundedBoxes ?? 0;
  if ((spec.look.containers === 'cards' && spec.tokens.radius === 'round') || roundedBoxes >= 6) {
    const decided = brief?.spec?.corners === 'round';
    const asked = says(w, /\b(rounded|round corners|soft|friendly|playful|bubbly)\b/);
    const dnaWants = dnaOwn('interaction') && v.interaction >= 65 && v.restraint >= 55;
    const fix: Patch[] = [];
    if (!locks.has('surface')) {
      fix.push({ op: 'tokens', tokens: { radius: 'soft' }, summary: 'Originality: quieter corners' });
      if (spec.look.containers === 'cards') fix.push({ op: 'look', look: { containers: v.density >= 60 ? 'ruled' : 'open' }, summary: 'Originality: open sections instead of cards' });
    }
    if (!findings.some((f) => f.pattern === 'bento-grid'))
      add({ pattern: 'rounded-cards', detail: roundedBoxes >= 6 ? `${roundedBoxes} rounded boxes on the rendered page.` : 'Every part sits in a rounded card.', justified: decided || asked || dnaWants, because: decided ? 'you set round corners in the brief' : asked ? 'your words ask for soft, rounded forms' : dnaWants ? 'your Creative DNA asks for a tactile, expressive interface' : undefined, ...(fix.length ? { fix, fixLabel: 'Open the sections' } : {}) });
  }

  // 4 · the SaaS template's order
  const kinds = spec.sections.map((s) => s.kind);
  // its signature is the grid of features (with icons) between a row of names and the pricing
  const saasLike = !screen && sequenceLike(kinds, SAAS) >= 0.62 && spec.sections.some((s) => s.kind === 'features' && s.variant === 'grid') && (kinds.includes('logos') || kinds.includes('pricing'));
  if (saasLike) {
    // a software product may want the familiar order — unless its Creative DNA asks for an experimental composition
    const justified = saasBrief && (!dna || v.composition <= 45);
    const fix: Patch[] = [];
    const features = spec.sections.find((s) => s.kind === 'features' && s.variant === 'grid' && !s.locked);
    if (features && !locks.has('layout')) fix.push({ op: 'variant', sectionId: features.id, variant: v.typography >= 60 ? 'index' : 'numbered', summary: 'Originality: the features set as a numbered list, not a grid of icons' });
    // proof in the subject's own words where the logos stood
    const logos = spec.sections.findIndex((s) => s.kind === 'logos');
    const quote = spec.sections.findIndex((s) => s.kind === 'quote');
    if (logos >= 0 && quote > logos + 1 && !spec.sections[quote].locked && !locks.has('layout')) fix.push({ op: 'move', sectionId: spec.sections[quote].id, to: logos, summary: 'Originality: a voice before the list of names' });
    add({ pattern: 'saas-template', detail: 'The sections follow the SaaS template: hero, names, a grid of features, proof, pricing, a closing call.', justified, because: justified ? 'a software product with a conventional, structured DNA: the familiar order serves it' : undefined, ...(fix.length ? { fix, fixLabel: 'Break the template' } : {}) });
  }

  // 5 · purple and gradients: the purple-to-blue tell, gradients on the rendered page, or the violet accent itself
  const [hue, sat] = hslOf(spec.tokens.colors.accent);
  const purple = hue >= 245 && hue <= 300 && sat >= 0.35;
  const tells = tellsOf(profileOf(spec));
  const gradients = audit?.style.gradients ?? 0;
  const gradientTell = tells.some((t) => t.tell === 'purple-blue-gradient') || (purple && gradients >= 2);
  if (gradientTell || purple) {
    const owned = brief?.decisions?.colour === 'locked' || brief?.decisions?.colour === 'approved' || !!brief?.system;
    const asked = says(w, /\b(purple|violet|gradient|lavender)\b/);
    const fix: Patch[] = [];
    if (!locks.has('palette') && !owned) {
      const accent2 = spec.look.accent2 ? { look: { accent2: '' } } : null;
      fix.push({ op: 'tokens', tokens: { colors: { accent: shiftOut(spec.tokens.colors.accent) } }, summary: 'Originality: an accent of its own' });
      if (accent2) fix.push({ op: 'look', ...accent2, summary: 'Originality: one ink, no gradient' });
    }
    add({ pattern: 'purple-gradient', detail: owned || asked ? (gradientTell ? 'A purple accent with gradients.' : 'A violet accent.') : gradientTell ? 'A purple accent run into gradients, the look generated pages default to.' : 'A violet accent, the colour generated pages default to.', justified: owned || asked, because: owned ? 'the palette is yours' : asked ? 'your words ask for it' : undefined, ...(fix.length ? { fix, fixLabel: 'Choose another accent' } : {}) });
    // the accent alone costs less than the gradient look
    if (!gradientTell) findings[findings.length - 1].weight = 8;
  }

  // 6 · frosted glass (the renderer never draws it: this is for imported designs)
  if ((audit?.style.blurs ?? 0) >= 1) {
    const asked = says(w, /\b(glass|frosted|translucent|blur)\b/);
    add({ pattern: 'glass', detail: `${audit!.style.blurs} frosted, blurred panel${audit!.style.blurs === 1 ? '' : 's'}.`, justified: asked, because: asked ? 'your words ask for glass' : undefined });
  }

  // 7 · recycled navigation: links any site could have, many pointing at nothing on this page
  const nav = spec.sections.find((s) => s.kind === 'nav');
  const links = Array.isArray((nav?.content as Record<string, unknown> | undefined)?.links) ? ((nav!.content as Record<string, unknown>).links as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const stock = links.filter((l) => STOCK_NAV.test(l.trim()));
  if (nav && links.length >= 3 && stock.length >= Math.max(3, Math.ceil(links.length * 0.6))) {
    const own = spec.sections.filter((s) => !['nav', 'hero', 'footer', 'cta', 'logos'].includes(s.kind)).map(navLabelOf).filter((x, i, a) => x && a.indexOf(x) === i).slice(0, Math.min(5, Math.max(3, links.length)));
    const fix: Patch[] = !nav.locked && !locks.has('voice') && own.length >= 2 ? [{ op: 'content', sectionId: nav.id, content: { links: own }, summary: 'Originality: the navigation names this page’s own parts' }] : [];
    add({ pattern: 'recycled-nav', detail: `The navigation reads “${links.join(', ')}”${saasBrief ? '.' : ', which could belong to any site.'}`, justified: saasBrief && stock.every((l) => /pricing|features|docs/i.test(l) ? kinds.some((k) => l.toLowerCase().startsWith(k.slice(0, 4))) : true), because: saasBrief ? 'a software product whose pages these are' : undefined, ...(fix.length ? { fix, fixLabel: `Name its own parts: ${own.join(', ')}` } : {}) });
  }

  // 8 · generic typography: a default face for headlines, the same for text, a flat scale
  const display = spec.tokens.fonts.display;
  const body = spec.tokens.fonts.body;
  if (DEFAULT_FACES.includes(display) && (DEFAULT_FACES.includes(body) || body === display) && spec.look.ratio < 1.34) {
    const owned = brief?.decisions?.typography === 'locked' || brief?.decisions?.typography === 'approved' || !!brief?.system || (!!brief?.typography.display && brief.typography.display === display);
    const functional = (kind === 'dashboard' || kind === 'data' || kind === 'app') && v.typography <= 30;
    const fix: Patch[] = [];
    if (!locks.has('type') && !owned) {
      const to = v.typography >= 55 ? 'Newsreader' : v.typography <= 30 ? 'IBM Plex Sans' : 'Instrument Sans';
      const face = knownFont(to) ? to : 'Archivo';
      fix.push({ op: 'tokens', tokens: { fonts: { display: face } }, summary: `Originality: ${face} for the headlines` });
      fix.push({ op: 'look', look: { ratio: Math.max(spec.look.ratio, v.typography >= 55 ? 1.42 : 1.33) }, summary: 'Originality: more contrast between headline and text' });
    }
    add({ pattern: 'generic-type', detail: `${display} for headlines and ${body} for text, on a flat ${spec.look.ratio.toFixed(2)} scale${owned || functional ? '.' : ': the type generated pages default to.'}`, justified: owned || functional, because: owned ? 'the type is yours' : functional ? 'a working interface with functional typography, as your Creative DNA says' : undefined, ...(fix.length ? { fix, fixLabel: 'Give the headlines a voice' } : {}) });
  }

  // 9 · decoration without meaning: shapes, emoji, icons as ornament
  const shapes = spec.look.motifs.includes('shapes') || spec.look.shapes.length > 0;
  const emoji = audit?.style.emoji ?? 0;
  const icons = audit?.style.icons ?? 0;
  if (shapes || emoji > 0 || icons >= 4) {
    // expressive by what the brief, the references or the designer said (not by a prior for the kind of work)
    const expressive = v.restraint >= 62 && !!dna?.dims.restraint && dna.dims.restraint.source !== 'kind';
    const asked = says(w, /\b(playful|illustrat|shapes?|geometric|ornament|decorat|icons?|emoji)\b/);
    const signature = /shape|circle|arch|blob|geometr/i.test(spec.notes.join(' '));
    const fix: Patch[] = [];
    if (shapes && !locks.has('motifs')) fix.push({ op: 'look', look: { motifs: spec.look.motifs.filter((m) => m !== 'shapes'), shapes: [] }, summary: 'Originality: ornament without a reason taken off' });
    add({ pattern: 'decoration', detail: [shapes ? 'decorative shapes' : '', emoji ? `${emoji} emoji` : '', icons >= 4 ? `${icons} icons used as ornament` : ''].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase()) + '.', justified: asked || expressive || signature, because: asked ? 'your words ask for it' : signature ? 'it is the direction’s signature' : expressive ? `your Creative DNA is expressive (${dnaOwn('restraint') ? 'as you set it' : 'read from your brief and references'})` : undefined, ...(fix.length ? { fix, fixLabel: 'Take the ornament off' } : {}) });
  }

  // 10 · repetition of the designer's earlier designs
  const sig = signatureOf(spec, input.project ?? '');
  const repeats = (input.past ?? [])
    .filter((p) => p.project !== sig.project)
    .map((p) => ({ project: p.project, ...(p.name ? { name: p.name } : {}), ...signatureLike(sig, p) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
  const twin = repeats[0];
  if (twin && twin.similarity >= 0.72) {
    const fix: Patch[] = [];
    if (!locks.has('layout')) {
      const other = (v.composition >= 55 ? ['asymmetric', 'poster', 'editorial'] : ['swiss', 'modular', 'editorial']).find((g) => g !== spec.look.grid && g !== (input.past ?? []).find((p) => p.project === twin.project)?.grid);
      if (other) fix.push({ op: 'look', look: { grid: other }, summary: `Originality: a ${other} grid, unlike your earlier design` });
    }
    add({ pattern: 'repetition', detail: `Shares ${twin.shared.join(', ')} with ${twin.name ? `“${twin.name}”` : 'an earlier design of yours'}.`, justified: false, ...(fix.length ? { fix, fixLabel: 'Move away from the earlier design' } : {}) });
  }

  // ── the scores ──
  const notes: Originality['notes'] = { distinctiveness: [], composition: [], relevance: [], dna: [] };
  const open = findings.filter((f) => !f.justified);
  let distinct = 100 - open.reduce((s, f) => s + f.weight, 0);
  for (const f of open) notes.distinctiveness.push(`${f.label} (−${f.weight})`);
  // a move of its own counts for it: a composed section, an experimental grid, a motif the direction chose
  const own = spec.sections.some((s) => s.kind === 'compose') || ['asymmetric', 'poster'].includes(spec.look.grid) || spec.look.motifs.some((m) => m !== 'captions');
  if (own) distinct += 4;
  const distinctiveness = clamp(distinct);

  // composition: hierarchy, rhythm, the count of sections, alignment
  let comp = 100;
  const cut = (n: number, why: string) => ((comp -= n), notes.composition.push(`${why} (−${n})`));
  if (spec.look.ratio < 1.22) cut(12, 'little contrast between headline and text');
  const h1 = audit?.headings.find((h) => h.level === 1);
  if (h1 && audit && h1.size < audit.bodySize * 2) cut(10, 'the main headline barely larger than the text');
  const tones = new Set(spec.sections.map((s) => s.tone));
  if (spec.sections.length >= 5 && tones.size <= 1 && spec.look.rhythm !== 'dramatic') cut(8, 'every section on the same ground, in the same rhythm');
  for (let i = 1; i < spec.sections.length; i++) if (spec.sections[i].kind === spec.sections[i - 1].kind && spec.sections[i].variant === spec.sections[i - 1].variant && spec.sections[i].kind !== 'compose') cut(6, `two ${kindDef(spec.sections[i].kind)?.label.toLowerCase() ?? 'like'} sections in a row, set the same way`);
  const n = spec.sections.length;
  if (!screen && v.density <= 30 && n > 9) cut(8, `${n} sections for an airy design`);
  if (!screen && v.density >= 70 && n < 5) cut(6, `${n} sections for a dense design`);
  if (audit && audit.style.blocks >= 8) {
    const share = audit.style.centred / audit.style.blocks;
    if (share > 0.25 && share < 0.75 && spec.look.align !== 'center') cut(6, 'centred and left-set text mixed');
  }
  if (audit && audit.overflowX > 2) cut(12, 'the page is wider than the screen');
  if (audit) {
    const long = audit.measure.filter((m) => m.cpl > 95).length;
    if (long) cut(Math.min(10, long * 4), 'lines too long to read comfortably');
  }
  const composition = clamp(comp);

  // relevance: what the task needs, present and placed; a way onward
  let rel = 100;
  const lose = (k: number, why: string) => ((rel -= k), notes.relevance.push(`${why} (−${k})`));
  const needs = intent ? requiredComponents(intent) : [];
  for (const c of needs) {
    const at = kinds.indexOf(c as string);
    if (at < 0) lose(30, `no ${c}, which the work needs`);
    else if (screen && at > 2) lose(10, `the ${c} comes too late for a screen whose task it is`);
  }
  if (!screen && !spec.sections.some((s) => s.kind === 'cta' || s.kind === 'booking' || s.kind === 'form' || (s.kind === 'hero' && typeof (s.content as Record<string, unknown>).primary === 'string' && (s.content as Record<string, string>).primary.trim()))) lose(15, 'no clear way onward (no call to action)');
  for (const b of audit?.behaviors ?? []) if (b.problems.length) lose(15, `the ${b.kind} does not work in place: ${b.problems[0]}`);
  const relevance = clamp(rel);

  const consistency = dnaConsistency(spec, dna);
  for (const g of consistency.gaps.filter((x) => Math.abs(x.delta) > 15).slice(0, 3)) notes.dna.push(`${g.key} ${g.actual} against ${g.target}${g.locked ? ' (locked)' : ''}`);
  const scores: OriginalityScores = { distinctiveness, composition, relevance, dna: consistency.score };
  const overall = clamp(0.35 * scores.distinctiveness + 0.25 * scores.composition + 0.25 * scores.relevance + 0.15 * scores.dna);
  return { scores, overall, findings, repeats, signature: sig, notes };
}

/** The targeted changes for what nothing justified, in one list (applied as one version). */
export function originalityFixes(o: Originality, only?: readonly Pattern[]): Patch[] {
  const out: Patch[] = [];
  for (const f of o.findings) if (!f.justified && f.fix && (!only || only.includes(f.pattern))) out.push(...f.fix);
  // one change per target: the first look, tokens and section change of each kind wins
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = `${p.op}:${p.sectionId ?? ''}:${Object.keys(p.look ?? p.tokens ?? p.content ?? {}).join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** An accent moved out of the purple band generated pages default to: toward blue-green or toward red, whichever is nearer. */
function shiftOut(hex: string): string {
  const [h, s, l] = hslOf(hex);
  const to = h < 272 ? 205 : 345;
  const sat = Math.min(0.7, Math.max(0.45, s));
  const f = (n: number) => {
    const k = (n + to / 30) % 12;
    const a = sat * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
