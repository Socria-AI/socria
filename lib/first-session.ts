// lib/first-session.ts
//
// The first session, engineered.
//
// A person's first Logos session decides whether there is a second, and the
// blank composer is where most of them end. "Think out loud" is true and
// unhelpful: nobody arrives with a paragraph ready, and the three one-line
// starters that stand in for one send a sentence too thin to draw. The map
// that comes back has two nodes, the panel says "2 nodes", and the product
// has demonstrated nothing.
//
// So this module carries four COMPLETE first messages — a real person, in a
// real situation, at the length the extractor needs (40–90 words) to find a
// claim, the assumption it rests on, what the person values, what they are
// working within, and where those pull against each other. Five nodes of
// five kinds on the first turn is a map with a shape, and a shape is the
// thing worth coming back for.
//
// Two rules the rest of the code enforces, stated here because they are the
// point:
//
//   PREFILL, NEVER SEND. Pressing an opening puts the words in the composer
//   and puts the caret after them. The person edits or sends. A message that
//   goes out under their name without their hand on it is not their thinking,
//   and the map it draws is not theirs either.
//
//   NOT THE TOUR'S STORY. The TryLogosModal tour assembles a map from a job
//   offer and a raise. Someone who watched that and then meets the same
//   sentence on the intro learns that Socria knows one story. These four are
//   other people.
//
// The same resolver serves /explore's "Try this one →": a scenario's own
// first user turn is prefilled by id, so the conversation someone just read
// is the one they start.

/**
 * The first user turn of each /explore scenario, by id.
 *
 * Copied here rather than imported from app/explore/scenarios.ts on purpose:
 * this module ships to every branch, and not every branch carries the
 * Explore page. A link from /explore has to resolve on the deployment it
 * points at, and a branch without the page would otherwise fail to build
 * for want of a file it never shows. On branches that DO have the page, the
 * suite checks the two tables agree, so this cannot drift unnoticed.
 */
export const SCENARIO_STARTS: Record<string, string> = {
  research:
    'Two papers on whether remote work hurts junior developers. One says yes, one says no.',
  learning:
    'I can do the chain rule fine but I genuinely do not know what a derivative IS.',
  deciding: 'Offered a job. More money, bigger company. I keep going back and forth.',
  writing: 'Arguing to abolish grading in first-year courses. Six reasons, no idea what order.',
  creating:
    'My protagonist is meant to be sympathetic. Every reader finds her cold. Do not rewrite her.',
  core: 'I think I only want to do the PhD because I do not know what else to do.',
};

export interface Opening {
  id: string;
  /** what the card says, a few words */
  label: string;
  /** the complete first message, in the person's own voice */
  message: string;
  /** what Logos will look for in it — never a promise about the answer */
  shows: string;
}

/** The line above the openings. An invitation to edit, not a menu to obey. */
export const OPENING_LEAD = 'Start from this — change anything.';

/** The query parameter an opening or a scenario arrives under: /chat?start=<id>. */
export const START_PARAM = 'start';

/**
 * What `first_map_shaped` records as its `opening` when the first map did
 * not come from one of these: a scenario from /explore, or nothing at all.
 * Ids, never words — the event carries the shape of the start, not the text.
 */
export const OPENING_EXPLORE = 'explore';
export const OPENING_NONE = 'none';

/** A first map has a shape at this many nodes — the share moment, and the event. */
export const FIRST_MAP_NODES = 5;

/** localStorage: the first-map note has been shown to this person. */
export const FIRST_MAP_KEY = 'socria.firstMap.v1';

/** The one line at the share moment. It belongs to the drawing, not to One. */
export const FIRST_MAP_NOTE = 'That’s your thinking, drawn. Save it as an image.';

