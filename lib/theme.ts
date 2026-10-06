// lib/theme.ts
//
// THE THEMES A PERSON CAN READ SOCRIA IN.
//
// Paper is the product's own ground and stays the default. Dark is for
// everyone. White and the Socria One blue are part of One — choosing them is
// one of the things membership opens, the same way every depth is.
//
// A theme is a set of colour variables (app/themes.css re-declares the ones
// the app surfaces already read) and nothing else: no surface knows which
// theme it is in, so a new surface is themed by using the variables, and a
// theme is never a fork of a component.
//
// KEPT PER BROWSER, like the layout of Logos 3 and the hints you dismissed:
// it is how this screen looks to you, not part of your thinking, and it never
// travels with a conversation or into a shared room.
//
// APPLIED BEFORE FIRST PAINT. THEME_BOOT is an inline script in the root
// layout, so the page never flashes paper on its way to dark. It cannot know
// the plan, so a One theme on a browser whose membership has lapsed is put
// back to paper the moment the app knows (`effectiveTheme`).

export const THEME_IDS = ['paper', 'white', 'dark', 'one'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface Theme {
  id: ThemeId;
  label: string;
  /** one line, under the swatch */
  says: string;
  /** part of Socria One */
  one: boolean;
  /** the swatch: ground, then ink, then accent */
  swatch: [string, string, string];
  /** what the browser's own chrome (scrollbars, form controls) should match */
  scheme: 'light' | 'dark';
}

export const THEMES: Record<ThemeId, Theme> = {
  paper: { id: 'paper', label: 'Paper', says: 'Socria’s own ground', one: false, swatch: ['#F5F3EB', '#1F1F1F', '#5e7633'], scheme: 'light' },
  white: { id: 'white', label: 'White', says: 'Clean and bright', one: true, swatch: ['#FFFFFF', '#1A1A1A', '#4f6a2a'], scheme: 'light' },
  dark: { id: 'dark', label: 'Dark', says: 'Easy on the eyes at night', one: false, swatch: ['#191A17', '#ECE9DF', '#A9C27A'], scheme: 'dark' },
  one: { id: 'one', label: 'Socria One', says: 'The One blue', one: true, swatch: ['#13293A', '#F0EAD8', '#B8CDD9'], scheme: 'dark' },
};

export const THEME_KEY = 'socria.theme.v1';
/** Fired on window when the theme changes, so open surfaces can follow. */
export const THEME_CHANGED = 'socria:theme';

export const isTheme = (v: unknown): v is ThemeId => typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);

/** The theme to show: the chosen one, unless it is One's and this person is not a member. */
export function effectiveTheme(chosen: unknown, isOne: boolean): ThemeId {
  if (!isTheme(chosen)) return 'paper';
  return THEMES[chosen].one && !isOne ? 'paper' : chosen;
}

export function readTheme(store: Pick<Storage, 'getItem'> | null | undefined): ThemeId {
  try {
    const v = store?.getItem(THEME_KEY);
    return isTheme(v) ? v : 'paper';
  } catch {
    return 'paper';
  }
}

/** Put a theme on the document. Paper is the absence of one. */
export function applyTheme(id: ThemeId, doc: Document | null = typeof document !== 'undefined' ? document : null) {
  if (!doc) return;
  const el = doc.documentElement;
  if (id === 'paper') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', id);
  el.style.colorScheme = THEMES[id].scheme;
}

// What the app last learned about membership, for surfaces that do not know
// the plan themselves (ThemeScope on navigation). Unknown is trusted: the
// stored theme was gated when it was chosen.
let member: boolean | null = null;
export function setMembership(isOne: boolean) {
  member = isOne;
}
export const membership = () => member;

/** Choose a theme: remembered, applied, announced. Refuses a One theme for someone without One. */
export function chooseTheme(id: ThemeId, isOne: boolean): ThemeId {
  const shown = effectiveTheme(id, isOne);
  try {
    localStorage.setItem(THEME_KEY, shown);
  } catch {}
  // Remembered everywhere, shown only where the app is (THEMED_ROUTES).
  if (typeof location === 'undefined' || themeAppliesTo(location.pathname)) applyTheme(shown);
  try {
    window.dispatchEvent(new CustomEvent(THEME_CHANGED, { detail: shown }));
  } catch {}
  return shown;
}

/** The app's own routes — where a reader's theme applies. The journal, the docs and the pages about Socria keep their paper. */
export const THEMED_ROUTES = /^\/(chat|account|memory|projects|logos2-test)(\/|$)/;
export const themeAppliesTo = (pathname: string | null | undefined) => !!pathname && THEMED_ROUTES.test(pathname);

/**
 * The inline script for <head>. Plain ES5 over a literal list, so it runs
 * before anything else is parsed and cannot throw into the page.
 */
export const THEME_BOOT = `(function(){try{if(!${THEMED_ROUTES.toString()}.test(location.pathname))return;var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});var ok=${JSON.stringify(
  THEME_IDS.filter((t) => t !== 'paper')
)};if(ok.indexOf(t)>-1){var d=document.documentElement;d.setAttribute('data-theme',t);d.style.colorScheme=${JSON.stringify(
  Object.fromEntries(THEME_IDS.map((t) => [t, THEMES[t].scheme]))
)}[t];}}catch(e){}})();`;
