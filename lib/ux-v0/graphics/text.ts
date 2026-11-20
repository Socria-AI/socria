// lib/ux-v0/graphics/text.ts — setting a text node's words into lines, the same way everywhere.
//
// SVG does not wrap text, so the lines are decided here, once, and every renderer draws those lines: the canvas,
// the SVG export, the PNG and the PDF. The width of a run of letters comes from a measure function: in the browser
// the real one (the canvas's measureText, with the face loaded), elsewhere an estimate from each face's measured
// average advance (lib/ux-v0/fonts.ts). The checks (overflow, words too long for their box) read the same layout.
//
// Mixed styles (runs) are measured run by run, so a bold word takes a bold word's width; each line keeps where its
// words came from in the text, so the renderer can draw every run in its own style. Paragraph spacing adds space
// between paragraphs, not between the lines of one.

import { advanceEm } from '../fonts';
import type { TextNode, TextRun } from './doc';

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

export interface Word {
  text: string;
  /** where the word starts in the shown text */
  at: number;
}
export interface Line {
  text: string;
  width: number;
  /** where the line starts in the shown text */
  start: number;
  /** which paragraph it belongs to (0 first) */
  para: number;
  /** its words, each with where it came from (runs are drawn word piece by word piece) */
  words: Word[];
}

export interface TextLayout {
  lines: Line[];
  /** px between baselines */
  leading: number;
  /** px added between paragraphs */
  paraGap: number;
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

/** The style of the letter at an offset: the node's own, or a run's. */
export interface RunStyle {
  font: string;
  weight: number;
  italic: boolean;
  color?: string;
  decoration?: 'underline' | 'line-through';
}
export function styleAt(n: TextNode, at: number): RunStyle {
  const r = n.runs?.find((x) => at >= x.start && at < x.end);
  const deco = r?.decoration === 'none' ? undefined : (r?.decoration ?? n.decoration);
  return { font: r?.font ?? n.font, weight: r?.weight ?? n.weight, italic: r?.italic ?? !!n.italic, ...(r?.color ? { color: r.color } : {}), ...(deco ? { decoration: deco } : {}) };
}

/** A piece of text cut where the runs change: [text, offset, run][]. */
export function runPieces(n: TextNode, text: string, at: number): { text: string; at: number; run: TextRun | null }[] {
  if (!n.runs?.length) return [{ text, at, run: null }];
  const cuts = new Set<number>([0, text.length]);
  for (const r of n.runs) {
    if (r.start > at && r.start < at + text.length) cuts.add(r.start - at);
    if (r.end > at && r.end < at + text.length) cuts.add(r.end - at);
  }
  const sorted = [...cuts].sort((p, q) => p - q);
  const out: { text: string; at: number; run: TextRun | null }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = text.slice(sorted[i], sorted[i + 1]);
    if (!s) continue;
    const o = at + sorted[i];
    out.push({ text: s, at: o, run: n.runs.find((r) => o >= r.start && o < r.end) ?? null });
  }
  return out;
}

