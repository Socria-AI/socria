// lib/tour.ts
//
// The first-run tour: four anchored notes, once, then never again.
//
// ANCHORED BY data-tour, NOT BY STYLE. The design named its targets with
// CSS classes — `.s-list`, `.mp-btn`, `.cp-wrap textarea` — which works in a
// static mockup and is a trap in a real app: this product's chat is built
// from Tailwind utilities, so there are no stable class names to point at,
// and any that looked stable would be one restyle away from pointing at
// nothing. A tour whose arrow drifts onto the wrong control is worse than no
// tour. So each step names a `data-tour` attribute, which exists for exactly
// this and changes only when somebody means to change it.
//
// Pure, because what goes wrong here is never the drawing. It is running
// twice, running for somebody who has already been taught, running against a
// control that is not on screen, or refusing to stop.

export interface TourStep {
  /** the value of the data-tour attribute to ring */
  anchor: string;
  place: 'right' | 'above' | 'below';
  title: string;
  /** one sentence, with a single <em>. Ours, never anything typed. */
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    anchor: 'sessions', place: 'right',
    title: 'Your sessions',
    body: 'Every thought session stays here, in full. <em>Nothing is deleted to make room</em> for something newer.',
  },
  {
    anchor: 'composer', place: 'above',
    title: 'Say the real thing',
    body: 'Not a prompt. A sentence about what you are actually trying to work out — <em>it reads for the claim underneath.</em>',
  },
  {
    anchor: 'model', place: 'above',
    title: 'Model, and depth',
    body: 'One control, two questions: <em>which model answers, and how far it goes.</em>',
  },
  {
    anchor: 'account', place: 'below',
    title: 'Yours to take',
    body: 'Your account and your picture. Every map is exportable — or deletable — <em>the moment you decide.</em>',
  },
];

export const TOUR_KEY = 'socria.tour.v1';
export const ROMAN = ['i', 'ii', 'iii', 'iv', 'v'];

/**
 * Whether to run at all.
 *
 * The onboarding condition is the interesting one. /onboarding already walks
 * somebody through what Socria is FOR, on their own sentence, and this walks
 * them round the furniture. Both in one session is too much teaching for one
 * sitting, so a person who has just arrived from the beginning is left alone
 * and meets this on a later visit — which is also when the furniture starts
 * to matter.
 */
export function shouldRunTour(c: {
  done: boolean;
  signedIn: boolean;
  /** they arrived straight from /onboarding this session */
  justOnboarded: boolean;
  /** a sheet or modal already owns the screen */
  blocked: boolean;
}): boolean {
  return !c.done && c.signedIn && !c.justOnboarded && !c.blocked;
}

/** The next index, or null when the tour is over. */
export function nextStep(i: number): number | null {
  return i + 1 < TOUR_STEPS.length ? i + 1 : null;
}

/**
 * A rounded rectangle with a slight hand wobble, so the ring reads as drawn
 * rather than printed.
 *
 * The wobble is a pure function of the box rather than random: a ring that
 * re-wobbles on every scroll frame shimmers, and a ring that differs between
 * two renders of the same step looks like a bug in the drawing.
 */
export function inkRect(x: number, y: number, w: number, h: number, r = 7): string {
  const j = (n: number) => (((Math.sin((x + y + w + h + n * 37) * 12.9898) * 43758.5453) % 1) - 0.5) * 1.1;
  return (
    `M${x + r},${y + j(1)} L${x + w - r},${y + j(2)} Q${x + w},${y} ${x + w + j(3)},${y + r} ` +
    `L${x + w + j(4)},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h + j(5)} ` +
    `L${x + r},${y + h + j(6)} Q${x},${y + h} ${x + j(7)},${y + h - r} ` +
    `L${x + j(8)},${y + r} Q${x},${y} ${x + r},${y + j(1)} Z`
  );
}
