// lib/memory-voice.ts
//
// The voice of everything Socria saves about a person.
//
// Saved memory is not private notes. It is shown back to the person on the
// Memory page and in "What Socria remembers", and a line reading "The user
// wants to be an entrepreneur" reads as a file kept on them. So every
// writer — the thread memory, the Thinking Journey, the Mind Graph — writes
// TO the person, in the second person: "You want to be an entrepreneur".
//
// That makes "you" mean two different people inside a system prompt: the
// model being instructed, and the person whose memory it is. So every block
// that feeds saved lines back to a model carries SAVED_VOICE_READING, which
// says which one it is.

/** For the extractors: how to phrase anything that gets saved. */
export const SAVED_VOICE_RULE =
  'VOICE. Everything you write here is saved and shown to the person, so write it TO them, in the second person: ' +
  '"You want to build a company long term", "You can\'t move before the lease ends in June", ' +
  '"You keep weighing security against freedom". Never "the user", "the person", "they", "he", "she", ' +
  'or their name as the subject, and never "User:" or "Person:" prefixes.';

/** For the readers: which "you" the saved lines mean. */
export const SAVED_VOICE_READING =
  'These lines are written TO the person, so "you" in them means the person, not you.';
