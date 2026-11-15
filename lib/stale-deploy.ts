// lib/stale-deploy.ts — A TAB LEFT OPEN ACROSS A DEPLOY, MENDED BY LOADING THE NEW VERSION.
//
// A page already open keeps the code it loaded. Parts of it are only fetched when first needed: a panel loaded
// lazily, the next page's code. Once a new version is deployed, the old pieces are no longer served, so the open
// tab asks for code that is not there, and the failure surfaces in an error boundary as "This page stopped
// working" — on every navigation and every lazily loaded part, until the page is loaded again. "Try again" cannot
// mend it: drawing again asks for the same missing piece.
//
// So the error pages (app/error.tsx, app/global-error.tsx) recognise that failure and load the page fresh, once,
// which brings in the new version. A failure that persists after the reload is a real one: the guard below stops
// a second reload within a minute, and the page says what broke instead of looping.

/** The ways a browser reports code that could not be loaded: webpack's chunk loader, native dynamic import, and
 * webpack asked for a module the loaded chunks do not hold (an old page meeting a new build's code). */
const STALE: readonly RegExp[] = [
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Cannot read properties of undefined \(reading 'call'\)/i,
  /undefined is not an object \(evaluating '[^']*\.call'\)/i,
];

/** Is this the failure of an open page meeting a newer deploy (code it needed is no longer served)? */
export function isStaleDeployError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: unknown; message?: unknown };
  const text = `${typeof e.name === 'string' ? e.name : ''} ${typeof e.message === 'string' ? e.message : ''}`;
  return STALE.some((re) => re.test(text));
}

const KEY = 'socria.reloaded-for-update';
/** How long after a reload for this reason another is refused, so a failure that is not a stale page never loops. */
export const RELOAD_GUARD_MS = 60_000;

/**
 * Load the page fresh, once: true when a reload was started, false when one already happened within the last
 * minute (the failure is real, and the page should say so) or the browser keeps no session storage.
 */
export function reloadForUpdate(now: number = Date.now(), win: Pick<Window, 'location' | 'sessionStorage'> = window): boolean {
  try {
    const last = Number(win.sessionStorage.getItem(KEY) || 0);
    if (last && now - last < RELOAD_GUARD_MS) return false;
    win.sessionStorage.setItem(KEY, String(now));
  } catch {
    // no session storage (a private window, storage blocked): without the guard a reload could loop, so do not
    return false;
  }
  win.location.reload();
  return true;
}
