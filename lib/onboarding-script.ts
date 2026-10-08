// lib/onboarding-script.ts
//
// The handover from the first-run screen to a composer.
//
// WHAT THIS WAS. This module used to hold a rehearsed exchange: a table of
// regexes that chose a "question Socria asks back" for whatever somebody
// typed on /onboarding, so the introduction could show a reply without
// calling the model. That was onboarding-specific fake behaviour — a reply
// the product would never actually give — and it is gone. The first reply a
// person reads is the product's own, from the real engine, in the surface
// they land in. What remains is the one thing the introduction leaves
// behind: the sentence they wrote, carried into the composer so they are not
// asked to type it twice.
//
// Session storage, not local: this is for exactly one landing, and the chat
// clears it as it reads. The homepage door uses the same key for the same
// reason (components/journal/parts.tsx).

/** What the first-run screen hands to the chat, so they land in their own session. */
export const CARRY_KEY = 'socria.ob';

export interface Carried {
  text: string;
  /** the starting point they picked, if any — an id, never their words */
  intent: string | null;
  /** which composer it was written for; absent means the chat */
  surface?: 'core' | 'logos';
  /** which Logos, when they chose one in onboarding; absent means Logos 2 */
  model?: 'logos-2' | 'logos-3';
  /** send it on landing rather than leaving it in the composer — onboarding does */
  send?: boolean;
}

/** Leave the sentence for the next surface to pick up. Never throws. */
export function carry(store: Pick<Storage, 'setItem'> | null | undefined, c: Carried): void {
  try {
    store?.setItem(
      CARRY_KEY,
      JSON.stringify({
        text: c.text.slice(0, 2000),
        intent: c.intent ?? null,
        ...(c.surface ? { surface: c.surface } : {}),
        ...(c.model === 'logos-3' || c.model === 'logos-2' ? { model: c.model } : {}),
        ...(c.send ? { send: true } : {}),
      })
    );
  } catch {
    // A blocked store costs them the prefill, never the page.
  }
}

/**
 * Read it back, once.
 *
 * Total, and it CLEARS as it reads: the handover is for exactly one landing,
 * and a key that survives would re-prefill the composer every time somebody
 * opened the chat afterwards.
 */
export function takeCarried(store: Pick<Storage, 'getItem' | 'removeItem'>): Carried | null {
  try {
    const raw = store.getItem(CARRY_KEY);
    if (!raw) return null;
    store.removeItem(CARRY_KEY);
    const v = JSON.parse(raw) as Partial<Carried>;
    if (!v || typeof v.text !== 'string' || !v.text.trim()) return null;
    return {
      text: v.text.slice(0, 2000),
      intent: typeof v.intent === 'string' ? v.intent.slice(0, 80) : null,
      ...(v.surface === 'logos' || v.surface === 'core' ? { surface: v.surface } : {}),
      ...(v.model === 'logos-2' || v.model === 'logos-3' ? { model: v.model } : {}),
      ...(v.send === true ? { send: true } : {}),
    };
  } catch {
    return null;
  }
}
