// lib/ux-v0/layout.ts — the layout: what the designer decided, and what SocriaUX varies.
//
// DECISIONS. Four choices shape a layout more than any other: what leads (the
// times, the work, a statement, a picture…), the arrangement (one column, side
// by side, uneven, layered), the alignment, and the part pictures play. Each is
// decided by the designer, or left open:
//   - in their own words ("asymmetric, the timetable first"), read here with
//     the words it was read from;
//   - by answering SocriaUX's one layout question, drawn as sketches;
//   - by setting it in the Living Brief, which is final.
// The space (spec.density) is decided in the brief as before.
//
// WHAT IS DECIDED IS HONOURED; WHAT IS OPEN VARIES. A decided value holds in
// every direction and every generation. An open one is chosen per project,
// within the direction's visual language (RANGES), so two projects with the
// same brief do not get the same layout, and three directions differ.
//
// DEFAULTS THAT DO NOT LOOK GENERATED. When something is open, the default
// never falls back on the habits of generated pages: a centred opening, a
// grid of icon cards, rounded cards for everything. A designer who decides
// one of them gets it; a language that uses one on purpose keeps it.

import { readIntent, requiredComponents, type DesignIntent, type Experience } from './intent';
import { kindDef, normalizeSection, normalizeShape, type DesignSpec, type SectionShape, type Section } from './spec';
import type { DiscoveryQuestion } from './types';

export const LEADS = ['task', 'subject', 'picture', 'words', 'work', 'text', 'figures', 'trend', 'detail', 'why'] as const;
export type Lead = (typeof LEADS)[number];
export const ARRANGEMENTS = ['single', 'split', 'asymmetric', 'layered'] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];
export const LAYOUT_ALIGNS = ['left', 'center'] as const;
export type LayoutAlign = (typeof LAYOUT_ALIGNS)[number];
export const PICTURE_ROLES = ['none', 'supporting', 'dominant'] as const;
export type PictureRole = (typeof PICTURE_ROLES)[number];
export const LAYOUT_KEYS = ['lead', 'arrangement', 'align', 'pictures'] as const;
export type LayoutKey = (typeof LAYOUT_KEYS)[number];

/** Every lead in a word or two, for a decision the current kind of work does not offer among its own answers. */
export const LEAD_LABEL: Record<Lead, string> = { task: 'The task', subject: 'What is being booked', picture: 'A picture', words: 'A statement', work: 'The work', text: 'The text', figures: 'The key figures', trend: 'The trend', detail: 'The detailed list', why: 'Why it is asked' };
export const LAYOUT_KEY_LABEL: Record<LayoutKey, string> = { lead: 'What comes first', arrangement: 'Arrangement', align: 'Alignment', pictures: 'Pictures' };
export const ARRANGEMENT_LABEL: Record<Arrangement, string> = { single: 'One column', split: 'Side by side', asymmetric: 'Uneven', layered: 'Layered' };
export const ALIGN_LABEL: Record<LayoutAlign, string> = { left: 'To one side', center: 'Centred' };
export const PICTURES_LABEL: Record<PictureRole, string> = { none: 'No pictures', supporting: 'Beside the words', dominant: 'Pictures lead' };

export interface LayoutSource {
  by: 'words' | 'answer' | 'designer';
  /** the words or the answer it was read from */
  said: string;
}

export interface LayoutDecisions {
  lead?: Lead;
  arrangement?: Arrangement;
  align?: LayoutAlign;
  pictures?: PictureRole;
  /** where each decision came from, said back to the designer */
  from?: Partial<Record<LayoutKey, LayoutSource>>;
  /** left to SocriaUX on purpose ("You decide") */
  delegated?: LayoutKey[];
}

const valid = <T extends string>(xs: readonly T[], v: unknown): v is T => typeof v === 'string' && (xs as readonly string[]).includes(v);

export function normalizeLayout(v: unknown): LayoutDecisions | undefined {
  const r = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  if (!r) return undefined;
  const out: LayoutDecisions = {};
  if (valid(LEADS, r.lead)) out.lead = r.lead;
  if (valid(ARRANGEMENTS, r.arrangement)) out.arrangement = r.arrangement;
  if (valid(LAYOUT_ALIGNS, r.align)) out.align = r.align;
  if (valid(PICTURE_ROLES, r.pictures)) out.pictures = r.pictures;
  const from: Partial<Record<LayoutKey, LayoutSource>> = {};
  const f = r.from && typeof r.from === 'object' ? (r.from as Record<string, any>) : {};
  for (const k of LAYOUT_KEYS) {
    const x = f[k];
    if (out[k] && x && ['words', 'answer', 'designer'].includes(x.by)) from[k] = { by: x.by, said: String(x.said ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) };
  }
  if (Object.keys(from).length) out.from = from;
  const delegated = (Array.isArray(r.delegated) ? r.delegated : []).filter((k): k is LayoutKey => valid(LAYOUT_KEYS, k) && !out[k as LayoutKey]);
  if (delegated.length) out.delegated = [...new Set(delegated)];
  return Object.keys(out).length ? out : undefined;
}

