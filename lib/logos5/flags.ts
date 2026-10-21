// lib/logos5/flags.ts — LOGOS 5, SWITCHABLE.
//
// Logos 5 is a new frontend over the same Logos (docs/LOGOS-5.md). It is on
// by default; NEXT_PUBLIC_LOGOS5=off (or 0, false, no) brings back the Logos 4
// layout for a deployment without a code change. Read with the literal
// `process.env.NEXT_PUBLIC_…` name so Next.js inlines it into the client.

const off = (v: string | undefined): boolean => /^(off|0|false|no)$/i.test((v ?? '').trim());

export function logos5On(v: string | undefined): boolean {
  return !off(v);
}

export const LOGOS5 = { on: logos5On(process.env.NEXT_PUBLIC_LOGOS5) } as const;

/** Per browser: which lines of thinking had the stage open, and how wide. */
export const STAGE_KEY = 'socria.logos5.stage.v1';

export interface StagePrefs {
  /** session id → open */
  open: Record<string, boolean>;
  /** the stage's share of the width beside the thread, 0.35–0.75 */
  share: number;
  /**
   * session id → the conversation unfolded beside the map (the map is the
   * screen; the conversation is folded away until asked for). Absent: not
   * chosen yet, and the screen decides by what the line of thinking holds.
   */
  convo?: Record<string, boolean>;
}

export const DEFAULT_STAGE_SHARE = 0.58;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readStagePrefs(storage: StorageLike | null | undefined): StagePrefs {
  try {
    const raw = JSON.parse(storage?.getItem(STAGE_KEY) || '{}');
    const open: Record<string, boolean> = {};
    if (raw && typeof raw.open === 'object' && raw.open) {
      // only the newest few dozen are kept: an open flag for a line of thinking long gone means nothing
      for (const [k, v] of Object.entries(raw.open).slice(-60)) if (typeof v === 'boolean' && /^[\w-]{1,80}$/.test(k)) open[k] = v;
    }
    const share = typeof raw?.share === 'number' && raw.share >= 0.35 && raw.share <= 0.75 ? raw.share : DEFAULT_STAGE_SHARE;
    const convo: Record<string, boolean> = {};
    if (raw && typeof raw.convo === 'object' && raw.convo) {
      for (const [k, v] of Object.entries(raw.convo).slice(-60)) if (typeof v === 'boolean' && /^[\w-]{1,80}$/.test(k)) convo[k] = v;
    }
    return Object.keys(convo).length ? { open, share, convo } : { open, share };
  } catch {
    return { open: {}, share: DEFAULT_STAGE_SHARE };
  }
}

export function writeStagePrefs(storage: StorageLike | null | undefined, prefs: StagePrefs): void {
  try {
    const entries = Object.entries(prefs.open).slice(-60);
    const convo = Object.entries(prefs.convo ?? {}).slice(-60);
    storage?.setItem(STAGE_KEY, JSON.stringify({ open: Object.fromEntries(entries), share: prefs.share, ...(convo.length ? { convo: Object.fromEntries(convo) } : {}) }));
  } catch {
    /* a full or blocked store: the stage still opens and closes, it is just not remembered */
  }
}
