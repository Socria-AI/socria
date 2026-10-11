// lib/plot-words.ts — a function the person asked to see, read from their words.
//
// "Graph y = x²", "plot y = x^(2/3) from -8 to 8", "sketch sin(x) and cos(x)":
// the expression is in the message, and code can draw it exactly. Leaving it
// to the extractor meant the curve on screen was whatever a language model
// copied — usually right, sometimes a different function, sometimes nothing.
// Read here, the Plot lens draws what was written, and the extractor's own
// picture stands only when it plots the same curve.
//
// Strict: only an explicit function of x that compiles, with no other names
// in it (a parameter's value is not ours to invent), and never an inequality
// — "x > 3" is a set on a number line, not a curve.
//
// PURE.

import { compileExpr } from '@/lib/logos-math';

export interface StatedPlot {
  /** the curve to draw, in plain notation */
  expr: string;
  /** more curves asked for in the same breath: "y = x² and y = 2x" */
  more: string[];
  title: string;
  /** the window, when they gave one: "from -2 to 2" */
  view?: { xMin: number; xMax: number };
}

const VERB = /^(?:(?:please|pls|ok|okay|now|so|hey)\s+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:graph|plot|draw|sketch|show(?:\s+me)?|visuali[sz]e)\s+(?:(?:me\s+)?(?:the\s+)?(?:graph|plot|curve|function)\s+(?:of\s+)?)?/i;
const WINDOW = /\s*(?:,\s*)?(?:(?:from|for|over|between)\s+(?:x\s*=\s*)?([-−]?\d+(?:\.\d+)?)\s+(?:to|and|until)\s+(?:x\s*=\s*)?([-−]?\d+(?:\.\d+)?)|(?:on|over|for)\s+\[\s*([-−]?\d+(?:\.\d+)?)\s*,\s*([-−]?\d+(?:\.\d+)?)\s*\])\s*$/i;

const num = (s: string) => Number(s.replace('−', '-'));

/** One "y = …" / "f(x) = …" / bare expression → the expression, or null when it is not a function of x alone. */
function curveOf(raw: string): string | null {
  const e = raw
    .trim()
    .replace(/^(?:y|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\)|h\s*\(\s*x\s*\))\s*=\s*/i, '')
    .replace(/[.?!]+$/, '')
    .replace(/\$/g, '')
    .trim();
  if (!e || e.length > 160) return null;
  if (/[<>≤≥≠]|=/.test(e)) return null;
  if (!/x/i.test(e)) return null;
  const c = compileExpr(e, ['x']);
  if (!c) return null;
  // it must actually draw: a curve with no finite value anywhere on the usual window is not one
  const xs = [-3.7, -1.3, -0.4, 0.6, 1.9, 4.2];
  if (!xs.some((x) => Number.isFinite(c.eval({ x })))) return null;
  return e;
}

/** The function a message asks to see, or null. */
export function readPlotRequest(text: unknown): StatedPlot | null {
  if (typeof text !== 'string') return null;
  const t = text.trim().slice(0, 300);
  const v = VERB.exec(t);
  if (!v) return null;
  let rest = t.slice(v[0].length).trim();
  let view: StatedPlot['view'];
  const w = WINDOW.exec(rest);
  if (w) {
    const a = num(w[1] ?? w[3]);
    const b = num(w[2] ?? w[4]);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) view = { xMin: Math.min(a, b), xMax: Math.max(a, b) };
    rest = rest.slice(0, w.index).trim();
  }
  // "y = x² and y = 2x", "sin(x), cos(x)": several curves at once, each read on its own
  const pieces = rest.split(/\s+and\s+|\s*;\s*|,\s+(?=(?:y|f\s*\(\s*x\s*\))\s*=)/i).filter(Boolean);
  const curves = pieces.map(curveOf);
  if (!curves.length || curves.some((c) => !c)) return null;
  const all = curves as string[];
  return {
    expr: all[0],
    more: all.slice(1, 4),
    title: all.length === 1 ? `y = ${all[0]}` : all.map((c) => `y = ${c}`).join(', '),
    ...(view ? { view } : {}),
  };
}

/** Whether two expressions are the same curve: equal wherever either is defined, at points spread over a window. */
export function sameCurve(a: unknown, b: string): boolean {
  if (typeof a !== 'string') return false;
  const f = compileExpr(a, ['x']);
  const g = compileExpr(b, ['x']);
  if (!f || !g) return false;
  for (const x of [-7.3, -3.1, -1.7, -0.6, -0.2, 0.3, 0.9, 1.4, 2.6, 5.8]) {
    const p = f.eval({ x });
    const q = g.eval({ x });
    if (Number.isNaN(p) !== Number.isNaN(q)) return false;
    if (Number.isFinite(p) && Number.isFinite(q) && Math.abs(p - q) > 1e-9 * Math.max(1, Math.abs(p))) return false;
  }
  return true;
}
