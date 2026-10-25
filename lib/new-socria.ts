// lib/new-socria.ts — THE NEW SOCRIA, BEHIND ITS CODE.
//
// Logos 5 (docs/LOGOS-5.md) is the new Socria: the Universal Map as home, the
// map as the screen, the Core chats brought into it, and "We killed the
// chatbot." to whoever used the one before. It shipped to production behind
// an access code — the 'socria' feature gate (lib/feature-gates.ts), entered
// under Manage Account and checked on the server, so the code never reaches
// the browser.
//
// SINCE 25 OCTOBER 2026 THE CODE CHOOSES NO SCREEN. Logos 5 is everybody's —
// guests included — and the Logos 4 layout it once kept for whoever had not
// entered the code was archived with the Core chat (docs/ARCHIVE.md). The
// code still opens /logos-5-internal; what is read here only names the
// surface, for a picker no page mounts now.

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
