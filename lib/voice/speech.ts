// lib/voice/speech.ts — SOCRIA VOICE: WHAT A SPOKEN TURN IS, BEFORE IT IS A MESSAGE.
//
// Socria Voice (experimental) makes the whole of Logos 5 operable by speech.
// It is an input, not a second chatbot: every spoken turn becomes the same
// message a typed one is, sent through the same dispatcher (components/
// LogosApp.tsx send) to the same runtime — the commands it reads, Cognitive
// Allocation, MR, memory, the map pass, the artifacts — and Socria answers in
// text, in the conversation. Nothing is spoken back.
//
// What is only Voice's, and decided here so it can be tested:
//
//   settings    which recogniser (the browser's own, words appearing live;
//               or Socria's transcription, a sentence at a time, the one the
//               mic in the composer already uses), how long a pause ends a
//               turn, whether a finished turn is sent or put in the box, and
//               what speaking does while Socria is still answering
//   controls    the few things said to Voice itself rather than to Socria:
//               "stop" (the answer), "pause listening", "stop listening",
//               "scratch that" at the end of a turn, "yes"/"no" to a
//               confirmation, "start/stop dictating", "send" (when turns go to
//               the box), "what can I say"
//   steps       "open the Logic Map, then add a branch called cost" — split
//               into turns only when a part is one of the workspace's own
//               commands, so an ordinary sentence with "then" in it is never
//               cut in two
//
// PURE (storage is passed in).

export type VoiceEngine = 'browser' | 'socria';
export type Pace = 'quick' | 'normal' | 'patient';
export type WhileAnswering = 'hold' | 'interrupt';

export interface VoiceSettings {
  /** null until chosen: the browser's recogniser where there is one, else Socria's */
  engine: VoiceEngine | null;
  /** how long a pause ends a turn */
  pace: Pace;
  /** a finished turn is sent; off, it goes into the box to read and send */
  autoSend: boolean;
  /** speaking while Socria answers: hold the turn until it finishes, or stop the answer and send */
  whileAnswering: WhileAnswering;
  /** the first-use notice was read and Voice was started from it */
  consented: boolean;
}

export const DEFAULT_VOICE: VoiceSettings = { engine: null, pace: 'normal', autoSend: true, whileAnswering: 'hold', consented: false };

/** Silence that ends a turn. A pause shorter than this is a breath, and the turn goes on. */
export const ENDPOINT_MS: Record<Pace, number> = { quick: 900, normal: 1400, patient: 2300 };
/** The longest one turn may run before it is ended for them. */
export const MAX_TURN_MS = 60_000;
/** Listening with nothing said for this long turns Voice off: a microphone is not left open. */
export const IDLE_OFF_MS = 5 * 60_000;
/** The longest spoken turn kept, in characters. */
export const MAX_SPOKEN_CHARS = 2000;

const KEY = 'socria.voice.v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readVoiceSettings(storage: StorageLike | null | undefined): VoiceSettings {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? '{}') as Partial<Record<keyof VoiceSettings, unknown>>;
    return {
      engine: raw.engine === 'browser' || raw.engine === 'socria' ? raw.engine : null,
      pace: raw.pace === 'quick' || raw.pace === 'patient' ? raw.pace : 'normal',
      autoSend: raw.autoSend !== false,
      whileAnswering: raw.whileAnswering === 'interrupt' ? 'interrupt' : 'hold',
      consented: raw.consented === true,
    };
  } catch {
    return { ...DEFAULT_VOICE };
  }
}

export function writeVoiceSettings(storage: StorageLike | null | undefined, s: VoiceSettings): VoiceSettings {
  try {
    storage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* kept for this visit only */
  }
  return s;
}

/** The recogniser to use: the one chosen, if this browser has it; else the browser's live one; else Socria's. */
export function pickEngine(has: { browser: boolean; socria: boolean }, chosen: VoiceEngine | null): VoiceEngine | null {
  if (chosen && has[chosen]) return chosen;
  if (has.browser) return 'browser';
  if (has.socria) return 'socria';
  return null;
}

