// lib/feature-gates.ts
//
// FEATURE GATES — what a code entered under Manage Account opens.
//
// Some surfaces ship to production before they are open to everyone: Logos 3
// is listed only for people who have entered its code. The code is checked on
// the server (app/api/access/gate/route.ts), so it never ships in the browser
// bundle; what the browser keeps is only the fact that a gate was opened —
// in this browser (localStorage) and, for an account, on the account itself
// (Clerk unsafeMetadata.access), so it follows the person to another device.
//
// A gate is about what a menu offers, not a security boundary: every route
// behind Logos 3 is the Logos 2 engine, gated as Logos 2 is.

export const GATE_IDS = ['logos3'] as const;
export type GateId = (typeof GATE_IDS)[number];

export const GATE_LABEL: Record<GateId, string> = { logos3: 'Logos 3' };

export const GATE_KEY = 'socria.access.v1';
/** Fired on window when a gate opens, so open menus re-read what they offer. */
export const GATE_CHANGED = 'socria:access';

export const isGate = (v: unknown): v is GateId => typeof v === 'string' && (GATE_IDS as readonly string[]).includes(v);

/** The gates this browser holds. Never throws. */
export function openGates(store?: Pick<Storage, 'getItem'> | null): GateId[] {
  try {
    const s = store ?? (typeof window !== 'undefined' ? window.localStorage : null);
    const raw = s ? JSON.parse(s.getItem(GATE_KEY) || '[]') : [];
    return Array.isArray(raw) ? raw.filter(isGate) : [];
  } catch {
    return [];
  }
}

export const gateOpen = (id: GateId, store?: Pick<Storage, 'getItem'> | null) => openGates(store).includes(id);

/** Remember an opened gate in this browser, and tell whoever is listening. */
export function rememberGate(id: GateId) {
  if (typeof window === 'undefined') return;
  const next = [...new Set([...openGates(), id])];
  try {
    window.localStorage.setItem(GATE_KEY, JSON.stringify(next));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(GATE_CHANGED, { detail: id }));
  } catch {}
}

/** The gates an account carries, from Clerk's unsafeMetadata. */
export function accountGates(meta: unknown): GateId[] {
  const access = (meta as { access?: unknown } | null | undefined)?.access;
  return Array.isArray(access) ? access.filter(isGate) : [];
}

/** A typed code, as compared: case and surrounding space never matter. */
export const normalizeCode = (raw: unknown) => (typeof raw === 'string' ? raw.trim().toUpperCase().replace(/\s+/g, '') : '');
