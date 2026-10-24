// lib/logos4/voice.ts — VOICE TO TEXT: SPEAK INTO THE COMPOSER.
//
// The mic records in the browser (MediaRecorder), /api/transcribe hands the
// audio to the model provider already in use (OpenAI) and returns words, and
// the words go into the composer where the person reads and edits them.
// NOTHING IS SENT BY ITSELF, and the audio is not kept anywhere: not in the
// database, not in storage, not in the message.
//
// The limits are set by what has to carry the audio, not by taste:
//   • two minutes — a thought, not a lecture; and at the recorder's speech
//     bitrate that stays well inside
//   • a 4 MB request body — what a serverless function accepts (Vercel's
//     ceiling is 4.5 MB; the margin is the multipart framing).
//
// PURE: shared by the route (app/api/transcribe), the hook
// (components/useVoiceInput.ts) and the tests.

export const MAX_RECORD_SECONDS = 120;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MIN_AUDIO_BYTES = 800;
export const MAX_TRANSCRIPT_CHARS = 8000;

/** What the recorder is asked for, in order: Chrome and Firefox take the first, Safari the mp4. */
export const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/mpeg'] as const;

/** The first type this browser can record, or '' to let it choose. */
export function pickRecorderType(isTypeSupported: ((t: string) => boolean) | undefined): string {
  if (!isTypeSupported) return '';
  for (const t of RECORDER_TYPES) {
    try {
      if (isTypeSupported(t)) return t;
    } catch {
      /* a browser that throws on the question can still record its default */
    }
  }
  return '';
}

const KINDS: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'video/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
};

/** The file extension the provider needs for an audio type, or null when it is not audio it takes. */
export function audioExtension(type: string | null | undefined): string | null {
  const base = String(type ?? '').split(';')[0].trim().toLowerCase();
  return KINDS[base] ?? null;
}

/** What a recording that cannot be sent is told, or null when it can go. */
export function audioRefusal(size: number, type: string | null | undefined): { status: number; error: string } | null {
  if (!audioExtension(type)) return { status: 415, error: 'That recording is in a format that can’t be transcribed.' };
  if (size > MAX_AUDIO_BYTES) return { status: 413, error: 'That recording is too long to transcribe. Keep it under two minutes.' };
  if (size < MIN_AUDIO_BYTES) return { status: 422, error: 'Nothing was recorded. Check the microphone and try again.' };
  return null;
}

/** The words back from the provider, tidied: one line per paragraph, no control characters, bounded. */
export function cleanTranscript(raw: unknown): string {
  const t = typeof raw === 'string' ? raw : '';
  // eslint-disable-next-line no-control-regex
  return t.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TRANSCRIPT_CHARS);
}

/**
 * Put the words where the caret is, with the spacing a person would type:
 * a space between them and what is already there, none at a line's start.
 * Returns the new text and where the caret goes (just after the words).
 */
export function insertSpoken(value: string, words: string, start = value.length, end = start): { text: string; caret: number } {
  const w = words.trim();
  if (!w) return { text: value, caret: Math.min(end, value.length) };
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(end, value.length));
  const before = value.slice(0, s);
  const after = value.slice(e);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && !/^[\s.,;:!?)]/.test(after) ? ' ' : '';
  const text = before + lead + w + trail + after;
  return { text, caret: before.length + lead.length + w.length };
}

/** A recorder error, in words a person can act on. */
export function micError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access is blocked. Allow it for this site in your browser’s settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The microphone is in use by another app.';
  return 'The microphone could not be started.';
}

// ── push to talk ─────────────────────────────────────────────────────
//
// The mic is held, not clicked: press and hold, talk, let go and the words
// arrive. Three things a hand does that a click never did, each decided here
// so the button stays simple and the rule can be tested:
//   • a tap — too short to have said anything — records nothing and says
//     "hold to talk" instead of transcribing half a second of silence;
//   • a slide off the button before letting go throws the recording away;
//   • the first hold of all raises the browser's permission prompt, and the
//     hand comes off to answer it: that hold records nothing either, and the
//     next one works.

/** Shorter than this is a tap, not speech. */
export const MIN_HOLD_MS = 350;
/** Dragged this far from where it was pressed, letting go cancels. */
export const SLIDE_CANCEL_PX = 64;

export type HoldOutcome = 'stop' | 'cancel' | 'tap' | 'later' | 'none';

/** What letting go of a held mic does, from where the recorder is and how the hand moved. */
export function holdOutcome(i: { state: string; heldMs: number; away: boolean }): HoldOutcome {
  if (i.state === 'asking') return 'later';
  if (i.state !== 'recording') return 'none';
  if (i.away) return 'cancel';
  return i.heldMs < MIN_HOLD_MS ? 'tap' : 'stop';
}

/** m:ss for the recording timer. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
