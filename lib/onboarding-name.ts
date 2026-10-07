// lib/onboarding-name.ts
//
// WHAT THEY WANT TO BE CALLED — the first thing onboarding asks, optional.
//
// Kept in this browser (NAME_KEY), changeable in Manage Account, and given to
// Socria as one line so it can use it the way a person would: rarely. Because
// it is text the person typed and it reaches a prompt, it is held to a name's
// shape — letters, spaces, an apostrophe, a hyphen, a full stop — and to forty
// characters. Anything else is not a name and is not stored.
//
// PURE.

export const NAME_KEY = 'socria.name.v1';
const MAX = 40;

/** A name, or null. Trims, collapses spaces, refuses anything that is not name-shaped. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!s || s.length > MAX) return null;
  return /^\p{L}[\p{L}\p{M}' .\-’]*$/u.test(s) ? s : null;
}

export function readName(store?: Pick<Storage, 'getItem'> | null): string | null {
  try {
    const st = store ?? (typeof window !== 'undefined' ? window.localStorage : null);
    return sanitizeName(st?.getItem(NAME_KEY));
  } catch {
    return null;
  }
}

/** Store a name, or clear it when given nothing usable. */
export function writeName(name: string | null, store?: Pick<Storage, 'setItem' | 'removeItem'> | null): string | null {
  const clean = sanitizeName(name);
  try {
    const st = store ?? (typeof window !== 'undefined' ? window.localStorage : null);
    if (clean) st?.setItem(NAME_KEY, clean);
    else st?.removeItem(NAME_KEY);
  } catch {}
  return clean;
}

/** The line a reply is given — re-sanitised on the server, never trusted. */
export function nameBlock(raw: unknown): string {
  const n = sanitizeName(raw);
  if (!n) return '';
  return `\n\nWHAT THEY ASKED TO BE CALLED: ${n}. Use it the way a person would — rarely, and never to open every reply.`;
}
