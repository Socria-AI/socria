// lib/ux-v0/arrange.ts — what the approved direction decided about the composition, held in code.
//
// A direction's tokens and look are applied in code whatever a model writes (lib/ux-v0/design.ts). The arrangement a
// creative reading asked of the opening (lib/ux-v0/interpret.ts: layered, overlapping, off-axis) is held the same
// way, at generation and again whenever the drawn design is checked (lib/ux-v0/evaluate.ts) — and so is the
// direction's compositional strategy (lib/ux-v0/strategy.ts): the parts it composes are rebuilt from their own
// content by the composer when the model wrote them as library layouts, the navigation takes the strategy's form,
// and a page told in chapters numbers them and lets its index go to them.

import { arrangedOpening, composeSignature, overlapsIn, type Piece } from './compose';
import { blocksOf, composeBlocks, COMPOSABLE } from './composer';
import type { ArtDirection } from './direction';
import { hashText, seeded } from './layout';
import { kindDef, normalizeSpec, type DesignSpec, type Section } from './spec';
import type { Moodboard } from './types';

/**
 * The opening in the arrangement the approved direction carries (words layered over the picture, the title crossing
 * it, or set off-axis), whatever the model wrote: an opening the model wrote as a library hero is rebuilt from its
 * own words and its own picture; one it composed itself is kept, and given the frames the direction asks for. A
 * locked opening, a screen of an app, or a page that opens with something else is left as it is.
 */
export function holdArrangement(spec: DesignSpec, dir: ArtDirection, moodboard: Moodboard | null): DesignSpec {
  if (!dir.arrange || spec.pageType !== 'website') return spec;
  // the opening: the page's first part when it is a hero or composed; on a page that leads with its work (a
  // gallery first), the hero that follows it
  const lead = spec.sections.findIndex((x) => x.kind !== 'nav');
  const i = lead >= 0 && (spec.sections[lead].kind === 'hero' || spec.sections[lead].kind === 'compose') ? lead : spec.sections.findIndex((x) => x.kind === 'hero');
  const first = i >= 0 ? spec.sections[i] : null;
  if (!first || first.locked) return spec;
  const frames = (hasImg: boolean): Record<string, string> => ({
    ...(dir.arrange === 'layered' && hasImg && dir.frame?.bleed ? { span: 'bleed' } : dir.arrange !== 'layered' ? { span: 'wide' } : {}),
    ...(dir.arrange === 'layered' && hasImg && dir.frame?.tall ? { tall: 'screen' } : {}),
  });
  let next: Record<string, unknown> | null = null;
  let note = '';
  if (first.kind === 'compose') {
    const root = first.content.root as Piece;
    if (overlapsIn(root) || root.t === 'field') {
      const f = frames(first.images.length > 0);
      if (Object.entries(f).every(([k, v]) => first.content[k] === v || first.content[k])) return spec;
      next = { ...first, content: { ...f, ...Object.fromEntries(Object.entries(first.content).filter(([, v]) => v !== '')) } };
    }
  }
  if (!next && first.kind === 'hero') {
    const c = first.content;
    const images = first.images.slice(0, 1);
    const root = arrangedOpening({ eyebrow: c.eyebrow || undefined, title: String(c.title), lead: c.subtitle || undefined, action: c.primary || undefined }, images.length > 0, seeded(hashText(`${dir.id}|${dir.language}|arranged`)), dir.arrange, dir.frame?.display);
    next = { id: first.id, kind: 'compose', variant: 'free', images, tone: first.tone, pad: first.pad, content: { root, ...frames(images.length > 0) } };
    note = `The opening composed as the direction asks: ${dir.arrange === 'layered' ? 'its words layered over its picture' : dir.arrange === 'overlap' ? 'its title crossing its picture' : 'its title set off-axis'}.`;
  }
  if (!next) return spec;
  const held = normalizeSpec({ ...spec, sections: spec.sections.map((x, j) => (j === i ? next : x)), notes: note ? [...spec.notes, note].slice(-8) : spec.notes }, moodboard);
  return held && held.sections.length === spec.sections.length ? held : spec;
}

/** The library layouts a strategy recomposes first: the ones generated pages fall back on (cards, equal columns). */
const RECOMPOSE_FIRST: Record<string, number> = { features: 5, stats: 4, quote: 3, split: 2, cta: 1, text: 1 };

/** A part's label for a note: its own title, else its kind. */
const partName = (s: Section) => (typeof s.content.title === 'string' && s.content.title.trim() ? `“${s.content.title.trim().slice(0, 40)}”` : `the ${kindDef(s.kind)?.label.toLowerCase() ?? 'part'}`);

/**
 * The direction's compositional strategy held on a generated page: the parts it composes (as many as it says, the
 * library layouts generated pages fall back on first) rebuilt from their own content, the navigation in the
 * strategy's form, and chapters numbered and indexed. Locked parts, held compositions, the parts that have to work
 * (a booking, a form, prices, a gallery), and parts the model composed itself are left as they are.
 */
