// lib/mind/logos-turn.ts
//
// LOGOS 3 REMEMBERS LIKE CORE 4 DOES — through the same Mind graph, the same
// recall() and remember() (lib/mind/pipeline.ts), with surface 'logos'. This
// file is the two decisions that sit in front of them, kept pure so they can
// be tested without a database:
//
//   whether a turn may be remembered at all, and how privately;
//   what text the extractor is given to read.
//
// THE PRIVACY RULE IS CORE 4'S, NOT A COPY OF IT. Core 4 reads each message
// with lib/core4/signals.ts and folds the result into the conversation's
// persistPolicy (lib/core4/merge.ts): "off the record" keeps nothing, "back
// on the record" lifts that, and a sensitive subject — a diagnosis, a
// divorce, a debt — makes the conversation conversation-only, which is
// written as `private` and therefore never comes back to Logos at all
// (lib/mind/types.ts, invariant 3). Logos has no Cognitive State row to keep
// that policy in, so it is re-derived from the whole conversation on every
// turn — the same reader, the same fold, the same answer.
//
// PURE.

import { readSignals } from '@/lib/core4/signals';

export type PersistPolicy = 'full' | 'conversation_only' | 'none';

/**
 * The policy a conversation has reached, read from what the person said in
 * it, in order. Mirrors the fold in lib/core4/merge.ts exactly.
 */
export function logosPersistPolicy(userTexts: readonly string[]): PersistPolicy {
  let p: PersistPolicy = 'full';
  for (const raw of userTexts) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const s = readSignals(raw);
    const prev: PersistPolicy = p;
    p = s.offRecord
      ? 'none'
      : s.onRecord
        ? prev === 'none'
          ? s.sensitive
            ? 'conversation_only'
            : 'full'
          : prev
        : prev === 'full' && s.sensitive
          ? 'conversation_only'
          : prev;
  }
  return p;
}

/** The turn as the extractor reads it — the same "User: … / Socria: …" Core sends. */
export function logosMemoryText(said: string, reply: string): string {
  const clip = (s: string, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
  return `User: ${clip(said, 4000)}\n\nSocria: ${clip(reply, 4000)}`;
}

/** An id off a request body, held to the shape a conversation id has. */
export function cleanId(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(v) ? v : null;
}
