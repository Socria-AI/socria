// Where the chosen model is remembered.
//
// Logos is a model rather than a route: choosing it swaps the whole surface
// inside /chat. That makes "which model" a piece of state both surfaces have
// to agree on, and it lived as a bare localStorage key copied into each file.
//
// It also needs a second key. Leaving Logos means going back to the Core chat,
// and going back to core-2 every time would quietly demote anyone who was on
// Core 3.1 before they opened Logos — so the last Core model is remembered
// alongside the current one, and the way back reads that.
//
// AND A THIRD, which is the interesting one: whether the stored model is
// there because the PERSON picked it, or because we did. Everyone used to
// land on Core 2 — the model that needs no account — including people who
// had an account and people paying for the environment Core 2 is not. The
// product opened on its own weakest surface and waited to be corrected.
//
// Fixing that means defaulting by entitlement, and defaulting by entitlement
// is only safe if a real choice can be told apart from a default. Otherwise
// "open on their best surface" becomes "override what they asked for", which
// is worse than the bug.

import { SOCRIA_MODELS, type Readability, type ReplyLength, type SocriaModel } from './socria-prompt';

export const MODEL_KEY = 'socria.model.v1';
/**
 * Core 4's two communication settings, kept beside the model because they are
 * the same kind of thing: what this browser remembers about how Socria should
 * arrive. They live here rather than in the chat page because onboarding sets
 * them too — a person moves the dials during the introduction and the
 * conversation they land in is already written the way they asked for.
 *
 * An unreadable or unknown value is 'standard', never an error: whatever is in
 * localStorage was put there by some version of this app or by a person with
 * devtools open, and a preference is not worth a broken screen.
 */
export const READABILITY_KEY = 'socria.readability.v1';
export const LENGTH_KEY = 'socria.length.v1';
const LAST_CORE_KEY = 'socria.model.lastCore.v1';
/** Set only when the person picked from the menu — never when we resolved. */
const MODEL_CHOSEN_KEY = 'socria.model.chosen.v1';

function isModel(v: unknown): v is SocriaModel {
  // From the registry, not a hand-kept list — a new model is added in one
  // place. `soon` models (Core 4) are real ids but never selectable, so they
  // are excluded here: nothing should ever store one as the active model.
  return typeof v === 'string' && v in SOCRIA_MODELS && !SOCRIA_MODELS[v as SocriaModel].soon;
}

/**
 * Persist the current model WITHOUT claiming the person chose it.
 *
 * For the two writes that are ours rather than theirs: the downgrade when an
 * anonymous visitor has a Core 3 selection they can no longer use, and the
 * automatic default below once entitlement is known.
 */
export function rememberModel(model: SocriaModel): void {
  try {
    localStorage.setItem(MODEL_KEY, model);
    if (!SOCRIA_MODELS[model].logosSurface) localStorage.setItem(LAST_CORE_KEY, model);
  } catch {}
}

/**
 * Persist a model the person actually picked, and record that they did.
 *
 * Every route into this is a deliberate act — the model menu, the Try Logos
 * sheet, a `?model=` link they followed, the way out of Logos. From here on
 * their choice outranks the automatic one, in this browser, until they pick
 * something else.
 */
export function chooseModel(model: SocriaModel): void {
  rememberModel(model);
  try {
    localStorage.setItem(MODEL_CHOSEN_KEY, '1');
  } catch {}
}

/** Has this person picked a model themselves? */
export function modelWasChosen(): boolean {
  try {
    return localStorage.getItem(MODEL_CHOSEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function readReadability(): Readability {
  try {
    const raw = localStorage.getItem(READABILITY_KEY);
    return raw === 'simple' || raw === 'advanced' ? raw : 'standard';
  } catch {
    return 'standard';
  }
}

export function readLength(): ReplyLength {
  try {
    const raw = localStorage.getItem(LENGTH_KEY);
    return raw === 'concise' || raw === 'detailed' ? raw : 'standard';
  } catch {
    return 'standard';
  }
}

export function rememberReadability(v: Readability): void {
  try {
    localStorage.setItem(READABILITY_KEY, v);
  } catch {}
}

export function rememberLength(v: ReplyLength): void {
  try {
    localStorage.setItem(LENGTH_KEY, v);
  } catch {}
}

/** What is stored, or null when nothing usable is. */
export function readStoredModel(): SocriaModel | null {
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    return isModel(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * The model somebody opens on when they have not chosen one.
 *
 * Entitlement, not history. A member opens in the environment they are paying
 * for; everybody else opens on Core 3.1, including a visitor with no account.
 *
 * CORE 2 IS NO LONGER THE DOOR. It used to be the answer for anyone without
 * an account, because it was the model that needed none — and it retires on
 * 2 October. Keeping a weaker model alive purely to hold the door open would
 * have meant a signed-out person meeting the product at its worst, which is
 * the bug this function was written to fix in the first place. So the free
 * tier moved up rather than out: Core 3.1 is open signed out (see
 * `requiresAuth` in the registry), and what an account buys is Logos, Core 4,
 * memory across devices and more than one conversation.
 *
 * `hasAccount` is sign-in OR the typed access key — a key-holder is not a
 * stranger. It no longer decides Core 3.1, because nothing does; it is the
 * flag that keeps a Logos default from being handed to somebody who would be
 * bounced out of it.
 *
 * Pure, and separated from the storage above so the rule can be tested
 * without a browser — it is a policy, and policies are what drift.
 */
export function autoModel(opts: { hasAccount: boolean; isOne: boolean }): SocriaModel {
  return opts.isOne && opts.hasAccount ? 'logos' : 'core-3';
}

/** The Core model to return to when leaving Logos. */
export function lastCoreModel(): SocriaModel {
  try {
    const raw = localStorage.getItem(LAST_CORE_KEY);
    // Any real, selectable, non-Logos model — not a hand-written pair. Named
    // ids meant a Core added later was written to this key by rememberModel
    // and then silently thrown away on the way back, dropping the person on
    // Core 2 with no explanation.
    if (
      typeof raw === 'string' &&
      raw in SOCRIA_MODELS &&
      !SOCRIA_MODELS[raw as SocriaModel].soon &&
      !SOCRIA_MODELS[raw as SocriaModel].logosSurface
    ) {
      return raw as SocriaModel;
    }
  } catch {}
  // Core 3.1, not Core 2: the way out of Logos lands where the product now
  // opens, and Core 2 has a date on it.
  return 'core-3';
}
