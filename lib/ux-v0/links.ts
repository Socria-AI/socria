// lib/ux-v0/links.ts — where every button and link on a generated page goes.
//
// A page whose buttons all go to "#" looks finished and is not. Each place a link is drawn (the navigation's links
// and its button, the brand, every button, a composed part's buttons and links, the footer's links) goes, in this
// order, to:
//
//   1. the destination the designer set for it (spec.site.links: a part of the page, an https address, mailto:, tel:);
//   2. the top of the page, for the brand;
//   3. the part of this page its words name: by that part's own words (its eyebrow or title), else by the kind of part
//      that answers them ("Book a table" → the booking, "See the work" → the gallery, "Get in touch" → the form);
//   4. nowhere yet: drawn with data-ux-unlinked, reported by the checks and listed in the export's README, never
//      passed off as working.
//
// A button never goes to the part it sits in. App screens are prototypes of a product, not websites: their
// controls are left as they are.

import type { Piece } from './compose';
import { kindDef, safeHref, type DesignSpec, type Section } from './spec';

export type LinkRole = 'nav' | 'brand' | 'button' | 'link' | 'footer';

/** One place on the page where a link is drawn, named the way the canvas names elements (section + data-ux-path). */
export interface LinkPlace {
  section: string;
  path: string;
  label: string;
  role: LinkRole;
}

export interface ResolvedLink extends LinkPlace {
  /** where it goes: "#s-…", "#top", an https / mailto: / tel: address, or "#" when nowhere yet */
  href: string;
  /** how the destination was found */
  by: 'set' | 'brand' | 'words' | 'none';
  /** the part of the page it goes to, when it goes to one */
  to?: string;
}

export interface Links {
  /** every place, resolved, in reading order */
  all: ResolvedLink[];
  /** by `${section}:${path}` */
  byKey: Map<string, ResolvedLink>;
  /** the parts of the page some link goes to: they are given an anchor */
  anchors: Set<string>;
  /** the places that go nowhere yet */
  unlinked: ResolvedLink[];
}

/** The anchor a part of the page is given when a link goes to it. */
export const anchorOf = (id: string): string => `s-${id}`;
export const linkKey = (section: string, path: string): string => `${section}:${path}`;

/** Words a link or button may say for a part of the page that does not use them itself. */
const KINDS_FOR: readonly [RegExp, readonly string[]][] = [
  [/\b(book|booking|reserve|reservations?|table|appointment|tickets?|visit|hours)\b/, ['booking', 'form', 'cta']],
  [/\b(contact|write|enquire|enquiries|enquiry|get in touch|hello|talk|demo|quote|consultation|email us|call us)\b/, ['form', 'cta', 'footer']],
  [/\b(work|works|projects?|portfolio|selected|case stud(y|ies)|index|archive|collection|gallery|lookbook|exhibitions?|catalogue)\b/, ['gallery', 'compose', 'features']],
  [/\b(shop|store|buy|order|products?|pricing|prices|plans?|membership|subscribe)\b/, ['pricing', 'configurator', 'gallery']],
  [/\b(menu|food|drinks|wine|dishes)\b/, ['list', 'pricing', 'text']],
  [/\b(studio|about|practice|who|story|us|the house|atelier|team|people|mission)\b/, ['split', 'text', 'quote', 'compose']],
  [/\b(journal|news|notes|writing|read|essays?|issue|stories)\b/, ['text', 'features', 'compose']],
  [/\b(schedule|programme|program|line-?up|events?|dates|timetable|calendar)\b/, ['list', 'table', 'features']],
  [/\b(questions|faq|help)\b/, ['faq']],
  [/\b(donate|give|support us|volunteer|join|apply|enrol|enroll|register|sign up)\b/, ['form', 'pricing', 'cta']],
  [/\b(how it works|features?|learn|discover|explore|method|process|approach|services?)\b/, ['features', 'split', 'compose']],
  [/\b(configure|customi[sz]e|build yours|choose yours)\b/, ['configurator', 'scene']],
  [/\b(see it in 3d|in 3d|turn it|look closer)\b/, ['scene', 'configurator']],
];

