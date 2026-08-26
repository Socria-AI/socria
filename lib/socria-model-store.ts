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

import type { SocriaModel } from './socria-prompt';

export const MODEL_KEY = 'socria.model.v1';
const LAST_CORE_KEY = 'socria.model.lastCore.v1';

/** Persist the current model, and remember it as the Core one if it is one. */
export function rememberModel(model: SocriaModel): void {
  try {
    localStorage.setItem(MODEL_KEY, model);
    if (model !== 'logos') localStorage.setItem(LAST_CORE_KEY, model);
  } catch {}
}

/** The Core model to return to when leaving Logos. */
export function lastCoreModel(): SocriaModel {
  try {
    const raw = localStorage.getItem(LAST_CORE_KEY);
    if (raw === 'core-3' || raw === 'core-2') return raw;
  } catch {}
  return 'core-2';
}
