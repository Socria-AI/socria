// lib/ux-v0/scope.ts — what a change asked for in words may touch, and holding the change to it.
//
// "Make only the hero headline larger." "Replace the picture in the second section." "Reduce the motion without
// changing the layout." "Preserve everything except the typography." The words say a scope: which parts of the page
// (the selection, "the second section", "the navigation", "the hero"), which kinds of change (words, type, colour,
// layout, space, shape, pictures, motion, phone and tablet rules, the order of the parts), and what must not move.
// readScope() reads it; changesBetween() says what a change really did, by part and kind; confine() puts back
// everything the change did outside the scope, and says what it put back. A model's patch, a quick edit and an
// adjustment all pass through it: an edit that asked for one thing changes one thing.
//
// It reads only what it is sure of. Words it does not recognise widen nothing and narrow nothing.

import { composeSignature, type Piece } from './compose';
import type { DesignSpec, Section } from './spec';

export const AREAS = ['words', 'type', 'colour', 'layout', 'space', 'shape', 'images', 'motion', 'responsive', 'structure', 'site'] as const;
export type Area = (typeof AREAS)[number];

export const AREA_LABEL: Record<Area, string> = {
  words: 'the words',
  type: 'the typography',
  colour: 'the colours',
  layout: 'the layout',
  space: 'the spacing',
  shape: 'the shapes',
  images: 'the pictures',
  motion: 'the motion',
  responsive: 'the phone and tablet rules',
  structure: 'the order of the parts',
  site: 'the site settings',
};

export interface Scope {
  /** the words limit the change ("only", "just", "keep everything else", "except") */
  strict: boolean;
  /** the parts it may touch; empty: any */
  sections: string[];
  /** the kinds of change it may make; empty: any */
  areas: Area[];
  /** what it must not change ("without changing the layout") */
  keep: Area[];
  /** the scope said back, or '' when the words set none */
  said: string;
}

export interface Change {
  area: Area;
  /** the part it is in; none for the page-wide tokens and look */
  section?: string;
  /** what changed, for putting it back: a token, a look key, a section field */
  key: string;
}