// ── reading the designer's words ─────────────────────────────────────

type Rule = { key: LayoutKey | 'density'; value: string; re: RegExp; say: string };
/** Negative phrasings first: "not centred" is a decision for one side, not for the centre. */
const RULES: readonly Rule[] = [
  { key: 'align', value: 'left', re: /\b(not|no|never|avoid)\s+(centred|centered|centre[- ]aligned|center[- ]aligned)\b/, say: 'not centred' },
  { key: 'pictures', value: 'none', re: /\bno (images|photos|photography|pictures|imagery)\b|\b(text|type)[- ]only\b|\bwithout (images|photos|pictures)\b/, say: 'no pictures' },
  { key: 'arrangement', value: 'asymmetric', re: /\basymmetr(ic|ical|y)\b|\boff[- ]?(centre|center)\b|\buneven\b/, say: 'asymmetric' },
  { key: 'arrangement', value: 'layered', re: /\blayered\b|\boverlap(ping|s)?\b|\bfull[- ]bleed\b|\btext over (the |a )?(image|picture|photo)/, say: 'layered' },
  { key: 'arrangement', value: 'split', re: /\bsplit (screen|layout)\b|\bside[- ]by[- ]side\b|\btwo[- ]column\b/, say: 'side by side' },
  { key: 'arrangement', value: 'single', re: /\b(one|single)[- ]column\b|\bstacked\b/, say: 'one column' },
  { key: 'align', value: 'center', re: /\b(centred|centered|centre[- ]aligned|center[- ]aligned|symmetric(al)?)\b/, say: 'centred' },
  { key: 'align', value: 'left', re: /\bleft[- ]aligned\b|\bflush left\b|\bragged right\b/, say: 'left-aligned' },
  { key: 'pictures', value: 'dominant', re: /\b(image|photo|photography|picture)[- ]led\b|\bbig (photos?|images?|pictures?|photography)\b/, say: 'pictures lead' },
  { key: 'lead', value: 'task', re: /\b(the )?(times|timetable|schedule|slots|availability|form|booking)\s+(first|up front|at the top)\b|\bstraight (in)?to the (times|booking|form)\b/, say: 'the task first' },
  { key: 'lead', value: 'work', re: /\b(the |my |our )?work (first|up front)\b|\blead with (the |my |our )?work\b/, say: 'the work first' },
  { key: 'lead', value: 'picture', re: /\b(a |the )?(picture|photo|image) (first|up front)\b|\blead with (a |the )?(picture|photo|image)\b/, say: 'a picture first' },
  { key: 'lead', value: 'words', re: /\b(big|bold|strong) (statement|headline)\b|\b(headline|statement) first\b|\blead with (a |the )?(statement|headline|words)\b/, say: 'a statement first' },
  { key: 'lead', value: 'figures', re: /\b(key )?(figures|numbers|metrics|kpis) (first|up front|at the top)\b/, say: 'the figures first' },
  { key: 'lead', value: 'trend', re: /\b(trend|chart|graph) (first|up front|at the top)\b/, say: 'the trend first' },
  { key: 'lead', value: 'detail', re: /\b(table|list|detail) (first|up front|at the top)\b/, say: 'the detail first' },
  { key: 'density', value: 'spacious', re: /\b(airy|spacious|generous (space|spacing|white ?space)|lots of (white ?)?space|breathing room)\b/, say: 'generous space' },
  { key: 'density', value: 'compact', re: /\b(dense|compact|tight|packed)\b/, say: 'dense' },
];

export interface LayoutReading {
  values: Partial<Pick<LayoutDecisions, LayoutKey>>;
  said: Partial<Record<LayoutKey, string>>;
  density?: 'compact' | 'spacious';
}

/** The layout decisions in the designer's own words, each with the phrase it was read from. */
export function readLayout(words: string): LayoutReading {
  const n = ` ${String(words ?? '').toLowerCase().replace(/\s+/g, ' ')} `;
  const out: LayoutReading = { values: {}, said: {} };
  for (const r of RULES) {
    if (r.key === 'density') {
      if (!out.density && r.re.test(n)) out.density = r.value as 'compact' | 'spacious';
      continue;
    }
    if (out.values[r.key] || !r.re.test(n)) continue;
    (out.values as Record<string, string>)[r.key] = r.value;
    out.said[r.key] = n.match(r.re)?.[0]?.trim() ?? r.say;
  }
  return out;
}

// ── what can lead, and the one layout question ───────────────────────

export const LAYOUT_QUESTION_ID = 'q_layout';

