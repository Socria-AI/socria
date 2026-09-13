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

import type { SocriaModel } from './socria-prompt';

export const MODEL_KEY = 'socria.model.v1';
const LAST_CORE_KEY = 'socria.model.lastCore.v1';
/** Set only when the person picked from the menu — never when we resolved. */
const MODEL_CHOSEN_KEY = 'socria.model.chosen.v1';

function isModel(v: unknown): v is SocriaModel {
  return v === 'core-2' || v === 'core-3' || v === 'logos';
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
    if (model !== 'logos') localStorage.setItem(LAST_CORE_KEY, model);
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
 * for; anyone with an account opens on Core 3.1, which is the model Socria is
 * actually about; and only a visitor with neither opens on Core 2, which is
 * the one that works without an account.
 *
 * `canUseCore3` is sign-in OR the typed access key, because the key grants
 * exactly that and a key-holder is not a stranger.
 *
 * Pure, and separated from the storage above so the rule can be tested
 * without a browser — it is a policy, and policies are what drift.
 */
export function autoModel(opts: { canUseCore3: boolean; isOne: boolean }): SocriaModel {
  if (!opts.canUseCore3) return 'core-2';
  return opts.isOne ? 'logos' : 'core-3';
}

/** The Core model to return to when leaving Logos. */
export function lastCoreModel(): SocriaModel {
  try {
    const raw = localStorage.getItem(LAST_CORE_KEY);
    if (raw === 'core-3' || raw === 'core-2') return raw;
  } catch {}
  return 'core-2';
}
