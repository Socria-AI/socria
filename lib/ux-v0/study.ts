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
import { intentOf, pageTypeFor, requiredComponents } from './intent';
import { normalizeSpec, type DesignSpec } from './spec';
import type { DesignBrief, MoodboardRef } from './types';

/** The brief's own words for its main action, short, or an honest placeholder. */
export function primaryAction(brief: Pick<DesignBrief, 'userGoals' | 'functionalRequirements'>, intent = intentOf(brief as any)): string {
  if (intent.requirements.some((r) => r.component === 'booking')) return `Book ${intent.subject ? `a ${intent.subject.split(' ').pop()}` : 'a time'}`;
  if (intent.kind === 'portfolio') return 'See the work';
  if (intent.kind === 'editorial') return 'Start reading';
  const goal = [...(brief.userGoals ?? []), ...(brief.functionalRequirements ?? [])].map((g) => g.replace(/[.;:].*$/, '').trim()).find((g) => g.length > 2 && g.length <= 28);
  return goal ? goal.charAt(0).toUpperCase() + goal.slice(1) : '[Primary action]';
}

/** A short design in this direction, of the thing being made. */
export function studySpec(d: ArtDirection, brief: DesignBrief, name: string, refs: readonly MoodboardRef[]): DesignSpec | null {
  const intent = intentOf(brief);
  const pageType = pageTypeFor(intent, brief.pageType);
  // only a picture marked for the page appears in the page; references only inspire
  const usable = refs.filter((r) => r.state !== 'rejected' && r.media !== 'video' && !r.avoid && r.asContent !== false && (r.provider !== 'upload' || r.asContent === true) && r.url);
  const img = usable[0] ? [usable[0].id] : [];
  const board = { refs: [...refs], queries: [], palettes: [], type: [] } as any;
  let sections: unknown[];
  if (intent.screen) {
    // the screen itself: its required components, in this direction's composition, with sample content
    const head = intent.kind === 'dashboard' || intent.kind === 'data' || intent.kind === 'app' ? [{ id: 'head', kind: 'app-header', content: { title: name, subtitle: intent.task, actions: [] } }] : [];
    const parts = requiredComponents(intent).map((c) => ({ id: c, kind: c, variant: (c && d.compose?.[c]) || undefined, images: c === 'booking' && d.compose?.booking === 'immersive' ? img : [], content: c ? sampleFor(c, intent, brief) : null }));
    sections = [...head, ...parts];
    if (!sections.length) sections = [{ id: 'head', kind: 'app-header', content: { title: name, subtitle: intent.task, actions: [] } }];
  } else {
    const action = primaryAction(brief, intent);
    const goals = brief.userGoals.slice(0, 3);
    sections = [
      { id: 'nav', kind: 'nav', variant: 'minimal', content: { brand: name, links: [], cta: action } },
      {
        id: 'hero', kind: 'hero', variant: img.length ? 'split' : 'statement', images: img, tone: 'base', pad: 'm',
        content: { eyebrow: brief.personality.slice(0, 3).join(' · '), title: brief.objective.split(/[.;]/)[0].slice(0, 90) || name, subtitle: intent.task, primary: action },
      },
      goals.length >= 2 ? { id: 'goals', kind: 'features', variant: 'columns', tone: d.look.containers === 'bands' ? 'alt' : 'base', content: { title: 'What people come to do', items: goals.map((g) => ({ title: g, text: '' })) } } : null,
    ].filter(Boolean);
  }
  const spec = normalizeSpec({ title: name, pageType, platform: brief.platform, tokens: d.tokens, look: d.look, sections }, board);
  if (!spec) return null;
  return fitToIntent(spec, intent, { brief, dir: d }).spec;
}