/** What can lead, for this kind of work, in words the designer reads. */
export function leadOptions(intent: Pick<DesignIntent, 'kind' | 'subject' | 'requirements'>): { value: Lead; label: string }[] {
  const subject = String(intent.subject ?? '').replace(/^(a|an|the)\s+/i, '');
  const needs = requiredComponents(intent as DesignIntent);
  switch (intent.kind as Experience) {
    case 'booking':
      return [
        { value: 'task', label: 'The times to choose from' },
        { value: 'subject', label: subject ? `The ${subject} itself` : 'What is being booked' },
        { value: 'picture', label: 'A picture of the place' },
      ];
    case 'dashboard':
    case 'data':
      return [
        { value: 'figures', label: 'The key figures' },
        { value: 'trend', label: 'The trend over time' },
        { value: 'detail', label: 'The detailed list' },
      ];
    case 'form':
    case 'checkout':
    case 'flow':
      return [
        { value: 'task', label: 'Just the form' },
        { value: 'why', label: 'Why it is asked, beside the form' },
      ];
    case 'portfolio':
      return [
        { value: 'work', label: 'The work itself' },
        { value: 'words', label: 'A statement about the work' },
        { value: 'picture', label: 'One big picture' },
      ];
    case 'editorial':
      return [
        { value: 'words', label: 'A big headline' },
        { value: 'picture', label: 'A picture' },
        { value: 'text', label: 'The first paragraph' },
      ];
    default:
      return [
        { value: 'words', label: 'Your words, as a strong statement' },
        { value: 'picture', label: 'A picture' },
        needs.includes('booking') ? { value: 'task', label: 'Booking a time' } : needs.includes('form') ? { value: 'task', label: 'The form' } : { value: 'work', label: 'What you make or do' },
      ];
  }
}

const QUESTION: Partial<Record<Experience, string>> = {
  booking: 'When someone opens this, what should they see first?',
  dashboard: 'When someone opens this, what matters most at a glance?',
  data: 'When someone opens this, what matters most at a glance?',
  form: 'Should people see why they are asked, or just the form?',
  checkout: 'Should people see why they are asked, or just the form?',
  flow: 'Should people see why they are asked, or just the form?',
  portfolio: 'What should someone see first: the work, or words about it?',
  editorial: 'What should open the story?',
};

/**
 * SocriaUX's one layout question, about priority rather than grids: what someone should see first. Asked
 * once, when the kind of work is known, and never when the designer's words already said it. Its options
 * are drawn as sketches (components/ux-v0/LayoutSketch.tsx); "You decide" leaves it open.
 */
export function layoutQuestion(words: string, questions: readonly DiscoveryQuestion[], now = Date.now()): DiscoveryQuestion | null {
  if (questions.some((q) => q.id === LAYOUT_QUESTION_ID)) return null;
  if (readLayout(words).values.lead) return null;
  const intent = readIntent(words);
  const options = leadOptions(intent);
  if (options.length < 2) return null;
  return {
    id: LAYOUT_QUESTION_ID,
    topic: 'hierarchy',
    question: QUESTION[intent.kind] ?? 'When someone opens this, what should they see first?',
    why: 'It decides how the layout is composed. Each answer is sketched with your own words.',
    options: options.map((o) => o.label),
    multi: false,
    answer: '',
    skipped: false,
    askedAt: now,
  };
}

/** The lead an answer to the layout question means: one of its options, or the answer's own words. */
export function leadFromAnswer(intent: Pick<DesignIntent, 'kind' | 'subject' | 'requirements'>, answer: string): Lead | null {
  const a = String(answer ?? '').trim().toLowerCase();
  if (!a) return null;
  const hit = leadOptions(intent).find((o) => o.label.toLowerCase() === a);
  return hit?.value ?? (readLayout(answer).values.lead ?? null);
}

/** What a sketch needs to know about the work: its kind, its subject in the designer's words, its task. */
export function sketchContext(intent: Pick<DesignIntent, 'kind' | 'subject' | 'requirements'>): { kind: Experience; subject: string; task: 'booking' | 'form' | null } {
  const needs = requiredComponents(intent as DesignIntent);
  return { kind: intent.kind as Experience, subject: String(intent.subject ?? '').replace(/^(a|an|the)\s+/i, ''), task: needs.includes('booking') ? 'booking' : needs.includes('form') ? 'form' : null };
}

/** The layout question's answers with what each means, to draw them (components/ux-v0/LayoutSketch.tsx). */
export function sketchOptions(words: string): ({ value: Lead; label: string } & ReturnType<typeof sketchContext>)[] {
  const intent = readIntent(words);
  const ctx = sketchContext(intent);
  return leadOptions(intent).map((o) => ({ ...o, ...ctx }));
}

/**
 * The layout decisions after the brief is written or rewritten, latest word last:
 *   1. what was read before (an earlier instruction, an answer) stays;
 *   2. the designer's words: the intent and their answers, for what they have not settled since;
 *   3. their answer to the layout question;
 *   4. what they set in the brief themselves (a value, or "SocriaUX decides");
 *   5. the instruction this rewrite was asked with, the newest words of all, which can change any of it.
 */
