// What a recorded model call said, read the way the model reads it.
//
// The Logos reply sends its system prompt in two parts — what holds for the
// whole line of thinking first, this turn's context just before the newest
// message (app/api/logos/chat/route.ts) — so "the system prompt" of a call is
// every system message, in order, and "the conversation" is the rest.

/** Every system message of a call, joined in order. */
export const systemOf = (call) =>
  (call?.messages ?? [])
    .filter((m) => m?.role === 'system')
    .map((m) => String(m.content ?? ''))
    .join('\n\n');

/** The person's and Socria's turns of a call, without the system messages. */
export const turnsOf = (call) => (call?.messages ?? []).filter((m) => m?.role !== 'system');
