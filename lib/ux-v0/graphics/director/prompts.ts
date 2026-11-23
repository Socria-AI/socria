// lib/ux-v0/graphics/director/prompts.ts — what changes from one creative call to the next.
//
// The instructions are one text for every call (principles.ts directorSystem). This is the rest, kept apart by what it
// is, so nothing is said twice and nothing contradicts: the TASK (which answer is wanted, and the frame of this
// artboard), the PERSON'S WORDS (exactly as written), the PROJECT (the brief, the idea, the journal of earlier turns,
// what must always hold), the BRAND (an attached design system's constraints), the DESIGN AS IT IS (the sheet), and
// for a review what the engine's own checks measured. A section with nothing to say is left out.

import type { GraphicBrief } from '../compose';
import type { Frame } from './frame';
import type { ProjectMemory, Sheet } from './sheet';

const cut = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);
const section = (title: string, lines: (string | false | null | undefined)[]) => {
  const body = lines.filter((l): l is string => !!l);
  return body.length ? [`## ${title}`, ...body, ''] : [];
};

function project(m: ProjectMemory): string[] {
  return section('The project', [
    m.brief && `Brief (the person’s words): ${cut(m.brief, 900)}`,
    m.kind && `It is a ${m.kind}.`,
    m.idea && `The idea this design was made from: ${m.idea}`,
    m.rationale?.length ? `Why it is designed this way: ${m.rationale.join(' · ')}` : '',
    m.standing?.length ? `Always holds (they said so): ${m.standing.join(' · ')}` : '',
    m.journal?.length ? `Earlier turns in this project (oldest first):\n${m.journal.map((j) => `  ${j.turn}. they said “${j.said}” — ${j.status === 'rejected' ? `SocriaUX proposed: ${j.did} — THEY TURNED IT DOWN (do not propose the same again)` : `done and kept: ${j.did}`}${j.restorable ? ' [restorable]' : ''}`).join('\n')}` : '',
    m.references?.length ? `References they chose: ${m.references.join(' · ')}` : '',
    m.comments?.length ? `Comments still open on objects (act on them only if asked now): ${m.comments.join(' · ')}` : '',
  ]);
}

function brand(m: ProjectMemory): string[] {
  const s = m.system;
  if (!s) return [];
  return section(`The brand: ${s.name} (constraints; they hold unless the person overrides them in so many words)`, [
    s.colours.length ? `Colours: ${s.colours.join(', ')} — stay within them.` : '',
    s.fonts.length ? `Faces: ${s.fonts.join(', ')} — use these.` : '',
    s.logo ? `Logo: ${s.logo} — never redraw, recolour or distort it.` : '',
    ...s.rules.map((r) => `Rule: ${r}`),
    'A brand fixes identity, not composition: do not let it make every design the same layout.',
  ]);
}

export interface DesignAsk {
  brief: GraphicBrief;
  frame: Frame;
  formatLabel: string;
  memory?: ProjectMemory;
  /** what the conversation decided: a palette, faces, a feel (hard when present) */
  decided?: { palette?: Record<string, string>; fonts?: { display: string; body: string }; avoid?: string[] };
  /** one-line descriptions of designs already made for this project, to stay away from */
  avoid?: string[];
  /** asked for another interpretation: make a different idea, not a variation */
  another?: boolean;
}