export function settleLayout(
  words: string,
  questions: readonly DiscoveryQuestion[],
  current: LayoutDecisions | null | undefined,
  intent: Pick<DesignIntent, 'kind' | 'subject' | 'requirements'>,
  instruction = ''
): LayoutDecisions | undefined {
  const out: Record<string, unknown> = {};
  const from: Partial<Record<LayoutKey, LayoutSource>> = {};
  const set = (k: LayoutKey, v: unknown, src: LayoutSource) => ((out[k] = v), (from[k] = src));
  const delegated = new Set<LayoutKey>(current?.delegated ?? []);
  const byDesigner = (k: LayoutKey) => current?.from?.[k]?.by === 'designer' && !!current?.[k];
  // 1. earlier readings
  for (const k of LAYOUT_KEYS) {
    const src = current?.from?.[k];
    if (src && src.by !== 'designer' && current?.[k]) set(k, current[k], src);
  }
  // 2. the words, where the designer has not decided since (a value or "SocriaUX decides" in the brief)
  const read = readLayout(words);
  for (const k of LAYOUT_KEYS) {
    const v = read.values[k];
    if (v && !delegated.has(k) && !byDesigner(k)) set(k, v, { by: 'words', said: read.said[k] ?? '' });
  }
  // 3. the answer to the layout question ("You decide" leaves what leads open)
  const q = questions.find((x) => x.id === LAYOUT_QUESTION_ID);
  if (q?.delegated && !out.lead && !byDesigner('lead')) delegated.add('lead');
  else if (q?.answer && !delegated.has('lead') && !byDesigner('lead')) {
    const lead = leadFromAnswer(intent, q.answer);
    if (lead) set('lead', lead, { by: 'answer', said: q.answer.slice(0, 120) });
  }
  // 4. the brief, where the designer set it
  for (const k of LAYOUT_KEYS) if (byDesigner(k)) set(k, current![k], current!.from![k]!);
  // 5. the newest words
  const told = readLayout(instruction);
  for (const k of LAYOUT_KEYS) {
    const v = told.values[k];
    if (v) set(k, v, { by: 'words', said: told.said[k] ?? '' }), delegated.delete(k);
  }
  for (const k of LAYOUT_KEYS) if (out[k]) delegated.delete(k);
  if (Object.keys(from).length) out.from = from;
  if (delegated.size) out.delegated = [...delegated];
  return normalizeLayout(out);
}

/** The decisions with one set by the designer (null: left to SocriaUX). */
export function decideLayout(d: LayoutDecisions | undefined, key: LayoutKey, value: string | null): LayoutDecisions | undefined {
  const out: LayoutDecisions = { ...(d ?? {}), from: { ...(d?.from ?? {}) } };
  if (value === null) {
    delete (out as Record<string, unknown>)[key];
    delete out.from![key];
    out.delegated = [...new Set([...(d?.delegated ?? []), key])];
  } else {
    (out as Record<string, unknown>)[key] = value;
    out.from![key] = { by: 'designer', said: '' };
    out.delegated = (d?.delegated ?? []).filter((k) => k !== key);
  }
  return normalizeLayout(out);
}

// ── which layouts each decision allows ───────────────────────────────

const BOOKING_FOR: Record<'lead' | 'arrangement' | 'pictures', Record<string, readonly string[]>> = {
  lead: { task: ['strip', 'calendar', 'list'], subject: ['split'], picture: ['immersive', 'split'] },
  arrangement: { single: ['strip', 'list'], split: ['split', 'calendar'], asymmetric: ['split', 'calendar'], layered: ['immersive', 'split'] },
  pictures: { none: ['strip', 'calendar', 'list', 'split'], supporting: ['strip', 'calendar', 'list', 'split'], dominant: ['immersive', 'split'] },
};

/** The booking compositions the decisions allow; a decision that cannot be met (a picture lead, no picture) does not empty the choice. */
export function bookingVariantsFor(d: LayoutDecisions | undefined, hasImage: boolean): string[] {
  let v = ['strip', 'calendar', 'list', 'split', 'immersive'].filter((x) => x !== 'immersive' || hasImage);
  for (const key of ['lead', 'arrangement', 'pictures'] as const) {
    const allow = d?.[key] ? BOOKING_FOR[key][d[key] as string] : null;
    if (!allow) continue;
    const next = v.filter((x) => allow.includes(x));
    if (next.length) v = next;
  }
  return v;
}

/**
 * Languages that use a habit of generated pages on purpose: theirs, not a default. None does now: the styles
 * that leaned on one (a centred, cream quiet luxury; round soft grounds and market stalls) were reworked off it
 * (lib/ux-v0/tells.ts). A designer who asks for one gets it.
 */
export const ON_PURPOSE: Record<string, readonly string[]> = {};

const HERO_FOR: Record<'lead' | 'arrangement' | 'pictures' | 'align', Record<string, readonly string[]>> = {
  lead: { words: ['statement', 'poster', 'editorial', 'centered'], picture: ['full-bleed', 'split'], work: ['statement', 'editorial', 'poster'], task: ['editorial', 'statement'], text: ['editorial', 'statement'] },
  arrangement: { single: ['statement', 'editorial', 'poster', 'centered'], split: ['split', 'editorial'], asymmetric: ['editorial', 'split'], layered: ['full-bleed', 'statement'] },
  pictures: { none: ['statement', 'editorial', 'poster', 'centered'], supporting: ['split', 'editorial', 'statement', 'poster'], dominant: ['full-bleed', 'split'] },
  align: { center: ['centered', 'statement', 'full-bleed', 'poster'], left: ['editorial', 'statement', 'split', 'full-bleed', 'poster'] },
};

