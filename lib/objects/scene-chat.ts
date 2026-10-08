// lib/objects/scene-chat.ts
//
// A SCENE, BUILT FROM THE CONVERSATION.
//
// The chat box is how a person works in Logos, and Live 3D does not get a box
// of its own. With a Live 3D panel open, a message is first offered to the
// scene's reader (scene-intent.ts). What it decides:
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
// The same reading drives the panel's preview while the message is still
// being typed, so what Enter will do is visible before it is done.
//
// PURE.

import { readScene, readsAsDescription, type ReadContext, type Reading } from './scene-intent';
import type { SceneState } from './scene';

export type SceneTurn =
  | { kind: 'build'; reading: Reading; said: string }
  | { kind: 'partial'; reading: Reading; problems: string[]; said: string };

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** More words than this left unread, and the message was about something else that happened to name a shape. */
const MAX_UNREAD = 3;

/** What a message would do to the scene, if anything. */
export function sceneTurn(text: string, scene: SceneState, ctx: ReadContext = {}): SceneTurn | null {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return null;
  const reading = readScene(t, scene, ctx);
  const read = reading.clauses.filter((c) => c.understood);
  if (!read.length || !reading.ops.length) return null;
  const problems = [
    ...reading.clauses.filter((c) => c.problem).map((c) => `“${c.text.trim()}”: ${c.problem}`),
    ...read.filter((c) => c.skipped?.length).map((c) => `“${c.text.trim()}”: not read — ${c.skipped!.join(', ')}`),
  ];
  if (problems.length) {
    const unread = read.reduce((n, c) => n + (c.skipped?.length ?? 0), 0);
    if (!readsAsDescription(t) || unread > MAX_UNREAD) return null;
    const shown = problems.slice(0, 3);
    const said = `Nothing was built: Live 3D could not read all of that.\n\n${shown.map((x) => `- ${x}`).join('\n')}${problems.length > shown.length ? `\n- and ${problems.length - shown.length} more` : ''}`;
    return { kind: 'partial', reading, problems, said };
  }
  // the notes worth saying aloud: a nominal density, a size nobody gave, where a part was put
  const notes = [...new Set(read.flatMap((c) => c.notes ?? []))].slice(0, 3);
  const said = `Built in Live 3D: ${read.map((c) => c.understood).join('; ')}.${notes.length ? ` ${notes.map(cap).join('. ')}.` : ''}`;
  return { kind: 'build', reading, said };
}
