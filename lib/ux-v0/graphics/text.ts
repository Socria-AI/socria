// lib/ux-v0/graphics/text.ts — setting a text node's words into lines, the same way everywhere.
//
// SVG does not wrap text, so the lines are decided here, once, and every renderer draws those lines: the canvas,
// the SVG export, the PNG and the PDF. The width of a run of letters comes from a measure function: in the browser
// the real one (the canvas's measureText, with the face loaded), elsewhere an estimate from each face's measured
// average advance (lib/ux-v0/fonts.ts). The checks (overflow, words too long for their box) read the same layout.

import { advanceEm } from '../fonts';
import type { TextNode } from './doc';

/** The width of a run of text in px, before tracking. */
export type Measure = (text: string, font: string, weight: number, size: number, italic: boolean) => number;

/** An estimate from the face's measured average advance: capitals wider, spaces narrower. */
export const approxMeasure: Measure = (text, font, weight, size) => {
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += 0.28 * size;
    else if (/[.,:;'’!|il]/.test(ch)) w += 0.3 * size;
    else if (/[MW@%&]/.test(ch)) w += advanceEm(font, weight, true) * 1.2 * size;
    else w += advanceEm(font, weight, ch !== ch.toLowerCase()) * size;
  }
  return w;
};

export interface Line {
  text: string;
  width: number;
}

export interface TextLayout {
  lines: Line[];
  /** px between baselines */
  leading: number;
  /** the height the lines take */
  height: number;
  /** the widest line */
  widest: number;
  /** the lines take more height than the box gives */
  overflow: boolean;
  /** a single word is wider than the box and had to be broken */
  brokenWord: boolean;
  /** the box the words are set in (a vertical text's box is turned) */
  boxW: number;
  boxH: number;
}

/** The words as they are shown: upper or lower case where the node says. */
export function shownText(n: Pick<TextNode, 'text' | 'case'>): string {
  return n.case === 'upper' ? n.text.toUpperCase() : n.case === 'lower' ? n.text.toLowerCase() : n.text;
}

/** The node's words set into lines within its box (see the head of this file). */
export function layoutText(n: TextNode, measure: Measure = approxMeasure): TextLayout {
  const boxW = n.vertical ? n.h : n.w;
  const boxH = n.vertical ? n.w : n.h;
  const track = (n.tracking / 1000) * n.size;
  const width = (s: string) => measure(s, n.font, n.weight, n.size, !!n.italic) + Math.max(0, [...s].length - 1) * track;
  const lines: Line[] = [];
  let brokenWord = false;
  for (const para of shownText(n).split('\n')) {
    const words = para.split(/ +/).filter((w, i, all) => w !== '' || all.length === 1);
    let cur = '';
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (width(next) <= boxW + 0.5 || !cur) {
        if (!cur && width(word) > boxW + 0.5) {
          // a word wider than its box: broken where it must be (and said, so the checks can report it)
          brokenWord = true;
          let piece = '';
          for (const ch of word) {
            if (piece && width(piece + ch) > boxW + 0.5) {
              lines.push({ text: piece, width: width(piece) });
              piece = ch;
            } else piece += ch;
          }
          cur = piece;
        } else cur = next;
      } else {
        lines.push({ text: cur, width: width(cur) });
        cur = word;
        if (width(word) > boxW + 0.5) {
          brokenWord = true;
          let piece = '';
          for (const ch of word) {
            if (piece && width(piece + ch) > boxW + 0.5) {
              lines.push({ text: piece, width: width(piece) });
              piece = ch;
            } else piece += ch;
          }
          cur = piece;
        }
      }
    }
    lines.push({ text: cur, width: width(cur) });
  }
  const leading = n.size * n.lineHeight;
  const height = lines.length ? (lines.length - 1) * leading + n.size * Math.max(1, n.lineHeight) : 0;
  return { lines, leading, height, widest: Math.max(0, ...lines.map((l) => l.width)), overflow: !n.autoHeight && height > boxH + 1, brokenWord, boxW, boxH };
}

/** The largest size (not above the node's own, not below `min`) at which its words fit its box, unbroken. */
export function fitSize(n: TextNode, measure: Measure = approxMeasure, min = 6): number {
  let lo = min;
  let hi = n.size;
  const fits = (size: number) => {
    const l = layoutText({ ...n, size, autoHeight: false }, measure);
    return !l.overflow && !l.brokenWord;
  };
  if (fits(hi)) return hi;
  if (!fits(lo)) return lo;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 10) / 10;
}