/**
 * The openings the decisions allow. Nothing decided, the centred hero is not among them (the most common
 * opening there is) unless the language centres on purpose.
 */
export function heroVariantsFor(d: LayoutDecisions | undefined, hasImage: boolean, language = ''): string[] {
  const centred = d?.align === 'center' || (!d?.align && (ON_PURPOSE[language] ?? []).includes('centred'));
  let v = ['split', 'editorial', 'statement', 'poster', 'full-bleed', ...(centred ? ['centered'] : [])].filter((x) => hasImage || !['split', 'full-bleed'].includes(x));
  if (d?.pictures === 'none') v = v.filter((x) => !['split', 'full-bleed'].includes(x));
  for (const key of ['lead', 'arrangement', 'pictures', 'align'] as const) {
    const allow = d?.[key] ? HERO_FOR[key][d[key] as string] : null;
    if (!allow) continue;
    const next = v.filter((x) => allow.includes(x));
    if (next.length) v = next;
  }
  return v;
}

/** A screen's order of importance, when the designer decided what leads it. */
export function orderFor(lead: Lead | undefined): string[] | null {
  if (lead === 'figures') return ['stat-cards', 'chart', 'table'];
  if (lead === 'trend') return ['chart', 'stat-cards', 'table'];
  if (lead === 'detail') return ['table', 'stat-cards', 'chart'];
  return null;
}

/** What leads a page when the designer decided it: the kind of section that comes straight after the navigation. */
export function leadKindFor(d: LayoutDecisions | undefined, needs: readonly (string | undefined)[]): string | null {
  const task = needs.find((c) => c === 'booking' || c === 'form');
  if (d?.lead === 'work') return 'gallery';
  if (d?.lead === 'text') return 'text';
  if (d?.lead === 'task') return task ?? null;
  if (d?.lead === 'words' || d?.lead === 'picture') return 'hero';
  return null;
}

const CHROME_KINDS = new Set(['nav', 'app-nav', 'app-header']);
const PICTURE_KINDS = new Set(['hero', 'booking', 'split', 'cta']);
const FORM_KINDS = new Set(['form', 'checkout', 'flow']);
const LEAD_SAY: Partial<Record<Lead, string>> = { figures: 'the key figures', trend: 'the trend', detail: 'the detailed list' };

export interface HonourOptions {
  pageType: DesignSpec['pageType'];
  /** a task-first screen (a booking, a dashboard…) rather than a page */
  screen: boolean;
  /** the components the work must have (lib/ux-v0/intent.ts requiredComponents) */
  needs: readonly (string | undefined)[];
  /** the kind of work (lib/ux-v0/intent.ts Experience) */
  kind: string;
  language?: string;
  /** the direction's composition: its choice is kept wherever the decisions allow it */
  compose?: Record<string, string>;
}

/**
 * The designer's layout decisions, made true of a design in code, whatever a model or a direction drew: what
 * leads comes first; no pictures means none; an opening or a booking the decisions rule out becomes one they
 * allow (the direction's own choice when it is allowed); a form led by why it is asked sits beside it, led by
 * the form alone stands on its own; a decided alignment and arrangement hold in how the booking and the
 * opening are set. A section the designer fixed or locked is left as it is. Used when a design is fitted to
 * its intent (lib/ux-v0/fit.ts) and when a changed brief is applied to a design in place (lib/ux-v0/brief.ts).
 */