/** A spoken turn, as a message: spaces tidied, the first letter capitalised, kept to a length. */
export function cleanUtterance(text: string): string {
  // eslint-disable-next-line no-control-regex
  const t = String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, MAX_SPOKEN_CHARS);
}

/**
 * Told to Socria with a turn that was said (app/api/logos/chat), and only
 * then: one short block in the turn's own context, never in the cached prompt.
 * Speech recognition mishears, and guesses punctuation; the answer is still
 * read, not heard.
 */
export const SPOKEN_TURN =
  '\n\nTHIS TURN WAS SPOKEN (Socria Voice — speech recognition, not typing): a word may be misheard and the punctuation is guessed. Read it for what they meant; where a likely mishearing would change the meaning, say what you took it to mean, or ask. Answer in text as always — it is read on screen, not heard.\n';

// ── controls: what is said to Voice itself ───────────────────────────

export type Control = 'stop' | 'pause' | 'end' | 'yes' | 'no' | 'help' | 'dictate' | 'undictate' | 'send' | 'discard';

/** Words as a recogniser hands them over, compared without case, punctuation or apostrophes. */
export const plain = (s: string): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const PLEASE = String.raw`(?:(?:please|ok|okay|hey socria|socria)\s+)?`;
const TAIL = String.raw`(?:\s+(?:please|now|thanks|thank you))?`;
const whole = (body: string) => new RegExp(`^${PLEASE}(?:${body})${TAIL}$`);

const STOP = whole('stop|stop it|stop that|stop answering|stop talking|stop writing|stop the answer|wait|hold on|hang on|enough');
const PAUSE = whole('pause|pause listening|pause voice|pause the mic|pause the microphone|mute|mute the mic|mute the microphone');
const END = whole('stop listening|turn off voice|turn voice off|voice off|end voice|exit voice|close voice|switch off voice|thats all|that is all|im done|i am done');
const YES = whole('yes|yeah|yep|yup|confirm|confirmed|do it|go ahead|yes please|yes do it|sure|ok|okay|correct|thats right|that is right|please do');
const NO = whole('no|nope|cancel|cancel it|dont|do not|never mind|nevermind|no thanks|stop|leave it|keep it|no dont');
const HELP = whole('help|voice help|what can i say|what can i do|what can you do|show me the commands|show the commands|show voice commands|list the commands');
const DICTATE = whole('start dictating|start dictation|dictate|take dictation|dictate into my writing|dictate into my document|dictate into the document');
const UNDICTATE = whole('stop dictating|stop dictation|end dictation|end dictating|done dictating|finish dictating');
const SEND = whole('send|send it|send that|send now|send the message|send my message');
/** At the end of a turn, these throw the whole turn away: "…no, scratch that". */
const DISCARD_TAIL = /(?:^|\s)(?:scratch that|cancel that|never mind|nevermind|forget that|delete that turn)$/;

/**
 * What the turn says to Voice itself, or null when it is for Socria. Read
 * against what is happening: "yes" and "no" only answer a confirmation, and
 * the rest of the words of a turn thrown away by its tail are not sent.
 */
export function readControl(text: string, ctx: { confirming?: boolean; dictating?: boolean } = {}): { control: Control; rest: string } | null {
  const t = plain(text);
  if (!t) return null;
  if (ctx.confirming) {
    if (YES.test(t)) return { control: 'yes', rest: '' };
    if (NO.test(t)) return { control: 'no', rest: '' };
  }
  if (DISCARD_TAIL.test(t)) return { control: 'discard', rest: t.replace(DISCARD_TAIL, '').trim() };
  if (END.test(t)) return { control: 'end', rest: '' };
  if (PAUSE.test(t)) return { control: 'pause', rest: '' };
  if (STOP.test(t)) return { control: 'stop', rest: '' };
  if (HELP.test(t)) return { control: 'help', rest: '' };
  if (DICTATE.test(t)) return { control: 'dictate', rest: '' };
  if (UNDICTATE.test(t)) return { control: 'undictate', rest: '' };
  if (SEND.test(t)) return { control: 'send', rest: '' };
  return null;
}