export function holdStrategy(spec: DesignSpec, dir: ArtDirection, moodboard: Moodboard | null): DesignSpec {
  const st = dir.strategy;
  const form = spec.look.form ?? dir.look.form;
  if (!st || !form || spec.pageType !== 'website') return spec;
  const notes: string[] = [];
  let sections = [...spec.sections];
  const openingAt = sections.findIndex((x) => x.kind !== 'nav');
  // 1 · the parts it composes: the model's own compositions count toward the number
  const own = sections.filter((x, i) => i !== openingAt && x.kind === 'compose').length;
  const want = Math.max(0, st.recompose - own);
  // the sequence the motion tells as its pinned story (the one the designer chose, else the first that can be one) is
  // the story's: recomposing it would take the story off the page
  const told = spec.look.motion?.story ? (sections.find((x) => x.story) ?? sections.find((x) => x.kind === 'features' && Array.isArray(x.content.items) && x.content.items.length >= 3 && x.content.items.length <= 6)) : undefined;
  if (want > 0) {
    const ranked = sections
      .map((x, i) => ({ x, i }))
      .filter(({ x, i }) => i !== openingAt && x !== told && !x.locked && !x.held && !x.story && (COMPOSABLE as readonly string[]).includes(x.kind) && x.kind !== 'hero' && !st.keep.includes(x.kind) && blocksOf(x))
      .sort((a, b) => (RECOMPOSE_FIRST[b.x.kind] ?? 0) - (RECOMPOSE_FIRST[a.x.kind] ?? 0) || a.i - b.i)
      .slice(0, want);
    for (const [k, { x, i }] of ranked.entries()) {
      const c = composeBlocks(blocksOf(x)!, st, form, { salt: x.id, loud: dir.designPlan?.signature, k: k + (dir.arrange ? 1 : 0) });
      sections[i] = { id: x.id, kind: 'compose', variant: 'free', images: x.images, ...(x.tone ? { tone: x.tone } : {}), ...(x.pad ? { pad: x.pad } : {}), ...(x.responsive ? { responsive: x.responsive } : {}), content: { root: c.root, ...(c.span ? { span: c.span } : {}), ...(c.tall ? { tall: c.tall } : {}) } } as Section;
      notes.push(`${partName(x).replace(/^./, (ch) => ch.toUpperCase())} composed as the strategy asks: ${c.label}.`);
    }
  }
  // 2 · the opening, when the reading asked no arrangement of it but the strategy composes the page itself
  const opening = sections[openingAt];
  if (!dir.arrange && st.recompose >= 2 && opening?.kind === 'hero' && !opening.locked && blocksOf(opening)) {
    const c = composeBlocks(blocksOf(opening)!, st, form, { salt: opening.id, opening: true, loud: dir.designPlan?.signature });
    sections[openingAt] = { id: opening.id, kind: 'compose', variant: 'free', images: opening.images.slice(0, 3), ...(opening.tone ? { tone: opening.tone } : {}), content: { root: c.root, ...(c.span ? { span: c.span } : {}), ...(c.tall ? { tall: c.tall } : {}) } } as Section;
    notes.push(`The opening composed as the strategy asks: ${c.label}.`);
  }
  // 3 · the navigation in the strategy's form (an index of chapters, a rail, a menu), unless the designer chose one
  const navAt = sections.findIndex((x) => x.kind === 'nav');
  const nav = sections[navAt];
  if (nav && !nav.locked && !nav.fixed && st.nav !== 'bar' && nav.variant !== st.nav) {
    let links = Array.isArray(nav.content.links) ? (nav.content.links as string[]) : [];
    // chapters: the index names the page's own parts, so each link goes to one
    if (st.nav === 'index' || st.narrative === 'chapters') {
      const parts = sections.filter((x) => !['nav', 'footer', 'logos'].includes(x.kind)).slice(1);
      const named = parts.map((x) => (typeof x.content.title === 'string' ? x.content.title : typeof x.content.eyebrow === 'string' ? x.content.eyebrow : '')).map((t) => t.replace(/[*_]/g, '').split(/[.:—–!?]/)[0].trim().split(/\s+/).slice(0, 3).join(' ')).filter((t) => t.length >= 2 && t.length <= 28);
      if (named.length >= 2) links = [...new Set(named)].slice(0, 6);
    }
    sections[navAt] = { ...nav, variant: st.nav, content: { ...nav.content, links } };
    notes.push(st.nav === 'index' ? 'The navigation set as an index of the page’s chapters.' : st.nav === 'rail' ? 'The navigation stood upright at the left edge.' : 'The navigation folded into a menu.');
  }
  // 4 · chapters are numbered
  let look = spec.look;
  if (st.narrative === 'chapters' && !look.motifs.includes('numbering') && !dir.locks.includes('motifs')) look = { ...look, motifs: [...look.motifs, 'numbering'] };
  if (!notes.length && look === spec.look) return spec;
  const held = normalizeSpec({ ...spec, look, sections, notes: [...spec.notes, ...notes].slice(-8) }, moodboard);
  return held && held.sections.length === spec.sections.length ? held : spec;
}

/** Whether a page carries what its strategy composes: the measure the evaluation and the benchmarks read. */
export function strategyHeld(spec: DesignSpec, dir: Pick<ArtDirection, 'strategy'>): { composed: number; want: number; nav: boolean; signatures: string[] } {
  const st = dir.strategy;
  const composed = spec.sections.filter((x) => x.kind === 'compose');
  return {
    composed: composed.length,
    want: st ? st.recompose + (st.recompose >= 2 ? 1 : 0) : 0,
    nav: !st || st.nav === 'bar' || spec.sections.some((x) => x.kind === 'nav' && x.variant === st.nav),
    signatures: composed.map((x) => composeSignature(x.content.root as Piece)),
  };
}
