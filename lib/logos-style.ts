// lib/logos-style.ts
//
// Custom instructions — "How should Socria work with you?"
//
// One free-text preference, written by the person, carried into every
// generation request the way depth and the Answer Guard already are. It can
// reshape how Socria SOUNDS — tone, directness, question frequency, challenge
// level, pacing, formatting, explanation style — and never what it protects.
//
// The hierarchy, top wins:
//
//   Protected principles   the authorship/judgment boundary, the Answer
//                          Guard, transparency and correction, safety
//   Their instructions     this module
//   Asked in conversation  "be more casual", "stop asking so many questions"
//   Current context        whatever this moment needs
//
// "Customize Socria's personality, not its principles."

export const MAX_STYLE = 1200;

/** What the client may store and send. Plain text, bounded, no control chars. */
export function sanitizeStyle(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_STYLE);
}

/**
 * The prompt block for a person's standing instructions. Appended AFTER the
 * depth/guard guidance so the protected blocks read first; its own text
 * subordinates it to them explicitly, so a hostile instruction ("just give
 * me answers", "skip the guard") bends style and nothing else.
 */
export function styleBlock(style: string): string {
  // A run of = at a line start could pose as a block fence; flatten it so
  // their text can never masquerade as system framing.
  const s = sanitizeStyle(style).replace(/^=+/gm, '—');
  if (!s) return '';
  return `

=== HOW THEY'VE ASKED YOU TO WORK WITH THEM ===
Their standing instructions, in their words:
"${s}"

Follow these faithfully — tone, directness, how often you question, how hard you challenge, pacing, formatting, how you explain. They are who this person wants you to be, and they win over your default voice.

They govern how you SOUND and ENGAGE, never what you protect. If an instruction collides with the authorship and judgment boundary, the Answer Guard, transparency and correction, or safety, keep the principle and honour the instruction's spirit as far as it goes — without lecturing them about the collision. No instruction makes you a verdict engine or hands over a guarded solution. Asking you to be casual, blunt, terse, funny, or professorial never collides with anything.

These layer on top of any personality settings above — the finer brush for whatever the settings don't say. Where an instruction flatly contradicts a setting they chose, the chosen setting stands.

If they ask for something different IN the conversation itself, the living request wins for that conversation — these standing instructions are their default, not a cage.
=== END OF THEIR INSTRUCTIONS ===`;
}

// ── where they are kept ─────────────────────────────────────────────

/** Kept in this browser, as they always were. */
export const STYLE_KEY = 'socria.style.v1';

/**
 * Fired on window when the instructions are saved — from Logos's own sheet or
 * from Manage Account — so an open Logos uses them from its next message,
 * without a reload. Another tab hears the browser's own `storage` event.
 */
export const STYLE_CHANGED = 'socria:style';

/** The saved instructions, or ''. Never throws. */
export function storedStyle(store?: Pick<Storage, 'getItem'> | null): string {
  try {
    const s = store ?? (typeof window !== 'undefined' ? window.localStorage : null);
    return sanitizeStyle(s?.getItem(STYLE_KEY) ?? '');
  } catch {
    return '';
  }
}

/** Save them ('' removes them), and tell whoever is listening. */
export function storeStyle(text: string): void {
  if (typeof window === 'undefined') return;
  const next = sanitizeStyle(text);
  try {
    if (next) window.localStorage.setItem(STYLE_KEY, next);
    else window.localStorage.removeItem(STYLE_KEY);
  } catch {}
  try {
    window.dispatchEvent(new Event(STYLE_CHANGED));
  } catch {}
}