export const OPENINGS: Opening[] = [
  {
    id: 'limit',
    label: 'Why is a derivative a limit?',
    message:
      'I can differentiate almost anything you put in front of me, but I still do not understand why a derivative has to be a limit. My assumption is that the limit is a formality and the real thing is the slope. What I actually care about is understanding it, not the marks, but the exam is in three weeks and there is no time to rebuild calculus from scratch. Those two things are pulling against each other.',
    shows:
      'Logos will look for the concept underneath the formula, and the assumption you are treating as a fact.',
  },
  {
    id: 'two-sources',
    label: 'Two papers disagree',
    message:
      'I am writing a literature review and two papers flatly disagree about whether screen time harms teenagers’ sleep. I think the larger study is the more trustworthy one, mostly because it is larger. I am assuming they both measured sleep the same way, which I have not checked. I care more about getting this right than getting it finished, and the two are pulling against each other: the draft is due on Friday and I can only cite what I have actually read.',
    shows:
      'Logos will look for what each source actually measured, and where your claim outruns them.',
  },
  {
    id: 'middle',
    label: 'A middle that sags',
    message:
      'The middle of my novel sags. The opening works and I know the ending, but chapters eight to fourteen are people talking in kitchens. I keep assuming the fix is more plot, a death or a betrayal, yet what I value in the books I love is that nothing much happens and it still matters. I have promised myself no new characters this draft. So I am stuck between adding incident and trusting the quiet.',
    shows:
      'Logos will look for what you are assuming a middle has to do, and where that strains against what you value.',
  },
  {
    id: 'going-online',
    label: 'Taking the bakery online',
    message:
      'I run a small bakery and I want to start taking orders online. My belief is that a website will bring in customers we are not reaching, but I am assuming the people who buy from us would also happily order from a screen. What matters most to me is keeping the shop feeling like a place rather than a pickup counter. I have a small budget and nobody technical. More reach and the thing that makes us us seem to pull in opposite directions.',
    shows:
      'Logos will look for the constraint you are working within, and the assumption the whole plan leans on.',
  },
];

/** The opening with this id, or null. */
export function openingFor(id: string | null | undefined): Opening | null {
  if (!id) return null;
  return OPENINGS.find((o) => o.id === id) ?? null;
}

/**
 * The first message an id stands for: an opening's message, or a scenario's
 * first user turn. Unknown ids resolve to null rather than to a guess, so a
 * stale or mistyped link leaves the composer empty instead of putting words
 * in it that nobody chose.
 */
export function startMessage(id: string | null | undefined): string | null {
  if (!id) return null;
  const opening = openingFor(id);
  if (opening) return opening.message;
  return Object.prototype.hasOwnProperty.call(SCENARIO_STARTS, id) ? SCENARIO_STARTS[id] : null;
}

/**
 * What `first_map_shaped` should carry for a session that began from this
 * id. An opening's id is a token, not content; a scenario collapses to
 * 'explore' because the event is about the DOOR, not the exhibit; anything
 * else is 'none'. Never returns a message, a title, or an unknown string.
 */
export function openingValue(id: string | null | undefined): string {
  if (!id) return OPENING_NONE;
  if (openingFor(id)) return id;
  if (Object.prototype.hasOwnProperty.call(SCENARIO_STARTS, id)) return OPENING_EXPLORE;
  return OPENING_NONE;
}

/**
 * Whether a map crossed the first-map threshold on this update — the moment
 * to show the note and fire the event. A crossing, not a level: hydrating a
 * saved session with nine nodes is not a first map being drawn, and a check
 * on level alone would greet every reload as one.
 */
export function firstMapCrossed(prevNodes: number, nextNodes: number): boolean {
  return prevNodes < FIRST_MAP_NODES && nextNodes >= FIRST_MAP_NODES;
}

/**
 * Read `start` out of a search string and hand back the search without it.
 *
 * Only that parameter goes. The chat page reads `model`, Logos reads `s`,
 * the checkout return reads `one`, and each of them cleans up after itself;
 * a helper that returned an empty search would erase the others' input
 * before they saw it. The returned search keeps its leading '?' when
 * anything remains and is '' otherwise, so it can go straight into
 * replaceState beside the pathname.
 */
export function readStart(search: string): { id: string | null; search: string } {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get(START_PARAM);
  params.delete(START_PARAM);
  const rest = params.toString();
  const id = raw ? raw.trim().slice(0, 40) : '';
  return { id: id || null, search: rest ? `?${rest}` : '' };
}
