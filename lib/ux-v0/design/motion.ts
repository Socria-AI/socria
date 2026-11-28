// lib/ux-v0/design/motion.ts — a design that moves, held still at any moment of its length.
//
// Motion here is CSS: @keyframes and the animation properties the designer wrote on the artboard, played over the
// artboard's length in seconds. To export it — a frame, a sequence of frames, a video — each moment has to be drawn
// as a still picture by the same pipeline that draws every other export (export.ts). A moment is made by rewriting
// the artboard's own CSS, not by guessing its result: every animation is paused, and its delay moved back by the
// moment's time. A paused animation with a delay of (its own delay − t) shows exactly what it shows at t: before it
// starts, its element as it rests (or its first keyframe, if it fills backwards); after it ends, where it finished
// (if it fills forwards). Nothing about the animation is otherwise touched.
//
// What this does not cover, and is said where exports are offered: animation driven by script (there is none: an
// artboard carries no script), SMIL inside SVG (<animate>), and transitions (they need a cause; a still has none).

const TIME = /(?<![\w.#-])(-?\d*\.?\d+)(ms|s)\b/g;

const seconds = (n: string, unit: string) => (unit === 'ms' ? Number(n) / 1000 : Number(n));

/** A list split at its top-level commas (cubic-bezier(.2, .8, …) is one item). */
function splitList(v: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** The delays of the animations a block of declarations sets, in order (seconds); null when it sets none. */
export function delaysOf(body: string): number[] | null {
  let fromShorthand: number[] | null = null;
  let fromLonghand: number[] | null = null;
  let count = 0;
  for (const d of body.split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const prop = d.slice(0, i).trim().toLowerCase();
    const value = d.slice(i + 1).replace(/!important/i, '').trim();
    if (prop === 'animation' || prop === '-webkit-animation') {
      if (/^(none|initial|unset|inherit)$/i.test(value)) continue;
      const parts = splitList(value);
      count = Math.max(count, parts.length);
      fromShorthand = parts.map((p) => {
        // (times inside a timing function are not the animation's own)
        const times = [...p.replace(/\([^)]*\)/g, '').matchAll(TIME)].map((m) => seconds(m[1], m[2]));
        return times[1] ?? 0;
      });
      fromLonghand = null; // (a shorthand written after a longhand resets it)
    } else if (prop === 'animation-delay') {
      fromLonghand = splitList(value).map((p) => {
        const m = [...p.matchAll(TIME)][0];
        return m ? seconds(m[1], m[2]) : 0;
      });
    } else if (prop === 'animation-name') count = Math.max(count, splitList(value).length);
  }
  if (!fromShorthand && !fromLonghand && !count) return null;
  const base = fromLonghand ?? fromShorthand ?? [0];
  const n = Math.max(count, base.length, 1);
  // (a shorter list of delays repeats, as CSS repeats it)
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

const frozen = (delays: number[], t: number) => `animation-delay:${delays.map((d) => `${Math.round((d - t) * 1000) / 1000}s`).join(',')} !important;animation-play-state:paused !important`;

/** A stylesheet with every animation it sets held at time t (seconds). @keyframes are left as they are. */
export function freezeCss(css: string, t: number): string {
  // innermost blocks only: a rule's declarations (a keyframe step sets no animation, so it is passed over)
  return css.replace(/\{([^{}]*)\}/g, (m, body: string) => {
    if (!/animation/i.test(body)) return m;
    const delays = delaysOf(body);
    return delays ? `{${body.replace(/;?\s*$/, '')};${frozen(delays, t)}}` : m;
  });
}

/** An artboard's HTML (its <style> blocks and inline styles) with everything that moves held at time t. */
export function freezeAt(html: string, t: number): string {
  return html
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, a: string, css: string, b: string) => `${a}${freezeCss(css, t)}${b}`)
    .replace(/\sstyle="([^"]*)"/gi, (m, st: string) => {
      if (!/animation/i.test(st)) return m;
      const delays = delaysOf(st);
      return delays ? ` style="${st.replace(/;?\s*$/, '')};${frozen(delays, t)}"` : m;
    });
}

/** How a length is cut into frames: fewer a second when it is long, never more than `max` in all. */
export function framePlan(length: number, max = 360): { fps: number; count: number; times: number[] } {
  const secs = Math.max(0.5, Math.min(60, length));
  const fps = secs <= 8 ? 24 : secs <= 15 ? 20 : 12;
  const count = Math.min(max, Math.max(2, Math.round(secs * fps)));
  // (the last frame is the design at rest, at its full length)
  return { fps, count, times: Array.from({ length: count }, (_, i) => Math.round(((i * secs) / (count - 1)) * 1000) / 1000) };
}
