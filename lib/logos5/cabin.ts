// lib/logos5/cabin.ts — BIG-SCREEN MODE: Logos on a car's centre screen, parked, or on any large touchscreen.
//
// The same Logos — the same lines of thinking, maps, artifacts and words — laid
// out for a finger at arm's length: a dock down the left for where things are
// (the Universal Map, the line of thinking's four views, Write, Memory), the
// Logic Map as the screen a line of thinking opens on, its cards drawn larger,
// every control a thumb's width, and the box to say a thought in floating over
// the map. Nothing in it reads or controls the car: it is a web page in the
// car's browser, for when the car is parked.
//
// On when the browser is a car's own (Tesla's says "Tesla/<version>" in its
// user agent; its older one said "QtCarBrowser"), or when asked for —
// `?bigscreen=1` in the address, or from the ⋯ menu — and the choice is kept
// in this browser, either way, until it is changed.
//
// PURE (the storage is passed in).

export type CabinChoice = 'on' | 'off' | null;

export const CABIN_KEY = 'socria.bigscreen.v1';
/** the one-time word that it is for when the car is parked, once said */
export const PARKED_NOTE_KEY = 'socria.bigscreen.parked.v1';

/** A car's own browser, by what it says it is. */
export function isCarBrowser(ua: string | null | undefined): boolean {
  return /\bTesla\/\d|QtCarBrowser/i.test(ua ?? '');
}

/** `?bigscreen` (or `=1`, `on`, `true`) turns it on, `?bigscreen=0` (or `off`, `false`) off; anything else says nothing. */
export function choiceFromQuery(search: string | null | undefined): CabinChoice {
  const m = /[?&]bigscreen(?:=([^&#]*))?(?=[&#]|$)/i.exec(search ?? '');
  if (!m) return null;
  let v: string;
  try {
    v = decodeURIComponent(m[1] ?? '').toLowerCase();
  } catch {
    return null;
  }
  if (v === '1' || v === 'on' || v === 'true' || v === '') return 'on';
  if (v === '0' || v === 'off' || v === 'false') return 'off';
  return null;
}

/** On or off: what the address asks for, else what was chosen before, else whether this is a car's browser. */
export function cabinOn(o: { ua?: string | null; query?: CabinChoice; stored?: CabinChoice }): boolean {
  if (o.query) return o.query === 'on';
  if (o.stored) return o.stored === 'on';
  return isCarBrowser(o.ua);
}

type Store = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;

export function readCabinChoice(store: Store): CabinChoice {
  try {
    const v = store?.getItem(CABIN_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

export function writeCabinChoice(store: Store, choice: 'on' | 'off'): void {
  try {
    store?.setItem(CABIN_KEY, choice);
  } catch {
    /* kept for this visit only */
  }
}

/**
 * How large the Logic Map is drawn: a few cards are fitted up to this — half as
 * large again as on a desk — and a big map is never fitted smaller than the
 * floor, so a card stays readable and pressable from the driver's seat.
 */
export const CABIN_FIT_MAX = 1.5;
export const CABIN_MIN_K = 0.75;

/** The dock's places, in order: where you are, and the line of thinking's four views. */
export const CABIN_PLACES = [
  { id: 'map', label: 'Map', says: 'Every line of thinking' },
  { id: 'logic_map', label: 'Thinking', says: 'This one’s Logic Map' },
  { id: 'chat', label: 'Chat', says: 'The conversation' },
  { id: 'artifacts', label: 'Artifacts', says: 'What was made' },
  { id: 'content', label: 'Content', says: 'What you brought' },
] as const;
export type CabinPlace = (typeof CABIN_PLACES)[number]['id'];
