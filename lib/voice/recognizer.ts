// lib/voice/recognizer.ts — WHAT THE TWO RECOGNISERS SAY, READ THE SAME WAY.
//
// Socria Voice hears through one of two recognisers (lib/voice/speech.ts
// VoiceEngine), and each reports in its own terms: the browser's own as a
// list of results, some final and some still changing, and error codes
// ("no-speech", "network", "not-allowed"…); Socria's transcription as an HTTP
// answer. These read both into what the panel shows and what Voice does next
// — the words heard so far, whether an error is the end of listening or a
// moment to start again, whether the other recogniser could do better —
// so components/logos5/useSocriaVoice.ts only has to do it.
//
// PURE.

import type { VoiceEngine } from './speech';

export type VoiceErrorKind = 'permission' | 'no-mic' | 'network' | 'unsupported' | 'service' | 'transcribe' | 'limit' | 'signed-out' | 'stalled';

export interface VoiceProblem {
  kind: VoiceErrorKind;
  message: string;
  /** the other recogniser might work where this one did not */
  switchable: boolean;
  /** trying again could work as it is */
  retryable: boolean;
}

// ── the browser's recogniser ─────────────────────────────────────────

export interface AlternativeLike {
  transcript: string;
}
export interface ResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [i: number]: AlternativeLike | undefined;
}

/** The words of one recognition so far: what is settled, and what is still being heard. */
export function readResults(results: ArrayLike<ResultLike> | null | undefined): { finals: string; interim: string } {
  let finals = '';
  let interim = '';
  const n = results?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const r = results![i];
    const t = r?.[0]?.transcript ?? '';
    if (!t) continue;
    // some phones hand each result as everything said so far, not the next words: the longer one stands for both
    if (r.isFinal) finals = finals && t.trim().toLowerCase().startsWith(finals.trim().toLowerCase()) ? t : join(finals, t);
    else interim = join(interim, t);
  }
  return { finals: finals.trim(), interim: interim.trim() };
}

const join = (a: string, b: string) => (a && !/\s$/.test(a) && !/^\s/.test(b) ? `${a} ${b}` : a + b);

/** Everything heard in a recognition, settled or not — what a turn says when it ends. */
export function heardOf(r: { finals: string; interim: string }): string {
  return join(r.finals, r.interim).replace(/\s+/g, ' ').trim();
}

/**
 * The browser recogniser's error, read: null when it is ordinary and listening
 * simply starts again (a stretch of silence, a stop asked for), else the
 * problem to show.
 */
export function browserProblem(code: string | null | undefined): VoiceProblem | null {
  switch (code) {
    case 'no-speech':
    case 'aborted':
      return null;
    case 'not-allowed':
      return { kind: 'permission', message: 'Microphone access is blocked. Allow it for this site in your browser’s settings, then try again.', switchable: false, retryable: true };
    case 'service-not-allowed':
      return { kind: 'service', message: 'This browser’s speech recognition is turned off or not allowed here.', switchable: true, retryable: false };
    case 'audio-capture':
      return { kind: 'no-mic', message: 'No microphone was found, or another app is using it.', switchable: false, retryable: true };
    case 'network':
      return { kind: 'network', message: 'Your browser’s speech service couldn’t be reached. Check the connection, or use Socria’s transcription instead.', switchable: true, retryable: true };
    case 'language-not-supported':
      return { kind: 'unsupported', message: 'Your browser’s speech recognition doesn’t support this language.', switchable: true, retryable: false };
    default:
      return { kind: 'service', message: 'Speech recognition stopped unexpectedly.', switchable: true, retryable: true };
  }
}

/** Restarts in this window without a word heard are a recogniser that cannot listen here, not one to keep starting. */
export const RESTART_WINDOW_MS = 15_000;
export const MAX_QUIET_RESTARTS = 6;

/** May the browser recogniser be started again, given when it was last started (only starts since anything was heard count)? */
export function mayRestart(starts: readonly number[], now: number): boolean {
  return starts.filter((t) => now - t < RESTART_WINDOW_MS).length < MAX_QUIET_RESTARTS;
}

export const STALLED: VoiceProblem = { kind: 'stalled', message: 'Your browser’s speech recognition keeps stopping here.', switchable: true, retryable: true };

/** How long to wait before starting again: a little longer each time it stops without hearing anything. */
export function restartDelay(quietRestarts: number): number {
  return Math.min(2000, 120 * 2 ** Math.max(0, quietRestarts));
}

// ── Socria's transcription ───────────────────────────────────────────

export type TranscribeOutcome = { ok: true; text: string } | { ok: false; silent: true } | { ok: false; silent: false; problem: VoiceProblem; retryAfterMs?: number };

/** /api/transcribe's answer to one turn, read. A recording with no words in it is said nothing about: it was a noise. */
export function transcribeOutcome(status: number, body: { text?: unknown; error?: unknown } | null, retryAfter?: string | null): TranscribeOutcome {
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (status >= 200 && status < 300 && text) return { ok: true, text };
  if (status === 422 || (status >= 200 && status < 300)) return { ok: false, silent: true };
  const said = typeof body?.error === 'string' && body.error ? body.error : null;
  if (status === 429) {
    const s = Number(retryAfter);
    return {
      ok: false,
      silent: false,
      problem: { kind: 'limit', message: 'Transcription is busy — Voice will try that again in a moment.', switchable: true, retryable: true },
      retryAfterMs: Math.min(30_000, Math.max(2000, Number.isFinite(s) && s > 0 ? s * 1000 : 8000)),
    };
  }
  if (status === 401 || status === 403)
    return { ok: false, silent: false, problem: { kind: 'signed-out', message: 'Socria’s transcription is for signed-in accounts. Sign in, or use your browser’s speech recognition.', switchable: true, retryable: false } };
  if (status === 503) return { ok: false, silent: false, problem: { kind: 'unsupported', message: said ?? 'Socria’s transcription isn’t available here.', switchable: true, retryable: false } };
  return { ok: false, silent: false, problem: { kind: 'transcribe', message: said ?? 'That couldn’t be transcribed.', switchable: true, retryable: true } };
}

/** The recogniser to offer instead, when one fails: the other one, if this browser has it. */
export function otherEngine(now: VoiceEngine | null, has: { browser: boolean; socria: boolean }): VoiceEngine | null {
  const other: VoiceEngine = now === 'browser' ? 'socria' : 'browser';
  return has[other] ? other : null;
}
