// lib/local-data.ts
//
// Everything this product leaves in a browser, and the one way to take it
// back out.
//
// Account deletion emptied the database and the Clerk user and stopped there.
// But a browser also holds conversations (`socria.conversations.v1`), Logos
// sessions, the imported AI profile, the derived journey, and the standing
// style — and on a shared device the next person to sign in inherited all of
// it. Worse, the sync-on-load paths would then push the deleted person's
// conversations up into the NEW account, which is both a privacy breach and a
// deletion that undid itself.
//
// A HARD-CODED LIST WOULD GO STALE, which is the exact failure that left
// `logos_usage` out of account deletion for months: adding a key and adding
// it to the cleanup are two separate acts and only one of them breaks
// anything. So this sweeps by PREFIX instead. Every key this product writes
// begins `socria.`; a key added tomorrow is covered without anybody
// remembering to come back here.

/** The prefix every key this product writes shares. */
export const SOCRIA_PREFIX = 'socria.';

/**
 * Keys that survive on purpose. They describe the BROWSER, not the person:
 * whether this device has seen the tour, and whether it prefers reduced
 * motion. Keeping them means a shared machine does not re-run onboarding at
 * the next person, and they say nothing about who was here.
 */
const KEEP = new Set<string>(['socria.tour.v1', 'socria.hints.seen.v1']);

function sweep(store: Storage): number {
  let removed = 0;
  // Collect first: removing while iterating by index skips entries.
  const doomed: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(SOCRIA_PREFIX) && !KEEP.has(k)) doomed.push(k);
  }
  for (const k of doomed) {
    try {
      store.removeItem(k);
      removed++;
    } catch {
      /* quota or a locked store; the rest still go */
    }
  }
  return removed;
}

/**
 * Forget this person on this device. Returns how many keys went, for tests.
 *
 * Called after account deletion and after sign-out. Safe to call anywhere:
 * a browser with storage blocked simply reports zero.
 */
/**
 * Give back the server-side unlock grant too.
 *
 * The grant is an httpOnly cookie, so script on the page cannot clear it —
 * only the server can, which is the point of httpOnly and also why it has to
 * be asked. Left in place it survived both sign-out and account deletion for
 * its full thirty days, so the next person on a shared device inherited an
 * unlock the deleted account had been given. Fire-and-forget: a failure here
 * must not stop somebody signing out.
 */
export function releaseAccessGrant(): void {
  if (typeof fetch === 'undefined') return;
  try {
    void fetch('/api/access/unlock', { method: 'DELETE', keepalive: true }).catch(() => {});
  } catch {
    /* nothing to do */
  }
}

export function clearSocriaLocalData(): number {
  if (typeof window === 'undefined') return 0;
  releaseAccessGrant();
  let n = 0;
  try {
    n += sweep(window.localStorage);
  } catch {
    /* private mode, or site data blocked */
  }
  try {
    n += sweep(window.sessionStorage);
  } catch {
    /* same */
  }
  return n;
}

/**
 * The narrower sweep behind "clear Socria's memory": what the product has
 * WORKED OUT about someone, not what they wrote.
 *
 * The imported profile belongs here and was missing. Clearing memory left
 * `socria.importedProfile.v1` in place, and the next page load pushed it
 * straight back to the server — so the button appeared to work and undid
 * itself within a reload.
 */
export const MEMORY_KEYS = [
  'socria.journey.v1',
  'socria.importedProfile.v1',
  'socria.personality.v1',
] as const;

export function clearLocalMemory(): void {
  if (typeof window === 'undefined') return;
  for (const k of MEMORY_KEYS) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* nothing to do */
    }
  }
}
