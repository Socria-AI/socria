// Where the chosen model is remembered.
//
// Logos is a model rather than a route: choosing it swaps the whole surface
// inside /chat. That makes "which model" a piece of state both surfaces have
// to agree on, and it lived as a bare localStorage key copied into each file.
//
// It had a second key once, for the way back from Logos to the Core chat
// (the last Core model). The Core chat was archived on 24 October 2026
// (docs/ARCHIVE.md), so there is no way back to remember; whatever a browser
// still holds under it is never read.
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

import { isProduction } from './environment';
import { openGates, type GateId } from './feature-gates';
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
    if (!isModel(raw)) return null;
    // A MODEL THAT HAS BEEN WITHDRAWN IS NOT A CHOICE ANY MORE, and reading one
    // back would strand whoever last picked it on a surface the product no
    // longer offers. `withdrawnTo` says where they go instead — the successor if
    // there is one, and the automatic default otherwise.
    // A dev-only model read back on production is held back the same way.
    return isOffered(raw) ? raw : withdrawnTo(raw);
  } catch {
    return null;
  }
}

/**
 * Whether a model may be put in front of somebody as a choice.
 *
 * ONE RULE, IN ONE PLACE, because there is more than one menu. The Core
 * picker beside the composer is the obvious one; Logos carries its own, in its
 * own composer, listing the same registry. They disagreed — Logos's iterated
 * every key in `SOCRIA_MODELS` with no filter at all — which is how a model
 * that was held back stayed one click away on the surface that replaced it.
 *
 * `withdrawn` is held back and `soon` does not exist yet; neither is a thing
 * somebody can pick. A model that is merely gated by plan or sign-in IS
 * offered — it is shown with what it needs, which is the point of showing it.
 */
export function isOffered(model: SocriaModel, gates: readonly GateId[] = openGates()): boolean {
  const m = SOCRIA_MODELS[model];
  // A dev-only model is offered everywhere but production, and held back
  // there exactly as a withdrawn one is.
  // An earlier model kept under "Other models" stays a real choice — picked
  // there, remembered, and reached by a link — though retired from the main list.
  const kept = OTHER_MODELS.includes(model);
  return (kept || !m.withdrawn) && !m.soon && !(m.devOnly && isProduction()) && !(m.gate && isProduction() && !gates.includes(m.gate));
}

/**
 * The earlier models a picker listed under "Other models" by name alone, kept
 * for whoever wanted them. EMPTY since 24 October 2026: there is no picker and
 * no Core chat screen — Logos 5 is the one surface, and every earlier model is
 * archived (docs/ARCHIVE.md). Kept as the one place a model would be named to
 * come back as a choice.
 */
export const OTHER_MODELS: readonly SocriaModel[] = [];

/**
 * Whether any model waits behind a feature gate. While none does, an access
 * code has nothing to open, and Manage Account does not ask for one.
 */
export function anyModelGated(): boolean {
  return (Object.keys(SOCRIA_MODELS) as SocriaModel[]).some((m) => !!SOCRIA_MODELS[m].gate);
}

/** Every model a menu may show, in registry order. */
export function offeredModels(gates: readonly GateId[] = openGates()): SocriaModel[] {
  return (Object.keys(SOCRIA_MODELS) as SocriaModel[]).filter((m) => isOffered(m, gates));
}

/**
 * Where somebody goes when the model they were on has been withdrawn.
 *
 * The successor is found STRUCTURALLY rather than by name: a withdrawn Logos
 * surface hands over to another Logos surface that is offered, because that is
 * the same kind of experience. A withdrawn Core with no Core left on offer —
 * every Core, since the Core chat was archived — hands over to the Logos
 * surface, where its conversations now open. Null only when nothing at all is
 * offered.
 */
export function withdrawnTo(model: SocriaModel): SocriaModel | null {
  const from = SOCRIA_MODELS[model];
  const offered = offeredModels().filter((id) => id !== model);
  // a current model first; an earlier one only if nothing current is of the same kind
  const sameKind =
    offered.find((id) => !OTHER_MODELS.includes(id) && !!SOCRIA_MODELS[id].logosSurface === !!from.logosSurface) ??
    offered.find((id) => !!SOCRIA_MODELS[id].logosSurface === !!from.logosSurface);
  return sameKind ?? offered.find((id) => !!SOCRIA_MODELS[id].logosSurface) ?? null;
}

/**
 * The model somebody opens on when they have not chosen one.
 *
 * LOGOS 5, FOR EVERYBODY. It used to be decided by entitlement — a member on
 * the environment they paid for, everybody else on Core 3.1, the model that
 * needed no account — and before that everyone landed on Core 2. Since
 * 24 October 2026 there is one surface: Logos 5, free to start with a free
 * account, and every Core archived (docs/ARCHIVE.md). Somebody signed out
 * meets its sign-up cover rather than a different product.
 *
 * The options are kept so callers and tests that pass them still read the
 * rule: neither changes the answer now. Pure, and separated from the storage
 * above so the rule can be tested without a browser.
 */
export function autoModel(_opts?: { hasAccount: boolean; isOne: boolean }): SocriaModel {
  const want: SocriaModel = 'logos-3';
  // …unless that has been withdrawn, in which case whatever is offered of its
  // kind. Turning a model off stays one line in the registry.
  return SOCRIA_MODELS[want].withdrawn || !isOffered(want) ? (withdrawnTo(want) ?? want) : want;
}
