// lib/objects/scene-chat.ts
//
// A SCENE, BUILT FROM THE CONVERSATION.
//
// The chat box is how a person works in Logos, and Live 3D does not get a box
// of its own. A message is offered to the scene's reader (scene-intent.ts).
// What it decides:
//
//   build    every clause was read and no word skipped: the operations are
//            applied — one step for the whole message, undone whole — and
//            what was built is said in the conversation. Nothing is sent to
//            the reply model: a description is a command, not a question.
//   partial  the message is plainly a description — it starts with a verb
//            the reader knows or with a thing, and is not a question — but
//            part of it could not be read: nothing is built, and what could
//            not be read is said in the conversation, in the reader's words,
//            so it can be put another way. Building the part that was read
//            would make something nobody asked for.
//   null     anything else, and an ordinary message: "why is the flywheel so
//            heavy?", or "what is the volume of a sphere of radius 2?", which
//            mentions a sphere and is a question.
//
// REQUEST FRAMING never blocks. "Create an interactive 3D model of a rocket
// nose cone with base diameter 20 cm and height 40 cm. Add sliders for the
// diameter and height, labelled dimensions, and display the base area,
// surface area and volume." is a cone called "rocket nose cone", r 10 cm and
// h 40 cm — built. The 3D framing, the sliders, the labels and the measures
// asked for are NOTED (scene-intent.ts REQUEST_FRAMING), and what Live 3D does
// with each is said plainly: it has no sliders or dimension lines yet; it
// shows its measures under Measured.
//
// The same reading drives the panel's preview while the message is still
// being typed, so what Enter will do is visible before it is done.
//
// THE CLIENT'S QUESTION — "is this a shape to build?" — is answered by
// readsAsScene, with this same reader and this same gate:
//
//   readsAsScene(text: string, scene: SceneState = EMPTY_SCENE, ctx: ReadContext = {})
//     → { reading: Reading; built: boolean; noted: string[]; skipped: string[]; said: string } | null
//
//   null       not about a scene at all: leave it to the conversation
//   built      it reads in full and sceneTurn would build it — a client with
//              no Live 3D panel open can open one and build, without guessing
//   !built     plainly a description, read only in part (sceneTurn's
//              'partial'): `said` says what was not read; `skipped` lists it
//   noted      the request framing set aside, in the person's words
//
// Read against an EMPTY scene by default, which is what a person describing a
// shape with no scene open means; pass the scene (and the selection) to ask
// about one that is there.
//
// PURE.

import { readScene, readsAsDescription, type ReadContext, type Reading } from './scene-intent';
import { EMPTY_SCENE, type SceneState } from './scene';
import { MAX_DESCRIPTION } from './core';

export type SceneTurn =
  | { kind: 'build'; reading: Reading; said: string }
  | { kind: 'partial'; reading: Reading; problems: string[]; said: string };

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** More words than this left unread, and the message was about something else that happened to name a shape. */
const MAX_UNREAD = 3;

/**
 * What Live 3D does with the framing a request asked for, said once for each
 * kind — so the conversation says what was understood, and promises nothing
 * the scene does not do. The view framing (an interactive 3D model) is what
 * Live 3D is, and needs no answer.
 */
function framingSaid(reading: Reading): string {
  const noted = [...new Set(reading.clauses.flatMap((c) => c.noted ?? []))];
  const kinds = new Set(reading.clauses.flatMap((c) => c.framing ?? []));
  const lines: string[] = [];
  if (kinds.has('controls')) lines.push('Live 3D has no sliders yet: change a size in the inspector, or say it (“make it 30 cm across”).');
  if (kinds.has('labels')) lines.push('The selected part’s tag gives its size; there are no dimension lines yet.');
  if (kinds.has('measures')) {
    const unmeasured = reading.clauses.some((c) => c.framing?.includes('measures') && c.noted?.some((n) => /\b(?:base|lateral|curved|side|slant|cross[\s-]sectional)\b/i.test(n)));
    lines.push(`Its volume and surface area are under Measured with the part selected, and its mass where a material is given${unmeasured ? '; base area, lateral area and slant height are not measured yet' : ''}.`);
  }
  // nothing to say beyond the view framing, and descriptions: noted in the reading, not repeated in the conversation
  if (!lines.length) return '';
  return `\n\nNoted: ${noted.join('; ')}. ${lines.join(' ')}`;
}