const lower = (s: string) => s.toLowerCase().replace(/[’']/g, "'");

/** Words for each kind of change. */
const AREA_WORDS: readonly [Area, RegExp][] = [
  ['words', /\b(words?|text|copy|wording|headline says|rename|retitle|says?|reads?|phrase|tagline|caption|label)\b/],
  ['type', /\b(fonts?|typefaces?|typography|type|serif|sans|weight|bold(er)?|lighter weight|italics?|tracking|letter-?spacing|uppercase|capitals|headings? (size|scale)|larger|bigger|smaller)\b/],
  ['colour', /\b(colou?rs?|palette|accent|background colou?r|darker|lighter|warmer|cooler|tones?|hue|contrast)\b/],
  ['layout', /\b(layout|arrangement|composition|compose|columns?|grid|align(ment)?|position|order of|larger|bigger|smaller|scale|size)\b/],
  ['space', /\b(space|spacing|padding|gaps?|margins?|compact|tighter|tight|airy|breathing|denser|roomier)\b/],
  ['shape', /\b(shapes?|organic|angular|geometric|geometry|corners?|rounded|sharp|curves?|blobs?|polygons?|silhouettes?)\b/],
  ['images', /\b(images?|pictures?|photos?|photographs?|imagery|background image)\b/],
  ['motion', /\b(motion|animations?|animated|transitions?|parallax|movement|moving|scroll effects?|reveals?)\b/],
  ['responsive', /\b(mobile|phones?|tablets?|small screens?|on a phone|responsive)\b/],
  ['structure', /\b(add (a|an|another) (section|part)|remove (the|this) (section|part)|move (the|this) (section|part)|reorder)\b/],
];

/** Words for the parts of a page, and the kinds of section that answer them. */
const PART_WORDS: readonly [RegExp, readonly string[]][] = [
  [/\b(nav|navigation|menu bar|top bar|header|site menu|mobile menu)\b/, ['nav']],
  [/\b(hero|opening|banner|headline section|first screen)\b/, ['hero', 'compose']],
  [/\bfooter\b/, ['footer']],
  [/\b(gallery|lookbook|the work section)\b/, ['gallery']],
  [/\b(pricing|plans|prices)\b/, ['pricing']],
  [/\b(contact form|enquiry form|the form|form section)\b/, ['form']],
  [/\b(booking|reservations?)\b/, ['booking']],
  [/\b(faq|questions section)\b/, ['faq']],
  [/\b(quote|testimonial)\b/, ['quote']],
  [/\b(stats|numbers|figures)\b/, ['stats', 'stat-cards']],
  [/\b(features|feature section)\b/, ['features']],
  [/\b(call to action|cta band|cta)\b/, ['cta']],
  [/\b(the menu section|food menu|drinks menu|schedule|timetable)\b/, ['list']],
];

const ORDINALS: Record<string, number> = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, sixth: 6, '6th': 6, seventh: 7, '7th': 7 };

/** The scope of a change asked for in words (see the head of this file). */
export function readScope(words: string, spec: DesignSpec, selection?: { element?: { ux?: { section?: string; path?: string } | null } | null } | null): Scope {
  const n = lower(words || '');
  // what must not change: "without changing the layout", "keep the colours", "don't touch the type"
  const keep = new Set<Area>();
  for (const m of n.matchAll(/\b(?:without|don't|do not|never|no)\s+(?:chang\w*|touch\w*|mov\w*|affect\w*|alter\w*)\s+(?:the |its |any |my )?([a-z -]{3,30})/g)) {
    for (const [a, re] of AREA_WORDS) if (re.test(m[1])) keep.add(a);
  }
  for (const m of n.matchAll(/\b(?:keep|keeping|preserve|preserving|leave|leaving)\s+(?:the |its |my )?([a-z -]{3,24}?)(?:\s+(?:as it is|as is|the same|alone|intact|untouched|exactly))?(?=[,.;]|\s+(?:and|but|exactly|as|the same)\b|$)/g)) {
    if (/\b(everything|all|the rest|rest)\b/.test(m[1])) continue;
    for (const [a, re] of AREA_WORDS) if (re.test(m[1])) keep.add(a);
  }
  // "everything except the typography", "all but the colours": only that may change
  const except = n.match(/\b(?:everything|all|anything)\s+(?:except|but|apart from|other than)\s+(?:the |its )?([a-z -]{3,30})/);
  const strict = !!except || /\b(only|just)\b/.test(n) || /\b(everything else|nothing else|the rest)\b/.test(n) || /\bexactly (the same|as it is)\b/.test(n);

  // what it may change: the kinds the main clause names (not the clause saying what to keep)
  const main = n.split(/\b(?:without|keep(?:ing)?|preserv\w*|leave|don't|do not)\b/)[0];
  const areas = new Set<Area>();
  for (const [a, re] of AREA_WORDS) if (re.test(except ? except[1] : main)) areas.add(a);
  // a headline made larger is its size: the part's layout, not the page's typography
  if (/\b(headline|heading|title)\b/.test(main) && /\b(larger|bigger|smaller|size|scale)\b/.test(main)) {
    areas.delete('type');
    areas.add('layout');
  }
  for (const k of keep) areas.delete(k);

  // the parts: the selection, an ordinal, a part named
  const sections = new Set<string>();
  const content = spec.sections.filter((s) => s.kind !== 'nav');
  const sel = selection?.element?.ux?.section;
  if (sel && /\b(this|it|here|selected|the selection)\b/.test(main) && spec.sections.some((s) => s.id === sel)) sections.add(sel);
  for (const m of main.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh|1st|2nd|3rd|4th|5th|6th|7th|last)\s+(section|part|block)\b/g)) {
    const s = m[1] === 'last' ? content.filter((x) => x.kind !== 'footer').slice(-1)[0] : content[ORDINALS[m[1]] - 1];
    if (s) sections.add(s.id);
  }
  for (const [re, kinds] of PART_WORDS) {
    if (!re.test(main)) continue;
    const hit = kinds.map((k) => spec.sections.find((s) => s.kind === k)).find(Boolean);
    if (hit) sections.add(hit.id);
  }
  // a part named by its own title: "the “Method” section"
  for (const m of main.matchAll(/[“"']([^”"']{2,40})[”"']\s+(?:section|part)/g)) {
    const t = m[1].toLowerCase();
    const hit = spec.sections.find((s) => typeof s.content.title === 'string' && (s.content.title as string).toLowerCase().replace(/\*/g, '').includes(t));
    if (hit) sections.add(hit.id);
  }

  const parts = [...sections].map((id) => spec.sections.find((s) => s.id === id)).filter((s): s is Section => !!s);
  const said = [
    strict && (sections.size || areas.size) ? `only ${[areas.size ? [...areas].map((a) => AREA_LABEL[a]).join(' and ') : '', parts.length ? `in ${parts.map((s) => (typeof s.content.title === 'string' ? `“${(s.content.title as string).replace(/\*/g, '').slice(0, 30)}”` : `the ${s.kind}`)).join(', ')}` : ''].filter(Boolean).join(' ')}` : '',
    keep.size ? `keeping ${[...keep].map((a) => AREA_LABEL[a]).join(' and ')}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return { strict, sections: [...sections], areas: [...areas], keep: [...keep], said };
}

// ── what a change did ──

const TOKEN_AREA: Record<string, Area> = { fonts: 'type', colors: 'colour', scale: 'space', radius: 'shape', style: 'layout', imageTreatment: 'images' };
const LOOK_AREA: Record<string, Area> = {
  motion: 'motion',
  frame: 'shape', form: 'shape', edges: 'shape', shapes: 'shape', motifs: 'shape', buttons: 'shape',
  grid: 'layout', width: 'layout', rhythm: 'space', containers: 'layout', align: 'layout', rules: 'layout',
  case: 'type', tracking: 'type', weight: 'type', ratio: 'type', emphasis: 'type', label: 'type', mono: 'type', language: 'type',
  accent2: 'colour',
};
const J = (v: unknown) => JSON.stringify(v ?? null);

/** The words of a composed tree, its shape recipes, and its arrangement with both taken out. */
function readTree(root: unknown): { words: string; shapes: string; layout: string } {
  const words: string[] = [];
  const shapes: string[] = [];
  const strip = (p: any): any => {
    if (!p || typeof p !== 'object') return p;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) {
      if ((k === 'text' || k === 'label' || k === 'value' || k === 'items') && (typeof v === 'string' || Array.isArray(v))) {
        words.push(J(v));
        continue;
      }
      if (k === 'form' || k === 'mask') {
        shapes.push(J(v));
        continue;
      }
      out[k] = k === 'children' && Array.isArray(v) ? v.map(strip) : v;
    }
    return out;
  };
  const layout = J(strip(root));
  return { words: words.join('|'), shapes: shapes.join('|'), layout };
}

/** What changed between two versions, by part and kind. */
export function changesBetween(a: DesignSpec, b: DesignSpec): Change[] {
  const out: Change[] = [];
  for (const k of new Set([...Object.keys(a.tokens), ...Object.keys(b.tokens)])) if (J((a.tokens as any)[k]) !== J((b.tokens as any)[k])) out.push({ area: TOKEN_AREA[k] ?? 'layout', key: `tokens.${k}` });
  for (const k of new Set([...Object.keys(a.look ?? {}), ...Object.keys(b.look ?? {})])) if (J((a.look as any)?.[k]) !== J((b.look as any)?.[k])) out.push({ area: LOOK_AREA[k] ?? 'layout', key: `look.${k}` });
  if (J(a.site) !== J(b.site)) out.push({ area: 'site', key: 'site' });
  const aIds = a.sections.map((s) => s.id);
  const bIds = b.sections.map((s) => s.id);
  for (const id of bIds) if (!aIds.includes(id)) out.push({ area: 'structure', section: id, key: 'added' });
  for (const id of aIds) if (!bIds.includes(id)) out.push({ area: 'structure', section: id, key: 'removed' });
  const common = aIds.filter((id) => bIds.includes(id));
  if (J(common) !== J(bIds.filter((id) => aIds.includes(id)))) out.push({ area: 'structure', key: 'order' });
  for (const id of common) {
    const x = a.sections.find((s) => s.id === id)!;
    const y = b.sections.find((s) => s.id === id)!;
    if (x.kind !== y.kind) {
      out.push({ area: 'layout', section: id, key: 'kind' });
      continue;
    }
    if (x.kind === 'compose' && y.kind === 'compose') {
      const tx = readTree(x.content.root);
      const ty = readTree(y.content.root);
      if (tx.words !== ty.words) out.push({ area: 'words', section: id, key: 'content' });
      if (tx.shapes !== ty.shapes) out.push({ area: 'shape', section: id, key: 'content' });
      if (tx.layout !== ty.layout || composeSignature(x.content.root as Piece) !== composeSignature(y.content.root as Piece) && tx.words === ty.words && tx.shapes === ty.shapes) out.push({ area: 'layout', section: id, key: 'content' });
      const { root: _r1, ...xc } = x.content;
      const { root: _r2, ...yc } = y.content;
      if (J(xc) !== J(yc)) out.push({ area: 'layout', section: id, key: 'content' });
    } else if (J(x.content) !== J(y.content)) out.push({ area: 'words', section: id, key: 'content' });
    if (J(x.images) !== J(y.images)) out.push({ area: 'images', section: id, key: 'images' });
    if (x.variant !== y.variant) out.push({ area: 'layout', section: id, key: 'variant' });
    if (J(x.shape) !== J(y.shape)) out.push({ area: 'layout', section: id, key: 'shape' });
    if ((x.pad ?? '') !== (y.pad ?? '')) out.push({ area: 'space', section: id, key: 'pad' });
    if ((x.tone ?? '') !== (y.tone ?? '')) out.push({ area: 'colour', section: id, key: 'tone' });
    if (J(x.responsive) !== J(y.responsive)) out.push({ area: 'responsive', section: id, key: 'responsive' });
    if (!!x.story !== !!y.story) out.push({ area: 'motion', section: id, key: 'story' });
  }
  return out;
}

/** Whether a change is inside the scope. */
export function inScope(c: Change, scope: Scope): boolean {
  if (scope.keep.includes(c.area)) return false;
  if (!scope.strict) return true;
  // a part named: changes elsewhere, and page-wide changes, are outside it
  if (scope.sections.length && (!c.section || !scope.sections.includes(c.section))) return false;
  if (scope.areas.length && !scope.areas.includes(c.area)) return false;
  return true;
}

/**
 * The change held to the scope: everything it did outside the scope put back as it was (a token, a look key, a
 * part's field, a part added, removed or moved), what was put back said. A composed part whose words and arrangement
 * both changed, one of them outside the scope, is put back whole: it is never left half-changed.
 */
export function confine(before: DesignSpec, after: DesignSpec, scope: Scope): { spec: DesignSpec; back: Change[] } {
  if (!scope.strict && !scope.keep.length) return { spec: after, back: [] };
  const changes = changesBetween(before, after);
  const back = changes.filter((c) => !inScope(c, scope));
  if (!back.length) return { spec: after, back: [] };
  const tokens: Record<string, unknown> = { ...after.tokens };
  const look: Record<string, unknown> = { ...after.look };
  let site = after.site;
  for (const c of back) {
    if (c.key.startsWith('tokens.')) tokens[c.key.slice(7)] = (before.tokens as any)[c.key.slice(7)];
    else if (c.key.startsWith('look.')) look[c.key.slice(5)] = (before.look as any)?.[c.key.slice(5)];
    else if (c.key === 'site') site = before.site;
  }
  const structureBack = back.some((c) => c.area === 'structure');
  const base = structureBack ? before.sections : after.sections;
  const sections: Section[] = [];
  for (const s0 of base) {
    const was = before.sections.find((s) => s.id === s0.id);
    const now = after.sections.find((s) => s.id === s0.id);
    if (!now) {
      // removed outside the scope: back where it was
      if (structureBack && was) sections.push(was);
      continue;
    }
    if (!was) {
      sections.push(now);
      continue;
    }
    const mine = back.filter((c) => c.section === s0.id);
    if (!mine.length) {
      sections.push(now);
      continue;
    }
    const s: Section = { ...now };
    for (const c of mine) {
      if (c.key === 'kind') Object.assign(s, was);
      else if (c.key === 'content') s.content = was.content;
      else if (c.key === 'images') s.images = was.images;
      else if (c.key === 'variant') s.variant = was.variant;
      else if (c.key === 'shape') s.shape = was.shape;
      else if (c.key === 'pad') s.pad = was.pad;
      else if (c.key === 'tone') s.tone = was.tone;
      else if (c.key === 'responsive') s.responsive = was.responsive;
      else if (c.key === 'story') s.story = was.story;
    }
    sections.push(s);
  }
  // parts added outside the scope are not kept; the ones inside it stay where the change put them
  if (structureBack) {
    for (const [i, s] of after.sections.entries()) {
      if (before.sections.some((x) => x.id === s.id)) continue;
      const added = changes.find((c) => c.key === 'added' && c.section === s.id);
      if (added && inScope(added, scope)) sections.splice(Math.min(i, sections.length), 0, s);
    }
  }
  const { site: _drop, ...rest } = after;
  return { spec: { ...rest, tokens: tokens as unknown as DesignSpec['tokens'], look: look as unknown as DesignSpec['look'], sections, ...(site ? { site } : {}) }, back };
}

/** What was put back, said once per kind and part. */
export function describeBack(back: readonly Change[], spec: DesignSpec): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of back) {
    const s = c.section ? spec.sections.find((x) => x.id === c.section) : null;
    const where = s ? ` in ${typeof s.content.title === 'string' && s.content.title ? `“${(s.content.title as string).replace(/\*/g, '').slice(0, 30)}”` : `the ${s.kind}`}` : c.section ? '' : ' across the page';
    const k = `${c.area}${where}`;
    if (seen.has(k)) continue;
    seen.add(k);
    parts.push(`${AREA_LABEL[c.area]}${where}`);
  }
  return parts.join(', ');
}
