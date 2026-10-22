// lib/new-socria.ts — THE NEW SOCRIA, BEHIND ITS CODE.
//
// Logos 5 (docs/LOGOS-5.md) is the new Socria: the Universal Map as home, the
// map as the screen, the Core chats brought into it, and "We killed the
// chatbot." to whoever used the one before. It ships to production behind an
// access code — the 'socria' feature gate (lib/feature-gates.ts), entered
// under Manage Account and checked on the server, so the code never reaches
// the browser. Whoever has not entered it keeps the Logos they had, in its
// Logos 4 layout: exactly what NEXT_PUBLIC_LOGOS5=off gives a deployment,
// decided per person instead.
//
// What stays the same either way: every conversation, map, model and memory —
// the gate chooses a screen, and nothing is moved, hidden or rewritten for
// somebody it has not opened for.

import { LOGOS5 } from './logos5/flags';
import { gateOpen, type GateId } from './feature-gates';

export const NEW_SOCRIA_GATE: GateId = 'socria';

/** Whether this browser has the new Socria: the deployment offers it and its code was entered. */
export function newSocriaOpen(store?: Pick<Storage, 'getItem'> | null): boolean {
  return LOGOS5.on && gateOpen(NEW_SOCRIA_GATE, store);
}

/** What the Logos surface is called for somebody: Logos 5 with the new Socria, Logos 4 without. */
export function logosName(newSocria: boolean): 'Logos 5' | 'Logos 4' {
  return newSocria ? 'Logos 5' : 'Logos 4';
}