/** The decision — one reader, one gate — for sceneTurn and readsAsScene alike. */
function decide(text: string, scene: SceneState, ctx: ReadContext): SceneTurn | null {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return null;
  const reading = readScene(t, scene, ctx);
  const read = reading.clauses.filter((c) => c.understood);
  if (!read.length || !reading.ops.length) return null;
  const problems = [
    ...reading.clauses.filter((c) => c.problem).map((c) => `“${c.text.trim()}”: ${c.problem}`),
    ...read.filter((c) => c.skipped?.length).map((c) => `“${c.text.trim()}”: not read — ${c.skipped!.join(', ')}`),
  ];
  // read in full, and more than one description can make and still undo whole (core.ts MAX_DESCRIPTION): said, not built
  const tooMany = reading.ops.length > MAX_DESCRIPTION;
  if (tooMany) problems.push(`it would take ${reading.ops.length} steps, more than one description can make and still be undone whole (${MAX_DESCRIPTION}) — describe it in parts`);
  if (problems.length) {
    const unread = read.reduce((n, c) => n + (c.skipped?.length ?? 0), 0);
    if (!tooMany && (!readsAsDescription(t) || unread > MAX_UNREAD)) return null;
    const shown = problems.slice(0, 3);
    const said = `Nothing was built: Live 3D could not read all of that.\n\n${shown.map((x) => `- ${x}`).join('\n')}${problems.length > shown.length ? `\n- and ${problems.length - shown.length} more` : ''}`;
    return { kind: 'partial', reading, problems, said };
  }
  // the notes worth saying aloud: a nominal density, a size nobody gave, where a part was put, the name its words gave it
  const notes = [...new Set(read.flatMap((c) => c.notes ?? []))].slice(0, 3);
  const said = `Built in Live 3D: ${read.map((c) => c.understood).join('; ')}.${notes.length ? ` ${notes.map(cap).join('. ')}.` : ''}${framingSaid(reading)}`;
  return { kind: 'build', reading, said };
}

/** What a message would do to the scene, if anything. */
export function sceneTurn(text: string, scene: SceneState, ctx: ReadContext = {}): SceneTurn | null {
  return decide(text, scene, ctx);
}

/** readsAsScene's answer: the reading itself, and what the client needs to decide on it. */
export interface SceneReading {
  /** the reader's own reading: the operations, each clause as read, and the preview they compute */
  reading: Reading;
  /** true when it reads in full and would be built — sceneTurn's 'build' */
  built: boolean;
  /** request framing read and set aside, in the person's words: "interactive 3D model", "sliders for the diameter and height" */
  noted: string[];
  /** words left unread — a reading that is not built names them */
  skipped: string[];
  /** what the conversation is told: "Built in Live 3D: …", or "Nothing was built: …" */
  said: string;
}

/**
 * Whether a message is a description of a scene to build — against an EMPTY
 * scene unless one is given — by the same reader and the same gate as
 * sceneTurn. Null for an ordinary message. A client with no Live 3D panel
 * open can open one, and build, when `built` is true.
 */
export function readsAsScene(text: string, scene: SceneState = EMPTY_SCENE, ctx: ReadContext = {}): SceneReading | null {
  const turn = decide(text, scene, ctx);
  if (!turn) return null;
  return {
    reading: turn.reading,
    built: turn.kind === 'build',
    noted: [...new Set(turn.reading.clauses.flatMap((c) => c.noted ?? []))],
    skipped: [...new Set(turn.reading.clauses.flatMap((c) => c.skipped ?? []))],
    said: turn.said,
  };
}