// ── steps: one turn that is several commands ─────────────────────────

/** Where one step ends and the next begins, when the person says so. */
const STEP_SEP = /\s*(?:,\s*)?(?:\band then\b|\bthen\b|\bafter that\b|\bafterwards\b|\band next\b|;)\s*/i;
export const MAX_STEPS = 4;

/**
 * "Open the Logic Map, then add a branch called cost" — two of the workspace's
 * own commands, run one after the other. Split at "then", "after that", ";"
 * only when at least one part is a command the dispatcher reads (`isCommand`)
 * and every part is a real phrase: "if the rent goes up then I move" is a
 * sentence for Socria, whole. Split at a plain "and" only when every part is
 * a command. A part that is not a command goes to Socria as it was said.
 */
export function splitSteps(text: string, isCommand: (part: string) => boolean): string[] {
  const t = String(text ?? '').trim();
  // a whole turn that is one command ("remove rent and food") is not cut
  if (!t || isCommand(t)) return [t];
  const tidy = (p: string) =>
    p
      .replace(/^(?:and|so)\s+/i, '')
      .replace(/[.,;]+$/, '')
      .trim();
  const real = (parts: string[]) => parts.length >= 2 && parts.length <= MAX_STEPS && parts.every((p) => p.split(/\s+/).length >= 2);
  if (STEP_SEP.test(t)) {
    const parts = t.split(STEP_SEP).map(tidy).filter(Boolean);
    if (real(parts) && parts.some(isCommand)) return parts;
    return [t];
  }
  // "open the Logic Map and add a branch called cost": a plain "and" splits only when every part is a command
  const ands = t.split(/\s*,?\s+and\s+/i).map(tidy).filter(Boolean);
  if (real(ands) && ands.every(isCommand)) return ands;
  return [t];
}

// ── what Voice can be told, for its help card ────────────────────────

export const VOICE_HELP: readonly { group: string; says: readonly string[] }[] = [
  { group: 'Talk to Socria', says: ['Anything you would type — it is sent when you pause', '“…scratch that” at the end throws the turn away', '“Stop” stops an answer · “Try again”'] },
  {
    group: 'Move around',
    says: [
      '“Open the Logic Map” · “Go to Content” · “Show Artifacts”',
      '“Put the Logic Map beside” · “Close the split view”',
      '“Open the habit tracker” · “Open my rent conversation”',
      '“Go home” · “Go back” · “Start a new line of thinking” · “Open memory”',
      '“Search for rent” · “Open quick capture”',
    ],
  },
  {
    group: 'The Logic Map',
    says: [
      '“Add a branch called cost” · “Add another branch about time”',
      '“Select the rent idea” … “Challenge this”',
      '“Rename that to housing” · “Mark it as resolved” · “Remove the rent node”',
      '“Map this conversation” · “Synthesize” · “Save the map as an image”',
    ],
  },
  { group: 'Make and change', says: ['“Make a chart: rent 1200, food 400”', '“Make a custom artifact: a habit tracker”', '“Set servings to 6” · “Tick milk” · “Save this as a template”'] },
  {
    group: 'Your writing',
    says: ['“Start writing” · “Start dictating” … “Stop dictating”', '“Add a heading called Results” · “Type: …”', '“Make that a heading” · “Bold that” · “Change that heading to Methods”'],
  },
  {
    group: 'Anywhere',
    says: ['“Undo the last edit” · “Redo”', '“Shorter answers” · “More detail”', '“Capture: call the landlord” — kept for later', '“Pause listening” · “Stop listening” · “What can I say”'],
  },
];