/** The user message for a new design. */
export function designUser(a: DesignAsk): string {
  const c = a.brief.content;
  const f = a.frame;
  return [
    ...section('Task', [`"design" — a new ${a.brief.kind} (${a.formatLabel}). Frame: 1000 × ${f.h} units. Safe margin for words: ${f.safe} units on every side. Smallest size for words: ${f.minText} units.`, a.another ? 'This is another interpretation: a genuinely different idea and structure from the ones listed below, not a recolour.' : '']),
    ...section('The person’s words', [cut(a.brief.purpose, 900) || '(none beyond the content below)', a.brief.mood.length ? `How it should feel, in their words: ${a.brief.mood.join(', ')}` : '']),
    ...section('Content to set (exactly these words; place each by reference)', [
      `headline: ${JSON.stringify(c.headline)}`,
      c.subhead ? `subhead: ${JSON.stringify(c.subhead)}` : '',
      c.meta?.length ? `meta (details): ${JSON.stringify(c.meta)}` : '',
      c.cta ? `cta: ${JSON.stringify(c.cta)}` : '',
      c.brand ? `brand: ${JSON.stringify(c.brand)}` : '',
      c.items?.length ? `points (use a "list"): ${JSON.stringify(c.items.slice(0, 10))}` : '',
      c.data?.length ? `numbers (use a "chart"): ${JSON.stringify(c.data.slice(0, 12))}${c.dataUnit ? ` ${c.dataUnit}` : ''}` : '',
      a.brief.images.length ? `pictures: ${a.brief.images.length} of the person’s own (asset 0${a.brief.images.length > 1 ? `…${a.brief.images.length - 1}` : ''}); you cannot see them — give them room and a crop that suits a ${a.brief.kind}.` : 'pictures: none. Do not plan for photographs; make the design from type, colour, space and drawn form.',
    ]),
    ...section('Already decided in the conversation (keep to these)', [
      a.decided?.palette ? `Palette: ${Object.entries(a.decided.palette).map(([k, v]) => `${k} ${v}`).join(', ')}` : '',
      a.decided?.fonts ? `Faces: display ${a.decided.fonts.display}, body ${a.decided.fonts.body}` : '',
      a.decided?.avoid?.length ? `Avoid: ${a.decided.avoid.join(', ')}` : '',
    ]),
    // (the brief and the kind are said above: the project adds only what is not)
    ...(a.memory ? [...project({ ...a.memory, brief: undefined, kind: undefined }), ...brand(a.memory)] : []),
    ...section('Designs already made for this project (stay away from their structure)', (a.avoid ?? []).slice(0, 6).map((x) => `- ${cut(x, 200)}`)),
  ].join('\n');
}

export interface EditAsk {
  words: string;
  sheet: Sheet;
  memory?: ProjectMemory;
  /** the question asked last, when these words answer it */
  asked?: { text: string; options: string[] } | null;
  /** what the person said must be kept, as read from their words (enforced by the engine whatever is answered) */
  protectedSaid?: string[];
  /** a picture of the design as rendered travels with the request */
  hasPicture?: boolean;
}

/** The user message for a change asked in words. */
export function editUser(a: EditAsk): string {
  const f = a.sheet.artboard.frame;
  return [
    ...section('Task', [`"edit" — a change to the design in front of the person. Frame: 1000 × ${f.h} units. Safe margin for words: ${a.sheet.artboard.safe}. Smallest size for words: ${a.sheet.artboard.minText}.${a.hasPicture ? ' The picture attached is this design as it is rendered now: look at it.' : ''}`]),
    ...section('The person says', [cut(a.words, 900), a.asked ? `(You asked them: “${cut(a.asked.text, 200)}” — offered: ${a.asked.options.map((o) => cut(o, 60)).join(' / ')}.)` : '', a.sheet.selection?.length ? `They have selected on the canvas: ${a.sheet.selection.join(', ')} — “this”, “it” and “these” mean the selection.` : '']),
    ...section('Kept, whatever else changes (they said so; SocriaUX enforces it)', a.protectedSaid ?? []),
    ...(a.memory ? [...project(a.memory), ...brand(a.memory)] : []),
    ...section('The design as it is (objects in drawing order, back to front; boxes are [x, y, w, h])', [JSON.stringify(a.sheet)]),
  ].join('\n');
}

export interface ReviewAsk {
  sheet: Sheet;
  memory?: ProjectMemory;
  /** what was just made or changed, in a sentence */
  made: string;
  /** what the engine's own checks measured (overflow, collisions, contrast, habits), said */
  measured: string[];
  protectedSaid?: string[];
}

/** The user message for a look at the rendered result (the picture is attached to the same message). */
export function reviewUser(a: ReviewAsk): string {
  const f = a.sheet.artboard.frame;
  return [
    ...section('Task', [`"review" — the picture attached is the design as rendered. Frame: 1000 × ${f.h} units. Safe margin for words: ${a.sheet.artboard.safe}. Smallest size for words: ${a.sheet.artboard.minText}.`, `What was just done: ${cut(a.made, 300)}`]),
    ...section('What SocriaUX measured (facts; the picture decides the rest)', a.measured.length ? a.measured.slice(0, 10).map((m) => `- ${cut(m, 220)}`) : ['- nothing measurable is wrong: no words overflow, collide or fall below contrast']),
    ...section('Kept, whatever else changes', a.protectedSaid ?? []),
    ...(a.memory ? [...project(a.memory), ...brand(a.memory)] : []),
    ...section('The design sheet (objects in drawing order; boxes are [x, y, w, h])', [JSON.stringify(a.sheet)]),
  ].join('\n');
}
