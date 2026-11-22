// lib/ux-v0/boards/website.ts — the website of a board: a real website project, made in the board's design system by
// the website generator SocriaUX already has, and kept in step with that system only when asked.
//
// The board holds a reference to the project (its id), never a copy of the website. websiteConcept() writes the
// project the website workspace opens and edits: a brief whose colour and typography are the system's (locked), the
// system's art direction approved, and one version of the design composed by parseGenerate from the board's own words
// (websiteAnswer: nothing invented). syncWebsite() carries a later change of the system (its typefaces, its colours)
// into the website as a NEW version, the earlier ones kept, so the website's own history and edits are never lost.

import { parseGenerate } from '../design';
import { briefKey, EMPTY_DIRECTION, type ArtDirection } from '../direction';
import { emptyMoodboard, makeProject, normalizeBrief, type DesignProject } from '../types';
import type { DesignIntent } from '../intent';
import type { BoardBrief } from './model';
import { websiteAnswer } from './plan';
import { artOfSystem, webFacesOf, type MasterDesignSystem } from './system';

/** The website project of a board (not yet stored: the caller writes it to the project store). */
export function websiteConcept(
  brief: BoardBrief,
  sys: MasterDesignSystem,
  opts: {
    name?: string;
    board?: string;
    /** what the website brief also knows (the studio's conversation): who it is for, what it must do, how it should feel */
    brief?: { audience?: string; userGoals?: string[]; functionalRequirements?: string[]; experience?: string; intent?: DesignIntent };
    /** working sections it must have (a booking, a form), set before the footer in the order given */
    sections?: Record<string, unknown>[];
    /** where the website was made, said on its first version */
    note?: string;
  } = {},
): { ok: true; project: DesignProject } | { ok: false; error: string } {
  const art = artOfSystem(sys);
  if (!art) return { ok: false, error: 'This design system has no art direction a website can be built in. Choose one of the proposed systems.' };
  const c = sys.tokens.colors;
  const db = normalizeBrief({
    pageType: 'website',
    objective: (brief.purpose || brief.content.headline).slice(0, 600),
    personality: sys.personality,
    visualDirection: `${sys.direction.name}: ${sys.direction.concept ?? sys.direction.language}`.slice(0, 600),
    palette: [
      { name: 'Ground', hex: c.background, role: 'background' },
      { name: 'Surface', hex: c.surface, role: 'surface' },
      { name: 'Ink', hex: c.text, role: 'text' },
      { name: 'Quiet ink', hex: c.muted, role: 'muted' },
      { name: 'Accent', hex: c.accent, role: 'accent' },
      { name: 'Accent text', hex: c.accentText, role: 'accent-text' },
      { name: 'Line', hex: c.line, role: 'line' },
    ],
    typography: webFacesOf(sys.tokens.fonts),
    decisions: { colour: 'locked', typography: 'locked' },
    ...(opts.brief?.audience ? { audience: opts.brief.audience.slice(0, 600) } : {}),
    ...(opts.brief?.userGoals?.length ? { userGoals: opts.brief.userGoals.slice(0, 8) } : {}),
    ...(opts.brief?.functionalRequirements?.length ? { functionalRequirements: opts.brief.functionalRequirements.slice(0, 12) } : {}),
    ...(opts.brief?.experience ? { experience: opts.brief.experience.slice(0, 300) } : {}),
    ...(opts.brief?.intent ? { intent: opts.brief.intent } : {}),
  });
  if (!db) return { ok: false, error: 'The board’s words are not enough to brief a website: give it a headline.' };
  const moodboard = emptyMoodboard();
  const answer = websiteAnswer(brief, sys);
  if (opts.sections?.length) {
    const foot = answer.sections.findIndex((x) => x.kind === 'footer');
    answer.sections.splice(foot < 0 ? answer.sections.length : foot, 0, ...opts.sections);
  }
  const spec = parseGenerate(answer, db, moodboard, 1, opts.note ?? `Made on the board “${opts.board ?? brief.name}”, in its design system`, art);
  if (!spec) return { ok: false, error: 'The website could not be composed from the board’s words.' };
  const name = (opts.name ?? `${brief.name} website`).slice(0, 80);
  const base = makeProject('create', name);
  const project: DesignProject = {
    ...base,
    intent: (brief.purpose || brief.content.headline).slice(0, 600),
    moodboard,
    brief: { doc: db, approved: true, version: 1 },
    direction: { ...EMPTY_DIRECTION, options: [art], chosen: art, approved: true, seen: [art.language], forBrief: briefKey(db) },
    specs: [spec],
    specIndex: 0,
  };
  return { ok: true, project };
}

/** What a website differs from a system in: its typefaces, its colours (by token). */
export function websiteDrift(p: DesignProject, sys: MasterDesignSystem): { fonts: string[]; colours: string[] } {
  const spec = p.specs[p.specIndex] ?? p.specs[p.specs.length - 1];
  if (!spec) return { fonts: [], colours: [] };
  const web = webFacesOf(sys.tokens.fonts);
  const fonts = (['display', 'body'] as const).filter((k) => spec.tokens.fonts[k] !== web[k]);
  const colours = (Object.keys(spec.tokens.colors) as (keyof typeof spec.tokens.colors)[]).filter((k) => spec.tokens.colors[k]?.toLowerCase() !== sys.tokens.colors[k]?.toLowerCase());
  return { fonts, colours };
}

/**
 * The system's typefaces and/or colours carried into a website as a new version of its design (the one shown); its
 * direction follows, so a later regeneration keeps them. The earlier versions stay. Null when nothing would change.
 */
export function syncWebsite(p: DesignProject, sys: MasterDesignSystem, what: { fonts: boolean; colours: boolean }, now = Date.now()): DesignProject | null {
  const spec = p.specs[p.specIndex] ?? p.specs[p.specs.length - 1];
  if (!spec) return null;
  const drift = websiteDrift(p, sys);
  const fonts = what.fonts && drift.fonts.length > 0;
  const colours = what.colours && drift.colours.length > 0;
  if (!fonts && !colours) return null;
  const web = webFacesOf(sys.tokens.fonts);
  const tokens = { ...spec.tokens, fonts: fonts ? { ...web } : spec.tokens.fonts, colors: colours ? { ...spec.tokens.colors, ...sys.tokens.colors } : spec.tokens.colors };
  const version = Math.max(0, ...p.specs.map((s) => s.version)) + 1;
  const said = [fonts ? 'typefaces' : '', colours ? 'colours' : ''].filter(Boolean).join(' and ');
  const next = { ...spec, tokens, version, reason: `The board’s design system carried in: its ${said}`, createdAt: now };
  const chosen = p.direction.chosen ? ({ ...p.direction.chosen, tokens: { ...p.direction.chosen.tokens, ...(fonts ? { fonts: { ...web } } : {}), ...(colours ? { colors: { ...p.direction.chosen.tokens.colors, ...sys.tokens.colors } } : {}) } } as ArtDirection) : null;
  return { ...p, specs: [...p.specs, next], specIndex: p.specs.length, direction: { ...p.direction, chosen }, updatedAt: now };
}