export function honourLayout(sections: readonly Section[], d: LayoutDecisions | undefined, o: HonourOptions): { sections: Section[]; changes: string[] } {
  let out = [...sections];
  const changes: string[] = [];
  if (!d) return { sections: out, changes };
  const afterChrome = () => {
    let i = 0;
    while (i < out.length && CHROME_KINDS.has(out[i].kind)) i++;
    return i;
  };
  // 1. what leads: a screen's order of importance; a page's first section
  const order = o.screen ? orderFor(d.lead) : null;
  if (order) {
    const at = afterChrome();
    const rest = out.slice(at);
    const first = rest.filter((s) => order.includes(s.kind));
    if (!first.some((s) => s.locked)) {
      const rank = (k: string) => order.indexOf(k);
      const next = [...out.slice(0, at), ...[...first].sort((a, b) => rank(a.kind) - rank(b.kind)), ...rest.filter((s) => !first.includes(s))];
      if (next.map((s) => s.id).join() !== out.map((s) => s.id).join()) {
        out = next;
        changes.push(`Put ${LEAD_SAY[d.lead!] ?? 'what you chose'} first, as you decided.`);
      }
    }
  } else if (!o.screen) {
    const leadKind = leadKindFor(d, o.needs);
    const at = leadKind ? out.findIndex((s) => s.kind === leadKind && !s.locked) : -1;
    const to = afterChrome();
    if (at > to) {
      const [lead] = out.splice(at, 1);
      out.splice(to, 0, lead);
      changes.push(`Opened with the ${kindDef(lead.kind)?.label.toLowerCase() ?? lead.kind}, as you decided.`);
    }
  }
  // 2. pictures, compositions, forms
  out = out.map((s) => {
    if (s.fixed || s.locked) return s;
    let next: Section = s;
    if (d.pictures === 'none' && s.images.length && PICTURE_KINDS.has(s.kind)) {
      next = normalizeSection({ ...next, images: [] }, o.pageType, null, new Set()) ?? next;
      if (next !== s) changes.push(`Took the pictures out of the ${kindDef(s.kind)?.label.toLowerCase() ?? s.kind}, as you decided.`);
    }
    const allowed = next.kind === 'hero' ? heroVariantsFor(d, next.images.length > 0, o.language) : next.kind === 'booking' ? bookingVariantsFor(d, next.images.length > 0) : null;
    if (allowed && !allowed.includes(next.variant)) {
      const want = o.compose?.[next.kind];
      const swapped = normalizeSection({ ...next, variant: want && allowed.includes(want) ? want : allowed[0] }, o.pageType, null, new Set());
      if (swapped) {
        next = swapped;
        changes.push(`Changed the ${next.kind === 'hero' ? 'opening' : 'booking'}’s composition to fit how you decided it is laid out.`);
      }
    }
    if (next.kind === 'form' && (d.lead === 'why' || d.lead === 'task') && FORM_KINDS.has(o.kind)) {
      const variant = d.lead === 'why' ? 'split' : 'stacked';
      if (next.variant !== variant) {
        next = { ...next, variant };
        changes.push(d.lead === 'why' ? 'Set why it is asked beside the form, as you decided.' : 'Let the form stand on its own, as you decided.');
      }
    }
    return next === s ? s : { ...next, id: s.id };
  });
  // 3. how the booking and the opening are set: a decided alignment, a decided arrangement's proportion
  for (const kind of ['booking', 'hero'] as const) {
    const at = out.findIndex((s) => s.kind === kind);
    const s = at >= 0 ? out[at] : null;
    if (!s || s.fixed || s.locked) continue;
    const want: SectionShape = { ...(s.shape ?? {}) };
    if (d.align) want.align = d.align;
    const r = typeof want.ratio === 'number' ? want.ratio : null;
    if (d.arrangement === 'asymmetric' && (r === null || (r > 0.38 && r < 0.56))) want.ratio = 0.34;
    if (d.arrangement === 'split' && (r === null || r < 0.45 || r > 0.55)) want.ratio = 0.5;
    const shape = normalizeShape(kind, want);
    const before = JSON.stringify(normalizeShape(kind, s.shape ?? {}) ?? {});
    if (shape && JSON.stringify(shape) !== before) {
      out[at] = { ...s, shape };
      if (d.align && s.shape?.align !== d.align && (SHAPE_ALIGN as Record<string, readonly string[]>)[kind].includes(s.variant)) changes.push(`Set the ${kind === 'hero' ? 'opening' : 'booking'} ${d.align === 'center' ? 'on the centre' : 'to one side'}, as you decided.`);
    }
  }
  return { sections: out, changes };
}

/** The variants whose alignment shows, so a note is only given when it changes what is seen. */
const SHAPE_ALIGN = { hero: ['editorial', 'statement'], booking: ['strip', 'calendar', 'list', 'split'] } as const;

// ── the settings each language varies within ─────────────────────────

interface Range {
  align: readonly LayoutAlign[];
  density: readonly ('airy' | 'even' | 'dense')[];
  times: readonly ('tiles' | 'rows' | 'pills')[];
  summary: readonly ('card' | 'inline' | 'bar')[];
  ratio: [number, number];
  measure: [number, number];
  scale: [number, number];
  valign: readonly ('top' | 'middle' | 'bottom')[];
}