const textOf = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Every place a link is drawn on a website, in reading order. */
export function linkPlaces(spec: Pick<DesignSpec, 'sections' | 'pageType'>): LinkPlace[] {
  if (spec.pageType === 'app-screen') return [];
  const out: LinkPlace[] = [];
  const add = (section: string, path: string, label: unknown, role: LinkRole) => {
    const l = textOf(label).trim();
    if (l) out.push({ section, path, label: l, role });
  };
  for (const s of spec.sections) {
    const c = s.content as Record<string, any>;
    switch (s.kind) {
      case 'nav':
        add(s.id, 'brand', c.brand, 'brand');
        (Array.isArray(c.links) ? c.links : []).forEach((l: unknown, i: number) => add(s.id, `links.${i}`, l, 'nav'));
        add(s.id, 'cta', c.cta, 'button');
        break;
      case 'hero':
      case 'cta':
        add(s.id, 'primary', c.primary, 'button');
        add(s.id, 'secondary', c.secondary, 'button');
        break;
      case 'split':
        add(s.id, 'cta', c.cta, 'button');
        break;
      case 'scene':
        add(s.id, 'action', c.action, 'button');
        break;
      case 'pricing':
        (Array.isArray(c.plans) ? c.plans : []).forEach((p: any, i: number) => add(s.id, `plans.${i}.cta`, p?.cta, 'button'));
        break;
      case 'footer':
        (Array.isArray(c.columns) ? c.columns : []).forEach((col: any, i: number) => (Array.isArray(col?.links) ? col.links : []).forEach((l: unknown, j: number) => add(s.id, `columns.${i}.links.${j}`, l, 'footer')));
        break;
      case 'compose': {
        const walk = (p: Piece | undefined, path: string) => {
          if (!p || typeof p !== 'object') return;
          if (p.t === 'button') add(s.id, `${path}.label`, p.label, p.style === 'link' ? 'link' : 'button');
          if ('children' in p && Array.isArray(p.children)) p.children.forEach((ch, i) => walk(ch, `${path}.children.${i}`));
        };
        walk(c.root as Piece, 'root');
        break;
      }
    }
  }
  return out;
}

/** A composed part's own headings: the words of its title, eyebrow and heading pieces. */
export function composedHeadings(root: unknown): string[] {
  const out: string[] = [];
  const walk = (p: any) => {
    if (!p || typeof p !== 'object') return;
    if (p.t === 'text' && ['title', 'eyebrow', 'heading', 'display'].includes(p.role) && typeof p.text === 'string') out.push(p.text);
    if (Array.isArray(p.children)) p.children.forEach(walk);
  };
  walk(root);
  return out;
}

/** The words of a part of the page, to match a link's words against. */
const partWords = (s: Section): string =>
  [textOf(s.content.eyebrow), textOf(s.content.title), ...(s.kind === 'compose' ? composedHeadings(s.content.root) : []), kindDef(s.kind)?.label ?? ''].join(' ').replace(/\*/g, '').toLowerCase();

const STOP = new Set(['the', 'a', 'an', 'our', 'my', 'your', 'see', 'view', 'go', 'to', 'and', 'of', 'for', 'now', 'all', 'more', 'us', 'me', 'it', 'in', 'on', 'at', 'with', 'this', 'get', 'take', 'read']);

/** Where one place goes by its words: the part of the page that names them, else the kind that answers them. */
function byWords(label: string, from: string, parts: readonly Section[]): Section | null {
  const w = label.toLowerCase().replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!w) return null;
  const others = parts.filter((s) => s.id !== from && s.kind !== 'nav');
  const key = w.split(' ').find((x) => x.length > 2 && !STOP.has(x));
  if (key) {
    const re = new RegExp(`\\b${key.replace(/[-]/g, '\\-')}`);
    const own = others.find((s) => s.kind !== 'footer' && re.test(partWords(s)));
    if (own) return own;
  }
  for (const [re, kinds] of KINDS_FOR) {
    if (!re.test(w)) continue;
    for (const k of kinds) {
      const hit = others.find((s) => s.kind === k);
      if (hit) return hit;
    }
  }
  return null;
}

/** Where every link on the page goes (see the head of this file). */
export function resolveLinks(spec: Pick<DesignSpec, 'sections' | 'pageType' | 'site'>): Links {
  const set = spec.site?.links ?? {};
  const ids = new Set(spec.sections.map((s) => s.id));
  const anchors = new Set<string>();
  const all = linkPlaces(spec).map((p): ResolvedLink => {
    const chosen = safeHref(set[linkKey(p.section, p.path)]);
    if (chosen) {
      const to = chosen.startsWith('#s-') ? chosen.slice(3) : '';
      if (!to || ids.has(to)) {
        if (to) anchors.add(to);
        return { ...p, href: chosen, by: 'set', ...(to ? { to } : {}) };
      }
    }
    if (p.role === 'brand') return { ...p, href: '#top', by: 'brand' };
    const target = byWords(p.label, p.section, spec.sections);
    if (target) {
      anchors.add(target.id);
      return { ...p, href: `#${anchorOf(target.id)}`, by: 'words', to: target.id };
    }
    return { ...p, href: '#', by: 'none' };
  });
  return { all, byKey: new Map(all.map((l) => [linkKey(l.section, l.path), l])), anchors, unlinked: all.filter((l) => l.by === 'none') };
}

/** One place's destination said for the designer: "the booking (Book a table)", "https://…", "nowhere yet". */
export function describeLink(l: ResolvedLink, spec: Pick<DesignSpec, 'sections'>): string {
  if (l.by === 'none') return 'nowhere yet';
  if (l.href === '#top') return 'the top of the page';
  if (l.to) {
    const s = spec.sections.find((x) => x.id === l.to);
    const name = textOf(s?.content.title) || textOf(s?.content.eyebrow) || (s?.kind === 'compose' ? composedHeadings(s.content.root)[0] : '') || kindDef(s?.kind ?? '')?.label || l.to;
    return `the part “${name.replace(/\*/g, '').slice(0, 48)}”`;
  }
  return l.href.replace(/^mailto:/, 'email ').replace(/^tel:/, 'phone ');
}
