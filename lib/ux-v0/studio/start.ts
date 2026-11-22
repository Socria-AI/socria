// lib/ux-v0/studio/start.ts — a conversation becoming a work: the project each engine starts from.
//
// A graphic or a logo starts with its brief written (the graphics workspace proposes directions, or explores logo
// concepts, the moment it opens); a board starts with its brief and materials (the board proposes its systems at once);
// a website starts already made — its brief, its approved direction and a first design composed by the website engine
// from the person's words (lib/ux-v0/boards/website.ts websiteConcept), with the working parts it must have. Nothing is
// composed here that the workspace would not compose itself.

import type { StudioState } from './schema';
import { said } from './schema';
import { boardBriefOf, functionalSections, functionLabels, graphicBriefOf, logoBriefOf, prefsOf, studioDNA, systemsWithPrefs, websiteAskOf } from './apply';
import { emptyGraphicState } from '../graphics/state';
import { emptyBoard } from '../boards/model';
import type { MasterDesignSystem } from '../boards/system';
import { websiteConcept } from '../boards/website';
import { readIntent } from '../intent';
import type { DesignProject } from '../types';

export type StartResult = { ok: true; project: DesignProject; said: string } | { ok: false; error: string };

const DEFAULT_NAMES = new Set(['Untitled design', 'Untitled graphic', 'Untitled board', '']);

/** The medium a mode's work is kept as. */
export const mediumOf = (mode: StudioState['mode']): DesignProject['medium'] => (mode === 'graphic' || mode === 'logo' ? 'graphic' : mode === 'board' ? 'board' : 'website');

/** A project prepared for its engine (graphic, logo, board); `images` are picture asset ids already added to it. */
export function startProject(p: DesignProject, st: StudioState, opts: { images?: readonly string[]; assets?: NonNullable<DesignProject['graphic']>['assets']; now?: number } = {}): StartResult {
  const now = opts.now ?? Date.now();
  const started: StudioState = { ...st, status: 'started', startedAt: now };
  const dna = studioDNA(st, p.dna);
  if (st.mode === 'graphic' || st.mode === 'logo') {
    const brief = st.mode === 'logo' ? logoBriefOf(st) : graphicBriefOf(st, opts.images ?? []);
    if (!brief) return { ok: false, error: st.mode === 'logo' ? 'A logo needs its name first.' : 'Write the headline first: SocriaUX sets your words and never invents them.' };
    const name = DEFAULT_NAMES.has(p.name) ? brief.content.headline.slice(0, 80) : p.name;
    const project: DesignProject = {
      ...p,
      name,
      medium: 'graphic',
      intent: p.intent || st.prompt.slice(0, 600),
      graphic: { ...(p.graphic ?? emptyGraphicState()), brief, ...(opts.assets?.length ? { assets: [...(p.graphic?.assets ?? []), ...opts.assets] } : {}) },
      ...(dna ? { dna } : {}),
      studio: said(started, { from: 'socria', kind: 'note', text: st.mode === 'logo' ? `Constructing logo concepts for “${brief.content.headline}”.` : `Composing “${brief.content.headline}” three ways.`, at: now }),
      updatedAt: now,
    };
    return { ok: true, project, said: st.mode === 'logo' ? 'logo concepts' : 'three directions' };
  }
  if (st.mode === 'board') {
    const brief = boardBriefOf(st, opts.images ?? []);
    if (!brief) return { ok: false, error: 'A board needs its line and at least one material.' };
    const identity = st.answers['b.identity']?.values?.[0] ?? '';
    const fromSite = identity.startsWith('website:') ? identity.slice('website:'.length) : '';
    const project: DesignProject = {
      ...p,
      name: DEFAULT_NAMES.has(p.name) ? brief.name.slice(0, 80) : p.name,
      medium: 'board',
      intent: p.intent || st.prompt.slice(0, 600),
      board: { ...(p.board ?? emptyBoard()), request: st.prompt.slice(0, 2000), brief: { ...brief, ...(fromSite ? { systemFrom: fromSite } : {}) } },
      ...(dna ? { dna } : {}),
      studio: said(started, { from: 'socria', kind: 'note', text: `Planning ${brief.materials.reduce((t, m) => t + m.count, 0)} materials around “${brief.content.headline}”.`, at: now }),
      updatedAt: now,
    };
    return { ok: true, project, said: 'the board' };
  }
  return { ok: false, error: 'This kind of work starts elsewhere.' };
}

/** A website made from the conversation in the chosen system: a whole project (not yet stored). */
export function startWebsite(st: StudioState, sys: MasterDesignSystem, opts: { now?: number; name?: string } = {}): StartResult {
  const now = opts.now ?? Date.now();
  const ask = websiteAskOf(st);
  if (!ask) return { ok: false, error: 'A website needs a name or a first line.' };
  const prefs = prefsOf(st);
  const held = systemsWithPrefs([sys], prefs)[0];
  const sections = functionalSections(ask, now);
  const functions = functionLabels(ask.functions);
  // a website WITH a booking (or a form) is still a website: its structure is a site's, the working parts sections of it
  const intent = readIntent([ask.board.purpose, ...functions].join('. '), { override: 'site' });
  const r = websiteConcept(ask.board, held, {
    name: opts.name ?? ask.board.name,
    brief: { audience: ask.audience, functionalRequirements: functions, intent, ...(prefs.personality.length ? { experience: `It should feel ${prefs.personality.join(', ')}.` } : {}) },
    sections,
    note: 'Made in the studio from your words, in the direction you chose',
  });
  if (!r.ok) return r;
  const dna = studioDNA(st);
  const started: StudioState = { ...st, status: 'started', startedAt: now };
  const project: DesignProject = {
    ...r.project,
    ...(dna ? { dna } : {}),
    studio: said(started, { from: 'socria', kind: 'note', text: `Made “${ask.board.name}” in ${sys.direction.name}${functions.length ? `, with ${functions.join(', ').toLowerCase()}` : ''}. Functional labels and sample times are yours to change.`, at: now }),
  };
  return { ok: true, project, said: 'a first design' };
}