/** Where each visual language sets things when the designer has not: ranges, so two Swiss designs differ but both read as Swiss. */
const RANGES: Record<string, Range> = {
  broadsheet: { align: ['left'], density: ['even', 'dense'], times: ['rows', 'tiles'], summary: ['inline', 'card'], ratio: [0.34, 0.44], measure: [0.62, 0.82], scale: [0.95, 1.1], valign: ['bottom', 'top'] },
  swiss: { align: ['left'], density: ['dense', 'even'], times: ['tiles', 'rows'], summary: ['inline', 'bar', 'card'], ratio: [0.3, 0.4], measure: [0.72, 0.98], scale: [1, 1.2], valign: ['top', 'bottom'] },
  'quiet-luxury': { align: ['center', 'left'], density: ['airy'], times: ['rows', 'pills'], summary: ['card', 'inline'], ratio: [0.44, 0.56], measure: [0.45, 0.62], scale: [0.85, 1], valign: ['middle', 'bottom'] },
  poster: { align: ['left'], density: ['dense', 'even'], times: ['tiles', 'pills', 'rows'], summary: ['bar', 'inline'], ratio: [0.34, 0.5], measure: [0.85, 1], scale: [1.1, 1.25], valign: ['bottom', 'top'] },
  craft: { align: ['left'], density: ['airy', 'even'], times: ['tiles', 'pills'], summary: ['card', 'inline'], ratio: [0.4, 0.52], measure: [0.6, 0.8], scale: [0.92, 1.08], valign: ['middle', 'bottom'] },
  geometric: { align: ['left'], density: ['even'], times: ['pills', 'tiles'], summary: ['bar', 'card'], ratio: [0.32, 0.5], measure: [0.65, 0.9], scale: [1, 1.18], valign: ['top', 'middle'] },
  utility: { align: ['left'], density: ['dense', 'even'], times: ['rows', 'tiles'], summary: ['bar', 'inline'], ratio: [0.3, 0.4], measure: [0.8, 1], scale: [0.88, 1], valign: ['top'] },
  gallery: { align: ['left'], density: ['airy', 'even'], times: ['rows', 'pills'], summary: ['inline', 'card'], ratio: [0.34, 0.46], measure: [0.5, 0.72], scale: [0.88, 1.05], valign: ['bottom', 'middle'] },
  organic: { align: ['center', 'left'], density: ['airy'], times: ['pills', 'tiles'], summary: ['card', 'inline'], ratio: [0.44, 0.58], measure: [0.5, 0.7], scale: [0.9, 1.05], valign: ['middle'] },
  civic: { align: ['left'], density: ['even'], times: ['rows', 'tiles'], summary: ['card', 'inline'], ratio: [0.38, 0.5], measure: [0.7, 0.9], scale: [0.9, 1.05], valign: ['top', 'middle'] },
  night: { align: ['left'], density: ['even', 'airy'], times: ['tiles', 'pills'], summary: ['bar', 'card'], ratio: [0.4, 0.6], measure: [0.6, 0.85], scale: [1, 1.2], valign: ['bottom', 'middle'] },
  'retro-print': { align: ['left'], density: ['dense', 'even'], times: ['pills', 'tiles'], summary: ['card', 'bar'], ratio: [0.36, 0.52], measure: [0.7, 0.95], scale: [1.05, 1.22], valign: ['top', 'bottom'] },
};
const ANY: Range = { align: ['left'], density: ['even', 'airy', 'dense'], times: ['tiles', 'rows', 'pills'], summary: ['card', 'inline', 'bar'], ratio: [0.34, 0.56], measure: [0.6, 0.9], scale: [0.95, 1.15], valign: ['top', 'middle', 'bottom'] };

/** A small seeded generator: the same project and direction always give the same settings. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashText(s: string): number {
  let h = 0x811c9dc5;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The settings for one section in one direction: decided values as decided, the rest drawn within the
 * language's ranges. The arrangement decides the proportion (even when side by side, uneven when uneven);
 * a booking led by what is booked keeps its card first.
 */
export function shapeFor(kind: 'booking' | 'hero', language: string, d: LayoutDecisions | undefined, density: string | undefined, r: () => number): SectionShape {
  const R = RANGES[language] ?? ANY;
  const pick = <T,>(xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(r() * xs.length))];
  const between = ([lo, hi]: [number, number]) => Math.round((lo + r() * (hi - lo)) * 100) / 100;
  const align: LayoutAlign = d?.align ?? pick(R.align);
  const ratioRange: [number, number] = d?.arrangement === 'asymmetric' ? (r() < 0.5 ? [0.3, 0.38] : [0.56, 0.62]) : d?.arrangement === 'split' ? [0.45, 0.55] : R.ratio;
  const side = r() < 0.5 ? 'start' : 'end';
  if (kind === 'booking') {
    const dens = density === 'compact' ? 'dense' : density === 'spacious' ? 'airy' : density === 'comfortable' ? 'even' : pick(R.density);
    let summary: string = pick(R.summary);
    if (d?.lead === 'subject') summary = 'card';
    if (d?.lead === 'task' && summary === 'card') summary = r() < 0.5 ? 'inline' : 'bar';
    return normalizeShape('booking', { side: d?.lead === 'subject' ? 'start' : side, times: pick(R.times), summary, ratio: between(ratioRange), density: dens, align })!;
  }
  return normalizeShape('hero', { align, side, valign: pick(R.valign), measure: between(R.measure), scale: between(R.scale), ratio: between(ratioRange) })!;
}

// ── defaults that do not look generated ──────────────────────────────

export interface Defaults {
  decisions?: LayoutDecisions;
  /** the direction's language, and whether the designer locked its surfaces */
  language?: string;
  surfaceLocked?: boolean;
  /** the corners the designer set in the brief, if any */
  corners?: string;
}

/**
 * The habits of generated pages, taken out where nobody chose them: a centred opening (one side instead),
 * a grid of icon cards (a numbered list or plain columns), rounded cards for everything (softer corners).
 * A section the designer fixed or locked is left as it is; a decision for one of them is honoured.
 */
