// lib/share/hue.ts — a person's colour in anything shared: their face, their
// pointer, their comments. Stable for their alias, from a small palette that
// reads on every theme. PURE.

const HUES = ['#5e7633', '#B4694A', '#5C6B7A', '#A9822A', '#7D5A86', '#3A6EA5'];

export function hueOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}
