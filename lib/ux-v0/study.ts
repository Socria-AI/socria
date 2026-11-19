// lib/ux-v0/study.ts — what a direction will look like, drawn before anything is generated.
//
// Each direction on the Direction board shows a study: a short design in that
// direction, drawn by the renderer the real design will use. It used to be the
// same landing page for every brief ("Begin", "Read more", the brand name as
// an oversized headline): a booking screen was presented as a website about
// the brand. A study now shows WHAT IS BEING MADE (lib/ux-v0/intent.ts), in
// the direction's own composition: a booking screen's study is the booking
// itself (as a calendar, a list, a split…), a dashboard's is figures over a
// table, a form's is the form; a site's opens with the brief's own words and
// actions, never generic ones. Sample content is bracketed or labelled.

import type { ArtDirection } from './direction';
import { fitToIntent, sampleFor } from './fit';
import { composedOpening } from './compose';
import { hashText, seeded } from './layout';
import { intentOf, pageTypeFor, requiredComponents } from './intent';
import { normalizeSpec, type DesignSpec } from './spec';
import type { DesignBrief, MoodboardRef } from './types';

/** The brief's own words for its main action, short, or an honest placeholder. */
export function primaryAction(brief: Pick<DesignBrief, 'userGoals' | 'functionalRequirements'>, intent = intentOf(brief as any)): string {
  if (intent.requirements.some((r) => r.component === 'booking')) return `Book ${intent.subject ? `a ${intent.subject.split(' ').pop()}` : 'a time'}`;
  if (intent.requirements.some((r) => r.id === 'req-donate')) return 'Give a donation';
  if (intent.kind === 'portfolio') return 'See the work';
  if (intent.kind === 'editorial') return 'Start reading';
  const goal = [...(brief.userGoals ?? []), ...(brief.functionalRequirements ?? [])].map((g) => g.replace(/[.;:].*$/, '').trim()).find((g) => g.length > 2 && g.length <= 28);
  return goal ? goal.charAt(0).toUpperCase() + goal.slice(1) : '[Primary action]';
}

/**
 * A study's headline from the brief's objective: its first clause, without "a website for", cut at a word
 * (never mid-word) — a sketch of the opening, for the generated copy to replace.
 */
export function studyHeadline(objective: string, name: string): string {
  const first = String(objective ?? '').split(/[.;:—–]|,\s/)[0].replace(/\s+/g, ' ').trim();
  let t = first.replace(/^(an?|the)\s+(website|site|web ?page|landing page|homepage)\s+(for|about)\s+/i, '');
  if (t.length > 64) t = t.slice(0, 64).replace(/\s+\S*$/, '');
  t = t.replace(/[\s,;:–—-]+$/, '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : name;
}

/** A short design in this direction, of the thing being made. */
export function studySpec(d: ArtDirection, brief: DesignBrief, name: string, refs: readonly MoodboardRef[]): DesignSpec | null {
  const intent = intentOf(brief);
  const pageType = pageTypeFor(intent, brief.pageType);
  // only a picture marked for the page appears in the page; references only inspire
  const usable = refs.filter((r) => r.state !== 'rejected' && r.media !== 'video' && !r.avoid && r.asContent !== false && (r.provider !== 'upload' || r.asContent === true) && r.url);
  const imgs = usable.slice(0, 4).map((r) => r.id);
  const img = imgs.slice(0, 1);
  const board = { refs: [...refs], queries: [], palettes: [], type: [] } as any;
  let sections: unknown[];
  if (intent.screen) {
    // the screen itself: its required components, in this direction's composition and order, with sample content
    const head = intent.kind === 'dashboard' || intent.kind === 'data' || intent.kind === 'app' ? [{ id: 'head', kind: 'app-header', content: { title: name, subtitle: intent.task, actions: [] } }] : [];
    const kinds = requiredComponents(intent).filter((c): c is NonNullable<typeof c> => !!c) as string[];
    // a trend the direction leads with is drawn, so its hierarchy shows
    if ((intent.kind === 'dashboard' || intent.kind === 'data') && d.order?.includes('chart') && !kinds.includes('chart')) kinds.push('chart');
    const rank = (k: string) => (d.order?.includes(k) ? d.order.indexOf(k) : 50);
    // the detail only this subject has (the direction's plan), shown where it belongs, bracketed until it is real
    const detail = d.designPlan?.detail.terms.length ? d.designPlan.detail.text : '';
    const own = (c: string, content: Record<string, unknown> | null) => (c === 'booking' && content && detail && !content.intro ? { ...content, intro: `[${detail.charAt(0).toUpperCase()}${detail.slice(1)}]` } : content);
    const parts = [...kinds].sort((a, b) => rank(a) - rank(b)).map((c) => ({ id: c, kind: c, variant: d.compose?.[c] || undefined, images: c === 'booking' && d.compose?.booking === 'immersive' ? img : [], content: own(c, sampleFor(c, intent, brief)) }));
    sections = [...head, ...parts];
    if (!sections.length) sections = [{ id: 'head', kind: 'app-header', content: { title: name, subtitle: intent.task, actions: [] } }];
  } else {
    const action = primaryAction(brief, intent);
    const goals = brief.userGoals.slice(0, 3);
    const hero = {
      id: 'hero', kind: 'hero', variant: d.compose?.hero ?? (img.length ? 'split' : 'statement'), images: img, tone: 'base', pad: 'm',
      content: { eyebrow: brief.personality.slice(0, 3).join(' · '), title: studyHeadline(brief.objective, name), subtitle: intent.task, primary: action },
    };
    // the part the direction's plan puts next to (or before) the opening: the work, the text, or the goals
    const second =
      (d.lead === 'gallery' || d.compose?.gallery) && imgs.length >= 2
        ? { id: 'work', kind: 'gallery', variant: d.compose?.gallery ?? 'grid', images: imgs, content: { title: '', caption: '' } }
        : d.lead === 'text' || d.compose?.text
          ? { id: 'text', kind: 'text', variant: d.compose?.text ?? 'narrow', content: { paragraphs: [brief.objective || intent.task] } }
          : goals.length >= 2
            ? { id: 'goals', kind: 'features', variant: d.compose?.features ?? 'columns', tone: d.look.containers === 'bands' ? 'alt' : 'base', content: { title: 'What people come to do', items: goals.map((g) => ({ title: g, text: '' })) } }
            : null;
    // a composed opening (the 'composed' plan): built from pieces, its proportions and order drawn per project
    const detail = d.designPlan?.detail.terms.length ? d.designPlan.detail.text : '';
    const opening =
      d.plan === 'composed'
        ? {
            id: 'opening',
            kind: 'compose',
            variant: 'free',
            images: img,
            tone: 'base',
            content: { root: composedOpening({ title: studyHeadline(brief.objective, name), lead: intent.task, action, ...(detail ? { detail: `[${detail.charAt(0).toUpperCase()}${detail.slice(1)}]` } : {}) }, img.length > 0, seeded(hashText(`${d.id}|${d.language}|opening`)), d.designPlan?.signature) },
          }
        : hero;
    const body = second && d.lead === second.kind ? [second, opening] : [opening, second];
    sections = [{ id: 'nav', kind: 'nav', variant: 'minimal', content: { brand: name, links: [], cta: action } }, ...body].filter(Boolean);
  }
  const spec = normalizeSpec({ title: name, pageType, platform: brief.platform, tokens: d.tokens, look: d.look, sections }, board);
  if (!spec) return null;
  return fitToIntent(spec, intent, { brief, dir: d }).spec;
}
