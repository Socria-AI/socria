// lib/tour.ts
//
// The first-run tour: a few anchored notes, once, then never again.
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
  place: 'right' | 'left' | 'above' | 'below';
  title: string;
  /** one short sentence, with a single <em>. Ours, never anything typed. */
  body: string;
}

/**
 * STUPIDLY SIMPLE, ON PURPOSE. A few words each, one thing per note, and it
 * runs right after onboarding has sent their first thought — when they are
 * looking at Socria's first answer and the controls finally mean something.
 */
export const CORE_TOUR: TourStep[] = [
  { anchor: 'composer', place: 'above', title: 'Write here', body: 'Say what you are working through. <em>Socria asks back.</em>' },
  { anchor: 'model', place: 'above', title: 'Pick how it thinks', body: 'Core 4 talks it through. <em>Logos draws it as a map.</em>' },
  { anchor: 'sessions', place: 'right', title: 'It is all saved', body: 'Every conversation stays here, <em>in full.</em>' },
];

export const LOGOS_TOUR: TourStep[] = [
  { anchor: 'map', place: 'left', title: 'This is your map', body: 'What you say is drawn here <em>as you talk.</em>' },
  { anchor: 'card', place: 'below', title: 'Tap any card', body: 'Explore it, challenge it, <em>or ask about it.</em>' },
  { anchor: 'composer', place: 'above', title: 'Keep talking', body: 'The map grows <em>with every message.</em>' },
  { anchor: 'model', place: 'above', title: 'Switch any time', body: 'Rather just talk it through? <em>Pick Core 4 here.</em>' },
];

/**
 * Logos 3's notes: the same map, then what is new — the one box that builds
 * as well as asks, and "+ View", where a model, its parameters or Live 3D
 * open beside the map. Four, like Logos 2's; the card note gives its place to
 * "+ View" because a card is the one thing a first map always teaches itself.
 */
export const LOGOS3_TOUR: TourStep[] = [
  { anchor: 'map', place: 'left', title: 'This is your map', body: 'What you say is drawn here <em>as you talk.</em>' },
  { anchor: 'composer', place: 'above', title: 'One box for everything', body: 'Ask, or say what to build. <em>It is built beside you.</em>' },
  { anchor: 'views', place: 'below', title: 'Open views beside it', body: 'A model, its parameters, Live 3D: <em>+ View.</em>' },
  { anchor: 'model', place: 'above', title: 'Switch any time', body: 'Rather just talk it through? <em>Pick Core 4 here.</em>' },
];

/** The chat's tour — what "Take the tour again" replays. */
export const TOUR_STEPS: TourStep[] = CORE_TOUR;

export const TOUR_KEY = 'socria.tour.v1';
export const LOGOS_TOUR_KEY = 'socria.tour.logos.v1';
export const ROMAN = ['i', 'ii', 'iii', 'iv', 'v'];

/**
 * Whether to run at all.
 *
 * ONBOARDING STARTS IT. It used to be held back from anybody who had just
 * come through onboarding — two lessons in one sitting — but onboarding now
 * sends their first thought for them, so the tour is what comes next: once
 * Socria's first answer is on screen, the notes name the few controls they
 * will actually use. Otherwise it runs only when asked for (Manage Account).
 */
export function shouldRunTour(c: {
  /** this tour's key is already written */
  done: boolean;
  /** not asked: a signed-out visitor's tour simply skips what they cannot see */
  signedIn?: boolean;
  /** they arrived straight from /onboarding this session */
  justOnboarded: boolean;
  /** a sheet or modal already owns the screen */
  blocked: boolean;
}): boolean {
  return c.justOnboarded && !c.done && !c.blocked;
}

/**
 * WHERE THE NOTE GOES: beside the control, never on top of it.
 *
 * It used to be placed a fixed 150px above the control, and the note is
 * taller than that — so "Write here" sat over the very composer it was
 * naming, and the model chip was hidden under its own note. This takes the
 * note's MEASURED size, tries the side the step asked for, then the opposite
 * side, then the two others, and takes the first that fits the window
 * without touching the control. Only when nothing fits (a phone, a huge
 * control) does it fall back to the clamped preferred side.
 */
export type Side = TourStep['place'];
export interface Rect { x: number; y: number; w: number; h: number }
const OPPOSITE: Record<Side, Side> = { above: 'below', below: 'above', left: 'right', right: 'left' };
export function placeNote(
  box: Rect,
  want: Side,
  note: { w: number; h: number },
  view: { w: number; h: number },
  gap = 18,
  margin = 16
): { x: number; y: number; side: Side } {
  const clampX = (x: number) => Math.min(Math.max(margin, x), Math.max(margin, view.w - note.w - margin));
  const clampY = (y: number) => Math.min(Math.max(margin, y), Math.max(margin, view.h - note.h - margin));
  const at = (side: Side) => {
    if (side === 'above') return { x: clampX(box.x + box.w / 2 - note.w / 2), y: box.y - gap - note.h, side };
    if (side === 'below') return { x: clampX(box.x + box.w / 2 - note.w / 2), y: box.y + box.h + gap, side };
    if (side === 'right') return { x: box.x + box.w + gap, y: clampY(box.y), side };
    return { x: box.x - gap - note.w, y: clampY(box.y), side };
  };
  const fits = (p: { x: number; y: number }) =>
    p.x >= margin - 0.5 && p.y >= margin - 0.5 && p.x + note.w <= view.w - margin + 0.5 && p.y + note.h <= view.h - margin + 0.5;
  const order: Side[] = [want, OPPOSITE[want], ...(['above', 'below', 'right', 'left'] as Side[]).filter((s) => s !== want && s !== OPPOSITE[want])];
  for (const side of order) {
    const p = at(side);
    if (fits(p)) return p;
  }
  const p = at(want);
  return { x: clampX(p.x), y: clampY(p.y), side: want };
}

/** The next index, or null when the tour is over. */
export function nextStep(i: number, n: number = TOUR_STEPS.length): number | null {
  return i + 1 < n ? i + 1 : null;
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
