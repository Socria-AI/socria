// lib/logos4/flags.ts — LOGOS 4'S FEATURES, EACH ONE SWITCHABLE.
//
// Every Logos 4 feature can be turned off for a deployment without a code
// change: set NEXT_PUBLIC_LOGOS4_<NAME>=off (or 0, false, no). A feature
// defaults ON only where it is complete and tested; one that is not is not
// drawn at all — never a control that looks as if it works.
//
// Read with literal `process.env.NEXT_PUBLIC_…` property names: Next.js inlines
// those into the client bundle at build time, and only those.
//
// Voice needs more than its flag: a transcription key on the server. The mic
// asks /api/transcribe whether it can work before it is drawn
// (components/useVoiceInput.ts).

const off = (v: string | undefined): boolean => /^(off|0|false|no)$/i.test((v ?? '').trim());

export interface Logos4Flags {
  /** select anything — a card, a bar, a cell, a passage, an expression — and ask about it */
  pointAsk: boolean;
  /** come back to the conversation, the selection and the half-typed message as they were */
  resume: boolean;
  /** a private inbox for a thought, a note or a photo, kept for later */
  capture: boolean;
  /** speak into the composer: transcribed, never sent by itself */
  voice: boolean;
}

export function readFlags(env: Record<string, string | undefined>): Logos4Flags {
  return {
    pointAsk: !off(env.pointAsk),
    resume: !off(env.resume),
    capture: !off(env.capture),
    voice: !off(env.voice),
  };
}

export const LOGOS4: Logos4Flags = readFlags({
  pointAsk: process.env.NEXT_PUBLIC_LOGOS4_POINT_ASK,
  resume: process.env.NEXT_PUBLIC_LOGOS4_RESUME,
  capture: process.env.NEXT_PUBLIC_LOGOS4_CAPTURE,
  voice: process.env.NEXT_PUBLIC_LOGOS4_VOICE,
});
