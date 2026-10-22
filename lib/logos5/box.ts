// lib/logos5/box.ts — WHERE THE CONVERSATION BOX IS (Logos 5, on a desktop).
//
// The conversation is one box in two shapes: unfolded, the thread with its
// composer at the foot; folded, the composer alone over the views. Docked, it
// is where it has always been — a column beside the views, or a composer at
// their foot. Floating, it goes where it is dragged, and stays there.
//
// ONE ANCHOR FOR BOTH SHAPES: the box's bottom-centre, as fractions of the
// room it moves in. The composer is at the foot of either shape, so unfolding
// a composer left in a corner opens the conversation upward from the same
// place, and folding it puts the composer back where the conversation's was.
//
// Centred is kept as centred rather than as a position, so a box that changes
// size — folded, unfolded, the window resized — stays in the middle. With the
// views hidden (focus), the conversation is alone: centred, and given room.
//
// PURE, apart from the two storage helpers.

export interface BoxPlace {
  /** floating over the views rather than docked beside them */
  float: boolean;
  /** kept in the middle, whatever its size */
  centered: boolean;
  /** the views hidden behind it: the conversation alone */
  focus: boolean;
  /** its bottom-centre, as fractions of the room it moves in */
  ax: number;
  ay: number;
}

export const BOX_KEY = 'socria.logos5.box.v1';

/** Where it has always been: beside the views, or at their foot. */
export const DOCKED: BoxPlace = { float: false, centered: false, focus: false, ax: 0.5, ay: 1 };

/** How far it keeps from the room's edges, in px. */
export const BOX_MARGIN = 16;

const unit = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** What a browser remembers, made safe: anything missing or wrong is where it has always been. */
export function readBox(storage: Pick<Storage, 'getItem'> | null | undefined): BoxPlace {
  try {
    const raw = JSON.parse(storage?.getItem(BOX_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return DOCKED;
    return {
      float: raw.float === true,
      centered: raw.centered === true,
      focus: raw.focus === true,
      ax: unit(raw.ax, DOCKED.ax),
      ay: unit(raw.ay, DOCKED.ay),
    };
  } catch {
    return DOCKED;
  }
}

export function writeBox(storage: Pick<Storage, 'setItem'> | null | undefined, p: BoxPlace): void {
  try {
    storage?.setItem(BOX_KEY, JSON.stringify(p));
  } catch {
    /* a full or blocked store: it still floats, it is just not remembered */
  }
}

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

export interface Size {
  w: number;
  h: number;
}

/** Its top-left, inside the room with a margin all round — nothing of it ever off the screen. */
export function keepInside(left: number, top: number, room: Size, box: Size, margin = BOX_MARGIN): { left: number; top: number } {
  return {
    left: Math.round(clamp(left, margin, room.w - box.w - margin)),
    top: Math.round(clamp(top, margin, room.h - box.h - margin)),
  };
}

/** Where a floating box goes, from where it was left (or the middle), given the room and its own size. */
export function placeBox(p: BoxPlace, room: Size, box: Size, margin = BOX_MARGIN): { left: number; top: number } {
  if (p.centered || p.focus) return keepInside((room.w - box.w) / 2, (room.h - box.h) / 2, room, box, margin);
  return keepInside(p.ax * room.w - box.w / 2, p.ay * room.h - box.h, room, box, margin);
}

/** The anchor a box at this top-left leaves: its bottom-centre, as fractions of the room. */
export function anchorOf(left: number, top: number, room: Size, box: Size): { ax: number; ay: number } {
  return {
    ax: unit(room.w > 0 ? (left + box.w / 2) / room.w : 0.5, 0.5),
    ay: unit(room.h > 0 ? (top + box.h) / room.h : 1, 1),
  };
}
