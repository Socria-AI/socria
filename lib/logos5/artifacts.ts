// lib/logos5/artifacts.ts — WHAT THE MAP DRAWS ITSELF, AS ARTIFACTS.
//
// Artifacts lists what was made in a line of thinking (components/logos5/
// Study.tsx ArtifactsView). Each display is an artifact of its own. Beside
// them the map can draw three things itself: a model (the engine's document),
// the picture or simulation the map pass made (map.viz), and the functions,
// plotted (the plot lens). These are the rules for which of those is listed,
// so one thing is never listed twice:
//
//   · the plot lens DRAWS the model or the picture when there is one, so it is
//     an artifact of its own only for functions nothing else draws — it was
//     listed beside the picture as a second "Plot" of the same functions;
//   · a picture that repeats a display is not listed: asked for "a Venn
//     diagram of mitosis and meiosis", the map pass drew its own copy beside
//     the display (overlapping triangles on axes). The server no longer keeps
//     one (app/api/logos/map, ONE ANSWER TO ONE ASK); this hides one saved
//     before that — when its title names a display that is here, the display
//     is the answer. A simulation is never a repeat: no display moves.
//
// MADE WHEN ASKED (four views, four jobs — lib/runtime/orchestrate.ts).
// Artifacts holds what the person asked to be made, or accepted an offer of.
// The map can draw three things from a mathematical conversation on its own —
// the functions plotted, the working laid out, the thing being worked on —
// and those used to appear in Artifacts, with a "new" mark, whether or not
// anyone wanted them. Each is listed now once it is asked for in words or
// taken from an offer under the reply (madeOffer); until then it is offered,
// once, never listed. Taken and declined offers are kept per line of
// thinking on this device (readMade / writeMade).
//
// PURE (storage is passed in).

/** A picture whose title names a display that is here. Titles shorter than four letters name nothing. */
export function pictureRepeatsDisplay(
  pictureTitle: string | null | undefined,
  simulation: boolean,
  displayTitles: readonly string[],
): boolean {
  const vt = String(pictureTitle ?? '').toLowerCase();
  if (!vt || simulation) return false;
  return displayTitles.some((t) => {
    const s = String(t ?? '').trim().toLowerCase();
    return s.length >= 4 && vt.includes(s);
  });
}

export interface MapDrawn {
  /** model documents the engine built */
  models: number;
  /** the map pass's own picture or simulation */
  viz: 'picture' | 'simulation' | null;
  /** the plot lens is offered: there are functions to plot */
  plot: boolean;
  /** the picture repeats a display (pictureRepeatsDisplay) */
  repeats: boolean;
}

/** Which of the map's own drawings are artifacts: a model is; else the picture, unless it repeats a display; the plot only when nothing else draws it. */
export function mapArtifacts(m: MapDrawn): { viz: boolean; plot: boolean } {
  return {
    viz: !m.models && !!m.viz && !m.repeats,
    plot: m.plot && !m.viz && !m.models,
  };
}

/** The artifact that draws the plot: the active (else newest) model, else the picture, else the functions on their own. */
export function plotArtifact(models: readonly string[], active: string | null, viz: boolean): string {
  if (models.length) return `m:${active ?? models[models.length - 1]}`;
  return viz ? 'v:viz' : 'v:plot';
}

// ── made from the map, when asked ────────────────────────────────────

/** What the map can draw from a mathematical conversation: the functions plotted, the working, the thing worked on. */
export type MadeKey = 'plot' | 'solve' | 'work';
export const MADE_KEYS: readonly MadeKey[] = ['plot', 'solve', 'work'];

/** Asked for in so many words, in any of their messages. */
const ASKED: Record<MadeKey, RegExp> = {
  plot: /\b(?:plot|graph)\b|\b(?:show|see|draw|sketch)\s+(?:me\s+)?(?:it|that|this|them|the\s+(?:plot|graph|curve|curves|functions?))\b/i,
  solve: /\b(?:show|see|lay\s+out|walk\s+(?:me\s+)?through|write\s+out|go\s+through)\s+(?:me\s+)?(?:the\s+|my\s+|all\s+the\s+)?(?:working|workings|steps|full\s+solution|worked\s+solution|solution)\b|\bstep[- ]by[- ]step\b/i,
  work: /\b(?:show|see|open)\s+(?:me\s+)?(?:the\s+)?(?:matrix|function|working)\b/i,
};

/** What they asked to see, by the words of their own messages. */
export function madeAsked(userTexts: readonly string[]): MadeKey[] {
  return MADE_KEYS.filter((k) => userTexts.some((t) => ASKED[k].test(t)));
}

/** Which of the available ones are artifacts: those asked for, in words or by taking the offer. */
export function madeListed(available: readonly MadeKey[], asked: readonly MadeKey[]): MadeKey[] {
  return available.filter((k) => asked.includes(k));
}

/** The one offer under the latest reply: available, not asked for, not declined — the plot before the working before the thing worked on. */
export function madeOffer(available: readonly MadeKey[], asked: readonly MadeKey[], declined: readonly MadeKey[]): MadeKey | null {
  return MADE_KEYS.find((k) => available.includes(k) && !asked.includes(k) && !declined.includes(k)) ?? null;
}

/** How each offer is said: what it is, and the button that takes it. */
export const MADE_OFFER: Record<MadeKey, { said: string; take: string }> = {
  plot: { said: 'The functions here can be plotted.', take: 'Plot them in Artifacts' },
  solve: { said: 'The working so far can be laid out, step by step.', take: 'Lay it out in Artifacts' },
  work: { said: 'What you are working on can be opened as itself.', take: 'Open it in Artifacts' },
};

export interface MadeRecord {
  taken: MadeKey[];
  declined: MadeKey[];
}
const MADE_STORE = 'socria.logos5.made.v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const keysOf = (raw: unknown): MadeKey[] => (Array.isArray(raw) ? MADE_KEYS.filter((k) => raw.includes(k)) : []);

/** Taken and declined offers for one line of thinking, on this device. */
export function readMade(storage: StorageLike | null | undefined, session: string): MadeRecord {
  try {
    const all = JSON.parse(storage?.getItem(MADE_STORE) ?? '{}') as Record<string, { taken?: unknown; declined?: unknown }>;
    const r = all?.[session];
    return { taken: keysOf(r?.taken), declined: keysOf(r?.declined) };
  } catch {
    return { taken: [], declined: [] };
  }
}

/** Record an offer taken or declined. Kept for the most recent lines of thinking only. */
export function writeMade(storage: StorageLike | null | undefined, session: string, key: MadeKey, how: 'taken' | 'declined'): MadeRecord {
  let all: Record<string, MadeRecord> = {};
  try {
    all = JSON.parse(storage?.getItem(MADE_STORE) ?? '{}') ?? {};
  } catch {}
  const was = readMade(storage, session);
  const next: MadeRecord = {
    taken: how === 'taken' ? [...new Set([...was.taken, key])] : was.taken.filter((k) => k !== key),
    declined: how === 'declined' ? [...new Set([...was.declined, key])] : was.declined.filter((k) => k !== key),
  };
  const kept = Object.fromEntries([...Object.entries(all).filter(([id]) => id !== session).slice(-199), [session, next]]);
  try {
    storage?.setItem(MADE_STORE, JSON.stringify(kept));
  } catch {}
  return next;
}