export function avoidGeneric(spec: DesignSpec, o: Defaults = {}): { spec: DesignSpec; changes: string[] } {
  const changes: string[] = [];
  const lang = o.language ?? spec.look?.language ?? '';
  const chose = (habit: string) => (ON_PURPOSE[lang] ?? []).includes(habit);
  let sections: Section[] = spec.sections;
  const centredOk = o.decisions?.align === 'center' || chose('centred');
  sections = sections.map((s) => {
    if (s.fixed || s.locked) return s;
    if (s.kind === 'hero' && s.variant === 'centered' && !centredOk) {
      const next = normalizeSection({ ...s, variant: 'editorial', shape: { ...(s.shape ?? {}), align: 'left' } }, spec.pageType, null, new Set());
      if (next) {
        changes.push('Set the opening to one side: a centred hero is the most common opening there is.');
        return { ...next, id: s.id };
      }
    }
    if (s.kind === 'hero' && s.shape?.align === 'center' && !centredOk) return { ...s, shape: { ...s.shape, align: 'left' } };
    if (s.kind === 'features' && s.variant === 'grid' && spec.look?.motifs.includes('icons') && (s.content.items as any[])?.some((i: any) => i.icon)) {
      const next = normalizeSection({ ...s, variant: spec.look?.motifs.includes('numbering') ? 'numbered' : 'columns' }, spec.pageType, null, new Set());
      if (next) {
        changes.push('Set the points as a list, not a grid of icon cards.');
        return { ...next, id: s.id };
      }
    }
    return s;
  });
  let tokens = spec.tokens;
  if (spec.look?.containers === 'cards' && tokens.radius === 'round' && !chose('rounded') && o.corners !== 'round' && !o.surfaceLocked) {
    tokens = { ...tokens, radius: 'soft' };
    changes.push('Softened the corners: rounded cards for everything is a habit of generated pages.');
  }
  if (!changes.length && sections === spec.sections) return { spec, changes };
  return { spec: { ...spec, sections, tokens }, changes };
}

/** The decided layout, in one line for the generator. */
export function layoutBrief(d: LayoutDecisions | undefined, intent: Pick<DesignIntent, 'kind' | 'subject' | 'requirements'>): string {
  if (!d) return '';
  const parts: string[] = [];
  if (d.lead) parts.push(`what leads: ${leadOptions(intent).find((o) => o.value === d.lead)?.label.toLowerCase() ?? d.lead}`);
  if (d.arrangement) parts.push(`arrangement: ${ARRANGEMENT_LABEL[d.arrangement].toLowerCase()}`);
  if (d.align) parts.push(`alignment: ${d.align === 'center' ? 'centred' : 'to one side'}`);
  if (d.pictures) parts.push(`pictures: ${PICTURES_LABEL[d.pictures].toLowerCase()}`);
  return parts.length ? `THE DESIGNER'S LAYOUT DECISIONS (honour them; the rest of the layout is yours to vary): ${parts.join('; ')}.` : '';
}

/** A decision's value in the designer's words: the kind's own answer for what leads, else its label. */
export function layoutValueLabel(intent: Pick<DesignIntent, 'kind' | 'subject' | 'requirements'>, k: LayoutKey, v: string): string {
  if (k === 'lead') return leadOptions(intent).find((o) => o.value === v)?.label ?? LEAD_LABEL[v as Lead] ?? v;
  if (k === 'arrangement') return ARRANGEMENT_LABEL[v as Arrangement] ?? v;
  if (k === 'align') return ALIGN_LABEL[v as LayoutAlign] ?? v;
  return PICTURES_LABEL[v as PictureRole] ?? v;
}

/** Where each decision came from, and what is left open, in a sentence or two for the brief. */
export function layoutSaid(d: LayoutDecisions | undefined, intent: Pick<DesignIntent, 'kind' | 'subject' | 'requirements'>): string {
  const decided = LAYOUT_KEYS.filter((k) => d?.[k]).map((k) => {
    const what = `${LAYOUT_KEY_LABEL[k]}: ${layoutValueLabel(intent, k, d![k]!).toLowerCase()}`;
    const src = d!.from?.[k];
    return src?.by === 'words' ? `${what}, from your words${src.said ? ` (“${src.said}”)` : ''}` : src?.by === 'answer' ? `${what}, from your answer` : `${what}, as you set it`;
  });
  const open = LAYOUT_KEYS.filter((k) => !d?.[k]).map((k) => LAYOUT_KEY_LABEL[k].toLowerCase());
  const openLine = open.length ? `${open.join(', ').replace(/^./, (c) => c.toUpperCase())}: left open, so each direction sets ${open.length === 1 ? 'it' : 'them'} its own way, within its look.` : '';
  return [decided.length ? `${decided.join('. ')}.` : '', openLine].filter(Boolean).join(' ');
}

/** Two sets of decisions decide the same layout (where they came from aside). */
export function sameLayout(a: LayoutDecisions | undefined, b: LayoutDecisions | undefined): boolean {
  return LAYOUT_KEYS.every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));
}

/** Does this kind of section have a picture it could lose, for "no pictures"? */
export const PICTURED = (s: Section) => !!kindDef(s.kind) && s.images.length > 0 && ['hero', 'booking', 'split', 'cta'].includes(s.kind);