/** The node's words set into lines within its box (see the head of this file). */
export function layoutText(n: TextNode, measure: Measure = approxMeasure): TextLayout {
  const boxW = n.vertical ? n.h : n.w;
  const boxH = n.vertical ? n.w : n.h;
  const track = (n.tracking / 1000) * n.size;
  const shown = shownText(n);
  // runs are offsets in the words as written; a change of case that changes their length (ß → SS) sets them aside
  const runs = !!n.runs?.length && shown.length === n.text.length;
  const width = (s: string, at = -1) => {
    if (!runs || at < 0) return measure(s, n.font, n.weight, n.size, !!n.italic) + Math.max(0, [...s].length - 1) * track;
    let w = 0;
    for (const p of runPieces(n, s, at)) {
      const st = styleAt(n, p.at);
      w += measure(p.text, st.font, st.weight, n.size, st.italic);
    }
    return w + Math.max(0, [...s].length - 1) * track;
  };
  const lineWidth = (words: Word[]) => {
    if (!runs) return width(words.map((w) => w.text).join(' '));
    return words.reduce((t, w, i) => t + width(w.text, w.at) + (i ? measure(' ', n.font, n.weight, n.size, !!n.italic) + track * 2 : 0), 0);
  };
  const lines: Line[] = [];
  let brokenWord = false;
  let offset = 0;
  shown.split('\n').forEach((para, pi) => {
    const found: Word[] = [];
    const re = /[^ ]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(para))) found.push({ text: m[0], at: offset + m.index });
    const words: Word[] = found.length ? found : [{ text: '', at: offset }];
    let cur: Word[] = [];
    const push = (ws: Word[]) => lines.push({ text: ws.map((w) => w.text).join(' '), width: lineWidth(ws), start: ws[0]?.at ?? offset, para: pi, words: ws });
    // a word wider than its box is broken where it must be (and said, so the checks can report it)
    const breakWord = (word: Word): Word => {
      brokenWord = true;
      let piece = '';
      let at = word.at;
      let i = 0;
      for (const ch of word.text) {
        if (piece && width(piece + ch, at) > boxW + 0.5) {
          push([{ text: piece, at }]);
          at = word.at + i;
          piece = ch;
        } else piece += ch;
        i += ch.length;
      }
      return { text: piece, at };
    };
    for (const word of words) {
      const next = [...cur, word];
      if (lineWidth(next) <= boxW + 0.5 || !cur.length) {
        if (!cur.length && width(word.text, word.at) > boxW + 0.5) cur = [breakWord(word)];
        else cur = next;
      } else {
        push(cur);
        cur = width(word.text, word.at) > boxW + 0.5 ? [breakWord(word)] : [word];
      }
    }
    push(cur);
    offset += para.length + 1;
  });
  const leading = n.size * n.lineHeight;
  const paraGap = (n.paragraph ?? 0) * n.size;
  const paras = lines.length ? lines[lines.length - 1].para : 0;
  const height = lines.length ? (lines.length - 1) * leading + n.size * Math.max(1, n.lineHeight) + paras * paraGap : 0;
  return { lines, leading, paraGap, height, widest: Math.max(0, ...lines.map((l) => l.width)), overflow: !n.autoHeight && height > boxH + 1, brokenWord, boxW, boxH };
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

/** Each letter's advance in a line (tracking included), for letters placed one by one (warps). */
export function letterAdvances(n: TextNode, text: string, measure: Measure = approxMeasure): number[] {
  const track = (n.tracking / 1000) * n.size;
  return [...text].map((ch) => measure(ch, n.font, n.weight, n.size, !!n.italic) + track);
}

/** About how long the path a text is set along is, at a given size (arc, circle, wave; a custom path by its own
 * length), in the text's box. */
export function textPathLength(n: TextNode, size = n.size): number {
  const tp = n.path;
  if (!tp) return n.w;
  const { w, h } = n;
  if (tp.kind === 'circle') {
    const a = Math.max(4, w / 2 - (tp.side !== 'inside' ? size * 0.85 : size * 0.15));
    const b = Math.max(4, h / 2 - (tp.side !== 'inside' ? size * 0.85 : size * 0.15));
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  if (tp.kind === 'wave') {
    const amp = ((tp.amplitude ?? 40) / 100) * Math.max(0, h / 2 - size * 0.6);
    const cyc = tp.cycles ?? 1.5;
    let len = 0;
    let py = 0;
    for (let i = 0; i <= 64; i++) {
      const x = (i / 64) * w;
      const y = Math.sin((x / w) * cyc * Math.PI * 2) * amp;
      if (i) len += Math.hypot(w / 64, y - py);
      py = y;
    }
    return len;
  }
  if (tp.kind === 'custom') return w * 1.2;
  const sag = Math.min(Math.max(1, h - size * 1.1), w / 2) * (Math.abs(tp.bend) / 100);
  if (sag < 1) return w;
  const r = (w * w) / (8 * sag) + sag / 2;
  return r * 2 * Math.asin(Math.min(1, w / (2 * r)));
}

/** The largest size (not above the node's own) at which its words run along about nine tenths of its path. */
export function fitToPath(n: TextNode, measure: Measure = approxMeasure, min = 6): number {
  const words = shownText(n).replace(/\s+/g, ' ');
  let size = n.size;
  for (let i = 0; i < 60 && size > min; i++) {
    const width = measure(words, n.font, n.weight, size, !!n.italic) + (n.tracking / 1000) * size * words.length;
    if (width <= textPathLength(n, size) * (n.path?.kind === 'circle' ? 0.96 : 0.9)) break;
    size *= 0.95;
  }
  return Math.max(min, Math.floor(size * 10) / 10);
}
